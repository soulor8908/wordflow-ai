# WordFlow 产品设计方案优化计划（对齐 devpath-ai）

> **目标**：参考 `https://github.com/soulor8908/devpath-ai` 的技术方案，全面优化 `/workspace/免费英文词典学习应用-产品设计方案.md`，使其在技术深度、方法论严谨度、质量流程上与 devpath-ai 对齐。
> **范围**：全面对齐（技术 + 产品架构 + 流程）
> **落地**：原地修改现有文件，版本号 v1.0 → v1.1
> **日期**：2026-07-27

---

## 一、Summary（摘要）

WordFlow 当前方案（v1.0）已正确锚定 devpath-ai 作为技术参照，但只是"承接"层面的粗粒度引用——第 4 章技术架构在加密细节、KV 隔离、索引优化、tombstone 清理、PWA 后台呼吸、Prompt 版本管理、安全头、质量门禁、审计方法论等关键工程细节上明显浅于 devpath-ai 的实际实现。

本次优化将 WordFlow 设计方案从"承接 devpath-ai"升级为"对齐 devpath-ai"，主要工作：

1. **产品架构**：引入 L1-L4 四层分层（适配词典学习域），把现有功能映射到四层，明确每层职责与矛盾化解对应表。
2. **技术架构**：补全零信任 AI Session 全套细节（三 KV 隔离 + AES-GCM + HMAC + nonce + 滑动续期 + 审计日志）、Dexie dueAt 索引优化、tombstone 清理函数、Webpack 分包、安全头四件套、PWA periodicsync 后台呼吸 + Web Push。
3. **数据管线**：Content-as-Code 全流程（T0-T3 来源等级、zod schema、G1-G7 图谱校验、新鲜度巡检脚本）。
4. **AI 能力**：Prompt Registry 版本指纹 + 快照测试 + Content Quality Charter；AI Provider 多家抽象（DeepSeek/GLM/MiMo/custom）；`/api/ai-test` 连接测试端点。
5. **质量流程**：三层质量护栏（预防/检测/审计）+ `quality-gate` 脚本 + 守护测试清单 + 六轮审计方法论 + 里程碑审计检查点。
6. **路线图**：在 M1-M4 中插入审计检查点，新增 M5（生态固化）。
7. **风险与对策**：补充安全/配额/审计相关风险条目。

---

## 二、Current State Analysis（现状分析）

### 2.1 WordFlow v1.0 已有（保留不动）

- 产品定位三角（价格/体验/数据）清晰，"查词即背词"核心闭环准确。
- 记忆验证四级状态机 V1-V4 已复用 devpath-ai 思想，方向正确。
- 词书轨 + 收藏轨双轨制 + FSRS 单队列去重，设计合理。
- 功能架构（查词/学习/词书/统计/我的）完整。
- 技术栈锁定与 devpath-ai 一致（Next.js 15 / React 19 / Dexie 4 / ts-fsrs 4.5 / Cloudflare Pages）。
- 成本测算（万级 DAU < ¥100/月）逻辑成立。
- 北极星指标 WRU + 辅助指标体系合理。

### 2.2 WordFlow v1.0 的差距（需对齐 devpath-ai）

| # | 维度 | WordFlow v1.0 现状 | devpath-ai 实际实现 | 差距 |
|---|------|-------------------|---------------------|------|
| G1 | 产品架构分层 | 平铺式功能架构树 | L1 内容/L2 路径/L3 验证/L4 交付四层 + 矛盾化解对应表 | 缺分层心智模型 |
| G2 | AI Session 加密 | "AES-GCM 加密 + nonce + HMAC + 滑动续期"一句话 | 三 KV 隔离（AUTH_SESSIONS/AUTH_NONCES/AUTH_AUDIT）+ 12B IV + 128bit tag + 常数时间比对 + 审计日志（userIdHash+IP+UA）+ SessionRecord 结构 | 缺工程细节 |
| G3 | Dexie 索引 | "(&key, prefix, updatedAt) 四索引"提到 dueAt 但未展开 | dueAt 索引让 countDueCards 从 O(n) 降到 O(due)；动态 import("dexie") 避免 Edge runtime BroadcastChannel 泄漏；idb-keyval→Dexie 幂等迁移 | 缺性能优化与 SSR 安全 |
| G4 | Tombstone | "tombstone 30 天"一句话 | cleanExpiredTombstones() 清理函数 + getChangesSince(ts) 增量拉取 + bulkPutItems 批量写 | 缺清理与增量 API |
| G5 | PWA | "Service Worker 缓存词典切片"一句话 | stale-while-revalidate + Web Push + periodicsync 后台检查 due 卡片主动通知 + SW 内原生 IndexedDB API | 缺后台呼吸（P0.1 留存利器） |
| G6 | Content-as-Code | compile-dict/books/semantic-index/audit-dict 四脚本表格 | + T0-T3 来源等级体系 + 每节点 ≥2 来源 ≥1 T0-T1 + zod schema + G1-G7 图谱校验 + 新鲜度巡检脚本 | 缺权威等级与图谱校验 |
| G7 | Prompt 管理 | 未提及 | Prompt Registry（id/version/changelog）+ promptFingerprint() + AICallRecord.promptVersion + 快照测试强制 bump version + Content Quality Charter | 完全缺失 |
| G8 | AI Provider | 仅 DeepSeek + Workers AI bge | GLM/DeepSeek/MiMo/custom 四家 + Vercel AI SDK createOpenAI() + getModelFromSession(scene) + /api/ai-test 区分上游 401 vs 本地 500 | 缺多家抽象与连接测试 |
| G9 | 质量门禁 | 未提及 CI/质量门禁 | quality-gate 脚本（content:validate→freshness→lint→typecheck→test）+ 三层质量护栏（预防/检测/审计）+ 守护测试 + 六轮审计方法论 | 完全缺失 |
| G10 | 安全头 | 未提及 | HSTS + CSP + X-Frame-Options + Permissions-Policy + 守护测试 | 完全缺失 |
| G11 | 性能优化 | 未提及 | experimental.optimizePackageImports + recharts-vendor/ai-sdk-vendor 分包 + 内存缓存失效 | 完全缺失 |
| G12 | 路线图审计 | M1-M4 无审计检查点 | 六轮审计作为里程碑强制流程 | 缺审计节点 |
| G13 | L4 扩展模块 | 未提及（定位为非目标） | 能量回归/情绪觉察/作品集 | 选择性适配（学习节奏/疲劳/词汇成就），不强行纳入 |

### 2.3 关键文件参考

- **目标文件**：`/workspace/免费英文词典学习应用-产品设计方案.md`（v1.0，260 行，9 大章节）
- **参照源**：devpath-ai main 分支（commit 23a40798）
  - `lib/storage/dexie-db.ts`（Dexie schema + dueAt 索引 + 迁移）
  - `lib/ai/crypto.ts`（AES-GCM/HMAC-SHA256/常数时间比对）
  - `app/api/auth/exchange/route.ts`（零信任 session exchange 全流程）
  - `lib/ai/session-middleware.ts`（nonce 防重放 + 滑动续期）
  - `lib/ai/prompts.ts`（Prompt Registry + 版本指纹）
  - `lib/ai/provider.ts`（多家 Provider 抽象）
  - `lib/sync.ts` + `lib/storage/kv.ts`（LWW + tombstone + 增量同步）
  - `public/sw.js`（stale-while-revalidate + Web Push + periodicsync）
  - `next.config.js`（webpack 分包 + 安全头）
  - `wrangler.toml`（三 KV 隔离配置）
  - `docs/ARCHITECTURE.md`（L1-L4 四层架构）
  - `docs/curriculum-content.md`（Content-as-Code + T0-T3 + G1-G7）
  - `docs/code-audit-methodology.md`（六轮审计方法论）
  - `AGENTS.md`（三层质量护栏 + UI 设计系统强制规则）
  - `.github/workflows/deploy-devpath.yml`（CI/CD 流水线）

---

## 三、Proposed Changes（拟议变更）

所有变更均为原地编辑 `/workspace/免费英文词典学习应用-产品设计方案.md`，版本号 bump v1.0 → v1.1，日期更新。变更按章节组织，**仅修改设计文档本身，不创建代码文件**。

### 3.1 全局变更

- **第 4 行**：版本 `v1.0` → `v1.1`，副标题加"对齐 devpath-ai 技术方案"。
- **新增第 2.4 节**：产品四层架构（L1-L4）——把 WordFlow 现有功能映射到四层心智模型，附"四个矛盾化解对应表"（适配词典学习域：通用工具无方向→词书轨+COCA 高频；学了就忘→V1-V4 记忆验证；坚持不下去→FSRS+Streak+PWA 后台呼吸；查词与背词割裂→收藏即入队）。

### 3.2 第 4 章 技术架构（核心改动）

#### 4.1 总体架构图升级

- 把现有三层架构图（前端/静态数据/Edge）升级为 **L1-L4 四层 + 三运行时** 双视图：
  - **L4 交付层**：FSRS 复习 + Streak + PWA Service Worker（stale-while-revalidate + Web Push + periodicsync）
  - **L3 验证层**：V1 再认 → V2 拼写 → V3 语境 → V4 产出（纯函数 applyVerificationResult 推进）
  - **L2 路径层**：词书轨（系统备考）+ 收藏轨（随遇随记）→ FSRS 单队列去重
  - **L1 内容层**：ECDICT/WordNet/Wiktionary/COCA-BNC + T0-T3 来源等级 + Content-as-Code 编译
- 三运行时（浏览器 / Cloudflare Pages Functions edge / 数据层 KV+Workers AI）保留并细化。

#### 4.2 数据管线（Content-as-Code 全流程）

- 在现有四脚本表格后新增 **T0-T3 来源等级体系**小节：
  - T0 一手规范（ECDICT MIT 协议、WordNet、Wiktionary 词源）
  - T1 一手实现（COCA/BNC 词频表原始语料）
  - T2 权威工程实践（教研机构考纲词表）
  - T3 二手解读（仅补充）
  - 规则：每词条 ≥1 条 T0/T1 来源；词书节点 ≥2 条来源。
- 新增 **zod schema 校验**说明：词书 YAML 用 zod 校验 id/日期/必填字段。
- 新增 **CI 图谱校验 G1-G7**（适配词典域）：
  - G1 词书引用的词条在词典切片中存在
  - G2 释义完整性（核心释义非空、音标非空）
  - G3 词频标签与 COCA 数据一致
  - G4 同近义词反向链接闭环
  - G5 词书无重复词条
  - G6 自定义词书导入匹配率 ≥ 阈值
  - G7 语义反查向量索引覆盖率
- 新增 **新鲜度巡检**：`audit-source-freshness.ts` 检查词典数据源版本与上游同步状态。

#### 4.3 本地数据模型（Dexie 深化）

- 升级 Dexie schema 描述：明确 v1 → v2 迁移，v2 新增 `dueAt` 索引。
- 补 **性能优化**：`countDueCards(now)` 走 dueAt 索引（O(due)）而非全量加载卡片（O(n)）。
- 补 **SSR/Edge 安全**：动态 `import("dexie")` 避免 BroadcastChannel 泄漏到 edge runtime。
- 补 **迁移模式**：idb-keyval → Dexie 幂等迁移（以 key 为主键覆盖写入，`_dexie_migrated` 标志位）。
- 补 **增量同步 API**：`getChangesSince(ts)` / `bulkPutItems(items)` / `listItemsByPrefix(prefix, limit)` / `countByPrefix(prefix)`。
- 补 **tombstone 清理**：`cleanExpiredTombstones()` 定期清理 30 天 TTL 墓碑。
- 明确 **同步安全红线**：MODEL_CONFIG（含明文 apiKey）不参与同步，仅本地。

#### 4.4 AI 能力接入（零信任 Session 全套细节）

- 把现有"Session 架构直接复用"一句话扩为完整小节：
  - **三 KV Namespace 隔离**：`KV`（用户数据+公开主页）/ `AUTH_SESSIONS`（session 密文）/ `AUTH_NONCES`（防重放 nonce，TTL 5min）/ `AUTH_AUDIT`（审计日志）——隔离配额争用。
  - **Exchange 流程**：客户端发 `{apiKey, userId, provider, baseURL, model, name}` → 服务端 MASTER_KEY 检查 → 生成 sessionId（16B 随机→32 hex）+ sessionSecret（32B 随机→base64）→ AES-GCM-256 加密（12B IV + 128bit tag）→ 写 SessionRecord 到 KV → 审计日志（userIdHash=SHA-256 + IP + UA，明文不入日志）→ 返回 `{sessionId, sessionSecret, expiresAt}`（sessionSecret 仅此一次响应）。
  - **SessionRecord 结构**：userId/encryptedApiKey/encryptedSecret/provider/baseURL/model/name/createdAt/lastUsedAt/expiresAt。
  - **防重放**：每请求带 timestamp + nonce；nonce 一次性消费，TTL 5min，存独立 KV。
  - **防篡改**：HMAC-SHA256(sessionSecret, canonicalRequest) 常数时间比对（`constantTimeEqual`）。
  - **滑动续期**：每次成功调用刷新 `expiresAt = now + 7d`，活跃用户不掉线。
  - **Web Crypto API only**：仅用 `crypto.subtle`（edge runtime 原生支持），禁止 Node.js 专属 API。
- 升级 AI 能力表格：DeepSeek → **DeepSeek / GLM / MiMo / custom** 四家（GLM 国内零梯子可达，作为 Trial 默认；DeepSeek 备选；MiMo 备选；custom BYOK）。通过 Vercel AI SDK `createOpenAI()` 抽象，`getModelFromSession(session, scene)` 取已解密 apiKey。
- 新增 **Prompt Registry** 小节：
  - 所有 AI system prompt 集中管理，每个 prompt 带 `id / version / system / changelog`。
  - `promptFingerprint()` 计算版本指纹（如 `"word_sentence:v1:5e8b3a01"`）写入 AICallRecord.promptVersion。
  - 修改 prompt 必须 bump version + 写 changelog；快照测试 `__tests__/prompts.test.ts` 的 `PROMPT_VERSION_HASHES` 强制拦截漏 bump。
  - **Content Quality Charter**：所有"产答案"的 prompt（AI 例句/词根助记/造句批改）注入统一质量约束（语境真实/无歧义/词频适配/不含敏感词）。
- 新增 **`/api/ai-test` 连接测试端点**：BYOK onboarding 时用 session 配置发测试消息，区分上游鉴权失败（401）vs 本地错误（500）。

#### 4.5 PWA 与离线（后台呼吸，新增小节）

- 升级原"Service Worker 缓存词典切片"为完整 PWA 小节：
  - **stale-while-revalidate 缓存策略**：install 预缓存静态资源（`/`、`/review`、`/stats`、`/manifest.json`）+ skipWaiting；activate 清理旧缓存（CACHE_NAME = "wordflow-v2"）+ clients.claim；fetch 事件非 GET 跳过、`/api/` 跳过、缓存命中即返回+后台更新、缓存未命中 fetch+缓存+失败 fallback 首页。
  - **Web Push 推送通知**：`push` 事件弹"该复习了"提醒；`notificationclick` 聚焦/打开应用并导航到 `/review`；tag 去重；图标 `/icons/icon-192.png`。
  - **Periodic Background Sync（P0.1 留存利器）**：`periodicsync` 事件（tag: "wordflow-background-check"）→ `doBackgroundCheck()`：
    1. SW 内直接用原生 IndexedDB API（`indexedDB.open("wordflow-db")`，object store `keyval`，因 SW 无法 import idb-keyval）
    2. 查 `card:` 前缀卡片，统计 dueCount（due <= now）
    3. 查 `log:` 前缀记录，找最后学习时间
    4. 有待复习卡片且在线 → "📚 今日有 N 词待复习"通知
    5. 连续 3 天未学习 → "回来背词吧"通知（7 天以上换文案）
  - **离线策略**：业务数据全 IndexedDB（离线完全可用）；静态资源 SW 缓存；API 不缓存（离线时 AI 功能不可用但本地数据可读写）。

#### 4.6 性能优化（新增小节）

- **experimental.optimizePackageImports**：对 recharts / date-fns / @ai-sdk/openai / zod / nanoid / ts-fsrs / react-activity-calendar 做 per-module 拆分。
- **Webpack 分包**：
  - `recharts-vendor`：recharts + d3 全家桶（~500KB），只在统计页用
  - `ai-sdk-vendor`：ai + @ai-sdk/openai，只在 AI 场景用
  - `dict-vendor`：词典切片索引（按需 lazy load）
- **内存缓存**：setItem 自动失效对应缓存。
- **词典切片懒加载**：按前缀切片（`dict/{a-z}/{prefix}.json`，单片 <50KB），查词时按需 fetch + SW 缓存。

#### 4.7 安全头（新增小节）

补 `next.config.js` headers() 四件套：

| 安全头 | 值 | 用途 |
|---|---|---|
| HSTS | `max-age=63072000; includeSubDomains` | 强制 HTTPS |
| CSP | `default-src 'self'; script-src 'self' 'unsafe-inline'; ...` | 内容安全策略 |
| X-Frame-Options | `DENY` | 防点击劫持 |
| Permissions-Policy | `camera=(), microphone=(), geolocation=(), interest-cohort=(), browsing-topics=()` | 收敛浏览器能力 |

注：CSP nonce 模式因 `@cloudflare/next-on-pages` 限制暂回退，留待迁移 OpenNext adapter 后启用。守护测试 `__tests__/csp-nonce-guard.test.ts` + `__tests__/security-headers-guard.test.ts` 拦截回退。

#### 4.8 成本测算（细化）

- 在现有成本测算后补 **三 KV 隔离配额**：AUTH_SESSIONS/AUTH_NONCES/AUTH_AUDIT 各自独立 1K 写/日，避免 session 高频写打爆业务 KV。
- 补 **Workers AI 嵌入免费层**：10K 次/日推理，覆盖语义反查 + 释义嵌入。
- 补 **GLM Trial 优势**：国内零梯子可达，作为 Trial 默认 provider 降低用户首次体验摩擦。

### 3.3 第 3 章 功能设计（小改）

- 在 3.1 功能架构树中，给"我的"分支补 **AI 连接测试**（`/api/ai-test`）和 **Provider 切换**（GLM/DeepSeek/MiMo/custom）。
- 在 3.2 复习页 B 中补 **PWA periodicsync 主动提醒**说明：用户授权后，浏览器后台检查 due 卡片并推送通知，无需用户打开应用。
- 在 3.3 交互原则后新增 **3.4 PWA 交互**：后台通知点击直达 `/review`；通知文案分级（3 天/7 天/14 天未学习换文案）。

### 3.4 第 5 章 增长与运营（小改）

- 在 5.2 增长飞轮补 **PWA periodicsync 作为留存利器**：devpath-ai 验证过的"AI 从被调用变成在呼吸"模式，WordFlow 用于"该复习了"主动召回。
- 在 5.3 可持续性补 **Prompt 版本管理降低运维成本**：版本指纹 + 快照测试让 prompt 迭代可追溯可回滚，降低 AI 功能长期维护风险。

### 3.5 第 6 章 里程碑与指标（中改）

- 在 M1-M4 每个里程碑交付物中补 **审计检查点**：每个里程碑结束前跑六轮审计的 Round 1（功能正确性）+ Round 2（安全性）。
- 新增 **M5 生态固化**（+4 周）：六轮审计全跑通 + 性能基线 + 守护测试覆盖率 ≥80% + Prompt 版本管理上线 + AI Provider 多家切换。
- 在 6.3 风险与对策表格补 3 行：
  - **AI 上游限流/封号**（高）→ Trial 多家 provider 切换 + BYOK 兜底 + `/api/ai-test` 主动探测
  - **KV 配额打爆**（中）→ 三 KV 隔离 + 手动同步 + 单用户频控
  - **prompt 漂移导致 AI 质量回归**（中）→ 版本指纹 + 快照测试 + AICallRecord 可追溯

### 3.6 第 7 章 MVP 开发清单（小改）

- Week 1 补 `audit-dict.ts` 的 G1-G7 校验规则实现 + zod schema。
- Week 2 补 Dexie dueAt 索引 + `countDueCards` 走索引。
- Week 3 补 ts-fsrs 三预设（conservative 0.95 / standard 0.9 / aggressive 0.8）。
- Week 4 补 PWA stale-while-revalidate + 安全头四件套 + quality-gate 脚本接入 CI。
- 新增 **Week 5-6（M2 拓展）**：PWA periodicsync + Web Push + Prompt Registry + `/api/ai-test`。

### 3.7 新增第 8 章 质量保障（对齐 devpath-ai 三层护栏 + 六轮审计）

- **8.1 三层质量护栏**：
  - **预防层**：`AGENTS.md` 编码规范 + UI 设计系统规范（统一组件库 `@/components/ui`，禁止原生 `<button>/<input>/<select>/<textarea>`）+ 设计令牌。
  - **检测层**：守护测试清单——`no-native-form-elements.test.ts` / `ui-design-system-guard.test.ts` / `csp-nonce-guard.test.ts` / `security-headers-guard.test.ts` / `prompts.test.ts`（PROMPT_VERSION_HASHES 快照）。
  - **审计层**：六轮深度审计方法论（里程碑/定期触发）。
- **8.2 quality-gate 脚本**：`content:validate && content:freshness && lint && typecheck && test`，CI 强制 + husky pre-push 4 层门禁。
- **8.3 六轮审计方法论**（适配词典学习域）：
  - Round 1 功能正确性（Critical）：空指针/异步异常/边界条件/类型逃逸/输入校验
  - Round 2 安全性（High）：apiKey 明文/nonce 重放/HMAC 时序/CSP 绕过/XSS
  - Round 3 数据完整性（High）：FSRS 卡片状态机/tombstone 清理/LWW 合并/词书去重
  - Round 4 性能（Medium）：dueAt 索引命中/分包加载/切片懒加载/SW 缓存命中率
  - Round 5 可维护性（Medium）：prompt 版本/类型覆盖/守护测试覆盖/文档同步
  - Round 6 用户体验（Low）：三秒查词收藏/键盘快捷键/中断友好/通知文案分级
- **8.4 CI/CD 流水线**：Job 1 quality-gate → Job 2 deploy（`@cloudflare/next-on-pages` + `wrangler pages deploy`），路径过滤触发，Node 22 + npm ci。

---

## 四、Assumptions & Decisions（假设与决策）

### 4.1 关键决策

1. **L1-L4 四层架构适配词典学习域**：不照搬 devpath-ai 的"能量回归/情绪觉察/作品集"（这些是开发者成长 OS 域特有），而是把 WordFlow 现有功能映射到四层心智模型，保留 WordFlow"克制"定位。
2. **V1-V4 状态机保留并细化**：WordFlow v1.0 的 V1-V4 已正确复用 devpath-ai 思想，本次只补 `applyVerificationResult` 纯函数推进规则（不可跳级）。
3. **AI Provider 从单一 DeepSeek 扩为四家**：GLM 作为 Trial 默认（国内零梯子），DeepSeek/MiMo 备选，custom BYOK。这是"全面对齐"的合理扩展，不违背非目标。
4. **PWA periodicsync 纳入 M2 而非 M1**：M1 聚焦核心闭环，periodicsync 作为留存增强放 M2，避免 MVP 过重。
5. **六轮审计作为里程碑检查点**：不强制每 PR 跑六轮（成本高），仅里程碑/定期触发；日常靠 quality-gate + 守护测试。
6. **安全头 CSP nonce 暂回退**：与 devpath-ai 一致，因 `@cloudflare/next-on-pages` 限制，留待 OpenNext adapter。
7. **不新增代码文件**：本次只优化设计文档，所有实现细节写进文档作为后续开发的规范。

### 4.2 假设

- 用户已读 devpath-ai README 与架构，理解"对齐"含义为技术深度+方法论对齐，非逐字照搬。
- WordFlow 的"非目标"（社区/K12/多语种/强制登录/卖课）保持不变，本次优化不突破非目标红线。
- 三 KV 隔离的额外配额成本可忽略（Cloudflare KV 免费层每 namespace 独立 100K 读/1K 写/日）。
- PWA periodicsync 需要 Chrome 81+ / Edge 81+ 支持，作为渐进增强（不支持时降级为应用内提醒）。

---

## 五、Verification Steps（验证步骤）

由于本次只修改设计文档（无代码），验证以文档质量为准：

1. **结构完整性**：用 Read 工具通读修改后的 `/workspace/免费英文词典学习应用-产品设计方案.md`，确认 9 大章节齐全 + 新增第 8 章质量保障 + 版本号 v1.1。
2. **对齐度自查**：逐项核对第二节 G1-G13 差距表，确认每条差距在文档中有对应小节覆盖。
3. **可执行性**：MVP 开发清单（第 7 章）每个 Week 的交付物可被工程师直接拆解为 task。
4. **一致性**：术语统一（sessionId/sessionSecret/AUTH_SESSIONS/dueAt/tombstone 等与 devpath-ai 一致）；版本号/日期/章节编号连贯。
5. **git 同步**：完成后 `git add` + `git commit` + `git push origin main`，回复用户是否成功（遵循用户规则 0/1）。

---

## 六、实施顺序（执行阶段参考）

1. 全局：版本号 v1.0 → v1.1 + 日期 + 副标题。
2. 新增 2.4 节产品四层架构。
3. 第 4 章技术架构重写（4.1-4.8 八个小节，核心改动）。
4. 第 3 章功能设计小改（3.1/3.2/3.4）。
5. 第 5 章增长运营小改（5.2/5.3）。
6. 第 6 章里程碑中改（M1-M4 审计检查点 + M5 + 风险表 3 行）。
7. 第 7 章 MVP 清单小改（Week 1-4 补充 + Week 5-6）。
8. 新增第 8 章质量保障（三层护栏 + quality-gate + 六轮审计 + CI/CD）。
9. 通读校对 + git commit + git push。
