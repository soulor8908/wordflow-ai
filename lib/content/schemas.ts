/**
 * Zod 运行时校验 schema（仅构建期 / 服务端使用，**禁止**在客户端组件中 import）
 *
 * 拆分原因：zod 库 ~280KB（gzip 64KB），若被客户端组件传递引用，
 * 会被打包进 lazy chunk，对 Cloudflare 国内首屏体积敏感场景不划算。
 * 客户端只消费类型（见 word-book-schema.ts），运行时校验落到本文件，
 * 仅在 scripts/* 与 API route 中引用。
 */
import { z } from "zod";

const sourceLevelSchema = z.enum(["T0", "T1", "T2", "T3"]);

const sourceSchema = z.object({
  level: sourceLevelSchema,
  name: z.string(),
});

const wordEntrySchema = z.object({
  word: z.string(),
  pos: z.string().optional(),
  translation: z.string(),
  frequency: z.number().optional(),
  phonetic: z.string().optional(),
});

/** 完整词书（内嵌 words 数组，适用于小词书/样本） */
export const wordBookSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "id must be kebab-case"),
    name: z.string(),
    description: z.string(),
    dailyNew: z.number().int().min(1).max(100),
    sources: z.array(sourceSchema).min(2, "At least 2 sources required"),
    words: z.array(wordEntrySchema).min(1, "At least 1 word required"),
  })
  .refine(
    (book) => book.sources.some((s) => s.level === "T0" || s.level === "T1"),
    { message: "At least 1 T0/T1 source required" }
  );

/** 切片化词书索引（words 在 chunk 文件中，按需加载） */
export const slicedBookIndexSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "id must be kebab-case"),
  name: z.string(),
  description: z.string(),
  dailyNew: z.number().int().min(1).max(100),
  sources: z.array(sourceSchema).min(2, "At least 2 sources required"),
  sliced: z.literal(true),
  wordCount: z.number().int().min(1),
  chunkSize: z.number().int().min(1),
  chunkCount: z.number().int().min(1),
  chunks: z.array(z.string()).min(1),
});

export const bookMetaSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  level: z.string(),
  wordCount: z.number().int().positive(),
  dailyNew: z.number().int().positive(),
  color: z.enum(["blue", "purple", "green", "orange", "red", "amber", "slate"]),
  sliced: z.boolean().optional(),
  chunkCount: z.number().int().optional(),
});

export const bookIndexSchema = z.object({
  books: z.array(bookMetaSchema),
});

// 类型从 word-book-schema.ts re-export，避免客户端为类型 import 本文件（会拉入 zod）
export type {
  BookMeta,
  BookIndex,
  BookColor,
} from "@/lib/content/word-book-schema";
