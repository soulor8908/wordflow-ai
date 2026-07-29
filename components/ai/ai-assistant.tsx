"use client";

/**
 * 全局 AI 助手（全屏聊天 + 可拖动悬浮入口按钮）
 *
 * - 右下角圆形悬浮按钮（可拖动到任意位置，位置持久化到 localStorage）
 * - 点击展开全屏聊天面板
 * - 多轮对话，消息持久化于本地（localStorage，不跨设备）
 * - 双通道：BYOK（用户自带 Key）/ 免费体验（服务端共享额度）
 * - 快捷输入：输入框旁闪电图标，点击上拉选择面板，支持增删改
 * - 词条页可"问 AI 这个词"，自动注入上下文
 */
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { nanoid } from "nanoid";
import {
  getAiConfig,
  AI_CONFIG_CHANGED_EVENT,
  type AiConfig,
} from "@/lib/ai/ai-config";
import {
  getActiveBook,
} from "@/lib/review/active-book";
import {
  getBookProgress,
  setBookDailyNew,
  loadBookMeta,
  todayLocalDate,
} from "@/lib/review/book-queue";
import {
  listSessions,
  getSessionMessages,
  createSession,
  appendMessages,
  setSessionMessages,
  deleteSession,
  type ChatMessage,
  type SessionMeta,
} from "@/lib/ai/chat-sessions";
import {
  listQuickInputs,
  addQuickInput,
  updateQuickInput,
  deleteQuickInput,
  type QuickInput,
} from "@/lib/ai/quick-inputs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  ChatIcon,
  CloseIcon,
  MenuIcon,
  BoltIcon,
  EditIcon,
  TrashIcon,
  PlusIcon,
  ChevronRightIcon,
  CopyIcon,
  CheckIcon,
  RefreshIcon,
} from "@/components/ui/icons";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface QuotaSnapshot {
  used: number;
  total: number;
  remaining: number;
}

const CLIENT_ID_KEY = "wordflow:ai-client-id";
const FAB_POS_KEY = "wordflow:ai-fab-pos";
const AI_FETCH_TIMEOUT_MS = 70_000;

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

function getOrCreateClientId(): string {
  if (typeof window === "undefined") return "";
  let id = window.localStorage.getItem(CLIENT_ID_KEY);
  if (!id) {
    id = nanoid(16);
    window.localStorage.setItem(CLIENT_ID_KEY, id);
  }
  return id;
}

/** 读取悬浮按钮持久化位置 */
function loadFabPos(): { x: number; y: number } {
  if (typeof window === "undefined") return { x: -1, y: -1 };
  try {
    const raw = window.localStorage.getItem(FAB_POS_KEY);
    if (!raw) return { x: -1, y: -1 };
    return JSON.parse(raw);
  } catch {
    return { x: -1, y: -1 };
  }
}

export default function AiAssistant() {
  const [open, setOpen] = useState(false);
  const [sessionId, setSessionId] = useState<string>("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessions, setSessions] = useState<SessionMeta[]>([]);
  const [showSessions, setShowSessions] = useState(false);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [config, setConfig] = useState<AiConfig | null>(null);
  const [configChecked, setConfigChecked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [freeEnabled, setFreeEnabled] = useState(false);
  const [unavailableReason, setUnavailableReason] = useState<string | null>(null);
  const [quota, setQuota] = useState<QuotaSnapshot | null>(null);
  const [currentDailyNew, setCurrentDailyNew] = useState<number | null>(null);

  // ── 悬浮按钮拖动 ──
  // 用 left/top 定位（而非 right/bottom），拖动更直观
  // 初始位置从 localStorage 读取（lazy init，避免 effect 内 setState）
  const [fabPos, setFabPos] = useState<{ x: number; y: number }>(() => loadFabPos());
  const fabDragRef = useRef<{ startX: number; startY: number; startPosX: number; startPosY: number; moved: boolean } | null>(null);
  const fabRef = useRef<HTMLButtonElement>(null);

  // ── 快捷输入面板 ──
  const [showQuickInputs, setShowQuickInputs] = useState(false);
  // lazy init: 首次渲染即从 localStorage 读取，避免 effect 内 setState
  const [quickInputs, setQuickInputs] = useState<QuickInput[]>(() => listQuickInputs());
  const [editingQuick, setEditingQuick] = useState<QuickInput | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editPrompt, setEditPrompt] = useState("");

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const clientIdRef = useRef<string>("");

  const refreshSessions = useCallback(() => {
    setSessions(listSessions());
  }, []);

  const refreshQuickInputs = useCallback(() => {
    setQuickInputs(listQuickInputs());
  }, []);

  function switchSession(id: string) {
    setSessionId(id);
    setMessages(getSessionMessages(id));
    setShowSessions(false);
    setError(null);
  }

  function handleNewSession() {
    const id = createSession();
    refreshSessions();
    switchSession(id);
  }

  function handleDeleteSession(id: string) {
    deleteSession(id);
    refreshSessions();
    if (id === sessionId) {
      const remaining = listSessions();
      if (remaining.length > 0) {
        switchSession(remaining[0].id);
      } else {
        handleNewSession();
      }
    }
  }

  // 加载配置 + 查询免费额度 + 加载悬浮按钮位置
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

  function initSessionIfNeeded() {
    refreshSessions();
    if (!sessionId) {
      const list = listSessions();
      if (list.length > 0) {
        switchSession(list[0].id);
      } else {
        handleNewSession();
      }
    }
  }
  const initRef = useRef(initSessionIfNeeded);
  useEffect(() => {
    initRef.current = initSessionIfNeeded;
  });

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

  // 监听同标签页 AI 配置变更事件
  useEffect(() => {
    const onConfigChanged = () => {
      getAiConfig()
        .then((c) => {
          setConfig(c);
          setConfigChecked(true);
        })
        .catch(() => setConfig(null));
    };
    window.addEventListener(AI_CONFIG_CHANGED_EVENT, onConfigChanged);
    return () =>
      window.removeEventListener(AI_CONFIG_CHANGED_EVENT, onConfigChanged);
  }, []);

  // ── 悬浮按钮拖动（mouse + touch 双模态） ──
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const drag = fabDragRef.current;
      if (!drag) return;
      const dx = e.clientX - drag.startX;
      const dy = e.clientY - drag.startY;
      // 判定为拖动（移动超过 4px），避免点击误触
      if (!drag.moved && Math.abs(dx) + Math.abs(dy) > 4) {
        drag.moved = true;
      }
      if (!drag.moved) return;
      const btnSize = 48;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const newX = Math.max(0, Math.min(vw - btnSize, drag.startPosX + dx));
      const newY = Math.max(0, Math.min(vh - btnSize, drag.startPosY + dy));
      setFabPos({ x: newX, y: newY });
    };
    const onTouchMove = (e: TouchEvent) => {
      const drag = fabDragRef.current;
      if (!drag || e.touches.length === 0) return;
      const touch = e.touches[0];
      const dx = touch.clientX - drag.startX;
      const dy = touch.clientY - drag.startY;
      if (!drag.moved && Math.abs(dx) + Math.abs(dy) > 4) {
        drag.moved = true;
      }
      if (!drag.moved) return;
      e.preventDefault(); // 阻止页面滚动
      const btnSize = 48;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const newX = Math.max(0, Math.min(vw - btnSize, drag.startPosX + dx));
      const newY = Math.max(0, Math.min(vh - btnSize, drag.startPosY + dy));
      setFabPos({ x: newX, y: newY });
    };
    const onUp = () => {
      const drag = fabDragRef.current;
      if (drag) {
        // 拖动结束后持久化位置
        if (drag.moved) {
          try {
            window.localStorage.setItem(FAB_POS_KEY, JSON.stringify(fabPos));
          } catch {
            /* ignore */
          }
        }
      }
      fabDragRef.current = null;
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    document.addEventListener("touchmove", onTouchMove, { passive: false });
    document.addEventListener("touchend", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onUp);
    };
  }, [fabPos]);

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
      /* 忽略 */
    }
  }, []);

  useEffect(() => {
    if (open && !config) {
      refreshQuota();
    }
  }, [open, config, refreshQuota]);

  // Esc 键关闭
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (showQuickInputs) {
          setShowQuickInputs(false);
        } else if (showSessions) {
          setShowSessions(false);
        } else {
          setOpen(false);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, showQuickInputs, showSessions]);

  // 监听跨页"问 AI"事件
  useEffect(() => {
    const onAskAi = (e: Event) => {
      const detail = (e as CustomEvent<{ prompt?: string }>).detail;
      if (!detail?.prompt) return;
      initRef.current();
      setOpen(true);
      setInput(detail.prompt);
    };
    window.addEventListener("wordflow:ask-ai", onAskAi as EventListener);
    return () =>
      window.removeEventListener("wordflow:ask-ai", onAskAi as EventListener);
  }, []);

  const canChat = !!config || (freeEnabled && (quota?.remaining ?? 0) > 0);

  async function handleSend() {
    const text = input.trim();
    if (!text || sending) return;
    if (!config && !canChat) {
      setError("今日免费额度已用完，请配置自己的 API Key");
      return;
    }

    // 智能拦截：纯数字 1-100 + 上下文提到"每日新词量" → 直接落库
    const pureNum = Number.parseInt(text, 10);
    if (
      Number.isFinite(pureNum) &&
      pureNum >= 1 &&
      pureNum <= 100 &&
      /^\d+$/.test(text)
    ) {
      const recentContext = messages
        .slice(-4)
        .map((m) => m.content)
        .join(" ");
      if (
        recentContext.includes("每日新词量") ||
        recentContext.includes("每日新词")
      ) {
        const active = await getActiveBook().catch(() => null);
        if (active) {
          const result = await setBookDailyNew(active.bookId, pureNum).catch(
            () => null
          );
          if (result !== null) {
            setCurrentDailyNew(result);
            const userMsg: ChatMessage = { role: "user", content: text };
            const sysMsg: ChatMessage = {
              role: "assistant",
              content: `✓ 已将每日新词量调整为 ${result} 个，明天开始生效。`,
            };
            const next = [...messages, userMsg, sysMsg];
            setMessages(next);
            appendMessages(sessionId, [userMsg, sysMsg]);
            refreshSessions();
            setInput("");
            return;
          }
        }
      }
    }

    const userMsg: ChatMessage = { role: "user", content: text };
    const nextMessages: ChatMessage[] = [...messages, userMsg];
    setMessages(nextMessages);
    appendMessages(sessionId, [userMsg]);
    refreshSessions();
    setInput("");
    setShowQuickInputs(false);
    setSending(true);
    setError(null);

    let fullText = "";
    try {
      const payload: Record<string, unknown> = { messages: nextMessages };
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

      // 非流式响应（错误或 fallback 返回 JSON）
      const contentType = res.headers.get("content-type") ?? "";
      if (contentType.includes("application/json")) {
        const data = await res.json();
        if (data.quota) setQuota(data.quota);
        if (!data.ok) {
          if (data.error === "quota-exhausted") {
            setQuota(data.quota ?? null);
          }
          throw new Error(data.message || "AI 请求失败");
        }
        if (data.fallback) {
          // fallback：AI 通道不可用，但仍展示兜底引导文案（不丢用户消息）
          const aiMsg: ChatMessage = { role: "assistant", content: data.text };
          const updated: ChatMessage[] = [...nextMessages, aiMsg];
          setMessages(updated);
          appendMessages(sessionId, [aiMsg]);
          refreshSessions();
          // 同时展示提示（不阻塞对话流）
          setError("AI 通道暂不可用，以下为离线引导回复。配置 API Key 后可获得完整 AI 对话");
        } else {
          const aiMsg: ChatMessage = { role: "assistant", content: data.text };
          const updated: ChatMessage[] = [...nextMessages, aiMsg];
          setMessages(updated);
          appendMessages(sessionId, [aiMsg]);
          refreshSessions();
        }
      } else {
        // 流式响应（NDJSON：每行一个 JSON）
        if (!res.body) throw new Error("AI 返回了空响应");

        // 先 push 一条空 assistant 消息，流式增量更新
        let currentMessages: ChatMessage[] = [
          ...nextMessages,
          { role: "assistant", content: "" },
        ];
        setMessages(currentMessages);

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            try {
              const parsed = JSON.parse(trimmed);
              if (parsed.type === "meta" && parsed.quota) {
                setQuota(parsed.quota);
              } else if (parsed.type === "delta" && parsed.content) {
                fullText += parsed.content;
                currentMessages = [
                  ...currentMessages.slice(0, -1),
                  { role: "assistant", content: fullText },
                ];
                setMessages(currentMessages);
              } else if (parsed.type === "error") {
                throw new Error(parsed.message || "AI 流式响应出错");
              }
            } catch (e) {
              if (e instanceof Error && e.message.includes("流式")) throw e;
            }
          }
        }

        // 流结束后持久化
        if (fullText) {
          appendMessages(sessionId, [
            { role: "assistant", content: fullText },
          ]);
          refreshSessions();
        }
      }
    } catch (e) {
      const msg = friendlyAiError(e);
      setError(msg);
      if (!fullText) {
        // 没收到任何文本，回滚到原始消息
        setMessages(messages);
        setSessionMessages(sessionId, messages);
      } else {
        // 有部分文本，保留并持久化
        appendMessages(sessionId, [
          { role: "assistant", content: fullText },
        ]);
        refreshSessions();
      }
      refreshSessions();
    } finally {
      setSending(false);
    }
  }

  function handleClearHistory() {
    setMessages([]);
    setSessionMessages(sessionId, []);
    refreshSessions();
  }

  // ── 消息操作：复制 / 刷新 / 删除 ──
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  /** 复制单条消息内容到剪贴板 */
  async function handleCopyMessage(idx: number) {
    const msg = messages[idx];
    if (!msg) return;
    try {
      await navigator.clipboard.writeText(msg.content);
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx(null), 1500);
    } catch {
      // clipboard API 不可用时降级
      const ta = document.createElement("textarea");
      ta.value = msg.content;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); } catch { /* ignore */ }
      document.body.removeChild(ta);
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx(null), 1500);
    }
  }

  /** 刷新：重新发送最后一条用户消息 */
  async function handleRefreshLast() {
    if (sending) return;
    // 找到最后一条用户消息
    const lastUserIdx = [...messages].reverse().findIndex((m) => m.role === "user");
    if (lastUserIdx === -1) return;
    const realIdx = messages.length - 1 - lastUserIdx;
    const lastUserMsg = messages[realIdx];
    // 移除该用户消息之后的所有消息（包括对应的 AI 回复）
    const trimmed = messages.slice(0, realIdx);
    setMessages(trimmed);
    setSessionMessages(sessionId, trimmed);
    refreshSessions();
    // 将用户消息重新填入输入框并发送
    setInput(lastUserMsg.content);
    // 下一帧触发发送（确保 input state 已更新）
    setTimeout(() => {
      handleSendWithText(lastUserMsg.content, trimmed);
    }, 0);
  }

  /** 用指定文本发送（供刷新功能复用） */
  async function handleSendWithText(text: string, baseMessages: ChatMessage[]) {
    if (!text.trim() || sending) return;
    const userMsg: ChatMessage = { role: "user", content: text.trim() };
    const nextMessages: ChatMessage[] = [...baseMessages, userMsg];
    setMessages(nextMessages);
    appendMessages(sessionId, [userMsg]);
    refreshSessions();
    setInput("");
    setShowQuickInputs(false);
    setSending(true);
    setError(null);

    let fullText = "";
    try {
      const payload: Record<string, unknown> = { messages: nextMessages };
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

      const contentType = res.headers.get("content-type") ?? "";
      if (contentType.includes("application/json")) {
        const data = await res.json();
        if (data.quota) setQuota(data.quota);
        if (!data.ok) {
          if (data.error === "quota-exhausted") {
            setQuota(data.quota ?? null);
          }
          throw new Error(data.message || "AI 请求失败");
        }
        if (data.fallback) {
          const aiMsg: ChatMessage = { role: "assistant", content: data.text };
          const updated: ChatMessage[] = [...nextMessages, aiMsg];
          setMessages(updated);
          appendMessages(sessionId, [aiMsg]);
          refreshSessions();
          setError("AI 通道暂不可用，以下为离线引导回复。配置 API Key 后可获得完整 AI 对话");
        } else {
          const aiMsg: ChatMessage = { role: "assistant", content: data.text };
          const updated: ChatMessage[] = [...nextMessages, aiMsg];
          setMessages(updated);
          appendMessages(sessionId, [aiMsg]);
          refreshSessions();
        }
      } else {
        if (!res.body) throw new Error("AI 返回了空响应");
        let currentMessages: ChatMessage[] = [
          ...nextMessages,
          { role: "assistant", content: "" },
        ];
        setMessages(currentMessages);
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            try {
              const parsed = JSON.parse(trimmed);
              if (parsed.type === "meta" && parsed.quota) {
                setQuota(parsed.quota);
              } else if (parsed.type === "delta" && parsed.content) {
                fullText += parsed.content;
                currentMessages = [
                  ...currentMessages.slice(0, -1),
                  { role: "assistant", content: fullText },
                ];
                setMessages(currentMessages);
              } else if (parsed.type === "error") {
                throw new Error(parsed.message || "AI 流式响应出错");
              }
            } catch (e) {
              if (e instanceof Error && e.message.includes("流式")) throw e;
            }
          }
        }
        if (fullText) {
          appendMessages(sessionId, [{ role: "assistant", content: fullText }]);
          refreshSessions();
        }
      }
    } catch (e) {
      const msg = friendlyAiError(e);
      setError(msg);
      if (!fullText) {
        setMessages(nextMessages.slice(0, -1));
        setSessionMessages(sessionId, nextMessages.slice(0, -1));
      } else {
        appendMessages(sessionId, [{ role: "assistant", content: fullText }]);
        refreshSessions();
      }
      refreshSessions();
    } finally {
      setSending(false);
    }
  }

  /** 删除单条消息 */
  function handleDeleteMessage(idx: number) {
    const next = messages.filter((_, i) => i !== idx);
    setMessages(next);
    setSessionMessages(sessionId, next);
    refreshSessions();
  }

  /** 快捷输入：选择一条注入输入框 */
  async function handleSelectQuickInput(qi: QuickInput) {
    setShowQuickInputs(false);

    // 内置快捷输入需要动态注入上下文数据
    if (qi.id === "builtin-report") {
      // 整理周报：读取本周学习数据注入 prompt
      try {
        const { listStudyLogs } = await import("@/lib/stats/streak-io");
        const logs = await listStudyLogs();
        const today = new Date();
        const sevenDaysAgo = new Date(today);
        sevenDaysAgo.setDate(today.getDate() - 6);
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
          qi.prompt,
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
        }
        setInput(lines.join("\n"));
      } catch {
        setInput(qi.prompt);
      }
      return;
    }

    if (qi.id === "builtin-daily") {
      // 调整词量：注入当前设置信息
      try {
        const active = await getActiveBook();
        const bookName = active ? (await loadBookMeta(active.bookId).catch(() => null))?.name : null;
        const prompt = [
          qi.prompt,
          ``,
          `当前词书：${bookName ?? "未选择"}`,
          `当前每日新词量：${currentDailyNew ?? "未设置"} 个`,
          ``,
          `请根据我的学习情况给出建议，并询问我想要设置为多少（范围 1-100）。`,
        ].join("\n");
        setInput(prompt);
      } catch {
        setInput(qi.prompt);
      }
      return;
    }

    setInput(qi.prompt);
  }

  /** 快捷输入：保存编辑/新增 */
  function handleSaveQuickInput() {
    const label = editLabel.trim();
    const prompt = editPrompt.trim();
    if (!label || !prompt) return;
    if (editingQuick && !editingQuick.builtin) {
      updateQuickInput(editingQuick.id, label, prompt);
    } else if (editingQuick && editingQuick.builtin) {
      // 预置项也可编辑 prompt
      updateQuickInput(editingQuick.id, label, prompt);
    } else {
      addQuickInput(label, prompt);
    }
    refreshQuickInputs();
    setEditingQuick(null);
    setEditLabel("");
    setEditPrompt("");
  }

  /** 快捷输入：开始编辑 */
  function handleEditQuickInput(qi: QuickInput) {
    setEditingQuick(qi);
    setEditLabel(qi.label);
    setEditPrompt(qi.prompt);
  }

  /** 快捷输入：删除 */
  function handleDeleteQuickInput(id: string) {
    deleteQuickInput(id);
    refreshQuickInputs();
  }

  /** 快捷输入：开始新增 */
  function handleAddQuickInput() {
    setEditingQuick(null);
    setEditLabel("");
    setEditPrompt("");
  }

  // 未完成首次检测前不渲染
  if (!configChecked) return null;

  // 计算悬浮按钮位置（默认右下角）
  const fabStyle: React.CSSProperties =
    fabPos.x >= 0 && fabPos.y >= 0
      ? { left: `${fabPos.x}px`, top: `${fabPos.y}px` }
      : { right: "16px", bottom: "80px" };

  return (
    <>
      {/* 悬浮入口按钮（可拖动） */}
      <Button
        ref={fabRef}
        type="button"
        variant="primary"
        onClick={() => {
          // fabDragRef.moved === true 时是拖动结束，不触发 click
          if (fabDragRef.current?.moved) {
            fabDragRef.current.moved = false;
            return;
          }
          if (open) {
            setOpen(false);
            return;
          }
          initSessionIfNeeded();
          setOpen(true);
        }}
        aria-label={open ? "关闭 AI 助手" : "打开 AI 助手"}
        aria-expanded={open}
        className="fixed z-50 flex h-12 w-12 touch-none items-center justify-center rounded-full !px-0 shadow-lg transition-transform hover:scale-105 active:scale-95"
        style={fabStyle}
        onMouseDown={(e) => {
          // 记录拖动起点
          const rect = e.currentTarget.getBoundingClientRect();
          fabDragRef.current = {
            startX: e.clientX,
            startY: e.clientY,
            startPosX: rect.left,
            startPosY: rect.top,
            moved: false,
          };
          document.body.style.userSelect = "none";
        }}
        onTouchStart={(e) => {
          // 移动端拖动起点
          if (e.touches.length === 0) return;
          const touch = e.touches[0];
          const rect = e.currentTarget.getBoundingClientRect();
          fabDragRef.current = {
            startX: touch.clientX,
            startY: touch.clientY,
            startPosX: rect.left,
            startPosY: rect.top,
            moved: false,
          };
        }}
      >
        {open ? (
          <CloseIcon title="关闭" className="h-5 w-5" />
        ) : (
          <ChatIcon title="打开 AI 助手" className="h-5 w-5" />
        )}
      </Button>

      {/* 全屏聊天面板 */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex flex-col bg-white dark:bg-neutral-950"
          role="dialog"
          aria-modal="true"
          aria-label="AI 助手对话"
        >
          {/* 头部 */}
          <div className="flex items-center justify-between border-b border-neutral-100 px-4 py-3 dark:border-neutral-800">
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  refreshSessions();
                  setShowSessions(true);
                }}
                aria-label="历史会话"
                className="!px-1.5 !py-0 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
              >
                <MenuIcon title="历史会话" className="h-5 w-5" />
              </Button>
              <span className="select-none text-base font-medium">AI 助手</span>
              {config ? (
                <span className="select-none rounded-full bg-green-100 px-2 py-0.5 text-[10px] text-green-700 dark:bg-green-950 dark:text-green-300">
                  {config.provider}
                </span>
              ) : freeEnabled ? (
                <span
                  className={`select-none rounded-full px-2 py-0.5 text-[10px] ${
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
            <div className="flex items-center gap-1.5">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleNewSession}
                className="!px-2 !py-0 text-xs text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
              >
                + 新对话
              </Button>
              {messages.length > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleClearHistory}
                  className="!px-2 !py-0 text-xs text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
                >
                  清空
                </Button>
              )}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setOpen(false)}
                aria-label="关闭"
                className="!px-1.5 !py-0 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
              >
                <CloseIcon title="关闭" className="h-5 w-5" />
              </Button>
            </div>
          </div>

          {/* 会话列表抽屉 */}
          {showSessions && (
            <div
              className="absolute inset-0 z-50 flex"
              role="dialog"
              aria-modal="true"
              aria-label="历史会话"
            >
              <div
                className="flex-1 bg-black/30"
                onClick={() => setShowSessions(false)}
              />
              <div className="flex w-72 max-w-[80%] flex-col bg-white dark:bg-neutral-950">
                <div className="flex items-center justify-between border-b border-neutral-100 px-3 py-2.5 dark:border-neutral-900">
                  <span className="text-sm font-medium">历史会话</span>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={handleNewSession}
                      className="!px-2 !py-0.5 text-[11px]"
                    >
                      + 新建
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowSessions(false)}
                      aria-label="关闭"
                      className="!px-1.5 !py-0"
                    >
                      <CloseIcon title="关闭" className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto">
                  {sessions.length === 0 ? (
                    <p className="px-3 py-6 text-center text-xs text-neutral-400">
                      还没有历史会话
                    </p>
                  ) : (
                    <ul className="flex flex-col">
                      {sessions.map((s) => (
                        <li key={s.id}>
                          <div
                            className={`group flex items-center justify-between gap-2 px-3 py-2.5 text-sm hover:bg-neutral-50 dark:hover:bg-neutral-900 ${
                              s.id === sessionId
                                ? "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300"
                                : ""
                            }`}
                          >
                            <Button
                              type="button"
                              variant="plain"
                              onClick={() => switchSession(s.id)}
                              className="flex-1 !flex-col !items-start !justify-start"
                            >
                              <span className="block w-full truncate text-left">{s.title}</span>
                              <span className="mt-0.5 block text-left text-[10px] text-neutral-400">
                                {new Date(s.updatedAt).toLocaleString("zh-CN")}
                                {" · "}
                                {s.messageCount} 条
                              </span>
                            </Button>
                            <Button
                              type="button"
                              variant="plain"
                              size="iconSm"
                              onClick={() => handleDeleteSession(s.id)}
                              aria-label="删除会话"
                              className="shrink-0 !text-neutral-300 opacity-0 transition-opacity hover:!text-red-500 group-hover:opacity-100"
                            >
                              ×
                            </Button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* 顶部提示条 */}
          {!config && (
            <div
              role="button"
              tabIndex={0}
              onClick={() => setOpen(false)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setOpen(false);
                }
              }}
              className="flex cursor-pointer items-center justify-between gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-left text-xs text-amber-700 transition-colors hover:bg-amber-100 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300"
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
                去添加 <ChevronRightIcon className="inline h-3 w-3" />
              </Link>
            </div>
          )}

          {/* 消息区 */}
          <div className="flex-1 overflow-y-auto px-4 py-4">
            {!config && !freeEnabled && (
              <div className="flex flex-col items-center gap-3 px-4 py-8 text-center">
                <ChatIcon title="AI 助手" className="h-8 w-8 text-neutral-400" />
                <p className="text-sm text-neutral-600 dark:text-neutral-300">
                  AI 助手暂不可用
                </p>
                <p className="text-xs text-neutral-400">
                  {unavailableReason === "no-channel"
                    ? "服务端未配置免费 AI 通道（FREE_AI_API_KEY），请在「我的」页配置自己的 API Key"
                    : "部署到 Cloudflare 并配置 FREE_AI_API_KEY 即可免费使用，或在「我的」页配置自己的 API Key"}
                </p>
                <Link
                  href="/me"
                  onClick={() => setOpen(false)}
                  className="mt-1 rounded-lg border border-neutral-300 px-3 py-1.5 text-xs text-neutral-600 hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-900"
                >
                  去配置 API Key <ChevronRightIcon className="inline h-3 w-3" />
                </Link>
              </div>
            )}

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
                <p className="mt-3 text-[11px] text-neutral-400">
                  点击输入框旁的闪电图标使用快捷输入
                </p>
              </div>
            )}

            {/* 消息列表 */}
            {messages.map((m, i) => (
              <div
                key={i}
                className={`mb-2 flex flex-col ${
                  m.role === "user" ? "items-end" : "items-start"
                }`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                    m.role === "user"
                      ? "bg-blue-600 text-white"
                      : "bg-neutral-100 text-neutral-800 dark:bg-neutral-900 dark:text-neutral-200"
                  }`}
                >
                  {m.role === "assistant" ? (
                    <div className="leading-relaxed [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1 [&_li]:ml-4 [&_code]:rounded [&_code]:bg-neutral-200 [&_code]:px-1 dark:[&_code]:bg-neutral-700 [&_pre]:overflow-x-auto [&_a]:text-blue-600 [&_a]:underline">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {m.content}
                      </ReactMarkdown>
                    </div>
                  ) : (
                    <span className="whitespace-pre-wrap">{m.content}</span>
                  )}
                </div>
                {/* 消息操作栏：复制 / 刷新 / 删除 */}
                {m.role === "assistant" && m.content && (
                  <div className="mt-0.5 flex items-center gap-1 px-1">
                    <Button
                      type="button"
                      variant="plain"
                      onClick={() => handleCopyMessage(i)}
                      aria-label="复制"
                      className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] !text-neutral-400 hover:!bg-neutral-100 hover:!text-neutral-600 dark:hover:!bg-neutral-800 dark:hover:!text-neutral-300"
                    >
                      {copiedIdx === i ? (
                        <>
                          <CheckIcon className="h-3 w-3 text-green-500" />
                          <span className="text-green-500">已复制</span>
                        </>
                      ) : (
                        <>
                          <CopyIcon className="h-3 w-3" />
                          <span>复制</span>
                        </>
                      )}
                    </Button>
                    {/* 刷新：仅最后一条 assistant 消息显示 */}
                    {i === messages.length - 1 && (
                      <Button
                        type="button"
                        variant="plain"
                        onClick={handleRefreshLast}
                        disabled={sending}
                        aria-label="重新生成"
                        className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] !text-neutral-400 hover:!bg-neutral-100 hover:!text-neutral-600 disabled:opacity-40 dark:hover:!bg-neutral-800 dark:hover:!text-neutral-300"
                      >
                        <RefreshIcon className="h-3 w-3" />
                        <span>刷新</span>
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="plain"
                      onClick={() => handleDeleteMessage(i)}
                      aria-label="删除"
                      className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] !text-neutral-400 hover:!bg-neutral-100 hover:!text-red-500 dark:hover:!bg-neutral-800"
                    >
                      <TrashIcon className="h-3 w-3" />
                      <span>删除</span>
                    </Button>
                  </div>
                )}
              </div>
            ))}

            {sending && (messages.length === 0 || messages[messages.length - 1]?.role !== "assistant" || (messages[messages.length - 1]?.content ?? "") === "") && (
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

            {error && (
              <div className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600 dark:bg-red-950">
                {error}
                {error.includes("额度") && (
                  <Link
                    href="/me"
                    onClick={() => setOpen(false)}
                    className="ml-1 underline hover:text-red-700 dark:hover:text-red-400"
                  >
                    去配置 <ChevronRightIcon className="inline h-3 w-3" />
                  </Link>
                )}
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* 快捷输入面板（上拉） */}
          {showQuickInputs && canChat && (
            <div className="absolute bottom-0 left-0 right-0 z-50 max-h-[60vh] overflow-y-auto rounded-t-2xl border-t border-neutral-200 bg-white shadow-2xl dark:border-neutral-800 dark:bg-neutral-950">
              <div className="flex items-center justify-between border-b border-neutral-100 px-4 py-3 dark:border-neutral-900">
                <span className="text-sm font-medium">快捷输入</span>
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={handleAddQuickInput}
                    className="!px-2 !py-0.5 text-[11px]"
                  >
                    <PlusIcon title="新增" className="mr-1 inline h-3 w-3" />
                    新增
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowQuickInputs(false)}
                    aria-label="关闭"
                    className="!px-1.5 !py-0"
                  >
                    <CloseIcon title="关闭" className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* 编辑/新增表单 */}
              {(editingQuick || editLabel || editPrompt) && (
                <div className="border-b border-neutral-100 px-4 py-3 dark:border-neutral-900">
                  <div className="mb-2 flex flex-col gap-2">
                    <Input
                      value={editLabel}
                      onChange={(e) => setEditLabel(e.target.value)}
                      placeholder="标签名（如：讲解词根）"
                      aria-label="快捷输入标签名"
                      className="text-sm"
                    />
                    <Textarea
                      value={editPrompt}
                      onChange={(e) => setEditPrompt(e.target.value)}
                      placeholder="注入到输入框的内容…"
                      aria-label="快捷输入提示词内容"
                      rows={2}
                    />
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="primary"
                        size="sm"
                        onClick={handleSaveQuickInput}
                        disabled={!editLabel.trim() || !editPrompt.trim()}
                        className="!px-3 !py-1 text-xs"
                      >
                        保存
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEditingQuick(null);
                          setEditLabel("");
                          setEditPrompt("");
                        }}
                        className="!px-3 !py-1 text-xs"
                      >
                        取消
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* 快捷输入列表 */}
              <ul className="flex flex-col">
                {quickInputs.map((qi) => (
                  <li
                    key={qi.id}
                    className="group flex items-center justify-between gap-2 border-b border-neutral-50 px-4 py-3 hover:bg-neutral-50 dark:border-neutral-900 dark:hover:bg-neutral-900"
                  >
                    <Button
                      type="button"
                      variant="plain"
                      onClick={() => handleSelectQuickInput(qi)}
                      className="flex-1 !flex-col !items-start !justify-start"
                    >
                      <span className="block w-full text-left text-sm font-medium text-neutral-700 dark:text-neutral-300">
                        {qi.label}
                        {qi.builtin && (
                          <span className="ml-2 rounded-full bg-neutral-100 px-1.5 py-0.5 text-[9px] text-neutral-400 dark:bg-neutral-800">
                            预置
                          </span>
                        )}
                      </span>
                      <span className="mt-0.5 block w-full truncate text-left text-xs text-neutral-400">
                        {qi.prompt}
                      </span>
                    </Button>
                    <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      <Button
                        type="button"
                        variant="plain"
                        size="iconSm"
                        onClick={() => handleEditQuickInput(qi)}
                        aria-label="编辑"
                        className="!text-neutral-400 hover:!text-blue-500"
                      >
                        <EditIcon title="编辑" className="h-4 w-4" />
                      </Button>
                      {!qi.builtin && (
                        <Button
                          type="button"
                          variant="plain"
                          size="iconSm"
                          onClick={() => handleDeleteQuickInput(qi.id)}
                          aria-label="删除"
                          className="!text-neutral-400 hover:!text-red-500"
                        >
                          <TrashIcon title="删除" className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* 输入区 */}
          {canChat && (
            <div className="border-t border-neutral-100 px-4 py-3 dark:border-neutral-900">
              <div className="flex items-center gap-2">
                {/* 快捷输入图标 */}
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setShowQuickInputs(!showQuickInputs)}
                  aria-label="快捷输入"
                  className="shrink-0 h-11 w-11 !p-0"
                >
                  <BoltIcon
                    title="快捷输入"
                    className={`h-5 w-5 ${showQuickInputs ? "text-blue-500" : "text-neutral-400"}`}
                  />
                </Button>
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
                  className="flex-1 !py-2.5"
                  aria-label="AI 助手输入框"
                />
                <Button
                  type="button"
                  onClick={handleSend}
                  disabled={sending || !input.trim()}
                  className="shrink-0 h-11 !px-4"
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
