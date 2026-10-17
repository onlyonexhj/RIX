"""以分离进程方式拉起录制专用 Chrome（非默认 profile，已带扩展），并开调试端口。
Chrome 进程独立于本脚本存活；脚本结束不影响它。
启动后请在弹出的窗口里登录 X，然后回到对话里告诉我登录好了。
"""
import asyncio
import json
import os
import re
import socket
import subprocess
import time

CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
PROFILE = r"C:\Users\onlyo\WorkBuddy\X-AI-replay\.rec-profile"
PORT = 9223
WIN = "1600,900"

os.environ["NO_PROXY"] = "127.0.0.1,localhost"
os.environ["no_proxy"] = "127.0.0.1,localhost"
for k in ("HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy", "ALL_PROXY", "all_proxy"):
    os.environ.pop(k, None)

from playwright.async_api import async_playwright


def wait_port(p=PORT, tries=60):
    for _ in range(tries):
        try:
            with socket.create_connection(("127.0.0.1", p), timeout=1):
                return True
        except OSError:
            time.sleep(0.3)
    return False


async def main():
    subprocess.run(["taskkill", "/IM", "chrome.exe", "/F"],
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(2)

    args = [
        CHROME, f"--user-data-dir={PROFILE}", f"--remote-debugging-port={PORT}",
        "--no-first-run", "--no-default-browser-check",
        f"--window-size={WIN}", "--start-maximized",
        "https://x.com/home",
    ]
    subprocess.Popen(
        args,
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        creationflags=subprocess.DETACHED_PROCESS | subprocess.CREATE_NEW_PROCESS_GROUP,
    )
    print("launching Chrome ...")
    if not wait_port():
        print("ERROR: port 9223 not up")
        return 1

    await asyncio.sleep(2)
    async with async_playwright() as p:
        browser = await p.chromium.connect_over_cdp(f"http://127.0.0.1:{PORT}")
        ctx = browser.contexts[0]
        ext_id = None
        for sw in ctx.service_workers + ctx.background_pages:
            m = re.search(r"chrome-extension://([a-p]{32})/", sw.url)
            if m:
                ext_id = m.group(1)
                break
        print("ext_id:", ext_id)

        # 就地验证 SW 请求拦截（xai:test 会触发 SW 内部 fetch）
        async def handler(route, request):
            await route.fulfill(
                status=200, content_type="application/json",
                body=json.dumps({"choices": [{"message": {"content": '["拦截测试通过"]'}}]}),
            )
        await ctx.route("**/chat/completions", handler)
        page = await ctx.new_page()
        await page.goto(f"chrome-extension://{ext_id}/src/options/options.html")
        await page.wait_for_timeout(1500)
        await page.evaluate(
            """() => new Promise((res) => {
                chrome.storage.local.set({xai_config: {
                    enabled:true, provider:'openai',
                    baseUrl:'https://xai-mock.local/v1', apiKey:'sk-dummy',
                    model:'glm-4.6', stream:true, proxyMode:'auto',
                    count:3, style:'humor', length:'medium', lang:'zh',
                    maxTokens:4000, disableThinking:true, temperature:1
                }}, res);
            })"""
        )
        await page.wait_for_timeout(400)
        result = await page.evaluate(
            "() => new Promise((res) => chrome.runtime.sendMessage({type:'xai:test'}, (r) => res(r)))"
        )
        print("intercept test:", result)
        # 打开 X 登录页（不要关闭浏览器）
        await page.goto("https://x.com/home", timeout=20000)
        await page.wait_for_timeout(2000)

        # 注意：不要 browser.close()，否则会关掉整个 Chrome。
    print("")
    print(">>> Chrome is ready (window open).")
    print(">>> Log in to X in that window (one time; session is saved).")
    print(">>> After login, tell me 'done' and I will start recording.")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
