"use client";

/**
 * 我的页（设计文档 §3.4：设置与统计入口）
 *
 * 整合：
 * - 学习总览（Streak + 卡片总数 + 今日数据）
 * - 我的卡片（按状态分类：待复习 / 已掌握 / 学习中）
 * - AI 配置（BYOK：provider / apiKey / baseURL / model + 测试连接）
 * - 云端同步（导出 / 导入 JSON 备份，含用户画像与学习习惯）
 * - 通知与离线设置（PwaSettings）
 */
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { getStreak } from "@/lib/stats/streak-io";
import type { KVRecord } from "@/lib/storage/db";
import type { WordCard } from "@/lib/review/fsrs-scheduler";
import type { StreakState } from "@/lib/stats/streak";
import {
  getAiConfig,
  setAiConfig,
  clearAiConfig,
  type AiConfig,
} from "@/lib/ai/ai-config";
import {
  PROVIDER_CONFIGS,
  type ProviderName,
} from "@/lib/ai/provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BookIcon, CloudIcon, RefreshIcon, RobotIcon } from "@/components/ui/icons";
import PwaSettings from "@/app/stats/pwa-settings";
import {
  exportSyncBundle,
  importSyncBundle,
  downloadSyncBundle,
  readSyncBundleFromFile,
  getLocalDataSummary,
  type SyncBundle,
} from "@/lib/sync/cloud-sync";

type CardStatus = "due" | "learning" | "mastered";

interface CardWithMeta extends WordCard {
  /** 从 KVRecord.updatedAt 透传，用于排序 */
  _updatedAt?: string;
}

interface CardStat {
  total: number;
  byStatus: Record<CardStatus, number>;
  recent: CardWithMeta[];
}

function classifyCard(card: WordCard, now: Date): CardStatus {
  // WordCard.state 是字符串："New" | "Learning" | "Review" | "Relearning"
  // mastered 通过 verification 字段判断（V4 验证通过）
  if (card.verification === "mastered") return "mastered";
  const due = card.due ? new Date(card.due) : null;
  if (due && due <= now) return "due";
  return "learning";
}

/** 列出卡片并附带 KVRecord 的 updatedAt（用于排序） */
async function listCardsWithMeta(): Promise<CardWithMeta[]> {
  const db = (await import("@/lib/storage/db")).getDb;
  const dexie = await db();
  const records = (await dexie.kv
    .where("prefix")
    .equals("card:")
    .toArray()) as KVRecord[];
  return records.map((r) => ({
    ...(r.value as WordCard),
    _updatedAt: r.updatedAt,
  }));
}

export default function MePage() {
  const [streak, setStreak] = useState<StreakState | null>(null);
  const [cardStat, setCardStat] = useState<CardStat | null>(null);
  const [aiConfig, setAiConfigState] = useState<AiConfig | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [s, cards, ai] = await Promise.all([
          getStreak(),
          listCardsWithMeta(),
          getAiConfig(),
        ]);
        if (cancelled) return;
        const now = new Date();
        const byStatus: Record<CardStatus, number> = {
          due: 0,
          learning: 0,
          mastered: 0,
        };
        for (const c of cards) {
          byStatus[classifyCard(c, now)]++;
        }
        setStreak(s ?? null);
        setCardStat({
          total: cards.length,
          byStatus,
          recent: cards
            .slice()
            .sort(
              (a, b) =>
                new Date(b._updatedAt ?? 0).getTime() -
                new Date(a._updatedAt ?? 0).getTime()
            )
            .slice(0, 5),
        });
        setAiConfigState(ai);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!loaded) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-2xl items-center justify-center px-4">
        <p className="text-sm text-neutral-400">加载中…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-6 px-4 py-8 pb-24">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">我的</h1>
        <p className="mt-1 text-sm text-neutral-500">
          管理你的学习数据、AI 配置与通知偏好
        </p>
      </header>

      {/* 学习总览 */}
      <section className="rounded-xl border border-neutral-200 px-4 py-4 dark:border-neutral-800">
        <h2 className="mb-3 text-sm font-medium text-neutral-700 dark:text-neutral-300">
          学习总览
        </h2>
        <div className="grid grid-cols-4 gap-3 text-center">
          <Stat
            label="连续天数"
            value={streak?.currentStreak ?? 0}
            color="text-orange-500"
          />
          <Stat
            label="最长记录"
            value={streak?.longestStreak ?? 0}
            color="text-purple-500"
          />
          <Stat
            label="卡片总数"
            value={cardStat?.total ?? 0}
            color="text-blue-500"
          />
          <Stat
            label="待复习"
            value={cardStat?.byStatus.due ?? 0}
            color="text-red-500"
          />
        </div>
      </section>

      {/* 我的卡片 */}
      <section className="rounded-xl border border-neutral-200 px-4 py-4 dark:border-neutral-800">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
            我的卡片
          </h2>
          {cardStat && cardStat.total > 0 && (
            <Link
              href="/review"
              className="text-xs text-blue-600 hover:underline"
            >
              去复习 →
            </Link>
          )}
        </div>
        {cardStat && cardStat.total > 0 ? (
          <>
            <div className="mb-3 flex gap-2 text-xs">
              <span className="rounded-full bg-red-50 px-2 py-0.5 text-red-600 dark:bg-red-950">
                待复习 {cardStat.byStatus.due}
              </span>
              <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-600 dark:bg-amber-950">
                学习中 {cardStat.byStatus.learning}
              </span>
              {/* "已掌握"通过刷题模式中长按"认识"标记，仅在 > 0 时展示，避免未学用户看到误导性的死 UI */}
              {cardStat.byStatus.mastered > 0 && (
                <span className="rounded-full bg-green-50 px-2 py-0.5 text-green-600 dark:bg-green-950">
                  已掌握 {cardStat.byStatus.mastered}
                </span>
              )}
            </div>
            <ul className="flex flex-col gap-1.5">
              {cardStat.recent.map((c) => (
                <li key={c.word}>
                  <Link
                    href={`/word/${encodeURIComponent(c.word)}`}
                    className="flex items-center justify-between rounded-lg bg-neutral-50 px-3 py-2 text-sm hover:bg-neutral-100 dark:bg-neutral-900 dark:hover:bg-neutral-800"
                  >
                    <span className="font-mono">{c.word}</span>
                    <span className="text-[10px] text-neutral-400">
                      {c._updatedAt
                        ? new Date(c._updatedAt).toLocaleDateString("zh-CN")
                        : "—"}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <p className="text-sm text-neutral-500">还没有卡片</p>
            <Link
              href="/books"
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
            >
              去选词库
            </Link>
          </div>
        )}
      </section>

      {/* AI 高级设置（可选）：默认已开箱即用，此处仅供高级用户自定义 */}
      <AiConfigSection
        config={aiConfig}
        onSaved={() =>
          getAiConfig().then((c) => setAiConfigState(c))
        }
      />

      {/* 云端同步：导出 / 导入 JSON 备份（含学习习惯 + 用户画像） */}
      <CloudSyncSection />

      {/* 本地词库加载状态（检查 + 重新加载） */}
      <DictStatusSection />

      {/* 通知与离线 */}
      <PwaSettings />
    </main>
  );
}

function Stat({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="flex flex-col">
      <p className={`text-xl font-bold ${color}`}>{value}</p>
      <p className="text-[10px] text-neutral-500">{label}</p>
    </div>
  );
}

/** AI 配置编辑卡片 */
function AiConfigSection({
  config,
  onSaved,
}: {
  config: AiConfig | null;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(!config);
  const [provider, setProvider] = useState<ProviderName>(
    config?.provider ?? "agnes"
  );
  const [apiKey, setApiKey] = useState(config?.apiKey ?? "");
  const [baseURL, setBaseURL] = useState(
    config?.baseURL ?? PROVIDER_CONFIGS.agnes.baseURL
  );
  const [model, setModel] = useState(
    config?.model ?? PROVIDER_CONFIGS.agnes.defaultModel
  );
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  function handleProviderChange(p: ProviderName) {
    setProvider(p);
    const cfg = PROVIDER_CONFIGS[p];
    if (p !== "custom") {
      setBaseURL(cfg.baseURL);
      setModel(cfg.defaultModel);
    }
  }

  async function handleSave() {
    if (!apiKey.trim()) {
      setTestResult("请输入 API Key");
      return;
    }
    setSaving(true);
    try {
      await setAiConfig({
        provider,
        apiKey: apiKey.trim(),
        baseURL: baseURL.trim() || undefined,
        model: model.trim() || undefined,
      });
      onSaved();
      setEditing(false);
      setTestResult(null);
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    if (!apiKey.trim()) {
      setTestResult("请先填写 API Key");
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/ai-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          apiKey: apiKey.trim(),
          baseURL: baseURL.trim() || undefined,
          model: model.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setTestResult("✓ 连接成功");
      } else {
        setTestResult(`✗ ${data.message ?? "连接失败"}`);
      }
    } catch (e) {
      setTestResult(`✗ ${e instanceof Error ? e.message : "请求失败"}`);
    } finally {
      setTesting(false);
    }
  }

  async function handleClear() {
    await clearAiConfig();
    onSaved();
    setApiKey("");
    setProvider("agnes");
    setBaseURL(PROVIDER_CONFIGS.agnes.baseURL);
    setModel(PROVIDER_CONFIGS.agnes.defaultModel);
    setEditing(true);
    setTestResult(null);
  }

  return (
    <section className="rounded-xl border border-neutral-200 px-4 py-4 dark:border-neutral-800">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-medium text-neutral-700 dark:text-neutral-300">
          <RobotIcon title="AI 高级设置" className="h-4 w-4" /> AI 高级设置
          <span className="text-[10px] font-normal text-neutral-400">（可选）</span>
        </h2>
        {config && !editing && (
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] text-green-700 dark:bg-green-950 dark:text-green-300">
              ✓ 自定义 · {config.provider}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setEditing(true)}
              className="text-xs"
            >
              修改
            </Button>
          </div>
        )}
      </div>
      {!config && !editing && (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-neutral-400">
            AI 助手已默认免费可用。如需使用自己的 API Key（无限额度），可在此配置。
          </p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setEditing(true)}
            className="self-start text-xs text-blue-600"
          >
            配置自己的 API Key
          </Button>
        </div>
      )}

      {editing ? (
        <div className="flex flex-col gap-3">
          {/* Provider 选择 */}
          <div>
            <label className="mb-1 block text-xs text-neutral-500">
              AI 服务商
            </label>
            <div className="grid grid-cols-5 gap-2">
              {(["agnes", "glm", "deepseek", "mimo", "custom"] as ProviderName[]).map(
                (p) => (
                  <Button
                    key={p}
                    type="button"
                    variant={provider === p ? "primary" : "secondary"}
                    size="sm"
                    onClick={() => handleProviderChange(p)}
                    className="text-xs"
                  >
                    {p === "agnes"
                      ? "Agnes"
                      : p === "glm"
                        ? "智谱GLM"
                        : p === "deepseek"
                          ? "DeepSeek"
                          : p === "mimo"
                            ? "小米MiMo"
                            : "自定义"}
                  </Button>
                )
              )}
            </div>
          </div>

          {/* API Key */}
          <div>
            <label className="mb-1 block text-xs text-neutral-500">
              API Key
            </label>
            <Input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="粘贴你的 API Key"
              autoComplete="off"
            />
            <p className="mt-1 text-[10px] text-neutral-400">
              仅存储于本地浏览器，不上传服务器
            </p>
          </div>

          {/* baseURL（custom 必填，其他可改） */}
          <div>
            <label className="mb-1 block text-xs text-neutral-500">
              API 地址
            </label>
            <Input
              type="url"
              value={baseURL}
              onChange={(e) => setBaseURL(e.target.value)}
              placeholder="https://..."
              disabled={provider !== "custom"}
            />
          </div>

          {/* model */}
          <div>
            <label className="mb-1 block text-xs text-neutral-500">
              模型名
            </label>
            <Input
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="例如 glm-4-flash"
            />
          </div>

          {/* 测试结果 */}
          {testResult && (
            <p
              className={`text-xs ${
                testResult.startsWith("✓")
                  ? "text-green-600"
                  : "text-red-500"
              }`}
            >
              {testResult}
            </p>
          )}

          {/* 操作按钮 */}
          <div className="flex gap-2">
            <Button
              type="button"
              onClick={handleSave}
              disabled={saving || !apiKey.trim()}
              className="flex-1"
            >
              {saving ? "保存中…" : "保存"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={handleTest}
              disabled={testing || !apiKey.trim()}
              className="flex-1"
            >
              {testing ? "测试中…" : "测试连接"}
            </Button>
            {config && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setEditing(false);
                  setTestResult(null);
                }}
              >
                取消
              </Button>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2 text-xs text-neutral-500">
          <div className="flex items-center justify-between">
            <span>服务商</span>
            <span className="text-neutral-700 dark:text-neutral-300">
              {config?.provider}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span>模型</span>
            <span className="text-neutral-700 dark:text-neutral-300">
              {config?.model ?? "默认"}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span>配置时间</span>
            <span>
              {config
                ? new Date(config.configuredAt).toLocaleString("zh-CN")
                : "—"}
            </span>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleClear}
            className="mt-2 self-start text-xs text-red-500 hover:text-red-600"
          >
            清除配置
          </Button>
        </div>
      )}
    </section>
  );
}

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
 */
function CloudSyncSection() {
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
          <input
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

/**
 * 本地词库加载状态卡片
 *
 * 检查 /search-index.json 和示例词库切片是否能正常加载：
 * - 加载成功：显示词条总数，支持"重新加载"（词库有更新时手动刷新）
 * - 加载失败：显示错误信息，支持"重新加载"重试
 *
 * 重新加载通过 cache: 'no-store' 绕过浏览器缓存，强制拉取最新版本。
 * 检查结果（词条数 + 时间戳）持久化到 localStorage，下次打开时对比
 * 可发现词库是否已更新（词条数变化即提示"有更新"）。
 */
type DictLoadStatus = "checking" | "loaded" | "failed";

interface DictCheckResult {
  status: DictLoadStatus;
  entryCount: number;
  sampleSliceOk: boolean;
  error?: string;
  checkedAt: string;
}

const DICT_CHECK_KEY = "settings:dict-check";

function DictStatusSection() {
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
        fetch("/dict/a/ab.json", { cache: cacheOpt }),
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
