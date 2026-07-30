#!/usr/bin/env tsx
/**
 * 打包体积监控脚本（性能优化：严控 Cloudflare 国内首屏体积）
 *
 * 在 `next build` 后运行，解析 .next/build-manifest.json + .next/static/chunks，
 * 统计 JS/CSS 体积（原始 + gzip），与阈值对比，超限即报错退出。
 *
 * 适配 Next.js 16 Turbopack：build-manifest 仅含 rootMainFiles（共享基线），
 * 页面级 chunk 在运行时按需加载，故按 chunk 粒度监控。
 *
 * 用法：tsx scripts/check-bundle-size.ts
 * 退出码：0=全部在阈值内，1=有超限
 *
 * 阈值设计（gzip，针对 Cloudflare 国内移动端 3G/4G 场景）：
 * - 共享基线（rootMainFiles + polyfillFiles）：≤ 200KB gzip
 *   每个页面首屏都必须下载这些 JS，是最关键指标
 * - 单个 chunk：≤ 80KB gzip（防止某个 vendor chunk 失控）
 * - 全部 chunk 总和：≤ 600KB gzip（整体体积上限）
 */
import { readFileSync, existsSync, statSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { gzipSync } from "node:zlib";

interface BuildManifest {
  pages: Record<string, string[]>;
  polyfillFiles: string[];
  rootMainFiles: string[];
  lowPriorityFiles: string[];
}

interface ChunkInfo {
  name: string;
  raw: number;
  gzip: number;
  category: "baseline" | "polyfill" | "chunk";
  passed: boolean;
}

// gzip 阈值（bytes）
const BASELINE_THRESHOLD = 200 * 1024; // 共享基线 gzip 上限
const SINGLE_CHUNK_THRESHOLD = 80 * 1024; // 单个 chunk gzip 上限
const TOTAL_THRESHOLD = 600 * 1024; // 全部 chunk 总和 gzip 上限

function fileGzipSize(filePath: string): number {
  const content = readFileSync(filePath);
  return gzipSync(content).length;
}

function fileSize(filePath: string): number {
  return statSync(filePath).size;
}

function formatKB(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)}KB`;
}

function readManifest(nextDir: string): BuildManifest {
  const manifestPath = join(nextDir, "build-manifest.json");
  if (!existsSync(manifestPath)) {
    console.error("[check-bundle-size] build-manifest.json 不存在，请先运行 `next build`");
    process.exit(1);
  }
  return JSON.parse(readFileSync(manifestPath, "utf8")) as BuildManifest;
}

function collectChunks(nextDir: string): ChunkInfo[] {
  const manifest = readManifest(nextDir);
  const staticRoot = join(nextDir, "static");
  const chunksDir = join(staticRoot, "chunks");
  if (!existsSync(chunksDir)) {
    console.error("[check-bundle-size] .next/static/chunks 不存在");
    process.exit(1);
  }

  const baselineSet = new Set(manifest.rootMainFiles);
  const polyfillSet = new Set(manifest.polyfillFiles);
  const results: ChunkInfo[] = [];

  for (const file of readdirSync(chunksDir)) {
    // 只看 .js 和 .css（跳过 .map）
    if (!file.endsWith(".js") && !file.endsWith(".css")) continue;

    const relativePath = `static/chunks/${file}`;
    const fullPath = join(chunksDir, file);
    const raw = fileSize(fullPath);
    const gzip = fileGzipSize(fullPath);

    let category: ChunkInfo["category"] = "chunk";
    if (baselineSet.has(relativePath)) category = "baseline";
    else if (polyfillSet.has(relativePath)) category = "polyfill";

    results.push({
      name: file,
      raw,
      gzip,
      category,
      passed: gzip <= SINGLE_CHUNK_THRESHOLD,
    });
  }

  return results.sort((a, b) => b.gzip - a.gzip);
}

function main(): void {
  const nextDir = resolve(process.cwd(), ".next");
  if (!existsSync(nextDir)) {
    console.error("[check-bundle-size] .next 目录不存在，请先运行 `next build`");
    process.exit(1);
  }

  const chunks = collectChunks(nextDir);

  // 分类统计
  const baselineChunks = chunks.filter((c) => c.category === "baseline");
  const polyfillChunks = chunks.filter((c) => c.category === "polyfill");

  const baselineGzip = baselineChunks.reduce((s, c) => s + c.gzip, 0);
  const polyfillGzip = polyfillChunks.reduce((s, c) => s + c.gzip, 0);
  const totalGzip = chunks.reduce((s, c) => s + c.gzip, 0);
  const totalRaw = chunks.reduce((s, c) => s + c.raw, 0);

  let allPassed = true;

  // 1. 共享基线报告（每个页面首屏必下载）
  console.log("\n📦 [check-bundle-size] 共享基线（每页首屏必下载）");
  console.log("─".repeat(60));
  const baselineWithPolyfill = baselineGzip + polyfillGzip;
  const baselinePassed = baselineWithPolyfill <= BASELINE_THRESHOLD;
  if (!baselinePassed) allPassed = false;
  console.log(
    `  rootMainFiles:  ${formatKB(baselineGzip).padStart(10)} gzip (${baselineChunks.length} files)`
  );
  console.log(
    `  polyfillFiles:  ${formatKB(polyfillGzip).padStart(10)} gzip (${polyfillChunks.length} files)`
  );
  console.log(
    `  基线合计:       ${formatKB(baselineWithPolyfill).padStart(10)} gzip / 阈值 ${formatKB(BASELINE_THRESHOLD)}  ${
      baselinePassed ? "✓" : "✗ 超限"
    }`
  );

  // 2. 全部 chunk 总和
  console.log("\n📦 [check-bundle-size] 总体积");
  console.log("─".repeat(60));
  const totalPassed = totalGzip <= TOTAL_THRESHOLD;
  if (!totalPassed) allPassed = false;
  console.log(
    `  全部 chunk:     ${formatKB(totalGzip).padStart(10)} gzip (${formatKB(totalRaw)} raw, ${chunks.length} files) / 阈值 ${formatKB(TOTAL_THRESHOLD)}  ${
      totalPassed ? "✓" : "✗ 超限"
    }`
  );

  // 3. Top 15 chunk 详情
  console.log("\n📦 [check-bundle-size] chunk Top 15（gzip）");
  console.log("─".repeat(70));
  console.log(
    `${"文件名".padEnd(32)} ${"raw".padStart(10)} ${"gzip".padStart(10)}  ${"类型".padEnd(8)} 状态`
  );
  console.log("─".repeat(70));
  for (const chunk of chunks.slice(0, 15)) {
    if (!chunk.passed) allPassed = false;
    const status = chunk.passed ? "✓" : "✗ 超限";
    const catLabel =
      chunk.category === "baseline"
        ? "基线"
        : chunk.category === "polyfill"
          ? "polyfill"
          : "chunk";
    console.log(
      `${chunk.name.padEnd(32)} ${formatKB(chunk.raw).padStart(10)} ${formatKB(chunk.gzip).padStart(10)}  ${catLabel.padEnd(8)} ${status}`
    );
  }

  // 4. 总结
  console.log("─".repeat(70));
  if (allPassed) {
    console.log("✅ [check-bundle-size] 全部在阈值内");
  } else {
    console.log("✗ [check-bundle-size] 存在超限项，请优化");
    if (!baselinePassed) {
      console.log(
        `  ✗ 共享基线 ${formatKB(baselineWithPolyfill)} > ${formatKB(BASELINE_THRESHOLD)}`
      );
    }
    if (!totalPassed) {
      console.log(
        `  ✗ 总体积 ${formatKB(totalGzip)} > ${formatKB(TOTAL_THRESHOLD)}`
      );
    }
    const oversized = chunks.filter((c) => !c.passed);
    for (const c of oversized) {
      console.log(
        `  ✗ chunk ${c.name}: ${formatKB(c.gzip)} > ${formatKB(SINGLE_CHUNK_THRESHOLD)}`
      );
    }
    process.exit(1);
  }
}

main();
