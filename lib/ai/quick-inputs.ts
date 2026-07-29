/**
 * 快捷输入管理（localStorage 存储）
 *
 * 用户可在聊天输入框旁的快捷输入面板中添加/编辑/删除自定义快捷输入。
 * 每条快捷输入包含 label（显示名）和 prompt（注入到输入框的文本）。
 *
 * 预置快捷输入：讲解单词、生成例句、学习建议、整理周报、调整每日词量
 * 自定义快捷输入：用户添加的，id 以 "custom-" 前缀区分。
 */

export interface QuickInput {
  id: string;
  label: string;
  prompt: string;
  /** 是否为预置（不可删除，可编辑 prompt） */
  builtin: boolean;
}

const STORAGE_KEY = "wordflow:quick-inputs";

/** 预置快捷输入 */
const BUILTIN_INPUTS: QuickInput[] = [
  {
    id: "builtin-explain",
    label: "讲解单词",
    prompt: "请讲解这个单词的释义、搭配和词源：",
    builtin: true,
  },
  {
    id: "builtin-example",
    label: "生成例句",
    prompt: "请为这个单词生成 3 个不同场景的例句，并附中文翻译：",
    builtin: true,
  },
  {
    id: "builtin-advice",
    label: "学习建议",
    prompt: "根据我最近的学习情况，给我一些针对性的学习建议。",
    builtin: true,
  },
  {
    id: "builtin-report",
    label: "整理周报",
    prompt: "请帮我整理本周学习周报，总结学习表现并给出下周建议。",
    builtin: true,
  },
  {
    id: "builtin-daily",
    label: "调整词量",
    prompt: "请帮我调整每日新词量，先告诉我当前设置，再给出建议。",
    builtin: true,
  },
];

/** 读取快捷输入列表（合并预置 + 自定义） */
export function listQuickInputs(): QuickInput[] {
  if (typeof window === "undefined") return [...BUILTIN_INPUTS];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [...BUILTIN_INPUTS];
    const custom = JSON.parse(raw) as QuickInput[];
    // 预置的 prompt 可被用户覆盖：读取 localStorage 中同 id 的覆盖版本
    const customMap = new Map(custom.map((c) => [c.id, c]));
    const merged = BUILTIN_INPUTS.map((b) => customMap.get(b.id) ?? b);
    // 追加用户自定义（非 builtin 的）
    const extras = custom.filter((c) => !BUILTIN_INPUTS.some((b) => b.id === c.id));
    return [...merged, ...extras];
  } catch {
    return [...BUILTIN_INPUTS];
  }
}

/** 保存完整列表到 localStorage */
function saveAll(inputs: QuickInput[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(inputs));
}

/** 添加自定义快捷输入 */
export function addQuickInput(label: string, prompt: string): QuickInput {
  const input: QuickInput = {
    id: `custom-${Date.now()}`,
    label: label.trim(),
    prompt: prompt.trim(),
    builtin: false,
  };
  const all = listQuickInputs();
  // 只存自定义 + 被覆盖的预置
  const toStore = all.filter((i) => !i.builtin || i.id.startsWith("builtin-"));
  toStore.push(input);
  // 去重：预置项只保留覆盖版本
  const seen = new Set<string>();
  const deduped = toStore.filter((i) => {
    if (seen.has(i.id)) return false;
    seen.add(i.id);
    return true;
  });
  saveAll(deduped);
  return input;
}

/** 编辑快捷输入（预置和自定义都可编辑 prompt） */
export function updateQuickInput(id: string, label: string, prompt: string): void {
  const all = listQuickInputs();
  const idx = all.findIndex((i) => i.id === id);
  if (idx === -1) return;
  all[idx] = { ...all[idx], label: label.trim(), prompt: prompt.trim() };
  // 存储时包含所有（预置的覆盖版本 + 自定义）
  saveAll(all);
}

/** 删除快捷输入（预置不可删除） */
export function deleteQuickInput(id: string): void {
  const all = listQuickInputs();
  const target = all.find((i) => i.id === id);
  if (!target || target.builtin) return;
  saveAll(all.filter((i) => i.id !== id));
}
