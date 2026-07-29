import { NextRequest, NextResponse } from "next/server";

/**
 * TTS 代理路由（解决移动端发音无响应问题）
 *
 * 架构（卡帕西视角：移动端 audio.play() 必须在同源 + 手势栈内）：
 * - 服务端代理音频源，避免跨域 + 移动网络不稳定
 * - 多源 fallback：Youdao → Google Translate TTS → 404
 * - Cloudflare CDN 边缘缓存（相同单词只请求一次上游）
 * - 返回 audio/mpeg 字节流，所有浏览器原生支持
 *
 * 用法：GET /api/tts/hello → audio/mpeg 响应
 */

const YOUDAO_URL = "https://dict.youdao.com/dictvoice?audio=";
const GOOGLE_TTS_URL = "https://translate.google.com/translate_tts";

/** 上游请求超时：移动端慢网络也要在 5s 内返回（失败则 fallback） */
const UPSTREAM_TIMEOUT_MS = 5_000;

function fetchWithTimeout(url: string, init: RequestInit = {}): Promise<Response> {
  const signal =
    typeof AbortSignal !== "undefined" && "timeout" in AbortSignal
      ? AbortSignal.timeout(UPSTREAM_TIMEOUT_MS)
      : undefined;
  return fetch(url, { ...init, signal });
}

/** 尝试从 Youdao 获取音频 */
async function fetchFromYoudao(word: string): Promise<ArrayBuffer | null> {
  try {
    const url = `${YOUDAO_URL}${encodeURIComponent(word)}&type=2`;
    const res = await fetchWithTimeout(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; WordFlow/1.0)",
        Referer: "https://dict.youdao.com/",
      },
    });
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    // Youdao 有时返回极小的错误响应（< 100 字节），过滤掉
    if (buf.byteLength < 100) return null;
    return buf;
  } catch {
    return null;
  }
}

/** 尝试从 Google Translate TTS 获取音频 */
async function fetchFromGoogleTTS(word: string): Promise<ArrayBuffer | null> {
  try {
    const url = `${GOOGLE_TTS_URL}?ie=UTF-8&q=${encodeURIComponent(word)}&tl=en&client=tw-ob`;
    const res = await fetchWithTimeout(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; WordFlow/1.0)",
      },
    });
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    if (buf.byteLength < 100) return null;
    return buf;
  } catch {
    return null;
  }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ word: string }> }
) {
  const { word: rawWord } = await params;
  const word = decodeURIComponent(rawWord).trim();

  if (!word || word.length > 100) {
    return NextResponse.json(
      { error: "word 参数无效" },
      { status: 400 }
    );
  }

  // 多源 fallback：Youdao 优先（真人发音质量好），失败则 Google TTS
  let audioBuf = await fetchFromYoudao(word);
  if (!audioBuf) {
    audioBuf = await fetchFromGoogleTTS(word);
  }

  if (!audioBuf) {
    return NextResponse.json(
      { error: "所有 TTS 源均不可用" },
      { status: 502 }
    );
  }

  // 返回音频字节流，带长缓存（单词发音不变）
  return new NextResponse(audioBuf, {
    headers: {
      "Content-Type": "audio/mpeg",
      "Cache-Control": "public, max-age=31536000, s-maxage=31536000, immutable",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
