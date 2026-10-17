"""最小验证：Playwright 能否拦截 service worker 发出的 AI 请求。

做法：
  - 用持久上下文拉起系统 Chrome（加载我们的扩展 + 独立配置目录）
  - 把扩展配置指向 https://xai-mock.local/v1（一个根本不存在的域名）
  - 用 context.route 拦截 **/chat/completions，回放一份 OpenAI 非流式响应
  - 在设置页调用 xai:test（该消息会在 SW 内 fetch 这个地址）
  - 若返回 ok => SW 的 fetch 也被 Playwright 拦截 => 录制方案可行
"""
import asyncio
import json
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROFILE = os.path.join(ROOT, ".wb-browser")
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"

from playwright.async_api import async_playwright


async def main():
    async with async_playwright() as p:
        ctx = await p.chromium.launch_persistent_context(
            user_data_dir=PROFILE,
            executable_path=CHROME,
            headless=False,
            args=[
                "--load-extension=" + ROOT,
                "--disable-extensions-except=" + ROOT,
                "--no-first-run",
                "--no-default-browser-check",
            ],
        )

        # 找扩展 ID：用 CDP Target.getTargets（轮询等 SW 目标出现）
        page0 = await ctx.new_page()
        client = await ctx.new_cdp_session(page0)
        ext_id = None
        for _ in range(40):
            targets = (await client.send("Target.getTargets"))["targetInfos"]
            for t in targets:
                m = re.search(r"chrome-extension://([a-p]{32})/", t.get("url", ""))
                if m:
                    ext_id = m.group(1)
                    break
            if ext_id:
                break
            await asyncio.sleep(0.25)
        print("ext_id:", ext_id)
        if not ext_id:
            print("--- all targets ---")
            for t in targets:
                print("  ", t.get("type"), t.get("url", "")[:80])
            await ctx.close()
            return 3

        # 拦截 AI 请求
        async def handler(route, request):
            # 非流式：OpenAI 标准响应
            body = {
                "choices": [{"message": {"content": '["测试通过：这是一条示例回复"]'}}]
            }
            await route.fulfill(
                status=200,
                content_type="application/json",
                body=json.dumps(body),
            )

        await ctx.route("**/chat/completions", handler)

        # 打开设置页，写配置 + 触发测试
        page = await ctx.new_page()
        await page.goto(f"chrome-extension://{ext_id}/src/options/options.html")
        await page.wait_for_timeout(1500)

        await page.evaluate(
            """() => new Promise((res) => {
                chrome.storage.local.set({xai_config: {
                    enabled:true, provider:'openai',
                    baseUrl:'https://xai-mock.local/v1',
                    apiKey:'sk-dummy-test', model:'glm-4.6',
                    stream:true, proxyMode:'auto', count:3,
                    style:'humor', length:'medium', lang:'zh',
                    maxTokens:4000, disableThinking:true, temperature:1
                }}, res);
            })"""
        )
        await page.wait_for_timeout(500)

        result = await page.evaluate(
            """() => new Promise((res) => {
                chrome.runtime.sendMessage({type:'xai:test'}, (r) => res(r));
            })"""
        )
        print("test result:", result)

        await ctx.close()
        return 0 if (result and result.get("ok")) else 2


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
