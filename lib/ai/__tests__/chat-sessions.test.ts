import { describe, test, expect, beforeEach, afterEach } from "vitest";
import {
  listSessions,
  getSessionMessages,
  createSession,
  appendMessages,
  setSessionMessages,
  deleteSession,
  type ChatMessage,
} from "@/lib/ai/chat-sessions";

// mock localStorage
const store: Record<string, string> = {};

const localStorageMock = {
  getItem: (key: string) => (key in store ? store[key] : null),
  setItem: (key: string, value: string) => {
    store[key] = String(value);
  },
  removeItem: (key: string) => {
    delete store[key];
  },
  clear: () => {
    for (const k of Object.keys(store)) delete store[k];
  },
  key: (i: number) => Object.keys(store)[i] ?? null,
  get length() {
    return Object.keys(store).length;
  },
};

// chat-sessions.ts 用 `typeof window === "undefined"` 做 SSR 守卫，
// node 测试环境需同时注入 window + localStorage 才能触达存储逻辑
const g = globalThis as Record<string, unknown>;

beforeEach(() => {
  for (const k of Object.keys(store)) delete store[k];
  g.window = globalThis;
  g.localStorage = localStorageMock;
});

afterEach(() => {
  delete g.window;
  delete g.localStorage;
});

describe("chat-sessions — 多会话管理", () => {
  test("createSession 创建空会话并出现在列表中", () => {
    const id = createSession();
    expect(id).toBeTruthy();
    const list = listSessions();
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(id);
    expect(list[0].title).toBe("新对话");
    expect(list[0].messageCount).toBe(0);
  });

  test("appendMessages 追加消息并自动更新标题", () => {
    const id = createSession();
    const userMsg: ChatMessage = { role: "user", content: "abandon 怎么用？" };
    appendMessages(id, [userMsg]);
    const msgs = getSessionMessages(id);
    expect(msgs).toHaveLength(1);
    expect(msgs[0].content).toBe("abandon 怎么用？");
    const list = listSessions();
    expect(list[0].title).toBe("abandon 怎么用？");
    expect(list[0].messageCount).toBe(1);
  });

  test("标题超 20 字符自动截断加省略号", () => {
    const id = createSession();
    const longContent = "请帮我详细解释一下 transformer 这个词在深度学习中的含义和应用场景";
    appendMessages(id, [{ role: "user", content: longContent }]);
    const list = listSessions();
    expect(list[0].title.endsWith("…")).toBe(true);
    expect(list[0].title.length).toBe(21); // 20 字符 + 省略号
  });

  test("多个会话按 updatedAt 降序排列", async () => {
    const id1 = createSession();
    // 模拟时间差
    await new Promise((r) => setTimeout(r, 5));
    const id2 = createSession();
    await new Promise((r) => setTimeout(r, 5));
    const id3 = createSession();
    const list = listSessions();
    expect(list).toHaveLength(3);
    // 最近创建的在前
    expect(list[0].id).toBe(id3);
    expect(list[1].id).toBe(id2);
    expect(list[2].id).toBe(id1);
  });

  test("setSessionMessages 替换全部消息", () => {
    const id = createSession();
    appendMessages(id, [
      { role: "user", content: "old1" },
      { role: "assistant", content: "old2" },
    ]);
    setSessionMessages(id, [{ role: "user", content: "new" }]);
    expect(getSessionMessages(id)).toHaveLength(1);
    expect(getSessionMessages(id)[0].content).toBe("new");
  });

  test("deleteSession 从列表和存储中移除", () => {
    const id1 = createSession();
    const id2 = createSession();
    appendMessages(id1, [{ role: "user", content: "hi" }]);
    deleteSession(id1);
    const list = listSessions();
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(id2);
    expect(getSessionMessages(id1)).toEqual([]);
  });

  test("旧版单 history 自动迁移为 default 会话", () => {
    // 模拟旧版数据
    store["wordflow:ai-chat-history"] = JSON.stringify([
      { role: "user", content: "hello" },
      { role: "assistant", content: "hi" },
    ]);
    // listSessions 触发迁移
    const list = listSessions();
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe("default");
    expect(list[0].messageCount).toBe(2);
    expect(list[0].title).toBe("hello");
    // 旧 key 应被清理
    expect(store["wordflow:ai-chat-history"]).toBeUndefined();
  });

  test("最多保留 50 条消息每会话", () => {
    const id = createSession();
    const msgs: ChatMessage[] = [];
    for (let i = 0; i < 60; i++) {
      msgs.push({ role: "user", content: `msg ${i}` });
    }
    appendMessages(id, msgs);
    expect(getSessionMessages(id)).toHaveLength(50);
    // 保留最后 50 条
    expect(getSessionMessages(id)[0].content).toBe("msg 10");
    expect(getSessionMessages(id)[49].content).toBe("msg 59");
  });
});
