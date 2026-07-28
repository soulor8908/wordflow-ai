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

/** 检查免费通道是否可用（FREE_AI_API_KEY 或 Cloudflare Workers AI） */
async function isFreeChannelAvailable(): Promise<boolean> {
  return getFreeSession() !== null || (await isCloudflareAvailable());
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
    return NextResponse.json(
      {
        ok: false,
        error: "local",
        message: "AI 暂不可用，请稍后再试",
        quota: before,
      },
      { status: 503 }
    );
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
  const available = await isFreeChannelAvailable();
  if (!available) {
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
