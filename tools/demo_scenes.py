"""Capture an offline, fictional product walkthrough with the real extension UI.

Every main-flow scene uses the same viewport crop so an editor can cut between
operations without moving the panel. All requests use local, explicitly mocked
AI responses; no account, persistent browser, API key, or publication is used.
"""
from __future__ import annotations

import argparse
import asyncio
import json
from pathlib import Path
from typing import Any

from playwright.async_api import async_playwright

import promo_scenes as base


ROOT = base.ROOT
VIEWPORT = base.VIEWPORT
FIXED_CROP = {"x": 120, "y": 64, "width": 1360, "height": 770}
ENGLISH_CANDIDATES = [
    "Automating the repetitive work leaves more room for the details that matter.",
    "Let the tools handle the routine, so you can focus on making the experience better.",
    "That is a good trade: fewer repetitive steps, more time for thoughtful work.",
]
TARGETS = {
    **base.PANEL_TARGETS,
    "count_1": '[data-k="count"] [data-v="1"]',
    "style_auto": '[data-k="style"] [data-v="auto"]',
    "panel": ".xai-panel",
    "dialog": "#reply-dialog",
}


def demo_mock() -> str:
    marker = "    const choices = style === 'pro' ?"
    replacement = (
        "    const language = payload.extra?.lang || config().lang;\n"
        "    if (language === 'en') return "
        + json.dumps(ENGLISH_CANDIDATES)
        + ".slice(0, Number(payload.extra?.count || config().count || 3));\n"
        + marker
    )
    assert marker in base.MOCK_JS
    return base.MOCK_JS.replace(marker, replacement, 1)


async def render_assets(out_dir: str) -> dict:
    out = Path(out_dir).resolve()
    out.mkdir(parents=True, exist_ok=True)
    # Settings and prompt screens are already captured with real controls and
    # the same local-only mock. Reuse that implementation rather than reproducing
    # a settings page in the video renderer.
    original = await base.render_assets(str(out / "settings-source"))
    assets = {name: original["assets"][name]
              for name in ("providers", "prompt", "prompt-preview")}
    checks: dict[str, Any] = {"settings_flow_validated": original["checks"]}
    errors: list[str] = []
    blocked: list[str] = []
    fixture_hits = 0

    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(headless=True)
        context = await browser.new_context(
            viewport=VIEWPORT, device_scale_factor=1,
            color_scheme="dark", locale="zh-CN", service_workers="block")
        await context.add_init_script(script=demo_mock())

        async def route_request(route: Any) -> None:
            nonlocal fixture_hits
            url = route.request.url
            if url == base.FIXTURE_URL:
                fixture_hits += 1
                await route.fulfill(status=200, content_type="text/html; charset=utf-8",
                                    body=base.FIXTURE_HTML)
            elif url.startswith(("http://", "https://")):
                blocked.append(url)
                await route.abort("blockedbyclient")
            else:
                await route.continue_()

        await context.route("**/*", route_request)
        page = await context.new_page()
        page.on("pageerror", lambda error: errors.append(str(error)))
        await page.goto(base.FIXTURE_URL, wait_until="domcontentloaded")
        await page.add_style_tag(path=str(ROOT / "src/content/content.css"))
        for rel in base.CONTENT_SCRIPTS:
            await page.add_script_tag(path=str(ROOT / rel))
        await page.add_style_tag(content="""
          .xai-panel{left:225px!important;top:145px!important}
          .xai-st{font-size:0!important}
          .xai-st::after{content:attr(data-promo-label);font-size:11.5px;color:#8b98a5}
        """)
        await page.wait_for_function("() => window.__xaiInited === true")

        async def capture(name: str, label: str = "") -> None:
            if await page.locator(".xai-st").count():
                await page.locator(".xai-st").evaluate(
                    "(node,label)=>node.setAttribute('data-promo-label',label)", label)
            await page.mouse.move(1500, 870)
            await page.evaluate("() => new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))")
            image_path = out / f"{name}.png"
            await page.screenshot(path=str(image_path), clip=FIXED_CROP,
                                  animations="disabled", caret="hide")
            assets[name] = {
                "path": str(image_path), "width": FIXED_CROP["width"],
                "height": FIXED_CROP["height"],
                "size": [FIXED_CROP["width"], FIXED_CROP["height"]],
                "crop": dict(FIXED_CROP),
                "targets": await base._targets(page, TARGETS, FIXED_CROP),
                "status_label": label,
            }

        async def start(name: str, label: str = "正在生成示例回复…") -> str:
            old = await page.evaluate("() => window.__promo.latest?.id || ''")
            await page.locator(".xai-btn--go").click()
            await page.wait_for_function(
                "old => window.__promo.latest?.id !== old && window.__promo.latest?.stage === 'unfinished'",
                arg=old)
            assert await page.locator(".xai-btn--go").is_disabled()
            await capture(name, label)
            return await page.evaluate("() => window.__promo.latest.id")

        async def finish(name: str, label: str = "3 条示例回复 · 演示模型") -> list[str]:
            expected = await page.evaluate("() => window.__promo.latest.list")
            await page.evaluate("() => window.__promo.release('done')")
            await page.wait_for_function("() => !document.querySelector('.xai-btn--go').disabled")
            actual = await page.locator('.xai-it[data-i] .xai-it__x').all_inner_texts()
            assert actual == expected, (name, actual, expected)
            await capture(name, label)
            return actual

        await capture("timeline")
        # A real browser click opens the fixture's reply dialog; the current
        # extension's main.js detects it and starts its configured auto flow.
        await page.locator("#reply-demo").click()
        await page.wait_for_function("() => window.__promo.latest?.stage === 'unfinished'")
        await page.wait_for_selector(".xai-panel.is-open")
        assert await page.locator('.xai-it[data-i]').count() == 0
        await capture("loading", "正在生成示例回复…")
        checks["native_reply_click_auto_opens_and_generates"] = True

        await page.evaluate("() => window.__promo.release('partial')")
        await page.wait_for_function("() => document.querySelectorAll('.xai-it[data-i]').length === 1")
        await capture("partial", "已收到 1 条完整示例 · 正在生成")
        assert await finish("results") == base.CANDIDATES
        checks["streaming_first_then_three_complete_candidates"] = True

        await page.locator('.xai-it[data-i="1"]').click()
        await page.wait_for_function(
            "text => document.querySelector('#reply-editor').innerText.trim() === text",
            arg=base.CANDIDATES[1])
        assert await page.locator("#publish-demo").is_disabled()
        await capture("filled", "已填入编辑框 · 发布前可继续修改")
        checks["native_candidate_click_fills_exact_reply"] = True

        for style in ("humor", "pro"):
            await page.locator(f'[data-k="style"] [data-v="{style}"]').click()
            await page.wait_for_function("style => window.__promo.config().style === style", arg=style)
            await capture(f"{style}-selected", "风格已切换 · 点击生成新的候选")
            await start(f"{style}-loading")
            assert await page.evaluate("() => window.__promo.latest.payload.extra.style") == style
            result = await finish(f"style-{style}")
            if style == "humor":
                assert result[0] == base.CANDIDATES[0]
            else:
                assert result[0] == base.CANDIDATES[1]
        checks["real_style_controls_selected_saved_and_sent"] = True

        # The displayed language and count drive the mock response, as a real
        # backend would. The footage never presents Chinese text as English.
        await page.locator('[data-k="count"] [data-v="1"]').click()
        await page.wait_for_function("() => window.__promo.config().count === 1")
        await capture("count-selected", "条数已切换为 1 · 可选择输出语言")
        await page.locator('.xai-sel[data-k="lang"]').select_option("en")
        await page.wait_for_function("() => window.__promo.config().count === 1 && window.__promo.config().lang === 'en'")
        await capture("language-selected", "条数：1 · 语言：英文")
        await start("language-loading", "正在生成 1 条英文示例…")
        assert await page.evaluate("() => window.__promo.latest.payload.extra.count") == 1
        assert await page.evaluate("() => window.__promo.latest.payload.extra.lang") == "en"
        english = await finish("language-results", "1 条英文示例 · 演示模型")
        assert english == ENGLISH_CANDIDATES[:1]
        await page.locator('.xai-it[data-i="0"]').click()
        await page.wait_for_function(
            "text => document.querySelector('#reply-editor').innerText.trim() === text",
            arg=ENGLISH_CANDIDATES[0])
        await capture("language-filled", "英文回复已填入 · 发布前可继续修改")
        checks["count_one_english_requested_rendered_and_filled"] = True

        # Continue with the visible one-reply English configuration, preserving
        # continuity between the language demonstration and the stop/retry flow.
        assert await page.evaluate("() => window.__promo.config().count === 1 && window.__promo.config().lang === 'en'")
        cancelled_id = await start("cancel-loading", "正在生成 1 条英文示例…")
        await page.locator(".xai-btn--stop").click()
        await page.wait_for_function("() => !document.querySelector('.xai-btn--go').disabled")
        assert await page.evaluate("() => window.__promo.latest.closed && window.__promo.latest.cancelled")
        await capture("demo-cancelled", "已中止 · 可重新生成")
        retry_id = await start("retry-loading", "重新生成示例回复…")
        assert retry_id != cancelled_id
        assert await finish("retry-results", "1 条英文示例 · 演示模型") == ENGLISH_CANDIDATES[:1]
        assert await page.evaluate(
            "id => window.__promo.tasks.find(task=>task.id===id).closed", cancelled_id)
        checks["native_stop_then_new_request_completes"] = True
        checks["cancelled_request_remains_closed"] = True
        checks["publication_disabled_throughout"] = await page.locator("#publish-demo").is_disabled()
        checks["main_flow_request_count"] = await page.evaluate("() => window.__promo.tasks.length")
        checks["fixed_crop_all_main_flow_scenes"] = True
        checks["no_timing_claims"] = True
        assert not errors, errors
        assert fixture_hits == 1
        checks["fresh_nonpersistent_browser"] = True
        checks["all_http_https_intercepted"] = True
        checks["no_page_errors"] = True
        await context.close()
        await browser.close()

    result = {
        "viewport": VIEWPORT, "main_crop": FIXED_CROP, "assets": assets,
        "paths": {name: asset["path"] for name, asset in assets.items()},
        "checks": checks, "page_errors": errors, "blocked_http": blocked,
        "demo": {"fictional": True, "model_label": "演示模型", "tweet": base.TWEET,
                 "candidates": base.CANDIDATES, "english_candidates": ENGLISH_CANDIDATES,
                 "real_extension_ui": True, "mock_ai": True, "publication_enabled": False},
    }
    (out / "metadata.json").write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", default=str(ROOT / "dev/_promo_demo/frames"))
    args = parser.parse_args()
    metadata = asyncio.run(render_assets(args.out))
    print(json.dumps({"paths": metadata["paths"], "checks": metadata["checks"]}, ensure_ascii=False, indent=2))
