/**
 * 复习会话（设计文档 §3.2 B 复习页 + §2.1 核心闭环）
 *
 * 提交一次复习反馈：
 * - 到期卡片：直接评分 → FSRS 调度 → 覆盖持久化
 * - 新词：在内存创建 New 卡 → 评分 → FSRS 调度 → 持久化（首次复习即建卡，避免孤儿卡）
 *
 * 持久化带 updatedAt（供同步层 LWW），dueAt 由 db.setItem 从 value.due 提取建索引。
 *
 * 常错词统计：Again/Hard 评分累加 errorCount + 写入 lastErrorAt，
 * 用于 /stats 页常错词排行（设计文档 §3.3 统计页）。
 */
import { getItem, setItem } from "@/lib/storage/db";
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

  // 常错词统计：Again/Hard 累加 errorCount + 写入 lastErrorAt
  const isError = rating === "Again" || rating === "Hard";
  const errorCount = (card.errorCount ?? 0) + (isError ? 1 : 0);
  const lastErrorAt = isError ? now.toISOString() : card.lastErrorAt;

  // 持久化：带 updatedAt 供同步 LWW；db.setItem 从 value.due 提取 dueAt 建索引
  const updatedAt = now.toISOString();
  await setItem(cardKey(word), {
    ...nextCard,
    errorCount,
    lastErrorAt,
    updatedAt,
  });

  return {
    word,
    rating,
    nextState: nextCard.state,
    nextDue: new Date(nextCard.due).toISOString(),
    wasNew,
  };
}

/**
 * 直接将某词标记为已掌握（verification = "mastered"）。
 *
 * 用于刷题模式中用户长按"认识"标记已会词，跳过 FSRS 调度直接掌握。
 * 这是"目标客户已掌握 1000+ 词汇"场景的核心入口：
 * 用户开局用刷题模式批量标记已会词，后续 FSRS 复习集中精力学不会的词。
 *
 * 若卡片不存在会自动创建一张已掌握卡（不影响 FSRS 学习流，仅占位统计）。
 *
 * 需求5：学会后自动清除常错词记录——若 errorCount <= 2，重置为 0（从常错词列表移除）。
 * 高频错词（errorCount >= 3）保留记录，便于后续重点复习。
 */
export async function markWordAsMastered(
  word: string,
  source = "drill",
  now: Date = new Date()
): Promise<WordCard> {
  const key = cardKey(word);
  const existing = await getItem<WordCard>(key);
  const base = existing ?? createNewCard(now, word.toLowerCase(), source);

  // 需求5：学会后清除低频错误记录（errorCount <= 2 → 重置为 0）
  const shouldClearErrors = (base.errorCount ?? 0) <= 2;

  const updated: WordCard = {
    ...base,
    verification: "mastered",
    // 已掌握词推迟到很久以后再复习（30 天后回访一次，确认未遗忘）
    due: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
    // 低频错词学会后清除记录；高频错词（>=3次）保留以便重点跟踪
    errorCount: shouldClearErrors ? 0 : base.errorCount,
    lastErrorAt: shouldClearErrors ? undefined : base.lastErrorAt,
  };
  // updatedAt 由 setItem 自动透传到 KVRecord
  await setItem(key, { ...updated, updatedAt: now.toISOString() });
  return updated;
}
