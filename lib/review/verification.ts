export type VerificationLevel = "V1" | "V2" | "V3" | "V4";
export type VerificationState = "unverified" | "V1" | "V2" | "V3" | "mastered";

/** 每个状态可挑战的下一级（null = 已掌握，无下一级） */
const NEXT_LEVEL: Record<VerificationState, VerificationLevel | null> = {
  unverified: "V1",
  V1: "V2",
  V2: "V3",
  V3: "V4",
  mastered: null,
};

/** 通过当前下一级后的新状态 */
const NEXT_STATE: Record<VerificationState, VerificationState | null> = {
  unverified: "V1",
  V1: "V2",
  V2: "V3",
  V3: "mastered",
  mastered: null,
};

/**
 * 纯函数推进掌握状态（不可跳级）。
 * - 只能挑战当前状态的下一级
 * - 通过则前进，不通过则停留（不回退）
 * - 重测已通过的低级不影响状态
 * - mastered 状态不可变
 */
export function applyVerificationResult(
  state: VerificationState,
  level: VerificationLevel,
  passed: boolean
): VerificationState {
  const nextLevel = NEXT_LEVEL[state];
  if (nextLevel === null) return state; // 已掌握，不可变
  if (level !== nextLevel) return state; // 不可跳级 / 重测低级不推进
  if (!passed) return state; // 未通过，停留原级
  return NEXT_STATE[state]!;
}
