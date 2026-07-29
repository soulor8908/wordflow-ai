import { describe, test, expect, afterEach } from "vitest";
import {
  validateBook,
  collectDictWords,
  validateContent,
} from "@/scripts/validate-content";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { WordBook } from "@/lib/content/word-book-schema";

const TMP = join(tmpdir(), `wf-content-test-${Date.now()}`);

function setupFixture(): string {
  rmSync(TMP, { recursive: true, force: true });
  mkdirSync(join(TMP, "book-data"), { recursive: true });
  mkdirSync(join(TMP, "dict", "a"), { recursive: true });
  const book: WordBook = {
    id: "test-book",
    name: "测试词书",
    description: "测试",
    dailyNew: 5,
    sources: [
      { level: "T0", name: "ECDICT" },
      { level: "T2", name: "教研机构" },
    ],
    words: [
      { word: "abandon", pos: "v.", translation: "放弃", frequency: 5000 },
      { word: "ability", pos: "n.", translation: "能力", frequency: 4800 },
    ],
  };
  writeFileSync(
    join(TMP, "book-data", "test-book.json"),
    JSON.stringify(book),
    "utf8"
  );
  writeFileSync(
    join(TMP, "dict", "a", "ab.json"),
    JSON.stringify([{ word: "abandon" }, { word: "ability" }]),
    "utf8"
  );
  return TMP;
}

afterEach(() => {
  rmSync(TMP, { recursive: true, force: true });
});

describe("validateBook", () => {
  test("词书词全在词典中 + 释义完整 → 全部通过", () => {
    const book: WordBook = {
      id: "t",
      name: "t",
      description: "t",
      dailyNew: 1,
      sources: [
        { level: "T0", name: "a" },
        { level: "T2", name: "b" },
      ],
      words: [{ word: "abandon", translation: "放弃" }],
    };
    const results = validateBook(book, new Set(["abandon"]));
    expect(results.every((r) => r.passed)).toBe(true);
  });

  test("词书词不在词典中 → G1 失败", () => {
    const book: WordBook = {
      id: "t",
      name: "t",
      description: "t",
      dailyNew: 1,
      sources: [
        { level: "T0", name: "a" },
        { level: "T2", name: "b" },
      ],
      words: [{ word: "ghost-word", translation: "x" }],
    };
    const results = validateBook(book, new Set(["abandon"]));
    const g1 = results.find((r) => r.rule === "G1")!;
    expect(g1.passed).toBe(false);
    expect(g1.errors[0]).toContain("ghost-word");
  });

  test("缺 translation → G2 失败", () => {
    const book = {
      id: "t",
      name: "t",
      description: "t",
      dailyNew: 1,
      sources: [
        { level: "T0", name: "a" },
        { level: "T2", name: "b" },
      ],
      words: [{ word: "abandon", translation: "" }],
    } as unknown as WordBook;
    const results = validateBook(book, new Set(["abandon"]));
    const g2 = results.find((r) => r.rule === "G2")!;
    expect(g2.passed).toBe(false);
  });
});

describe("collectDictWords", () => {
  test("收集 dict 目录下所有切片中的词", () => {
    const dir = setupFixture();
    const words = collectDictWords(join(dir, "dict"));
    expect(words.has("abandon")).toBe(true);
    expect(words.has("ability")).toBe(true);
  });

  test("dict 目录不存在 → 返回空集合", () => {
    const words = collectDictWords(join(TMP, "nonexistent"));
    expect(words.size).toBe(0);
  });
});

describe("validateContent", () => {
  test("完整通过场景：1 本词书全部校验通过", () => {
    const dir = setupFixture();
    const result = validateContent(dir);
    expect(result.total).toBe(1);
    expect(result.passed).toBe(1);
    expect(result.errors).toHaveLength(0);
  });

  test("books 目录不存在 → total=0", () => {
    const result = validateContent(join(TMP, "empty"));
    expect(result.total).toBe(0);
    expect(result.errors).toHaveLength(1);
  });

  test("词书引用不存在的词 → G1 降级为 warning，不阻塞 passed", () => {
    const dir = setupFixture();
    // 覆盖词书，加入不存在的词
    const book: WordBook = {
      id: "bad",
      name: "坏词书",
      description: "x",
      dailyNew: 1,
      sources: [
        { level: "T0", name: "a" },
        { level: "T2", name: "b" },
      ],
      words: [{ word: "nonexistent-xyz", translation: "x" }],
    };
    writeFileSync(
      join(dir, "book-data", "bad.json"),
      JSON.stringify(book),
      "utf8"
    );
    const result = validateContent(dir);
    expect(result.total).toBe(2);
    // G1 降级为 warning 后，词书仍算通过（translation 完整即可）
    expect(result.passed).toBe(2);
    // G1 不再写入 errors
    expect(result.errors.some((e) => e.includes("nonexistent-xyz"))).toBe(false);
  });
});
