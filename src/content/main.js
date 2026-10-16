/**
 * 入口：事件绑定与生命周期管理。
 *
 * 监听目标：
 *  1. 弹层打开时自动弹出 AI 面板（核心）
 *  2. 时间线 hover 时显示「✦ AI 回复」快捷按钮
 *  3. X 是 SPA，弹层节点会被 React 反复重建 —— 用轮询 + 节点身份比对来感知
 */
(function (root) {
  'use strict';

  const XAI = (root.XAI = root.XAI || {});
  const U = XAI.utils;
  const D = XAI.detector;
  const P = XAI.panel;

  if (!U.isXDomain()) return;
  if (window.__xaiInited) return; // 防重复注入
  window.__xaiInited = true;

  let cfg = XAI.defaults;
  let lastComposer = null; // 记录上一次的弹层节点，识别「新开/重开」
  let lastTweet = null; // 点击回复气泡时缓存的推文（弹层内提取失败时的兜底）
  let hoverBtn = null;

  /* ------------------------------------------------------------------ *
   * 初始化
   * ------------------------------------------------------------------ */

  async function init() {
    cfg = await XAI.getConfig();
    if (cfg.debug) console.log('[XAI] init', cfg);

    // SPA 路由切换后配置可能变了
    chrome.storage.onChanged.addListener(async (changes, area) => {
      if (area === 'local' && changes[XAI.storageKey]) {
        cfg = changes[XAI.storageKey].newValue || XAI.defaults;
        applyEnabled();
      }
    });

    document.addEventListener('click', onClick, true);
    document.addEventListener('mouseover', onHover, true);
    document.addEventListener('mouseout', onHoverOut, true);

    applyEnabled();
    startWatcher();
  }

  function applyEnabled() {
    if (!cfg.enabled) {
      P.close();
      hideHoverBtn();
    }
  }

  /* ------------------------------------------------------------------ *
   * 弹层监听（核心）
   * ------------------------------------------------------------------ */

  function startWatcher() {
    // 用 400ms 轮询足够灵敏且开销极低；
    // MutationObserver 在 X 这种全量重渲染页面上会被淹没，得不偿失。
    setInterval(() => {
      if (!cfg.enabled) return;
      const composer = D.findComposer();

      if (!composer) {
        // 弹层关闭
        if (lastComposer) {
          lastComposer = null;
          if (P.isOpen()) P.close();
        }
        return;
      }

      // 弹层节点变了 → 认为是新开的一次发帖
      const node = composer.dialog || composer.editor;
      if (node !== lastComposer) {
        lastComposer = node;

        // 弹层刚挂上，React 可能还没渲染完推文内容，等一拍再提取
        setTimeout(() => {
          if (!cfg.enabled) return;
          const fresh = D.findComposer();
          if (!fresh) return;

          let tweet = D.extractTargetTweet(fresh);
          if (!tweet && lastTweet) {
            // 兜底：用点击回复按钮时抓到的那条
            tweet = lastTweet;
          }
          P.open(fresh);
        }, 260);
      }
    }, 400);
  }

  /* ------------------------------------------------------------------ *
   * 点击：缓存被回复推文 + 快捷键
   * ------------------------------------------------------------------ */

  function onClick(e) {
    if (!cfg.enabled) return;

    // 缓存点击「回复」时所在的时间线推文，作为兜底数据源
    if (D.isReplyButton(e.target)) {
      const art = D.findTweetArticle(e.target);
      const t = D.extractTweetFromArticle(art);
      if (t) lastTweet = t;
      return;
    }

    // 快捷键：Esc 关面板已在 panel.js 处理
  }

  /* ------------------------------------------------------------------ *
   * 时间线悬浮按钮
   * ------------------------------------------------------------------ */

  function onHover(e) {
    if (!cfg.enabled || !cfg.showFloatingButton) return;

    const art = D.findTweetArticle(e.target);
    if (!art) {
      if (hoverBtn && !hoverBtn.contains(e.relatedTarget)) hideHoverBtn();
      return;
    }
    // 已经在弹层内就不显示
    if (e.target.closest('div[role="dialog"]')) return hideHoverBtn();

    if (hoverBtn && hoverBtn.dataset.tid === tid(art)) {
      positionHoverBtn(art);
      return;
    }
    hideHoverBtn();
    showHoverBtn(art);
  }

  function onHoverOut(e) {
    if (!hoverBtn) return;
    if (e.relatedTarget && hoverBtn.contains(e.relatedTarget)) return;
    hideHoverBtn();
  }

  function tid(el) {
    if (!el.dataset.xaiTid) el.dataset.xaiTid = 't' + Math.random().toString(36).slice(2, 9);
    return el.dataset.xaiTid;
  }

  function showHoverBtn(art) {
    // 复用已有按钮节点，避免频繁创建
    if (!hoverBtn) {
      hoverBtn = document.createElement('button');
      hoverBtn.className = 'xai-float';
      hoverBtn.textContent = '✦ AI 回复';
      hoverBtn.title = 'AI 生成回复';
      hoverBtn.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const a = D.findTweetArticle(hoverBtn);
        const t = D.extractTweetFromArticle(a);
        if (t) lastTweet = t;
        // 点悬浮按钮 = 等价于点回复气泡：直接开面板
        openFor(t);
      });
      document.body.appendChild(hoverBtn);
    }
    hoverBtn.dataset.tid = tid(art);
    positionHoverBtn(art);
    hoverBtn.classList.add('is-on');
  }

  function positionHoverBtn(art) {
    if (!hoverBtn || !art) return;
    const r = art.getBoundingClientRect();
    const top = Math.max(8, Math.min(window.innerHeight - 34, r.top + 8));
    hoverBtn.style.top = Math.round(top) + 'px';
    hoverBtn.style.left = Math.round(Math.max(8, r.left + 8)) + 'px';
  }

  function hideHoverBtn() {
    if (hoverBtn) hoverBtn.classList.remove('is-on');
  }

  /** 没有弹层时（用户直接点悬浮按钮）：自己造一个"伪编辑器"上下文，生成后仍需用户点回复来填入 */
  async function openFor(tweet) {
    if (!tweet) {
      U.toast('未能读取这条推文的内容', 'err');
      return;
    }
    // 先尝试真实弹层（点回复后才有编辑器）
    const c = D.findComposer();
    if (c) return P.open(c);

    // 无弹层：仍打开面板，但标记为"待填入"模式，
    // 用户点回复气泡后会自动用上次的生成结果
    P.open(null);
    P.setPendingTweet(tweet);
    U.toast('已获取推文内容，点「生成回复」', 'ok');
  }

  /* ------------------------------------------------------------------ */

  init();
})(typeof window !== 'undefined' ? window : self);
