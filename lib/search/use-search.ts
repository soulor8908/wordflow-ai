"use client";

/**
 * 查词 hook（设计文档 §3.2：输入即搜 debounce 80ms，前缀补全 + 模糊纠错兜底）
 *
 * 性能优化：
 * - 索引 fetch/parse/buildPrefixIndex/search 全部在 Web Worker 完成
 *  （lib/search/search-worker.ts），主线程不再被 42k 词条阻塞
 * - 索引延迟到 requestIdleCallback 后才加载（懒加载），不抢占首屏 LCP 的
 *   网络与主线程
 * - 查询走 postMessage，过时结果按 id 丢弃
 *
 * loading 语义：
 * - 仅在 debounce 等待中或索引未就绪时为 true
 * - 搜索完成但 0 结果时 loading = false，由 UI 显示"无匹配"
 */
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { SearchEntry } from "@/lib/search/search-engine";

const DEBOUNCE_MS = 80;

type Req =
  | { type: "init" }
  | { type: "search"; id: number; query: string; limit: number };

type Res =
  | { type: "ready" }
  | { type: "error" }
  | { type: "results"; id: number; query: string; results: SearchEntry[] };

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
  const workerRef = useRef<Worker | null>(null);
  const reqIdRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 创建 worker；索引加载延迟到 idle（不抢占首屏 LCP）
  useEffect(() => {
    if (typeof Worker === "undefined") return; // SSR / 不支持 Worker
    const worker = new Worker(new URL("./search-worker.ts", import.meta.url));
    workerRef.current = worker;

    worker.onmessage = (e: MessageEvent<Res>) => {
      const msg = e.data;
      if (msg.type === "ready") {
        startTransition(() => setIndexReady(true));
      } else if (msg.type === "results") {
        if (msg.id !== reqIdRef.current) return; // 过时结果丢弃
        startTransition(() => {
          setResults(msg.results);
          setSearched(true);
        });
      }
    };

    // 懒加载：idle 后再让 worker 拉取索引，避免抢占 LCP 网络与主线程
    const init = () => worker.postMessage({ type: "init" } satisfies Req);
    const useRIC = "requestIdleCallback" in window;
    const handle = useRIC
      ? window.requestIdleCallback(init, { timeout: 2000 })
      : window.setTimeout(init, 1500);

    return () => {
      worker.terminate();
      workerRef.current = null;
      if (useRIC) window.cancelIdleCallback(handle);
      else window.clearTimeout(handle);
    };
  }, []);

  // debounce 查询：发到 worker（所有 setState 走 transition，避免同步级联渲染）
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
    const worker = workerRef.current;
    timerRef.current = setTimeout(() => {
      // 索引未就绪不发：loading 由 !indexReady 兜住，ready 后 effect 重跑自动补搜
      if (!worker || !indexReady) return;
      const id = ++reqIdRef.current;
      startTransition(() => setSearched(false)); // 标记本次查询进行中
      worker.postMessage({ type: "search", id, query: q, limit } satisfies Req);
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
