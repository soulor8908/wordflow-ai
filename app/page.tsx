"use client";

/**
 * 查词首页（设计文档 §3.2 A：聚焦搜索框 + 候选列表 + 今日待复习提醒）
 *
 * - 打开即聚焦搜索框
 * - 输入即搜（debounce 80ms），候选项带词频星级
 * - 点击候选项跳转 /word/[word]
 * - 下方显示今日待复习数量提醒（点 Streak 入口暂留 P2）
 */
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useSearch } from "@/lib/search/use-search";
import { countDueCards } from "@/lib/storage/db";
import { Input } from "@/components/ui/input";

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

  // 打开即聚焦
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // 今日待复习数量（首屏加载一次）
  useEffect(() => {
    countDueCards(new Date().toISOString())
      .then((n) => setDueCount(n))
      .catch(() => setDueCount(0));
  }, []);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-6 px-4 py-10">
      <header className="text-center">
        <h1 className="text-3xl font-bold tracking-tight">WordFlow</h1>
        <p className="mt-1 text-sm text-neutral-500">查词即背词 · 本地优先 · 离线可用</p>
      </header>

      {/* 今日待复习提醒 */}
      <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm dark:border-neutral-800 dark:bg-neutral-900">
        {dueCount === null ? (
                  <span className="text-neutral-400">加载今日复习…</span>
                ) : dueCount > 0 ? (
                  <Link href="/review" className="font-medium text-blue-600 hover:underline">
                    📚 今日有 {dueCount} 词待复习，去复习 →
                  </Link>
                ) : (
                  <span className="text-neutral-500">暂无到期复习，查个新词吧</span>
                )}
                <Link href="/stats" className="ml-auto text-xs text-neutral-500 hover:underline">
                  统计 →
                </Link>
      </div>

      {/* 搜索框 */}
      <div className="flex flex-col gap-2">
        <Input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="输入单词查词（支持前缀补全与模糊纠错）"
          aria-label="查词输入框"
        />
        {!indexReady && (
          <span className="text-xs text-neutral-400">加载词库索引…</span>
        )}
      </div>

      {/* 候选列表 */}
      {query.trim() && (
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
    </main>
  );
}
