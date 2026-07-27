export interface StreakState {
  currentStreak: number;
  longestStreak: number;
  lastReviewDate: string; // YYYY-MM-DD
}

/** 计算两个 YYYY-MM-DD 日期相差的天数（b - a） */
function daysBetween(a: string, b: string): number {
  const dateA = new Date(a + "T00:00:00Z");
  const dateB = new Date(b + "T00:00:00Z");
  return Math.round((dateB.getTime() - dateA.getTime()) / (24 * 60 * 60 * 1000));
}

/**
 * 根据上次状态和今日复习日期，计算新的 Streak 状态（纯函数）。
 * - 同日复习：幂等，不变
 * - 连续次日：currentStreak + 1
 * - 间隔 ≥2 天：重置为 1
 * - longestStreak 取 max(longestStreak, currentStreak)
 */
export function computeStreak(
  prev: StreakState | undefined,
  today: string
): StreakState {
  if (!prev) {
    return {
      currentStreak: 1,
      longestStreak: 1,
      lastReviewDate: today,
    };
  }

  // 同日复习：幂等
  if (prev.lastReviewDate === today) {
    return prev;
  }

  const gap = daysBetween(prev.lastReviewDate, today);
  const currentStreak = gap === 1 ? prev.currentStreak + 1 : 1;
  const longestStreak = Math.max(prev.longestStreak, currentStreak);

  return {
    currentStreak,
    longestStreak,
    lastReviewDate: today,
  };
}
