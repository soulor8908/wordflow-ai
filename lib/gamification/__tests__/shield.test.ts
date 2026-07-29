import { describe, test, expect } from "vitest";
import {
  shouldConsumeShield,
  applyShieldConsumption,
  maybeEarnShield,
  applyComebackGift,
  resolveShieldForRecordStudy,
  defaultShieldState,
} from "@/lib/gamification/shield";
import type { StreakState } from "@/lib/stats/streak";
import type { StreakShieldState } from "@/lib/gamification/types";

const baseStreak = (over: Partial<StreakState> = {}): StreakState => ({
  currentStreak: 5,
  longestStreak: 5,
  lastReviewDate: "2026-07-26",
  ...over,
});

const baseShield = (over: Partial<StreakShieldState> = {}): StreakShieldState => ({
  shields: 1,
  lastEarnedDate: null,
  lastUsedDate: null,
  totalUsed: 0,
  ...over,
});

describe("defaultShieldState", () => {
  test("新用户默认持有 1 张保护券", () => {
    const s = defaultShieldState();
    expect(s.shields).toBe(1);
    expect(s.totalUsed).toBe(0);
    expect(s.lastEarnedDate).toBeNull();
    expect(s.lastUsedDate).toBeNull();
  });
});

describe("shouldConsumeShield", () => {
  test("无 prevStreak → 不消耗", () => {
    expect(shouldConsumeShield(undefined, "2026-07-27", baseShield())).toBe(false);
  });

  test("同日复习 → 不消耗", () => {
    const prev = baseStreak({ lastReviewDate: "2026-07-27" });
    expect(shouldConsumeShield(prev, "2026-07-27", baseShield())).toBe(false);
  });

  test("连续次日（gap=1）→ 不消耗（正常 +1）", () => {
    const prev = baseStreak({ lastReviewDate: "2026-07-26" });
    expect(shouldConsumeShield(prev, "2026-07-27", baseShield({ shields: 1 }))).toBe(false);
  });

  test("隔 1 天（gap=2）且有券 → 消耗", () => {
    // 7-26 复习，7-27 断签，7-28 来补 → gap=2，消耗保护券
    const prev = baseStreak({ lastReviewDate: "2026-07-26" });
    expect(shouldConsumeShield(prev, "2026-07-28", baseShield({ shields: 1 }))).toBe(true);
  });

  test("隔 1 天（gap=2）但无券 → 不消耗", () => {
    const prev = baseStreak({ lastReviewDate: "2026-07-26" });
    expect(shouldConsumeShield(prev, "2026-07-28", baseShield({ shields: 0 }))).toBe(false);
  });

  test("隔 2 天（gap=3）→ 不消耗（保护券仅保单日）", () => {
    const prev = baseStreak({ lastReviewDate: "2026-07-25" });
    expect(shouldConsumeShield(prev, "2026-07-28", baseShield({ shields: 1 }))).toBe(false);
  });
});

describe("applyShieldConsumption", () => {
  test("正常消耗：shields - 1，totalUsed + 1", () => {
    const result = applyShieldConsumption(baseShield({ shields: 2, totalUsed: 3 }), "2026-07-27");
    expect(result.shields).toBe(1);
    expect(result.totalUsed).toBe(4);
    expect(result.lastUsedDate).toBe("2026-07-27");
  });

  test("同日重复调用 → 幂等，不再消耗", () => {
    const s = baseShield({ shields: 1, lastUsedDate: "2026-07-27", totalUsed: 1 });
    const result = applyShieldConsumption(s, "2026-07-27");
    expect(result.shields).toBe(1);
    expect(result.totalUsed).toBe(1);
  });

  test("无券可消耗 → 不变", () => {
    const s = baseShield({ shields: 0 });
    const result = applyShieldConsumption(s, "2026-07-27");
    expect(result.shields).toBe(0);
  });
});

describe("maybeEarnShield", () => {
  test("连胜 7 天且今日未领 → +1", () => {
    const streak = baseStreak({ currentStreak: 7 });
    const result = maybeEarnShield(streak, baseShield({ shields: 1 }), "2026-07-27");
    expect(result.shields).toBe(2);
    expect(result.lastEarnedDate).toBe("2026-07-27");
  });

  test("连胜 14 天（7 的倍数）→ +1", () => {
    const streak = baseStreak({ currentStreak: 14 });
    const result = maybeEarnShield(streak, baseShield({ shields: 0 }), "2026-07-27");
    expect(result.shields).toBe(1);
  });

  test("连胜 8 天（非 7 的倍数）→ 不补充", () => {
    const streak = baseStreak({ currentStreak: 8 });
    const result = maybeEarnShield(streak, baseShield({ shields: 0 }), "2026-07-27");
    expect(result.shields).toBe(0);
  });

  test("今日已领过 → 不再补充（幂等）", () => {
    const streak = baseStreak({ currentStreak: 7 });
    const result = maybeEarnShield(
      streak,
      baseShield({ shields: 1, lastEarnedDate: "2026-07-27" }),
      "2026-07-27"
    );
    expect(result.shields).toBe(1);
  });

  test("已持有 2 张上限 → 不再补充", () => {
    const streak = baseStreak({ currentStreak: 7 });
    const result = maybeEarnShield(streak, baseShield({ shields: 2 }), "2026-07-27");
    expect(result.shields).toBe(2);
  });
});

describe("applyComebackGift", () => {
  test("断签 ≥7 天且无券 → 赠送 1 张", () => {
    const result = applyComebackGift(
      baseShield({ shields: 0 }),
      baseStreak(),
      "2026-07-27",
      7
    );
    expect(result.gifted).toBe(true);
    expect(result.shield.shields).toBe(1);
  });

  test("断签 ≥30 天且无券 → 赠送 1 张", () => {
    const result = applyComebackGift(
      baseShield({ shields: 0 }),
      baseStreak(),
      "2026-07-27",
      30
    );
    expect(result.gifted).toBe(true);
  });

  test("断签 <7 天 → 不赠送", () => {
    const result = applyComebackGift(
      baseShield({ shields: 0 }),
      baseStreak(),
      "2026-07-27",
      6
    );
    expect(result.gifted).toBe(false);
  });

  test("已有保护券 → 不赠送", () => {
    const result = applyComebackGift(
      baseShield({ shields: 1 }),
      baseStreak(),
      "2026-07-27",
      30
    );
    expect(result.gifted).toBe(false);
  });
});

describe("resolveShieldForRecordStudy", () => {
  test("隔 1 天（gap=2）有券 → 消耗，prevStreak 前移到 yesterday 保住连胜", () => {
    // 7-26 复习，7-27 断签，7-28 来补 → gap=2，消耗保护券
    // 前移 lastReviewDate 到 7-27（yesterday），使 computeStreak 看到 gap=1 → +1
    const prev = baseStreak({ currentStreak: 5, lastReviewDate: "2026-07-26" });
    const result = resolveShieldForRecordStudy(prev, "2026-07-28", baseShield({ shields: 1 }));
    expect(result.consumed).toBe(true);
    expect(result.newShield.shields).toBe(0);
    expect(result.adjustedPrevStreak?.lastReviewDate).toBe("2026-07-27");
  });

  test("隔 1 天（gap=2）无券 → 不消耗，连胜会重置", () => {
    const prev = baseStreak({ currentStreak: 5, lastReviewDate: "2026-07-26" });
    const result = resolveShieldForRecordStudy(prev, "2026-07-28", baseShield({ shields: 0 }));
    expect(result.consumed).toBe(false);
    expect(result.adjustedPrevStreak).toBe(prev);
    expect(result.newShield.shields).toBe(0);
  });

  test("连续次日（gap=1）→ 不消耗", () => {
    const prev = baseStreak({ currentStreak: 5, lastReviewDate: "2026-07-27" });
    const result = resolveShieldForRecordStudy(prev, "2026-07-28", baseShield({ shields: 2 }));
    expect(result.consumed).toBe(false);
  });

  test("隔 2 天（gap=3）→ 不消耗（保护券不跨多日）", () => {
    const prev = baseStreak({ currentStreak: 5, lastReviewDate: "2026-07-25" });
    const result = resolveShieldForRecordStudy(prev, "2026-07-28", baseShield({ shields: 2 }));
    expect(result.consumed).toBe(false);
  });

  test("同日复习 → 不消耗", () => {
    const prev = baseStreak({ currentStreak: 5, lastReviewDate: "2026-07-28" });
    const result = resolveShieldForRecordStudy(prev, "2026-07-28", baseShield({ shields: 1 }));
    expect(result.consumed).toBe(false);
  });

  test("无 prevStreak → 不消耗", () => {
    const result = resolveShieldForRecordStudy(undefined, "2026-07-28", baseShield({ shields: 1 }));
    expect(result.consumed).toBe(false);
  });
});
