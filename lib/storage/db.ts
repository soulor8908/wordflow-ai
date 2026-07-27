import type { Dexie, Table } from "dexie";

export interface KVRecord {
  key: string;
  value: unknown;
  prefix: string;
  updatedAt?: string;
  dueAt?: string;
}

/** 提取 key 前缀（第一个 `:` 之前的内容，含冒号） */
export function extractPrefix(key: string): string {
  const idx = key.indexOf(":");
  return idx === -1 ? key : key.slice(0, idx + 1);
}

let _dbPromise: Promise<Dexie & { kv: Table<KVRecord, string> }> | null = null;

/** 动态 import("dexie") 避免 BroadcastChannel 泄漏到 edge runtime */
export async function getDb() {
  if (!_dbPromise) {
    const { Dexie } = await import("dexie");
    const db = new Dexie("wordflow-db") as Dexie & { kv: Table<KVRecord, string> };
    db.version(2).stores({
      kv: "&key, prefix, updatedAt, dueAt",
    });
    db.kv = db.table("kv");
    _dbPromise = Promise.resolve(db);
  }
  return _dbPromise;
}

/** 提取 value 中的索引字段（updatedAt / dueAt），兼容 string 与 Date（ts-fsrs 的 due 为 Date） */
function extractIndexFields(value: unknown): {
  updatedAt?: string;
  dueAt?: string;
} {
  if (value && typeof value === "object") {
    const v = value as Record<string, unknown>;
    const result: { updatedAt?: string; dueAt?: string } = {};
    if (typeof v.updatedAt === "string") result.updatedAt = v.updatedAt;
    else if (v.updatedAt instanceof Date)
      result.updatedAt = v.updatedAt.toISOString();
    if (typeof v.due === "string") result.dueAt = v.due;
    else if (v.due instanceof Date) result.dueAt = v.due.toISOString();
    return result;
  }
  return {};
}

export async function getItem<T = unknown>(key: string): Promise<T | undefined> {
  const db = await getDb();
  const record = await db.kv.get(key);
  return record?.value as T | undefined;
}

export async function setItem(key: string, value: unknown): Promise<void> {
  const db = await getDb();
  const { updatedAt, dueAt } = extractIndexFields(value);
  await db.kv.put({
    key,
    value,
    prefix: extractPrefix(key),
    updatedAt,
    dueAt,
  });
}

export async function delItem(key: string): Promise<void> {
  const db = await getDb();
  await db.kv.delete(key);
}

/** 走 dueAt 索引查询到期卡片数（O(due) 而非 O(n)），仅统计 card: 前缀 */
export async function countDueCards(now: string): Promise<number> {
  const db = await getDb();
  // 先按 prefix=card: 过滤，再按 dueAt <= now 过滤
  const cards = await db.kv
    .where("prefix")
    .equals("card:")
    .and((record) => record.dueAt !== undefined && record.dueAt <= now)
    .count();
  return cards;
}

export async function listItemsByPrefix<T = unknown>(
  prefix: string,
  limit?: number
): Promise<T[]> {
  const db = await getDb();
  let collection = db.kv.where("prefix").equals(prefix);
  if (limit !== undefined) {
    collection = collection.limit(limit);
  }
  const records = await collection.toArray();
  return records.map((r) => r.value as T);
}

export async function countByPrefix(prefix: string): Promise<number> {
  const db = await getDb();
  return db.kv.where("prefix").equals(prefix).count();
}

/** 测试用：清空数据库 */
export async function resetDbForTest(): Promise<void> {
  const db = await getDb();
  await db.kv.clear();
}
