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
import {
  getAiConfig,
  AI_CONFIG_CHANGED_EVENT,
  type AiConfig,
} from "@/lib/ai/ai-config";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChatIcon, CloseIcon, MenuIcon } from "@/components/ui/icons";

interface QuotaSnapshot {
  used: number;
  total: number;
  remaining: number;
}

const CLIENT_ID_KEY = "wordflow:ai-client-id";
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
  /** 当前会话 id（首次打开时自动创建一个新会话） */
  const [sessionId, setSessionId] = useState<string>("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  /** 会话列表（侧边抽屉展示，按 updatedAt 降序） */
  const [sessions, setSessions] = useState<SessionMeta[]>([]);
  /** 是否展示会话列表抽屉 */
  const [showSessions, setShowSessions] = useState(false);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [config, setConfig] = useState<AiConfig | null>(null);
  const [configChecked, setConfigChecked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** 免费通道是否开放（服务端是否配置了 FREE_AI_API_KEY） */
  const [freeEnabled, setFreeEnabled] = useState(false);
  /** 免费通道不可用的原因（用于显示准确提示，避免误导性的"加载中"） */
  const [unavailableReason, setUnavailableReason] = useState<string | null>(null);
  /** 免费额度剩余（仅免费通道下有意义） */
  const [quota, setQuota] = useState<QuotaSnapshot | null>(null);
  /** 当前每日新词量（从词书进度读取，快捷动作展示用） */
  const [currentDailyNew, setCurrentDailyNew] = useState<number | null>(null);
  /**
   * 浮窗拖动位置（相对视口 right/bottom 偏移量）。
   * 默认靠右下角（right=16, bottom=88，避开悬浮按钮）。
   * 拖动时通过 mousedown/mousemove/mouseup 更新。
   */
  const [panelPos, setPanelPos] = useState<{ right: number; bottom: number }>({
    right: 16,
    bottom: 88,
  });
  /** 拖动中的临时状态（ref 避免 re-render 抖动） */
  const dragRef = useRef<{
    startX: number;
    startY: number;
    startRight: number;
    startBottom: number;
  } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const clientIdRef = useRef<string>("");

  /** 刷新会话列表 */
  const refreshSessions = useCallback(() => {
    setSessions(listSessions());
  }, []);

  /** 切换到指定会话 */
  function switchSession(id: string) {
    setSessionId(id);
    setMessages(getSessionMessages(id));
    setShowSessions(false);
    setError(null);
  }

  /** 新建会话 */
  function handleNewSession() {
    const id = createSession();
    refreshSessions();
    switchSession(id);
  }

  /** 删除会话 */
  function handleDeleteSession(id: string) {
    deleteSession(id);
    refreshSessions();
    // 若删除的是当前会话，切到第一个或新建
    if (id === sessionId) {
      const remaining = listSessions();
      if (remaining.length > 0) {
        switchSession(remaining[0].id);
      } else {
        handleNewSession();
      }
    }
  }

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

  // 打开面板前初始化当前会话（加载已有或新建）
  // 放在事件处理中而非 effect，避免 effect 内同步 setState 触发级联渲染
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
  // 用 ref 让 ask-ai 监听器始终调用最新版本，避免 [] 依赖导致 sessionId 闭包过期
  // ref 必须在 effect 中更新（render 阶段写 ref 会被 react-hooks/refs 规则拦截）
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

  // 监听同标签页 AI 配置变更事件（setAiConfig/clearAiConfig 派发）
  // 这样在"我的"页保存配置后，全局 AI 助手能即时感知，无需刷新
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

  // 浮窗拖动：mousedown 在头部 → mousemove 更新位置 → mouseup 结束
  // 用 document 级监听确保鼠标移出头部仍能跟踪
  useEffect(() => {
    if (!open) return;
    const onMove = (e: MouseEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      // 用 right/bottom 表达位置：鼠标右移 → right 减小；鼠标下移 → bottom 减小
      const dx = e.clientX - drag.startX;
      const dy = e.clientY - drag.startY;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      // 限制面板不超出视口（面板宽 380，高 70vh）
      const newRight = Math.max(0, Math.min(vw - 380, drag.startRight - dx));
      const newBottom = Math.max(0, Math.min(vh - 80, drag.startBottom - dy));
      setPanelPos({ right: newRight, bottom: newBottom });
    };
    const onUp = () => {
      dragRef.current = null;
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  }, [open]);

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
      initRef.current();
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

    // 智能拦截：用户回复纯数字 1-100，且最近上下文提到"每日新词量"
    // → 直接调用 setBookDailyNew 落库，不走 AI（避免消耗额度做纯设置类操作）
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
              content: `✓ 已将每日新词量调整为 ${result} 个，明天开始生效。如需继续调整，回复新的数字即可。`,
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
      const aiMsg: ChatMessage = { role: "assistant", content: data.text };
      const updated: ChatMessage[] = [...nextMessages, aiMsg];
      setMessages(updated);
      appendMessages(sessionId, [aiMsg]);
      refreshSessions();
    } catch (e) {
      const msg = friendlyAiError(e);
      setError(msg);
      // 失败时移除用户消息，避免历史污染
      setMessages(messages);
      setSessionMessages(sessionId, messages);
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

      const userMsg: ChatMessage = { role: "user", content: prompt };
      const nextMessages: ChatMessage[] = [...messages, userMsg];
      setMessages(nextMessages);
      appendMessages(sessionId, [userMsg]);
      refreshSessions();
      await sendToAi(nextMessages);
    } catch (e) {
      setError(e instanceof Error ? e.message : "整理周报失败");
    } finally {
      setSending(false);
    }
  }

  /**
   * 快捷动作：调整每日新词量（通过 AI 聊天引导）。
   *
   * 不再用表单填数字，而是注入一条 prompt 到聊天框，由 AI 引导用户
   * 完成设置（询问目标词量、给出建议等）。用户回复后 AI 可调用
   * setBookDailyNew 工具完成实际设置（通过 function calling）。
   *
   * 当前实现：注入 prompt，AI 回复建议；如回复中包含"设置为 N"，
   * 客户端解析后调用 setBookDailyNew 落库。
   */
  async function handleAdjustDailyNew() {
    if (sending) return;
    const active = await getActiveBook().catch(() => null);
    const bookName = active ? (await loadBookMeta(active.bookId).catch(() => null))?.name : null;
    const prompt = [
      `请帮我调整每日新词量。`,
      ``,
      `当前词书：${bookName ?? "未选择"}`,
      `当前每日新词量：${currentDailyNew ?? "未设置"} 个`,
      ``,
      `请根据我的学习情况给出建议，并询问我想要设置为多少（范围 1-100）。`,
      `当我回复具体数字后，请确认并告诉我设置已生效。`,
    ].join("\n");

    const userMsg: ChatMessage = { role: "user", content: prompt };
    const nextMessages: ChatMessage[] = [...messages, userMsg];
    setMessages(nextMessages);
    appendMessages(sessionId, [userMsg]);
    refreshSessions();
    await sendToAi(nextMessages);
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
      const aiMsg: ChatMessage = { role: "assistant", content: data.text };
      appendMessages(sessionId, [aiMsg]);
      refreshSessions();
    } catch (e) {
      const msg = friendlyAiError(e);
      setError(msg);
      setMessages(messages);
      setSessionMessages(sessionId, messages);
      refreshSessions();
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
        onClick={() => {
          if (open) {
            setOpen(false);
            return;
          }
          initSessionIfNeeded();
          setOpen(true);
        }}
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

      {/* 聊天浮窗（可拖动，默认右下角） */}
      {open && (
        <div
          ref={panelRef}
          className="fixed z-50 flex max-h-[70vh] w-[calc(100vw-2rem)] max-w-[380px] flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-2xl dark:border-neutral-800 dark:bg-neutral-950"
          style={{
            right: `${panelPos.right}px`,
            bottom: `${panelPos.bottom}px`,
          }}
          role="dialog"
          aria-modal="false"
          aria-label="AI 助手对话"
        >
          {/* 头部（拖动把手） */}
          <div
            className="flex cursor-move items-center justify-between border-b border-neutral-100 px-3 py-2.5 dark:border-neutral-900"
            onMouseDown={(e) => {
              // 开始拖动：记录鼠标起始位置和面板起始位置
              dragRef.current = {
                startX: e.clientX,
                startY: e.clientY,
                startRight: panelPos.right,
                startBottom: panelPos.bottom,
              };
              document.body.style.userSelect = "none";
              document.body.style.cursor = "move";
            }}
          >
            <div className="flex items-center gap-2">
              {/* 会话列表按钮：点击展开侧边抽屉查看历史会话 */}
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
                <MenuIcon title="历史会话" className="h-4 w-4" />
              </Button>
              <span className="select-none text-sm font-medium">AI 助手</span>
              {config ? (
                <span className="select-none rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] text-green-700 dark:bg-green-950 dark:text-green-300">
                  {config.provider}
                </span>
              ) : freeEnabled ? (
                <span
                  className={`select-none rounded-full px-1.5 py-0.5 text-[10px] ${
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
              {/* 新建会话 */}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleNewSession}
                className="!px-1.5 !py-0 text-[11px] text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
              >
                + 新对话
              </Button>
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
              {/* 显式关闭按钮（与 Esc 形成双重关闭方式） */}
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

          {/* 会话列表抽屉（从左侧滑入，查看历史聊天记录） */}
          {showSessions && (
            <div
              className="absolute inset-0 z-50 flex"
              role="dialog"
              aria-modal="true"
              aria-label="历史会话"
            >
              {/* 遮罩 */}
              <div
                className="flex-1 bg-black/30"
                onClick={() => setShowSessions(false)}
              />
              {/* 抽屉面板 */}
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
                            <button
                              type="button"
                              onClick={() => switchSession(s.id)}
                              className="flex-1 truncate text-left"
                            >
                              <p className="truncate">{s.title}</p>
                              <p className="mt-0.5 text-[10px] text-neutral-400">
                                {new Date(s.updatedAt).toLocaleString("zh-CN")}
                                {" · "}
                                {s.messageCount} 条
                              </p>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteSession(s.id)}
                              aria-label="删除会话"
                              className="shrink-0 text-neutral-300 opacity-0 transition-opacity hover:text-red-500 group-hover:opacity-100"
                            >
                              ×
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          )}

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
                  {unavailableReason === "no-channel"
                    ? "服务端未配置免费 AI 通道（FREE_AI_API_KEY），请在「我的」页配置自己的 API Key"
                    : "部署到 Cloudflare 并配置 FREE_AI_API_KEY 即可免费使用，或在「我的」页配置自己的 API Key"}
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

                {/* 快捷动作：周报 + 调整每日新词量（通过 AI 聊天引导） */}
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
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={handleAdjustDailyNew}
                      disabled={sending}
                      className="!px-2 !py-1 text-[11px]"
                    >
                      ⚙️ 调整每日词量
                      {currentDailyNew != null && (
                        <span className="ml-1 font-mono text-neutral-400">
                          ({currentDailyNew})
                        </span>
                      )}
                    </Button>
                  </div>
                  <p className="text-[10px] text-neutral-400">
                    点击「调整每日词量」后，在对话中回复数字（1-100）即可设置
                  </p>
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
                    onClick={() => setOpen(false)}
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
