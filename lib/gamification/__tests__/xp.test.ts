import { describe, test, expect } from "vitest";
import {
  levelFromXp,
  nextLevel,
  xpToNextLevel,
  addXp,
  xpForReview,
  xpFromStudyLogs,
  LEVELS,
} from "@/lib/gamification/xp";
import type { StudyLog } from "@/lib/stats/streak-io";

describe("levelFromXp", () => {
  test("0 XP → 萌新", () => {
    expect(levelFromXp(0).name).toBe("萌新");
    expect(levelFromXp(0).tier).toBe(1);
  });

  test("99 XP → 萌新（边界）", () => {
    expect(levelFromXp(99).name).toBe("萌新");
  });

  test("100 XP → 学徒", () => {
    expect(levelFromXp(100).name).toBe("学徒");
    expect(levelFromXp(100).tier).toBe(2);
  });

  test("499 XP → 学徒（边界）", () => {
    expect(levelFromXp(499).name).toBe("学徒");
  });

  test("500 XP → 行家", () => {
    expect(levelFromXp(500).name).toBe("行家");
  });

  test("2000 XP → 达人", () => {
    expect(levelFromXp(2000).name).toBe("达人");
  });

  test("5000 XP → 词神", () => {
    expect(levelFromXp(5000).name).toBe("词神");
  });

  test("99999 XP → 词神（已最高级）", () => {
    expect(levelFromXp(99999).name).toBe("词神");
  });
});

describe("nextLevel / xpToNextLevel", () => {
  test("0 XP → 下一级学徒，差 100", () => {
    expect(nextLevel(0)?.name).toBe("学徒");
    expect(xpToNextLevel(0)).toBe(100);
  });

  test("100 XP → 下一级行家，差 400", () => {
    expect(nextLevel(100)?.name).toBe("行家");
    expect(xpToNextLevel(100)).toBe(400);
  });

  test("5000 XP → 已最高级，无下一级", () => {
    expect(nextLevel(5000)).toBeNull();
    expect(xpToNextLevel(5000)).toBe(0);
  });
});

describe("addXp", () => {
  test("正常增加", () => {
    const state = { total: 100, lastSyncedDate: "2026-07-27" };
    const next = addXp(state, 30);
    expect(next.total).toBe(130);
    expect(next.lastSyncedDate).toBe("2026-07-27");
  });

  test("减少时不会变成负数", () => {
    const state = { total: 10, lastSyncedDate: null };
    const next = addXp(state, -50);
    expect(next.total).toBe(0);
  });
});

describe("xpForReview", () => {
  test("新词 + Easy = 10 + 8 = 18", () => {
    expect(xpForReview("Easy", true)).toBe(18);
  });

  test("新词 + Good = 10 + 5 = 15", () => {
    expect(xpForReview("Good", true)).toBe(15);
  });

  test("复习 + Good = 0 + 5 = 5", () => {
    expect(xpForReview("Good", false)).toBe(5);
  });

  test("复习 + Again = 0 + 1 = 1", () => {
    expect(xpForReview("Again", false)).toBe(1);
  });
});

describe("xpFromStudyLogs", () => {
  test("空日志 → 0 XP", () => {
    expect(xpFromStudyLogs([])).toBe(0);
  });

  test("单条日志：新学 3 + 答对 7 + 答错 1 = 3*10 + 7*5 + 1*1 = 66", () => {
    const logs: StudyLog[] = [
      {
        date: "2026-07-27",
        newCount: 3,
        reviewCount: 8,
        correctCount: 7,
        updatedAt: "2026-07-27T12:00:00Z",
      },
    ];
    expect(xpFromStudyLogs(logs)).toBe(66);
  });

  test("多条日志累加", () => {
    const logs: StudyLog[] = [
      { date: "2026-07-26", newCount: 5, reviewCount: 0, correctCount: 5, updatedAt: "" },
      { date: "2026-07-27", newCount: 2, reviewCount: 3, correctCount: 4, updatedAt: "" },
    ];
    // 日1: 5*10 + 5*5 + 0*1 = 75
    // 日2: 2*10 + 4*5 + max(0,3-4)*1 = 20 + 20 + 0 = 40
    // 总: 115
    expect(xpFromStudyLogs(logs)).toBe(115);
  });

  test("correctCount > reviewCount 时不会变成负数 XP", () => {
    const logs: StudyLog[] = [
      { date: "2026-07-27", newCount: 0, reviewCount: 2, correctCount: 5, updatedAt: "" },
    ];
    // wrong = max(0, 2-5) = 0
    // XP = 0 + 5*5 + 0 = 25
    expect(xpFromStudyLogs(logs)).toBe(25);
  });
});

describe("LEVELS 常量", () => {
  test("5 个等级，tier 1-5 递增", () => {
    expect(LEVELS).toHaveLength(5);
    expect(LEVELS.map((l) => l.tier)).toEqual([1, 2, 3, 4, 5]);
  });

  test("等级边界连续：前一级 max === 下一级 min", () => {
    for (let i = 0; i < LEVELS.length - 1; i++) {
      expect(LEVELS[i].max).toBe(LEVELS[i + 1].min);
    }
  });
});
