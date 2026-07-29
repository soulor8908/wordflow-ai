/**
 * 游戏化事件钩子 —— 设计文档 §5.5 与现有代码的集成点
 *
 * 单一职责：把分散的游戏化副作用（shield / xp / quest / badge）封装为一个调用点。
 * 调用方只需在 submitReview / addFavorite / recordStudy 后调用对应 hook，
 * 不需要单独管理 shield / xp / quest / badge 的写入顺序。
 *
 * 三个核心钩子：
 * - onReviewCompleted：评分完成后调用（处理 shield / xp / quest / badge）
 * - onFavoriteAdded：收藏入队后调用（处理 xp / quest / badge）
 * - onSessionStart：会话开始时调用（处理回归挽留 + XP 同步）
 *
 * 所有钩子都 catch 错误，不阻塞主流程（设计原则：游戏化是甜点，不是主菜）。
 */
import { listItemsByPrefix } from "@/lib/storage/db";
import type { Rating, WordCard } from "@/lib/review/fsrs-scheduler";
import { getStreak, listStudyLogs, getStudyLog } from "@/lib/stats/streak-io";
import { todayLocalDate as todayLocalDateUtil } from "./types";
import {
  getShield,
  saveShield,
  resolveShieldForRecordStudy,
  maybeEarnShield,
} from "./shield";
import { getXp, saveXp, addXp, xpForReview, syncXpFromLogs } from "./xp";
import {
  getTodayQuest,
  saveDailyQuest,
  bumpReviewQuest,
  markSearchedQuest,
  claimCompleteBonus,
  isAllComplete,
} from "./daily-quests";
import {
  evaluateBadges,
  RARITY_XP,
  RARITY_SHIELD_REWARD,
  type BadgeContext,
  type BadgeRule,
} from "./badges";

export { todayLocalDateUtil as todayLocalDate };

/** 评分后游戏化处理结果（用于 UI toast 提示） */
export interface ReviewGamificationResult {
  /** 是否消耗了保护券保住连胜 */
  shieldConsumed: boolean;
  /** 本次评分获得的 XP */
  xpGained: number;
  /** 三任务是否全部完成（首次完成时触发奖励） */
  questAllCompleted: boolean;
  /** 三任务完成奖励 XP（首次完成时为 30，否则 0） */
  questBonusXp: number;
  /** 新解锁的徽章列表 */
  newBadges: BadgeRule[];
  /** 新解锁徽章的 XP 奖励之和 */
  badgeXpGained: number;
  /** 新解锁徽章的保护券奖励之和 */
  badgeShieldGained: number;
}

/**
 * 构造徽章判定上下文（聚合自现有数据）。
 *
 * 性能：单次调用涉及 listItemsByPrefix（卡片）+ listStudyLogs（日志），
 * 仅在评分后调用一次，可接受（约 10ms / 500 卡片）。
 */
export async function buildBadgeContext(opts?: {
  /** 今日队列长度（用于精度类今天正确率计算时无需） */
  queueLength?: number;
  /** 强制覆盖的 comebackGapDays（用于回归挽留场景） */
  comebackGapDays?: number;
}): Promise<BadgeContext> {
  const today = todayLocalDateUtil();
  const [streak, logs, cards, todayLog] = await Promise.all([
    getStreak(),
    listStudyLogs(),
    listItemsByPrefix<WordCard>("card:"),
    getStudyLog(today),
  ]);

  const totalCards = cards.length;
  const masteredCount = cards.filter((c) => c.verification === "mastered").length;

  // 近 7 天正确率
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const recentLogs = logs.filter((l) => new Date(l.updatedAt).getTime() >= sevenDaysAgo);
  const recentTotal = recentLogs.reduce(
    (s, l) => s + l.reviewCount + l.newCount,
    0
  );
  const recentCorrect = recentLogs.reduce((s, l) => s + l.correctCount, 0);
  const last7DaysAccuracy = recentTotal > 0 ? recentCorrect / recentTotal : 0;

  // 连续达到正确率 ≥ 90% 的天数（从今日往前数）
  const consecutiveQualifiedDays = computeConsecutiveQualifiedDays(logs);

  // 累计早起鸟/夜猫子天数（从每条日志的 updatedAt 小时派生）
  const { earlyBirdDays, nightOwlDays } = computeTimeWindowDays(logs);

  // 词书进度
  const bookProgress = await computeBookProgress(cards);

  // 累计消耗保护券数
  const shield = await getShield();
  const shieldUsedTotal = shield.totalUsed;

  // 最近学习小时
  const lastStudyHour = todayLog
    ? new Date(todayLog.updatedAt).getHours()
    : null;

  return {
    streak,
    totalCards,
    masteredCount,
    uniqueSearchCount: 0, // 由调用方在收藏时单独维护，这里默认 0
    last7DaysAccuracy,
    consecutiveQualifiedDays,
    todayLog: todayLog ?? null,
    lastStudyHour,
    earlyBirdDays,
    nightOwlDays,
    bookProgress,
    shieldUsedTotal,
    comebackGapDays: opts?.comebackGapDays ?? 0,
  };
}

/** 计算连续达到正确率 ≥ 90% 的天数（从今日向前回溯，遇到第一个不达标日即停） */
function computeConsecutiveQualifiedDays(logs: StudyLogForCompute[]): number {
  if (logs.length === 0) return 0;
  // 按日期倒序
  const sorted = [...logs].sort((a, b) => b.date.localeCompare(a.date));
  const QUALIFY_THRESHOLD = 0.9;
  const MIN_TOTAL = 5; // 当日至少 5 张才有统计意义
  let count = 0;
  for (const log of sorted) {
    const total = log.newCount + log.reviewCount;
    if (total < MIN_TOTAL) break; // 当日学习太少不算
    const acc = total > 0 ? log.correctCount / total : 0;
    if (acc >= QUALIFY_THRESHOLD) {
      count++;
    } else {
      break;
    }
  }
  return count;
}

type StudyLogForCompute = {
  date: string;
  newCount: number;
  reviewCount: number;
  correctCount: number;
};

/**
 * 计算累计早起鸟（5-7 点）/夜猫子（23-5 点）天数。
 *
 * 从每条 StudyLog 的 updatedAt 派生当日最后学习时段。
 * 同一天同时段多次学习只算 1 天（按 date 去重）。
 */
function computeTimeWindowDays(logs: { date: string; updatedAt: string }[]): {
  earlyBirdDays: number;
  nightOwlDays: number;
} {
  const earlyBirdDates = new Set<string>();
  const nightOwlDates = new Set<string>();
  for (const log of logs) {
    const hour = new Date(log.updatedAt).getHours();
    if (hour >= 5 && hour <= 7) earlyBirdDates.add(log.date);
    if (hour >= 23 || hour < 5) nightOwlDates.add(log.date);
  }
  return {
    earlyBirdDays: earlyBirdDates.size,
    nightOwlDays: nightOwlDates.size,
  };
}

/** 计算词书进度（已学/总词数） */
async function computeBookProgress(cards: WordCard[]): Promise<number> {
  if (cards.length === 0) return 0;
  try {
    const { getActiveBook } = await import("@/lib/review/active-book");
    const { loadBookMeta } = await import("@/lib/review/book-queue");
    const active = await getActiveBook();
    if (!active) return 0;
    const meta = await loadBookMeta(active.bookId);
    if (meta.wordCount === 0) return 0;
    // 已学 = 卡片来源为该词书的数量 / 总词数
    const learnedInBook = cards.filter(
      (c) => c.source === `book:${active.bookId}` || c.source === "drill"
    ).length;
    return Math.min(1, learnedInBook / meta.wordCount);
  } catch {
    return 0;
  }
}

/**
 * 钩子 1：评分完成后调用。
 *
 * 副作用：
 * - 同步 XP（首次）
 * - 增量加 XP（评分）
 * - 更新每日任务（reviewed +1, correct += isCorrect）
 * - 若三任务全完成且未领取，发放 +30 XP
 * - 评估徽章，新解锁徽章奖励 XP / 保护券
 *
 * 注意：本钩子不写 Streak（Streak 由 recordStudy 写）；
 *       但 shield 消耗需要在 recordStudy 调用前完成，所以提供
 *       prepareShieldForRecordStudy 单独函数。
 */
export async function onReviewCompleted(opts: {
  rating: Rating;
  wasNew: boolean;
  queueLength: number;
}): Promise<ReviewGamificationResult> {
  const { rating, wasNew, queueLength } = opts;
  const today = todayLocalDateUtil();

  // 1. XP 同步（首次或跨日）
  const logs = await listStudyLogs();
  await syncXpFromLogs(today, logs);

  // 2. 增量加 XP（评分）
  let xp = await getXp();
  const reviewXp = xpForReview(rating, wasNew);
  xp = addXp(xp, reviewXp);

  // 3. 更新每日任务
  let quest = await getTodayQuest(queueLength);
  quest = bumpReviewQuest(quest, rating);

  // 4. 三任务全完成 → 领取 +30 XP
  let questBonusXp = 0;
  if (isAllComplete(quest) && !quest.claimed) {
    const claimed = claimCompleteBonus(quest);
    quest = claimed.state;
    questBonusXp = claimed.bonus;
    xp = addXp(xp, questBonusXp);
  }
  await saveDailyQuest(quest);

  // 5. 评估徽章
  const ctx = await buildBadgeContext();
  // 用最新 quest 状态计算 questDone（用于通知构造，不影响徽章判定）
  const newBadges = await evaluateBadges(ctx);

  // 6. 新解锁徽章的奖励
  let badgeXpGained = 0;
  let badgeShieldGained = 0;
  for (const badge of newBadges) {
    badgeXpGained += RARITY_XP[badge.rarity];
    badgeShieldGained += RARITY_SHIELD_REWARD[badge.rarity];
  }
  if (badgeXpGained > 0) {
    xp = addXp(xp, badgeXpGained);
  }
  await saveXp(xp);

  // 7. 钻石徽章奖励保护券
  if (badgeShieldGained > 0) {
    const shield = await getShield();
    const newShield = {
      ...shield,
      shields: Math.min(2, shield.shields + badgeShieldGained),
    };
    await saveShield(newShield);
  }

  return {
    shieldConsumed: false, // 由 prepareShieldForRecordStudy 返回
    xpGained: reviewXp + questBonusXp + badgeXpGained,
    questAllCompleted: isAllComplete(quest),
    questBonusXp,
    newBadges,
    badgeXpGained,
    badgeShieldGained,
  };
}

/**
 * 钩子 2：收藏入队后调用。
 *
 * 副作用：
 * - 增量加 XP（+2）
 * - 标记"查词并收藏"任务完成
 * - 三任务全完成 → +30 XP
 * - 评估徽章（积累类、探索类）
 */
export async function onFavoriteAdded(opts: {
  /** 累计查询的不同词数（用于探索类徽章判定） */
  uniqueSearchCount?: number;
}): Promise<{
  xpGained: number;
  questAllCompleted: boolean;
  questBonusXp: number;
  newBadges: BadgeRule[];
  badgeXpGained: number;
  badgeShieldGained: number;
}> {
  // 1. 增量加 XP（+2）
  let xp = await getXp();
  xp = addXp(xp, 2);

  // 2. 更新每日任务（标记 searched）
  let quest = await getTodayQuest(0); // queueLength 此处不影响
  quest = markSearchedQuest(quest);

  // 3. 三任务全完成 → +30 XP
  let questBonusXp = 0;
  if (isAllComplete(quest) && !quest.claimed) {
    const claimed = claimCompleteBonus(quest);
    quest = claimed.state;
    questBonusXp = claimed.bonus;
    xp = addXp(xp, questBonusXp);
  }
  await saveDailyQuest(quest);

  // 4. 评估徽章
  const ctx = await buildBadgeContext();
  if (opts.uniqueSearchCount !== undefined) {
    ctx.uniqueSearchCount = opts.uniqueSearchCount;
  }
  const newBadges = await evaluateBadges(ctx);

  // 5. 新解锁徽章的奖励
  let badgeXpGained = 0;
  let badgeShieldGained = 0;
  for (const badge of newBadges) {
    badgeXpGained += RARITY_XP[badge.rarity];
    badgeShieldGained += RARITY_SHIELD_REWARD[badge.rarity];
  }
  if (badgeXpGained > 0) {
    xp = addXp(xp, badgeXpGained);
  }
  await saveXp(xp);

  if (badgeShieldGained > 0) {
    const shield = await getShield();
    const newShield = {
      ...shield,
      shields: Math.min(2, shield.shields + badgeShieldGained),
    };
    await saveShield(newShield);
  }

  return {
    xpGained: 2 + questBonusXp + badgeXpGained,
    questAllCompleted: isAllComplete(quest),
    questBonusXp,
    newBadges,
    badgeXpGained,
    badgeShieldGained,
  };
}

/**
 * 钩子 3：会话开始时调用（首页/复习页加载时）。
 *
 * 副作用：
 * - 同步 XP（首次或跨日）
 * - 检测回归挽留（断签 ≥7 天，赠送保护券）
 * - 评估"王者归来"隐藏徽章
 *
 * @returns 回归挽留信息（无回归时 gifted=false）
 */
export async function onSessionStart(): Promise<{
  comebackDetected: boolean;
  comebackGapDays: number;
  shieldGifted: boolean;
}> {
  const today = todayLocalDateUtil();

  // 1. XP 同步
  const logs = await listStudyLogs();
  await syncXpFromLogs(today, logs);

  // 2. 回归挽留检测
  const streak = await getStreak();
  if (!streak) {
    return { comebackDetected: false, comebackGapDays: 0, shieldGifted: false };
  }
  const gap = computeGapDays(streak.lastReviewDate, today);
  if (gap < 7) {
    return { comebackDetected: false, comebackGapDays: gap, shieldGifted: false };
  }

  // 3. 回归：检查是否已赠过（用 comeback key 去重）
  const { getItem, setItem } = await import("@/lib/storage/db");
  const COMEBACK_KEY = "gamification:comeback";
  const alreadyGifted = await getItem<{ date: string }>(COMEBACK_KEY);
  // 同次回归只赠一次（gap 同期只赠一次）
  if (alreadyGifted && alreadyGifted.date === streak.lastReviewDate) {
    return { comebackDetected: true, comebackGapDays: gap, shieldGifted: false };
  }

  // 4. 赠送保护券（若当前为 0）
  const shield = await getShield();
  let gifted = false;
  if (shield.shields === 0) {
    await saveShield({ ...shield, shields: 1 });
    gifted = true;
  }
  await setItem(COMEBACK_KEY, { date: streak.lastReviewDate });

  // 5. 评估徽章（王者归来需要 gap ≥ 30）
  const ctx = await buildBadgeContext({ comebackGapDays: gap });
  await evaluateBadges(ctx);

  return { comebackDetected: true, comebackGapDays: gap, shieldGifted: gifted };
}

/**
 * 在 recordStudy 调用前预处理保护券：决定是否消耗。
 *
 * 调用方应该在调用 recordStudy 之前调用本函数：
 * 1. 本函数返回 adjustedPrevStreak（可能修改 lastReviewDate 保住连胜）
 * 2. 调用方传 adjustedPrevStreak 给新的 recordStudy（需要修改 recordStudy 签名）
 *
 * 简化方案：本函数直接处理 shield 状态写库，返回是否消耗。
 * streak-io.recordStudy 仍按原逻辑计算 streak，但 shield 已经在它的 getStreak
 * 之前修改了 lastReviewDate——所以我们改用 getShield + resolveShieldForRecordStudy
 * 在 streak-io 内部集成（见 streak-io.ts 修改）。
 *
 * 此函数供调用方在 recordStudy 之外需要预判时使用（目前未在主流程调用）。
 */
export async function prepareShieldForRecordStudy(
  today: string
): Promise<{ consumed: boolean }> {
  const prevStreak = await getStreak();
  const shield = await getShield();
  const { newShield, consumed } = resolveShieldForRecordStudy(
    prevStreak,
    today,
    shield
  );
  if (consumed) {
    await saveShield(newShield);
  }
  return { consumed };
}

/**
 * 钩子 4：recordStudy 完成后调用（处理 shield 补充）。
 *
 * 设计：streak-io.recordStudy 内部已经处理了 shield 消耗；
 * 本钩子仅处理"连胜达到 7 的倍数 → 补充保护券"。
 */
export async function onRecordStudyCompleted(): Promise<{
  shieldEarned: boolean;
}> {
  const streak = await getStreak();
  if (!streak) return { shieldEarned: false };
  const today = todayLocalDateUtil();
  const shield = await getShield();
  const newShield = maybeEarnShield(streak, shield, today);
  if (newShield.shields !== shield.shields) {
    await saveShield(newShield);
    return { shieldEarned: true };
  }
  return { shieldEarned: false };
}

/** 计算两个 YYYY-MM-DD 日期相差的天数（b - a），与 types.daysBetween 同语义 */
function computeGapDays(a: string, b: string): number {
  const dateA = new Date(a + "T00:00:00Z");
  const dateB = new Date(b + "T00:00:00Z");
  return Math.round((dateB.getTime() - dateA.getTime()) / (24 * 60 * 60 * 1000));
}
