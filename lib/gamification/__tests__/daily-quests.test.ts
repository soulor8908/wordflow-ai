import { describe, test, expect } from "vitest";
import {
  createDailyQuest,
  bumpReviewQuest,
  markSearchedQuest,
  isReviewDone,
  isCorrectDone,
  isSearchedDone,
  completedCount,
  isAllComplete,
  claimCompleteBonus,
  describeProgress,
} from "@/lib/gamification/daily-quests";
import { QUEST_CORRECT_TARGET, QUEST_REVIEW_BASE } from "@/lib/gamification/types";

describe("createDailyQuest", () => {
  test("队列 20 张 → 目标 10（基准）", () => {
    const q = createDailyQuest("2026-07-27", 20);
    expect(q.reviewed).toBe(0);
    expect(q.correct).toBe(0);
    expect(q.searched).toBe(false);
    expect(q.claimed).toBe(false);
    expect(q.reviewTarget).toBe(QUEST_REVIEW_BASE);
    expect(q.correctTarget).toBe(QUEST_CORRECT_TARGET);
  });

  test("队列 0 张 → 目标 1（避免任务永远完不成）", () => {
    const q = createDailyQuest("2026-07-27", 0);
    expect(q.reviewTarget).toBe(1);
  });

  test("队列 1 张 → 目标 1", () => {
    const q = createDailyQuest("2026-07-27", 1);
    expect(q.reviewTarget).toBe(1);
  });

  test("队列 4 张 → 目标 2（队列/2 向下取整）", () => {
    const q = createDailyQuest("2026-07-27", 4);
    expect(q.reviewTarget).toBe(2);
  });

  test("队列 30 张 → 目标 10（不超过基准）", () => {
    const q = createDailyQuest("2026-07-27", 30);
    expect(q.reviewTarget).toBe(10);
  });
});

describe("bumpReviewQuest", () => {
  test("评分 Good → reviewed +1, correct +1", () => {
    const q = createDailyQuest("2026-07-27", 20);
    const next = bumpReviewQuest(q, "Good");
    expect(next.reviewed).toBe(1);
    expect(next.correct).toBe(1);
  });

  test("评分 Easy → reviewed +1, correct +1", () => {
    const q = createDailyQuest("2026-07-27", 20);
    const next = bumpReviewQuest(q, "Easy");
    expect(next.reviewed).toBe(1);
    expect(next.correct).toBe(1);
  });

  test("评分 Hard → reviewed +1, correct +0", () => {
    const q = createDailyQuest("2026-07-27", 20);
    const next = bumpReviewQuest(q, "Hard");
    expect(next.reviewed).toBe(1);
    expect(next.correct).toBe(0);
  });

  test("评分 Again → reviewed +1, correct +0", () => {
    const q = createDailyQuest("2026-07-27", 20);
    const next = bumpReviewQuest(q, "Again");
    expect(next.reviewed).toBe(1);
    expect(next.correct).toBe(0);
  });
});

describe("markSearchedQuest", () => {
  test("首次标记 → searched = true", () => {
    const q = createDailyQuest("2026-07-27", 20);
    const next = markSearchedQuest(q);
    expect(next.searched).toBe(true);
  });

  test("重复标记 → 幂等", () => {
    const q = { ...createDailyQuest("2026-07-27", 20), searched: true };
    const next = markSearchedQuest(q);
    expect(next.searched).toBe(true);
    expect(next).toEqual(q);
  });
});

describe("任务完成判定", () => {
  test("复习目标达成", () => {
    const q = { ...createDailyQuest("2026-07-27", 20), reviewed: 10 };
    expect(isReviewDone(q)).toBe(true);
  });

  test("复习目标未达成", () => {
    const q = { ...createDailyQuest("2026-07-27", 20), reviewed: 9 };
    expect(isReviewDone(q)).toBe(false);
  });

  test("答对目标达成", () => {
    const q = { ...createDailyQuest("2026-07-27", 20), correct: 15 };
    expect(isCorrectDone(q)).toBe(true);
  });

  test("查词目标达成", () => {
    const q = { ...createDailyQuest("2026-07-27", 20), searched: true };
    expect(isSearchedDone(q)).toBe(true);
  });

  test("三任务全完成 → completedCount = 3, isAllComplete = true", () => {
    const q = {
      ...createDailyQuest("2026-07-27", 20),
      reviewed: 10,
      correct: 15,
      searched: true,
    };
    expect(completedCount(q)).toBe(3);
    expect(isAllComplete(q)).toBe(true);
  });

  test("仅完成 2 个 → isAllComplete = false", () => {
    const q = {
      ...createDailyQuest("2026-07-27", 20),
      reviewed: 10,
      correct: 15,
      searched: false,
    };
    expect(completedCount(q)).toBe(2);
    expect(isAllComplete(q)).toBe(false);
  });
});

describe("claimCompleteBonus", () => {
  test("三任务全完成且未领取 → 发放 +30 XP", () => {
    const q = {
      ...createDailyQuest("2026-07-27", 20),
      reviewed: 10,
      correct: 15,
      searched: true,
      claimed: false,
    };
    const result = claimCompleteBonus(q);
    expect(result.bonus).toBe(30);
    expect(result.state.claimed).toBe(true);
  });

  test("三任务未全完成 → 不发放", () => {
    const q = {
      ...createDailyQuest("2026-07-27", 20),
      reviewed: 5,
      correct: 15,
      searched: true,
      claimed: false,
    };
    const result = claimCompleteBonus(q);
    expect(result.bonus).toBe(0);
    expect(result.state.claimed).toBe(false);
  });

  test("已领取过 → 不再发放（幂等）", () => {
    const q = {
      ...createDailyQuest("2026-07-27", 20),
      reviewed: 10,
      correct: 15,
      searched: true,
      claimed: true,
    };
    const result = claimCompleteBonus(q);
    expect(result.bonus).toBe(0);
  });
});

describe("describeProgress", () => {
  test("三任务全完成 → 进度 3/3, allDone = true", () => {
    const q = {
      ...createDailyQuest("2026-07-27", 20),
      reviewed: 10,
      correct: 15,
      searched: true,
    };
    const p = describeProgress(q);
    expect(p.completed).toBe(3);
    expect(p.total).toBe(3);
    expect(p.allDone).toBe(true);
    expect(p.reviewDone).toBe(true);
    expect(p.correctDone).toBe(true);
    expect(p.searchedDone).toBe(true);
  });

  test("全未完成 → 进度 0/3", () => {
    const q = createDailyQuest("2026-07-27", 20);
    const p = describeProgress(q);
    expect(p.completed).toBe(0);
    expect(p.allDone).toBe(false);
  });
});
