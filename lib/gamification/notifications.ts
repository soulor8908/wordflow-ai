/**
 * 通知组合升级 —— 设计文档 §4.2 特性 6
 *
 * 把 PWA 通知从"该复习了"升级为多动机钩子组合（多邻国 routine / save 模型）：
 *
 * - Routine 通知（习惯时段）：连胜型 / 任务型 / 进度型
 * - Save 通知（连胜即将断裂前 2 小时，且无保护券时）：紧迫型
 *
 * 角色语气轮换（gentle / direct / challenge）：单用户一周内不重复同 tone，避免疲劳。
 * 不引入 bandit 算法——单用户场景下规则触发 + tone 轮换足够（卡帕西式：不过度工程）。
 *
 * 通知的核心原则（多邻国）：通知绑动机，不绑功能。
 * 不是"打开 App"，是"不让用户失去他在意的东西"。
 */
import { getItem, setItem } from "@/lib/storage/db";
import {
  LAST_TONE_KEY,
  type NotificationContext,
  type NotificationMotive,
  type NotificationPayload,
  type NotificationTone,
} from "./types";

/** 通知模板 */
export interface NotificationTemplate {
  motive: NotificationMotive;
  tone: NotificationTone;
  build: (ctx: NotificationContext) => { title: string; body: string };
}

const REVIEW_URL = "/review";
const TAG = "wordflow-review";

/**
 * 模板池：按 motive × tone 组合组织。
 * 同一 motive 下提供 3 种 tone，调用方按 lastTone 轮换避免疲劳。
 */
export const TEMPLATES: NotificationTemplate[] = [
  // ─── Streak Save：紧迫，仅无保护券时触发 ───
  {
    motive: "streak",
    tone: "challenge",
    build: (c) => ({
      title: `${c.streakDays} 天连胜，今晚见分晓`,
      body: `24:00 前不复习就断了。${c.dueCount > 0 ? `${c.dueCount} 张卡片，3 分钟。` : "哪怕复习一张也好。"}`,
    }),
  },
  {
    motive: "streak",
    tone: "direct",
    build: (c) => ({
      title: "连胜可能今晚断",
      body: `已坚持 ${c.streakDays} 天，今晚 24:00 前需复习一次。`,
    }),
  },
  {
    motive: "streak",
    tone: "gentle",
    build: (c) => ({
      title: "今天的连胜还差一步",
      body: `3 分钟，保住 ${c.streakDays} 天的努力。`,
    }),
  },

  // ─── Quest：每日三任务进度 ───
  {
    motive: "quest",
    tone: "direct",
    build: (c) => ({
      title: "今日三任务还差一个",
      body: `已完成 ${c.questDone}/3，来看一眼？`,
    }),
  },
  {
    motive: "quest",
    tone: "challenge",
    build: (c) => ({
      title: "差一个任务就达成",
      body: `${3 - c.questDone} 个小目标，5 分钟搞定。`,
    }),
  },
  {
    motive: "quest",
    tone: "gentle",
    build: (c) => ({
      title: "今日任务还差一点点",
      body: `再来 ${3 - c.questDone} 个就完成了。`,
    }),
  },

  // ─── Badge：徽章进度 ───
  {
    motive: "badge",
    tone: "challenge",
    build: (c) => ({
      title: `还差 ${c.badgeGap} 步解锁「${c.badgeName}」`,
      body: `继续加油，徽章在等你。`,
    }),
  },
  {
    motive: "badge",
    tone: "direct",
    build: (c) => ({
      title: `距「${c.badgeName}」还差 ${c.badgeGap}`,
      body: `保持节奏，马上就到。`,
    }),
  },
  {
    motive: "badge",
    tone: "gentle",
    build: (c) => ({
      title: `下一个徽章近在咫尺`,
      body: `还差 ${c.badgeGap} 步解锁「${c.badgeName}」。`,
    }),
  },

  // ─── Comeback：回归挽留 ───
  {
    motive: "comeback",
    tone: "gentle",
    build: () => ({
      title: "欢迎回来",
      body: `过去已过，今天是一个新的开始。第一张卡片，就从这里。`,
    }),
  },
  {
    motive: "comeback",
    tone: "direct",
    build: (c) => ({
      title: "好久不见",
      body: c.dueCount > 0 ? `${c.dueCount} 张卡片在等你回来。` : "回来继续背词吧。",
    }),
  },
  {
    motive: "comeback",
    tone: "challenge",
    build: () => ({
      title: "上一个巅峰是过去",
      body: `这一次能超过吗？从今天开始。`,
    }),
  },
];

/**
 * 选择通知模板（核心算法）：
 *
 * - 按 motive 过滤
 * - 在同 motive 模板中，剔除上次使用的 tone（避免疲劳）
 * - 若剔除后为空，则用全部模板
 * - 取首个匹配（模板池已按推荐顺序排列）
 */
export function pickTemplate(
  motive: NotificationMotive,
  lastTone: NotificationTone | null
): NotificationTemplate {
  const eligible = TEMPLATES.filter((t) => t.motive === motive);
  if (eligible.length === 0) {
    throw new Error(`No template for motive: ${motive}`);
  }
  const rotated = lastTone
    ? eligible.filter((t) => t.tone !== lastTone)
    : eligible;
  const pool = rotated.length > 0 ? rotated : eligible;
  return pool[0];
}

/** 读取上次使用的通知语气 */
export async function getLastTone(): Promise<NotificationTone | null> {
  const v = await getItem<NotificationTone>(LAST_TONE_KEY);
  return v ?? null;
}

/** 记录本次使用的通知语气 */
export async function saveLastTone(tone: NotificationTone): Promise<void> {
  await setItem(LAST_TONE_KEY, tone);
}

/**
 * 根据上下文构造通知负载（核心入口）。
 *
 * 通知动机选择优先级：
 * 1. comeback（断签 ≥7 天回归，最高优先级）
 * 2. streak（连胜 save：无保护券且今日未学习且连胜 ≥3）
 * 3. quest（三任务已完成 1-2 个）
 * 4. badge（有未解锁且有进度的徽章）
 *
 * @returns 通知负载，或 null（无合适通知时机）
 */
export async function buildGamificationNotification(
  ctx: NotificationContext
): Promise<NotificationPayload | null> {
  // 决定 motive
  const motive = decideMotive(ctx);
  if (!motive) return null;

  const lastTone = await getLastTone();
  const template = pickTemplate(motive, lastTone);
  const { title, body } = template.build(ctx);

  await saveLastTone(template.tone);

  return {
    title,
    body,
    url: REVIEW_URL,
    tag: TAG,
    tone: template.tone,
    motive: template.motive,
  };
}

/** 决定本次通知的动机（纯函数，便于测试） */
export function decideMotive(ctx: NotificationContext): NotificationMotive | null {
  // 1. Comeback 最高优先级
  if (ctx.motive === "comeback") return "comeback";

  // 2. Streak Save：今日未学习 + 连胜 ≥3 + 待复习 > 0
  //    （保护券状态由调用方决定是否进入此分支：无保护券才发 save）
  if (ctx.motive === "streak" && ctx.streakDays >= 3) return "streak";

  // 3. Quest：三任务已完成 1-2 个
  if (ctx.motive === "quest" && ctx.questDone >= 1 && ctx.questDone < 3) {
    return "quest";
  }

  // 4. Badge：有未解锁且有进度的徽章
  if (ctx.motive === "badge" && ctx.badgeName && ctx.badgeGap > 0) {
    return "badge";
  }

  return null;
}
