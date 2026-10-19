/**
 * 弹层与推文 DOM 探测。
 *
 * X 的 DOM 是 React + Draft.js，选择器会随版本变动，
 * 所以这里一律用「多候选 + 容错」策略，任一命中即可。
 */
(function (root) {
  'use strict';

  const XAI = (root.XAI = root.XAI || {});
  const U = XAI.utils;
  const D = (XAI.detector = {});

  /* ------------------------------------------------------------------ *
   * 选择器集合（按优先级排列）
   * ------------------------------------------------------------------ */

  D.SEL = {
    // 发帖/回复弹层：role=dialog 且内部含 Draft 编辑器
    dialog: [
      'div[role="dialog"][aria-modal="true"]',
      'div[role="dialog"]',
      '[data-testid="tweetTextarea_0"]',
      '[data-testid="tweetTextarea_1"]',
    ],

    // Draft.js 编辑器
    editor: [
      '[data-testid="tweetTextarea_0"]',
      '[data-testid="tweetTextarea_1"]',
      'div[role="textbox"][contenteditable="true"][aria-multiline="true"]',
      'div[DraftEditor-editor][contenteditable="true"]',
      'div[contenteditable="true"][role="textbox"]',
    ],

    // 弹层内被引用的原推文容器
    quotedTweet: [
      '[data-testid="quoteTweet"]',
      'div[dir="ltr"][role="link"][tabindex="0"][aria-describedby]', // 备用
      '[data-testid="tweet"]',
    ],

    // 推文正文
    tweetText: ['[data-testid="tweetText"]', 'div[lang][dir]', 'div[dir][lang]'],

    // 用户名区域
    userName: ['[data-testid="User-Name"]', '[dir="ltr"][role="link"] span'],

    // 弹层内的上下文标题条（"正在回复" 之类）
    contextBar: ['[data-testid="replyContextBar"]', '[data-testid="tweet-text-parent"]'],

    // 「发帖」按钮，用于判断弹层类型
    postBtn: [
      '[data-testid="tweetButton"]',
      '[data-testid="tweetButtonInline"]',
      'button[aria-label*="发帖"]',
      'button[aria-label*="Post"]',
      'button[aria-label*="Reply"]',
    ],
  };

  /** matches() 的安全封装（选择器非法时返回 false 而不是抛错） */
  function safeMatch(el, sel) {
    try {
      return el.matches(sel);
    } catch (e) {
      return false;
    }
  }
  D.safeMatch = safeMatch;

  /**
   * 通用：按候选选择器列表取第一个存在且非空的元素。
   *
   * 关键：querySelector **只搜后代、不含自身**。
   * 真实 X 的弹层里，弹层节点本身就可能直接就是 tweetText 容器，
   * 所以必须先 matches() 检查自身，再回落到 querySelector。
   * （漏掉这一点会导致正文和时间一律取为空。）
   */
  function pick(rootEl, selectors, needText) {
    if (!rootEl) return null;
    for (const sel of selectors) {
      // 先看自身
      let self = null;
      try {
        if (rootEl.nodeType === 1 && rootEl.matches(sel)) self = rootEl;
      } catch (e) {
        /* 非法选择器，忽略 */
      }
      let found = self;
      if (!found) {
        try {
          found = rootEl.querySelector(sel);
        } catch (e) {
          continue;
        }
      }
      if (!found) continue;
      if (needText) {
        const t = U.cleanText(found.innerText || found.textContent || '');
        if (!t) continue;
        return found;
      }
      return found;
    }
    return null;
  }
  D.pick = pick;

  /* ------------------------------------------------------------------ *
   * 1. 识别发帖弹层
   * ------------------------------------------------------------------ */

  /** 找到当前可见的「发帖/回复」弹层节点；不存在返回 null */
  D.findComposer = function findComposer() {
    // 优先：在 role=dialog 里找编辑器（编辑器比 dialog 更精确）
    const editors = Array.prototype.slice.call(document.querySelectorAll(D.SEL.editor.join(',')));

    for (const ed of editors) {
      if (!isVisible(ed)) continue;
      // 编辑器本身必须在弹层内；若不在（时间线内联发帖），跳过
      const dlg = closestDialog(ed);
      if (!dlg) continue;
      if (!isVisible(dlg)) continue;
      return { dialog: dlg, editor: ed, isReply: detectIsReply(dlg, ed) };
    }

    // 退路：先按编辑器找
    for (const ed of editors) {
      if (isVisible(ed) && !closestDialog(ed)) {
        return { dialog: null, editor: ed, isReply: false };
      }
    }
    return null;
  };

  function closestDialog(el) {
    if (!el) return null;
    return el.closest('div[role="dialog"]');
  }

  /** 判断该弹层是「回复」还是「新发帖」 */
  function detectIsReply(dialog, editor) {
    if (!dialog) return false;
    // 回复上下文条或明确的弹层标签是强证据。
    if (dialog.querySelector('[data-testid="replyContextBar"]')) return true;
    const al = dialog.getAttribute('aria-label') || '';
    if (/回复|Reply/i.test(al)) return true;

    // 普通引用发帖也含 quoteTweet/tweetText，但引用卡在编辑器之后。
    // 只接受编辑器之前、且不属于任意草稿编辑器的原推节点。
    if (!editor || !editor.compareDocumentPosition) return false;
    const candidates = dialog.querySelectorAll(
      '[data-testid="quoteTweet"], [data-testid="tweetText"], [data-testid="tweet"]'
    );
    for (const node of candidates) {
      if (node === editor || node.contains(editor) || editor.contains(node)) continue;
      if (node.closest('[contenteditable="true"]')) continue;
      // DOCUMENT_POSITION_FOLLOWING = 4：editor 在该原推节点之后。
      if (node.compareDocumentPosition(editor) & 4) return true;
    }
    return false;
  }
  D.detectIsReply = detectIsReply;

  function isVisible(el) {
    if (!el) return false;
    if (!el.isConnected) return false;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 && r.height <= 0) {
      // Draft 编辑器在空内容时高度可能为 0，用 offsetParent 兜底
      return !!(el.offsetParent || el.getClientRects().length);
    }
    const cs = window.getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none' && cs.opacity !== '0';
  }
  D.isVisible = isVisible;

  /* ------------------------------------------------------------------ *
   * 2. 提取被回复的推文
   * ------------------------------------------------------------------ */

  /** 找到编辑器之前的原推卡片，跳过草稿与编辑器下方的引用预览。 */
  function findTargetCard(composer) {
    const dialog = composer && composer.dialog;
    const editor = composer && composer.editor;
    if (!dialog || !editor) return null;

    const isOriginal = (node) => {
      if (node === editor || node.contains(editor) || editor.contains(node)) return false;
      if (node.closest('[contenteditable="true"]')) return false;
      return !!(node.compareDocumentPosition && (node.compareDocumentPosition(editor) & 4));
    };

    // 原推自身正文在嵌套引用卡之前；不能先选任意 quoteTweet，
    // 否则回复「评论 + 引用」时会把引用卡的作者/正文当成回复对象。
    let card = null;
    for (const text of dialog.querySelectorAll('[data-testid="tweetText"]')) {
      if (!isOriginal(text)) continue;
      const holder = text.closest('[data-testid="tweet"]');
      card = holder && dialog.contains(holder) && isOriginal(holder) ? holder : text;
      break;
    }
    if (!card) {
      // 无文字的图片/视频推文仍通过编辑器之前的卡片读取作者和媒体。
      for (const holder of dialog.querySelectorAll('[data-testid="tweet"], [data-testid="quoteTweet"]')) {
        if (!isOriginal(holder)) continue;
        card = holder;
        break;
      }
    }
    if (!card) return null;

    return card;
  }

  /** 从弹层提取回复对象；返回 { author, handle, text, url, time, media } 或 null。 */
  D.extractTargetTweet = function extractTargetTweet(composer) {
    const card = findTargetCard(composer);
    return card ? D.parseTweetCard(card, composer.dialog) : null;
  };

  /**
   * 无 status 链接时，记住本次弹层实际读取的原文节点。
   * 翻译工具可能在生成期间追加译文；不能因此把同一条原推误判为另一条。
   * 只允许原节点及全部原文字节点保持不变，不能凭正文前缀放宽匹配。
   */
  D.captureTargetSnapshot = function captureTargetSnapshot(composer) {
    const card = findTargetCard(composer);
    const source = card && pick(card, ['[data-testid="tweetText"]'], true);
    if (!source || !source.ownerDocument.createTreeWalker) return null;
    const walker = source.ownerDocument.createTreeWalker(source, 4); // SHOW_TEXT
    const textNodes = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (U.cleanText(node.nodeValue)) textNodes.push({ node, value: node.nodeValue });
    }
    if (!textNodes.length) return null;
    return { dialog: composer.dialog, source, textNodes, tweet: D.parseTweetCard(card, composer.dialog) };
  };

  D.matchesTargetSnapshot = function matchesTargetSnapshot(composer, snapshot, expected, extracted) {
    if (!snapshot || composer.dialog !== snapshot.dialog || !U.sameTweet(snapshot.tweet, expected)) return false;
    const card = findTargetCard(composer);
    const source = card && pick(card, ['[data-testid="tweetText"]'], true);
    if (source !== snapshot.source || !extracted) return false;

    // 身份证据优先于 DOM 连续性，复用弹层/原文节点也不能越过 ID 或作者冲突。
    const status = (tweet) => String(tweet.url || '').match(/\/status\/(\d+)/);
    const currentId = status(extracted);
    for (const previous of [snapshot.tweet, expected]) {
      const previousId = status(previous);
      if (currentId && previousId && currentId[1] !== previousId[1]) return false;
      if (previous.handle && extracted.handle && previous.handle.toLowerCase() !== extracted.handle.toLowerCase()) return false;
      if ((!previous.handle || !extracted.handle) && previous.author && extracted.author &&
          previous.author !== '未知作者' && extracted.author !== '未知作者' &&
          previous.author.toLowerCase() !== extracted.author.toLowerCase()) return false;
    }
    let previousNode = null;
    for (const entry of snapshot.textNodes) {
      if (!source.contains(entry.node) || entry.node.nodeValue !== entry.value) return false;
      if (previousNode && !(previousNode.compareDocumentPosition(entry.node) & 4)) return false;
      previousNode = entry.node;
    }
    return true;
  };

  /**
   * 从一条推文卡片解析出结构化信息。
   * cardEl: 推文节点；scope: 用于查询用户名的更大范围（弹层里用户名在卡片外）
   */
  D.parseTweetCard = function parseTweetCard(cardEl, scope) {
    const rootEl = scope && scope.contains(cardEl) ? scope : cardEl;
    const editor = safeMatch(rootEl, '[role="dialog"]') && pick(rootEl, D.SEL.editor, false);
    const isOwnMetadata = (node) => {
      if (node.closest('[contenteditable="true"], [data-testid="attachments"]')) return false;
      const quoted = node.closest('[data-testid="quoteTweet"]');
      if (quoted && quoted !== cardEl && !quoted.contains(cardEl)) return false;
      const holder = node.closest('[data-testid="tweet"]');
      if (holder && holder !== cardEl && !holder.contains(cardEl)) return false;
      return !editor || !!(node.compareDocumentPosition(editor) & 4);
    };
    const pickMetadata = (container, selectors, needText) => {
      for (const selector of selectors) {
        const nodes = Array.prototype.slice.call(container.querySelectorAll(selector));
        if (safeMatch(container, selector)) nodes.unshift(container);
        for (const node of nodes) {
          if (isOwnMetadata(node) && (!needText || U.cleanText(node.innerText || node.textContent))) return node;
        }
      }
      return null;
    };

    const textEl = pick(cardEl, D.SEL.tweetText, true);
    const text = textEl ? U.cleanText(textEl.innerText) : '';

    // 用户名：优先卡片内，退到 scope（弹层顶部）
    let handle = '';
    let displayName = '';
    const nameEl = pickMetadata(cardEl, D.SEL.userName, true) || pickMetadata(rootEl, D.SEL.userName, true);
    if (nameEl) {
      const raw = U.cleanText(nameEl.innerText);
      const m = raw.match(/@([A-Za-z0-9_]{1,15})/);
      if (m) {
        handle = '@' + m[1];
        displayName = raw.replace(m[0], '').trim().split(/\s*·\s*/)[0].trim();
      }
    }

    // 时间 + 链接：卡片内优先，取不到就回溯到弹层范围
    // （弹层结构里 <time> 常与 tweetText 平级，不在卡片内部）
    let url = '';
    let time = '';
    const timeEl = pickMetadata(cardEl, ['time'], false) || pickMetadata(rootEl, ['time'], false);
    if (timeEl) {
      time = timeEl.getAttribute('datetime') || U.cleanText(timeEl.innerText);
      const a = timeEl.closest('a');
      if (a && a.href) url = a.href;
    }

    // 部分回复弹层的时间不是链接，但仍有独立的原推 status 链接。
    // 正文里的其他推文链接、嵌套引用卡的链接不能作为当前回复对象的 ID。
    const ownStatusLink = (container) => {
      for (const a of container.querySelectorAll('a[href]')) {
        if (!/^https?:\/\/(?:www\.|mobile\.)?(?:x|twitter)\.com\/(?:[^/?#]+|i\/web)\/status\/\d+(?:[/?#]|$)/i.test(a.href || '')) continue;
        if (a.closest('[data-testid="tweetText"], [contenteditable="true"]')) continue;
        if (!isOwnMetadata(a)) continue;
        return a.href;
      }
      return '';
    };
    // 优先使用可验证的原推 status 链接。
    url = ownStatusLink(cardEl) || (rootEl !== cardEl && ownStatusLink(rootEl)) || url;

    // 媒体类型（同样自身 + 后代 + 回溯三级）
    const media = [];
    const hasMedia = (sel) =>
      (cardEl.nodeType === 1 && cardEl.matches && safeMatch(cardEl, sel)) ||
      !!cardEl.querySelector(sel) ||
      (rootEl !== cardEl && !!rootEl.querySelector(sel));
    if (hasMedia('[data-testid="tweetPhoto"]')) media.push('image');
    if (hasMedia('[data-testid="videoPlayer"]')) media.push('video');
    if (hasMedia('[data-testid="card.wrapper"]')) media.push('link');

    // 图片 URL：只取推文媒体图（pbs.twimg.com/media/），头像(profile_images)天然被排除；
    // 再排除用户自己草稿里的图（contenteditable / 附件区），避免把回复者附图当原推图
    const images = [];
    const seenImg = {};
    const IMG_SEL = 'img[src*="pbs.twimg.com/media/"]';
    const collectImgs = (scope) => {
      if (!scope || scope.nodeType !== 1) return;
      let els = [];
      try {
        if (safeMatch(scope, IMG_SEL)) els.push(scope);
        els = els.concat(Array.prototype.slice.call(scope.querySelectorAll(IMG_SEL)));
      } catch (e) {
        return;
      }
      for (const im of els) {
        if (im.closest && im.closest('[contenteditable="true"], [data-testid="attachments"]')) continue;
        const src = im.getAttribute('src') || '';
        const key = src.split('?')[0];
        if (!src || seenImg[key]) continue;
        seenImg[key] = 1;
        images.push(src);
      }
    };
    collectImgs(cardEl);
    if (rootEl !== cardEl) collectImgs(rootEl);

    if (!text && media.length === 0 && !handle) return null;

    return {
      author: displayName || handle || '未知作者',
      handle: handle,
      text: text,
      url: url,
      time: time,
      media: media,
      images: images,
      truncated: /Show more|显示更多|查看更多/.test(cardEl.innerText || ''),
    };
  };

  /**
   * 兜底：时间线上「刚刚点击回复按钮」的那条推文。
   * 由 main.js 在点击回复气泡时缓存下来。
   */
  D.extractTweetFromArticle = function extractTweetFromArticle(articleEl) {
    if (!articleEl) return null;
    return D.parseTweetCard(articleEl, articleEl);
  };

  /* ------------------------------------------------------------------ *
   * 3. 时间线推文（缓存原生回复按钮对应的推文）
   * ------------------------------------------------------------------ */

  D.TWEET_ARTICLES = 'article[data-testid="tweet"], div[data-testid="tweet"]';

  D.findTweetArticle = function findTweetArticle(node) {
    if (!node) return null;
    return node.closest && node.closest(D.TWEET_ARTICLES);
  };

  /** 判断某节点是否是「回复气泡」按钮 */
  D.isReplyButton = function isReplyButton(node) {
    if (!node || !node.closest) return false;
    if (node.closest('[data-testid="reply"]')) return true;
    const lbl = node.getAttribute && (node.getAttribute('aria-label') || '');
    return /^回复(?!\s*你的|您的)/.test(lbl) || /^Reply$/.test(lbl);
  };
})(typeof window !== 'undefined' ? window : self);
