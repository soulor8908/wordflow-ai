// 一次性脚本：扫描词书 chunk 文件，找出基础词库切片里缺失的单词
// 用法: node tmp-scan-missing.mjs
import { readFileSync, existsSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = '/workspace';
const BOOKS_DIR = join(ROOT, 'public', 'books');
const DICT_DIR = join(ROOT, 'public', 'dict');

function sliceKeyForWord(word) {
  return String(word).toLowerCase().slice(0, 2);
}

function slicePathForKey(key) {
  return join(DICT_DIR, key[0], `${key}.json`);
}

// 切片缓存：key -> Set(entry.word.toLowerCase())
const sliceCache = new Map();

function loadSlice(key) {
  if (sliceCache.has(key)) return sliceCache.get(key);
  const path = slicePathForKey(key);
  let set;
  if (!existsSync(path)) {
    set = null; // 切片文件不存在
  } else {
    try {
      const arr = JSON.parse(readFileSync(path, 'utf8'));
      set = new Set();
      if (Array.isArray(arr)) {
        for (const e of arr) {
          if (e && typeof e.word === 'string') set.add(e.word.toLowerCase());
        }
      }
    } catch (err) {
      set = null; // 解析失败视为不可用
    }
  }
  sliceCache.set(key, set);
  return set;
}

function wordInDict(word) {
  const key = sliceKeyForWord(word);
  const set = loadSlice(key);
  if (!set) return false;
  return set.has(String(word).toLowerCase());
}

// 1. 读取词书列表
const booksIndex = JSON.parse(readFileSync(join(BOOKS_DIR, 'index.json'), 'utf8'));
const books = booksIndex.books || [];

// 每个词书收集的单词列表（保留重复以便统计词频），以及去重集合
const perBook = [];
const allMissingSet = new Set(); // 全局缺失去重
const allMissingFreq = []; // {word, bookCount} 用于词频分布
const wordToBookCount = new Map(); // 缺失词 -> 出现在几个词书

let totalWordsScanned = 0;
let totalMissingOccurrences = 0;

for (const book of books) {
  const bookId = book.id;
  const bookDir = join(BOOKS_DIR, bookId);
  // 列出所有 chunk-NNN.json
  let files = [];
  try {
    files = readdirSync(bookDir)
      .filter((f) => /^chunk-\d+\.json$/.test(f))
      .sort();
  } catch (err) {
    files = [];
  }

  const words = []; // 该词书所有 word（含重复）
  for (const f of files) {
    try {
      const arr = JSON.parse(readFileSync(join(bookDir, f), 'utf8'));
      if (Array.isArray(arr)) {
        for (const e of arr) {
          if (e && typeof e.word === 'string' && e.word.length > 0) {
            words.push(e.word);
          }
        }
      }
    } catch (err) {
      // 跳过损坏的 chunk
    }
  }

  const missingWords = []; // 该词书缺失词（含重复，按出现顺序）
  const missingSet = new Set();
  for (const w of words) {
    if (!wordInDict(w)) {
      missingWords.push(w);
      missingSet.add(w.toLowerCase());
      allMissingSet.add(w);
    }
  }

  // 词频分布：基于该词书 chunk 里 word 出现次数（粗略词频）
  // 同时统计全局缺失词在多少个词书出现
  for (const w of missingSet) {
    wordToBookCount.set(w, (wordToBookCount.get(w) || 0) + 1);
  }

  perBook.push({
    id: bookId,
    name: book.name,
    declaredWordCount: book.wordCount,
    chunkCount: book.chunkCount,
    actualChunkFiles: files.length,
    scannedWords: words.length,
    missingCount: missingSet.size,
    missingOccurrences: missingWords.length,
    missingWords: Array.from(missingSet).sort((a, b) => a.localeCompare(b)),
  });

  totalWordsScanned += words.length;
  totalMissingOccurrences += missingWords.length;
}

// 全局去重缺失词（按字母排序）
const allMissingSorted = Array.from(allMissingSet).sort((a, b) =>
  a.localeCompare(b)
);

// 词频分布：用每个缺失词在词书中出现的"词书数"作为分布依据
const distBuckets = {
  '1 词书': 0,
  '2 词书': 0,
  '3 词书': 0,
  '4 词书': 0,
  '5 词书': 0,
};
for (const w of allMissingSorted) {
  const c = wordToBookCount.get(w.toLowerCase()) || 0;
  const key = `${c} 词书`;
  if (distBuckets[key] !== undefined) distBuckets[key]++;
}

// 额外：按词书引用次数排序的缺失词（被多本词书引用 = 更"高频/重要"）
const missingByBookCount = allMissingSorted
  .map((w) => ({ word: w, bookCount: wordToBookCount.get(w.toLowerCase()) || 0 }))
  .sort((a, b) => b.bookCount - a.bookCount || a.word.localeCompare(b.word));

// 4. 写出文件
const wordsFile = join(ROOT, 'tmp-missing-words.txt');
writeFileSync(wordsFile, allMissingSorted.join('\n') + '\n', 'utf8');

const reportLines = [];
reportLines.push('===== 词书缺失词统计报告 =====');
reportLines.push(`生成时间: ${new Date().toISOString()}`);
reportLines.push('');
reportLines.push('--- 总览 ---');
reportLines.push(`扫描词书数: ${perBook.length}`);
reportLines.push(`扫描单词总数(含重复): ${totalWordsScanned}`);
reportLines.push(`缺失出现次数(含重复): ${totalMissingOccurrences}`);
reportLines.push(`缺失词去重总数: ${allMissingSorted.length}`);
reportLines.push('');
reportLines.push('--- 每个词书缺失情况 ---');
reportLines.push(
  '词书ID'.padEnd(14) +
    '声明词数'.padEnd(10) +
    '实际词数'.padEnd(10) +
    '缺失词数'.padEnd(10) +
    '缺失占比'.padEnd(10) +
    '词书名'
);
for (const b of perBook) {
  const ratio = b.scannedWords > 0 ? (b.missingCount / b.scannedWords * 100).toFixed(2) + '%' : 'N/A';
  reportLines.push(
    b.id.padEnd(14) +
      String(b.declaredWordCount).padEnd(10) +
      String(b.scannedWords).padEnd(10) +
      String(b.missingCount).padEnd(10) +
      ratio.padEnd(10) +
      b.name
  );
}
reportLines.push('');
reportLines.push('--- 缺失词词频分布（按被多少个词书引用）---');
for (const [k, v] of Object.entries(distBuckets)) {
  reportLines.push(`${k}: ${v} 个`);
}
reportLines.push('');
reportLines.push('--- 被多本词书引用的缺失词（Top 50，按引用词书数降序）---');
const top50ByBook = missingByBookCount.slice(0, 50);
for (const item of top50ByBook) {
  reportLines.push(`${item.word}\t${item.bookCount} 词书`);
}
reportLines.push('');
reportLines.push('--- 全部缺失词（按字母排序）---');
for (const w of allMissingSorted) {
  reportLines.push(w);
}
writeFileSync(join(ROOT, 'tmp-missing-report.txt'), reportLines.join('\n') + '\n', 'utf8');

// 5. 控制台输出摘要
console.log('===== 扫描完成 =====');
console.log(`缺失词去重总数: ${allMissingSorted.length}`);
console.log(`扫描单词总数(含重复): ${totalWordsScanned}`);
console.log('');
console.log('每个词书缺失数:');
for (const b of perBook) {
  console.log(`  ${b.id}: ${b.missingCount} (扫描 ${b.scannedWords} 词)`);
}
console.log('');
console.log('词频分布(被多少词书引用):');
for (const [k, v] of Object.entries(distBuckets)) {
  console.log(`  ${k}: ${v}`);
}
console.log('');
console.log('前 50 个缺失词样本(按字母排序):');
console.log(allMissingSorted.slice(0, 50).join(', '));
console.log('');
console.log('被多本词书引用的缺失词 Top 20:');
for (const item of missingByBookCount.slice(0, 20)) {
  console.log(`  ${item.word}  (${item.bookCount} 词书)`);
}
console.log('');
console.log(`已写入: ${wordsFile}`);
console.log(`已写入: ${join(ROOT, 'tmp-missing-report.txt')}`);
