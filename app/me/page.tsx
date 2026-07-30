"use client";

/**
 * 我的页（设计文档 §3.4：设置与统计入口）
 *
 * 整合：
 * - 学习总览入口（跳转 /stats 查看完整统计，避免与 /stats 数据重复）
 * - AI 配置（BYOK：provider / apiKey / baseURL / model + 测试连接）
 * - 云端同步（导出 / 导入 JSON 备份，含用户画像与学习习惯）
 * - 本地词库加载状态
 *
 * 信息架构说明（与 /stats 分工）：
 * - /stats：Streak / 热力图 / 今日数据 / 徽章 / 任务 / 常错词 / 画像 / PWA 设置
 * - /me：设置类内容（AI 配置 / 云同步 / 词库状态），不再重复展示统计数字
 *   "学习总览"卡片仅作入口，点击跳转 /stats 查看详情
 *
 * 性能：CloudSyncSection / DictStatusSection 懒加载，拆出独立 chunk，
 * 首屏只加载 AI 配置 + 统计入口，减小首屏 JS 体积。
 */
import Link from "next/link";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { getStreak } from "@/lib/stats/streak-io";
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
import {
  ChevronRightIcon,
  RobotIcon,
  FlameIcon,
} from "@/components/ui/icons";

// 懒加载首屏以下的重组件，拆出独立 chunk
const CloudSyncSection = dynamic(
  () => import("@/components/me/cloud-sync-section"),
  { loading: () => <LazySkeleton />, ssr: false }
);
const DictStatusSection = dynamic(
  () => import("@/components/me/dict-status-section"),
  { loading: () => <LazySkeleton />, ssr: false }
);

/** 懒加载占位骨架 */
function LazySkeleton() {
  return (
    <section className="animate-pulse rounded-xl border border-neutral-200 px-4 py-4 dark:border-neutral-800">
      <div className="mb-3 h-4 w-32 rounded bg-neutral-200 dark:bg-neutral-800" />
      <div className="h-8 w-full rounded bg-neutral-100 dark:bg-neutral-900" />
    </section>
  );
}

export default function MePage() {
  const [streak, setStreak] = useState<StreakState | null>(null);
  const [aiConfig, setAiConfigState] = useState<AiConfig | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [s, ai] = await Promise.all([
          getStreak(),
          getAiConfig(),
        ]);
        if (cancelled) return;
        setStreak(s ?? null);
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
          管理 AI 配置、云同步与词库；统计详情见「学习统计」
        </p>
      </header>

      {/* 学习总览入口：精简为单行跳转，避免与 /stats 重复展示统计数字 */}
      <Link
        href="/stats"
        className="flex items-center justify-between rounded-xl border border-neutral-200 px-4 py-3 transition-colors hover:border-blue-300 hover:bg-blue-50/50 dark:border-neutral-800 dark:hover:border-blue-700 dark:hover:bg-blue-950/30"
      >
        <div className="flex items-center gap-3">
          <FlameIcon className="h-7 w-7 text-orange-500" />
          <div>
            <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
              学习统计
            </p>
            <p className="text-xs text-neutral-500">
              {streak && streak.currentStreak > 0
                ? `当前连续 ${streak.currentStreak} 天`
                : "查看连胜、热力图、徽章与常错词"}
            </p>
          </div>
        </div>
        <ChevronRightIcon className="h-4 w-4 text-neutral-400" />
      </Link>

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
    </main>
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
            <label htmlFor="ai-api-key" className="mb-1 block text-xs text-neutral-500">
              API Key
            </label>
            <Input
              id="ai-api-key"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="粘贴你的 API Key"
              autoComplete="off"
            />
            <p className="mt-1 text-[10px] text-neutral-600">
              仅存储于本地浏览器，不上传服务器
            </p>
          </div>

          {/* baseURL（custom 必填，其他可改） */}
          <div>
            <label htmlFor="ai-base-url" className="mb-1 block text-xs text-neutral-500">
              API 地址
            </label>
            <Input
              id="ai-base-url"
              type="url"
              value={baseURL}
              onChange={(e) => setBaseURL(e.target.value)}
              placeholder="https://..."
              disabled={provider !== "custom"}
            />
          </div>

          {/* model */}
          <div>
            <label htmlFor="ai-model" className="mb-1 block text-xs text-neutral-500">
              模型名
            </label>
            <Input
              id="ai-model"
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
