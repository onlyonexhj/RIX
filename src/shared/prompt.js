/**
 * 提示词构建（共享模块）。
 *
 * 抽成独立文件的原因：
 *  1. service worker 依赖 chrome.* API，无法在 Node 里直接 require 做单测
 *  2. 设置页的「预览渲染结果」也要用同一套逻辑，避免预览与实际发送不一致
 *
 * 模板机制：
 *  - systemPrompt / userPrompt 留空 -> 使用内置默认模板
 *  - 填入 -> 用 {{变量}} 占位，未定义变量替换为空串（绝不把 {{xxx}} 漏给模型）
 */
(function (root) {
  'use strict';

  const XAI = (root.XAI = root.XAI || {});

  const STYLE_HINT = {
    humor: '幽默风。轻松、有梗、会接网络热梗，可以适度自嘲。不要尬笑，不要"哈哈哈哈哈"。',
    pro: '专业风。有数据、有观点，信息密度高，像行业分析师发言。',
    sharp: '犀利风。观点鲜明，有锋芒，敢下判断，但不人身攻击。',
    warm: '共情风。真诚走心，回应对方的情绪与处境，像朋友聊天。',
    sharpw: '争议风。刻意挑战主流共识、反直觉，目的是钓评论和转发。',
    meme: '抽象风。发疯文学、无意义梗、崩坏系表达，中文圈年轻人那套。',
    translate: '翻译润色风。忠实翻译原文的意思到目标语言，不要添加原文没有的观点。',
    sarcasm: '嘲讽风。阴阳怪气但克制，不脏话，绵里藏针。',
  };

  const LEN_HINT = {
    short: '很短，一句话，30 字以内。',
    medium: '中等，1-2 句，30-80 字。',
    long: '较长，3 句以上，可以展开一个完整观点。',
  };

  const LANG_NAME = { zh: '简体中文', en: 'English', ja: '日本語', vi: 'Tiếng Việt', ko: '한국어' };

  /* ------------------------------------------------------------------
   * auto 风格（按推文自动选口吻，不合适就 SKIP）
   * 显式选择的回复语言优先；只有 lang=auto 才按原推语种注入指令。
   * ------------------------------------------------------------------ */
  const AUTO_LANG_RULE = {
    ja: '【言語】日本語で返信してください【長さ】15〜50文字、完整句子自然表达',
    zh: '【语言】必须用中文回复【长度】15-50字，不要压缩成口号，用完整的口语化句子',
    ko: '【언어】반드시 한국어로 답글을 작성하세요.【길이】15~50자, 자연스럽고 완전한 문장으로 표현하세요.',
    vi: '【Ngôn ngữ】Phải trả lời bằng tiếng Việt.【Độ dài】15–50 ký tự, diễn đạt tự nhiên bằng câu hoàn chỉnh.',
    en: '【Language】Must reply in English【Length】15-50 chars, natural complete sentences',
    // 原文语种无法识别时沿用自动风格的英文兜底。
    other: '【Language】Must reply in English【Length】15-50 chars, natural complete sentences',
  };

  const AUTO_SYSTEM_TEMPLATE = [
    '{{langRule}}',
    '',
    '【风格判断】',
    '- 技术/行业/金融/编程类 → 用行业老手口吻，专业但不装',
    '- 生活/日常/娱乐/搞笑类 → 用朋友聊天口吻，轻松随意',
    '- 观点/时事/社会类 → 认同的可以表达自己的态度，不赞同的直接SKIP，不唱反调',
    '',
    '【铁律】',
    '1. 【最重要】评论必须跟原推文的情境完全一致——先理解推文在说什么具体的事（项目名、事件、人物、数据），评论必须直接回应这个具体情境',
    '2. 【禁止过度压缩】不要为了短而牺牲自然——可以说完整的话、用自然的语气。不要像写对联一样「前半句铺垫+后半句升华」，那种对仗句子一看就是AI写的。错误示例：「市场沉浮考验人性，拿得住才是真功夫」。正确示例：「以太坊最近我也没看懂，基金会最近操作确实迷」',
    '3. 【口语化】必须像朋友吃饭聊天一样自然——直接说，不要加「说实话」「老实说」「说句实话」「讲真」这类废话前缀。就像你跟哥们聊天不会每句话都先说「说实话」。用「我也觉得」「确实」「真的」这类词没问题。🚨 严禁使用：「属实」「这波」「说实话」「老实说」「说句实话」「讲真」',
    '4. 禁止AI味：不说「分析得很到位」「值得关注」「这个观点很有意思」「高瞻远瞩」「布局未来」',
    '5. 禁止空洞附和、鸡汤、emoji开头',
    '6. 禁止万能评论——如果评论换个推文也能用，说明不够具体',
    '7. 【关键】禁止说教式金句：不要用一句话总结人生道理/行业规律/普世智慧。比如"各国困境不同，对症下药才关键，别迷信单一理论""每个时代都有它的阵痛期"这类放哪都对的废话——具体到这条推文在说什么事，就事论事',
    '8. 【跳过规则】如果推文内容模糊、缺乏上下文，你不知道它具体在说什么（比如没头没尾的一句话、缺少背景的感叹、不明所指的吐槽），直接回复SKIP，不要硬编评论',
    '9. 【立场】只评论你认同或觉得有意思的推文，不发表反对、反驳、唱反调的评论。如果你不赞同原推文的观点，直接回复SKIP跳过，不要争论、不要抬杠、不要「但我觉得」式转折',
    '',
    '只输出评论内容，不要其他任何文字。需要跳过时，只输出三个字母SKIP，禁止附带任何理由、分析或解释。',
    '',
    '{{customInstruction}}',
    '{{outputFormat}}',
  ].join('\n');

  const AUTO_USER_TEMPLATE = [
    '你正在Twitter上评论别人的推文。',
    '现在时间：{{now}}',
    '原推文作者：@{{tweet.handle}}',
    '原推文内容：{{tweet.text400}}',
  ].join('\n');

  /** 当前本地时间，如「2026-10-17 14:30」 */
  function nowText() {
    const d = new Date();
    const p = (x) => String(x).padStart(2, '0');
    return (
      d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
      ' ' + p(d.getHours()) + ':' + p(d.getMinutes())
    );
  }

  /**
   * 模板变量插值。
   *
   * 变量名正则刻意放宽到「非空白非花括号」，而不是 \w：
   * 因为 \w 不匹配中文，用 \w 会导致 {{不存在}} 这种写法
   * 整段原样漏给模型，污染实际发出的提示词（且用户完全察觉不到）。
   * 未定义变量一律替换为空串，绝不把 {{xxx}} 原文送给模型。
   */
  function renderTemplate(tpl, vars) {
    if (!tpl) return '';
    return String(tpl).replace(/\{\{\s*([^{}\s][^{}]*?)\s*\}\}/g, (m, path) => {
      const v = path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), vars);
      if (v == null) return '';
      return Array.isArray(v) ? v.join('、') : String(v);
    });
  }
  XAI.renderTemplate = renderTemplate;

  /** 找出模板里用到但未定义的变量名（供设置页提示） */
  function findUnknownVars(tpl, knownKeys) {
    const known = new Set(knownKeys);
    const bad = [];
    const re = /\{\{\s*([^{}\s][^{}]*?)\s*\}\}/g;
    let m;
    while ((m = re.exec(String(tpl || ''))) !== null) {
      if (!known.has(m[1]) && bad.indexOf(m[1]) === -1) bad.push(m[1]);
    }
    return bad;
  }
  XAI.findUnknownVars = findUnknownVars;

  function styleText(styleDef) {
    if (!styleDef) return '';
    return (styleDef.desc ? styleDef.desc : '') + ' ' + (STYLE_HINT[styleDef.id] || '');
  }

  function lengthText(lenDef) {
    if (!lenDef) return '';
    return (lenDef.desc ? lenDef.desc : '') + ' ' + (LEN_HINT[lenDef.id] || '');
  }

  /**
   * 构造完整提示词。
   * @param {object} tweet  被回复的推文
   * @param {object} cfg    用户配置
   * @param {object} extra  本次调用的临时参数（面板里选的风格/条数等）
   * @returns {{system:string, user:string, n:number, images:string[]}}
   */
  function buildPrompt(tweet, cfg, extra) {
    extra = extra || {};
    tweet = tweet || {};
    cfg = cfg || {};

    const styleDef = XAI.styles.find((s) => s.id === (extra.style || cfg.style));
    const lenDef = XAI.lengths.find((s) => s.id === (extra.length || cfg.length));

    const srcLang = XAI.utils.detectLang(tweet.text || '');
    const requestedLang = extra.lang || cfg.lang || 'auto';
    const wantLang = requestedLang === 'auto'
      ? (srcLang === 'unknown' ? 'zh' : srcLang)
      : requestedLang;

    // 条数：显式判断而非 || —— 0 是合法输入（会被钳到下限 1），
    // 用 || 会让 0 被当成「未设置」而回退到默认 3
    const rawCount = extra.count !== undefined && extra.count !== null && extra.count !== ''
      ? extra.count
      : cfg.count;
    const parsedCount = Number(rawCount);
    const n = Number.isFinite(parsedCount)
      ? Math.max(1, Math.min(8, Math.floor(parsedCount)))
      : 3;

    // 自定义补充要求：设置页全局 + 本次临时，合并
    const extraReq = [cfg.customInstruction, extra.customInstruction]
      .filter((x) => x && String(x).trim())
      .join('；')
      .trim();

    // 自动风格只自动选择口吻；不能覆盖用户在面板/设置页明确指定的输出语言。
    const isAuto = !!(styleDef && styleDef.id === 'auto');
    const autoLang = requestedLang === 'auto' && srcLang === 'unknown' ? 'other' : wantLang;
    const langRule = isAuto ? (AUTO_LANG_RULE[autoLang] || AUTO_LANG_RULE.other) : '';

    // 视觉：开关打开且推文带图时，把图片 URL 交给 SW 拼多模态消息（最多 4 张控成本）
    const images = cfg.vision && Array.isArray(tweet.images)
      ? tweet.images.filter(Boolean).slice(0, 4)
      : [];

    const vars = {
      tweet: {
        text: tweet.text || '（该推文只有媒体，没有文字）',
        text400: String(tweet.text || '（该推文只有媒体，没有文字）').slice(0, 400),
        author: tweet.author || '未知',
        handle: tweet.handle || '',
        time: tweet.time || '未知',
        media: tweet.media && tweet.media.length ? tweet.media.join('、') : '',
        url: tweet.url || '',
      },
      count: n,
      imageCount: images.length,
      style: styleText(styleDef),
      styleName: styleDef ? styleDef.label : '',
      length: lengthText(lenDef),
      lang: LANG_NAME[wantLang] || '跟随原文语言',
      customInstruction: extraReq,
      now: nowText(),
      langRule: langRule,
      // auto 模板的输出格式段：json 模式强制 JSON 数组（SKIP 条目写 "SKIP"），
      // plain 模式改序号行。count 直接拼进字符串（renderTemplate 不做嵌套展开）
      outputFormat: isAuto
        ? cfg.promptFormat === 'plain'
          ? '本次需要生成 ' + n + ' 条不同的候选。直接给出 ' + n + ' 条回复，每条一行，' +
            '以「1. 」「2. 」这样的序号开头，不要 JSON、不要代码块。' +
            '需要跳过的条目只写 SKIP。各条切入角度、句式要有明显差异。'
          : '本次需要生成 ' + n + ' 条不同的候选。只输出一个 JSON 字符串数组，' +
            '例如 ["第一条","第二条"]。不要 markdown 代码块，不要任何解释文字。' +
            '需要跳过的条目在数组中写 "SKIP"。各条切入角度、句式要有明显差异。'
        : '',
    };

    // 用户自定义模板优先；留空则用内置默认（auto 风格有专属默认模板）
    const sysTpl = String(cfg.systemPrompt || '').trim()
      || (isAuto ? AUTO_SYSTEM_TEMPLATE : XAI.defaultSystemTemplate);
    const userTpl = String(cfg.userPrompt || '').trim()
      || (isAuto ? AUTO_USER_TEMPLATE : XAI.defaultUserTemplate);

    let sys = renderTemplate(sysTpl, vars);
    let user = renderTemplate(userTpl, vars);

    // 附图说明（图片本体由 SW 以多模态消息部件附带，提示词里只交代任务）
    if (images.length) {
      user += '\n\n【附图】这条推文带有 ' + images.length + ' 张图片（已随本消息一并发给你）。' +
        '可结合图片内容回应，但不要逐条复述图片细节。';
    }

    // 人设前置
    const persona = String(cfg.persona || '').trim();
    if (persona) sys = persona + '\n\n' + sys;

    // plain 模式：放宽 JSON 硬约束，改为序号列表输出
    // （auto 模板的 {{outputFormat}} 已按 promptFormat 生成对应格式段，格式段跳过避免重复）
    if (cfg.promptFormat === 'plain') {
      if (!isAuto || !/\{\{\s*outputFormat\s*\}\}/.test(sysTpl)) {
        sys +=
          '\n\n输出格式：直接给出 ' +
          n +
          ' 条回复，每条一行，以「1. 」「2. 」这样的序号开头，不要 JSON、不要代码块。';
      }

      // 默认/auto 模板的 user 段都不含 {{tweet.media}}；plain 模式下补一条媒体说明
      if (!/\{\{\s*tweet\.media\s*\}\}/.test(userTpl) && vars.tweet.media) {
        user += '\n（该推文附带媒体：' + vars.tweet.media + '）';
      }
    }

    return { system: sys, user: user, n: n, images: images };
  }
  XAI.buildPrompt = buildPrompt;
})(typeof window !== 'undefined' ? window : self);
