import { describe, test, expect } from "vitest";
import { buildFallbackReply } from "@/lib/ai/fallback-reply";

describe("buildFallbackReply", () => {
  test("单词类短消息返回单词引导文案", () => {
    const reply = buildFallbackReply([
      { role: "user", content: "abandon" },
    ]);
    expect(reply).toContain("abandon");
    expect(reply).toContain("离线体验模式");
    expect(reply).toContain("API Key");
  });

  test("长句消息返回通用引导文案", () => {
    const longMsg = "请帮我制定一个考研英语单词学习计划，我每天有2小时可以用来背单词，希望三个月内掌握5000词".repeat(2);
    const reply = buildFallbackReply([
      { role: "user", content: longMsg },
    ]);
    expect(reply).toContain("离线体验模式");
    // 超过 60 字符的消息应截断显示
    expect(reply).toContain("…");
  });

  test("取最后一条 user 消息作为上下文", () => {
    const reply = buildFallbackReply([
      { role: "user", content: "hello" },
      { role: "assistant", content: "hi" },
      { role: "user", content: "world" },
    ]);
    expect(reply).toContain("world");
    expect(reply).not.toContain("hello");
  });

  test("空消息不报错", () => {
    const reply = buildFallbackReply([]);
    expect(reply).toContain("离线体验模式");
    expect(reply).toContain("「」");
  });

  test("含单词的短消息提取首个英文单词", () => {
    const reply = buildFallbackReply([
      { role: "user", content: "what is transformer" },
    ]);
    // 取第一个匹配的单词
    expect(reply).toMatch(/关于「(what|transformer)」/);
  });
});
