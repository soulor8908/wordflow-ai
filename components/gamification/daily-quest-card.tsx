"use client";

/**
 * 每日任务卡片 —— 设计文档 §4.2 特性 2 的 UI 呈现
 *
 * 三个任务（每日 0 点重置）：
 * 1. 复习 N 张（动态目标）
 * 2. 答对 15 次
 * 3. 查词并收藏 1 个
 *
 * 全部完成 → +30 XP。用进度条 + 勾选状态让用户一眼看到"还差什么"。
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  getTodayQuest,
  isReviewDone,
  isCorrectDone,
  isSearchedDone,
} from "@/lib/gamification/daily-quests";
import type { DailyQuestState } from "@/lib/gamification/types";
import { CheckSquareIcon, SquareIcon } from "@/components/ui/icons";

export default function DailyQuestCard() {
  const [quest, setQuest] = useState<DailyQuestState | null>(null);

  useEffect(() => {
    let cancelled = false;
    getTodayQuest(0)
      .then((q) => {
        if (!cancelled) setQuest(q);
      })
      .catch(() => {
        if (!cancelled) setQuest(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!quest) return null;

  const reviewDone = isReviewDone(quest);
  const correctDone = isCorrectDone(quest);
  const searchedDone = isSearchedDone(quest);

  return (
    <section className="rounded-lg border border-neutral-200 px-4 py-4 dark:border-neutral-800">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
          每日任务
        </h2>
        {quest.claimed && (
          <span className="text-xs font-medium text-green-600 dark:text-green-400">
            ✓ 已领取 +30 XP
          </span>
        )}
      </div>
      <ul className="flex flex-col gap-3">
        <QuestRow
          done={reviewDone}
          label="复习卡片"
          current={quest.reviewed}
          target={quest.reviewTarget}
          href="/review"
        />
        <QuestRow
          done={correctDone}
          label="答对次数"
          current={quest.correct}
          target={quest.correctTarget}
          href="/review"
        />
        <QuestRow
          done={searchedDone}
          label="查词并收藏"
          current={quest.searched ? 1 : 0}
          target={1}
          href="/"
        />
      </ul>
    </section>
  );
}

function QuestRow({
  done,
  label,
  current,
  target,
  href,
}: {
  done: boolean;
  label: string;
  current: number;
  target: number;
  href: string;
}) {
  const ratio = target > 0 ? Math.min(1, current / target) : 0;
  return (
    <li>
      <Link href={href} className="group flex flex-col gap-1">
        <div className="flex items-center justify-between text-sm">
          <span
            className={`flex items-center gap-1.5 ${
              done
                ? "text-green-600 dark:text-green-400"
                : "text-neutral-600 group-hover:text-neutral-800 dark:text-neutral-400 dark:group-hover:text-neutral-200"
            }`}
          >
            <span aria-hidden>
              {done ? (
                <CheckSquareIcon className="h-4 w-4 text-green-500" />
              ) : (
                <SquareIcon className="h-4 w-4 text-neutral-400" />
              )}
            </span>
            {label}
          </span>
          <span className="font-mono text-xs text-neutral-400">
            {Math.min(current, target)}/{target}
          </span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
          <div
            className={`h-full rounded-full transition-all ${
              done ? "bg-green-500" : "bg-blue-400"
            }`}
            style={{ width: `${ratio * 100}%` }}
          />
        </div>
      </Link>
    </li>
  );
}
