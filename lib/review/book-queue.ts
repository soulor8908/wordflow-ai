/**
 * 词书新词轨（设计文档 §2.1 两轨合并 + §3.2 C 词书页）
 *
 * 词书游标推进 + 每日新词配额：
 * - 进度存储于 Dexie book:{id}（cursor / dailyNew / startedAt / lastAdvancedDate）
 * - 每日仅发放一次新词（lastAdvancedDate === today → 当日已发放）
 * - 已有卡片的词（如收藏过）被跳过，cursor 仍推进，避免每日重复扫描
 *
 * 切片化加载（§4.4 性能优化）：
 * - 词书分为 index.json + chunk-NNN.json（每 100 词/切片）
 * - loadBookMeta 只拉 index.json（< 1KB），获取元数据
 * - getTodayNewWords 只拉 cursor 所在的 1-2 个切片（~10KB），不全量加载
 * - 兼容旧的扁平 {id}.json 格式
 */
import { getItem, setItem, listItemsByPrefix } from "@/lib/storage/db";
import {
  wordBookSchema,
  slicedBookIndexSchema,
  type WordBook,
  type WordEntry,
} from "@/lib/content/word-book-schema";
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

// ───────────────────────── 切片化加载 ─────────────────────────

/** 词书元数据（扁平或切片的公共字段） */
export interface BookMeta {
  id: string;
  name: string;
  description: string;
  dailyNew: number;
  wordCount: number;
  sliced: boolean;
  /** 切片化时的 chunk 信息 */
  chunkSize?: number;
  chunkCount?: number;
  chunks?: string[];
}

const bookMetaCache = new Map<string, BookMeta>();
const chunkCache = new Map<string, WordEntry[]>();

/**
 * 加载词书元数据（优先切片化 index.json，回退扁平 {id}.json）。
 * 只拉取元数据，不加载词条，适用于 UI 展示词书列表。
 */
export async function loadBookMeta(bookId: string): Promise<BookMeta> {
  if (bookMetaCache.has(bookId)) return bookMetaCache.get(bookId)!;

  // 1. 尝试切片化格式：books/{id}/index.json
  const slicedRes = await fetch(`/book-data/${bookId}/index.json`, {
    cache: "force-cache",
  });
  if (slicedRes.ok) {
    const raw = await slicedRes.json();
    const parsed = slicedBookIndexSchema.safeParse(raw);
    if (parsed.success) {
      const meta: BookMeta = {
        id: parsed.data.id,
        name: parsed.data.name,
        description: parsed.data.description,
        dailyNew: parsed.data.dailyNew,
        wordCount: parsed.data.wordCount,
        sliced: true,
        chunkSize: parsed.data.chunkSize,
        chunkCount: parsed.data.chunkCount,
        chunks: parsed.data.chunks,
      };
      bookMetaCache.set(bookId, meta);
      return meta;
    }
  }

  // 2. 回退扁平格式：books/{id}.json（兼容旧词书）
  const flatRes = await fetch(`/book-data/${bookId}.json`, { cache: "force-cache" });
  if (!flatRes.ok) throw new Error(`词书不存在: ${bookId}`);
  const raw = await flatRes.json();
  const parsed = wordBookSchema.safeParse(raw);
  if (!parsed.success) throw new Error(`词书格式无效: ${bookId}`);
  const meta: BookMeta = {
    id: parsed.data.id,
    name: parsed.data.name,
    description: parsed.data.description,
    dailyNew: parsed.data.dailyNew,
    wordCount: parsed.data.words.length,
    sliced: false,
  };
  bookMetaCache.set(bookId, meta);
  // 扁平格式也缓存词条
  chunkCache.set(`${bookId}:flat`, parsed.data.words);
  return meta;
}

/**
 * 加载切片文件（带内存缓存）。
 */
async function loadChunk(
  bookId: string,
  chunkFile: string
): Promise<WordEntry[]> {
  const cacheKey = `${bookId}:${chunkFile}`;
  if (chunkCache.has(cacheKey)) return chunkCache.get(cacheKey)!;

  const res = await fetch(`/book-data/${bookId}/${chunkFile}`, {
    cache: "force-cache",
  });
  if (!res.ok) throw new Error(`切片加载失败: ${bookId}/${chunkFile}`);
  const words = (await res.json()) as WordEntry[];
  chunkCache.set(cacheKey, words);
  return words;
}

/**
 * 获取词书中 [offset, offset+limit) 范围的词条（按需加载切片）。
 *
 * 切片化词书只拉取覆盖该范围的 1-2 个切片（~10-20KB），而非全量加载。
 */
export async function getBookWords(
  bookId: string,
  offset: number,
  limit: number
): Promise<WordEntry[]> {
  const meta = await loadBookMeta(bookId);

  if (!meta.sliced) {
    // 扁平格式：从缓存取
    const all = chunkCache.get(`${bookId}:flat`) ?? [];
    return all.slice(offset, offset + limit);
  }

  // 切片化：计算需要哪些切片
  const chunkSize = meta.chunkSize!;
  const startChunk = Math.floor(offset / chunkSize);
  const endChunk = Math.floor((offset + limit - 1) / chunkSize);

  const result: WordEntry[] = [];
  for (let c = startChunk; c <= endChunk; c++) {
    if (c >= meta.chunks!.length) break;
    const chunkWords = await loadChunk(bookId, meta.chunks![c]);
    const chunkOffset = c * chunkSize;
    const localStart = Math.max(0, offset - chunkOffset);
    const localEnd = Math.min(chunkWords.length, offset + limit - chunkOffset);
    result.push(...chunkWords.slice(localStart, localEnd));
  }
  return result;
}

/** 兼容旧接口：加载完整词书（切片化时聚合所有 chunk） */
export async function loadBook(bookId: string): Promise<WordBook> {
  const meta = await loadBookMeta(bookId);
  if (!meta.sliced) {
    const flatRes = await fetch(`/book-data/${bookId}.json`, {
      cache: "force-cache",
    });
    if (!flatRes.ok) throw new Error(`词书不存在: ${bookId}`);
    return wordBookSchema.parse(await flatRes.json());
  }
  // 切片化：聚合所有 chunk（慎用，大词书会拉全量数据）
  const allWords: WordEntry[] = [];
  for (const chunkFile of meta.chunks!) {
    allWords.push(...(await loadChunk(bookId, chunkFile)));
  }
  return {
    id: meta.id,
    name: meta.name,
    description: meta.description,
    dailyNew: meta.dailyNew,
    sources: [
      { level: "T0", name: "官方大纲" },
      { level: "T2", name: "开源词表" },
    ],
    words: allWords,
  };
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
 * 幂等性（三重保障）：
 * 1. in-flight Promise 去重：同一时刻多次调用共享同一个 Promise（防 StrictMode 竞态）
 * 2. 今日候选缓存：已生成的候选词落 IndexedDB，同一天直接返回
 * 3. lastAdvancedDate：当日已推进过 cursor 则不再发放
 *
 * 切片化优化：只加载 cursor 附近的 1-2 个切片，不全量加载词书。
 *
 * @returns 新词候选列表（当日已发放或词书耗尽时为空数组）
 */

// in-flight Promise 去重：防止 React StrictMode 双重调用导致 cursor 重复推进
const inflightNewWords = new Map<string, Promise<NewWordCandidate[]>>();

export async function getTodayNewWords(
  bookId: string
): Promise<NewWordCandidate[]> {
  // 如果已有进行中的调用，直接复用同一个 Promise
  const inflight = inflightNewWords.get(bookId);
  if (inflight) return inflight;

  const promise = doGetTodayNewWords(bookId).finally(() => {
    inflightNewWords.delete(bookId);
  });
  inflightNewWords.set(bookId, promise);
  return promise;
}

async function doGetTodayNewWords(
  bookId: string
): Promise<NewWordCandidate[]> {
  const meta = await loadBookMeta(bookId);
  const now = new Date();
  const today = todayLocalDate(now);

  // 幂等检查：今日已缓存的候选词直接返回（防 StrictMode 双重调用 + 页面刷新）
  const todayCacheKey = `book:${bookId}:today-candidates`;
  const cached = await getItem<{
    date: string;
    candidates: NewWordCandidate[];
  }>(todayCacheKey);
  if (cached && cached.date === today) {
    return cached.candidates;
  }

  const existing = await getBookProgress(bookId);
  const cursor = existing?.cursor ?? 0;
  const dailyNew = existing?.dailyNew ?? meta.dailyNew;
  const lastAdvancedDate = existing?.lastAdvancedDate;

  // 今日已推进过 cursor → 缓存空数组，不再重复发放
  if (lastAdvancedDate === today) {
    await setItem(todayCacheKey, { date: today, candidates: [] });
    return [];
  }

  const existingCardWords = await listExistingCardWords();

  // 切片化优化：只拉 cursor 到 cursor+dailyNew 范围的切片
  const fetchLimit = Math.max(
    dailyNew * 2,
    meta.sliced ? meta.chunkSize! : dailyNew * 3
  );
  const words = await getBookWords(bookId, cursor, fetchLimit);
  const bookWords = words.map((w) => w.word);

  const result = pickNewWordsFromBook({
    bookId,
    bookWords,
    cursor: 0,
    dailyNew,
    existingCardWords,
    today,
    lastAdvancedDate, // 已确认 !== today
  });

  // 推进 cursor + 持久化
  const advancedBy = result.nextCursor;
  const nextCursor = cursor + advancedBy;
  if (nextCursor !== cursor) {
    const progress: BookProgress = {
      bookId,
      cursor: nextCursor,
      dailyNew,
      startedAt: existing?.startedAt ?? now.toISOString(),
      lastAdvancedDate: today,
      updatedAt: now.toISOString(),
    };
    await saveBookProgress(progress);
  }

  // 缓存今日候选词（即使为空也缓存，避免重复计算）
  await setItem(todayCacheKey, {
    date: today,
    candidates: result.candidates,
  });

  return result.candidates;
}

/**
 * 查询今日新词候选数量（不推进 cursor，不消耗配额）。
 *
 * 用于首页展示"今日有 N 个新词待学"，确保即使用户还没进复习页，
 * 也能知道今天有词可学，形成学习闭环引导。
 */
export async function peekTodayNewWordCount(
  bookId: string
): Promise<number> {
  const today = todayLocalDate();
  const todayCacheKey = `book:${bookId}:today-candidates`;
  const cached = await getItem<{
    date: string;
    candidates: NewWordCandidate[];
  }>(todayCacheKey);

  if (cached && cached.date === today) {
    return cached.candidates.length;
  }

  // 今日还没生成候选词 → 检查是否需要生成
  const existing = await getBookProgress(bookId);
  const lastAdvancedDate = existing?.lastAdvancedDate;

  // 今日已推进过 cursor → 候选词已发放过（0 个待学）
  if (lastAdvancedDate === today) return 0;

  // 今日还没推进 cursor → 有 dailyNew 个新词待学
  const meta = await loadBookMeta(bookId);
  const dailyNew = existing?.dailyNew ?? meta.dailyNew;
  const cursor = existing?.cursor ?? 0;

  // 词书已学完
  if (cursor >= meta.wordCount) return 0;

  return dailyNew;
}

/**
 * 加载词书全部词条（用于刷题模式）。
 *
 * 刷题模式不受 FSRS 调度限制，用户可主动遍历整本词书。
 * 分批加载避免单次请求过大，每批 500 词。
 *
 * @param bookId 词书 ID
 * @param onProgress 可选进度回调（已加载数 / 总数）
 * @returns 词书全部词条的 word 字段数组
 */
export async function loadAllBookWords(
  bookId: string,
  onProgress?: (loaded: number, total: number) => void
): Promise<string[]> {
  const meta = await loadBookMeta(bookId);
  const all: string[] = [];
  const batchSize = 500;
  for (let offset = 0; offset < meta.wordCount; offset += batchSize) {
    const limit = Math.min(batchSize, meta.wordCount - offset);
    const words = await getBookWords(bookId, offset, limit);
    all.push(...words.map((w) => w.word));
    onProgress?.(all.length, meta.wordCount);
  }
  return all;
}

/**
 * 显式推进词书 cursor（用于刷题模式评分后）。
 *
 * 刷题模式评分会落库并影响 FSRS 进度，同时推进 cursor
 * 以确保已刷过的词不会在 FSRS 模式的新词轨中再次出现。
 *
 * @param bookId 词书 ID
 * @param newCursor 新的 cursor 值（通常是当前已刷到的最大位置）
 */
export async function advanceCursor(
  bookId: string,
  newCursor: number
): Promise<void> {
  const now = new Date();
  const today = todayLocalDate(now);
  const existing = await getBookProgress(bookId);
  const meta = await loadBookMeta(bookId);
  const progress: BookProgress = {
    bookId,
    cursor: Math.max(newCursor, existing?.cursor ?? 0),
    dailyNew: existing?.dailyNew ?? meta.dailyNew,
    startedAt: existing?.startedAt ?? now.toISOString(),
    lastAdvancedDate: today,
    updatedAt: now.toISOString(),
  };
  await saveBookProgress(progress);
}

/**
 * 设置词书每日新词量（用户在 /me 页或 AI 聊天中调整）。
 *
 * 写入 BookProgress.dailyNew，仅影响后续新词发放数量，不影响已入队卡片。
 * 范围限制：1-100，避免极端值（0 会让词书永远不发放新词；过大会一次性塞爆复习队列）。
 *
 * @returns 更新后的 dailyNew；若未选词书则返回 null
 */
export async function setBookDailyNew(
  bookId: string,
  dailyNew: number
): Promise<number | null> {
  const clamped = Math.max(1, Math.min(100, Math.floor(dailyNew)));
  const now = new Date();
  const today = todayLocalDate(now);
  const existing = await getBookProgress(bookId);
  const progress: BookProgress = {
    bookId,
    cursor: existing?.cursor ?? 0,
    dailyNew: clamped,
    startedAt: existing?.startedAt ?? now.toISOString(),
    lastAdvancedDate: existing?.lastAdvancedDate ?? today,
    updatedAt: now.toISOString(),
  };
  await saveBookProgress(progress);
  return clamped;
}
