"use client";

/**
 * 游戏化通知系统（设计文档 §5.5 UI 反馈层）
 *
 * 设计原则：
 * - 全局单例 Provider，挂在 RootLayout，任何页面通过 useGamification() 触发
 * - 轻量 Toast：XP 浮出 / 徽章解锁 / 任务三连完成 / 回归挽留
 * - 纯 CSS 动画，不引入 framer-motion 依赖
 * - 自动消失（XP 2s / 徽章 4s），可手动点击关闭
 *
 * 触发点：
 * - 复习评分后 onReviewCompleted → notifyReview
 * - 收藏入队后 onFavoriteAdded → notifyFavorite
 * - 会话开始 onSessionStart（回归）→ notifyComeback
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { BadgeRule } from "@/lib/gamification/badges";
import { RARITY_LABEL } from "@/lib/gamification/badges";
import { Button } from "@/components/ui/button";
import { CloseIcon, TargetIcon, WaveIcon, ShieldIcon } from "@/components/ui/icons";
import { BadgeIcon } from "@/components/gamification/badge-icon";

/** 单条 toast */
interface ToastItem {
  id: number;
  kind: "xp" | "badges" | "quest" | "comeback" | "shield";
  /** xp / quest 共用 */
  xpAmount?: number;
  /** badges */
  badges?: BadgeRule[];
  /** comeback */
  gapDays?: number;
  shieldGifted?: boolean;
  /** shield: consumed=消耗保护券保住连胜 / earned=获得新保护券 */
  shieldKind?: "consumed" | "earned";
  /** shield 消耗时的连胜天数 */
  streakDays?: number;
}

interface GamificationContextValue {
  /** 评分后：XP 浮出 + 可能的徽章 / 任务完成 */
  notifyReview: (r: {
    xpGained: number;
    questBonusXp: number;
    newBadges: BadgeRule[];
  }) => void;
  /** 收藏后：XP + 可能的徽章 / 任务完成 */
  notifyFavorite: (r: {
    xpGained: number;
    questBonusXp: number;
    newBadges: BadgeRule[];
  }) => void;
  /** 回归挽留 */
  notifyComeback: (r: { gapDays: number; shieldGifted: boolean }) => void;
  /** 保护券变动：消耗保住连胜 / 获得新保护券 */
  notifyShield: (r: {
    kind: "consumed" | "earned";
    streakDays?: number;
  }) => void;
}

const GamificationContext = createContext<GamificationContextValue | null>(null);

export function useGamification(): GamificationContextValue {
  const ctx = useContext(GamificationContext);
  if (!ctx) {
    // 未挂 Provider 时降级为 no-op，避免影响主流程
    return {
      notifyReview: () => {},
      notifyFavorite: () => {},
      notifyComeback: () => {},
      notifyShield: () => {},
    };
  }
  return ctx;
}

let nextId = 1;

export function GamificationProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  const push = useCallback(
    (item: Omit<ToastItem, "id">, ttl: number) => {
      const id = nextId++;
      setToasts((prev) => [...prev, { ...item, id }]);
      const timer = setTimeout(() => dismiss(id), ttl);
      timersRef.current.set(id, timer);
    },
    [dismiss]
  );

  // 卸载时清理所有定时器
  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach((t) => clearTimeout(t));
      timers.clear();
    };
  }, []);

  const emitBadges = useCallback(
    (badges: BadgeRule[]) => {
      if (badges.length > 0) {
        push({ kind: "badges", badges }, 4500);
      }
    },
    [push]
  );

  const notifyReview = useCallback(
    (r: { xpGained: number; questBonusXp: number; newBadges: BadgeRule[] }) => {
      if (r.xpGained > 0) {
        push({ kind: "xp", xpAmount: r.xpGained }, 1800);
      }
      if (r.questBonusXp > 0) {
        push({ kind: "quest", xpAmount: r.questBonusXp }, 3000);
      }
      emitBadges(r.newBadges);
    },
    [push, emitBadges]
  );

  const notifyFavorite = useCallback(
    (r: { xpGained: number; questBonusXp: number; newBadges: BadgeRule[] }) => {
      if (r.questBonusXp > 0) {
        push({ kind: "quest", xpAmount: r.questBonusXp }, 3000);
      }
      emitBadges(r.newBadges);
      // 收藏的 +2 XP 太频繁不弹 toast，避免打扰（按钮文案已体现）
    },
    [push, emitBadges]
  );

  const notifyComeback = useCallback(
    (r: { gapDays: number; shieldGifted: boolean }) => {
      push(
        { kind: "comeback", gapDays: r.gapDays, shieldGifted: r.shieldGifted },
        5000
      );
    },
    [push]
  );

  const notifyShield = useCallback(
    (r: { kind: "consumed" | "earned"; streakDays?: number }) => {
      push(
        { kind: "shield", shieldKind: r.kind, streakDays: r.streakDays },
        4000
      );
    },
    [push]
  );

  return (
    <GamificationContext.Provider
      value={{ notifyReview, notifyFavorite, notifyComeback, notifyShield }}
    >
      {children}
      {/* Toast 容器：顶部居中，不遮挡底部导航 */}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 top-4 z-[100] flex flex-col items-center gap-2 px-4"
      >
        {toasts.map((t) => (
          <ToastView key={t.id} item={t} onClose={() => dismiss(t.id)} />
        ))}
      </div>
    </GamificationContext.Provider>
  );
}

function ToastView({ item, onClose }: { item: ToastItem; onClose: () => void }) {
  return (
    <div
      role="status"
      className="pointer-events-auto animate-[gamification-toast-in_0.25s_ease-out] rounded-xl border border-neutral-200 bg-white px-4 py-3 shadow-lg dark:border-neutral-700 dark:bg-neutral-900"
    >
      {item.kind === "xp" && (
        <p className="text-sm font-bold text-amber-500">+{item.xpAmount} XP</p>
      )}

      {item.kind === "quest" && (
        <div className="flex items-center gap-2">
          <TargetIcon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          <div className="flex flex-col">
            <p className="text-sm font-bold text-blue-600 dark:text-blue-400">
              每日任务全部完成
            </p>
            <p className="text-xs text-neutral-500">奖励 +{item.xpAmount} XP</p>
          </div>
        </div>
      )}

      {item.kind === "badges" && item.badges && (
        <div className="flex items-start gap-3">
          <div className="flex flex-col gap-2">
            {item.badges.map((b) => (
              <div key={b.id} className="flex items-center gap-2.5">
                <BadgeIcon
                  iconKey={b.icon}
                  rarity={b.rarity}
                  unlocked
                  className="h-8 w-8"
                />
                <div className="flex flex-col">
                  <p className="text-sm font-bold text-neutral-800 dark:text-neutral-100">
                    解锁徽章 · {b.name}
                  </p>
                  <p className="text-xs text-neutral-500">
                    {RARITY_LABEL[b.rarity]} · {b.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClose}
            aria-label="关闭"
            className="h-6 w-6 shrink-0 rounded-full px-0 text-neutral-400"
          >
            <CloseIcon title="关闭" className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      {item.kind === "comeback" && (
        <div className="flex items-center gap-2.5">
          <WaveIcon className="h-6 w-6 text-amber-500" />
          <div className="flex flex-col">
            <p className="text-sm font-bold text-neutral-800 dark:text-neutral-100">
              欢迎回来
            </p>
            <p className="text-xs text-neutral-500">
              好久不见（{item.gapDays} 天）
              {item.shieldGifted ? "，送你 1 张连胜保护券" : "，继续加油"}
            </p>
          </div>
        </div>
      )}

      {item.kind === "shield" && (
        <div className="flex items-center gap-2.5">
          <ShieldIcon className="h-6 w-6 text-cyan-500" />
          <div className="flex flex-col">
            {item.shieldKind === "consumed" ? (
              <>
                <p className="text-sm font-bold text-neutral-800 dark:text-neutral-100">
                  连胜保护券已使用
                </p>
                <p className="text-xs text-neutral-500">
                  保住 {item.streakDays ?? 0} 天连胜，明天继续加油
                </p>
              </>
            ) : (
              <>
                <p className="text-sm font-bold text-neutral-800 dark:text-neutral-100">
                  解锁新的连胜保护券
                </p>
                <p className="text-xs text-neutral-500">
                  每 7 天连续学习获得 1 张，最多持有 2 张
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
