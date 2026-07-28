/**
 * Cloudflare Workers AI 调用（免费通道，无需 API Key）
 *
 * 项目部署在 Cloudflare 上，通过 wrangler.jsonc 的 ai binding 获取 env.AI。
 * Workers AI 提供免费推理额度（每天 10,000 neurons），适合作为默认 AI 通道。
 *
 * 模型选择：@cf/meta/llama-3.1-8b-instruct
 * - 开源模型，中英文能力较好
 * - 免费额度充足，适合学习场景
 *
 * 注意：仅在 Cloudflare 运行时可用，本地 dev 环境需通过 wrangler dev 启动。
 */

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

interface WorkersAIResponse {
  response?: string;
  error?: string;
}

/** 尝试获取 Cloudflare 运行时 env（仅在生产/wrangler dev 下可用） */
async function getCloudflareAI(): Promise<unknown | null> {
  try {
    // @opennextjs/cloudflare 提供 getRequestContext() 获取 env
    const mod = await import("@opennextjs/cloudflare");
    const getRequestContext =
      (mod as unknown as { getRequestContext?: () => { env: Record<string, unknown> } })
        .getRequestContext;
    if (!getRequestContext) return null;
    const ctx = getRequestContext();
    const ai = ctx.env?.AI;
    return ai ?? null;
  } catch {
    // 本地 dev 或未部署在 Cloudflare 上 → 返回 null
    return null;
  }
}

/**
 * 通过 Cloudflare Workers AI 生成回复。
 * @returns AI 回复文本；如果 Workers AI 不可用则抛错
 */
export async function generateWithCloudflareAI(
  systemPrompt: string,
  messages: ChatMessage[]
): Promise<string> {
  const ai = await getCloudflareAI();
  if (!ai) {
    throw new Error("Cloudflare Workers AI 不可用");
  }

  const aiBinding = ai as {
    run: (
      model: string,
      options: { messages: ChatMessage[] }
    ) => Promise<WorkersAIResponse>;
  };

  const response = await aiBinding.run("@cf/meta/llama-3.1-8b-instruct", {
    messages: [
      { role: "system", content: systemPrompt },
      ...messages,
    ],
  });

  if (response.error) {
    throw new Error(`Workers AI 错误: ${response.error}`);
  }

  return response.response ?? "";
}

/** 检查 Cloudflare Workers AI 是否可用（用于 GET 状态查询） */
export async function isCloudflareAvailable(): Promise<boolean> {
  const ai = await getCloudflareAI();
  return ai !== null;
}
