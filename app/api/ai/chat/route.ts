import { NextRequest, NextResponse } from "next/server";
import { generateText } from "ai";
import {
  createAiProvider,
  classifyAiError,
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

/**
 * 从环境变量构造免费通道的 session。
 *
 * 默认走 Agnes（agnes-2.0-flash），无需额外配置即开箱可用——
 * 只需在部署环境（Cloudflare Pages Variables 或本地 .dev.vars）配置：
 *   FREE_AI_API_KEY=sk-xxx
 *
 * 可选覆盖：
 *   FREE_AI_PROVIDER —— 默认 "agnes"
 *   FREE_AI_BASE_URL —— 默认 agnes 官方地址
 *   FREE_AI_MODEL    —— 默认 agnes-2.0-flash
 *
 * 未配置 FREE_AI_API_KEY 时返回 null，由 fallback 本地兜底。
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

/** 免费通道是否可用（配了 FREE_AI_API_KEY 即可用，未配则走 fallback） */
function isFreeChannelAvailable(): boolean {
  return getFreeSession() !== null;
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

  // ───────── 通道1：BYOK（用户自带 Key，无限制） ─────────
  if (provider && apiKey) {
    const session: AiSessionConfig = { provider, apiKey, baseURL, model };
    try {
      const { model: aiModel } = createAiProvider(session);
      const systemPrompt = buildSystemPrompt("word_explain_chat");
      const result = await generateText({
        model: aiModel,
        system: systemPrompt,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
      });
      return NextResponse.json({ ok: true, text: result.text });
    } catch (err) {
      const errorClass = classifyAiError(err);
      const rawError =
        err instanceof Error
          ? err.message
          : typeof err === "string"
            ? err
            : JSON.stringify(err);
      const message =
        errorClass === "upstream-auth"
          ? "API Key 无效或权限不足，请检查 Key 和 Provider 配置"
          : errorClass === "upstream-other"
            ? `上游服务暂时不可用，请稍后重试（${rawError.slice(0, 120)}）`
            : `本地配置错误，请检查 baseURL 和 model（${rawError.slice(0, 120)}）`;
      const status = errorClass === "upstream-auth" ? 401 : 500;
      return NextResponse.json(
        {
          ok: false,
          error: errorClass,
          message,
          rawError: rawError.slice(0, 200),
        },
        { status }
      );
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

  const systemPrompt = buildSystemPrompt("word_explain_chat");
  const mappedMessages = messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  // 通道2：FREE_AI_API_KEY（环境变量配的第三方 Key，默认 agnes）
  const freeSession = getFreeSession();
  if (freeSession) {
    try {
      const { model: aiModel } = createAiProvider(freeSession);
      const result = await generateText({
        model: aiModel,
        system: systemPrompt,
        messages: mappedMessages,
      });
      const quota: QuotaSnapshot = consumeQuota(clientId);
      return NextResponse.json({ ok: true, text: result.text, quota });
    } catch (err) {
      const errorClass = classifyAiError(err);
      const rawError =
        err instanceof Error
          ? err.message
          : typeof err === "string"
            ? err
            : JSON.stringify(err);
      const message =
        errorClass === "upstream-auth"
          ? "免费通道密钥失效，可配置自己的 API Key"
          : `AI 服务暂时不可用，请稍后重试（${rawError.slice(0, 100)}）`;
      return NextResponse.json(
        {
          ok: false,
          error: errorClass,
          message,
          rawError: rawError.slice(0, 200),
          quota: before,
        },
        { status: errorClass === "upstream-auth" ? 401 : 500 }
      );
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
  // 即使未配置 FREE_AI_API_KEY，POST 也会走 fallback 本地兜底，所以仍标记 enabled=true
  return NextResponse.json({
    ok: true,
    enabled: true,
    fallback: !isFreeChannelAvailable(),
    reason: isFreeChannelAvailable() ? undefined : "no-key",
    quota: peekQuota(clientId),
  });
}
