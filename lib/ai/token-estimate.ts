/**
 * Token 估算工具（设计文档 §4.4.7：token 用量监控）
 *
 * 粗略估算文本的 token 数，无需引入 tiktoken 等重量级依赖。
 *
 * 估算规则（基于 GPT tokenizer 的经验值）：
 * - 英文/ASCII：约 4 字符 / token
 * - 中文 CJK：约 1.5 字符 / token（中文字符密度高，单字常对应 1-2 token）
 * - 标点/空白：ASCII 范围按英文算，CJK 标点按中文算
 *
 * 精度足够用于"拦截过长输入"和"用量统计概览"场景，
 * 不用于精确计费（计费应以 Provider 返回的 usage 为准）。
 */

/** 估算单段文本的 token 数 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  let tokens = 0;
  for (const char of text) {
    const code = char.charCodeAt(0);
    // CJK 统一表意文字 + CJK 扩展 + 全角标点
    if (
      (code >= 0x4e00 && code <= 0x9fff) || // CJK 基本
      (code >= 0x3400 && code <= 0x4dbf) || // CJK 扩展 A
      (code >= 0x3000 && code <= 0x303f) || // CJK 标点
      (code >= 0xff00 && code <= 0xffef)    // 全角字符
    ) {
      tokens += 0.7; // 中文 ~1.5 字/token
    } else {
      tokens += 0.25; // 英文 ~4 字符/token
    }
  }
  return Math.max(1, Math.ceil(tokens));
}

/** 估算消息数组（含 system prompt）的 token 数 */
export function estimateMessagesTokens(
  messages: { role: string; content: string }[]
): number {
  let total = 0;
  for (const msg of messages) {
    total += estimateTokens(msg.content);
    total += 4; // 每条消息的 overhead（role 标记 + 结构分隔）
  }
  total += 2; // 对话整体 overhead
  return total;
}

/** token 拦截阈值（基于常见模型上下文窗口 8K-128K 设定） */
export const TOKEN_WARN_THRESHOLD = 6_000; // 警告：内容较长，可能影响响应速度
export const TOKEN_BLOCK_THRESHOLD = 30_000; // 拦截：内容过长，拒绝发送

/** 检查 token 是否超限，返回拦截/警告信息 */
export function checkTokenLimit(
  tokens: number
): { ok: true } | { ok: false; blocked: boolean; message: string } {
  if (tokens >= TOKEN_BLOCK_THRESHOLD) {
    return {
      ok: false,
      blocked: true,
      message: `输入内容过长（约 ${tokens} token），已超过 ${TOKEN_BLOCK_THRESHOLD.toLocaleString()} token 上限。请精简对话历史或开启新会话后重试。`,
    };
  }
  if (tokens >= TOKEN_WARN_THRESHOLD) {
    return {
      ok: false,
      blocked: false,
      message: `输入内容较长（约 ${tokens} token），可能影响响应速度。建议精简对话历史或开启新会话。`,
    };
  }
  return { ok: true };
}
