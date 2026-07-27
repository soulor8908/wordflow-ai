#!/usr/bin/env tsx
/**
 * quality-gate 脚本（设计文档 §8.2：CI 强制 + husky pre-push 4 层门禁）
 *
 * 执行顺序：content:validate → content:freshness → lint → typecheck → test
 * 任一环节失败即退出，杜绝部署失败连环事故。
 *
 * 用法：tsx scripts/quality-gate.ts
 */
import { execSync } from "node:child_process";

const steps: { name: string; cmd: string }[] = [
  { name: "content:validate", cmd: "tsx scripts/validate-content.ts public" },
  { name: "content:freshness", cmd: "tsx scripts/check-freshness.ts public 365" },
  { name: "lint", cmd: "eslint" },
  { name: "typecheck", cmd: "tsc --noEmit" },
  { name: "test", cmd: "vitest run" },
];

function main(): void {
  for (const step of steps) {
    console.log(`\n▶ [quality-gate] ${step.name}: ${step.cmd}`);
    try {
      execSync(step.cmd, {
        stdio: "inherit",
        cwd: process.cwd(),
        env: process.env,
      });
      console.log(`✓ [quality-gate] ${step.name} 通过`);
    } catch {
      console.error(`✗ [quality-gate] ${step.name} 失败，阻塞后续步骤`);
      process.exit(1);
    }
  }
  console.log("\n✅ [quality-gate] 全部通过");
}

main();
