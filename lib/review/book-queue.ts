/**
 * 词书新词轨（设计文档 §2.1 两轨合并 + §3.2 C 词书页）
 *
 * 词书游标推进 + 每日新词配额：
 * - 进度存储于 Dexie book:{id}（cursor / dailyNew / startedAt / lastAdvancedDate）
 * - 每日仅发放一次新词（lastAdvancedDate === today → 当日已发放）
 * - 已有卡片的词（如收藏过）被跳过，cursor 仍推进，避免每日重复扫描
 *
 * 注：词书系统完整 UI（选书/自定义/滑杆预估）属 Week 4；本模块提供新词轨数据能力。
 */
import { getItem, setItem, listItemsByPrefix } from "@/lib/storage/db";
import type { WordBook } from "@/lib/content/word-book-schema";
import type { NewWordCandidate } from "@/lib/review/today-queue";
import type { WordCard } from "@/lib/review/fsrs-scheduler";

export interface BookProgress {
  bookId: string;
  cursor: number;
  dailyNew: number;
  startedAt: string;
  /** YYYY-MM-DD（本地时区），用于每日新词配额去重 */
  lastAdvancedDate: string;
  updatedAt: string;
}

export interface PickNewWordsInput {
  bookId?: string;
  bookWords: string[];
  cursor: number;
  dailyNew: number;
  /** 已有卡片的词（小写），用于排除重复入队 */
  existingCardWords: Set<string>;
  /** 今日 YYYY-MM-DD（本地时区） */
  today: string;
  /** 上次发放新词的日期 YYYY-MM-DD */
  lastAdvancedDate?: string;
}

export interface PickNewWordsResult {
  candidates: NewWordCandidate[];
  nextCursor: number;
  nextLastAdvancedDate: string;
  /** true 表示当日已发放过（candidates 为空且 cursor 未变） */
  alreadyIssuedToday: boolean;
}

/**
 * 纯函数：从词书游标位置挑选当日新词候选。
 *
 * - lastAdvancedDate === today → 当日已发放，返回空，cursor 不变
 * - 词书耗尽（cursor >= length）→ 返回空，但标记 lastAdvancedDate=today 避免每日重复扫描
 * - 否则从 cursor 扫描，跳过已有卡片的词，凑够 dailyNew 个候选，cursor 推进到扫描末尾
 */
export function pickNewWordsFromBook(
  input: PickNewWordsInput
): PickNewWordsResult {
  const {
    bookId,
    bookWords,
    cursor,
    dailyNew,
    existingCardWords,
    today,
    lastAdvancedDate,
  } = input;
  const source = bookId ? `book:${bookId}` : "book:unknown";

  if (lastAdvancedDate === today) {
    return {
      candidates: [],
      nextCursor: cursor,
      nextLastAdvancedDate: today,
      alreadyIssuedToday: true,
    };
  }

  if (cursor >= bookWords.length) {
    return {
      candidates: [],
      nextCursor: cursor,
      nextLastAdvancedDate: today,
      alreadyIssuedToday: false,
    };
  }

  const candidates: NewWordCandidate[] = [];
  let i = cursor;
  while (i < bookWords.length && candidates.length < dailyNew) {
    const w = bookWords[i];
    if (!existingCardWords.has(w.toLowerCase())) {
      candidates.push({ word: w, source });
    }
    i++;
  }

  return {
    candidates,
    nextCursor: i,
    nextLastAdvancedDate: today,
    alreadyIssuedToday: false,
  };
}

/** 本地时区 YYYY-MM-DD */
export function todayLocalDate(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** 加载编译后的词书 JSON（public/books/{id}.json） */
export async function loadBook(bookId: string): Promise<WordBook> {
  const res = await fetch(`/books/${bookId}.json`, { cache: "force-cache" });
  if (!res.ok) throw new Error(`词书不存在: ${bookId}`);
  return res.json() as Promise<WordBook>;
}

export async function getBookProgress(
  bookId: string
): Promise<BookProgress | undefined> {
  return getItem<BookProgress>(`book:${bookId}`);
}

async function saveBookProgress(progress: BookProgress): Promise<void> {
  await setItem(`book:${progress.bookId}`, progress);
}

/** 收集所有已有卡片的词（小写），用于新词去重 */
async function listExistingCardWords(): Promise<Set<string>> {
  const cards = await listItemsByPrefix<WordCard>("card:");
  return new Set(cards.map((c) => c.word.toLowerCase()));
}

/**
 * I/O：获取今日新词候选并推进游标（每日仅一次）。
 *
 * @returns 新词候选列表（当日已发放或词书耗尽时为空数组）
 */
export async function getTodayNewWords(
  bookId: string
): Promise<NewWordCandidate[]> {
  const book = await loadBook(bookId);
  const now = new Date();
  const today = todayLocalDate(now);

  const existing = await getBookProgress(bookId);
  const cursor = existing?.cursor ?? 0;
  const dailyNew = existing?.dailyNew ?? book.dailyNew;
  const lastAdvancedDate = existing?.lastAdvancedDate;

  const existingCardWords = await listExistingCardWords();

  const result = pickNewWordsFromBook({
    bookId,
    bookWords: book.words.map((w) => w.word),
    cursor,
    dailyNew,
    existingCardWords,
    today,
    lastAdvancedDate,
  });

  // 仅在确实推进时写回（避免无谓写入）
  const shouldPersist =
    !result.alreadyIssuedToday &&
    (result.nextCursor !== cursor ||
      result.nextLastAdvancedDate !== lastAdvancedDate);

  if (shouldPersist) {
    const progress: BookProgress = {
      bookId,
      cursor: result.nextCursor,
      dailyNew,
      startedAt: existing?.startedAt ?? now.toISOString(),
      lastAdvancedDate: result.nextLastAdvancedDate,
      updatedAt: now.toISOString(),
    };
    await saveBookProgress(progress);
  }

  return result.candidates;
}
