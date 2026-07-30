/**
 * AI Provider 抽象（设计文档 §4.4.1）
 *
 * 通过 Vercel AI SDK createOpenAI() 统一封装 GLM / DeepSeek / MiMo / Agnes / custom 五家
 * （均兼容 OpenAI 格式）。getModelFromSession 从 session 上下文取已解密 apiKey 调用。
 *
 * Provider 配置 + 模型解析 + 错误分类为纯函数（可测试）；
 * createAiProvider 封装 SDK 调用（运行时）。
 */
import { createOpenAI } from "@ai-sdk/openai";

export type ProviderName = "glm" | "deepseek" | "mimo" | "agnes" | "custom";

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

export type AiErrorClass =
  | "upstream-auth"
  | "upstream-payment"
  | "upstream-other"
  | "local";

export const PROVIDER_CONFIGS: Record<ProviderName, ProviderConfig> = {
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
  agnes: {
    // Agnes AI（兼容 OpenAI 格式）
    baseURL: "https://apihub.agnes-ai.com/v1",
    defaultModel: "agnes-2.0-flash",
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
 * 区分上游鉴权失败（401）vs 本地错误（配置/代码）vs 上游其他（网络/服务端）。
 *
 * 改进点（减少"对了也说本地配置错误"的误报）：
 * - 同时检查 error.cause / error.status / error.responseBody（AI SDK 错误结构）
 * - 扩充上游模式：404 / model not found / does not exist / invalid model / no such model
 * - 默认兜底改为 upstream-other：能进入 catch 说明 provider 已构造、fetch 已发起，
 *   真正的本地配置错误（Invalid URL / 缺 model）会在构造阶段抛出明确信息，单独识别。
 */
export function classifyAiError(error: unknown): AiErrorClass {
  if (error == null) return "local";

  // 1. 收集所有可能的文本线索：message + cause + responseBody + data
  const parts: string[] = [];
  if (typeof error === "string") {
    parts.push(error);
  } else if (error instanceof Error) {
    parts.push(error.message);
    const anyErr = error as Error & Record<string, unknown>;
    if (anyErr.cause) {
      parts.push(
        anyErr.cause instanceof Error
          ? anyErr.cause.message
          : String(anyErr.cause)
      );
    }
    for (const k of ["responseBody", "data", "response", "body"]) {
      const v = anyErr[k];
      if (typeof v === "string") parts.push(v);
      else if (v && typeof v === "object") {
        try {
          parts.push(JSON.stringify(v));
        } catch {
          /* ignore */
        }
      }
    }
  } else {
    parts.push(String(error));
  }
  const msg = parts.join(" | ");
  const lower = msg.toLowerCase();

  // 2. 本地配置错误（明确的语法/配置问题，在 fetch 前抛出）
  if (
    lower.includes("invalid url") ||
    lower.includes("invalid base url") ||
    lower.includes("failed to parse url") ||
    lower.includes("must specify model") ||
    lower.includes("custom provider 必须指定 model") ||
    lower.includes("未知 provider") ||
    lower.includes("api key is required") ||
    lower.includes("apikey is required") ||
    lower.includes("missing api key")
  ) {
    return "local";
  }

  // 3. 上游鉴权失败：401 / 403 / Unauthorized / invalid api key
  if (
    lower.includes("401") ||
    lower.includes("403") ||
    lower.includes("unauthorized") ||
    lower.includes("invalid api key") ||
    lower.includes("invalid_api_key") ||
    lower.includes("invalidapikey") ||
    lower.includes("authentication") ||
    lower.includes("permission denied") ||
    lower.includes("forbidden")
  ) {
    return "upstream-auth";
  }

  // 3.5 上游余额不足：402 / Insufficient Balance / 余额不足
  // 需单独识别：鉴权通过但账户余额耗尽，提示用户充值或更换 Key
  if (
    lower.includes("402") ||
    lower.includes("insufficient balance") ||
    lower.includes("insufficient_balance") ||
    lower.includes("余额不足") ||
    lower.includes("insufficient quota") ||
    lower.includes("no enough balance")
  ) {
    return "upstream-payment";
  }

  // 4. 上游其他错误：网络/服务端/模型不存在
  if (
    lower.includes("fetch failed") ||
    lower.includes("econnrefused") ||
    lower.includes("enotfound") ||
    lower.includes("eai_again") ||
    lower.includes("timeout") ||
    lower.includes("timed out") ||
    lower.includes("500") ||
    lower.includes("502") ||
    lower.includes("503") ||
    lower.includes("504") ||
    lower.includes("429") ||
    lower.includes("rate limit") ||
    lower.includes("rate_limit") ||
    lower.includes("overloaded") ||
    lower.includes("404") ||
    lower.includes("not found") ||
    lower.includes("does not exist") ||
    lower.includes("model_not_found") ||
    lower.includes("model not found") ||
    lower.includes("no such model") ||
    lower.includes("invalid model") ||
    lower.includes("invalid_model") ||
    lower.includes("bad request") ||
    lower.includes("400") ||
    lower.includes("connection refused") ||
    lower.includes("network error") ||
    lower.includes("socket hang up") ||
    lower.includes("json") // JSON 解析失败通常因为上游返回了非 JSON（如 HTML 错误页）
  ) {
    return "upstream-other";
  }

  // 5. 兜底：能进入 catch 说明请求已发起，按上游其他错误处理，
  //    避免把无法识别的上游错误误判为"本地配置错误"误导用户。
  return "upstream-other";
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

/**
 * SSRF 防护：校验 baseURL 不指向内网/私有地址。
 *
 * 阻止的地址：
 * - 非 http/https 协议（file://、ftp:// 等）
 * - localhost / 127.0.0.1 / 0.0.0.0 / ::1
 * - 私有 IP 段：10.x / 172.16-31.x / 192.168.x
 * - 链路本地：169.254.x（AWS/Cloudflare metadata endpoint）
 * - .local / .internal 域名
 *
 * 内置 provider（glm/deepseek/mimo/agnes）的 baseURL 已硬编码为公网 HTTPS，
 * 此校验仅对 custom provider 和用户覆盖的 baseURL 生效。
 */
export function validateBaseUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid URL: ${url}`);
  }

  // 仅允许 http/https
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`不允许的协议: ${parsed.protocol}（仅支持 http/https）`);
  }

  const host = parsed.hostname.toLowerCase();

  // 阻止 localhost
  if (host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0" || host === "::1" || host === "[::1]") {
    throw new Error(`不允许的地址: ${host}（禁止访问本地地址）`);
  }

  // 阻止 .local / .internal 域名
  if (host.endsWith(".local") || host.endsWith(".internal")) {
    throw new Error(`不允许的域名: ${host}（禁止访问内网域名）`);
  }

  // 阻止私有 IP 段和链路本地地址
  const ipv4Match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    const [, a, b] = ipv4Match.map(Number) as unknown as [number, number, number, number, number];
    // 10.x.x.x
    if (a === 10) throw new Error(`不允许的地址: ${host}（私有 IP 段）`);
    // 172.16-31.x.x
    if (a === 172 && b >= 16 && b <= 31) throw new Error(`不允许的地址: ${host}（私有 IP 段）`);
    // 192.168.x.x
    if (a === 192 && b === 168) throw new Error(`不允许的地址: ${host}（私有 IP 段）`);
    // 169.254.x.x（链路本地 / cloud metadata）
    if (a === 169 && b === 254) throw new Error(`不允许的地址: ${host}（链路本地地址）`);
    // 0.x.x.x
    if (a === 0) throw new Error(`不允许的地址: ${host}（保留地址）`);
  }
}
