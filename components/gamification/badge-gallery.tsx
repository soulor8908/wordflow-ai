"use client";

/**
 * 成就徽章画廊 —— 设计文档 §4.2 特性 3 的 UI 呈现
 *
 * 展示 8 大类共 28 个徽章：
 * - 已解锁：彩色亮起 + 解锁日期
 * - 未解锁：灰显 + 进度条（阈值类）
 * - 隐藏徽章（secret）：解锁前显示 ???
 *
 * 数据来自 buildBadgeViews（合并规则 + 解锁状态 + 进度）。
 * 顶部显示总完成度与已获得 XP。
 */
import { useEffect, useState } from "react";
import {
  buildBadgeViews,
  RARITY_COLOR_CLASS,
  RARITY_LABEL,
  CATEGORY_LABEL,
  type BadgeView,
  type BadgeCategory,
} from "@/lib/gamification/badges";
import { computeBadgeStats, type BadgeStats } from "@/lib/gamification/badge-stats";
import { buildBadgeContext } from "@/lib/gamification/hooks";

/** 类别展示顺序 */
const ORDER: BadgeCategory[] = [
  "streak",
  "vocab",
  "mastery",
  "accuracy",
  "exploration",
  "breakthrough",
  "book",
  "secret",
];

export default function BadgeGallery() {
  const [views, setViews] = useState<BadgeView[] | null>(null);
  const [stats, setStats] = useState<BadgeStats | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const ctx = await buildBadgeContext();
        const [v, s] = await Promise.all([
          buildBadgeViews(ctx),
          computeBadgeStats(),
        ]);
        if (!cancelled) {
          setViews(v);
          setStats(s);
        }
      } catch {
        if (!cancelled) {
          setViews([]);
          setStats(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!views) {
    return (
      <section className="rounded-lg border border-neutral-200 px-4 py-4 dark:border-neutral-800">
        <p className="text-sm text-neutral-400">加载成就…</p>
      </section>
    );
  }

  const percent = stats ? Math.round(stats.ratio * 100) : 0;

  return (
    <section className="rounded-lg border border-neutral-200 px-4 py-4 dark:border-neutral-800">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
          成就徽章
        </h2>
        <span className="text-xs text-neutral-500">
          {stats?.unlocked ?? 0}/{stats?.total ?? 0}
          {stats && stats.totalXp > 0 && (
            <span className="ml-1 text-amber-500">· +{stats.totalXp} XP</span>
          )}
        </span>
      </div>

      {/* 总进度条 */}
      <div className="mb-4 h-1.5 w-full overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
        <div
          className="h-full rounded-full bg-gradient-to-r from-amber-400 to-orange-500 transition-all"
          style={{ width: `${percent}%` }}
        />
      </div>

      <div className="flex flex-col gap-5">
        {ORDER.map((cat) => {
          const list = views.filter((v) => v.rule.category === cat);
          if (list.length === 0) return null;
          return (
            <div key={cat}>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
                {CATEGORY_LABEL[cat]}
              </p>
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-4">
                {list.map((v) => (
                  <BadgeCell key={v.rule.id} view={v} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function BadgeCell({ view }: { view: BadgeView }) {
  const { rule, unlocked, progress, masked } = view;
  const ratio =
    progress && progress.target > 0
      ? Math.min(1, progress.current / progress.target)
      : 0;

  return (
    <div
      className={`flex flex-col items-center gap-1 rounded-lg border px-1.5 py-2 text-center transition-colors ${
        unlocked
          ? RARITY_COLOR_CLASS[rule.rarity]
          : "border-neutral-200 bg-neutral-50 opacity-70 dark:border-neutral-800 dark:bg-neutral-900"
      }`}
      title={
        unlocked
          ? `${rule.name} · ${RARITY_LABEL[rule.rarity]} · ${rule.description}`
          : masked
            ? "隐藏徽章"
            : `${rule.description}`
      }
    >
      <span className={`text-xl ${unlocked ? "" : "grayscale"}`}>
        {rule.icon}
      </span>
      <span
        className={`w-full truncate text-[10px] font-medium ${
          unlocked ? "" : "text-neutral-500 dark:text-neutral-400"
        }`}
      >
        {rule.name}
      </span>
      {/* 进度条：仅未解锁且有进度数据时显示 */}
      {!unlocked && progress && progress.target > 1 ? (
        <div className="mt-0.5 w-full">
          <div className="h-1 w-full overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-700">
            <div
              className="h-full rounded-full bg-neutral-400 dark:bg-neutral-500"
              style={{ width: `${ratio * 100}%` }}
            />
          </div>
          <span className="mt-0.5 block text-[9px] text-neutral-400">
            {Math.min(progress.current, progress.target)}/{progress.target}
          </span>
        </div>
      ) : unlocked ? (
        <span className="mt-0.5 block text-[9px] opacity-75">
          {RARITY_LABEL[rule.rarity]}
        </span>
      ) : (
        <span className="mt-0.5 block text-[9px] text-neutral-400">未解锁</span>
      )}
    </div>
  );
}
