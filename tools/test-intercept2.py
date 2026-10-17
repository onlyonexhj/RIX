"""验证 connect_over_cdp 架构下，SW 发出的 AI 请求能否被 Playwright route 拦截。
若 xai:test 返回 ok => 录制方案完全可行。
"""
import asyncio
import json
import os
import re
import shutil
import socket
import subprocess
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROFILE = os.path.join(ROOT, ".wb-browser")
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
PORT = 9223

os.environ["NO_PROXY"] = "127.0.0.1,localhost"
os.environ["no_proxy"] = "127.0.0.1,localhost"
for k in ("HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy", "ALL_PROXY", "all_proxy"):
    os.environ.pop(k, None)

from playwright.async_api import async_playwright

EXT_ID = "fignfifoniblkonapihmkfakmlgkbkcf"


async def main():
    if os.path.isdir(PROFILE):
        shutil.rmtree(PROFILE)
    args = [
        CHROME, f"--user-data-dir={PROFILE}", f"--load-extension={ROOT}",
        f"--disable-extensions-except={ROOT}", f"--remote-debugging-port={PORT}",
        "--no-first-run", "--no-default-browser-check", "--new-window", "about:blank",
    ]
    proc = subprocess.Popen(args, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for _ in range(40):
        try:
            with socket.create_connection(("127.0.0.1", PORT), timeout=1):
                break
        except OSError:
            time.sleep(0.25)
    time.sleep(1.5)

    async with async_playwright() as p:
        browser = await p.chromium.connect_over_cdp(f"http://127.0.0.1:{PORT}")
        ctx = browser.contexts[0]

        async def handler(route, request):
            body = {"choices": [{"message": {"content": '["测试通过：这是一条示例回复"]'}}]}
            await route.fulfill(status=200, content_type="application/json",
                               body=json.dumps(body))
        await ctx.route("**/chat/completions", handler)

        page = await ctx.new_page()
        await page.goto(f"chrome-extension://{EXT_ID}/src/options/options.html")
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
        print("test result:", result)
        await browser.close()

    proc.terminate()
    return 0 if (result and result.get("ok")) else 2


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
