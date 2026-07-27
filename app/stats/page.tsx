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
import { useEffect, useState } from "react";
import { getStreak, listStudyLogs, type StudyLog } from "@/lib/stats/streak-io";
import { countByPrefix } from "@/lib/storage/db";
import { todayLocalDate } from "@/lib/review/book-queue";
import PwaSettings from "./pwa-settings";

interface StatsData {
  streak: { currentStreak: number; longestStreak: number } | null;
  todayLog: StudyLog | null;
  totalCards: number;
  logs: StudyLog[];
}

export default function StatsPage() {
  const [data, setData] = useState<StatsData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [streak, logs, totalCards] = await Promise.all([
          getStreak(),
          listStudyLogs(),
          countByPrefix("card:"),
        ]);
        if (cancelled) return;
        const today = todayLocalDate();
        const todayLog = logs.find((l) => l.date === today) ?? null;
        setData({
          streak: streak
            ? {
                currentStreak: streak.currentStreak,
                longestStreak: streak.longestStreak,
              }
            : null,
          todayLog,
          totalCards,
          logs,
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
          ← 返回查词
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
          ← 返回查词
        </Link>
        <Link href="/review" className="text-sm text-blue-600 hover:underline">
          去复习 →
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
          <p className="text-sm text-neutral-400">今日还未学习，去复习开始吧</p>
        )}
      </section>

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
      </section>

      {/* 总卡片数 */}
      <section className="rounded-lg border border-neutral-200 px-4 py-3 text-sm dark:border-neutral-800">
        <span className="text-neutral-500">已入队卡片：</span>
        <span className="font-mono font-medium">{data.totalCards}</span>
        <span className="text-neutral-400"> 张</span>
      </section>

      {/* PWA 设置：通知权限 + 静默开关 */}
      <PwaSettings />
    </main>
  );
}

/** 最近 N 周的热力图（GitHub 风格方格） */
function Heatmap({ logs, weeks = 12 }: { logs: StudyLog[]; weeks?: number }) {
  const today = new Date();
  // 从今天回溯 weeks*7 天，按列（周）× 行（周一到周日）排列
  const days = weeks * 7;
  const cells: { date: string; count: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = todayLocalDate(d);
    const log = logs.find((l) => l.date === dateStr);
    cells.push({ date: dateStr, count: log ? log.newCount + log.reviewCount : 0 });
  }

  const intensity = (count: number): string => {
    if (count === 0) return "bg-neutral-200 dark:bg-neutral-800";
    if (count <= 3) return "bg-green-200 dark:bg-green-900";
    if (count <= 7) return "bg-green-400 dark:bg-green-700";
    return "bg-green-600 dark:bg-green-500";
  };

  // 按周分列：每周 7 格（周一到周日）
  const columns: { date: string; count: number }[][] = [];
  for (let w = 0; w < weeks; w++) {
    columns.push(cells.slice(w * 7, w * 7 + 7));
  }

  return (
    <div className="flex gap-1 overflow-x-auto">
      {columns.map((col, ci) => (
        <div key={ci} className="flex flex-col gap-1">
          {col.map((cell, ri) => (
            <div
              key={ri}
              className={`h-2.5 w-2.5 rounded-sm ${intensity(cell.count)}`}
              title={`${cell.date}：${cell.count} 张`}
              aria-label={`${cell.date} 学习 ${cell.count} 张`}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
