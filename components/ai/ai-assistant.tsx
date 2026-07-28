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
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const clientIdRef = useRef<string>("");

  // 加载配置 + 查询免费额度
  useEffect(() => {
    let cancelled = false;
    clientIdRef.current = getOrCreateClientId();
    Promise.all([
      getAiConfig().catch(() => null),
      fetch(`/api/ai/chat?clientId=${encodeURIComponent(clientIdRef.current)}`)
        .then((r) => r.json())
        .catch(() => null),
    ]).then(([c, q]) => {
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
      const res = await fetch("/api/ai/chat", {
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
      const msg = e instanceof Error ? e.message : "AI 请求失败";
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
        className="fixed bottom-20 right-4 z-40 flex h-12 w-12 items-center justify-center rounded-full !px-0 shadow-lg transition-transform hover:scale-105 active:scale-95"
      >
        {open ? (
          <CloseIcon title="关闭" className="h-5 w-5" />
        ) : (
          <ChatIcon title="打开 AI 助手" className="h-5 w-5" />
        )}
      </Button>

      {/* 聊天面板 */}
      {open && (
        <div
          className="fixed inset-x-3 bottom-36 z-40 flex max-h-[60vh] flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-2xl dark:border-neutral-800 dark:bg-neutral-950 sm:right-4 sm:left-auto sm:w-96"
          role="dialog"
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
              {/* 配置了自己的的 Key 时给一个快速入口 */}
              <Link
                href="/me"
                className="text-[11px] text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
              >
                设置
              </Link>
            </div>
          </div>

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
