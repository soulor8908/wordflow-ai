/**
 * AI 配置持久化（BYOK - Bring Your Own Key）
 *
 * 用户在"我的"页配置 AI provider + apiKey，存储于 Dexie kv 表
 * key = settings:ai-config
 *
 * 安全说明：
 * - 仅存储于本地 IndexedDB，不上传服务器
 * -apiKey 以明文存储（本地优先架构，无服务端加密）
 * - 用户可在"我的"页随时清除
 */
import { getItem, setItem, delItem } from "@/lib/storage/db";
import type { ProviderName } from "@/lib/ai/provider";

const AI_CONFIG_KEY = "settings:ai-config";

export interface AiConfig {
  provider: ProviderName;
  apiKey: string;
  baseURL?: string;
  model?: string;
  configuredAt: string;
}

/** 读取用户配置的 AI 凭据 */
export async function getAiConfig(): Promise<AiConfig | null> {
  const v = await getItem<AiConfig>(AI_CONFIG_KEY);
  return v ?? null;
}

/** 保存 AI 凭据 */
export async function setAiConfig(
  config: Omit<AiConfig, "configuredAt">
): Promise<void> {
  await setItem(AI_CONFIG_KEY, {
    ...config,
    configuredAt: new Date().toISOString(),
  });
}

/** 清除 AI 凭据 */
export async function clearAiConfig(): Promise<void> {
  await delItem(AI_CONFIG_KEY);
}

/** 是否已配置 AI（用于 UI 状态判断） */
export async function hasAiConfigured(): Promise<boolean> {
  const v = await getItem<AiConfig>(AI_CONFIG_KEY);
  return v !== undefined && !!v.apiKey;
}
