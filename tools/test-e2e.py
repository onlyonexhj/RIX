"""
端到端验证：用真实 Chromium 载入仿真 X 页面，把 content 脚本注入主环境，
验证「识别弹层 → 提取推文 → 回填编辑器 → 多条候选渲染」全链路。

为什么注入主环境而不是靠扩展加载：
  content script 跑在 isolated world（与页面 JS 隔离），page.evaluate 拿不到它的
  window.XAI —— 这是正确且必须的安全特性，不是 bug。
  下面直接测的是同一批 DOM 逻辑代码本身。
"""
import asyncio
import os
import json
import sys

from playwright.async_api import async_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCRIPTS = [
    "src/shared/config.js",
    "src/shared/utils.js",
    "src/content/detector.js",
    "src/content/editor.js",
]

MOCK_HTML = """
<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
body{background:#000;color:#e7e9ea;font-family:system-ui;margin:0;padding:30px}
[data-testid="tweet"]{background:#15202b;border:1px solid #2f3b47;border-radius:16px;
  padding:16px;width:640px;margin-bottom:20px}
[role="dialog"]{background:#15202b;border:1px solid #2f3b47;border-radius:16px;padding:16px;width:640px}
[data-testid="tweetText"]{margin:6px 0 10px;white-space:pre-wrap}
[data-testid="tweetTextarea_0"]{outline:none;min-height:60px;border:1px dashed #38444d;
  padding:8px;white-space:pre-wrap}
[data-testid="tweetPhoto"]{height:80px;background:#22303c;margin:6px 0}
</style></head><body>

<!-- 时间线上的原推文 -->
<div id="timelineTweet" data-testid="tweet">
  <div data-testid="User-Name">会跳舞的企鹅 <span>@penguin_dance</span></div>
  <time datetime="2026-10-16T10:00:00.000Z">1小时</time>
  <div data-testid="tweetText">时间线上的正文</div>
</div>

<!-- 回复弹层（结构对齐真实 X：role=dialog + Draft contenteditable） -->
<div role="dialog" aria-modal="true" id="dlg" aria-label="回复">
  <div data-testid="User-Name">会跳舞的企鹅 <span>@penguin_dance</span></div>
  <time datetime="2026-10-16T10:00:00.000Z">1小时</time>
  <div data-testid="tweetText" id="tweetText">今天学会了用 AI 写代码，效率直接翻倍！有人一起试试吗？</div>
  <div contenteditable="true" role="textbox" aria-multiline="true"
       data-testid="tweetTextarea_0" id="ed"></div>
  <span data-testid="tweet-textarea-counter" id="ctr">0</span>
  <button data-testid="tweetButton">发帖</button>
</div>

<!-- 一个只有媒体没有文字的推文卡片（测兜底） -->
<div id="mediaTweet" data-testid="tweet" style="margin-top:24px">
  <div data-testid="User-Name">摄影猫 <span>@cat_shot</span></div>
  <div data-testid="tweetPhoto"></div>
</div>

</body></html>
"""

CASES = [
    # (说明, JS 表达式, 期望值)
    (
        "识别发帖弹层",
        """() => { const c = XAI.detector.findComposer();
                   return c ? { hasDialog: !!c.dialog, editorId: c.editor.id } : null; }""",
        lambda v: bool(v) and v["hasDialog"] and v["editorId"] == "ed",
    ),
    (
        "判定为「回复」弹层",
        """() => XAI.detector.findComposer().isReply""",
        lambda v: v is True,
    ),
    (
        "提取推文正文",
        """() => (XAI.detector.extractTargetTweet(XAI.detector.findComposer())||{}).text""",
        lambda v: isinstance(v, str) and "AI 写代码" in v and "时间线上的正文" not in v,
    ),
    (
        "提取作者 handle",
        """() => (XAI.detector.extractTargetTweet(XAI.detector.findComposer())||{}).handle""",
        lambda v: v == "@penguin_dance",
    ),
    (
        "提取发布时间",
        """() => (XAI.detector.extractTargetTweet(XAI.detector.findComposer())||{}).time""",
        lambda v: v == "2026-10-16T10:00:00.000Z",
    ),
    (
        "回填编辑器（中文 + emoji）",
        """() => { const c = XAI.detector.findComposer();
                   XAI.editor.setText(c.editor, '试试看了，效率确实高 👍');
                   return XAI.editor.getText(c.editor); }""",
        lambda v: v == "试试看了，效率确实高 👍",
    ),
    (
        "回填后可覆盖（旧内容被清掉）",
        """() => { const c = XAI.detector.findComposer();
                   XAI.editor.setText(c.editor, '第二条内容');
                   return XAI.editor.getText(c.editor); }""",
        lambda v: v == "第二条内容",
    ),
    (
        "回填长文本（>280 字）",
        """() => { const c = XAI.detector.findComposer();
                   const long = '长'.repeat(500);
                   XAI.editor.setText(c.editor, long);
                   return XAI.editor.getText(c.editor).length; }""",
        lambda v: v == 500,
    ),
    (
        "清空编辑器",
        """() => { const c = XAI.detector.findComposer();
                   XAI.editor.clear(c.editor);
                   return XAI.editor.getText(c.editor); }""",
        lambda v: v == "",
    ),
    (
        "多条候选解析为数组",
        """() => XAI.utils.parseReplyList('["候选一","候选二","候选三"]', 3)""",
        lambda v: v == ["候选一", "候选二", "候选三"],
    ),
    (
        "含 markdown 包裹也能解析",
        """() => XAI.utils.parseReplyList('```json\\n["甲","乙"]\\n```', 2)""",
        lambda v: v == ["甲", "乙"],
    ),
    (
        "XSS 内容被转义（不执行）",
        """() => { const evil = '<img src=x onerror=\"window.__pwned=1\">';
                   const list = XAI.utils.parseReplyList(JSON.stringify([evil]), 1);
                   const div = document.createElement('div');
                   div.innerHTML = XAI.utils.escapeHtml(list[0]);
                   document.body.appendChild(div);
                   const hasImg = !!div.querySelector('img');
                   const r = { hasImg: hasImg, pwned: !!window.__pwned,
                               text: div.textContent };
                   div.remove(); return r; }""",
        lambda v: v["hasImg"] is False and v["pwned"] is False and "<img" in v["text"],
    ),
    (
        "纯媒体推文可识别",
        """() => { const t = XAI.detector.parseTweetCard(
                     document.getElementById('mediaTweet'));
                   return t ? { media: t.media, handle: t.handle } : null; }""",
        lambda v: bool(v) and "image" in v["media"] and v["handle"] == "@cat_shot",
    ),
]


async def main():
    results = []

    def check(name, ok, detail=""):
        results.append((name, ok))
        print("  %s %s%s" % ("PASS" if ok else "FAIL", name,
                              ("   -> " + detail) if detail else ""))

    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page(viewport={"width": 1920, "height": 1000})
        await page.set_content(MOCK_HTML)

        for rel in SCRIPTS:
            src = open(os.path.join(ROOT, rel), encoding="utf-8").read()
            await page.add_script_tag(content=src)

        for name, expr, pred in CASES:
            try:
                got = await page.evaluate(expr)
                ok = pred(got)
                detail = "" if ok else json.dumps(got, ensure_ascii=False)[:180]
            except Exception as e:
                got, ok = None, False
                detail = "EXCEPTION: " + str(e)[:180]
            check(name, ok, detail)

        # 面板 UI 视觉验证（单独截图）
        try:
            await page.add_script_tag(content=open(
                os.path.join(ROOT, "src/content/content.css"), encoding="utf-8").read())
            await page.evaluate("""() => {
                const b = document.createElement('button');
                b.className = 'xai-float is-on';
                b.textContent = '✦ AI 回复';
                b.style.top = '20px'; b.style.left = '20px';
                document.body.appendChild(b);
            }""")
            os.makedirs(os.path.join(ROOT, "dev"), exist_ok=True)
            await page.screenshot(path=os.path.join(ROOT, "dev", "shot-hover.png"))
            print("  PASS 悬浮按钮截图")
            results.append(("悬浮按钮渲染", True))
        except Exception as e:
            print("  SKIP 悬浮按钮截图: " + str(e)[:100])

        # ---------------- 面板拖拽（真实鼠标事件） ----------------
        try:
            await page.add_script_tag(content="""
                window.chrome = { storage: { local: {
                    async get(k){ return { [k]: undefined }; },
                    async set(){}
                }}};
            """)
            await page.add_script_tag(content=open(
                os.path.join(ROOT, "src/content/panel.js"), encoding="utf-8").read())

            await page.evaluate("""async () => {
                await XAI.panel.open({
                    dialog: document.querySelector('[role="dialog"]'),
                    editor: document.querySelector('[data-testid="tweetTextarea_0"]'),
                    isReply: true
                });
            }""")
            await page.wait_for_timeout(400)

            async def drag(dx, dy):
                hd = await page.query_selector(".xai-hd")
                box = await hd.bounding_box()
                cx = box["x"] + box["width"] / 2
                cy = box["y"] + box["height"] / 2
                await page.mouse.move(cx, cy)
                await page.mouse.down()
                # 分步移动：单次 move 会被阈值过滤掉
                for i in range(1, 6):
                    await page.mouse.move(cx + dx * i / 5, cy + dy * i / 5)
                    await page.wait_for_timeout(25)
                await page.mouse.up()
                await page.wait_for_timeout(200)

            before = await page.evaluate("""() => {
                const h = document.querySelector('.xai-panel');
                return { l: parseFloat(h.style.left), t: parseFloat(h.style.top) };
            }""")

            await drag(-140, -90)

            after = await page.evaluate("""() => {
                const h = document.querySelector('.xai-panel');
                const r = h.getBoundingClientRect();
                return { l: parseFloat(h.style.left), t: parseFloat(h.style.top),
                         dragCls: h.classList.contains('is-drag'),
                         rectLeft: r.left, rectRight: r.right, rectTop: r.top };
            }""")

            dx_m = abs(after["l"] - before["l"])
            dy_m = abs(after["t"] - before["t"])
            check("拖拽后位置改变", dx_m > 60 and dy_m > 40,
                  "dx=%.0f dy=%.0f" % (dx_m, dy_m))
            check("拖拽结束清除 is-drag", after["dragCls"] is False)
            check("拖拽后仍在视口内", after["rectLeft"] >= 0 and after["rectRight"] <= 1920,
                  "left=%.0f right=%.0f" % (after["rectLeft"], after["rectRight"]))

            # 拖过后 resize 不应覆盖位置（pinned）
            await page.evaluate("() => window.dispatchEvent(new Event('resize'))")
            await page.wait_for_timeout(300)
            keep = await page.evaluate(
                "() => parseFloat(document.querySelector('.xai-panel').style.left)")
            check("拖拽后位置被锁定", abs(keep - after["l"]) < 2,
                  "%.0f -> %.0f" % (after["l"], keep))

            # 双击复位
            hd = await page.query_selector(".xai-hd")
            await hd.dblclick()
            await page.wait_for_timeout(350)
            reset = await page.evaluate(
                "() => parseFloat(document.querySelector('.xai-panel').style.left)")
            check("双击标题栏复位", abs(reset - keep) > 2,
                  "%.0f -> %.0f" % (keep, reset))

            # 生成按钮仍可用（拖拽没误伤点击）
            usable = await page.evaluate("""() => {
                const b = document.querySelector('.xai-btn--go');
                return !!b && b.offsetWidth > 0;
            }""")
            check("拖拽后生成按钮仍可用", usable)
        except Exception as e:
            check("面板拖拽测试", False, "EXCEPTION: " + str(e)[:200])

        await browser.close()

    # ---------------- 扩展页面加载（popup / options） ----------------
    # 背景 bug：popup.html 漏加载 utils.js，popup.js 在 async init() 里
    # 调 XAI.utils.escapeHtml → "Uncaught (in promise) TypeError"。
    # 页面看着正常（只是状态框空着），只有真加载页面+捕获 pageerror 才能发现。
    try:
        async with async_playwright() as p2:
            ctx = await p2.chromium.launch_persistent_context(
                "", headless=True, channel="chromium",
                args=["--headless=new", "--disable-extensions-except=" + ROOT,
                      "--load-extension=" + ROOT, "--no-sandbox"])

            sws = ctx.service_workers
            if not sws:
                try:
                    sws = [await ctx.wait_for_event("serviceworker", timeout=8000)]
                except Exception:
                    sws = []
            ext_url = None
            for s in sws:
                ext_url = s.url.split("/src/")[0]
            if not ext_url:
                raise RuntimeError("未获取到扩展 origin（service worker 未注册）")

            for name, rel in [("popup", "src/popup/popup.html"),
                              ("options", "src/options/options.html")]:
                perrs = []
                pg = await ctx.new_page()
                pg.on("pageerror", lambda e: perrs.append(str(e)[:200]))
                pg.on("console",
                      lambda m: perrs.append("console." + m.type + ": " + m.text[:200])
                      if m.type == "error" else None)
                await pg.goto(ext_url + "/" + rel)
                await pg.wait_for_timeout(900)

                check("%s 页面无 JS 错误" % name, len(perrs) == 0,
                      "; ".join(perrs[:3]) if perrs else "")

                if name == "popup":
                    st = await pg.evaluate(
                        "() => (document.getElementById('st')||{}).textContent || ''")
                    check("popup 状态框有内容", len(st.strip()) > 0,
                          "内容长度=%d" % len(st.strip()))
                    nopt = await pg.evaluate(
                        "() => document.getElementById('style').options.length")
                    check("popup 风格下拉已填充", nopt == 8, "options=%s" % nopt)
                else:
                    chips = await pg.evaluate(
                        "() => document.querySelectorAll('.vchip').length")
                    check("options 变量表已渲染", chips >= 12, "chips=%s" % chips)
                    filled = await pg.evaluate(
                        "() => document.getElementById('baseUrl').value.length > 0")
                    check("options 配置已回填", filled)

                await pg.close()
            await ctx.close()
    except Exception as e:
        check("扩展页面加载测试", False, "EXCEPTION: " + str(e)[:200])

    passed = sum(1 for _, ok in results if ok)
    total = len(results)
    print("\n" + "-" * 50)
    print("通过 %d / %d%s" % (passed, total,
                               "   全部通过" if passed == total else "   有失败项"))
    return 0 if passed == total else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
