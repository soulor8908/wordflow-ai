import { describe, test, expect } from "vitest";
import {
  auditG1,
  auditG2,
  auditG3,
  auditG4,
  auditG5,
  auditG6,
  auditG7,
} from "@/lib/content/audit-rules";

describe("G1: book words exist in dictionary", () => {
  test("passes when all book words are in dictionary", () => {
    const result = auditG1(["abandon", "ability"], new Set(["abandon", "ability", "abound"]));
    expect(result.passed).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test("fails when a book word is missing from dictionary (悬空引用)", () => {
    const result = auditG1(["abandon", "xyzzy"], new Set(["abandon", "ability"]));
    expect(result.passed).toBe(false);
    expect(result.errors).toContain("G1: word 'xyzzy' not found in dictionary");
  });
});

describe("G2: definition completeness", () => {
  test("passes when all entries have phonetic and translation", () => {
    const entries = [
      { word: "abandon", phonetic: "/əˈbændən/", translation: "放弃" },
      { word: "ability", phonetic: "/əˈbɪləti/", translation: "能力" },
    ];
    const result = auditG2(entries);
    expect(result.passed).toBe(true);
  });

  test("fails when an entry is missing phonetic", () => {
    const entries = [{ word: "abandon", phonetic: "", translation: "放弃" }];
    const result = auditG2(entries);
    expect(result.passed).toBe(false);
    expect(result.errors[0]).toContain("missing phonetic");
  });

  test("fails when an entry is missing translation", () => {
    const entries = [{ word: "abandon", phonetic: "/x/", translation: "" }];
    const result = auditG2(entries);
    expect(result.passed).toBe(false);
    expect(result.errors[0]).toContain("missing translation");
  });
});

describe("G3: frequency tag matches COCA data", () => {
  test("passes when all frequency tags match COCA", () => {
    const bookWords = [
      { word: "abandon", frequency: 1200 },
      { word: "ability", frequency: 800 },
    ];
    const coca = new Map([
      ["abandon", 1200],
      ["ability", 800],
    ]);
    const result = auditG3(bookWords, coca);
    expect(result.passed).toBe(true);
  });

  test("fails when frequency tag disagrees with COCA", () => {
    const bookWords = [{ word: "abandon", frequency: 9999 }];
    const coca = new Map([["abandon", 1200]]);
    const result = auditG3(bookWords, coca);
    expect(result.passed).toBe(false);
    expect(result.errors[0]).toContain("frequency mismatch");
  });
});

describe("G4: synonym reverse link closure", () => {
  test("passes when synonym links are bidirectional", () => {
    const syn = new Map([
      ["abandon", new Set(["forsake", "desert"])],
      ["forsake", new Set(["abandon", "desert"])],
      ["desert", new Set(["abandon", "forsake"])],
    ]);
    const result = auditG4(syn);
    expect(result.passed).toBe(true);
  });

  test("fails when A lists B but B does not list A", () => {
    const syn = new Map([
      ["abandon", new Set(["forsake"])],
      ["forsake", new Set<string>()], // missing reverse link to abandon
    ]);
    const result = auditG4(syn);
    expect(result.passed).toBe(false);
    expect(result.errors[0]).toContain("reverse link missing");
  });
});

describe("G5: no duplicate words in book", () => {
  test("passes when all words are unique", () => {
    const result = auditG5(["abandon", "ability", "abound"]);
    expect(result.passed).toBe(true);
  });

  test("fails when duplicate words exist", () => {
    const result = auditG5(["abandon", "ability", "abandon"]);
    expect(result.passed).toBe(false);
    expect(result.errors).toContain("G5: duplicate word 'abandon'");
  });
});

describe("G6: custom book import match rate", () => {
  test("passes when match rate >= threshold (default 80%)", () => {
    // 4 of 5 words in dictionary = 80% >= 80%
    const result = auditG6(["a", "b", "c", "d", "e"], new Set(["a", "b", "c", "d"]));
    expect(result.passed).toBe(true);
  });

  test("fails when match rate < threshold", () => {
    // 3 of 5 = 60% < 80%
    const result = auditG6(["a", "b", "c", "d", "e"], new Set(["a", "b", "c"]));
    expect(result.passed).toBe(false);
    expect(result.errors[0]).toContain("match rate");
  });

  test("respects custom threshold", () => {
    const result = auditG6(["a", "b", "c", "d", "e"], new Set(["a", "b", "c"]), 0.6);
    expect(result.passed).toBe(true);
  });
});

describe("G7: semantic index coverage", () => {
  test("passes when all top words are indexed", () => {
    const result = auditG7(["abandon", "ability", "abound"], new Set(["abandon", "ability", "abound", "extra"]));
    expect(result.passed).toBe(true);
  });

  test("fails when a top word is not indexed", () => {
    const result = auditG7(["abandon", "ability", "xyzzy"], new Set(["abandon", "ability"]));
    expect(result.passed).toBe(false);
    expect(result.errors).toContain("G7: top word 'xyzzy' not in semantic index");
  });
});
