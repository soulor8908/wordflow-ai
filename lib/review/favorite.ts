/**
 * 收藏入队（设计文档 §2.1 核心闭环：收藏即创建 FSRS 卡片，次日自动入复习队列）
 *
 * 设计要点：
 * - 收藏 = 创建 New 状态 FSRS 卡片，存于 Dexie card:{word}
 * - 大小写无关：key 统一小写，避免 "Abandon" 与 "abandon" 重复
 * - 幂等：重复收藏覆盖写入（以 key 为主键）
 * - updatedAt 写入 value，供增量同步 LWW 使用
 */
import { getItem, setItem, delItem } from "@/lib/storage/db";
import { createNewCard, type WordCard } from "@/lib/review/fsrs-scheduler";

function cardKey(word: string): string {
  return `card:${word.toLowerCase()}`;
}

/** 收藏单词：创建 New 状态 FSRS 卡片入队，返回写入的卡片 */
export async function favoriteWord(
  word: string,
  source = "favorite"
): Promise<WordCard & { updatedAt: string }> {
  const now = new Date();
  const card = createNewCard(now, word.toLowerCase(), source);
  const updatedAt = now.toISOString();
  const record = { ...card, updatedAt };
  await setItem(cardKey(word), record);
  return record;
}

/** 取消收藏：删除卡片（设计文档 §4.3：删除写 tombstone，MVP 阶段直接删，同步层后续补 tombstone） */
export async function unfavoriteWord(word: string): Promise<void> {
  await delItem(cardKey(word));
}

/** 是否已收藏 */
export async function isFavorited(word: string): Promise<boolean> {
  const card = await getItem<WordCard>(cardKey(word));
  return card !== undefined;
}

/** 读取已收藏的卡片（未收藏返回 undefined） */
export async function getFavoriteCard(
  word: string
): Promise<(WordCard & { updatedAt?: string }) | undefined> {
  return getItem<WordCard & { updatedAt?: string }>(cardKey(word));
}
