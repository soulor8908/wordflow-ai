/**
 * 徽章统计 —— 设计文档 §4.2 特性 3（成就系统 UI 数据层）
 *
 * 设计原则（卡帕西式）：
 * - 所有统计从 BADGE_RULES + 已解锁记录派生，不维护冗余状态
 * - 纯函数 + 一次 IO（listUnlockedBadges），便于测试与缓存
 * - 提供 UI 所需的"完成度 / 最近解锁 / 分类进度"三类聚合视图
 *
 * UI 集成点：
 * - 统计页"成就"区块：showBadgeStats → 总进度条 + 分类进度
 * - 首页"最近解锁"：listRecentlyUnlockedBadges → 展示最近 3 个
 * - 通知构造：findNextBadge 已在 badges.ts 提供
 */
import {
  BADGE_RULES,
  listUnlockedBadges,
  RARITY_XP,
  type BadgeCategory,
  type BadgeRarity,
} from "./badges";
import type { BadgeRecord } from "./types";

/** 单个分类的完成度 */
export interface CategoryStat {
  category: BadgeCategory;
  total: number;
  unlocked: number;
  /** 完成度 0-1 */
  ratio: number;
}

/** 单个稀有度的完成度 */
export interface RarityStat {
  rarity: BadgeRarity;
  total: number;
  unlocked: number;
  ratio: number;
}

/** 徽章总览统计（用于统计页头部） */
export interface BadgeStats {
  /** 总徽章数 */
  total: number;
  /** 已解锁数 */
  unlocked: number;
  /** 完成度 0-1 */
  ratio: number;
  /** 已获得的 XP 奖励总和 */
  totalXp: number;
  /** 按类别统计 */
  byCategory: CategoryStat[];
  /** 按稀有度统计 */
  byRarity: RarityStat[];
}

/** 最近解锁的徽章记录（含规则，用于 UI 展示） */
export interface RecentBadge {
  record: BadgeRecord;
  /** 徽章规则（从 BADGE_RULES_BY_ID 查找，找不到时为 null——规则被删除的兼容） */
  rule:
    | {
        id: string;
        name: string;
        description: string;
        icon: string;
        rarity: BadgeRarity;
        category: BadgeCategory;
      }
    | null;
}

/** 类别显示顺序（统计页展示用） */
export const CATEGORY_ORDER: BadgeCategory[] = [
  "streak",
  "vocab",
  "mastery",
  "accuracy",
  "exploration",
  "breakthrough",
  "book",
  "secret",
];

/** 稀有度显示顺序 */
export const RARITY_ORDER: BadgeRarity[] = ["bronze", "silver", "gold", "diamond"];

/**
 * 计算徽章完成度统计（纯函数 + 一次 IO）。
 *
 * 性能：BADGE_RULES 30 条 + listUnlockedBadges 一次前缀扫描，约 5ms。
 */
export async function computeBadgeStats(): Promise<BadgeStats> {
  const records = await listUnlockedBadges();
  const unlockedIds = new Set(records.map((r) => r.id));

  // 按类别聚合
  const categoryMap = new Map<BadgeCategory, { total: number; unlocked: number }>();
  for (const rule of BADGE_RULES) {
    const entry = categoryMap.get(rule.category) ?? { total: 0, unlocked: 0 };
    entry.total++;
    if (unlockedIds.has(rule.id)) entry.unlocked++;
    categoryMap.set(rule.category, entry);
  }
  const byCategory: CategoryStat[] = CATEGORY_ORDER.map((category) => {
    const entry = categoryMap.get(category) ?? { total: 0, unlocked: 0 };
    return {
      category,
      total: entry.total,
      unlocked: entry.unlocked,
      ratio: entry.total > 0 ? entry.unlocked / entry.total : 0,
    };
  });

  // 按稀有度聚合
  const rarityMap = new Map<BadgeRarity, { total: number; unlocked: number; xp: number }>();
  for (const rule of BADGE_RULES) {
    const entry = rarityMap.get(rule.rarity) ?? { total: 0, unlocked: 0, xp: 0 };
    entry.total++;
    if (unlockedIds.has(rule.id)) {
      entry.unlocked++;
      entry.xp += RARITY_XP[rule.rarity];
    }
    rarityMap.set(rule.rarity, entry);
  }
  const byRarity: RarityStat[] = RARITY_ORDER.map((rarity) => {
    const entry = rarityMap.get(rarity) ?? { total: 0, unlocked: 0, xp: 0 };
    return {
      rarity,
      total: entry.total,
      unlocked: entry.unlocked,
      ratio: entry.total > 0 ? entry.unlocked / entry.total : 0,
    };
  });

  const total = BADGE_RULES.length;
  const unlocked = records.length;
  const totalXp = byRarity.reduce((s, r) => s + (rarityMap.get(r.rarity)?.xp ?? 0), 0);

  return {
    total,
    unlocked,
    ratio: total > 0 ? unlocked / total : 0,
    totalXp,
    byCategory,
    byRarity,
  };
}

/**
 * 列出最近解锁的徽章（按 unlockedAt 倒序，取前 N 个）。
 *
 * 用于首页"最近成就"区块或通知构造。
 * 规则被删除的徽章仍会返回（rule=null），UI 可选择过滤或展示"已废弃"。
 */
export async function listRecentlyUnlockedBadges(
  limit: number = 3
): Promise<RecentBadge[]> {
  const records = await listUnlockedBadges();
  // 按 unlockedAt 倒序
  const sorted = [...records].sort((a, b) => b.unlockedAt.localeCompare(a.unlockedAt));
  const top = sorted.slice(0, Math.max(0, limit));

  // 动态导入避免循环依赖（badges.ts 已导入本模块的类型）
  const { BADGE_RULES_BY_ID } = await import("./badges");
  return top.map((record) => {
    const rule = BADGE_RULES_BY_ID.get(record.id);
    return {
      record,
      rule: rule
        ? {
            id: rule.id,
            name: rule.name,
            description: rule.description,
            icon: rule.icon,
            rarity: rule.rarity,
            category: rule.category,
          }
        : null,
    };
  });
}

/**
 * 计算距离下一个里程碑还差多少个徽章。
 *
 * 里程碑定义：每解锁 5 个徽章为一个里程碑（5/10/15/20/25）。
 * 返回 { current, next, gap }，全部已解锁时 next=null。
 */
export async function computeNextMilestone(): Promise<{
  current: number;
  next: number | null;
  gap: number;
}> {
  const stats = await computeBadgeStats();
  const current = stats.unlocked;
  const MILESTONE_STEP = 5;
  const next = Math.ceil((current + 1) / MILESTONE_STEP) * MILESTONE_STEP;
  if (next > stats.total) {
    return { current, next: null, gap: 0 };
  }
  return { current, next, gap: next - current };
}
