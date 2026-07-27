/**
 * Streak + 学习日志 I/O（设计文档 §4.3 key 前缀规划）
 *
 * - settings:streak：连续打卡状态（currentStreak/longestStreak/lastReviewDate）
 * - log:{date}：每日学习日志（newCount/reviewCount/correctCount），热力图数据源
 *
 * recordStudy 幂等：同日多次复习 Streak 不变，日志累加。
 */
import { getItem, setItem, listItemsByPrefix } from "@/lib/storage/db";
import { computeStreak, type StreakState } from "@/lib/stats/streak";

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

const STREAK_KEY = "settings:streak";

function logKey(date: string): string {
  return `log:${date}`;
}

/** 记录一次学习：更新 Streak + 累加当日日志，返回新 StreakState */
export async function recordStudy(
  today: string,
  input: StudyInput,
  now: Date = new Date()
): Promise<StreakState> {
  const prevStreak = await getStreak();
  const newStreak = computeStreak(prevStreak, today);
  await setItem(STREAK_KEY, newStreak);

  // 累加当日日志
  const prevLog = await getStudyLog(today);
  const newLog: StudyLog = {
    date: today,
    newCount: (prevLog?.newCount ?? 0) + input.newCount,
    reviewCount: (prevLog?.reviewCount ?? 0) + input.reviewCount,
    correctCount: (prevLog?.correctCount ?? 0) + input.correctCount,
    updatedAt: now.toISOString(),
  };
  await setItem(logKey(today), newLog);

  return newStreak;
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
