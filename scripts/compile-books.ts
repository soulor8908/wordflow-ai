#!/usr/bin/env tsx
/**
 * 词书编译脚本（设计文档 §4.2：compile-books.ts）
 *
 * 输入：词书 YAML（zod schema 校验，见 lib/content/word-book-schema.ts）
 * 输出：public/book-data/{id}.json
 *
 * 用法：
 *   tsx scripts/compile-books.ts <book.yaml> [output-dir]
 *   tsx scripts/compile-books.ts books/kaoyan.yaml books/cet4.yaml  # 多文件
 *
 * YAML 解析用 js-yaml（轻量，构建期依赖）。若未安装，回退到内置简单解析器（仅支持本仓库词书格式）。
 */
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { wordBookSchema, type WordBook } from "@/lib/content/word-book-schema";

/** 简易 YAML 解析（仅支持词书用到的扁平结构 + 数组）。生产建议用 js-yaml。 */
function parseSimpleYaml(yaml: string): unknown {
  // 优先用 js-yaml（若安装）
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const yamlMod = require("js-yaml") as { load: (s: string) => unknown };
    return yamlMod.load(yaml);
  } catch {
    // 回退：不支持，提示安装
    throw new Error(
      "compile-books 需要 js-yaml 解析 YAML。请运行 `npm i -D js-yaml @types/js-yaml`，" +
        "或改用 JSON 格式词书。"
    );
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error(
      "Usage: tsx scripts/compile-books.ts <book.yaml> [...] [output-dir]"
    );
    process.exit(1);
  }
  // 最后一个参数若以 .yaml/.yml/.json 结尾视为输入，否则视为 output-dir
  const last = args[args.length - 1];
  const isOutputDir = !/\.(ya?ml|json)$/i.test(last);
  const inputs = isOutputDir ? args.slice(0, -1) : args;
  const outDir = resolve(isOutputDir ? last : "public");

  let total = 0;
  for (const inputPath of inputs) {
    const raw = readFileSync(resolve(inputPath), "utf8");
    const isJson = /\.json$/i.test(inputPath);
    const parsed = isJson ? JSON.parse(raw) : parseSimpleYaml(raw);

    const result = wordBookSchema.safeParse(parsed);
    if (!result.success) {
      console.error(`[compile-books] ${inputPath} 校验失败:`);
      console.error(JSON.stringify(result.error.flatten(), null, 2));
      process.exit(1);
    }
    const book: WordBook = result.data;
    const outPath = join(outDir, "book-data", `${book.id}.json`);
    mkdirSync(join(outDir, "book-data"), { recursive: true });
    writeFileSync(outPath, JSON.stringify(book), "utf8");
    console.log(`[compile-books] ${inputPath} → ${outPath} (${book.words.length} 词)`);
    total++;
  }
  console.log(`[compile-books] 编译完成：${total} 本词书`);
}

main().catch((err) => {
  console.error("[compile-books] 失败:", err);
  process.exit(1);
});
