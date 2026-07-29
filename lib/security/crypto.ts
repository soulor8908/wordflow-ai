/**
 * 客户端加密（Web Crypto API / AES-GCM 256）
 *
 * 用于 BYOK apiKey 落盘前加密，消除 IndexedDB 明文直查风险。
 *
 * 密钥管理：
 * - 首次使用生成 AES-GCM 256 非可导出 CryptoKey，存 IndexedDB
 * - 密钥不随数据导出（cloud-sync 排除），换设备需重新输入 apiKey
 *
 * 安全权衡（本地优先架构）：
 * - 密钥与密文同在本机 IndexedDB，无法抵抗有完整设备访问权的攻击者
 * - 但能消除 DevTools 直查明文、提升 XSS 读取门槛
 * - 导出备份不含可解密密钥，apiKey 不随备份文件泄露
 */
import { getItem, setItem } from "@/lib/storage/db";

export const CRYPTO_KEY_STORAGE = "settings:crypto-key";
const ENC_PREFIX = "enc:";

function hasSubtle(): boolean {
  return typeof crypto !== "undefined" && !!crypto.subtle;
}

/** 获取或生成非可导出 AES-GCM 密钥（持久化到 IndexedDB） */
async function getOrCreateKey(): Promise<CryptoKey> {
  const existing = await getItem<CryptoKey>(CRYPTO_KEY_STORAGE);
  // 校验取出的确是 CryptoKey（结构化克隆后保留 algorithm/type）
  if (existing && typeof (existing as CryptoKey).algorithm === "object") {
    return existing as CryptoKey;
  }
  const key = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    false, // extractable = false，密钥不可导出
    ["encrypt", "decrypt"]
  );
  await setItem(CRYPTO_KEY_STORAGE, key);
  return key;
}

function toBase64(bytes: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)));
}

/** base64 → ArrayBuffer-backed Uint8Array（TS 5.7+ 需显式 ArrayBuffer 泛型以匹配 BufferSource） */
function fromBase64(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const buf = new ArrayBuffer(bin.length);
  const arr = new Uint8Array(buf);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

/** 加密明文 → "enc:<iv-base64>:<cipher-base64>"；无 subtle 则原样返回（降级） */
export async function encryptText(plaintext: string): Promise<string> {
  if (!hasSubtle()) return plaintext;
  const key = await getOrCreateKey();
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  // TextEncoder.encode 返回 Uint8Array<ArrayBufferLike>，拷入 ArrayBuffer-backed 视图以满足 BufferSource
  const tmp = new TextEncoder().encode(plaintext);
  const encoded = new Uint8Array(tmp.length);
  encoded.set(tmp);
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoded
  );
  return `${ENC_PREFIX}${toBase64(iv.buffer)}:${toBase64(cipher)}`;
}

/** 解密 "enc:..." → 明文；非 enc 前缀原样返回（legacy 明文 / 降级） */
export async function decryptText(stored: string): Promise<string> {
  if (!stored.startsWith(ENC_PREFIX)) return stored;
  if (!hasSubtle()) return stored;
  try {
    const payload = stored.slice(ENC_PREFIX.length);
    const sep = payload.indexOf(":");
    if (sep === -1) return "";
    const iv = fromBase64(payload.slice(0, sep));
    const cipher = fromBase64(payload.slice(sep + 1));
    const key = await getOrCreateKey();
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      cipher
    );
    return new TextDecoder().decode(plain);
  } catch {
    return ""; // 密钥不匹配 / 数据损坏
  }
}

/** 判断是否为加密格式（供免解密判断） */
export function isEncrypted(value: string): boolean {
  return value.startsWith(ENC_PREFIX);
}
