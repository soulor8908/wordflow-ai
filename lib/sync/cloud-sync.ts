/**
 * 云端同步（Cloud Sync）
 *
 * 由于 WordFlow 是本地优先 PWA（无后端数据库），云端同步采用
 * "导出 / 导入 JSON 文件"模式：用户可把全部数据导出为 JSON 文件，
 * 保存到任意云盘（iCloud / Google Drive / OneDrive 等），
 * 换设备时导入该文件恢复数据。
 *
 * 同步内容：
 * - settings:*（streak、active-book、ai-config、user-profile）
 * - log:*（学习日志）
 * - card:*（FSRS 卡片，含掌握状态、复习进度）
 * - fav:*（收藏词）
 *
 * 合并策略：Last-Write-Wins（LWW）——按 updatedAt 时间戳合并，
 * 较新的记录覆盖较旧的。删除以 tombstone 标记（MVP 阶段直接跳过已删除项）。
 */
import { getDb, listItemsByPrefix, type KVRecord } from "@/lib/storage/db";
import type { UserProfile } from "@/lib/stats/user-profile";

/** 同步数据包版本 */
const SYNC_VERSION = 1;

/** 同步数据包结构 */
export interface SyncBundle {
  version: number;
  exportedAt: string;
  /** 生成此包的设备标识 */
  deviceId: string;
  /** 应用版本 */
  appVersion: string;
  /** 全部 KV 记录（settings/log/card/fav） */
  records: SyncRecord[];
  /** 用户画像快照（冗余存储，便于快速预览） */
  profile?: UserProfile;
}

export interface SyncRecord {
  key: string;
  value: unknown;
  prefix: string;
  updatedAt?: string;
  dueAt?: string;
}

/** 获取或生成设备 ID */
function getDeviceId(): string {
  if (typeof window === "undefined") return "server";
  const KEY = "wordflow:device-id";
  let id = window.localStorage.getItem(KEY);
  if (!id) {
    id = `dev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    window.localStorage.setItem(KEY, id);
  }
  return id;
}

/** 导出全部用户数据为 SyncBundle */
export async function exportSyncBundle(): Promise<SyncBundle> {
  const db = await getDb();
  const allRecords = await db.kv.toArray();

  const records: SyncRecord[] = allRecords
    .filter((r) => r.key && r.prefix)
    .map((r) => ({
      key: r.key,
      value: r.value,
      prefix: r.prefix,
      updatedAt: r.updatedAt,
      dueAt: r.dueAt,
    }));

  // 尝试附带用户画像快照
  let profile: UserProfile | undefined;
  try {
    const { getUserProfile } = await import("@/lib/stats/user-profile");
    profile = (await getUserProfile()) ?? undefined;
  } catch {
    /* 画像不存在时忽略 */
  }

  return {
    version: SYNC_VERSION,
    exportedAt: new Date().toISOString(),
    deviceId: getDeviceId(),
    appVersion: "0.1.0",
    records,
    profile,
  };
}

/** 导入 SyncBundle，按 LWW 合并到本地数据库 */
export async function importSyncBundle(bundle: SyncBundle): Promise<{
  merged: number;
  skipped: number;
  total: number;
}> {
  if (!bundle || bundle.version !== SYNC_VERSION) {
    throw new Error(`不支持的同步包版本：${bundle?.version ?? "unknown"}`);
  }

  const db = await getDb();
  let merged = 0;
  let skipped = 0;

  for (const record of bundle.records) {
    if (!record.key || !record.prefix) {
      skipped++;
      continue;
    }

    // 查询本地是否已有该 key
    const existing = await db.kv.get(record.key);

    if (existing) {
      // LWW：比较 updatedAt，较新的覆盖较旧的
      const existingUpdated = existing.updatedAt
        ? new Date(existing.updatedAt).getTime()
        : 0;
      const incomingUpdated = record.updatedAt
        ? new Date(record.updatedAt).getTime()
        : 0;
      if (incomingUpdated <= existingUpdated) {
        skipped++;
        continue;
      }
    }

    // 写入/更新
    const newRecord: KVRecord = {
      key: record.key,
      value: record.value,
      prefix: record.prefix,
      updatedAt: record.updatedAt,
      dueAt: record.dueAt,
    };
    await db.kv.put(newRecord);
    merged++;
  }

  return {
    merged,
    skipped,
    total: bundle.records.length,
  };
}

/** 触发浏览器下载，把 SyncBundle 保存为 JSON 文件 */
export function downloadSyncBundle(bundle: SyncBundle): void {
  if (typeof window === "undefined") return;
  const json = JSON.stringify(bundle, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const date = new Date().toISOString().slice(0, 10);
  a.download = `wordflow-backup-${date}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** 读取用户选择的 JSON 文件并解析为 SyncBundle */
export function readSyncBundleFromFile(file: File): Promise<SyncBundle> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result as string) as SyncBundle;
        if (!data.version || !data.records) {
          reject(new Error("文件格式不正确：缺少 version 或 records 字段"));
          return;
        }
        resolve(data);
      } catch (e) {
        reject(new Error("文件解析失败：" + (e instanceof Error ? e.message : String(e))));
      }
    };
    reader.onerror = () => reject(new Error("文件读取失败"));
    reader.readAsText(file);
  });
}

/** 统计本地数据概况（同步前展示） */
export async function getLocalDataSummary(): Promise<{
  totalRecords: number;
  cards: number;
  logs: number;
  favorites: number;
  settings: number;
}> {
  const [cards, logs, favorites, settings] = await Promise.all([
    listItemsByPrefix("card:"),
    listItemsByPrefix("log:"),
    listItemsByPrefix("fav:"),
    listItemsByPrefix("settings:"),
  ]);
  return {
    totalRecords: cards.length + logs.length + favorites.length + settings.length,
    cards: cards.length,
    logs: logs.length,
    favorites: favorites.length,
    settings: settings.length,
  };
}
