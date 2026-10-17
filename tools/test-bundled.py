"""测试 Playwright 自带 Chromium 能否加载解压扩展（不带 except 标志）。"""
import asyncio
import os
import re
import shutil
import socket
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROFILE = os.path.join(ROOT, ".wb-bundle")

os.environ["NO_PROXY"] = "127.0.0.1,localhost"
os.environ["no_proxy"] = "127.0.0.1,localhost"
for k in ("HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy", "ALL_PROXY", "all_proxy"):
    os.environ.pop(k, None)

from playwright.async_api import async_playwright


async def main():
    if os.path.isdir(PROFILE):
        shutil.rmtree(PROFILE)
    async with async_playwright() as p:
        ctx = await p.chromium.launch_persistent_context(
            user_data_dir=PROFILE, headless=False,
            args=["--load-extension=" + ROOT, "--no-first-run", "--no-default-browser-check"],
        )
        page = await ctx.new_page()
        # 取扩展 id
        ext_id = None
        for sw in ctx.service_workers + ctx.background_pages:
            m = re.search(r"chrome-extension://([a-p]{32})/", sw.url)
            if m:
                ext_id = m.group(1); break
        print("ext_id:", ext_id)
        if ext_id:
            try:
                await page.goto(f"chrome-extension://{ext_id}/src/options/options.html", timeout=8000)
                print("options.html OK, title:", await page.title())
            except Exception as e:
                print("options.html FAIL:", repr(e)[:120])
        await ctx.close()
    return 0


if __name__ == "__main__":
    asyncio.run(main())
