/**
 * 当前词库设置持久化（设计文档 §3.2 C：词书页）
 *
 * 用户选定的"当前词书"存储于 Dexie kv 表，key = settings:active-book
 * 选择/切换词书时写入；复习页与首页读取此值决定新词轨来源
 *
 * 切换词书时同步清空多级缓存，避免回到 /review 时恢复到旧词书的队列/位置：
 * 1. localStorage 复习会话快照（fsrs/drill queue + index）
 * 2. 模块级内存缓存（词书 meta + 切片词条）
 * 3. 旧词书当日候选词缓存（Dexie book:{oldId}:today-candidates）
 */
import { getItem, setItem, delItem } from "@/lib/storage/db";
import { clearReviewSession } from "@/lib/review/review-session-cache";
import { clearBookMemoryCache } from "@/lib/review/book-queue";

const ACTIVE_BOOK_KEY = "settings:active-book";

export interface ActiveBook {
  bookId: string;
  selectedAt: string;
}

/** 读取用户选定的当前词书（未选返回 null） */
export async function getActiveBook(): Promise<ActiveBook | null> {
  const v = await getItem<ActiveBook>(ACTIVE_BOOK_KEY);
  return v ?? null;
}

/**
 * 设置/切换当前词书；切换时清空多级缓存，避免恢复旧词书队列。
 *
 * 清理顺序：先读旧 bookId → 写新 bookId → 清理旧缓存。
 * 清理项：复习会话快照、内存缓存、旧词书当日候选词。
 */
export async function setActiveBook(bookId: string): Promise<void> {
  // 读取旧词书 ID，用于清理其当日候选词缓存
  const previous = await getItem<ActiveBook>(ACTIVE_BOOK_KEY);
  const previousBookId = previous?.bookId;

  await setItem(ACTIVE_BOOK_KEY, {
    bookId,
    selectedAt: new Date().toISOString(),
  });

  // 1. 清空复习会话快照（localStorage fsrs/drill queue + index）
  clearReviewSession();

  // 2. 清空模块级内存缓存（词书 meta + 切片词条）
  clearBookMemoryCache();

  // 3. 清理旧词书的当日候选词缓存，避免切回时恢复旧队列
  if (previousBookId && previousBookId !== bookId) {
    await delItem(`book:${previousBookId}:today-candidates`).catch(() => {
      /* 忽略清理失败，不影响主流程 */
    });
  }
}

/** 是否已经选过词书（用于首次访问引导判断） */
export async function hasSelectedBook(): Promise<boolean> {
  const v = await getItem<ActiveBook>(ACTIVE_BOOK_KEY);
  return v !== undefined;
}
