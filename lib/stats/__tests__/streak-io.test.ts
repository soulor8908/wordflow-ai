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

    const stored = await getStreak();
    expect(stored).toEqual(result);
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

  test("间隔 ≥2 天：重置 currentStreak=1", async () => {
    const d1 = todayLocalDate(new Date("2026-07-25T12:00:00Z"));
    const d2 = todayLocalDate(new Date("2026-07-27T12:00:00Z"));
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
