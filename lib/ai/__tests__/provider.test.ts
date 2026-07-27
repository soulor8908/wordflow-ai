import { describe, test, expect } from "vitest";
import {
  getProviderConfig,
  resolveModel,
  classifyAiError,
  type ProviderName,
  type AiSessionConfig,
} from "@/lib/ai/provider";

describe("getProviderConfig — 四家 Provider 配置", () => {
  test("glm: 国内零梯子可达，baseURL + 默认模型", () => {
    const cfg = getProviderConfig("glm");
    expect(cfg.baseURL).toBe("https://open.bigmodel.cn/api/paas/v4");
    expect(cfg.defaultModel).toBe("glm-4-flash");
  });

  test("deepseek: 备选 Trial", () => {
    const cfg = getProviderConfig("deepseek");
    expect(cfg.baseURL).toBe("https://api.deepseek.com/v1");
    expect(cfg.defaultModel).toBe("deepseek-chat");
  });

  test("mimo: 备选 Trial", () => {
    const cfg = getProviderConfig("mimo");
    expect(cfg.baseURL).toBe("https://api.xiaomimimo.com/v1");
    expect(cfg.defaultModel).toBe("mimo-v2-pro");
  });

  test("custom: 用户自定义，baseURL/model 来自 session", () => {
    const cfg = getProviderConfig("custom");
    expect(cfg.baseURL).toBe(""); // 由 session 提供
    expect(cfg.defaultModel).toBe(""); // 由 session 提供
  });

  test("未知 provider → 抛错（避免静默用错配置）", () => {
    expect(() => getProviderConfig("unknown" as ProviderName)).toThrow();
  });
});

describe("resolveModel — 从 session 解析实际模型名", () => {
  const baseSession: AiSessionConfig = {
    provider: "glm",
    apiKey: "sk-test",
  };

  test("session 无 model → 用 provider 默认模型", () => {
    expect(resolveModel(baseSession)).toBe("glm-4-flash");
  });

  test("session 有 model → 用 session model（BYOK 自定义）", () => {
    expect(resolveModel({ ...baseSession, model: "glm-4-air" })).toBe(
      "glm-4-air"
    );
  });

  test("custom provider 无 model → 抛错（custom 必须指定 model）", () => {
    expect(() =>
      resolveModel({ provider: "custom", apiKey: "sk-test", baseURL: "https://x.com/v1" })
    ).toThrow("custom provider 必须指定 model");
  });

  test("custom provider 有 model + baseURL → 正常解析", () => {
    expect(
      resolveModel({
        provider: "custom",
        apiKey: "sk-test",
        baseURL: "https://my-llm.com/v1",
        model: "my-model",
      })
    ).toBe("my-model");
  });
});

describe("classifyAiError — 区分上游 401 vs 本地 500", () => {
  test("error.message 含 401 → upstream-auth（用户 apiKey 无效）", () => {
    const err = new Error("Request failed with status 401 Unauthorized");
    expect(classifyAiError(err)).toBe("upstream-auth");
  });

  test("error.message 含 'Unauthorized' → upstream-auth", () => {
    const err = new Error("Unauthorized: invalid api key");
    expect(classifyAiError(err)).toBe("upstream-auth");
  });

  test("error.message 含 'invalid api key' → upstream-auth", () => {
    const err = new Error("invalid api key");
    expect(classifyAiError(err)).toBe("upstream-auth");
  });

  test("error.message 含 403 → upstream-auth（权限不足）", () => {
    const err = new Error("403 Forbidden");
    expect(classifyAiError(err)).toBe("upstream-auth");
  });

  test("网络错误（fetch failed）→ upstream-other（非鉴权，可能是网络/服务端）", () => {
    const err = new Error("fetch failed: ECONNREFUSED");
    expect(classifyAiError(err)).toBe("upstream-other");
  });

  test("500 错误 → upstream-other（上游服务端错误）", () => {
    const err = new Error("500 Internal Server Error");
    expect(classifyAiError(err)).toBe("upstream-other");
  });

  test("未知错误 → local（本地配置/代码问题）", () => {
    const err = new Error("some unexpected error");
    expect(classifyAiError(err)).toBe("local");
  });

  test("null/undefined → local", () => {
    expect(classifyAiError(null)).toBe("local");
    expect(classifyAiError(undefined)).toBe("local");
  });

  test("非 Error 对象（字符串）→ 按内容分类", () => {
    expect(classifyAiError("401 Unauthorized")).toBe("upstream-auth");
    expect(classifyAiError("random string")).toBe("local");
  });
});
