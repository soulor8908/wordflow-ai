import { describe, test, expect, vi, beforeEach } from "vitest";
import {
  sliceKeyForWord,
  sliceUrlForWord,
  loadDictSlice,
  findEntry,
  toSearchEntry,
  resetSliceCacheForTest,
  type DictEntry,
} from "@/lib/dict/dict-loader";

// 模拟切片数据（设计文档 §4.1：dict/{a-z}/{prefix}.json）
const MOCK_SLICES: Record<string, DictEntry[]> = {
  "ab": [
    {
      word: "abandon",
      phonetic: "/əˈbændən/",
      pos: "v.",
      translation: "vt. 放弃；抛弃",
      frequency: 5000,
      tags: ["kaoyan", "cet4"],
      root: "ab-（离开）+ -bandon（控制）",
      examples: [
        { en: "He abandoned his car.", zh: "他抛弃了他的车。" },
      ],
      synonyms: ["desert", "forsake"],
    },
    {
      word: "ability",
      phonetic: "/əˈbɪləti/",
      pos: "n.",
      translation: "n. 能力；才能",
      frequency: 4800,
      tags: ["cet4"],
    },
  ],
  "ac": [
    {
      word: "accept",
      phonetic: "/əkˈsept/",
      pos: "v.",
      translation: "vt. 接受；同意",
      frequency: 7000,
      tags: ["cet4"],
    },
  ],
};

describe("sliceKeyForWord", () => {
  test("returns first 2 lowercase letters as slice key", () => {
    expect(sliceKeyForWord("Abandon")).toBe("ab");
    expect(sliceKeyForWord("ACCEPT")).toBe("ac");
  });

  test("falls back to whole word when shorter than 2", () => {
    expect(sliceKeyForWord("a")).toBe("a");
    expect(sliceKeyForWord("I")).toBe("i");
  });

  test("throws on empty word", () => {
    expect(() => sliceKeyForWord("")).toThrow();
  });
});

describe("sliceUrlForWord", () => {
  test("builds /dict-data/{first-letter}/{slice}.json URL", () => {
    expect(sliceUrlForWord("abandon")).toBe("/dict-data/a/ab.json");
    expect(sliceUrlForWord("Accept")).toBe("/dict-data/a/ac.json");
  });

  test("single-letter word uses itself as slice key", () => {
    expect(sliceUrlForWord("a")).toBe("/dict-data/a/a.json");
  });
});

describe("loadDictSlice", () => {
  beforeEach(() => {
    resetSliceCacheForTest();
    vi.restoreAllMocks();
  });

  test("fetches and parses slice JSON for given word", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => MOCK_SLICES["ab"],
    } as Response);

    const slice = await loadDictSlice("abandon");
    expect(fetchSpy).toHaveBeenCalledWith("/dict-data/a/ab.json", expect.any(Object));
    expect(slice).toHaveLength(2);
    expect(slice[0].word).toBe("abandon");
  });

  test("caches slice by key (no duplicate fetch)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => MOCK_SLICES["ab"],
    } as Response);

    await loadDictSlice("abandon");
    await loadDictSlice("ability");
    // 同一 slice key "ab" 只应请求一次
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  test("returns empty array on 404 (slice missing)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 404,
    } as Response);

    const slice = await loadDictSlice("zzzzz");
    expect(slice).toEqual([]);
  });

  test("does not cache failed fetches (allows retry)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce({ ok: false, status: 404 } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => MOCK_SLICES["ac"] } as Response);

    await loadDictSlice("accept");
    await loadDictSlice("accept");
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});

describe("findEntry", () => {
  beforeEach(() => {
    resetSliceCacheForTest();
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => MOCK_SLICES["ab"],
    } as Response);
  });

  test("finds exact match (case-insensitive)", async () => {
    const entry = await findEntry("ABANDON");
    expect(entry?.word).toBe("abandon");
    expect(entry?.phonetic).toBe("/əˈbændən/");
  });

  test("returns undefined when word not in slice", async () => {
    const entry = await findEntry("absolute");
    expect(entry).toBeUndefined();
  });
});

describe("toSearchEntry", () => {
  test("extracts word + frequency for search index", () => {
    const entry: DictEntry = {
      word: "abandon",
      phonetic: "/əˈbændən/",
      translation: "放弃",
      frequency: 5000,
    };
    const searchEntry = toSearchEntry(entry);
    expect(searchEntry).toEqual({ word: "abandon", frequency: 5000 });
  });

  test("frequency defaults to 0 when missing", () => {
    const entry: DictEntry = { word: "test", translation: "测试" };
    expect(toSearchEntry(entry)).toEqual({ word: "test", frequency: 0 });
  });
});
