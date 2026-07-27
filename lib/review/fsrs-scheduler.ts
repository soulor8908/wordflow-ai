import {
  fsrs,
  generatorParameters,
  createEmptyCard,
  Rating as FSRSRating,
  State as FSRSState,
  type Card,
  type ReviewLog,
  type FSRS,
  type FSRSParameters,
  type Grade,
} from "ts-fsrs";

export type Rating = "Again" | "Hard" | "Good" | "Easy";
export type State = "New" | "Learning" | "Review" | "Relearning";
export type PresetName = "conservative" | "standard" | "aggressive";

/**
 * WordCard 用字符串 State 覆盖 ts-fsrs 的数字 State，
 * 便于持久化（Dexie JSON 存储）与可读性（设计文档 §2.2 V1-V4 状态机以字符串表达）。
 */
export interface WordCard extends Omit<Card, "state"> {
  state: State;
  /** WordFlow 扩展字段（存储于 Dexie value） */
  word: string;
  /** 来源标签：book:kaoyan / favorite / custom */
  source: string;
  /** V1-V4 记忆验证级别 */
  verification: "unverified" | "V1" | "V2" | "V3" | "mastered";
}

export interface WordReviewLog extends Omit<ReviewLog, "rating" | "state"> {
  rating: Rating;
  state: State;
  word: string;
}

const RATING_MAP: Record<Rating, FSRSRating> = {
  Again: FSRSRating.Again,
  Hard: FSRSRating.Hard,
  Good: FSRSRating.Good,
  Easy: FSRSRating.Easy,
};

const STATE_TO_STRING: Record<FSRSState, State> = {
  [FSRSState.New]: "New",
  [FSRSState.Learning]: "Learning",
  [FSRSState.Review]: "Review",
  [FSRSState.Relearning]: "Relearning",
};

const RATING_TO_STRING: Record<FSRSRating, Rating> = {
  [FSRSRating.Manual]: "Again", // Manual 不会出现在 repeat() 结果中，占位
  [FSRSRating.Again]: "Again",
  [FSRSRating.Hard]: "Hard",
  [FSRSRating.Good]: "Good",
  [FSRSRating.Easy]: "Easy",
};

/** 三预设（对齐设计文档 §4.3：conservative 0.95 / standard 0.9 / aggressive 0.8） */
export const FSRS_PRESETS: Record<PresetName, FSRSParameters> = {
  conservative: generatorParameters({ request_retention: 0.95 }),
  standard: generatorParameters({ request_retention: 0.9 }),
  aggressive: generatorParameters({ request_retention: 0.8 }),
};

const schedulerCache = new Map<PresetName, FSRS>();

export function getScheduler(preset: PresetName): FSRS {
  let f = schedulerCache.get(preset);
  if (!f) {
    f = fsrs(FSRS_PRESETS[preset]);
    schedulerCache.set(preset, f);
  }
  return f;
}

/** 创建新卡片（WordCard），due = now */
export function createNewCard(now: Date, word = "", source = ""): WordCard {
  const base = createEmptyCard(now);
  return {
    ...base,
    state: "New",
    word,
    source,
    verification: "unverified",
  };
}

export interface ReviewResult {
  card: WordCard;
  log: WordReviewLog;
}

/**
 * 评分复习卡片，返回新卡片 + 复习日志（纯函数）。
 * @param card 当前卡片
 * @param rating 评分（Again/Hard/Good/Easy）
 * @param now 复习时刻
 * @param preset FSRS 预设
 */
export function reviewCard(
  card: WordCard,
  rating: Rating,
  now: Date,
  preset: PresetName = "standard"
): ReviewResult {
  const f = getScheduler(preset);
  const fsrsRating = RATING_MAP[rating];
  // ts-fsrs 内部需要数字 state；调用前把字符串 state 转回数字
  const fsrsCard: Card = { ...card, state: fsrsStateFromString(card.state) };
  // next() 直接返回当前评分对应的 RecordLogItem，避免 Grade 索引歧义
  const { card: nextCard, log } = f.next(fsrsCard, now, fsrsRating as Grade);

  const word = card.word;
  const newCard: WordCard = {
    ...nextCard,
    state: STATE_TO_STRING[nextCard.state],
    word,
    source: card.source,
    verification: card.verification,
  };

  const wordLog: WordReviewLog = {
    ...log,
    rating: RATING_TO_STRING[log.rating],
    state: STATE_TO_STRING[log.state],
    word,
  };

  return { card: newCard, log: wordLog };
}

function fsrsStateFromString(state: State): FSRSState {
  switch (state) {
    case "New":
      return FSRSState.New;
    case "Learning":
      return FSRSState.Learning;
    case "Review":
      return FSRSState.Review;
    case "Relearning":
      return FSRSState.Relearning;
  }
}
