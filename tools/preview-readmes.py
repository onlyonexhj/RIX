"""Render the real extension UI with localized, fictional data for every README.

Requires Playwright and its Chromium browser. No API requests, browser profiles,
real credentials, or browser proxy changes are used. Run from any directory:
    python tools/preview-readmes.py
    python tools/preview-readmes.py --language en
"""
import argparse
import asyncio
import html
import json
from pathlib import Path

from playwright.async_api import async_playwright, expect

from readme_screenshot_data import SCENES


ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = [
    "shared/config.js", "shared/utils.js", "shared/i18n.js",
    "content/detector.js", "content/editor.js", "content/panel.js",
]

# Only the surrounding X-like demonstration page is a fixture. The extension
# panel and settings cards below use the repository's unmodified HTML/CSS/JS.
PANEL_HTML = """<!DOCTYPE html>
<html lang="__language__"><head><meta charset="utf-8"><style>
*{box-sizing:border-box}
body{margin:0;background:#000;color:#e7e9ea;font:15px/1.5 system-ui,sans-serif}
.timeline{width:600px;margin:0 auto;opacity:.3}
.home{font-size:20px;font-weight:750;padding:20px;border-bottom:1px solid #2f3336}
.tweet{display:flex;gap:12px;padding:20px;border-bottom:1px solid #2f3336}
.avatar{height:44px;width:44px;flex:none;border-radius:50%;background:linear-gradient(135deg,#1d9bf0,#7856ff)}
.photo{background:linear-gradient(135deg,#ff7a45,#f91880)}
.name{font-weight:700}.handle,.time{color:#71767b;font-size:14px}
.text{margin:8px 0 20px;white-space:pre-wrap}.actions{color:#71767b;word-spacing:48px}
.shade{position:fixed;inset:0;background:#0004}
.dialog{position:absolute;left:670px;top:100px;width:600px;min-height:520px;
background:#15202b;border:1px solid #38444d;border-radius:16px;padding:20px;
box-shadow:0 15px 50px #0007}
.dialog-head{display:flex;justify-content:space-between;margin-bottom:26px}
.drafts{color:#1d9bf0;font-weight:700}.original{display:flex;gap:12px}
.original>div:last-child{flex:1;min-width:0}.original .text{font-size:17px}
.reply{display:flex;gap:12px;margin:22px 0 34px}
.editor{min-height:110px;flex:1;outline:none;font-size:17px;white-space:pre-wrap}
.editor:empty:before{content:attr(data-placeholder);color:#71767b}
.tools{border-top:1px solid #38444d;padding-top:15px;display:flex;align-items:center;gap:18px;color:#1d9bf0}
.post{border:0;border-radius:999px;background:#e7e9ea;color:#0f1419;padding:10px 22px;
font:700 15px system-ui;margin-left:auto}.counter{color:#71767b;font-size:13px}
</style></head><body>
<div class="timeline"><div class="home">__home__</div>
  <div class="tweet"><div class="avatar"></div><div><span class="name">__author__</span>
    <span class="handle">@penguin_dev · __ago_one__</span><div class="text">__tweet__</div>
    <div class="actions">♡ 24 ↻ 8</div></div></div>
  <div class="tweet"><div class="avatar photo"></div><div><span class="name">__photographer__</span>
    <span class="handle">@photo_cat · __ago_two__</span><div class="text">__photo_tweet__</div>
    <div class="actions">♡ 68 ↻ 12</div></div></div>
</div><div class="shade"></div>
<div class="dialog" role="dialog" aria-modal="true" aria-label="__reply_button__">
  <div class="dialog-head"><span>✕</span><span class="drafts">__drafts__</span></div>
  <div class="original" data-testid="tweet"><div class="avatar"></div><div>
    <div data-testid="User-Name"><span class="name">__author__</span> <span class="handle">@penguin_dev</span></div>
    <time class="time" datetime="2026-10-18T08:00:00.000Z">__ago_one__</time>
    <div class="text" data-testid="tweetText">__tweet__</div>
  </div></div>
  <div class="reply"><div class="avatar photo"></div>
    <div class="editor" id="editor" data-testid="tweetTextarea_0" contenteditable="true"
      role="textbox" aria-multiline="true" data-placeholder="__reply_placeholder__"></div>
  </div>
  <div class="tools"><span>▧</span><span>GIF</span><span>☷</span>
    <span class="counter" data-testid="tweet-textarea-counter">0</span>
    <button class="post" data-testid="tweetButton">__reply_button__</button>
  </div>
</div></body></html>"""


def panel_html(language, scene):
    rendered = PANEL_HTML.replace("__language__", language)
    for key, value in scene.items():
        if isinstance(value, str):
            rendered = rendered.replace(f"__{key}__", html.escape(value, quote=True))
    return rendered


def chrome_mock(language, scene):
    config = {
        "uiLang": language, "lang": language, "autoGenerate": False,
        "count": 3, "style": "pro", "apiKey": "", "proxyMode": "auto",
        "persona": scene["persona"], "customInstruction": scene["instruction"],
        "systemPrompt": scene["system_prompt"], "userPrompt": "",
    }
    # Runtime calls are handled locally, and any unexpected call fails loudly.
    return """(() => {
      const store = {xai_config: __CONFIG__};
      const listeners = new Set();
      Object.defineProperty(window, 'chrome', {configurable: true, value: {
        storage: {
          onChanged: {addListener(fn){listeners.add(fn);},removeListener(fn){listeners.delete(fn);}},
          local: {
            async get(key){return {[key]: store[key]};},
            async set(values){Object.assign(store, values);}
          }
        },
        runtime: {
          getURL(path){return __ROOT__ + '/' + path;},
          async sendMessage(message){
            if(message.type === 'xai:setConfig'){
              const oldValue = store.xai_config;
              store.xai_config = {...oldValue, ...message.payload};
              for(const fn of listeners) fn({xai_config: {oldValue, newValue: store.xai_config}}, 'local');
              return {ok: true, data: {...XAI.defaults, ...store.xai_config}};
            }
            if(message.type === 'xai:proxyGet') return {ok: true, data: {
              ok: true, mode: 'system', desc: '跟随系统', levelOfControl: 'controllable_by_this_extension'
            }};
            throw new Error('Unexpected call in offline README renderer: ' + message.type);
          }
        }
      }});
    })();""".replace("__CONFIG__", json.dumps(config, ensure_ascii=False)).replace(
        "__ROOT__", json.dumps(ROOT.as_uri()))


async def stable(page):
    await page.evaluate("""async () => {
      await document.fonts.ready;
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    }""")


async def capture_panel(context, language, scene, output):
    page = await context.new_page()
    await page.set_viewport_size({"width": 1440, "height": 920})
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    try:
        await page.set_content(panel_html(language, scene))
        await page.evaluate(chrome_mock(language, scene))
        for script in SCRIPTS:
            await page.add_script_tag(path=str(ROOT / "src" / script))
        await page.evaluate("""async replies => {
          const composer = XAI.detector.findComposer();
          if(!composer?.isReply || !await XAI.panel.open(composer)) throw new Error('Reply panel did not open');
          await XAI.panel._debugSetResults(replies);
        }""", scene["replies"])
        panel = page.locator(".xai-panel")
        await expect(panel).to_have_attribute("lang", language)
        await expect(page.locator('[data-k="uiLang"]')).to_have_value(language)
        await expect(page.locator('[data-k="lang"]')).to_have_value(language)
        await expect(page.locator('.xai-it__x')).to_have_text(scene["replies"])
        title = await page.evaluate('XAI.i18n.t("RIX")')
        await expect(page.locator('.xai-hd__t')).to_have_text(title)
        await stable(page)
        # Keep both the real panel and reply composer completely in the image.
        bounds = await page.evaluate("""() => {
          const boxes = ['.xai-panel','.dialog'].map(selector => document.querySelector(selector).getBoundingClientRect());
          const left = Math.floor(Math.min(...boxes.map(b => b.left)) - 24);
          const top = Math.floor(Math.min(...boxes.map(b => b.top)) - 24);
          const right = Math.ceil(Math.max(...boxes.map(b => b.right)) + 24);
          const bottom = Math.ceil(Math.max(...boxes.map(b => b.bottom)) + 24);
          if(left < 0 || top < 0 || right > innerWidth || bottom > innerHeight) throw new Error('Screenshot would clip UI');
          return {x:left, y:top, width:right-left, height:bottom-top};
        }""")
        assert await panel.locator('.xai-list').evaluate('(node) => node.scrollHeight <= node.clientHeight + 1'), 'Replies are clipped'
        assert not errors, errors
        await page.screenshot(path=str(output / "panel.png"), clip=bounds, animations="disabled")
    finally:
        await page.close()


async def capture_settings(context, language, scene, output):
    page = await context.new_page()
    await page.set_viewport_size({"width": 1000, "height": 1600})
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    try:
        await page.add_init_script(chrome_mock(language, scene))
        await page.goto((ROOT / "src/options/options.html").as_uri())
        await expect(page.locator("html")).to_have_attribute("lang", language)
        await expect(page.locator("#uiLang")).to_have_value(language)
        await expect(page.locator("#persona")).to_have_value(scene["persona"])
        await expect(page.locator("#systemPrompt")).to_have_value(scene["system_prompt"])
        await expect(page.locator("#proxyState")).to_have_class("test-out is-ok")
        await stable(page)
        for selector, filename in [("#netCard", "network.png"), ("#promptCard", "prompts.png")]:
            card = page.locator(selector)
            # Center the card so the page's fixed Save footer cannot cover it.
            await card.evaluate("node => node.scrollIntoView({block: 'center'})")
            await stable(page)
            # Fail if controls or the custom prompt would be cut off.
            assert await card.evaluate("""node => [...node.querySelectorAll('input,select,textarea,button')].filter(el => el.getClientRects().length).every(el => {
              const box=el.getBoundingClientRect(), card=node.getBoundingClientRect();
              return box.left>=card.left && box.right<=card.right+1;
            })"""), (language, filename, 'control overflow')
            if selector == '#promptCard':
                assert await page.locator('#systemPrompt').evaluate('(el) => el.scrollHeight <= el.clientHeight + 1'), 'Prompt is clipped'
            await card.screenshot(path=str(output / filename), animations="disabled")
        assert not errors, errors
    finally:
        await page.close()


async def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--language", choices=list(SCENES), action="append", help="Only render this language (repeatable)")
    args = parser.parse_args()
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch()
        try:
            for language in args.language or SCENES:
                scene = SCENES[language]
                output = ROOT / "dev/screenshots" / language
                output.mkdir(parents=True, exist_ok=True)
                context = await browser.new_context(locale=scene["locale"], device_scale_factor=2, color_scheme="dark")
                try:
                    await context.route('https://**/*', lambda route: route.abort())
                    await context.route('http://**/*', lambda route: route.abort())
                    await capture_panel(context, language, scene, output)
                    await capture_settings(context, language, scene, output)
                    print(f"{language}: panel.png, network.png, prompts.png - rendered and checked", flush=True)
                finally:
                    await context.close()
        finally:
            await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
