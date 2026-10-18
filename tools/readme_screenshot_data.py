"""Localized, fictional content for the five README screenshot scenes."""

SCENES = {
    "zh": {
        "locale": "zh-CN",
        "home": "首页",
        "drafts": "草稿",
        "reply_placeholder": "发布你的回复",
        "reply_button": "回复",
        "author": "企鹅",
        "photographer": "摄影猫",
        "ago_one": "1 小时前",
        "ago_two": "2 小时前",
        "tweet": "今天开始用 AI 写代码，把重复工作交给它后，终于有时间认真设计和测试了。大家都怎么用？",
        "photo_tweet": "傍晚的光落在街角，熟悉的城市也有新的样子。",
        "replies": [
            "固定格式的代码交给 AI，接口设计和取舍自己来。",
            "我会让它先列测试边界，再检查遗漏的异常路径。",
            "每次只让它改一个小任务，跑完测试再继续。",
        ],
        "persona": "我是一名后端工程师，表达直接、简洁。",
        "instruction": "不加表情，用具体观点回应。",
        "system_prompt": (
            "围绕原推文写回复。\n"
            "风格：{{style}}\n"
            "条数：{{count}}\n"
            "语言：{{lang}}\n"
            "补充要求：{{customInstruction}}\n"
            "仅输出 JSON 字符串数组。"
        ),
    },
    "en": {
        "locale": "en-US",
        "home": "Home",
        "drafts": "Drafts",
        "reply_placeholder": "Post your reply",
        "reply_button": "Reply",
        "author": "Penguin",
        "photographer": "Photo Cat",
        "ago_one": "1h ago",
        "ago_two": "2h ago",
        "tweet": (
            "I started using AI to write code today. Letting it handle repetitive work "
            "finally leaves me time to focus on design and testing. How are you using it?"
        ),
        "photo_tweet": "Evening light on a street corner makes a familiar city feel new.",
        "replies": [
            "I give AI the boilerplate and make the API design decisions myself.",
            "I ask it for test cases, then check for missing error paths.",
            "I keep each task small and run the tests before moving on.",
        ],
        "persona": "I am a backend engineer. I write directly and concisely.",
        "instruction": "Use no emoji. Respond with a specific point.",
        "system_prompt": (
            "Write replies relevant to the original post.\n"
            "Style: {{style}}\n"
            "Count: {{count}}\n"
            "Language: {{lang}}\n"
            "Additional instructions: {{customInstruction}}\n"
            "Output only a JSON array of strings."
        ),
    },
    "ja": {
        "locale": "ja-JP",
        "home": "ホーム",
        "drafts": "下書き",
        "reply_placeholder": "返信をポスト",
        "reply_button": "返信",
        "author": "ペンギン",
        "photographer": "写真ねこ",
        "ago_one": "1時間前",
        "ago_two": "2時間前",
        "tweet": (
            "今日から AI を使ってコードを書いています。繰り返しの作業を任せたら、"
            "設計とテストにじっくり取り組む時間ができました。みなさんはどう使っていますか？"
        ),
        "photo_tweet": "夕方の光が差す街角。見慣れた街にも、新しい表情がありました。",
        "replies": [
            "定型コードは AI に任せて、API の設計判断は自分でしています。",
            "テストケースを挙げてもらい、異常系の抜けを確認しています。",
            "一度に頼む作業を小さくして、テストが通ってから次へ進みます。",
        ],
        "persona": "バックエンドエンジニアです。率直かつ簡潔に書きます。",
        "instruction": "絵文字は使わず、具体的な意見で返信してください。",
        "system_prompt": (
            "元のポストに沿った返信を書いてください。\n"
            "スタイル：{{style}}\n"
            "件数：{{count}}\n"
            "言語：{{lang}}\n"
            "追加の指示：{{customInstruction}}\n"
            "JSON 文字列配列のみを出力してください。"
        ),
    },
    "vi": {
        "locale": "vi-VN",
        "home": "Trang chủ",
        "drafts": "Bản nháp",
        "reply_placeholder": "Đăng câu trả lời của bạn",
        "reply_button": "Trả lời",
        "author": "Chim Cánh Cụt",
        "photographer": "Mèo Chụp Ảnh",
        "ago_one": "1 giờ trước",
        "ago_two": "2 giờ trước",
        "tweet": (
            "Hôm nay tôi bắt đầu dùng AI để viết mã. Giao việc lặp lại cho AI, "
            "cuối cùng tôi có thời gian tập trung vào thiết kế và kiểm thử. "
            "Mọi người dùng AI thế nào?"
        ),
        "photo_tweet": "Nắng chiều nơi góc phố khiến thành phố quen thuộc có một vẻ mới.",
        "replies": [
            "Tôi giao phần mã lặp lại cho AI, còn tự quyết định thiết kế API.",
            "Tôi nhờ AI liệt kê ca kiểm thử, rồi tìm các luồng lỗi còn thiếu.",
            "Tôi chia nhỏ từng việc và chạy kiểm thử trước khi làm tiếp.",
        ],
        "persona": "Tôi là kỹ sư backend, viết thẳng vào vấn đề và ngắn gọn.",
        "instruction": "Không dùng emoji. Trả lời bằng một ý kiến cụ thể.",
        "system_prompt": (
            "Viết câu trả lời sát với bài đăng gốc.\n"
            "Phong cách: {{style}}\n"
            "Số câu: {{count}}\n"
            "Ngôn ngữ: {{lang}}\n"
            "Yêu cầu bổ sung: {{customInstruction}}\n"
            "Chỉ xuất một mảng JSON chứa các chuỗi."
        ),
    },
    "ko": {
        "locale": "ko-KR",
        "home": "홈",
        "drafts": "임시 저장",
        "reply_placeholder": "내 답글 게시하기",
        "reply_button": "답글",
        "author": "펭귄",
        "photographer": "사진 찍는 고양이",
        "ago_one": "1시간 전",
        "ago_two": "2시간 전",
        "tweet": (
            "오늘부터 AI로 코드를 작성하기 시작했어요. 반복 작업을 맡기니 "
            "드디어 설계와 테스트에 집중할 시간이 생겼네요. 다들 어떻게 활용하시나요?"
        ),
        "photo_tweet": "저녁 햇살이 비치는 길모퉁이에서 익숙한 도시의 새로운 모습을 봤어요.",
        "replies": [
            "반복되는 코드는 AI에 맡기고, API 설계는 직접 결정해요.",
            "테스트 케이스를 먼저 뽑게 한 다음 빠진 예외 경로를 확인해요.",
            "작업을 작게 나누고 테스트를 통과하면 다음으로 넘어가요.",
        ],
        "persona": "저는 백엔드 엔지니어입니다. 직접적이고 간결하게 씁니다.",
        "instruction": "이모지 없이 구체적인 의견으로 답해주세요.",
        "system_prompt": (
            "원문 게시물에 맞는 답글을 작성하세요.\n"
            "스타일: {{style}}\n"
            "개수: {{count}}\n"
            "언어: {{lang}}\n"
            "추가 지침: {{customInstruction}}\n"
            "JSON 문자열 배열만 출력하세요."
        ),
    },
}
