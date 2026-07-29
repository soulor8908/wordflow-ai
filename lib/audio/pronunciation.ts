/**
 * 统一发音模块（移动端兼容版）
 *
 * 架构（卡帕西视角：手势链必须同步，不可断）：
 * - 移动端（iOS/Android）：HTMLAudioElement 同步 play() 为主路径
 *   - iOS Safari 的 audio.play() 必须在 onClick 同步栈内，任何 await 后的调用都会被静默拒绝
 *   - iOS 18 TTS 声音质量退化 + cancel/speak 竞态，移动端不值得用 TTS
 *   - Android Chrome TTS 冷启动慢（1-3s）+ onend 不触发，体验差
 * - 桌面端：Web Speech API 优先（体验好、离线、零成本），audio 兜底
 *   - 桌面 sticky activation 允许 async 后 fallback audio.play()
 * - 不在 speak 前无脑 cancel（iOS 竞态会静默丢弃新 utterance）
 * - 预热：首次用户交互播静音解锁 iOS audio 通道
 *
 * 关键约束：播放触发（audio.play / speechSynthesis.speak）必须在 speak() 的
 * 第一个 await 之前同步执行，保证 iOS Safari 手势链不断。
 */

export interface PronunciationOptions {
  rate?: number; // 语速，默认 0.9
  force?: boolean; // 强制播放（忽略防抖）
  preferAudio?: boolean; // 优先用有道音频（真人发音）
}

const DEFAULT_RATE = 0.9;
const DEFAULT_PITCH = 1.0;
const DEBOUNCE_MS = 300; // 缩短到 300ms，避免用户快速点击无反馈
const TTS_TIMEOUT_MS = 5000; // TTS 兜底超时（单词很短，5s 足够）
const AUDIO_LOAD_TIMEOUT_MS = 8000; // 音频加载超时（移动端慢网络保护）
const SILENCE_WAV =
  "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=";

// --- 模块级状态 ---
let lastSpokenWord = "";
let lastSpokenTime = 0;
let cachedVoice: SpeechSynthesisVoice | null = null;
let voicesReady = false;
let currentAudio: HTMLAudioElement | null = null;
let audioChannelUnlocked = false;
let unlockInstalled = false;

// --- 平台检测 ---

/** 移动端检测：iOS 或 Android */
function isMobile(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod|Android/i.test(navigator.userAgent);
}

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

// --- TTS 音频源 ---

/**
 * 构建 TTS 代理 URL（同源，解决移动端跨域 + 网络不稳定）。
 * 代理路由服务端 fallback：Youdao → Google Translate TTS。
 */
function buildTtsProxyUrl(word: string): string {
  return `/api/tts/${encodeURIComponent(word)}`;
}

/**
 * 用 TTS 代理音频发音。
 * 关键：audio.play() 在 Promise 执行器内同步触发，保持在用户手势栈内。
 * 返回 Promise<boolean>：true 表示播放完成，false 表示失败。
 *
 * 超时保护：如果 8s 内未开始播放（移动端慢网络），视为失败。
 */
export function speakWithAudio(word: string): Promise<boolean> {
  return new Promise((resolve) => {
    if (!isAudioSupported()) {
      resolve(false);
      return;
    }

    // 取消之前的音频（pause 同步，不会触发 iOS speech 竞态）
    if (currentAudio) {
      try {
        currentAudio.pause();
        currentAudio.onended = null;
        currentAudio.onerror = null;
      } catch {
        // 忽略
      }
      currentAudio = null;
    }

    let settled = false;
    // 加载超时：移动端慢网络下 8s 未播放则放弃
    const loadTimer = setTimeout(() => {
      if (settled) return;
      settled = true;
      if (currentAudio === audio) {
        try { audio.pause(); } catch { /* ignore */ }
        currentAudio = null;
      }
      resolve(false);
    }, AUDIO_LOAD_TIMEOUT_MS);

    let audio: HTMLAudioElement;
    try {
      audio = new Audio(buildTtsProxyUrl(word));
      audio.preload = "auto";
      currentAudio = audio;

      audio.onended = () => {
        if (settled) return;
        settled = true;
        clearTimeout(loadTimer);
        if (currentAudio === audio) currentAudio = null;
        resolve(true);
      };
      audio.onerror = () => {
        if (settled) return;
        settled = true;
        clearTimeout(loadTimer);
        if (currentAudio === audio) currentAudio = null;
        resolve(false);
      };
      // 同步触发 play（必须在用户手势栈内）
      const p = audio.play();
      if (p && typeof p.catch === "function") {
        p.catch(() => {
          if (settled) return;
          settled = true;
          clearTimeout(loadTimer);
          if (currentAudio === audio) currentAudio = null;
          resolve(false);
        });
      }
    } catch {
      if (!settled) {
        settled = true;
        clearTimeout(loadTimer);
      }
      currentAudio = null;
      resolve(false);
    }
  });
}

// --- en-US 语音选择 ---

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

    // 超时兜底：iOS 上 voiceschanged 经常不触发
    setTimeout(() => {
      if (settled) return;
      settled = true;
      window.speechSynthesis.removeEventListener("voiceschanged", handler);
      resolve(window.speechSynthesis.getVoices());
    }, 1000);
  });
}

async function getSelectedVoice(): Promise<SpeechSynthesisVoice | null> {
  if (voicesReady) return cachedVoice;
  if (!isSpeechSupported()) return null;

  const voices = await loadVoices();
  cachedVoice = pickBestVoice(voices);
  voicesReady = true;
  return cachedVoice;
}

/** 后台预热 voice 缓存（不阻塞调用方） */
function warmUpVoices(): void {
  if (voicesReady || !isSpeechSupported()) return;
  void getSelectedVoice();
}

// --- TTS 发音 ---

/**
 * 用 Web Speech API 发音。
 * 关键：speechSynthesis.speak(utterance) 在 Promise 执行器内同步触发。
 * 不在 speak 前无脑 cancel（iOS 竞态会静默丢弃新 utterance）。
 * speak 后立即 resume()（iOS 防御 paused 状态）。
 * 返回 Promise<boolean>：true=播放完成，false=失败。
 */
function speakWithTTS(word: string, rate: number): Promise<boolean> {
  if (!isSpeechSupported()) {
    return Promise.resolve(false);
  }

  // voice 用同步缓存的值；未就绪时不指定（浏览器按 lang 兜底）
  const voice = voicesReady ? cachedVoice : null;

  return new Promise<boolean>((resolve) => {
    let settled = false;
    // 兜底超时：Android Chrome onend 可能不触发，单词很短给 5s
    // 超时视为成功（不 fallback，避免重复播放）
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve(true);
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

      // 同步调用：必须保持在用户手势栈内
      window.speechSynthesis.speak(utterance);
      // iOS Safari 防御：speak 后立即 resume（幂等），防止 paused 状态
      try {
        window.speechSynthesis.resume();
      } catch {
        // 忽略
      }
    } catch {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve(false);
      }
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

// --- 预热 audio 通道（iOS 必需）---

/**
 * 安装首次交互解锁 audio 通道的监听器。
 * iOS Safari 要求 audio.play() 在用户手势内，但首次播放静音音频可"解锁"通道，
 * 之后的 play() 更可靠（仍需手势，但不会被完全拒绝）。
 * 幂等：多次调用只安装一次监听。
 */
export function warmUpAudioChannel(): void {
  if (!isAudioSupported() || typeof document === "undefined") return;
  if (unlockInstalled) return;
  unlockInstalled = true;

  const unlock = () => {
    if (audioChannelUnlocked) return;
    try {
      const a = new Audio(SILENCE_WAV);
      const p = a.play();
      if (p && typeof p.then === "function") {
        p.then(() => {
          a.pause();
          a.currentTime = 0;
          audioChannelUnlocked = true;
        }).catch(() => {
          // 解锁失败，后续真实播放时再尝试
        });
      } else {
        audioChannelUnlocked = true;
      }
    } catch {
      // 忽略
    }
    document.removeEventListener("click", unlock);
    document.removeEventListener("touchend", unlock);
  };
  document.addEventListener("click", unlock);
  document.addEventListener("touchend", unlock);
}

// --- 统一接口 ---

/**
 * 统一发音接口。
 *
 * 关键约束（移动端兼容）：
 * 播放触发（audio.play / speechSynthesis.speak）在第一个 await 之前同步执行，
 * 保证 iOS Safari 手势链不断。
 *
 * 路径选择：
 * - 移动端（iOS/Android）：audio 主路径（TTS 在移动端不可靠）
 * - 桌面端：TTS 优先（体验好），失败 fallback audio（sticky activation 允许 async 后播放）
 * - preferAudio=true：任何平台都走 audio
 *
 * 防抖：同一单词 300ms 内不重复播放（可用 force 跳过）。
 */
export async function speak(
  word: string,
  options?: PronunciationOptions
): Promise<void> {
  if (typeof window === "undefined" || !word) return;

  const rate = options?.rate ?? DEFAULT_RATE;
  const force = options?.force ?? false;
  const preferAudio = options?.preferAudio ?? false;

  // 防抖：同一单词 300ms 内不重复播放
  const now = Date.now();
  if (!force && word === lastSpokenWord && now - lastSpokenTime < DEBOUNCE_MS) {
    return;
  }
  lastSpokenWord = word;
  lastSpokenTime = now;

  // 后台预热 voice（桌面端用，不阻塞）
  warmUpVoices();

  // 移动端或显式 preferAudio：audio 主路径
  // 不走 TTS：iOS 18 声音退化 + cancel 竞态 + Android onend 不触发 + 冷启动慢
  if (isMobile() || preferAudio) {
    await speakWithAudio(word);
    return;
  }

  // 桌面端：TTS 优先，失败 fallback audio
  // 桌面 sticky activation 允许 async 后 audio.play()
  if (isSpeechSupported()) {
    const ok = await speakWithTTS(word, rate);
    if (ok) return;
  }

  // TTS 不可用或失败，用有道音频
  await speakWithAudio(word);
}
