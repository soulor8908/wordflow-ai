/**
 * 词典数据模型与切片加载器（设计文档 §4.1 静态切片：dict/{a-z}/{prefix}.json，单片 <50KB）
 *
 * 切片策略：按前 2 字符分片（ab/ac/...），单切片含若干 DictEntry。
 * 浏览器端按需 fetch 对应切片，命中后缓存到内存，避免重复请求。
 * 失败（404/网络错误）不缓存，允许后续重试。
 */
import type { SearchEntry } from "@/lib/search/search-engine";

export interface DictExample {
  en: string;
  zh: string;
}

/** 常见搭配（动名/形名/介词搭配等） */
export interface DictCollocation {
  /** 搭配类型，如 "verb+noun" / "adj+noun" / "prep+noun" */
  type?: string;
  /** 搭配英文，如 "abandon hope" */
  en: string;
  /** 搭配中文释义，如 "放弃希望" */
  zh?: string;
}

/**
 * 词典词条（对齐 ECDICT 字段 + 设计文档 §3.2 词条页信息层级）
 * ECDICT 原始字段：word/phonetic/definition/translation/pos/tag/frq/bnc/collins/oxford/exchange
 *
 * 联想学习字段（设计文档 §3.2 词条页联想记忆区）：
 * - root：词根词缀助记（已有）
 * - synonyms：同近义词（已有）
 * - antonyms：反义词
 * - collocations：常见搭配
 * - wordFamily：词族派生（名词/动词/形容词/副词形式）
 */
export interface DictEntry {
  word: string;
  /** 音标，如 "/əˈbændən/" */
  phonetic?: string;
  /** 词性，如 "v." / "n." */
  pos?: string;
  /** 中文释义（核心，按词频排序） */
  translation: string;
  /** 英文释义（可选） */
  definition?: string;
  /** COCA/BNC 词频，越大越常用 */
  frequency?: number;
  /** 考纲标签：kaoyan / cet4 / cet6 / ielts / toefl */
  tags?: string[];
  /** 词根词缀助记 */
  root?: string;
  /** 例句（≤3 条，可换） */
  examples?: DictExample[];
  /** 同近义词 */
  synonyms?: string[];
  /** 反义词（联想记忆：对比成对记忆，如 abandon ↔ retain） */
  antonyms?: string[];
  /** 常见搭配（联想记忆：在真实语境中如何使用） */
  collocations?: DictCollocation[];
  /** 词族派生（联想记忆：同源词形变化，如 abandon → abandonment） */
  wordFamily?: string[];
}

/** 计算词条所属切片 key（前 2 字符小写；短词回退到整词） */
export function sliceKeyForWord(word: string): string {
  if (!word) throw new Error("sliceKeyForWord: word must be non-empty");
  return word.toLowerCase().slice(0, 2);
}

/** 构建切片 URL：/dict-data/{首字母}/{sliceKey}.json */
export function sliceUrlForWord(word: string): string {
  const key = sliceKeyForWord(word);
  return `/dict-data/${key[0]}/${key}.json`;
}

const sliceCache = new Map<string, Promise<DictEntry[]>>();

/**
 * 按需加载词条所在切片。成功结果缓存到内存；失败不缓存，允许重试。
 * 使用浏览器 HTTP 缓存（cache: "force-cache"），配合 PWA Service Worker 的
 * stale-while-revalidate 策略（设计文档 §4.5）。
 */
export async function loadDictSlice(word: string): Promise<DictEntry[]> {
  const key = sliceKeyForWord(word);
  const cached = sliceCache.get(key);
  if (cached) return cached;

  const url = sliceUrlForWord(word);
  const p = fetch(url, { cache: "force-cache" })
    .then((res) => {
      if (!res.ok) {
        sliceCache.delete(key);
        return [] as DictEntry[];
      }
      return res.json() as Promise<DictEntry[]>;
    })
    .catch(() => {
      sliceCache.delete(key);
      return [] as DictEntry[];
    });

  sliceCache.set(key, p);
  return p;
}

/** 在切片中查找精确匹配的词条（大小写无关） */
export async function findEntry(word: string): Promise<DictEntry | undefined> {
  const slice = await loadDictSlice(word);
  const lower = word.toLowerCase();
  return slice.find((e) => e.word.toLowerCase() === lower);
}

/** 把 DictEntry 转为查词引擎用的 SearchEntry */
export function toSearchEntry(entry: DictEntry): SearchEntry {
  return { word: entry.word, frequency: entry.frequency ?? 0 };
}

/** 测试用：清空切片内存缓存，确保测试间隔离 */
export function resetSliceCacheForTest(): void {
  sliceCache.clear();
}
