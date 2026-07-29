import { describe, test, expect, afterEach } from "vitest";
import { checkFreshness } from "@/scripts/check-freshness";
import { writeFileSync, mkdirSync, rmSync, utimesSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const TMP = join(tmpdir(), `wf-freshness-${Date.now()}`);

afterEach(() => {
  rmSync(TMP, { recursive: true, force: true });
});

describe("checkFreshness", () => {
  test("dict-data 目录不存在 → errors 含 'dict-data 目录不存在'", () => {
    const result = checkFreshness(TMP);
    expect(result.total).toBe(0);
    expect(result.errors).toContain("dict-data 目录不存在");
  });

  test("正常切片 → total>0，无错误", () => {
    mkdirSync(join(TMP, "dict-data", "a"), { recursive: true });
    writeFileSync(
      join(TMP, "dict-data", "a", "ab.json"),
      '[{"word":"abandon"}]',
      "utf8"
    );
    const result = checkFreshness(TMP);
    expect(result.total).toBe(1);
    expect(result.errors).toHaveLength(0);
  });

  test("空切片 → empty 计数 + errors", () => {
    mkdirSync(join(TMP, "dict-data", "a"), { recursive: true });
    writeFileSync(join(TMP, "dict-data", "a", "empty.json"), "", "utf8");
    const result = checkFreshness(TMP);
    expect(result.empty).toBe(1);
    expect(result.errors.some((e) => e.includes("空切片"))).toBe(true);
  });

  test("过期切片（mtime 超过阈值）→ stale 计数", () => {
    mkdirSync(join(TMP, "dict-data", "a"), { recursive: true });
    writeFileSync(
      join(TMP, "dict-data", "a", "old.json"),
      '[{"word":"old"}]',
      "utf8"
    );
    // 把 mtime 设为 400 天前
    const old = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000);
    utimesSync(join(TMP, "dict-data", "a", "old.json"), old, old);
    const result = checkFreshness(TMP, 365);
    expect(result.stale).toBe(1);
    expect(result.errors.some((e) => e.includes("数据过期"))).toBe(true);
  });

  test("maxAgeDays 足够大 → 不报过期", () => {
    mkdirSync(join(TMP, "dict-data", "a"), { recursive: true });
    writeFileSync(
      join(TMP, "dict-data", "a", "ok.json"),
      '[{"word":"ok"}]',
      "utf8"
    );
    const old = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000);
    utimesSync(join(TMP, "dict-data", "a", "ok.json"), old, old);
    const result = checkFreshness(TMP, 365);
    expect(result.stale).toBe(0);
  });
});
