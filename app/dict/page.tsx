"use client";

/**
 * 词典浏览页面
 *
 * - 输入前缀浏览内置词典中的单词
 * - 点击单词跳转词条页
 * - 支持按字母快速筛选
 *
 * 命名说明：曾叫"全量词库"，与底部 Tab 的"词库"(/books 官方词书)
 * 概念不同。现更名为"词典浏览"，明确是浏览内置词典，非词书学习。
 */
import Link from "next/link";
import { useEffect, useRef } from "react";
import { useSearch } from "@/lib/search/use-search";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  BookIcon,
  ChevronLeftIcon,
  CloseIcon,
  SearchIcon,
} from "@/components/ui/icons";

const ALPHABET = "abcdefghijklmnopqrstuvwxyz".split("");

function frequencyToStars(freq: number): string {
  if (freq >= 8000) return "★★★★★";
  if (freq >= 5000) return "★★★★";
  if (freq >= 2000) return "★★★";
  if (freq >= 500) return "★★";
  return "★";
}

export default function DictBrowserPage() {
  const { query, setQuery, results, loading, indexReady } = useSearch(100);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-4 px-4 py-8 pb-24">
      <Link href="/" className="text-sm text-blue-600 hover:underline">
        <ChevronLeftIcon className="h-4 w-4 inline" /> 返回查词
      </Link>

      <header className="flex items-center gap-2">
        <BookIcon title="词典浏览" className="h-5 w-5 text-blue-500" />
        <h1 className="text-xl font-bold">词典浏览</h1>
      </header>

      <p className="text-xs text-neutral-500">
        浏览内置词典中的所有单词，点击查看详细释义
      </p>

      {/* 搜索框 */}
      <div className="relative">
        <Input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="输入前缀浏览（如 ab、pre）"
          aria-label="浏览词库输入框"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
        />
        {query.length > 0 && (
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
            <CloseIcon title="清除输入" className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* 字母快捷筛选 */}
      <div className="flex flex-wrap gap-1">
        {ALPHABET.map((letter) => (
          <Button
            key={letter}
            type="button"
            variant="plain"
            onClick={() => setQuery(letter)}
            className={`h-7 w-7 rounded text-xs font-mono uppercase !p-0 ${
              query.toLowerCase() === letter
                ? "!bg-blue-600 !text-white"
                : "!bg-neutral-100 !text-neutral-600 hover:!bg-neutral-200 dark:!bg-neutral-800 dark:!text-neutral-300 dark:hover:!bg-neutral-700"
            }`}
          >
            {letter}
          </Button>
        ))}
      </div>

      {!indexReady && (
        <span className="text-xs text-neutral-400">加载词库索引…</span>
      )}

      {/* 结果列表 */}
      {indexReady && query.trim() && (
        <div className="flex flex-col gap-1">
          <span className="text-xs text-neutral-400">
            {loading ? "搜索中…" : `${results.length} 个结果`}
          </span>
          <ul className="flex flex-col divide-y divide-neutral-100 rounded-lg border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
            {results.map((entry) => (
              <li key={entry.word}>
                <Link
                  href={`/word/${encodeURIComponent(entry.word)}`}
                  className="flex items-center justify-between px-4 py-2.5 hover:bg-neutral-50 dark:hover:bg-neutral-900"
                >
                  <span className="font-mono text-sm">{entry.word}</span>
                  <span className="text-xs text-amber-500" aria-label="词频星级">
                    {frequencyToStars(entry.frequency ?? 0)}
                  </span>
                </Link>
              </li>
            ))}
            {!loading && results.length === 0 && (
              <li className="px-4 py-3 text-sm text-neutral-400">
                无匹配单词
              </li>
            )}
          </ul>
        </div>
      )}

      {/* 空状态引导 */}
      {indexReady && !query.trim() && (
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <SearchIcon className="h-10 w-10 text-neutral-300" />
          <p className="text-sm text-neutral-500">输入前缀或点击字母开始浏览</p>
        </div>
      )}
    </main>
  );
}
