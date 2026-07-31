/**
 * Token 使用记录存储（设计文档 §4.4.7：token 用量监控）
 *
 * 使用 IndexedDB（通过 lib/storage/db 的 KV 接口）持久化 token 使用记录，
 * key 前缀 `token-usage:`，每条记录含时间戳、通道、模型、token 数等。
 *
 * 功能：
 * - recordTokenUsage：记录单次 AI 调用的 token 用量
 * - getTokenUsageSummary：查询今日/本周/总计用量概览
 * - listTokenUsage：查询最近使用记录（用于详情列表）
 * - clearTokenUsage：清空所有记录
 */
import { setItem, delItem, listItemsByPrefix, countByPrefix } from "@/lib/storage/db";

const TOKEN_USAGE_PREFIX = "token-usage:";

export interface TokenUsageRecord {
  id: string;
  timestamp: string; // ISO 8601
  channel: "byok" | "free";
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  type: "chat" | "word-lookup";
  preview: string; // 消息预览（前 60 字符）
}

export interface TokenUsageSummary {
  today: number;
  week: number;
  total: number;
  byChannel: { byok: number; free: number };
  byType: { chat: number; "word-lookup": number };
  records: number;
}

/**
 * 记录单次 AI 调用的 token 用量。
 * 用时间戳 + 随机串做 ID，避免同一毫秒多条记录冲突。
 */
export async function recordTokenUsage(
  record: Omit<TokenUsageRecord, "id" | "timestamp" | "totalTokens">
): Promise<void> {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const full: TokenUsageRecord = {
    ...record,
    id,
    timestamp: new Date().toISOString(),
    totalTokens: record.inputTokens + record.outputTokens,
  };
  try {
    await setItem(`${TOKEN_USAGE_PREFIX}${id}`, full);
  } catch {
    /* 存储失败不影响主流程 */
  }
}

/** 查询 token 用量概览（今日/本周/总计 + 按通道/类型分布） */
export async function getTokenUsageSummary(): Promise<TokenUsageSummary> {
  try {
    const all = await listItemsByPrefix<TokenUsageRecord>(TOKEN_USAGE_PREFIX);
    const now = Date.now();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const weekAgo = now - 7 * 24 * 60 * 60 * 1000;

    let today = 0;
    let week = 0;
    let total = 0;
    let byok = 0;
    let free = 0;
    let chatTokens = 0;
    let lookupTokens = 0;

    for (const r of all) {
      const t = new Date(r.timestamp).getTime();
      total += r.totalTokens;
      if (t >= todayStart.getTime()) today += r.totalTokens;
      if (t >= weekAgo) week += r.totalTokens;
      if (r.channel === "byok") byok += r.totalTokens;
      else free += r.totalTokens;
      if (r.type === "chat") chatTokens += r.totalTokens;
      else lookupTokens += r.totalTokens;
    }

    return {
      today,
      week,
      total,
      byChannel: { byok, free },
      byType: { chat: chatTokens, "word-lookup": lookupTokens },
      records: all.length,
    };
  } catch {
    return {
      today: 0,
      week: 0,
      total: 0,
      byChannel: { byok: 0, free: 0 },
      byType: { chat: 0, "word-lookup": 0 },
      records: 0,
    };
  }
}

/** 查询最近 N 条 token 使用记录（默认 50 条，按时间降序） */
export async function listTokenUsage(limit = 50): Promise<TokenUsageRecord[]> {
  try {
    const all = await listItemsByPrefix<TokenUsageRecord>(TOKEN_USAGE_PREFIX);
    all.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    return limit > 0 ? all.slice(0, limit) : all;
  } catch {
    return [];
  }
}

/** 清空所有 token 使用记录 */
export async function clearTokenUsage(): Promise<void> {
  try {
    const all = await listItemsByPrefix<TokenUsageRecord>(TOKEN_USAGE_PREFIX);
    for (const r of all) {
      await delItem(`${TOKEN_USAGE_PREFIX}${r.id}`);
    }
  } catch {
    /* ignore */
  }
}

/** 统计 token 使用记录总数 */
export async function countTokenUsage(): Promise<number> {
  try {
    return await countByPrefix(TOKEN_USAGE_PREFIX);
  } catch {
    return 0;
  }
}
