/**
 * 查词 Web Worker（设计文档 §3.2：索引构建 + 模糊纠错移出主线程）
 *
 * 主线程仅做 debounce + postMessage；索引 fetch/parse/buildPrefixIndex/search
 * 全部在本 worker 完成。42k 词条不再阻塞移动端主线程。
 *
 * 协议：
 * 主线程 → worker: { type: "init" } | { type: "search", id, query, limit }
 * worker → 主线程: { type: "ready" } | { type: "error" } | { type: "results", id, query, results }
 */
import {
  buildPrefixIndex,
  search,
  type PrefixIndex,
  type SearchEntry,
} from "./search-engine";

type Req =
  | { type: "init" }
  | { type: "search"; id: number; query: string; limit: number };

type Res =
  | { type: "ready" }
  | { type: "error" }
  | { type: "results"; id: number; query: string; results: SearchEntry[] };

let index: PrefixIndex | null = null;
let entries: SearchEntry[] = [];

// 用局部声明规避 dom/webworker lib 冲突：worker 作用域的 postMessage 无需 targetOrigin
const scope = self as unknown as {
  onmessage: ((ev: MessageEvent<Req>) => void) | null;
  postMessage: (msg: Res) => void;
};

scope.onmessage = (e: MessageEvent<Req>) => {
  const msg = e.data;
  if (msg.type === "init") {
    fetch("/search-index.json", { cache: "force-cache" })
      .then((res) =>
        res.ok ? res.json() : (Promise.resolve([]) as Promise<SearchEntry[]>)
      )
      .then((data: SearchEntry[]) => {
        entries = data;
        index = buildPrefixIndex(data);
        scope.postMessage({ type: "ready" } satisfies Res);
      })
      .catch(() => scope.postMessage({ type: "error" } satisfies Res));
  } else if (msg.type === "search") {
    const results = index ? search(index, entries, msg.query, msg.limit) : [];
    scope.postMessage({
      type: "results",
      id: msg.id,
      query: msg.query,
      results,
    } satisfies Res);
  }
};
