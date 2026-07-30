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
        browser = p.chromium.launch(headless=True, channel="chromium")
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
    #    用精确 aria-label 定位主对话面板（避免多 dialog 干扰）
    #    状态机：等 sending 动画出现 → 等 sending 消失 → 取最后一条 assistant 消息
    try:
        input_el = page.locator('input[aria-label="AI 助手输入框"]')
        if input_el.count() == 0:
            input_el = page.locator('textarea[aria-label="AI 助手输入框"]')
        step("输入框存在", input_el.count() > 0, f"找到 {input_el.count()} 个")

        # 精确定位主对话面板（aria-label="AI 助手对话"）
        dialog = page.locator('[role="dialog"][aria-label="AI 助手对话"]')
        # assistant 消息容器用 items-start（flex-col），user 消息用 items-end
        assistant_bubbles_before = dialog.locator('div.flex-col.items-start').count()

        input_el.first.fill("hello")
        send_btn = page.locator('button:has-text("发送")')
        if send_btn.count() == 0:
            send_btn = page.locator('button[type="submit"]')
        step("发送按钮存在", send_btn.count() > 0, f"找到 {send_btn.count()} 个")

        if send_btn.count() > 0:
            send_btn.first.click()
            # 状态机等待：sending 动画 = span.animate-pulse（●●●）
            start = time.time()
            reply = None
            sending_pulse = dialog.locator('span.animate-pulse')
            phase = "wait_sending"  # 先确认请求发出（动画出现）
            for _ in range(70):  # 最多 70s
                page.wait_for_timeout(1000)
                pulse_count = sending_pulse.count()
                if phase == "wait_sending":
                    if pulse_count > 0:
                        phase = "wait_reply"  # 请求已发出，等回复
                elif phase == "wait_reply":
                    # sending 动画消失 = 回复到达或出错
                    if pulse_count == 0:
                        bubbles = dialog.locator('div.flex-col.items-start')
                        if bubbles.count() > assistant_bubbles_before:
                            last_text = bubbles.last.inner_text().strip()
                            # 排除 sending 残留（含 ●）和用户消息
                            if last_text and "●" not in last_text and last_text.lower() != "hello":
                                reply = last_text
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
