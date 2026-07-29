#!/usr/bin/env bash
# 部署到 Cloudflare Pages（获取 *.pages.dev 域名）
#
# 原理：@opennextjs/cloudflare 构建产物中的 worker.js 是 Module Worker 格式，
# 引用 ./middleware/、./server-functions/、./cloudflare/ 等同级目录。
# Cloudflare Pages 的 _worker.js 需要与这些依赖同级，所以必须把整个 .open-next/
# 作为部署根目录，而不是只部署 assets/。
#
# 步骤：
#   0. 检查依赖完整性（node_modules 丢失时自动 install）
#   1. 构建 OpenNext 产物（.open-next/worker.js + assets/ + server-functions/ + ...）
#   2. 复制 worker.js → _worker.js（Pages Module Worker 入口）
#   3. 把 assets/* 内容展开到 .open-next/ 根目录（Pages 静态资源根）
#   4. 写入 _routes.json（排除静态资源，避免被 Worker 处理导致 404）
#   5. wrangler pages deploy .open-next（部署整个目录）
#   6. 验证部署（页面可访问 + AI 可用 + 词库可访问）
#
# 用法：
#   pnpm deploy:pages              # 部署到生产
#   pnpm deploy:pages -- --preview # 部署到预览环境
#
# 首次运行前需在 Cloudflare Dashboard 创建 Pages 项目（project name: wordflow-ai）。
# 部署成功后得到 https://wordflow-ai.pages.dev 地址。
# 环境变量（FREE_AI_API_KEY 等）请在 Pages 项目的 Settings → Environment variables 中添加。
# 排查手册：docs/DEPLOYMENT-TROUBLESHOOTING.md
set -euo pipefail

cd "$(dirname "$0")/.."

# ── 步骤 0：检查依赖完整性 ──
# 远程沙箱环境重置后 node_modules 不持久，缺失时自动安装
if [ ! -d "node_modules/@opennextjs/cloudflare" ]; then
  echo "▸ node_modules 缺失，执行 pnpm install --frozen-lockfile..."
  pnpm install --frozen-lockfile
fi

# ── 步骤 1：构建 OpenNext 产物 ──
echo "▸ 构建 OpenNext 产物（Worker + Assets + Server Functions）..."
pnpm build:cf

# 验证构建产物完整性（4 个必要目录/文件）
if [ ! -f ".open-next/worker.js" ]; then
  echo "✗ 构建产物缺失：.open-next/worker.js 不存在"
  exit 1
fi
if [ ! -d ".open-next/assets" ]; then
  echo "✗ 构建产物缺失：.open-next/assets 目录不存在"
  exit 1
fi
if [ ! -d ".open-next/server-functions" ]; then
  echo "✗ 构建产物缺失：.open-next/server-functions 目录不存在"
  exit 1
fi
if [ ! -d ".open-next/middleware" ]; then
  echo "⚠ 警告：.open-next/middleware 目录不存在（可能无中间件，继续）"
fi

# ── 步骤 2：复制 worker.js → _worker.js ──
echo "▸ 复制 worker.js → _worker.js（Pages Module Worker 入口）..."
cp .open-next/worker.js .open-next/_worker.js

# ── 步骤 3：展开 assets/* 到 .open-next/ 根目录 ──
echo "▸ 展开 assets/* 到 .open-next/ 根目录（Pages 静态资源根）..."
# assets/ 包含 _next/static/、books/、dict/、icons/、favicon 等，
# Pages 从部署根目录提供静态文件，必须展开到 .open-next/ 根。
cp -r .open-next/assets/* .open-next/

# ── 步骤 4：写入 _routes.json ──
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

# ── 步骤 5：部署 ──
echo "▸ 部署到 Cloudflare Pages..."
echo "  项目名：wordflow-ai"
echo "  部署目录：.open-next（含 _worker.js + 静态资源 + server-functions）"
echo "  部署后地址：https://wordflow-ai.pages.dev"
echo ""
npx wrangler pages deploy .open-next --project-name wordflow-ai --commit-dirty=true "$@"

# ── 步骤 6：验证部署（关键！避免"部署成功但功能不可用"） ──
echo ""
echo "▸ 验证部署..."
sleep 5  # 等待 CDN 生效

DEPLOY_URL="https://wordflow-ai.pages.dev"
VERIFY_OK=true

# 验证页面可访问
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${DEPLOY_URL}/")
if [ "$HTTP_STATUS" = "200" ]; then
  echo "  ✓ 页面可访问（HTTP 200）"
else
  echo "  ✗ 页面不可访问（HTTP $HTTP_STATUS）"
  VERIFY_OK=false
fi

# 验证 AI 免费通道可用
AI_STATUS=$(curl -s "${DEPLOY_URL}/api/ai/chat?clientId=deploy-verify")
if echo "$AI_STATUS" | grep -q '"fallback":false'; then
  echo "  ✓ AI 免费通道可用（fallback: false）"
else
  echo "  ⚠ AI 免费通道不可用（可能未配置 FREE_AI_API_KEY Secret）"
  echo "    状态：$AI_STATUS"
fi

# 验证词库可访问
DICT_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${DEPLOY_URL}/dict/a/ab.json")
if [ "$DICT_STATUS" = "200" ]; then
  echo "  ✓ 词库可访问（dict/a/ab.json HTTP 200）"
else
  echo "  ✗ 词库不可访问（HTTP $DICT_STATUS）"
  VERIFY_OK=false
fi

echo ""
if [ "$VERIFY_OK" = true ]; then
  echo "✓ 部署完成且验证通过：${DEPLOY_URL}"
else
  echo "⚠ 部署完成但部分验证失败，请检查上方日志"
  echo "  排查手册：docs/DEPLOYMENT-TROUBLESHOOTING.md"
fi
echo "  如需配置环境变量（FREE_AI_API_KEY 等），请在 Pages 项目的 Settings → Environment variables 中添加。"
