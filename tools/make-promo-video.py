"""
生成 Chrome Web Store 宣传视频 —— 按真实操作顺序，逐步渲染。

与旧版（拼贴用户截图）的区别：
  旧版只有 6 张截图，缺「弹层刚打开」「点生成」「生成中」「流式」等中间状态，
  拼不出真正的操作流。本版用扩展的**真实 UI** 把每一步渲染出来：
    ① 时间线浏览 -> ② 点回复气泡弹层打开 -> ③ AI 面板自动出现 ->
    ④ 选风格/条数 -> ⑤ 点生成（真实 loading UI + 计时）-> ⑥ 流式出多条候选 ->
    ⑦ 点候选回填输入框 -> ⑧ 品牌结尾卡
  其中 ⑤⑥ 通过 mock chrome.runtime.connect 模拟 SSE 流式推送，
  走的是 panel.js 里真实的 generate/runStream/onDone 代码路径。

另合成一段氛围电子背景音乐（ffmpeg sine 叠加，无版权风险）。

输出：store/promo-video.mp4
"""
import asyncio
import json
import os
import subprocess
import sys

from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "store")
WORK = os.path.join(ROOT, "dev", "_video")
os.makedirs(OUT_DIR, exist_ok=True)
os.makedirs(WORK, exist_ok=True)

FFMPEG = r"D:/Program Files/anaconda3/Lib/site-packages/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v7.1.exe"
FONT_BOLD = r"C:/Windows/Fonts/msyhbd.ttc"
FONT_REG = r"C:/Windows/Fonts/msyh.ttc"

W, H = 1920, 1080
FPS = 30
TRANS = 0.55           # 交叉淡化时长
ZOOM_AMOUNT = 0.035
SAFE_MARGIN = 40

# 与用户真实截图一致的推文与候选，保证观感真实
CANDIDATES = [
    "1.3万粉在老马眼里是路人，那我这三位数粉丝大概是背景板",
    "X Money卡我的不是资格，是地区 —— 想被拒都没门",
    "功能越出越多，资格越卡越死，只有我的粉丝数稳定不变",
]

# 镜头脚本：(关键帧名, 时长, 字幕)  —— 顺序 = 真实用户操作流
SHOTS = [
    ("s1_timeline",  3.0, "在 X 时间线浏览推文"),
    ("s2_dialog",    3.0, "点回复气泡，打开发帖弹层"),
    ("s3_panel",     4.0, "AI 面板自动出现，已读取被回复的推文"),
    ("s4_style",     3.0, "风格、条数、语言随心选"),
    ("s5_loading",   3.5, "点「生成回复」，流式输出首字约 1 秒"),
    ("s6_results",   4.5, "一次生成多条候选回复"),
    ("s7_filled",    4.0, "点一下即回填到输入框，直接发帖"),
]
ENDCARD_DUR = 5.0


# ---------------------------------------------------------------- 模拟 X 页面
X_PAGE = """<!DOCTYPE html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#000;color:#e7e9ea;overflow:hidden;
  font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"PingFang SC",sans-serif}
.nav{position:absolute;left:0;top:0;width:275px;height:1080px;padding:8px 12px;
  border-right:1px solid #2f3b47;display:flex;flex-direction:column;gap:2px}
.nav__logo{font-size:26px;padding:10px 12px 14px}
.nav__i{display:flex;align-items:center;gap:15px;padding:12px;border-radius:999px;font-size:17px}
.nav__i:hover{background:#181818}
.nav__i--on{font-weight:700}
.nav__i span:first-child{font-size:19px;width:24px;text-align:center}
.nav__post{margin-top:14px;background:#1d9bf0;color:#fff;border-radius:999px;
  padding:13px;text-align:center;font-weight:700;font-size:15px}
.nav__me{margin-top:auto;display:flex;align-items:center;gap:11px;padding:11px;border-radius:999px}
.nav__av{width:38px;height:38px;border-radius:50%;background:linear-gradient(135deg,#1d9bf0,#7856ff)}
.tl{position:absolute;left:275px;top:0;width:600px;height:1080px;
  border-right:1px solid #2f3b47;overflow:hidden}
.tl__hd{position:sticky;top:0;background:rgba(0,0,0,.85);padding:14px 16px;
  font-weight:800;font-size:19px;z-index:3}
.card{padding:14px 16px;border-bottom:1px solid #2f3b47;display:flex;gap:11px}
.av{width:44px;height:44px;border-radius:50%;flex:none}
.nm{font-weight:700;font-size:14.5px}
.hd{color:#71767b;font-size:14px;margin-left:5px;font-weight:400}
.tx{font-size:15px;line-height:1.5;margin-top:3px;white-space:pre-wrap}
.acts{display:flex;gap:52px;margin-top:10px;color:#71767b;font-size:12.5px}
.rs{position:absolute;left:875px;top:0;width:520px;padding:12px 16px}
.rs__search{background:#202327;border-radius:999px;padding:11px 16px;color:#71767b;font-size:14px}
.rs__card{background:#16181c;border-radius:16px;padding:14px 16px;margin-top:14px}
.rs__h{font-size:19px;font-weight:800;margin-bottom:12px}
.rs__row{padding:7px 0;font-size:14px;line-height:1.45}
.rs__row b{display:block;font-size:14.5px}
.rs__row i{color:#71767b;font-style:normal;font-size:13px}
.scrim{position:absolute;inset:0;background:rgba(91,112,131,.4);z-index:50;display:none}
.scrim.on{display:block}
.dlg{position:absolute;left:52%;top:50%;transform:translate(-50%,-50%);width:600px;
  background:#000;border:1px solid #2f3b47;border-radius:16px;padding:0 0 14px;
  z-index:60;display:none;box-shadow:0 8px 44px rgba(0,0,0,.7)}
.dlg.on{display:block;animation:dlgIn .22s cubic-bezier(.2,.8,.3,1)}
@keyframes dlgIn{from{opacity:0;transform:translate(-50%,-46%) scale(.97)}
to{opacity:1;transform:translate(-50%,-50%) scale(1)}}
.dlg__x{position:absolute;left:14px;top:13px;font-size:19px;color:#e7e9ea;cursor:pointer}
.dlg__draft{position:absolute;right:16px;top:15px;color:#1d9bf0;font-weight:700;font-size:13px}
.dlg__hdr{display:flex;gap:11px;align-items:flex-start;padding:16px 16px 10px}
.cnt{color:#71767b;font-size:13px;margin-left:auto;white-space:nowrap;padding-top:3px}
.ed{min-height:62px;border-top:1px solid #2f3b47;border-bottom:1px solid #2f3b47;
  padding:11px 16px;font-size:17px;line-height:1.4}
.ph{color:#71767b;font-size:19px}
.tools{display:flex;gap:18px;margin:12px 16px 0;color:#1d9bf0;font-size:17px;align-items:center}
.post{margin-left:auto;background:#eff3f4;color:#0f1419;border-radius:999px;
  padding:8px 21px;font-weight:700;font-size:14px}
</style></head><body>

<div class="nav">
  <div class="nav__logo">𝕏</div>
  <div class="nav__i nav__i--on"><span>🏠</span>首页</div>
  <div class="nav__i"><span>🔍</span>探索</div>
  <div class="nav__i"><span>🔔</span>通知</div>
  <div class="nav__i"><span>✉</span>消息</div>
  <div class="nav__i"><span>📑</span>列表</div>
  <div class="nav__i"><span>🔖</span>书签</div>
  <div class="nav__i"><span>👥</span>社区</div>
  <div class="nav__i"><span>👤</span>个人资料</div>
  <div class="nav__i"><span>···</span>更多</div>
  <div class="nav__post">发帖</div>
  <div class="nav__me"><div class="nav__av"></div>
    <div><div style="font-weight:700;font-size:14px">会跳舞的企鹅</div>
    <div style="color:#71767b;font-size:13px">@penguin_dance</div></div></div>
</div>

<div class="tl">
  <div class="tl__hd">首页</div>
  <div class="card"><div class="av" style="background:linear-gradient(135deg,#1d9bf0,#7856ff)"></div>
    <div style="flex:1"><span class="nm">Stella</span><span class="hd">@0xleolabs · 1小时</span>
      <div class="tx">X出了X Money 我没资格
X出了定时发布 我没资格
X出了5000刀视频活动 我还是没资格
1.3万粉 在老马眼里还是个路人
你被哪个功能卡过？</div>
      <div class="acts"><span>💬 88</span><span>🔁 12</span><span>❤️ 1.2k</span></div></div></div>
  <div class="card"><div class="av" style="background:linear-gradient(135deg,#f91880,#ff7a45)"></div>
    <div style="flex:1"><span class="nm">摄影猫</span><span class="hd">@cat_shot · 2小时</span>
      <div class="tx">凌晨四点的城市，光比人更孤独。</div>
      <div class="acts"><span>💬 34</span><span>🔁 5</span><span>❤️ 620</span></div></div></div>
  <div class="card"><div class="av" style="background:linear-gradient(135deg,#00ba7c,#ffd400)"></div>
    <div style="flex:1"><span class="nm">前端小张</span><span class="hd">@zhang_fe · 3小时</span>
      <div class="tx">今天用 AI 重写了公司的老后台，同事以为我加班了一星期。</div>
      <div class="acts"><span>💬 56</span><span>🔁 21</span><span>❤️ 903</span></div></div></div>
</div>

<div class="rs">
  <div class="rs__search">🔍&nbsp; 搜索</div>
  <div class="rs__card"><div class="rs__h">你可能喜欢</div>
    <div class="rs__row"><b>马斯克日常</b><i>@elon_daily</i></div>
    <div class="rs__row"><b>AI 观察站</b><i>@ai_watch</i></div>
    <div class="rs__row"><b>独立开发者</b><i>@indie_dev</i></div></div>
  <div class="rs__card"><div class="rs__h">趋势</div>
    <div class="rs__row"><b>#XMoney</b><i>1.3万 帖子</i></div>
    <div class="rs__row"><b>#AI编程</b><i>8,241 帖子</i></div>
    <div class="rs__row"><b>#独立开发</b><i>3,102 帖子</i></div></div>
</div>

<div class="scrim" id="scrim"></div>
<div class="dlg" id="dlg" role="dialog" aria-modal="true">
  <div class="dlg__x">✕</div>
  <div class="dlg__draft">草稿</div>
  <div class="dlg__hdr">
    <div class="av" style="background:linear-gradient(135deg,#1d9bf0,#7856ff)"></div>
    <div data-testid="tweet" style="flex:1">
      <div data-testid="User-Name"><span class="nm">Stella</span><span class="hd">@0xleolabs · 1小时</span></div>
      <div class="tx" data-testid="tweetText">X出了X Money 我没资格
X出了定时发布 我没资格
X出了5000刀视频活动 我还是没资格
1.3万粉 在老马眼里还是个路人
你被哪个功能卡过？</div>
    </div>
    <span class="cnt" id="cnt">0</span>
  </div>
  <div class="ed" id="ed" data-testid="tweetTextarea_0" role="textbox"
       contenteditable="true" aria-multiline="true"><div class="ph">添加另一个帖子</div></div>
  <div class="tools"><span>🖼</span><span>GIF</span><span>◔</span><span>☰</span><span>☺</span>
    <button id="postBtn" aria-label="Reply" style="all:unset;cursor:pointer">发帖</button></div>
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


# ---------------------------------------------------------------- PIL 工具
def font(path, size):
    return ImageFont.truetype(path, size)


def fit_to_canvas(im):
    im = im.convert("RGB")
    iw, ih = im.size
    aw, ah = W - 2 * SAFE_MARGIN, H - 2 * SAFE_MARGIN
    s = min(aw / iw, ah / ih)
    nw, nh = max(1, int(iw * s)), max(1, int(ih * s))
    im = im.resize((nw, nh), Image.LANCZOS)
    c = Image.new("RGB", (W, H), (0, 0, 0))
    c.paste(im, ((W - nw) // 2, (H - nh) // 2))
    return c


def add_caption(im, text):
    d = ImageDraw.Draw(im, "RGBA")
    sh = int(H * 0.20)
    grad = Image.new("L", (1, sh), 0)
    for y in range(sh):
        grad.putpixel((0, y), int(232 * ((y / max(1, sh - 1)) ** 1.35)))
    im.paste(Image.new("RGB", (W, sh), (0, 0, 0)), (0, H - sh), grad.resize((W, sh)))

    f = font(FONT_BOLD, 44)
    tb = d.textbbox((0, 0), text, font=f)
    tw, th = tb[2] - tb[0], tb[3] - tb[1]
    tx, ty = (W - tw) // 2, H - sh + (sh - th) // 2 - 4
    for dx in (0, 3):
        d.text((tx + dx, ty), text, font=f, fill=(0, 0, 0, 165))
    d.rounded_rectangle([tx - 26, ty - 6, tx - 20, ty + th + 6], radius=3,
                        fill=(29, 155, 240, 235))
    d.text((tx, ty), text, font=f, fill=(255, 255, 255, 255))
    return im


def draw_star(d, cx, cy, r, color):
    import math
    k = r * 0.30
    pts = []
    for i in range(8):
        ang = math.pi / 2 * (i // 2) + (math.pi / 4 if i % 2 else 0)
        rad = r if i % 2 == 0 else k
        pts.append((cx + rad * math.cos(ang - math.pi / 2),
                    cy + rad * math.sin(ang - math.pi / 2)))
    d.polygon(pts, fill=color)


def make_endcard():
    im = Image.new("RGB", (W, H), (11, 18, 25))
    gd = ImageDraw.Draw(im)
    for y in range(H):
        t = y / (H - 1)
        gd.line([(0, y), (W, y)],
                fill=(int(11 + 18 * t), int(18 + 25 * t), int(25 + 33 * t)))
    glow = Image.new("RGB", (W, H), (0, 0, 0))
    ImageDraw.Draw(glow).ellipse([W - 520, -320, W + 320, 520], fill=(29, 155, 240))
    glow = glow.filter(ImageFilter.GaussianBlur(180))
    im = Image.blend(im, Image.composite(glow, im, glow.convert("L")), 0.30)
    d = ImageDraw.Draw(im, "RGBA")

    logo = Image.open(os.path.join(ROOT, "icons", "icon128.png")).convert("RGBA")
    logo = logo.resize((148, 148), Image.LANCZOS)
    im.paste(logo, ((W - 148) // 2, 142), logo)

    f_t = font(FONT_BOLD, 82)
    t = "X AI 回复助手"
    tb = d.textbbox((0, 0), t, font=f_t)
    d.text(((W - (tb[2] - tb[0])) // 2, 340), t, font=f_t, fill=(231, 233, 234, 255))

    f_s = font(FONT_REG, 37)
    s = "点回复气泡，AI 秒出多条候选 · 一键回填"
    sb = d.textbbox((0, 0), s, font=f_s)
    d.text(((W - (sb[2] - sb[0])) // 2, 468), s, font=f_s, fill=(139, 152, 165, 255))
    d.line([(W // 2 - 130, 556), (W // 2 + 130, 556)], fill=(47, 59, 71, 255), width=2)

    f_b = font(FONT_REG, 33)
    y = 616
    for b in ["一次生成 1–5 条候选，风格各异",
              "8 种风格 · 提示词完全可配置",
              "流式输出 · 第一条约 1 秒可见",
              "支持 GLM / DeepSeek / OpenAI / Claude / Ollama"]:
        draw_star(d, W // 2 - 312, y + 19, 10, (29, 155, 240, 255))
        d.text((W // 2 - 256, y), b, font=f_b, fill=(183, 195, 204, 255))
        y += 58

    f_f = font(FONT_REG, 25)
    foot = "API Key 仅保存在浏览器本地 · 无服务端"
    fb = d.textbbox((0, 0), foot, font=f_f)
    d.text(((W - (fb[2] - fb[0])) // 2, H - 96), foot, font=f_f, fill=(113, 118, 123, 255))
    return im


# ---------------------------------------------------------------- 渲染各状态
async def render_states(pg):
    """在模拟 X 页面里驱动扩展面板走完整个操作流，逐步截图"""
    # --- chrome mock：storage + runtime.connect（模拟 SSE 流式）---
    await pg.add_script_tag(content="""
      window.__store = {};
      window.chrome = {
        storage: { local: {
          async get(k){ const r={}; if(typeof k==='string') r[k]=window.__store[k]; return r; },
          async set(o){ Object.assign(window.__store,o); }
        }},
        runtime: {
          getURL(p){ return p; },
          async sendMessage(){ return { ok:true }; },
          connect(name){
            const port = {
              _m:null, _d:null,
              onMessage:{ addListener(f){ port._m=f; } },
              onDisconnect:{ addListener(f){ port._d=f; } },
              postMessage(msg){ setTimeout(()=>window.__stream(port), 60); },
              disconnect(){ port._d && port._d(); }
            };
            return port;
          }
        }
      };
    """)

    # --- 流式模拟器：首字延迟 -> 逐段 delta -> done（走 panel 真实代码路径）---
    final_json = json.dumps(CANDIDATES, ensure_ascii=False)
    await pg.add_script_tag(content="""
      window.__stream = function(port){
        const full = %s;
        const steps = 14, per = Math.ceil(full.length / steps);
        let i = 0;
        const step = () => {
          i++;
          port._m && port._m({ type:'delta', text: full.slice(0, i*per) });
          if (i*per < full.length) setTimeout(step, 150);
          else setTimeout(() => {
            port._m && port._m({ type:'done', list: %s,
                                 elapsedMs: 8200, model: 'GLM-5.3-Flash' });
          }, 260);
        };
        setTimeout(step, 1100);   // 首字延迟，期间面板显示 loading
      };
    """ % (final_json, final_json))

    for rel in SCRIPTS:
        await pg.add_script_tag(content=open(os.path.join(ROOT, rel), encoding="utf-8").read())

    async def shot(name):
        await pg.wait_for_timeout(120)
        p = os.path.join(WORK, name + ".png")
        await pg.screenshot(path=p)
        print("  渲染:", name)
        return p

    # ① 时间线（无弹层）
    await shot("s1_timeline")

    # ② 点回复气泡 -> 弹层打开（带入场动画）
    await pg.evaluate("""() => {
        document.getElementById('scrim').classList.add('on');
        document.getElementById('dlg').classList.add('on');
    }""")
    await pg.wait_for_timeout(320)
    await shot("s2_dialog")

    # ③ 面板自动出现（就绪态）
    await pg.evaluate("""async () => {
        await XAI.panel.open({ dialog: document.getElementById('dlg'),
                               editor: document.getElementById('ed'), isReply: true });
    }""")
    await pg.wait_for_timeout(500)
    await shot("s3_panel")

    # ④ 点一个风格按钮（真实交互）
    await pg.evaluate("""() => {
        const b = document.querySelector('.xai-grp__b[data-v="sharp"]');
        if (b) b.click();
    }""")
    await pg.wait_for_timeout(260)
    await shot("s4_style")

    # ⑤ 点「生成回复」-> 真实 loading UI。
    #    在首字到达前（模拟器 1.1s 才吐第一个 delta）截图，
    #    这样是干净的「生成中 + 计时」态；若等到 1.5s 会截到流式中的半截文本，观感差。
    await pg.evaluate("() => { XAI.panel.generate(); }")
    await pg.wait_for_timeout(800)
    await shot("s5_loading")
    await pg.wait_for_timeout(3500)          # 等流式跑完

    # ⑥ 多条候选
    await pg.evaluate("""async () => {
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    }""")
    await shot("s6_results")

    # ⑦ 点第一条 -> 回填输入框
    await pg.evaluate("() => XAI.panel.use(0)")
    await pg.wait_for_timeout(420)
    await shot("s7_filled")


# ---------------------------------------------------------------- 背景音乐
def make_music(total_sec):
    """
    合成氛围电子背景音乐：4 个和弦铺底 + 低音呼吸，首尾淡入淡出。
    用 ffmpeg sine 叠加，无版权风险。
    """
    wav = os.path.join(WORK, "music.wav")
    segs = []
    chords = [   # Am9 - Fmaj7 - Cmaj7 - G6
        (110.00, [220.00, 261.63, 329.63, 493.88]),
        (87.31,  [174.61, 220.00, 261.63, 329.63]),
        (130.81, [261.63, 329.63, 392.00, 493.88]),
        (98.00,  [196.00, 246.94, 293.66, 329.63]),
    ]
    cd = 7.0
    for i, (bass, notes) in enumerate(chords):
        out = os.path.join(WORK, "chord%d.wav" % i)
        inputs = []
        for f in [bass] + notes:
            inputs += ["-f", "lavfi", "-i", "sine=f=%.2f:d=%.2f" % (f, cd)]
        # 注意：ffmpeg 的 sine 源幅度固定为 1/8 且**不可配置**，
        # 所以要用 volume 补偿 8 倍才能达到期望电平。
        fc = ("[0:a]volume=1.6,afade=t=in:st=0:d=0.9,afade=t=out:st=%.2f:d=1.1[bass];"
              "[1:a][2:a][3:a][4:a]amix=4:normalize=0,volume=0.6,"
              "afade=t=in:st=0:d=1.8,afade=t=out:st=%.2f:d=1.6[pad];"
              "[bass][pad]amix=2:normalize=0[m]" % (cd - 1.1, cd - 1.6))
        r = subprocess.run([FFMPEG, "-y"] + inputs
                           + ["-filter_complex", fc, "-map", "[m]", "-t", "%.2f" % cd,
                              "-ar", "44100", "-ac", "2", out],
                           capture_output=True, text=True, errors="replace")
        if r.returncode != 0 or not os.path.exists(out):
            print("和弦 %d 生成失败:\n%s" % (i, (r.stderr or "")[-800:]))
            return None
        segs.append(out)

    lst = os.path.join(WORK, "chords.txt")
    with open(lst, "w", encoding="utf-8") as f:
        for s in segs:
            f.write("file '%s'\n" % s.replace("\\", "/"))
    r = subprocess.run([FFMPEG, "-y", "-f", "concat", "-safe", "0", "-i", lst,
                        "-af", "afade=t=in:st=0:d=1.2,afade=t=out:st=%.2f:d=1.6,"
                               "volume=0.9,atrim=0:%.2f" % (total_sec - 1.6, total_sec),
                        "-ar", "44100", "-ac", "2", wav],
                       capture_output=True, text=True, errors="replace")
    if r.returncode != 0 or not os.path.exists(wav):
        print("音乐合成失败:\n%s" % (r.stderr or "")[-800:])
        return None
    return wav


# ---------------------------------------------------------------- 组装
def main():
    async def do_render():
        from playwright.async_api import async_playwright
        async with async_playwright() as p:
            b = await p.chromium.launch()
            pg = await b.new_page(viewport={"width": W, "height": H}, device_scale_factor=1)
            await pg.set_content(X_PAGE)
            await pg.wait_for_timeout(150)
            await render_states(pg)
            await b.close()

    print("渲染各状态…")
    asyncio.run(do_render())

    frames = []
    for name, dur, cap in SHOTS:
        p = os.path.join(WORK, name + ".png")
        if not os.path.exists(p):
            print("缺少帧:", p)
            return 1
        add_caption(fit_to_canvas(Image.open(p)), cap).save(p)
        frames.append((p, dur))
        print("  镜头 %-12s %.1fs  「%s」" % (name, dur, cap))

    ec = os.path.join(WORK, "endcard.png")
    make_endcard().save(ec)
    frames.append((ec, ENDCARD_DUR))
    print("  结尾卡 %.1fs" % ENDCARD_DUR)

    total = sum(d for _, d in frames) - TRANS * (len(frames) - 1)
    print("\n总时长: %.1f 秒" % total)

    inputs = []
    for path, dur in frames:
        inputs += ["-loop", "1", "-framerate", str(FPS), "-t", "%.3f" % dur, "-i", path]

    fc, prev = [], None
    for i in range(len(frames)):
        n = int(round(frames[i][1] * FPS))
        fc.append("[%d:v]scale=3840:2160:flags=lanczos,"
                  "zoompan=z='1+%.4f*on/%d':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':"
                  "d=1:s=1920x1080:fps=%d,setsar=1[v%d]" % (i, ZOOM_AMOUNT, n, FPS, i))
        if i > 0:
            off = sum(d for _, d in frames[:i]) - TRANS * i
            fc.append("[%s][v%d]xfade=transition=fade:duration=%.3f:offset=%.3f[x%d]"
                      % (prev, i, TRANS, off, i))
            prev = "x%d" % i
        else:
            prev = "v0"
    fc.append("[%s]fade=t=in:st=0:d=0.6,fade=t=out:st=%.3f:d=0.9,format=yuv420p[vout]"
              % (prev, total - 0.9))

    silent = os.path.join(WORK, "silent.mp4")
    r = subprocess.run([FFMPEG, "-y"] + inputs
                       + ["-filter_complex", ";".join(fc), "-map", "[vout]",
                          "-c:v", "libx264", "-preset", "medium", "-crf", "20",
                          "-pix_fmt", "yuv420p", "-r", str(FPS), silent],
                       capture_output=True, text=True, errors="replace")
    if r.returncode != 0 or not os.path.exists(silent):
        print("视频合成失败:\n%s" % (r.stderr or "")[-1500:])
        return 1

    music = make_music(total)
    if not music:
        print("背景音乐生成失败，中止（避免残留旧文件）")
        return 1

    out = os.path.join(OUT_DIR, "promo-video.mp4")
    # 先删旧文件，防止合成失败时旧视频被误当成新成果
    if os.path.exists(out):
        os.remove(out)
    r2 = subprocess.run([FFMPEG, "-y", "-i", silent, "-i", music,
                         "-filter_complex",
                         "[1:a]volume=1.0,afade=t=in:st=0:d=0.8,"
                         "afade=t=out:st=%.2f:d=1.2,alimiter=limit=0.95[a]"
                         % (total - 1.2),
                         "-map", "0:v", "-map", "[a]", "-shortest",
                         "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
                         "-movflags", "+faststart", out],
                        capture_output=True, text=True, errors="replace")
    if r2.returncode != 0 or not os.path.exists(out):
        print("音画合成失败:\n%s" % (r2.stderr or "")[-1500:])
        return 1

    print("\n✅ 视频已生成:", out)
    print("   大小: %.2f MB" % (os.path.getsize(out) / 1024 / 1024))
    info = subprocess.run([FFMPEG, "-hide_banner", "-i", out],
                          capture_output=True, text=True, encoding="utf-8", errors="replace")
    for line in (info.stderr or "").splitlines():
        if "Duration" in line or "Video:" in line or "Audio:" in line:
            print("   ", line.strip()[:118])
    return 0


if __name__ == "__main__":
    sys.exit(main())
