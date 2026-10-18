"""Offline, fresh Chromium checks for reply-target continuity and identity.

Run normally against working sources. To reproduce the original failure, use
``--baseline 06e4202 --only appended-translation`` to load that revision in memory
without changing the working tree. No existing browser session or real API is used.
"""
import argparse
import asyncio
import pathlib
import subprocess

from playwright.async_api import async_playwright


ROOT = pathlib.Path(__file__).resolve().parent.parent
SCRIPTS = ['shared/config.js', 'shared/utils.js', 'content/detector.js',
           'content/editor.js', 'content/panel.js']
ORIGINAL = 'Hotel booking is a clear, everyday use case. Show payment approval first.'
TRANSLATION = '酒店预订是非常常见的日常需求，请先展示付款确认步骤。'
CANDIDATE = 'Cancellation terms upfront is what I would want to see.'
FIXTURE = '''<!doctype html><meta charset="utf-8"><style>
body {font:16px sans-serif} [role=dialog] {width:640px;padding:20px}
[data-testid=tweetTextarea_0] {min-height:90px;outline:1px solid gray}
</style><div role="dialog" aria-modal="true" id="dlg">
<div data-testid="tweet" id="target">
  <div data-testid="User-Name" id="author">0xkEvin.AI @0xkEvinC</div>
  <div data-testid="tweetText" id="original"></div>
</div><div data-testid="replyContextBar">Replying to @0xkEvinC</div>
<div data-testid="tweetTextarea_0" contenteditable="true" role="textbox"
 aria-multiline="true" id="editor"></div><button data-testid="tweetButton">Reply</button>
</div>'''


def load_scripts(baseline):
    scripts = {}
    for name in SCRIPTS:
        relative = 'src/' + name
        scripts[name] = (subprocess.check_output(
            ['git', 'show', baseline + ':' + relative], cwd=ROOT).decode('utf-8')
            if baseline else (ROOT / relative).read_text(encoding='utf-8'))
    return scripts


async def prepare(browser, scripts, *, status='', translation=False):
    page = await browser.new_page(viewport={'width': 1500, 'height': 1000})
    page.test_errors = []
    page.on('pageerror', lambda error: page.test_errors.append(str(error)))
    # Includes all schemes/hosts; even accidentally introduced remote assets fail closed.
    await page.route('**/*', lambda route: route.abort())
    await page.set_content(FIXTURE)
    await page.evaluate('''({original, translation, status}) => {
        document.querySelector('#original').appendChild(document.createTextNode(original));
        if (translation) {
            const translated = document.createElement('div');
            translated.textContent = translation;
            document.querySelector('#original').appendChild(translated);
        }
        if (status) {
            const a = document.createElement('a');
            a.id = 'status'; a.href = 'https://x.com/0xkEvinC/status/' + status;
            a.textContent = 'Oct 14';
            document.querySelector('#target').prepend(a);
        }
    }''', {'original': ORIGINAL, 'translation': TRANSLATION if translation else '', 'status': status})
    for name in SCRIPTS[:-1]:
        await page.add_script_tag(content=scripts[name])
    await page.evaluate('''() => {
        window.fakeCfg = {...XAI.defaults, autoGenerate:false, autoInsertFirst:false, stream:false};
        window.fakeRequests = []; window.fillCount = 0;
        XAI.getConfig = async () => ({...fakeCfg});
        XAI.setConfig = async patch => Object.assign(fakeCfg, patch);
        XAI.editor.setText = async (editor, text) => {
            fillCount++; editor.textContent = text; return true;
        };
        window.chrome = {runtime:{async sendMessage(message) {
            if (message.type === 'xai:generate') {
                fakeRequests.push(message.payload);
                return {ok:true,data:{list:['generated reply'],elapsedMs:100,model:'fake'}};
            }
            return {ok:true};
        }}};
    }''')
    await page.add_script_tag(content=scripts[SCRIPTS[-1]])
    opened = await page.evaluate('() => XAI.panel.open(XAI.detector.findComposer())')
    if not opened:
        raise AssertionError('fixture reply composer did not open')
    await page.evaluate('(reply) => XAI.panel._debugSetResults([reply])', CANDIDATE)
    return page


async def append_translation(page, wrap=False):
    await page.evaluate('''({translation, wrap}) => {
        const source = document.querySelector('#original');
        if (wrap) {
            const span = document.createElement('span');
            source.insertBefore(span, source.firstChild);
            span.appendChild(source.childNodes[1]);
        }
        const block = document.createElement('div');
        block.textContent = translation;
        source.appendChild(block);
    }''', {'translation': TRANSLATION, 'wrap': wrap})


async def use_matches(page, expected):
    actual = await page.evaluate('() => XAI.panel.use(0)')
    filled = await page.locator('#editor').inner_text()
    fills = await page.evaluate('fillCount')
    return actual is expected and (filled == CANDIDATE if expected else filled == '') and fills == int(expected)


async def run_cases(browser, scripts, only):
    passed, failed = 0, 0

    async def case(key, label, action, **kwargs):
        nonlocal passed, failed
        if only and only != key:
            return
        page = None
        try:
            page = await prepare(browser, scripts, **kwargs)
            result = await action(page)
            if not result:
                raise AssertionError('observed result did not match expectation')
            if page.test_errors:
                raise AssertionError('page errors: ' + repr(page.test_errors))
            passed += 1
            print('PASS ' + label, flush=True)
        except Exception as error:
            failed += 1
            print('FAIL ' + label + ': ' + str(error), flush=True)
        finally:
            if page:
                await page.close()

    async def unchanged(page):
        return await use_matches(page, True)

    async def appended(page):
        await append_translation(page)
        return await use_matches(page, True)

    async def wrapped(page):
        await append_translation(page, wrap=True)
        return await use_matches(page, True)

    async def changed_text(page):
        await append_translation(page)
        await page.evaluate("document.querySelector('#original').firstChild.nodeValue = 'Another tweet about coffee.'")
        return await use_matches(page, False)

    async def replaced_source(page):
        await append_translation(page)
        await page.evaluate('''() => {
            const fresh = document.createElement('div');
            fresh.id='original'; fresh.dataset.testid='tweetText';
            fresh.textContent='Another original post, in a reused composer.';
            document.querySelector('#original').replaceWith(fresh);
        }''')
        return await use_matches(page, False)

    async def changed_status(page):
        await append_translation(page)
        await page.evaluate("document.querySelector('#status').href='https://x.com/0xkEvinC/status/222'")
        return await use_matches(page, False)

    async def changed_author(page):
        await append_translation(page)
        await page.evaluate("document.querySelector('#author').textContent='Other author @other'")
        return await use_matches(page, False)

    async def other_dialog(page):
        await append_translation(page)
        await page.evaluate('''() => {
            const previous = document.querySelector('#dlg');
            const replacement = previous.cloneNode(true);
            previous.replaceWith(replacement);
        }''')
        return await use_matches(page, False)

    async def ordinary_post(page):
        await page.evaluate('''() => {
            document.querySelector('#dlg').innerHTML =
                '<div data-testid="tweetTextarea_0" id="editor" contenteditable="true" role="textbox"></div>' +
                '<div data-testid="quoteTweet"><div data-testid="tweetText">' +
                'Hotel booking is a clear, everyday use case. Show payment approval first.</div></div>';
        }''')
        return await use_matches(page, False)

    async def deleted_source(page):
        await page.evaluate("document.querySelector('#target').remove()")
        return await use_matches(page, False)

    async def reopened(page):
        await append_translation(page)
        opened = await page.evaluate('() => XAI.panel.open(XAI.detector.findComposer())')
        count = await page.locator('.xai-it[data-i]').count()
        return opened and count == 1 and await use_matches(page, True)

    async def generate_original(page):
        await append_translation(page)
        await page.evaluate('() => XAI.panel.generate()')
        payloads = await page.evaluate('fakeRequests')
        return len(payloads) == 1 and payloads[0]['tweet']['text'] == ORIGINAL

    async def correct_status(page):
        await page.evaluate('''() => {
            const quote = document.createElement('div'); quote.dataset.testid='quoteTweet';
            quote.innerHTML='<div data-testid="User-Name">Inner @inner</div>' +
                '<a href="https://x.com/inner/status/999"><time datetime="2026-10-01">Oct 1</time></a>' +
                '<div data-testid="tweetText">Nested quote body</div>';
            document.querySelector('#target').prepend(quote);
        }''')
        tweet = await page.evaluate('() => XAI.detector.parseTweetCard(document.querySelector("#target"), document.querySelector("#dlg"))')
        return tweet['url'] == 'https://x.com/0xkEvinC/status/111' and tweet['handle'] == '@0xkEvinC'

    async def body_status(page):
        await page.evaluate('''() => {
            const link = document.createElement('a'); link.href='https://x.com/other/status/999';
            link.textContent='linked tweet'; document.querySelector('#original').appendChild(link);
        }''')
        tweet = await page.evaluate('() => XAI.detector.extractTargetTweet(XAI.detector.findComposer())')
        return tweet['url'] == 'https://x.com/0xkEvinC/status/111'

    await case('unchanged', '原回复弹层无变化时正常填入', unchanged)
    await case('appended-translation', '原文节点未变、追加译文后正常填入', appended)
    await case('wrapped-translation', '包裹原文字节点并追加译文后正常填入', wrapped)
    await case('changed-text', '原文字节点内容改变时拒绝旧候选', changed_text)
    await case('replaced-source', '复用弹层更换原推文节点时拒绝旧候选', replaced_source)
    await case('changed-status', 'status ID 冲突时拒绝旧候选', changed_status, status='111')
    await case('changed-author', '作者改变时拒绝旧候选', changed_author)
    await case('new-dialog', '换成新弹层后拒绝旧候选', other_dialog)
    await case('ordinary-post', '普通发帖弹层拒绝旧回复候选', ordinary_post)
    await case('deleted-source', '原推文节点删除后拒绝旧候选', deleted_source)
    await case('already-translated', '打开前已有译文时正常填入', unchanged, translation=True)
    await case('reopen', '追加译文后重新打开面板保留原候选', reopened)
    await case('generate-original', '追加译文后生成仍使用最初原推文', generate_original)
    await case('status-no-time', '无 time 的原推 status 链接优先于嵌套引用卡', correct_status, status='111')
    await case('body-status-link', '正文内其他推文链接不会覆盖原推 ID', body_status, status='111')
    print(f'{passed} passed, {failed} failed', flush=True)
    return failed


async def main(args):
    scripts = load_scripts(args.baseline)
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch()
        try:
            return await run_cases(browser, scripts, args.only)
        finally:
            await browser.close()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--baseline', metavar='REV', help='load scripts from a specific Git revision')
    parser.add_argument('--only', help='run just one named regression')
    raise SystemExit(asyncio.run(main(parser.parse_args())))
