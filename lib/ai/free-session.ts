/**
 * 免费通道共享配置（chat / word-lookup 两路由共用）。
 *
 * 设计：
 * - 优先使用环境变量 FREE_AI_API_KEY（Cloudflare Pages Secret / Dashboard 环境变量）
 * - 未配置环境变量时降级到内置占位密钥，并标记 isUsingEnvKey=false
 *   （部署时必须配置 Secret，否则免费通道不可用）
 * - 当环境变量密钥鉴权失败（401）时，不再尝试内置密钥重试——
 *   硬编码密钥已下线，请确保 Cloudflare Secret 中配置的密钥有效
 *
 * ⚠️ 安全说明：曾经在此文件硬编码过 DeepSeek API Key，已删除。
 *   任何 API Key 必须通过环境变量注入，禁止再以明文形式提交到代码库。
 */
import type { AiSessionConfig } from "@/lib/ai/provider";

/**
 * 占位密钥：仅在未配置 FREE_AI_API_KEY 时使用，触发上游 401 后由调用方走 fallback 文案。
 * 部署时务必在 Cloudflare Pages → Settings → Environment variables 配置 FREE_AI_API_KEY。
 */
const PLACEHOLDER_API_KEY = "placeholder-please-configure-FREE_AI_API_KEY";

const DEFAULT_FREE_PROVIDER: AiSessionConfig["provider"] = "deepseek";
const DEFAULT_FREE_MODEL = "deepseek-v4-flash";

/**
 * 从环境变量构造免费通道 session。
 *
 * 部署 checklist：
 * 1. Cloudflare Pages → Settings → Environment variables 添加 FREE_AI_API_KEY
 * 2. （可选）FREE_AI_PROVIDER / FREE_AI_BASE_URL / FREE_AI_MODEL 覆盖默认值
 * 3. 未配置 FREE_AI_API_KEY 时，免费通道将返回 401，前端走 fallback 文案
 */
export function getFreeSession(): AiSessionConfig {
  const provider =
    (process.env.FREE_AI_PROVIDER as AiSessionConfig["provider"]) ||
    DEFAULT_FREE_PROVIDER;
  return {
    provider,
    apiKey: process.env.FREE_AI_API_KEY || PLACEHOLDER_API_KEY,
    baseURL: process.env.FREE_AI_BASE_URL || undefined,
    model: process.env.FREE_AI_MODEL || DEFAULT_FREE_MODEL,
  };
}

/** session 是否使用环境变量配置的密钥（非占位符） */
export function isUsingEnvKey(session: AiSessionConfig): boolean {
  return (
    !!process.env.FREE_AI_API_KEY && session.apiKey === process.env.FREE_AI_API_KEY
  );
}

/**
 * 构造使用占位密钥的 session（用于 env 密钥鉴权失败时回退，触发 fallback 文案）。
 * 保留 provider/baseURL/model 配置，只替换 apiKey。
 */
export function getDefaultKeySession(session: AiSessionConfig): AiSessionConfig {
  return { ...session, apiKey: PLACEHOLDER_API_KEY };
}
