#!/usr/bin/env bash
# 部署到 Cloudflare Pages（获取 *.pages.dev 域名）
#
# 原理：@opennextjs/cloudflare 构建产物中的 worker.js 是 Module Worker 格式，
# Cloudflare Pages 支持通过 _worker.js 文件运行 Worker。
# 将 worker.js 复制为 _worker.js 放入 assets 目录，然后用 wrangler pages deploy 部署。
#
# 用法：
#   pnpm deploy:pages              # 部署到生产
#   pnpm deploy:pages -- --preview # 部署到预览环境
#
# 首次运行会提示创建 Pages 项目（project name: wordflow-ai），确认即可。
# 部署成功后得到 https://wordflow-ai.pages.dev 地址。
set -euo pipefail

cd "$(dirname "$0")/.."

echo "▸ 构建 OpenNext 产物（Worker + Assets）..."
pnpm build:cf

if [ ! -d ".open-next/assets" ] || [ ! -f ".open-next/worker.js" ]; then
  echo "✗ 构建产物缺失：.open-next/assets 或 .open-next/worker.js 不存在"
  exit 1
fi

echo "▸ 复制 worker.js → assets/_worker.js（Pages Module Worker 入口）..."
cp .open-next/worker.js .open-next/assets/_worker.js

echo "▸ 部署到 Cloudflare Pages..."
echo "  项目名：wordflow-ai"
echo "  部署目录：.open-next/assets"
echo "  部署后地址：https://wordflow-ai.pages.dev"
echo ""
npx wrangler pages deploy .open-next/assets --project-name wordflow-ai "$@"

echo ""
echo "✓ 部署完成。请在 Cloudflare Dashboard → Pages → wordflow-ai 中查看部署详情。"
echo "  如需配置环境变量（FREE_AI_API_KEY 等），请在 Pages 项目的 Settings → Environment variables 中添加。"
