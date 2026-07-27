/**
 * 当前词库设置持久化（设计文档 §3.2 C：词书页）
 *
 * 用户选定的"当前词书"存储于 Dexie kv 表，key = settings:active-book
 * 选择/切换词书时写入；复习页与首页读取此值决定新词轨来源
 */
import { getItem, setItem } from "@/lib/storage/db";

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

/** 设置/切换当前词书 */
export async function setActiveBook(bookId: string): Promise<void> {
  await setItem(ACTIVE_BOOK_KEY, {
    bookId,
    selectedAt: new Date().toISOString(),
  });
}

/** 是否已经选过词书（用于首次访问引导判断） */
export async function hasSelectedBook(): Promise<boolean> {
  const v = await getItem<ActiveBook>(ACTIVE_BOOK_KEY);
  return v !== undefined;
}
