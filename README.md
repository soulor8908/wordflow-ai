# WordFlow

> 查词即背词的免费英语词典学习工具 —— 把欧路的查词、墨墨的算法、Anki 的自由度合成一个不要钱、不折腾、无广告的产品。

核心特点：

- **查词即背词**：收藏即创建 FSRS 卡片，次日自动出现在复习队列，无需任何额外操作
- **目标用户不是从零开始**：通过刷题模式长按"认识"快速标记已会词，集中精力学不会的
- **本地优先 + 离线可用**：词典数据按需懒加载，PWA 装机后断网仍可复习
- **FSRS 间隔重复算法**：开源版 SuperMemo，比 Anki 默认 SM-2 更精准
- **AI 助手**：开箱即用的免费通道（环境变量配置 DeepSeek/Agnes/GLM 等），支持 BYOK 自带 Key
- **常错词自动统计**：复习中标记"忘记/模糊"自动累计，统计页一目了然

## 技术栈

- **框架**：Next.js 16（App Router）+ React 19
- **运行时**：Cloudflare Pages（通过 `@opennextjs/cloudflare` 构建 + `wrangler pages deploy`）
- **存储**：IndexedDB（Dexie，本地优先）+ Cloudflare KV（同步层，预留）
- **算法**：ts-fsrs（FSRS v5）
- **AI**：Vercel AI SDK + 兼容 OpenAI 格式的第三方服务（默认 DeepSeek，环境变量配置）
- **样式**：Tailwind CSS v4
- **测试**：Vitest + Testing Library

## 快速开始

```bash
# 安装依赖
pnpm install

# 本地开发（http://localhost:3000）
pnpm dev

# 类型检查 / Lint / 测试
pnpm typecheck
pnpm lint
pnpm test
```

> 本地 `pnpm dev` 时 AI 助手使用的是服务端环境变量配置的免费通道。要测试 AI，请在项目根目录创建 `.dev.vars` 文件配置 `FREE_AI_API_KEY`（见下方"AI 通道配置"），或使用 `pnpm preview` 本地预览。

## 部署到 Cloudflare Pages

### 1. 前置准备

- 注册 [Cloudflare 账号](https://dash.cloudflare.com/sign-up)
- 安装 [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/)（已随 devDependencies 提供）并登录：

```bash
pnpm wrangler login
```

### 2. 配置免费 AI 通道（必需）

WordFlow 已移除 Cloudflare Workers AI 依赖（Pages 不支持该 binding），改为通过环境变量配置兼容 OpenAI 格式的第三方 AI 服务（默认 DeepSeek）。

在 Cloudflare Dashboard → Pages → `wordflow-ai` → Settings → Environment variables 中添加：

| 变量名 | 说明 | 示例 |
|--------|------|------|
| `FREE_AI_API_KEY` | 第三方 AI 服务的 API Key（可选，内置默认） | `sk-xxxxx` |
| `FREE_AI_PROVIDER` | Provider 名称（可选，默认 `deepseek`） | `agnes` / `glm` / `deepseek` / `mimo` / `custom` |
| `FREE_AI_BASE_URL` | 自定义 baseURL（可选） | `https://api.deepseek.com/v1` |
| `FREE_AI_MODEL` | 自定义模型名（可选） | `deepseek-v4-flash` |
| `FREE_AI_DAILY_QUOTA` | 每用户每日免费额度（可选，默认 50） | `50` |

内置 Provider 默认值见 [lib/ai/provider.ts](file:///workspace/lib/ai/provider.ts)：

- `deepseek` → `https://api.deepseek.com/v1` · `deepseek-chat`（默认免费通道）
- `agnes` → `https://apihub.agnes-ai.com/v1` · `agnes-2.0-flash`
- `glm` → `https://open.bigmodel.cn/api/paas/v4` · `glm-4-flash`
- `mimo` → `https://api.xiaomimimo.com/v1` · `mimo-v2-pro`
- `custom` → 由 `FREE_AI_BASE_URL` + `FREE_AI_MODEL` 提供

> **本地开发**：在项目根目录创建 `.dev.vars` 文件（已被 .gitignore 忽略），写入 `FREE_AI_API_KEY=sk-xxx` 即可。

### 3. 构建 + 部署到 Pages

```bash
# 一键构建并部署到 Cloudflare Pages（获取 *.pages.dev 域名）
pnpm deploy:pages

# 或仅构建产物，本地用 wrangler 预览
pnpm preview
```

首次部署 Wrangler 会提示创建 Pages 项目（project name: `wordflow-ai`），确认即可。部署成功后会得到 `https://wordflow-ai.pages.dev` 地址。

> **部署原理**：`@opennextjs/cloudflare build` 产生 Worker + 静态资源，脚本将 `worker.js` 复制为 `_worker.js` 放入 assets 目录，通过 `wrangler pages deploy` 部署到 Pages。Pages 会自动路由静态资源请求，非静态请求交给 `_worker.js` 处理。

> **备选：部署到 Workers**（获取 `*.workers.dev` 域名）
> ```bash
> pnpm deploy   # 使用 opennextjs-cloudflare deploy，部署到 Workers
> ```
> Workers 与 Pages 二选一即可。Pages 对国内访问更友好，推荐使用 `deploy:pages`。

### 4. 绑定自定义域名（可选）

如需使用自己的域名，在 Cloudflare Dashboard → Pages → `wordflow-ai` → Custom domains 中添加。Cloudflare 会自动配置 DNS 和 SSL。

## AI 通道说明

WordFlow 支持两级 AI 通道，按优先级自动降级：

| 通道 | 优先级 | 配置位置 | 适用场景 |
|------|--------|---------|---------|
| **BYOK** | 最高 | "我的"页 → AI 高级设置 | 用户自带 API Key，无限制 |
| **环境变量 Key** | 兜底 | Cloudflare Dashboard → Pages → Environment variables | 自部署开箱即用 |

- 未配置 `FREE_AI_API_KEY` 时，AI 聊天会返回本地兜底引导文案，不阻塞用户使用其他功能
- 配置 BYOK 后，全局 AI 助手会即时感知（同标签页事件通知 + 跨标签页 storage 事件），无需刷新

### 关于 `compatibility_flags`

当前 `wrangler.jsonc` 仅启用 `nodejs_compat`。**不要**添加 `global_fetch_strictly_public`——它会拦截对内网/私有地址的 fetch 请求，导致 custom provider 失败。

## 内容数据

### 词库架构（基础词库 + 词书引用）

WordFlow 采用**两层词库架构**，避免数据冗余并支持复用：

1. **基础词库（Base Dict）** —— `public/dict-data/{首字母}/{前缀}.json`
   - 全量词条的**单一数据源**（Single Source of Truth），存储富数据 `DictEntry`
     （音标 / 释义 / 词根 / 同反义词 / 搭配 / 词族 / 例句 等）
   - 用户**不需要选择**基础词库，它是底层公共数据
   - 按前 2 字符切片（ab/ac/...），单片 <50KB，浏览器按需懒加载
   - 词条页打开时只 fetch 对应前缀切片，命中后内存缓存

2. **词书（Word Books）** —— `public/book-data/{id}/index.json + chunk-NNN.json`
   - 用户可选择的"学习任务包"（CET-4 / CET-6 / 高考 / 考研 / 托福 / 雅思 / GRE / 程序员&AI / 宝妈亲子 等）
   - 词书中的 `word` 字段**指向基础词库中的同名单词**
   - 词书内嵌轻量字段（pos / translation / frequency / phonetic）用于
     复习卡片渲染（避免复习时为每个单词都 fetch dict 切片）
   - 完整释义、联想记忆字段在打开词条详情页时从基础词库按需加载

3. **搜索索引（Search Index）** —— `public/search-index.json`
   - 全量词条的 `{word, frequency}` 扁平数组，用于输入即搜
   - 应用启动时**异步加载**（`useSearch` hook fetch + `force-cache`），
     不阻塞首屏渲染
   - 加载完成后构建内存前缀索引，支持 80ms 内完成前缀匹配 + 模糊纠错

- **词典**：ECDICT 派生核心词条（约 4.2 万词条 MIT 协议），按需懒加载
- **词书**：内置宝妈亲子 / CET-4 / CET-6 / 高考 / 考研 / 托福 / 雅思 / GRE / 程序员&AI 等词书（YAML 源文件 → 编译为 JSON 分片）
- **词频**：COCA 高频排序（用于词书默认顺序）

### 编译词书 / 词典

```bash
# 从 YAML 源文件编译词书到 public/book-data/
pnpm books:compile

# 编译核心词典
pnpm dict:compile

# 内容质量校验
pnpm content:validate
pnpm content:freshness
pnpm quality-gate
```

## 项目结构

```
app/                    # Next.js App Router 路由
  page.tsx              # 首页（查词入口）
  word/[word]/page.tsx  # 词条详情页
  review/page.tsx       # 复习页（FSRS + 刷题模式）
  stats/page.tsx        # 学习统计（Streak + 热力图 + 常错词）
  books/page.tsx        # 词书选择
  me/page.tsx           # 个人中心（AI 配置）
  api/ai/chat/route.ts  # AI 聊天 API（两级降级：BYOK → 环境变量）

lib/
  ai/                   # AI Provider 抽象（兼容 OpenAI 格式的第三方服务）
  dict/                 # 词典加载（懒加载 + 缓存）
  review/               # FSRS 调度 + 词书游标 + 复习会话
  storage/              # IndexedDB 封装（Dexie）
  stats/                # Streak + 学习日志
  content/              # 内容校验规则 + 词书 schema
  audio/                # 发音（Web Speech API）

components/
  ai/                   # AI 助手浮窗
  layout/               # 底部导航
  ui/                   # 通用 UI 组件

scripts/                # 构建/校验脚本（dict / books / quality-gate）
public/book-data/       # 编译后的词书分片（运行时懒加载）
books/                  # 词书 YAML 源文件
```

## 学习闭环

```
查词 → 收藏即创建 FSRS 卡片 → 每日复习（Again/Hard/Good/Easy 评分）
                                ↓
                          Streak 累计 + 常错词自动记录
                                ↓
                     刷题模式快速标记已会词 → 推进词书游标
```

- **FSRS 模式**：算法安排到期卡片 + 每日新词，三按钮评分
- **刷题模式**：主动遍历整本词书，支持顺序/随机，可过滤已掌握，评分落库并影响 FSRS 进度
- **常错词**：Again/Hard 评分自动累计 errorCount，统计页 Top 20 展示

## 开发

```bash
# 提交前自动 lint-staged + husky
git commit -m "feat: ..."

# 类型检查
pnpm typecheck

# 运行测试
pnpm test
```

## 许可

仅供学习交流使用。
