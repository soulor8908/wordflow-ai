/**
 * 用户画像（User Profile）
 *
 * 从学习日志、卡片状态、词书进度等已有数据中派生用户画像，
 * 不需要用户显式填写。画像数据用于个性化推荐、学习建议与云端同步。
 *
 * 画像维度：
 * 1. 词汇量：已掌握 / 学习中 / 新词总数 / 估算词汇水平（CEFR）
 * 2. 学习习惯：日均学习量、偏好时段、连续打卡天数、累计学习天数
 * 3. 正确率趋势：最近 7/30 天正确率
 * 4. 词书分布：各词书的进度
 *
 * 存储：settings:user-profile（派生数据，可随时从原始数据重建）
 */
import { getItem, setItem, listItemsByPrefix } from "@/lib/storage/db";
import { listStudyLogs, getStreak, type StudyLog } from "@/lib/stats/streak-io";
import type { StreakState } from "@/lib/stats/streak";
import type { WordCard } from "@/lib/review/fsrs-scheduler";
import { getActiveBook } from "@/lib/review/active-book";

export interface VocabularyStats {
  /** 已掌握词数（verification === "mastered"） */
  masteredCount: number;
  /** 学习中词数（有卡片但未掌握） */
  learningCount: number;
  /** 累计学过的词（mastered + learning） */
  totalLearnedCount: number;
  /** 估算 CEFR 水平（基于已掌握词数粗略映射） */
  estimatedCefr: "A1" | "A2" | "B1" | "B2" | "C1" | "C2";
}

export interface LearningHabit {
  /** 连续打卡天数 */
  currentStreak: number;
  /** 最长连续打卡 */
  longestStreak: number;
  /** 累计学习天数（有日志的天数） */
  totalStudyDays: number;
  /** 日均新词数（最近 30 天） */
  avgDailyNewWords: number;
  /** 日均复习数（最近 30 天） */
  avgDailyReviews: number;
  /** 偏好学习时段（hour 0-23 中最活跃的时段） */
  preferredHour: number;
  /** 偏好学习时段描述 */
  preferredPeriod: "凌晨" | "上午" | "下午" | "晚上" | "深夜";
}

export interface AccuracyTrend {
  /** 最近 7 天正确率（0-1） */
  last7Days: number;
  /** 最近 30 天正确率（0-1） */
  last30Days: number;
  /** 总体正确率（0-1） */
  overall: number;
}

export interface BookProgress {
  bookId: string;
  /** 该词书总词数 */
  totalWords: number;
  /** 已学词数（有卡片） */
  learnedCount: number;
  /** 进度百分比（0-1） */
  progress: number;
}

export interface UserProfile {
  /** 生成时间（ISO） */
  generatedAt: string;
  vocabulary: VocabularyStats;
  habit: LearningHabit;
  accuracy: AccuracyTrend;
  /** 当前词书 */
  activeBookId: string | null;
}

const PROFILE_KEY = "settings:user-profile";

/** 从卡片列表统计词汇量 */
function computeVocabulary(cards: WordCard[]): VocabularyStats {
  const masteredCount = cards.filter((c) => c.verification === "mastered").length;
  const learningCount = cards.filter((c) => c.verification !== "mastered").length;
  const totalLearnedCount = cards.length;

  // 粗略 CEFR 映射（基于已掌握词数）
  let estimatedCefr: VocabularyStats["estimatedCefr"] = "A1";
  if (masteredCount >= 5000) estimatedCefr = "C2";
  else if (masteredCount >= 3000) estimatedCefr = "C1";
  else if (masteredCount >= 1500) estimatedCefr = "B2";
  else if (masteredCount >= 800) estimatedCefr = "B1";
  else if (masteredCount >= 300) estimatedCefr = "A2";

  return {
    masteredCount,
    learningCount,
    totalLearnedCount,
    estimatedCefr,
  };
}

/** hour → 时段描述 */
function hourToPeriod(hour: number): LearningHabit["preferredPeriod"] {
  if (hour >= 5 && hour < 9) return "上午";
  if (hour >= 9 && hour < 12) return "上午";
  if (hour >= 12 && hour < 18) return "下午";
  if (hour >= 18 && hour < 23) return "晚上";
  if (hour >= 23 || hour < 1) return "深夜";
  return "凌晨";
}

/** 从日志列表计算学习习惯 */
function computeHabit(
  logs: StudyLog[],
  streak: StreakState | undefined
): LearningHabit {
  const totalStudyDays = logs.length;

  // 最近 30 天日志
  const now = Date.now();
  const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
  const recentLogs = logs.filter((l) => {
    const t = new Date(l.updatedAt).getTime();
    return t >= thirtyDaysAgo;
  });

  const avgDailyNewWords =
    recentLogs.length > 0
      ? Math.round(
          recentLogs.reduce((s, l) => s + (l.newCount ?? 0), 0) / recentLogs.length
        )
      : 0;
  const avgDailyReviews =
    recentLogs.length > 0
      ? Math.round(
          recentLogs.reduce((s, l) => s + (l.reviewCount ?? 0), 0) / recentLogs.length
        )
      : 0;

  // 偏好时段：统计 updatedAt 的小时分布
  const hourCounts = new Array(24).fill(0);
  for (const l of logs) {
    const h = new Date(l.updatedAt).getHours();
    hourCounts[h] += 1;
  }
  let preferredHour = 20; // 默认晚上
  let maxCount = 0;
  for (let h = 0; h < 24; h++) {
    if (hourCounts[h] > maxCount) {
      maxCount = hourCounts[h];
      preferredHour = h;
    }
  }

  return {
    currentStreak: streak?.currentStreak ?? 0,
    longestStreak: streak?.longestStreak ?? 0,
    totalStudyDays,
    avgDailyNewWords,
    avgDailyReviews,
    preferredHour,
    preferredPeriod: hourToPeriod(preferredHour),
  };
}

/** 从日志列表计算正确率趋势 */
function computeAccuracy(logs: StudyLog[]): AccuracyTrend {
  const now = Date.now();
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
  const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;

  function calc(since: number): number {
    const filtered = logs.filter((l) => new Date(l.updatedAt).getTime() >= since);
    const total = filtered.reduce(
      (s, l) => s + (l.reviewCount ?? 0) + (l.newCount ?? 0),
      0
    );
    const correct = filtered.reduce((s, l) => s + (l.correctCount ?? 0), 0);
    return total > 0 ? correct / total : 0;
  }

  return {
    last7Days: calc(sevenDaysAgo),
    last30Days: calc(thirtyDaysAgo),
    overall: calc(0),
  };
}

/**
 * 生成用户画像（从原始数据派生）
 *
 * 这是一个纯计算函数，读取已有数据并聚合，不产生副作用（除写入缓存）。
 * 建议在以下时机调用：
 * - 用户打开统计页时
 * - 每日首次学习完成后
 * - 云端同步前
 */
export async function generateUserProfile(): Promise<UserProfile> {
  const [logs, streak, activeBook, cards] = await Promise.all([
    listStudyLogs(),
    getStreak(),
    getActiveBook(),
    listItemsByPrefix<WordCard>("card:"),
  ]);

  const profile: UserProfile = {
    generatedAt: new Date().toISOString(),
    vocabulary: computeVocabulary(cards),
    habit: computeHabit(logs, streak),
    accuracy: computeAccuracy(logs),
    activeBookId: activeBook?.bookId ?? null,
  };

  // 写入缓存（供云端同步与快速读取）
  await setItem(PROFILE_KEY, profile);
  return profile;
}

/** 读取缓存的用户画像（未生成时返回 null） */
export async function getUserProfile(): Promise<UserProfile | null> {
  const v = await getItem<UserProfile>(PROFILE_KEY);
  return v ?? null;
}

export { PROFILE_KEY };
