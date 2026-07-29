/**
 * AI 聊天会话管理（多会话持久化）
 *
 * 设计：每个会话独立存储于 localStorage，key = `wordflow:ai-session:{id}`。
 * 会话列表索引存于 `wordflow:ai-sessions-index`，按 updatedAt 降序。
 *
 * 旧版只有单个 `wordflow:ai-chat-history` 数组，首次加载时自动迁移为
 * 一个 id="default" 的会话，保证历史记录不丢失。
 */

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
}

export interface SessionMeta {
  id: string;
  title: string;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
}

const SESSIONS_INDEX_KEY = "wordflow:ai-sessions-index";
const SESSION_KEY_PREFIX = "wordflow:ai-session:";
const LEGACY_HISTORY_KEY = "wordflow:ai-chat-history";
const MAX_SESSIONS = 20;
const MAX_MESSAGES_PER_SESSION = 50;

function now(): string {
  return new Date().toISOString();
}

function sessionKey(id: string): string {
  return `${SESSION_KEY_PREFIX}${id}`;
}

function loadSession(id: string): ChatSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(sessionKey(id));
    return raw ? (JSON.parse(raw) as ChatSession) : null;
  } catch {
    return null;
  }
}

function saveSession(session: ChatSession): void {
  if (typeof window === "undefined") return;
  const trimmed: ChatSession = {
    ...session,
    messages: session.messages.slice(-MAX_MESSAGES_PER_SESSION),
  };
  window.localStorage.setItem(sessionKey(session.id), JSON.stringify(trimmed));
}

function loadIndex(): SessionMeta[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(SESSIONS_INDEX_KEY);
    return raw ? (JSON.parse(raw) as SessionMeta[]) : [];
  } catch {
    return [];
  }
}

function saveIndex(index: SessionMeta[]): void {
  if (typeof window === "undefined") return;
  // 保留最近 MAX_SESSIONS 个
  const trimmed = index.slice(0, MAX_SESSIONS);
  window.localStorage.setItem(SESSIONS_INDEX_KEY, JSON.stringify(trimmed));
}

function updateIndexMeta(session: ChatSession): void {
  const index = loadIndex();
  const meta: SessionMeta = {
    id: session.id,
    title: session.title,
    messageCount: session.messages.length,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  };
  const filtered = index.filter((m) => m.id !== session.id);
  filtered.unshift(meta);
  saveIndex(filtered);
}

/**
 * 首次加载时迁移旧版单 history 数组为 default 会话。
 * 仅当存在旧 key 且无会话索引时执行一次。
 */
function migrateLegacyHistory(): void {
  if (typeof window === "undefined") return;
  const legacy = window.localStorage.getItem(LEGACY_HISTORY_KEY);
  if (!legacy) return;
  // 已有索引则不迁移
  const index = loadIndex();
  if (index.length > 0) {
    // 清理旧 key
    window.localStorage.removeItem(LEGACY_HISTORY_KEY);
    return;
  }
  try {
    const msgs = JSON.parse(legacy) as ChatMessage[];
    if (!Array.isArray(msgs) || msgs.length === 0) {
      window.localStorage.removeItem(LEGACY_HISTORY_KEY);
      return;
    }
    const ts = now();
    const session: ChatSession = {
      id: "default",
      title: deriveTitle(msgs),
      messages: msgs,
      createdAt: ts,
      updatedAt: ts,
    };
    saveSession(session);
    updateIndexMeta(session);
    window.localStorage.removeItem(LEGACY_HISTORY_KEY);
  } catch {
    window.localStorage.removeItem(LEGACY_HISTORY_KEY);
  }
}

/** 从消息列表派生会话标题（取首条 user 消息前 20 字符） */
function deriveTitle(messages: ChatMessage[]): string {
  const firstUser = messages.find((m) => m.role === "user");
  if (!firstUser) return "新对话";
  const text = firstUser.content.trim().slice(0, 20);
  return text.length < firstUser.content.trim().length ? `${text}…` : text;
}

/** 列出所有会话元信息（按 updatedAt 降序） */
export function listSessions(): SessionMeta[] {
  if (typeof window === "undefined") return [];
  migrateLegacyHistory();
  return loadIndex();
}

/** 读取某个会话完整消息 */
export function getSessionMessages(id: string): ChatMessage[] {
  const session = loadSession(id);
  return session?.messages ?? [];
}

/** 创建新会话，返回新会话 id */
export function createSession(): string {
  const id = nanoidLite();
  const ts = now();
  const session: ChatSession = {
    id,
    title: "新对话",
    messages: [],
    createdAt: ts,
    updatedAt: ts,
  };
  saveSession(session);
  updateIndexMeta(session);
  return id;
}

/** 追加消息到会话；若会话不存在则自动创建 */
export function appendMessages(
  id: string,
  messages: ChatMessage[]
): ChatSession {
  let session = loadSession(id);
  const ts = now();
  if (!session) {
    session = {
      id,
      title: "新对话",
      messages: [],
      createdAt: ts,
      updatedAt: ts,
    };
  }
  session.messages = [...session.messages, ...messages];
  session.updatedAt = ts;
  // 若标题仍是默认，则用首条 user 消息更新
  if (session.title === "新对话" && messages.length > 0) {
    session.title = deriveTitle(session.messages);
  }
  saveSession(session);
  updateIndexMeta(session);
  return session;
}

/** 替换会话全部消息（用于删除/清空操作） */
export function setSessionMessages(
  id: string,
  messages: ChatMessage[]
): ChatSession {
  const ts = now();
  let session = loadSession(id);
  if (!session) {
    session = {
      id,
      title: "新对话",
      messages: [],
      createdAt: ts,
      updatedAt: ts,
    };
  }
  session.messages = messages.slice(-MAX_MESSAGES_PER_SESSION);
  session.updatedAt = ts;
  if (messages.length > 0 && session.title === "新对话") {
    session.title = deriveTitle(messages);
  } else if (messages.length === 0) {
    session.title = "新对话";
  }
  saveSession(session);
  updateIndexMeta(session);
  return session;
}

/** 删除会话 */
export function deleteSession(id: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(sessionKey(id));
  const index = loadIndex().filter((m) => m.id !== id);
  saveIndex(index);
}

/** 简易 id 生成（避免引入 nanoid 到 lib 层的循环依赖） */
function nanoidLite(): string {
  return (
    Date.now().toString(36) +
    Math.random().toString(36).slice(2, 10)
  );
}
