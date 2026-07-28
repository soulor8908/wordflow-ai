"use client";

/**
 * 我的页（设计文档 §3.4：设置与统计入口）
 *
 * 整合：
 * - 学习总览（Streak + 卡片总数 + 今日数据）
 * - 我的卡片（按状态分类：待复习 / 已掌握 / 学习中）
 * - AI 配置（BYOK：provider / apiKey / baseURL / model + 测试连接）
 * - 通知与离线设置（PwaSettings）
 */
import Link from "next/link";
import { useEffect, useState } from "react";
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
import { RobotIcon } from "@/components/ui/icons";
import PwaSettings from "@/app/stats/pwa-settings";

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
              <span className="rounded-full bg-green-50 px-2 py-0.5 text-green-600 dark:bg-green-950">
                已掌握 {cardStat.byStatus.mastered}
              </span>
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

      {/* AI 配置 */}
      <AiConfigSection
        config={aiConfig}
        onSaved={() =>
          getAiConfig().then((c) => setAiConfigState(c))
        }
      />

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
    config?.provider ?? "glm"
  );
  const [apiKey, setApiKey] = useState(config?.apiKey ?? "");
  const [baseURL, setBaseURL] = useState(
    config?.baseURL ?? PROVIDER_CONFIGS.glm.baseURL
  );
  const [model, setModel] = useState(
    config?.model ?? PROVIDER_CONFIGS.glm.defaultModel
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
    setProvider("glm");
    setBaseURL(PROVIDER_CONFIGS.glm.baseURL);
    setModel(PROVIDER_CONFIGS.glm.defaultModel);
    setEditing(true);
    setTestResult(null);
  }

  return (
    <section className="rounded-xl border border-neutral-200 px-4 py-4 dark:border-neutral-800">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-medium text-neutral-700 dark:text-neutral-300">
          <RobotIcon title="AI 配置" className="h-4 w-4" /> AI 配置
        </h2>
        {config && !editing && (
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] text-green-700 dark:bg-green-950 dark:text-green-300">
              ✓ 已配置 · {config.provider}
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

      {editing ? (
        <div className="flex flex-col gap-3">
          {/* Provider 选择 */}
          <div>
            <label className="mb-1 block text-xs text-neutral-500">
              AI 服务商
            </label>
            <div className="grid grid-cols-4 gap-2">
              {(["glm", "deepseek", "mimo", "custom"] as ProviderName[]).map(
                (p) => (
                  <Button
                    key={p}
                    type="button"
                    variant={provider === p ? "primary" : "secondary"}
                    size="sm"
                    onClick={() => handleProviderChange(p)}
                    className="text-xs"
                  >
                    {p === "glm"
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
