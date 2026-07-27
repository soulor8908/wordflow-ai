import { z } from "zod";

const sourceLevelSchema = z.enum(["T0", "T1", "T2", "T3"]);

export const wordBookSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "id must be kebab-case"),
    name: z.string(),
    description: z.string(),
    dailyNew: z.number().int().min(1).max(100),
    sources: z
      .array(
        z.object({
          level: sourceLevelSchema,
          name: z.string(),
        })
      )
      .min(2, "At least 2 sources required"),
    words: z
      .array(
        z.object({
          word: z.string(),
          pos: z.string().optional(),
          translation: z.string(),
          frequency: z.number().optional(),
        })
      )
      .min(1, "At least 1 word required"),
  })
  .refine(
    (book) => book.sources.some((s) => s.level === "T0" || s.level === "T1"),
    { message: "At least 1 T0/T1 source required" }
  );

export type WordBook = z.infer<typeof wordBookSchema>;
export type SourceLevel = z.infer<typeof sourceLevelSchema>;
