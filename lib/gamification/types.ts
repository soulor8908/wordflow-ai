/**
 * 游戏化模块通用类型与工具（设计文档 §5.2 / §5.4）
 *
 * 设计原则（卡帕西式）：
 * - 所有派生数据可从已有 StudyLog / WordCard / 搜索历史重建，不维护冗余状态
 * - 状态变更点纯函数化，便于测试
 * - 存储复用现有 Dexie KV，前缀 `gamification:`，不改 schema 版本
 *
 * key 前缀约定：
 * - gamification:shield            连胜保护券状态（单条）
 * - gamification:quests:{date}     每日任务状态（按日分片）
 * - gamification:badge:{id}        徽章解锁记录（每个一条）
 * - gamification:xp                XP 缓存（可从 StudyLog 重算）
 * - gamification:last-tone         上次通知语气（用于轮换）
 * - gamification:comeback          回归挽留状态（断签后是否已赠送保护券）
 */
import type { Rating } from "@/lib/review/fsrs-scheduler";

/** YYYY-MM-DD 本地日期（与 book-queue.todayLocalDate 同语义） */
export function todayLocalDate(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** 计算两个 YYYY-MM-DD 日期相差的天数（b - a） */
export function daysBetween(a: string, b: string): number {
  const dateA = new Date(a + "T00:00:00Z");
  const dateB = new Date(b + "T00:00:00Z");
  return Math.round((dateB.getTime() - dateA.getTime()) / (24 * 60 * 60 * 1000));
}

/** 连胜保护券状态 */
export interface StreakShieldState {
  /** 当前持有数（上限 SHIELD_MAX） */
  shields: number;
  /** 上次通过连签获得保护券的日期 YYYY-MM-DD（去重，每日至多 +1） */
  lastEarnedDate: string | null;
  /** 上次消耗保护券的日期 YYYY-MM-DD（去重，每日至多消耗 1 张） */
  lastUsedDate: string | null;
  /** 累计消耗的总数（用于「守护者」隐藏徽章） */
  totalUsed: number;
}

/** 每日任务状态（按日分片） */
export interface DailyQuestState {
  /** 任务所属日期 YYYY-MM-DD */
  date: string;
  /** 已复习张数（包括新词首次复习与到期卡复习） */
  reviewed: number;
  /** 已答对次数（评分 Good / Easy） */
  correct: number;
  /** 今日是否查过词并收藏入队 */
  searched: boolean;
  /** 是否已领取三连完成奖励（避免重复发 XP / 宝箱） */
  claimed: boolean;
  /** 当日复习任务目标值（动态：min(10, 队列 50%)，避免队列不足时任务永远完不成） */
  reviewTarget: number;
  /** 当日答对目标值（固定 15） */
  correctTarget: number;
}

/** 徽章解锁记录 */
export interface BadgeRecord {
  /** 徽章 ID，如 "streak-30" */
  id: string;
  /** 解锁时间 ISO */
  unlockedAt: string;
}

/** XP 总账（缓存 + 可重算） */
export interface XpState {
  /** 累计 XP（含奖励 XP） */
  total: number;
  /** 最近一次同步自 StudyLog 的日期 YYYY-MM-DD（去重，避免同日多次全量重算） */
  lastSyncedDate: string | null;
}

/** 等级 */
export interface Level {
  /** 等级名（萌新/学徒/行家/达人/词神） */
  name: string;
  /** 该等级 XP 下界（含） */
  min: number;
  /** 该等级 XP 上界（不含） */
  max: number;
  /** 等级序号（1-5） */
  tier: number;
}

/** 通知语气 */
export type NotificationTone = "gentle" | "direct" | "challenge";

/** 通知动机（绑定用户已投入情感的对象） */
export type NotificationMotive = "streak" | "quest" | "badge" | "comeback";

/** 通知上下文（构造文案所需的最小信息） */
export interface NotificationContext {
  motive: NotificationMotive;
  /** 当前连胜天数 */
  streakDays: number;
  /** 待复习卡片数 */
  dueCount: number;
  /** 今日三任务完成数（0-3） */
  questDone: number;
  /** 距离下一个徽章还差多少（无目标时为 0） */
  badgeGap: number;
  /** 下一个徽章名（无目标时为 null） */
  badgeName: string | null;
}

/** 通知负载（与 PWA showNotification 直接对接） */
export interface NotificationPayload {
  title: string;
  body: string;
  url: string;
  tag: string;
  tone: NotificationTone;
  motive: NotificationMotive;
}

/** 评分→是否答对 */
export function isCorrectRating(rating: Rating): boolean {
  return rating === "Good" || rating === "Easy";
}

/** 评分→XP 增量（设计文档 §4.5） */
export function xpForRating(rating: Rating): number {
  switch (rating) {
    case "Easy":
      return 8;
    case "Good":
      return 5;
    case "Hard":
      return 3;
    case "Again":
      return 1;
  }
}

/** 单日是否为「早起鸟」时段（5-7 点，含两端） */
export function isEarlyBirdHour(hour: number): boolean {
  return hour >= 5 && hour <= 7;
}

/** 单日是否为「夜猫子」时段（23-次日 5 点前） */
export function isNightOwlHour(hour: number): boolean {
  return hour >= 23 || hour < 5;
}

/** Streak Shield 上限与连签补充阈值 */
export const SHIELD_MAX = 2;
/** 每连续 N 天补充一张保护券 */
export const SHIELD_EARN_INTERVAL = 7;

/** 每日任务答对目标（固定） */
export const QUEST_CORRECT_TARGET = 15;
/** 每日任务复习目标基准（受队列长度上限约束） */
export const QUEST_REVIEW_BASE = 10;

/** 三任务完成奖励 XP */
export const QUEST_COMPLETE_BONUS = 30;

/** Streak Shield key */
export const SHIELD_KEY = "gamification:shield";
/** XP 缓存 key */
export const XP_KEY = "gamification:xp";
/** 上次通知语气 key */
export const LAST_TONE_KEY = "gamification:last-tone";
/** 回归挽留状态 key */
export const COMEBACK_KEY = "gamification:comeback";
/** 徽章前缀 */
export const BADGE_PREFIX = "gamification:badge:";
/** 每日任务前缀 */
export const QUEST_PREFIX = "gamification:quests:";
