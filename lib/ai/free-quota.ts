/**
 * 免费额度限流（KV 持久化版）
 *
 * 设计目标（卡帕西视角：最小可用 + 真正持久）：
 * - 无登录、无数据库依赖：用客户端生成的匿名 clientId 识别用户
 * - KV 作为 L2 持久层：Worker 实例重启后计数不丢失
 * - 进程内存 Map 作为 L1 缓存：减少 KV 读延迟（peek 场景 30s 内命中缓存）
 * - 每日按 UTC 日期重置；KV 条目带 48h TTL 自动清理过期 clientId
 *
 * 一致性权衡：
 * - KV 是最终一致的（写入最长 ~60s 全球传播），多 edge 并发可能多放几 次
 * - 免费额度场景（20 次/日）可接受此误差，无需 Durable Objects 的强一致
 *
 * 降级策略：
 * - KV 未绑定（本地 dev / 测试 / 未配置 namespace）→ 回退到进程内存
 * - 与改造前行为一致，不会因为 KV 不可用而阻断功能
 *
 * 注意：本模块仅在服务端运行，不可 import 到 client 组件。
 */

interface QuotaState {
  /** YYYY-MM-DD（UTC），用于判断是否跨日重置 */
  date: string;
  /** 当日已消耗次数 */
  used: number;
}

/** Minimal KV 接口（仅覆盖 free-quota 用到的 get/put，避免引入 @cloudflare/workers-types） */
interface KvNamespaceLike {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}

interface L1Entry {
  state: QuotaState;
  /** 缓存写入时间戳（ms），用于判断 L1 是否过期 */
  ts: number;
}

const KV_KEY_PREFIX = "quota:";
const KV_TTL_SECONDS = 48 * 60 * 60; // 48h，自动清理过期 clientId
const L1_TTL_MS = 30_000; // 30s，peek 场景的缓存窗口

// L1 缓存：减少 KV 读次数（per Worker 实例生命周期）
const l1Cache = new Map<string, L1Entry>();
// L2 降级存储：KV 不可用时的进程内存 fallback
const memoryStore = new Map<string, QuotaState>();

/** UTC YYYY-MM-DD，作为限流窗口键（避免本地时区漂移） */
function utcDate(now: Date = new Date()): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** 每日免费额度上限，可通过环境变量覆盖 */
export function getDailyQuotaLimit(): number {
  const raw = process.env.FREE_AI_DAILY_QUOTA;
  const n = raw ? Number.parseInt(raw, 10) : 20;
  return Number.isFinite(n) && n > 0 ? n : 20;
}

export interface QuotaSnapshot {
  used: number;
  total: number;
  remaining: number;
}

/** 获取 KV namespace（不可用时返回 null，调用方走降级） */
async function getKv(): Promise<KvNamespaceLike | null> {
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const ctx = getCloudflareContext();
    const kv = (ctx.env as Record<string, unknown>).FREE_QUOTA_KV;
    return (kv as KvNamespaceLike) ?? null;
  } catch {
    // 非 Cloudflare 运行时（本地 dev / 测试）→ 降级到进程内存
    return null;
  }
}

function kvKey(clientId: string): string {
  return `${KV_KEY_PREFIX}${clientId}`;
}

/**
 * 读取当前 quota 状态。
 * 优先 L1 缓存（30s 窗口），未命中或过期则读 KV，KV 不可用则读进程内存。
 */
async function readQuota(clientId: string): Promise<QuotaState> {
  const today = utcDate();

  // L1 命中且未过期且未跨日 → 直接返回
  const cached = l1Cache.get(clientId);
  if (cached && Date.now() - cached.ts < L1_TTL_MS && cached.state.date === today) {
    return cached.state;
  }

  const kv = await getKv();
  if (!kv) {
    // 降级：进程内存
    const mem = memoryStore.get(clientId);
    const used = mem && mem.date === today ? mem.used : 0;
    const state: QuotaState = { date: today, used };
    l1Cache.set(clientId, { state, ts: Date.now() });
    return state;
  }

  // KV 读取
  const raw = await kv.get(kvKey(clientId));
  if (!raw) {
    const state: QuotaState = { date: today, used: 0 };
    l1Cache.set(clientId, { state, ts: Date.now() });
    return state;
  }
  try {
    const parsed = JSON.parse(raw) as QuotaState;
    // 跨日重置
    const state: QuotaState = parsed.date === today ? parsed : { date: today, used: 0 };
    l1Cache.set(clientId, { state, ts: Date.now() });
    return state;
  } catch {
    const state: QuotaState = { date: today, used: 0 };
    l1Cache.set(clientId, { state, ts: Date.now() });
    return state;
  }
}

/** 写回 quota 状态到 L1 + L2（KV 或进程内存） */
async function writeQuota(clientId: string, state: QuotaState): Promise<void> {
  l1Cache.set(clientId, { state, ts: Date.now() });
  memoryStore.set(clientId, state);

  const kv = await getKv();
  if (!kv) return;
  await kv.put(kvKey(clientId), JSON.stringify(state), {
    expirationTtl: KV_TTL_SECONDS,
  });
}

/** 查询剩余额度（不消耗） */
export async function peekQuota(clientId: string): Promise<QuotaSnapshot> {
  const state = await readQuota(clientId);
  const total = getDailyQuotaLimit();
  return { used: state.used, total, remaining: Math.max(0, total - state.used) };
}

/**
 * 消耗一次额度。
 * @returns 消耗后的快照；remaining === 0 表示已达上限（调用方应拒绝）
 */
export async function consumeQuota(clientId: string): Promise<QuotaSnapshot> {
  const state = await readQuota(clientId);
  const total = getDailyQuotaLimit();
  const nextUsed = state.used + 1;
  const nextState: QuotaState = { date: state.date, used: nextUsed };
  await writeQuota(clientId, nextState);
  return { used: nextUsed, total, remaining: Math.max(0, total - nextUsed) };
}

/** 仅测试用：重置某个 clientId 的计数 */
export function _resetQuotaForTest(clientId: string): void {
  l1Cache.delete(clientId);
  memoryStore.delete(clientId);
}
