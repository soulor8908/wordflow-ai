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
import {
  getFreeSession,
  isUsingEnvKey,
  getDefaultKeySession,
} from "@/lib/ai/free-session";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface ChatRequestBody extends Partial<AiSessionConfig> {
  messages: ChatMessage[];
  clientId?: string;
}

/** AI 请求超时（ms）—— 上游模型冷启动/长上下文时首 token 可能 >10s。
 * 限制在 12s：超过则视为上游不可用，降级到 fallback reply，
 *  避免用户长时间等待 + Cloudflare Worker 超时崩溃（1101）。
 *  Cloudflare Pages Functions subrequest 默认 30s 限制，12s 留足降级时间。 */
const CHAT_TIMEOUT_MS = 12_000;

function fetchWithTimeout(input: string, init: RequestInit): Promise<Response> {
  const signal =
    typeof AbortSignal !== "undefined" && "timeout" in AbortSignal
      ? AbortSignal.timeout(CHAT_TIMEOUT_MS)
      : undefined;
  return fetch(input, { ...init, signal });
}

/** 免费通道始终可用（内置默认密钥开箱即用，见 lib/ai/free-session.ts） */
function isFreeChannelAvailable(): boolean {
  return true;
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

  // 缓冲式读取：完整读完上游 SSE，解析所有 delta，再一次性返回 stream。
  // 这样所有上游错误（网络中断/超时/解析失败）在此函数内同步抛出，
  // 由 route.ts 的 catch 捕获并降级到 fallback reply，避免流式异步错误
  // 导致 Cloudflare Worker 1101 崩溃。
  const upstreamReader = res.body.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";
  const deltas: string[] = [];
  let sawDone = false;

  // 完整读取上游 SSE 流
  try {
    while (true) {
      const { done, value } = await upstreamReader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data:")) continue;
        const data = trimmed.slice(5).trim();
        if (data === "[DONE]") {
          sawDone = true;
          continue;
        }
        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta?.content;
          if (delta) deltas.push(delta);
        } catch {
          // 跳过无法解析的行（如上游心跳/注释）
        }
      }
    }
  } catch (err) {
    // 上游读取失败（网络中断/超时）→ 抛错让 route catch 降级
    const msg = err instanceof Error ? err.message : "流式读取失败";
    throw new Error(`上游流式读取失败: ${msg}`);
  }

  // 如果没有任何 delta 且没收到 [DONE]，视为上游异常
  if (deltas.length === 0 && !sawDone) {
    throw new Error("上游返回空响应（无 delta 且无 [DONE]）");
  }

  // 返回一个一次性 emit 所有 delta + done 的 stream（客户端仍按流式协议解析）
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const delta of deltas) {
        controller.enqueue(
          encoder.encode(JSON.stringify({ type: "delta", content: delta }) + "\n")
        );
      }
      controller.enqueue(
        encoder.encode(JSON.stringify({ type: "done" }) + "\n")
      );
      controller.close();
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
  let message: string;
  let status: number;
  if (errorClass === "upstream-auth") {
    message =
      context === "byok"
        ? "API Key 无效或权限不足，请检查 Key 和 Provider 配置"
        : "免费通道密钥失效，可配置自己的 API Key";
    status = 401;
  } else if (errorClass === "upstream-payment") {
    message =
      context === "byok"
        ? "API 账户余额不足，请充值后重试，或在「我的」页配置其他 API Key"
        : "AI 服务额度已耗尽，可配置自己的 API Key 继续使用";
    status = 402;
  } else if (errorClass === "local") {
    message = `本地配置错误（${rawError.slice(0, 120)}）`;
    status = 500;
  } else {
    message = `AI 服务暂时不可用，请稍后重试（${rawError.slice(0, 100)}）`;
    status = 500;
  }
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

  // 尝试调用上游：env 密钥鉴权失败时自动回退到内置默认密钥重试
  // 场景：Cloudflare Secret 中配置的旧密钥失效，代码内置默认密钥仍有效
  let stream: ReadableStream<Uint8Array> | null = null;
  try {
    stream = await callUpstreamStream(freeSession, systemPrompt, messages);
  } catch (err) {
    const errorClass = classifyAiError(err);
    const rawError =
      err instanceof Error
        ? err.message
        : typeof err === "string"
          ? err
          : JSON.stringify(err);

    if (
      (errorClass === "upstream-auth" || errorClass === "upstream-payment") &&
      isUsingEnvKey(freeSession)
    ) {
      // env 密钥鉴权失败/余额不足 → 回退到内置默认密钥重试
      console.warn(
        `[ai/chat] env 密钥${errorClass === "upstream-payment" ? "余额不足" : "鉴权失败"}，回退到默认密钥重试:`,
        rawError.slice(0, 120)
      );
      try {
        stream = await callUpstreamStream(
          getDefaultKeySession(freeSession),
          systemPrompt,
          messages
        );
      } catch (err2) {
        const ec2 = classifyAiError(err2);
        const re2 =
          err2 instanceof Error
            ? err2.message
            : typeof err2 === "string"
              ? err2
              : JSON.stringify(err2);
        if (ec2 === "upstream-auth" || ec2 === "upstream-payment") {
          // 默认密钥也鉴权失败/余额不足 → 返回错误，引导用户配置自己的 Key
          return errorResponse(ec2, re2, "free", before);
        }
        console.warn("[ai/chat] 默认密钥也失败，降级到 fallback reply:", re2.slice(0, 200));
      }
    } else if (errorClass === "upstream-auth" || errorClass === "upstream-payment") {
      // 已是默认密钥仍鉴权失败/余额不足 → 返回错误
      return errorResponse(errorClass, rawError, "free", before);
    } else {
      // 非 auth/payment 错误（超时/网络等）→ 降级到本地兜底文案
      console.warn("[ai/chat] 免费通道失败，降级到 fallback reply:", rawError.slice(0, 200));
    }
  }

  if (stream) {
    const quota: QuotaSnapshot = await consumeQuota(clientId);
    // 手动合并流：meta 行 + AI 流内容（避免 TransformStream/pipeTo 在
    // Cloudflare Workers 中的兼容性问题导致 1101 崩溃）
    const encoder = new TextEncoder();
    const metaLine = encoder.encode(JSON.stringify({ type: "meta", quota }) + "\n");
    const aiReader = stream.getReader();
    const finalStream = new ReadableStream<Uint8Array>({
      async start(controller) {
        // 先发 meta 行（含额度信息）
        controller.enqueue(metaLine);
        // 再逐块读取 AI 流并转发
        try {
          while (true) {
            const { done, value } = await aiReader.read();
            if (done) break;
            controller.enqueue(value);
          }
        } catch (err) {
          console.error("[ai/chat] stream read failed:", err);
        }
        controller.close();
      },
      cancel() {
        aiReader.cancel().catch(() => {});
      },
    });
    return new Response(finalStream, {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-cache",
      },
    });
  }

  // 通道3：免费通道未配置或失败 → 本地兜底引导文案（保证无 Key 也能响应）
  // 重要：fallback 不消耗额度（AI 未成功返回，对齐用户需求）
  const fallbackText = buildFallbackReply(messages);
  const currentQuota = await peekQuota(clientId);
  return NextResponse.json({
    ok: true,
    text: fallbackText,
    quota: currentQuota,
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
