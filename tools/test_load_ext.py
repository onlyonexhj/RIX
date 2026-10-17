"""测试：用 --load-extension 加载纯扩展目录 + 关闭内容校验标志，options.html 能否打开。"""
import asyncio
import json
import os
import re
import shutil
import subprocess
import sys
import time

from playwright.async_api import async_playwright

ROOT = r"C:\Users\onlyo\WorkBuddy\X-AI-replay"
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
EXT_DIR = os.path.join(ROOT, ".rec-ext")
TEST_PROFILE = os.path.join(ROOT, ".rec-profile-test")


def find_ext_id(profile):
    ext_dir = os.path.join(profile, "Default", "Extensions")
    found = []
    if not os.path.isdir(ext_dir):
        return None, []
    for name in os.listdir(ext_dir):
        if not re.match(r"[a-p]{32}", name):
            continue
        for root, _, files in os.walk(os.path.join(ext_dir, name)):
            if "manifest.json" in files:
                try:
                    m = json.load(open(os.path.join(root, "manifest.json"), encoding="utf-8"))
                    found.append((name, m.get("name", "?")))
                    if "回复" in m.get("name", "") or "X AI" in m.get("name", ""):
                        return name, found
                except Exception:
                    pass
    return None, found


async def main():
    if os.path.isdir(TEST_PROFILE):
        shutil.rmtree(TEST_PROFILE)
    subprocess.run(["powershell", "-NoProfile", "-Command",
                   "Get-CimInstance Win32_Process -Filter \"Name='chrome.exe'\" | "
                   "Where-Object { $_.CommandLine -like '*rec-profile-test*' } | "
                   "ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"],
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(1)

    async with async_playwright() as p:
        ctx = await p.chromium.launch_persistent_context(
            user_data_dir=TEST_PROFILE,
            executable_path=CHROME,
            headless=False,
            viewport={"width": 1280, "height": 800},
            args=["--load-extension=" + EXT_DIR,
                  "--disable-extension-content-verification",
                  "--disable-features=ExtensionContentVerification",
                  "--proxy-bypass-list=127.0.0.1;localhost",
                  "--window-size=1280,800"],
        )
        ext_id, names = find_ext_id(TEST_PROFILE)
        print("ext_id:", ext_id)
        print("all extension names:", names)
        if ext_id:
            page = await ctx.new_page()
            try:
                await page.goto(f"chrome-extension://{ext_id}/src/options/options.html", wait_until="load", timeout=10000)
                print("options.html title:", await page.title())
                print("options OK")
            except Exception as e:
                print("options FAILED:", repr(e)[:200])
        await ctx.close()
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
