<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- BEGIN:deploy-verification-rules -->
# 部署验证强制约束（MANDATORY）

> 规则：任何"部署成功"的结论，必须以真实的前端 UI 验证为前提，禁止仅凭 HTTP 200 或 wrangler 输出就报告成功。

## 必须执行的验证步骤

1. **运行 UI 验证脚本**（不可跳过）：
   ```bash
   python3 scripts/verify-deploy.py
   ```
   该脚本用 Playwright 真实打开页面、点击 AI 按钮、输入消息、等待 AI 回复，并产出截图。

2. **必须阅读验证输出**：
   - 查看脚本的每一行 `✓` / `✗` 结果
   - 查看截图文件 `tmp-verify-home.png` / `tmp-verify-chat.png`
   - 查看 console 错误日志

3. **必须验证 AI 聊天闭环**（不只是页面能打开）：
   - 发送消息后必须等到 AI 真实回复文本
   - 若 AI 返回 500 / 超时 / fallback 文案，属于"功能不可用"，不是"部署成功"
   - 上游 AI 响应慢（>10s）需在报告中明确说明，不能隐瞒

## 禁止行为

- ❌ 禁止只 `curl` 检查 HTTP 200 就说"部署成功"
- ❌ 禁止只看 `wrangler pages deploy` 输出就说"部署成功"
- ❌ 禁止在未运行 verify-deploy.py 的情况下报告成功
- ❌ 禁止忽略验证脚本的 `✗` 失败项
- ❌ 禁止把"上游 AI 超时"粉饰为"部署成功"

## 报告规范

报告部署状态时必须包含：
- verify-deploy.py 的实际输出摘要
- AI 聊天是否真实返回回复（附回复文本片段）
- 任何失败项及已采取的修复措施

若验证失败，必须先修复再重新部署+重新验证，不得在未通过验证时声称成功。
<!-- END:deploy-verification-rules -->

<!-- BEGIN:icon-spec-rules -->
# 图标规范（MANDATORY）

> 规则：所有 UI 图标必须使用 SVG 组件，禁止使用 emoji 表情包图标。

## 强制要求

1. **禁止 emoji 图标**：任何 JSX/TSX 中不得用 emoji（如 🔥📚🎯🛡️⚡✅⬜ 等）作为功能图标。
   - emoji 在不同系统渲染不一致、无法随主题配色、无障碍语义差，不符合产品品质标准。
2. **统一 SVG 来源**：
   - 通用 UI 图标 → `@/components/ui/icons`（Lucide 风格 stroke icon，`stroke="currentColor"`，继承父级文本色，`className` 控制尺寸/颜色）。
   - 徽章勋章图标 → `@/components/gamification/badge-icon` 的 `BadgeIcon` 组件（切面宝石勋章，产品视觉签名）。
3. **徽章图标数据层**：`lib/gamification/badges.ts` 的 `BadgeRule.icon` 字段存的是 **icon key 字符串**（如 `"flame"`、`"target"`、`"keyhole"`），不是 emoji；由 `BadgeIcon` 据 key 渲染对应 glyph。
4. **新增图标**：若现有 SVG 集缺图，在 `components/ui/icons.tsx` 内新增组件（`Base` + `stroke="currentColor"`），不得退回 emoji。

## 禁止行为

- ❌ 禁止在 JSX 中写 `<span>🔥</span>` 这类 emoji 图标
- ❌ 禁止把 emoji 存入 `BadgeRule.icon`
- ❌ 禁止绕过 `icons.tsx` / `BadgeIcon` 自行内联其他来源的图标而不遵守 stroke 规范

## 例外

- 用户输入内容、AI 回复正文、数据内容（如词典释义）中的字符不属于 UI 图标，不受本规范约束。
<!-- END:icon-spec-rules -->
