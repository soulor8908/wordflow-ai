#!/usr/bin/env bash
# 部署到 Cloudflare Pages（获取 *.pages.dev 域名）
#
# 原理：@opennextjs/cloudflare 构建产物中的 worker.js 是 Module Worker 格式，
# 引用 ./middleware/、./server-functions/、./cloudflare/ 等同级目录。
# Cloudflare Pages 的 _worker.js 需要与这些依赖同级，所以必须把整个 .open-next/
# 作为部署根目录，而不是只部署 assets/。
#
# 步骤：
#   1. 构建 OpenNext 产物（.open-next/worker.js + assets/ + server-functions/ + ...）
#   2. 复制 worker.js → _worker.js（Pages Module Worker 入口）
#   3. 把 assets/* 内容展开到 .open-next/ 根目录（Pages 静态资源根）
#   4. 写入 _routes.json（排除静态资源，避免被 Worker 处理导致 404）
#   5. wrangler pages deploy .open-next（部署整个目录）
#
# 用法：
#   pnpm deploy:pages              # 部署到生产
#   pnpm deploy:pages -- --preview # 部署到预览环境
#
# 首次运行前需在 Cloudflare Dashboard 创建 Pages 项目（project name: wordflow-ai）。
# 部署成功后得到 https://wordflow-ai.pages.dev 地址。
# 环境变量（FREE_AI_API_KEY 等）请在 Pages 项目的 Settings → Environment variables 中添加。
set -euo pipefail

cd "$(dirname "$0")/.."

echo "▸ 构建 OpenNext 产物（Worker + Assets + Server Functions）..."
pnpm build:cf

if [ ! -d ".open-next/assets" ] || [ ! -f ".open-next/worker.js" ]; then
  echo "✗ 构建产物缺失：.open-next/assets 或 .open-next/worker.js 不存在"
  exit 1
fi

echo "▸ 复制 worker.js → _worker.js（Pages Module Worker 入口）..."
cp .open-next/worker.js .open-next/_worker.js

echo "▸ 展开 assets/* 到 .open-next/ 根目录（Pages 静态资源根）..."
# assets/ 包含 _next/static/、books/、dict/、icons/、favicon 等，
# Pages 从部署根目录提供静态文件，必须展开到 .open-next/ 根。
cp -r .open-next/assets/* .open-next/

echo "▸ 写入 _routes.json（排除静态资源，避免被 Worker 处理）..."
cat > .open-next/_routes.json <<'ROUTES'
{
  "version": 1,
  "include": ["/*"],
  "exclude": [
    "/_next/static/*",
    "/_next/image/*",
    "/books/*",
    "/dict/*",
    "/icons/*",
    "/favicon.ico",
    "/favicon.svg",
    "/file.svg",
    "/globe.svg",
    "/next.svg",
    "/vercel.svg",
    "/window.svg",
    "/manifest.json",
    "/sw.js",
    "/search-index.json"
  ]
}
ROUTES

echo "▸ 部署到 Cloudflare Pages..."
echo "  项目名：wordflow-ai"
echo "  部署目录：.open-next（含 _worker.js + 静态资源 + server-functions）"
echo "  部署后地址：https://wordflow-ai.pages.dev"
echo ""
npx wrangler pages deploy .open-next --project-name wordflow-ai --commit-dirty=true "$@"

echo ""
echo "✓ 部署完成。请在 Cloudflare Dashboard → Pages → wordflow-ai 中查看部署详情。"
echo "  如需配置环境变量（FREE_AI_API_KEY 等），请在 Pages 项目的 Settings → Environment variables 中添加。"
