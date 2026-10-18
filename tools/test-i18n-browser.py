"""Offline tests of runtime UI language changes in real extension pages and panel."""
import asyncio
import pathlib
import runpy

from playwright.async_api import async_playwright, expect


ROOT = pathlib.Path(__file__).resolve().parents[1]
FIXTURE = runpy.run_path(str(ROOT / 'tools/test-e2e.py'))['MOCK_HTML']
passed = 0


def check(name, condition):
    global passed
    assert condition, name
    passed += 1
    print('PASS ' + name, flush=True)


async def main():
    preview = ROOT / 'dev/_promo_i18n'
    preview.mkdir(parents=True, exist_ok=True)
    async with async_playwright() as playwright:
        context = await playwright.chromium.launch_persistent_context(
            '', headless=True, channel='chromium', locale='en-US',
            args=['--headless=new', '--disable-extensions-except=' + str(ROOT),
                  '--load-extension=' + str(ROOT), '--no-sandbox'])
        try:
            await context.route('https://**/*', lambda route: route.abort())
            await context.route('http://**/*', lambda route: route.abort())
            workers = context.service_workers or [await context.wait_for_event('serviceworker')]
            origin = workers[0].url.split('/src/')[0]
            options = await context.new_page()
            popup = await context.new_page()
            errors = []
            options.on('pageerror', lambda error: errors.append(str(error)))
            popup.on('pageerror', lambda error: errors.append(str(error)))
            await options.goto(origin + '/src/options/options.html')
            await expect(options.locator('#style option')).to_have_count(9)
            await options.evaluate('() => XAI.setConfig({uiLang:"en",lang:"vi",apiKey:"FAKE_I18N_KEY",autoGenerate:false})')
            await options.reload()
            await expect(options.locator('#uiLang')).to_have_value('en')
            await popup.goto(origin + '/src/popup/popup.html')
            await expect(popup.locator('#uiLang')).to_have_value('en')
            check('settings and popup load all six interface choices without duplicates',
                  await options.locator('#uiLang option').count() == 6 and
                  await popup.locator('#uiLang option').count() == 6)
            check('reply language remains Vietnamese when interface is English',
                  await options.input_value('#lang') == 'vi' and
                  'All settings' in await popup.locator('#openOpt').inner_text())
            await options.fill('#persona', 'User-authored persona: 保留原样')
            await options.select_option('#proxyMode', 'custom')
            await options.fill('#proxyHost', '127.0.0.1')
            await options.fill('#proxyPort', '7890')
            for language in ['ja', 'vi', 'ko', 'zh', 'en']:
                await popup.select_option('#uiLang', language)
                await expect(options.locator('html')).to_have_attribute('lang', language)
                await expect(options.locator('#uiLang')).to_have_value(language)
                check(language + ' interface synchronizes across popup and settings',
                      await popup.evaluate('XAI.i18n.getLocale()') == language and
                      await options.evaluate('XAI.i18n.getLocale()') == language)
            check('interface switches retain unsaved proxy draft and user-authored text',
                  await options.input_value('#proxyMode') == 'custom' and
                  await options.input_value('#proxyHost') == '127.0.0.1' and
                  await options.input_value('#persona') == 'User-authored persona: 保留原样')
            check('interface switching never changes AI reply language or credentials',
                  await options.evaluate('async () => (await XAI.getConfig()).lang') == 'vi' and
                  await options.input_value('#apiKey') == 'FAKE_I18N_KEY')
            await options.select_option('#uiLang', 'ko')
            await options.click('#save')
            await expect(popup.locator('html')).to_have_attribute('lang', 'ko')
            await popup.reload()
            await expect(popup.locator('#uiLang')).to_have_value('ko')
            check('settings selector persists and updates an already-open popup',
                  await popup.evaluate('XAI.i18n.getLocale()') == 'ko')
            check('extension-page switches have no script errors', not errors)
        finally:
            await context.close()

        browser = await playwright.chromium.launch()
        try:
            page = await browser.new_page(viewport={'width': 1600, 'height': 1000}, locale='en-US')
            await page.route('**/*', lambda route: route.abort())
            await page.set_content(FIXTURE)
            page_errors = []
            page.on('pageerror', lambda error: page_errors.append(str(error)))
            for name in ['shared/config.js','shared/utils.js','shared/i18n.js','content/detector.js','content/editor.js']:
                await page.add_script_tag(path=str(ROOT / 'src' / name))
            await page.evaluate('''() => {
                window.fakeConfig={...XAI.defaults,uiLang:'en',lang:'vi',autoGenerate:false};
                const listeners=new Set();
                window.fakePorts=[];
                window.fakeChange=(patch)=>{
                    const oldValue={...fakeConfig};Object.assign(fakeConfig,patch);
                    for(const fn of listeners)fn({[XAI.storageKey]:{oldValue,newValue:{...fakeConfig}}},'local');
                    return {...fakeConfig};
                };
                XAI.getConfig=async()=>({...fakeConfig});
                XAI.setConfig=async patch=>fakeChange(patch);
                window.chrome={storage:{onChanged:{addListener:fn=>listeners.add(fn)}},runtime:{
                    async sendMessage(){return {ok:true};},connect(){
                        const events=()=>{const handlers=new Set();return {
                            addListener:fn=>handlers.add(fn),removeListener:fn=>handlers.delete(fn),
                            emit:message=>[...handlers].forEach(fn=>fn(message))};};
                        const port={onMessage:events(),onDisconnect:events(),
                            postMessage(message){this.payload=message.payload;},disconnect(){this.closed=true;},
                            emit(message){this.onMessage.emit(message);}};
                        fakePorts.push(port);return port;
                    }
                }};
            }''')
            await page.add_script_tag(path=str(ROOT / 'src/content/panel.js'))
            await page.evaluate('() => XAI.panel.open(XAI.detector.findComposer())')
            original = await page.locator('#tweetText').inner_text()
            await page.locator('#ed').fill('Keep this draft unchanged. 原始草稿。')
            await page.evaluate('() => XAI.panel._debugSetResults(["Nội dung trả lời mẫu. 保留原文。"] )')
            for language in ['en','ja','vi','ko','zh']:
                await page.select_option('[data-k="uiLang"]', language)
                await page.wait_for_function('code => XAI.i18n.getLocale() === code', arg=language)
                check(language + ' panel labels switch without changing replies, draft or source',
                      await page.locator('.xai-hd__t').inner_text() == await page.evaluate('XAI.i18n.t("AI 回复助手")') and
                      await page.locator('.xai-it__x').inner_text() == 'Nội dung trả lời mẫu. 保留原文。' and
                      await page.locator('#ed').inner_text() == 'Keep this draft unchanged. 原始草稿。' and
                      await page.locator('#tweetText').inner_text() == original)
                check(language + ' translated style controls stay inside the panel',
                      await page.evaluate('''() => {
                          const panel=document.querySelector('.xai-panel').getBoundingClientRect();
                          return [...document.querySelectorAll('[data-k="style"] button')].every(node=>{
                              const box=node.getBoundingClientRect();return box.left>=panel.left && box.right<=panel.right;
                          });
                      }'''))
                await page.locator('.xai-panel').screenshot(path=str(preview / f'panel-{language}.png'))
            await page.select_option('[data-k="uiLang"]','en')
            await page.click('.xai-btn--go')
            await page.wait_for_function('fakePorts.length === 1')
            check('generation uses the Vietnamese reply setting independently of English interface',
                  await page.evaluate('fakePorts[0].payload.extra.lang') == 'vi')
            await page.select_option('[data-k="uiLang"]','ja')
            check('interface switch during streaming does not cancel or duplicate the request',
                  await page.evaluate('fakePorts.length === 1 && !fakePorts[0].closed') and
                  await page.locator('.xai-btn--go').is_disabled())
            await page.evaluate('''() => fakePorts[0].emit({type:'done',list:['Một câu trả lời tiếng Việt.'],elapsedMs:1200,model:'demo'})''')
            await page.wait_for_function('!document.querySelector(".xai-btn--go").disabled')
            check('stream completion uses the latest interface language and keeps original reply text',
                  await page.locator('.xai-it__cp').inner_text() == await page.evaluate('XAI.i18n.t("复制")') and
                  await page.locator('.xai-it__x').inner_text() == 'Một câu trả lời tiếng Việt.')
            await page.evaluate('() => fakeChange({uiLang:"vi"})')
            check('external settings update an open panel in place',
                  await page.locator('[data-k="uiLang"]').input_value() == 'vi' and
                  await page.locator('.xai-hd__t').inner_text() == await page.evaluate('XAI.i18n.t("AI 回复助手")'))
            used = await page.evaluate('() => XAI.panel.use(0)')
            check('localized candidate still fills the actual reply editor',
                  used and await page.locator('#ed').inner_text() == 'Một câu trả lời tiếng Việt.')
            await page.set_viewport_size({'width': 450, 'height': 700})
            for language in ['en', 'vi']:
                await page.select_option('[data-k="uiLang"]', language)
                await page.wait_for_timeout(50)
                check(language + ' narrow viewport keeps controls inside panel',
                      await page.evaluate('''() => {
                          const panel=document.querySelector('.xai-panel').getBoundingClientRect();
                          return [...document.querySelectorAll('.xai-panel select, [data-k="style"] button, .xai-btn--go')].every(node=>{
                              const box=node.getBoundingClientRect();return box.left>=panel.left && box.right<=panel.right+1;
                          });
                      }'''))
            await page.evaluate('() => XAI.panel.close()')
            check('panel localization has no script errors', not page_errors)
        finally:
            await browser.close()
    print(f'{passed} browser i18n checks passed.')


if __name__ == '__main__':
    asyncio.run(main())
