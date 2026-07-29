/**
 * 成就徽章系统 —— 设计文档 §4.2 特性 3（重点完善版）
 *
 * 设计原则（乔布斯式取舍 + 卡帕西式实现）：
 * - 8 大类共 28 个徽章，每个都对应真实学习行为，无虚荣徽章
 * - 4 级稀有度（铜/银/金/钻石），XP 奖励递增
 * - 钻石级徽章额外奖励 1 张连胜保护券
 * - 隐藏徽章（secret 类）解锁前显示 ???，仅显示类别不显示规则
 * - 进度提示：阈值类徽章展示 progress / target
 * - 时段类徽章（早起鸟/夜猫子）为累计型，需累计 7 天而非单次，更有意义
 * - 判定只在状态变更点批量调用，仅查未解锁徽章
 *
 * 8 大类：
 * 1. streak 坚持      —— 连胜里程碑
 * 2. vocab 积累       —— 词汇量累积
 * 3. accuracy 精度    —— 复习正确率
 * 4. exploration 探索 —— 查词广度
 * 5. breakthrough 突破 —— 单次会话 / 时段彩蛋
 * 6. book 收藏家      —— 词书完成度
 * 7. mastery 精通     —— 卡片掌握数（V4/mastered）
 * 8. secret 隐藏      —— 彩蛋（??? 显示）
 *
 * 存储：gamification:badge:{id} 每个徽章一条 BadgeRecord
 */
import { getItem, listItemsByPrefix, setItem } from "@/lib/storage/db";
import type { StreakState } from "@/lib/stats/streak";
import type { StudyLog } from "@/lib/stats/streak-io";
import {
  BADGE_PREFIX,
  type BadgeRecord,
} from "./types";

/** 稀有度 */
export type BadgeRarity = "bronze" | "silver" | "gold" | "diamond";

/** 类别 */
export type BadgeCategory =
  | "streak"
  | "vocab"
  | "accuracy"
  | "exploration"
  | "breakthrough"
  | "book"
  | "mastery"
  | "secret";

/** 稀有度 → XP 奖励 */
export const RARITY_XP: Record<BadgeRarity, number> = {
  bronze: 10,
  silver: 30,
  gold: 100,
  diamond: 200,
};

/** 稀有度 → 是否额外奖励保护券（仅钻石级） */
export const RARITY_SHIELD_REWARD: Record<BadgeRarity, number> = {
  bronze: 0,
  silver: 0,
  gold: 0,
  diamond: 1,
};

/** 稀有度 → 中文显示名 */
export const RARITY_LABEL: Record<BadgeRarity, string> = {
  bronze: "铜",
  silver: "银",
  gold: "金",
  diamond: "钻石",
};

/** 稀有度 → 颜色 class（用于徽章背景） */
export const RARITY_COLOR_CLASS: Record<BadgeRarity, string> = {
  bronze: "bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800",
  silver: "bg-gray-100 text-gray-600 border-gray-300 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700",
  gold: "bg-yellow-100 text-yellow-700 border-yellow-400 dark:bg-yellow-950 dark:text-yellow-300 dark:border-yellow-800",
  diamond: "bg-cyan-100 text-cyan-700 border-cyan-400 dark:bg-cyan-950 dark:text-cyan-300 dark:border-cyan-800",
};

/** 类别 → 中文显示名 */
export const CATEGORY_LABEL: Record<BadgeCategory, string> = {
  streak: "坚持",
  vocab: "积累",
  accuracy: "精度",
  exploration: "探索",
  breakthrough: "突破",
  book: "收藏家",
  mastery: "精通",
  secret: "隐藏",
};

/** 判定上下文（聚合自现有数据，调用方负责构造） */
export interface BadgeContext {
  /** 当前连胜状态 */
  streak: StreakState | undefined;
  /** 卡片总数 */
  totalCards: number;
  /** 已掌握卡片数 */
  masteredCount: number;
  /** 累计查询的不同词数（去重，从搜索历史派生） */
  uniqueSearchCount: number;
  /** 近 7 天正确率（0-1） */
  last7DaysAccuracy: number;
  /** 连续达到正确率 ≥ 90% 的天数 */
  consecutiveQualifiedDays: number;
  /** 今日学习日志（突破类用） */
  todayLog: StudyLog | null;
  /** 最近一次学习的本地小时（0-23，保留用于其他判定） */
  lastStudyHour: number | null;
  /** 累计在早上 5-7 点学习的天数（从 StudyLog.updatedAt 派生） */
  earlyBirdDays: number;
  /** 累计在深夜 23-5 点学习的天数（从 StudyLog.updatedAt 派生） */
  nightOwlDays: number;
  /** 词书进度（0-1，已学/总词数） */
  bookProgress: number;
  /** 累计消耗保护券数（守护者徽章用） */
  shieldUsedTotal: number;
  /** 回归断签天数（王者归来用，0 表示未回归） */
  comebackGapDays: number;
}

/** 徽章规则定义 */
export interface BadgeRule {
  /** 唯一 ID */
  id: string;
  /** 类别 */
  category: BadgeCategory;
  /** 稀有度 */
  rarity: BadgeRarity;
  /** 徽章名（解锁后显示） */
  name: string;
  /** 解锁条件描述（解锁前展示） */
  description: string;
  /** 是否隐藏（隐藏徽章解锁前显示 ???，仅显示类别） */
  hidden: boolean;
  /** emoji 图标 */
  icon: string;
  /** 判定函数：上下文 → 是否解锁 */
  check: (ctx: BadgeContext) => boolean;
  /** 进度函数：上下文 → { current, target }（无进度时返回 null） */
  progress: (ctx: BadgeContext) => { current: number; target: number } | null;
}

/**
 * 完整徽章规则表（共 28 个）
 *
 * 设计取舍：
 * - 每个徽章对应真实学习行为，无"分享朋友圈"等虚荣徽章
 * - 隐藏徽章规则不公开，仅显示 ??? 与类别，激发探索欲
 * - 钻石级徽章仅 2 个（坚持 365 天 + 积累 5000 词），是"长期目标"非短期可达
 * - 早期徽章（explore-10, mastered-50）给新用户快速正反馈，降低流失
 * - 时段徽章（早起鸟/夜猫子）为累计 7 天而非单次，避免"碰巧一次"就解锁
 */
export const BADGE_RULES: BadgeRule[] = [
  // ───────────── 坚持类（4 个，铜银金钻） ─────────────
  {
    id: "streak-7",
    category: "streak",
    rarity: "bronze",
    name: "一周之约",
    description: "连续学习 7 天",
    hidden: false,
    icon: "🔥",
    check: (c) => (c.streak?.currentStreak ?? 0) >= 7,
    progress: (c) => ({ current: c.streak?.currentStreak ?? 0, target: 7 }),
  },
  {
    id: "streak-30",
    category: "streak",
    rarity: "silver",
    name: "月度坚持",
    description: "连续学习 30 天",
    hidden: false,
    icon: "🔥",
    check: (c) => (c.streak?.currentStreak ?? 0) >= 30,
    progress: (c) => ({ current: c.streak?.currentStreak ?? 0, target: 30 }),
  },
  {
    id: "streak-100",
    category: "streak",
    rarity: "gold",
    name: "百日不辍",
    description: "连续学习 100 天",
    hidden: false,
    icon: "🔥",
    check: (c) => (c.streak?.currentStreak ?? 0) >= 100,
    progress: (c) => ({ current: c.streak?.currentStreak ?? 0, target: 100 }),
  },
  {
    id: "streak-365",
    category: "streak",
    rarity: "diamond",
    name: "一年之约",
    description: "连续学习 365 天",
    hidden: false,
    icon: "💎",
    check: (c) => (c.streak?.currentStreak ?? 0) >= 365,
    progress: (c) => ({ current: c.streak?.currentStreak ?? 0, target: 365 }),
  },

  // ───────────── 积累类（4 个，铜银金钻） ─────────────
  {
    id: "vocab-100",
    category: "vocab",
    rarity: "bronze",
    name: "百词斩",
    description: "累计学习 100 个词",
    hidden: false,
    icon: "📚",
    check: (c) => c.totalCards >= 100,
    progress: (c) => ({ current: c.totalCards, target: 100 }),
  },
  {
    id: "vocab-500",
    category: "vocab",
    rarity: "silver",
    name: "词汇猎人",
    description: "累计学习 500 个词",
    hidden: false,
    icon: "📚",
    check: (c) => c.totalCards >= 500,
    progress: (c) => ({ current: c.totalCards, target: 500 }),
  },
  {
    id: "vocab-2000",
    category: "vocab",
    rarity: "gold",
    name: "词汇大师",
    description: "累计学习 2000 个词",
    hidden: false,
    icon: "📚",
    check: (c) => c.totalCards >= 2000,
    progress: (c) => ({ current: c.totalCards, target: 2000 }),
  },
  {
    id: "vocab-5000",
    category: "vocab",
    rarity: "diamond",
    name: "词汇之神",
    description: "累计学习 5000 个词",
    hidden: false,
    icon: "💎",
    check: (c) => c.totalCards >= 5000,
    progress: (c) => ({ current: c.totalCards, target: 5000 }),
  },

  // ───────────── 精度类（3 个，铜银金） ─────────────
  {
    id: "accuracy-7",
    category: "accuracy",
    rarity: "bronze",
    name: "精准七日",
    description: "连续 7 天正确率 ≥ 90%",
    hidden: false,
    icon: "🎯",
    check: (c) => c.consecutiveQualifiedDays >= 7,
    progress: (c) => ({ current: c.consecutiveQualifiedDays, target: 7 }),
  },
  {
    id: "accuracy-30",
    category: "accuracy",
    rarity: "silver",
    name: "精准月度",
    description: "连续 30 天正确率 ≥ 90%",
    hidden: false,
    icon: "🎯",
    check: (c) => c.consecutiveQualifiedDays >= 30,
    progress: (c) => ({ current: c.consecutiveQualifiedDays, target: 30 }),
  },
  {
    id: "accuracy-perfect",
    category: "accuracy",
    rarity: "gold",
    name: "完美主义",
    description: "单日复习 20+ 张且全部答对",
    hidden: false,
    icon: "🎯",
    check: (c) => {
      const log = c.todayLog;
      if (!log) return false;
      const total = log.newCount + log.reviewCount;
      return total >= 20 && log.correctCount === total;
    },
    progress: (c) => {
      const log = c.todayLog;
      if (!log) return null;
      const total = log.newCount + log.reviewCount;
      return { current: Math.min(total, 20), target: 20 };
    },
  },

  // ───────────── 探索类（4 个，铜银金，含早期入门） ─────────────
  {
    id: "explore-10",
    category: "exploration",
    rarity: "bronze",
    name: "初探",
    description: "查过 10 个不同的词",
    hidden: false,
    icon: "🔍",
    check: (c) => c.uniqueSearchCount >= 10,
    progress: (c) => ({ current: c.uniqueSearchCount, target: 10 }),
  },
  {
    id: "explore-50",
    category: "exploration",
    rarity: "bronze",
    name: "好奇之心",
    description: "查过 50 个不同的词",
    hidden: false,
    icon: "🔍",
    check: (c) => c.uniqueSearchCount >= 50,
    progress: (c) => ({ current: c.uniqueSearchCount, target: 50 }),
  },
  {
    id: "explore-200",
    category: "exploration",
    rarity: "silver",
    name: "博学者",
    description: "查过 200 个不同的词",
    hidden: false,
    icon: "🔍",
    check: (c) => c.uniqueSearchCount >= 200,
    progress: (c) => ({ current: c.uniqueSearchCount, target: 200 }),
  },
  {
    id: "explore-1000",
    category: "exploration",
    rarity: "gold",
    name: "万卷书",
    description: "查过 1000 个不同的词",
    hidden: false,
    icon: "🔍",
    check: (c) => c.uniqueSearchCount >= 1000,
    progress: (c) => ({ current: c.uniqueSearchCount, target: 1000 }),
  },

  // ───────────── 突破类（4 个，独立徽章） ─────────────
  {
    id: "session-50",
    category: "breakthrough",
    rarity: "bronze",
    name: "单日突破",
    description: "单日学习 50+ 张卡片",
    hidden: false,
    icon: "⚡",
    check: (c) => {
      const log = c.todayLog;
      if (!log) return false;
      return log.newCount + log.reviewCount >= 50;
    },
    progress: (c) => {
      const log = c.todayLog;
      if (!log) return null;
      return { current: Math.min(log.newCount + log.reviewCount, 50), target: 50 };
    },
  },
  {
    id: "session-100",
    category: "breakthrough",
    rarity: "silver",
    name: "单日达人",
    description: "单日学习 100+ 张卡片",
    hidden: false,
    icon: "⚡",
    check: (c) => {
      const log = c.todayLog;
      if (!log) return false;
      return log.newCount + log.reviewCount >= 100;
    },
    progress: (c) => {
      const log = c.todayLog;
      if (!log) return null;
      return { current: Math.min(log.newCount + log.reviewCount, 100), target: 100 };
    },
  },
  {
    id: "early-bird",
    category: "breakthrough",
    rarity: "bronze",
    name: "早起鸟",
    description: "在早上 5-7 点学习累计 7 天",
    hidden: false,
    icon: "🌅",
    check: (c) => c.earlyBirdDays >= 7,
    progress: (c) => ({ current: Math.min(c.earlyBirdDays, 7), target: 7 }),
  },
  {
    id: "night-owl",
    category: "breakthrough",
    rarity: "bronze",
    name: "夜猫子",
    description: "在深夜 23-5 点学习累计 7 天",
    hidden: false,
    icon: "🌙",
    check: (c) => c.nightOwlDays >= 7,
    progress: (c) => ({ current: Math.min(c.nightOwlDays, 7), target: 7 }),
  },

  // ───────────── 收藏家类（3 个，铜银金） ─────────────
  {
    id: "book-quarter",
    category: "book",
    rarity: "bronze",
    name: "词书四分之一",
    description: "完成词书的 25%",
    hidden: false,
    icon: "📖",
    check: (c) => c.bookProgress >= 0.25,
    progress: (c) => ({ current: Math.min(Math.round(c.bookProgress * 100), 25), target: 25 }),
  },
  {
    id: "book-half",
    category: "book",
    rarity: "silver",
    name: "过半",
    description: "完成词书的 50%",
    hidden: false,
    icon: "📖",
    check: (c) => c.bookProgress >= 0.5,
    progress: (c) => ({ current: Math.min(Math.round(c.bookProgress * 100), 50), target: 50 }),
  },
  {
    id: "book-complete",
    category: "book",
    rarity: "gold",
    name: "词书通关",
    description: "完成整本词书",
    hidden: false,
    icon: "📖",
    check: (c) => c.bookProgress >= 1,
    progress: (c) => ({ current: Math.min(Math.round(c.bookProgress * 100), 100), target: 100 }),
  },

  // ───────────── 精通类（3 个，铜银金，基于 V4/mastered 状态） ─────────────
  {
    id: "mastered-50",
    category: "mastery",
    rarity: "bronze",
    name: "初窥门径",
    description: "掌握 50 个词（V4 通过）",
    hidden: false,
    icon: "🏆",
    check: (c) => c.masteredCount >= 50,
    progress: (c) => ({ current: c.masteredCount, target: 50 }),
  },
  {
    id: "mastered-200",
    category: "mastery",
    rarity: "silver",
    name: "登堂入室",
    description: "掌握 200 个词",
    hidden: false,
    icon: "🏆",
    check: (c) => c.masteredCount >= 200,
    progress: (c) => ({ current: c.masteredCount, target: 200 }),
  },
  {
    id: "mastered-1000",
    category: "mastery",
    rarity: "gold",
    name: "炉火纯青",
    description: "掌握 1000 个词",
    hidden: false,
    icon: "🏆",
    check: (c) => c.masteredCount >= 1000,
    progress: (c) => ({ current: c.masteredCount, target: 1000 }),
  },

  // ───────────── 隐藏徽章（3 个，彩蛋，??? 显示） ─────────────
  {
    id: "secret-comeback",
    category: "secret",
    rarity: "gold",
    name: "王者归来",
    description: "???",
    hidden: true,
    icon: "❓",
    check: (c) => c.comebackGapDays >= 30,
    progress: () => null,
  },
  {
    id: "secret-shield-saver",
    category: "secret",
    rarity: "silver",
    name: "守护者",
    description: "???",
    hidden: true,
    icon: "❓",
    check: (c) => c.shieldUsedTotal >= 5,
    progress: (c) => ({ current: Math.min(c.shieldUsedTotal, 5), target: 5 }),
  },
  {
    id: "secret-quiet-day",
    category: "secret",
    rarity: "bronze",
    name: "留白日",
    description: "???",
    hidden: true,
    icon: "❓",
    check: (c) => {
      const log = c.todayLog;
      if (!log) return false;
      // 单日只查 1 个词且不复习（newCount=1, reviewCount=0, 且今日有查词动作）
      return log.newCount === 1 && log.reviewCount === 0;
    },
    progress: () => null,
  },
];

/** 徽章规则索引（id → rule，O(1) 查找） */
export const BADGE_RULES_BY_ID: Map<string, BadgeRule> = new Map(
  BADGE_RULES.map((r) => [r.id, r])
);

/** 按 ID 取规则 */
export function getBadgeRule(id: string): BadgeRule | undefined {
  return BADGE_RULES_BY_ID.get(id);
}

/** 列出某类别的所有徽章 */
export function listBadgesByCategory(category: BadgeCategory): BadgeRule[] {
  return BADGE_RULES.filter((r) => r.category === category);
}

/** 读取已解锁徽章记录列表 */
export async function listUnlockedBadges(): Promise<BadgeRecord[]> {
  return listItemsByPrefix<BadgeRecord>(BADGE_PREFIX);
}

/** 读取已解锁徽章 ID 集合（O(1) 查询） */
export async function listUnlockedBadgeIds(): Promise<Set<string>> {
  const records = await listUnlockedBadges();
  return new Set(records.map((r) => r.id));
}

/** 读取单个徽章解锁记录 */
export async function getBadgeRecord(id: string): Promise<BadgeRecord | undefined> {
  return getItem<BadgeRecord>(`${BADGE_PREFIX}${id}`);
}

/** 写入徽章解锁记录 */
export async function saveBadgeRecord(record: BadgeRecord): Promise<void> {
  await setItem(`${BADGE_PREFIX}${record.id}`, record);
}

/** 徽章是否已解锁 */
export async function isBadgeUnlocked(id: string): Promise<boolean> {
  const r = await getBadgeRecord(id);
  return r !== undefined;
}

/**
 * 评估所有未解锁徽章，写入新解锁记录（增量判定）。
 *
 * 触发时机：
 * - recordStudy 后（streak 类、精度类、突破类）
 * - addFavorite 后（积累类、探索类）
 * - 回归挽留首启后（隐藏 - 王者归来）
 *
 * @returns 新解锁的徽章规则列表（用于 UI toast 提示）
 */
export async function evaluateBadges(
  ctx: BadgeContext
): Promise<BadgeRule[]> {
  const unlockedIds = await listUnlockedBadgeIds();
  const newlyUnlocked: BadgeRule[] = [];
  const now = new Date().toISOString();
  for (const rule of BADGE_RULES) {
    if (unlockedIds.has(rule.id)) continue;
    if (rule.check(ctx)) {
      await saveBadgeRecord({ id: rule.id, unlockedAt: now });
      newlyUnlocked.push(rule);
    }
  }
  return newlyUnlocked;
}

/**
 * 评估单个徽章是否解锁（不写库，纯查询，用于 UI 进度展示）。
 */
export function isBadgeUnlockedPure(
  rule: BadgeRule,
  ctx: BadgeContext
): boolean {
  return rule.check(ctx);
}

/** 徽章视图（用于 UI 展示，合并规则 + 解锁状态 + 进度） */
export interface BadgeView {
  rule: BadgeRule;
  unlocked: boolean;
  unlockedAt: string | null;
  progress: { current: number; target: number } | null;
  /** 隐藏徽章解锁前是否显示 ??? */
  masked: boolean;
}

/**
 * 构造徽章视图列表（用于统计页"成就"区块展示）。
 *
 * 隐藏徽章解锁前：name = "???"，description = "???"，icon = "❓"
 * 隐藏徽章解锁后：显示真实信息
 */
export async function buildBadgeViews(
  ctx: BadgeContext
): Promise<BadgeView[]> {
  const unlockedIds = await listUnlockedBadgeIds();
  const unlockedRecords = await listUnlockedBadges();
  const unlockedAtMap = new Map(unlockedRecords.map((r) => [r.id, r.unlockedAt]));

  return BADGE_RULES.map((rule) => {
    const unlocked = unlockedIds.has(rule.id);
    const progress = rule.progress(ctx);
    const masked = rule.hidden && !unlocked;
    return {
      rule: masked
        ? { ...rule, name: "???", description: "隐藏徽章，待你发现", icon: "❓" }
        : rule,
      unlocked,
      unlockedAt: unlockedAtMap.get(rule.id) ?? null,
      progress,
      masked,
    };
  });
}

/**
 * 计算下一个最接近的徽章（用于通知"还差 X 就解锁"）。
 *
 * 策略：在所有未解锁、有进度、非隐藏的徽章中，挑进度比例最大的。
 */
export function findNextBadge(
  ctx: BadgeContext,
  unlockedIds: Set<string>
): { rule: BadgeRule; gap: number } | null {
  let best: { rule: BadgeRule; gap: number; ratio: number } | null = null;
  for (const rule of BADGE_RULES) {
    if (unlockedIds.has(rule.id)) continue;
    if (rule.hidden) continue;
    const prog = rule.progress(ctx);
    if (!prog || prog.target === 0) continue;
    const ratio = prog.current / prog.target;
    const gap = Math.max(0, prog.target - prog.current);
    if (!best || ratio > best.ratio) {
      best = { rule, gap, ratio };
    }
  }
  return best ? { rule: best.rule, gap: best.gap } : null;
}

/** 计算累计获得的徽章奖励 XP（已解锁徽章的 XP 之和） */
export async function computeTotalBadgeXp(): Promise<number> {
  const records = await listUnlockedBadges();
  let total = 0;
  for (const r of records) {
    const rule = getBadgeRule(r.id);
    if (rule) total += RARITY_XP[rule.rarity];
  }
  return total;
}

/** 计算累计获得的保护券奖励（钻石徽章 × 1） */
export async function computeTotalShieldRewards(): Promise<number> {
  const records = await listUnlockedBadges();
  let total = 0;
  for (const r of records) {
    const rule = getBadgeRule(r.id);
    if (rule) total += RARITY_SHIELD_REWARD[rule.rarity];
  }
  return total;
}
