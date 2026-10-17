"""
渲染 AI 面板的 UI 预览图（用于人工视觉验收，无需安装扩展）。
直接调用 panel.js 的构建逻辑，喂入模拟结果。
"""
import asyncio
import os
from playwright.async_api import async_playwright

ROOT = os.path.abspath(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# 页面底图 = 模拟 X 深色界面的时间线 + 回复弹层
PAGE = """
<!DOCTYPE html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box}
body{margin:0;background:#000;color:#e7e9ea;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"PingFang SC",sans-serif}
/* 左侧时间线 */
.tl{position:absolute;left:0;top:0;width:600px;padding:0 16px}
.tl__hd{position:sticky;top:0;background:#000;padding:12px 0;font-weight:800;font-size:19px;z-index:2}
.card{background:#000;border-bottom:1px solid #2f3b47;padding:14px 8px;display:flex;gap:11px}
.av{width:44px;height:44px;border-radius:50%;background:linear-gradient(135deg,#1d9bf0,#7856ff);flex:none}
.nm{font-weight:700;font-size:14.5px}
.hd{color:#71767b;font-size:14px;margin-left:5px;font-weight:400}
.tx{font-size:15px;line-height:1.5;margin-top:3px;white-space:pre-wrap}
.acts{display:flex;gap:52px;margin-top:10px;color:#71767b;font-size:12.5px}
/* 弹层 */
.dlg{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:600px;
  background:#15202b;border:1px solid #38444d;border-radius:16px;padding:14px;box-shadow:0 10px 40px rgba(0,0,0,.6)}
.dlg__x{position:absolute;left:14px;top:13px;font-size:19px;color:#71767b}
.dlg__draft{position:absolute;right:14px;top:13px;color:#1d9bf0;font-weight:700;font-size:13px}
.dlg__hdr{display:flex;gap:11px;align-items:flex-start;padding:4px 0 10px}
.cnt{color:#71767b;font-size:14px;margin-left:auto;white-space:nowrap}
.ed{min-height:56px;border-top:1px solid #2f3b47;border-bottom:1px solid #2f3b47;padding:10px 2px}
.ph{color:#71767b;font-size:19px}
.tools{display:flex;gap:16px;margin-top:12px;color:#1d9bf0;font-size:17px;align-items:center}
.post{margin-left:auto;background:#eff3f4;color:#0f1419;border-radius:999px;
  padding:7px 20px;font-weight:700;font-size:14px}
</style></head><body>

<div class="tl">
  <div class="tl__hd">首页</div>
  <div class="card">
    <div class="av"></div>
    <div style="flex:1">
      <span class="nm">会跳舞的企鹅</span><span class="hd">@penguin_dance · 1小时</span>
      <div class="tx">今天学会了用 AI 写代码，效率直接翻倍！有人一起试试吗？</div>
      <div class="acts"><span>💬 12</span><span>🔁 34</span><span>❤️ 201</span></div>
    </div>
  </div>
  <div class="card">
    <div class="av" style="background:linear-gradient(135deg,#f91880,#ff7a45)"></div>
    <div style="flex:1">
      <span class="nm">摄影猫</span><span class="hd">@cat_shot · 2小时</span>
      <div class="tx">凌晨四点的城市，光比人更孤独。</div>
      <div class="acts"><span>💬 88</span><span>🔁 12</span><span>❤️ 1.2k</span></div>
    </div>
  </div>
</div>

<div class="dlg">
  <div class="dlg__x">✕</div>
  <div class="dlg__draft">草稿</div>
  <div class="dlg__hdr">
    <div class="av"></div>
    <div>
      <span class="nm">会跳舞的企鹅</span><span class="hd">@penguin_dance · 1小时</span>
      <div class="tx">今天学会了用 AI 写代码，效率直接翻倍！有人一起试试吗？</div>
    </div>
  </div>
  <div class="ed"><div class="ph">添加另一个帖子</div></div>
  <div class="tools"><span>🖼</span><span>GIF</span><span>◔</span><span>☰</span><span>☺</span>
    <span class="post">发帖</span></div>
</div>

</body></html>
"""

SCRIPTS = [
    "src/shared/config.js",
    "src/shared/utils.js",
    "src/content/detector.js",
    "src/content/editor.js",
    "src/content/content.css",
    "src/content/panel.js",
]

RESULTS = [
    "刚试了，效率确实翻倍 —— 不过我一般是让 AI 写测试，自己写实现，这样翻的是三倍",
    "所以你用的哪个模型？我用 DeepSeek 写业务代码，它比我的实习生靠谱多了",
    "试了，最大的坑是别让它一次写完整个模块，先要个骨架再逐个函数填，比一次生成靠谱",
    "这个我懂，AI 写得越快你 debug 越久，最后发现还是在给 AI 擦屁股",
]

STYLES = ["auto", "humor", "pro", "sharp", "warm", "sharpw", "meme", "translate", "sarcasm"]


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={"width": 1920, "height": 1000},
                              device_scale_factor=1)
        await pg.set_content(PAGE)

        # 伪造 chrome.storage（content script 会调用 XAI.getConfig）
        await pg.add_script_tag(content="""
          window.__cfgStore = {};
          window.chrome = { storage: { local: {
            async get(k){ return { [k]: window.__cfgStore[k] }; },
            async set(o){ Object.assign(window.__cfgStore, o); }
          } } };
        """)
        for rel in SCRIPTS:
            await pg.add_script_tag(content=open(os.path.join(ROOT, rel), encoding="utf-8").read())

        # 打开面板并灌入结果
        await pg.evaluate("""async (results) => {
            const D = XAI.detector, P = XAI.panel;
            const composer = { dialog: document.querySelector('.dlg'),
                               editor: document.querySelector('.ed'),
                               isReply: true };
            // 先 open 让 state.composer 就位，再灌结果
            await P.open(composer);
            await P._debugSetResults(results);
            // 等布局稳定
            await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        }""", RESULTS)

        await pg.wait_for_timeout(500)
        out = os.path.join(ROOT, "dev", "preview-panel.png")
        os.makedirs(os.path.dirname(out), exist_ok=True)
        await pg.screenshot(path=out)
        print("面板预览 ->", out)

        # 面板单独截图（更清晰）
        el = await pg.query_selector(".xai-panel")
        out2 = os.path.join(ROOT, "dev", "preview-panel-only.png")
        await el.screenshot(path=out2)
        print("面板单体 ->", out2)

        await b.close()


if __name__ == "__main__":
    asyncio.run(main())
