/**
 * 搜索历史（设计文档 §3.2：最近搜索快速复访）
 *
 * 用 localStorage 存最近 12 条查词记录，按最近使用倒序，去重。
 * 仅存 word 字符串，体积小；点击搜索结果或历史项时写入。
 */
const HISTORY_KEY = "wordflow:search-history:v1";
const MAX_HISTORY = 12;

export function loadSearchHistory(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter((x) => typeof x === "string").slice(0, MAX_HISTORY);
  } catch {
    return [];
  }
}

export function pushSearchHistory(word: string): void {
  if (typeof window === "undefined") return;
  const w = word.trim();
  if (!w) return;
  try {
    const cur = loadSearchHistory();
    const next = [w, ...cur.filter((x) => x.toLowerCase() !== w.toLowerCase())].slice(
      0,
      MAX_HISTORY
    );
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

export function clearSearchHistory(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(HISTORY_KEY);
  } catch {
    /* ignore */
  }
}
