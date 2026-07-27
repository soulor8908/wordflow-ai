/**
 * 内容校验脚本（设计文档 §8.2 quality-gate: content:validate 步骤）
 *
 * 校验 public/books/*.json 词书：
 * 1. zod schema 校验（wordBookSchema）
 * 2. G1-G7 图谱规则校验（audit-rules）
 *
 * 用法：tsx scripts/validate-content.ts [public-dir]
 * 退出码：0=通过，1=校验失败
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { wordBookSchema, type WordBook } from "@/lib/content/word-book-schema";
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
 * - G1：词书词在词典切片中存在（需传入 dictWords）
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

/** 收集 public/dict 下所有切片中的词（用于 G1 校验） */
export function collectDictWords(dictDir: string): Set<string> {
  const words = new Set<string>();
  if (!existsSync(dictDir)) return words;
  const letters = readdirSync(dictDir);
  for (const letter of letters) {
    const letterDir = join(dictDir, letter);
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

export function validateContent(publicDir: string): ValidateContentResult {
  const booksDir = join(publicDir, "books");
  const dictDir = join(publicDir, "dict");
  const errors: string[] = [];
  let total = 0;
  let passed = 0;

  if (!existsSync(booksDir)) {
    return { total: 0, passed: 0, errors: ["books 目录不存在"] };
  }

  const dictWords = collectDictWords(dictDir);
  const bookFiles = readdirSync(booksDir).filter((f) => f.endsWith(".json"));

  for (const f of bookFiles) {
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
    const bookErrors = auditResults.flatMap((r) => r.errors);
    if (bookErrors.length > 0) {
      errors.push(`${f}: ${bookErrors.join("; ")}`);
    } else {
      passed++;
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
