/**
 * AI 配置持久化（BYOK - Bring Your Own Key）
 *
 * 用户在"我的"页配置 AI provider + apiKey，存储于 Dexie kv 表
 * key = settings:ai-config
 *
 * 安全说明：
 * - 仅存储于本地 IndexedDB，不上传服务器
 * - apiKey 用 Web Crypto AES-GCM 加密后落盘（密钥非可导出，不随备份导出）
 * - 旧版明文记录兼容：读取时遇非加密格式原样返回，下次保存自动加密迁移
 * - 用户可在"我的"页随时清除
 *
 * 变更传播：
 * - 同标签页：setAiConfig/clearAiConfig 派发 wordflow:ai-config-changed 事件
 * - 跨标签页：依赖 storage 事件（Dexie 底层用 IndexedDB，会触发 storage 事件）
 * 这样全局 AI 助手等组件能即时感知配置变化，不再误报"未配置"。
 */
import { getItem, setItem, delItem } from "@/lib/storage/db";
import { encryptText, decryptText } from "@/lib/security/crypto";
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

/** 读取用户配置的 AI 凭据（apiKey 运行时解密） */
export async function getAiConfig(): Promise<AiConfig | null> {
  const v = await getItem<AiConfig>(AI_CONFIG_KEY);
  if (!v) return null;
  return { ...v, apiKey: await decryptText(v.apiKey) };
}

/** 保存 AI 凭据（apiKey 落盘前加密） */
export async function setAiConfig(
  config: Omit<AiConfig, "configuredAt">
): Promise<void> {
  const encryptedKey = await encryptText(config.apiKey);
  await setItem(AI_CONFIG_KEY, {
    ...config,
    apiKey: encryptedKey,
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
