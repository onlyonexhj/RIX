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

  const LANG_NAME = { zh: '简体中文', en: 'English', ja: '日本語', ko: '한국어' };

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
   * @returns {{system:string, user:string, n:number}}
   */
  function buildPrompt(tweet, cfg, extra) {
    extra = extra || {};
    tweet = tweet || {};
    cfg = cfg || {};

    const styleDef = XAI.styles.find((s) => s.id === (extra.style || cfg.style));
    const lenDef = XAI.lengths.find((s) => s.id === (extra.length || cfg.length));

    const srcLang = XAI.utils.detectLang(tweet.text || '');
    const wantLang =
      (extra.lang && extra.lang !== 'auto' && extra.lang) ||
      (cfg.lang && cfg.lang !== 'auto' ? cfg.lang : srcLang === 'unknown' ? 'zh' : srcLang);

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

    const vars = {
      tweet: {
        text: tweet.text || '（该推文只有媒体，没有文字）',
        author: tweet.author || '未知',
        handle: tweet.handle || '',
        time: tweet.time || '未知',
        media: tweet.media && tweet.media.length ? tweet.media.join('、') : '',
        url: tweet.url || '',
      },
      count: n,
      style: styleText(styleDef),
      styleName: styleDef ? styleDef.label : '',
      length: lengthText(lenDef),
      lang: LANG_NAME[wantLang] || '跟随原文语言',
      customInstruction: extraReq,
    };

    // 用户自定义模板优先；留空则用内置默认
    const sysTpl = String(cfg.systemPrompt || '').trim() || XAI.defaultSystemTemplate;
    const userTpl = String(cfg.userPrompt || '').trim() || XAI.defaultUserTemplate;

    let sys = renderTemplate(sysTpl, vars);
    let user = renderTemplate(userTpl, vars);

    // 人设前置
    const persona = String(cfg.persona || '').trim();
    if (persona) sys = persona + '\n\n' + sys;

    // plain 模式：放宽 JSON 硬约束，改为序号列表输出
    if (cfg.promptFormat === 'plain') {
      sys +=
        '\n\n输出格式：直接给出 ' +
        n +
        ' 条回复，每条一行，以「1. 」「2. 」这样的序号开头，不要 JSON、不要代码块。';

      // 默认模板已含 {{tweet.media}}；若用户自定义模板没写媒体变量，plain 模式下补一条
      if (!/\{\{\s*tweet\.media\s*\}\}/.test(userTpl) && vars.tweet.media) {
        user += '\n（该推文附带媒体：' + vars.tweet.media + '）';
      }
    }

    return { system: sys, user: user, n: n };
  }
  XAI.buildPrompt = buildPrompt;
})(typeof window !== 'undefined' ? window : self);
