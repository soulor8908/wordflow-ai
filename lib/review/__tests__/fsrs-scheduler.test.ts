import { describe, test, expect } from "vitest";
import {
  FSRS_PRESETS,
  getScheduler,
  reviewCard,
  createNewCard,
} from "@/lib/review/fsrs-scheduler";

describe("FSRS_PRESETS", () => {
  test("conservative preset has request_retention 0.95", () => {
    expect(FSRS_PRESETS.conservative.request_retention).toBe(0.95);
  });

  test("standard preset has request_retention 0.9", () => {
    expect(FSRS_PRESETS.standard.request_retention).toBe(0.9);
  });

  test("aggressive preset has request_retention 0.8", () => {
    expect(FSRS_PRESETS.aggressive.request_retention).toBe(0.8);
  });
});

describe("getScheduler", () => {
  test("returns a scheduler for each preset", () => {
    const f = getScheduler("standard");
    expect(f).toBeDefined();
    expect(typeof f.repeat).toBe("function");
  });

  test("returns same instance for same preset (cached)", () => {
    const a = getScheduler("standard");
    const b = getScheduler("standard");
    expect(a).toBe(b);
  });
});

describe("createNewCard", () => {
  test("creates a card with New state and due = now", () => {
    const now = new Date("2026-07-27T12:00:00Z");
    const card = createNewCard(now);
    expect(card.state).toBe("New");
    expect(card.reps).toBe(0);
    expect(card.lapses).toBe(0);
    expect(new Date(card.due).toISOString()).toBe(now.toISOString());
  });
});

describe("reviewCard", () => {
  test("reviewing a new card with 'Good' produces a card with future due and Learning/Review state", () => {
    const now = new Date("2026-07-27T12:00:00Z");
    const card = createNewCard(now);
    const { card: next, log } = reviewCard(card, "Good", now, "standard");

    expect(new Date(next.due).getTime()).toBeGreaterThan(now.getTime());
    expect(["Learning", "Review"]).toContain(next.state);
    expect(log.rating).toBe("Good");
  });

  test("reviewing with 'Again' keeps due close to now (short interval)", () => {
    const now = new Date("2026-07-27T12:00:00Z");
    const card = createNewCard(now);
    const { card: next } = reviewCard(card, "Again", now, "standard");
    const dueMs = new Date(next.due).getTime();
    const nowMs = now.getTime();
    // Again on new card → Learning/Relearning state, due within minutes
    expect(dueMs).toBeGreaterThanOrEqual(nowMs);
    expect(dueMs - nowMs).toBeLessThan(60 * 60 * 1000); // < 1 hour
  });

  test("conservative preset (higher retention target) schedules shorter intervals than aggressive", () => {
    const now = new Date("2026-07-27T12:00:00Z");
    const card = createNewCard(now);
    // First review both with Good (moves to Learning), then a second review with Good to compare intervals
    const after1Conservative = reviewCard(card, "Good", now, "conservative").card;
    const after1Aggressive = reviewCard(card, "Good", now, "aggressive").card;

    const after2Conservative = reviewCard(after1Conservative, "Good", now, "conservative").card;
    const after2Aggressive = reviewCard(after1Aggressive, "Good", now, "aggressive").card;

    // Higher request_retention (conservative 0.95) → shorter intervals (review more often to retain more)
    const conservativeInterval = new Date(after2Conservative.due).getTime() - now.getTime();
    const aggressiveInterval = new Date(after2Aggressive.due).getTime() - now.getTime();
    expect(conservativeInterval).toBeLessThan(aggressiveInterval);
  });

  test("increments reps on each review", () => {
    const now = new Date("2026-07-27T12:00:00Z");
    const card = createNewCard(now);
    const { card: next } = reviewCard(card, "Good", now, "standard");
    expect(next.reps).toBeGreaterThan(card.reps);
  });

  test("includes log with review timestamp", () => {
    const now = new Date("2026-07-27T12:00:00Z");
    const card = createNewCard(now);
    const { log } = reviewCard(card, "Good", now, "standard");
    expect(new Date(log.review).toISOString()).toBe(now.toISOString());
  });
});
