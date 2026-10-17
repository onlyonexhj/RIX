"""
探测「录制专用 Chrome」的当前状态：
  - 打开的标签页
  - X 是否已登录
  - 扩展 service worker 是否注册成功
  - 视口尺寸
  - 当前页面截图（供人工确认）
"""
import asyncio
import json
import os
import sys

# 必须在 import playwright 之前设置：
# 用户机器上跑着系统代理（VPN），会把 127.0.0.1 的请求劫持成 502。
# Node 驱动进程继承这些环境变量，才能直连 CDP 端口。
os.environ["NO_PROXY"] = "127.0.0.1,localhost"
os.environ["no_proxy"] = "127.0.0.1,localhost"
for k in ("HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy",
          "ALL_PROXY", "all_proxy"):
    os.environ.pop(k, None)

from playwright.async_api import async_playwright  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WORK = os.path.join(ROOT, "dev", "_video")
os.makedirs(WORK, exist_ok=True)

CDP = "http://127.0.0.1:9222"


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.connect_over_cdp(CDP)
        ctx = browser.contexts[0] if browser.contexts else None
        if ctx is None:
            print("没有浏览器上下文")
            return 1

        # 1) 扩展 service worker（证明扩展加载成功）
        sws = ctx.service_workers
        print("service workers:", len(sws))
        for s in sws:
            print("  ", s.url)

        # 2) 标签页列表
        pages = ctx.pages
        print("\n标签页:")
        xpage = None
        for pg in pages:
            print("  ", pg.url[:90])
            if "x.com" in pg.url or "twitter.com" in pg.url:
                xpage = pg

        if xpage is None:
            print("\n未找到 x.com 标签页")
            await browser.close()
            return 1

        # 3) 视口与登录态
        vp = xpage.viewport_size
        print("\n视口:", vp)

        await xpage.bring_to_front()
        await xpage.wait_for_timeout(800)

        state = await xpage.evaluate("""() => {
            const loggedIn = !!document.querySelector('[data-testid="SideNav_AccountSwitcher_Button"]')
                          || !!document.querySelector('a[href="/settings"]')
                          || !!document.querySelector('[data-testid="AppTabBar_Profile_Link"]');
            const tweets = document.querySelectorAll('article[data-testid="tweet"]').length;
            const replyBtns = document.querySelectorAll('[data-testid="reply"]').length;
            // 扩展的悬浮按钮 / 面板是否存在（content script 注入成功的旁证）
            const floatBtn = !!document.querySelector('.xai-float');
            return { loggedIn, tweets, replyBtns, floatBtn,
                     title: document.title, url: location.href };
        }""")
        print("登录态:", state)

        # 4) 截图供人工确认
        out = os.path.join(WORK, "probe.png")
        await xpage.screenshot(path=out)
        print("\n截图 ->", out)

        await browser.close()
        return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
