"use client";

/**
 * 统计页（设计文档 §3.2 D：Streak + 热力图 + 今日数据）
 *
 * - Streak：当前连续天数 + 最长记录
 * - 热力图：最近 12 周 GitHub 风格方格（自建轻量组件，避免引入 react-activity-calendar 依赖）
 * - 今日数据：新学/复习/正确率
 * - 总卡片数：card: 前缀计数
 */
import Link from "next/link";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { getStreak, listStudyLogs, type StudyLog } from "@/lib/stats/streak-io";
import { getShield } from "@/lib/gamification/shield";
import { countByPrefix, listItemsByPrefix } from "@/lib/storage/db";
import { todayLocalDate } from "@/lib/review/book-queue";
import type { WordCard } from "@/lib/review/fsrs-scheduler";
import { Button } from "@/components/ui/button";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ShieldIcon,
  ChevronDownIcon,
  ChevronUpIcon,
} from "@/components/ui/icons";
import {
  generateUserProfile,
  type UserProfile,
} from "@/lib/stats/user-profile";

// 懒加载首屏以下的重组件，拆出独立 chunk，减小首屏 JS 体积
const PwaSettings = dynamic(() => import("./pwa-settings"), {
  loading: () => <LazySkeleton />,
  ssr: false,
});
const DailyQuestCard = dynamic(
  () => import("@/components/gamification/daily-quest-card"),
  { loading: () => <LazySkeleton />, ssr: false }
);
const BadgeGallery = dynamic(
  () => import("@/components/gamification/badge-gallery"),
  { loading: () => <LazySkeleton />, ssr: false }
);

/** 懒加载占位骨架，与卡片圆角风格一致 */
function LazySkeleton() {
  return (
    <section className="animate-pulse rounded-lg border border-neutral-200 px-4 py-4 dark:border-neutral-800">
      <div className="mb-3 h-4 w-24 rounded bg-neutral-200 dark:bg-neutral-800" />
      <div className="h-8 w-full rounded bg-neutral-100 dark:bg-neutral-900" />
    </section>
  );
}

/** 把 ISO 时间字符串转成"3天前 / 2小时前 / 刚刚"这种相对时间，便于常错词列表展示 */
function formatRelativeTime(iso: string): string {
  try {
    const t = new Date(iso).getTime();
    if (!t) return "";
    const diff = Date.now() - t;
    const min = Math.floor(diff / 60_000);
    if (min < 1) return "刚刚";
    if (min < 60) return `${min} 分钟前`;
    const hour = Math.floor(min / 60);
    if (hour < 24) return `${hour} 小时前`;
    const day = Math.floor(hour / 24);
    if (day < 30) return `${day} 天前`;
    const month = Math.floor(day / 30);
    if (month < 12) return `${month} 个月前`;
    return `${Math.floor(month / 12)} 年前`;
  } catch {
    return "";
  }
}

interface ErrorWord {
  word: string;
  errorCount: number;
  lastErrorAt?: string;
}

interface StatsData {
  streak: { currentStreak: number; longestStreak: number } | null;
  shieldCount: number;
  todayLog: StudyLog | null;
  totalCards: number;
  logs: StudyLog[];
  errorWords: ErrorWord[];
}

export default function StatsPage() {
  const [data, setData] = useState<StatsData | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  // 需求5：常错词默认显示 5 个，点击"查看更多"显示全部
  const ERROR_WORDS_PAGE_SIZE = 5;
  const [showAllErrorWords, setShowAllErrorWords] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [streak, logs, totalCards, cards, shield] = await Promise.all([
          getStreak(),
          listStudyLogs(),
          countByPrefix("card:"),
          listItemsByPrefix<WordCard>("card:"),
          getShield(),
        ]);
        if (cancelled) return;
        const today = todayLocalDate();
        const todayLog = logs.find((l) => l.date === today) ?? null;
        // 常错词：errorCount > 0，按"错误次数降序 → 最近出错时间降序"排序
        // 需求5：学会后 errorCount<=2 的已自动清零（见 review-session.ts），这里自然不会出现
        const errorWords = cards
          .filter((c) => (c.errorCount ?? 0) > 0)
          .map((c) => ({
            word: c.word,
            errorCount: c.errorCount ?? 0,
            lastErrorAt: c.lastErrorAt,
          }))
          .sort((a, b) => {
            // 主排序：错误次数降序
            if (b.errorCount !== a.errorCount) return b.errorCount - a.errorCount;
            // 次排序：最近出错时间降序（无时间的排到后面）
            const at = (x?: string) => (x ? new Date(x).getTime() : 0);
            return at(b.lastErrorAt) - at(a.lastErrorAt);
          });
        setData({
          streak: streak
            ? {
                currentStreak: streak.currentStreak,
                longestStreak: streak.longestStreak,
              }
            : null,
          shieldCount: shield.shields,
          todayLog,
          totalCards,
          logs,
          errorWords,
        });
        // 生成用户画像（从已有数据派生，非阻塞）
        generateUserProfile()
          .then((p) => {
            if (!cancelled) setProfile(p);
          })
          .catch(() => {
            /* 画像生成失败不影响统计页主流程 */
          });
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "加载统计失败");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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

  if (!data) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-2xl items-center justify-center px-4">
        <p className="text-sm text-neutral-400">加载统计…</p>
      </main>
    );
  }

  const todayTotal = data.todayLog
    ? data.todayLog.newCount + data.todayLog.reviewCount
    : 0;
  const todayAccuracy =
    todayTotal > 0 && data.todayLog
      ? Math.round((data.todayLog.correctCount / todayTotal) * 100)
      : null;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-6 px-4 py-10">
      <div className="flex items-center justify-between">
        <Link href="/" className="text-sm text-blue-600 hover:underline">
          <ChevronLeftIcon className="h-4 w-4 inline" /> 返回查词
        </Link>
        <Link href="/review" className="text-sm text-blue-600 hover:underline">
          去复习 <ChevronRightIcon className="h-4 w-4 inline" />
        </Link>
      </div>

      <header>
        <h1 className="text-2xl font-bold tracking-tight">学习统计</h1>
      </header>

      {/* Streak 卡片 */}
      <section className="grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-neutral-200 px-4 py-3 dark:border-neutral-800">
          <p className="text-xs text-neutral-500">当前连续</p>
          <p className="mt-1 text-3xl font-bold text-orange-500">
            {data.streak?.currentStreak ?? 0}
            <span className="ml-1 text-sm font-normal text-neutral-400">天</span>
          </p>
        </div>
        <div className="rounded-lg border border-neutral-200 px-4 py-3 dark:border-neutral-800">
          <p className="text-xs text-neutral-500">最长记录</p>
          <p className="mt-1 text-3xl font-bold text-neutral-700 dark:text-neutral-300">
            {data.streak?.longestStreak ?? 0}
            <span className="ml-1 text-sm font-normal text-neutral-400">天</span>
          </p>
        </div>
      </section>

      {/* 连胜保护券：让用户看到自己持有的保护券，理解"偶尔断签也不会清零" */}
      <section
        className="flex items-center justify-between rounded-lg border border-cyan-200 bg-cyan-50/50 px-4 py-3 dark:border-cyan-900 dark:bg-cyan-950/30"
        title="断签 1 天自动消耗 1 张保住连胜；每连续 7 天获得 1 张，最多持有 2 张"
      >
        <div className="flex items-center gap-2">
          <ShieldIcon className="h-5 w-5 text-cyan-600 dark:text-cyan-400" />
          <div>
            <p className="text-sm font-medium text-cyan-700 dark:text-cyan-300">
              连胜保护券
            </p>
            <p className="text-[10px] text-neutral-500">
              断签 1 天自动保住连胜
            </p>
          </div>
        </div>
        <p className="text-2xl font-bold text-cyan-600 dark:text-cyan-400">
          {data.shieldCount}
          <span className="ml-1 text-xs font-normal text-neutral-400">张</span>
        </p>
      </section>

      {/* 今日数据 */}
      <section className="rounded-lg border border-neutral-200 px-4 py-4 dark:border-neutral-800">
        <h2 className="mb-3 text-sm font-medium text-neutral-700 dark:text-neutral-300">
          今日学习
        </h2>
        {data.todayLog ? (
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-2xl font-bold text-blue-500">
                {data.todayLog.newCount}
              </p>
              <p className="text-xs text-neutral-500">新学</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-green-500">
                {data.todayLog.reviewCount}
              </p>
              <p className="text-xs text-neutral-500">复习</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-purple-500">
                {todayAccuracy !== null ? `${todayAccuracy}%` : "—"}
              </p>
              <p className="text-xs text-neutral-500">正确率</p>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-neutral-500">
              今日还没有学习记录，开始今天的第一张卡片吧
            </p>
            <Link
              href="/review"
              className="shrink-0 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
            >
              去复习
            </Link>
          </div>
        )}
      </section>

      {/* 每日任务 */}
      <DailyQuestCard />

      {/* 成就徽章画廊 */}
      <BadgeGallery />

      {/* 热力图 */}
      <section className="rounded-lg border border-neutral-200 px-4 py-4 dark:border-neutral-800">
        <h2 className="mb-3 text-sm font-medium text-neutral-700 dark:text-neutral-300">
          学习热力图（最近 12 周）
        </h2>
        <Heatmap logs={data.logs} />
        <div className="mt-2 flex items-center justify-end gap-1 text-[10px] text-neutral-400">
          <span>少</span>
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-neutral-200 dark:bg-neutral-800" />
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-green-200 dark:bg-green-900" />
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-green-400 dark:bg-green-700" />
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-green-600 dark:bg-green-500" />
          <span>多</span>
        </div>
        <p className="mt-2 text-[10px] text-neutral-400">点击方格查看当日详情</p>
      </section>

      {/* 总卡片数 */}
      <section className="rounded-lg border border-neutral-200 px-4 py-3 text-sm dark:border-neutral-800">
        <span className="text-neutral-500">已入队卡片：</span>
        <span className="font-mono font-medium">{data.totalCards}</span>
        <span className="text-neutral-400"> 张</span>
      </section>

      {/* 用户画像 */}
      {profile && (
        <section className="rounded-lg border border-neutral-200 px-4 py-4 dark:border-neutral-800">
          <h2 className="mb-3 text-sm font-medium text-neutral-700 dark:text-neutral-300">
            学习画像
          </h2>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-md bg-neutral-50 px-3 py-2 dark:bg-neutral-900">
              <p className="text-xs text-neutral-500">词汇水平</p>
              <p className="mt-0.5 font-mono font-bold text-blue-600 dark:text-blue-400">
                {profile.vocabulary.estimatedCefr}
              </p>
            </div>
            <div className="rounded-md bg-neutral-50 px-3 py-2 dark:bg-neutral-900">
              <p className="text-xs text-neutral-500">已掌握</p>
              <p className="mt-0.5 font-mono font-bold text-green-600 dark:text-green-400">
                {profile.vocabulary.masteredCount}
                <span className="ml-1 text-xs font-normal text-neutral-400">词</span>
              </p>
            </div>
            <div className="rounded-md bg-neutral-50 px-3 py-2 dark:bg-neutral-900">
              <p className="text-xs text-neutral-500">学习中</p>
              <p className="mt-0.5 font-mono font-bold text-amber-600 dark:text-amber-400">
                {profile.vocabulary.learningCount}
                <span className="ml-1 text-xs font-normal text-neutral-400">词</span>
              </p>
            </div>
            <div className="rounded-md bg-neutral-50 px-3 py-2 dark:bg-neutral-900">
              <p className="text-xs text-neutral-500">累计学习</p>
              <p className="mt-0.5 font-mono font-bold text-purple-600 dark:text-purple-400">
                {profile.habit.totalStudyDays}
                <span className="ml-1 text-xs font-normal text-neutral-400">天</span>
              </p>
            </div>
            <div className="rounded-md bg-neutral-50 px-3 py-2 dark:bg-neutral-900">
              <p className="text-xs text-neutral-500">日均新词</p>
              <p className="mt-0.5 font-mono font-bold text-cyan-600 dark:text-cyan-400">
                {profile.habit.avgDailyNewWords}
                <span className="ml-1 text-xs font-normal text-neutral-400">/天</span>
              </p>
            </div>
            <div className="rounded-md bg-neutral-50 px-3 py-2 dark:bg-neutral-900">
              <p className="text-xs text-neutral-500">偏好时段</p>
              <p className="mt-0.5 font-mono font-bold text-rose-600 dark:text-rose-400">
                {profile.habit.preferredPeriod}
              </p>
            </div>
          </div>
          <div className="mt-3 rounded-md bg-neutral-50 px-3 py-2 dark:bg-neutral-900">
            <p className="text-xs text-neutral-500">正确率趋势</p>
            <div className="mt-1 flex items-center gap-3 text-xs">
              <span>
                近 7 天{" "}
                <span className="font-mono font-bold text-green-600 dark:text-green-400">
                  {Math.round(profile.accuracy.last7Days * 100)}%
                </span>
              </span>
              <span>
                近 30 天{" "}
                <span className="font-mono font-bold text-blue-600 dark:text-blue-400">
                  {Math.round(profile.accuracy.last30Days * 100)}%
                </span>
              </span>
              <span>
                总体{" "}
                <span className="font-mono font-bold text-neutral-600 dark:text-neutral-400">
                  {Math.round(profile.accuracy.overall * 100)}%
                </span>
              </span>
            </div>
          </div>
        </section>
      )}

      {/* 常错词：默认显示 5 个，"查看更多"展开全部（需求5） */}
      <section className="rounded-lg border border-neutral-200 px-4 py-4 dark:border-neutral-800">
        <h2 className="mb-3 text-sm font-medium text-neutral-700 dark:text-neutral-300">
          常错词（共 {data.errorWords.length} 个）
          <span className="ml-2 text-xs font-normal text-neutral-400">
            按次数 / 时间排序 · 学会后自动清理
          </span>
        </h2>
        {data.errorWords.length > 0 ? (
          <>
            <ul className="flex flex-col gap-1.5">
              {(showAllErrorWords
                ? data.errorWords
                : data.errorWords.slice(0, ERROR_WORDS_PAGE_SIZE)
              ).map((word) => (
                <li key={word.word}>
                  <Link
                    href={`/word/${encodeURIComponent(word.word)}`}
                    className="flex items-center justify-between rounded-lg bg-neutral-50 px-3 py-2 text-sm hover:bg-neutral-100 dark:bg-neutral-900 dark:hover:bg-neutral-800"
                  >
                    <span className="font-mono">{word.word}</span>
                    <span className="flex items-center gap-2 text-xs">
                      {word.lastErrorAt && (
                        <span className="text-neutral-400">
                          {formatRelativeTime(word.lastErrorAt)}
                        </span>
                      )}
                      <span className="text-red-500">错误 {word.errorCount} 次</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            {data.errorWords.length > ERROR_WORDS_PAGE_SIZE && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => setShowAllErrorWords((v) => !v)}
                className="mt-2 w-full justify-center text-xs text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950"
              >
                {showAllErrorWords ? (
                  <>
                    <ChevronUpIcon className="h-3.5 w-3.5" /> 收起
                  </>
                ) : (
                  <>
                    <ChevronDownIcon className="h-3.5 w-3.5" />
                    查看更多（剩余 {data.errorWords.length - ERROR_WORDS_PAGE_SIZE} 个）
                  </>
                )}
              </Button>
            )}
          </>
        ) : (
          <p className="text-sm text-neutral-500">
            暂无常错词记录，复习时标记&ldquo;忘记/模糊&rdquo;会自动累计
          </p>
        )}
      </section>

      {/* PWA 设置：通知权限 + 静默开关 */}
      <PwaSettings />
    </main>
  );
}

/** 最近 N 周的热力图（GitHub 风格方格，支持点击查看详情） */
function Heatmap({ logs, weeks = 12 }: { logs: StudyLog[]; weeks?: number }) {
  const today = new Date();
  const [selected, setSelected] = useState<string | null>(null);
  // 从今天回溯 weeks*7 天，按列（周）× 行（周一到周日）排列
  const days = weeks * 7;
  const cells: { date: string; log: StudyLog | null; count: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = todayLocalDate(d);
    const log = logs.find((l) => l.date === dateStr) ?? null;
    cells.push({ date: dateStr, log, count: log ? log.newCount + log.reviewCount : 0 });
  }

  const intensity = (count: number): string => {
    if (count === 0) return "bg-neutral-200 dark:bg-neutral-800";
    if (count <= 3) return "bg-green-200 dark:bg-green-900";
    if (count <= 7) return "bg-green-400 dark:bg-green-700";
    return "bg-green-600 dark:bg-green-500";
  };

  // 按周分列：每周 7 格（周一到周日）
  const columns: { date: string; log: StudyLog | null; count: number }[][] = [];
  for (let w = 0; w < weeks; w++) {
    columns.push(cells.slice(w * 7, w * 7 + 7));
  }

  const selectedCell = selected ? cells.find((c) => c.date === selected) : null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-1 overflow-x-auto">
        {columns.map((col, ci) => (
          <div key={ci} className="flex flex-col gap-1">
            {col.map((cell, ri) => (
              <Button
                key={ri}
                type="button"
                variant="ghost"
                onClick={() => setSelected(cell.date)}
                className={`h-3.5 w-3.5 rounded-sm p-0 transition-transform hover:scale-125 ${intensity(cell.count)} ${
                  selected === cell.date ? "ring-2 ring-blue-500 ring-offset-1" : ""
                }`}
                title={`${cell.date}：${cell.count} 张`}
                aria-label={`${cell.date} 学习 ${cell.count} 张`}
                aria-pressed={selected === cell.date}
              />
            ))}
          </div>
        ))}
      </div>
      {selectedCell && (
        <div className="rounded-md bg-neutral-50 px-3 py-2 text-xs dark:bg-neutral-900">
          <p className="font-medium text-neutral-700 dark:text-neutral-300">
            {selectedCell.date}
          </p>
          {selectedCell.count > 0 && selectedCell.log ? (
            <p className="mt-0.5 text-neutral-500">
              学习 {selectedCell.count} 张 · 新学 {selectedCell.log.newCount} · 复习 {selectedCell.log.reviewCount} · 正确 {selectedCell.log.correctCount}
            </p>
          ) : (
            <p className="mt-0.5 text-neutral-400">未学习</p>
          )}
        </div>
      )}
    </div>
  );
}
