import { describe, test, expect } from "vitest";
import {
  buildNotificationMessage,
  type BackgroundCheckInput,
} from "@/lib/pwa/notification-message";

describe("buildNotificationMessage", () => {
  test("returns 'today' message when due cards exist and studied today", () => {
    const input: BackgroundCheckInput = {
      dueCount: 5,
      daysSinceLastStudy: 0,
    };
    const result = buildNotificationMessage(input);
    expect(result?.title).toBe("📚 今日有 5 词待复习");
    expect(result?.body).toContain("5");
    expect(result?.url).toBe("/review");
  });

  test("returns 'today' message when due cards exist and studied recently (1-2 days)", () => {
    const input: BackgroundCheckInput = {
      dueCount: 3,
      daysSinceLastStudy: 1,
    };
    const result = buildNotificationMessage(input);
    expect(result?.title).toBe("📚 今日有 3 词待复习");
  });

  test("returns 'come back' message when 3 days since last study", () => {
    const input: BackgroundCheckInput = {
      dueCount: 5,
      daysSinceLastStudy: 3,
    };
    const result = buildNotificationMessage(input);
    expect(result?.title).toBe("回来背词吧，复习队列在等你");
    expect(result?.url).toBe("/review");
  });

  test("returns 'long time' message when 7+ days since last study", () => {
    const input: BackgroundCheckInput = {
      dueCount: 10,
      daysSinceLastStudy: 8,
    };
    const result = buildNotificationMessage(input);
    expect(result?.title).toBe("很久没背词了，词书在等你");
  });

  test("returns null when no due cards and studied today (no notification needed)", () => {
    const input: BackgroundCheckInput = {
      dueCount: 0,
      daysSinceLastStudy: 0,
    };
    const result = buildNotificationMessage(input);
    expect(result).toBeNull();
  });

  test("returns 'come back' message when 3 days gap even with 0 due cards", () => {
    const input: BackgroundCheckInput = {
      dueCount: 0,
      daysSinceLastStudy: 4,
    };
    const result = buildNotificationMessage(input);
    expect(result?.title).toBe("回来背词吧，复习队列在等你");
  });

  test("7-day boundary: 6 days is 'come back', 7 days is 'long time' (design §4.5.3)", () => {
    const at6 = buildNotificationMessage({ dueCount: 1, daysSinceLastStudy: 6 });
    const at7 = buildNotificationMessage({ dueCount: 1, daysSinceLastStudy: 7 });
    expect(at6?.title).toBe("回来背词吧，复习队列在等你");
    expect(at7?.title).toBe("很久没背词了，词书在等你");
  });

  test("boundary: 2 days is 'today' tier, 3 days is 'come back' tier", () => {
    const at2 = buildNotificationMessage({ dueCount: 1, daysSinceLastStudy: 2 });
    const at3 = buildNotificationMessage({ dueCount: 1, daysSinceLastStudy: 3 });
    expect(at2?.title).toContain("待复习");
    expect(at3?.title).toBe("回来背词吧，复习队列在等你");
  });
});
