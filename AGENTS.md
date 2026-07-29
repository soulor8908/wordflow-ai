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
