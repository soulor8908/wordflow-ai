#!/usr/bin/env node
/**
 * Cloudflare Pages 部署脚本（修复 404 根因）
 *
 * 对齐 wrangler pages deploy 的表单结构：
 *   - manifest: 静态资源 hash 映射（已排除 _worker.js/_headers/_routes.json）
 *   - _worker.bundle: 嵌套 multipart blob（metadata + worker 模块）
 *   - _headers / _routes.json: 独立 File 字段
 *
 * 用法：PAGES_JWT=xxx node .pages-deploy.cjs
 */
const fs = require("fs");

const JWT = process.env.PAGES_JWT;
const ACCOUNT_ID = "095f3f5c22e59482f1f01a5fb0116b49";
const PROJECT = "wordflow-ai";
const API = "https://api.cloudflare.com/client/v4";

if (!JWT) {
  console.error("PAGES_JWT env required");
  process.exit(1);
}

async function main() {
  // 1. 读取 manifest
  const manifest = JSON.parse(fs.readFileSync("/workspace/.pages-manifest.json", "utf-8"));
  console.log(`▸ manifest: ${Object.keys(manifest).length} 项`);

  // 2. 构造 _worker.bundle（嵌套 multipart）
  const workerCode = fs.readFileSync("/workspace/.worker-bundle.js", "utf-8");
  const moduleName = "worker.js";

  const innerMetadata = {
    main_module: moduleName,
    compatibility_date: "2026-07-27",
    compatibility_flags: ["nodejs_compat"],
  };

  // 构造内层 FormData
  const innerForm = new FormData();
  innerForm.set("metadata", JSON.stringify(innerMetadata));
  innerForm.set(moduleName, new File([workerCode], moduleName, {
    type: "application/javascript+module",
  }));

  // 序列化内层 FormData 为 Blob（对齐 wrangler 的 new Response(formData).blob()）
  const innerBlob = await new Response(innerForm).blob();
  console.log(`▸ worker.bundle: ${(innerBlob.size / 1024 / 1024).toFixed(2)}MB`);

  // 3. 读取 _headers 和 _routes.json
  const headersContent = fs.readFileSync("/workspace/.open-next/_headers", "utf-8");
  const routesContent = fs.readFileSync("/workspace/.open-next/_routes.json", "utf-8");

  // 4. 构造外层部署 FormData
  const deployForm = new FormData();
  deployForm.set("manifest", JSON.stringify(manifest));
  deployForm.set("_worker.bundle", new File([innerBlob], "_worker.bundle"));
  deployForm.set("_headers", new File([headersContent], "_headers"));
  deployForm.set("_routes.json", new File([routesContent], "_routes.json"));

  // 5. POST 部署
  console.log(`▸ 提交部署到 /accounts/${ACCOUNT_ID}/pages/projects/${PROJECT}/deployments ...`);
  const res = await fetch(
    `${API}/accounts/${ACCOUNT_ID}/pages/projects/${PROJECT}/deployments`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${JWT}` },
      body: deployForm,
    }
  );

  const j = await res.json();
  if (!j.success) {
    console.error("✗ 部署失败：", JSON.stringify(j.errors, null, 2));
    process.exit(1);
  }

  const d = j.result;
  console.log(`✓ 部署成功！`);
  console.log(`  URL: ${d.url}`);
  console.log(`  ID:  ${d.id}`);
  console.log(`  环境: ${d.environment}`);
}

main().catch(e => { console.error("✗", e.message, e.stack); process.exit(1); });
