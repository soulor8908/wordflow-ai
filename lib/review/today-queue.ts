/**
 * 今日复习队列合并（设计文档 §2.1 核心闭环 + §3.2 B 复习页）
 *
 * 两轨汇入同一个 FSRS 复习队列，去重合并（同一单词只有一张卡，来源打标签）：
 * - 到期卡片轨：card: 前缀中 due <= now 的卡片（listDueCards 走 dueAt 索引，O(due)）
 * - 新词轨：词书游标推进，受 dailyNewLimit 配额约束
 *
 * 顺序约定：到期卡片在前（先复习逾期），新词在后（再学新词）。
 * 去重：新词与到期卡片同词（大小写无关）→ 排除新词；新词内部重复 → 仅保留首个。
 */
import { getDb } from "@/lib/storage/db";
import type { WordCard } from "@/lib/review/fsrs-scheduler";

/** 新词候选（来自词书游标） */
export interface NewWordCandidate {
  word: string;
  /** 来源标签，如 "book:kaoyan" / "favorite" */
  source: string;
}

/** 到期卡片队列项 */
export interface DueQueueItem {
  type: "due";
  card: WordCard;
}

/** 新词队列项（首次复习时由调用方创建 FSRS 卡片） */
export interface NewQueueItem {
  type: "new";
  word: string;
  source: string;
}

export type TodayQueueItem = DueQueueItem | NewQueueItem;

export interface BuildTodayQueueInput {
  /** 已到期卡片（due <= now），由 listDueCards 提供 */
  dueCards: WordCard[];
  /** 新词候选（词书游标推进结果，调用方应已尽量排除已有卡片的词） */
  newWordCandidates: NewWordCandidate[];
  /** 每日新词配额上限 */
  dailyNewLimit: number;
}

/**
 * 纯函数：合并到期卡片 + 新词，去重并排序。
 *
 * @returns 队列项数组（到期卡片在前，按 due 升序；新词在后，受 dailyNewLimit 截断）
 */
export function buildTodayQueue(
  input: BuildTodayQueueInput
): TodayQueueItem[] {
  const { dueCards, newWordCandidates, dailyNewLimit } = input;

  // 1. 到期卡片按 due 升序（最逾期的最先复习）
  const sortedDue = [...dueCards].sort((a, b) => {
    return new Date(a.due).getTime() - new Date(b.due).getTime();
  });

  // 2. 收集到期卡片词（小写），用于新词去重
  const dueWords = new Set<string>();
  for (const c of sortedDue) dueWords.add(c.word.toLowerCase());

  // 3. 挑选新词：去重（vs 到期卡片 + 内部）+ 截断到 dailyNewLimit
  const seen = new Set<string>();
  const newItems: NewQueueItem[] = [];
  for (const candidate of newWordCandidates) {
    if (newItems.length >= dailyNewLimit) break;
    const w = candidate.word.toLowerCase();
    if (dueWords.has(w)) continue; // 已有到期卡片，不重复入队
    if (seen.has(w)) continue; // 新词内部去重
    seen.add(w);
    newItems.push({
      type: "new",
      word: candidate.word,
      source: candidate.source,
    });
  }

  // 4. 合并：到期在前，新词在后
  const items: TodayQueueItem[] = [
    ...sortedDue.map((card) => ({ type: "due" as const, card })),
    ...newItems,
  ];
  return items;
}

/**
 * 查询全部到期卡片（card: 前缀且 due <= now），走 dueAt 索引（O(due) 而非 O(n)）。
 *
 * 对齐设计文档 §4.4 性能优化：500 张卡片场景下仅查到期卡片，避免全量扫描。
 */
export async function listDueCards(now: Date): Promise<WordCard[]> {
  const db = await getDb();
  const nowIso = now.toISOString();
  const records = await db.kv
    .where("prefix")
    .equals("card:")
    .and((r) => r.dueAt !== undefined && r.dueAt <= nowIso)
    .toArray();
  // 已掌握词（verification === "mastered"）不再进入复习队列，
  // 即使 30 天回访到期也不打扰（用户已明确表示学会）
  return records
    .map((r) => r.value as WordCard)
    .filter((c) => c.verification !== "mastered");
}
