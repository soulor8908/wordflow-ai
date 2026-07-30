/**
 * 词书类型定义（客户端安全：无 zod 运行时依赖）
 *
 * 运行时校验 schema 见 `lib/content/schemas.ts`（仅构建期 / 服务端使用）。
 * 客户端只消费这里的纯类型；JSON 数据由构建脚本预先校验，运行时只需
 * 轻量结构检查（见 `lib/content/book-index.ts` 与 `lib/review/book-queue.ts`）。
 */
export type SourceLevel = "T0" | "T1" | "T2" | "T3";

export interface Source {
  level: SourceLevel;
  name: string;
}

export interface WordEntry {
  word: string;
  pos?: string;
  translation: string;
  frequency?: number;
  phonetic?: string;
}

/** 完整词书（内嵌 words 数组，适用于小词书/样本） */
export interface WordBook {
  id: string;
  name: string;
  description: string;
  dailyNew: number;
  sources: Source[];
  words: WordEntry[];
}

/** 切片化词书索引（words 在 chunk 文件中，按需加载） */
export interface SlicedBookIndex {
  id: string;
  name: string;
  description: string;
  dailyNew: number;
  sources: Source[];
  sliced: true;
  wordCount: number;
  chunkSize: number;
  chunkCount: number;
  chunks: string[];
}

/** 词书元信息（索引文件中的一条记录） */
export type BookColor =
  | "blue"
  | "purple"
  | "green"
  | "orange"
  | "red"
  | "amber"
  | "slate";

export interface BookMeta {
  id: string;
  name: string;
  description: string;
  level: string;
  wordCount: number;
  dailyNew: number;
  color: BookColor;
  sliced?: boolean;
  chunkCount?: number;
}

export interface BookIndex {
  books: BookMeta[];
}
