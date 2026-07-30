"use client";

/**
 * 首页游戏化状态条 —— 把"连胜 / XP / 每日任务"三个留存钩子前置到首屏
 *
 * 设计意图（多邻国 +60% 留存的关键）：
 * - 让用户一打开 App 就看到"我有 N 天连胜不想断"
 * - XP 等级给即时成就感
 * - 每日任务进度制造蔡格尼克效应（未完成的任务让人想回来）
 *
 * 数据来源：streak-io / gamification xp / daily-quests（全部本地读取，<10ms）
 * 点击跳转 /stats 查看完整成就
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import { getStreak } from "@/lib/stats/streak-io";
import { getXp, levelFromXp, xpToNextLevel, LEVELS } from "@/lib/gamification/xp";
import { getTodayQuest } from "@/lib/gamification/daily-quests";
import { completedCount } from "@/lib/gamification/daily-quests";

interface BarData {
  streakDays: number;
  xpTotal: number;
  levelName: string;
  levelTier: number;
  questDone: number;
  questTotal: number;
}

export default function GamificationBar() {
  const [data, setData] = useState<BarData | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [streak, xp, quest] = await Promise.all([
          getStreak(),
          getXp(),
          // queueLength 传 0 仅用于读取已有任务（不会创建时影响 target）
          getTodayQuest(0),
        ]);
        if (cancelled) return;
        const level = levelFromXp(xp.total);
        setData({
          streakDays: streak?.currentStreak ?? 0,
          xpTotal: xp.total,
          levelName: level.name,
          levelTier: level.tier,
          questDone: completedCount(quest),
          questTotal: 3,
        });
      } catch {
        if (!cancelled) setData(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 首次无任何数据（连胜 0 且 XP 0）时不渲染，避免打扰纯新手
  if (!data || (data.streakDays === 0 && data.xpTotal === 0)) {
    return null;
  }

  const isMaxLevel = data.levelTier >= LEVELS.length;
  const toNext = xpToNextLevel(data.xpTotal);

  return (
    <Link
      href="/stats"
      className="flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 px-4 py-2.5 text-sm transition-colors hover:border-amber-300 dark:border-amber-900 dark:from-amber-950/40 dark:to-orange-950/40 dark:hover:border-amber-800"
      aria-label="查看学习成就与统计"
    >
      <span className="flex items-center gap-1 font-medium text-orange-600 dark:text-orange-400">
        <span aria-hidden>🔥</span>
        <span>{data.streakDays} 天</span>
      </span>
      <span className="flex items-center gap-1 font-medium text-amber-600 dark:text-amber-400">
        <span aria-hidden>⚡</span>
        <span>
          {data.levelName}
          {!isMaxLevel && toNext > 0 && (
            <span className="ml-1 text-[10px] font-normal text-neutral-400">
              还差 {toNext}
            </span>
          )}
        </span>
      </span>
      <span className="flex items-center gap-1 font-medium text-blue-600 dark:text-blue-400">
        <span aria-hidden>🎯</span>
        <span>
          任务 {data.questDone}/{data.questTotal}
        </span>
      </span>
    </Link>
  );
}
