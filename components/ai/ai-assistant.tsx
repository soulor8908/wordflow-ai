"use client";

/**
 * 全局 AI 助手（右下悬浮窗，多轮对话）
 *
 * - 右下角圆形按钮，点击展开聊天面板
 * - 多轮对话，消息持久化于本地（localStorage，不跨设备）
 * - 双通道：
 *   1) BYOK：用户在「我的」页配置自己的 API Key
 *   2) 免费体验：未配置 Key 时使用服务端共享额度（按 clientId 每日限流）
 * - 未配置 AI 时优先用免费额度；额度耗尽或未开放时引导去 /me 配置
 * - 词条页可"问 AI 这个词"，自动注入上下文
 */
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { nanoid } from "nanoid";
import { getAiConfig, type AiConfig } from "@/lib/ai/ai-config";
import { listStudyLogs } from "@/lib/stats/streak-io";
import {
  getActiveBook,
} from "@/lib/review/active-book";
import {
  getBookProgress,
  setBookDailyNew,
  loadBookMeta,
  todayLocalDate,
} from "@/lib/review/book-queue";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChatIcon, CloseIcon } from "@/components/ui/icons";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface QuotaSnapshot {
  used: number;
  total: number;
  remaining: number;
}

const STORAGE_KEY = "wordflow:ai-chat-history";
const CLIENT_ID_KEY = "wordflow:ai-client-id";
const MAX_HISTORY = 50;
/** AI 请求超时（ms）：避免上游慢响应导致一直 loading */
const AI_FETCH_TIMEOUT_MS = 30_000;

/** 带 AbortSignal 超时的 fetch；超时抛出友好错误 */
function fetchWithTimeout(
  input: string,
  init: RequestInit = {}
): Promise<Response> {
  const signal =
    typeof AbortSignal !== "undefined" && "timeout" in AbortSignal
      ? AbortSignal.timeout(AI_FETCH_TIMEOUT_MS)
      : undefined;
  return fetch(input, { ...init, signal });
}

/** 把超时/网络错误转成中文友好提示 */
function friendlyAiError(e: unknown): string {
  if (e instanceof Error) {
    const name = e.name ?? "";
    if (name === "TimeoutError" || name === "AbortError") {
      return `AI 响应超时（${Math.round(AI_FETCH_TIMEOUT_MS / 1000)}s），请检查网络或模型配置后重试`;
    }
    return e.message;
  }
  return "AI 请求失败";
}

function loadHistory(): ChatMessage[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ChatMessage[]) : [];
  } catch {
    return [];
  }
}

function saveHistory(msgs: ChatMessage[]): void {
  if (typeof window === "undefined") return;
  const trimmed = msgs.slice(-MAX_HISTORY);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
}

/** 读取或生成稳定的客户端匿名 ID（用于免费额度限流） */
function getOrCreateClientId(): string {
  if (typeof window === "undefined") return "";
  let id = window.localStorage.getItem(CLIENT_ID_KEY);
  if (!id) {
    id = nanoid(16);
    window.localStorage.setItem(CLIENT_ID_KEY, id);
  }
  return id;
}

export default function AiAssistant() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>(() => loadHistory());
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [config, setConfig] = useState<AiConfig | null>(null);
  const [configChecked, setConfigChecked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** 免费通道是否开放（服务端是否配置了 FREE_AI_API_KEY 或 CF Workers AI） */
  const [freeEnabled, setFreeEnabled] = useState(false);
  /** 免费通道不可用的原因（用于显示准确提示，避免误导性的"加载中"） */
  const [unavailableReason, setUnavailableReason] = useState<string | null>(null);
  /** 免费额度剩余（仅免费通道下有意义） */
  const [quota, setQuota] = useState<QuotaSnapshot | null>(null);
  /** 当前每日新词量（从词书进度读取，快捷动作展示用） */
  const [currentDailyNew, setCurrentDailyNew] = useState<number | null>(null);
  /** 快捷动作"调整每日新词量"输入框 */
  const [dailyNewInput, setDailyNewInput] = useState("");
  /** 快捷动作"调整每日新词量"提交中 */
  const [settingDailyNew, setSettingDailyNew] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const clientIdRef = useRef<string>("");

  // 加载配置 + 查询免费额度
  useEffect(() => {
    let cancelled = false;
    clientIdRef.current = getOrCreateClientId();
    Promise.all([
      getAiConfig().catch(() => null),
      fetchWithTimeout(
        `/api/ai/chat?clientId=${encodeURIComponent(clientIdRef.current)}`
      )
        .then((r) => r.json())
        .catch(() => null),
      // 加载当前词书的每日新词量（用于快捷动作展示）
      getActiveBook()
        .then((active) =>
          active ? getBookProgress(active.bookId) : undefined
        )
        .catch(() => undefined),
    ]).then(([c, q, progress]) => {
      if (cancelled) return;
      setConfig(c);
      setConfigChecked(true);
      if (q && q.ok) {
        setFreeEnabled(!!q.enabled);
        setQuota(q.quota ?? null);
        setUnavailableReason(q.enabled ? null : (q.reason ?? "no-channel"));
      } else {
        // 接口异常也视为不可用
        setUnavailableReason("no-channel");
      }
      if (progress) setCurrentDailyNew(progress.dailyNew);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // 自动滚动到底部
  useEffect(() => {
    if (open) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, open]);

  // 监听 storage 事件，跨标签同步 AI 配置
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === null || e.key.includes("ai-config")) {
        getAiConfig()
          .then((c) => setConfig(c))
          .catch(() => setConfig(null));
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const refreshQuota = useCallback(async () => {
    if (!clientIdRef.current) return;
    try {
      const r = await fetch(
        `/api/ai/chat?clientId=${encodeURIComponent(clientIdRef.current)}`
      );
      const q = await r.json();
      if (q?.ok) {
        setFreeEnabled(!!q.enabled);
        setQuota(q.quota ?? null);
        setUnavailableReason(q.enabled ? null : (q.reason ?? "no-channel"));
      }
    } catch {
      /* 忽略额度查询失败，不阻塞聊天 */
    }
  }, []);

  // 每次打开面板时刷新免费额度（免费通道下显示最新剩余）
  useEffect(() => {
    if (open && !config) {
      refreshQuota();
    }
  }, [open, config, refreshQuota]);

  // Esc 键关闭面板（与遮罩、关闭按钮形成三重关闭方式）
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // 监听跨页"问 AI"事件（如词条页"问 AI 深入联想"按钮触发）
  // 收到事件后自动打开面板并填入预置 prompt，用户可直接发送或修改
  useEffect(() => {
    const onAskAi = (e: Event) => {
      const detail = (e as CustomEvent<{ prompt?: string }>).detail;
      if (!detail?.prompt) return;
      setOpen(true);
      setInput(detail.prompt);
    };
    window.addEventListener("wordflow:ask-ai", onAskAi as EventListener);
    return () =>
      window.removeEventListener("wordflow:ask-ai", onAskAi as EventListener);
  }, []);

  // 是否可用：已配置 BYOK，或免费通道开启且有剩余额度
  const canChat = !!config || (freeEnabled && (quota?.remaining ?? 0) > 0);

  async function handleSend() {
    const text = input.trim();
    if (!text || sending) return;
    if (!config && !canChat) {
      setError("今日免费额度已用完，请配置自己的 API Key");
      return;
    }

    const nextMessages: ChatMessage[] = [
      ...messages,
      { role: "user", content: text },
    ];
    setMessages(nextMessages);
    saveHistory(nextMessages);
    setInput("");
    setSending(true);
    setError(null);

    try {
      const payload: Record<string, unknown> = { messages: nextMessages };
      if (config) {
        // BYOK 通道
        payload.provider = config.provider;
        payload.apiKey = config.apiKey;
        payload.baseURL = config.baseURL;
        payload.model = config.model;
      } else {
        // 免费通道
        payload.clientId = clientIdRef.current;
      }
      const res = await fetchWithTimeout("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      // 免费通道同步剩余额度
      if (data.quota) setQuota(data.quota);
      if (!data.ok) {
        if (data.error === "quota-exhausted") {
          setQuota(data.quota ?? null);
        }
        throw new Error(data.message || "AI 请求失败");
      }
      const updated: ChatMessage[] = [
        ...nextMessages,
        { role: "assistant", content: data.text },
      ];
      setMessages(updated);
      saveHistory(updated);
    } catch (e) {
      const msg = friendlyAiError(e);
      setError(msg);
      // 失败时移除用户消息，避免历史污染
      setMessages(messages);
      saveHistory(messages);
    } finally {
      setSending(false);
    }
  }

  function handleClearHistory() {
    setMessages([]);
    saveHistory([]);
  }

  /**
   * 快捷动作：整理本周学习周报。
   *
   * 客户端直接读取 IndexedDB 中的 StudyLog，截取最近 7 天，
   * 格式化为结构化文本注入 AI prompt，由 AI 生成自然语言周报。
   *
   * 设计取舍：不通过服务端 API 拉数据，避免新增端点 + 鉴权；
   * 数据本就是用户本地的，直接读最快。
   */
  async function handleWeeklyReport() {
    if (sending) return;
    setSending(true);
    setError(null);
    try {
      const logs = await listStudyLogs();
      const today = new Date();
      const sevenDaysAgo = new Date(today);
      sevenDaysAgo.setDate(today.getDate() - 6); // 含今天共 7 天
      const startDate = todayLocalDate(sevenDaysAgo);

      const recent = logs
        .filter((l) => l.date >= startDate)
        .sort((a, b) => a.date.localeCompare(b.date));

      const totalNew = recent.reduce((s, l) => s + l.newCount, 0);
      const totalReview = recent.reduce((s, l) => s + l.reviewCount, 0);
      const totalCorrect = recent.reduce((s, l) => s + l.correctCount, 0);
      const studyDays = recent.length;
      const accuracy =
        totalNew + totalReview > 0
          ? Math.round((totalCorrect / (totalNew + totalReview)) * 100)
          : 0;

      const lines: string[] = [
        `请根据以下学习数据整理本周学习周报，包含：1) 总体表现评价 2) 学习习惯分析 3) 下周建议。要求语气鼓励但具体，避免空话。`,
        ``,
        `【本周学习数据 ${startDate} ~ ${todayLocalDate(today)}】`,
        `学习天数：${studyDays}/7 天`,
        `新学单词：${totalNew} 个`,
        `复习单词：${totalReview} 个`,
        `正确次数：${totalCorrect} 次`,
        `整体正确率：${accuracy}%`,
      ];
      if (recent.length > 0) {
        lines.push(``, `【每日明细】`);
        for (const l of recent) {
          const total = l.newCount + l.reviewCount;
          const acc = total > 0 ? Math.round((l.correctCount / total) * 100) : 0;
          lines.push(`${l.date}：新学 ${l.newCount} · 复习 ${l.reviewCount} · 正确率 ${acc}%`);
        }
      } else {
        lines.push(``, `（本周还没有学习记录，请鼓励用户从今天开始）`);
      }
      const prompt = lines.join("\n");

      const nextMessages: ChatMessage[] = [
        ...messages,
        { role: "user", content: prompt },
      ];
      setMessages(nextMessages);
      saveHistory(nextMessages);
      await sendToAi(nextMessages);
    } catch (e) {
      setError(e instanceof Error ? e.message : "整理周报失败");
    } finally {
      setSending(false);
    }
  }

  /**
   * 快捷动作：调整每日新词量。
   *
   * 直接调用 setBookDailyNew 持久化（1-100 范围限制），
   * 不走 AI——纯设置类操作不应消耗 AI 额度。
   * 完成后在聊天面板显示一条系统消息提示结果。
   */
  async function handleSetDailyNew() {
    if (settingDailyNew) return;
    const n = Number.parseInt(dailyNewInput, 10);
    if (!Number.isFinite(n) || n < 1 || n > 100) {
      setError("请输入 1-100 之间的数字");
      return;
    }
    setSettingDailyNew(true);
    setError(null);
    try {
      const active = await getActiveBook();
      if (!active) {
        setError("请先在首页选择词书");
        return;
      }
      const result = await setBookDailyNew(active.bookId, n);
      if (result === null) {
        setError("词书不存在");
        return;
      }
      setCurrentDailyNew(result);
      const meta = await loadBookMeta(active.bookId);
      const sysMsg: ChatMessage = {
        role: "assistant",
        content: `✓ 已将词书「${meta.name}」的每日新词量调整为 ${result} 个。明天开始生效。`,
      };
      const next = [...messages, sysMsg];
      setMessages(next);
      saveHistory(next);
      setDailyNewInput("");
      setSettingDailyNew(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "设置失败");
    } finally {
      setSettingDailyNew(false);
    }
  }

  /** 内部：发送消息到 AI（提取自 handleSend，便于快捷动作复用） */
  async function sendToAi(history: ChatMessage[]) {
    if (!config && !canChat) {
      setError("今日免费额度已用完，请配置自己的 API Key");
      return;
    }
    setSending(true);
    try {
      const payload: Record<string, unknown> = { messages: history };
      if (config) {
        payload.provider = config.provider;
        payload.apiKey = config.apiKey;
        payload.baseURL = config.baseURL;
        payload.model = config.model;
      } else {
        payload.clientId = clientIdRef.current;
      }
      const res = await fetchWithTimeout("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.quota) setQuota(data.quota);
      if (!data.ok) {
        if (data.error === "quota-exhausted") {
          setQuota(data.quota ?? null);
        }
        throw new Error(data.message || "AI 请求失败");
      }
      const updated: ChatMessage[] = [
        ...history,
        { role: "assistant", content: data.text },
      ];
      setMessages(updated);
      saveHistory(updated);
    } catch (e) {
      const msg = friendlyAiError(e);
      setError(msg);
      setMessages(messages);
      saveHistory(messages);
    } finally {
      setSending(false);
    }
  }

  // 未完成首次检测前不渲染悬浮按钮（避免配置/额度闪烁）
  if (!configChecked) return null;

  return (
    <>
      {/* 悬浮按钮 */}
      <Button
        type="button"
        variant="primary"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "关闭 AI 助手" : "打开 AI 助手"}
        aria-expanded={open}
        className="fixed bottom-20 right-4 z-50 flex h-12 w-12 items-center justify-center rounded-full !px-0 shadow-lg transition-transform hover:scale-105 active:scale-95"
      >
        {open ? (
          <CloseIcon title="关闭" className="h-5 w-5" />
        ) : (
          <ChatIcon title="打开 AI 助手" className="h-5 w-5" />
        )}
      </Button>

      {/* 遮罩层：点击外部关闭面板 */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/30"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* 聊天面板（全屏：宽高 100%） */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex h-full w-full flex-col overflow-hidden bg-white dark:bg-neutral-950"
          role="dialog"
          aria-modal="true"
          aria-label="AI 助手对话"
        >
          {/* 头部 */}
          <div className="flex items-center justify-between border-b border-neutral-100 px-4 py-2.5 dark:border-neutral-900">
            <div className="flex items-center gap-2">
              <ChatIcon
                title="AI 助手"
                className="h-4 w-4 text-blue-600 dark:text-blue-400"
              />
              <span className="text-sm font-medium">AI 助手</span>
              {config ? (
                <span className="rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] text-green-700 dark:bg-green-950 dark:text-green-300">
                  {config.provider}
                </span>
              ) : freeEnabled ? (
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[10px] ${
                    (quota?.remaining ?? 0) > 0
                      ? "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                      : "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
                  }`}
                  title={`今日免费额度：剩余 ${quota?.remaining ?? 0}/${quota?.total ?? 0}`}
                >
                  免费 {quota?.remaining ?? 0}/{quota?.total ?? 0}
                </span>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              {messages.length > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleClearHistory}
                  className="!px-1.5 !py-0 text-[11px] text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
                >
                  清空
                </Button>
              )}
              {/* 设置入口：点击后隐藏聊天框再跳转 */}
              <Link
                href="/me"
                onClick={() => setOpen(false)}
                className="text-[11px] text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
              >
                设置
              </Link>
              {/* 显式关闭按钮（与遮罩、Esc 形成三重关闭方式） */}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setOpen(false)}
                aria-label="关闭"
                className="!px-1.5 !py-0 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
              >
                <CloseIcon title="关闭" className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* 顶部提示条：未配置自己的 API Key 时引导添加（点击隐藏聊天框进入配置页） */}
          {!config && (
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="flex items-center justify-between gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-left text-[11px] text-amber-700 transition-colors hover:bg-amber-100 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300"
            >
              <span>
                {freeEnabled
                  ? `试用中（剩余 ${quota?.remaining ?? 0}/${quota?.total ?? 0} 次）· 添加自己的 API Key 解锁无限对话`
                  : "添加自己的 API Key 即可开始对话"}
              </span>
              <Link
                href="/me"
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen(false);
                }}
                className="shrink-0 font-medium underline underline-offset-2"
              >
                去添加 →
              </Link>
            </button>
          )}

          {/* 消息区 */}
          <div className="flex-1 overflow-y-auto px-3 py-3">
            {/* 免费通道不可用且未配置 BYOK → 显示明确状态（不再用"加载中"误导） */}
            {!config && !freeEnabled && (
              <div className="flex flex-col items-center gap-3 px-4 py-8 text-center">
                <ChatIcon title="AI 助手" className="h-8 w-8 text-neutral-400" />
                <p className="text-sm text-neutral-600 dark:text-neutral-300">
                  AI 助手暂不可用
                </p>
                <p className="text-xs text-neutral-400">
                  {unavailableReason === "cloudflare-unbound"
                    ? "Cloudflare Workers AI 未绑定，请在 wrangler.jsonc 配置 ai binding"
                    : "部署到 Cloudflare 即可免费使用，或在「我的」页配置自己的 API Key"}
                </p>
                <Link
                  href="/me"
                  onClick={() => setOpen(false)}
                  className="mt-1 rounded-lg border border-neutral-300 px-3 py-1.5 text-xs text-neutral-600 hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-900"
                >
                  去配置 API Key →
                </Link>
              </div>
            )}

            {/* 免费额度已耗尽 → 温和引导（可选配置） */}
            {!config && freeEnabled && (quota?.remaining ?? 0) === 0 && messages.length === 0 && (
              <div className="flex flex-col items-center gap-3 px-4 py-8 text-center">
                <ChatIcon title="AI 助手" className="h-8 w-8 text-amber-500" />
                <p className="text-sm text-neutral-600 dark:text-neutral-300">
                  今日免费额度已用完
                </p>
                <p className="text-xs text-neutral-400">
                  明天再来，或在「我的」页配置自己的 API Key 获得无限额度
                </p>
              </div>
            )}

            {/* 欢迎语 */}
            {canChat && messages.length === 0 && (
              <div className="flex flex-col gap-2 px-2 py-4 text-center">
                <p className="text-sm text-neutral-500">你好！我可以帮你：</p>
                <ul className="flex flex-col gap-1 text-xs text-neutral-400">
                  <li>• 讲解单词的释义、搭配、词源</li>
                  <li>• 生成例句并批改你的造句</li>
                  <li>• 给出针对性的学习建议</li>
                </ul>
                <p className="mt-2 text-xs text-neutral-400">
                  试试问：&ldquo;abandon 怎么用？&rdquo;
                </p>
                {!config && freeEnabled && (
                  <p className="mt-1 text-[10px] text-neutral-400">
                    免费体验中：剩余 {quota?.remaining ?? 0}/{quota?.total ?? 0} 次
                  </p>
                )}

                {/* 快捷动作：周报 + 调整每日新词量 */}
                <div className="mt-3 flex flex-col gap-2 border-t border-neutral-100 pt-3 dark:border-neutral-900">
                  <p className="text-[11px] font-medium text-neutral-500">
                    快捷动作
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={handleWeeklyReport}
                      disabled={sending}
                      className="!px-2 !py-1 text-[11px]"
                    >
                      📊 整理本周周报
                    </Button>
                  </div>
                  {/* 每日新词量：显示当前值 + 输入新值 */}
                  <div className="flex flex-col gap-1.5 rounded-lg bg-neutral-50 px-2.5 py-2 dark:bg-neutral-900">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-neutral-500">每日新词量</span>
                      <span className="font-mono text-neutral-700 dark:text-neutral-300">
                        {currentDailyNew ?? "—"}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Input
                        type="number"
                        min={1}
                        max={100}
                        value={dailyNewInput}
                        onChange={(e) => setDailyNewInput(e.target.value)}
                        placeholder="1-100"
                        disabled={settingDailyNew}
                        className="flex-1 !text-xs"
                        aria-label="设置每日新词量"
                      />
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={handleSetDailyNew}
                        disabled={settingDailyNew || !dailyNewInput.trim()}
                        className="!px-2 !py-1 text-[11px]"
                      >
                        {settingDailyNew ? "…" : "保存"}
                      </Button>
                    </div>
                    <p className="text-[10px] text-neutral-400">
                      范围 1-100，明天生效
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* 消息列表 */}
            {messages.map((m, i) => (
              <div
                key={i}
                className={`mb-2 flex ${
                  m.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                <div
                  className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm ${
                    m.role === "user"
                      ? "bg-blue-600 text-white"
                      : "bg-neutral-100 text-neutral-800 dark:bg-neutral-900 dark:text-neutral-200"
                  }`}
                >
                  {m.content}
                </div>
              </div>
            ))}

            {/* 发送中占位 */}
            {sending && (
              <div className="mb-2 flex justify-start">
                <div className="rounded-2xl bg-neutral-100 px-3 py-2 text-sm text-neutral-400 dark:bg-neutral-900">
                  <span className="inline-flex gap-1">
                    <span className="animate-pulse">●</span>
                    <span className="animate-pulse delay-100">●</span>
                    <span className="animate-pulse delay-200">●</span>
                  </span>
                </div>
              </div>
            )}

            {/* 错误提示 */}
            {error && (
              <div className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600 dark:bg-red-950">
                {error}
                {error.includes("额度") && (
                  <Link
                    href="/me"
                    className="ml-1 underline hover:text-red-700 dark:hover:text-red-400"
                  >
                    去配置 →
                  </Link>
                )}
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* 输入区：已配置 BYOK，或免费通道可用时都显示 */}
          {canChat && (
            <div className="border-t border-neutral-100 px-3 py-2.5 dark:border-neutral-900">
              <div className="flex items-end gap-2">
                <Input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  placeholder={
                    config
                      ? "问点什么…（Enter 发送）"
                      : "免费体验中…（Enter 发送）"
                  }
                  disabled={sending}
                  className="flex-1"
                  aria-label="AI 助手输入框"
                />
                <Button
                  type="button"
                  onClick={handleSend}
                  disabled={sending || !input.trim()}
                  size="sm"
                  className="shrink-0"
                >
                  发送
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
