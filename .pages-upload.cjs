#!/usr/bin/env node
/**
 * Cloudflare Pages Direct Upload 修复版
 *
 * 与 wrangler pages deploy 对齐的关键差异（修复 404 根因）：
 *   - _worker.js 不进静态 manifest（wrangler IGNORE_LIST），
 *     而是先用 esbuild 本地打包成单文件，再以 "_worker.bundle" 表单字段上传
 *     （内层嵌套 worker 上传格式：metadata + application/javascript+module 模块）。
 *   - _headers / _routes.json 同样不进 manifest，作为独立 File 字段上传。
 *
 * 输出：
 *   /workspace/.worker-bundle.js   打包后的 worker（供 MCP 部署步骤内嵌）
 *   /workspace/.pages-manifest.json  静态资源 manifest（已排除 _worker.js 等）
 */
const fs = require("fs");
const path = require("path");
const b3 = require("/workspace/node_modules/.pnpm/blake3-wasm@2.1.5/node_modules/blake3-wasm/dist/index.js");
const esbuild = require("/workspace/node_modules/.pnpm/esbuild@0.25.4/node_modules/esbuild/lib/main.js");

const JWT = process.env.PAGES_JWT;
const DIR = "/workspace/.open-next";
const API = "https://api.cloudflare.com/client/v4";
const MAX_BUCKET_BYTES = 30 * 1024 * 1024;
const MAX_BUCKET_COUNT = 1000;

if (!JWT) {
  console.error("PAGES_JWT env required");
  process.exit(1);
}

// wrangler IGNORE_LIST（仅根目录精确匹配前 4 项）
const ROOT_EXCLUDE = new Set(["_worker.js", "_redirects", "_headers", "_routes.json", "functions"]);

const MIME = {
  ".html": "text/html", ".js": "application/javascript", ".mjs": "application/javascript",
  ".cjs": "application/javascript", ".json": "application/json", ".css": "text/css",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".gif": "image/gif", ".webp": "image/webp", ".ico": "image/x-icon",
  ".woff": "font/woff", ".woff2": "font/woff2", ".ttf": "font/ttf",
  ".txt": "text/plain", ".map": "application/json", ".wasm": "application/wasm",
  ".xml": "application/xml", ".webmanifest": "application/manifest+json",
  ".mp3": "audio/mpeg", ".mp4": "video/mp4", ".yaml": "application/yaml", ".yml": "application/yaml",
  ".md": "text/markdown", ".ts": "application/typescript",
};

function* walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith(".")) continue; // 跳过 .build/.wrangler/.DS_Store 等
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules") continue;
      yield* walk(p);
    } else if (e.isFile() && !e.isSymbolicLink()) {
      yield p;
    }
  }
}

const NODE_BARE_BUILTINS = [
  "assert", "async_hooks", "buffer", "child_process", "cluster", "console", "constants",
  "crypto", "dgram", "diagnostics_channel", "dns", "domain", "events", "fs", "http",
  "http2", "https", "inspector", "module", "net", "os", "path", "perf_hooks", "process",
  "punycode", "querystring", "readline", "repl", "stream", "string_decoder", "sys",
  "timers", "tls", "trace_events", "tty", "url", "util", "v8", "vm", "worker_threads",
  "zlib", "wasi", "tls", "net",
];

async function bundleWorker() {
  console.log("▸ esbuild 打包 _worker.js ...");
  const result = await esbuild.build({
    entryPoints: [path.join(DIR, "_worker.js")],
    bundle: true,
    format: "esm",
    target: "es2022",
    platform: "neutral",
    absWorkingDir: "/workspace",
    outfile: "/workspace/.worker-bundle.js",
    minify: true,
    keepNames: true,
    sourcemap: false,
    logLevel: "debug",
    define: { "navigator.userAgent": '"Cloudflare-Workers"' },
    external: ["node:*", "cloudflare:*", ...NODE_BARE_BUILTINS],
  });
  const size = fs.statSync("/workspace/.worker-bundle.js").size;
  console.log(`  ✓ worker 打包完成：${(size / 1024 / 1024).toFixed(2)}MB`);
  if (result.errors.length) {
    console.error(result.errors);
    process.exit(1);
  }
}

async function main() {
  await bundleWorker();

  // 1. 构建 fileMap（排除 wrangler IGNORE_LIST）
  const files = [];
  for (const abs of walk(DIR)) {
    const rel = path.relative(DIR, abs).split(path.sep).join("/");
    if (ROOT_EXCLUDE.has(rel)) continue;
    const content = fs.readFileSync(abs);
    const ext = path.extname(abs).substring(1);
    const hash = b3.hash(content.toString("base64") + ext).toString("hex").slice(0, 32);
    files.push({
      rel, abs, hash,
      size: content.length,
      contentType: MIME[path.extname(abs).toLowerCase()] || "application/octet-stream",
    });
  }
  console.log(`▸ 静态文件：${files.length}，总大小：${(files.reduce((a, f) => a + f.size, 0) / 1024 / 1024).toFixed(1)}MB`);

  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${JWT}` };

  // 2. check-missing
  const cm = await fetch(`${API}/pages/assets/check-missing`, {
    method: "POST", headers,
    body: JSON.stringify({ hashes: files.map(f => f.hash) }),
  });
  const cmJson = await cm.json();
  if (!cmJson.success) {
    console.error("✗ check-missing 失败：", JSON.stringify(cmJson.errors));
    process.exit(1);
  }
  const missing = new Set(cmJson.result);
  const todo = files.filter(f => missing.has(f.hash));
  console.log(`▸ 需上传：${todo.length} / ${files.length}`);

  // 3. 分桶上传
  let bucket = [], bucketBytes = 0, uploaded = 0;
  const flush = async () => {
    if (bucket.length === 0) return;
    const payload = bucket.map(f => ({
      key: f.hash,
      value: fs.readFileSync(f.abs).toString("base64"),
      metadata: { contentType: f.contentType },
      base64: true,
    }));
    const res = await fetch(`${API}/pages/assets/upload`, {
      method: "POST", headers, body: JSON.stringify(payload),
    });
    const j = await res.json();
    if (!j.success) {
      console.error("✗ upload 失败：", JSON.stringify(j.errors).slice(0, 500));
      process.exit(1);
    }
    uploaded += bucket.length;
    console.log(`  ✓ 已上传 ${uploaded}/${todo.length}`);
    bucket = []; bucketBytes = 0;
  };
  for (const f of todo) {
    const b64Size = Math.ceil(f.size / 3) * 4;
    if (bucketBytes + b64Size > MAX_BUCKET_BYTES || bucket.length >= MAX_BUCKET_COUNT) await flush();
    bucket.push(f); bucketBytes += b64Size;
  }
  await flush();

  // 4. upsert-hashes
  const uh = await fetch(`${API}/pages/assets/upsert-hashes`, {
    method: "POST", headers,
    body: JSON.stringify({ hashes: files.map(f => f.hash) }),
  });
  const uhJson = await uh.json();
  if (!uhJson.success) {
    console.error("✗ upsert-hashes 失败：", JSON.stringify(uhJson.errors));
    process.exit(1);
  }
  console.log("▸ upsert-hashes 完成");

  // 5. 输出 manifest（不含 _worker.js/_headers/_routes.json）
  const manifest = {};
  for (const f of files) manifest[`/${f.rel}`] = f.hash;
  fs.writeFileSync("/workspace/.pages-manifest.json", JSON.stringify(manifest));
  console.log(`▸ manifest 已写入（${Object.keys(manifest).length} 项）`);
}

main().catch(e => { console.error("✗", e.message); process.exit(1); });
