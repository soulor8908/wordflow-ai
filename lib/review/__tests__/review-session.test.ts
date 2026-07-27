// @vitest-environment jsdom
import { describe, test, expect, beforeEach } from "vitest";
import { submitReview } from "@/lib/review/review-session";
import { listDueCards } from "@/lib/review/today-queue";
import { favoriteWord, getFavoriteCard, cardKey } from "@/lib/review/favorite";
import { resetDbForTest, getItem } from "@/lib/storage/db";
import { createNewCard, type WordCard } from "@/lib/review/fsrs-scheduler";
import type { TodayQueueItem } from "@/lib/review/today-queue";

beforeEach(async () => {
  await resetDbForTest();
});

function dueItem(card: WordCard): TodayQueueItem {
  return { type: "due", card };
}

function newItem(word: string, source = "book:kaoyan-core"): TodayQueueItem {
  return { type: "new", word, source };
}

describe("submitReview — 到期卡片", () => {
  test("Good 评分 → 卡片更新，due 推迟到未来，wasNew=false", async () => {
    const now = new Date("2026-07-27T12:00:00Z");
    const card = createNewCard(now, "apple", "favorite");
    // 模拟已到期：due 设为过去
    const dueCard: WordCard = { ...card, due: new Date("2026-07-26T00:00:00.000Z") };

    const outcome = await submitReview(dueItem(dueCard), "Good", "standard", now);

    expect(outcome.wasNew).toBe(false);
    expect(outcome.word).toBe("apple");
    expect(outcome.rating).toBe("Good");
    expect(new Date(outcome.nextDue).getTime()).toBeGreaterThan(now.getTime());
  });

  test("Again 评分 → due 接近 now（短间隔重学）", async () => {
    const now = new Date("2026-07-27T12:00:00Z");
    const card = createNewCard(now, "apple", "favorite");
    const dueCard: WordCard = { ...card, due: new Date("2026-07-26T00:00:00.000Z") };

    const outcome = await submitReview(dueItem(dueCard), "Again", "standard", now);
    const dueMs = new Date(outcome.nextDue).getTime();
    expect(dueMs - now.getTime()).toBeLessThan(60 * 60 * 1000); // < 1h
  });

  test("持久化到 card:{word}，带 updatedAt（供同步 LWW）", async () => {
    const now = new Date("2026-07-27T12:00:00Z");
    const card = createNewCard(now, "apple", "favorite");
    const dueCard: WordCard = { ...card, due: new Date("2026-07-26T00:00:00.000Z") };

    await submitReview(dueItem(dueCard), "Good", "standard", now);
    const stored = await getItem<WordCard & { updatedAt?: string }>(
      cardKey("apple")
    );
    expect(stored).toBeDefined();
    expect(stored?.word).toBe("apple");
    expect(stored?.updatedAt).toBeDefined();
  });
});

describe("submitReview — 新词", () => {
  test("Good 评分 → 创建卡片并复习，wasNew=true，持久化", async () => {
    const now = new Date("2026-07-27T12:00:00Z");
    const outcome = await submitReview(newItem("abandon"), "Good", "standard", now);
    expect(outcome.wasNew).toBe(true);
    expect(outcome.word).toBe("abandon");
    expect(outcome.nextState).not.toBe("New"); // 复习后离开 New

    const stored = await getFavoriteCard("abandon");
    expect(stored).toBeDefined();
    expect(stored?.source).toBe("book:kaoyan-core");
  });

  test("Again 评分 → 创建卡片，due 接近 now", async () => {
    const now = new Date("2026-07-27T12:00:00Z");
    const outcome = await submitReview(newItem("test"), "Again", "standard", now);
    const dueMs = new Date(outcome.nextDue).getTime();
    expect(dueMs).toBeGreaterThanOrEqual(now.getTime());
    expect(dueMs - now.getTime()).toBeLessThan(60 * 60 * 1000);
  });

  test("key 大小写无关：new item 'Abandon' → 存于 card:abandon", async () => {
    const now = new Date("2026-07-27T12:00:00Z");
    await submitReview(newItem("Abandon"), "Good", "standard", now);
    const stored = await getFavoriteCard("abandon");
    expect(stored).toBeDefined();
    expect(stored?.word).toBe("abandon");
  });
});

describe("submitReview — 与收藏共存", () => {
  test("已收藏的词（New 卡）再作为新词复习 → 覆盖为复习后状态，不产生重复卡", async () => {
    const now = new Date("2026-07-27T12:00:00Z");
    await favoriteWord("abandon", "favorite");
    // 该词出现在今日新词队列（理论上 book-queue 会排除已有卡片，这里直接测覆盖语义）
    await submitReview(newItem("abandon", "book:kaoyan-core"), "Good", "standard", now);
    const stored = await getFavoriteCard("abandon");
    expect(stored).toBeDefined();
    expect(stored?.state).not.toBe("New");
  });
});

describe("listDueCards — I/O", () => {
  test("返回 card: 前缀中 due <= now 的卡片", async () => {
    // favoriteWord 创建 New 卡 due=now（用真实时间），用更晚的查询时间确保到期
    await favoriteWord("apple");
    const queryTime = new Date(Date.now() + 60_000);
    const due = await listDueCards(queryTime);
    expect(due).toHaveLength(1);
    expect(due[0].word).toBe("apple");
  });

  test("未到期的卡片不返回", async () => {
    const now = new Date("2026-07-27T12:00:00Z");
    // 复习一张新卡使其 due 推到未来
    const card = createNewCard(now, "apple", "favorite");
    const dueCard: WordCard = { ...card, due: new Date("2026-07-26T00:00:00.000Z") };
    await submitReview({ type: "due", card: dueCard }, "Easy", "aggressive", now);
    // 现在 due 在未来，查 now 不应返回
    const due = await listDueCards(now);
    expect(due).toHaveLength(0);
  });

  test("空库 → 空数组", async () => {
    const due = await listDueCards(new Date());
    expect(due).toEqual([]);
  });
});
