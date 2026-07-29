#!/usr/bin/env tsx
/**
 * 从 public/dict 各字母子目录下的切片 JSON 重建扁平 search-index.json。
 *
 * 背景：seed-sample-dict.ts 只写入 10 个样本词条到 search-index.json，
 * 而 seed-real-dict.ts / compile-dict.ts 增强了 dict 切片却不会刷新索引，
 * 导致搜索框只能搜到样本词。本脚本扫描所有真实切片，重建完整索引。
 *
 * 用法：pnpm dict:index [public]
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { DictEntry } from "@/lib/dict/dict-loader";
import type { SearchEntry } from "@/lib/search/search-engine";

function listSliceFiles(dictRoot: string): string[] {
  const out: string[] = [];
  let letters: string[];
  try {
    letters = readdirSync(dictRoot);
  } catch {
    return out;
  }
  for (const letter of letters) {
    const letterDir = join(dictRoot, letter);
    if (!statSync(letterDir).isDirectory()) continue;
    let files: string[];
    try {
      files = readdirSync(letterDir);
    } catch {
      continue;
    }
    for (const f of files) {
      if (f.endsWith(".json")) out.push(join(letterDir, f));
    }
  }
  return out;
}

function main() {
  const publicDir = resolve(process.argv[2] ?? "public");
  const dictRoot = join(publicDir, "dict-data");
  const files = listSliceFiles(dictRoot);

  if (files.length === 0) {
    console.error(`[build-search-index] 未在 ${dictRoot} 下找到任何切片，终止。`);
    process.exit(1);
  }

  const seen = new Set<string>();
  const entries: SearchEntry[] = [];

  for (const file of files) {
    const raw = readFileSync(file, "utf8");
    let arr: DictEntry[];
    try {
      arr = JSON.parse(raw) as DictEntry[];
    } catch {
      console.warn(`[build-search-index] 跳过非法 JSON：${file}`);
      continue;
    }
    if (!Array.isArray(arr)) {
      console.warn(`[build-search-index] 跳过非数组：${file}`);
      continue;
    }
    for (const e of arr) {
      const w = e?.word?.trim();
      if (!w) continue;
      const key = w.toLowerCase();
      // 同一切片内可能因增强脚本重复写入，全局去重保留首条（frequency 更高）
      if (seen.has(key)) continue;
      seen.add(key);
      entries.push({ word: w, frequency: e.frequency ?? 0 });
    }
  }

  // 按词频降序，便于桶内排序与高频优先展示
  entries.sort((a, b) => (b.frequency ?? 0) - (a.frequency ?? 0));

  const outPath = join(publicDir, "search-index.json");
  writeFileSync(outPath, JSON.stringify(entries), "utf8");

  console.log(
    `[build-search-index] 扫描 ${files.length} 个切片，写入 ${entries.length} 条索引到 ${outPath}`
  );
}

main();
