import { describe, test, expect } from "vitest";
import {
  computeStreak,
  type StreakState,
} from "@/lib/stats/streak";

describe("computeStreak", () => {
  test("first review today starts streak at 1", () => {
    const today = "2026-07-27";
    const result = computeStreak(undefined, today);
    expect(result.currentStreak).toBe(1);
    expect(result.longestStreak).toBe(1);
    expect(result.lastReviewDate).toBe(today);
  });

  test("reviewing consecutive day increments streak", () => {
    const prev: StreakState = {
      currentStreak: 3,
      longestStreak: 5,
      lastReviewDate: "2026-07-26",
    };
    const result = computeStreak(prev, "2026-07-27");
    expect(result.currentStreak).toBe(4);
    expect(result.longestStreak).toBe(5); // not exceeded yet
    expect(result.lastReviewDate).toBe("2026-07-27");
  });

  test("reviewing after a gap of 1 day resets streak to 1", () => {
    const prev: StreakState = {
      currentStreak: 5,
      longestStreak: 5,
      lastReviewDate: "2026-07-25",
    };
    const result = computeStreak(prev, "2026-07-27");
    expect(result.currentStreak).toBe(1);
    expect(result.longestStreak).toBe(5);
    expect(result.lastReviewDate).toBe("2026-07-27");
  });

  test("reviewing same day twice keeps streak unchanged (idempotent)", () => {
    const prev: StreakState = {
      currentStreak: 3,
      longestStreak: 5,
      lastReviewDate: "2026-07-27",
    };
    const result = computeStreak(prev, "2026-07-27");
    expect(result.currentStreak).toBe(3);
    expect(result.lastReviewDate).toBe("2026-07-27");
  });

  test("new streak exceeding longest updates longestStreak", () => {
    const prev: StreakState = {
      currentStreak: 5,
      longestStreak: 5,
      lastReviewDate: "2026-07-26",
    };
    const result = computeStreak(prev, "2026-07-27");
    expect(result.currentStreak).toBe(6);
    expect(result.longestStreak).toBe(6);
  });

  test("handles year boundary correctly", () => {
    const prev: StreakState = {
      currentStreak: 2,
      longestStreak: 2,
      lastReviewDate: "2026-12-31",
    };
    const result = computeStreak(prev, "2027-01-01");
    expect(result.currentStreak).toBe(3);
  });
});
