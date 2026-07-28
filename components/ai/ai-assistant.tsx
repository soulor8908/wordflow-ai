"use client";

/**
 * 全局 AI 助手（右下悬浮窗，多轮对话）
 *
 * - 右下角圆形按钮，点击展开聊天面板
 * - 多轮对话，消息持久化于本地（localStorage，不跨设备）
 * - 首次使用检测：未配置 AI 时引导去 /me 配置
 * - 词条页可"问 AI 这个词"，自动注入上下文
 */
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { getAiConfig, type AiConfig } from "@/lib/ai/ai-config";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChatIcon, CloseIcon, KeyIcon } from "@/components/ui/icons";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const STORAGE_KEY = "wordflow:ai-chat-history";
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

export default function AiAssistant() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>(() => loadHistory());
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [config, setConfig] = useState<AiConfig | null>(null);
  const [configChecked, setConfigChecked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 加载配置（仅异步加载，messages 用 lazy initializer 同步初始化）
  useEffect(() => {
    let cancelled = false;
    getAiConfig()
      .then((c) => {
        if (!cancelled) {
          setConfig(c);
          setConfigChecked(true);
        }
      })
      .catch(() => {
        if (!cancelled) setConfigChecked(true);
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

  async function handleSend() {
    const text = input.trim();
    if (!text || sending) return;
    if (!config) {
      setError("请先在「我的」页配置 AI");
      return;
    }

    const nextMessages: ChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages(nextMessages);
    saveHistory(nextMessages);
    setInput("");
    setSending(true);
    setError(null);

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: config.provider,
          apiKey: config.apiKey,
          baseURL: config.baseURL,
          model: config.model,
          messages: nextMessages,
        }),
      });
      const data = await res.json();
      if (!data.ok) {
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

  // 未配置 AI 时，悬浮按钮仍显示，点击展开后引导去配置
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
              <ChatIcon title="AI 助手" className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              <span className="text-sm font-medium">AI 助手</span>
              {config && (
                <span className="rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] text-green-700 dark:bg-green-950 dark:text-green-300">
                  {config.provider}
                </span>
              )}
            </div>
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
          </div>

          {/* 消息区 */}
          <div className="flex-1 overflow-y-auto px-3 py-3">
            {/* 未配置 AI 引导 */}
            {!config && (
              <div className="flex flex-col items-center gap-3 px-4 py-8 text-center">
                <KeyIcon title="API Key" className="h-8 w-8 text-amber-500" />
                <p className="text-sm text-neutral-600 dark:text-neutral-300">
                  还没有配置 AI
                </p>
                <p className="text-xs text-neutral-400">
                  填入你的 API Key 即可启用 AI 讲解、造句批改、学习建议
                </p>
                <Link
                  href="/me"
                  className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-700"
                >
                  去配置
                </Link>
              </div>
            )}

            {/* 欢迎语 */}
            {config && messages.length === 0 && (
              <div className="flex flex-col gap-2 px-2 py-4 text-center">
                <p className="text-sm text-neutral-500">
                  你好！我可以帮你：
                </p>
                <ul className="flex flex-col gap-1 text-xs text-neutral-400">
                  <li>• 讲解单词的释义、搭配、词源</li>
                  <li>• 生成例句并批改你的造句</li>
                  <li>• 给出针对性的学习建议</li>
                </ul>
                <p className="mt-2 text-xs text-neutral-400">
                  试试问：&ldquo;abandon 怎么用？&rdquo;
                </p>
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
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* 输入区 */}
          {config && (
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
                  placeholder="问点什么…（Enter 发送）"
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
