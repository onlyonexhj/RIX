"""启动录制浏览器（.rec-profile，扩展已安装）并注入 X 登录 cookie。

不调用 browser.close()，Chrome 作为独立进程存活，供后续录制连接。
"""
import asyncio
import os
import socket
import subprocess
import sys
import time

CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
PROFILE = r"C:\Users\onlyo\WorkBuddy\X-AI-replay\.rec-profile"
PORT = 9223
ROOT = r"C:\Users\onlyo\WorkBuddy\X-AI-replay"

AUTH_TOKEN = os.environ.get("X_AUTH_TOKEN", "")
CT0 = os.environ.get("X_CT0", "")

os.environ["NO_PROXY"] = "127.0.0.1,localhost"
os.environ["no_proxy"] = "127.0.0.1,localhost"
for k in ("HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy", "ALL_PROXY", "all_proxy"):
    os.environ.pop(k, None)


def port_open(p):
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        return s.connect_ex(("127.0.0.1", p)) == 0
    finally:
        s.close()


async def main():
    # 1) 清掉占用 rec-profile 的残留 chrome
    subprocess.run(["taskkill", "/IM", "chrome.exe", "/F"],
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(2)
    for f in (os.path.join(PROFILE, "SingletonLock"),
              os.path.join(PROFILE, "Default", "SingletonLock")):
        try:
            os.remove(f)
        except OSError:
            pass

    # 2) 启动录制浏览器（不传 --load-extension：扩展已装在 profile 里，避免校验 bug）
    args = [
        CHROME, f"--user-data-dir={PROFILE}", f"--remote-debugging-port={PORT}",
        "--no-first-run", "--no-default-browser-check",
        "--window-size=1366,900",
        "--new-window", "about:blank",
    ]
    subprocess.Popen(args, creationflags=0x00000200 | 0x00000800)  # DETACHED | NEW_PROCESS_GROUP

    # 3) 等端口
    for _ in range(40):
        if port_open(PORT):
            break
        await asyncio.sleep(0.5)
    else:
        print("ERROR: 调试端口未起来")
        return 1

    # 4) 连接并注入 cookie
    from playwright.async_api import async_playwright
    async with async_playwright() as p:
        browser = await p.chromium.connect_over_cdp(f"http://127.0.0.1:{PORT}")
        ctx = browser.contexts[0]

        cookies = [
            {"name": "auth_token", "value": AUTH_TOKEN, "domain": ".x.com",
             "path": "/", "secure": True, "httpOnly": True, "sameSite": "None"},
            {"name": "ct0", "value": CT0, "domain": ".x.com",
             "path": "/", "secure": True, "httpOnly": False, "sameSite": "None"},
        ]
        await ctx.add_cookies(cookies)
        print("injected cookies:", [c["name"] for c in cookies])

        # 5) 打开 x.com 并验证登录
        page = await ctx.new_page()
        await page.goto("https://x.com/home", wait_until="domcontentloaded", timeout=30000)
        await page.wait_for_timeout(4000)
        url = page.url
        logged_in = await page.evaluate(
            "() => !!document.querySelector('[data-testid=\"SideNav_AccountSwitcher_Button\"]') "
            "|| !!document.querySelector('[data-testid=\"primaryColumn\"]')")
        login_btn = await page.evaluate(
            "() => !!document.querySelector('a[href=\"/login\"]') || !!document.querySelector('[data-testid=\"LoginForm_Login_Button\"]')")
        print("final url:", url)
        print("logged_in(home/timeline present):", logged_in)
        print("login_button_present:", login_btn)
        print("RESULT:", "OK 已登录" if (logged_in and not login_btn) else "未登录，需补充 cookie")

        # 不关闭浏览器，保持存活供录制
        await page.context.close()
        # 注意：不要 browser.close()
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
