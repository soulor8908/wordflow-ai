/**
 * 统一发音模块（设计文档 §3.3：Web Speech API 优先，有道词典音频兜底）
 *
 * 优先使用 Web Speech API（TTS），不可用或失败时 fallback 到有道词典音频。
 * 提供防抖、en-US 语音自动选择、取消等功能。仅在客户端运行。
 */

export interface PronunciationOptions {
  rate?: number; // 语速，默认 0.9
  force?: boolean; // 强制播放（忽略防抖）
  preferAudio?: boolean; // 优先用有道音频（真人发音）
}

const DEFAULT_RATE = 0.9;
const DEFAULT_PITCH = 1.0;
const DEBOUNCE_MS = 500;
const TTS_TIMEOUT_MS = 5000;

// --- 模块级状态 ---
let lastSpokenWord = "";
let lastSpokenTime = 0;
let cachedVoice: SpeechSynthesisVoice | null = null;
let voicesReady = false;
let currentAudio: HTMLAudioElement | null = null;

// --- 支持检测 ---

/** 判断 Web Speech API（TTS）是否可用 */
export function isSpeechSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "speechSynthesis" in window &&
    typeof window.speechSynthesis.speak === "function"
  );
}

function isAudioSupported(): boolean {
  return typeof window !== "undefined" && typeof Audio !== "undefined";
}

/** 判断发音模块整体是否可用（TTS 或 HTML5 Audio 任一可用即可） */
export function isPronunciationSupported(): boolean {
  return isSpeechSupported() || isAudioSupported();
}

// --- en-US 语音选择 ---

/**
 * 从语音列表中选择最佳的 en-US 英语语音。
 * 优先级：Google > Microsoft > Natural > Samantha/Alex > 其他 en-US
 */
function pickBestVoice(
  voices: SpeechSynthesisVoice[]
): SpeechSynthesisVoice | null {
  const enVoices = voices.filter(
    (v) => v.lang === "en-US" || v.lang.startsWith("en-US")
  );
  if (enVoices.length === 0) return null;

  const preferred = ["Google", "Microsoft", "Natural", "Samantha", "Alex"];
  for (const keyword of preferred) {
    const found = enVoices.find((v) => v.name.includes(keyword));
    if (found) return found;
  }
  return enVoices[0];
}

/**
 * 加载语音列表。语音加载是异步的（onvoiceschanged 事件），需等待。
 * 某些浏览器不触发该事件，加 1s 超时兜底。
 */
function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  return new Promise((resolve) => {
    if (!isSpeechSupported()) {
      resolve([]);
      return;
    }

    const existing = window.speechSynthesis.getVoices();
    if (existing.length > 0) {
      resolve(existing);
      return;
    }

    let settled = false;
    const handler = () => {
      if (settled) return;
      settled = true;
      window.speechSynthesis.removeEventListener("voiceschanged", handler);
      resolve(window.speechSynthesis.getVoices());
    };
    window.speechSynthesis.addEventListener("voiceschanged", handler);

    // 超时兜底：某些浏览器不触发 voiceschanged
    setTimeout(() => {
      if (settled) return;
      settled = true;
      window.speechSynthesis.removeEventListener("voiceschanged", handler);
      resolve(window.speechSynthesis.getVoices());
    }, 1000);
  });
}

/** 获取选中的语音（带缓存，首次调用时异步加载） */
async function getSelectedVoice(): Promise<SpeechSynthesisVoice | null> {
  if (voicesReady) return cachedVoice;
  if (!isSpeechSupported()) return null;

  const voices = await loadVoices();
  cachedVoice = pickBestVoice(voices);
  voicesReady = true;
  return cachedVoice;
}

// --- TTS 发音 ---

/**
 * 用 Web Speech API 发音。
 * 返回 Promise<boolean>：true 表示播放完成，false 表示失败/超时。
 */
async function speakWithTTS(word: string, rate: number): Promise<boolean> {
  if (!isSpeechSupported()) {
    return false;
  }

  const voice = await getSelectedVoice();

  return new Promise<boolean>((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve(false);
    }, TTS_TIMEOUT_MS);

    try {
      const utterance = new SpeechSynthesisUtterance(word);
      utterance.lang = "en-US";
      utterance.rate = rate;
      utterance.pitch = DEFAULT_PITCH;
      if (voice) utterance.voice = voice;

      utterance.onend = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(true);
      };
      utterance.onerror = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(false);
      };

      window.speechSynthesis.speak(utterance);
    } catch {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve(false);
      }
    }
  });
}

// --- 有道词典音频 ---

/**
 * 用有道词典音频发音（兜底）。
 * URL 格式：https://dict.youdao.com/dictvoice?audio={word}&type=2（type=2 美音）
 * 返回 Promise<boolean>：true 表示播放完成，false 表示失败。
 */
export function speakWithAudio(word: string): Promise<boolean> {
  return new Promise((resolve) => {
    if (!isAudioSupported()) {
      resolve(false);
      return;
    }

    // 取消之前的音频
    if (currentAudio) {
      try {
        currentAudio.pause();
      } catch {
        // 忽略
      }
      currentAudio = null;
    }

    try {
      const audio = new Audio(
        `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(word)}&type=2`
      );
      currentAudio = audio;

      audio.onended = () => {
        if (currentAudio === audio) currentAudio = null;
        resolve(true);
      };
      audio.onerror = () => {
        if (currentAudio === audio) currentAudio = null;
        resolve(false);
      };
      audio.play().catch(() => {
        if (currentAudio === audio) currentAudio = null;
        resolve(false);
      });
    } catch {
      currentAudio = null;
      resolve(false);
    }
  });
}

// --- 取消 ---

/** 取消正在进行的发音（TTS + 有道音频） */
export function cancelSpeech(): void {
  if (isSpeechSupported()) {
    try {
      window.speechSynthesis.cancel();
    } catch {
      // 忽略
    }
  }
  if (currentAudio) {
    try {
      currentAudio.pause();
      currentAudio.currentTime = 0;
    } catch {
      // 忽略
    }
    currentAudio = null;
  }
}

// --- 统一接口 ---

/**
 * 统一发音接口。
 * 优先用 Web Speech API，不可用或失败时 fallback 到有道音频。
 * 防抖：同一单词 500ms 内不重复播放（可用 force 跳过）。
 */
export async function speak(
  word: string,
  options?: PronunciationOptions
): Promise<void> {
  if (typeof window === "undefined" || !word) return;

  const rate = options?.rate ?? DEFAULT_RATE;
  const force = options?.force ?? false;
  const preferAudio = options?.preferAudio ?? false;

  // 防抖：同一单词 500ms 内不重复播放
  const now = Date.now();
  if (!force && word === lastSpokenWord && now - lastSpokenTime < DEBOUNCE_MS) {
    return;
  }
  lastSpokenWord = word;
  lastSpokenTime = now;

  // 取消正在进行的发音
  cancelSpeech();

  if (preferAudio) {
    // 优先有道音频，失败 fallback 到 TTS
    const ok = await speakWithAudio(word);
    if (!ok && isSpeechSupported()) {
      await speakWithTTS(word, rate);
    }
    return;
  }

  // 默认：优先 TTS，失败 fallback 到有道音频
  if (isSpeechSupported()) {
    const ok = await speakWithTTS(word, rate);
    if (ok) return;
  }

  // TTS 不可用或失败，用有道音频
  await speakWithAudio(word);
}
