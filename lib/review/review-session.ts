/**
 * 复习会话（设计文档 §3.2 B 复习页 + §2.1 核心闭环）
 *
 * 提交一次复习反馈：
 * - 到期卡片：直接评分 → FSRS 调度 → 覆盖持久化
 * - 新词：在内存创建 New 卡 → 评分 → FSRS 调度 → 持久化（首次复习即建卡，避免孤儿卡）
 *
 * 持久化带 updatedAt（供同步层 LWW），dueAt 由 db.setItem 从 value.due 提取建索引。
 */
import { setItem } from "@/lib/storage/db";
import {
  createNewCard,
  reviewCard,
  type Rating,
  type PresetName,
  type State,
  type WordCard,
} from "@/lib/review/fsrs-scheduler";
import { cardKey } from "@/lib/review/favorite";
import type { TodayQueueItem } from "@/lib/review/today-queue";

export interface ReviewOutcome {
  word: string;
  rating: Rating;
  nextState: State;
  nextDue: string;
  /** 本次是否为新词首次复习 */
  wasNew: boolean;
}

/**
 * 提交一次复习评分，返回结果并持久化卡片。
 *
 * @param item 队列项（due 或 new）
 * @param rating 评分（Again/Hard/Good/Easy）
 * @param preset FSRS 预设（默认 standard）
 * @param now 复习时刻（默认当前时间，注入便于测试）
 */
export async function submitReview(
  item: TodayQueueItem,
  rating: Rating,
  preset: PresetName = "standard",
  now: Date = new Date()
): Promise<ReviewOutcome> {
  let card: WordCard;
  let wasNew: boolean;
  let word: string;

  if (item.type === "due") {
    card = item.card;
    word = item.card.word;
    wasNew = false;
  } else {
    // 新词：内存创建 New 卡后立即评分（不持久化中间 New 态，避免孤儿卡）
    word = item.word;
    card = createNewCard(now, word.toLowerCase(), item.source);
    wasNew = true;
  }

  const { card: nextCard } = reviewCard(card, rating, now, preset);

  // 持久化：带 updatedAt 供同步 LWW；db.setItem 从 value.due 提取 dueAt 建索引
  const updatedAt = now.toISOString();
  await setItem(cardKey(word), { ...nextCard, updatedAt });

  return {
    word,
    rating,
    nextState: nextCard.state,
    nextDue: new Date(nextCard.due).toISOString(),
    wasNew,
  };
}
