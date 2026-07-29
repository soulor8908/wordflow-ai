#!/usr/bin/env python3
"""
部署后前端 UI 自动化验证（强制约束：部署必须通过此脚本验证才能报告成功）

验证项：
  1. 首页可访问且渲染出 AI 助手悬浮按钮
  2. 点击悬浮按钮打开聊天面板
  3. 输入消息并发送，等待 AI 回复
  4. 收集 console 日志和页面错误

用法：
  python3 scripts/verify-deploy.py [URL]
  默认 URL: https://wordflow-ai.pages.dev/

退出码：
  0 = 全部通过
  1 = 有失败项
"""
import sys
import time

try:
    from playwright.sync_api import sync_playwright
except ImportError:
    print("✗ playwright 未安装，请运行: pip install playwright && playwright install chromium")
    sys.exit(1)

URL = sys.argv[1] if len(sys.argv) > 1 else "https://wordflow-ai.pages.dev/"

results = []
logs = []
errors = []


def step(name, ok, detail=""):
    results.append((name, ok, detail))
    mark = "✓" if ok else "✗"
    print(f"  {mark} {name}" + (f"：{detail}" if detail else ""))


with sync_playwright() as p:
    try:
        browser = p.chromium.launch(headless=True)
    except Exception as e:
        print(f"✗ 无法启动 chromium：{e}")
        print("  请运行: playwright install chromium")
        sys.exit(1)

    context = browser.new_context(viewport={"width": 1280, "height": 800})
    page = context.new_page()

    page.on("console", lambda msg: logs.append(f"[{msg.type}] {msg.text}"))
    page.on("pageerror", lambda err: errors.append(str(err)))

    print(f"▸ 验证部署：{URL}")

    # 1. 访问首页（用 networkidle 确保 hydration 完成，避免按钮偶发找不到）
    try:
        page.goto(URL, wait_until="networkidle", timeout=45000)
        page.wait_for_timeout(3000)  # 等待 React hydration 完成
        step("首页可访问", True, f"readyState={page.evaluate('document.readyState')}")
    except Exception as e:
        step("首页可访问", False, str(e)[:100])
        browser.close()
        print("\n✗ 验证失败：首页无法访问")
        sys.exit(1)

    # 2. 验证 AI 助手悬浮按钮存在
    fab = page.locator('button[aria-label="打开 AI 助手"], button[aria-label="关闭 AI 助手"]')
    fab_count = fab.count()
    step("AI 助手悬浮按钮存在", fab_count > 0, f"找到 {fab_count} 个")

    if fab_count == 0:
        # 截图留证并尝试其他选择器
        page.screenshot(path="/workspace/tmp-verify-home.png", full_page=True)
        print("\n  页面截图已保存：tmp-verify-home.png")
        print("  页面可见按钮：", [b.get_attribute("aria-label") or b.inner_text()[:20] for b in page.locator("button").all()[:10]])
        browser.close()
        print("\n✗ 验证失败：未找到 AI 助手按钮")
        sys.exit(1)

    # 3. 点击悬浮按钮打开聊天面板
    try:
        fab.first.click()
        page.wait_for_timeout(1500)
        dialog = page.locator('[role="dialog"]')
        dialog_count = dialog.count()
        step("聊天面板打开", dialog_count > 0, f"dialog 数量 {dialog_count}")
    except Exception as e:
        step("聊天面板打开", False, str(e)[:100])
        browser.close()
        print("\n✗ 验证失败：聊天面板未打开")
        sys.exit(1)

    # 4. 输入并发送消息，等待 AI 回复
    #    assistant 消息渲染为 justify-start + bg-neutral-100 气泡（见 ai-assistant.tsx）
    #    sending 时显示 ●●● 动画，结束后 assistant 气泡出现
    try:
        input_el = page.locator('input[aria-label="AI 助手输入框"]')
        if input_el.count() == 0:
            input_el = page.locator('textarea[aria-label="AI 助手输入框"]')
        step("输入框存在", input_el.count() > 0, f"找到 {input_el.count()} 个")

        # 发送前统计 assistant 气泡数量（justify-start 的消息行）
        dialog = page.locator('[role="dialog"]').first
        assistant_bubbles_before = dialog.locator('div.justify-start').count()

        input_el.first.fill("hello")
        send_btn = page.locator('button:has-text("发送")')
        if send_btn.count() == 0:
            send_btn = page.locator('button[type="submit"]')
        step("发送按钮存在", send_btn.count() > 0, f"找到 {send_btn.count()} 个")

        if send_btn.count() > 0:
            send_btn.first.click()
            # 等待 AI 回复（上游 agnes 响应约 15s，给 45 秒）
            start = time.time()
            reply = None
            for _ in range(45):
                page.wait_for_timeout(1000)
                # assistant 气泡数量增加 = 收到回复
                now_count = dialog.locator('div.justify-start').count()
                if now_count > assistant_bubbles_before:
                    last = dialog.locator('div.justify-start').last
                    txt = last.inner_text().strip()
                    if txt:
                        reply = txt
                        break
            elapsed = time.time() - start
            step("AI 回复收到", reply is not None, f"耗时 {elapsed:.1f}s，回复：{(reply or '无')[:60]}")
    except Exception as e:
        step("AI 聊天交互", False, str(e)[:100])

    # 5. 截图留证
    page.screenshot(path="/workspace/tmp-verify-chat.png", full_page=True)
    print("  截图已保存：tmp-verify-chat.png")

    # 6. console 错误统计
    err_logs = [l for l in logs if l.startswith("[error]")]
    step("无 console 错误", len(err_logs) == 0, f"{len(err_logs)} 条 error 日志")
    step("无页面异常", len(errors) == 0, f"{len(errors)} 个 pageerror")
    if err_logs:
        for l in err_logs[:5]:
            print(f"    {l[:150]}")
    if errors:
        for e in errors[:5]:
            print(f"    pageerror: {e[:150]}")

    browser.close()

# 汇总
print("\n" + "=" * 50)
failed = [r for r in results if not r[1]]
if not failed:
    print("✓ 部署验证全部通过")
    sys.exit(0)
else:
    print(f"✗ 验证失败 {len(failed)} 项：")
    for name, _, detail in failed:
        print(f"    - {name}: {detail}")
    sys.exit(1)
