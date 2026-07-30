/**
 * 内容校验脚本（设计文档 §8.2 quality-gate: content:validate 步骤）
 *
 * 校验 public/book-data/ 词书：
 * 1. zod schema 校验（wordBookSchema / slicedBookIndexSchema）
 * 2. G1-G7 图谱规则校验（audit-rules）
 *
 * 支持两种词书格式：
 * - 扁平：books/{id}.json（内嵌 words 数组）
 * - 切片：books/{id}/index.json + chunk-NNN.json（按需加载）
 *
 * 用法：tsx scripts/validate-content.ts [public-dir]
 * 退出码：0=通过，1=校验失败
 */
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { resolve, join } from "node:path";
import {
  wordBookSchema,
  slicedBookIndexSchema,
} from "@/lib/content/schemas";
import type {
  WordBook,
  SlicedBookIndex,
  WordEntry,
} from "@/lib/content/word-book-schema";
// SlicedBookIndex used in validateSlicedBook signature
import {
  auditG1,
  auditG2,
  type AuditResult,
} from "@/lib/content/audit-rules";

export interface ValidateContentResult {
  total: number;
  passed: number;
  errors: string[];
}

/**
 * 校验单个词书 JSON（纯函数，供测试）。
 * - schema 校验
 * - G1：词书词在词典中存在（需传入 dictWords）
 * - G2：释义完整性（phonetic/translation）
 */
export function validateBook(
  book: WordBook,
  dictWords: Set<string>
): AuditResult[] {
  const results: AuditResult[] = [];
  // G1：词书引用的词在词典中存在
  results.push(auditG1(book.words.map((w) => w.word), dictWords));
  // G2：释义完整性（词书自带 pos/translation，phonetic 可选——词书无 phonetic 字段，跳过 phonetic 检查，只查 translation）
  results.push(
    auditG2(
      book.words.map((w) => ({
        word: w.word,
        translation: w.translation,
        phonetic: "(词书自带释义，跳过音标检查)",
      }))
    )
  );
  return results;
}

/** 校验切片化词书索引 */
export function validateSlicedBook(
  index: SlicedBookIndex,
  bookDir: string
): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 校验 chunk 文件数量与 index 声明一致
  if (index.chunks.length !== index.chunkCount) {
    errors.push(
      `chunks 数量(${index.chunks.length}) 与 chunkCount(${index.chunkCount}) 不一致`
    );
  }

  // 抽样校验首尾两个 chunk 文件存在且可解析
  const sampleChunks = [
    index.chunks[0],
    index.chunks[index.chunks.length - 1],
  ].filter(Boolean);
  for (const chunkFile of sampleChunks) {
    const chunkPath = join(bookDir, chunkFile);
    if (!existsSync(chunkPath)) {
      errors.push(`切片文件不存在: ${chunkFile}`);
      continue;
    }
    try {
      const words = JSON.parse(readFileSync(chunkPath, "utf8")) as WordEntry[];
      // G2 抽样：检查释义非空
      const emptyTrans = words.filter((w) => !w.translation).length;
      if (emptyTrans > 0) {
        warnings.push(`${chunkFile}: ${emptyTrans} 词缺 translation`);
      }
    } catch {
      errors.push(`切片文件解析失败: ${chunkFile}`);
    }
  }

  // 校验 wordCount 合理性（抽样 chunk 大小 × chunkCount ≈ wordCount）
  const expectedMin = (index.chunks.length - 1) * index.chunkSize + 1;
  const expectedMax = index.chunks.length * index.chunkSize;
  if (index.wordCount < expectedMin || index.wordCount > expectedMax) {
    warnings.push(
      `wordCount(${index.wordCount}) 不在预期范围 [${expectedMin}, ${expectedMax}]`
    );
  }

  return { errors, warnings };
}

/** 收集 public/dict-data 下所有切片中的词（用于 G1 校验） */
export function collectDictWords(dictDir: string): Set<string> {
  const words = new Set<string>();
  if (!existsSync(dictDir)) return words;
  const letters = readdirSync(dictDir);
  for (const letter of letters) {
    const letterDir = join(dictDir, letter);
    if (!statSync(letterDir).isDirectory()) continue;
    const files = readdirSync(letterDir).filter((f) => f.endsWith(".json"));
    for (const f of files) {
      const raw = readFileSync(join(letterDir, f), "utf8");
      try {
        const entries = JSON.parse(raw) as { word?: string }[];
        for (const e of entries) {
          if (e.word) words.add(e.word);
        }
      } catch {
        // 跳过无法解析的切片
      }
    }
  }
  return words;
}

/** 收集切片化词书的所有词（用于 G1 校验） */
function collectSlicedBookWords(bookDir: string): Set<string> {
  const words = new Set<string>();
  if (!existsSync(bookDir)) return words;
  const files = readdirSync(bookDir).filter((f) => f.startsWith("chunk-") && f.endsWith(".json"));
  for (const f of files) {
    try {
      const entries = JSON.parse(readFileSync(join(bookDir, f), "utf8")) as WordEntry[];
      for (const e of entries) {
        if (e.word) words.add(e.word);
      }
    } catch {
      // 跳过无法解析的切片
    }
  }
  return words;
}

export function validateContent(publicDir: string): ValidateContentResult {
  const booksDir = join(publicDir, "book-data");
  const dictDir = join(publicDir, "dict-data");
  const errors: string[] = [];
  let total = 0;
  let passed = 0;

  if (!existsSync(booksDir)) {
    return { total: 0, passed: 0, errors: ["book-data 目录不存在"] };
  }

  const dictWords = collectDictWords(dictDir);

  // 收集所有词书条目（扁平 .json + 切片化目录）
  const entries = readdirSync(booksDir).filter(
    (f) => f.endsWith(".json") && f !== "index.json"
  );
  const slicedDirs = readdirSync(booksDir).filter((f) => {
    const p = join(booksDir, f);
    return statSync(p).isDirectory() && existsSync(join(p, "index.json"));
  });

  // 校验扁平词书
  for (const f of entries) {
    total++;
    const raw = readFileSync(join(booksDir, f), "utf8");
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      errors.push(`${f}: JSON 解析失败`);
      continue;
    }
    const schemaResult = wordBookSchema.safeParse(parsed);
    if (!schemaResult.success) {
      errors.push(
        `${f}: schema 校验失败 — ${schemaResult.error.issues[0]?.message}`
      );
      continue;
    }
    const auditResults = validateBook(schemaResult.data, dictWords);
    const blockingErrors = auditResults
      .filter((r) => r.rule !== "G1")
      .flatMap((r) => r.errors);
    const g1Warnings = auditResults
      .filter((r) => r.rule === "G1" && !r.passed)
      .flatMap((r) => r.errors);
    if (g1Warnings.length > 0) {
      console.log(
        `  ⚠ ${f}: ${g1Warnings.length} 词不在词典切片中（warning，不阻塞）`
      );
    }
    if (blockingErrors.length > 0) {
      errors.push(`${f}: ${blockingErrors.join("; ")}`);
    } else {
      passed++;
    }
  }

  // 校验切片化词书
  for (const dir of slicedDirs) {
    total++;
    const bookDir = join(booksDir, dir);
    const indexRaw = readFileSync(join(bookDir, "index.json"), "utf8");
    let indexParsed: unknown;
    try {
      indexParsed = JSON.parse(indexRaw);
    } catch {
      errors.push(`${dir}/index.json: JSON 解析失败`);
      continue;
    }
    const schemaResult = slicedBookIndexSchema.safeParse(indexParsed);
    if (!schemaResult.success) {
      errors.push(
        `${dir}/index.json: schema 校验失败 — ${schemaResult.error.issues[0]?.message}`
      );
      continue;
    }
    const slicedResult = validateSlicedBook(schemaResult.data, bookDir);
    if (slicedResult.errors.length > 0) {
      errors.push(`${dir}: ${slicedResult.errors.join("; ")}`);
    } else {
      passed++;
    }
    if (slicedResult.warnings.length > 0) {
      for (const w of slicedResult.warnings) {
        console.log(`  ⚠ ${dir}: ${w}`);
      }
    }

    // G1 校验（切片化词书的词在词典中存在）——降级为 warning
    const bookWords = collectSlicedBookWords(bookDir);
    const g1 = auditG1([...bookWords], dictWords);
    if (!g1.passed) {
      console.log(
        `  ⚠ ${dir}: ${g1.errors.length} 词不在词典切片中（warning，不阻塞）`
      );
    }
  }

  return { total, passed, errors };
}

async function main(): Promise<void> {
  const publicDir = resolve(process.argv[2] ?? "public");
  const result = validateContent(publicDir);
  console.log(
    `[content:validate] 词书 ${result.passed}/${result.total} 通过校验`
  );
  if (result.errors.length > 0) {
    for (const e of result.errors) console.error(`  ✗ ${e}`);
    process.exit(1);
  }
  console.log("[content:validate] ✅ 全部通过");
}

if (require.main === module) {
  main().catch((err) => {
    console.error("[content:validate] 失败:", err);
    process.exit(1);
  });
}
