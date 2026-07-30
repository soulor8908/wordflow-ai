"use client";

/**
 * 词库选择弹窗（受控组件）—— 设计文档 §3.1 新手引导重构版
 *
 * 乔布斯式取舍：不再"打开 App 就强制弹窗要求选词库"。
 * 新用户应先体验"查词 → 收藏"的核心价值（magic moment），
 * 再由首页的非阻塞引导卡片主动触发本弹窗。
 *
 * - open/onClose 由父组件控制，本组件不做自动检测
 * - 选定后写入 settings:active-book，关闭弹窗并跳转 /review 开始学习
 */
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  loadBookIndex,
  BOOK_COLOR_CLASSES,
  type BookMeta,
} from "@/lib/content/book-index";
import { setActiveBook } from "@/lib/review/active-book";
import { Button } from "@/components/ui/button";

export default function OnboardingDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [books, setBooks] = useState<BookMeta[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selecting, setSelecting] = useState<string | null>(null);

  // 仅在打开时加载词库列表（避免首页首屏无谓加载）
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    loadBookIndex()
      .then((index) => {
        if (!cancelled) setBooks(index);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "加载词库失败");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  async function handleSelect(bookId: string) {
    if (selecting) return;
    setSelecting(bookId);
    try {
      await setActiveBook(bookId);
      onClose();
      // 选完直接去复习页，开始学习闭环
      router.push("/review");
    } finally {
      setSelecting(null);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 px-4 py-6 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-neutral-950"
        onClick={(e) => e.stopPropagation()}
      >
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
          {!books && !error && (
            <div className="flex flex-col gap-2">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="animate-pulse rounded-lg border-2 border-neutral-200 px-3 py-3 dark:border-neutral-800"
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 h-5 w-10 rounded-full bg-neutral-200 dark:bg-neutral-800" />
                    <div className="flex flex-1 flex-col gap-1">
                      <div className="h-4 w-32 rounded bg-neutral-200 dark:bg-neutral-800" />
                      <div className="h-3 w-24 rounded bg-neutral-100 dark:bg-neutral-900" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
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
            onClick={onClose}
            disabled={selecting !== null}
            className="text-xs"
          >
            稍后再选
          </Button>
          <span className="text-[11px] text-neutral-600">
            选完即可开始学习
          </span>
        </footer>
      </div>
    </div>
  );
}
