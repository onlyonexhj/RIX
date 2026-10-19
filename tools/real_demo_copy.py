"""Localized overlays and narration for the edited, real X screen recording.

The source interface and generated replies remain Chinese in every version.
Only the added titles, captions, and narration are localized. In both examples,
the first suggestion fills automatically; the user then selects X's Reply button
and the page confirms the post was sent. Post authors are incidental to the
recorded workflow, not product endorsers.
"""

from demo_narration_data import VOICES


LANGUAGES = ("zh", "en", "ja", "vi", "ko")

WINDOWS = (
    (0, 3),
    (3, 11),
    (11, 19),
    (19, 29),
    (29, 37),
    (37, 45),
    (45, 55),
    (55, 60),
)

COPY = {
    "zh": {
        "product": "RIX",
        "header": "真实 X 页面实录",
        "edited_badge": "实录经剪辑 · 等待已压缩",
        "footer": "画面保留原始中文界面",
        "intro_title": ["在真实 X 页面", "演示回复全过程"],
        "outro_title": "检查回复，发布由你决定",
        "chapters": [
            "真实页面实录", "打开回复框", "读取上下文", "自动填入并确认发布",
            "换一条帖子", "查看生成结果", "确认发送成功", "发布由你决定",
        ],
        "captions": [
            "RIX · 真实页面操作实录",
            "打开第一条推文的回复框。",
            "面板读取上下文，展示风格、条数和输出语言，并自动开始生成。",
            "首条候选自动填入；检查后点击 X 的“回复”，页面提示发送成功。",
            "再打开一条含引用内容的帖子；其中英文原文显示为中文译文。",
            "等待过程已压缩；候选出现后，先检查回复内容。",
            "首条候选自动填入；用户点击“回复”后，页面再次提示发送成功。",
            "检查回复，发布由你决定。",
        ],
        "narration": [
            "RIX。",
            "这是在真实 X 页面上的操作。先点开第一条推文的回复框。",
            "面板读取上下文，显示风格、条数和输出语言，并自动开始生成。",
            "首条候选自动填入回复框。检查内容后，点击 X 的回复按钮，页面显示帖子已发送。",
            "再看一条含引用内容的帖子。这里，英文原文显示为中文译文。",
            "这段等待经过剪辑。候选出现后，先检查内容是否符合你的意思。",
            "这次首条候选也自动填入。用户确认后点击回复，页面再次显示帖子已发送。发布前仍可修改内容。",
            "检查回复，发布由你决定。",
        ],
    },
    "en": {
        "product": "RIX",
        "header": "Recorded on a real X page",
        "edited_badge": "Edited recording · Waits shortened",
        "footer": "Original Chinese interface retained",
        "intro_title": ["A real X page", "A reply workflow in action"],
        "outro_title": "Review your reply. You decide when to post",
        "chapters": [
            "Real screen recording", "Open Reply", "Read the context", "Auto-fill and post",
            "Try another post", "Review the results", "Confirm it was sent", "You decide when to post",
        ],
        "captions": [
            "RIX · A real screen recording",
            "Open the reply dialog for the first post.",
            "The panel reads the context, shows style, count and language, and starts generating.",
            "The first suggestion fills automatically. Review, then click X’s Reply button to post.",
            "Next: a post with quoted content. Its English text is shown in Chinese translation.",
            "The wait is shortened in this edit. Review the suggestions when they appear.",
            "The user clicks Reply after auto-fill. X again confirms the post was sent.",
            "Review your reply. You decide when to post.",
        ],
        "narration": [
            "RIX.",
            "This is a recording of a real X page. First, open the post's reply dialog.",
            "The panel reads the context, shows the style, count, and reply language, and starts generating.",
            "The first suggestion fills the editor automatically. After reviewing it, the user clicks X's Reply button. The page confirms the post was sent.",
            "Next, open a post with quoted content. Its English text is shown in Chinese translation.",
            "The waiting time is shortened in this edit. When suggestions appear, check that they say what you mean.",
            "Again, the first suggestion fills automatically. The user clicks Reply, and X confirms it was sent. You can still edit the text before posting.",
            "Review your reply. You decide when to post.",
        ],
    },
    "ja": {
        "product": "RIX",
        "header": "実際の X ページを収録",
        "edited_badge": "編集済み · 待ち時間を短縮",
        "footer": "元の中国語画面を使用",
        "intro_title": ["実際の X ページで", "返信の流れを実演"],
        "outro_title": "返信を確認。投稿は自分で決める",
        "chapters": [
            "実際の画面を収録", "返信画面を開く", "文脈を読み取る", "自動入力から投稿へ",
            "別の投稿でも試す", "生成結果を確認", "送信完了を確認", "投稿は自分で決める",
        ],
        "captions": [
            "RIX · 実際のページで操作を収録",
            "最初の投稿の返信画面を開きます。",
            "文脈を読み取り、スタイル・件数・言語を表示。自動で生成が始まります。",
            "最初の候補が自動入力されます。確認して X の返信ボタンを押すと、送信完了の表示。",
            "次は引用を含む投稿。英語の原文が中国語訳で表示されています。",
            "待ち時間は編集で短縮しています。候補が出たら内容を確認。",
            "今回も最初の候補が自動入力。返信ボタンを押すと、再び送信完了の表示。",
            "返信を確認。投稿は自分で決める。",
        ],
        "narration": [
            "RIX。",
            "実際の X ページでの操作です。まず、投稿の返信画面を開きます。",
            "文脈を読み取り、スタイル、件数、言語を表示。自動で生成が始まります。",
            "最初の候補が自動入力されます。確認して X の返信ボタンを押すと、投稿の送信完了が表示されます。",
            "次は引用を含む投稿です。英語の原文が、中国語訳で表示されています。",
            "待ち時間は編集で短縮しています。候補が出たら、伝えたい内容か確認します。",
            "今回も最初の候補が自動入力。返信ボタンを押すと、再び送信完了の表示。投稿前には編集もできます。",
            "返信を確認。投稿は自分で決める。",
        ],
    },
    "vi": {
        "product": "RIX",
        "header": "Ghi hình trên trang X thực tế",
        "edited_badge": "Đã biên tập · Rút ngắn thời gian chờ",
        "footer": "Giữ nguyên giao diện tiếng Trung",
        "intro_title": ["Trên trang X thực tế", "Xem quy trình trả lời"],
        "outro_title": "Kiểm tra câu trả lời. Bạn quyết định khi nào đăng",
        "chapters": [
            "Bản ghi thực tế", "Mở hộp trả lời", "Đọc ngữ cảnh", "Tự điền rồi xác nhận đăng",
            "Thử bài đăng khác", "Xem kết quả", "Xác nhận đã gửi", "Bạn quyết định khi nào đăng",
        ],
        "captions": [
            "RIX · Ghi hình thao tác thực tế",
            "Mở hộp trả lời của bài đăng đầu tiên.",
            "Trợ lý đọc ngữ cảnh, hiện phong cách, số câu, ngôn ngữ và tự tạo gợi ý.",
            "Gợi ý đầu tự điền. Kiểm tra rồi nhấn Trả lời trên X để đăng.",
            "Bài tiếp theo có trích dẫn. Nguyên văn tiếng Anh được dịch sang tiếng Trung.",
            "Thời gian chờ đã được rút ngắn khi biên tập. Hãy kiểm tra nội dung gợi ý.",
            "Sau khi tự điền, người dùng nhấn Trả lời. X lại xác nhận bài đã được gửi.",
            "Kiểm tra câu trả lời. Bạn quyết định khi nào đăng.",
        ],
        "narration": [
            "RIX.",
            "Đây là bản ghi trên trang X thực tế. Trước tiên, mở hộp trả lời của bài đăng.",
            "Trợ lý đọc ngữ cảnh, hiện phong cách, số câu và ngôn ngữ, rồi tự tạo gợi ý.",
            "Gợi ý đầu tự điền vào ô trả lời. Sau khi kiểm tra, người dùng nhấn Trả lời trên X. Trang xác nhận bài đã được gửi.",
            "Tiếp theo là bài có trích dẫn. Nguyên văn tiếng Anh được hiển thị bằng bản dịch tiếng Trung.",
            "Thời gian chờ đã được rút ngắn khi biên tập. Khi gợi ý xuất hiện, hãy kiểm tra nội dung.",
            "Gợi ý đầu lại tự điền. Người dùng nhấn Trả lời và X xác nhận đã gửi. Bạn vẫn có thể sửa trước khi đăng.",
            "Kiểm tra câu trả lời. Bạn quyết định khi nào đăng.",
        ],
    },
    "ko": {
        "product": "RIX",
        "header": "실제 X 페이지 녹화",
        "edited_badge": "편집된 녹화 · 대기 시간 단축",
        "footer": "원본 중국어 화면 유지",
        "intro_title": ["실제 X 페이지에서", "답글 작성 과정을 확인하세요"],
        "outro_title": "답글을 확인하고, 게시는 직접 결정하세요",
        "chapters": [
            "실제 화면 녹화", "답글 창 열기", "문맥 읽기", "자동 입력 후 게시 확인",
            "다른 게시물에서 시도", "생성 결과 확인", "전송 완료 확인", "게시는 직접 결정",
        ],
        "captions": [
            "RIX · 실제 페이지에서 녹화한 사용 과정",
            "첫 번째 게시물의 답글 창을 엽니다.",
            "문맥을 읽고 스타일, 개수, 언어를 표시하며 자동으로 생성을 시작합니다.",
            "첫 후보가 자동 입력됩니다. 확인 후 X의 답글 버튼을 누르면 전송 완료가 표시됩니다.",
            "다음은 인용이 있는 게시물입니다. 영어 원문이 중국어 번역으로 표시됩니다.",
            "편집으로 대기 시간을 줄였습니다. 후보가 나타나면 내용을 확인하세요.",
            "이번에도 첫 후보가 자동 입력됩니다. 답글 버튼을 누르면 다시 전송 완료가 표시됩니다.",
            "답글을 확인하고, 게시는 직접 결정하세요.",
        ],
        "narration": [
            "RIX.",
            "실제 X 페이지에서 녹화한 사용 과정입니다. 먼저 게시물의 답글 창을 엽니다.",
            "문맥을 읽고 스타일, 개수, 답글 언어를 표시하며, 자동으로 생성을 시작합니다.",
            "첫 후보가 자동 입력됩니다. 내용을 확인하고 X의 답글 버튼을 누르면, 게시물이 전송되었다는 안내가 표시됩니다.",
            "다음은 인용이 있는 게시물입니다. 영어 원문이 중국어 번역으로 표시됩니다.",
            "대기 시간은 편집으로 줄였습니다. 후보가 나타나면 원하는 내용인지 확인하세요.",
            "이번에도 첫 후보가 자동 입력됩니다. 답글 버튼을 누르면 다시 전송 완료가 표시됩니다. 게시 전에는 수정도 가능합니다.",
            "답글을 확인하고, 게시는 직접 결정하세요.",
        ],
    },
}
