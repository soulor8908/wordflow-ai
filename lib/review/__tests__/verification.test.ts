import { describe, test, expect } from "vitest";
import { applyVerificationResult } from "@/lib/review/verification";

describe("applyVerificationResult", () => {
  test("unverified + pass V1 → V1", () => {
    const result = applyVerificationResult("unverified", "V1", true);
    expect(result).toBe("V1");
  });

  test("V1 + pass V2 → V2", () => {
    const result = applyVerificationResult("V1", "V2", true);
    expect(result).toBe("V2");
  });

  test("V2 + pass V3 → V3", () => {
    const result = applyVerificationResult("V2", "V3", true);
    expect(result).toBe("V3");
  });

  test("V3 + pass V4 → mastered", () => {
    const result = applyVerificationResult("V3", "V4", true);
    expect(result).toBe("mastered");
  });

  test("unverified + pass V2 (skip V1) → stays unverified (不可跳级)", () => {
    const result = applyVerificationResult("unverified", "V2", true);
    expect(result).toBe("unverified");
  });

  test("V1 + pass V3 (skip V2) → stays V1 (不可跳级)", () => {
    const result = applyVerificationResult("V1", "V3", true);
    expect(result).toBe("V1");
  });

  test("V1 + fail V2 → stays V1 (no regression on failure)", () => {
    const result = applyVerificationResult("V1", "V2", false);
    expect(result).toBe("V1");
  });

  test("unverified + fail V1 → stays unverified", () => {
    const result = applyVerificationResult("unverified", "V1", false);
    expect(result).toBe("unverified");
  });

  test("mastered + pass V4 again → stays mastered (idempotent)", () => {
    const result = applyVerificationResult("mastered", "V4", true);
    expect(result).toBe("mastered");
  });

  test("V2 + pass V1 (re-test lower level) → stays V2 (no regression)", () => {
    const result = applyVerificationResult("V2", "V1", true);
    expect(result).toBe("V2");
  });
});
