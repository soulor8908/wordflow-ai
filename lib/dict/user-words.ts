/**
 * 用户词库存储（AI 搜索结果自动入库）
 *
 * 设计：
 * - 使用 IndexedDB（通过 db.ts 的 KV 抽象）存储 AI 生成的词条
 * - key 格式：userword:{lowercase_word}
 * - 大小写无关去重
 * - 支持列出全部、按前缀查询、删除
 *
 * 与 card:（FSRS 复习卡片）的区别：
 * - userword: 存储 AI 生成的词条数据（DictEntry 格式）
 * - card: 存储 FSRS 复习调度状态
 * - 两者独立，收藏入队时从 userword 读取释义展示
 */
import { getItem, setItem, delItem, listItemsByPrefix, countByPrefix } from "@/lib/storage/db";
import type { DictEntry } from "@/lib/dict/dict-loader";

/** 用户词库存储 key（小写，大小写无关去重） */
export function userWordKey(word: string): string {
  return `userword:${word.toLowerCase()}`;
}

/** 用户词库条目（DictEntry + 入库元信息） */
export interface UserWordEntry extends DictEntry {
  /** 入库时间 ISO */
  savedAt: string;
  /** 来源：ai-search / manual */
  source: string;
}

/** 保存 AI 生成的词条到用户词库 */
export async function saveUserWord(
  entry: DictEntry,
  source = "ai-search"
): Promise<UserWordEntry> {
  const record: UserWordEntry = {
    ...entry,
    word: entry.word, // 保留原始大小写
    savedAt: new Date().toISOString(),
    source,
  };
  await setItem(userWordKey(entry.word), record);
  return record;
}

/** 从用户词库读取词条 */
export async function getUserWord(word: string): Promise<UserWordEntry | undefined> {
  return getItem<UserWordEntry>(userWordKey(word));
}

/** 删除用户词库中的词条 */
export async function deleteUserWord(word: string): Promise<void> {
  await delItem(userWordKey(word));
}

/** 列出用户词库所有词条（按入库时间倒序） */
export async function listUserWords(): Promise<UserWordEntry[]> {
  const words = await listItemsByPrefix<UserWordEntry>("userword:");
  return words.sort((a, b) => (b.savedAt ?? "").localeCompare(a.savedAt ?? ""));
}

/** 用户词库词条数量 */
export async function countUserWords(): Promise<number> {
  return countByPrefix("userword:");
}

/**
 * 查找词条：先查用户词库，再查内置词典。
 * 用于词条页统一入口，AI 搜索过的词直接从本地读取。
 */
export async function findEntryWithUserLib(word: string): Promise<DictEntry | undefined> {
  // 1. 先查用户词库（AI 生成的词）
  const userEntry = await getUserWord(word);
  if (userEntry) return userEntry;

  // 2. 再查内置词典
  const { findEntry } = await import("@/lib/dict/dict-loader");
  return findEntry(word);
}
