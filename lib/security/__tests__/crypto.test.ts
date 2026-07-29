import { describe, test, expect, beforeEach } from "vitest";
import {
  encryptText,
  decryptText,
  isEncrypted,
} from "@/lib/security/crypto";
import { resetDbForTest, getItem } from "@/lib/storage/db";

describe("crypto (Web Crypto AES-GCM)", () => {
  beforeEach(async () => {
    await resetDbForTest();
  });

  test("encrypt → decrypt 还原原文", async () => {
    const plain = "sk-test-key-12345";
    const enc = await encryptText(plain);
    expect(enc).not.toBe(plain);
    expect(isEncrypted(enc)).toBe(true);
    const dec = await decryptText(enc);
    expect(dec).toBe(plain);
  });

  test("加密后密文含 enc: 前缀与 iv/data 两段", async () => {
    const enc = await encryptText("hello");
    expect(enc.startsWith("enc:")).toBe(true);
    const parts = enc.slice(4).split(":");
    expect(parts).toHaveLength(2);
    expect(parts[0].length).toBeGreaterThan(0);
    expect(parts[1].length).toBeGreaterThan(0);
  });

  test("legacy 明文原样返回（无 enc 前缀，向后兼容）", async () => {
    expect(await decryptText("sk-legacy-plaintext")).toBe(
      "sk-legacy-plaintext"
    );
  });

  test("密钥持久化：两次加密复用同一密钥，均可解密", async () => {
    const enc1 = await encryptText("sk-persist");
    const enc2 = await encryptText("sk-persist");
    // IV 随机 → 密文不同
    expect(enc1).not.toBe(enc2);
    expect(await decryptText(enc1)).toBe("sk-persist");
    expect(await decryptText(enc2)).toBe("sk-persist");
  });

  test("空字符串加密后解密还原空", async () => {
    const enc = await encryptText("");
    expect(await decryptText(enc)).toBe("");
  });

  test("密文损坏时返回空串（不抛异常）", async () => {
    const enc = await encryptText("sk-real");
    // 篡改密文段
    const tampered = enc.slice(0, enc.lastIndexOf(":") + 1) + "AAAA";
    expect(await decryptText(tampered)).toBe("");
  });

  test("加密密钥不随 export 导出（CRYPTO_KEY_STORAGE 排除）", async () => {
    // 触发密钥生成
    await encryptText("trigger-key-creation");
    const stored = await getItem<unknown>("settings:crypto-key");
    expect(stored).toBeDefined();

    const { CRYPTO_KEY_STORAGE } = await import("@/lib/security/crypto");
    const { exportSyncBundle } = await import("@/lib/sync/cloud-sync");
    const bundle = await exportSyncBundle();
    expect(
      bundle.records.some((r) => r.key === CRYPTO_KEY_STORAGE)
    ).toBe(false);
  });
});
