// @vitest-environment jsdom
import { describe, test, expect, beforeEach } from "vitest";
import {
  isFavorited,
  favoriteWord,
  unfavoriteWord,
  getFavoriteCard,
} from "@/lib/review/favorite";
import { resetDbForTest } from "@/lib/storage/db";

beforeEach(async () => {
  await resetDbForTest();
});

describe("favoriteWord", () => {
  test("creates FSRS card with New state and due=now, stored at card:{word}", async () => {
    const card = await favoriteWord("abandon", "book:kaoyan");
    expect(card.word).toBe("abandon");
    expect(card.source).toBe("book:kaoyan");
    expect(card.state).toBe("New");
    expect(card.verification).toBe("unverified");
    // due 应是当前时间附近（now）
    expect(new Date(card.due).getTime()).toBeLessThanOrEqual(Date.now() + 1000);
  });

  test("stores card in Dexie at key card:{word}", async () => {
    await favoriteWord("abandon");
    const stored = await getFavoriteCard("abandon");
    expect(stored).toBeDefined();
    expect(stored?.word).toBe("abandon");
  });

  test("includes updatedAt for sync (LWW)", async () => {
    const card = await favoriteWord("abandon");
    expect(card.updatedAt).toBeDefined();
    // value 层也应带 updatedAt（setItem 会提取到索引，但 value 内也保留）
    const stored = await getFavoriteCard("abandon");
    expect(stored?.updatedAt).toBe(card.updatedAt);
  });

  test("idempotent: favoriting same word twice overwrites (no duplicate)", async () => {
    await favoriteWord("abandon");
    await favoriteWord("abandon");
    const favorited = await isFavorited("abandon");
    expect(favorited).toBe(true);
    // countByPrefix 应为 1
    const { countByPrefix } = await import("@/lib/storage/db");
    expect(await countByPrefix("card:")).toBe(1);
  });

  test("default source is 'favorite' when not specified", async () => {
    const card = await favoriteWord("test");
    expect(card.source).toBe("favorite");
  });
});

describe("isFavorited", () => {
  test("returns false before favoriting", async () => {
    expect(await isFavorited("abandon")).toBe(false);
  });

  test("returns true after favoriting", async () => {
    await favoriteWord("abandon");
    expect(await isFavorited("abandon")).toBe(true);
  });

  test("case-insensitive lookup", async () => {
    await favoriteWord("abandon");
    expect(await isFavorited("ABANDON")).toBe(true);
    expect(await isFavorited("Abandon")).toBe(true);
  });
});

describe("unfavoriteWord", () => {
  test("removes card from Dexie", async () => {
    await favoriteWord("abandon");
    expect(await isFavorited("abandon")).toBe(true);
    await unfavoriteWord("abandon");
    expect(await isFavorited("abandon")).toBe(false);
  });

  test("no-op when word not favorited", async () => {
    await expect(unfavoriteWord("never-favorited")).resolves.toBeUndefined();
  });
});

describe("getFavoriteCard", () => {
  test("returns undefined when not favorited", async () => {
    expect(await getFavoriteCard("abandon")).toBeUndefined();
  });

  test("returns card with word/source/state", async () => {
    await favoriteWord("abandon", "book:kaoyan");
    const card = await getFavoriteCard("abandon");
    expect(card?.word).toBe("abandon");
    expect(card?.source).toBe("book:kaoyan");
    expect(card?.state).toBe("New");
  });
});
