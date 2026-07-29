/**
 * Streak + 学习日志 I/O（设计文档 §4.3 key 前缀规划）
 *
 * - settings:streak：连续打卡状态（currentStreak/longestStreak/lastReviewDate）
 * - log:{date}：每日学习日志（newCount/reviewCount/correctCount），热力图数据源
 *
 * recordStudy 幂等：同日多次复习 Streak 不变，日志累加。
 *
 * 游戏化集成（§5.5）：
 * - 在 computeStreak 之前调用 resolveShieldForRecordStudy，决定是否消耗保护券保住连胜
 * - 在 computeStreak 之后调用 maybeEarnShield，决定是否补充保护券
 * - 返回结果包含 shieldConsumed / shieldEarned 标记，供 UI toast 提示
 */
import { getItem, setItem, listItemsByPrefix } from "@/lib/storage/db";
import { computeStreak, type StreakState } from "@/lib/stats/streak";
import {
  getShield,
  saveShield,
  resolveShieldForRecordStudy,
  maybeEarnShield,
} from "@/lib/gamification/shield";

export interface StudyLog {
  date: string; // YYYY-MM-DD
  newCount: number;
  reviewCount: number;
  correctCount: number;
  updatedAt: string;
}

export interface StudyInput {
  newCount: number;
  reviewCount: number;
  correctCount: number;
}

/** recordStudy 结果（扩展自 StreakState，含游戏化副作用标记） */
export interface RecordStudyResult extends StreakState {
  /** 本次 recordStudy 是否消耗了保护券保住连胜 */
  shieldConsumed: boolean;
  /** 本次 recordStudy 是否补充了保护券（连胜达到 7 的倍数） */
  shieldEarned: boolean;
}

const STREAK_KEY = "settings:streak";

function logKey(date: string): string {
  return `log:${date}`;
}

/**
 * 记录一次学习：更新 Streak + 累加当日日志，处理保护券消耗 / 补充。
 *
 * 游戏化流程（设计文档 §5.4.1）：
 * 1. 读取 prevStreak + shield
 * 2. resolveShieldForRecordStudy：判定是否消耗保护券
 *    - 若消耗：把 prevStreak.lastReviewDate "前移"到 yesterday，使 computeStreak 计算 gap=1 → +1，连胜保住
 *    - 写入 newShield（消耗后状态）
 * 3. computeStreak：根据 adjustedPrevStreak 计算新 streak
 * 4. maybeEarnShield：若新 streak 是 7 的倍数，补充 1 张保护券
 * 5. 累加当日日志
 *
 * @returns RecordStudyResult，含新 StreakState + shield 副作用标记
 */
export async function recordStudy(
  today: string,
  input: StudyInput,
  now: Date = new Date()
): Promise<RecordStudyResult> {
  const prevStreak = await getStreak();
  const shield = await getShield();

  // 1. 决定是否消耗保护券保住连胜
  const { adjustedPrevStreak, newShield: afterConsumeShield, consumed } =
    resolveShieldForRecordStudy(prevStreak, today, shield);
  if (consumed) {
    await saveShield(afterConsumeShield);
  }

  // 2. 计算新 streak（用 adjustedPrevStreak，可能保住连胜）
  const newStreak = computeStreak(adjustedPrevStreak, today);
  await setItem(STREAK_KEY, newStreak);

  // 3. 检查是否补充保护券（连胜达到 7 的倍数）
  const earnedShield = maybeEarnShield(newStreak, afterConsumeShield, today);
  if (earnedShield.shields !== afterConsumeShield.shields) {
    await saveShield(earnedShield);
  }

  // 4. 累加当日日志
  const prevLog = await getStudyLog(today);
  const newLog: StudyLog = {
    date: today,
    newCount: (prevLog?.newCount ?? 0) + input.newCount,
    reviewCount: (prevLog?.reviewCount ?? 0) + input.reviewCount,
    correctCount: (prevLog?.correctCount ?? 0) + input.correctCount,
    updatedAt: now.toISOString(),
  };
  await setItem(logKey(today), newLog);

  return {
    ...newStreak,
    shieldConsumed: consumed,
    shieldEarned: earnedShield.shields !== afterConsumeShield.shields,
  };
}

export async function getStreak(): Promise<StreakState | undefined> {
  return getItem<StreakState>(STREAK_KEY);
}

export async function getStudyLog(date: string): Promise<StudyLog | undefined> {
  return getItem<StudyLog>(logKey(date));
}

/** 列出全部学习日志（热力图数据源） */
export async function listStudyLogs(): Promise<StudyLog[]> {
  return listItemsByPrefix<StudyLog>("log:");
}
