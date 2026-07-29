/**
 * 免费通道不可用时的本地兜底回复生成（设计文档 §4.4.4 试用通道）
 *
 * 当既未配置 FREE_AI_API_KEY、又不在 Cloudflare 运行时时，
 * POST /api/ai/chat 会回退到本函数生成的引导文案，保证试用用户
 * 不会卡在"AI 暂不可用"，而是获得有上下文意义的引导。
 */

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * 根据用户最后一条消息生成 fallback 回复。
 * - 消息含单词且较短：给出该词的引导解释
 * - 其他情况：给出通用引导
 */
export function buildFallbackReply(messages: ChatMessage[]): string {
  const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
  const userText = lastUserMsg?.content?.trim() ?? "";

  // 如果用户问的是某个单词，尝试给出基础解释引导
  const wordMatch = userText.match(/\b([a-zA-Z]{2,20})\b/);
  if (wordMatch && userText.length < 50) {
    const word = wordMatch[1].toLowerCase();
    return [
      `📝 关于「${word}」：`,
      ``,
      `当前是**离线体验模式**，AI 深度解析功能需要配置 API Key。`,
      ``,
      `你可以：`,
      `1. 点击右下角「我的」→ AI 配置，添加自己的 API Key（推荐 GLM-4-Flash，免费额度充足）`,
      `2. 配置后再问 AI，可获得：词根拆解、联想记忆、例句生成、同反义词对比等完整能力`,
      ``,
      `💡 提示：词条页右下角的"问 AI 深入联想"按钮在配置 Key 后可一键唤起 AI 深度解析。`,
    ].join("\n");
  }

  return [
    `👋 当前是**离线体验模式**，AI 对话能力受限。`,
    ``,
    `我收到了你的消息：「${userText.slice(0, 60)}${userText.length > 60 ? "…" : ""}」`,
    ``,
    `要获得完整的 AI 对话体验（多轮问答、学习建议、单词深度解析），请：`,
    `1. 点击右下角悬浮球 → 顶部提示「添加 API Key」`,
    `2. 或进入「我的」→ AI 配置，添加自己的 API Key`,
    `3. 推荐 GLM-4-Flash（智谱）或 DeepSeek，均有免费额度`,
    ``,
    `配置完成后，AI 可以帮你：制定学习计划、解释词根词缀、生成记忆口诀、批改造句等。`,
  ].join("\n");
}
