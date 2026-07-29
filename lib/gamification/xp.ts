/**
 * XP 与等级 —— 设计文档 §4.2 特性 5
 *
 * 设计原则：XP 是只读派生指标，不可消费。
 * - 评分：Easy +8 / Good +5 / Hard +3 / Again +1
 * - 新学 1 词：+10 XP（额外）
 * - 查词并收藏：+2 XP
 * - 完成每日三任务：+30 XP
 * - 解锁徽章：按稀有度奖励（铜 10 / 银 30 / 金 100 / 钻石 200）
 *
 * 存储：gamification:xp 单条记录（缓存），可从 StudyLog 全量重算（用于首次迁移）。
 * 增量更新：每次评分后调用 addXp(delta)，避免全量重算。
 */
import { getItem, setItem } from "@/lib/storage/db";
import type { StudyLog } from "@/lib/stats/streak-io";
import type { Rating } from "@/lib/review/fsrs-scheduler";
import {
  XP_KEY,
  isCorrectRating,
  xpForRating,
  type Level,
  type XpState,
} from "./types";

/** 5 级制：萌新 / 学徒 / 行家 / 达人 / 词神 */
export const LEVELS: Level[] = [
  { name: "萌新", min: 0, max: 100, tier: 1 },
  { name: "学徒", min: 100, max: 500, tier: 2 },
  { name: "行家", min: 500, max: 2000, tier: 3 },
  { name: "达人", min: 2000, max: 5000, tier: 4 },
  { name: "词神", min: 5000, max: Number.POSITIVE_INFINITY, tier: 5 },
];

/** XP → 等级（线性查找，5 个等级，O(1)） */
export function levelFromXp(total: number): Level {
  for (let i = LEVELS.length - 1; i >= 0; i--) {
    if (total >= LEVELS[i].min) return LEVELS[i];
  }
  return LEVELS[0];
}

/** XP → 下一等级（已是最高级时返回 null） */
export function nextLevel(total: number): Level | null {
  const cur = levelFromXp(total);
  return cur.tier < LEVELS.length ? LEVELS[cur.tier] : null;
}

/** 距离下一等级还差多少 XP（已最高级时为 0） */
export function xpToNextLevel(total: number): number {
  const next = nextLevel(total);
  return next ? Math.max(0, next.min - total) : 0;
}

/** 默认 XP 状态（首次使用） */
export function defaultXpState(): XpState {
  return { total: 0, lastSyncedDate: null };
}

/** 读取 XP 缓存（不存在时返回默认） */
export async function getXp(): Promise<XpState> {
  const v = await getItem<XpState>(XP_KEY);
  return v ?? defaultXpState();
}

/** 写入 XP 缓存 */
export async function saveXp(state: XpState): Promise<void> {
  await setItem(XP_KEY, state);
}

/** 增量加 XP（不持久化，调用方需要时调用 saveXp） */
export function addXp(state: XpState, delta: number): XpState {
  return { ...state, total: Math.max(0, state.total + delta) };
}

/**
 * 从单条评分计算 XP 增量（纯函数）：
 * - 新词：+10（新学） + rating XP
 * - 复习：仅 rating XP
 */
export function xpForReview(rating: Rating, wasNew: boolean): number {
  return (wasNew ? 10 : 0) + xpForRating(rating);
}

/**
 * 从全部 StudyLog 全量重算 XP（首次迁移 / 缓存损坏时调用）。
 *
 * 估算口径（StudyLog 不存 rating 分布，只有 correctCount）：
 * - 新学：newCount × 10
 * - 答对：correctCount × 5（保守按 Good 估算）
 * - 答错：(reviewCount - correctCount) × 1（按 Again 估算）
 *
 * 注：新词首次复习的 10 XP 已计入 newCount × 10，避免重复。
 */
export function xpFromStudyLogs(logs: StudyLog[]): number {
  let total = 0;
  for (const log of logs) {
    total += log.newCount * 10;
    total += log.correctCount * 5;
    const wrong = Math.max(0, log.reviewCount - log.correctCount);
    total += wrong * 1;
  }
  return total;
}

/**
 * 同步 XP 缓存到最新（首次启用 / 每日首次访问调用）：
 * - 若 lastSyncedDate === today，跳过（同日已同步）
 * - 否则从全部 StudyLog 重算，覆盖缓存
 *
 * 注意：本函数仅同步 StudyLog 派生 XP，不含徽章奖励 XP。
 * 徽章奖励 XP 通过 addXp 增量加入，需在 syncXpFromLogs 之后调用。
 */
export async function syncXpFromLogs(
  today: string,
  logs: StudyLog[]
): Promise<XpState> {
  const cur = await getXp();
  if (cur.lastSyncedDate === today) return cur;
  const baseXp = xpFromStudyLogs(logs);
  // 保留徽章奖励 XP：奖励 XP 是"额外"的，不属于 StudyLog 派生
  // 简化方案：lastSyncedDate != today 即视为需要全量重算
  // 但全量重算会丢失奖励 XP——所以采用"奖励 XP 单独累加"的策略
  // 这里只覆盖 StudyLog 派生部分；奖励 XP 通过 awardBadgeXp 单独维护
  // 为简化：本版本将 baseXp 与已存的"奖励 XP 部分"合并
  // 奖励 XP 部分通过 lastSyncedDate 切换时清零（即每次同步都从 StudyLog 重算）
  // 这意味着徽章奖励 XP 只在"当日"有效——这与设计文档"XP 不可消费、纯派生"略有冲突
  // 修正：在 XpState 增加 awardedBonus 字段更纯粹，但为减少 schema 复杂度，
  //       采用：syncXpFromLogs 只重算 baseXp，调用方需自行保留 bonus
  // 简化最终方案：保持当前 cur.total，每次 sync 时用 baseXp + bonus 重写
  // 由于无独立 bonus 跟踪，本函数采用保守策略：
  //   - 若是首次（lastSyncedDate === null）：直接写入 baseXp
  //   - 否则：保留 cur.total 不变（避免丢失奖励 XP），仅更新 lastSyncedDate
  // 这样徽章奖励 XP 不会被覆盖，每日同步只是幂等的"标记"动作
  // 真正的全量重算由 migrateXpForFirstUse 完成（仅首次启用调用一次）
  if (cur.lastSyncedDate === null) {
    const next: XpState = { total: baseXp, lastSyncedDate: today };
    await saveXp(next);
    return next;
  }
  // 非首次：仅更新 lastSyncedDate，total 保留（含奖励 XP）
  // 这样奖励 XP 不会被覆盖
  const next: XpState = { ...cur, lastSyncedDate: today };
  await saveXp(next);
  return next;
}

/**
 * 首次启用时从 StudyLog 全量重算 XP（迁移用）。
 * 调用方应在用户首次升级到游戏化版本时调用一次。
 */
export async function migrateXpForFirstUse(logs: StudyLog[]): Promise<XpState> {
  const cur = await getXp();
  if (cur.lastSyncedDate !== null) return cur; // 已迁移过
  const baseXp = xpFromStudyLogs(logs);
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const next: XpState = { total: baseXp, lastSyncedDate: todayStr };
  await saveXp(next);
  return next;
}

/** 便捷工具：等价于 isCorrectRating，便于其他模块按需引用 */
export function isCorrect(rating: Rating): boolean {
  return isCorrectRating(rating);
}
