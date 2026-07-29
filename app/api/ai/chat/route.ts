import { NextRequest, NextResponse } from "next/server";
import {
  classifyAiError,
  validateBaseUrl,
  getProviderConfig,
  resolveModel,
  type AiSessionConfig,
} from "@/lib/ai/provider";
import { buildSystemPrompt } from "@/lib/ai/prompts";
import {
  consumeQuota,
  peekQuota,
  type QuotaSnapshot,
} from "@/lib/ai/free-quota";
import { buildFallbackReply } from "@/lib/ai/fallback-reply";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface ChatRequestBody extends Partial<AiSessionConfig> {
  messages: ChatMessage[];
  clientId?: string;
}

/** AI 请求超时（ms） */
const CHAT_TIMEOUT_MS = 30_000;

function fetchWithTimeout(input: string, init: RequestInit): Promise<Response> {
  const signal =
    typeof AbortSignal !== "undefined" && "timeout" in AbortSignal
      ? AbortSignal.timeout(CHAT_TIMEOUT_MS)
      : undefined;
  return fetch(input, { ...init, signal });
}

/**
 * 从环境变量构造免费通道的 session。
 *
 * 默认走 Agnes（agnes-2.0-flash），无需额外配置即开箱可用——
 * 只需在部署环境（Cloudflare Pages Variables 或本地 .dev.vars）配置：
 *   FREE_AI_API_KEY=sk-xxx
 */
function getFreeSession(): AiSessionConfig | null {
  const apiKey = process.env.FREE_AI_API_KEY;
  if (!apiKey) return null;
  const provider = (process.env.FREE_AI_PROVIDER as AiSessionConfig["provider"]) ?? "agnes";
  return {
    provider,
    apiKey,
    baseURL: process.env.FREE_AI_BASE_URL || undefined,
    model: process.env.FREE_AI_MODEL || undefined,
  };
}

function isFreeChannelAvailable(): boolean {
  return getFreeSession() !== null;
}

/**
 * 调用上游 OpenAI 兼容 API（原始 fetch，绕过 AI SDK 的黑盒解析）。
 *
 * 不用 @ai-sdk/openai 的 generateText，因为它对响应格式要求严格，
 * 上游返回非标准 JSON（如 HTML 错误页、空响应、SSE 流）时会抛
 * "Invalid JSON response"，掩盖真实错误。
 *
 * 直接 fetch + 手动解析，能捕获 HTTP 状态码、Content-Type 和响应体，
 * 在失败时返回可操作的错误信息。
 *
 * @returns { text: string } 或抛出带上下文的 Error
 */
async function callUpstream(
  session: AiSessionConfig,
  systemPrompt: string,
  messages: ChatMessage[]
): Promise<string> {
  const cfg = getProviderConfig(session.provider);
  const finalBaseURL = (session.baseURL || cfg.baseURL).trim();
  const finalModel = resolveModel(session);

  if (!finalBaseURL) {
    throw new Error("baseURL 为空，请检查 Provider 配置");
  }

  // SSRF 防护
  validateBaseUrl(finalBaseURL);

  const endpoint = finalBaseURL.replace(/\/+$/, "") + "/chat/completions";

  const res = await fetchWithTimeout(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.apiKey}`,
    },
    body: JSON.stringify({
      model: finalModel,
      messages: [
        { role: "system", content: systemPrompt },
        ...messages.map((m) => ({ role: m.role, content: m.content })),
      ],
      stream: false,
      temperature: 0.7,
      max_tokens: 1024,
    }),
  });

  const contentType = res.headers.get("content-type") ?? "";
  const bodyText = await res.text().catch(() => "");
  const bodySnippet = bodyText.slice(0, 300);

  // 非 JSON 响应（HTML 错误页 / 网关错误 / 空响应）
  if (!contentType.includes("application/json")) {
    const err = new Error(
      `HTTP ${res.status} ${contentType || "非 JSON"}: ${bodySnippet.slice(0, 120)}`
    );
    (err as Error & { httpStatus?: number }).httpStatus = res.status;
    throw err;
  }

  // 解析 JSON
  let json: Record<string, unknown>;
  try {
    json = JSON.parse(bodyText);
  } catch {
    const err = new Error(`JSON 解析失败: ${bodySnippet.slice(0, 120)}`);
    (err as Error & { httpStatus?: number }).httpStatus = res.status;
    throw err;
  }

  // 检查上游错误
  if (!res.ok) {
    const apiError = json.error as Record<string, unknown> | undefined;
    const errMsg =
      (typeof apiError?.message === "string" && apiError.message) ||
      (typeof json.message === "string" && json.message) ||
      `HTTP ${res.status}`;
    const err = new Error(`HTTP ${res.status}: ${errMsg}`);
    (err as Error & { httpStatus?: number }).httpStatus = res.status;
    throw err;
  }

  // 提取回复文本（兼容 choices[0].message.content 和 data[0].content）
  const choices = json.choices as Array<{ message?: { content?: string } }> | undefined;
  if (choices && choices.length > 0 && choices[0].message?.content) {
    return choices[0].message.content;
  }

  // 部分兼容服务用 data 数组
  const data = json.data as Array<{ content?: string }> | undefined;
  if (data && data.length > 0 && data[0].content) {
    return data[0].content;
  }

  // 200 但结构异常
  throw new Error(`上游返回异常结构: ${bodySnippet.slice(0, 120)}`);
}

/** 构造错误响应 */
function errorResponse(
  errorClass: ReturnType<typeof classifyAiError>,
  rawError: string,
  context: "byok" | "free",
  quota?: QuotaSnapshot
) {
  const message =
    errorClass === "upstream-auth"
      ? context === "byok"
        ? "API Key 无效或权限不足，请检查 Key 和 Provider 配置"
        : "免费通道密钥失效，可配置自己的 API Key"
      : errorClass === "local"
        ? `本地配置错误（${rawError.slice(0, 120)}）`
        : `AI 服务暂时不可用，请稍后重试（${rawError.slice(0, 100)}）`;
  const status = errorClass === "upstream-auth" ? 401 : 500;
  return NextResponse.json(
    {
      ok: false,
      error: errorClass,
      message,
      rawError: rawError.slice(0, 200),
      ...(quota ? { quota } : {}),
    },
    { status }
  );
}

export async function POST(request: NextRequest) {
  let body: ChatRequestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "local", message: "请求体非合法 JSON" },
      { status: 500 }
    );
  }

  const { provider, apiKey, baseURL, model, messages, clientId } = body;

  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json(
      { ok: false, error: "local", message: "消息不能为空" },
      { status: 500 }
    );
  }

  const systemPrompt = buildSystemPrompt("word_explain_chat");

  // ───────── 通道1：BYOK（用户自带 Key，无限制） ─────────
  if (provider && apiKey) {
    const session: AiSessionConfig = { provider, apiKey, baseURL, model };
    try {
      const text = await callUpstream(session, systemPrompt, messages);
      return NextResponse.json({ ok: true, text });
    } catch (err) {
      const errorClass = classifyAiError(err);
      const rawError =
        err instanceof Error
          ? err.message
          : typeof err === "string"
            ? err
            : JSON.stringify(err);
      return errorResponse(errorClass, rawError, "byok");
    }
  }

  // ───────── 通道2：免费通道（需要 clientId 限流） ─────────
  if (!clientId) {
    return NextResponse.json(
      {
        ok: false,
        error: "local",
        message: "缺少客户端标识",
      },
      { status: 500 }
    );
  }

  const before = peekQuota(clientId);
  if (before.remaining <= 0) {
    return NextResponse.json(
      {
        ok: false,
        error: "quota-exhausted",
        message: "今日免费额度已用完，明天再来或配置自己的 API Key",
        quota: before,
      },
      { status: 429 }
    );
  }

  const freeSession = getFreeSession();
  if (freeSession) {
    try {
      const text = await callUpstream(freeSession, systemPrompt, messages);
      const quota: QuotaSnapshot = consumeQuota(clientId);
      return NextResponse.json({ ok: true, text, quota });
    } catch (err) {
      const errorClass = classifyAiError(err);
      const rawError =
        err instanceof Error
          ? err.message
          : typeof err === "string"
            ? err
            : JSON.stringify(err);
      return errorResponse(errorClass, rawError, "free", before);
    }
  }

  // 通道3：未配置免费通道 → 本地兜底引导文案（保证无 Key 也能响应）
  const fallbackText = buildFallbackReply(messages);
  const quota: QuotaSnapshot = consumeQuota(clientId);
  return NextResponse.json({
    ok: true,
    text: fallbackText,
    quota,
    fallback: true,
  });
}

/** GET：查询免费通道状态和剩余额度 */
export async function GET(request: NextRequest) {
  const clientId = request.nextUrl.searchParams.get("clientId");
  if (!clientId) {
    return NextResponse.json(
      { ok: false, error: "local", message: "缺少 clientId" },
      { status: 400 }
    );
  }
  return NextResponse.json({
    ok: true,
    enabled: true,
    fallback: !isFreeChannelAvailable(),
    reason: isFreeChannelAvailable() ? undefined : "no-key",
    quota: peekQuota(clientId),
  });
}
