"use client";

/**
 * 复习页（设计文档 §3.2 B：留存核心）
 *
 * 全屏卡片流：
 * - 正面：单词 + 音标 + 自动发音；点击/空格翻面显示释义与例句
 * - 三按钮：忘记(红)/模糊(黄)/认识(绿) → Again/Hard/Good；长按认识 = Easy
 * - 顶部进度条；键盘 1/2/3/4/空格
 * - 中断友好：每次反馈实时落库（本地优先）
 * - 完成：结算页（今日数据 + 返回首页）
 */
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { listDueCards, buildTodayQueue, type TodayQueueItem, type NewWordCandidate } from "@/lib/review/today-queue";
import { getTodayNewWords } from "@/lib/review/book-queue";
import { submitReview, type ReviewOutcome } from "@/lib/review/review-session";
import { findEntry, type DictEntry } from "@/lib/dict/dict-loader";
import type { Rating } from "@/lib/review/fsrs-scheduler";
import { recordStudy } from "@/lib/stats/streak-io";
import { todayLocalDate } from "@/lib/review/book-queue";
import { getActiveBook } from "@/lib/review/active-book";
import { Button } from "@/components/ui/button";

type Phase = "loading" | "reviewing" | "done" | "no-book";

export default function ReviewPage() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [queue, setQueue] = useState<TodayQueueItem[]>([]);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [entry, setEntry] = useState<DictEntry | null>(null);
  const [loadedForWord, setLoadedForWord] = useState<string | null>(null);
  const [outcomes, setOutcomes] = useState<ReviewOutcome[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // 构建今日队列
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const active = await getActiveBook();
        if (cancelled) return;
        if (!active) {
          setPhase("no-book");
          return;
        }
        const now = new Date();
        const [dueCards, newWords] = await Promise.all([
          listDueCards(now),
          getTodayNewWords(active.bookId).catch(
            () => [] as NewWordCandidate[]
          ),
        ]);
        if (cancelled) return;
        const items = buildTodayQueue({
          dueCards,
          newWordCandidates: newWords,
          dailyNewLimit: newWords.length, // 配额已在 book-queue 层用 dailyNew 截断
        });
        setQueue(items);
        if (items.length === 0) {
          setPhase("done");
        } else {
          setPhase("reviewing");
        }
      } catch (e) {
        if (!cancelled) {
          setLoadError(e instanceof Error ? e.message : "加载复习队列失败");
          setPhase("done");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const currentItem = queue[index];
  const currentWord = currentItem
    ? currentItem.type === "due"
      ? currentItem.card.word
      : currentItem.word
    : null;
  const entryLoading = currentWord !== loadedForWord;

  // 加载当前卡片词典释义（setState 仅在异步回调内，避免 effect 内同步 setState）
  useEffect(() => {
    if (phase !== "reviewing" || !currentItem) return;
    let cancelled = false;
    const word =
      currentItem.type === "due" ? currentItem.card.word : currentItem.word;
    findEntry(word)
      .then((e) => {
        if (cancelled) return;
        setEntry(e ?? null);
        setLoadedForWord(word);
      })
      .catch(() => {
        if (cancelled) return;
        setEntry(null);
        setLoadedForWord(word);
      });
    return () => {
      cancelled = true;
    };
  }, [index, phase, currentItem]);

  const handleRate = useCallback(
    async (rating: Rating) => {
      if (submitting || !currentItem || !flipped) return;
      setSubmitting(true);
      try {
        const outcome = await submitReview(currentItem, rating, "standard");
        // Streak + 学习日志累加（Good/Easy 计为正确，Again/Hard 计为错误）
        const correct = rating === "Good" || rating === "Easy" ? 1 : 0;
        await recordStudy(
          todayLocalDate(),
          {
            newCount: outcome.wasNew ? 1 : 0,
            reviewCount: outcome.wasNew ? 0 : 1,
            correctCount: correct,
          }
        ).catch(() => {
          /* Streak 写入失败不阻塞复习主流程（本地优先，下次会补） */
        });
        const next = [...outcomes, outcome];
        setOutcomes(next);
        setFlipped(false);
        if (index + 1 >= queue.length) {
          setPhase("done");
        } else {
          setIndex(index + 1);
        }
      } finally {
        setSubmitting(false);
      }
    },
    [submitting, currentItem, flipped, outcomes, index, queue.length]
  );

  const flip = useCallback(() => {
    if (submitting) return;
    setFlipped((f) => !f);
  }, [submitting]);

  // 键盘快捷键：空格翻面，1/2/3/4 评分
  useEffect(() => {
    if (phase !== "reviewing") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        flip();
      } else if (flipped && !submitting) {
        if (e.key === "1") handleRate("Again");
        else if (e.key === "2") handleRate("Hard");
        else if (e.key === "3") handleRate("Good");
        else if (e.key === "4") handleRate("Easy");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, flipped, submitting, flip, handleRate]);

  // 长按"认识"= Easy
  const easyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startEasyLongPress = useCallback(() => {
    if (easyTimerRef.current) clearTimeout(easyTimerRef.current);
    easyTimerRef.current = setTimeout(() => {
      handleRate("Easy");
    }, 500);
  }, [handleRate]);
  const cancelEasyLongPress = useCallback(() => {
    if (easyTimerRef.current) {
      clearTimeout(easyTimerRef.current);
      easyTimerRef.current = null;
    }
  }, []);
  useEffect(() => () => cancelEasyLongPress(), [cancelEasyLongPress]);

  if (phase === "loading") {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-2xl items-center justify-center px-4">
        <p className="text-sm text-neutral-400">正在加载今日复习队列…</p>
      </main>
    );
  }

  if (phase === "no-book") {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col items-center justify-center gap-4 px-4 py-10 text-center">
        <h1 className="text-2xl font-bold">还没有选择词库</h1>
        <p className="text-sm text-neutral-500">
          先选一个词库，系统会按 FSRS 算法为你安排每日新词与复习
        </p>
        <Link
          href="/books"
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          去选词库
        </Link>
      </main>
    );
  }

  if (phase === "done") {
    return <DoneScreen outcomes={outcomes} loadError={loadError} />;
  }

  const total = queue.length;
  const progress = total > 0 ? ((index) / total) * 100 : 0;
  const word =
    currentItem!.type === "due" ? currentItem!.card.word : currentItem!.word;
  const isNew = currentItem!.type === "new";

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col px-4 py-6">
      {/* 进度条 */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between text-xs text-neutral-500">
          <span>
            第 {index + 1} / {total} 张
            {isNew && <span className="ml-2 text-blue-500">新词</span>}
          </span>
          <Link href="/" className="hover:underline">
            退出
          </Link>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
          <div
            className="h-full bg-blue-500 transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* 卡片 */}
      <Button
        type="button"
        onClick={flip}
        disabled={submitting}
        aria-label={flipped ? "点击返回正面" : "点击翻面查看释义"}
        variant="ghost"
        className="mt-6 flex min-h-[18rem] flex-1 flex-col items-center justify-center gap-4 rounded-2xl border border-neutral-200 bg-white px-6 py-8 text-center shadow-sm dark:border-neutral-800 dark:bg-neutral-950"
      >
        {!flipped ? (
          <>
            <h1 className="text-5xl font-bold tracking-tight">{word}</h1>
            {!entryLoading && entry?.phonetic && (
              <span className="font-mono text-lg text-neutral-500">
                {entry.phonetic}
              </span>
            )}
            <span className="text-xs text-neutral-400">
              点击 / 空格 翻面
            </span>
          </>
        ) : (
          <CardBack word={word} entry={entry} loading={entryLoading} />
        )}
      </Button>

      {/* 反馈按钮 */}
      <div className="mt-6 flex flex-col gap-2">
        {!flipped ? (
          <p className="text-center text-xs text-neutral-400">
            翻面后选择掌握程度
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            <RatingButton
              label="忘记"
              hint="1"
              color="red"
              disabled={submitting}
              onClick={() => handleRate("Again")}
            />
            <RatingButton
              label="模糊"
              hint="2"
              color="amber"
              disabled={submitting}
              onClick={() => handleRate("Hard")}
            />
            <RatingButton
              label="认识"
              hint="3 / 长按 Easy"
              color="green"
              disabled={submitting}
              onClick={() => handleRate("Good")}
              onPointerDown={startEasyLongPress}
              onPointerUp={cancelEasyLongPress}
              onPointerLeave={cancelEasyLongPress}
            />
          </div>
        )}
        <p className="text-center text-xs text-neutral-400">
          键盘：空格翻面 · 1 忘记 · 2 模糊 · 3 认识 · 4 Easy
        </p>
      </div>
    </main>
  );
}

function CardBack({
  word,
  entry,
  loading,
}: {
  word: string;
  entry: DictEntry | null;
  loading: boolean;
}) {
  if (loading) {
    return <p className="text-sm text-neutral-400">加载释义…</p>;
  }
  if (entry === null) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-2xl font-bold">{word}</p>
        <p className="text-sm text-neutral-400">（本地词库无此词条释义）</p>
      </div>
    );
  }
  return (
    <div className="flex w-full flex-col gap-3 text-left">
      <div className="flex items-center gap-3">
        <span className="text-2xl font-bold">{entry.word}</span>
        {entry.pos && (
          <span className="text-sm italic text-neutral-400">{entry.pos}</span>
        )}
        {typeof window !== "undefined" && "speechSynthesis" in window && (
          <Button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              const u = new SpeechSynthesisUtterance(entry.word);
              u.lang = "en-US";
              window.speechSynthesis.speak(u);
            }}
            variant="secondary"
            size="sm"
            aria-label={`发音 ${entry.word}`}
          >
            🔊
          </Button>
        )}
      </div>
      <p className="text-base leading-relaxed text-neutral-800 dark:text-neutral-200">
        {entry.translation}
      </p>
      {entry.definition && (
        <p className="text-sm leading-relaxed text-neutral-500">
          {entry.definition}
        </p>
      )}
      {entry.examples && entry.examples.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {entry.examples.slice(0, 2).map((ex, i) => (
            <li key={i} className="text-sm">
              <p className="text-neutral-700 dark:text-neutral-300">{ex.en}</p>
              <p className="text-xs text-neutral-400">{ex.zh}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

type RatingColor = "red" | "amber" | "green";
function RatingButton({
  label,
  hint,
  color,
  disabled,
  onClick,
  onPointerDown,
  onPointerUp,
  onPointerLeave,
}: {
  label: string;
  hint: string;
  color: RatingColor;
  disabled: boolean;
  onClick: () => void;
  onPointerDown?: () => void;
  onPointerUp?: () => void;
  onPointerLeave?: () => void;
}) {
  const colorClasses: Record<RatingColor, string> = {
    red: "border-red-400 text-red-600 hover:bg-red-50 dark:hover:bg-red-950",
    amber:
      "border-amber-400 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950",
    green:
      "border-green-400 text-green-600 hover:bg-green-50 dark:hover:bg-green-950",
  };
  return (
    <Button
      type="button"
      onClick={onClick}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerLeave}
      disabled={disabled}
      variant="secondary"
      className={`flex flex-col items-center gap-0.5 rounded-lg border-2 py-3 text-base font-medium transition-colors ${colorClasses[color]}`}
    >
      <span>{label}</span>
      <span className="text-[10px] opacity-60">{hint}</span>
    </Button>
  );
}

function DoneScreen({
  outcomes,
  loadError,
}: {
  outcomes: ReviewOutcome[];
  loadError: string | null;
}) {
  const reviewed = outcomes.length;
  const newCount = outcomes.filter((o) => o.wasNew).length;
  const reviewCount = reviewed - newCount;
  const byRating = outcomes.reduce<Record<string, number>>((acc, o) => {
    acc[o.rating] = (acc[o.rating] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col items-center justify-center gap-6 px-4 py-10 text-center">
      {loadError ? (
        <p className="text-sm text-red-500">{loadError}</p>
      ) : reviewed === 0 ? (
        <>
          <h1 className="text-2xl font-bold">今日无待复习卡片</h1>
          <p className="text-sm text-neutral-500">
            查个新词收藏入队，明天来这里复习吧
          </p>
        </>
      ) : (
        <>
          <h1 className="text-3xl font-bold">🎉 复习完成</h1>
          <p className="text-sm text-neutral-500">
            今日完成 {reviewed} 张 · 新学 {newCount} 张 · 复习 {reviewCount} 张
          </p>
          <div className="grid w-full max-w-xs grid-cols-2 gap-2 text-sm">
            <Stat label="忘记" value={byRating.Again ?? 0} color="text-red-500" />
            <Stat label="模糊" value={byRating.Hard ?? 0} color="text-amber-500" />
            <Stat label="认识" value={byRating.Good ?? 0} color="text-green-500" />
            <Stat label="Easy" value={byRating.Easy ?? 0} color="text-blue-500" />
          </div>
          <Encouragement reviewed={reviewed} newCount={newCount} />
          <p className="text-xs text-neutral-400">
            进度已实时保存，随时可退出
          </p>
        </>
      )}
      <Link
        href="/"
        className="rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
      >
        返回查词
      </Link>
    </main>
  );
}

function Stat({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="rounded-lg border border-neutral-200 px-3 py-2 dark:border-neutral-800">
      <p className={`text-lg font-bold ${color}`}>{value}</p>
      <p className="text-xs text-neutral-500">{label}</p>
    </div>
  );
}

/** 完成页情感激励：根据复习量给出不同鼓励，强化正反馈 */
function Encouragement({ reviewed, newCount }: { reviewed: number; newCount: number }) {
  const message =
    reviewed >= 50
      ? "🔥 今日超神！坚持是这个 App 唯一的秘籍"
      : reviewed >= 20
        ? "💪 又前进了一步，记忆正在变成长期记忆"
        : reviewed >= 10
          ? "🌱 今天的积累，会成为明天的本能"
          : newCount > 0
            ? "✨ 新词已入队，FSRS 会在最佳时机让它重现"
            : "👋 完成今日复习，明天见";
  return (
    <p className="text-sm font-medium text-blue-600 dark:text-blue-400">
      {message}
    </p>
  );
}
