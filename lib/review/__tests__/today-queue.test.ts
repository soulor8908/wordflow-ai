import { describe, test, expect } from "vitest";
import {
  buildTodayQueue,
  type BuildTodayQueueInput,
} from "@/lib/review/today-queue";
import type { WordCard } from "@/lib/review/fsrs-scheduler";

/** 构造最小合法 WordCard（仅覆盖合并逻辑所需字段） */
function makeCard(overrides: Partial<WordCard> & { word: string }): WordCard {
  return {
    due: new Date("2026-07-27T00:00:00.000Z"),
    stability: 0,
    difficulty: 0,
    elapsed_days: 0,
    scheduled_days: 0,
    reps: 1,
    lapses: 0,
    state: "Review",
    last_review: new Date("2026-07-26T00:00:00.000Z"),
    source: "favorite",
    verification: "unverified",
    ...overrides,
  };
}

const baseInput: Omit<BuildTodayQueueInput, "dueCards" | "newWordCandidates"> = {
  dailyNewLimit: 20,
};

describe("buildTodayQueue — 空输入", () => {
  test("空 due + 空 new → 空队列", () => {
    const q = buildTodayQueue({
      ...baseInput,
      dueCards: [],
      newWordCandidates: [],
    });
    expect(q).toEqual([]);
  });
});

describe("buildTodayQueue — 仅到期卡片", () => {
  test("返回 due 项，按 due 升序（最逾期的在前）", () => {
    const a = makeCard({ word: "apple", due: new Date("2026-07-27T08:00:00.000Z") });
    const b = makeCard({ word: "banana", due: new Date("2026-07-26T08:00:00.000Z") }); // 更早 → 更逾期
    const q = buildTodayQueue({
      ...baseInput,
      dueCards: [a, b],
      newWordCandidates: [],
    });
    expect(q).toHaveLength(2);
    expect(q[0]).toEqual({ type: "due", card: b });
    expect(q[1]).toEqual({ type: "due", card: a });
  });
});

describe("buildTodayQueue — 仅新词", () => {
  test("dailyNewLimit 足够时，按候选顺序返回全部新词", () => {
    const q = buildTodayQueue({
      ...baseInput,
      dueCards: [],
      newWordCandidates: [
        { word: "abandon", source: "book:kaoyan" },
        { word: "ability", source: "book:kaoyan" },
      ],
    });
    expect(q).toEqual([
      { type: "new", word: "abandon", source: "book:kaoyan" },
      { type: "new", word: "ability", source: "book:kaoyan" },
    ]);
  });

  test("新词超过 dailyNewLimit → 截断到 limit", () => {
    const q = buildTodayQueue({
      ...baseInput,
      dailyNewLimit: 2,
      dueCards: [],
      newWordCandidates: [
        { word: "a", source: "book:x" },
        { word: "b", source: "book:x" },
        { word: "c", source: "book:x" },
        { word: "d", source: "book:x" },
      ],
    });
    expect(q).toHaveLength(2);
    expect(q[0]).toMatchObject({ word: "a" });
    expect(q[1]).toMatchObject({ word: "b" });
  });

  test("dailyNewLimit = 0 → 不引入新词", () => {
    const q = buildTodayQueue({
      ...baseInput,
      dailyNewLimit: 0,
      dueCards: [],
      newWordCandidates: [{ word: "a", source: "book:x" }],
    });
    expect(q).toEqual([]);
  });
});

describe("buildTodayQueue — 去重", () => {
  test("新词与到期卡片同词（大小写无关）→ 新词被排除，避免重复卡", () => {
    const due = makeCard({ word: "Abandon", due: new Date("2026-07-27T00:00:00.000Z") });
    const q = buildTodayQueue({
      ...baseInput,
      dueCards: [due],
      newWordCandidates: [{ word: "abandon", source: "book:kaoyan" }],
    });
    expect(q).toEqual([{ type: "due", card: due }]);
  });

  test("新词列表内部重复（大小写无关）→ 仅保留首个", () => {
    const q = buildTodayQueue({
      ...baseInput,
      dueCards: [],
      newWordCandidates: [
        { word: "Abandon", source: "book:kaoyan" },
        { word: "abandon", source: "book:kaoyan" },
      ],
    });
    expect(q).toHaveLength(1);
    expect(q[0]).toMatchObject({ word: "Abandon" });
  });
});

describe("buildTodayQueue — 合并顺序", () => {
  test("到期卡片在前，新词在后（先复习逾期，再学新词）", () => {
    const due = makeCard({ word: "apple", due: new Date("2026-07-26T00:00:00.000Z") });
    const q = buildTodayQueue({
      ...baseInput,
      dueCards: [due],
      newWordCandidates: [{ word: "banana", source: "book:kaoyan" }],
    });
    expect(q[0]).toEqual({ type: "due", card: due });
    expect(q[1]).toEqual({ type: "new", word: "banana", source: "book:kaoyan" });
  });

  test("去重后再截断 dailyNewLimit（不把被去重的算进配额）", () => {
    const due = makeCard({ word: "abandon", due: new Date("2026-07-26T00:00:00.000Z") });
    const q = buildTodayQueue({
      ...baseInput,
      dailyNewLimit: 2,
      dueCards: [due],
      newWordCandidates: [
        { word: "abandon", source: "book:kaoyan" }, // 去重，不占配额
        { word: "ability", source: "book:kaoyan" },
        { word: "access", source: "book:kaoyan" },
      ],
    });
    expect(q).toHaveLength(3); // 1 due + 2 new
    expect(q.filter((i) => i.type === "new")).toHaveLength(2);
  });
});
