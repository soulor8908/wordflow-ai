// @vitest-environment jsdom
import { describe, test, expect, beforeEach } from "vitest";
import {
  recordStudy,
  getStreak,
  getStudyLog,
  listStudyLogs,
  type StudyLog,
} from "@/lib/stats/streak-io";
import { resetDbForTest, getItem } from "@/lib/storage/db";
import { todayLocalDate } from "@/lib/review/book-queue";
import { getShield, defaultShieldState } from "@/lib/gamification/shield";

beforeEach(async () => {
  await resetDbForTest();
});

describe("recordStudy — Streak 持久化", () => {
  test("首次复习：写入 settings:streak，currentStreak=1", async () => {
    const today = todayLocalDate(new Date("2026-07-27T12:00:00Z"));
    const result = await recordStudy(today, {
      newCount: 3,
      reviewCount: 5,
      correctCount: 7,
    });
    expect(result.currentStreak).toBe(1);
    expect(result.longestStreak).toBe(1);
    expect(result.lastReviewDate).toBe(today);
    // 游戏化标记
    expect(result.shieldConsumed).toBe(false);
    expect(result.shieldEarned).toBe(false);

    const stored = await getStreak();
    expect(stored?.currentStreak).toBe(result.currentStreak);
    expect(stored?.longestStreak).toBe(result.longestStreak);
    expect(stored?.lastReviewDate).toBe(result.lastReviewDate);
  });

  test("连续次日：currentStreak +1，longestStreak 取 max", async () => {
    const d1 = todayLocalDate(new Date("2026-07-26T12:00:00Z"));
    const d2 = todayLocalDate(new Date("2026-07-27T12:00:00Z"));
    await recordStudy(d1, { newCount: 1, reviewCount: 0, correctCount: 1 });
    const result = await recordStudy(d2, {
      newCount: 2,
      reviewCount: 3,
      correctCount: 4,
    });
    expect(result.currentStreak).toBe(2);
    expect(result.longestStreak).toBe(2);
  });

  test("同日多次复习：幂等，Streak 不变；日志累加", async () => {
    const today = todayLocalDate(new Date("2026-07-27T12:00:00Z"));
    await recordStudy(today, { newCount: 2, reviewCount: 1, correctCount: 3 });
    await recordStudy(today, { newCount: 1, reviewCount: 2, correctCount: 2 });
    const streak = await getStreak();
    expect(streak?.currentStreak).toBe(1); // 不变

    const log = await getStudyLog(today);
    expect(log?.newCount).toBe(3); // 2+1
    expect(log?.reviewCount).toBe(3); // 1+2
    expect(log?.correctCount).toBe(5); // 3+2
  });

  test("间隔 ≥3 天（gap=3）：重置 currentStreak=1", async () => {
    // gap=3 超出保护券保护范围（仅保 gap=2），连胜重置
    const d1 = todayLocalDate(new Date("2026-07-25T12:00:00Z"));
    const d2 = todayLocalDate(new Date("2026-07-28T12:00:00Z"));
    await recordStudy(d1, { newCount: 1, reviewCount: 0, correctCount: 1 });
    const result = await recordStudy(d2, {
      newCount: 1,
      reviewCount: 0,
      correctCount: 1,
    });
    expect(result.currentStreak).toBe(1);
    expect(result.longestStreak).toBe(1); // 之前的 streak=1 未被超越
  });
});

describe("recordStudy — 连胜保护集成", () => {
  test("默认持有 1 张保护券", async () => {
    const shield = await getShield();
    expect(shield).toEqual(defaultShieldState());
    expect(shield.shields).toBe(1);
  });

  test("隔 1 天（gap=2）+ 有券 → 消耗保护券，连胜保住", async () => {
    // 7-26 学习，7-27 断签，7-28 来补 → gap=2，消耗保护券
    const d1 = todayLocalDate(new Date("2026-07-26T12:00:00Z"));
    await recordStudy(d1, { newCount: 1, reviewCount: 0, correctCount: 1 });
    // streak=1, shields=1（默认）
    const d3 = todayLocalDate(new Date("2026-07-28T12:00:00Z"));
    const result = await recordStudy(d3, {
      newCount: 1,
      reviewCount: 0,
      correctCount: 1,
    });
    // gap=2 → 消耗保护券，连胜保住：1 + 1 = 2
    expect(result.shieldConsumed).toBe(true);
    expect(result.currentStreak).toBe(2);
    const shield = await getShield();
    expect(shield.shields).toBe(0); // 1 - 1 = 0
    expect(shield.totalUsed).toBe(1);
  });

  test("隔 1 天（gap=2）+ 无券 → 不消耗，连胜重置", async () => {
    const d1 = todayLocalDate(new Date("2026-07-25T12:00:00Z"));
    await recordStudy(d1, { newCount: 1, reviewCount: 0, correctCount: 1 });
    // 手动清空保护券
    const { setItem } = await import("@/lib/storage/db");
    await setItem("gamification:shield", {
      shields: 0,
      lastEarnedDate: null,
      lastUsedDate: null,
      totalUsed: 0,
    });
    const d2 = todayLocalDate(new Date("2026-07-27T12:00:00Z"));
    const result = await recordStudy(d2, {
      newCount: 1,
      reviewCount: 0,
      correctCount: 1,
    });
    // gap=2 但无券 → 不消耗，连胜重置
    expect(result.shieldConsumed).toBe(false);
    expect(result.currentStreak).toBe(1);
  });

  test("连续次日（gap=1）→ 不消耗保护券", async () => {
    const d1 = todayLocalDate(new Date("2026-07-26T12:00:00Z"));
    const d2 = todayLocalDate(new Date("2026-07-27T12:00:00Z"));
    await recordStudy(d1, { newCount: 1, reviewCount: 0, correctCount: 1 });
    const result = await recordStudy(d2, {
      newCount: 1,
      reviewCount: 0,
      correctCount: 1,
    });
    // gap=1 → 连续次日，不消耗保护券
    expect(result.shieldConsumed).toBe(false);
    expect(result.currentStreak).toBe(2);
    const shield = await getShield();
    expect(shield.shields).toBe(1); // 不变
  });

  test("隔 2 天（gap=3）→ 不消耗（保护券仅保单日），连胜重置", async () => {
    const d1 = todayLocalDate(new Date("2026-07-25T12:00:00Z"));
    await recordStudy(d1, { newCount: 1, reviewCount: 0, correctCount: 1 });
    const d2 = todayLocalDate(new Date("2026-07-28T12:00:00Z"));
    const result = await recordStudy(d2, {
      newCount: 1,
      reviewCount: 0,
      correctCount: 1,
    });
    // gap=3 → 保护券不消耗，连胜重置
    expect(result.shieldConsumed).toBe(false);
    expect(result.currentStreak).toBe(1);
  });

  test("连胜达到 7 的倍数 → 自动补充保护券", async () => {
    // 构造 streak=6，再 +1 = 7
    const d1 = todayLocalDate(new Date("2026-07-21T12:00:00Z"));
    await recordStudy(d1, { newCount: 1, reviewCount: 0, correctCount: 1 });
    // 模拟连续 6 天学习（写入 streak.currentStreak=6）
    const { setItem } = await import("@/lib/storage/db");
    await setItem("settings:streak", {
      currentStreak: 6,
      longestStreak: 6,
      lastReviewDate: d1,
    });
    // 第 7 天学习（连续次日 gap=1，不消耗保护券）
    const d2 = todayLocalDate(new Date("2026-07-22T12:00:00Z"));
    const result = await recordStudy(d2, {
      newCount: 1,
      reviewCount: 0,
      correctCount: 1,
    });
    expect(result.currentStreak).toBe(7);
    expect(result.shieldEarned).toBe(true);
    // 保护券应从 1 → 2（默认 1 张 + 补充 1 张 = 2，上限）
    const shield = await getShield();
    expect(shield.shields).toBe(2);
  });

  test("已持有 2 张上限 → 不再补充", async () => {
    const d1 = todayLocalDate(new Date("2026-07-21T12:00:00Z"));
    await recordStudy(d1, { newCount: 1, reviewCount: 0, correctCount: 1 });
    const { setItem } = await import("@/lib/storage/db");
    await setItem("settings:streak", {
      currentStreak: 6,
      longestStreak: 6,
      lastReviewDate: d1,
    });
    // 把保护券手动设为 2（上限）
    await setItem("gamification:shield", {
      shields: 2,
      lastEarnedDate: null,
      lastUsedDate: null,
      totalUsed: 0,
    });
    const d2 = todayLocalDate(new Date("2026-07-22T12:00:00Z"));
    const result = await recordStudy(d2, {
      newCount: 1,
      reviewCount: 0,
      correctCount: 1,
    });
    expect(result.currentStreak).toBe(7);
    expect(result.shieldEarned).toBe(false);
    const shield = await getShield();
    expect(shield.shields).toBe(2);
  });
});

describe("recordStudy — 学习日志持久化", () => {
  test("写入 log:{date}，含 newCount/reviewCount/correctCount/updatedAt", async () => {
    const today = todayLocalDate(new Date("2026-07-27T12:00:00Z"));
    await recordStudy(today, { newCount: 3, reviewCount: 5, correctCount: 7 });
    const stored = await getItem<StudyLog>(`log:${today}`);
    expect(stored).toBeDefined();
    expect(stored?.date).toBe(today);
    expect(stored?.newCount).toBe(3);
    expect(stored?.reviewCount).toBe(5);
    expect(stored?.correctCount).toBe(7);
    expect(stored?.updatedAt).toBeDefined();
  });

  test("同日累加：newCount/reviewCount/correctCount 累加", async () => {
    const today = todayLocalDate(new Date("2026-07-27T12:00:00Z"));
    await recordStudy(today, { newCount: 2, reviewCount: 1, correctCount: 2 });
    await recordStudy(today, { newCount: 1, reviewCount: 3, correctCount: 3 });
    const log = await getStudyLog(today);
    expect(log?.newCount).toBe(3);
    expect(log?.reviewCount).toBe(4);
    expect(log?.correctCount).toBe(5);
  });
});

describe("getStudyLog", () => {
  test("未记录的日期返回 undefined", async () => {
    const log = await getStudyLog("2026-07-27");
    expect(log).toBeUndefined();
  });
});

describe("listStudyLogs — 热力图数据源", () => {
  test("返回所有 log: 前缀记录", async () => {
    const d1 = todayLocalDate(new Date("2026-07-26T12:00:00Z"));
    const d2 = todayLocalDate(new Date("2026-07-27T12:00:00Z"));
    await recordStudy(d1, { newCount: 1, reviewCount: 0, correctCount: 1 });
    await recordStudy(d2, { newCount: 2, reviewCount: 1, correctCount: 2 });

    const logs = await listStudyLogs();
    expect(logs).toHaveLength(2);
    expect(logs.map((l) => l.date).sort()).toEqual([d1, d2].sort());
  });

  test("空库返回空数组", async () => {
    const logs = await listStudyLogs();
    expect(logs).toEqual([]);
  });

  test("正确率字段可由 reviewCount+newCount 与 correctCount 推导", async () => {
    const today = todayLocalDate(new Date("2026-07-27T12:00:00Z"));
    await recordStudy(today, { newCount: 2, reviewCount: 8, correctCount: 7 });
    const logs = await listStudyLogs();
    const total = logs[0].newCount + logs[0].reviewCount;
    const accuracy = total > 0 ? logs[0].correctCount / total : 0;
    expect(accuracy).toBeCloseTo(0.7, 2);
  });
});
