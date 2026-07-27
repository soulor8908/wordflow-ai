"use client";

/**
 * 查词首页（设计文档 §3.2 A：聚焦搜索框 + 候选列表 + 今日待复习提醒）
 *
 * - 打开即聚焦搜索框
 * - 输入即搜（debounce 80ms），候选项带词频星级
 * - 点击候选项跳转 /word/[word]
 * - 下方显示今日待复习数量提醒
 * - 首次访问引导：无查询 + 无待复习时展示"三步上手"卡片
 */
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useSearch } from "@/lib/search/use-search";
import { countDueCards } from "@/lib/storage/db";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import OnboardingDialog from "./onboarding-dialog";
import { getActiveBook } from "@/lib/review/active-book";

/** 词频 → 星级（1-5 星，对齐 ECDICT collins 星级） */
function frequencyToStars(freq: number): string {
  if (freq >= 8000) return "★★★★★";
  if (freq >= 5000) return "★★★★";
  if (freq >= 2000) return "★★★";
  if (freq >= 500) return "★★";
  return "★";
}

export default function HomePage() {
  const { query, setQuery, results, loading, indexReady } = useSearch(8);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dueCount, setDueCount] = useState<number | null>(null);
  const [activeBookId, setActiveBookId] = useState<string | null>(null);
  const [activeBookName, setActiveBookName] = useState<string | null>(null);

  // 打开即聚焦
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // 今日待复习数量 + 当前词库（首屏加载一次）
  useEffect(() => {
    countDueCards(new Date().toISOString())
      .then((n) => setDueCount(n))
      .catch(() => setDueCount(0));
    getActiveBook()
      .then((ab) => {
        setActiveBookId(ab?.bookId ?? null);
      })
      .catch(() => setActiveBookId(null));
  }, []);

  // 监听 onboarding 选择完成，刷新当前词库显示
  useEffect(() => {
    if (!activeBookId) return;
    import("@/lib/content/book-index")
      .then(({ loadBookIndex }) => loadBookIndex())
      .then((books) => {
        const b = books.find((x) => x.id === activeBookId);
        if (b) setActiveBookName(b.name);
      })
      .catch(() => setActiveBookName(null));
  }, [activeBookId]);

  const hasQuery = query.trim().length > 0;
  // 清除按钮直接从 query 派生，避免 effect 内 setState
  const showClear = query.length > 0;
  const showEmptyState =
    !hasQuery && dueCount !== null && dueCount === 0 && indexReady;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-6 px-4 py-10 pb-24">
      {/* 首次访问弹窗：检测未选词库时自动弹出 */}
      <OnboardingDialog />

      <header className="text-center">
        <h1 className="text-3xl font-bold tracking-tight">WordFlow</h1>
        <p className="mt-1 text-sm text-neutral-500">查词即背词 · 本地优先 · 离线可用</p>
      </header>

      {/* 当前词库显示 + 切换入口 */}
      {activeBookName && (
        <Link
          href="/books"
          className="flex items-center justify-between rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm dark:border-blue-900 dark:bg-blue-950"
        >
          <span className="flex items-center gap-2">
            <span className="text-blue-500">📖</span>
            <span className="text-neutral-600 dark:text-neutral-300">当前词库</span>
            <span className="font-medium text-blue-700 dark:text-blue-300">
              {activeBookName}
            </span>
          </span>
          <span className="text-xs text-neutral-400">切换 →</span>
        </Link>
      )}

      {/* 今日待复习提醒：修复 flex 布局，让"统计"链接真正靠右 */}
      <div className="flex items-center justify-between gap-3 rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm dark:border-neutral-800 dark:bg-neutral-900">
        {dueCount === null ? (
          <span className="text-neutral-400">加载今日复习…</span>
        ) : dueCount > 0 ? (
          <Link
            href="/review"
            className="font-medium text-blue-600 hover:underline"
          >
            📚 今日有 {dueCount} 词待复习，去复习 →
          </Link>
        ) : (
          <span className="text-neutral-500">暂无到期复习，查个新词吧</span>
        )}
        <Link
          href="/stats"
          className="shrink-0 text-xs text-neutral-500 hover:underline"
        >
          统计 →
        </Link>
      </div>

      {/* 搜索框 + 自定义清除按钮（替代 type=search 原生按钮，避免样式冲突） */}
      <div className="flex flex-col gap-2">
        <div className="relative">
          <Input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="输入单词查词（支持前缀补全与模糊纠错）"
            aria-label="查词输入框"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="go"
          />
          {showClear && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setQuery("");
                inputRef.current?.focus();
              }}
              aria-label="清除输入"
              className="absolute right-2 top-1/2 h-7 w-7 -translate-y-1/2 rounded-full px-0 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 dark:hover:bg-neutral-800"
            >
              ✕
            </Button>
          )}
        </div>
        {!indexReady && (
          <span className="text-xs text-neutral-400">加载词库索引…</span>
        )}
      </div>

      {/* 候选列表 */}
      {hasQuery && (
        <ul className="flex flex-col divide-y divide-neutral-100 rounded-lg border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
          {loading && (
            <li className="px-4 py-3 text-sm text-neutral-400">搜索中…</li>
          )}
          {!loading && results.length === 0 && (
            <li className="px-4 py-3 text-sm text-neutral-400">
              无匹配，试试检查拼写
            </li>
          )}
          {!loading &&
            results.map((entry) => (
              <li key={entry.word}>
                <Link
                  href={`/word/${encodeURIComponent(entry.word)}`}
                  className="flex items-center justify-between px-4 py-3 hover:bg-neutral-50 dark:hover:bg-neutral-900"
                >
                  <span className="font-mono text-base">{entry.word}</span>
                  <span className="text-xs text-amber-500" aria-label="词频星级">
                    {frequencyToStars(entry.frequency ?? 0)}
                  </span>
                </Link>
              </li>
            ))}
        </ul>
      )}

      {/* 首次访问引导：无查询 + 无待复习时展示三步上手 */}
      {showEmptyState && <GettingStarted />}
    </main>
  );
}

/** 首次访问引导卡片：用三步让新用户立刻明白产品价值 */
function GettingStarted() {
  const steps = [
    {
      icon: "🔍",
      title: "查个词",
      desc: "试试 abandon、ability、abroad",
    },
    {
      icon: "＋",
      title: "收藏入队",
      desc: "词条页右上角加入复习队列",
    },
    {
      icon: "📚",
      title: "明天来复习",
      desc: "FSRS 算法会在最佳时机提醒你",
    },
  ];
  return (
    <section className="rounded-xl border border-neutral-200 bg-white px-5 py-5 dark:border-neutral-800 dark:bg-neutral-950">
      <h2 className="mb-3 text-sm font-medium text-neutral-700 dark:text-neutral-300">
        三步上手
      </h2>
      <ol className="flex flex-col gap-3">
        {steps.map((s, i) => (
          <li key={i} className="flex items-start gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-50 text-base dark:bg-blue-950">
              {s.icon}
            </span>
            <div className="flex flex-col">
              <span className="text-sm font-medium text-neutral-800 dark:text-neutral-200">
                {s.title}
              </span>
              <span className="text-xs text-neutral-500">{s.desc}</span>
            </div>
          </li>
        ))}
      </ol>
      <div className="mt-4 flex flex-wrap gap-2">
        {["abandon", "ability", "abroad"].map((w) => (
          <Link
            key={w}
            href={`/word/${encodeURIComponent(w)}`}
            className="rounded-full border border-neutral-300 px-3 py-1 text-xs font-mono text-neutral-600 hover:border-blue-400 hover:text-blue-600 dark:border-neutral-700 dark:text-neutral-300"
          >
            {w}
          </Link>
        ))}
      </div>
    </section>
  );
}
