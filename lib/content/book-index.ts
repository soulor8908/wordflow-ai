/**
 * 官方词库索引（设计文档 §3.2 C）
 *
 * 从 /books/index.json 加载所有官方词书的元信息（不含词条数据），
 * 词库管理页用于列表展示；选定后按需 fetch /books/{id}.json 加载词条
 */
import { z } from "zod";

export const bookMetaSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  level: z.string(),
  wordCount: z.number().int().positive(),
  dailyNew: z.number().int().positive(),
  color: z.enum(["blue", "purple", "green", "orange", "red", "amber"]),
});

export const bookIndexSchema = z.object({
  books: z.array(bookMetaSchema),
});

export type BookMeta = z.infer<typeof bookMetaSchema>;
export type BookIndex = z.infer<typeof bookIndexSchema>;

/** 颜色 → tailwind 类名映射 */
export const BOOK_COLOR_CLASSES: Record<
  BookMeta["color"],
  { bg: string; text: string; border: string; soft: string }
> = {
  blue: {
    bg: "bg-blue-500",
    text: "text-blue-600",
    border: "border-blue-300",
    soft: "bg-blue-50 dark:bg-blue-950",
  },
  purple: {
    bg: "bg-purple-500",
    text: "text-purple-600",
    border: "border-purple-300",
    soft: "bg-purple-50 dark:bg-purple-950",
  },
  green: {
    bg: "bg-green-500",
    text: "text-green-600",
    border: "border-green-300",
    soft: "bg-green-50 dark:bg-green-950",
  },
  orange: {
    bg: "bg-orange-500",
    text: "text-orange-600",
    border: "border-orange-300",
    soft: "bg-orange-50 dark:bg-orange-950",
  },
  red: {
    bg: "bg-red-500",
    text: "text-red-600",
    border: "border-red-300",
    soft: "bg-red-50 dark:bg-red-950",
  },
  amber: {
    bg: "bg-amber-500",
    text: "text-amber-600",
    border: "border-amber-300",
    soft: "bg-amber-50 dark:bg-amber-950",
  },
};

/** 加载官方词书索引 */
export async function loadBookIndex(): Promise<BookMeta[]> {
  const res = await fetch("/books/index.json", { cache: "force-cache" });
  if (!res.ok) throw new Error("加载词书索引失败");
  const data = await res.json();
  const parsed = bookIndexSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error(`词书索引格式错误: ${parsed.error.message}`);
  }
  return parsed.data.books;
}
