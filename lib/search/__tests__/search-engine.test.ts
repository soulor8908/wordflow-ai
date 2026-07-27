import { describe, test, expect } from "vitest";
import {
  buildPrefixIndex,
  searchByPrefix,
  levenshtein,
  fuzzyCorrect,
  search,
  type SearchEntry,
} from "@/lib/search/search-engine";

// 词频（frequency 越大越常用，来自 COCA/BNC）
const ENTRIES: SearchEntry[] = [
  { word: "abandon", frequency: 5000 },
  { word: "ability", frequency: 4800 },
  { word: "abound", frequency: 800 },
  { word: "about", frequency: 9000 },
  { word: "abroad", frequency: 1200 },
  { word: "adapt", frequency: 1500 },
  { word: "accept", frequency: 7000 },
  { word: "access", frequency: 6500 },
];

describe("buildPrefixIndex", () => {
  test("builds prefix → entries map by first 2 letters", () => {
    const index = buildPrefixIndex(ENTRIES, 2);
    expect(index.buckets.get("ab")).toHaveLength(5);
    expect(index.buckets.get("ab")?.map((e) => e.word).sort()).toEqual([
      "abandon",
      "ability",
      "abound",
      "about",
      "abroad",
    ]);
    expect(index.buckets.get("ac")).toHaveLength(2);
  });

  test("falls back to shorter key when word shorter than bucketSize", () => {
    const index = buildPrefixIndex(
      [{ word: "a", frequency: 100 }, { word: "ab", frequency: 50 }],
      2
    );
    // "a" 长度不足 2，用整个 "a" 作为桶 key；"ab" 用 "ab"
    expect(index.buckets.get("a")).toHaveLength(1);
    expect(index.buckets.get("ab")).toHaveLength(1);
  });

  test("entries within each prefix bucket are sorted by frequency desc", () => {
    const index = buildPrefixIndex(ENTRIES, 2);
    const ab = index.buckets.get("ab")?.map((e) => e.word);
    expect(ab).toEqual(["about", "abandon", "ability", "abroad", "abound"]);
  });

  test("records bucketSize for downstream queries", () => {
    const index = buildPrefixIndex(ENTRIES, 2);
    expect(index.bucketSize).toBe(2);
  });
});

describe("searchByPrefix", () => {
  test("returns matches sorted by frequency desc", () => {
    const index = buildPrefixIndex(ENTRIES, 2);
    const results = searchByPrefix(index, "ab");
    expect(results.map((e) => e.word)).toEqual([
      "about",
      "abandon",
      "ability",
      "abroad",
      "abound",
    ]);
  });

  test("respects limit parameter", () => {
    const index = buildPrefixIndex(ENTRIES, 2);
    const results = searchByPrefix(index, "ab", 3);
    expect(results).toHaveLength(3);
    expect(results[0].word).toBe("about"); // 最高频
  });

  test("returns empty for unknown prefix", () => {
    const index = buildPrefixIndex(ENTRIES, 2);
    expect(searchByPrefix(index, "zz")).toEqual([]);
  });

  test("prefix shorter than index bucket size still works (falls back to scanning)", () => {
    const index = buildPrefixIndex(ENTRIES, 2);
    const results = searchByPrefix(index, "a");
    expect(results.length).toBe(8); // 所有 a 开头
  });

  test("prefix longer than bucket size filters within bucket", () => {
    const index = buildPrefixIndex(ENTRIES, 2);
    const results = searchByPrefix(index, "abo");
    expect(results.map((e) => e.word).sort()).toEqual(["abound", "about"]);
  });

  test("is case-insensitive", () => {
    const index = buildPrefixIndex(ENTRIES, 2);
    expect(searchByPrefix(index, "AB").map((e) => e.word)).toContain("abandon");
    expect(searchByPrefix(index, "AbOut").map((e) => e.word)).toEqual(["about"]);
  });
});

describe("levenshtein", () => {
  test("identical strings have distance 0", () => {
    expect(levenshtein("hello", "hello")).toBe(0);
  });

  test("single substitution = 1", () => {
    expect(levenshtein("cat", "bat")).toBe(1);
  });

  test("single insertion = 1", () => {
    expect(levenshtein("cat", "cats")).toBe(1);
  });

  test("single deletion = 1", () => {
    expect(levenshtein("cats", "cat")).toBe(1);
  });

  test("completely different strings", () => {
    expect(levenshtein("kitten", "sitting")).toBe(3);
  });

  test("empty string vs non-empty = length", () => {
    expect(levenshtein("", "abc")).toBe(3);
    expect(levenshtein("abc", "")).toBe(3);
  });

  test("case-insensitive by default", () => {
    expect(levenshtein("Hello", "hello")).toBe(0);
  });
});

describe("fuzzyCorrect", () => {
  test("returns closest matches within max distance", () => {
    const results = fuzzyCorrect(ENTRIES, "abandn", 1);
    expect(results.map((e) => e.word)).toContain("abandon");
  });

  test("respects maxDistance (no matches beyond threshold)", () => {
    const results = fuzzyCorrect(ENTRIES, "abandn", 0);
    expect(results).toEqual([]);
  });

  test("returns empty for very distant input", () => {
    const results = fuzzyCorrect(ENTRIES, "zzzzzz", 1);
    expect(results).toEqual([]);
  });

  test("sorts by distance asc then frequency desc", () => {
    // "abandon" 距离 "abndon" = 1（删 a），"abound" 距离 = 2
    const results = fuzzyCorrect(ENTRIES, "abndon", 2);
    expect(results[0].word).toBe("abandon");
  });

  test("respects limit", () => {
    const results = fuzzyCorrect(ENTRIES, "abandn", 2, 1);
    expect(results).toHaveLength(1);
  });
});

describe("search (combined prefix + fuzzy)", () => {
  test("exact/prefix match takes priority over fuzzy", () => {
    const index = buildPrefixIndex(ENTRIES, 2);
    const results = search(index, ENTRIES, "aban", 5);
    expect(results[0].word).toBe("abandon");
  });

  test("falls back to fuzzy when no prefix match", () => {
    const index = buildPrefixIndex(ENTRIES, 2);
    const results = search(index, ENTRIES, "abandn", 5);
    expect(results[0].word).toBe("abandon");
  });

  test("returns empty array for empty query", () => {
    const index = buildPrefixIndex(ENTRIES, 2);
    expect(search(index, ENTRIES, "", 5)).toEqual([]);
  });
});
