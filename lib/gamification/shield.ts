/**
 * 连胜保护（Streak Freeze）—— 设计文档 §4.2 特性 1
 *
 * 核心规则：
 * - 默认持有 1 张保护券（新用户首次进入即发放）
 * - 断签"隔 1 天"且持有保护券时，自动消耗 1 张保住连胜
 * - 隔 ≥2 天不消耗（多邻国规则：保护券仅保单日）
 * - 每连续 7 天学习（currentStreak % 7 === 0），自动补充 1 张（上限 2）
 * - 回归挽留：断签 ≥7 天后首启，若当前 0 张则赠送 1 张
 *
 * 与 streak-io 的集成：
 * - recordStudy 调用前先 shouldConsumeShield，决定是否保住 currentStreak
 * - computeStreak 调用后立即 maybeEarnShield 检查是否补充
 *
 * 状态机：所有判定纯函数化，副作用仅在 consumeShield / earnShield 的 IO 层
 */
import { getItem, setItem } from "@/lib/storage/db";
import type { StreakState } from "@/lib/stats/streak";
import {
  daysBetween,
  SHIELD_EARN_INTERVAL,
  SHIELD_KEY,
  SHIELD_MAX,
  type StreakShieldState,
} from "./types";

/** 默认状态：新用户持有 1 张保护券（设计文档 §4.2「每个用户默认持有 1 张」） */
export function defaultShieldState(): StreakShieldState {
  return {
    shields: 1,
    lastEarnedDate: null,
    lastUsedDate: null,
    totalUsed: 0,
  };
}

/** 读取保护券状态（不存在时返回默认） */
export async function getShield(): Promise<StreakShieldState> {
  const v = await getItem<StreakShieldState>(SHIELD_KEY);
  return v ?? defaultShieldState();
}

/** 写入保护券状态 */
export async function saveShield(state: StreakShieldState): Promise<void> {
  await setItem(SHIELD_KEY, state);
}

/**
 * 判定本次 recordStudy 是否应消耗保护券（纯函数）。
 *
 * 触发条件全部满足：
 * - 有上一次 Streak 状态
 * - 上次复习不是今天（避免同日多次复习）
 * - 上次复习距今恰好 2 天（即"隔 1 天"——昨天断了，今天补救）
 *   gap=1 是连续次日（正常 +1，无需保护券）
 *   gap=2 是隔 1 天（昨天没来，保护券保住连胜）
 *   gap≥3 是隔 2+ 天（保护券无法保住，连胜重置）
 * - 当前持有 ≥1 张保护券
 *
 * 注意：本函数仅判定，不修改状态；状态变更在 applyShieldConsumption。
 */
export function shouldConsumeShield(
  prevStreak: StreakState | undefined,
  today: string,
  shield: StreakShieldState
): boolean {
  if (!prevStreak) return false;
  if (prevStreak.lastReviewDate === today) return false;
  const gap = daysBetween(prevStreak.lastReviewDate, today);
  return gap === 2 && shield.shields > 0;
}

/**
 * 应用保护券消耗（纯函数）：返回消耗后的新 shield 状态。
 * 同日多次调用幂等：lastUsedDate === today 则不再消耗。
 */
export function applyShieldConsumption(
  shield: StreakShieldState,
  today: string
): StreakShieldState {
  if (shield.lastUsedDate === today) return shield; // 同日已消耗过，幂等
  if (shield.shields <= 0) return shield;
  return {
    ...shield,
    shields: shield.shields - 1,
    lastUsedDate: today,
    totalUsed: shield.totalUsed + 1,
  };
}

/**
 * 检查并补充保护券（纯函数）：
 * - currentStreak > 0 且能被 SHIELD_EARN_INTERVAL 整除（7/14/21...）
 * - 今日未领过（lastEarnedDate !== today）
 * - 当前持有 < SHIELD_MAX
 *
 * 注意：连签断签重置为 1 后再涨到 7 也会再发一次，符合"持续学习奖励"语义。
 */
export function maybeEarnShield(
  streak: StreakState,
  shield: StreakShieldState,
  today: string
): StreakShieldState {
  if (streak.currentStreak <= 0) return shield;
  if (streak.currentStreak % SHIELD_EARN_INTERVAL !== 0) return shield;
  if (shield.lastEarnedDate === today) return shield;
  if (shield.shields >= SHIELD_MAX) return shield;
  return {
    ...shield,
    shields: shield.shields + 1,
    lastEarnedDate: today,
  };
}

/**
 * 回归挽留：断签 ≥7 天后首启，赠 1 张保护券（若当前为 0）。
 * 仅在首次回归时赠，避免重复发放；调用方需在赠后写入 comeback 已赠标记。
 */
export function applyComebackGift(
  shield: StreakShieldState,
  prevStreak: StreakState | undefined,
  today: string,
  comebackGapDays: number
): { shield: StreakShieldState; gifted: boolean } {
  if (comebackGapDays < 7) return { shield, gifted: false };
  if (shield.shields > 0) return { shield, gifted: false };
  // 仅在断签 ≥7 天且无保护券时赠送 1 张
  return {
    shield: { ...shield, shields: 1 },
    gifted: true,
  };
}

/**
 * 完整流程：recordStudy 时调用，决定 streak 是否保住、消耗 / 补充保护券。
 *
 * 返回：
 * - adjustedPrevStreak：传给 computeStreak 的"前序状态"（可能修改 lastReviewDate 来保住连胜）
 * - newShield：消耗后 / 补充后的新保护券状态
 * - consumed: 是否消耗了保护券
 *
 * 注意：本函数不写库，调用方负责 setItem(shield) + setItem(streak)
 */
export function resolveShieldForRecordStudy(
  prevStreak: StreakState | undefined,
  today: string,
  shield: StreakShieldState
): {
  adjustedPrevStreak: StreakState | undefined;
  newShield: StreakShieldState;
  consumed: boolean;
} {
  if (!shouldConsumeShield(prevStreak, today, shield)) {
    return { adjustedPrevStreak: prevStreak, newShield: shield, consumed: false };
  }
  // 消耗保护券：把 prevStreak 的 lastReviewDate "前移"到 yesterday，
  // 这样 computeStreak 计算 gap=1 → +1，连胜保住
  const yesterday = (() => {
    const d = new Date(today + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() - 1);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  })();
  const adjustedPrevStreak: StreakState = {
    ...prevStreak!,
    lastReviewDate: yesterday,
  };
  const newShield = applyShieldConsumption(shield, today);
  return { adjustedPrevStreak, newShield, consumed: true };
}
