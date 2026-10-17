import asyncio
import json
import os
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from playwright.async_api import async_playwright

ROOT = r"C:\Users\onlyo\WorkBuddy\X-AI-replay"

HITS = []


class MockAI(BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.send_header("Access-Control-Allow-Private-Network", "true")

    def do_OPTIONS(self):
        HITS.append("OPTIONS")
        self.send_response(204); self._cors(); self.end_headers()

    def do_POST(self):
        HITS.append("POST")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self._cors()
        self.end_headers()
        self.wfile.write(json.dumps({"choices": [{"message": {"content": "pong"}}]}).encode())

    def log_message(self, *a):
        pass


def run_mock():
    ThreadingHTTPServer(("127.0.0.1", 8899), MockAI).serve_forever()


async def main():
    threading.Thread(target=run_mock, daemon=True).start()
    await asyncio.sleep(1)
    async with async_playwright() as p:
        ctx = await p.chromium.launch_persistent_context("", headless=True, channel="chromium",
            args=["--headless=new", "--disable-extensions-except=" + ROOT,
                  "--load-extension=" + ROOT, "--no-sandbox",
                  "--disable-features=PrivateNetworkAccess",
                  "--proxy-bypass-list=127.0.0.1;localhost"])

        async def on_reqfail(req):
            print("REQFAIL:", req.url, "->", req.failure and req.failure.error_text)
        ctx.on("requestfailed", on_reqfail)

        # 稳健等待 SW（轮询）
        ext_url = None
        for _ in range(30):
            for s in ctx.service_workers:
                if "/src/" in (s.url or ""):
                    ext_url = s.url.split("/src/")[0]
                    break
            if ext_url:
                break
            await asyncio.sleep(0.5)
        print("ext_url:", ext_url)

        pg = await ctx.new_page()
        pg.on("console", lambda m: print("CONSOLE", m.type, m.text[:300]))
        pg.on("pageerror", lambda e: print("PAGEERR", str(e)[:200]))
        # 独立诊断：页面直接 fetch 本地 mock（走 PNA）
        page_fetch = await pg.evaluate("""() => fetch('http://127.0.0.1:8899/chat/completions',
            {method:'POST', headers:{'Content-Type':'application/json'}, body:'{}'})
            .then(r => ({status:r.status}))
            .catch(e => ({err: String(e)}))""")
        print("PAGE FETCH:", json.dumps(page_fetch, ensure_ascii=False))
        print("MOCK HITS:", HITS)

        if ext_url:
            await pg.goto(ext_url + "/src/options/options.html", wait_until="load", timeout=15000)
            await pg.wait_for_timeout(800)
            res = await pg.evaluate("""() => new Promise((resolve) => {
                const to = setTimeout(() => resolve({err:'timeout'}), 8000);
                chrome.runtime.sendMessage(
                    {type:'xai:test', payload:{baseUrl:'http://127.0.0.1:8899', apiKey:'sk-x', model:'gpt-4o'}},
                    (r) => { clearTimeout(to);
                        resolve(r || {err: chrome.runtime.lastError && chrome.runtime.lastError.message}); });
            })""")
            print("TEST RESULT:", json.dumps(res, ensure_ascii=False))
        await pg.close()
        await ctx.close()


asyncio.run(main())
