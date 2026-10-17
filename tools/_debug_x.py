import asyncio
import os
from playwright.async_api import async_playwright

ROOT = r"C:\Users\onlyo\WorkBuddy\X-AI-replay"
AUTH_TOKEN = os.environ.get("X_AUTH_TOKEN", "")
CT0 = os.environ.get("X_CT0", "")


async def main():
    async with async_playwright() as p:
        ctx = await p.chromium.launch_persistent_context("", headless=True, channel="chromium",
            args=["--headless=new", "--no-sandbox", "--disable-features=PrivateNetworkAccess",
                  "--proxy-bypass-list=127.0.0.1;localhost"])
        await ctx.clear_cookies()
        await ctx.add_cookies([
            {"name": "auth_token", "value": AUTH_TOKEN, "domain": ".x.com", "path": "/", "secure": True, "httpOnly": True, "sameSite": "None"},
            {"name": "ct0", "value": CT0, "domain": ".x.com", "path": "/", "secure": True, "httpOnly": False, "sameSite": "None"},
        ])
        page = await ctx.new_page()
        page.on("console", lambda m: print("PAGE", m.type, m.text[:200]))
        page.on("pageerror", lambda e: print("PAGEERR", str(e)[:200]))
        await page.goto("https://x.com/home", wait_until="domcontentloaded")
        await page.wait_for_timeout(10000)
        info = await page.evaluate("""() => ({
            url: location.href,
            title: document.title,
            tweets: document.querySelectorAll('article[data-testid="tweet"]').length,
            floatBtn: !!document.querySelector('button.xai-float'),
            bodyLen: document.body ? document.body.innerText.length : 0,
            snippet: (document.body ? document.body.innerText.slice(0,300) : '')
        })""")
        print("INFO:", info)
        await page.screenshot(path=os.path.join(ROOT, "dev", "_debug_x.png"))
        print("screenshot saved")
        await ctx.close()


asyncio.run(main())
