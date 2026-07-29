/**
 * 客户端 AI 单词查询工具
 *
 * 当内置词典搜不到时，调用 /api/ai/word-lookup 获取 AI 生成的词条，
 * 自动保存到用户词库（IndexedDB）。
 */
import type { DictEntry } from "@/lib/dict/dict-loader";
import { saveUserWord } from "@/lib/dict/user-words";
import { getAiConfig } from "@/lib/ai/ai-config";

const CLIENT_ID_KEY = "wordflow:ai-client-id";

function getOrCreateClientId(): string {
  if (typeof window === "undefined") return "";
  let id = window.localStorage.getItem(CLIENT_ID_KEY);
  if (!id) {
    // 使用 crypto.randomUUID 如果可用，否则用时间戳
    id = typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    window.localStorage.setItem(CLIENT_ID_KEY, id);
  }
  return id;
}

export interface AiLookupResult {
  ok: boolean;
  entry?: DictEntry;
  error?: string;
  quota?: { used: number; total: number; remaining: number };
  savedToLib?: boolean;
}

/**
 * 调用 AI 查询单词，成功后自动保存到用户词库。
 */
export async function aiLookupWord(word: string): Promise<AiLookupResult> {
  try {
    const config = await getAiConfig().catch(() => null);
    const payload: Record<string, unknown> = { word };
    if (config) {
      payload.provider = config.provider;
      payload.apiKey = config.apiKey;
      payload.baseURL = config.baseURL;
      payload.model = config.model;
    } else {
      payload.clientId = getOrCreateClientId();
    }

    const res = await fetch("/api/ai/word-lookup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await res.json();

    if (!data.ok || !data.entry) {
      return {
        ok: false,
        error: data.error || "AI 查询失败",
        quota: data.quota,
      };
    }

    // 自动保存到用户词库
    let savedToLib = false;
    try {
      await saveUserWord(data.entry, "ai-search");
      savedToLib = true;
    } catch {
      // 保存失败不影响返回
    }

    return {
      ok: true,
      entry: data.entry,
      quota: data.quota,
      savedToLib,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "AI 查询网络错误",
    };
  }
}
