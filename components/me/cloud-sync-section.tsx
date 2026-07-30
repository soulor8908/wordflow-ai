"use client";

/**
 * 云端同步卡片（设计文档 §3.4：数据可移植性）
 *
 * 由于 WordFlow 是本地优先 PWA（无后端数据库），云端同步采用
 * "导出 / 导入 JSON 文件"模式：用户可把全部数据导出为 JSON 文件，
 * 保存到任意云盘（iCloud / Google Drive / OneDrive 等），
 * 换设备时导入该文件恢复数据。
 *
 * 同步内容：settings:*（含 user-profile 画像）/ log:* / card:* / fav:*
 * 合并策略：Last-Write-Wins（按 updatedAt 时间戳合并）
 *
 * 独立 chunk：从 /me 页面拆出，仅在用户滚动到此处时加载 cloud-sync 模块。
 */
import { useEffect, useRef, useState } from "react";
import {
  exportSyncBundle,
  importSyncBundle,
  downloadSyncBundle,
  readSyncBundleFromFile,
  getLocalDataSummary,
  type SyncBundle,
} from "@/lib/sync/cloud-sync";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CloudIcon, RefreshIcon } from "@/components/ui/icons";

export default function CloudSyncSection() {
  const [summary, setSummary] = useState<{
    totalRecords: number;
    cards: number;
    logs: number;
    favorites: number;
    settings: number;
  } | null>(null);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error" | "info";
    text: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    getLocalDataSummary()
      .then(setSummary)
      .catch(() => {
        /* 忽略，UI 显示占位 */
      });
  }, []);

  async function handleExport() {
    if (exporting) return;
    setExporting(true);
    setMessage(null);
    try {
      const bundle = await exportSyncBundle();
      downloadSyncBundle(bundle);
      const size = (JSON.stringify(bundle).length / 1024).toFixed(1);
      setMessage({
        type: "success",
        text: `✓ 已导出 ${bundle.records.length} 条记录（约 ${size} KB）。请将下载的 JSON 文件保存到云盘以实现云端同步。`,
      });
      // 刷新本地数据概况
      const s = await getLocalDataSummary();
      setSummary(s);
    } catch (e) {
      setMessage({
        type: "error",
        text: `导出失败：${e instanceof Error ? e.message : String(e)}`,
      });
    } finally {
      setExporting(false);
    }
  }

  async function handleImportFile(file: File) {
    if (importing) return;
    setImporting(true);
    setMessage(null);
    try {
      const bundle: SyncBundle = await readSyncBundleFromFile(file);
      const result = await importSyncBundle(bundle);
      setMessage({
        type: "success",
        text: `✓ 导入完成：合并 ${result.merged} 条，跳过 ${result.skipped} 条（共 ${result.total} 条）。建议刷新页面以加载新数据。`,
      });
      const s = await getLocalDataSummary();
      setSummary(s);
    } catch (e) {
      setMessage({
        type: "error",
        text: `导入失败：${e instanceof Error ? e.message : String(e)}`,
      });
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <section className="rounded-xl border border-neutral-200 px-4 py-4 dark:border-neutral-800">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-medium text-neutral-700 dark:text-neutral-300">
          <CloudIcon title="云端同步" className="h-4 w-4" /> 云端同步
          <span className="text-[10px] font-normal text-neutral-400">
            （备份 / 恢复）
          </span>
        </h2>
      </div>

      <p className="mb-3 text-xs text-neutral-500">
        导出学习数据（含卡片、日志、用户画像、学习习惯）为 JSON 文件，
        保存到 iCloud / Google Drive 等云盘即可跨设备同步。
      </p>

      {/* 本地数据概况 */}
      {summary && (
        <div className="mb-3 grid grid-cols-4 gap-2 rounded-lg bg-neutral-50 px-3 py-2 text-center dark:bg-neutral-900">
          <div>
            <p className="text-sm font-mono font-bold text-blue-500">
              {summary.cards}
            </p>
            <p className="text-[10px] text-neutral-500">卡片</p>
          </div>
          <div>
            <p className="text-sm font-mono font-bold text-green-500">
              {summary.logs}
            </p>
            <p className="text-[10px] text-neutral-500">日志</p>
          </div>
          <div>
            <p className="text-sm font-mono font-bold text-amber-500">
              {summary.favorites}
            </p>
            <p className="text-[10px] text-neutral-500">收藏</p>
          </div>
          <div>
            <p className="text-sm font-mono font-bold text-purple-500">
              {summary.settings}
            </p>
            <p className="text-[10px] text-neutral-500">设置</p>
          </div>
        </div>
      )}

      {/* 操作按钮 */}
      <div className="flex flex-col gap-2">
        <div className="flex gap-2">
          <Button
            type="button"
            onClick={handleExport}
            disabled={exporting}
            className="flex-1"
          >
            <RefreshIcon
              title="导出"
              className={`mr-1 h-3.5 w-3.5 ${exporting ? "animate-spin" : ""}`}
            />
            {exporting ? "导出中…" : "导出备份"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            className="flex-1"
          >
            {importing ? "导入中…" : "导入恢复"}
          </Button>
          <Input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleImportFile(f);
            }}
          />
        </div>

        {/* 消息提示 */}
        {message && (
          <p
            className={`rounded-md px-3 py-2 text-xs ${
              message.type === "success"
                ? "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300"
                : message.type === "error"
                  ? "bg-red-50 text-red-600 dark:bg-red-950 dark:text-red-300"
                  : "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
            }`}
          >
            {message.text}
          </p>
        )}

        <p className="text-[10px] text-neutral-400">
          合并策略：按 updatedAt 时间戳 Last-Write-Wins，较新记录覆盖较旧记录。
        </p>
      </div>
    </section>
  );
}
