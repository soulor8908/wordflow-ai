/**
 * AI Provider 抽象（设计文档 §4.4.1）
 *
 * 通过 Vercel AI SDK createOpenAI() 统一封装 GLM / DeepSeek / MiMo / custom 四家
 * （均兼容 OpenAI 格式）。getModelFromSession 从 session 上下文取已解密 apiKey 调用。
 *
 * Provider 配置 + 模型解析 + 错误分类为纯函数（可测试）；
 * createAiProvider 封装 SDK 调用（运行时）。
 */
import { createOpenAI } from "@ai-sdk/openai";

export type ProviderName = "glm" | "deepseek" | "mimo" | "custom";

export interface ProviderConfig {
  baseURL: string;
  defaultModel: string;
}

export interface AiSessionConfig {
  provider: ProviderName;
  apiKey: string;
  baseURL?: string;
  model?: string;
}

export type AiErrorClass = "upstream-auth" | "upstream-other" | "local";

const PROVIDER_CONFIGS: Record<ProviderName, ProviderConfig> = {
  glm: {
    baseURL: "https://open.bigmodel.cn/api/paas/v4",
    defaultModel: "glm-4-flash",
  },
  deepseek: {
    baseURL: "https://api.deepseek.com/v1",
    defaultModel: "deepseek-chat",
  },
  mimo: {
    baseURL: "https://api.xiaomimimo.com/v1",
    defaultModel: "mimo-v2-pro",
  },
  custom: {
    baseURL: "", // 由 session 提供
    defaultModel: "", // 由 session 提供
  },
};

/** 查询 provider 配置（纯函数） */
export function getProviderConfig(provider: ProviderName): ProviderConfig {
  const cfg = PROVIDER_CONFIGS[provider];
  if (!cfg) throw new Error(`未知 provider: ${provider}`);
  return cfg;
}

/** 从 session 解析实际模型名（纯函数） */
export function resolveModel(session: AiSessionConfig): string {
  if (session.model) return session.model;
  const cfg = getProviderConfig(session.provider);
  if (session.provider === "custom") {
    throw new Error("custom provider 必须指定 model");
  }
  return cfg.defaultModel;
}

/**
 * 分类 AI 调用错误（纯函数，设计文档 §4.4.6）
 *
 * 区分上游鉴权失败（401）vs 本地错误（500）——
 * 通过正则匹配 error.message 识别上游 401，避免用户误以为本地配置错误。
 */
export function classifyAiError(error: unknown): AiErrorClass {
  if (error == null) return "local";
  const msg =
    typeof error === "string"
      ? error
      : error instanceof Error
        ? error.message
        : String(error);
  const lower = msg.toLowerCase();
  // 上游鉴权失败：401 / 403 / Unauthorized / invalid api key
  if (
    lower.includes("401") ||
    lower.includes("403") ||
    lower.includes("unauthorized") ||
    lower.includes("invalid api key") ||
    lower.includes("invalid_api_key") ||
    lower.includes("authentication")
  ) {
    return "upstream-auth";
  }
  // 上游其他错误：网络/服务端（fetch failed / 500 / 429 等）
  if (
    lower.includes("fetch failed") ||
    lower.includes("econnrefused") ||
    lower.includes("timeout") ||
    lower.includes("500") ||
    lower.includes("502") ||
    lower.includes("503") ||
    lower.includes("429") ||
    lower.includes("rate limit") ||
    lower.includes("overloaded")
  ) {
    return "upstream-other";
  }
  // 其余视为本地错误（配置/代码问题）
  return "local";
}

/**
 * 从 session 创建 AI provider 实例（运行时，封装 Vercel AI SDK）
 * 注：apiKey 应为已解密的明文（session exchange 后解密）
 */
export function createAiProvider(session: AiSessionConfig) {
  const cfg = getProviderConfig(session.provider);
  const baseURL = session.baseURL || cfg.baseURL;
  const model = resolveModel(session);

  const openai = createOpenAI({
    apiKey: session.apiKey,
    baseURL,
  });

  return { model: openai(model), provider: openai };
}
