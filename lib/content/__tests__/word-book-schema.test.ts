import { describe, test, expect } from "vitest";
import { wordBookSchema } from "@/lib/content/schemas";

describe("wordBookSchema", () => {
  test("valid word book with all required fields passes validation", () => {
    const validBook = {
      id: "kaoyan-2025",
      name: "考研词汇 2025",
      description: "考研大纲 5500 词",
      dailyNew: 20,
      sources: [
        { level: "T0", name: "教育部考试中心考研大纲" },
        { level: "T2", name: "新东方考研词汇表" },
      ],
      words: [
        { word: "abandon", pos: "v.", translation: "放弃；遗弃", frequency: 1200 },
        { word: "ability", pos: "n.", translation: "能力；才能", frequency: 800 },
      ],
    };

    const result = wordBookSchema.safeParse(validBook);

    expect(result.success).toBe(true);
  });

  test("rejects book missing id", () => {
    const book = { name: "x", description: "x", dailyNew: 10, sources: [], words: [] };
    expect(wordBookSchema.safeParse(book).success).toBe(false);
  });

  test("rejects book missing name", () => {
    const book = { id: "x", description: "x", dailyNew: 10, sources: [], words: [] };
    expect(wordBookSchema.safeParse(book).success).toBe(false);
  });

  test("rejects book with empty words array", () => {
    const book = {
      id: "kaoyan-2025",
      name: "考研",
      description: "x",
      dailyNew: 20,
      sources: [
        { level: "T0", name: "A" },
        { level: "T2", name: "B" },
      ],
      words: [],
    };
    expect(wordBookSchema.safeParse(book).success).toBe(false);
  });

  test("rejects dailyNew <= 0", () => {
    const book = {
      id: "kaoyan-2025",
      name: "考研",
      description: "x",
      dailyNew: 0,
      sources: [
        { level: "T0", name: "A" },
        { level: "T2", name: "B" },
      ],
      words: [{ word: "a", translation: "x" }],
    };
    expect(wordBookSchema.safeParse(book).success).toBe(false);
  });

  test("rejects dailyNew > 100", () => {
    const book = {
      id: "kaoyan-2025",
      name: "考研",
      description: "x",
      dailyNew: 101,
      sources: [
        { level: "T0", name: "A" },
        { level: "T2", name: "B" },
      ],
      words: [{ word: "a", translation: "x" }],
    };
    expect(wordBookSchema.safeParse(book).success).toBe(false);
  });

  test("rejects fewer than 2 sources (design doc: 词书节点 ≥2 条来源)", () => {
    const book = {
      id: "kaoyan-2025",
      name: "考研",
      description: "x",
      dailyNew: 20,
      sources: [{ level: "T0", name: "A" }],
      words: [{ word: "a", translation: "x" }],
    };
    expect(wordBookSchema.safeParse(book).success).toBe(false);
  });

  test("rejects sources with no T0 or T1 level (design doc: 至少 1 条 T0/T1)", () => {
    const book = {
      id: "kaoyan-2025",
      name: "考研",
      description: "x",
      dailyNew: 20,
      sources: [
        { level: "T2", name: "A" },
        { level: "T3", name: "B" },
      ],
      words: [{ word: "a", translation: "x" }],
    };
    expect(wordBookSchema.safeParse(book).success).toBe(false);
  });

  test("rejects invalid source level (not T0-T3)", () => {
    const book = {
      id: "kaoyan-2025",
      name: "考研",
      description: "x",
      dailyNew: 20,
      sources: [
        { level: "T9", name: "A" },
        { level: "T2", name: "B" },
      ],
      words: [{ word: "a", translation: "x" }],
    };
    expect(wordBookSchema.safeParse(book).success).toBe(false);
  });

  test("rejects non-kebab-case id", () => {
    const book = {
      id: "KaoYan_2025",
      name: "考研",
      description: "x",
      dailyNew: 20,
      sources: [
        { level: "T0", name: "A" },
        { level: "T2", name: "B" },
      ],
      words: [{ word: "a", translation: "x" }],
    };
    expect(wordBookSchema.safeParse(book).success).toBe(false);
  });
});
