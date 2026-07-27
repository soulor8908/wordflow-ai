/**
 * 查词引擎纯函数（设计文档 §3.2：前缀补全 + 模糊纠错，首屏 <100ms）
 *
 * 设计要点：
 * - 前缀索引：按前 N 字符分桶，桶内按词频降序，O(bucket) 查询而非 O(n) 全量扫描
 * - 模糊纠错：Levenshtein 距离，前缀无命中时回退
 * - 大小写无关：所有比较统一转小写
 */

export interface SearchEntry {
  word: string;
  /** COCA/BNC 词频，越大越常用；缺省视为 0 */
  frequency?: number;
}

export interface PrefixIndex {
  readonly bucketSize: number;
  /** 桶 key → 已按词频降序排序的词条 */
  readonly buckets: Map<string, SearchEntry[]>;
}

/**
 * 构建前缀索引。桶 key = word 前 min(word.length, bucketSize) 字符（小写）。
 * 每个 bucket 内按 frequency 降序，保证高频词优先返回。
 */
export function buildPrefixIndex(
  entries: SearchEntry[],
  bucketSize = 2
): PrefixIndex {
  const buckets = new Map<string, SearchEntry[]>();
  for (const entry of entries) {
    const w = entry.word.toLowerCase();
    const key = w.slice(0, Math.min(w.length, bucketSize));
    if (!key) continue;
    const bucket = buckets.get(key) ?? [];
    bucket.push(entry);
    buckets.set(key, bucket);
  }
  for (const bucket of buckets.values()) {
    bucket.sort((a, b) => (b.frequency ?? 0) - (a.frequency ?? 0));
  }
  return { bucketSize, buckets };
}

/**
 * 前缀补全查询。
 * - query 长度 >= bucketSize：定位桶后桶内过滤
 * - query 长度 <  bucketSize：扫描所有桶（首字母级查询）
 * 结果按词频降序，可限 limit。
 */
export function searchByPrefix(
  index: PrefixIndex,
  prefix: string,
  limit?: number
): SearchEntry[] {
  const p = prefix.toLowerCase();
  if (p.length === 0) return [];

  let candidates: SearchEntry[];
  if (p.length >= index.bucketSize) {
    const key = p.slice(0, index.bucketSize);
    const bucket = index.buckets.get(key) ?? [];
    candidates = bucket.filter((e) => e.word.toLowerCase().startsWith(p));
  } else {
    candidates = [];
    for (const bucket of index.buckets.values()) {
      for (const e of bucket) {
        if (e.word.toLowerCase().startsWith(p)) candidates.push(e);
      }
    }
    candidates.sort((a, b) => (b.frequency ?? 0) - (a.frequency ?? 0));
  }

  return limit !== undefined ? candidates.slice(0, limit) : candidates;
}

/**
 * Levenshtein 编辑距离（标准 DP，O(m*n)）。
 * 大小写无关：比较前统一转小写。
 */
export function levenshtein(a: string, b: string): number {
  const s = a.toLowerCase();
  const t = b.toLowerCase();
  const m = s.length;
  const n = t.length;
  if (m === 0) return n;
  if (n === 0) return m;

  // 滚动数组，prev = 上一行，curr = 当前行
  let prev = new Array<number>(n + 1);
  let curr = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = s.charCodeAt(i - 1) === t.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1, // 删除
        curr[j - 1] + 1, // 插入
        prev[j - 1] + cost // 替换
      );
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

/**
 * 模糊纠错：返回与 query 编辑距离 <= maxDistance 的词条，按距离升序、词频降序排序。
 */
export function fuzzyCorrect(
  entries: SearchEntry[],
  query: string,
  maxDistance: number,
  limit?: number
): SearchEntry[] {
  if (query.length === 0) return [];
  const q = query.toLowerCase();
  const scored = entries
    .map((e) => ({ entry: e, dist: levenshtein(q, e.word) }))
    .filter((x) => x.dist <= maxDistance);
  scored.sort((a, b) => {
    if (a.dist !== b.dist) return a.dist - b.dist;
    return (b.entry.frequency ?? 0) - (a.entry.frequency ?? 0);
  });
  const result = scored.map((x) => x.entry);
  return limit !== undefined ? result.slice(0, limit) : result;
}

/**
 * 组合查询：先前缀补全（高频优先），无命中时回退模糊纠错。
 * 设计文档 §3.2：输入即搜，前缀优先保证 <100ms，纠错兜底。
 */
export function search(
  index: PrefixIndex,
  entries: SearchEntry[],
  query: string,
  limit: number
): SearchEntry[] {
  if (query.trim().length === 0) return [];
  const prefixResults = searchByPrefix(index, query);
  if (prefixResults.length > 0) {
    return prefixResults.slice(0, limit);
  }
  return fuzzyCorrect(entries, query, 2, limit);
}
