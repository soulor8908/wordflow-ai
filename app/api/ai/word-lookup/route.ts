import { NextRequest, NextResponse } from "next/server";
import {
  classifyAiError,
  validateBaseUrl,
  getProviderConfig,
  resolveModel,
  type AiSessionConfig,
} from "@/lib/ai/provider";
import { peekQuota, consumeQuota, type QuotaSnapshot } from "@/lib/ai/free-quota";
import {
  getFreeSession,
  isUsingEnvKey,
  getDefaultKeySession,
} from "@/lib/ai/free-session";

/**
 * AI 单词查询：当内置词典找不到时，调用 AI 生成词条。
 *
 * 返回 DictEntry 兼容的 JSON，客户端可自动入库到用户词库。
 * 格式与内置词典完全一致，可更丰富（更多例句/搭配/词族）。
 *
 * 额度规则：AI 返回成功才计次数，失败不计（对齐用户需求）。
 */

interface WordLookupResponse {
  ok: boolean;
  entry?: {
    word: string;
    phonetic?: string;
    pos?: string;
    translation: string;
    definition?: string;
    frequency?: number;
    tags?: string[];
    root?: string;
    examples?: { en: string; zh: string }[];
    synonyms?: string[];
    antonyms?: string[];
    collocations?: { type?: string; en: string; zh?: string }[];
    wordFamily?: string[];
  };
  error?: string;
  quota?: QuotaSnapshot;
  fallback?: boolean;
}

const LOOKUP_TIMEOUT_MS = 20_000; // 单词查询给更长超时（需要结构化输出）

function fetchWithTimeout(input: string, init: RequestInit): Promise<Response> {
  const signal =
    typeof AbortSignal !== "undefined" && "timeout" in AbortSignal
      ? AbortSignal.timeout(LOOKUP_TIMEOUT_MS)
      : undefined;
  return fetch(input, { ...init, signal });
}

const LOOKUP_SYSTEM_PROMPT = `你是专业的英语词典编纂助手。给定一个英语单词，生成完整的词典条目。

要求：
1. 返回严格的 JSON 格式（不要 markdown 代码块，不要多余文字）
2. JSON 结构如下：
{
  "word": "单词原形",
  "phonetic": "/音标/",
  "pos": "n./v./adj./adv. 等",
  "translation": "中文释义（核心，多个义项用 1. 2. 3. 编号）",
  "definition": "英文释义（简明）",
  "frequency": 数字词频估计（1-10000，越常用越大）,
  "tags": ["cet4"/"cet6"/"kaoyan"/"ielts"/"toefl" 等考纲标签],
  "root": "词根词缀助记（如有）",
  "examples": [
    {"en": "英文例句1", "zh": "中文翻译1"},
    {"en": "英文例句2", "zh": "中文翻译2"},
    {"en": "英文例句3", "zh": "中文翻译3"}
  ],
  "synonyms": ["同义词1", "同义词2", "同义词3"],
  "antonyms": ["反义词1"],
  "collocations": [
    {"type": "verb+noun", "en": "搭配英文", "zh": "搭配中文"}
  ],
  "wordFamily": ["名词形式", "形容词形式", "副词形式"]
}

规则：
- 例句必须真实自然，难度适配 CEFR B1-B2
- 音标使用 IPA 格式
- 中文释义要准确完整，覆盖主要义项
- 如果不是有效英语单词，返回 {"word": "", "translation": "未找到有效词条"}
- 不编造不存在的词义或词源`;

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

async function callAiForWord(
  session: AiSessionConfig,
  word: string
): Promise<WordLookupResponse["entry"] | null> {
  const cfg = getProviderConfig(session.provider);
  const finalBaseURL = (session.baseURL || cfg.baseURL).trim();
  const finalModel = resolveModel(session);
  if (!finalBaseURL) throw new Error("baseURL 为空");
  validateBaseUrl(finalBaseURL);
  const endpoint = finalBaseURL.replace(/\/+$/, "") + "/chat/completions";

  const messages: ChatMessage[] = [
    { role: "user", content: `请查询单词：${word}` },
  ];

  const res = await fetchWithTimeout(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.apiKey}`,
    },
    body: JSON.stringify({
      model: finalModel,
      messages: [
        { role: "system", content: LOOKUP_SYSTEM_PROMPT },
        ...messages.map((m) => ({ role: m.role, content: m.content })),
      ],
      stream: false,
      temperature: 0.3,
      max_tokens: 2048,
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) {
    const bodyText = await res.text().catch(() => "");
    const err = new Error(`HTTP ${res.status}: ${bodyText.slice(0, 120)}`);
    (err as Error & { httpStatus?: number }).httpStatus = res.status;
    throw err;
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("AI 返回空内容");

  // 解析 JSON（AI 可能返回带 markdown 代码块的内容）
  let jsonStr = content.trim();
  // 去除可能的 markdown 代码块包裹
  if (jsonStr.startsWith("```")) {
    jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }

  const parsed = JSON.parse(jsonStr);

  // 空词条（AI 判断不是有效单词）
  if (!parsed.word || !parsed.translation || parsed.translation === "未找到有效词条") {
    return null;
  }

  return parsed;
}

export async function POST(request: NextRequest) {
  let body: { word?: string; provider?: string; apiKey?: string; baseURL?: string; model?: string; clientId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json<WordLookupResponse>(
      { ok: false, error: "请求体非合法 JSON" },
      { status: 500 }
    );
  }

  const { word: rawWord, provider, apiKey, baseURL, model, clientId } = body;
  const word = (rawWord ?? "").trim();

  if (!word || word.length > 100) {
    return NextResponse.json<WordLookupResponse>(
      { ok: false, error: "word 参数无效" },
      { status: 400 }
    );
  }

  // ───────── 通道1：BYOK ─────────
  if (provider && apiKey) {
    const session: AiSessionConfig = {
      provider: provider as AiSessionConfig["provider"],
      apiKey,
      baseURL,
      model,
    };
    try {
      const entry = await callAiForWord(session, word);
      if (!entry) {
        return NextResponse.json<WordLookupResponse>({
          ok: false,
          error: "AI 未找到该单词的有效释义",
        });
      }
      return NextResponse.json<WordLookupResponse>({ ok: true, entry });
    } catch (err) {
      const errorClass = classifyAiError(err);
      const rawError = err instanceof Error ? err.message : String(err);
      const message =
        errorClass === "upstream-auth"
          ? "API Key 无效或权限不足"
          : errorClass === "upstream-payment"
            ? "API 账户余额不足，请充值或更换 API Key"
            : `AI 查询失败：${rawError.slice(0, 100)}`;
      const status =
        errorClass === "upstream-auth"
          ? 401
          : errorClass === "upstream-payment"
            ? 402
            : 500;
      return NextResponse.json<WordLookupResponse>(
        { ok: false, error: message },
        { status }
      );
    }
  }

  // ───────── 通道2：免费通道 ─────────
  if (!clientId) {
    return NextResponse.json<WordLookupResponse>(
      { ok: false, error: "缺少客户端标识" },
      { status: 500 }
    );
  }

  const before = await peekQuota(clientId);
  if (before.remaining <= 0) {
    return NextResponse.json<WordLookupResponse>(
      {
        ok: false,
        error: "今日免费额度已用完，明天再来或配置自己的 API Key",
        quota: before,
      },
      { status: 429 }
    );
  }

  const freeSession = getFreeSession();

  // 尝试调用上游：env 密钥鉴权失败/余额不足时自动回退到内置默认密钥重试
  let entry: WordLookupResponse["entry"] | null = null;
  try {
    entry = await callAiForWord(freeSession, word);
  } catch (err) {
    const errorClass = classifyAiError(err);
    const rawError = err instanceof Error ? err.message : String(err);

    if (
      (errorClass === "upstream-auth" || errorClass === "upstream-payment") &&
      isUsingEnvKey(freeSession)
    ) {
      // env 密钥鉴权失败/余额不足 → 回退到内置默认密钥重试
      console.warn(
        `[ai/word-lookup] env 密钥${errorClass === "upstream-payment" ? "余额不足" : "鉴权失败"}，回退到默认密钥重试:`,
        rawError.slice(0, 120)
      );
      try {
        entry = await callAiForWord(getDefaultKeySession(freeSession), word);
      } catch (err2) {
        const ec2 = classifyAiError(err2);
        const re2 = err2 instanceof Error ? err2.message : String(err2);
        console.warn("[ai/word-lookup] 默认密钥也失败:", re2.slice(0, 200));
        return NextResponse.json<WordLookupResponse>({
          ok: false,
          error:
            ec2 === "upstream-auth"
              ? "免费通道密钥失效，请配置自己的 API Key"
              : ec2 === "upstream-payment"
                ? "AI 服务额度已耗尽，可配置自己的 API Key 继续使用"
                : `AI 暂时不可用：${re2.slice(0, 80)}`,
          quota: before,
          fallback: true,
        });
      }
    } else {
      // 非 auth/payment 错误或默认密钥也失败 → 不消耗额度
      console.warn("[ai/word-lookup] 免费通道失败:", rawError.slice(0, 200));
      return NextResponse.json<WordLookupResponse>({
        ok: false,
        error:
          errorClass === "upstream-auth"
            ? "免费通道密钥失效，请配置自己的 API Key"
            : errorClass === "upstream-payment"
              ? "AI 服务额度已耗尽，可配置自己的 API Key 继续使用"
              : `AI 暂时不可用：${rawError.slice(0, 80)}`,
        quota: before,
        fallback: true,
      });
    }
  }

  if (!entry) {
    // AI 判断不是有效单词 → 不消耗额度
    return NextResponse.json<WordLookupResponse>({
      ok: false,
      error: "AI 未找到该单词的有效释义",
      quota: before,
    });
  }
  // 成功才消耗额度
  const quota = await consumeQuota(clientId);
  return NextResponse.json<WordLookupResponse>({ ok: true, entry, quota });
}
