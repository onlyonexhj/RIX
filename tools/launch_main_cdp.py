"""重启用户主 Chrome（默认 profile）并开启 CDP 调试端口，复用已安装的扩展与 X 登录。
Python 持有该进程，避免自行退出。
"""
import asyncio
import os
import re
import socket
import subprocess
import time

CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
PROFILE = r"C:\Users\onlyo\WorkBuddy\X-AI-replay\.rec-profile"
PORT = 9223

os.environ["NO_PROXY"] = "127.0.0.1,localhost"
os.environ["no_proxy"] = "127.0.0.1,localhost"
for k in ("HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy", "ALL_PROXY", "all_proxy"):
    os.environ.pop(k, None)

from playwright.async_api import async_playwright


async def main():
    # 复用已复制的默认 profile（非默认目录，可开调试端口；扩展与 X 登录已带过来）
    args = [
        CHROME, f"--user-data-dir={PROFILE}", f"--remote-debugging-port={PORT}",
        "--no-first-run", "--no-default-browser-check",
        "--new-window", "about:blank",
    ]
    proc = subprocess.Popen(args, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    print("launched pid:", proc.pid)
    for _ in range(50):
        try:
            with socket.create_connection(("127.0.0.1", PORT), timeout=1):
                break
        except OSError:
            time.sleep(0.3)
    time.sleep(2)

    async with async_playwright() as p:
        browser = await p.chromium.connect_over_cdp(f"http://127.0.0.1:{PORT}")
        ctx = browser.contexts[0]

        # 找扩展 id（看是否装了我们的扩展）
        ext_id = None
        for sw in ctx.service_workers + ctx.background_pages:
            if "options.html" in sw.url or "service-worker" in sw.url or "X AI" in sw.url:
                m = re.search(r"chrome-extension://([a-p]{32})/", sw.url)
                if m:
                    ext_id = m.group(1)
                    break
        if not ext_id:
            targets = (await (await ctx.new_cdp_session(await ctx.new_page())).send("Target.getTargets"))["targetInfos"]
            for t in targets:
                if "chrome-extension" in t.get("url", ""):
                    print("  ext target:", t.get("url", "")[:90])
        print("our ext_id:", ext_id)

        if ext_id:
            page = await ctx.new_page()
            try:
                await page.goto(f"chrome-extension://{ext_id}/src/options/options.html", timeout=8000)
                print("options.html OK, title:", await page.title())
            except Exception as e:
                print("options.html FAIL:", repr(e)[:120])

        # 检查 X 登录
        xpage = await ctx.new_page()
        await xpage.goto("https://x.com/home", timeout=20000)
        await xpage.wait_for_timeout(3000)
        logged = await xpage.evaluate("""() => !!document.querySelector('[data-testid="SideNav_AccountSwitcher_Button"]') || !!document.querySelector('a[href="/settings"]')""")
        print("X 已登录:", logged, " url:", xpage.url)

        await browser.close()

    proc.terminate()
    print("done")
    return 0


if __name__ == "__main__":
    asyncio.run(main())
