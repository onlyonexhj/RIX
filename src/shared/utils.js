/**
 * 通用工具：字符串处理 / DOM 文本提取 / 消息编解码。
 */
(function (root) {
  'use strict';

  const XAI = (root.XAI = root.XAI || {});
  const U = (XAI.utils = {});

  /**
   * 在文本中找出所有「括号配平」的 [...] 区间（字符串内的括号不算）。
   * 从每个 [ 开始向内扫到配平的 ]，逐个返回候选子串。
   * 用于从「思考过程 + 正文」的混合输出里稳妥地抠出 JSON 数组。
   */
  function findBalancedArrays(text) {
    const out = [];
    const n = text.length;

    for (let i = 0; i < n; i++) {
      if (text[i] !== '[') continue;

      let depth = 0;
      let inStr = false;
      let quote = '';
      let escaped = false;
      let end = -1;

      for (let j = i; j < n; j++) {
        const c = text[j];

        if (inStr) {
          if (escaped) escaped = false;
          else if (c === '\\') escaped = true;
          else if (c === quote) inStr = false;
          continue;
        }

        if (c === '"' || c === "'") {
          inStr = true;
          quote = c;
          continue;
        }
        if (c === '[') depth++;
        else if (c === ']') {
          depth--;
          if (depth === 0) {
            end = j;
            break;
          }
        }
      }

      if (end !== -1) {
        out.push(text.slice(i, end + 1));
        i = end; // 跳过已消费的区间，避免嵌套重复
      }
    }
    return out;
  }

  /** 从模型输出里稳健地解析出字符串数组（容忍 ```json 包裹、前后废话、逐条编号） */
  U.parseReplyList = function parseReplyList(raw, expect) {
    const n = expect || 0;
    if (!raw) return [];

    let text = String(raw).trim();
    // 去掉 ``` 包裹
    text = text.replace(/^```(?:json|JSON)?\s*/, '').replace(/\s*```$/, '');

    const out = [];

    // 方案 1：整体是合法 JSON 数组
    /** 解析并**只接受字符串数组** —— [1] 这类数字数组不算数 */
    const tryJson = (s) => {
      let v;
      try {
        v = JSON.parse(s);
      } catch (e) {
        return null;
      }
      if (!Array.isArray(v)) return null;
      const strs = v.filter((x) => typeof x === 'string' && x.trim());
      return strs.length ? strs : null;
    };

    let arr = tryJson(text);
    if (!arr) {
      // 方案 2：从长文本里抠出 JSON 数组。
      // 不能用「第一个 [ 到最后一个 ]」—— 模型正文里若出现 "参考 [1] 说法"
      // 这类字样，lastIndexOf(']') 会抓到错误的收尾括号。
      // 这里做带字符串感知的括号配平扫描，再对每个候选区间尝试解析。
      for (const c of findBalancedArrays(text)) {
        const r = tryJson(c);
        if (r) {
          arr = r;
          break;
        }
      }
    }
    if (!arr) {
      // 方案 3：多个 ```json 块，取能解析的那个数组
      const blocks = text.match(/```(?:json)?\s*([\s\S]*?)```/g) || [];
      for (const b of blocks) {
        const inner = b.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
        const a = tryJson(inner);
        if (a) {
          arr = a;
          break;
        }
      }
    }
    if (arr) {
      for (const it of arr) {
        if (typeof it === 'string' && it.trim()) out.push(it.trim());
      }
    }

    if (!out.length) {
      // 方案 4：按换行 / 编号列表切分
      let chunks = text
        .split(/\n{1,}/)
        .map((s) => s.replace(/^\s*(?:[-*•]|\d+[.、)）])\s*/, '').trim())
        .filter((s) => s.length > 1);
      if (chunks.length === 1) chunks = chunks[0].split(/(?<=[.!?。！？])\s+/);
      // 直接 push，避免对 const 重新赋值
      for (const s of chunks) if (s) out.push(s);
    }

    // 去重 + 去空
    const seen = new Set();
    const dedup = [];
    for (const s of out) {
      const k = s.replace(/\s+/g, '').slice(0, 40);
      if (!k || seen.has(k)) continue;
      seen.add(k);
      dedup.push(s);
    }
    return n > 0 ? dedup.slice(0, n) : dedup;
  };

  U.isSkipReply = (text) => /^\s*skip\s*$/i.test(String(text || ''));

  /** 流式预览只接受已经闭合的 JSON 字符串，不把半包交给普通文本兜底。 */
  U.parseCompleteReplyList = function parseCompleteReplyList(raw) {
    const text = String(raw || '');
    for (let start = 0; start < text.length; start++) {
      if (text[start] !== '[') continue;
      const values = [];
      let i = start + 1;
      let invalid = false;
      while (i < text.length) {
        while (/\s/.test(text[i] || '') && i < text.length) i++;
        if (i === text.length || text[i] === ']') break;
        if (text[i] !== '"') { invalid = true; break; }
        const begin = i++;
        let escaped = false;
        let end = -1;
        for (; i < text.length; i++) {
          if (escaped) escaped = false;
          else if (text[i] === '\\') escaped = true;
          else if (text[i] === '"') { end = i++; break; }
        }
        if (end < 0) break;
        let value;
        try { value = JSON.parse(text.slice(begin, end + 1)).trim(); }
        catch (e) { invalid = true; break; }
        if (value && !U.isSkipReply(value) && !values.includes(value)) values.push(value);
        while (/\s/.test(text[i] || '') && i < text.length) i++;
        if (i === text.length || text[i] === ']') break;
        if (text[i++] !== ',') { invalid = true; break; }
      }
      if (!invalid) return values;
    }
    return [];
  };

  /** URL 可带查询参数或不同域名；无链接时使用完整正文而非截断前缀。 */
  U.tweetKey = function tweetKey(tweet) {
    if (!tweet) return '';
    const status = String(tweet.url || '').match(/\/status\/(\d+)/);
    if (status) return 'status:' + status[1];
    return JSON.stringify([
      String(tweet.handle || tweet.author || '').toLowerCase(),
      U.cleanText(tweet.text),
      (tweet.images || []).map((url) => String(url).split('?')[0]),
    ]);
  };

  U.sameTweet = function sameTweet(a, b) {
    if (!a || !b) return false;
    if (a === b) return true;
    const aStatus = String(a.url || '').match(/\/status\/(\d+)/);
    const bStatus = String(b.url || '').match(/\/status\/(\d+)/);
    if (aStatus && bStatus) return aStatus[1] === bStatus[1];
    const aName = String(a.handle || a.author || '').toLowerCase();
    const bName = String(b.handle || b.author || '').toLowerCase();
    if (!aName || aName !== bName || U.cleanText(a.text) !== U.cleanText(b.text)) return false;
    if (U.cleanText(a.text)) return true;
    const aImages = (a.images || []).map((url) => String(url).split('?')[0]);
    const bImages = (b.images || []).map((url) => String(url).split('?')[0]);
    return aImages.length > 0 && JSON.stringify(aImages) === JSON.stringify(bImages);
  };

  /** 推断语言：返回 zh / en / ja / vi / ko / unknown。无变音的越南语不强行猜测。 */
  U.detectLang = function detectLang(text) {
    const s = String(text || '').normalize('NFC');
    if (!s.trim()) return 'unknown';
    const kana = (s.match(/[぀-ヿ]/g) || []).length;
    const hangul = (s.match(/[가-힯]/g) || []).length;
    const cjk = (s.match(/[一-鿿]/g) || []).length;
    const latin = (s.match(/[A-Za-z]/g) || []).length;
    // â/ê/ô/é 等也见于法语、西班牙语，不能据此判越南语。
    // 只使用越南语特征字母和带声调的扩展字母，兼容浏览器中的分解变音写法。
    const vietnamese = /[ăđơưạ-ỹ]/i.test(s);
    // 日韩假名优先：汉字里常混用少量假名
    if (kana > 2) return 'ja';
    if (hangul > 2) return 'ko';
    if (!cjk) return vietnamese ? 'vi' : latin > 0 ? 'en' : 'unknown';
    // 中英混排：中文语境里夹英文单词很常见，
    // 所以要求汉字数达到拉丁字母数的 1/2 才算中文主导（英文单词平均长于单汉字）
    if (cjk * 2 >= latin) return 'zh';
    return vietnamese ? 'vi' : 'en';
  };

  /** X 的富文本节点里混有零宽字符，取纯文本时清掉 */
  U.cleanText = function cleanText(s) {
    return String(s == null ? '' : s)
      .replace(/[‌‍⁠﻿]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  };

  U.escapeHtml = function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  };

  /** 秒 -> mm:ss */
  U.fmtDuration = function fmtDuration(sec) {
    sec = Math.max(0, Math.floor(sec || 0));
    const m = Math.floor(sec / 60);
    const r = sec % 60;
    return m + ':' + String(r).padStart(2, '0');
  };

  /** X 字符计数：中日韩全角算 2，其他算 1（粗略，贴近 X 的 280 规则） */
  U.weightedLength = function weightedLength(s) {
    const t = String(s || '');
    let w = 0;
    for (const ch of t) {
      const c = ch.codePointAt(0);
      if (
        (c >= 0x1100 && c <= 0x115f) ||
        (c >= 0x2e80 && c <= 0xa4cf) ||
        (c >= 0xac00 && c <= 0xd7a3) ||
        (c >= 0xf900 && c <= 0xfaff) ||
        (c >= 0xfe30 && c <= 0xfe6f) ||
        (c >= 0xff00 && c <= 0xff60) ||
        (c >= 0xffe0 && c <= 0xffe6)
      ) {
        w += 2;
      } else {
        w += 1;
      }
    }
    return w;
  };

  /** 简易提示条（toast），不打断操作 */
  let toastHost = null;
  let toastTimer = null;
  U.toast = function toast(msg, kind, ms) {
    try {
      if (!toastHost || !document.body.contains(toastHost)) {
        toastHost = document.createElement('div');
        toastHost.className = 'xai-toast-host';
        document.body.appendChild(toastHost);
      }
      const el = document.createElement('div');
      el.className = 'xai-toast xai-toast--' + (kind || 'info');
      el.textContent = msg;
      toastHost.appendChild(el);
      requestAnimationFrame(() => el.classList.add('is-in'));
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => {
        el.classList.remove('is-in');
        setTimeout(() => el.remove(), 240);
      }, ms || 2600);
    } catch (e) {
      /* noop */
    }
  };

  /** 生成唯一 id */
  U.uid = function uid() {
    return 'xai_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  };

  /** X 域名判定 */
  U.isXDomain = function isXDomain() {
    const h = location.hostname;
    return h === 'x.com' || h === 'twitter.com' || h.endsWith('.x.com');
  };
})(typeof window !== 'undefined' ? window : self);
