import { describe, test, expect } from "vitest";
import {
  BADGE_RULES,
  BADGE_RULES_BY_ID,
  RARITY_XP,
  RARITY_SHIELD_REWARD,
  getBadgeRule,
  listBadgesByCategory,
  findNextBadge,
  isBadgeUnlockedPure,
  type BadgeContext,
  type BadgeCategory,
} from "@/lib/gamification/badges";
import type { StreakState } from "@/lib/stats/streak";
import type { StudyLog } from "@/lib/stats/streak-io";

/** 构造空上下文（所有徽章都不应解锁） */
function emptyCtx(over: Partial<BadgeContext> = {}): BadgeContext {
  return {
    streak: undefined,
    totalCards: 0,
    masteredCount: 0,
    uniqueSearchCount: 0,
    last7DaysAccuracy: 0,
    consecutiveQualifiedDays: 0,
    todayLog: null,
    lastStudyHour: null,
    earlyBirdDays: 0,
    nightOwlDays: 0,
    bookProgress: 0,
    shieldUsedTotal: 0,
    comebackGapDays: 0,
    ...over,
  };
}

/** 构造满上下文（所有非隐藏徽章都应解锁） */
function fullCtx(over: Partial<BadgeContext> = {}): BadgeContext {
  const streak: StreakState = {
    currentStreak: 400,
    longestStreak: 400,
    lastReviewDate: "2026-07-27",
  };
  const todayLog: StudyLog = {
    date: "2026-07-27",
    newCount: 50,
    reviewCount: 50,
    correctCount: 100,
    updatedAt: "2026-07-27T12:00:00Z",
  };
  return {
    streak,
    totalCards: 6000,
    masteredCount: 1500,
    uniqueSearchCount: 1500,
    last7DaysAccuracy: 0.95,
    consecutiveQualifiedDays: 35,
    todayLog,
    lastStudyHour: 6,
    earlyBirdDays: 10,
    nightOwlDays: 10,
    bookProgress: 1,
    shieldUsedTotal: 10,
    comebackGapDays: 0,
    ...over,
  };
}

describe("BADGE_RULES 完整性", () => {
  test("共 28 个徽章", () => {
    expect(BADGE_RULES).toHaveLength(28);
  });

  test("所有 ID 唯一", () => {
    const ids = BADGE_RULES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("所有规则都有 check 与 progress 函数", () => {
    for (const rule of BADGE_RULES) {
      expect(typeof rule.check).toBe("function");
      expect(typeof rule.progress).toBe("function");
    }
  });

  test("BADGE_RULES_BY_ID 与 BADGE_RULES 一致", () => {
    expect(BADGE_RULES_BY_ID.size).toBe(BADGE_RULES.length);
    for (const rule of BADGE_RULES) {
      expect(BADGE_RULES_BY_ID.get(rule.id)).toBe(rule);
    }
  });
});

describe("徽章分布（设计文档要求）", () => {
  const expected: Record<BadgeCategory, number> = {
    streak: 4,
    vocab: 4,
    accuracy: 3,
    exploration: 4,
    breakthrough: 4,
    book: 3,
    mastery: 3,
    secret: 3,
  };

  test.each(Object.entries(expected))("类别 %s 有 %i 个徽章", (cat, n) => {
    expect(listBadgesByCategory(cat as BadgeCategory)).toHaveLength(n);
  });

  test("稀有度分布：铜 11 / 银 8 / 金 7 / 钻 2", () => {
    const bronze = BADGE_RULES.filter((r) => r.rarity === "bronze");
    const silver = BADGE_RULES.filter((r) => r.rarity === "silver");
    const gold = BADGE_RULES.filter((r) => r.rarity === "gold");
    const diamond = BADGE_RULES.filter((r) => r.rarity === "diamond");
    // 铜：streak-7, vocab-100, accuracy-7, explore-10, explore-50, session-50,
    //     early-bird, night-owl, book-quarter, mastered-50, secret-quiet-day = 11
    expect(bronze.length).toBe(11);
    // 银：streak-30, vocab-500, accuracy-30, explore-200, session-100, book-half,
    //     mastered-200, secret-shield-saver = 8
    expect(silver.length).toBe(8);
    // 金：streak-100, vocab-2000, accuracy-perfect, explore-1000, book-complete,
    //     mastered-1000, secret-comeback = 7
    expect(gold.length).toBe(7);
    // 钻石：streak-365, vocab-5000 = 2
    expect(diamond.length).toBe(2);
  });

  test("钻石级徽章仅 2 个（长期目标）", () => {
    const diamond = BADGE_RULES.filter((r) => r.rarity === "diamond");
    expect(diamond.map((r) => r.id).sort()).toEqual(["streak-365", "vocab-5000"]);
  });

  test("隐藏徽章共 3 个，均为 secret 类", () => {
    const hidden = BADGE_RULES.filter((r) => r.hidden);
    expect(hidden).toHaveLength(3);
    expect(hidden.every((r) => r.category === "secret")).toBe(true);
    expect(hidden.map((r) => r.id).sort()).toEqual([
      "secret-comeback",
      "secret-quiet-day",
      "secret-shield-saver",
    ]);
  });
});

describe("RARITY 奖励配置", () => {
  test("XP 奖励递增：铜 10 / 银 30 / 金 100 / 钻 200", () => {
    expect(RARITY_XP.bronze).toBe(10);
    expect(RARITY_XP.silver).toBe(30);
    expect(RARITY_XP.gold).toBe(100);
    expect(RARITY_XP.diamond).toBe(200);
  });

  test("仅钻石级奖励保护券", () => {
    expect(RARITY_SHIELD_REWARD.bronze).toBe(0);
    expect(RARITY_SHIELD_REWARD.silver).toBe(0);
    expect(RARITY_SHIELD_REWARD.gold).toBe(0);
    expect(RARITY_SHIELD_REWARD.diamond).toBe(1);
  });
});

describe("徽章判定 — 空上下文", () => {
  test("空上下文：所有徽章都不应解锁", () => {
    const ctx = emptyCtx();
    for (const rule of BADGE_RULES) {
      expect(rule.check(ctx)).toBe(false);
    }
  });
});

describe("徽章判定 — 满上下文", () => {
  test("满上下文：非隐藏徽章全部解锁，隐藏徽章中王者归来/守护者解锁，留白日不解锁", () => {
    const ctx = fullCtx();
    const unlocked = BADGE_RULES.filter((r) => r.check(ctx));
    const unlockedIds = unlocked.map((r) => r.id);

    // 非隐藏徽章应全部解锁
    for (const rule of BADGE_RULES) {
      if (!rule.hidden) {
        expect(unlockedIds).toContain(rule.id);
      }
    }

    // 隐藏徽章：王者归来（gap≥30 → comebackGapDays=0 不解锁）、守护者（used≥5 ✓）解锁；
    // 留白日不解锁（todayLog 不满足 newCount=1 reviewCount=0）
    expect(unlockedIds).not.toContain("secret-comeback"); // comebackGapDays=0
    expect(unlockedIds).toContain("secret-shield-saver");
    expect(unlockedIds).not.toContain("secret-quiet-day");
  });
});

describe("徽章判定 — 各类别边界", () => {
  test("streak-7：连胜恰好 7 → 解锁", () => {
    const ctx = emptyCtx({
      streak: { currentStreak: 7, longestStreak: 7, lastReviewDate: "2026-07-27" },
    });
    expect(getBadgeRule("streak-7")!.check(ctx)).toBe(true);
    expect(getBadgeRule("streak-30")!.check(ctx)).toBe(false);
  });

  test("streak-365：连胜恰好 365 → 解锁钻石", () => {
    const ctx = emptyCtx({
      streak: { currentStreak: 365, longestStreak: 365, lastReviewDate: "2026-07-27" },
    });
    expect(getBadgeRule("streak-365")!.check(ctx)).toBe(true);
  });

  test("vocab-100：卡片数恰好 100 → 解锁", () => {
    const ctx = emptyCtx({ totalCards: 100 });
    expect(getBadgeRule("vocab-100")!.check(ctx)).toBe(true);
    expect(getBadgeRule("vocab-500")!.check(ctx)).toBe(false);
  });

  test("accuracy-7：连续 7 天达标 → 解锁", () => {
    const ctx = emptyCtx({ consecutiveQualifiedDays: 7 });
    expect(getBadgeRule("accuracy-7")!.check(ctx)).toBe(true);
  });

  test("accuracy-perfect：单日 20+ 全对 → 解锁", () => {
    const ctx = emptyCtx({
      todayLog: { date: "2026-07-27", newCount: 10, reviewCount: 10, correctCount: 20, updatedAt: "" },
    });
    expect(getBadgeRule("accuracy-perfect")!.check(ctx)).toBe(true);
  });

  test("accuracy-perfect：单日 20+ 但有 1 张错 → 不解锁", () => {
    const ctx = emptyCtx({
      todayLog: { date: "2026-07-27", newCount: 10, reviewCount: 10, correctCount: 19, updatedAt: "" },
    });
    expect(getBadgeRule("accuracy-perfect")!.check(ctx)).toBe(false);
  });

  test("accuracy-perfect：单日 19 张全对 → 不解锁（< 20）", () => {
    const ctx = emptyCtx({
      todayLog: { date: "2026-07-27", newCount: 10, reviewCount: 9, correctCount: 19, updatedAt: "" },
    });
    expect(getBadgeRule("accuracy-perfect")!.check(ctx)).toBe(false);
  });

  test("session-50：单日 50 张 → 解锁", () => {
    const ctx = emptyCtx({
      todayLog: { date: "2026-07-27", newCount: 25, reviewCount: 25, correctCount: 30, updatedAt: "" },
    });
    expect(getBadgeRule("session-50")!.check(ctx)).toBe(true);
    expect(getBadgeRule("session-100")!.check(ctx)).toBe(false);
  });

  test("early-bird：累计 7 天早起 → 解锁", () => {
    expect(getBadgeRule("early-bird")!.check(emptyCtx({ earlyBirdDays: 7 }))).toBe(true);
    expect(getBadgeRule("early-bird")!.check(emptyCtx({ earlyBirdDays: 6 }))).toBe(false);
  });

  test("night-owl：累计 7 天夜学 → 解锁", () => {
    expect(getBadgeRule("night-owl")!.check(emptyCtx({ nightOwlDays: 7 }))).toBe(true);
    expect(getBadgeRule("night-owl")!.check(emptyCtx({ nightOwlDays: 6 }))).toBe(false);
  });

  test("early-bird 和 night-owl 不再互斥（累计型可同时解锁）", () => {
    const ctx = emptyCtx({ earlyBirdDays: 10, nightOwlDays: 10 });
    expect(getBadgeRule("early-bird")!.check(ctx)).toBe(true);
    expect(getBadgeRule("night-owl")!.check(ctx)).toBe(true);
  });

  test("explore-10：查 10 个词 → 解锁", () => {
    expect(getBadgeRule("explore-10")!.check(emptyCtx({ uniqueSearchCount: 10 }))).toBe(true);
    expect(getBadgeRule("explore-10")!.check(emptyCtx({ uniqueSearchCount: 9 }))).toBe(false);
  });

  test("book-complete：进度 ≥ 1 → 解锁", () => {
    expect(getBadgeRule("book-complete")!.check(emptyCtx({ bookProgress: 1 }))).toBe(true);
    expect(getBadgeRule("book-complete")!.check(emptyCtx({ bookProgress: 0.99 }))).toBe(false);
  });

  test("book-quarter：进度 ≥ 0.25 → 解锁", () => {
    expect(getBadgeRule("book-quarter")!.check(emptyCtx({ bookProgress: 0.25 }))).toBe(true);
    expect(getBadgeRule("book-quarter")!.check(emptyCtx({ bookProgress: 0.24 }))).toBe(false);
  });

  test("mastered-50：掌握 50 词 → 解锁", () => {
    expect(getBadgeRule("mastered-50")!.check(emptyCtx({ masteredCount: 50 }))).toBe(true);
    expect(getBadgeRule("mastered-50")!.check(emptyCtx({ masteredCount: 49 }))).toBe(false);
  });

  test("mastered-200：掌握 200 词 → 解锁银徽章", () => {
    expect(getBadgeRule("mastered-200")!.check(emptyCtx({ masteredCount: 200 }))).toBe(true);
  });

  test("mastered-1000：掌握 1000 词 → 解锁金徽章", () => {
    expect(getBadgeRule("mastered-1000")!.check(emptyCtx({ masteredCount: 1000 }))).toBe(true);
  });

  test("secret-comeback：gap ≥ 30 → 解锁", () => {
    expect(getBadgeRule("secret-comeback")!.check(emptyCtx({ comebackGapDays: 30 }))).toBe(true);
    expect(getBadgeRule("secret-comeback")!.check(emptyCtx({ comebackGapDays: 29 }))).toBe(false);
  });

  test("secret-shield-saver：累计用 5 张 → 解锁", () => {
    expect(getBadgeRule("secret-shield-saver")!.check(emptyCtx({ shieldUsedTotal: 5 }))).toBe(true);
    expect(getBadgeRule("secret-shield-saver")!.check(emptyCtx({ shieldUsedTotal: 4 }))).toBe(false);
  });

  test("secret-quiet-day：单日只查 1 词不复习 → 解锁", () => {
    const ctx = emptyCtx({
      todayLog: { date: "2026-07-27", newCount: 1, reviewCount: 0, correctCount: 1, updatedAt: "" },
    });
    expect(getBadgeRule("secret-quiet-day")!.check(ctx)).toBe(true);
  });

  test("secret-quiet-day：单日查 1 词复习 1 → 不解锁", () => {
    const ctx = emptyCtx({
      todayLog: { date: "2026-07-27", newCount: 1, reviewCount: 1, correctCount: 2, updatedAt: "" },
    });
    expect(getBadgeRule("secret-quiet-day")!.check(ctx)).toBe(false);
  });
});

describe("进度计算", () => {
  test("streak-30：连胜 5 → 进度 5/30", () => {
    const ctx = emptyCtx({
      streak: { currentStreak: 5, longestStreak: 5, lastReviewDate: "2026-07-27" },
    });
    expect(getBadgeRule("streak-30")!.progress(ctx)).toEqual({ current: 5, target: 30 });
  });

  test("vocab-500：卡片 100 → 进度 100/500", () => {
    const ctx = emptyCtx({ totalCards: 100 });
    expect(getBadgeRule("vocab-500")!.progress(ctx)).toEqual({ current: 100, target: 500 });
  });

  test("early-bird：累计型现在有进度（3/7）", () => {
    expect(getBadgeRule("early-bird")!.progress(emptyCtx({ earlyBirdDays: 3 }))).toEqual({
      current: 3,
      target: 7,
    });
  });

  test("night-owl：累计型现在有进度（5/7）", () => {
    expect(getBadgeRule("night-owl")!.progress(emptyCtx({ nightOwlDays: 5 }))).toEqual({
      current: 5,
      target: 7,
    });
  });

  test("mastered-50：掌握 30 → 进度 30/50", () => {
    expect(getBadgeRule("mastered-50")!.progress(emptyCtx({ masteredCount: 30 }))).toEqual({
      current: 30,
      target: 50,
    });
  });

  test("secret 类隐藏徽章：王者归来无进度，守护者有进度", () => {
    expect(getBadgeRule("secret-comeback")!.progress(emptyCtx())).toBeNull();
    expect(getBadgeRule("secret-shield-saver")!.progress(emptyCtx({ shieldUsedTotal: 3 }))).toEqual({
      current: 3,
      target: 5,
    });
  });
});

describe("findNextBadge", () => {
  test("空上下文 + 无已解锁 → 返回进度比例最大的徽章", () => {
    const ctx = emptyCtx({
      streak: { currentStreak: 6, longestStreak: 6, lastReviewDate: "2026-07-27" },
    });
    const next = findNextBadge(ctx, new Set());
    expect(next).not.toBeNull();
    // 连胜 6/7 = 0.857 是最高比例
    expect(next!.rule.id).toBe("streak-7");
    expect(next!.gap).toBe(1);
  });

  test("已解锁的徽章不再返回", () => {
    const ctx = emptyCtx({
      streak: { currentStreak: 6, longestStreak: 6, lastReviewDate: "2026-07-27" },
    });
    const next = findNextBadge(ctx, new Set(["streak-7"]));
    expect(next!.rule.id).not.toBe("streak-7");
  });

  test("隐藏徽章不返回（不公开进度）", () => {
    const ctx = emptyCtx({ shieldUsedTotal: 4 });
    const next = findNextBadge(ctx, new Set());
    expect(next!.rule.id).not.toBe("secret-shield-saver");
  });

  test("全部已解锁 → 返回 null", () => {
    const ctx = fullCtx({ comebackGapDays: 30 });
    const allIds = new Set(BADGE_RULES.map((r) => r.id));
    expect(findNextBadge(ctx, allIds)).toBeNull();
  });
});

describe("isBadgeUnlockedPure", () => {
  test("满上下文 streak-7 解锁", () => {
    const rule = getBadgeRule("streak-7")!;
    expect(isBadgeUnlockedPure(rule, fullCtx())).toBe(true);
  });

  test("空上下文 streak-7 未解锁", () => {
    const rule = getBadgeRule("streak-7")!;
    expect(isBadgeUnlockedPure(rule, emptyCtx())).toBe(false);
  });
});
