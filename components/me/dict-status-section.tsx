"use client";

/**
 * 本地词库加载状态卡片
 *
 * 检查 /search-index.json 和示例词库切片是否能正常加载：
 * - 加载成功：显示词条总数，支持"重新加载"（词库有更新时手动刷新）
 * - 加载失败：显示错误信息，支持"重新加载"重试
 *
 * 独立 chunk：从 /me 页面拆出，减小首屏 JS 体积。
 */
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { BookIcon, RefreshIcon } from "@/components/ui/icons";

type DictLoadStatus = "checking" | "loaded" | "failed";

interface DictCheckResult {
  status: DictLoadStatus;
  entryCount: number;
  sampleSliceOk: boolean;
  error?: string;
  checkedAt: string;
}

const DICT_CHECK_KEY = "settings:dict-check";

export default function DictStatusSection() {
  const [result, setResult] = useState<DictCheckResult | null>(null);
  const [reloading, setReloading] = useState(false);
  /** 上次检查的词条数（从 localStorage 读取，用于对比是否"有更新"） */
  const [prevEntryCount] = useState<number | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const prev = window.localStorage.getItem(DICT_CHECK_KEY);
      if (prev) return (JSON.parse(prev) as { entryCount: number }).entryCount;
    } catch {
      /* ignore */
    }
    return null;
  });

  /** 检查词库加载状态（no-store 绕过缓存） */
  async function checkDict(forceReload: boolean): Promise<void> {
    setReloading(true);
    try {
      const cacheOpt: RequestCache = forceReload ? "no-store" : "force-cache";
      // 并行：加载搜索索引 + 测试一个示例切片
      const [indexRes, sliceRes] = await Promise.all([
        fetch("/search-index.json", { cache: cacheOpt }),
        fetch("/dict-data/a/ab.json", { cache: cacheOpt }),
      ]);

      let entryCount = 0;
      let indexOk = false;
      let sliceOk = false;
      let error: string | undefined;

      if (indexRes.ok) {
        try {
          const entries = await indexRes.json();
          entryCount = Array.isArray(entries) ? entries.length : 0;
          indexOk = true;
        } catch {
          error = "搜索索引 JSON 解析失败";
        }
      } else {
        error = `搜索索引请求失败（HTTP ${indexRes.status}）`;
      }

      if (sliceRes.ok) {
        try {
          const slice = await sliceRes.json();
          sliceOk = Array.isArray(slice);
        } catch {
          // 切片解析失败不影响整体状态（某些前缀可能确实没有切片）
        }
      }

      const status: DictLoadStatus = indexOk ? "loaded" : "failed";
      const checkedResult: DictCheckResult = {
        status,
        entryCount,
        sampleSliceOk: sliceOk,
        error,
        checkedAt: new Date().toISOString(),
      };
      setResult(checkedResult);

      // 持久化检查结果（用于下次对比"有更新"）
      if (indexOk) {
        try {
          window.localStorage.setItem(
            DICT_CHECK_KEY,
            JSON.stringify({ entryCount, checkedAt: checkedResult.checkedAt })
          );
        } catch {
          /* localStorage 不可用时忽略 */
        }
      }
    } catch (e) {
      setResult({
        status: "failed",
        entryCount: 0,
        sampleSliceOk: false,
        error: e instanceof Error ? e.message : "词库检查失败",
        checkedAt: new Date().toISOString(),
      });
    } finally {
      setReloading(false);
    }
  }

  // 首次挂载：执行检查（prevEntryCount 已在 useState 初始化时读取）
  // 延迟到微任务执行，避免在 effect 同步阶段调用 setState（react-hooks/set-state-in-effect）
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await Promise.resolve();
      if (!cancelled) await checkDict(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const hasUpdate =
    result?.status === "loaded" &&
    prevEntryCount !== null &&
    result.entryCount !== prevEntryCount;

  return (
    <section className="rounded-xl border border-neutral-200 px-4 py-4 dark:border-neutral-800">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-medium text-neutral-700 dark:text-neutral-300">
          <BookIcon title="词库状态" className="h-4 w-4" /> 本地词库
        </h2>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => checkDict(true)}
          disabled={reloading}
          className="text-xs"
        >
          <RefreshIcon
            title="重新加载"
            className={`mr-1 h-3.5 w-3.5 ${reloading ? "animate-spin" : ""}`}
          />
          {reloading ? "检查中…" : "重新加载"}
        </Button>
      </div>

      {result?.status === "checking" || !result ? (
        <p className="text-xs text-neutral-400">正在检查词库加载状态…</p>
      ) : result.status === "loaded" ? (
        <div className="flex flex-col gap-1.5 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-neutral-500">加载状态</span>
            <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
              ✓ 已加载
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-neutral-500">词条总数</span>
            <span className="font-mono text-neutral-700 dark:text-neutral-300">
              {result.entryCount.toLocaleString()}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-neutral-500">示例切片</span>
            <span className="text-neutral-700 dark:text-neutral-300">
              {result.sampleSliceOk ? "✓ 可访问" : "— 无切片"}
            </span>
          </div>
          {hasUpdate && (
            <p className="mt-1 rounded-md bg-blue-50 px-2 py-1 text-[11px] text-blue-700 dark:bg-blue-950 dark:text-blue-300">
              ℹ 词库已更新（词条数 {prevEntryCount?.toLocaleString()} →{" "}
              {result.entryCount.toLocaleString()}），建议重新加载页面以刷新缓存
            </p>
          )}
          <p className="text-[10px] text-neutral-400">
            上次检查：
            {new Date(result.checkedAt).toLocaleString("zh-CN")}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2 text-xs">
          <p className="flex items-center gap-1 text-red-600 dark:text-red-400">
            ✗ 加载失败
          </p>
          {result.error && (
            <p className="rounded-md bg-red-50 px-2 py-1 text-[11px] text-red-600 dark:bg-red-950 dark:text-red-300">
              {result.error}
            </p>
          )}
          <p className="text-[10px] text-neutral-400">
            点击右上角&ldquo;重新加载&rdquo;重试，或检查网络连接
          </p>
        </div>
      )}
    </section>
  );
}
