"""在真实（UI 安装的）扩展上验证：Playwright route 能否拦截 SW 的 AI 请求。
连上已经在跑的录制 Chrome（端口 9223），用 xai:test 触发 SW 内部 fetch，
看 mock 是否生效。无需 X 登录。
"""
import asyncio
import json
import os

PORT = 9223
EXT_ID = "fignfifoniblkonapihmkfakmlgkbkcf"

os.environ["NO_PROXY"] = "127.0.0.1,localhost"
os.environ["no_proxy"] = "127.0.0.1,localhost"
for k in ("HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy", "ALL_PROXY", "all_proxy"):
    os.environ.pop(k, None)

from playwright.async_api import async_playwright


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.connect_over_cdp(f"http://127.0.0.1:{PORT}")
        ctx = browser.contexts[0]

        async def handler(route, request):
            body = {"choices": [{"message": {"content": '["拦截测试通过：示例回复"]'}}]}
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
    return 0 if (result and result.get("ok")) else 2


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
