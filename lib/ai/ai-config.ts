/**
 * AI 配置持久化（BYOK - Bring Your Own Key）
 *
 * 用户在"我的"页配置 AI provider + apiKey，存储于 Dexie kv 表
 * key = settings:ai-config
 *
 * 安全说明：
 * - 仅存储于本地 IndexedDB，不上传服务器
 * - apiKey 以明文存储（本地优先架构，无服务端加密）
 * - 用户可在"我的"页随时清除
 *
 * 变更传播：
 * - 同标签页：setAiConfig/clearAiConfig 派发 wordflow:ai-config-changed 事件
 * - 跨标签页：依赖 storage 事件（Dexie 底层用 IndexedDB，会触发 storage 事件）
 * 这样全局 AI 助手等组件能即时感知配置变化，不再误报"未配置"。
 */
import { getItem, setItem, delItem } from "@/lib/storage/db";
import type { ProviderName } from "@/lib/ai/provider";

const AI_CONFIG_KEY = "settings:ai-config";

/** 配置变更时派发的事件名（同标签页监听） */
export const AI_CONFIG_CHANGED_EVENT = "wordflow:ai-config-changed";

/** 通知同标签页内所有监听者：AI 配置已变更 */
function notifyAiConfigChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(AI_CONFIG_CHANGED_EVENT));
}

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
  notifyAiConfigChanged();
}

/** 清除 AI 凭据 */
export async function clearAiConfig(): Promise<void> {
  await delItem(AI_CONFIG_KEY);
  notifyAiConfigChanged();
}

/** 是否已配置 AI（用于 UI 状态判断） */
export async function hasAiConfigured(): Promise<boolean> {
  const v = await getItem<AiConfig>(AI_CONFIG_KEY);
  return v !== undefined && !!v.apiKey;
}
