"use client";

/**
 * 查词 hook（设计文档 §3.2：输入即搜 debounce 80ms，前缀补全 + 模糊纠错兜底）
 *
 * 启动时加载 /search-index.json 构建前缀索引；输入时 debounce 80ms 后查询。
 * effect 内的 setState 全部走 startTransition / setTimeout 回调，避免同步级联渲染。
 *
 * loading 语义修正：
 * - 仅在 debounce 等待中或 index 未就绪时为 true
 * - 搜索完成但 0 结果时 loading = false，由 UI 显示"无匹配"
 * （旧实现把 0 结果当作"还在搜索"，导致永远显示"搜索中…"）
 */
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  buildPrefixIndex,
  search,
  type PrefixIndex,
  type SearchEntry,
} from "@/lib/search/search-engine";

const DEBOUNCE_MS = 80;

export interface UseSearchResult {
  query: string;
  setQuery: (q: string) => void;
  results: SearchEntry[];
  /** 仅在 debounce 等待中或索引未就绪时为 true；搜索完成 0 结果时为 false */
  loading: boolean;
  indexReady: boolean;
}

export function useSearch(limit = 8): UseSearchResult {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchEntry[]>([]);
  const [indexReady, setIndexReady] = useState(false);
  /** 标记本次 query 是否已搜完（区分"还在搜"与"搜完 0 结果"） */
  const [searched, setSearched] = useState(false);
  const [isPending, startTransition] = useTransition();
  const indexRef = useRef<PrefixIndex | null>(null);
  const entriesRef = useRef<SearchEntry[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 启动时加载前缀索引
  useEffect(() => {
    let cancelled = false;
    fetch("/search-index.json", { cache: "force-cache" })
      .then((res) => (res.ok ? res.json() : []))
      .then((entries: SearchEntry[]) => {
        if (cancelled) return;
        entriesRef.current = entries;
        indexRef.current = buildPrefixIndex(entries);
        startTransition(() => setIndexReady(true));
      })
      .catch(() => {
        if (!cancelled) startTransition(() => setIndexReady(true));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // debounce 查询：所有 setState 走 setTimeout 回调（异步），避免 effect 内同步 setState
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    const q = query.trim();
    if (!q) {
      timerRef.current = setTimeout(() => {
        startTransition(() => {
          setResults([]);
          setSearched(false);
        });
      }, 0);
      return () => {
        if (timerRef.current) clearTimeout(timerRef.current);
      };
    }
    timerRef.current = setTimeout(() => {
      const index = indexRef.current;
      startTransition(() => {
        setResults(index ? search(index, entriesRef.current, q, limit) : []);
        setSearched(true);
      });
    }, DEBOUNCE_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [query, indexReady, limit]);

  // loading 仅在 debounce 等待中（未搜完）或 index 未就绪时为 true
  const loading = !indexReady || (!!query.trim() && !searched) || isPending;

  return useMemo(
    () => ({ query, setQuery, results, loading, indexReady }),
    [query, results, loading, indexReady]
  );
}
