/**
 * 免费通道共享配置（chat / word-lookup 两路由共用）。
 *
 * 设计：
 * - 优先使用环境变量（Cloudflare Pages Secret / Dashboard 环境变量）
 * - 回退到内置默认密钥（DeepSeek 开放平台，开箱即用）
 * - 当环境变量密钥鉴权失败（401）时，自动回退到内置默认密钥重试
 *   （场景：Secret 中配置的旧密钥失效，代码内置默认密钥仍有效）
 */
import type { AiSessionConfig } from "@/lib/ai/provider";

/** 内置默认免费密钥（DeepSeek 开放平台，开箱即用） */
export const DEFAULT_FREE_API_KEY = "sk-17340d9fd1be4eec9e56470e8e087d4a";
const DEFAULT_FREE_PROVIDER: AiSessionConfig["provider"] = "deepseek";
const DEFAULT_FREE_MODEL = "deepseek-v4-flash";

/**
 * 从环境变量构造免费通道 session。
 * 环境变量未配置时回退到内置默认，保证开箱即用。
 */
export function getFreeSession(): AiSessionConfig {
  const apiKey = process.env.FREE_AI_API_KEY || DEFAULT_FREE_API_KEY;
  const provider =
    (process.env.FREE_AI_PROVIDER as AiSessionConfig["provider"]) ||
    DEFAULT_FREE_PROVIDER;
  return {
    provider,
    apiKey,
    baseURL: process.env.FREE_AI_BASE_URL || undefined,
    model: process.env.FREE_AI_MODEL || DEFAULT_FREE_MODEL,
  };
}

/** session 是否使用环境变量配置的密钥（非内置默认） */
export function isUsingEnvKey(session: AiSessionConfig): boolean {
  return !!process.env.FREE_AI_API_KEY && session.apiKey !== DEFAULT_FREE_API_KEY;
}

/**
 * 构造使用内置默认密钥的 session（用于 env 密钥鉴权失败时回退重试）。
 * 保留 provider/baseURL/model 配置，只替换 apiKey。
 */
export function getDefaultKeySession(session: AiSessionConfig): AiSessionConfig {
  return { ...session, apiKey: DEFAULT_FREE_API_KEY };
}
