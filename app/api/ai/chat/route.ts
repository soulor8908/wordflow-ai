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

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface ChatRequestBody extends Partial<AiSessionConfig> {
  messages: ChatMessage[];
  /** 免费通道：客户端匿名 ID（无 apiKey 时使用） */
  clientId?: string;
}

/** 从环境变量构造免费通道的 session */
function getFreeSession(): AiSessionConfig | null {
  const apiKey = process.env.FREE_AI_API_KEY;
  if (!apiKey) return null;
  const provider = (process.env.FREE_AI_PROVIDER as AiSessionConfig["provider"]) ?? "glm";
  // 默认走 GLM，允许通过环境变量覆盖 baseURL / model
  return {
    provider,
    apiKey,
    baseURL: process.env.FREE_AI_BASE_URL || undefined,
    model: process.env.FREE_AI_MODEL || undefined,
  };
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

  // ───────── BYOK 通道：用户自带 Key ─────────
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

  // ───────── 免费通道：服务端 Key + 限流 ─────────
  if (!clientId) {
    return NextResponse.json(
      {
        ok: false,
        error: "local",
        message: "未配置 AI，请先在「我的」页填写 API Key，或开启免费体验",
      },
      { status: 500 }
    );
  }

  const freeSession = getFreeSession();
  if (!freeSession) {
    return NextResponse.json(
      {
        ok: false,
        error: "local",
        message: "免费体验未开放，请在「我的」页配置自己的 API Key",
      },
      { status: 503 }
    );
  }

  // 先检查额度，避免无效的 AI 调用
  const before = peekQuota(clientId);
  if (before.remaining <= 0) {
    return NextResponse.json(
      {
        ok: false,
        error: "quota-exhausted",
        message: "今日免费额度已用完，配置自己的 API Key 可继续使用",
        quota: before,
      },
      { status: 429 }
    );
  }

  try {
    const { model: aiModel } = createAiProvider(freeSession);
    const systemPrompt = buildSystemPrompt("word_explain_chat");
    const result = await generateText({
      model: aiModel,
      system: systemPrompt,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    });
    // 成功后才消耗额度
    const quota: QuotaSnapshot = consumeQuota(clientId);
    return NextResponse.json({ ok: true, text: result.text, quota });
  } catch (err) {
    const errorClass = classifyAiError(err);
    const message =
      errorClass === "upstream-auth"
        ? "免费通道密钥失效，请配置自己的 API Key"
        : errorClass === "upstream-other"
          ? "AI 服务暂时不可用，请稍后重试"
          : "免费通道配置错误，请配置自己的 API Key";
    const status = errorClass === "upstream-auth" ? 401 : 500;
    return NextResponse.json(
      { ok: false, error: errorClass, message, quota: before },
      { status }
    );
  }
}

/** GET：查询当前 clientId 的剩余免费额度（用于 UI 实时显示） */
export async function GET(request: NextRequest) {
  const clientId = request.nextUrl.searchParams.get("clientId");
  if (!clientId) {
    return NextResponse.json(
      { ok: false, error: "local", message: "缺少 clientId" },
      { status: 400 }
    );
  }
  const freeSession = getFreeSession();
  if (!freeSession) {
    return NextResponse.json({
      ok: true,
      enabled: false,
      quota: { used: 0, total: 0, remaining: 0 },
    });
  }
  return NextResponse.json({
    ok: true,
    enabled: true,
    quota: peekQuota(clientId),
  });
}
