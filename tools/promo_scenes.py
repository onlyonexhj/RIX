"""Render fictional, offline product-demo scenes using the current extension UI.

No persistent browser, account, cookie export, real API request, or publication is used.
The returned coordinates are relative to each PNG, ready for a compositor's pointer.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import math
from pathlib import Path
from typing import Any

from playwright.async_api import async_playwright


ROOT = Path(__file__).resolve().parents[1]
VIEWPORT = {"width": 1600, "height": 900}
FIXTURE_URL = "https://x.com/demo/ai-reply"
TWEET = {
    "author": "小林",
    "handle": "@demo_dev",
    "text": "周末做了一个小工具，把重复的工作交给 AI，终于有时间认真打磨细节。",
    "url": "https://x.com/demo_dev/status/1000000000000000001",
    "time": "2026-10-18T08:00:00.000Z",
    "media": [],
    "images": [],
}
CANDIDATES = [
    "工具替我加班，我替它喝咖啡，这才叫周末。",
    "把重复步骤自动化，才有余力把体验做细。",
    "省下来的时间，用在真正喜欢的事情上，真好。",
]
PERSONA = "独立开发者。表达直接、自然，不使用夸张修辞。"
SEED_CONFIG = {
    "enabled": True,
    "autoGenerate": True,
    "autoInsertFirst": False,
    "stream": True,
    "style": "auto",
    "count": 3,
    "lang": "zh",
    "model": "演示模型",
    "apiKey": "FAKE_DEMO_KEY_NOT_REAL",
    "maxTokens": 4000,
    "proxyMode": "auto",
    "debug": False,
}
CONTENT_SCRIPTS = [
    "src/shared/config.js", "src/shared/utils.js", "src/content/detector.js",
    "src/content/editor.js", "src/content/panel.js", "src/content/main.js",
]


FIXTURE_HTML = """<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<title>X AI 回复助手 · 虚构演示</title><style>
*{box-sizing:border-box}body{margin:0;background:#080d13;color:#e7e9ea;
font:16px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif}
button{font:inherit;cursor:pointer}a{color:inherit;text-decoration:none}
.app{width:1360px;height:770px;margin:64px auto;display:grid;grid-template-columns:210px 670px 1fr;
border:1px solid #22303d;border-radius:22px;overflow:hidden;background:#080d13}
.sidebar{padding:26px 24px;border-right:1px solid #22303d;display:flex;flex-direction:column;gap:20px}
.brand{font-size:30px;font-weight:800;margin:0 0 8px}.navitem{font-size:18px;color:#a9b7c5}
.navitem.active{color:#e7e9ea;font-weight:700}.navitem span{display:inline-block;width:33px;color:#718497}
.navpost{background:#1d9bf0;border:0;border-radius:26px;color:white;font-weight:700;padding:11px;margin-top:10px}
.identity{margin-top:auto;color:#718497;font-size:13px}.feed{border-right:1px solid #22303d}
.feedhead{height:76px;border-bottom:1px solid #22303d;display:flex;align-items:center;
padding:0 27px;gap:40px;font-size:17px;font-weight:700}.feedhead span:last-child{color:#718497;font-weight:500}
article{padding:28px 27px 23px;border-bottom:1px solid #22303d;display:flex;gap:14px}
.avatar{width:43px;height:43px;flex:none;border-radius:14px;display:grid;place-items:center;
background:linear-gradient(135deg,#1d9bf0,#7856ff);color:#fff;font-size:18px;font-weight:700}
.avatar.green{background:linear-gradient(135deg,#208f85,#68b481)}.avatar.gold{background:linear-gradient(135deg,#b97c3e,#d6b173)}
.tweetmain{min-width:0;flex:1}.username{font-weight:700;font-size:16px}.handle{color:#718497;font-weight:400;margin-left:9px;font-size:14px}
.time{font-size:13px;color:#718497;margin-left:8px}.tweettext{white-space:pre-wrap;margin:8px 0 16px;line-height:1.85;font-size:17px}
.tweettext.muted{color:#afbdca;font-size:16px}.tweetmeta{display:flex;align-items:center;gap:54px;font-size:13px;color:#718497}
.reply{border:0;background:transparent;color:#8da0b2;padding:5px 4px;border-radius:10px;font-size:14px}
.reply:hover{background:#11283a;color:#1d9bf0}.side{padding:25px}.search{background:#15202b;border:1px solid #253442;
border-radius:24px;padding:11px 16px;color:#718497;font-size:14px}.sidecard{margin-top:24px;padding:18px;border:1px solid #253442;border-radius:16px}
.sidecard h3{font-size:17px;margin:0 0 16px}.topic{margin:13px 0;font-size:14px;color:#afbdca}.topic small{display:block;color:#657b8e;font-size:12px}
.scrim{position:fixed;inset:0;background:rgba(28,44,58,.58);display:none;z-index:50}
.dialog{position:fixed;left:calc(50% + 190px);top:150px;transform:translateX(-50%);width:590px;
background:#0b1219;border:1px solid #38444d;border-radius:19px;display:none;z-index:60;box-shadow:0 20px 80px #0008}
.scrim.open,.dialog.open{display:block}.dialogbar{height:48px;border-bottom:1px solid #253442;display:flex;align-items:center;justify-content:space-between;padding:0 20px}
.close-dialog{background:transparent;border:0;color:#c5d0da;font-size:20px}.draft-label{font-size:13px;color:#718497}
.original{padding:22px 22px 5px;display:flex;gap:12px}.original .tweettext{font-size:16px;line-height:1.75;margin-bottom:10px}
.reply-context{font-size:13px;color:#657b8e;padding:0 24px 13px 78px}.reply-context span{color:#1d9bf0}
.compose-row{display:flex;gap:12px;padding:12px 22px 10px}.compose-row .avatar{width:39px;height:39px;background:#233c4b}
.editor{min-height:116px;outline:none;flex:1;padding:5px 0;color:#e7e9ea;font-size:17px;white-space:pre-wrap;line-height:1.85}
.editor:empty:before{content:attr(data-placeholder);color:#657b8e;pointer-events:none}
.composer-footer{display:flex;align-items:center;border-top:1px solid #253442;margin:0 22px;padding:15px 0 18px;gap:15px}
.composer-tools{color:#1d9bf0;letter-spacing:12px;font-size:17px}.counter{margin-left:auto;color:#657b8e;font-size:12px}
.post-button{border:0;padding:8px 24px;border-radius:25px;background:#1d9bf0;color:#fff;font-weight:700;font-size:14px}
.post-button:disabled{opacity:.38;cursor:default}
</style></head><body>
<main class="app">
<aside class="sidebar"><div class="brand">𝕏</div><div class="navitem active"><span>⌂</span>首页</div>
<div class="navitem"><span>⌕</span>探索</div><div class="navitem"><span>♧</span>通知</div>
<div class="navitem"><span>✉</span>消息</div><div class="navitem"><span>▧</span>书签</div>
<div class="navitem"><span>♙</span>个人资料</div><button class="navpost" disabled>发帖</button>
<div class="identity">演示账号<br>@sample_viewer</div></aside>
<section class="feed"><div class="feedhead"><span>为你推荐</span><span>正在关注</span></div>
<article data-testid="tweet" id="demo-tweet"><div class="avatar">林</div><div class="tweetmain">
<div data-testid="User-Name"><span class="username">小林</span><span class="handle">@demo_dev</span></div>
<a href="https://x.com/demo_dev/status/1000000000000000001"><time class="time" datetime="2026-10-18T08:00:00Z">刚刚</time></a>
<div class="tweettext" data-testid="tweetText">__TWEET__</div>
<div class="tweetmeta"><button class="reply" data-testid="reply" id="reply-demo" aria-label="Reply">◯ 回复</button><span>↻ 12</span><span>♡ 48</span><span>▥ 1,240</span></div></div></article>
<article><div class="avatar green">安</div><div class="tweetmain"><div class="username">安然<span class="handle">@demo_notes</span></div>
<div class="tweettext muted">做小而有用的东西，慢慢来，也能走得很远。</div><div class="tweetmeta"><span>◯ 8</span><span>↻ 5</span><span>♡ 36</span></div></div></article>
<article><div class="avatar gold">北</div><div class="tweetmain"><div class="username">北辰<span class="handle">@sample_maker</span></div>
<div class="tweettext muted">把灵感记下来，再给它一点耐心。</div><div class="tweetmeta"><span>◯ 6</span><span>↻ 3</span><span>♡ 27</span></div></div></article>
</section><aside class="side"><div class="search">⌕　搜索</div><div class="sidecard"><h3>正在讨论</h3>
<div class="topic">#独立开发<small>做一点有用的小东西</small></div><div class="topic">#自动化<small>把时间还给创造力</small></div>
<div class="topic">#周末计划<small>给灵感留一点空间</small></div></div></aside></main>
<div class="scrim" id="scrim"></div>
<div class="dialog" id="reply-dialog" role="dialog" aria-modal="true" aria-label="回复小林">
<div class="dialogbar"><button class="close-dialog" id="close-dialog" aria-label="关闭">×</button><span class="draft-label">回复</span></div>
<div class="original"><div class="avatar">林</div><div class="tweetmain" data-testid="tweet">
<div data-testid="User-Name"><span class="username">小林</span><span class="handle">@demo_dev</span></div>
<a href="https://x.com/demo_dev/status/1000000000000000001"><time class="time" datetime="2026-10-18T08:00:00Z">刚刚</time></a>
<div class="tweettext" data-testid="tweetText">__TWEET__</div></div></div>
<div class="reply-context" data-testid="replyContextBar">回复 <span>@demo_dev</span></div>
<div class="compose-row"><div class="avatar">我</div><div class="editor" id="reply-editor" data-testid="tweetTextarea_0"
role="textbox" contenteditable="true" aria-multiline="true" data-placeholder="写下你的回复"></div></div>
<div class="composer-footer"><div class="composer-tools">▧ ◉ ☺</div><span class="counter" data-testid="tweet-textarea-counter" id="counter">0/280</span>
<button class="post-button" id="publish-demo" data-testid="tweetButton" disabled>回复</button></div></div>
<script>
document.getElementById('reply-demo').addEventListener('click',()=>{
  document.getElementById('scrim').classList.add('open');
  document.getElementById('reply-dialog').classList.add('open');
});
document.getElementById('close-dialog').addEventListener('click',()=>{
  document.getElementById('scrim').classList.remove('open');
  document.getElementById('reply-dialog').classList.remove('open');
});
document.getElementById('reply-editor').addEventListener('input',e=>{
  document.getElementById('counter').textContent=(e.currentTarget.innerText||'').length+'/280';
});
document.getElementById('publish-demo').addEventListener('click',()=>{throw new Error('Publication is disabled in this demo');});
</script></body></html>""".replace("__TWEET__", TWEET["text"])


MOCK_JS = r"""(() => {
  const seed = __SEED__;
  const sample = __TWEET__;
  const originals = __CANDIDATES__;
  const key = 'xai_config';
  const store = {[key]: {...seed}};
  const events = () => {
    const listeners = new Set();
    return {addListener: fn => listeners.add(fn), removeListener: fn => listeners.delete(fn),
      emit: (...args) => [...listeners].forEach(fn => fn(...args))};
  };
  const onChanged = events();
  const demo = window.__promo = {tasks: [], saved: [], messages: [], previewCount: 0, latest: null};
  let writes = Promise.resolve();
  const config = () => Object.assign({}, window.XAI?.defaults || seed, store[key]);
  const candidates = (payload) => {
    const style = payload.extra?.style || config().style;
    const choices = style === 'pro' ? [originals[1],
      '把注意力从重复操作转向产品细节，是自动化真正的价值。',
      '先让流程稳定下来，再把省下的时间投入体验优化。'] : style === 'humor' ? [originals[0],
      'AI 负责重复劳动，我负责把周末过得像个周末。',
      '终于不用和复制粘贴较劲，可以认真和细节较劲了。'] : originals;
    return choices.slice(0, Number(payload.extra?.count || config().count || 3));
  };
  const write = (patch, reset=false) => {
    const job = writes.catch(()=>{}).then(async()=>{
      const oldValue = store[key];
      const allowed = Object.fromEntries(Object.entries(patch || {}).filter(([name])=>
        Object.prototype.hasOwnProperty.call(window.XAI?.defaults || seed, name)));
      const next = Object.assign({}, reset ? window.XAI.defaults : config(), allowed);
      store[key] = next;
      demo.saved.push({...allowed});
      onChanged.emit({[key]: {oldValue,newValue:next}}, 'local');
      return {ok:true,data:{...next}};
    });
    writes = job;
    return job;
  };
  const stop = task => {
    if (!task) return;
    task.closed = true;
    for (const timer of task.timers) clearTimeout(timer);
    task.timers.clear();
  };
  const timer = (task,fn,ms) => {
    const id = setTimeout(()=>{task.timers.delete(id);if(!task.closed)fn();},ms);
    task.timers.add(id);
  };
  const chromeMock = {
    storage: {onChanged, local: {
      async get(names) {
        if (typeof names === 'string') return {[names]:store[names]};
        if (Array.isArray(names)) return Object.fromEntries(names.map(name=>[name,store[name]]));
        return {...store};
      },
      async set(bag) { const changes={}; for(const [name,newValue] of Object.entries(bag)){
        changes[name]={oldValue:store[name],newValue};store[name]=newValue;
      } onChanged.emit(changes,'local'); },
    }},
    permissions: {async contains(){return true;},async request(){return true;},async remove(){return true;}},
    proxy: {settings: {async get(){return {levelOfControl:'not_controllable',value:{mode:'system'}};},async set(){},async clear(){}}},
    runtime: {
      getURL(path){return '__ROOT_URI__/'+path;},
      async sendMessage(message) {
        demo.messages.push(message.type);
        if(message.type==='xai:setConfig') return write(message.payload);
        if(message.type==='xai:resetConfig') return write({},true);
        if(message.type==='xai:getConfig') return {ok:true,data:config()};
        if(message.type==='xai:cancel') {
          const task=demo.tasks.find(item=>item.id===message.payload?.taskId);
          if(task){task.cancelled=true;stop(task);}return {ok:true};
        }
        if(message.type==='xai:previewPrompt') {
          demo.previewCount++;
          const prompt=window.XAI.buildPrompt(sample,{...config(),...message.payload?.cfg},message.payload?.extra||{});
          return {ok:true,data:{system:prompt.system,user:prompt.user,n:prompt.n}};
        }
        if(message.type==='xai:proxyGet') return {ok:true,data:{ok:true,mode:'auto',desc:'保持浏览器原有网络设置',levelOfControl:'not_controllable'}};
        if(message.type==='xai:proxyApply'||message.type==='xai:proxyClear') return {ok:true,data:{ok:true,scope:'none',message:'本地演示，不修改网络设置'}};
        if(message.type==='xai:proxyDiagnose') return {ok:true,data:{ok:true,message:'本地演示，不发送网络请求'}};
        if(message.type==='xai:test') return {ok:true,data:{model:'演示模型',elapsedMs:1,text:'本地演示'}};
        if(message.type==='xai:generate') return {ok:true,data:{list:candidates(message.payload),elapsedMs:1,model:'演示模型'}};
        throw new Error('Unsupported offline mock message: '+message.type);
      },
      connect(options) {
        if(options?.name!=='xai:generate') throw new Error('Unexpected port name');
        const port={onMessage:events(),onDisconnect:events(),task:null,
          postMessage(message) {
            if(message.type!=='generate') throw new Error('Unexpected port message');
            const task={id:message.payload.taskId,payload:message.payload,port,closed:false,cancelled:false,
              timers:new Set(),list:candidates(message.payload),stage:'loading',startedAt:performance.now(),emissions:[]};
            port.task=task;demo.tasks.push(task);demo.latest=task;
            timer(task,()=>{
              task.stage='unfinished';
              const text='['+JSON.stringify(task.list[0]).slice(0,8);
              task.emissions.push({type:'delta',text});port.onMessage.emit({type:'delta',text});
            },100);
          },
          disconnect(){stop(port.task);},
        };
        return port;
      },
    },
  };
  Object.defineProperty(window,'chrome',{value:chromeMock,configurable:true});
  demo.config=()=>({...config()});
  demo.release=(stage)=>{
    const task=demo.latest;if(!task||task.closed)throw new Error('No active demonstration request');
    if(stage==='partial'){
      const text='['+JSON.stringify(task.list[0])+(task.list[1]?','+JSON.stringify(task.list[1]).slice(0,7):'');
      task.stage='partial';task.emissions.push({type:'delta',text});task.port.onMessage.emit({type:'delta',text});
    }else if(stage==='done'){
      const text=JSON.stringify(task.list);
      task.emissions.push({type:'delta',text});task.port.onMessage.emit({type:'delta',text});
      task.stage='done';
      task.port.onMessage.emit({type:'done',list:task.list,elapsedMs:Math.round(performance.now()-task.startedAt),model:'演示模型'});
    }else throw new Error('Unknown demo release stage');
  };
})();""".replace("__SEED__", json.dumps(SEED_CONFIG, ensure_ascii=False)).replace(
    "__TWEET__", json.dumps(TWEET, ensure_ascii=False)
).replace("__CANDIDATES__", json.dumps(CANDIDATES, ensure_ascii=False)).replace(
    "__ROOT_URI__", ROOT.as_uri()
)


PANEL_TARGETS = {
    "reply": "#reply-demo", "generate": ".xai-btn--go", "stop": ".xai-btn--stop",
    "auto": ".xai-auto__cb", "style_humor": '[data-k="style"] [data-v="humor"]',
    "style_pro": '[data-k="style"] [data-v="pro"]', "count_3": '[data-k="count"] [data-v="3"]',
    "language": '.xai-sel[data-k="lang"]', "editor": "#reply-editor", "post": "#publish-demo",
    **{f"candidate_{i}": f'.xai-it[data-i="{i}"]' for i in range(3)},
}


async def _targets(page: Any, selectors: dict[str, str], crop: dict[str, int]) -> dict:
    output = {}
    for name, selector in selectors.items():
        locator = page.locator(selector).first
        if not await locator.count() or not await locator.is_visible():
            continue
        box = await locator.bounding_box()
        if not box:
            continue
        cx, cy = box["x"] + box["width"] / 2, box["y"] + box["height"] / 2
        if not (crop["x"] <= cx <= crop["x"] + crop["width"] and crop["y"] <= cy <= crop["y"] + crop["height"]):
            continue
        output[name] = {
            "x": round(box["x"] - crop["x"], 2), "y": round(box["y"] - crop["y"], 2),
            "width": round(box["width"], 2), "height": round(box["height"], 2),
            "cx": round(cx - crop["x"], 2), "cy": round(cy - crop["y"], 2),
        }
    return output


async def _capture(page: Any, out: Path, name: str, selectors: list[str], targets: dict[str, str],
                   *, max_height: int | None = None) -> dict:
    labels = {
        "loading": "正在生成示例回复…",
        "partial": "已收到 1 条完整示例 · 正在生成",
        "results": "3 条示例回复 · 演示模型",
        "filled": "3 条示例回复 · 演示模型",
        "cancelled": "已中止 · 可重新生成",
        "style-humor": "3 条示例回复 · 演示模型",
        "style-pro": "3 条示例回复 · 演示模型",
    }
    if name in labels:
        # Present neutral demonstration text while preserving the real status DOM for validation.
        await page.locator(".xai-st").evaluate(
            "(node,label)=>node.setAttribute('data-promo-label',label)", labels[name])
    await page.evaluate("() => new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))")
    boxes = []
    for selector in selectors:
        locator = page.locator(selector).first
        if await locator.count() and await locator.is_visible():
            box = await locator.bounding_box()
            if box:
                boxes.append(box)
    if not boxes:
        raise AssertionError(f"No visible source element for {name}")
    pad = 10 if name == "prompt-preview" else 26
    left = max(0, math.floor(min(box["x"] for box in boxes)) - pad)
    top = max(0, math.floor(min(box["y"] for box in boxes)) - pad)
    right = min(VIEWPORT["width"], math.ceil(max(box["x"] + box["width"] for box in boxes)) + pad)
    bottom = min(VIEWPORT["height"], math.ceil(max(box["y"] + box["height"] for box in boxes)) + pad)
    if max_height:
        bottom = min(bottom, top + max_height)
    crop = {"x": left, "y": top, "width": right - left, "height": bottom - top}
    if crop["width"] <= 0 or crop["height"] <= 0:
        raise AssertionError(f"Invalid clip for {name}: {crop}")
    image_path = out / f"{name}.png"
    await page.screenshot(path=str(image_path), clip=crop, animations="disabled", caret="hide")
    return {"path": str(image_path), "width": crop["width"], "height": crop["height"],
            "size": [crop["width"], crop["height"]], "crop": crop,
            "targets": await _targets(page, targets, crop)}


async def render_assets(out_dir: str) -> dict:
    """Create validated PNGs and screenshot-relative click targets, entirely offline."""
    out = Path(out_dir).resolve()
    out.mkdir(parents=True, exist_ok=True)
    assets: dict[str, dict] = {}
    page_errors: list[str] = []
    blocked_http: list[str] = []
    fixture_hits = 0
    checks: dict[str, Any] = {}

    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(headless=True)
        context = await browser.new_context(viewport=VIEWPORT, device_scale_factor=1,
                                            color_scheme="dark", locale="zh-CN", service_workers="block")
        await context.add_init_script(script=MOCK_JS)

        async def route_request(route: Any) -> None:
            nonlocal fixture_hits
            url = route.request.url
            if url == FIXTURE_URL:
                fixture_hits += 1
                await route.fulfill(status=200, content_type="text/html; charset=utf-8", body=FIXTURE_HTML)
            elif url.startswith(("http://", "https://")):
                blocked_http.append(url)
                await route.abort("blockedbyclient")
            else:
                await route.continue_()

        await context.route("**/*", route_request)
        page = await context.new_page()
        page.on("pageerror", lambda error: page_errors.append(str(error)))
        await page.goto(FIXTURE_URL, wait_until="domcontentloaded")
        for rel in CONTENT_SCRIPTS:
            await page.add_script_tag(path=str(ROOT / rel))
        await page.add_style_tag(content="""
          .xai-st{font-size:0!important}
          .xai-st::after{content:attr(data-promo-label);font-size:11.5px;color:#8b98a5}
        """)
        await page.wait_for_function("() => window.__xaiInited === true")
        await page.mouse.move(1500, 850)
        assets["timeline"] = await _capture(page, out, "timeline", [".app"], {"reply": "#reply-demo"})

        # This is a native browser click: the fixture opens the modal, then main.js detects it.
        await page.locator("#reply-demo").click()
        await page.wait_for_function("() => window.__promo.latest?.stage === 'unfinished'")
        await page.wait_for_selector(".xai-panel.is-open")
        assert await page.locator('.xai-it[data-i]').count() == 0
        assert await page.locator(".xai-btn--go").is_disabled()
        await page.mouse.move(1500, 850)
        assets["loading"] = await _capture(page, out, "loading", [".xai-panel", "#reply-dialog"], PANEL_TARGETS)
        checks["native_reply_auto_open_and_generate"] = True
        checks["unfinished_json_not_rendered"] = True

        await page.evaluate("() => window.__promo.release('partial')")
        await page.wait_for_function("() => document.querySelectorAll('.xai-it[data-i]').length === 1")
        assert await page.locator('.xai-it[data-i="0"] .xai-it__x').inner_text() == CANDIDATES[0]
        assets["partial"] = await _capture(page, out, "partial", [".xai-panel", "#reply-dialog"], PANEL_TARGETS)
        checks["only_completed_json_candidate_rendered"] = True

        await page.evaluate("() => window.__promo.release('done')")
        await page.wait_for_function("() => !document.querySelector('.xai-btn--go').disabled")
        texts = await page.locator('.xai-it[data-i] .xai-it__x').all_inner_texts()
        assert texts == CANDIDATES, texts
        assert await page.locator(".xai-st").inner_text() and "演示模型" in await page.locator(".xai-st").inner_text()
        assets["results"] = await _capture(page, out, "results", [".xai-panel", "#reply-dialog"], PANEL_TARGETS)
        checks["three_candidates_match"] = True

        used = await page.evaluate("async () => await XAI.panel.use(1)")
        assert used is True
        assert (await page.locator("#reply-editor").inner_text()).strip() == CANDIDATES[1]
        assert await page.locator("#publish-demo").is_disabled()
        await page.mouse.move(1500, 850)
        assets["filled"] = await _capture(page, out, "filled", [".xai-panel", "#reply-dialog"], PANEL_TARGETS)
        checks["await_use_second_candidate_matches_editor"] = True
        checks["publication_disabled"] = True

        # Keep the current editor unchanged; regeneration and cancellation exercise the real controls.
        await page.locator(".xai-btn--go").click()
        await page.wait_for_function("() => window.__promo.latest?.stage === 'unfinished'")
        cancelled_id = await page.evaluate("() => window.__promo.latest.id")
        await page.locator(".xai-btn--stop").click()
        await page.wait_for_function("() => !document.querySelector('.xai-btn--go').disabled")
        assert await page.evaluate("() => window.__promo.latest.closed && window.__promo.latest.cancelled")
        await page.mouse.move(1500, 850)
        assets["cancelled"] = await _capture(page, out, "cancelled", [".xai-panel", "#reply-dialog"], PANEL_TARGETS)
        checks["cancel_restores_controls"] = True

        for style in ("humor", "pro"):
            await page.locator(f'[data-k="style"] .xai-grp__b[data-v="{style}"]').click()
            await page.wait_for_function("style => window.__promo.config().style === style", arg=style)
            await page.locator(".xai-btn--go").click()
            await page.wait_for_function("() => window.__promo.latest?.stage === 'unfinished'")
            assert await page.evaluate("() => window.__promo.latest.id") != cancelled_id
            assert await page.evaluate("() => window.__promo.latest.payload.extra.style") == style
            await page.evaluate("() => window.__promo.release('done')")
            await page.wait_for_function("() => !document.querySelector('.xai-btn--go').disabled")
            assert await page.locator('.xai-it[data-i]').count() == 3
            await page.mouse.move(1500, 850)
            assets[f"style-{style}"] = await _capture(page, out, f"style-{style}", [".xai-panel", "#reply-dialog"], PANEL_TARGETS)
        checks["humor_and_pro_saved_and_sent"] = True
        checks["cancelled_request_stays_closed"] = await page.evaluate(
            "id => window.__promo.tasks.find(task => task.id === id).closed", cancelled_id)
        checks["demo_request_count"] = await page.evaluate("() => window.__promo.tasks.length")

        # Render the real options page from disk with the same local mock installed before scripts.
        options = await context.new_page()
        options.on("pageerror", lambda error: page_errors.append(str(error)))
        await options.goto((ROOT / "src/options/options.html").as_uri(), wait_until="domcontentloaded")
        await options.wait_for_function("() => document.querySelector('#preset').options.length > 3")
        await options.locator("#preset").select_option("deepseek")
        await options.locator("#apiKey").fill("FAKE_DEMO_KEY_NOT_REAL")
        await options.locator("#save").click()
        await options.wait_for_function("() => window.__promo.config().baseUrl === 'https://api.deepseek.com/v1'")
        assert await options.locator("#apiKey").get_attribute("type") == "password"
        assert await options.locator("#model").input_value() == "deepseek-chat"
        assert await options.locator("#maxTokens").input_value() == "4000"
        await options.evaluate("() => window.scrollTo(0, document.querySelector('#welcome').offsetTop - 38)")
        await options.mouse.move(1500, 850)
        assets["providers"] = await _capture(options, out, "providers", ["#welcome"], {
            "preset": "#preset", "provider": "#provider", "base_url": "#baseUrl", "model": "#model", "api_key": "#apiKey",
        }, max_height=520)
        checks["deepseek_preset_saved"] = True
        checks["only_fake_key_masked"] = True
        checks["default_max_tokens_4000"] = True
        checks["providers_crop_excludes_static_warning"] = True

        await options.locator("#persona").fill(PERSONA)
        await options.locator("#customInstruction").fill("每条回复不超过两句话，避免重复原文。")
        await options.locator("#systemPrompt").fill(
            "你是一位中文技术社区创作者。\n"
            "风格：{{styleName}}。输出语言：{{lang}}。\n"
            "围绕原推文写 {{count}} 条自然、具体的回复，避免空泛赞美。\n"
            "仅输出 JSON 字符串数组。")
        await options.locator("#userPrompt").fill(
            "原推文：{{tweet.text}}\n作者：{{tweet.author}}\n补充要求：{{customInstruction}}")
        await options.locator("#save").click()
        await options.wait_for_function("persona => window.__promo.config().persona === persona", arg=PERSONA)
        await options.locator("#preview").click()
        await options.wait_for_function("() => window.__promo.previewCount > 0 && document.querySelector('#pvSystem').textContent.length > 30")
        assert PERSONA in await options.locator("#pvSystem").inner_text()
        assert TWEET["text"] in await options.locator("#pvUser").inner_text()
        await options.evaluate("() => window.scrollTo(0, document.querySelector('#promptCard').offsetTop - 38)")
        await options.mouse.move(1500, 850)
        assets["prompt"] = await _capture(options, out, "prompt", ["#promptCard"], {
            "format": "#promptFormat", "persona": "#persona", "instruction": "#customInstruction",
            "variables": "#varList", "system": "#systemPrompt", "preview": "#preview",
        }, max_height=590)
        checks["persona_saved_and_real_prompt_preview_rendered"] = True

        await options.evaluate("() => window.scrollTo(0, document.querySelector('#previewBox').getBoundingClientRect().top + window.scrollY - 38)")
        await options.mouse.move(1500, 850)
        assets["prompt-preview"] = await _capture(options, out, "prompt-preview", ["#previewBox"], {
            "preview": "#previewBox", "system": "#pvSystem", "user": "#pvUser",
        }, max_height=810)
        checks["real_system_and_user_preview_captured"] = True
        checks["performance_numbers_masked_in_demo_scenes"] = True

        await options.wait_for_timeout(120)
        assert not page_errors, f"Browser page errors: {page_errors}"
        assert fixture_hits == 1, f"Unexpected fixture navigation count: {fixture_hits}"
        checks["no_pageerror"] = True
        checks["fresh_nonpersistent_browser"] = True
        checks["all_http_https_intercepted"] = True
        await context.close()
        await browser.close()

    metadata = {
        "viewport": VIEWPORT, "assets": assets, "paths": {name: asset["path"] for name, asset in assets.items()},
        "checks": checks, "page_errors": page_errors, "blocked_http": blocked_http,
        "demo": {"fictional": True, "model_label": "演示模型", "tweet": TWEET, "candidates": CANDIDATES},
    }
    (out / "metadata.json").write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding="utf-8")
    return metadata


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", default=str(ROOT / "dev/_promo/frames"))
    args = parser.parse_args()
    result = asyncio.run(render_assets(args.out))
    print(json.dumps({"paths": result["paths"], "checks": result["checks"]}, ensure_ascii=False, indent=2))
