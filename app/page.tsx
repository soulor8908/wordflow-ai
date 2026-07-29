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
} from "@/lib/search/search-history";
import { aiLookupWord } from "@/lib/dict/ai-lookup";
import type { DictEntry } from "@/lib/dict/dict-loader";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  BookIcon,
  BooksIcon,
  ChevronRightIcon,
  CloseIcon,
  PlusIcon,
  SearchIcon,
} from "@/components/ui/icons";

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

  // AI 搜索状态：内置词典无结果时自动调用 AI
  const [aiSearching, setAiSearching] = useState(false);
  const [aiEntry, setAiEntry] = useState<DictEntry | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
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

  // AI 搜索：内置词典无结果时自动调用（debounce 等搜索稳定后触发）
  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed || trimmed.length < 2 || !indexReady || results.length > 0 || loading) {
      // 清理 AI 状态：延迟到微任务，避免 effect 内同步 setState 触发级联渲染
      queueMicrotask(() => {
        setAiEntry(null);
        setAiError(null);
        setAiSearching(false);
      });
      aiQueryRef.current = "";
      return;
    }

    // 内置词典无结果 + 搜索完成 → 触发 AI 搜索
    // 防抖：等 500ms 确认用户停止输入
    const timer = setTimeout(() => {
      // 避免重复查询同一词
      if (aiQueryRef.current === trimmed) return;
      aiQueryRef.current = trimmed;
      setAiSearching(true);
      setAiEntry(null);
      setAiError(null);

      aiLookupWord(trimmed)
        .then((result) => {
          setAiSearching(false);
          if (result.ok && result.entry) {
            setAiEntry(result.entry);
          } else {
            setAiError(result.error || "AI 搜索失败");
          }
        })
        .catch(() => {
          setAiSearching(false);
          setAiError("AI 搜索网络错误");
        });
    }, 500);

    return () => clearTimeout(timer);
  }, [query, results.length, loading, indexReady]);

  const hasQuery = query.trim().length > 0;
  // 清除按钮直接从 query 派生，避免 effect 内 setState
  const showClear = query.length > 0;
  const totalTodo = (dueCount ?? 0) + (newWordCount ?? 0);
  const showEmptyState =
    !hasQuery && dueCount !== null && totalTodo === 0 && indexReady;

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
            <BookIcon title="当前词库" className="h-4 w-4 text-blue-500" />
            <span className="text-neutral-600 dark:text-neutral-300">当前词库</span>
            <span className="font-medium text-blue-700 dark:text-blue-300">
              {activeBookName}
            </span>
          </span>
          <span className="text-xs text-neutral-400">切换 <ChevronRightIcon className="h-4 w-4 inline" /></span>
        </Link>
      )}

      {/* 词库入口：我的词库 + 全量词库 */}
      <div className="flex gap-2">
        <Link
          href="/my-words"
          className="flex flex-1 items-center justify-between rounded-lg border border-neutral-200 px-3 py-2 text-xs text-neutral-600 hover:bg-neutral-50 dark:border-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-900"
        >
          <span className="flex items-center gap-1.5">
            <BookIcon title="我的词库" className="h-3.5 w-3.5 text-blue-500" />
            我的词库
          </span>
          <ChevronRightIcon className="h-3.5 w-3.5" />
        </Link>
        <Link
          href="/dict"
          className="flex flex-1 items-center justify-between rounded-lg border border-neutral-200 px-3 py-2 text-xs text-neutral-600 hover:bg-neutral-50 dark:border-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-900"
        >
          <span className="flex items-center gap-1.5">
            <SearchIcon title="全量词库" className="h-3.5 w-3.5 text-blue-500" />
            全量词库
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
          {!loading && results.length === 0 && !aiSearching && !aiEntry && !aiError && (
            <li className="px-4 py-3 text-sm text-neutral-400">
              无匹配，试试检查拼写
            </li>
          )}
          {!loading && results.length === 0 && aiSearching && (
            <li className="px-4 py-3 text-sm text-neutral-400">
              <span className="inline-flex items-center gap-2">
                <span className="animate-pulse">●</span>
                AI 搜索中…
              </span>
            </li>
          )}
          {!loading && results.length === 0 && aiError && !aiEntry && (
            <li className="px-4 py-3 text-sm text-neutral-400">
              {aiError}
            </li>
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
          {/* AI 搜索结果（已自动加入我的词库） */}
          {!loading && results.length === 0 && aiEntry && (
            <li>
              <Link
                href={`/word/${encodeURIComponent(aiEntry.word)}`}
                onClick={() => handlePick(aiEntry.word)}
                className="flex items-center justify-between px-4 py-3 hover:bg-neutral-50 dark:hover:bg-neutral-900"
              >
                <span className="flex flex-col gap-0.5">
                  <span className="font-mono text-base">{aiEntry.word}</span>
                  {aiEntry.translation && (
                    <span className="text-xs text-neutral-500 line-clamp-1">
                      {aiEntry.translation.split("\n")[0]}
                    </span>
                  )}
                </span>
                <span className="flex shrink-0 items-center gap-1.5">
                  <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-[9px] text-blue-600 dark:bg-blue-950 dark:text-blue-300">
                    AI
                  </span>
                  <span className="text-[10px] text-green-600 dark:text-green-400">
                    已入库
                  </span>
                </span>
              </Link>
            </li>
          )}
        </ul>
      )}

      {/* 搜索历史：无查询时展示最近查过的词 */}
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
              <Link
                key={w}
                href={`/word/${encodeURIComponent(w)}`}
                onClick={() => handlePick(w)}
                className="rounded-full border border-neutral-300 px-3 py-1 text-xs font-mono text-neutral-600 hover:border-blue-400 hover:text-blue-600 dark:border-neutral-700 dark:text-neutral-300"
              >
                {w}
              </Link>
            ))}
          </div>
        </div>
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
