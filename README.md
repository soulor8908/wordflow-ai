# WordFlow

> 查词即背词的免费英语词典学习工具 —— 把欧路的查词、墨墨的算法、Anki 的自由度合成一个不要钱、不折腾、无广告的产品。

核心特点：

- **查词即背词**：收藏即创建 FSRS 卡片，次日自动出现在复习队列，无需任何额外操作
- **目标用户不是从零开始**：通过刷题模式长按"认识"快速标记已会词，集中精力学不会的
- **本地优先 + 离线可用**：词典数据按需懒加载，PWA 装机后断网仍可复习
- **FSRS 间隔重复算法**：开源版 SuperMemo，比 Anki 默认 SM-2 更精准
- **AI 助手**：开箱即用的免费通道（Cloudflare Workers AI），支持 BYOK 自带 Key
- **常错词自动统计**：复习中标记"忘记/模糊"自动累计，统计页一目了然

## 技术栈

- **框架**：Next.js 16（App Router）+ React 19
- **运行时**：Cloudflare Workers（通过 `@opennextjs/cloudflare`）
- **存储**：IndexedDB（Dexie，本地优先）+ Cloudflare KV（同步层，预留）
- **算法**：ts-fsrs（FSRS v5）
- **AI**：Vercel AI SDK + Cloudflare Workers AI（默认免费通道）
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

> 本地 `pnpm dev` 时 AI 助手不可用是正常的——Workers AI binding 仅在 Cloudflare 运行时生效。要测试 AI，请使用 `pnpm preview`（wrangler 本地预览），或部署到 Cloudflare。

## 部署到 Cloudflare

### 1. 前置准备

- 注册 [Cloudflare 账号](https://dash.cloudflare.com/sign-up)
- 安装 [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/)（已随 devDependencies 提供）并登录：

```bash
pnpm wrangler login
```

### 2. 启用 Workers AI binding

项目通过 `wrangler.jsonc` 的 `ai` binding 调用 Cloudflare Workers AI（免费额度：每天 10,000 neurons）：

```jsonc
{
  "ai": {
    "binding": "AI"
  }
}
```

无需在 Dashboard 单独开通，部署到 Workers 后自动生效。详见 [Workers AI 文档](https://developers.cloudflare.com/workers-ai/)。

### 3. 构建 + 部署

```bash
# 一键构建并部署到生产
pnpm deploy

# 或仅构建产物，本地用 wrangler 预览
pnpm preview
```

首次部署 Wrangler 会询问是否创建新的 Worker，确认即可。部署成功后会得到 `https://wordflow-ai.<你的子域>.workers.dev` 地址。

> **⚠️ 国内访问说明**：`workers.dev` 默认域名在国内可能无法直接访问。
> 这是因为 Cloudflare Workers 的默认域名走的是境外节点。解决方案是**绑定自定义域名**（见下方第 4 步），
> 自定义域名可走 Cloudflare 中国节点或 CN2 线路，国内可正常访问。
>
> **为什么不迁移到 Pages（pages.dev）？**
> 本项目使用了 Cloudflare Workers AI binding（`wrangler.jsonc` 的 `ai` 配置），
> 而 Cloudflare Pages 不支持 Workers AI binding，也无法支持 `@opennextjs/cloudflare` 的 Worker 模式部署。
> 因此必须保持 Workers 部署，通过自定义域名解决国内访问问题。

### 4. 绑定自定义域名（必需，解决国内访问）

在 Cloudflare Dashboard → Workers & Pages → `wordflow-ai` → Settings → Domains & Routes → Add Custom Domain 中添加自己的域名。Cloudflare 会自动配置 DNS 和 SSL。

绑定后，国内用户通过自定义域名访问会走优化线路，可正常使用。

## AI 通道配置（可选）

WordFlow 支持三级 AI 通道，按优先级自动降级：

| 通道 | 优先级 | 配置位置 | 适用场景 |
|------|--------|---------|---------|
| **BYOK** | 最高 | "我的"页 → AI 设置 | 用户自带 API Key，无限制 |
| **环境变量 Key** | 中 | Cloudflare Dashboard → Settings → Variables | 自部署给家人朋友用 |
| **Workers AI** | 兜底 | `wrangler.jsonc` 的 `ai` binding | 完全免费开箱即用 |

### 自部署配置环境变量 Key（推荐）

在 Cloudflare Dashboard → Workers & Pages → `wordflow-ai` → Settings → Variables and Secrets 中添加：

| 变量名 | 说明 | 示例 |
|--------|------|------|
| `FREE_AI_API_KEY` | 第三方 AI 服务的 API Key | `sk-xxxxx` |
| `FREE_AI_PROVIDER` | Provider 名称 | `glm` / `deepseek` / `mimo` / `custom` |
| `FREE_AI_BASE_URL` | 自定义 baseURL（可选） | `https://api.deepseek.com/v1` |
| `FREE_AI_MODEL` | 自定义模型名（可选） | `deepseek-chat` |
| `FREE_AI_DAILY_QUOTA` | 每用户每日免费额度 | `20`（默认） |

内置 Provider 默认值见 [lib/ai/provider.ts](file:///workspace/lib/ai/provider.ts)：

- `glm` → `https://open.bigmodel.cn/api/paas/v4` · `glm-4-flash`
- `deepseek` → `https://api.deepseek.com/v1` · `deepseek-chat`
- `mimo` → `https://api.xiaomimimo.com/v1` · `mimo-v2-pro`
- `custom` → 由 `FREE_AI_BASE_URL` + `FREE_AI_MODEL` 提供

### 关于 `compatibility_flags`

当前 `wrangler.jsonc` 仅启用 `nodejs_compat`。**不要**添加 `global_fetch_strictly_public`——它会拦截对内网/私有地址的 fetch 请求，导致 custom provider 失败。

## 内容数据

### 词库架构（基础词库 + 词书引用）

WordFlow 采用**两层词库架构**，避免数据冗余并支持复用：

1. **基础词库（Base Dict）** —— `public/dict/{首字母}/{前缀}.json`
   - 全量词条的**单一数据源**（Single Source of Truth），存储富数据 `DictEntry`
     （音标 / 释义 / 词根 / 同反义词 / 搭配 / 词族 / 例句 等）
   - 用户**不需要选择**基础词库，它是底层公共数据
   - 按前 2 字符切片（ab/ac/...），单片 <50KB，浏览器按需懒加载
   - 词条页打开时只 fetch 对应前缀切片，命中后内存缓存

2. **词书（Word Books）** —— `public/books/{id}/index.json + chunk-NNN.json`
   - 用户可选择的"学习任务包"（CET-4 / 考研 / 程序员AI 等）
   - 词书中的 `word` 字段**指向基础词库中的同名单词**
   - 词书内嵌轻量字段（pos / translation / frequency / phonetic）用于
     复习卡片渲染（避免复习时为每个单词都 fetch dict 切片）
   - 完整释义、联想记忆字段在打开词条详情页时从基础词库按需加载

3. **搜索索引（Search Index）** —— `public/search-index.json`
   - 全量词条的 `{word, frequency}` 扁平数组，用于输入即搜
   - 应用启动时**异步加载**（`useSearch` hook fetch + `force-cache`），
     不阻塞首屏渲染
   - 加载完成后构建内存前缀索引，支持 80ms 内完成前缀匹配 + 模糊纠错

- **词典**：ECDICT 派生核心词条（约 7.7 万词条 MIT 协议），按需懒加载
- **词书**：内置高考 / CET4 / 考研核心、程序员 & AI 工作英语等词书（YAML 源文件 → 编译为 JSON 分片）
- **词频**：COCA 高频排序（用于词书默认顺序）

### 编译词书 / 词典

```bash
# 从 YAML 源文件编译词书到 public/books/
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
  api/ai/chat/route.ts  # AI 聊天 API（三级降级）

lib/
  ai/                   # AI Provider 抽象 + Cloudflare Workers AI
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
public/books/           # 编译后的词书分片（运行时懒加载）
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
