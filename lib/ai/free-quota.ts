/**
 * 免费额度限流（服务端内存版）
 *
 * 设计目标（卡帕西视角：最小可用限流）：
 * - 无登录、无数据库依赖：用客户端生成的匿名 clientId 识别用户
 * - 进程内存 Map 存储，每日按本地日期重置
 * - Best-effort：Workers 实例重启会丢失计数（可接受，免费额度场景）
 * - 上限可由环境变量 FREE_AI_DAILY_QUOTA 配置，默认 20 次/日
 *
 * 注意：本模块仅在服务端运行，不可 import 到 client 组件。
 */

interface QuotaState {
  /** YYYY-MM-DD（UTC），用于判断是否跨日重置 */
  date: string;
  /** 当日已消耗次数 */
  used: number;
}

const quotaStore = new Map<string, QuotaState>();

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

/** 查询剩余额度（不消耗） */
export function peekQuota(clientId: string): QuotaSnapshot {
  const today = utcDate();
  const state = quotaStore.get(clientId);
  const used = state && state.date === today ? state.used : 0;
  const total = getDailyQuotaLimit();
  return { used, total, remaining: Math.max(0, total - used) };
}

/**
 * 消耗一次额度。
 * @returns 消耗后的快照；remaining === 0 表示已达上限（调用方应拒绝）
 */
export function consumeQuota(clientId: string): QuotaSnapshot {
  const today = utcDate();
  const prev = quotaStore.get(clientId);
  const used = prev && prev.date === today ? prev.used : 0;
  const total = getDailyQuotaLimit();
  const nextUsed = used + 1;
  quotaStore.set(clientId, { date: today, used: nextUsed });
  return { used: nextUsed, total, remaining: Math.max(0, total - nextUsed) };
}

/** 仅测试用：重置某个 clientId 的计数 */
export function _resetQuotaForTest(clientId: string): void {
  quotaStore.delete(clientId);
}
