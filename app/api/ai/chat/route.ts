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

/** AI 请求超时（ms）—— 上游模型冷启动/长上下文时首 token 可能 >10s，60s 留足余量 */
const CHAT_TIMEOUT_MS = 60_000;

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
 * 调用上游 OpenAI 兼容 API 并以流式返回（stream: true）。
 *
 * 返回 ReadableStream<Uint8Array>，流格式为 NDJSON（每行一个 JSON）：
 *   {"type":"delta","content":"..."} / {"type":"done"} / {"type":"error","message":"..."}
 *
 * 上游使用 SSE（每行 data: {...}），解析 choices[0].delta.content。
 * 上游返回 data: [DONE] 时发送 done 行。出错时发送 error 行。
 */
async function callUpstreamStream(
  session: AiSessionConfig,
  systemPrompt: string,
  messages: ChatMessage[]
): Promise<ReadableStream<Uint8Array>> {
  const cfg = getProviderConfig(session.provider);
  const finalBaseURL = (session.baseURL || cfg.baseURL).trim();
  const finalModel = resolveModel(session);
  if (!finalBaseURL) throw new Error("baseURL 为空，请检查 Provider 配置");
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
      stream: true,
      temperature: 0.7,
      max_tokens: 1024,
    }),
  });

  if (!res.ok || !res.body) {
    const bodyText = await res.text().catch(() => "");
    const err = new Error(`HTTP ${res.status}: ${bodyText.slice(0, 120)}`);
    (err as Error & { httpStatus?: number }).httpStatus = res.status;
    throw err;
  }

  const upstreamReader = res.body.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";
  let closed = false;

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (closed) return;
      try {
        const { done, value } = await upstreamReader.read();
        if (done) {
          controller.close();
          closed = true;
          return;
        }
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith("data:")) continue;
          const data = trimmed.slice(5).trim();
          if (data === "[DONE]") {
            controller.enqueue(
              encoder.encode(JSON.stringify({ type: "done" }) + "\n")
            );
            controller.close();
            closed = true;
            return;
          }
          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) {
              controller.enqueue(
                encoder.encode(
                  JSON.stringify({ type: "delta", content: delta }) + "\n"
                )
              );
            }
          } catch {
            // 跳过无法解析的行（如上游心跳/注释）
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "流式读取失败";
        controller.enqueue(
          encoder.encode(JSON.stringify({ type: "error", message: msg }) + "\n")
        );
        controller.close();
        closed = true;
      }
    },
    cancel() {
      upstreamReader.cancel().catch(() => {});
    },
  });
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
      const stream = await callUpstreamStream(session, systemPrompt, messages);
      return new Response(stream, {
        headers: {
          "Content-Type": "application/x-ndjson; charset=utf-8",
          "Cache-Control": "no-cache",
        },
      });
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

  const before = await peekQuota(clientId);
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
      const stream = await callUpstreamStream(freeSession, systemPrompt, messages);
      const quota: QuotaSnapshot = await consumeQuota(clientId);
      // 在流前面插入 meta 行（含 quota），用 TransformStream 拼接
      const encoder = new TextEncoder();
      const metaLine = encoder.encode(JSON.stringify({ type: "meta", quota }) + "\n");
      const { readable, writable } = new TransformStream();
      const writer = writable.getWriter();
      writer.write(metaLine);
      stream.pipeTo(writable).catch(() => {});
      return new Response(readable, {
        headers: {
          "Content-Type": "application/x-ndjson; charset=utf-8",
          "Cache-Control": "no-cache",
        },
      });
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
  const quota: QuotaSnapshot = await consumeQuota(clientId);
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
    quota: await peekQuota(clientId),
  });
}
