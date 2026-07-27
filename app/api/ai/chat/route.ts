import { NextRequest, NextResponse } from "next/server";
import { generateText } from "ai";
import {
  createAiProvider,
  classifyAiError,
  type AiSessionConfig,
} from "@/lib/ai/provider";
import { buildSystemPrompt } from "@/lib/ai/prompts";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface ChatRequestBody extends AiSessionConfig {
  messages: ChatMessage[];
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

  const { provider, apiKey, baseURL, model, messages } = body;
  if (!provider || !apiKey) {
    return NextResponse.json(
      {
        ok: false,
        error: "local",
        message: "未配置 AI，请先在「我的」页填写 Provider 与 API Key",
      },
      { status: 500 }
    );
  }

  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json(
      { ok: false, error: "local", message: "消息不能为空" },
      { status: 500 }
    );
  }

  const session: AiSessionConfig = { provider, apiKey, baseURL, model };

  try {
    const { model: aiModel } = createAiProvider(session);
    const systemPrompt = buildSystemPrompt("word_explain_chat");

    const result = await generateText({
      model: aiModel,
      system: systemPrompt,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    });

    return NextResponse.json({
      ok: true,
      text: result.text,
    });
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
