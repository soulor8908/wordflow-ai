/**
 * 当前词库设置持久化（设计文档 §3.2 C：词书页）
 *
 * 用户选定的"当前词书"存储于 Dexie kv 表，key = settings:active-book
 * 选择/切换词书时写入；复习页与首页读取此值决定新词轨来源
 *
 * 切换词书时同步清空复习会话缓存（localStorage 中的 fsrs/drill 快照），
 * 避免回到 /review 时恢复到旧词书的队列/位置。
 */
import { getItem, setItem } from "@/lib/storage/db";
import { clearReviewSession } from "@/lib/review/review-session-cache";

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

/** 设置/切换当前词书；切换时清空复习缓存，避免恢复旧词书队列 */
export async function setActiveBook(bookId: string): Promise<void> {
  await setItem(ACTIVE_BOOK_KEY, {
    bookId,
    selectedAt: new Date().toISOString(),
  });
  // 清空复习会话快照（fsrs queue / drill words / index 等）
  clearReviewSession();
}

/** 是否已经选过词书（用于首次访问引导判断） */
export async function hasSelectedBook(): Promise<boolean> {
  const v = await getItem<ActiveBook>(ACTIVE_BOOK_KEY);
  return v !== undefined;
}
