"use client";

/**
 * 复习页（设计文档 §3.2 B：留存核心）
 *
 * 两种学习模式：
 * 1. FSRS 复习模式（默认）：按算法安排到期卡片 + 每日新词
 *    - 三按钮：忘记/模糊/认识 → Again/Hard/Good；长按认识 = Easy
 *    - 评分实时落库，影响后续复习调度
 * 2. 刷题模式：主动遍历整本词书，不受 FSRS 调度限制
 *    - 支持顺序 / 随机
 *    - 翻面后只前进/后退，不评分
 *    - 随时退出，不影响 FSRS 进度
 *
 * 公共特性：
 * - 正面：单词 + 音标 + 自动发音；点击/空格翻面显示释义与例句
 * - 顶部进度条；键盘快捷键
 * - 中断友好：FSRS 模式每次反馈实时落库
 */
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { listDueCards, buildTodayQueue, type TodayQueueItem } from "@/lib/review/today-queue";
import { getTodayNewWords, advanceCursor, getBookWords, loadBookMeta } from "@/lib/review/book-queue";
import { submitReview, markWordAsMastered, type ReviewOutcome } from "@/lib/review/review-session";
import { findEntry, type DictEntry } from "@/lib/dict/dict-loader";
import type { Rating } from "@/lib/review/fsrs-scheduler";
import { recordStudy } from "@/lib/stats/streak-io";
import { todayLocalDate } from "@/lib/review/book-queue";
import { getActiveBook } from "@/lib/review/active-book";
import { getItem, listItemsByPrefix } from "@/lib/storage/db";
import type { WordCard } from "@/lib/review/fsrs-scheduler";
import { cardKey } from "@/lib/review/favorite";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChevronLeftIcon, TrophyIcon, VolumeIcon } from "@/components/ui/icons";
import { usePronunciation } from "@/lib/audio/use-pronunciation";
import { useSwipe } from "@/lib/review/use-swipe";
import {
  filterMasteredFromFsrsCache,
  loadReviewSession,
  saveReviewSession,
  type ReviewSessionCache,
} from "@/lib/review/review-session-cache";

type Mode = "fsrs" | "drill";
type Phase = "loading" | "reviewing" | "done" | "no-book" | "error";
type DrillPhase = "selecting" | "loading" | "running" | "done";
type DrillOrder = "sequential" | "random";

export default function ReviewPage() {
  // 恢复上次模式（fsrs / drill）：lazy initializer 同步读取，避免 effect 内 setState
  const [mode, setMode] = useState<Mode>(() => {
    const cached = loadReviewSession();
    return cached && (cached.mode === "fsrs" || cached.mode === "drill")
      ? cached.mode
      : "fsrs";
  });

  // 模式切换时持久化（保留另一模式的快照）
  const handleModeChange = useCallback(
    (m: Mode) => {
      setMode(m);
      const cached = loadReviewSession();
      saveReviewSession({ ...cached, version: 1, mode: m, savedAt: new Date().toISOString() });
    },
    []
  );

  return (
    <div className="mx-auto flex h-[100dvh] w-full max-w-2xl flex-col overflow-hidden px-4 py-4">
      {/* 顶部模式切换 */}
      <ModeSwitcher mode={mode} onChange={handleModeChange} />
      {mode === "fsrs" ? <FsrsReview /> : <DrillMode />}
    </div>
  );
}

/* ───────────────── 模式切换器 ───────────────── */
function ModeSwitcher({
  mode,
  onChange,
}: {
  mode: Mode;
  onChange: (m: Mode) => void;
}) {
  return (
    <div className="mb-3 flex shrink-0 items-center justify-between gap-2">
      <div className="flex rounded-lg border border-neutral-200 bg-neutral-100 p-0.5 text-xs dark:border-neutral-800 dark:bg-neutral-900">
        <Button
          type="button"
          variant="plain"
          onClick={() => onChange("fsrs")}
          className={`!rounded-md !px-3 !py-1.5 !font-medium transition-colors ${
            mode === "fsrs"
              ? "!bg-blue-600 !text-white shadow-sm hover:!bg-blue-700 dark:hover:!bg-blue-700"
              : "!text-neutral-500 hover:!text-neutral-700 dark:hover:!text-neutral-300"
          }`}
        >
          今日复习
        </Button>
        <Button
          type="button"
          variant="plain"
          onClick={() => onChange("drill")}
          className={`!rounded-md !px-3 !py-1.5 !font-medium transition-colors ${
            mode === "drill"
              ? "!bg-blue-600 !text-white shadow-sm hover:!bg-blue-700 dark:hover:!bg-blue-700"
              : "!text-neutral-500 hover:!text-neutral-700 dark:hover:!text-neutral-300"
          }`}
        >
          刷题模式
        </Button>
      </div>
      <Link href="/" className="text-xs text-neutral-400 hover:underline">
        退出
      </Link>
    </div>
  );
}

/* ───────────────── FSRS 复习模式 ───────────────── */
function FsrsReview() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [queue, setQueue] = useState<TodayQueueItem[]>([]);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [entry, setEntry] = useState<DictEntry | null>(null);
  const [loadedForWord, setLoadedForWord] = useState<string | null>(null);
  const [outcomes, setOutcomes] = useState<ReviewOutcome[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);

  // 构建今日队列（优先从缓存恢复，否则重建）
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setPhase("loading");
      setLoadError(null);

      // 尝试恢复上次 FSRS 会话快照（同一天内有效）
      const cached = loadReviewSession();
      const fsrsSnap = cached?.fsrs;
      if (
        fsrsSnap &&
        Array.isArray(fsrsSnap.queue) &&
        fsrsSnap.queue.length > 0 &&
        fsrsSnap.index >= 0 &&
        fsrsSnap.index < fsrsSnap.queue.length
      ) {
        // DB 再校验：过滤掉已标记为 mastered 的词（防止缓存快照过期）
        const masteredWords = new Set<string>();
        for (const item of fsrsSnap.queue) {
          if (item.type === "due" && item.card) {
            const latest = await getItem<{ verification?: string }>(cardKey(item.card.word));
            if (latest?.verification === "mastered") {
              masteredWords.add(item.card.word.toLowerCase());
            }
          }
        }
        const filtered = filterMasteredFromFsrsCache(fsrsSnap, masteredWords);
        if (filtered.queue.length === 0) {
          // 过滤后队列空了，跳到正常加载流程（不 return）
        } else {
          setQueue(filtered.queue);
          setIndex(filtered.index);
          setFlipped(filtered.flipped);
          setOutcomes(Array.isArray(filtered.outcomes) ? filtered.outcomes : []);
          setPhase("reviewing");
          return;
        }
      }

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
          getTodayNewWords(active.bookId),
        ]);
        if (cancelled) return;
        const items = buildTodayQueue({
          dueCards,
          newWordCandidates: newWords,
          dailyNewLimit: newWords.length,
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
          setPhase("error");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [retryNonce]);

  // reviewing 期间持续保存快照；done 时清除
  useEffect(() => {
    if (phase === "reviewing" && queue.length > 0) {
      const snap: ReviewSessionCache = {
        version: 1,
        mode: "fsrs",
        savedAt: new Date().toISOString(),
        fsrs: { queue, index, flipped, outcomes },
      };
      saveReviewSession(snap);
    } else if (phase === "done") {
      const cached = loadReviewSession();
      if (cached?.fsrs) {
        saveReviewSession({ ...cached, fsrs: undefined, savedAt: new Date().toISOString() });
      }
    }
  }, [phase, queue, index, flipped, outcomes]);

  const currentItem = queue[index];
  const currentWord = currentItem
    ? currentItem.type === "due"
      ? currentItem.card.word
      : currentItem.word
    : null;
  const entryLoading = currentWord !== loadedForWord;

  // 加载当前卡片词典释义
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
        const correct = rating === "Good" || rating === "Easy" ? 1 : 0;
        await recordStudy(
          todayLocalDate(),
          {
            newCount: outcome.wasNew ? 1 : 0,
            reviewCount: outcome.wasNew ? 0 : 1,
            correctCount: correct,
          }
        ).catch(() => {
          /* Streak 写入失败不阻塞复习主流程 */
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

  const goPrev = useCallback(() => {
    if (submitting || index === 0) return;
    setFlipped(false);
    setIndex(index - 1);
  }, [index, submitting]);

  const skip = useCallback(() => {
    if (submitting) return;
    setFlipped(false);
    if (index + 1 >= queue.length) {
      setPhase("done");
    } else {
      setIndex(index + 1);
    }
  }, [index, queue.length, submitting]);

  const swipe = useSwipe({ onPrev: goPrev, onNext: skip });

  // 键盘快捷键：空格翻面，1/2/3/4 评分，← 上一个，→ 跳过
  useEffect(() => {
    if (phase !== "reviewing") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        flip();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        goPrev();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        skip();
      } else if (flipped && !submitting) {
        if (e.key === "1") handleRate("Again");
        else if (e.key === "2") handleRate("Hard");
        else if (e.key === "3") handleRate("Good");
        else if (e.key === "4") handleRate("Easy");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, flipped, submitting, flip, handleRate, goPrev, skip]);

  if (phase === "loading") {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-neutral-400">正在加载今日复习队列…</p>
      </div>
    );
  }

  if (phase === "no-book") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
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
      </div>
    );
  }

  if (phase === "done") {
    return <DoneScreen outcomes={outcomes} loadError={loadError} />;
  }

  if (phase === "error") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
        <h1 className="text-xl font-bold text-red-500">加载失败</h1>
        <p className="text-sm text-neutral-500">{loadError}</p>
        <div className="flex gap-3">
          <Button
            type="button"
            onClick={() => setRetryNonce((n) => n + 1)}
            variant="primary"
          >
            重试
          </Button>
          <Link
            href="/books"
            className="rounded-lg border border-neutral-300 px-4 py-2 text-sm text-neutral-600 hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-900"
          >
            换个词库
          </Link>
        </div>
      </div>
    );
  }

  const total = queue.length;
  const progress = total > 0 ? ((index) / total) * 100 : 0;
  const word =
    currentItem!.type === "due" ? currentItem!.card.word : currentItem!.word;
  const isNew = currentItem!.type === "new";

  return (
    <>
      {/* 进度条 */}
      <div className="flex shrink-0 flex-col gap-1">
        <div className="flex items-center justify-between text-xs text-neutral-500">
          <span>
            第 {index + 1} / {total} 张
            {isNew && <span className="ml-2 text-blue-500">新词</span>}
          </span>
          <span className="text-neutral-400">FSRS 复习</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
          <div
            className="h-full bg-blue-500 transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* 卡片 */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => {
          if (submitting) return;
          if (swipe.shouldSuppressClick()) return; // 滑动后的合成 click 不翻面
          flip();
        }}
        onKeyDown={(e) => {
          if (submitting) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            if (!swipe.shouldSuppressClick()) flip();
          }
        }}
        aria-disabled={submitting || undefined}
        onTouchStart={swipe.onTouchStart}
        onTouchMove={swipe.onTouchMove}
        onTouchEnd={swipe.onTouchEnd}
        style={swipe.touchActionStyle}
        aria-label={flipped ? "点击返回正面" : "点击翻面查看释义"}
        className={`mt-4 flex max-h-[55vh] min-h-[12rem] flex-1 cursor-pointer flex-col items-center justify-center gap-3 overflow-y-auto rounded-2xl border border-neutral-200 bg-white px-5 py-6 text-center shadow-sm transition-colors hover:bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-950 dark:hover:bg-neutral-900 ${submitting ? "opacity-50 cursor-not-allowed" : ""}`}
      >
        {!flipped ? (
          <>
            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">{word}</h1>
            {!entryLoading && entry?.phonetic && (
              <span className="font-mono text-base text-neutral-500 sm:text-lg">
                {entry.phonetic}
              </span>
            )}
            <span className="text-xs text-neutral-400">
              点击 / 空格 翻面 · ←/→ 或左右滑切换
            </span>
          </>
        ) : (
          <CardBack word={word} entry={entry} loading={entryLoading} />
        )}
      </div>

      {/* 反馈按钮 */}
      <div className="mt-4 flex shrink-0 flex-col gap-2 pb-2">
        {!flipped ? (
          <p className="text-center text-xs text-neutral-400">
            翻面后选择掌握程度
          </p>
        ) : (
          <div className="grid grid-cols-4 gap-1.5">
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
              hint="3"
              color="green"
              disabled={submitting}
              onClick={() => handleRate("Good")}
            />
            <RatingButton
              label="Easy"
              hint="4"
              color="blue"
              disabled={submitting}
              onClick={() => handleRate("Easy")}
            />
          </div>
        )}
        <p className="text-center text-xs text-neutral-400">
          空格翻面 · 1-4 评分 · ←/→ 或左右滑切换
        </p>
      </div>
    </>
  );
}

/* ───────────────── 刷题模式 ───────────────── */
function DrillMode() {
  // 恢复上次刷题快照：lazy initializer 同步读取 localStorage，避免 effect 内 setState
  const drillSnap = (() => {
    const cached = loadReviewSession();
    const s = cached?.drill;
    if (
      s &&
      Array.isArray(s.words) &&
      s.words.length > 0 &&
      Array.isArray(s.wordOffsets) &&
      s.wordOffsets.length === s.words.length &&
      s.index >= 0 &&
      s.index < s.words.length
    ) {
      return s;
    }
    return null;
  })();

  const [drillPhase, setDrillPhase] = useState<DrillPhase>(drillSnap ? "running" : "selecting");
  const [order, setOrder] = useState<DrillOrder>(drillSnap?.order ?? "sequential");
  const [filterMastered, setFilterMastered] = useState(drillSnap?.filterMastered ?? true);
  const [words, setWords] = useState<string[]>(drillSnap?.words ?? []);
  const [wordOffsets, setWordOffsets] = useState<number[]>(drillSnap?.wordOffsets ?? []);
  const [index, setIndex] = useState(drillSnap?.index ?? 0);
  const [flipped, setFlipped] = useState(drillSnap?.flipped ?? false);
  const [entry, setEntry] = useState<DictEntry | null>(null);
  const [loadedForWord, setLoadedForWord] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadProgress, setLoadProgress] = useState<{ loaded: number; total: number } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [outcomes, setOutcomes] = useState<ReviewOutcome[]>(
    Array.isArray(drillSnap?.outcomes) ? drillSnap!.outcomes! : []
  );
  const [masteredCount, setMasteredCount] = useState(drillSnap?.masteredCount ?? 0);
  const [activeBookId, setActiveBookId] = useState<string | null>(drillSnap?.activeBookId ?? null);

  // running 期间持续保存快照；done 时清除
  useEffect(() => {
    if (drillPhase === "running" && words.length > 0) {
      const snap: ReviewSessionCache = {
        version: 1,
        mode: "drill",
        savedAt: new Date().toISOString(),
        drill: {
          order,
          filterMastered,
          words,
          wordOffsets,
          index,
          flipped,
          masteredCount,
          outcomes,
          activeBookId,
        },
      };
      saveReviewSession(snap);
    } else if (drillPhase === "done") {
      const cached = loadReviewSession();
      if (cached?.drill) {
        saveReviewSession({ ...cached, drill: undefined, savedAt: new Date().toISOString() });
      }
    }
  }, [drillPhase, order, filterMastered, words, wordOffsets, index, flipped, masteredCount, outcomes, activeBookId]);

  // 开始刷题：加载词库全部词条，按需过滤已掌握
  const startDrill = useCallback(
    async (selectedOrder: DrillOrder, filter: boolean) => {
      setDrillPhase("loading");
      setLoadError(null);
      setLoadProgress({ loaded: 0, total: 0 });
      setOutcomes([]);
      setMasteredCount(0);
      try {
        const active = await getActiveBook();
        if (!active) {
          setLoadError("还没有选择词库，请先选词库");
          setDrillPhase("selecting");
          return;
        }
        setActiveBookId(active.bookId);

        // 收集已掌握词（用于过滤）
        const existingCards = await listItemsByPrefix<WordCard>("card:");
        const masteredWords = new Set(
          existingCards
            .filter((c) => c.verification === "mastered")
            .map((c) => (c.word ?? "").toLowerCase())
            .filter(Boolean)
        );

        // 加载全部词书词，保留原始 offset 用于推进 cursor
        const meta = await loadBookMeta(active.bookId);
        const allWords: { word: string; offset: number }[] = [];
        const batchSize = 500;
        for (let offset = 0; offset < meta.wordCount; offset += batchSize) {
          const limit = Math.min(batchSize, meta.wordCount - offset);
          const words = await getBookWords(active.bookId, offset, limit);
          words.forEach((w, i) => {
            const wlower = w.word.toLowerCase();
            if (filter && masteredWords.has(wlower)) return;
            allWords.push({ word: w.word, offset: offset + i });
          });
          setLoadProgress({ loaded: allWords.length, total: meta.wordCount });
        }

        if (allWords.length === 0) {
          setLoadError(filter ? "词库全部已掌握，可关闭过滤重刷" : "词库为空");
          setDrillPhase("selecting");
          return;
        }

        // 排序或洗牌
        const sorted =
          selectedOrder === "sequential"
            ? allWords.sort((a, b) => a.offset - b.offset)
            : shuffle(allWords);

        setOrder(selectedOrder);
        setFilterMastered(filter);
        setWords(sorted.map((w) => w.word));
        setWordOffsets(sorted.map((w) => w.offset));
        setIndex(0);
        setFlipped(false);
        setDrillPhase("running");
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : "加载词库失败");
        setDrillPhase("selecting");
      }
    },
    []
  );

  const currentWord = words[index] ?? null;
  const entryLoading = currentWord !== loadedForWord;

  // 加载当前词条释义
  useEffect(() => {
    if (drillPhase !== "running" || !currentWord) return;
    let cancelled = false;
    findEntry(currentWord)
      .then((e) => {
        if (cancelled) return;
        setEntry(e ?? null);
        setLoadedForWord(currentWord);
      })
      .catch(() => {
        if (cancelled) return;
        setEntry(null);
        setLoadedForWord(currentWord);
      });
    return () => {
      cancelled = true;
    };
  }, [index, drillPhase, currentWord]);

  const flip = useCallback(() => {
    if (submitting) return;
    setFlipped((f) => !f);
  }, [submitting]);

  // 评分落库 + 推进 cursor + 影响 FSRS 进度
  const handleRate = useCallback(
    async (rating: Rating) => {
      if (submitting || !currentWord || !flipped) return;
      setSubmitting(true);
      try {
        const offset = wordOffsets[index];
        const item: TodayQueueItem = {
          type: "new",
          word: currentWord,
          source: activeBookId ? `book:${activeBookId}` : "drill",
        };
        const outcome = await submitReview(item, rating, "standard");
        // 推进 cursor 到当前位置 + 1，避免 FSRS 新词轨重复发放
        if (activeBookId) {
          await advanceCursor(activeBookId, offset + 1);
        }
        // Streak 累加
        const correct = rating === "Good" || rating === "Easy" ? 1 : 0;
        await recordStudy(
          todayLocalDate(),
          {
            newCount: 1,
            reviewCount: 0,
            correctCount: correct,
          }
        ).catch(() => {});
        setOutcomes((prev) => [...prev, outcome]);
        setFlipped(false);
        if (index + 1 >= words.length) {
          setDrillPhase("done");
        } else {
          setIndex(index + 1);
        }
      } finally {
        setSubmitting(false);
      }
    },
    [submitting, currentWord, flipped, wordOffsets, index, activeBookId, words.length]
  );

  // 长按"认识"= 直接标记已掌握（不评分，跳过 FSRS）
  const handleMarkMastered = useCallback(async () => {
    if (submitting || !currentWord) return;
    setSubmitting(true);
    try {
      const offset = wordOffsets[index];
      await markWordAsMastered(currentWord, activeBookId ? `book:${activeBookId}` : "drill");
      if (activeBookId) {
        await advanceCursor(activeBookId, offset + 1);
      }
      // 同步失效 fsrs 缓存中的该词（防止切到今日复习仍看到）
      const cached = loadReviewSession();
      if (cached?.fsrs) {
        const mastered = new Set([currentWord.toLowerCase()]);
        const filtered = filterMasteredFromFsrsCache(cached.fsrs, mastered);
        saveReviewSession({ ...cached, fsrs: filtered });
      }
      await recordStudy(
        todayLocalDate(),
        { newCount: 1, reviewCount: 0, correctCount: 1 }
      ).catch(() => {});
      setMasteredCount((n) => n + 1);
      setFlipped(false);
      if (index + 1 >= words.length) {
        setDrillPhase("done");
      } else {
        setIndex(index + 1);
      }
    } finally {
      setSubmitting(false);
    }
  }, [submitting, currentWord, wordOffsets, index, activeBookId, words.length]);

  const goPrev = useCallback(() => {
    if (index === 0 || submitting) return;
    setFlipped(false);
    setIndex(index - 1);
  }, [index, submitting]);

  const skip = useCallback(() => {
    if (submitting) return;
    setFlipped(false);
    if (index + 1 >= words.length) {
      setDrillPhase("done");
    } else {
      setIndex(index + 1);
    }
  }, [index, words.length, submitting]);

  const drillSwipe = useSwipe({ onPrev: goPrev, onNext: skip });

  // 键盘：空格翻面，1/2/3/4 评分，← 上一个，s 跳过，m 标记掌握
  useEffect(() => {
    if (drillPhase !== "running") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        flip();
      } else if (flipped && !submitting) {
        if (e.key === "1") handleRate("Again");
        else if (e.key === "2") handleRate("Hard");
        else if (e.key === "3") handleRate("Good");
        else if (e.key === "4") handleRate("Easy");
        else if (e.key === "m" || e.key === "M") handleMarkMastered();
        else if (e.key === "s" || e.key === "S") skip();
      } else if (!submitting) {
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          goPrev();
        } else if (e.key === "ArrowRight") {
          e.preventDefault();
          skip();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drillPhase, flipped, submitting, flip, handleRate, handleMarkMastered, skip, goPrev]);

  // 选择页
  if (drillPhase === "selecting") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
        <div>
          <h1 className="text-2xl font-bold">刷题模式</h1>
          <p className="mt-2 text-sm text-neutral-500">
            批量过词、标记已会词。评分会落库并影响 FSRS 进度，已掌握词不会再进复习队列
          </p>
        </div>
        {loadError && (
          <p className="text-sm text-red-500">{loadError}</p>
        )}
        <label className="flex items-center gap-2 text-xs text-neutral-600 dark:text-neutral-400">
          <Input
            type="checkbox"
            checked={filterMastered}
            onChange={(e) => setFilterMastered(e.target.checked)}
            className="h-3.5 w-3.5"
          />
          过滤已掌握的词（推荐）
        </label>
        <div className="flex w-full max-w-xs flex-col gap-2">
          <Button
            type="button"
            onClick={() => startDrill("sequential", filterMastered)}
            variant="primary"
            className="w-full py-3"
          >
            顺序刷题
          </Button>
          <Button
            type="button"
            onClick={() => startDrill("random", filterMastered)}
            variant="secondary"
            className="w-full py-3"
          >
            随机刷题
          </Button>
        </div>
        <p className="text-xs text-neutral-400">
          评分落库 · 推进进度 · 长按&ldquo;已会&rdquo;直接标记掌握
        </p>
      </div>
    );
  }

  // 加载中
  if (drillPhase === "loading") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
        <p className="text-sm text-neutral-400">正在加载词库…</p>
        {loadProgress && loadProgress.total > 0 && (
          <p className="text-xs text-neutral-500">
            {loadProgress.loaded} / {loadProgress.total}
          </p>
        )}
      </div>
    );
  }

  // 完成页
  if (drillPhase === "done") {
    const reviewed = outcomes.length;
    const newMastered = masteredCount;
    const errors = outcomes.filter(
      (o) => o.rating === "Again" || o.rating === "Hard"
    ).length;
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
        <h1 className="flex items-center justify-center gap-2 text-3xl font-bold">
          <TrophyIcon title="完成" className="h-7 w-7 text-amber-500" />
          <span>刷题完成</span>
        </h1>
        <p className="text-sm text-neutral-500">
          已刷 {reviewed + newMastered} 词 · 评分 {reviewed} · 标记掌握 {newMastered}
        </p>
        {errors > 0 && (
          <p className="text-xs text-amber-600">
            其中 {errors} 词答错，已加入 FSRS 复习队列
          </p>
        )}
        <div className="flex gap-3">
          <Button
            type="button"
            onClick={() => startDrill(order, filterMastered)}
            variant="secondary"
          >
            再刷一遍
          </Button>
          <Button
            type="button"
            onClick={() => setDrillPhase("selecting")}
            variant="primary"
          >
            换种方式
          </Button>
        </div>
        <Link href="/" className="text-xs text-neutral-400 hover:underline">
          返回首页
        </Link>
      </div>
    );
  }

  // 刷题进行中
  const total = words.length;
  const progress = total > 0 ? ((index) / total) * 100 : 0;
  const word = currentWord!;

  return (
    <>
      {/* 进度条 */}
      <div className="flex shrink-0 flex-col gap-1">
        <div className="flex items-center justify-between text-xs text-neutral-500">
          <span>
            第 {index + 1} / {total} 词
            {masteredCount > 0 && (
              <span className="ml-2 text-green-500">已标记 {masteredCount}</span>
            )}
          </span>
          <div className="flex items-center gap-3">
            <span className="text-neutral-400">
              {order === "sequential" ? "顺序" : "随机"}
              {filterMastered ? " · 过滤已掌握" : ""}
            </span>
            <Button
              type="button"
              variant="link"
              size="sm"
              onClick={() => setDrillPhase("selecting")}
            >
              退出刷题
            </Button>
          </div>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
          <div
            className="h-full bg-green-500 transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* 卡片 */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => {
          if (submitting) return;
          if (drillSwipe.shouldSuppressClick()) return; // 滑动后的合成 click 不翻面
          flip();
        }}
        onKeyDown={(e) => {
          if (submitting) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            if (!drillSwipe.shouldSuppressClick()) flip();
          }
        }}
        aria-disabled={submitting || undefined}
        onTouchStart={drillSwipe.onTouchStart}
        onTouchMove={drillSwipe.onTouchMove}
        onTouchEnd={drillSwipe.onTouchEnd}
        style={drillSwipe.touchActionStyle}
        aria-label={flipped ? "点击返回正面" : "点击翻面查看释义"}
        className={`mt-4 flex max-h-[55vh] min-h-[12rem] flex-1 cursor-pointer flex-col items-center justify-center gap-3 overflow-y-auto rounded-2xl border border-neutral-200 bg-white px-5 py-6 text-center shadow-sm transition-colors hover:bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-950 dark:hover:bg-neutral-900 ${submitting ? "opacity-50 cursor-not-allowed" : ""}`}
      >
        {!flipped ? (
          <>
            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">{word}</h1>
            {!entryLoading && entry?.phonetic && (
              <span className="font-mono text-base text-neutral-500 sm:text-lg">
                {entry.phonetic}
              </span>
            )}
            <span className="text-xs text-neutral-400">
              点击 / 空格 翻面 · ←/→ 或左右滑切换
            </span>
          </>
        ) : (
          <CardBack word={word} entry={entry} loading={entryLoading} />
        )}
      </div>

      {/* 反馈按钮 */}
      <div className="mt-4 flex shrink-0 flex-col gap-2 pb-2">
        {!flipped ? (
          <p className="text-center text-xs text-neutral-400">
            翻面后选择掌握程度
          </p>
        ) : (
          <div className="grid grid-cols-4 gap-1.5">
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
              hint="3"
              color="green"
              disabled={submitting}
              onClick={() => handleRate("Good")}
            />
            <RatingButton
              label="Easy"
              hint="4"
              color="blue"
              disabled={submitting}
              onClick={() => handleRate("Easy")}
            />
          </div>
        )}
        <div className="flex items-center justify-between gap-2">
          <Button
            type="button"
            onClick={goPrev}
            variant="ghost"
            size="sm"
            disabled={index === 0 || submitting}
            className="text-xs text-neutral-500"
          >
            <ChevronLeftIcon className="h-4 w-4 inline" /> 上一个
          </Button>
          <div className="flex gap-2">
            <Button
              type="button"
              onClick={handleMarkMastered}
              variant="ghost"
              size="sm"
              disabled={submitting}
              className="text-xs text-green-600 hover:text-green-700 dark:text-green-400"
            >
              标记已会 (M)
            </Button>
            <Button
              type="button"
              onClick={skip}
              variant="ghost"
              size="sm"
              disabled={submitting}
              className="text-xs text-neutral-500"
            >
              跳过 (S)
            </Button>
          </div>
        </div>
        <p className="text-center text-xs text-neutral-400">
          1-4 评分 · M 标记掌握 · S 跳过 · ←/→ 或左右滑切换
        </p>
      </div>
    </>
  );
}

/** Fisher-Yates 洗牌 */
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
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
  const { speak, speaking, supported: speechSupported } = usePronunciation();
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
        {speechSupported && (
          <Button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              speak(entry.word);
            }}
            variant={speaking ? "primary" : "secondary"}
            size="sm"
            aria-label={`发音 ${entry.word}`}
          >
            <VolumeIcon title="发音" className={`h-4 w-4 ${speaking ? "animate-pulse text-blue-500" : ""}`} />
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

type RatingColor = "red" | "amber" | "green" | "blue";
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
    blue: "border-blue-400 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950",
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
          <h1 className="flex items-center justify-center gap-2 text-3xl font-bold">
            <TrophyIcon title="完成" className="h-7 w-7 text-amber-500" />
            <span>复习完成</span>
          </h1>
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
      ? "今日超神！坚持是这个 App 唯一的秘籍"
      : reviewed >= 20
        ? "又前进了一步，记忆正在变成长期记忆"
        : reviewed >= 10
          ? "今天的积累，会成为明天的本能"
          : newCount > 0
            ? "新词已入队，FSRS 会在最佳时机让它重现"
            : "完成今日复习，明天见";
  return (
    <p className="text-sm font-medium text-blue-600 dark:text-blue-400">
      {message}
    </p>
  );
}
