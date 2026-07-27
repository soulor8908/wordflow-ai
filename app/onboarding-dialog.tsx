"use client";

/**
 * 首次访问词库选择弹窗（设计文档 §3.1：新手引导）
 *
 * - 检测到用户未选词库时，在首页全屏弹窗
 * - 列出官方词库（CET-4/CET-6/高考/考研）
 * - 选定后写入 settings:active-book，关闭弹窗
 * - 允许"稍后再选"跳过，但下次进首页还会弹
 */
import { useEffect, useState } from "react";
import {
  loadBookIndex,
  BOOK_COLOR_CLASSES,
  type BookMeta,
} from "@/lib/content/book-index";
import { hasSelectedBook, setActiveBook } from "@/lib/review/active-book";
import { Button } from "@/components/ui/button";

export default function OnboardingDialog() {
  const [open, setOpen] = useState(false);
  const [books, setBooks] = useState<BookMeta[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selecting, setSelecting] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const selected = await hasSelectedBook();
        if (cancelled) return;
        if (selected) return; // 已选过词库，不弹
        const index = await loadBookIndex();
        if (cancelled) return;
        setBooks(index);
        setOpen(true);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "加载词库失败");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSelect(bookId: string) {
    if (selecting) return;
    setSelecting(bookId);
    try {
      await setActiveBook(bookId);
      setOpen(false);
    } finally {
      setSelecting(null);
    }
  }

  function handleSkip() {
    setOpen(false);
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 px-4 py-6 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
    >
      <div className="flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-neutral-950">
        <header className="flex flex-col gap-1 border-b border-neutral-100 px-5 py-4 dark:border-neutral-900">
          <h2 id="onboarding-title" className="text-lg font-bold">
            你想学什么？
          </h2>
          <p className="text-xs text-neutral-500">
            选一个词库，开始你的学习。随时可在「词库」页切换。
          </p>
        </header>

        <div className="flex-1 overflow-y-auto px-3 py-3">
          {error && (
            <p className="px-2 py-2 text-xs text-red-500">{error}</p>
          )}
          {books && (
            <ul className="flex flex-col gap-2">
              {books.map((b) => {
                const colors = BOOK_COLOR_CLASSES[b.color];
                return (
                  <li key={b.id}>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => handleSelect(b.id)}
                      disabled={selecting !== null}
                      className={`flex w-full items-start gap-3 rounded-lg border-2 px-3 py-3 text-left transition-colors hover:border-neutral-300 disabled:opacity-50 dark:hover:border-neutral-700 ${
                        selecting === b.id
                          ? `${colors.border} ${colors.soft}`
                          : "border-neutral-200 dark:border-neutral-800"
                      }`}
                    >
                      <span
                        className={`mt-0.5 inline-block shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium text-white ${colors.bg}`}
                      >
                        {b.level}
                      </span>
                      <div className="flex flex-1 flex-col gap-0.5">
                        <span className="text-sm font-medium">{b.name}</span>
                        <span className="text-[11px] text-neutral-500">
                          {b.wordCount} 词 · 每日 {b.dailyNew} 新词
                        </span>
                      </div>
                      {selecting === b.id && (
                        <span className={`text-xs ${colors.text}`}>✓</span>
                      )}
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <footer className="flex items-center justify-between border-t border-neutral-100 px-5 py-3 dark:border-neutral-900">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleSkip}
            disabled={selecting !== null}
            className="text-xs"
          >
            稍后再选
          </Button>
          <span className="text-[11px] text-neutral-400">
            选完即可开始学习
          </span>
        </footer>
      </div>
    </div>
  );
}
