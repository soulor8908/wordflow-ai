# Cloudflare Pages 部署排查手册

> 本文档记录了 WordFlow 项目部署到 Cloudflare Pages 过程中遇到的所有问题及解决方案，
> 供后续部署时参考，避免重复踩坑。

## 部署架构

```
pnpm build:cf          # OpenNext 构建 → .open-next/
    ↓
cp worker.js → _worker.js    # Pages Module Worker 入口
cp assets/* → .open-next/    # 静态资源展开到部署根
cat > _routes.json           # 静态资源排除规则
    ↓
wrangler pages deploy .open-next --project-name wordflow-ai --branch main
```

## 常见失败原因与排查清单

### 1. ❌ node_modules 丢失（环境重置后）

**现象**：`pnpm build:cf` 报 `opennextjs-cloudflare: not found`
**原因**：远程沙箱环境重置后 node_modules 不持久
**解决**：构建前先 `pnpm install --frozen-lockfile`
**预防**：部署脚本应在 build 前自动检查 node_modules 是否存在

### 2. ❌ _worker.js 找不到依赖模块

**现象**：部署成功但页面 500，日志报 `Cannot find module './middleware/handler.mjs'`
**原因**：只部署了 `.open-next/assets/` 目录，但 `_worker.js` 引用同级的 `middleware/`、`server-functions/`、`cloudflare/` 等目录
**解决**：部署根目录必须是 `.open-next/`（含全部依赖），不是 `.open-next/assets/`
**关键文件**：[scripts/deploy-pages.sh](file:///workspace/scripts/deploy-pages.sh)

### 3. ❌ Worker 报 nodejs_compat 缺失

**现象**：部署成功但 API 报 `require is not defined` 或 `util/module not found`
**原因**：Pages 项目未启用 `nodejs_compat` 兼容标志
**解决**：[wrangler.jsonc](file:///workspace/wrangler.jsonc) 配置 `compatibility_flags: ["nodejs_compat"]` + `pages_build_output_dir: ".open-next"`

### 4. ❌ 静态资源被 Worker 拦截返回 404

**现象**：页面能打开但 CSS/JS/词库文件 404
**原因**：`_routes.json` 未排除静态资源路径，所有请求都被 `_worker.js` 处理
**解决**：创建 `_routes.json`，exclude 掉 `_next/static/*`、`dict-data/*`、`book-data/*`、`icons/*` 等

### 8. ❌ 页面路由 404（静态目录与路由同名冲突）

**现象**：`/books` 页面返回 404，但 `/review`、`/me` 等其他路由正常；`/books/cet4-core/index.json` 静态资源却能访问
**原因**：`public/books/` 静态目录与 `app/books/page.tsx` 页面路由同名。Cloudflare Pages 优先把 `/books` 当静态资源匹配，但它是目录不是文件，返回 404，不 fallback 到 Worker
**解决**：重命名静态目录避免冲突——`public/books/` → `public/book-data/`，同步改代码引用（lib/content/book-index.ts、lib/review/book-queue.ts）和 `_routes.json` 的 exclude 规则
**关键文件**：[lib/content/book-index.ts](file:///workspace/lib/content/book-index.ts)、[lib/review/book-queue.ts](file:///workspace/lib/review/book-queue.ts)

### 5. ❌ AI 聊天返回 fallback 文案（非真实 AI）

**现象**：`/api/ai/chat` 返回 `fallback: true`，回复是本地兜底文案
**原因**：`process.env.FREE_AI_API_KEY` 在 Worker 中不可用（Secret 未配置或未生效）
**解决**：
```bash
echo "sk-xxx" | wrangler pages secret put FREE_AI_API_KEY --project-name wordflow-ai
```
配置后**必须重新部署一次**才能生效（Secret 绑定到新部署版本）

### 6. ❌ AI 调用报 "Invalid JSON response"

**现象**：AI 聊天报错 `上游服务暂时不可用（Invalid JSON response）`
**原因**：`@ai-sdk/openai` 的 `generateText` 对响应格式要求严格，上游返回 HTML 错误页/空响应时抛黑盒错误
**解决**：[chat/route.ts](file:///workspace/app/api/ai/chat/route.ts) 改用原始 `fetch` + 手动 JSON 解析，捕获真实 HTTP 状态和响应体

### 7. ❌ wrangler ASSETS binding 冲突

**现象**：部署报 `ASSETS is a reserved name`
**原因**：Pages 模式下 `ASSETS` 由系统自动绑定，不能在 `wrangler.jsonc` 中显式声明 `assets.binding`
**解决**：`wrangler.jsonc` 只配置 `pages_build_output_dir`，不配置 `assets.binding`

### 9. ❌ 静态目录重命名后多处遗留导致部署验证失败

**现象**：`/dict` 页面 404（静态目录 `public/dict/` 与 `app/dict/page.tsx` 路由冲突），重命名为 `public/dict-data/` 后，部署脚本验证步骤报"词库不可访问 HTTP 404"
**原因**：重命名不完整——只改了目录本身和核心加载器（`lib/dict/dict-loader.ts`），遗漏了 4 类散落引用：
1. `scripts/deploy-pages.sh` 验证 curl（仍请求 `/dict/a/ab.json`）→ 部署脚本误报失败
2. `.github/workflows/quality-gate.yml` CI 的 `_routes.json` exclude（仍排除 `/dict/*`，未排除 `/dict-data/*`）→ CI 部署中词库被 Worker 拦截 404
3. `app/me/page.tsx` 的词库健康检查 fetch（仍请求 `/dict/a/ab.json`）→ `/me` 页面误报词库异常
4. 文档/注释中的路径漂移
**解决**：重命名静态目录时必须全局同步所有引用。**根治检查**：
```bash
# 重命名后执行，确认无遗漏（应只在 lib/dict 源码模块引用中出现，那是模块路径非静态资源）
grep -rn '/dict/' --include='*.{ts,tsx,sh,yml,yaml,md,py,mjs,js,cjs}' . | grep -v 'dict-data' | grep -v node_modules
```
**关键文件**：[lib/dict/dict-loader.ts](file:///workspace/lib/dict/dict-loader.ts)、[scripts/deploy-pages.sh](file:///workspace/scripts/deploy-pages.sh)、[.github/workflows/quality-gate.yml](file:///workspace/.github/workflows/quality-gate.yml)、[app/me/page.tsx](file:///workspace/app/me/page.tsx)
**教训**：同类问题 `books` → `book-data`（§8）重命名时已完整覆盖 deploy 脚本和 CI，本次 `dict` → `dict-data` 重命名未参照该模板，导致重复踩坑。重命名必须检查：① 加载器 ② 部署脚本验证 ③ CI _routes.json ④ 运行时 fetch ⑤ 文档

## 标准部署流程（避免失败的检查清单）

```bash
# 1. 确保依赖完整
pnpm install --frozen-lockfile

# 2. 本地门禁全通过
pnpm lint && pnpm typecheck && pnpm test && pnpm build

# 3. 构建 OpenNext 产物
pnpm build:cf

# 4. 验证构建产物完整性
test -f .open-next/worker.js      # Worker 入口
test -d .open-next/assets         # 静态资源
test -d .open-next/server-functions  # 服务端函数
test -d .open-next/middleware     # 中间件

# 5. 准备部署目录（脚本自动完成）
cp .open-next/worker.js .open-next/_worker.js
cp -r .open-next/assets/* .open-next/
# 写入 _routes.json

# 6. 部署
CLOUDFLARE_API_TOKEN="xxx" npx wrangler pages deploy .open-next \
  --project-name wordflow-ai --branch main --commit-dirty=true

# 7. 验证部署（关键！必须验证）
curl -sI https://wordflow-ai.pages.dev/                          # 页面 200
curl -s "https://wordflow-ai.pages.dev/api/ai/chat?clientId=test" # AI 状态 enabled:true, fallback:false
curl -s -X POST "https://wordflow-ai.pages.dev/api/ai/chat" \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"hi"}],"clientId":"test"}'  # 真实 AI 回复
curl -s "https://wordflow-ai.pages.dev/dict-data/a/ab.json" | head -c 100  # 词库可访问
```

## 环境变量/Secret 配置

| 变量名 | 用途 | 配置方式 |
|--------|------|----------|
| `CLOUDFLARE_API_TOKEN` | wrangler 部署认证 | 本地环境变量 |
| `FREE_AI_API_KEY` | 免费AI通道密钥 | `wrangler pages secret put` |
| `FREE_AI_PROVIDER` | AI Provider（默认deepseek） | Pages Dashboard 或 secret |
| `FREE_AI_MODEL` | 模型名（默认deepseek-v4-flash） | Pages Dashboard 或 secret |

> **注意**：Secret 配置后必须重新部署才能生效。Pages 环境变量在 Dashboard 设置后也需要重新部署。
