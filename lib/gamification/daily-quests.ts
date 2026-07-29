/**
 * 每日三任务 —— 设计文档 §4.2 特性 2
 *
 * 三个任务（每日 0 点本地重置）：
 * 1. 复习 10 张卡片（或今日队列的 50%，取小）—— 蔡格尼克效应
 * 2. 答对 15 次（评分 Good/Easy）—— 强化正反馈
 * 3. 查 1 个新词并收藏 —— 引导回首页核心闭环
 *
 * 三任务全完成 → 一次性 +30 XP 奖励（claimed 标记防重复）
 *
 * 进度更新不是新写入点，而是订阅现有学习事件：
 * - submitReview 后 bumpReviewQuest
 * - addFavorite 后 markSearchedQuest
 *
 * 状态按日分片：gamification:quests:{YYYY-MM-DD}，旧的可清理
 */
import { getItem, setItem } from "@/lib/storage/db";
import type { Rating } from "@/lib/review/fsrs-scheduler";
import {
  QUEST_COMPLETE_BONUS,
  QUEST_CORRECT_TARGET,
  QUEST_PREFIX,
  QUEST_REVIEW_BASE,
  isCorrectRating,
  todayLocalDate,
  type DailyQuestState,
} from "./types";

/** 任务 key */
function questKey(date: string): string {
  return `${QUEST_PREFIX}${date}`;
}

/**
 * 创建当日任务初始状态（按队列长度动态调整 reviewTarget）。
 *
 * reviewTarget = min(QUEST_REVIEW_BASE, max(1, queueLength / 2))
 * - 队列 ≥ 20：目标 10
 * - 队列 2-19：目标 队列/2（向下取整，最少 1）
 * - 队列 0/1：目标 1（避免任务永远完不成）
 */
export function createDailyQuest(
  date: string,
  queueLength: number
): DailyQuestState {
  const reviewTarget =
    queueLength === 0
      ? 1
      : Math.min(QUEST_REVIEW_BASE, Math.max(1, Math.floor(queueLength / 2)));
  return {
    date,
    reviewed: 0,
    correct: 0,
    searched: false,
    claimed: false,
    reviewTarget,
    correctTarget: QUEST_CORRECT_TARGET,
  };
}

/**
 * 读取当日任务（不存在时按 queueLength 创建并写入）。
 * 跨日时旧任务自动过期（key 不同），无需主动清理。
 */
export async function getOrCreateDailyQuest(
  date: string,
  queueLength: number
): Promise<DailyQuestState> {
  const key = questKey(date);
  const existing = await getItem<DailyQuestState>(key);
  if (existing && existing.date === date) return existing;
  const next = createDailyQuest(date, queueLength);
  await setItem(key, next);
  return next;
}

/** 仅读取当日任务（不存在返回 null） */
export async function getDailyQuest(date: string): Promise<DailyQuestState | null> {
  const v = await getItem<DailyQuestState>(questKey(date));
  return v ?? null;
}

/** 写入当日任务 */
export async function saveDailyQuest(state: DailyQuestState): Promise<void> {
  await setItem(questKey(state.date), state);
}

/**
 * 提交一次复习后更新任务进度（纯函数）。
 *
 * - reviewed += 1
 * - correct += 1 if rating is Good/Easy
 */
export function bumpReviewQuest(
  state: DailyQuestState,
  rating: Rating
): DailyQuestState {
  return {
    ...state,
    reviewed: state.reviewed + 1,
    correct: state.correct + (isCorrectRating(rating) ? 1 : 0),
  };
}

/**
 * 标记"查词并收藏"任务完成（纯函数）。
 * 重复收藏同日幂等：searched 已 true 时不变。
 */
export function markSearchedQuest(state: DailyQuestState): DailyQuestState {
  if (state.searched) return state;
  return { ...state, searched: true };
}

/** 单任务是否完成 */
export function isReviewDone(state: DailyQuestState): boolean {
  return state.reviewed >= state.reviewTarget;
}
export function isCorrectDone(state: DailyQuestState): boolean {
  return state.correct >= state.correctTarget;
}
export function isSearchedDone(state: DailyQuestState): boolean {
  return state.searched;
}

/** 三任务完成数（0-3） */
export function completedCount(state: DailyQuestState): number {
  let n = 0;
  if (isReviewDone(state)) n++;
  if (isCorrectDone(state)) n++;
  if (isSearchedDone(state)) n++;
  return n;
}

/** 三任务是否全部完成 */
export function isAllComplete(state: DailyQuestState): boolean {
  return completedCount(state) === 3;
}

/**
 * 尝试领取三连完成奖励（幂等）：
 * - 仅在 isAllComplete && !claimed 时发放
 * - 返回奖励 XP（0 表示未发放）
 *
 * 调用方负责把奖励 XP 加到 XP 总账。
 */
export function claimCompleteBonus(
  state: DailyQuestState
): { state: DailyQuestState; bonus: number } {
  if (state.claimed) return { state, bonus: 0 };
  if (!isAllComplete(state)) return { state, bonus: 0 };
  return {
    state: { ...state, claimed: true },
    bonus: QUEST_COMPLETE_BONUS,
  };
}

/** 进度描述（用于 UI 展示） */
export interface QuestProgress {
  reviewDone: boolean;
  correctDone: boolean;
  searchedDone: boolean;
  completed: number;
  total: number;
  allDone: boolean;
  claimed: boolean;
}

export function describeProgress(state: DailyQuestState): QuestProgress {
  return {
    reviewDone: isReviewDone(state),
    correctDone: isCorrectDone(state),
    searchedDone: isSearchedDone(state),
    completed: completedCount(state),
    total: 3,
    allDone: isAllComplete(state),
    claimed: state.claimed,
  };
}

/** 便捷：当前日期的今日任务（不传 date 时用 todayLocalDate） */
export async function getTodayQuest(
  queueLength: number,
  now: Date = new Date()
): Promise<DailyQuestState> {
  return getOrCreateDailyQuest(todayLocalDate(now), queueLength);
}
