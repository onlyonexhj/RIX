/** Runtime UI localization. Only explicitly marked extension UI is translated. */
(function (root) {
  'use strict';

  const XAI = (root.XAI = root.XAI || {});
  const ids = ['zh', 'en', 'ja', 'vi', 'ko'];
  const nativeNames = { zh: '中文', en: 'English', ja: '日本語', vi: 'Tiếng Việt', ko: '한국어' };
  // Chinese source text is the stable key; prompt templates and user content stay untouched.
  const rows = [
    ['跟随浏览器', 'Browser language', 'ブラウザーに合わせる', 'Theo trình duyệt', '브라우저 언어'],
    ['界面语言', 'Interface language', '表示言語', 'Ngôn ngữ giao diện', '인터페이스 언어'],
    ['输出语言', 'Reply language', '返信の言語', 'Ngôn ngữ trả lời', '답글 언어'],
    ['跟随原文', 'Match original', '原文に合わせる', 'Theo bài gốc', '원문에 맞춤'],
    ['中文', 'Chinese', '中国語', 'Tiếng Trung', '중국어'],
    ['X AI 回复助手', 'SmartReply for X', 'SmartReply for X', 'SmartReply for X', 'SmartReply for X'],
    ['AI 回复助手', 'AI Reply Assistant', 'AI 返信アシスタント', 'Trợ lý trả lời AI', 'AI 답글 도우미'],
    ['X AI 回复助手 · 设置', 'SmartReply for X · Settings', 'SmartReply for X · 設定', 'SmartReply for X · Cài đặt', 'SmartReply for X · 설정'],
    ['设置', 'Settings', '設定', 'Cài đặt', '설정'],
    ['保存', 'Save', '保存', 'Lưu', '저장'],
    ['已保存 ✓', 'Saved ✓', '保存しました ✓', 'Đã lưu ✓', '저장됨 ✓'],
    ['保存中…', 'Saving…', '保存中…', 'Đang lưu…', '저장 중…'],
    ['已自动保存', 'Saved automatically', '自動保存しました', 'Đã tự động lưu', '자동 저장됨'],
    ['保存失败：{error}', 'Save failed: {error}', '保存できませんでした：{error}', 'Lưu thất bại: {error}', '저장 실패: {error}'],
    ['保存设置失败：{error}', 'Could not save settings: {error}', '設定を保存できませんでした：{error}', 'Không thể lưu cài đặt: {error}', '설정을 저장하지 못했습니다: {error}'],
    ['关闭', 'Close', '閉じる', 'Đóng', '닫기'],
    ['复位', 'Reset position', '位置を戻す', 'Đặt lại vị trí', '위치 초기화'],
    ['复位到默认位置', 'Restore default position', '既定の位置に戻す', 'Khôi phục vị trí mặc định', '기본 위치로 복원'],
    ['按住拖动可移动面板，双击此处复位', 'Drag to move the panel; double-click to reset', 'ドラッグで移動、ダブルクリックで位置を戻します', 'Kéo để di chuyển bảng; nhấp đúp để đặt lại', '드래그하여 패널 이동, 두 번 클릭하여 위치 초기화'],
    ['回复对象', 'Replying to', '返信先', 'Đang trả lời', '답글 대상'],
    ['风格', 'Style', 'スタイル', 'Phong cách', '스타일'],
    ['条数', 'Count', '件数', 'Số lượng', '개수'],
    ['生成回复', 'Generate replies', '返信を生成', 'Tạo câu trả lời', '답글 생성'],
    ['自动生成', 'Auto-generate', '自動生成', 'Tự động tạo', '자동 생성'],
    ['勾选：打开面板即自动生成回复；不勾选：手动点「生成回复」', 'On: generate replies when the panel opens. Off: select Generate replies manually.', 'オン：パネルを開くと自動生成。オフ：「返信を生成」を押して生成します。', 'Bật: tự động tạo khi mở bảng. Tắt: nhấn Tạo câu trả lời để tạo thủ công.', '켜기: 패널을 열면 자동 생성합니다. 끄기: 답글 생성을 직접 누릅니다.'],
    ['中止', 'Stop', '停止', 'Dừng', '중지'],
    ['已中止', 'Stopped', '停止しました', 'Đã dừng', '중지됨'],
    ['重试', 'Retry', '再試行', 'Thử lại', '다시 시도'],
    ['重新生成', 'Regenerate', '再生成', 'Tạo lại', '다시 생성'],
    ['生成中…', 'Generating…', '生成中…', 'Đang tạo…', '생성 중…'],
    ['正在生成…', 'Generating…', '生成中…', 'Đang tạo…', '생성 중…'],
    ['正在生成回复…', 'Generating replies…', '返信を生成中…', 'Đang tạo câu trả lời…', '답글 생성 중…'],
    ['复制', 'Copy', 'コピー', 'Sao chép', '복사'],
    ['已复制', 'Copied', 'コピーしました', 'Đã sao chép', '복사됨'],
    ['复制失败', 'Copy failed', 'コピーできませんでした', 'Sao chép thất bại', '복사 실패'],
    ['填入 →', 'Insert →', '入力 →', 'Chèn →', '입력 →'],
    ['已填入 ✓', 'Inserted ✓', '入力しました ✓', 'Đã chèn ✓', '입력됨 ✓'],
    ['超长', 'Too long', '文字数超過', 'Quá dài', '글자 수 초과'],
    ['选择风格后点「生成回复」', 'Choose a style, then select Generate replies', 'スタイルを選び「返信を生成」を押してください', 'Chọn phong cách, rồi nhấn Tạo câu trả lời', '스타일을 선택한 뒤 답글 생성을 누르세요'],
    ['结果会出现在这里，点击任一条即可回填', 'Replies appear here. Select one to insert it.', '返信候補がここに表示されます。クリックすると入力できます。', 'Kết quả sẽ hiện ở đây. Nhấp một câu để chèn.', '답글이 여기에 표시됩니다. 원하는 답글을 눌러 입력하세요.'],
    ['（纯媒体推文）', '(Media-only post)', '（メディアのみのポスト）', '(Bài đăng chỉ có nội dung đa phương tiện)', '(미디어만 있는 게시물)'],
    ['请先打开这条推文的回复弹层，确认回复对象后再填入', 'Open this post’s reply dialog first, then insert the reply after confirming the recipient.', 'このポストの返信画面を開き、返信先を確認してから入力してください。', 'Hãy mở hộp trả lời của bài đăng này và xác nhận đối tượng trước khi chèn.', '이 게시물의 답글 창을 열고 대상을 확인한 뒤 입력하세요.'],
    ['回复对象尚未匹配，未填入', 'Reply target does not match; nothing inserted', '返信先が一致しないため入力していません', 'Đối tượng trả lời chưa khớp; chưa chèn', '답글 대상이 일치하지 않아 입력하지 않았습니다'],
    ['未能填入输入框，请重试', 'Could not insert the reply. Please try again.', '入力できませんでした。もう一度お試しください。', 'Không thể chèn vào ô nhập. Vui lòng thử lại.', '입력하지 못했습니다. 다시 시도하세요.'],
    ['已填入输入框', 'Inserted into the reply box', '返信欄に入力しました', 'Đã chèn vào ô trả lời', '답글 입력란에 입력했습니다'],
    ['已填入输入框（字数 {count}）', 'Inserted into the reply box ({count} characters)', '返信欄に入力しました（{count} 文字）', 'Đã chèn vào ô trả lời ({count} ký tự)', '답글 입력란에 입력했습니다 ({count}자)'],
    ['点时间线的回复气泡打开弹层后，点结果即可回填', 'Open the reply dialog from the timeline, then select a reply to insert.', 'タイムラインの返信ボタンで返信画面を開き、候補を選んで入力してください。', 'Mở hộp trả lời từ dòng thời gian, rồi chọn một câu để chèn.', '타임라인에서 답글 창을 연 뒤 원하는 답글을 눌러 입력하세요.'],
    ['打开回复面板失败：{error}', 'Could not open the reply panel: {error}', '返信パネルを開けませんでした：{error}', 'Không thể mở bảng trả lời: {error}', '답글 패널을 열지 못했습니다: {error}'],
    ['未能读取这条推文的内容', 'Could not read this post', 'このポストを読み取れませんでした', 'Không thể đọc nội dung bài đăng này', '이 게시물의 내용을 읽지 못했습니다'],
    ['默认风格', 'Default style', '既定のスタイル', 'Phong cách mặc định', '기본 스타일'],
    ['生成条数', 'Number of replies', '生成する件数', 'Số câu trả lời', '생성할 답글 수'],
    ['打开 X 时间线', 'Open X timeline', 'X のタイムラインを開く', 'Mở dòng thời gian X', 'X 타임라인 열기'],
    ['全部设置', 'All settings', 'すべての設定', 'Tất cả cài đặt', '전체 설정'],
    ['启用插件', 'Enable extension', '拡張機能を有効にする', 'Bật tiện ích', '확장 프로그램 사용'],
    ['插件已停用。开启后，在 X 上点回复气泡即会出现 AI 面板。', 'The extension is off. Turn it on, then select Reply on X to open the AI panel.', '拡張機能は無効です。有効にすると、X の返信ボタンから AI パネルを開けます。', 'Tiện ích đang tắt. Bật tiện ích, rồi nhấn Trả lời trên X để mở bảng AI.', '확장 프로그램이 꺼져 있습니다. 켠 뒤 X에서 답글 버튼을 누르면 AI 패널이 열립니다.'],
    ['未配置 API Key。', 'No API key configured.', 'API キーが未設定です。', 'Chưa cấu hình API Key.', 'API 키가 설정되지 않았습니다.'],
    ['点「全部设置」', 'Open All settings', '「すべての設定」を開いて', 'Mở Tất cả cài đặt', '전체 설정을 열어'],
    ['填一个。', 'to add one.', 'キーを入力してください。', 'để thêm khóa.', '키를 추가하세요.'],
    ['已就绪', 'Ready', '準備完了', 'Sẵn sàng', '준비됨'],
    ['未填模型', 'No model selected', 'モデル未設定', 'Chưa chọn mô hình', '모델 미설정'],
    ['点回复气泡 → 面板自动出现 → 点「生成回复」。', 'Select Reply → the panel opens → select Generate replies.', '返信ボタン → パネルが開く →「返信を生成」を押します。', 'Nhấn Trả lời → bảng tự mở → nhấn Tạo câu trả lời.', '답글 버튼 → 패널 열림 → 답글 생성을 누르세요.'],
    ['快捷键', 'Shortcuts', 'ショートカット', 'Phím tắt', '단축키'],
    ['生成', 'Generate', '生成', 'Tạo', '생성'],
    ['自动', 'Auto', '自動', 'Tự động', '자동'],
    ['幽默', 'Humor', 'ユーモア', 'Hài hước', '유머'],
    ['专业', 'Professional', '専門的', 'Chuyên nghiệp', '전문적'],
    ['犀利', 'Bold', '鋭い意見', 'Sắc sảo', '날카로운 의견'],
    ['共情', 'Empathetic', '共感', 'Đồng cảm', '공감'],
    ['争议', 'Contrarian', '反対意見', 'Trái chiều', '반대 의견'],
    ['抽象', 'Meme', 'ミーム', 'Meme', '밈'],
    ['翻译润色', 'Translate & polish', '翻訳・推敲', 'Dịch và trau chuốt', '번역 및 다듬기'],
    ['嘲讽', 'Sarcastic', '皮肉', 'Châm biếm', '풍자'],
    ['按推文自动选口吻与语言，不合适就跳过', 'Choose a tone and language for each post; skip unsuitable posts', 'ポストに合う口調と言語を選び、不適切な内容はスキップ', 'Tự chọn giọng điệu và ngôn ngữ theo bài đăng; bỏ qua khi không phù hợp', '게시물에 맞는 말투와 언어를 선택하고 적절하지 않으면 건너뜁니다'],
    ['轻松调侃，接梗，适度玩梗', 'Lighthearted wit with a touch of meme humor', '気軽な冗談や適度なネタで返す', 'Dí dỏm, vui vẻ, dùng meme vừa phải', '가벼운 농담과 적당한 밈을 사용합니다'],
    ['有数据、有观点，干货感强', 'Substantive insights with facts and clear opinions', '事実と意見を交えた中身のある返信', 'Có thông tin, quan điểm rõ ràng và giá trị thực tế', '근거와 의견이 담긴 유익한 답글'],
    ['观点鲜明，有锋芒敢反驳', 'A clear, bold viewpoint that challenges ideas', '明確で鋭く、反論も恐れない意見', 'Quan điểm rõ ràng, sắc bén, dám phản biện', '명확하고 날카롭게 반론을 제시합니다'],
    ['真诚走心，情绪共鸣', 'Sincere and emotionally supportive', '誠実で気持ちに寄り添う', 'Chân thành, tạo sự đồng cảm', '진심을 담아 감정에 공감합니다'],
    ['反主流、挑战共识，钓评论', 'Challenge consensus and invite debate', '通説に異を唱え、議論を促す', 'Thách thức quan điểm phổ biến, khơi gợi thảo luận', '통념에 도전하고 토론을 유도합니다'],
    ['发疯文学、无意义梗', 'Absurdist humor and surreal memes', '不条理なユーモアやシュールなネタ', 'Hài hước phi lý và meme ngẫu hứng', '엉뚱한 유머와 초현실적인 밈'],
    ['忠实翻译成目标语言', 'Translate faithfully into the target language', '指定言語へ忠実に翻訳', 'Dịch sát nghĩa sang ngôn ngữ đích', '대상 언어로 충실하게 번역합니다'],
    ['阴阳怪气但克制', 'Subtle sarcasm without going overboard', '控えめな皮肉', 'Châm biếm nhẹ nhàng, có chừng mực', '선을 넘지 않는 은근한 풍자'],
    ['短', 'Short', '短め', 'Ngắn', '짧게'],
    ['中', 'Medium', '標準', 'Vừa', '보통'],
    ['长', 'Long', '長め', 'Dài', '길게'],
    ['一句话，≤30字', 'One sentence, up to 30 characters', '1 文、30 文字以内', 'Một câu, tối đa 30 ký tự', '한 문장, 30자 이하'],
    ['1-2句，30-80字', '1–2 sentences, 30–80 characters', '1～2 文、30～80 文字', '1–2 câu, 30–80 ký tự', '1~2문장, 30~80자'],
    ['3句以上，可展开观点', '3 or more sentences, with room to elaborate', '3 文以上、意見を詳しく述べる', 'Từ 3 câu trở lên, có thể triển khai quan điểm', '3문장 이상으로 의견을 자세히 설명합니다'],
    ['模型思考中… {elapsed}', 'Model is thinking… {elapsed}', 'モデルが思考中… {elapsed}', 'Mô hình đang suy luận… {elapsed}', '모델이 생각 중… {elapsed}'],
    ['生成中… {elapsed}', 'Generating… {elapsed}', '生成中… {elapsed}', 'Đang tạo… {elapsed}', '생성 중… {elapsed}'],
    ['{count} 条 · {elapsed}s（首字 {first}s） · {model}', 'Replies: {count} · {elapsed}s (first token {first}s) · {model}', '{count} 件 · {elapsed}秒（最初の文字 {first}秒）· {model}', '{count} câu · {elapsed} giây (ký tự đầu {first} giây) · {model}', '{count}개 · {elapsed}초 (첫 글자 {first}초) · {model}'],
    ['{count} 条 · {elapsed}s · {model}', 'Replies: {count} · {elapsed}s · {model}', '{count} 件 · {elapsed}秒 · {model}', '{count} câu · {elapsed} giây · {model}', '{count}개 · {elapsed}초 · {model}'],
    ['（首字 {elapsed}s）', '(first token {elapsed}s)', '（最初の文字 {elapsed}秒）', '(ký tự đầu {elapsed} giây)', '(첫 글자 {elapsed}초)'],
    ['（字数 {count}）', ' ({count} characters)', '（{count} 文字）', ' ({count} ký tự)', ' ({count}자)'],
    ['点「全部设置」填一个。', 'Open All settings to add one.', '「すべての設定」で入力してください。', 'Mở Tất cả cài đặt để thêm khóa.', '전체 설정에서 추가하세요.'],
    ['快捷键：', 'Shortcuts: ', 'ショートカット：', 'Phím tắt: ', '단축키: '],
    ['保存失败，请重试。', 'Could not save. Please try again.', '保存できませんでした。もう一度お試しください。', 'Không thể lưu. Vui lòng thử lại.', '저장하지 못했습니다. 다시 시도하세요.'],
    ['在推文时间线点回复气泡，用 AI 生成多条回复候选并一键回填', 'Select Reply on your timeline to generate AI reply suggestions and insert one with a click.', 'タイムラインの返信ボタンから AI の返信候補を生成し、ワンクリックで入力できます。', 'Nhấn Trả lời trên dòng thời gian để tạo nhiều gợi ý bằng AI và chèn chỉ với một lần nhấp.', '타임라인의 답글 버튼을 눌러 AI 답글 후보를 만들고 한 번에 입력하세요.'],
    ['已启用', 'Enabled', '有効', 'Đã bật', '사용 중'],
    ['已停用', 'Disabled', '無効', 'Đã tắt', '사용 안 함'],
    ['1 · AI 服务商', '1 · AI provider', '1 · AI プロバイダー', '1 · Nhà cung cấp AI', '1 · AI 제공업체'],
    ['所有请求都由你的浏览器直接发给所选服务商，密钥只存在本地（chrome.storage.local）。', 'Your browser sends requests directly to your chosen provider. API keys are stored locally in chrome.storage.local.', 'リクエストはブラウザーから選択したプロバイダーへ直接送信されます。キーはローカルの chrome.storage.local に保存されます。', 'Trình duyệt gửi yêu cầu trực tiếp đến nhà cung cấp đã chọn. Khóa chỉ được lưu cục bộ trong chrome.storage.local.', '요청은 브라우저에서 선택한 제공업체로 직접 전송됩니다. 키는 로컬 chrome.storage.local에 저장됩니다.'],
    ['快速预设', 'Quick presets', 'クイック設定', 'Thiết lập nhanh', '빠른 설정'],
    ['— 选择预设自动填充 —', '— Choose a preset to autofill —', '— プリセットを選んで自動入力 —', '— Chọn cấu hình để tự động điền —', '— 프리셋을 선택하여 자동 입력 —'],
    ['接口协议', 'API protocol', 'API プロトコル', 'Giao thức API', 'API 프로토콜'],
    ['OpenAI 兼容（含 DeepSeek / GLM / Kimi / OpenRouter / Ollama）', 'OpenAI compatible (DeepSeek / GLM / Kimi / OpenRouter / Ollama)', 'OpenAI 互換（DeepSeek / GLM / Kimi / OpenRouter / Ollama）', 'Tương thích OpenAI (DeepSeek / GLM / Kimi / OpenRouter / Ollama)', 'OpenAI 호환 (DeepSeek / GLM / Kimi / OpenRouter / Ollama)'],
    ['Anthropic Messages（Claude）', 'Anthropic Messages (Claude)', 'Anthropic Messages（Claude）', 'Anthropic Messages (Claude)', 'Anthropic Messages (Claude)'],
    ['模型名', 'Model name', 'モデル名', 'Tên mô hình', '모델 이름'],
    ['显示', 'Show', '表示', 'Hiện', '표시'],
    ['隐藏', 'Hide', '隠す', 'Ẩn', '숨기기'],
    ['最大生成长度', 'Maximum output tokens', '最大生成トークン数', 'Số token đầu ra tối đa', '최대 출력 토큰 수'],
    ['超时（秒）', 'Timeout (seconds)', 'タイムアウト（秒）', 'Thời gian chờ (giây)', '제한 시간 (초)'],
    ['max_tokens 别调太小。', 'Keep max_tokens high enough.', 'max_tokens を小さくしすぎないでください。', 'Đừng đặt max_tokens quá thấp.', 'max_tokens를 너무 낮게 설정하지 마세요.'],
    ['关闭 GLM 深度思考（写回复不需要思考链，更快更省）', 'Disable GLM deep thinking (faster and cheaper for replies)', 'GLM の深い思考を無効にする（返信生成を高速化しコストを削減）', 'Tắt suy luận sâu của GLM (tạo câu trả lời nhanh hơn, tiết kiệm hơn)', 'GLM 심층 사고 끄기 (더 빠르고 저렴한 답글 생성)'],
    ['识别推文图片（把图片发给模型看；需模型支持视觉，如 GLM-4V / GPT-4o / Claude）', 'Analyze post images (sends images to a vision model such as GLM-4V / GPT-4o / Claude)', 'ポストの画像を解析する（GLM-4V / GPT-4o / Claude などの画像対応モデルに送信）', 'Nhận diện ảnh trong bài đăng (gửi ảnh cho mô hình có thị giác như GLM-4V / GPT-4o / Claude)', '게시물 이미지 분석 (GLM-4V / GPT-4o / Claude 등 이미지 지원 모델로 전송)'],
    ['测试连接', 'Test connection', '接続テスト', 'Kiểm tra kết nối', '연결 테스트'],
    ['2 · 网络与代理', '2 · Network and proxy', '2 · ネットワークとプロキシ', '2 · Mạng và proxy', '2 · 네트워크 및 프록시'],
    ['挂 VPN 觉得慢？先看这两条：', 'Slow while using a VPN? Try these tips:', 'VPN 利用中に遅い場合は、次の点を確認してください：', 'Chậm khi dùng VPN? Hãy xem hai gợi ý này:', 'VPN 사용 중 느린가요? 다음을 확인하세요:'],
    ['流式输出', 'Streaming', 'ストリーミング', 'Truyền trực tuyến', '스트리밍 출력'],
    ['开启（强烈推荐，感知延迟最低）', 'On (recommended for quicker visible results)', 'オン（推奨：結果をすばやく表示）', 'Bật (khuyến nghị để thấy kết quả sớm hơn)', '켜기 (빠른 결과 표시를 위해 권장)'],
    ['关闭（兼容模式）', 'Off (compatibility mode)', 'オフ（互換モード）', 'Tắt (chế độ tương thích)', '끄기 (호환 모드)'],
    ['开启后 AI 边生成边显示第一条，网络慢时体感提升明显。', 'Show replies as the AI generates them, which makes slower connections feel more responsive.', 'AI が生成した内容を順次表示するため、低速な回線でも待ち時間を短く感じられます。', 'Hiển thị câu trả lời ngay khi AI đang tạo, giúp phản hồi nhanh hơn khi mạng chậm.', 'AI가 생성하는 대로 표시하여 느린 연결에서도 더 빠르게 확인할 수 있습니다.'],
    ['代理模式', 'Proxy mode', 'プロキシモード', 'Chế độ proxy', '프록시 모드'],
    ['使用浏览器原有代理设置（推荐，释放扩展控制）', 'Use existing browser proxy settings (recommended)', 'ブラウザーの既存設定を使用（推奨：拡張機能の制御を解除）', 'Dùng cài đặt proxy sẵn có của trình duyệt (khuyến nghị)', '브라우저의 기존 프록시 설정 사용 (권장)'],
    ['固定代理 + AI 域名直连（替换浏览器代理规则）', 'Fixed proxy + direct AI API access (replaces browser proxy rules)', '固定プロキシ + AI ドメインへの直接接続（既存ルールを置換）', 'Proxy cố định + kết nối trực tiếp API AI (thay thế quy tắc proxy)', '고정 프록시 + AI 도메인 직접 연결 (브라우저 규칙 교체)'],
    ['全局直连（会关掉整个浏览器的代理）', 'Direct connection for all traffic (disables the browser proxy)', 'すべて直接接続（ブラウザー全体のプロキシを無効化）', 'Kết nối trực tiếp toàn bộ (tắt proxy của cả trình duyệt)', '모든 트래픽 직접 연결 (전체 브라우저 프록시 해제)'],
    ['代理类型', 'Proxy type', 'プロキシの種類', 'Loại proxy', '프록시 유형'],
    ['端口', 'Port', 'ポート', 'Cổng', '포트'],
    ['代理主机', 'Proxy host', 'プロキシホスト', 'Máy chủ proxy', '프록시 호스트'],
    ['当前生效状态', 'Current status', '現在の状態', 'Trạng thái hiện tại', '현재 적용 상태'],
    ['检测中…', 'Checking…', '確認中…', 'Đang kiểm tra…', '확인 중…'],
    ['应用代理设置', 'Apply proxy settings', 'プロキシ設定を適用', 'Áp dụng cài đặt proxy', '프록시 설정 적용'],
    ['测速对比', 'Compare connection speed', '接続速度を比較', 'So sánh tốc độ kết nối', '연결 속도 비교'],
    ['恢复默认', 'Restore defaults', '既定に戻す', 'Khôi phục mặc định', '기본값 복원'],
    ['3 · 生成偏好（面板里的默认值）', '3 · Generation preferences (panel defaults)', '3 · 生成の設定（パネルの初期値）', '3 · Tùy chọn tạo (mặc định của bảng)', '3 · 생성 환경설정 (패널 기본값)'],
    ['默认条数', 'Default reply count', '既定の件数', 'Số câu mặc định', '기본 답글 수'],
    ['长度倾向', 'Preferred length', '返信の長さ', 'Độ dài ưu tiên', '답글 길이'],
    ['4 · 提示词（完全可自定义）', '4 · Prompts (fully customizable)', '4 · プロンプト（自由に編集可能）', '4 · Prompt (tùy chỉnh hoàn toàn)', '4 · 프롬프트 (자유롭게 설정)'],
    ['输出格式约束', 'Output format', '出力形式', 'Định dạng đầu ra', '출력 형식'],
    ['严格 JSON 数组（最稳，推荐）', 'Strict JSON array (recommended)', '厳密な JSON 配列（推奨）', 'Mảng JSON nghiêm ngặt (khuyến nghị)', '엄격한 JSON 배열 (권장)'],
    ['自由文本（自定义风格时更灵活）', 'Free text (more flexible for custom styles)', '自由形式のテキスト（独自スタイル向け）', 'Văn bản tự do (linh hoạt hơn cho phong cách riêng)', '자유 텍스트 (맞춤 스타일에 유연함)'],
    ['选「自由文本」时会在末尾追加序号格式要求，模型输出用编号列表，再由扩展解析成多条。', 'Free text adds instructions for a numbered list, which the extension splits into individual replies.', '自由形式では番号付きリストの指示が追加され、拡張機能が各返信に分割します。', 'Văn bản tự do thêm yêu cầu danh sách đánh số để tiện ích tách thành từng câu trả lời.', '자유 텍스트를 선택하면 번호 목록 지침을 추가하고 확장 프로그램이 각 답글로 나눕니다.'],
    ['人设 / 背景（可选）', 'Persona / background (optional)', '人物像・背景（任意）', 'Vai trò / bối cảnh (tùy chọn)', '페르소나 / 배경 (선택)'],
    ['例如：我是一名后端工程师，说话直接、不爱客套', 'Example: I am a backend engineer. I speak directly and avoid small talk.', '例：バックエンドエンジニアです。率直で、形式的なあいさつは控えます。', 'Ví dụ: Tôi là kỹ sư backend, nói thẳng và không thích xã giao.', '예: 저는 백엔드 개발자입니다. 형식적인 인사보다 직접적인 표현을 씁니다.'],
    ['插在 system prompt 最前面，用来长期定义 AI 的身份与语气。', 'Added at the start of the system prompt to define the AI’s persona and tone.', 'system プロンプトの先頭に追加し、AI の人物像と口調を定義します。', 'Được thêm vào đầu system prompt để xác định vai trò và giọng điệu của AI.', 'system 프롬프트 앞에 추가하여 AI의 역할과 말투를 설정합니다.'],
    ['全局补充要求', 'Additional instructions', '追加の指示', 'Yêu cầu bổ sung', '추가 지침'],
    ['例如：不要用 emoji；语气像我本人，偏毒舌；避免提到工作', 'Example: No emoji; sound like me, with a sharp wit; avoid mentioning work.', '例：絵文字は使わず、少し辛口で、自分らしい口調に。仕事の話題は避けてください。', 'Ví dụ: Không dùng emoji; giọng giống tôi, hơi sắc sảo; tránh nhắc đến công việc.', '예: 이모지 없이, 제 말투처럼 약간 날카롭게, 업무 언급은 피해주세요.'],
    ['可用变量', 'Available variables', '使用できる変数', 'Biến có sẵn', '사용 가능한 변수'],
    ['点一下插入到编辑框', 'Click to insert into the editor', 'クリックして編集欄に挿入', 'Nhấp để chèn vào ô soạn thảo', '클릭하여 편집란에 삽입'],
    ['System 提示词', 'System prompt', 'System プロンプト', 'System prompt', 'System 프롬프트'],
    ['User 提示词模板', 'User prompt template', 'User プロンプトテンプレート', 'Mẫu user prompt', 'User 프롬프트 템플릿'],
    ['查看默认', 'View default', '既定を表示', 'Xem mặc định', '기본값 보기'],
    ['清空', 'Clear', 'クリア', 'Xóa', '비우기'],
    ['留空 = 使用内置默认模板', 'Leave blank to use the built-in template', '空欄なら既定のテンプレートを使用', 'Để trống để dùng mẫu mặc định', '비워두면 기본 템플릿 사용'],
    ['预览渲染结果', 'Preview prompt', 'プロンプトをプレビュー', 'Xem trước prompt', '프롬프트 미리보기'],
    ['复制完整提示词', 'Copy full prompt', 'プロンプト全体をコピー', 'Sao chép toàn bộ prompt', '전체 프롬프트 복사'],
    ['渲染结果预览（用示例推文）', 'Prompt preview (using a sample post)', 'プレビュー（サンプルのポストを使用）', 'Xem trước prompt (dùng bài đăng mẫu)', '프롬프트 미리보기 (예시 게시물 사용)'],
    ['5 · 交互行为', '5 · Interaction', '5 · 操作と動作', '5 · Tương tác', '5 · 동작 설정'],
    ['打开回复面板时自动生成回复（点 X 原生「回复」按钮后立即请求 AI，取消则手动点「生成回复」）', 'Generate replies when the panel opens (requests AI after selecting X’s Reply button; turn off to generate manually)', '返信パネルを開くと自動生成（X 標準の返信ボタンで AI にリクエスト。オフなら手動で生成）', 'Tự tạo khi mở bảng trả lời (gửi yêu cầu AI sau khi nhấn nút Trả lời của X; tắt để tạo thủ công)', '답글 패널을 열면 자동 생성 (X 기본 답글 버튼을 누르면 AI 요청, 끄면 수동 생성)'],
    ['生成完成后自动回填第 1 条', 'Automatically insert the first reply after generation', '生成後、最初の返信を自動入力', 'Tự chèn câu trả lời đầu tiên sau khi tạo xong', '생성 완료 후 첫 번째 답글 자동 입력'],
    ['开启调试日志（Console）', 'Enable debug logs (Console)', 'デバッグログを有効にする（Console）', 'Bật nhật ký gỡ lỗi (Console)', '디버그 로그 사용 (Console)'],
    ['危险操作', 'Danger zone', '注意が必要な操作', 'Thao tác quan trọng', '주의가 필요한 작업'],
    ['恢复默认设置', 'Reset all settings', 'すべての設定をリセット', 'Khôi phục mọi cài đặt mặc định', '전체 설정 초기화'],
    ['普通设置自动保存；代理设置需单独应用', 'General settings save automatically; apply proxy settings separately', '通常の設定は自動保存されます。プロキシ設定は別途適用してください。', 'Cài đặt thông thường được tự lưu; cần áp dụng proxy riêng', '일반 설정은 자동 저장됩니다. 프록시 설정은 별도로 적용하세요'],
    ['插件界面语言', 'Extension interface language', '拡張機能の表示言語', 'Ngôn ngữ giao diện tiện ích', '확장 프로그램 인터페이스 언어'],
    ['仅更改插件界面显示；AI 回复语言可在下方单独设置。', 'Changes the extension interface only. Set the AI reply language separately below.', '拡張機能の表示言語を変更します。AI の返信言語は下で個別に設定できます。', 'Chỉ đổi ngôn ngữ giao diện tiện ích. Ngôn ngữ trả lời của AI được đặt riêng bên dưới.', '확장 프로그램의 표시 언어를 변경합니다. AI 답글 언어는 아래에서 별도로 설정하세요.'],
    ['⚠ max_tokens 别调太小。推理型模型（GLM 全系 / o 系列 / Claude 思考版）会先消耗 reasoning tokens 再输出正文， 给小了会出现「请求成功但正文是空字符串」且不报错的现象。低于 2000 极易踩坑。', '⚠ Keep max_tokens high enough. Reasoning models (GLM / o-series / Claude with thinking) use reasoning tokens before writing the reply. A low limit can produce a successful request with an empty reply and no error, especially below 2000.', '⚠ max_tokens を小さくしすぎないでください。推論モデル（GLM / o シリーズ / 思考機能付き Claude）は本文の前に推論トークンを消費します。上限が低いと、リクエストは成功しても本文が空になる場合があります。特に 2000 未満では注意してください。', '⚠ Đừng đặt max_tokens quá thấp. Mô hình suy luận (GLM / dòng o / Claude có suy luận) dùng token suy luận trước khi viết nội dung. Giới hạn thấp có thể khiến yêu cầu thành công nhưng câu trả lời rỗng mà không báo lỗi, đặc biệt dưới 2000.', '⚠ max_tokens를 충분히 높게 설정하세요. 추론 모델 (GLM / o 시리즈 / 사고 기능이 있는 Claude)은 답글 작성 전에 추론 토큰을 사용합니다. 제한이 낮으면 오류 없이 빈 답글이 반환될 수 있으며, 특히 2000 미만에서 주의하세요.'],
    ['💡 挂 VPN 觉得慢？先看这两条： ① 保持流式输出开启 —— 完成的候选会先显示，不必等待全部生成完；实际速度取决于模型与网络； ② 下面可以检测当前网络；仅在现有固定代理可安全保留时对比 AI 直连。', '💡 Slow while using a VPN? ① Keep streaming on to see output as it arrives instead of waiting for the entire reply. ② Check your connection below. Direct AI API access is compared only when existing fixed proxy rules can be preserved safely.', '💡 VPN 利用中に遅い場合：① ストリーミングを有効にすると、完了を待たずに出力を確認できます。② 下でネットワークを確認できます。既存の固定プロキシ設定を安全に維持できる場合のみ、AI への直接接続と比較します。', '💡 Chậm khi dùng VPN? ① Bật truyền trực tuyến để thấy nội dung ngay khi có, không phải chờ tạo xong. ② Kiểm tra mạng bên dưới. Chỉ so sánh kết nối AI trực tiếp khi có thể giữ an toàn quy tắc proxy cố định hiện tại.', '💡 VPN 사용 중 느린가요? ① 스트리밍을 켜면 완료를 기다리지 않고 출력되는 대로 볼 수 있습니다. ② 아래에서 연결을 확인하세요. 기존 고정 프록시 규칙을 안전하게 유지할 수 있을 때만 AI 직접 연결과 비교합니다.'],
    ['🚨 「全局直连」会影响整个浏览器，不只是本扩展。 一旦应用，你所有标签页的流量都不再走代理 —— 正在看的其他网站也可能打不开。 若要保留其他站点的代理，需要核对并使用上面的固定代理模式。 固定代理也会替换浏览器现有的 PAC、分流与绕过规则。', '🚨 Direct connection affects the entire browser. Once applied, all tabs bypass the proxy and some websites may stop working. To keep other sites proxied, check and use the fixed proxy mode above. Fixed proxy mode also replaces existing PAC, routing, and bypass rules.', '🚨 すべて直接接続にするとブラウザー全体に影響します。全タブの通信がプロキシを通らなくなり、一部のサイトに接続できなくなる場合があります。他のサイトでプロキシを使うには、上の固定プロキシ設定を確認してください。固定プロキシも既存の PAC・振り分け・除外ルールを置き換えます。', '🚨 Kết nối trực tiếp toàn bộ ảnh hưởng đến cả trình duyệt. Mọi tab sẽ bỏ qua proxy và một số trang có thể không truy cập được. Để các trang khác tiếp tục qua proxy, hãy kiểm tra và dùng chế độ proxy cố định ở trên. Chế độ này cũng thay thế quy tắc PAC, định tuyến và bỏ qua hiện có.', '🚨 전체 직접 연결은 브라우저 전체에 영향을 줍니다. 모든 탭이 프록시를 우회하여 일부 사이트에 접속하지 못할 수 있습니다. 다른 사이트의 프록시를 유지하려면 위의 고정 프록시 모드를 확인하세요. 고정 프록시도 기존 PAC, 라우팅, 우회 규칙을 교체합니다.'],
    ['填你原本在用的代理地址（Clash / v2ray 本地端口，常见 7890 / 1080）。 应用后：AI 接口域名直连，其余网站全部走这个固定代理。 此设置会替换整个浏览器的现有 PAC、分流及绕过规则，请确认它适合所有标签页。', 'Enter your existing proxy address (for example, a local Clash / v2ray port such as 7890 or 1080). AI API domains connect directly; all other sites use this fixed proxy. This replaces existing PAC, routing, and bypass rules for the entire browser. Check that it suits all tabs.', '現在使用中のプロキシを入力してください（Clash / v2ray のローカルポートなど。一般的には 7890 / 1080）。AI の API ドメインは直接接続し、その他のサイトは固定プロキシを通ります。ブラウザー全体の PAC・振り分け・除外ルールが置き換わるため、すべてのタブで問題ないか確認してください。', 'Nhập địa chỉ proxy đang dùng (ví dụ cổng cục bộ Clash / v2ray, thường là 7890 / 1080). Miền API AI kết nối trực tiếp; mọi trang khác dùng proxy cố định này. Cài đặt thay thế quy tắc PAC, định tuyến và bỏ qua của cả trình duyệt. Hãy đảm bảo phù hợp với mọi tab.', '사용 중인 프록시 주소를 입력하세요 (예: Clash / v2ray 로컬 포트 7890 / 1080). AI API 도메인은 직접 연결하고 다른 사이트는 이 고정 프록시를 사용합니다. 전체 브라우저의 기존 PAC, 라우팅, 우회 규칙을 교체하므로 모든 탭에 적합한지 확인하세요.'],
    ['技术限制：浏览器 fetch 无法给单个请求指定代理，只能通过 chrome.proxy 改规则。 代理字段仅作草稿，点「应用代理设置」并确认后才保存及生效；普通保存、测试和测速不会应用草稿。 点下方「恢复默认」可释放扩展的代理控制，回到浏览器原有设置。', 'Browser fetch cannot choose a proxy per request, so proxy rules use chrome.proxy. Proxy fields are drafts until you select Apply proxy settings and confirm. General saves and connection tests do not apply drafts. Restore defaults releases extension control and restores the browser’s existing settings.', 'ブラウザーの fetch はリクエスト単位のプロキシ指定に対応しないため、chrome.proxy でルールを変更します。プロキシ欄は「プロキシ設定を適用」で確認するまで下書きです。通常の保存や接続テストでは適用されません。「既定に戻す」で拡張機能の制御を解除できます。', 'fetch của trình duyệt không thể chọn proxy cho từng yêu cầu nên phải dùng chrome.proxy. Các trường proxy là bản nháp cho đến khi nhấn Áp dụng cài đặt proxy và xác nhận. Lưu thông thường và kiểm tra kết nối không áp dụng bản nháp. Khôi phục mặc định sẽ trả quyền điều khiển về cài đặt sẵn có của trình duyệt.', '브라우저 fetch는 요청별 프록시를 지정할 수 없어 chrome.proxy로 규칙을 변경합니다. 프록시 항목은 프록시 설정 적용 후 확인할 때까지 초안입니다. 일반 저장과 연결 테스트는 초안을 적용하지 않습니다. 기본값 복원을 누르면 확장 프로그램의 제어를 해제하고 기존 브라우저 설정으로 돌아갑니다.'],
    ['留空即使用内置模板（推荐）。填入模板后，用 {{变量}} 占位，生成时会自动替换为真实内容。', 'Leave blank to use the built-in template (recommended). Use placeholders such as {{tweet.text}} in custom templates; they are replaced with actual values during generation.', '空欄の場合は既定のテンプレートを使用します（推奨）。独自テンプレートでは {{tweet.text}} などの変数を使うと、生成時に実際の値に置き換わります。', 'Để trống để dùng mẫu có sẵn (khuyến nghị). Dùng biến như {{tweet.text}} trong mẫu tùy chỉnh; các biến sẽ được thay bằng nội dung thực khi tạo.', '비워두면 기본 템플릿을 사용합니다 (권장). 사용자 템플릿에 {{tweet.text}} 같은 변수를 넣으면 생성 시 실제 값으로 바뀝니다.'],
    ['会替换模板里的 {{customInstruction}} 变量，每次生成都带上。', 'Replaces {{customInstruction}} in your template and is included with every generation.', 'テンプレート内の {{customInstruction}} を置き換え、毎回の生成に含めます。', 'Thay thế biến {{customInstruction}} trong mẫu và được thêm vào mỗi lần tạo.', '템플릿의 {{customInstruction}}를 대체하며 매번 생성에 포함됩니다.'],
    ['其他设置已保存；代理更改需点「应用代理设置」', 'Other settings saved; select Apply proxy settings for proxy changes', '他の設定を保存しました。プロキシの変更は「プロキシ設定を適用」を押してください。', 'Đã lưu cài đặt khác; nhấn Áp dụng cài đặt proxy để áp dụng thay đổi proxy', '다른 설정을 저장했습니다. 프록시 변경은 프록시 설정 적용을 누르세요'],
    ['恢复默认设置？API Key 会被清空。', 'Reset all settings? Your API key will be cleared.', '設定を初期化しますか？API キーも削除されます。', 'Khôi phục mặc định? API Key sẽ bị xóa.', '전체 설정을 초기화할까요? API 키가 삭제됩니다.'],
    ['已恢复默认代理设置，扩展已交还控制权', 'Default proxy restored; the extension has released control', 'プロキシを既定に戻し、拡張機能の制御を解除しました', 'Đã khôi phục proxy mặc định và trả quyền điều khiển', '기본 프록시를 복원하고 확장 프로그램의 제어를 해제했습니다'],
    ['已恢复默认，API Key 已清空', 'Defaults restored; API key cleared', '初期化しました。API キーを削除しました。', 'Đã khôi phục mặc định và xóa API Key', '기본값을 복원하고 API 키를 삭제했습니다'],
    ['恢复失败：{error}', 'Reset failed: {error}', '初期化できませんでした：{error}', 'Khôi phục thất bại: {error}', '복원 실패: {error}'],
    ['请填写代理主机及 1–65535 之间的整数端口', 'Enter a proxy host and an integer port from 1 to 65535', 'プロキシホストと 1～65535 の整数ポートを入力してください', 'Nhập máy chủ proxy và cổng là số nguyên từ 1 đến 65535', '프록시 호스트와 1~65535 사이의 정수 포트를 입력하세요'],
    ['已取消，代理更改未保存', 'Canceled; proxy changes were not saved', 'キャンセルしました。プロキシの変更は保存されていません。', 'Đã hủy; thay đổi proxy chưa được lưu', '취소했습니다. 프록시 변경은 저장하지 않았습니다'],
    ['应用中…', 'Applying…', '適用中…', 'Đang áp dụng…', '적용 중…'],
    ['未知错误', 'Unknown error', '不明なエラー', 'Lỗi không xác định', '알 수 없는 오류'],
    ['代理设置失败', 'Could not apply proxy settings', 'プロキシ設定を適用できませんでした', 'Không thể áp dụng cài đặt proxy', '프록시 설정을 적용하지 못했습니다'],
    ['已应用', 'Applied', '適用しました', 'Đã áp dụng', '적용됨'],
    ['｜影响范围：整个浏览器', ' | Scope: entire browser', '｜影響範囲：ブラウザー全体', ' | Phạm vi: toàn bộ trình duyệt', ' | 적용 범위: 브라우저 전체'],
    ['｜影响范围：整个浏览器（AI 域名绕过，其余走固定代理）', ' | Scope: entire browser (AI domains bypass the proxy; other traffic uses the fixed proxy)', '｜影響範囲：ブラウザー全体（AI ドメインは直接接続、その他は固定プロキシ経由）', ' | Phạm vi: cả trình duyệt (miền AI bỏ qua proxy, lưu lượng khác qua proxy cố định)', ' | 적용 범위: 브라우저 전체 (AI 도메인은 우회, 나머지는 고정 프록시 사용)'],
    ['｜未改变你的网络设置', ' | Your network settings were not changed', '｜ネットワーク設定は変更されていません', ' | Cài đặt mạng của bạn không thay đổi', ' | 네트워크 설정은 변경되지 않았습니다'],
    ['失败：{error}', 'Failed: {error}', '失敗：{error}', 'Thất bại: {error}', '실패: {error}'],
    ['恢复中…', 'Restoring…', '復元中…', 'Đang khôi phục…', '복원 중…'],
    ['恢复代理设置失败', 'Could not restore proxy settings', 'プロキシ設定を復元できませんでした', 'Không thể khôi phục cài đặt proxy', '프록시 설정을 복원하지 못했습니다'],
    ['已恢复默认', 'Defaults restored', '既定に戻しました', 'Đã khôi phục mặc định', '기본값 복원됨'],
    ['｜扩展已交还控制权，不再影响你的网络', ' | Extension control released; your network is no longer affected', '｜拡張機能の制御を解除し、ネットワークへの影響を解消しました', ' | Đã trả quyền điều khiển; tiện ích không còn ảnh hưởng mạng', ' | 확장 프로그램의 제어를 해제하여 네트워크에 영향을 주지 않습니다'],
    ['未知', 'Unknown', '不明', 'Không xác định', '알 수 없음'],
    ['读取失败', 'Could not read status', '状態を取得できませんでした', 'Không thể đọc trạng thái', '상태를 읽지 못했습니다'],
    ['读取失败（可能不支持 chrome.proxy）', 'Could not read status (chrome.proxy may be unavailable)', '状態を取得できませんでした（chrome.proxy 非対応の可能性）', 'Không thể đọc trạng thái (có thể không hỗ trợ chrome.proxy)', '상태를 읽지 못했습니다 (chrome.proxy를 지원하지 않을 수 있음)'],
    ['测速中…', 'Testing connection speed…', '速度を測定中…', 'Đang đo tốc độ…', '속도 측정 중…'],
    ['正在检测当前网络；仅在能保留现有固定代理规则时进行 API 直连对比…', 'Checking the connection. Direct API access is compared only if existing fixed proxy rules can be preserved…', 'ネットワークを確認中です。既存の固定プロキシ設定を維持できる場合のみ、API への直接接続を比較します…', 'Đang kiểm tra mạng. Chỉ so sánh API trực tiếp khi có thể giữ quy tắc proxy cố định hiện tại…', '연결을 확인하고 있습니다. 기존 고정 프록시 규칙을 유지할 수 있을 때만 API 직접 연결과 비교합니다…'],
    ['未执行', 'Skipped', '未実行', 'Đã bỏ qua', '건너뜀'],
    ['可达(key问题)', 'Reachable (API key issue)', '接続可能（キーに問題あり）', 'Truy cập được (lỗi khóa)', '연결 가능 (API 키 문제)'],
    ['可达', 'Reachable', '接続可能', 'Truy cập được', '연결 가능'],
    ['不可达', 'Unreachable', '接続不可', 'Không truy cập được', '연결 불가'],
    ['数值越小越快。需要调整代理时，请先核对固定代理地址及全局影响，再点「应用代理设置」。', 'Lower values are faster. Before applying proxy changes, verify the proxy address and its browser-wide impact.', '数値が小さいほど高速です。プロキシを変更する前に、アドレスとブラウザー全体への影響を確認してください。', 'Số càng nhỏ càng nhanh. Trước khi áp dụng proxy, hãy xác minh địa chỉ và tác động đến cả trình duyệt.', '수치가 낮을수록 빠릅니다. 프록시 변경 전에 주소와 브라우저 전체에 미치는 영향을 확인하세요.'],
    ['测速失败：{error}', 'Connection test failed: {error}', '速度テストに失敗しました：{error}', 'Đo tốc độ thất bại: {error}', '속도 테스트 실패: {error}'],
    ['当前已有自定义内容，点「确定」将用默认模板覆盖它。继续？', 'This field contains custom text. Replace it with the default template?', '独自の内容が入力されています。既定のテンプレートで置き換えますか？', 'Ô này đang có nội dung tùy chỉnh. Thay bằng mẫu mặc định?', '사용자 지정 내용이 있습니다. 기본 템플릿으로 바꿀까요?'],
    ['⚠ 以下变量名不存在，生成时会被替换成空：', '⚠ Unknown variables will be replaced with empty text: ', '⚠ 次の変数は存在しないため、生成時に空になります：', '⚠ Các biến không tồn tại sau sẽ được thay bằng chuỗi rỗng: ', '⚠ 다음 변수는 존재하지 않아 생성 시 빈 값으로 바뀝니다: '],
    ['渲染中…', 'Rendering…', 'プレビューを作成中…', 'Đang kết xuất…', '렌더링 중…'],
    ['预览失败：{error}', 'Preview failed: {error}', 'プレビューに失敗しました：{error}', 'Xem trước thất bại: {error}', '미리보기 실패: {error}'],
    ['完整提示词已复制到剪贴板 ✓', 'Full prompt copied to clipboard ✓', 'プロンプト全体をコピーしました ✓', 'Đã sao chép toàn bộ prompt vào bộ nhớ tạm ✓', '전체 프롬프트를 클립보드에 복사했습니다 ✓'],
    ['复制失败：{error}', 'Copy failed: {error}', 'コピーに失敗しました：{error}', 'Sao chép thất bại: {error}', '복사 실패: {error}'],
    ['代理更改尚未保存；请点「应用代理设置」', 'Proxy changes are not saved; select Apply proxy settings', 'プロキシの変更は未保存です。「プロキシ設定を適用」を押してください。', 'Thay đổi proxy chưa được lưu; hãy nhấn Áp dụng cài đặt proxy', '프록시 변경이 저장되지 않았습니다. 프록시 설정 적용을 누르세요'],
    ['填入你的 OpenAI 兼容地址，例如 Ollama: http://localhost:11434/v1', 'Enter your OpenAI compatible URL, for example Ollama: http://localhost:11434/v1', 'OpenAI 互換 URL を入力してください。例：Ollama: http://localhost:11434/v1', 'Nhập URL tương thích OpenAI, ví dụ Ollama: http://localhost:11434/v1', 'OpenAI 호환 주소를 입력하세요. 예: Ollama: http://localhost:11434/v1'],
    ['当前：{style} — {description}', 'Current: {style} — {description}', '現在：{style} — {description}', 'Hiện tại: {style} — {description}', '현재: {style} — {description}'],
    ['⚠ 地址格式可能不正确', '⚠ The URL format may be invalid', '⚠ URL の形式が正しくない可能性があります', '⚠ Định dạng URL có thể không hợp lệ', '⚠ 주소 형식이 올바르지 않을 수 있습니다'],
    ['本机服务：首次点「测试连接」时会请求此域名的访问权限，授权后即可生成回复。', 'Local service: the first connection test requests permission for this host. Allow it to generate replies.', 'ローカルサービス：初回の接続テスト時に、このホストへのアクセス許可を求めます。許可後に返信を生成できます。', 'Dịch vụ cục bộ: lần kiểm tra kết nối đầu sẽ yêu cầu quyền truy cập máy chủ. Cho phép để tạo câu trả lời.', '로컬 서비스: 첫 연결 테스트 시 이 호스트에 대한 접근 권한을 요청합니다. 허용 후 답글을 생성할 수 있습니다.'],
    ['⚠ 明文 HTTP 会传输 API Key，远程服务建议使用 https://。首次测试时会请求域名访问权限。', '⚠ HTTP sends your API key without encryption. Use https:// for remote services. The first test requests access to the API host.', '⚠ HTTP では API キーが暗号化されません。リモートサービスには https:// を推奨します。初回のテスト時にドメインへのアクセス許可を求めます。', '⚠ HTTP gửi API Key không mã hóa. Nên dùng https:// cho dịch vụ từ xa. Lần thử đầu sẽ yêu cầu quyền truy cập miền.', '⚠ HTTP는 API 키를 암호화하지 않고 전송합니다. 원격 서비스는 https://를 사용하세요. 첫 테스트 시 도메인 접근 권한을 요청합니다.'],
    ['首次点「测试连接」时会请求所填 API 域名的访问权限，授权后即可生成回复。', 'The first connection test requests access to your API host. Allow it to generate replies.', '初回の接続テスト時に、入力した API ドメインへのアクセス許可を求めます。許可後に返信を生成できます。', 'Lần kiểm tra kết nối đầu sẽ yêu cầu quyền truy cập miền API. Cho phép để tạo câu trả lời.', '첫 연결 테스트 시 입력한 API 도메인 접근 권한을 요청합니다. 허용 후 답글을 생성할 수 있습니다.'],
    ['⚠ max_tokens 偏小，推理型模型很可能返回空内容。', '⚠ max_tokens is low; reasoning models may return an empty reply.', '⚠ max_tokens が小さすぎるため、推論モデルが空の返信を返す可能性があります。', '⚠ max_tokens quá thấp; mô hình suy luận có thể trả về nội dung rỗng.', '⚠ max_tokens가 낮아 추론 모델이 빈 답글을 반환할 수 있습니다.'],
    ['普通设置已保存；代理更改尚未应用', 'General settings saved; proxy changes are not applied', '通常の設定を保存しました。プロキシの変更は未適用です。', 'Đã lưu cài đặt thông thường; thay đổi proxy chưa áp dụng', '일반 설정을 저장했습니다. 프록시 변경은 적용되지 않았습니다'],
    ['代理更改尚未应用；普通设置自动保存', 'Proxy changes are not applied; general settings save automatically', 'プロキシの変更は未適用です。通常の設定は自動保存されます。', 'Thay đổi proxy chưa áp dụng; cài đặt thông thường được tự lưu', '프록시 변경은 적용되지 않았습니다. 일반 설정은 자동 저장됩니다'],
    ['Base URL 必须使用 http:// 或 https://', 'Base URL must use http:// or https://', 'Base URL は http:// または https:// にしてください', 'Base URL phải dùng http:// hoặc https://', 'Base URL은 http:// 또는 https://를 사용해야 합니다'],
    ['浏览器不支持网站访问授权，请检查扩展权限', 'Website access permissions are unavailable; check extension permissions', 'サイトへのアクセス許可に対応していません。拡張機能の権限を確認してください。', 'Trình duyệt không hỗ trợ cấp quyền truy cập trang; hãy kiểm tra quyền tiện ích', '사이트 접근 권한을 지원하지 않습니다. 확장 프로그램 권한을 확인하세요'],
    ['未获准访问 API 域名 {host}；请再次点「测试连接」并允许访问', 'Access to API host {host} was denied. Test the connection again and allow access.', 'API ドメイン {host} へのアクセスが許可されていません。接続テストをやり直し、アクセスを許可してください。', 'Chưa được phép truy cập miền API {host}. Hãy kiểm tra kết nối lại và cho phép truy cập.', 'API 도메인 {host} 접근이 허용되지 않았습니다. 연결 테스트를 다시 눌러 접근을 허용하세요.'],
    ['请先填写 API Key', 'Enter an API key first', '先に API キーを入力してください', 'Vui lòng nhập API Key trước', '먼저 API 키를 입력하세요'],
    ['等待网站访问授权…', 'Waiting for website access permission…', 'サイトへのアクセス許可を待機中…', 'Đang chờ quyền truy cập trang…', '사이트 접근 권한 대기 중…'],
    ['连接中… {elapsed}s', 'Connecting… {elapsed}s', '接続中… {elapsed}秒', 'Đang kết nối… {elapsed} giây', '연결 중… {elapsed}초'],
    ['连接成功 ✓ {elapsed}s ｜ 示例：{sample}', 'Connected ✓ {elapsed}s | Sample: {sample}', '接続成功 ✓ {elapsed}秒 ｜ サンプル：{sample}', 'Kết nối thành công ✓ {elapsed} giây | Ví dụ: {sample}', '연결 성공 ✓ {elapsed}초 | 예시: {sample}'],
    ['👋 首次使用：先选服务商预设 → 填 API Key → 点「测试连接」', '👋 Getting started: choose a provider preset → enter your API key → test the connection', '👋 はじめに：プロバイダーを選択 → API キーを入力 → 接続テスト', '👋 Bắt đầu: chọn cấu hình nhà cung cấp → nhập API Key → kiểm tra kết nối', '👋 시작하기: 제공업체 선택 → API 키 입력 → 연결 테스트'],
    ['已复位到默认位置', 'Default position restored', '既定の位置に戻しました', 'Đã khôi phục vị trí mặc định', '기본 위치로 복원했습니다'],
    ['点这条推文的回复气泡，打开弹层后即可回填', 'Select Reply on this post to open the dialog, then insert a reply.', 'このポストの返信ボタンで画面を開くと、候補を入力できます。', 'Nhấn Trả lời ở bài đăng này để mở hộp thoại, rồi chèn câu trả lời.', '이 게시물의 답글 버튼으로 창을 연 뒤 입력하세요.'],
    ['回复对象已变化，请重新打开这条推文的回复面板', 'The reply target changed. Reopen the reply panel for this post.', '返信先が変わりました。このポストの返信パネルを開き直してください。', 'Đối tượng trả lời đã thay đổi. Hãy mở lại bảng trả lời cho bài đăng này.', '답글 대상이 변경되었습니다. 이 게시물의 답글 패널을 다시 여세요.'],
    ['未能读取推文正文，无法生成', 'Cannot generate replies because the post text could not be read', 'ポスト本文を読み取れないため生成できません', 'Không thể tạo vì chưa đọc được nội dung bài đăng', '게시물 본문을 읽지 못해 생성할 수 없습니다'],
    ['未能读取推文正文，请关闭后重新打开这条推文的回复弹层', 'Could not read the post. Close and reopen this post’s reply dialog.', 'ポスト本文を読み取れませんでした。このポストの返信画面を閉じて開き直してください。', 'Không đọc được nội dung bài đăng. Hãy đóng rồi mở lại hộp trả lời của bài đăng này.', '게시물 본문을 읽지 못했습니다. 이 게시물의 답글 창을 닫았다가 다시 여세요.'],
    ['模型输出已达到长度上限，请减少回复条数或提高输出上限后重试', 'The model reached the output limit. Reduce the reply count or increase the output limit, then try again.', 'モデルの出力が上限に達しました。返信数を減らすか出力上限を増やして、もう一度お試しください。', 'Mô hình đã đạt giới hạn đầu ra. Hãy giảm số câu trả lời hoặc tăng giới hạn đầu ra rồi thử lại.', '모델 출력이 한도에 도달했습니다. 답글 수를 줄이거나 출력 한도를 늘린 뒤 다시 시도하세요.'],
    ['生成连接已断开', 'The generation connection was disconnected', '生成中の接続が切断されました', 'Kết nối tạo câu trả lời đã bị ngắt', '생성 연결이 끊어졌습니다'],
    ['未能生成可用回复，请换个风格重试', 'No usable replies were generated. Try another style.', '使用できる返信を生成できませんでした。別のスタイルをお試しください。', 'Chưa tạo được câu trả lời phù hợp. Hãy thử phong cách khác.', '사용 가능한 답글을 생성하지 못했습니다. 다른 스타일로 다시 시도하세요.'],
    ['生成中', 'Generating', '生成中', 'Đang tạo', '생성 중'],
    ['填入', 'Insert', '入力', 'Chèn', '입력'],
    ['⚠️ 此操作会关闭整个浏览器的代理（不只本扩展）。\n\n所有标签页都会改为直连，部分网站可能打不开。\n\n确定保存并应用全局直连吗？', '⚠️ This disables the proxy for the entire browser.\n\nAll tabs will connect directly, and some websites may stop working.\n\nSave and apply direct connection for all traffic?', '⚠️ ブラウザー全体のプロキシを無効にします。\n\nすべてのタブが直接接続になり、一部のサイトに接続できなくなる場合があります。\n\n保存して全体の直接接続を適用しますか？', '⚠️ Thao tác này tắt proxy cho cả trình duyệt.\n\nMọi tab sẽ kết nối trực tiếp và một số trang có thể không hoạt động.\n\nLưu và áp dụng kết nối trực tiếp toàn bộ?', '⚠️ 전체 브라우저의 프록시를 해제합니다.\n\n모든 탭이 직접 연결로 바뀌어 일부 사이트에 접속하지 못할 수 있습니다.\n\n저장하고 전체 직접 연결을 적용할까요?'],
    ['⚠️ 此操作会替换整个浏览器的代理规则。\n\nAI 接口域名直连，其余网站将走 {proxy}。现有 PAC、分流和绕过规则不会保留。\n\n确定保存并应用吗？', '⚠️ This replaces the entire browser’s proxy rules.\n\nAI API domains connect directly; all other sites use {proxy}. Existing PAC, routing, and bypass rules will be replaced.\n\nSave and apply?', '⚠️ ブラウザー全体のプロキシルールを置き換えます。\n\nAI の API ドメインは直接接続し、その他のサイトは {proxy} を通ります。既存の PAC・振り分け・除外ルールは保持されません。\n\n保存して適用しますか？', '⚠️ Thao tác này thay thế quy tắc proxy của cả trình duyệt.\n\nMiền API AI kết nối trực tiếp; trang khác dùng {proxy}. Quy tắc PAC, định tuyến và bỏ qua hiện có sẽ không được giữ.\n\nLưu và áp dụng?', '⚠️ 전체 브라우저의 프록시 규칙을 교체합니다.\n\nAI API 도메인은 직접 연결하고 다른 사이트는 {proxy}를 사용합니다. 기존 PAC, 라우팅, 우회 규칙은 유지되지 않습니다.\n\n저장하고 적용할까요?'],
    ['{state}（受控级别：{level}）', '{state} (control level: {level})', '{state}（制御レベル：{level}）', '{state} (mức điều khiển: {level})', '{state} (제어 수준: {level})'],
    ['已填充 {provider} 配置', '{provider} settings filled in', '{provider} の設定を入力しました', 'Đã điền cấu hình {provider}', '{provider} 설정을 입력했습니다'],
    ['当前：{style}', 'Current: {style}', '現在：{style}', 'Hiện tại: {style}', '현재: {style}'],
    ['智谱 GLM', 'Zhipu GLM', 'Zhipu GLM', 'Zhipu GLM', 'Zhipu GLM'],
    ['中文表达自然，性价比高', 'Natural Chinese and good value', '自然な中国語、優れたコストパフォーマンス', 'Diễn đạt tiếng Trung tự nhiên, giá hợp lý', '자연스러운 중국어, 합리적인 비용'],
    ['便宜，适合批量生成', 'Low cost, suitable for batch generation', '低コストで大量生成に最適', 'Chi phí thấp, phù hợp tạo hàng loạt', '저렴하며 대량 생성에 적합'],
    ['通用', 'General purpose', '汎用', 'Đa dụng', '범용'],
    ['长文理解好', 'Good at understanding long text', '長文の理解が得意', 'Hiểu tốt văn bản dài', '긴 글 이해에 강점'],
    ['月之暗面 Kimi', 'Moonshot Kimi', 'Moonshot Kimi', 'Moonshot Kimi', 'Moonshot Kimi'],
    ['一个 key 用多家模型', 'One API key for multiple models', '1 つのキーで複数モデルを利用', 'Một khóa dùng nhiều mô hình', '하나의 API 키로 여러 모델 사용'],
    ['自定义（OpenAI 兼容）', 'Custom (OpenAI compatible)', 'カスタム（OpenAI 互換）', 'Tùy chỉnh (tương thích OpenAI)', '사용자 지정 (OpenAI 호환)'],
    ['本地 Ollama / vLLM / one-api 等', 'Local Ollama / vLLM / one-api, etc.', 'ローカルの Ollama / vLLM / one-api など', 'Ollama / vLLM / one-api cục bộ, v.v.', '로컬 Ollama / vLLM / one-api 등'],
    ['推文正文', 'Post text', 'ポスト本文', 'Nội dung bài đăng', '게시물 본문'],
    ['被回复推文的纯文本', 'Plain text of the post being replied to', '返信先ポストのプレーンテキスト', 'Văn bản thuần của bài đăng đang được trả lời', '답글 대상 게시물의 일반 텍스트'],
    ['作者昵称', 'Author display name', '投稿者の表示名', 'Tên hiển thị của tác giả', '작성자 표시 이름'],
    ['如「会跳舞的企鹅」', 'For example, “Dancing Penguin”', '例：「踊るペンギン」', 'Ví dụ: “Chim cánh cụt nhảy múa”', '예: “춤추는 펭귄”'],
    ['作者 handle', 'Author handle', '投稿者のユーザー名', 'Tên tài khoản tác giả', '작성자 사용자 이름'],
    ['如 @penguin_dance', 'For example, @penguin_dance', '例：@penguin_dance', 'Ví dụ: @penguin_dance', '예: @penguin_dance'],
    ['发布时间', 'Post time', '投稿日時', 'Thời gian đăng', '게시 시간'],
    ['ISO 格式时间', 'Time in ISO format', 'ISO 形式の日時', 'Thời gian theo định dạng ISO', 'ISO 형식 시간'],
    ['媒体类型', 'Media types', 'メディアの種類', 'Loại nội dung đa phương tiện', '미디어 유형'],
    ['如「图片、视频」，无则空', 'For example, “image, video”; empty when absent', '例：「画像、動画」。なければ空欄', 'Ví dụ: “ảnh, video”; để trống nếu không có', '예: “이미지, 동영상”, 없으면 빈 값'],
    ['推文链接', 'Post URL', 'ポストの URL', 'Liên kết bài đăng', '게시물 링크'],
    ['完整 URL', 'Full URL', '完全な URL', 'URL đầy đủ', '전체 URL'],
    ['当前时间', 'Current time', '現在日時', 'Thời gian hiện tại', '현재 시간'],
    ['生成时刻，如「2026-10-17 14:30」', 'Generation time, for example “2026-10-17 14:30”', '生成時刻。例：「2026-10-17 14:30」', 'Thời điểm tạo, ví dụ “2026-10-17 14:30”', '생성 시간, 예: “2026-10-17 14:30”'],
    ['推文前 400 字', 'First 400 post characters', 'ポストの先頭 400 文字', '400 ký tự đầu của bài đăng', '게시물의 첫 400자'],
    ['正文截断到 400 字（auto 风格用）', 'Post text truncated to 400 characters (used by Auto style)', '本文を 400 文字に切り詰める（自動スタイルで使用）', 'Nội dung rút gọn còn 400 ký tự (dùng cho phong cách tự động)', '본문을 400자로 자름 (자동 스타일에서 사용)'],
    ['本次要生成几条', 'Number of replies to generate', '今回生成する件数', 'Số câu trả lời cần tạo lần này', '이번에 생성할 답글 수'],
    ['附图数量', 'Image count', '添付画像の数', 'Số ảnh đính kèm', '첨부 이미지 수'],
    ['本次随消息发给模型的图片张数', 'Number of images sent to the model with this request', '今回のリクエストでモデルに送信する画像数', 'Số ảnh gửi đến mô hình cùng yêu cầu lần này', '이번 요청과 함께 모델에 보내는 이미지 수'],
    ['风格描述', 'Style description', 'スタイルの説明', 'Mô tả phong cách', '스타일 설명'],
    ['当前风格的中文说明', 'Chinese description of the selected style', '現在のスタイルの中国語による説明', 'Mô tả bằng tiếng Trung của phong cách hiện tại', '현재 스타일의 중국어 설명'],
    ['风格名', 'Style name', 'スタイル名', 'Tên phong cách', '스타일 이름'],
    ['如「幽默」', 'For example, “Humor”', '例：「ユーモア」', 'Ví dụ: “Hài hước”', '예: “유머”'],
    ['长度描述', 'Length description', '長さの説明', 'Mô tả độ dài', '길이 설명'],
    ['如「1-2 句，30-80 字」', 'For example, “1–2 sentences, 30–80 characters”', '例：「1～2 文、30～80 文字」', 'Ví dụ: “1–2 câu, 30–80 ký tự”', '예: “1~2문장, 30~80자”'],
    ['如「简体中文」', 'For example, “Simplified Chinese”', '例：「簡体字中国語」', 'Ví dụ: “Tiếng Trung giản thể”', '예: “중국어 간체”'],
    ['补充要求', 'Additional instructions', '追加の指示', 'Yêu cầu bổ sung', '추가 지침'],
    ['设置页或面板里填的额外要求', 'Extra instructions entered in settings or the panel', '設定ページまたはパネルで入力した追加の指示', 'Yêu cầu bổ sung đã nhập trong cài đặt hoặc bảng', '설정 페이지 또는 패널에 입력한 추가 요청'],
    ['已应用｜影响范围：整个浏览器', 'Applied | Scope: entire browser', '適用しました｜影響範囲：ブラウザー全体', 'Đã áp dụng | Phạm vi: toàn bộ trình duyệt', '적용됨 | 적용 범위: 브라우저 전체'],
    ['已应用｜影响范围：整个浏览器（AI 域名绕过，其余走固定代理）', 'Applied | Scope: entire browser (AI domains bypass the proxy; other traffic uses the fixed proxy)', '適用しました｜影響範囲：ブラウザー全体（AI ドメインは直接接続、その他は固定プロキシ経由）', 'Đã áp dụng | Phạm vi: cả trình duyệt (miền AI bỏ qua proxy, lưu lượng khác qua proxy cố định)', '적용됨 | 적용 범위: 브라우저 전체 (AI 도메인은 우회, 나머지는 고정 프록시 사용)'],
    ['已应用｜未改变你的网络设置', 'Applied | Your network settings were not changed', '適用しました｜ネットワーク設定は変更されていません', 'Đã áp dụng | Cài đặt mạng của bạn không thay đổi', '적용됨 | 네트워크 설정은 변경되지 않았습니다'],
    ['已恢复默认｜扩展已交还控制权，不再影响你的网络', 'Defaults restored | Extension control released; your network is no longer affected', '既定に戻しました｜拡張機能の制御を解除し、ネットワークへの影響を解消しました', 'Đã khôi phục mặc định | Tiện ích đã trả quyền điều khiển, không còn ảnh hưởng mạng', '기본값 복원됨 | 확장 프로그램의 제어를 해제하여 네트워크에 영향을 주지 않습니다'],
    ['连接中… {seconds}s', 'Connecting… {seconds}s', '接続中… {seconds}秒', 'Đang kết nối… {seconds} giây', '연결 중… {seconds}초'],
    ['连接成功 ✓ {seconds}s ｜ 示例：{sample}', 'Connected ✓ {seconds}s | Sample: {sample}', '接続成功 ✓ {seconds}秒 ｜ サンプル：{sample}', 'Kết nối thành công ✓ {seconds} giây | Ví dụ: {sample}', '연결 성공 ✓ {seconds}초 | 예시: {sample}'],
    ['{error}', '{error}', '{error}', '{error}', '{error}'],
    ['保存配置失败，请重新加载扩展', 'Could not save settings. Reload the extension.', '設定を保存できませんでした。拡張機能を再読み込みしてください。', 'Không thể lưu cấu hình. Hãy tải lại tiện ích.', '설정을 저장하지 못했습니다. 확장 프로그램을 새로고침하세요.'],
    ['配置已保存，但清理代理失败：{error}', 'Settings saved, but the proxy override could not be cleared: {error}', '設定を保存しましたが、プロキシの上書きを解除できませんでした：{error}', 'Đã lưu cấu hình nhưng không thể xóa ghi đè proxy: {error}', '설정을 저장했지만 프록시 재정의를 해제하지 못했습니다: {error}'],
    ['配置已重置，但清理代理失败：{error}', 'Settings reset, but the proxy override could not be cleared: {error}', '設定を初期化しましたが、プロキシの上書きを解除できませんでした：{error}', 'Đã đặt lại cấu hình nhưng không thể xóa ghi đè proxy: {error}', '설정을 초기화했지만 프록시 재정의를 해제하지 못했습니다: {error}'],
    ['未配置 Base URL', 'No Base URL configured', 'Base URL が未設定です', 'Chưa cấu hình Base URL', 'Base URL이 설정되지 않았습니다'],
    ['返回非 JSON：{error}', 'The API returned non-JSON data: {error}', 'API が JSON 以外を返しました：{error}', 'API trả về dữ liệu không phải JSON: {error}', 'API가 JSON이 아닌 데이터를 반환했습니다: {error}'],
    ['模型输出为空（max_tokens 被推理过程吃光）。请把「最大生成长度」调大到 4000 以上后重试。', 'The model returned no text because reasoning used all max_tokens. Increase Maximum output tokens to at least 4000 and try again.', '推論が max_tokens を使い切り、本文が空になりました。「最大生成トークン数」を 4000 以上にして再試行してください。', 'Mô hình không trả về nội dung vì suy luận đã dùng hết max_tokens. Tăng số token đầu ra tối đa lên ít nhất 4000 rồi thử lại.', '추론이 max_tokens를 모두 사용하여 본문이 비어 있습니다. 최대 출력 토큰 수를 4000 이상으로 늘리고 다시 시도하세요.'],
    ['模型只输出了思考过程、没有正文（max_tokens 被 reasoning 吃光）。请把「最大生成长度」调大后重试。', 'The model returned reasoning without a reply because it used all max_tokens. Increase Maximum output tokens and try again.', '推論が max_tokens を使い切り、思考のみで本文がありません。「最大生成トークン数」を増やして再試行してください。', 'Mô hình chỉ trả về suy luận, không có câu trả lời vì đã dùng hết max_tokens. Tăng số token đầu ra tối đa rồi thử lại.', 'max_tokens를 모두 사용하여 추론만 있고 본문이 없습니다. 최대 출력 토큰 수를 늘리고 다시 시도하세요.'],
    ['（本次已附带推文图片；若当前模型不支持视觉，请在设置中关闭「识别推文图片」或改用视觉模型）', '(Post images were included. If this model does not support vision, turn off image analysis in settings or use a vision model.)', '（ポストの画像を送信しました。画像非対応のモデルでは、設定の画像解析を無効にするか、画像対応モデルをお使いください。）', '(Yêu cầu có ảnh bài đăng. Nếu mô hình không hỗ trợ thị giác, hãy tắt nhận diện ảnh trong cài đặt hoặc dùng mô hình có thị giác.)', '(게시물 이미지를 포함했습니다. 모델이 이미지를 지원하지 않으면 설정에서 이미지 분석을 끄거나 이미지 지원 모델을 사용하세요.)'],
    ['流式请求失败：{error}', 'Streaming request failed: {error}', 'ストリーミングに失敗しました：{error}', 'Yêu cầu truyền trực tuyến thất bại: {error}', '스트리밍 요청 실패: {error}'],
    ['接口返回错误', 'The API returned an error', 'API がエラーを返しました', 'API trả về lỗi', 'API가 오류를 반환했습니다'],
    ['插件已在设置中停用', 'The extension is disabled in settings', '設定で拡張機能が無効になっています', 'Tiện ích đã bị tắt trong cài đặt', '설정에서 확장 프로그램이 꺼져 있습니다'],
    ['未配置 API Key，请点击扩展图标打开设置', 'No API key configured. Select the extension icon to open settings.', 'API キーが未設定です。拡張機能アイコンから設定を開いてください。', 'Chưa cấu hình API Key. Nhấn biểu tượng tiện ích để mở cài đặt.', 'API 키가 설정되지 않았습니다. 확장 프로그램 아이콘을 눌러 설정을 여세요.'],
    ['未能从模型输出中解析出回复内容。原始输出：{output}', 'Could not parse replies from the model output. Raw output: {output}', 'モデルの出力から返信を解析できませんでした。元の出力：{output}', 'Không thể phân tích câu trả lời từ đầu ra mô hình. Đầu ra gốc: {output}', '모델 출력에서 답글을 추출하지 못했습니다. 원본 출력: {output}'],
    ['这条推文按「自动」风格规则被跳过了（内容模糊或立场不符），换个风格试试。', 'Auto style skipped this post because its content was unclear or did not match the style rules. Try another style.', '内容が不明確、または方針に合わないため、自動スタイルでスキップしました。別のスタイルをお試しください。', 'Phong cách tự động đã bỏ qua bài đăng vì nội dung chưa rõ hoặc không phù hợp quy tắc. Hãy thử phong cách khác.', '내용이 불명확하거나 규칙에 맞지 않아 자동 스타일에서 건너뛰었습니다. 다른 스타일을 사용하세요.'],
    ['自定义代理需要填写主机和端口', 'A custom proxy requires a host and port', 'カスタムプロキシにはホストとポートが必要です', 'Proxy tùy chỉnh cần máy chủ và cổng', '사용자 지정 프록시에는 호스트와 포트가 필요합니다'],
    ['当前环境不支持 chrome.proxy（service worker 不可用）', 'chrome.proxy is unavailable in this environment (service worker unavailable)', 'この環境では chrome.proxy を使用できません（service worker が利用不可）', 'Môi trường hiện tại không hỗ trợ chrome.proxy (service worker không khả dụng)', '현재 환경에서 chrome.proxy를 지원하지 않습니다 (service worker 사용 불가)'],
    ['⚠ 已全局直连：整个浏览器的流量都不再走代理', '⚠ All browser traffic now connects directly without a proxy', '⚠ ブラウザー全体の通信がプロキシを使わず直接接続になりました', '⚠ Toàn bộ lưu lượng trình duyệt hiện kết nối trực tiếp, không qua proxy', '⚠ 전체 브라우저 트래픽이 프록시 없이 직접 연결됩니다'],
    ['已设固定代理 {proxy}（{api} 直连，其他照旧走代理）', 'Fixed proxy set to {proxy} ({api} connects directly; other traffic uses the proxy)', '固定プロキシを {proxy} に設定（{api} は直接接続、その他はプロキシ経由）', 'Đã đặt proxy cố định {proxy} ({api} kết nối trực tiếp, lưu lượng khác qua proxy)', '고정 프록시 {proxy} 설정 ({api}는 직접 연결, 나머지는 프록시 사용)'],
    ['已设固定代理 {proxy}', 'Fixed proxy set to {proxy}', '固定プロキシを {proxy} に設定しました', 'Đã đặt proxy cố định {proxy}', '고정 프록시를 {proxy}로 설정했습니다'],
    ['已应用代理设置', 'Proxy settings applied', 'プロキシ設定を適用しました', 'Đã áp dụng cài đặt proxy', '프록시 설정을 적용했습니다'],
    ['设置代理失败：{error}', 'Could not apply proxy settings: {error}', 'プロキシ設定を適用できませんでした：{error}', 'Không thể áp dụng cài đặt proxy: {error}', '프록시 설정 적용 실패: {error}'],
    ['不可用', 'Unavailable', '利用不可', 'Không khả dụng', '사용 불가'],
    ['强制直连', 'Direct connection', '強制直接接続', 'Kết nối trực tiếp', '강제 직접 연결'],
    ['跟随系统', 'System proxy settings', 'システム設定に従う', 'Theo cài đặt hệ thống', '시스템 설정 사용'],
    ['已清除扩展的代理覆盖，恢复浏览器原有配置', 'Extension proxy override cleared; browser settings restored', '拡張機能のプロキシ上書きを解除し、ブラウザーの設定を復元しました', 'Đã xóa ghi đè proxy của tiện ích và khôi phục cài đặt trình duyệt', '확장 프로그램의 프록시 재정의를 해제하고 기존 브라우저 설정을 복원했습니다'],
    ['当前网络设置', 'Current network settings', '現在のネットワーク設定', 'Cài đặt mạng hiện tại', '현재 네트워크 설정'],
    ['API 直连', 'Direct API connection', 'API 直接接続', 'Kết nối API trực tiếp', 'API 직접 연결'],
    ['未执行直连对比：{reason}；未更改浏览器代理设置', 'Direct connection comparison skipped: {reason}; browser proxy settings were not changed', '直接接続の比較をスキップしました：{reason}。ブラウザーのプロキシ設定は変更していません。', 'Bỏ qua so sánh kết nối trực tiếp: {reason}; cài đặt proxy trình duyệt không thay đổi', '직접 연결 비교를 건너뛰었습니다: {reason}. 브라우저 프록시 설정은 변경하지 않았습니다'],
    ['当前环境不支持代理设置', 'Proxy settings are unavailable in this environment', 'この環境ではプロキシ設定を利用できません', 'Môi trường hiện tại không hỗ trợ cài đặt proxy', '현재 환경에서 프록시 설정을 지원하지 않습니다'],
    ['无法识别 API 域名', 'Could not identify the API host', 'API ドメインを判別できません', 'Không thể xác định miền API', 'API 도메인을 식별하지 못했습니다'],
    ['当前不是可安全保留的固定代理模式', 'The current proxy mode cannot be safely preserved for this test', '現在のモードは、設定を安全に維持してテストできる固定プロキシではありません', 'Chế độ proxy hiện tại không thể được giữ an toàn trong phép thử này', '현재 프록시 모드를 안전하게 유지하며 테스트할 수 없습니다'],
    ['当前代理由其他扩展或策略控制', 'The proxy is controlled by another extension or policy', 'プロキシは別の拡張機能またはポリシーで制御されています', 'Proxy hiện do tiện ích khác hoặc chính sách điều khiển', '다른 확장 프로그램이나 정책이 프록시를 제어하고 있습니다'],
  ];

  const catalogs = Object.fromEntries(ids.map((id) => [id, Object.create(null)]));
  for (const row of rows) for (let index = 0; index < ids.length; index++) catalogs[ids[index]][row[0]] = row[index];

  function languageCode(value) {
    return String(value || '').trim().toLowerCase().split(/[-_]/)[0];
  }

  function browserLocale() {
    const nav = root.navigator;
    if (!nav) return 'zh';
    const choices = Array.isArray(nav.languages) && nav.languages.length ? nav.languages : [nav.language];
    for (const choice of choices) {
      const code = languageCode(choice);
      if (ids.includes(code)) return code;
    }
    return 'en';
  }

  let configured = 'auto';
  let locale = browserLocale();
  function setLocale(value) {
    const code = languageCode(value);
    configured = ids.includes(code) ? code : 'auto';
    locale = configured === 'auto' ? browserLocale() : configured;
    return locale;
  }

  function interpolate(value, params) {
    return value.replace(/\{(\w+)\}/g, (match, key) => params && Object.prototype.hasOwnProperty.call(params, key) ? String(params[key]) : match);
  }

  function t(source, params) {
    const key = String(source == null ? '' : source);
    return interpolate(Object.prototype.hasOwnProperty.call(catalogs[locale], key) ? catalogs[locale][key] : key, params);
  }

  function apply(container) {
    if (!container) return;
    const attributes = [
      ['data-i18n', null], ['data-i18n-title', 'title'],
      ['data-i18n-placeholder', 'placeholder'], ['data-i18n-aria-label', 'aria-label'],
    ];
    for (const [marker, attribute] of attributes) {
      const nodes = [];
      if (container.nodeType === 1 && container.hasAttribute(marker)) nodes.push(container);
      if (typeof container.querySelectorAll === 'function') nodes.push(...container.querySelectorAll('[' + marker + ']'));
      for (const node of nodes) {
        const translated = t(node.getAttribute(marker));
        if (attribute) node.setAttribute(attribute, translated);
        else node.textContent = translated;
      }
    }
  }

  // Translate known diagnostic templates while preserving API error details verbatim.
  function translateError(error) {
    const source = String(error && error.message || error || '');
    if (Object.prototype.hasOwnProperty.call(catalogs[locale], source)) return t(source);
    for (const key of Object.keys(catalogs.zh)) {
      if (!/\{\w+\}/.test(key) || /^\{\w+\}$/.test(key)) continue;
      const names = [];
      const pattern = key.split(/(\{\w+\})/).map((part) => {
        if (/^\{\w+\}$/.test(part)) { names.push(part.slice(1, -1)); return '([\\s\\S]*?)'; }
        return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      }).join('');
      const match = source.match(new RegExp('^' + pattern + '$'));
      if (match) return t(key, Object.fromEntries(names.map((name, i) => {
        const value = match[i + 1];
        return [name, ['error', 'reason', 'state'].includes(name) && value !== source ? translateError(value) : value];
      })));
    }
    return source;
  }

  XAI.i18n = {
    setLocale, getLocale: () => locale, getConfiguredLocale: () => configured,
    t, apply, translateError, catalogs, messages: catalogs,
    get languages() {
      return [{ id: 'auto', label: t('跟随浏览器') }].concat(ids.map((id) => ({ id, label: nativeNames[id] })));
    },
  };
})(typeof window !== 'undefined' ? window : self);
