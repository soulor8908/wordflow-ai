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
import {
  generateWithCloudflareAI,
  isCloudflareAvailable,
} from "@/lib/ai/cloudflare-ai";
import { buildFallbackReply } from "@/lib/ai/fallback-reply";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface ChatRequestBody extends Partial<AiSessionConfig> {
  messages: ChatMessage[];
  /** 免费通道：客户端匿名 ID（无 apiKey 时使用） */
  clientId?: string;
}

/** 从环境变量构造免费通道的 session（用户自己配的 Key） */
function getFreeSession(): AiSessionConfig | null {
  const apiKey = process.env.FREE_AI_API_KEY;
  if (!apiKey) return null;
  const provider = (process.env.FREE_AI_PROVIDER as AiSessionConfig["provider"]) ?? "glm";
  return {
    provider,
    apiKey,
    baseURL: process.env.FREE_AI_BASE_URL || undefined,
    model: process.env.FREE_AI_MODEL || undefined,
  };
}

/**
 * 诊断免费通道不可用的原因（用于前端给出准确提示，而非误导性的"加载中"）
 * - "no-channel"：既未配置 FREE_AI_API_KEY，也不在 Cloudflare 运行时
 * - "cloudflare-unbound"：在 CF 运行时但 AI binding 不可用
 */
async function diagnoseFreeChannel(): Promise<{
  available: boolean;
  reason?: string;
}> {
  if (getFreeSession() !== null) return { available: true };
  const cfAvail = await isCloudflareAvailable();
  if (cfAvail) return { available: true };
  // 区分：是否在 CF 运行时但 AI binding 缺失
  try {
    const mod = await import("@opennextjs/cloudflare");
    const getRequestContext = (
      mod as unknown as {
        getRequestContext?: () => { env: Record<string, unknown> };
      }
    ).getRequestContext;
    if (getRequestContext) {
      const ctx = getRequestContext();
      if (ctx?.env) return { available: false, reason: "cloudflare-unbound" };
    }
  } catch {
    /* 不在 CF 运行时 */
  }
  return { available: false, reason: "no-channel" };
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
      const message =
        errorClass === "upstream-auth"
          ? "API Key 无效或权限不足，请检查 Key 和 Provider 配置"
          : errorClass === "upstream-other"
            ? "上游服务暂时不可用，请稍后重试"
            : "本地配置错误，请检查 baseURL 和 model";
      const status = errorClass === "upstream-auth" ? 401 : 500;
      return NextResponse.json(
        { ok: false, error: errorClass, message },
        { status }
      );
    }
  }

  // ───────── 通道2/3：免费通道（需要 clientId 限流） ─────────
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

  // 检查额度
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

  // 通道2：FREE_AI_API_KEY（环境变量配的第三方 Key）
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
      const message =
        errorClass === "upstream-auth"
          ? "免费通道密钥失效，可配置自己的 API Key"
          : "AI 服务暂时不可用，请稍后重试";
      return NextResponse.json(
        { ok: false, error: errorClass, message, quota: before },
        { status: errorClass === "upstream-auth" ? 401 : 500 }
      );
    }
  }

  // 通道3：Cloudflare Workers AI（内置免费，无需 Key）
  try {
    const text = await generateWithCloudflareAI(systemPrompt, mappedMessages);
    const quota: QuotaSnapshot = consumeQuota(clientId);
    return NextResponse.json({ ok: true, text, quota });
  } catch {
    // 通道3不可用（本地 dev / 未绑定 AI）→ 回退本地模拟，保证试用用户能体验聊天
    const fallbackText = buildFallbackReply(messages);
    const quota: QuotaSnapshot = consumeQuota(clientId);
    return NextResponse.json({
      ok: true,
      text: fallbackText,
      quota,
      fallback: true,
    });
  }
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
  const diag = await diagnoseFreeChannel();
  if (!diag.available) {
    // 即使无上游通道，POST 也会走 fallback 本地兜底，所以仍标记 enabled=true
    // 让前端允许试用用户发送消息（fallback 模式下回复引导文案）
    return NextResponse.json({
      ok: true,
      enabled: true,
      fallback: true,
      reason: diag.reason ?? "no-channel",
      quota: peekQuota(clientId),
    });
  }
  return NextResponse.json({
    ok: true,
    enabled: true,
    quota: peekQuota(clientId),
  });
}
