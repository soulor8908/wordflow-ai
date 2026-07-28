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

export type WordBook = z.infer<typeof wordBookSchema>;
export type SlicedBookIndex = z.infer<typeof slicedBookIndexSchema>;
export type SourceLevel = z.infer<typeof sourceLevelSchema>;
export type WordEntry = z.infer<typeof wordEntrySchema>;
