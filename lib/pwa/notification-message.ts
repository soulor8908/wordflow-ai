export interface BackgroundCheckInput {
  dueCount: number;
  daysSinceLastStudy: number;
}

export interface NotificationPayload {
  title: string;
  body: string;
  url: string;
  tag: string;
}

/**
 * 根据 periodicsync 后台检查结果构造通知文案（纯函数）。
 * 文案分级（对齐设计文档 §3.4 + §4.5.3）：
 * - dueCount > 0 且 daysSinceLastStudy < 3 → "今日有 N 词待复习"
 * - daysSinceLastStudy >= 3 且 < 7 → "回来背词吧，复习队列在等你"
 * - daysSinceLastStudy >= 7 → "很久没背词了，词书在等你"（换文案避免麻木）
 * - dueCount == 0 且 daysSinceLastStudy < 3 → null（无需打扰）
 */
export function buildNotificationMessage(
  input: BackgroundCheckInput
): NotificationPayload | null {
  const { dueCount, daysSinceLastStudy } = input;
  const REVIEW_URL = "/review";
  const TAG = "wordflow-review";

  // 7 天以上：换文案避免麻木
  if (daysSinceLastStudy >= 7) {
    return {
      title: "很久没背词了，词书在等你",
      body: dueCount > 0 ? `还有 ${dueCount} 词待复习，别让它们沉睡` : "回来继续背词吧",
      url: REVIEW_URL,
      tag: TAG,
    };
  }

  // 3-6 天：召回
  if (daysSinceLastStudy >= 3) {
    return {
      title: "回来背词吧，复习队列在等你",
      body: dueCount > 0 ? `今日有 ${dueCount} 词待复习` : "保持节奏，坚持就是胜利",
      url: REVIEW_URL,
      tag: TAG,
    };
  }

  // 0-2 天：有待复习卡片才提醒
  if (dueCount > 0) {
    return {
      title: `今日有 ${dueCount} 词待复习`,
      body: `共 ${dueCount} 词待复习，点击开始`,
      url: REVIEW_URL,
      tag: TAG,
    };
  }

  // 今天已学完且无逾期：不打扰
  return null;
}
