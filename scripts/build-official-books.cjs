#!/usr/bin/env node
/**
 * 官方词库构建管线（生产级）
 *
 * 输入：mahavivo/english-wordlists 官方大纲词表（CET4/CET6/NPEE/Highschool）
 *   - CET4_edited.txt / CET6_edited.txt / NPEE_Wordlist.txt: word [phonetic] pos translation
 *   - Highschool_edited.txt: word only（高考词表无释义，交叉引用 CET4/CET6/考研 补全）
 *
 * 输出：切片化词库
 *   - public/books/{id}/index.json  — 元数据 + chunk 清单（不含 words 数组）
 *   - public/books/{id}/chunk-NNN.json — 每 100 词一个切片
 *
 * 用法：node scripts/build-official-books.cjs <wordlists-dir> [output-dir]
 *   wordlists-dir 含 CET4_edited.txt / CET6_edited.txt / NPEE_Wordlist.txt / Highschool_edited.txt
 */
"use strict";

const fs = require("fs");
const path = require("path");

const CHUNK_SIZE = 100;

// ───────────────────────── 解析器 ─────────────────────────

/**
 * 解析带释义的词表行（CET4/CET6/考研格式）
 * 格式：word [phonetic] pos+translation  或  word pos+translation（无音标）
 */
function parseRichLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return null;

  // 词条必须以小写英文字母开头（跳过标题行、字母分隔行、注释行、中文行）
  if (!/^[a-z]/.test(trimmed)) return null;

  // 匹配：word [phonetic] pos+translation
  const match = trimmed.match(/^(\S+)\s+(?:\[([^\]]*)\]\s+)?(.+)$/);
  if (!match) return null;

  const word = match[1].toLowerCase();
  // 跳过单个字母（如 "a" 单独一行作为字母分隔的情况）
  if (word.length === 1 && word !== "a") return null;
  const phonetic = match[2] || "";
  let rest = match[3].trim();

  // 提取词性前缀（vt./vi./n./v./a./adj./ad./adv./prep./conj./pron./art./num./int./aux. 等）
  const posMatch = rest.match(
    /^(v\.|vt\.|vi\.|n\.|a\.|adj\.|ad\.|adv\.|prep\.|conj\.|pron\.|art\.|num\.|int\.|aux\.|pl\.|modal\.| det\.)\s*(.*)$/
  );
  let pos = "";
  let translation = rest;
  if (posMatch) {
    pos = posMatch[1];
    translation = posMatch[2].trim();
  }

  // 清理 translation 中多余的编号（1. 2. 3.）
  // 保留原样，只做轻度清理
  translation = translation.replace(/\s{2,}/g, " ").trim();

  return { word, phonetic, pos, translation };
}

/**
 * 解析纯单词列表（高考格式：每行一个单词）
 */
function parsePlainLine(line) {
  const word = line.trim().toLowerCase();
  if (!word) return null;
  if (/^[A-Z]$/.test(word)) return null; // 跳过字母分隔行
  if (!/^[a-z][a-z''-]*$/.test(word)) return null; // 只保留纯英文单词
  return word;
}

function parseFile(filePath, parser) {
  const content = fs.readFileSync(filePath, "utf8");
  // 移除 BOM
  const clean = content.replace(/^\uFEFF/, "");
  const results = [];
  const seen = new Set();
  for (const line of clean.split(/\r?\n/)) {
    const parsed = parser(line);
    if (!parsed) continue;
    const word = typeof parsed === "string" ? parsed : parsed.word;
    if (seen.has(word)) continue; // 去重
    seen.add(word);
    results.push(parsed);
  }
  return results;
}

// ───────────────────────── 交叉引用补全 ─────────────────────────

/**
 * 构建翻译查找表：word -> { pos, translation, phonetic }
 */
function buildTranslationLookup(richBooks) {
  const lookup = new Map();
  for (const entries of Object.values(richBooks)) {
    for (const e of entries) {
      if (!lookup.has(e.word)) {
        lookup.set(e.word, {
          pos: e.pos,
          translation: e.translation,
          phonetic: e.phonetic,
        });
      }
    }
  }
  return lookup;
}

/**
 * 为纯单词列表补全释义（优先从 CET4 → CET6 → 考研 查找）
 */
function enrichPlainWords(plainWords, lookup) {
  const enriched = [];
  let missing = 0;
  for (const word of plainWords) {
    const ref = lookup.get(word);
    if (ref) {
      enriched.push({
        word,
        pos: ref.pos,
        translation: ref.translation,
        phonetic: ref.phonetic,
      });
    } else {
      // 未找到释义的词：标记为待补充，仍收入词库（frequency=0）
      enriched.push({
        word,
        pos: "",
        translation: "（待补充释义）",
        phonetic: "",
      });
      missing++;
    }
  }
  return { enriched, missing };
}

// ───────────────────────── 频率估算 ─────────────────────────

/**
 * 基于 COCA 频率分级给词赋 frequency 值。
 * 简化方案：按词在词表中的位置估算（词表通常按字母排序，前几页多为高频词）。
 * 实际生产应从 COCA 频率表加载，这里用位置倒数做近似。
 */
function estimateFrequency(index, total) {
  // 越靠前频率越高，范围 1000-9000
  const ratio = index / total;
  return Math.round(9000 - ratio * 4000); // 9000（最前）→ 5000（最后）
}

// ───────────────────────── 切片写入 ─────────────────────────

const BOOK_META = {
  "cet4-core": {
    name: "CET-4 大学英语四级核心词",
    description: "大学英语四级大纲词汇，覆盖听读写译高频词（教育部大纲 4615 词）",
    level: "CET-4",
    color: "blue",
    dailyNew: 20,
    sources: [
      { level: "T0", name: "教育部大学英语教学指南" },
      { level: "T2", name: "mahavivo/english-wordlists" },
    ],
  },
  "cet6-core": {
    name: "CET-6 大学英语六级核心词",
    description: "大学英语六级大纲词汇，覆盖学术、商务、社会话题高频词（大纲 2089 词）",
    level: "CET-6",
    color: "purple",
    dailyNew: 20,
    sources: [
      { level: "T0", name: "教育部大学英语教学指南" },
      { level: "T2", name: "mahavivo/english-wordlists" },
    ],
  },
  "gaokao-core": {
    name: "高考英语核心词",
    description: "高考英语大纲词汇，覆盖初高中阶段高频核心词（课标 3500 词）",
    level: "高考",
    color: "green",
    dailyNew: 25,
    sources: [
      { level: "T0", name: "教育部普通高中英语课程标准" },
      { level: "T2", name: "mahavivo/english-wordlists" },
    ],
  },
  "kaoyan-core": {
    name: "考研英语核心词",
    description: "全国硕士研究生入学考试英语大纲词汇，覆盖历年真题高频词与学术词汇（大纲 5500 词）",
    level: "考研",
    color: "orange",
    dailyNew: 20,
    sources: [
      { level: "T0", name: "教育部考研英语考试大纲" },
      { level: "T2", name: "mahavivo/english-wordlists" },
    ],
  },
};

/**
 * 构建切片化词库：
 * - public/books/{id}/index.json — 元数据 + chunk 清单
 * - public/books/{id}/chunk-NNN.json — 100 词/切片
 */
function buildSlicedBook(bookId, entries, outputDir) {
  const meta = BOOK_META[bookId];
  if (!meta) throw new Error(`未知词库: ${bookId}`);

  const total = entries.length;
  const chunkCount = Math.ceil(total / CHUNK_SIZE);
  const bookDir = path.join(outputDir, "books", bookId);
  fs.mkdirSync(bookDir, { recursive: true });

  // 赋 frequency
  const wordsWithFreq = entries.map((e, i) => ({
    word: e.word,
    pos: e.pos || undefined,
    translation: e.translation,
    frequency: estimateFrequency(i, total),
    ...(e.phonetic ? { phonetic: e.phonetic } : {}),
  }));

  // 写切片文件
  const chunkFiles = [];
  for (let c = 0; c < chunkCount; c++) {
    const start = c * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, total);
    const chunkWords = wordsWithFreq.slice(start, end);
    const chunkName = `chunk-${String(c).padStart(3, "0")}.json`;
    const chunkPath = path.join(bookDir, chunkName);
    fs.writeFileSync(chunkPath, JSON.stringify(chunkWords), "utf8");
    chunkFiles.push(chunkName);
  }

  // 写 index.json
  const index = {
    id: bookId,
    name: meta.name,
    description: meta.description,
    dailyNew: meta.dailyNew,
    sources: meta.sources,
    sliced: true,
    wordCount: total,
    chunkSize: CHUNK_SIZE,
    chunkCount,
    chunks: chunkFiles,
  };
  fs.writeFileSync(
    path.join(bookDir, "index.json"),
    JSON.stringify(index, null, 2),
    "utf8"
  );

  console.log(
    `  ${bookId}: ${total} 词, ${chunkCount} 切片, ${meta.dailyNew} 词/日`
  );
  return { bookId, total, chunkCount };
}

// ───────────────────────── 主流程 ─────────────────────────

function main() {
  const wordlistsDir = process.argv[2] || "/tmp";
  const outputDir = path.resolve(process.argv[3] || "public");

  console.log("[build-official-books] 词表目录:", wordlistsDir);
  console.log("[build-official-books] 输出目录:", outputDir);
  console.log("[build-official-books] 切片大小:", CHUNK_SIZE, "词/切片");
  console.log("");

  // 1. 解析带释义的词表
  const cet4 = parseFile(
    path.join(wordlistsDir, "cet4.txt"),
    parseRichLine
  ).filter((e) => e.word && e.translation);
  console.log(`CET-4: 解析 ${cet4.length} 词`);

  const cet6 = parseFile(
    path.join(wordlistsDir, "cet6.txt"),
    parseRichLine
  ).filter((e) => e.word && e.translation);
  console.log(`CET-6: 解析 ${cet6.length} 词`);

  const kaoyan = parseFile(
    path.join(wordlistsDir, "kaoyan.txt"),
    parseRichLine
  ).filter((e) => e.word && e.translation);
  console.log(`考研: 解析 ${kaoyan.length} 词`);

  // 2. 解析高考纯单词列表
  const gaokaoRaw = parseFile(
    path.join(wordlistsDir, "gaokao.txt"),
    parsePlainLine
  ).filter((w) => w);
  console.log(`高考: 解析 ${gaokaoRaw.length} 词（无释义，需交叉引用）`);

  // 3. 构建翻译查找表（CET4 + CET6 + 考研）
  const lookup = buildTranslationLookup({ cet4, cet6, kaoyan });
  console.log(`翻译查找表: ${lookup.size} 词`);

  // 4. 为高考词表补全释义
  const { enriched: gaokao, missing: gaokaoMissing } = enrichPlainWords(
    gaokaoRaw,
    lookup
  );
  console.log(
    `高考补全: ${gaokao.length - gaokaoMissing} 词有释义, ${gaokaoMissing} 词待补充\n`
  );

  // 5. 构建切片化词库
  console.log("[build-official-books] 写入切片化词库:");
  const results = [];
  results.push(buildSlicedBook("cet4-core", cet4, outputDir));
  results.push(buildSlicedBook("cet6-core", cet6, outputDir));
  results.push(buildSlicedBook("gaokao-core", gaokao, outputDir));
  results.push(buildSlicedBook("kaoyan-core", kaoyan, outputDir));

  // 6. 更新全局 books/index.json
  const booksIndex = {
    books: results.map((r) => {
      const meta = BOOK_META[r.bookId];
      return {
        id: r.bookId,
        name: meta.name,
        description: meta.description,
        level: meta.level,
        wordCount: r.total,
        dailyNew: meta.dailyNew,
        color: meta.color,
        sliced: true,
        chunkCount: r.chunkCount,
      };
    }),
  };
  const indexPath = path.join(outputDir, "books", "index.json");
  fs.writeFileSync(indexPath, JSON.stringify(booksIndex, null, 2), "utf8");
  console.log(`\n[build-official-books] 更新 books/index.json`);

  // 7. 汇总
  const totalWords = results.reduce((sum, r) => sum + r.total, 0);
  const totalChunks = results.reduce((sum, r) => sum + r.chunkCount, 0);
  console.log(
    `[build-official-books] 完成：${totalWords} 词, ${totalChunks} 切片, 4 词库`
  );
}

main();
