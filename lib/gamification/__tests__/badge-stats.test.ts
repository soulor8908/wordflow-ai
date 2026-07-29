// @vitest-environment jsdom
import { describe, test, expect, beforeEach } from "vitest";
import {
  computeBadgeStats,
  listRecentlyUnlockedBadges,
  computeNextMilestone,
  CATEGORY_ORDER,
  RARITY_ORDER,
} from "@/lib/gamification/badge-stats";
import { BADGE_RULES, saveBadgeRecord } from "@/lib/gamification/badges";
import { resetDbForTest } from "@/lib/storage/db";

beforeEach(async () => {
  await resetDbForTest();
});

describe("computeBadgeStats", () => {
  test("空库：0 已解锁，ratio=0", async () => {
    const stats = await computeBadgeStats();
    expect(stats.total).toBe(BADGE_RULES.length);
    expect(stats.unlocked).toBe(0);
    expect(stats.ratio).toBe(0);
    expect(stats.totalXp).toBe(0);
  });

  test("解锁 1 个铜徽章：unlocked=1, totalXp=10", async () => {
    await saveBadgeRecord({ id: "streak-7", unlockedAt: "2026-07-27T10:00:00Z" });
    const stats = await computeBadgeStats();
    expect(stats.unlocked).toBe(1);
    expect(stats.totalXp).toBe(10); // bronze = 10 XP
    expect(stats.ratio).toBeCloseTo(1 / BADGE_RULES.length, 5);
  });

  test("解锁金徽章：totalXp=100", async () => {
    await saveBadgeRecord({ id: "streak-100", unlockedAt: "2026-07-27T10:00:00Z" });
    const stats = await computeBadgeStats();
    expect(stats.unlocked).toBe(1);
    expect(stats.totalXp).toBe(100); // gold = 100 XP
  });

  test("解锁钻石徽章：totalXp=200", async () => {
    await saveBadgeRecord({ id: "streak-365", unlockedAt: "2026-07-27T10:00:00Z" });
    const stats = await computeBadgeStats();
    expect(stats.unlocked).toBe(1);
    expect(stats.totalXp).toBe(200); // diamond = 200 XP
  });

  test("byCategory 覆盖所有类别", async () => {
    const stats = await computeBadgeStats();
    expect(stats.byCategory).toHaveLength(CATEGORY_ORDER.length);
    for (const cat of CATEGORY_ORDER) {
      const entry = stats.byCategory.find((c) => c.category === cat);
      expect(entry).toBeDefined();
    }
  });

  test("byRarity 覆盖所有稀有度", async () => {
    const stats = await computeBadgeStats();
    expect(stats.byRarity).toHaveLength(RARITY_ORDER.length);
    for (const rar of RARITY_ORDER) {
      const entry = stats.byRarity.find((r) => r.rarity === rar);
      expect(entry).toBeDefined();
    }
  });

  test("分类总数与 BADGE_RULES 一致", async () => {
    const stats = await computeBadgeStats();
    const totalFromCategories = stats.byCategory.reduce((s, c) => s + c.total, 0);
    expect(totalFromCategories).toBe(BADGE_RULES.length);
  });

  test("解锁 streak-7 + streak-30：streak 类 unlocked=2", async () => {
    await saveBadgeRecord({ id: "streak-7", unlockedAt: "2026-07-27T10:00:00Z" });
    await saveBadgeRecord({ id: "streak-30", unlockedAt: "2026-07-28T10:00:00Z" });
    const stats = await computeBadgeStats();
    const streakCat = stats.byCategory.find((c) => c.category === "streak")!;
    expect(streakCat.unlocked).toBe(2);
    expect(streakCat.total).toBe(4);
    expect(streakCat.ratio).toBe(0.5);
  });
});

describe("listRecentlyUnlockedBadges", () => {
  test("空库返回空数组", async () => {
    const recent = await listRecentlyUnlockedBadges(3);
    expect(recent).toEqual([]);
  });

  test("按 unlockedAt 倒序返回", async () => {
    await saveBadgeRecord({ id: "streak-7", unlockedAt: "2026-07-27T10:00:00Z" });
    await saveBadgeRecord({ id: "vocab-100", unlockedAt: "2026-07-29T10:00:00Z" });
    await saveBadgeRecord({ id: "explore-10", unlockedAt: "2026-07-28T10:00:00Z" });

    const recent = await listRecentlyUnlockedBadges(3);
    expect(recent).toHaveLength(3);
    // 倒序：最新的在前
    expect(recent[0].record.id).toBe("vocab-100");
    expect(recent[1].record.id).toBe("explore-10");
    expect(recent[2].record.id).toBe("streak-7");
  });

  test("limit 截断", async () => {
    await saveBadgeRecord({ id: "streak-7", unlockedAt: "2026-07-27T10:00:00Z" });
    await saveBadgeRecord({ id: "vocab-100", unlockedAt: "2026-07-29T10:00:00Z" });

    const recent = await listRecentlyUnlockedBadges(1);
    expect(recent).toHaveLength(1);
    expect(recent[0].record.id).toBe("vocab-100");
  });

  test("rule 字段填充正确", async () => {
    await saveBadgeRecord({ id: "streak-7", unlockedAt: "2026-07-27T10:00:00Z" });
    const recent = await listRecentlyUnlockedBadges(1);
    expect(recent[0].rule).not.toBeNull();
    expect(recent[0].rule!.id).toBe("streak-7");
    expect(recent[0].rule!.name).toBe("一周之约");
    expect(recent[0].rule!.rarity).toBe("bronze");
  });

  test("规则被删除的徽章 rule=null", async () => {
    await saveBadgeRecord({ id: "nonexistent-badge", unlockedAt: "2026-07-27T10:00:00Z" });
    const recent = await listRecentlyUnlockedBadges(1);
    expect(recent[0].rule).toBeNull();
  });
});

describe("computeNextMilestone", () => {
  test("空库：current=0, next=5, gap=5", async () => {
    const ms = await computeNextMilestone();
    expect(ms.current).toBe(0);
    expect(ms.next).toBe(5);
    expect(ms.gap).toBe(5);
  });

  test("解锁 3 个：next=5, gap=2", async () => {
    await saveBadgeRecord({ id: "streak-7", unlockedAt: "2026-07-27T10:00:00Z" });
    await saveBadgeRecord({ id: "vocab-100", unlockedAt: "2026-07-28T10:00:00Z" });
    await saveBadgeRecord({ id: "explore-10", unlockedAt: "2026-07-29T10:00:00Z" });
    const ms = await computeNextMilestone();
    expect(ms.current).toBe(3);
    expect(ms.next).toBe(5);
    expect(ms.gap).toBe(2);
  });

  test("解锁 5 个：next=10, gap=5", async () => {
    for (let i = 0; i < 5; i++) {
      await saveBadgeRecord({
        id: BADGE_RULES[i].id,
        unlockedAt: `2026-07-2${i}T10:00:00Z`,
      });
    }
    const ms = await computeNextMilestone();
    expect(ms.current).toBe(5);
    expect(ms.next).toBe(10);
    expect(ms.gap).toBe(5);
  });

  test("全部解锁：next=null, gap=0", async () => {
    for (const rule of BADGE_RULES) {
      await saveBadgeRecord({
        id: rule.id,
        unlockedAt: "2026-07-27T10:00:00Z",
      });
    }
    const ms = await computeNextMilestone();
    expect(ms.current).toBe(BADGE_RULES.length);
    expect(ms.next).toBeNull();
    expect(ms.gap).toBe(0);
  });
});
