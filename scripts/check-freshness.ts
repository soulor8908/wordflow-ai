/**
 * 内容来源新鲜度巡检（设计文档 §8.2 quality-gate: content:freshness 步骤 + §4.2 audit-source-freshness.ts）
 *
 * 检查 public/dict-data 下词典切片的数据新鲜度（按文件 mtime 与阈值对比）。
 * MVP 阶段：词典为静态种子数据，freshness 巡检确认切片存在且非空；
 * M2 接入 ECDICT 上游后扩展为版本与同步状态检查。
 *
 * 用法：tsx scripts/check-freshness.ts [public-dir] [max-age-days]
 * 退出码：0=通过，1=过期/缺失
 */
import { existsSync, statSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";

export interface FreshnessResult {
  total: number;
  stale: number;
  empty: number;
  errors: string[];
}

export function checkFreshness(
  publicDir: string,
  maxAgeDays = 365
): FreshnessResult {
  const dictDir = join(publicDir, "dict-data");
  const errors: string[] = [];
  let total = 0;
  let stale = 0;
  let empty = 0;

  if (!existsSync(dictDir)) {
    return { total: 0, stale: 0, empty: 0, errors: ["dict-data 目录不存在"] };
  }

  const threshold = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
  const letters = readdirSync(dictDir);
  for (const letter of letters) {
    const letterDir = join(dictDir, letter);
    const files = readdirSync(letterDir).filter((f) => f.endsWith(".json"));
    for (const f of files) {
      total++;
      const path = join(letterDir, f);
      const stat = statSync(path);
      if (stat.size === 0) {
        empty++;
        errors.push(`${f}: 空切片`);
        continue;
      }
      if (stat.mtimeMs < threshold) {
        stale++;
        errors.push(
          `${f}: 数据过期（mtime ${new Date(stat.mtimeMs).toISOString()}，阈值 ${maxAgeDays} 天）`
        );
      }
    }
  }

  return { total, stale, empty, errors };
}

async function main(): Promise<void> {
  const publicDir = resolve(process.argv[2] ?? "public");
  const maxAgeDays = parseInt(process.argv[3] ?? "365", 10);
  const result = checkFreshness(publicDir, maxAgeDays);
  console.log(
    `[content:freshness] 切片 ${result.total} 个，过期 ${result.stale}，空 ${result.empty}`
  );
  if (result.errors.length > 0) {
    for (const e of result.errors) console.error(`  ✗ ${e}`);
    process.exit(1);
  }
  console.log("[content:freshness] ✅ 全部新鲜");
}

if (require.main === module) {
  main().catch((err) => {
    console.error("[content:freshness] 失败:", err);
    process.exit(1);
  });
}
