"use client";

/**
 * 词库管理页（设计文档 §3.2 C：词书页）
 *
 * - 列出所有官方词库（含词数、每日新词、难度标签）
 * - 显示用户当前选定的词库（高亮）
 * - 点击切换：写入 settings:active-book，并跳转复习页或首页
 * - 显示每本词书的学习进度（cursor / wordCount）
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  loadBookIndex,
  BOOK_COLOR_CLASSES,
  type BookMeta,
} from "@/lib/content/book-index";
import {
  getActiveBook,
  setActiveBook,
} from "@/lib/review/active-book";
import { getBookProgress, type BookProgress } from "@/lib/review/book-queue";
import { Button } from "@/components/ui/button";
import { ChevronLeftIcon } from "@/components/ui/icons";

interface BookWithProgress extends BookMeta {
  progress?: BookProgress;
  isActive: boolean;
}

export default function BooksPage() {
  const router = useRouter();
  const [books, setBooks] = useState<BookWithProgress[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [switching, setSwitching] = useState<string | null>(null);
  // 待确认切换的词库（当前已有词库且有进度时，切换前需二次确认）
  const [confirming, setConfirming] = useState<BookWithProgress | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [index, active] = await Promise.all([
          loadBookIndex(),
          getActiveBook(),
        ]);
        if (cancelled) return;
        const enriched = await Promise.all(
          index.map(async (b) => {
            const progress = await getBookProgress(b.id);
            return {
              ...b,
              progress,
              isActive: active?.bookId === b.id,
            };
          })
        );
        if (!cancelled) setBooks(enriched);
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

  // 请求切换：当前已有词库且有学习进度时，先弹确认避免误触丢进度感知
  function requestSelect(book: BookWithProgress) {
    if (switching) return;
    const current = books?.find((b) => b.isActive);
    const currentHasProgress = (current?.progress?.cursor ?? 0) > 0;
    if (current && current.id !== book.id && currentHasProgress) {
      setConfirming(book);
      return;
    }
    void doSwitch(book.id);
  }

  async function doSwitch(bookId: string) {
    if (switching) return;
    setSwitching(bookId);
    try {
      await setActiveBook(bookId);
      setBooks((prev) =>
        prev
          ? prev.map((b) => ({ ...b, isActive: b.id === bookId }))
          : prev
      );
      setConfirming(null);
      // 选完直接去复习页，确保学习闭环（选词库 → 立即开始学习）
      router.push("/review");
    } finally {
      setSwitching(null);
    }
  }

  if (error) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-4 px-4 py-10">
        <Link href="/" className="text-sm text-blue-600 hover:underline">
          <ChevronLeftIcon className="h-4 w-4 inline" /> 返回查词
        </Link>
        <p className="text-sm text-red-500">{error}</p>
      </main>
    );
  }

  if (!books) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-2xl items-center justify-center px-4">
        <p className="text-sm text-neutral-400">加载词库…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-6 px-4 py-8 pb-24">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">选择词库</h1>
        <p className="text-sm text-neutral-500">
          选定后，每日新词与复习队列都从这里来。随时可切换。
        </p>
      </header>

      <ul className="flex flex-col gap-3">
        {books.map((b) => {
          const colors = BOOK_COLOR_CLASSES[b.color];
          const learned = b.progress?.cursor ?? 0;
          const percent =
            b.wordCount > 0 ? Math.min(100, Math.round((learned / b.wordCount) * 100)) : 0;
          return (
            <li
              key={b.id}
              className={`rounded-xl border-2 px-4 py-4 transition-colors ${
                b.isActive
                  ? `${colors.border} ${colors.soft}`
                  : "border-neutral-200 dark:border-neutral-800"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex flex-1 flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium text-white ${colors.bg}`}
                    >
                      {b.level}
                    </span>
                    <h2 className="text-base font-medium">{b.name}</h2>
                    {b.isActive && (
                      <span className={`text-xs ${colors.text}`}>✓ 当前</span>
                    )}
                  </div>
                  <p className="text-xs text-neutral-500">{b.description}</p>
                  <div className="mt-1 flex items-center gap-3 text-[11px] text-neutral-400">
                    <span>共 {b.wordCount} 词</span>
                    <span>每日 {b.dailyNew} 新词</span>
                    {b.progress && (
                      <span>
                        已学 {learned} · {percent}%
                      </span>
                    )}
                  </div>
                  {/* 进度条 */}
                  {b.progress && (
                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
                      <div
                        className={`h-full ${colors.bg} transition-all`}
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 flex-col gap-1.5">
                  {b.isActive ? (
                    <Link
                      href="/review"
                      className={`rounded-lg px-3 py-1.5 text-xs font-medium text-white ${colors.bg} hover:opacity-90`}
                    >
                      去复习
                    </Link>
                  ) : (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={switching === b.id}
                      onClick={() => requestSelect(b)}
                      className="text-xs"
                    >
                      {switching === b.id ? "切换中…" : "选这个"}
                    </Button>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="rounded-lg border border-dashed border-neutral-300 px-4 py-3 text-xs text-neutral-400 dark:border-neutral-700">
        已支持托福 / 雅思 / GRE 三大考试词库，自定义词库开发中
      </div>

      {/* 切换确认对话框：避免误触切换丢失对当前进度的感知 */}
      {confirming && (
        <SwitchConfirmDialog
          target={confirming}
          current={books.find((b) => b.isActive) ?? null}
          switching={switching === confirming.id}
          onCancel={() => setConfirming(null)}
          onConfirm={() => void doSwitch(confirming.id)}
        />
      )}
    </main>
  );
}

/** 词库切换确认对话框 */
function SwitchConfirmDialog({
  target,
  current,
  switching,
  onCancel,
  onConfirm,
}: {
  target: BookWithProgress;
  current: BookWithProgress | null;
  switching: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const currentLearned = current?.progress?.cursor ?? 0;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="switch-confirm-title"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl dark:bg-neutral-950"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="switch-confirm-title" className="text-base font-bold">
          切换到《{target.name}》？
        </h2>
        <p className="mt-2 text-sm text-neutral-500">
          {current
            ? `当前《${current.name}》已学 ${currentLearned} 词，进度会保留。切换后今日新词将来自《${target.name}》。`
            : `切换后今日新词将来自《${target.name}》。`}
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onCancel}
            disabled={switching}
          >
            取消
          </Button>
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={onConfirm}
            disabled={switching}
          >
            {switching ? "切换中…" : "确认切换"}
          </Button>
        </div>
      </div>
    </div>
  );
}
