/**
 * 复习会话状态缓存（设计文档 §3.2：切换离开再回来恢复原位）
 *
 * 用 localStorage 持久化当前复习模式与进度：
 * - 刷题模式：完整缓存 words/offsets/index/flipped，回来继续原词原位
 * - FSRS 模式：缓存 queue/index/flipped，仅同一天有效（跨天队列会重建）
 *
 * 写入时机：进入 running / 评分推进 / 翻面 / 退出时
 * 读取时机：组件 mount 时尝试恢复，恢复后清除一次性快照
 */
import type { TodayQueueItem } from "@/lib/review/today-queue";
import type { ReviewOutcome } from "@/lib/review/review-session";
import type { Rating } from "@/lib/review/fsrs-scheduler";

export type ReviewMode = "fsrs" | "drill";
export type DrillOrder = "sequential" | "random";

const CACHE_KEY = "wordflow:review-session:v1";
const SAME_DAY_TTL_MS = 18 * 60 * 60 * 1000; // 18h，覆盖一天的学习窗口

export interface DrillCache {
  order: DrillOrder;
  filterMastered: boolean;
  words: string[];
  wordOffsets: number[];
  index: number;
  flipped: boolean;
  masteredCount: number;
  outcomes: ReviewOutcome[];
  activeBookId: string | null;
}

export interface FsrsCache {
  /** 生成此队列时的当前词书 ID，用于切换词书后检测快照过期 */
  activeBookId: string | null;
  queue: TodayQueueItem[];
  index: number;
  flipped: boolean;
  outcomes: ReviewOutcome[];
}

export interface ReviewSessionCache {
  version: number;
  mode: ReviewMode;
  savedAt: string;
  drill?: DrillCache;
  fsrs?: FsrsCache;
}

function isAvailable(): boolean {
  try {
    return typeof window !== "undefined" && !!window.localStorage;
  } catch {
    return false;
  }
}

export function saveReviewSession(cache: ReviewSessionCache): void {
  if (!isAvailable()) return;
  try {
    cache.savedAt = new Date().toISOString();
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // 容量超限或禁用：静默忽略，缓存是最佳努力
  }
}

export function loadReviewSession(): ReviewSessionCache | null {
  if (!isAvailable()) return null;
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ReviewSessionCache;
    if (!parsed || parsed.version !== 1) return null;
    const savedAt = new Date(parsed.savedAt).getTime();
    if (Number.isNaN(savedAt)) return null;
    // 超过 TTL 视为过期
    if (Date.now() - savedAt > SAME_DAY_TTL_MS) {
      clearReviewSession();
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearReviewSession(): void {
  if (!isAvailable()) return;
  try {
    window.localStorage.removeItem(CACHE_KEY);
  } catch {
    /* ignore */
  }
}

/** 用于 Rating 类型守卫（解析后校验） */
export function isRating(v: unknown): v is Rating {
  return v === "Again" || v === "Hard" || v === "Good" || v === "Easy";
}

/**
 * 从 FSRS 缓存队列中过滤掉已掌握的单词。
 *
 * 解决场景：用户在刷题模式标记某词为"已会"后，切到今日复习仍看到该词。
 * 根因：FsrsReview 从 localStorage 恢复队列快照时跳过了 DB 再校验，
 * 缓存中 due 类型的 card.verification 是冻结的旧值。
 *
 * 调用方需从 DB 查出 mastered 的 word 集合传入，本函数做纯过滤 + index 修正。
 */
export function filterMasteredFromFsrsCache(
  cache: FsrsCache,
  masteredWords: Set<string>
): FsrsCache {
  if (masteredWords.size === 0) return cache;

  const filteredQueue = cache.queue.filter((item) => {
    if (item.type === "due" && item.card) {
      return !masteredWords.has(item.card.word.toLowerCase());
    }
    if (item.type === "new" && item.word) {
      return !masteredWords.has(item.word.toLowerCase());
    }
    return true;
  });

  // index 修正：过滤后队列变短，确保 index 不越界
  const newIndex = Math.min(
    cache.index,
    Math.max(0, filteredQueue.length - 1)
  );

  return { ...cache, queue: filteredQueue, index: newIndex };
}
