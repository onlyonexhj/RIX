"""Capture an offline, fictional product walkthrough with the real extension UI.

Every main-flow scene uses the same viewport crop so an editor can cut between
operations without moving the panel. All requests use local, explicitly mocked
AI responses; no account, persistent browser, API key, or publication is used.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import html
from pathlib import Path
from typing import Any

from playwright.async_api import async_playwright

import promo_scenes as base
from demo_i18n import COPY, LANGUAGES
from readme_screenshot_data import SCENES


ROOT = base.ROOT
VIEWPORT = base.VIEWPORT
FIXED_CROP = {"x": 120, "y": 64, "width": 1360, "height": 770}
TARGETS = {
    **base.PANEL_TARGETS,
    "count_1": '[data-k="count"] [data-v="1"]',
    "style_auto": '[data-k="style"] [data-v="auto"]',
    "panel": ".xai-panel",
    "dialog": "#reply-dialog",
}


# Only the fictional page surrounding the extension is localized here. The
# panel, controls, event handling, and settings continue to use real source.
PAGE_COPY = {
    "zh": ("探索", "通知", "消息", "书签", "个人资料", "发帖", "演示账号", "为你推荐", "正在关注", "搜索", "正在讨论", "独立开发", "做一点有用的小东西", "自动化", "把时间还给创造力", "周末计划", "给灵感留一点空间", "把灵感记下来，再给它一点耐心。", "回复", "关闭", "我"),
    "en": ("Explore", "Notifications", "Messages", "Bookmarks", "Profile", "Post", "Demo account", "For you", "Following", "Search", "Trending", "Indie development", "Make something useful", "Automation", "More time to create", "Weekend plans", "Make room for ideas", "Write down an idea, then give it time to grow.", "Replying to", "Close", "Me"),
    "ja": ("話題を検索", "通知", "メッセージ", "ブックマーク", "プロフィール", "ポスト", "デモアカウント", "おすすめ", "フォロー中", "検索", "トレンド", "個人開発", "小さく役立つものを作る", "自動化", "創造する時間を増やす", "週末の予定", "アイデアのための余白", "ひらめきを書き留めて、少しずつ育てよう。", "返信先", "閉じる", "私"),
    "vi": ("Khám phá", "Thông báo", "Tin nhắn", "Dấu trang", "Hồ sơ", "Đăng", "Tài khoản mẫu", "Dành cho bạn", "Đang theo dõi", "Tìm kiếm", "Xu hướng", "Lập trình độc lập", "Làm điều nhỏ hữu ích", "Tự động hóa", "Thêm thời gian sáng tạo", "Kế hoạch cuối tuần", "Dành chỗ cho ý tưởng", "Ghi lại ý tưởng rồi cho nó thời gian phát triển.", "Trả lời", "Đóng", "Tôi"),
    "ko": ("탐색", "알림", "쪽지", "북마크", "프로필", "게시하기", "데모 계정", "추천", "팔로우 중", "검색", "트렌드", "개인 개발", "작지만 유용한 것 만들기", "자동화", "창작할 시간을 더 많이", "주말 계획", "아이디어를 위한 여유", "떠오른 아이디어를 적고 천천히 키워보세요.", "답글 대상", "닫기", "나"),
}
TEMPLATE_COPY = {
    "zh": ("专业", "原推文：{{tweet.text}}\n作者：{{tweet.author}}\n补充要求：{{customInstruction}}", "保持浏览器原有网络设置"),
    "en": ("Professional", "Original post: {{tweet.text}}\nAuthor: {{tweet.author}}\nAdditional instructions: {{customInstruction}}", "Keep current browser network settings"),
    "ja": ("専門的", "元のポスト：{{tweet.text}}\n投稿者：{{tweet.author}}\n追加の指示：{{customInstruction}}", "ブラウザーの現在のネットワーク設定を維持"),
    "vi": ("Chuyên nghiệp", "Bài đăng gốc: {{tweet.text}}\nTác giả: {{tweet.author}}\nYêu cầu bổ sung: {{customInstruction}}", "Giữ cài đặt mạng hiện tại của trình duyệt"),
    "ko": ("전문적", "원문 게시물: {{tweet.text}}\n작성자: {{tweet.author}}\n추가 지침: {{customInstruction}}", "현재 브라우저 네트워크 설정 유지"),
}


def fixture_html(language: str) -> str:
    scene, words = SCENES[language], PAGE_COPY[language]
    source_words = PAGE_COPY["zh"]
    result = base.FIXTURE_HTML
    result = result.replace(base.TWEET["text"], html.escape(scene["tweet"]))
    result = result.replace("做小而有用的东西，慢慢来，也能走得很远。", html.escape(scene["photo_tweet"]))
    result = result.replace("首页", html.escape(scene["home"]))
    result = result.replace("写下你的回复", html.escape(scene["reply_placeholder"]))
    result = result.replace("小林", html.escape(scene["author"]))
    result = result.replace("安然", html.escape(scene["photographer"]))
    result = result.replace("北辰", html.escape(scene["author"]))
    result = result.replace("刚刚", html.escape(scene["ago_one"]))
    # Replace longer text first so menu words cannot partially consume a phrase.
    for source, target in sorted(zip(source_words, words), key=lambda pair: -len(pair[0])):
        result = result.replace(source, html.escape(target))
    result = result.replace('>林</div>', '>◈</div>').replace('>安</div>', '>◉</div>').replace('>北</div>', '>◇</div>')
    # Replies in the fixture are native page labels, not extension translations.
    result = result.replace('◯ ' + html.escape(words[18]), '◯ ' + html.escape(scene["reply_button"]))
    result = result.replace('<span class="draft-label">' + html.escape(words[18]) + '</span>', '<span class="draft-label">' + html.escape(scene["drafts"]) + '</span>')
    result = result.replace('disabled>' + html.escape(words[18]) + '</button>', 'disabled>' + html.escape(scene["reply_button"]) + '</button>')
    result = result.replace('lang="zh-CN"', 'lang="' + scene["locale"] + '"')
    result = result.replace('X AI ' + html.escape(words[18]) + '助手 · 虚构演示', html.escape(COPY[language]["product"]))
    return result


def demo_mock(language: str) -> str:
    scene, copy = SCENES[language], COPY[language]
    tweet = {**base.TWEET, "author": scene["author"], "text": scene["tweet"]}
    seed = {**base.SEED_CONFIG, "uiLang": language, "lang": "auto", "model": copy["model_label"]}
    result = base.MOCK_JS.replace(json.dumps(base.SEED_CONFIG, ensure_ascii=False), json.dumps(seed, ensure_ascii=False), 1)
    result = result.replace(json.dumps(base.TWEET, ensure_ascii=False), json.dumps(tweet, ensure_ascii=False), 1)
    result = result.replace(json.dumps(base.CANDIDATES, ensure_ascii=False), json.dumps(scene["replies"], ensure_ascii=False), 1)
    start = result.index("    const choices = style === 'pro' ?")
    end = result.index("    return choices.slice", start)
    result = result[:start] + (
        "    const choices = style === 'humor' ? " + json.dumps(copy["humor_replies"], ensure_ascii=False)
        + " : style === 'pro' ? " + json.dumps(copy["pro_replies"], ensure_ascii=False) + " : originals;\n"
    ) + result[end:]
    result = result.replace("演示模型", copy["model_label"])
    result = result.replace("保持浏览器原有网络设置", TEMPLATE_COPY[language][2])
    # These mock status values are never used as claims or visible speed results.
    result = result.replace("本地演示，不修改网络设置", COPY[language]["disclaimer"])
    result = result.replace("本地演示，不发送网络请求", COPY[language]["disclaimer"])
    result = result.replace("本地演示", COPY[language]["disclaimer"])
    return result


async def capture_settings(context: Any, out: Path, language: str, assets: dict, checks: dict, errors: list) -> None:
    scene = SCENES[language]
    page = await context.new_page()
    page.on("pageerror", lambda error: errors.append(str(error)))
    await page.goto((ROOT / "src/options/options.html").as_uri(), wait_until="domcontentloaded")
    await page.wait_for_function("() => document.querySelector('#preset').options.length > 3")
    assert await page.locator("html").get_attribute("lang") == language
    await page.locator("#preset").select_option("deepseek")
    await page.locator("#apiKey").fill("FAKE_DEMO_KEY_NOT_REAL")
    await page.locator("#save").click()
    await page.wait_for_function("() => window.__promo.config().baseUrl === 'https://api.deepseek.com/v1'")
    assert await page.locator("#apiKey").get_attribute("type") == "password"
    assert await page.locator("#model").input_value() == "deepseek-chat"
    assert await page.locator("#maxTokens").input_value() == "4000"
    await page.evaluate("() => window.scrollTo(0, document.querySelector('#welcome').offsetTop - 38)")
    await page.mouse.move(1500, 870)
    provider_height = await page.evaluate("""() => {
        const top = document.querySelector('#welcome').getBoundingClientRect().top - 26;
        const bottom = document.querySelector('#apiKey').closest('.row').getBoundingClientRect().bottom + 10;
        return Math.ceil(bottom - top);
    }""")
    assets["providers"] = await base._capture(page, out, "providers", ["#welcome"], {
        "preset": "#preset", "provider": "#provider", "base_url": "#baseUrl", "model": "#model", "api_key": "#apiKey",
    }, max_height=provider_height)
    assert {"preset", "provider", "base_url", "model", "api_key"} <= set(assets["providers"]["targets"]), (language, "provider controls clipped")
    checks["deepseek_preset_saved"] = True
    checks["only_fake_key_masked"] = True
    checks["default_max_tokens_4000"] = True
    # Configuring a localized custom template is a normal settings operation.
    # {{style}} expands to the product's Chinese backend guidance, so this
    # demonstration uses a literal localized style and real count/lang variables.
    system = scene["system_prompt"].replace("{{style}}", TEMPLATE_COPY[language][0])
    await page.locator("#persona").fill(scene["persona"])
    await page.locator("#customInstruction").fill(scene["instruction"])
    await page.locator("#systemPrompt").fill(system)
    await page.locator("#userPrompt").fill(TEMPLATE_COPY[language][1])
    await page.locator("#lang").select_option(language)
    await page.locator("#save").click()
    await page.wait_for_function("persona => window.__promo.config().persona === persona", arg=scene["persona"])
    await page.locator("#preview").click()
    await page.wait_for_function("() => window.__promo.previewCount > 0 && document.querySelector('#pvSystem').textContent.length > 30")
    assert scene["persona"] in await page.locator("#pvSystem").inner_text()
    assert scene["tweet"] in await page.locator("#pvUser").inner_text()
    assert "{{" not in await page.locator("#pvSystem").inner_text()
    await page.evaluate("() => window.scrollTo(0, document.querySelector('#promptCard').offsetTop - 38)")
    prompt_height = await page.evaluate("""() => {
        const top = document.querySelector('#promptCard').getBoundingClientRect().top - 26;
        const bottom = document.querySelector('#promptCard .varbox').getBoundingClientRect().bottom + 8;
        return Math.ceil(bottom - top);
    }""")
    assets["prompt"] = await base._capture(page, out, "prompt", ["#promptCard"], {
        "format": "#promptFormat", "persona": "#persona", "instruction": "#customInstruction",
        "variables": "#varList", "system": "#systemPrompt", "preview": "#preview",
    }, max_height=prompt_height)
    assert {"format", "persona", "instruction", "variables"} <= set(assets["prompt"]["targets"]), (language, "prompt controls clipped")
    await page.evaluate("() => window.scrollTo(0, document.querySelector('#previewBox').getBoundingClientRect().top + window.scrollY - 38)")
    assets["prompt-preview"] = await base._capture(page, out, "prompt-preview", ["#previewBox"], {
        "preview": "#previewBox", "system": "#pvSystem", "user": "#pvUser",
    }, max_height=810)
    checks["localized_persona_saved_and_real_prompt_preview_rendered"] = True
    checks["real_system_and_user_preview_captured"] = True
    checks["settings_crop_keeps_selected_controls_complete"] = True
    await page.close()


async def render_assets(out_dir: str, language: str = "zh") -> dict:
    out = Path(out_dir).resolve()
    out.mkdir(parents=True, exist_ok=True)
    if language not in LANGUAGES:
        raise ValueError(f"Unsupported language: {language}")
    scene, copy = SCENES[language], COPY[language]
    labels = copy["statuses"]
    assets: dict[str, dict] = {}
    checks: dict[str, Any] = {}
    errors: list[str] = []
    blocked: list[str] = []
    fixture_hits = 0

    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(headless=True)
        context = await browser.new_context(
            viewport=VIEWPORT, device_scale_factor=1,
            color_scheme="dark", locale=scene["locale"], service_workers="block")
        await context.add_init_script(script=demo_mock(language))

        async def route_request(route: Any) -> None:
            nonlocal fixture_hits
            url = route.request.url
            if url == base.FIXTURE_URL:
                fixture_hits += 1
                await route.fulfill(status=200, content_type="text/html; charset=utf-8",
                                    body=fixture_html(language))
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
        for rel in [*base.CONTENT_SCRIPTS[:2], "src/shared/i18n.js", *base.CONTENT_SCRIPTS[2:]]:
            await page.add_script_tag(path=str(ROOT / rel))
        await page.add_style_tag(content="""
          .xai-panel{left:225px!important;top:95px!important}
          .xai-st{font-size:0!important}
          .xai-st::after{content:attr(data-promo-label);font-size:11.5px;color:#8b98a5}
        """)
        await page.wait_for_function("() => window.__xaiInited === true")

        async def capture(name: str, label: str = "") -> None:
            if await page.locator(".xai-st").count():
                await page.locator(".xai-st").evaluate(
                    "(node,label)=>node.setAttribute('data-promo-label',label)", label)
            await page.mouse.move(1500, 870)
            await page.evaluate("async () => { await document.fonts.ready; await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))); }")
            for selector in (".xai-panel", "#reply-dialog"):
                node = page.locator(selector)
                if await node.count() and await node.is_visible():
                    box = await node.bounding_box()
                    assert box and (FIXED_CROP["x"] <= box["x"] and FIXED_CROP["y"] <= box["y"] and
                        box["x"] + box["width"] <= FIXED_CROP["x"] + FIXED_CROP["width"] and
                        box["y"] + box["height"] <= FIXED_CROP["y"] + FIXED_CROP["height"]), (language, name, selector, box, "cropped UI")
            if await page.locator('.xai-it[data-i]').count():
                assert await page.locator('.xai-list').evaluate('(node) => node.scrollHeight <= node.clientHeight + 1'), (language, name, "clipped replies")
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

        async def start(name: str, label: str | None = None) -> str:
            old = await page.evaluate("() => window.__promo.latest?.id || ''")
            await page.locator(".xai-btn--go").click()
            await page.wait_for_function(
                "old => window.__promo.latest?.id !== old && window.__promo.latest?.stage === 'unfinished'",
                arg=old)
            assert await page.locator(".xai-btn--go").is_disabled()
            await capture(name, label or labels["loading"])
            return await page.evaluate("() => window.__promo.latest.id")

        async def finish(name: str, label: str | None = None) -> list[str]:
            expected = await page.evaluate("() => window.__promo.latest.list")
            await page.evaluate("() => window.__promo.release('done')")
            await page.wait_for_function("() => !document.querySelector('.xai-btn--go').disabled")
            actual = await page.locator('.xai-it[data-i] .xai-it__x').all_inner_texts()
            assert actual == expected, (name, actual, expected)
            await capture(name, label or labels["results"])
            return actual

        await capture("timeline")
        # A real browser click opens the fixture's reply dialog; the current
        # extension's main.js detects it and starts its configured auto flow.
        await page.locator("#reply-demo").click()
        await page.wait_for_function("() => window.__promo.latest?.stage === 'unfinished'")
        await page.wait_for_selector(".xai-panel.is-open")
        assert await page.locator('.xai-it[data-i]').count() == 0
        await capture("loading", labels["loading"])
        checks["native_reply_click_auto_opens_and_generates"] = True

        await page.evaluate("() => window.__promo.release('partial')")
        await page.wait_for_function("() => document.querySelectorAll('.xai-it[data-i]').length === 1")
        await capture("partial", labels["partial"])
        assert await finish("results") == scene["replies"]
        checks["streaming_first_then_three_complete_candidates"] = True

        await page.locator('.xai-it[data-i="1"]').click()
        await page.wait_for_function(
            "text => document.querySelector('#reply-editor').innerText.trim() === text",
            arg=scene["replies"][1])
        assert await page.locator("#publish-demo").is_disabled()
        await capture("filled", labels["filled"])
        checks["native_candidate_click_fills_exact_reply"] = True

        for style in ("humor", "pro"):
            await page.locator(f'[data-k="style"] [data-v="{style}"]').click()
            await page.wait_for_function("style => window.__promo.config().style === style", arg=style)
            await capture(f"{style}-selected", labels["style_selected"])
            await start(f"{style}-loading")
            assert await page.evaluate("() => window.__promo.latest.payload.extra.style") == style
            result = await finish(f"style-{style}")
            if style == "humor":
                assert result == copy["humor_replies"]
            else:
                assert result == copy["pro_replies"]
        checks["real_style_controls_selected_saved_and_sent"] = True

        # Real controls select a single reply in this video's own language.
        # The fresh configuration starts with automatic reply-language detection.
        await page.locator('[data-k="count"] [data-v="1"]').click()
        await page.wait_for_function("() => window.__promo.config().count === 1")
        await capture("count-selected", labels["count_selected"])
        await page.locator('.xai-sel[data-k="lang"]').select_option(language)
        await page.wait_for_function("language => window.__promo.config().count === 1 && window.__promo.config().lang === language", arg=language)
        await capture("language-selected", labels["language_selected"])
        await start("language-loading", labels["language_loading"])
        assert await page.evaluate("() => window.__promo.latest.payload.extra.count") == 1
        assert await page.evaluate("() => window.__promo.latest.payload.extra.lang") == language
        localized = await finish("language-results", labels["language_results"])
        assert localized == copy["pro_replies"][:1]
        await page.locator('.xai-it[data-i="0"]').click()
        await page.wait_for_function(
            "text => document.querySelector('#reply-editor').innerText.trim() === text",
            arg=localized[0])
        await capture("language-filled", labels["language_filled"])
        checks["count_one_target_language_requested_rendered_and_filled"] = True

        # Preserve the visible one-reply configuration through stop and retry.
        assert await page.evaluate("language => window.__promo.config().count === 1 && window.__promo.config().lang === language", language)
        cancelled_id = await start("cancel-loading", labels["language_loading"])
        await page.locator(".xai-btn--stop").click()
        await page.wait_for_function("() => !document.querySelector('.xai-btn--go').disabled")
        assert await page.evaluate("() => window.__promo.latest.closed && window.__promo.latest.cancelled")
        await capture("demo-cancelled", labels["cancelled"])
        retry_id = await start("retry-loading", labels["retry_loading"])
        assert retry_id != cancelled_id
        assert await finish("retry-results", labels["language_results"]) == localized
        assert await page.evaluate(
            "id => window.__promo.tasks.find(task=>task.id===id).closed", cancelled_id)
        checks["native_stop_then_new_request_completes"] = True
        checks["cancelled_request_remains_closed"] = True
        checks["publication_disabled_throughout"] = await page.locator("#publish-demo").is_disabled()
        checks["main_flow_request_count"] = await page.evaluate("() => window.__promo.tasks.length")
        checks["fixed_crop_all_main_flow_scenes"] = True
        checks["full_panel_composer_and_candidates_inside_crop"] = True
        checks["interface_language_matches_video"] = await page.locator('.xai-panel').get_attribute('lang') == language
        assert checks["interface_language_matches_video"]
        checks["no_candidate_scrolling_required"] = True
        checks["no_timing_claims"] = True
        await capture_settings(context, out, language, assets, checks, errors)
        assert not errors, errors
        assert fixture_hits == 1
        checks["fresh_nonpersistent_browser"] = True
        checks["all_http_https_intercepted"] = True
        checks["no_page_errors"] = True
        await context.close()
        await browser.close()

    result = {
        "language": language, "viewport": VIEWPORT, "main_crop": FIXED_CROP, "assets": assets,
        "paths": {name: asset["path"] for name, asset in assets.items()},
        "checks": checks, "page_errors": errors, "blocked_http": blocked,
        "demo": {"fictional": True, "model_label": copy["model_label"],
                 "tweet": {**base.TWEET, "author": scene["author"], "text": scene["tweet"]},
                 "candidates": scene["replies"], "target_language_candidates": copy["pro_replies"][:1],
                 "real_extension_ui": True, "mock_ai": True, "publication_enabled": False},
    }
    (out / "metadata.json").write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", default=str(ROOT / "dev/_promo_demo/frames"))
    parser.add_argument("--language", choices=LANGUAGES, default="zh")
    args = parser.parse_args()
    metadata = asyncio.run(render_assets(args.out, args.language))
    print(json.dumps({"paths": metadata["paths"], "checks": metadata["checks"]}, ensure_ascii=False, indent=2))
