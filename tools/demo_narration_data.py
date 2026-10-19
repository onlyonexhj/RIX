"""Localized narration for the existing 60-second product walkthrough.

Each line describes one complete scene, rather than reading every caption.
The build step measures synthesized speech before placing it in these windows.
Voices are standard synthetic voices, with no imitation of a real person.
"""

VOICES = {
    "zh": "zh-CN-XiaoxiaoNeural",
    "en": "en-US-JennyNeural",
    "ja": "ja-JP-NanamiNeural",
    "vi": "vi-VN-HoaiMyNeural",
    "ko": "ko-KR-SunHiNeural",
}

_WINDOWS = (
    (0, 3),
    (3, 11),
    (11, 18),
    (18, 28),
    (28, 35),
    (35, 41),
    (41, 48),
    (48, 55),
    (55, 60),
)

_TEXT = {
    "zh": (
        "RIX。",
        "点开推文下的回复按钮，助手就会读取上下文，自动生成候选回复。",
        "点击喜欢的候选，直接填入。你可以继续编辑，是否发布由你决定。",
        "想换种表达？选幽默，轻松一点；选专业，让观点更清晰。切换风格后，就能重新生成。",
        "按需调整回复条数，再选择中文，生成并填入新的回复。",
        "生成途中可以随时中止。想继续，再点一次生成。",
        "在设置里选择模型服务，再填入你自己的 API 密钥。",
        "设置人设，调整提示词，再预览内容，让回复更符合你的表达习惯。",
        "RIX，让表达更轻松。",
    ),
    "en": (
        "RIX.",
        "Open a post's reply dialog. The assistant reads the context and starts generating suggestions.",
        "Pick a suggestion to insert it. Edit the text, then decide whether to post.",
        "Want a different tone? Choose Humor for a lighter take, or Professional for a focused reply. Switch styles, then generate again.",
        "Choose how many suggestions you want. Select English, generate a reply, and insert it.",
        "You can stop generation anytime. Select Generate replies to try again.",
        "In Settings, choose your model provider and enter your own API key.",
        "Set your persona and prompts, then preview them to match the way you write.",
        "RIX. Make replying easier.",
    ),
    "ja": (
        "RIX。",
        "返信画面を開くと、文脈に合った候補が自動で表示されます。",
        "候補を選ぶと入力完了。編集して、投稿するかは自分で決めます。",
        "ユーモアで軽やかに。専門的なスタイルで、より具体的に。スタイルを変えて、別の表現を試せます。",
        "件数と言語を選べます。日本語の候補を生成して、入力します。",
        "生成はいつでも中止。もう一度押すと、再生成できます。",
        "モデルサービスを選び、自分の API キーを入力します。",
        "ペルソナとプロンプトを設定。プレビューで内容を確認できます。",
        "返信を、もっと手軽に。",
    ),
    "vi": (
        "RIX.",
        "Mở hộp trả lời. Trợ lý đọc ngữ cảnh và tự tạo các gợi ý.",
        "Chọn gợi ý để chèn vào ô trả lời. Sửa lại rồi tự quyết định có đăng hay không.",
        "Đổi sang Hài hước cho cách nói vui hơn, hoặc Chuyên nghiệp để tập trung vào ý chính. Chọn phong cách rồi tạo lại.",
        "Chọn số câu và tiếng Việt. Tạo gợi ý mới, kiểm tra rồi chèn vào ô trả lời.",
        "Bạn có thể dừng bất cứ lúc nào, rồi nhấn tạo lại khi cần.",
        "Trong Cài đặt, chọn nhà cung cấp và nhập API key của riêng bạn.",
        "Đặt vai trò và tùy chỉnh prompt. Xem trước để câu trả lời hợp cách viết của bạn.",
        "RIX. Trả lời dễ dàng hơn.",
    ),
    "ko": (
        "RIX.",
        "답글 창을 열면 문맥을 읽고, 답글 후보를 자동으로 만들어 줍니다.",
        "후보를 눌러 입력하세요. 수정하고 게시할지는 직접 결정합니다.",
        "유머로 가볍게, 전문적인 스타일로 더 구체적으로. 스타일을 바꿔 새로운 표현을 만들어 보세요.",
        "답글 개수와 언어를 고르세요. 한국어 후보를 만들고 입력합니다.",
        "언제든 생성을 중지하고, 필요할 때 다시 시작하세요.",
        "설정에서 모델 제공업체를 고르고, 본인의 API 키를 입력하세요.",
        "페르소나와 프롬프트를 설정하고, 미리보기로 내용을 확인하세요.",
        "RIX. 더 편하게 답글을 쓰세요.",
    ),
}

NARRATION = {
    language: [
        {"start": start, "end": end, "text": text}
        for (start, end), text in zip(_WINDOWS, lines, strict=True)
    ]
    for language, lines in _TEXT.items()
}
