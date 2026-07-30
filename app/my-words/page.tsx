"use client";

/**
 * AI 生词本页面（AI 搜索入库的单词列表）
 *
 * - 展示所有通过 AI 搜索自动入库的单词
 * - 点击单词跳转词条页
 * - 支持删除
 * - 显示入库时间
 *
 * 命名说明：曾叫"我的词库"，但与底部 Tab 的"词库"(/books 官方词书)
 * 概念完全不同，易造成用户混淆。现更名为"AI 生词本"，明确是 AI 查过的词。
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  listUserWords,
  deleteUserWord,
  type UserWordEntry,
} from "@/lib/dict/user-words";
import { Button } from "@/components/ui/button";
import {
  BookIcon,
  ChevronLeftIcon,
  TrashIcon,
} from "@/components/ui/icons";

export default function MyWordsPage() {
  const [words, setWords] = useState<UserWordEntry[]>([]);
  const [loading, setLoading] = useState(true);

  // 初始加载：loading 初始为 true，仅在 async 回调中 setState（避免 effect 内同步 setState）
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await listUserWords();
        if (!cancelled) setWords(list);
      } catch {
        if (!cancelled) setWords([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleDelete(word: string) {
    await deleteUserWord(word);
    // 刷新列表（事件处理器中 setState 不受 effect 规则限制）
    setLoading(true);
    try {
      const list = await listUserWords();
      setWords(list);
    } catch {
      setWords([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-4 px-4 py-8 pb-24">
      <Link href="/" className="text-sm text-blue-600 hover:underline">
        <ChevronLeftIcon className="h-4 w-4 inline" /> 返回查词
      </Link>

      <header className="flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-xl font-bold">
          <BookIcon title="AI 生词本" className="h-5 w-5 text-blue-500" />
          AI 生词本
        </h1>
        <span className="text-xs text-neutral-400">
          {words.length > 0 ? `${words.length} 个单词` : ""}
        </span>
      </header>

      <p className="text-xs text-neutral-500">
        AI 搜索自动入库的单词保存在这里，离线可查
      </p>

      {loading ? (
        <p className="text-sm text-neutral-400">加载中…</p>
      ) : words.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <BookIcon className="h-10 w-10 text-neutral-300" />
          <p className="text-sm text-neutral-500">还没有 AI 入库的单词</p>
          <p className="text-xs text-neutral-400">
            搜索内置词典没有的单词时，AI 会自动查询并入库
          </p>
          <Link
            href="/"
            className="mt-2 rounded-lg border border-neutral-300 px-3 py-1.5 text-xs text-neutral-600 hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-900"
          >
            去查词
          </Link>
        </div>
      ) : (
        <ul className="flex flex-col divide-y divide-neutral-100 rounded-lg border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
          {words.map((w) => (
            <li key={w.word} className="group flex items-center justify-between gap-2 px-4 py-3">
              <Link
                href={`/word/${encodeURIComponent(w.word)}`}
                className="flex flex-1 flex-col gap-0.5 hover:bg-neutral-50 dark:hover:bg-neutral-900"
              >
                <span className="flex items-center gap-2">
                  <span className="font-mono text-base font-medium">{w.word}</span>
                  {w.phonetic && (
                    <span className="font-mono text-xs text-neutral-400">{w.phonetic}</span>
                  )}
                </span>
                {w.translation && (
                  <span className="text-xs text-neutral-500 line-clamp-1">
                    {w.translation.split("\n")[0]}
                  </span>
                )}
                <span className="text-[10px] text-neutral-400">
                  {new Date(w.savedAt).toLocaleDateString("zh-CN")}
                </span>
              </Link>
              <Button
                type="button"
                variant="ghost"
                size="iconSm"
                onClick={() => handleDelete(w.word)}
                aria-label={`删除 ${w.word}`}
                className="shrink-0 !text-neutral-300 hover:!text-red-500 group-hover:!text-neutral-400"
              >
                <TrashIcon title="删除" className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
