import { describe, test, expect } from "vitest";
import {
  parseEcdictRow,
  groupEntriesBySlice,
  buildSliceFiles,
  type RawEcdictRow,
} from "@/scripts/compile-dict-core";
import type { DictEntry } from "@/lib/dict/dict-loader";

describe("parseEcdictRow", () => {
  test("parses full ECDICT CSV row with all fields", () => {
    const row: RawEcdictRow = {
      word: "abandon",
      phonetic: "/əˈbændən/",
      definition: "to leave completely",
      translation: "vt. 放弃；抛弃",
      pos: "v.",
      tag: "kaoyan cet4",
      frq: "5000",
      bnc: "4800",
      collins: "3",
      oxford: "1",
      exchange: "p:abandoned/d:abandoned",
    };
    const entry = parseEcdictRow(row);
    expect(entry.word).toBe("abandon");
    expect(entry.phonetic).toBe("/əˈbændən/");
    expect(entry.translation).toBe("vt. 放弃；抛弃");
    expect(entry.pos).toBe("v.");
    expect(entry.frequency).toBe(5000);
    expect(entry.tags).toEqual(["kaoyan", "cet4"]);
  });

  test("frequency falls back to bnc when frq missing", () => {
    const entry = parseEcdictRow({
      word: "test",
      translation: "n. 测试",
      bnc: "3000",
    });
    expect(entry.frequency).toBe(3000);
  });

  test("frequency is undefined when both frq and bnc missing", () => {
    const entry = parseEcdictRow({ word: "rare", translation: "adj. 罕见的" });
    expect(entry.frequency).toBeUndefined();
  });

  test("empty tag string yields undefined tags", () => {
    const entry = parseEcdictRow({
      word: "x",
      translation: "n. x",
      tag: "",
    });
    expect(entry.tags).toBeUndefined();
  });

  test("throws on missing word", () => {
    expect(() =>
      parseEcdictRow({ translation: "n. test" } as RawEcdictRow)
    ).toThrow();
  });

  test("throws on missing translation", () => {
    expect(() =>
      parseEcdictRow({ word: "test" } as RawEcdictRow)
    ).toThrow();
  });
});

describe("groupEntriesBySlice", () => {
  const entries: DictEntry[] = [
    { word: "abandon", translation: "放弃", frequency: 5000 },
    { word: "ability", translation: "能力", frequency: 4800 },
    { word: "about", translation: "关于", frequency: 9000 },
    { word: "accept", translation: "接受", frequency: 7000 },
    { word: "a", translation: "art. 一个" },
  ];

  test("groups entries by first-2-letter slice key", () => {
    const groups = groupEntriesBySlice(entries);
    expect(groups.get("ab")).toHaveLength(3);
    expect(groups.get("ac")).toHaveLength(1);
    expect(groups.get("a")).toHaveLength(1); // 单字母词
  });

  test("each slice sorted by frequency desc (missing freq = 0)", () => {
    const groups = groupEntriesBySlice(entries);
    const ab = groups.get("ab")?.map((e) => e.word);
    expect(ab).toEqual(["about", "abandon", "ability"]);
  });
});

describe("buildSliceFiles", () => {
  const entries: DictEntry[] = [
    { word: "abandon", translation: "放弃", frequency: 5000 },
    { word: "about", translation: "关于", frequency: 9000 },
    { word: "accept", translation: "接受", frequency: 7000 },
  ];

  test("produces {path, content} pairs at /dict-data/{letter}/{slice}.json", () => {
    const files = buildSliceFiles(entries);
    const paths = files.map((f) => f.path).sort();
    expect(paths).toEqual(["/dict-data/a/ab.json", "/dict-data/a/ac.json"]);
  });

  test("content is JSON-serialized DictEntry array", () => {
    const files = buildSliceFiles(entries);
    const abFile = files.find((f) => f.path === "/dict-data/a/ab.json");
    expect(abFile).toBeDefined();
    const parsed = JSON.parse(abFile!.content);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed[0].word).toBe("about"); // 高频在前
  });

  test("warns (and still emits) when a slice exceeds 50KB budget", () => {
    const big: DictEntry = {
      word: "abandon",
      translation: "放弃".repeat(30000),
      frequency: 5000,
    };
    const files = buildSliceFiles([big]);
    expect(files).toHaveLength(1);
    expect(files[0].content.length).toBeGreaterThan(50 * 1024);
  });
});
