import { describe, test, expect } from "vitest";
import {
  TEMPLATES,
  pickTemplate,
  decideMotive,
} from "@/lib/gamification/notifications";
import type {
  NotificationContext,
  NotificationMotive,
  NotificationTone,
} from "@/lib/gamification/types";

function ctx(over: Partial<NotificationContext> = {}): NotificationContext {
  return {
    motive: "streak",
    streakDays: 5,
    dueCount: 10,
    questDone: 0,
    badgeGap: 0,
    badgeName: null,
    ...over,
  };
}

describe("TEMPLATES 模板池完整性", () => {
  test("每个 motive 都有 3 种 tone 模板", () => {
    const motives: NotificationMotive[] = ["streak", "quest", "badge", "comeback"];
    const tones: NotificationTone[] = ["gentle", "direct", "challenge"];
    for (const motive of motives) {
      for (const tone of tones) {
        const found = TEMPLATES.find(
          (t) => t.motive === motive && t.tone === tone
        );
        expect(found, `${motive}/${tone} 模板缺失`).toBeDefined();
      }
    }
  });

  test("共 12 个模板（4 motive × 3 tone）", () => {
    expect(TEMPLATES).toHaveLength(12);
  });

  test("所有模板的 build 函数返回非空 title/body", () => {
    const testCtx = ctx({
      streakDays: 10,
      dueCount: 5,
      questDone: 2,
      badgeGap: 3,
      badgeName: "词汇猎人",
    });
    for (const t of TEMPLATES) {
      const result = t.build(testCtx);
      expect(result.title.length).toBeGreaterThan(0);
      expect(result.body.length).toBeGreaterThan(0);
    }
  });
});

describe("pickTemplate", () => {
  test("首次无 lastTone → 返回该 motive 第一个模板", () => {
    const t = pickTemplate("streak", null);
    expect(t.motive).toBe("streak");
  });

  test("同 motive 下轮换 tone：上次 challenge → 不返回 challenge", () => {
    const t = pickTemplate("streak", "challenge");
    expect(t.tone).not.toBe("challenge");
    expect(t.motive).toBe("streak");
  });

  test("同 motive 下轮换 tone：上次 direct → 不返回 direct", () => {
    const t = pickTemplate("quest", "direct");
    expect(t.tone).not.toBe("direct");
  });

  test("同 motive 下轮换 tone：上次 gentle → 不返回 gentle", () => {
    const t = pickTemplate("badge", "gentle");
    expect(t.tone).not.toBe("gentle");
  });

  test("未知 motive → 抛错", () => {
    expect(() => pickTemplate("unknown" as NotificationMotive, null)).toThrow();
  });
});

describe("decideMotive", () => {
  test("comeback 优先级最高", () => {
    const c = ctx({ motive: "comeback" });
    expect(decideMotive(c)).toBe("comeback");
  });

  test("streak save：连胜 ≥3 → streak", () => {
    const c = ctx({ motive: "streak", streakDays: 3 });
    expect(decideMotive(c)).toBe("streak");
  });

  test("streak save：连胜 <3 → null（不值得为低连胜打扰）", () => {
    const c = ctx({ motive: "streak", streakDays: 2 });
    expect(decideMotive(c)).toBeNull();
  });

  test("quest：完成 1-2 个 → quest", () => {
    expect(decideMotive(ctx({ motive: "quest", questDone: 1 }))).toBe("quest");
    expect(decideMotive(ctx({ motive: "quest", questDone: 2 }))).toBe("quest");
  });

  test("quest：完成 0 或 3 → null", () => {
    expect(decideMotive(ctx({ motive: "quest", questDone: 0 }))).toBeNull();
    expect(decideMotive(ctx({ motive: "quest", questDone: 3 }))).toBeNull();
  });

  test("badge：有目标 + gap > 0 → badge", () => {
    const c = ctx({ motive: "badge", badgeGap: 5, badgeName: "词汇猎人" });
    expect(decideMotive(c)).toBe("badge");
  });

  test("badge：gap = 0 → null", () => {
    const c = ctx({ motive: "badge", badgeGap: 0, badgeName: "词汇猎人" });
    expect(decideMotive(c)).toBeNull();
  });

  test("badge：无目标 → null", () => {
    const c = ctx({ motive: "badge", badgeGap: 5, badgeName: null });
    expect(decideMotive(c)).toBeNull();
  });
});
