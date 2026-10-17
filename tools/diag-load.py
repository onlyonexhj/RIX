import asyncio
import os
import re
import shutil
import socket
import subprocess
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROFILE = os.path.join(ROOT, ".wb-browser")
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
PORT = 9224
LOG = os.path.join(ROOT, "dev", "_video", "chrome.log")
os.makedirs(os.path.dirname(LOG), exist_ok=True)

os.environ["NO_PROXY"] = "127.0.0.1,localhost"
os.environ["no_proxy"] = "127.0.0.1,localhost"
for k in ("HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy", "ALL_PROXY", "all_proxy"):
    os.environ.pop(k, None)

from playwright.async_api import async_playwright

EXT_ID = "fignfifoniblkonapihmkfakmlgkbkcf"


def safe_rmtree(path):
    if not os.path.isdir(path):
        return
    for root, dirs, files in os.walk(path, topdown=False):
        for f in files:
            try: os.remove(os.path.join(root, f))
            except OSError: pass
        for d in dirs:
            try: os.rmdir(os.path.join(root, d))
            except OSError: pass
    try: os.rmdir(path)
    except OSError: pass


async def main():
    if os.path.isdir(PROFILE):
        safe_rmtree(PROFILE)
    args = [
        CHROME, f"--user-data-dir={PROFILE}", f"--load-extension={ROOT}",
        f"--remote-debugging-port={PORT}",
        "--disable-extension-content-verification",
        "--disable-features=ExtensionContentVerification",
        "--no-first-run", "--no-default-browser-check",
        "--new-window", "about:blank",
    ]
    logf = open(LOG, "w", encoding="utf-8")
    proc = subprocess.Popen(args, stdout=logf, stderr=subprocess.STDOUT)
    for _ in range(40):
        try:
            with socket.create_connection(("127.0.0.1", PORT), timeout=1):
                break
        except OSError:
            time.sleep(0.25)
    time.sleep(3)

    async with async_playwright() as p:
        browser = await p.chromium.connect_over_cdp(f"http://127.0.0.1:{PORT}")
        ctx = browser.contexts[0]
        page = await ctx.new_page()
        for path in ["manifest.json", "src/options/options.html", "src/background/service-worker.js"]:
            try:
                await page.goto(f"chrome-extension://{EXT_ID}/{path}", timeout=8000)
                print(f"{path} OK, title:", await page.title())
            except Exception as e:
                print(f"{path} FAIL:", repr(e)[:120])
        targets = (await (await ctx.new_cdp_session(page)).send("Target.getTargets"))["targetInfos"]
        print("--- extension-like targets ---")
        for t in targets:
            u = t.get("url", "")
            if "chrome-extension" in u or "extension" in u.lower():
                print("  ", t.get("type"), u[:90])
        await browser.close()
    proc.terminate()
    # grep log
    print("--- chrome.log (extension related) ---")
    try:
        with open(LOG, encoding="utf-8", errors="ignore") as f:
            for line in f:
                if "extension" in line.lower() and ("x-ai" in line.lower() or "load" in line.lower() or "error" in line.lower() or ROOT.split("/")[-1].lower() in line.lower()):
                    print("  ", line.rstrip()[:200])
    except Exception as e:
        print("log read err", e)


if __name__ == "__main__":
    asyncio.run(main())
