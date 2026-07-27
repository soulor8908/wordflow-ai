// @vitest-environment jsdom
import { describe, test, expect, beforeEach } from "vitest";
import {
  getItem,
  setItem,
  delItem,
  countDueCards,
  listItemsByPrefix,
  countByPrefix,
} from "@/lib/storage/db";

beforeEach(async () => {
  const { resetDbForTest } = await import("@/lib/storage/db");
  await resetDbForTest();
});

describe("getItem / setItem", () => {
  test("setItem stores value and getItem retrieves it", async () => {
    await setItem("card:abandon", { word: "abandon", due: "2026-01-01" });
    const value = await getItem("card:abandon");
    expect(value).toEqual({ word: "abandon", due: "2026-01-01" });
  });

  test("getItem returns undefined for missing key", async () => {
    const value = await getItem("card:nonexistent");
    expect(value).toBeUndefined();
  });

  test("setItem with updatedAt extracts it to index field", async () => {
    await setItem("card:test", { word: "test", updatedAt: "2026-07-27T00:00:00Z" });
    const { getDb } = await import("@/lib/storage/db");
    const db = await getDb();
    const record = await db.kv.get("card:test");
    expect(record?.updatedAt).toBe("2026-07-27T00:00:00Z");
  });

  test("setItem with due extracts it to dueAt index field", async () => {
    await setItem("card:test", { word: "test", due: "2026-07-28T00:00:00Z" });
    const { getDb } = await import("@/lib/storage/db");
    const db = await getDb();
    const record = await db.kv.get("card:test");
    expect(record?.dueAt).toBe("2026-07-28T00:00:00Z");
  });

  test("setItem with due as Date object extracts ISO string to dueAt (ts-fsrs 兼容)", async () => {
    const dueDate = new Date("2026-07-28T00:00:00Z");
    await setItem("card:dt", { word: "dt", due: dueDate });
    const { getDb } = await import("@/lib/storage/db");
    const db = await getDb();
    const record = await db.kv.get("card:dt");
    expect(record?.dueAt).toBe(dueDate.toISOString());
  });
});

describe("delItem", () => {
  test("delItem removes the key", async () => {
    await setItem("card:abandon", { word: "abandon" });
    await delItem("card:abandon");
    const value = await getItem("card:abandon");
    expect(value).toBeUndefined();
  });
});

describe("countDueCards", () => {
  test("returns count of cards with due <= now (uses dueAt index)", async () => {
    const now = "2026-07-27T12:00:00Z";
    await setItem("card:past1", { word: "past1", due: "2026-07-26T00:00:00Z" });
    await setItem("card:past2", { word: "past2", due: "2026-07-27T00:00:00Z" });
    await setItem("card:future1", { word: "future1", due: "2026-07-28T00:00:00Z" });
    await setItem("card:future2", { word: "future2", due: "2026-07-29T00:00:00Z" });

    const count = await countDueCards(now);
    expect(count).toBe(2);
  });

  test("returns 0 when no cards are due", async () => {
    const count = await countDueCards("2026-07-27T12:00:00Z");
    expect(count).toBe(0);
  });

  test("ignores non-card keys (log/book/etc)", async () => {
    const now = "2026-07-27T12:00:00Z";
    await setItem("log:2026-07-27", { due: "2026-07-26T00:00:00Z" });
    await setItem("book:kaoyan", { due: "2026-07-26T00:00:00Z" });
    await setItem("card:due", { word: "due", due: "2026-07-26T00:00:00Z" });

    const count = await countDueCards(now);
    expect(count).toBe(1);
  });
});

describe("listItemsByPrefix", () => {
  test("returns all items with given prefix", async () => {
    await setItem("card:abandon", { word: "abandon" });
    await setItem("card:ability", { word: "ability" });
    await setItem("log:today", { count: 10 });

    const cards = await listItemsByPrefix<{ word: string }>("card:");
    expect(cards).toHaveLength(2);
    expect(cards.map((c) => c.word).sort()).toEqual(["abandon", "ability"]);
  });

  test("respects limit parameter", async () => {
    await setItem("card:a", { word: "a" });
    await setItem("card:b", { word: "b" });
    await setItem("card:c", { word: "c" });

    const cards = await listItemsByPrefix("card:", 2);
    expect(cards).toHaveLength(2);
  });
});

describe("countByPrefix", () => {
  test("returns count of items with given prefix", async () => {
    await setItem("card:a", { word: "a" });
    await setItem("card:b", { word: "b" });
    await setItem("log:today", { count: 10 });

    expect(await countByPrefix("card:")).toBe(2);
    expect(await countByPrefix("log:")).toBe(1);
    expect(await countByPrefix("settings:")).toBe(0);
  });
});
