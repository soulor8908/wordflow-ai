import { describe, test, expect } from "vitest";
import {
  pickNewWordsFromBook,
  type PickNewWordsInput,
} from "@/lib/review/book-queue";

const baseInput: Omit<
  PickNewWordsInput,
  "bookWords" | "cursor" | "dailyNew" | "existingCardWords" | "today"
> = {};

describe("pickNewWordsFromBook — 全新词书", () => {
  test("从 cursor=0 起，返回 dailyNew 个候选词", () => {
    const r = pickNewWordsFromBook({
      ...baseInput,
      bookWords: ["abandon", "ability", "access", "adapt", "accept"],
      cursor: 0,
      dailyNew: 3,
      existingCardWords: new Set<string>(),
      today: "2026-07-27",
    });
    expect(r.candidates.map((c) => c.word)).toEqual([
      "abandon",
      "ability",
      "access",
    ]);
    expect(r.nextCursor).toBe(3);
    expect(r.nextLastAdvancedDate).toBe("2026-07-27");
    expect(r.alreadyIssuedToday).toBe(false);
  });

  test("candidates 带 source = book:{bookId}", () => {
    const r = pickNewWordsFromBook({
      ...baseInput,
      bookId: "kaoyan-core",
      bookWords: ["abandon"],
      cursor: 0,
      dailyNew: 1,
      existingCardWords: new Set<string>(),
      today: "2026-07-27",
    });
    expect(r.candidates[0].source).toBe("book:kaoyan-core");
  });
});

describe("pickNewWordsFromBook — 游标推进", () => {
  test("从中间 cursor 起，返回后续词", () => {
    const r = pickNewWordsFromBook({
      ...baseInput,
      bookWords: ["a", "b", "c", "d", "e"],
      cursor: 2,
      dailyNew: 2,
      existingCardWords: new Set<string>(),
      today: "2026-07-27",
    });
    expect(r.candidates.map((c) => c.word)).toEqual(["c", "d"]);
    expect(r.nextCursor).toBe(4);
  });
});

describe("pickNewWordsFromBook — 排除已有卡片", () => {
  test("已有卡片的词被跳过，cursor 仍推进（避免每日重复扫描）", () => {
    // "b" 已有卡片（如收藏过），跳过；仍凑够 dailyNew=2
    const r = pickNewWordsFromBook({
      ...baseInput,
      bookWords: ["a", "b", "c", "d"],
      cursor: 0,
      dailyNew: 2,
      existingCardWords: new Set(["b"]),
      today: "2026-07-27",
    });
    expect(r.candidates.map((c) => c.word)).toEqual(["a", "c"]);
    expect(r.nextCursor).toBe(3); // 扫过 a,b,c
  });

  test("排除大小写无关", () => {
    const r = pickNewWordsFromBook({
      ...baseInput,
      bookWords: ["Abandon", "ability"],
      cursor: 0,
      dailyNew: 2,
      existingCardWords: new Set(["abandon"]),
      today: "2026-07-27",
    });
    expect(r.candidates.map((c) => c.word)).toEqual(["ability"]);
    expect(r.nextCursor).toBe(2);
  });
});

describe("pickNewWordsFromBook — 每日配额去重", () => {
  test("lastAdvancedDate === today → 当日已发放，返回空且 cursor 不变", () => {
    const r = pickNewWordsFromBook({
      ...baseInput,
      bookWords: ["a", "b", "c"],
      cursor: 3,
      dailyNew: 2,
      existingCardWords: new Set<string>(),
      today: "2026-07-27",
      lastAdvancedDate: "2026-07-27",
    });
    expect(r.candidates).toEqual([]);
    expect(r.nextCursor).toBe(3); // 不变
    expect(r.alreadyIssuedToday).toBe(true);
    expect(r.nextLastAdvancedDate).toBe("2026-07-27");
  });

  test("lastAdvancedDate < today → 发放新一批", () => {
    const r = pickNewWordsFromBook({
      ...baseInput,
      bookWords: ["a", "b", "c", "d"],
      cursor: 2,
      dailyNew: 2,
      existingCardWords: new Set<string>(),
      today: "2026-07-27",
      lastAdvancedDate: "2026-07-26",
    });
    expect(r.candidates.map((c) => c.word)).toEqual(["c", "d"]);
    expect(r.nextCursor).toBe(4);
    expect(r.alreadyIssuedToday).toBe(false);
  });
});

describe("pickNewWordsFromBook — 词书耗尽", () => {
  test("cursor >= length → 返回空，标记当日已处理（避免每日重复扫描）", () => {
    const r = pickNewWordsFromBook({
      ...baseInput,
      bookWords: ["a", "b"],
      cursor: 2,
      dailyNew: 2,
      existingCardWords: new Set<string>(),
      today: "2026-07-27",
    });
    expect(r.candidates).toEqual([]);
    expect(r.nextCursor).toBe(2);
    expect(r.nextLastAdvancedDate).toBe("2026-07-27");
    expect(r.alreadyIssuedToday).toBe(false);
  });

  test("剩余词不足 dailyNew → 返回全部剩余", () => {
    const r = pickNewWordsFromBook({
      ...baseInput,
      bookWords: ["a", "b", "c"],
      cursor: 2,
      dailyNew: 5,
      existingCardWords: new Set<string>(),
      today: "2026-07-27",
    });
    expect(r.candidates.map((c) => c.word)).toEqual(["c"]);
    expect(r.nextCursor).toBe(3);
  });
});
