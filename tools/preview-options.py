"""
渲染设置页截图，用于视觉验收（尤其是新增的提示词配置区）。

注意：chrome mock 必须用 add_init_script 注入（页面脚本执行前）。
若改用 add_script_tag，mock 会在 options.js 之后才注入，导致 getConfig 拿不到数据，
表现为「所有字段都是空 / 报 Unexpected token」——那是测试脚本的问题，不是产品代码的问题。
"""
import asyncio
import json
import os
from playwright.async_api import async_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "dev")

STORE = {
    "xai_config": {
        "enabled": True,
        "provider": "openai",
        "baseUrl": "https://open.bigmodel.cn/api/paas/v4",
        "apiKey": "sk-test-1234567890abcdef",
        "model": "glm-4.6",
        "temperature": 1.0,
        "maxTokens": 4000,
        "disableThinking": True,
        "timeoutSec": 90,
        "count": 3,
        "style": "humor",
        "lang": "auto",
        "length": "medium",
        "customInstruction": "不要用 emoji，语气像我本人",
        "promptFormat": "json",
        "persona": "我是一名后端工程师，说话直接，不爱客套。",
        # 演示：system 已自定义，user 留空用默认模板
        "systemPrompt": "你是我的 X 账号运营助理，帮我写有记忆点的回复。\n"
                        "风格：{{style}}\n"
                        "条数：{{count}}\n"
                        "语言：{{lang}}\n"
                        "补充：{{customInstruction}}",
        "userPrompt": "",
        "stream": True,
        "proxyMode": "custom",
        "proxyScheme": "http",
        "proxyHost": "127.0.0.1",
        "proxyPort": 7890,
        "autoInsertFirst": False,
        "debug": False,
    }
}

MOCK = """
window.__store = %s;
window.chrome = {
  storage: { local: {
    async get(k){ return { [k]: window.__store[k] }; },
    async set(o){ Object.assign(window.__store, o); }
  }},
  runtime: {
    async sendMessage(msg){
      if (msg.type === 'xai:previewPrompt') {
        // 模拟真实 service worker 的渲染结果
        const c = msg.payload.cfg || {};
        const persona = c.persona || '';
        const sys = (persona ? persona + '\\n\\n' : '')
          + (c.systemPrompt || '')
            .replace(/\\{\\{\\s*tweet\\.author\\s*\\}\\}/g, '会跳舞的企鹅')
            .replace(/\\{\\{\\s*tweet\\.handle\\s*\\}\\}/g, '@penguin_dance')
            .replace(/\\{\\{\\s*tweet\\.text\\s*\\}\\}/g, '今天学会了用 AI 写代码，效率直接翻倍！有人一起试试吗？')
            .replace(/\\{\\{\\s*tweet\\.time\\s*\\}\\}/g, '2026-10-16T10:00:00.000Z')
            .replace(/\\{\\{\\s*count\\s*\\}\\}/g, String(c.count || 3))
            .replace(/\\{\\{\\s*style\\s*\\}\\}/g, '幽默风。轻松、有梗。')
            .replace(/\\{\\{\\s*lang\\s*\\}\\}/g, '简体中文')
            .replace(/\\{\\{\\s*customInstruction\\s*\\}\\}/g, c.customInstruction || '');
        const user = '请针对下面这条推文写 3 条回复。\\n\\n'
          + '【原作者】会跳舞的企鹅 @penguin_dance\\n'
          + '【发布时间】2026-10-16T10:00:00.000Z\\n'
          + '【正文】\\n今天学会了用 AI 写代码，效率直接翻倍！有人一起试试吗？';
        return { ok: true, data: { n: c.count || 3, system: sys, user: user } };
      }
      return { ok: true, data: { sample: '示例回复内容', elapsedMs: 2100 } };
    },
    getURL(p){ return p; }
  }
};
"""


async def main():
    os.makedirs(OUT, exist_ok=True)
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={"width": 900, "height": 1150},
                              device_scale_factor=2, color_scheme="dark")

        errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))

        await pg.add_init_script(MOCK % json.dumps(STORE))
        url = "file:///" + os.path.join(ROOT, "src", "options", "options.html").replace("\\", "/")
        await pg.goto(url)
        await pg.wait_for_timeout(700)

        if errs:
            print("页面错误:", errs)

        # 验证字段确实回填了
        filled = await pg.evaluate("""() => ({
            persona: document.getElementById('persona').value,
            sys: document.getElementById('systemPrompt').value.length,
            chips: document.querySelectorAll('.vchip').length,
        })""")
        print("回填校验:", filled)

        await pg.screenshot(path=os.path.join(OUT, "preview-options-full.png"), full_page=True)
        print("设置页整图 -> preview-options-full.png")

        # 点预览，验证渲染展开
        await pg.click("#preview")
        await pg.wait_for_timeout(500)
        pv = await pg.evaluate(
            "() => ({ sys: document.getElementById('pvSystem').textContent.length,"
            " usr: document.getElementById('pvUser').textContent.length,"
            " vis: getComputedStyle(document.getElementById('previewBox')).display })")
        print("预览校验:", pv)
        await pg.screenshot(path=os.path.join(OUT, "preview-options-prompt.png"), full_page=True)
        print("提示词预览 -> preview-options-prompt.png")

        card = await pg.query_selector("#promptCard")
        if card:
            await card.scroll_into_view_if_needed()
            await pg.wait_for_timeout(300)
            await card.screenshot(path=os.path.join(OUT, "preview-prompt-card.png"))
            print("提示词卡片 -> preview-prompt-card.png")

        if errs:
            print("最终仍有页面错误:", errs)
        await b.close()


if __name__ == "__main__":
    asyncio.run(main())
