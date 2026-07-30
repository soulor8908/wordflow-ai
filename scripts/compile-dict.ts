#!/usr/bin/env tsx
/**
 * 词典数据管线脚本（设计文档 §4.2：compile-dict.ts）
 *
 * 输入：ECDICT CSV（77 万词条 MIT 协议）
 * 输出：public/dict-data/{a-z}/{prefix}.json 切片
 *
 * 用法：
 *   tsx scripts/compile-dict.ts <ecdict.csv> [output-dir]
 *
 * 默认 output-dir = public/。CSV 需含 header：word,phonetic,definition,translation,pos,tag,frq,bnc
 *
 * 若无 ECDICT.csv，可先用 scripts/seed-sample-dict.ts 生成小样本数据用于本地开发。
 */
import { createReadStream, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline";
import {
  parseEcdictRow,
  buildSliceFiles,
  type RawEcdictRow,
} from "@/scripts/compile-dict-core";
import type { DictEntry } from "@/lib/dict/dict-loader";

function parseCsvLine(line: string): string[] {
  // 简易 CSV 解析：支持双引号包裹（含逗号）
  const fields: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        fields.push(cur);
        cur = "";
      } else {
        cur += ch;
      }
    }
  }
  fields.push(cur);
  return fields;
}

async function main(): Promise<void> {
  const csvPath = process.argv[2];
  const outDir = resolve(process.argv[3] ?? "public");

  if (!csvPath) {
    console.error("Usage: tsx scripts/compile-dict.ts <ecdict.csv> [output-dir]");
    console.error("  无 ECDICT.csv？先跑 scripts/seed-sample-dict.ts 生成小样本。");
    process.exit(1);
  }

  console.log(`[compile-dict] 读取 CSV: ${csvPath}`);
  console.log(`[compile-dict] 输出目录: ${outDir}/dict-data/`);

  const entries: DictEntry[] = [];
  let header: string[] | null = null;
  let skipped = 0;

  const rl = createInterface({
    input: createReadStream(csvPath, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (line.trim().length === 0) continue;
    const fields = parseCsvLine(line);
    if (header === null) {
      header = fields.map((f) => f.trim());
      continue;
    }
    const row: Record<string, string> = {};
    header.forEach((h, i) => {
      row[h] = fields[i] ?? "";
    });
    const raw: RawEcdictRow = {
      word: row.word,
      phonetic: row.phonetic,
      definition: row.definition,
      translation: row.translation,
      pos: row.pos,
      tag: row.tag,
      frq: row.frq,
      bnc: row.bnc,
      collins: row.collins,
      oxford: row.oxford,
      exchange: row.exchange,
    };
    try {
      entries.push(parseEcdictRow(raw));
    } catch {
      skipped++;
    }
  }

  if (header === null) {
    console.error("[compile-dict] CSV 无 header 行，无法解析。");
    process.exit(1);
  }

  console.log(`[compile-dict] 解析完成：${entries.length} 条有效，跳过 ${skipped} 条无效`);

  const files = buildSliceFiles(entries);
  for (const file of files) {
    const absPath = join(outDir, file.path);
    mkdirSync(dirname(absPath), { recursive: true });
    writeFileSync(absPath, file.content, "utf8");
  }
  console.log(`[compile-dict] 写入 ${files.length} 个切片文件到 ${outDir}/dict-data/`);
}

main().catch((err) => {
  console.error("[compile-dict] 失败:", err);
  process.exit(1);
});
