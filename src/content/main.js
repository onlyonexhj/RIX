/**
 * 入口：事件绑定与生命周期管理。
 *
 * 监听目标：
 *  1. 弹层打开时自动弹出 AI 面板（核心）
 *  2. X 是 SPA，弹层节点会被 React 反复重建 —— 用轮询 + 节点身份比对来感知
 */
(function (root) {
  'use strict';

  const XAI = (root.XAI = root.XAI || {});
  const U = XAI.utils;
  const D = XAI.detector;
  const P = XAI.panel;
  const T = (source, values) => XAI.i18n ? XAI.i18n.t(source, values) :
    source.replace(/\{(\w+)\}/g, (match, key) => values && values[key] !== undefined ? values[key] : match);

  if (!U.isXDomain()) return;
  if (window.__xaiInited) return; // 防重复注入
  window.__xaiInited = true;

  let cfg = XAI.defaults;
  let lastComposer = null; // 记录上一次的弹层节点，识别「新开/重开」
  let replyClick = null; // 一次性兜底，只供紧接着打开的回复弹层消费
  let pendingOpenTimer = 0;
  let watcherRevision = 0;

  /* ------------------------------------------------------------------ *
   * 初始化
   * ------------------------------------------------------------------ */

  async function init() {
    cfg = await XAI.getConfig();
    refreshLocale();
    if (cfg.debug) console.log('[XAI] init', cfg);

    // SPA 路由切换后配置可能变了
    chrome.storage.onChanged.addListener(async (changes, area) => {
      if (area === 'local' && changes[XAI.storageKey]) {
        cfg = changes[XAI.storageKey].newValue || XAI.defaults;
        Promise.resolve().then(refreshLocale);
        applyEnabled();
      }
    });

    document.addEventListener('click', onClick, true);

    applyEnabled();
    startWatcher();
  }

  function applyEnabled() {
    if (!cfg.enabled) {
      invalidatePendingOpen();
      lastComposer = null;
      replyClick = null;
      P.close();
    }
  }

  function refreshLocale() {
    if (XAI.i18n && !P.isOpen()) XAI.i18n.setLocale(cfg.uiLang || 'auto');
  }

  function invalidatePendingOpen() {
    watcherRevision++;
    if (pendingOpenTimer) clearTimeout(pendingOpenTimer);
    pendingOpenTimer = 0;
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

      // 只跟真实弹层（role=dialog）走：时间线顶部的内联编辑器不算。
      // 否则发完评论回到列表页，弹层关闭 -> 内联编辑器被当成「新弹层」，
      // 会误开面板并自动生成（2026-10-17 用户实测踩中）
      if (!composer || !composer.dialog || !composer.isReply) {
        if (lastComposer) {
          invalidatePendingOpen();
          lastComposer = null;
          replyClick = null;
          if (P.isOpen()) P.close();
        }
        if (composer && composer.dialog && !composer.isReply) {
          replyClick = null;
          if (P.isOpen()) P.close();
        }
        if (replyClick && Date.now() > replyClick.expiresAt) replyClick = null;
        return;
      }

      // 弹层节点变了 → 认为是新开的一次发帖
      const node = composer.dialog || composer.editor;
      if (node !== lastComposer) {
        invalidatePendingOpen();
        lastComposer = node;
        const revision = watcherRevision;
        const fallback = replyClick;

        // 弹层刚挂上，React 可能还没渲染完推文内容，等一拍再提取
        pendingOpenTimer = setTimeout(async () => {
          pendingOpenTimer = 0;
          if (!cfg.enabled || revision !== watcherRevision) return;
          const fresh = D.findComposer();
          if (!fresh || !fresh.isReply || fresh.dialog !== node) {
            if (replyClick === fallback) replyClick = null;
            return;
          }

          let tweet = D.extractTargetTweet(fresh);
          if (!tweet && fallback && fallback.expiresAt >= Date.now()) tweet = fallback.tweet;
          if (replyClick === fallback) replyClick = null;
          try {
            if (await P.open(fresh, tweet)) P.autoGenerate();
          } catch (e) {
            U.toast(T('打开回复面板失败：{error}', { error: String(e.message || e) }), 'err');
          }
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
      replyClick = t ? { tweet: t, expiresAt: Date.now() + 10000 } : null;
      return;
    }

    // 快捷键：Esc 关面板已在 panel.js 处理
  }

  /* ------------------------------------------------------------------ */

  init();
})(typeof window !== 'undefined' ? window : self);
