/**
 * 官方词库索引（设计文档 §3.2 C）
 *
 * 从 /book-data/index.json 加载所有官方词书的元信息（不含词条数据），
 * 词库管理页用于列表展示；选定后按需 fetch /book-data/{id}/index.json 加载词条
 *
 * 性能：客户端不再 import zod（~280KB / gzip 64KB），改为轻量结构校验。
 * 完整 zod schema 校验已在构建期由 scripts/validate-content.ts 完成，
 * 运行时只需保证字段存在 + 类型正确即可。
 */
import type { BookMeta } from "@/lib/content/word-book-schema";

export type { BookMeta, BookIndex } from "@/lib/content/word-book-schema";

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
  slate: {
    bg: "bg-slate-600",
    text: "text-slate-600",
    border: "border-slate-300",
    soft: "bg-slate-50 dark:bg-slate-950",
  },
};

const ALLOWED_COLORS = new Set<BookMeta["color"]>([
  "blue", "purple", "green", "orange", "red", "amber", "slate",
]);

/**
 * 轻量结构校验：仅检查字段存在 + 关键类型，不做完整 zod schema 校验。
 * 失败时抛出 Error，与原 zod safeParse 行为一致。
 */
function assertBookMeta(raw: unknown): asserts raw is BookMeta {
  if (!raw || typeof raw !== "object") {
    throw new Error("词书索引格式错误: 期望对象");
  }
  const o = raw as Record<string, unknown>;
  const required: Array<keyof BookMeta> = [
    "id", "name", "description", "level", "wordCount", "dailyNew", "color",
  ];
  for (const k of required) {
    if (!(k in o)) throw new Error(`词书索引格式错误: 缺少字段 ${String(k)}`);
  }
  if (typeof o.id !== "string" || typeof o.name !== "string" ||
      typeof o.description !== "string" || typeof o.level !== "string" ||
      typeof o.wordCount !== "number" || typeof o.dailyNew !== "number" ||
      typeof o.color !== "string" || !ALLOWED_COLORS.has(o.color as BookMeta["color"])) {
    throw new Error("词书索引格式错误: 字段类型不匹配");
  }
}

/**
 * 加载官方词书索引。
 *
 * 使用 `no-cache` 而非 `force-cache`：每次发起请求时与服务器 revalidate
 * （静态 JSON 在 Cloudflare 上有 ETag/Last-Modified，304 响应极轻），
 * 确保新增词书后刷新页面能立即看到，而非等 HTTP 缓存过期。
 * 数据仍会被浏览器 HTTP 缓存与 Service Worker 缓存，离线可用。
 */
export async function loadBookIndex(): Promise<BookMeta[]> {
  const res = await fetch("/book-data/index.json", { cache: "no-cache" });
  if (!res.ok) throw new Error("加载词书索引失败");
  const data = await res.json();
  if (!data || typeof data !== "object" || !Array.isArray((data as { books?: unknown }).books)) {
    throw new Error("词书索引格式错误: 缺少 books 数组");
  }
  const books = (data as { books: unknown[] }).books;
  for (const b of books) {
    assertBookMeta(b);
  }
  return books as BookMeta[];
}
