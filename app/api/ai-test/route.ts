/**
 * /api/ai-test 连接测试端点（设计文档 §4.4.6）
 *
 * BYOK onboarding 时用 session 配置发送测试消息，区分：
 *   - upstream-auth（401/403）：API Key 无效或权限不足
 *   - upstream-other（5xx / 非 JSON / 网络错误）：上游服务不可用
 *   - local（URL 解析错误）：本地配置错误
 *
 * 实现说明：直接对 `${baseURL}/chat/completions` 做原始 fetch 探测，
 * 捕获真实的 HTTP 状态码、Content-Type 与响应体片段。
 * 这样即使上游返回 HTML 错误页（导致 @ai-sdk/openai 报 "Invalid JSON response"），
 * 也能把真实响应体透传给用户，避免黑盒错误。
 */
import { NextRequest, NextResponse } from "next/server";
import {
  getProviderConfig,
  resolveModel,
  classifyAiError,
  type AiSessionConfig,
} from "@/lib/ai/provider";

/** AI 测试请求超时（ms） */
const TEST_TIMEOUT_MS = 20_000;

function fetchWithTimeout(input: string, init: RequestInit): Promise<Response> {
  const signal =
    typeof AbortSignal !== "undefined" && "timeout" in AbortSignal
      ? AbortSignal.timeout(TEST_TIMEOUT_MS)
      : undefined;
  return fetch(input, { ...init, signal });
}

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

  const session: AiSessionConfig = { provider, apiKey, baseURL, model };

  // 解析 baseURL / model（local 错误在此抛出）
  let finalBaseURL: string;
  let finalModel: string;
  try {
    const cfg = getProviderConfig(provider);
    finalBaseURL = (session.baseURL || cfg.baseURL).trim();
    finalModel = resolveModel(session);
  } catch (err) {
    const rawError = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      {
        ok: false,
        error: "local",
        message: `本地配置错误：${rawError}`,
        rawError,
      },
      { status: 500 }
    );
  }

  if (!finalBaseURL) {
    return NextResponse.json(
      {
        ok: false,
        error: "local",
        message: "baseURL 为空，请填写 API 地址",
        rawError: "empty baseURL",
      },
      { status: 500 }
    );
  }

  // 构造 chat/completions 端点（兼容 baseURL 是否带尾斜杠）
  const endpoint = finalBaseURL.replace(/\/+$/, "") + "/chat/completions";

  try {
    const res = await fetchWithTimeout(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: finalModel,
        messages: [{ role: "user", content: "Hi" }],
        max_tokens: 1,
        stream: false,
      }),
    });

    const contentType = res.headers.get("content-type") ?? "";
    const bodyText = await res.text().catch(() => "");
    const bodySnippet = bodyText.slice(0, 300);

    // 401/403 → 鉴权失败
    if (res.status === 401 || res.status === 403) {
      return NextResponse.json(
        {
          ok: false,
          error: "upstream-auth",
          message: "API Key 无效或权限不足，请检查 Key 和 Provider 配置",
          rawError: `HTTP ${res.status}`,
          httpStatus: res.status,
          contentType,
          bodySnippet,
        },
        { status: 401 }
      );
    }

    // 2xx 且返回 JSON：检查是否为合法 OpenAI 响应格式
    if (res.ok && contentType.includes("application/json")) {
      try {
        const json = JSON.parse(bodyText);
        // OpenAI 格式必有 choices 数组（部分兼容服务用 data/其他字段，放宽判断）
        const hasChoices = Array.isArray(json.choices) || Array.isArray(json.data);
        if (hasChoices) {
          return NextResponse.json({
            ok: true,
            message: "连接成功",
            httpStatus: res.status,
          });
        }
        // 200 但结构异常：可能是错误体包了 200
        const errMsg =
          json.error?.message ||
          json.message ||
          JSON.stringify(json).slice(0, 200);
        return NextResponse.json(
          {
            ok: false,
            error: "upstream-other",
            message: `上游返回异常结构：${errMsg.slice(0, 120)}`,
            rawError: errMsg.slice(0, 200),
            httpStatus: res.status,
            contentType,
            bodySnippet,
          },
          { status: 500 }
        );
      } catch {
        // 声称 JSON 但解析失败
        return NextResponse.json(
          {
            ok: false,
            error: "upstream-other",
            message: `上游返回非法 JSON（${bodySnippet.slice(0, 80)}）`,
            rawError: "JSON parse failed",
            httpStatus: res.status,
            contentType,
            bodySnippet,
          },
          { status: 500 }
        );
      }
    }

    // 非 JSON 响应（HTML 错误页 / 网关错误页等）
    const errorClass = classifyAiError(new Error(`HTTP ${res.status} ${bodySnippet.slice(0, 60)}`));
    const message =
      errorClass === "upstream-auth"
        ? "API Key 无效或权限不足"
        : `上游服务暂时不可用（HTTP ${res.status}，${contentType || "非 JSON"}）`;
    return NextResponse.json(
      {
        ok: false,
        error: errorClass === "local" ? "upstream-other" : errorClass,
        message,
        rawError: `HTTP ${res.status} ${bodySnippet.slice(0, 120)}`,
        httpStatus: res.status,
        contentType,
        bodySnippet,
      },
      { status: errorClass === "upstream-auth" ? 401 : 500 }
    );
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
        ? "API Key 无效或权限不足"
        : errorClass === "local"
          ? `本地配置错误（${rawError.slice(0, 120)}）`
          : `上游服务暂时不可用，请稍后重试（${rawError.slice(0, 120)}）`;
    const status = errorClass === "upstream-auth" ? 401 : 500;
    return NextResponse.json(
      {
        ok: false,
        error: errorClass === "local" ? "upstream-other" : errorClass,
        message,
        rawError: rawError.slice(0, 200),
      },
      { status }
    );
  }
}
