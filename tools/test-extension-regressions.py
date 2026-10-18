"""Fresh Chromium profiles only; no real AI calls or existing browser sessions."""
import asyncio
import pathlib
import runpy

from playwright.async_api import async_playwright


ROOT = pathlib.Path(__file__).resolve().parent.parent
FIXTURE = runpy.run_path(str(ROOT / 'tools' / 'test-e2e.py'))['MOCK_HTML']
passed = 0


def check(name, condition):
    global passed
    assert condition, name
    passed += 1
    print('PASS ' + name, flush=True)


async def main():
    async with async_playwright() as p:
        ctx = await p.chromium.launch_persistent_context(
            '', headless=True, channel='chromium', locale='zh-CN',
            args=['--headless=new', '--disable-extensions-except=' + str(ROOT),
                  '--load-extension=' + str(ROOT), '--no-sandbox'])
        try:
            await ctx.route('https://**/*', lambda route: route.abort())
            await ctx.route('http://**/*', lambda route: route.abort())
            workers = ctx.service_workers
            if not workers:
                workers = [await ctx.wait_for_event('serviceworker', timeout=10000)]
            origin = workers[0].url.split('/src/')[0]
            options = await ctx.new_page()
            errors = []
            options.on('pageerror', lambda e: errors.append(str(e)))
            await options.goto(origin + '/src/options/options.html')
            await options.wait_for_function('document.querySelector("#style").options.length === 9')
            await options.evaluate('() => XAI.resetConfig()')
            await options.reload()
            await options.wait_for_function('document.querySelector("#style").options.length === 9')
            popup = await ctx.new_page()
            await popup.goto(origin + '/src/popup/popup.html')
            await popup.wait_for_function('document.querySelector("#style").options.length === 9')

            await asyncio.gather(
                options.evaluate('() => XAI.setConfig({autoGenerate:false})'),
                popup.evaluate('() => XAI.setConfig({count:5})'))
            config = await options.evaluate('() => XAI.getConfig()')
            check('真实扩展多页面配置保存保留所有补丁',
                  config['autoGenerate'] is False and config['count'] == 5)

            # The options form predates the other page's changes.
            await options.select_option('#style', 'humor')
            await options.click('#save')
            config = await options.evaluate('() => XAI.getConfig()')
            check('设置页旧表单不覆盖其他页面的新配置',
                  config['autoGenerate'] is False and config['count'] == 5 and config['style'] == 'humor')

            await options.select_option('#proxyMode', 'direct')
            await options.wait_for_timeout(700)
            check('未确认代理模式不会被自动保存',
                  await options.evaluate('async () => (await XAI.getConfig()).proxyMode') == 'auto')
            decisions = {'accept': False}

            async def handle_dialog(dialog):
                if decisions['accept']:
                    await dialog.accept()
                else:
                    await dialog.dismiss()

            options.on('dialog', handle_dialog)
            await options.click('#proxyApply')
            await options.wait_for_function('document.querySelector("#proxyState").textContent.includes("取消")')
            await options.click('#save')
            check('拒绝代理确认后普通保存仍不启用直连',
                  await options.evaluate('async () => (await XAI.getConfig()).proxyMode') == 'auto')

            await options.select_option('#preset', 'anthropic')
            await options.select_option('#preset', 'custom')
            await options.click('#save')
            check('Claude 切自定义会更新协议',
                  await options.evaluate('async () => (await XAI.getConfig()).provider') == 'openai')

            await options.fill('#apiKey', 'FAKE_REGRESSION_KEY')
            decisions['accept'] = True
            await options.click('#reset')
            await options.wait_for_timeout(900)
            config = await options.evaluate('() => XAI.getConfig()')
            check('重置后防抖保存不会恢复旧凭据',
                  config['apiKey'] == '' and await options.input_value('#apiKey') == '')
            check('真实设置页交互无脚本异常', not errors)
        finally:
            await ctx.close()

        browser = await p.chromium.launch()
        try:
            page = await browser.new_page(viewport={'width': 1920, 'height': 1000})
            await page.route('https://**/*', lambda route: route.abort())
            await page.set_content(FIXTURE)
            for name in ['shared/config.js', 'shared/utils.js', 'content/detector.js', 'content/editor.js']:
                await page.add_script_tag(content=(ROOT / 'src' / name).read_text(encoding='utf-8'))
            await page.evaluate('''() => {
                window.fakeCfg = {...XAI.defaults, style:'humor', autoGenerate:false, stream:true};
                XAI.getConfig = async () => ({...fakeCfg});
                XAI.setConfig = async patch => Object.assign(fakeCfg, patch);
                window.fakePorts = [];
                window.chrome = {runtime:{
                    async sendMessage(){return {ok:true};},
                    connect(){
                        const listeners=[];
                        const port={onMessage:{addListener(f){listeners.push(f);}},
                            onDisconnect:{addListener(){}}, postMessage(m){this.payload=m.payload;},
                            disconnect(){this.closed=true;}, emit(m){listeners.forEach(f=>f(m));}};
                        fakePorts.push(port);return port;
                    }
                }};
            }''')
            await page.add_script_tag(content=(ROOT / 'src/content/panel.js').read_text(encoding='utf-8'))
            await page.evaluate('() => XAI.panel.open(XAI.detector.findComposer())')
            await page.click('[data-k="count"] [data-v="5"]')
            await page.click('[data-k="style"] [data-v="sharp"]')
            await page.select_option('[data-k="lang"]', 'en')
            await page.click('.xai-btn--go')
            await page.wait_for_function('fakePorts.length === 1')
            extra = await page.evaluate('() => fakePorts[0].payload.extra')
            check('真实面板发送最新风格条数和语言',
                  extra['style'] == 'sharp' and extra['count'] == 5 and extra['lang'] == 'en')
            await page.evaluate('() => fakePorts[0].emit({type:"delta",text:\'["incomplete\'})')
            check('流式残片不可点击回填', await page.locator('.xai-it[data-i]').count() == 0)
            await page.evaluate('() => fakePorts[0].emit({type:"delta",text:\'["complete reply", "SKIP", "incomplete\'})')
            check('仅完整且非 SKIP 的字符串显示为候选',
                  await page.locator('.xai-it[data-i]').count() == 1 and
                  await page.locator('.xai-it[data-i="0"] .xai-it__x').inner_text() == 'complete reply')
            await page.click('.xai-btn--stop')
            check('中止后生成按钮立即恢复可用', not await page.locator('.xai-btn--go').is_disabled())
            await page.click('.xai-btn--go')
            await page.wait_for_function('fakePorts.length === 2')
            check('中止后可重新生成', await page.evaluate('() => fakePorts[0].closed === true'))
            await page.click('.xai-btn--stop')
            await page.evaluate('''() => {
                const save = XAI.setConfig;
                let failed = false;
                XAI.setConfig = patch => {
                    if (!failed) { failed = true; return Promise.reject(new Error('temporary save failure')); }
                    return save(patch);
                };
            }''')
            await page.click('[data-k="count"] [data-v="2"]')
            await page.click('.xai-btn--go')
            await page.wait_for_function('fakePorts.length === 3')
            check('临时保存失败后可重试生成且保留选项',
                  await page.evaluate('() => fakePorts[2].payload.extra.count') == 2)
            await page.evaluate('() => XAI.panel.close()')

            await page.evaluate('''() => {
                const dlg = document.querySelector('#dlg');
                dlg.setAttribute('aria-label', 'Compose');
                dlg.innerHTML = '<div contenteditable="true" data-testid="tweetTextarea_0" role="textbox"></div>' +
                    '<div data-testid="quoteTweet"><div data-testid="tweetText">quoted post</div></div>';
            }''')
            check('编辑器下方的引用卡片不会触发回复识别',
                  await page.evaluate('() => XAI.detector.findComposer().isReply') is False)
            await page.evaluate('''() => {
                const dlg = document.querySelector('#dlg');
                dlg.innerHTML = '<div data-testid="tweetText">reply target</div>' +
                    '<div contenteditable="true" data-testid="tweetTextarea_0" role="textbox"></div>';
            }''')
            check('编辑器上方的原推文仍能识别为回复',
                  await page.evaluate('() => XAI.detector.findComposer().isReply') is True)

            await page.evaluate('''() => {
                document.querySelector('#dlg').innerHTML =
                    '<div data-testid="tweet"><div data-testid="User-Name">Outer @outer</div>' +
                    '<a href="https://x.com/outer/status/123"><time datetime="2026-10-17T01:00:00Z">today</time></a>' +
                    '<div data-testid="tweetText">outer author comment</div>' +
                    '<div data-testid="quoteTweet"><div data-testid="User-Name">Inner @inner</div>' +
                    '<div data-testid="tweetText">nested quoted post</div></div></div>' +
                    '<div contenteditable="true" data-testid="tweetTextarea_0" role="textbox"></div>';
            }''')
            target = await page.evaluate('() => XAI.detector.extractTargetTweet(XAI.detector.findComposer())')
            check('回复引用推文时读取外层原作者和正文',
                  target['text'] == 'outer author comment' and target['handle'] == '@outer' and
                  target['url'].endswith('/status/123'))

            await page.evaluate('''() => {
                document.querySelector('#dlg').remove();
                XAI.utils.isXDomain = () => true;
                fakeCfg.showFloatingButton = true;
                chrome.storage = {onChanged:{addListener(){}}};
            }''')
            await page.add_style_tag(content=(ROOT / 'src/content/content.css').read_text(encoding='utf-8'))
            await page.add_script_tag(content=(ROOT / 'src/content/main.js').read_text(encoding='utf-8'))
            await page.hover('#timelineTweet')
            await page.wait_for_selector('.xai-float.is-on', state='visible')
            await page.hover('.xai-float')
            check('真实鼠标移入悬浮按钮后仍可点击', await page.locator('.xai-float.is-on').is_visible())
            await page.click('.xai-float')
            await page.wait_for_function('XAI.panel.isOpen() && document.querySelector(".xai-src__t").textContent.includes("时间线上的正文")')
            check('真实悬浮按钮点击关联原推文', await page.locator('.xai-panel.is-open').is_visible())
            await page.evaluate('() => XAI.panel.close()')
        finally:
            await browser.close()
    print('通过 %d / %d' % (passed, passed))


if __name__ == '__main__':
    asyncio.run(main())
