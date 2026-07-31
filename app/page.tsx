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
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { useSearch } from "@/lib/search/use-search";
import {
  loadSearchHistory,
  pushSearchHistory,
  clearSearchHistory,
  removeSearchHistory,
} from "@/lib/search/search-history";
import { aiLookupWord } from "@/lib/dict/ai-lookup";
import type { DictEntry } from "@/lib/dict/dict-loader";
import {
  favoriteWord,
  isFavorited,
  unfavoriteWord,
} from "@/lib/review/favorite";
import { onFavoriteAdded } from "@/lib/gamification/hooks";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  BookIcon,
  BooksIcon,
  CheckIcon,
  ChevronRightIcon,
  CloseIcon,
  HelpCircleIcon,
  PlusIcon,
  RefreshIcon,
  SearchIcon,
} from "@/components/ui/icons";
import GamificationBar from "@/components/gamification/gamification-bar";
import { useGamification } from "@/components/gamification/gamification-provider";

// OnboardingDialog 仅首次访问使用，异步加载减小首屏 bundle
const OnboardingDialog = dynamic(
  () => import("./onboarding-dialog").then((m) => m.default),
  { ssr: false, loading: () => null }
);

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
  const [newWordCount, setNewWordCount] = useState<number | null>(null);
  const [activeBookId, setActiveBookId] = useState<string | null>(null);
  const [activeBookName, setActiveBookName] = useState<string | null>(null);
  const [history, setHistory] = useState<string[]>(() => loadSearchHistory());
  const gamification = useGamification();
  // 词库选择弹窗（受控）：由"开始系统学习"引导卡片触发，不再强制自动弹出
  const [showBookPicker, setShowBookPicker] = useState(false);

  // 会话开始：同步 XP + 检测回归挽留（断签 ≥7 天赠送保护券）
  useEffect(() => {
    import("@/lib/gamification/hooks")
      .then(({ onSessionStart }) => onSessionStart())
      .then((r) => {
        if (r.comebackDetected) {
          gamification.notifyComeback({
            gapDays: r.comebackGapDays,
            shieldGifted: r.shieldGifted,
          });
        }
      })
      .catch(() => {
        /* 游戏化初始化失败不影响首页 */
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // AI 搜索状态：用户点击末尾"问 AI 查询"条目时手动触发
  const [aiSearching, setAiSearching] = useState(false);
  const [aiEntry, setAiEntry] = useState<DictEntry | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [favorited, setFavorited] = useState(false);
  const [toggling, setToggling] = useState(false);
  const aiQueryRef = useRef<string>("");

  // 打开即聚焦
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // 点击搜索结果：记录历史后跳转
  const handlePick = (word: string) => {
    pushSearchHistory(word);
    setHistory(loadSearchHistory());
  };

  // 今日待复习数量 + 今日新词数 + 当前词库（延迟加载，避免 Dexie 阻塞首屏）
  useEffect(() => {
    let cancelled = false;
    // 动态导入重依赖（Dexie / book-queue），不阻塞首屏渲染
    Promise.all([
      import("@/lib/storage/db").then(({ countDueCards }) =>
        countDueCards(new Date().toISOString())
      ),
      import("@/lib/review/active-book").then(({ getActiveBook }) =>
        getActiveBook()
      ),
    ])
      .then(async ([n, ab]) => {
        if (cancelled) return;
        setDueCount(n);
        setActiveBookId(ab?.bookId ?? null);
        if (ab?.bookId) {
          const { peekTodayNewWordCount } = await import("@/lib/review/book-queue");
          const cnt = await peekTodayNewWordCount(ab.bookId).catch(() => 0);
          if (!cancelled) setNewWordCount(cnt);
        } else {
          setNewWordCount(0);
        }
      })
      .catch(() => {
        if (cancelled) return;
        setDueCount(0);
        setActiveBookId(null);
        setNewWordCount(0);
      });
    return () => {
      cancelled = true;
    };
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

  // 需求6：查询词变化时清理 AI 搜索状态（改为手动触发，避免每次输入都消耗 AI 额度）
  useEffect(() => {
    const trimmed = query.trim();
    if (aiQueryRef.current !== trimmed) {
      aiQueryRef.current = "";
      queueMicrotask(() => {
        setAiEntry(null);
        setAiError(null);
        setAiSearching(false);
        setFavorited(false);
      });
    }
  }, [query]);

  // 需求6：手动触发 AI 查询（点击搜索结果末尾的"问 AI 查询"条目）
  const handleAiQuery = (word: string) => {
    const trimmed = word.trim();
    if (!trimmed || aiSearching) return;
    aiQueryRef.current = trimmed;
    setAiSearching(true);
    setAiEntry(null);
    setAiError(null);
    setFavorited(false);

    aiLookupWord(trimmed)
      .then(async (result) => {
        setAiSearching(false);
        if (result.ok && result.entry) {
          setAiEntry(result.entry);
          // 查到词后检查是否已收藏
          try {
            const f = await isFavorited(result.entry.word);
            setFavorited(f);
          } catch {
            setFavorited(false);
          }
        } else {
          setAiError(result.error || "AI 查询失败");
        }
      })
      .catch(() => {
        setAiSearching(false);
        setAiError("AI 查询网络错误");
      });
  };

  // 需求6：收藏/取消收藏 AI 查到的生词（入队 FSRS 复习）
  const handleToggleFavorite = async () => {
    const word = aiEntry?.word;
    if (!word || toggling) return;
    setToggling(true);
    try {
      if (favorited) {
        await unfavoriteWord(word);
        setFavorited(false);
      } else {
        await favoriteWord(word);
        setFavorited(true);
        // 触发游戏化：XP + 任务 + 徽章
        try {
          const g = await onFavoriteAdded({});
          gamification.notifyFavorite({
            xpGained: g.xpGained,
            questBonusXp: g.questBonusXp,
            newBadges: g.newBadges,
          });
        } catch {
          /* 游戏化失败不影响收藏 */
        }
      }
    } catch {
      /* 忽略 */
    } finally {
      setToggling(false);
    }
  };

  const hasQuery = query.trim().length > 0;
  // 需求6：判断是否已存在完全匹配（大小写无关）的内置词条；有则不再展示 AI 查询入口
  const trimmedQuery = query.trim();
  const hasExactMatch = trimmedQuery.length > 0 &&
    results.some((r) => r.word.toLowerCase() === trimmedQuery.toLowerCase());
  // 清除按钮直接从 query 派生，避免 effect 内 setState
  const showClear = query.length > 0;
  const totalTodo = (dueCount ?? 0) + (newWordCount ?? 0);
  const showEmptyState =
    !hasQuery && dueCount !== null && totalTodo === 0 && indexReady;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-6 px-4 py-10 pb-24">
      {/* 词库选择弹窗（受控）：由引导卡片触发，不强制弹出 */}
      <OnboardingDialog
        open={showBookPicker}
        onClose={() => setShowBookPicker(false)}
      />

      <header className="text-center">
        <h1 className="text-3xl font-bold tracking-tight">WordFlow</h1>
        <p className="mt-1 text-sm text-neutral-500">查词即背词 · 本地优先 · 离线可用</p>
      </header>

      {/* 游戏化状态条：连胜 / XP / 每日任务（有数据时才显示） */}
      <GamificationBar />

      {/* 当前词库显示 + 切换入口 */}
      {activeBookName && (
        <Link
          href="/books"
          className="flex items-center justify-between rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm dark:border-blue-900 dark:bg-blue-950"
        >
          <span className="flex items-center gap-2">
            <BookIcon title="当前词库" className="h-4 w-4 text-blue-500" />
            <span className="text-neutral-600 dark:text-neutral-300">当前词库</span>
            <span className="font-medium text-blue-700 dark:text-blue-300">
              {activeBookName}
            </span>
          </span>
          <span className="text-xs text-neutral-400">切换 <ChevronRightIcon className="h-4 w-4 inline" /></span>
        </Link>
      )}

      {/* 词库入口：AI 生词本 + 词典浏览 */}
      <div className="flex gap-2">
        <Link
          href="/my-words"
          className="flex flex-1 items-center justify-between rounded-lg border border-neutral-200 px-3 py-2 text-xs text-neutral-600 hover:bg-neutral-50 dark:border-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-900"
        >
          <span className="flex items-center gap-1.5">
            <BookIcon title="AI 生词本" className="h-3.5 w-3.5 text-blue-500" />
            AI 生词本
          </span>
          <ChevronRightIcon className="h-3.5 w-3.5" />
        </Link>
        <Link
          href="/dict"
          className="flex flex-1 items-center justify-between rounded-lg border border-neutral-200 px-3 py-2 text-xs text-neutral-600 hover:bg-neutral-50 dark:border-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-900"
        >
          <span className="flex items-center gap-1.5">
            <SearchIcon title="词典浏览" className="h-3.5 w-3.5 text-blue-500" />
            词典浏览
          </span>
          <ChevronRightIcon className="h-3.5 w-3.5" />
        </Link>
      </div>

      {/* 今日学习提醒：到期复习 + 今日新词合并展示，形成闭环 */}
      <div className="flex items-center justify-between gap-3 rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm dark:border-neutral-800 dark:bg-neutral-900">
        {dueCount === null || newWordCount === null ? (
          <span className="text-neutral-400">加载今日学习…</span>
        ) : totalTodo > 0 ? (
          <Link
            href="/review"
            className="flex items-center gap-1.5 font-medium text-blue-600 hover:underline"
          >
            <BooksIcon title="复习" className="h-4 w-4" />
            <span>
              今日待学 {totalTodo} 词
              {dueCount > 0 && newWordCount > 0
                ? `（复习 ${dueCount} + 新词 ${newWordCount}）`
                : dueCount > 0
                  ? `（${dueCount} 词待复习）`
                  : `（${newWordCount} 个新词）`}
              ，去学习 <ChevronRightIcon className="h-4 w-4 inline" />
            </span>
          </Link>
        ) : (
          <span className="text-neutral-500">
            {activeBookId
              ? "今日已学完，明天见"
              : "暂无到期复习，查个新词吧"}
          </span>
        )}
        <Link
          href="/stats"
          className="shrink-0 text-xs text-neutral-500 hover:underline"
        >
          统计 <ChevronRightIcon className="h-4 w-4 inline" />
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
              <CloseIcon title="清除输入" className="h-4 w-4" />
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
          {!loading &&
            results.map((entry) => (
              <li key={entry.word}>
                <Link
                  href={`/word/${encodeURIComponent(entry.word)}`}
                  onClick={() => handlePick(entry.word)}
                  className="flex items-center justify-between px-4 py-3 hover:bg-neutral-50 dark:hover:bg-neutral-900"
                >
                  <span className="font-mono text-base">{entry.word}</span>
                  <span className="text-xs text-amber-500" aria-label="词频星级">
                    {frequencyToStars(entry.frequency ?? 0)}
                  </span>
                </Link>
              </li>
            ))}
          {/* 需求6：无完全匹配时，末尾追加"问 AI 查询"条目（用户输入原词 + 问号图标） */}
          {!loading && !hasExactMatch && trimmedQuery.length >= 2 && !aiSearching && !aiEntry && (
            <li>
              <Button
                type="button"
                variant="ghost"
                onClick={() => handleAiQuery(trimmedQuery)}
                className="w-full !justify-between !py-3 text-left"
              >
                <span className="flex items-center gap-2">
                  <HelpCircleIcon
                    title="问 AI 查询"
                    className="h-4 w-4 shrink-0 text-blue-500"
                  />
                  <span className="font-mono text-base text-blue-600 dark:text-blue-400">
                    {trimmedQuery}
                  </span>
                </span>
                <span className="text-[10px] text-neutral-400">问 AI 查询</span>
              </Button>
            </li>
          )}
          {/* AI 查询中 */}
          {!loading && aiSearching && (
            <li className="px-4 py-3 text-sm text-neutral-400">
              <span className="inline-flex items-center gap-2">
                <RefreshIcon
                  title="查询中"
                  className="h-3.5 w-3.5 animate-spin text-blue-500"
                />
                AI 查询中…
              </span>
            </li>
          )}
          {/* AI 查询失败 */}
          {!loading && aiError && !aiEntry && (
            <li className="px-4 py-3 text-sm text-neutral-400">
              <span className="flex items-center justify-between gap-2">
                <span>{aiError}</span>
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  onClick={() => handleAiQuery(trimmedQuery)}
                  className="shrink-0 px-2"
                >
                  重试
                </Button>
              </span>
            </li>
          )}
          {/* 需求6：AI 查询结果（已自动入生词本）+ 收藏按钮 */}
          {!loading && aiEntry && (
            <li className="bg-blue-50/50 dark:bg-blue-950/20">
              <div className="flex items-center justify-between gap-2 px-4 py-3">
                <Link
                  href={`/word/${encodeURIComponent(aiEntry.word)}`}
                  onClick={() => handlePick(aiEntry.word)}
                  className="flex flex-1 flex-col gap-0.5 hover:opacity-80"
                >
                  <span className="flex items-center gap-1.5">
                    <span className="font-mono text-base font-medium">
                      {aiEntry.word}
                    </span>
                    <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-[9px] text-blue-600 dark:bg-blue-950 dark:text-blue-300">
                      AI
                    </span>
                  </span>
                  {aiEntry.phonetic && (
                    <span className="font-mono text-xs text-neutral-500">
                      {aiEntry.phonetic}
                    </span>
                  )}
                  {aiEntry.translation && (
                    <span className="text-xs text-neutral-500 line-clamp-2">
                      {aiEntry.translation.split("\n").slice(0, 2).join("；")}
                    </span>
                  )}
                  <span className="text-[10px] text-green-600 dark:text-green-400">
                    已入生词本
                  </span>
                </Link>
                <Button
                  type="button"
                  variant="ghost"
                  size="iconSm"
                  onClick={handleToggleFavorite}
                  disabled={toggling}
                  aria-label={favorited ? `取消收藏 ${aiEntry.word}` : `收藏 ${aiEntry.word}`}
                  className={`shrink-0 ${
                    favorited
                      ? "!text-amber-500"
                      : "!text-neutral-400 hover:!text-amber-500"
                  }`}
                >
                  {favorited ? (
                    <CheckIcon title="已收藏" className="h-4 w-4" />
                  ) : (
                    <PlusIcon title="收藏入复习" className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </li>
          )}
        </ul>
      )}

      {/* 搜索历史：无查询时展示最近查过的词，支持单条删除 */}
      {!hasQuery && history.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-neutral-600">最近搜索</span>
            <Button
              type="button"
              variant="link"
              size="sm"
              onClick={() => {
                clearSearchHistory();
                setHistory([]);
              }}
            >
              清空
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {history.map((w) => (
              <span
                key={w}
                className="group inline-flex items-center gap-1 rounded-full border border-neutral-300 pl-3 pr-1 py-1 text-xs font-mono text-neutral-600 hover:border-blue-400 hover:text-blue-600 dark:border-neutral-700 dark:text-neutral-300"
              >
                <Link
                  href={`/word/${encodeURIComponent(w)}`}
                  onClick={() => handlePick(w)}
                >
                  {w}
                </Link>
                <Button
                  type="button"
                  variant="ghost"
                  size="iconSm"
                  onClick={() => {
                    removeSearchHistory(w);
                    setHistory(loadSearchHistory());
                  }}
                  aria-label={`删除 ${w}`}
                  className="h-4 w-4 rounded-full !text-neutral-400 hover:!text-red-500"
                >
                  <CloseIcon title="删除" className="h-3 w-3" />
                </Button>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 未选词库时的系统学习引导（非阻塞）：先体验查词价值，再主动选择词书 */}
      {activeBookId === null && dueCount !== null && (
        <BookStarter onPick={() => setShowBookPicker(true)} />
      )}

      {/* 首次访问引导：无查询 + 无待复习时展示三步上手 */}
      {showEmptyState && <GettingStarted />}
    </main>
  );
}

/** 系统学习引导卡片：未选词库的新用户看到，一键开始或浏览词库 */
function BookStarter({ onPick }: { onPick: () => void }) {
  return (
    <section className="rounded-xl border border-blue-200 bg-gradient-to-br from-blue-50 to-indigo-50 px-5 py-5 dark:border-blue-900 dark:from-blue-950/50 dark:to-indigo-950/50">
      <div className="flex items-start gap-3">
        <BookIcon className="h-7 w-7 shrink-0 text-blue-500" />
        <div className="flex flex-1 flex-col gap-1">
          <h2 className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">
            想系统背一本词书吗？
          </h2>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            选一本词库（CET-4 / CET-6 / 高考 / 考研），每天自动安排新词与复习
          </p>
          <div className="mt-3 flex gap-2">
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={onPick}
            >
              选择词库开始
            </Button>
            <Link
              href="/books"
              className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-600 hover:bg-white dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-900"
            >
              先逛逛词库
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

/** 首次访问引导卡片：用三步让新用户立刻明白产品价值 */
function GettingStarted() {
  const steps = [
    {
      icon: <SearchIcon title="查词" className="h-4 w-4" />,
      title: "查个词",
      desc: "试试 abandon、ability、abroad",
    },
    {
      icon: <PlusIcon title="收藏" className="h-4 w-4" />,
      title: "收藏入队",
      desc: "词条页右上角加入复习队列",
    },
    {
      icon: <BooksIcon title="复习" className="h-4 w-4" />,
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
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-300">
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
