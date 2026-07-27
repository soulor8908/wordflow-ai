/**
 * /api/ai-test 连接测试端点（设计文档 §4.4.6）
 *
 * BYOK onboarding 时用 session 配置发送测试消息，
 * 区分上游鉴权失败（401）vs 本地错误（500）——
 * 通过 classifyAiError 识别上游 401，避免用户误以为本地配置错误。
 *
 * 请求体：{ provider, apiKey, baseURL?, model? }
 * 响应：
 *   200 { ok: true, message: "连接成功" }
 *   401 { ok: false, error: "upstream-auth", message: "API Key 无效或权限不足" }
 *   500 { ok: false, error: "local"|"upstream-other", message: "..." }
 */
import { NextRequest, NextResponse } from "next/server";
import { createAiProvider, classifyAiError, type AiSessionConfig } from "@/lib/ai/provider";
import { generateText } from "ai";

export async function POST(request: NextRequest) {
  let body: Partial<AiSessionConfig>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "local", message: "请求体非合法 JSON" },
      { status: 500 }
    );
  }

  const { provider, apiKey, baseURL, model } = body;
  if (!provider || !apiKey) {
    return NextResponse.json(
      { ok: false, error: "local", message: "缺少 provider 或 apiKey" },
      { status: 500 }
    );
  }

  const session: AiSessionConfig = {
    provider,
    apiKey,
    baseURL,
    model,
  };

  try {
    const { model: aiModel } = createAiProvider(session);
    // 发送最小测试消息（验证鉴权即可，不限制 token 数）
    await generateText({
      model: aiModel,
      prompt: "Hi",
    });
    return NextResponse.json({ ok: true, message: "连接成功" });
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
