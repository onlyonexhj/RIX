"""
生成 Chrome Web Store 上架素材。

规格要求（Chrome Web Store）：
  - 截图：1280x800 或 640x400，至少 1 张，最多 5 张
  - 小型宣传瓷砖：440x280（可选）
  - 商店图标：128x128（已有，复用 icons/icon128.png）

产出到 store/ 目录，全部用真实渲染（不是裁剪），保证清晰。
"""
import asyncio
import os
import json
import re
import shutil
from playwright.async_api import async_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "store")
os.makedirs(OUT, exist_ok=True)

# 复用 preview-options.py 的 mock，保证设置页能正常渲染
src = open(os.path.join(ROOT, "tools", "preview-options.py"), encoding="utf-8").read()
STORE = eval(re.search(r'STORE = (\{.*?\n\})\n\nMOCK', src, re.S).group(1))
MOCK = re.search(r'MOCK = """\n(.*?)"""', src, re.S).group(1)
MOCK += """
window.chrome.runtime.sendMessage = async function(msg){
  if (msg.type === 'xai:proxyGet')
    return { ok:true, data:{ ok:true, mode:'fixed_servers',
      desc:'http://127.0.0.1:7890', levelOfControl:'controlled_by_this_extension' } };
  if (msg.type === 'xai:proxyDiagnose')
    return { ok:true, data:[
      { label:'当前网络设置', ok:true, status:200, ms:1840 },
      { label:'API 直连',     ok:true, status:401, ms:420 } ] };
  return { ok:true, data:{ n:3, system:'预览SYS', user:'预览USER' } };
};
"""

# 仿真 X 页面（含时间线 + 回复弹层 + AI 面板）
X_PAGE = """<!DOCTYPE html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#000;color:#e7e9ea;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"PingFang SC",sans-serif;overflow:hidden}
.tl{width:600px;padding:0 16px}
.tl__hd{padding:12px 0;font-weight:800;font-size:19px}
.card{background:#000;border-bottom:1px solid #2f3b47;padding:14px 8px;display:flex;gap:11px}
.av{width:44px;height:44px;border-radius:50%;background:linear-gradient(135deg,#1d9bf0,#7856ff);flex:none}
.nm{font-weight:700;font-size:14.5px}
.hd{color:#71767b;font-size:14px;margin-left:5px;font-weight:400}
.tx{font-size:15px;line-height:1.5;margin-top:3px}
.acts{display:flex;gap:52px;margin-top:10px;color:#71767b;font-size:12.5px}
.dlg{position:absolute;left:640px;top:50%;transform:translateY(-50%);width:600px;
  background:#15202b;border:1px solid #38444d;border-radius:16px;padding:14px;
  box-shadow:0 10px 40px rgba(0,0,0,.6)}
.dlg__x{position:absolute;left:14px;top:13px;font-size:19px;color:#71767b}
.dlg__draft{position:absolute;right:14px;top:13px;color:#1d9bf0;font-weight:700;font-size:13px}
.dlg__hdr{display:flex;gap:11px;align-items:flex-start;padding:4px 0 10px}
.cnt{color:#71767b;font-size:14px;margin-left:auto;white-space:nowrap}
.ed{min-height:56px;border-top:1px solid #2f3b47;border-bottom:1px solid #2f3b47;padding:10px 2px;font-size:15px}
.ph{color:#71767b;font-size:19px}
.tools{display:flex;gap:16px;margin-top:12px;color:#1d9bf0;font-size:17px;align-items:center}
.post{margin-left:auto;background:#eff3f4;color:#0f1419;border-radius:999px;padding:7px 20px;font-weight:700;font-size:14px}
</style></head><body>
<div class="tl">
  <div class="tl__hd">首页</div>
  <div class="card"><div class="av"></div><div style="flex:1">
    <span class="nm">会跳舞的企鹅</span><span class="hd">@penguin_dance · 1小时</span>
    <div class="tx">今天学会了用 AI 写代码，效率直接翻倍！有人一起试试吗？</div>
    <div class="acts"><span>💬 12</span><span>🔁 34</span><span>❤️ 201</span></div></div></div>
  <div class="card"><div class="av" style="background:linear-gradient(135deg,#f91880,#ff7a45)"></div><div style="flex:1">
    <span class="nm">摄影猫</span><span class="hd">@cat_shot · 2小时</span>
    <div class="tx">凌晨四点的城市，光比人更孤独。</div>
    <div class="acts"><span>💬 88</span><span>🔁 12</span><span>❤️ 1.2k</span></div></div></div>
</div>
<div class="dlg">
  <div class="dlg__x">✕</div><div class="dlg__draft">草稿</div>
  <div class="dlg__hdr"><div class="av"></div><div>
    <span class="nm">会跳舞的企鹅</span><span class="hd">@penguin_dance · 1小时</span>
    <div class="tx">今天学会了用 AI 写代码，效率直接翻倍！有人一起试试吗？</div></div>
    <span class="cnt">54</span></div>
  <div class="ed"><div class="ph">添加另一个帖子</div></div>
  <div class="tools"><span>🖼</span><span>GIF</span><span>◔</span><span>☰</span><span>☺</span>
    <span class="post">发帖</span></div>
</div>
</body></html>"""

RESULTS = [
    "刚试了，效率确实翻倍 —— 不过我一般是让 AI 写测试，自己写实现，这样翻的是三倍",
    "所以你用的哪个模型？我用 DeepSeek 写业务代码，它比我的实习生靠谱多了",
    "试了，最大的坑是别让它一次写完整个模块，先要个骨架再逐个函数填，比一次生成靠谱",
]


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()

        # ---------- 截图 1：主功能（1280x800）----------
        pg = await b.new_page(viewport={"width": 1280, "height": 800},
                              device_scale_factor=1, color_scheme="dark")
        await pg.set_content(X_PAGE)
        for f in ["src/shared/config.js", "src/shared/utils.js",
                  "src/content/detector.js", "src/content/editor.js"]:
            await pg.add_script_tag(content=open(os.path.join(ROOT, f), encoding="utf-8").read())
        await pg.add_script_tag(content="""
          window.chrome = { storage: { local: {
            async get(k){ return { [k]: undefined }; }, async set(){} }}};
        """)
        await pg.add_script_tag(content=open(os.path.join(ROOT, "src/content/panel.js"), encoding="utf-8").read())
        await pg.evaluate("""async (r) => {
            await XAI.panel.open({ dialog: document.querySelector('.dlg'),
                                   editor: document.querySelector('.ed'), isReply: true });
            await XAI.panel._debugSetResults(r);
            await new Promise(x => requestAnimationFrame(() => requestAnimationFrame(x)));
        }""", RESULTS)
        await pg.wait_for_timeout(300)
        await pg.screenshot(path=os.path.join(OUT, "screenshot-1-1280x800.png"))
        print("截图1 -> store/screenshot-1-1280x800.png")
        await pg.close()

        # ---------- 截图 2：设置页 / 提示词配置（1280x800）----------
        pg = await b.new_page(viewport={"width": 1280, "height": 800},
                              device_scale_factor=1, color_scheme="dark")
        await pg.add_init_script(MOCK % json.dumps(STORE))
        await pg.goto("file:///" + os.path.join(ROOT, "src", "options", "options.html").replace("\\", "/"))
        await pg.wait_for_timeout(700)
        # 滚到提示词卡片
        await pg.evaluate("""() => {
            const c = document.getElementById('promptCard');
            c && c.scrollIntoView({block:'start'});
        }""")
        await pg.wait_for_timeout(400)
        await pg.screenshot(path=os.path.join(OUT, "screenshot-2-1280x800.png"))
        print("截图2 -> store/screenshot-2-1280x800.png")
        await pg.close()

        # ---------- 小型宣传瓷砖 440x280 ----------
        pg = await b.new_page(viewport={"width": 440, "height": 280},
                              device_scale_factor=2, color_scheme="dark")
        await pg.set_content("""<!DOCTYPE html><html><head><meta charset="utf-8"><style>
*{margin:0;padding:0;box-sizing:border-box}
body{width:440px;height:280px;background:linear-gradient(135deg,#0b1219 0%,#15202b 55%,#1d2b3a 100%);
  color:#e7e9ea;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
  display:flex;flex-direction:column;justify-content:center;padding:26px 28px;position:relative;overflow:hidden}
body::after{content:'';position:absolute;right:-60px;top:-60px;width:220px;height:220px;border-radius:50%;
  background:radial-gradient(circle,rgba(29,155,240,.22),transparent 70%)}
.logo{width:46px;height:46px;border-radius:12px;background:linear-gradient(135deg,#1d9bf0,#7856ff);
  display:flex;align-items:center;justify-content:center;font-size:24px;color:#fff;margin-bottom:14px}
h1{font-size:21px;font-weight:800;letter-spacing:-.2px}
.sub{font-size:13px;color:#8b98a5;margin-top:7px;line-height:1.5}
.tags{display:flex;gap:6px;margin-top:14px}
.tag{font-size:10.5px;background:rgba(29,155,240,.14);border:1px solid rgba(29,155,240,.3);
  color:#4db2f5;border-radius:5px;padding:3px 8px}
</style></head><body>
<div class="logo">✦</div>
<h1>X AI 回复助手</h1>
<div class="sub">点回复气泡，AI 秒出多条候选<br>一键回填，直接发帖</div>
<div class="tags"><span class="tag">流式输出</span><span class="tag">提示词可配置</span><span class="tag">多服务商</span></div>
</body></html>""")
        await pg.wait_for_timeout(200)
        await pg.screenshot(path=os.path.join(OUT, "promo-440x280.png"))
        print("宣传瓷砖 -> store/promo-440x280.png")
        await pg.close()

        # ---------- 复制 128 图标 ----------
        shutil.copy(os.path.join(ROOT, "icons", "icon128.png"),
                    os.path.join(OUT, "icon-128.png"))
        print("商店图标 -> store/icon-128.png")

        await b.close()

    print()
    print("上架素材目录:", OUT)
    for f in sorted(os.listdir(OUT)):
        print("  %-32s %7.1f KB" % (f, os.path.getsize(os.path.join(OUT, f)) / 1024))


if __name__ == "__main__":
    asyncio.run(main())
