"""诊断 + 加载：用子进程拉起系统 Chrome（带扩展 + 调试端口），
Python 持有该进程，避免之前 Start-Process 脱离后 Chrome 自行退出。
连上 CDP 后打印扩展 ID 与所有目标，验证扩展确实加载。
"""
import asyncio
import os
import re
import shutil
import subprocess
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROFILE = os.path.join(ROOT, ".wb-browser")
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
PORT = 9223

# 绕过系统代理对 localhost 的劫持
os.environ["NO_PROXY"] = "127.0.0.1,localhost"
os.environ["no_proxy"] = "127.0.0.1,localhost"
for k in ("HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy", "ALL_PROXY", "all_proxy"):
    os.environ.pop(k, None)

from playwright.async_api import async_playwright


async def main():
    # 清掉可能损坏的旧配置
    if os.path.isdir(PROFILE):
        shutil.rmtree(PROFILE)
        print("已清理旧 profile:", PROFILE)

    args = [
        CHROME,
        f"--user-data-dir={PROFILE}",
        f"--load-extension={ROOT}",
        f"--disable-extensions-except={ROOT}",
        f"--remote-debugging-port={PORT}",
        "--no-first-run",
        "--no-default-browser-check",
        "--new-window",
        "about:blank",
    ]
    print("launch:", " ".join(args))
    proc = subprocess.Popen(args, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    print("pid:", proc.pid)

    # 等端口
    import socket
    up = False
    for _ in range(40):
        try:
            with socket.create_connection(("127.0.0.1", PORT), timeout=1):
                up = True
                break
        except OSError:
            time.sleep(0.25)
    print("port up:", up)
    if not up:
        print("Chrome 没起来，exit code:", proc.poll())
        return 3
    time.sleep(1.5)

    async with async_playwright() as p:
        browser = await p.chromium.connect_over_cdp(f"http://127.0.0.1:{PORT}")
        ctx = browser.contexts[0]
        client = await ctx.new_cdp_session(await ctx.new_page())
        targets = (await client.send("Target.getTargets"))["targetInfos"]
        ext_id = None
        for t in targets:
            m = re.search(r"chrome-extension://([a-p]{32})/", t.get("url", ""))
            if m:
                ext_id = m.group(1)
                break
        print("ext_id:", ext_id)
        print("--- targets ---")
        for t in targets:
            print("  ", t.get("type"), t.get("url", "")[:70])
        await browser.close()

    # 让 Chrome 继续活着（供手动检查），5 秒后关闭
    time.sleep(5)
    proc.terminate()
    print("done")
    return 0 if ext_id else 2


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
