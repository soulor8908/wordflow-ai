/**
 * 词典数据管线核心逻辑（设计文档 §4.2：compile-dict.ts）
 *
 * 输入：ECDICT CSV 行（RawEcdictRow）
 * 输出：按前缀切片的 JSON 文件（/dict-data/{letter}/{slice}.json，单片 <50KB）
 *
 * 这里只实现可单测的纯函数；实际的 CSV 读取、文件写入由 compile-dict.ts 脚本完成。
 */
import type { DictEntry } from "@/lib/dict/dict-loader";

/** ECDICT CSV 原始行（字段均为字符串，可能为空） */
export interface RawEcdictRow {
  word?: string;
  phonetic?: string;
  definition?: string;
  translation?: string;
  pos?: string;
  /** 空格分隔的考纲标签，如 "kaoyan cet4" */
  tag?: string;
  /** COCA 词频 */
  frq?: string;
  /** BNC 词频 */
  bnc?: string;
  collins?: string;
  oxford?: string;
  exchange?: string;
}

/** 单切片大小预算（设计文档 §4.1：单片 <50KB） */
export const SLICE_SIZE_BUDGET = 50 * 1024;

function parseFreq(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * 把 ECDICT CSV 行解析为 DictEntry。
 * - word / translation 必填，缺失抛错（G2 释义完整性校验前置）
 * - frequency 优先取 COCA frq，回退 BNC
 * - tag 空字符串归一化为 undefined
 */
export function parseEcdictRow(row: RawEcdictRow): DictEntry {
  const word = row.word?.trim();
  const translation = row.translation?.trim();
  if (!word) throw new Error("parseEcdictRow: missing word");
  if (!translation) throw new Error(`parseEcdictRow: missing translation for "${word}"`);

  const frequency = parseFreq(row.frq) ?? parseFreq(row.bnc);

  const tagStr = row.tag?.trim();
  const tags = tagStr
    ? tagStr.split(/\s+/).filter((t) => t.length > 0)
    : undefined;
  // 空数组归一化为 undefined，减少 JSON 体积
  const tagsNormalized = tags && tags.length > 0 ? tags : undefined;

  const entry: DictEntry = {
    word,
    translation,
  };
  if (row.phonetic) entry.phonetic = row.phonetic;
  if (row.pos) entry.pos = row.pos;
  if (row.definition) entry.definition = row.definition;
  if (frequency !== undefined) entry.frequency = frequency;
  if (tagsNormalized) entry.tags = tagsNormalized;
  return entry;
}

/**
 * 按前 2 字符切片 key 分组，每组按 frequency 降序（缺失视为 0）。
 * 单字母词回退到整词作为 key。
 */
export function groupEntriesBySlice(entries: DictEntry[]): Map<string, DictEntry[]> {
  const groups = new Map<string, DictEntry[]>();
  for (const entry of entries) {
    const w = entry.word.toLowerCase();
    const key = w.slice(0, Math.min(w.length, 2));
    const bucket = groups.get(key) ?? [];
    bucket.push(entry);
    groups.set(key, bucket);
  }
  for (const bucket of groups.values()) {
    bucket.sort((a, b) => (b.frequency ?? 0) - (a.frequency ?? 0));
  }
  return groups;
}

export interface SliceFile {
  /** 相对站点根的路径，如 "/dict-data/a/ab.json" */
  path: string;
  content: string;
}

/**
 * 把词条分组后序列化为切片文件。
 * 单片超过 50KB 预算时输出 console.warn（设计文档要求单片 <50KB），
 * 但仍 emit（不阻塞，由 G2/G6 审计在 CI 阶段决定是否阻断）。
 */
export function buildSliceFiles(entries: DictEntry[]): SliceFile[] {
  const groups = groupEntriesBySlice(entries);
  const files: SliceFile[] = [];
  for (const [key, bucket] of groups) {
    const content = JSON.stringify(bucket);
    if (content.length > SLICE_SIZE_BUDGET) {
      console.warn(
        `[compile-dict] slice "${key}.json" 超过 50KB 预算（${content.length} 字节），` +
          `含 ${bucket.length} 词条；建议细化切片粒度。`
      );
    }
    files.push({
      path: `/dict-data/${key[0]}/${key}.json`,
      content,
    });
  }
  return files;
}
