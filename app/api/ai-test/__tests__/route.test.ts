import { describe, test, expect } from "vitest";
import { classifyAiError, type AiErrorClass } from "@/lib/ai/provider";

/**
 * 验证 BYOK 报"上游服务暂时不可用"场景的错误分类。
 *
 * 用户反馈：添加了正确的 API Key，但报"上游服务暂时不可用，请稍后重试"。
 * 根因：classifyAiError 把无法识别的错误归为 upstream-other，
 *       且前端只显示笼统文案，用户看不到具体原因。
 *
 * 修复后：API 返回 rawError 字段，前端展示原始错误信息，
 *        用户可据此判断是网络问题、SSL 问题还是 baseURL 错误。
 */
describe("BYOK 错误分类 — 正确 Key 报上游不可用的场景", () => {
  test("SSL 握手失败 → upstream-other（用户应看到具体错误）", () => {
    const err = new Error(
      "fetch failed: OpenSSL SSL_connect: SSL_ERROR_SYSCALL in connection to apihub.agnes-ai.com:443"
    );
    expect(classifyAiError(err)).toBe<AiErrorClass>("upstream-other");
  });

  test("DNS 解析失败 → upstream-other", () => {
    const err = new Error("fetch failed: getaddrinfo ENOTFOUND apihub.agnes-ai.com");
    expect(classifyAiError(err)).toBe<AiErrorClass>("upstream-other");
  });

  test("连接超时 → upstream-other", () => {
    const err = new Error("Request timed out after 30000ms");
    expect(classifyAiError(err)).toBe<AiErrorClass>("upstream-other");
  });

  test("连接被拒绝 → upstream-other", () => {
    const err = new Error("fetch failed: ECONNREFUSED 127.0.0.1:443");
    expect(classifyAiError(err)).toBe<AiErrorClass>("upstream-other");
  });

  test("baseURL 错误返回非 JSON → upstream-other（含 json 关键词）", () => {
    const err = new Error("Unexpected token < in JSON at position 0");
    expect(classifyAiError(err)).toBe<AiErrorClass>("upstream-other");
  });

  test("401 鉴权失败 → upstream-auth（区分于网络问题）", () => {
    const err = new Error("Request failed with status 401");
    expect(classifyAiError(err)).toBe<AiErrorClass>("upstream-auth");
  });

  test("正确的 Key 但模型名错误 → upstream-other", () => {
    const err = new Error("model_not_found: agnes-2.0-flash-x does not exist");
    expect(classifyAiError(err)).toBe<AiErrorClass>("upstream-other");
  });

  test("空错误对象 → local（避免把空错误误判为上游）", () => {
    expect(classifyAiError(null)).toBe<AiErrorClass>("local");
    expect(classifyAiError(undefined)).toBe<AiErrorClass>("local");
  });

  test("Invalid URL → local（baseURL 配置错误，非上游问题）", () => {
    const err = new Error("Invalid URL: https://[malformed");
    expect(classifyAiError(err)).toBe<AiErrorClass>("local");
  });
});
