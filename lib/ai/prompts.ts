/**
 * Prompt Registry（对齐设计文档 §4.4.5 + devpath-ai lib/ai/prompts.ts）
 * - 所有 AI system prompt 集中管理，每个 prompt 带 id / version / system / changelog
 * - promptFingerprint() 计算版本指纹，写入 AICallRecord.promptVersion
 * - 修改 prompt 必须 bump version + 写 changelog
 * - PROMPT_VERSION_HASHES 快照测试强制拦截漏 bump
 */

export interface PromptEntry {
  id: string;
  version: string;
  system: string;
  changelog: string;
}

/** FNV-1a 32-bit hash → 8 hex chars（确定性，无依赖） */
function fnv1aHash(content: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < content.length; i++) {
    hash ^= content.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/** 计算版本指纹：id:version:hash */
export function promptFingerprint(id: string, version: string): string {
  const prompt = PROMPTS[id as keyof typeof PROMPTS];
  const content = prompt ? prompt.system : "";
  return `${id}:${version}:${fnv1aHash(content)}`;
}

/** 答案质量宪章（对齐设计文档 §4.4.5）：所有"产答案"的 prompt 注入此约束 */
export const CONTENT_QUALITY_CHARTER = `【答案质量宪章 Content Quality Charter】
- 语境真实：例句必须是真实可用的英语语境，不得编造不自然的表达
- 无歧义：释义与例句必须词义对应，不得产生歧义
- 词频适配：用词难度需适配用户当前词汇水平（参考目标词的词频等级）
- 不含敏感词：不得包含政治、色情、暴力等敏感内容
- 不编造：不得编造不存在的词义、词源或搭配`;

export const PROMPTS = {
  word_sentence: {
    id: "word_sentence",
    version: "v1",
    system: `你是一个英语词汇例句生成助手。给定一个英语单词及其词性、释义，生成 3 个真实、自然的例句。
要求：
1. 每个例句长度 8-20 词
2. 覆盖该词的不同常见用法
3. 难度适配 CEFR B1-B2 水平
4. 输出 JSON 数组：[{"sentence": "...", "translation": "...", "usage_note": "..."}]`,
    changelog: "v1: 初始版本",
  },
  word_root_mnemonic: {
    id: "word_root_mnemonic",
    version: "v1",
    system: `你是一个词根词缀记忆法助手。给定一个英语单词，分析其词根、词缀构成，生成一个助记口诀。
要求：
1. 优先使用拉丁/希腊词源
2. 助记口诀不超过 50 字，朗朗上口
3. 输出 JSON：{"root": "...", "affixes": [...], "mnemonic": "...", "related_words": [...]}`,
    changelog: "v1: 初始版本",
  },
  sentence_correction: {
    id: "sentence_correction",
    version: "v1",
    system: `你是一个英语造句批改助手（V4 产出验证）。给定用户造的英语句子和目标单词，批改语法、用词、地道性。
要求：
1. 指出具体错误（语法/用词/地道性）
2. 给出修改后的句子
3. 评分 0-100，60 分以下为不通过
4. 输出 JSON：{"errors": [...], "corrected": "...", "score": 85, "passed": true}`,
    changelog: "v1: 初始版本",
  },
} as const;

export type PromptId = keyof typeof PROMPTS;

/** PROMPT_VERSION_HASHES 快照：强制"改内容必 bump version"
 * 修改 prompt.system 时必须同步更新此处 version 和 hash，否则测试失败 */
export const PROMPT_VERSION_HASHES: Record<PromptId, string> = {
  word_sentence: `${PROMPTS.word_sentence.version}:${fnv1aHash(PROMPTS.word_sentence.system)}`,
  word_root_mnemonic: `${PROMPTS.word_root_mnemonic.version}:${fnv1aHash(PROMPTS.word_root_mnemonic.system)}`,
  sentence_correction: `${PROMPTS.sentence_correction.version}:${fnv1aHash(PROMPTS.sentence_correction.system)}`,
};

export function getPrompt(id: string): PromptEntry | undefined {
  return PROMPTS[id as PromptId];
}

/** 构造完整 system prompt（注入 Content Quality Charter） */
export function buildSystemPrompt(id: string): string {
  const prompt = getPrompt(id);
  if (!prompt) return "";
  return `${prompt.system}\n\n${CONTENT_QUALITY_CHARTER}`;
}
