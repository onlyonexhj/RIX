/**
 * AI 回复候选面板。
 *
 * 交互：
 *  - 悬浮在发帖弹层下方的独立面板（不侵入 X 的 DOM 树结构，避免被 React 卸载）
 *  - 生成中：spinner + 实时计时 + 「中止」按钮（>30s 显示进度条）
 *  - 结果：多条候选，点击任一条即回填到输入框
 *  - 失败：按钮变「重试」且可再次点击，绝不变成死按钮
 */
(function (root) {
  'use strict';

  const XAI = (root.XAI = root.XAI || {});
  const U = XAI.utils;
  const D = XAI.detector;
  const E = XAI.editor;
  const P = (XAI.panel = {});

  let host = null; // 面板根节点（挂在 body 下）
  let state = {
    open: false,
    loading: false,
    failed: false,
    pending: false,
    results: [],
    resultsTweet: null,
    tweet: null,
    contextVersion: 0,
    request: null,
    taskId: null,
    timer: null,
    elapsed: 0,
    composer: null,
    pinned: false, // 用户是否手动拖过面板（拖过就不再自动定位）
    lastGenKey: null, // 最近一次自动生成对应的推文键（防同一条重复自动请求）
    lastGenTweet: null,
    // 流式
    port: null,
    streamText: '',
    streamFirstAt: 0,
    startedAt: 0,
  };
  let cfg = Object.assign({}, XAI.defaults);
  let els = {};
  let openRevision = 0;
  let configRevision = 0;
  let configSave = null;
  let pendingConfig = {};

  function saveConfig(patch) {
    Object.assign(cfg, patch);
    configRevision++;
    Object.assign(pendingConfig, patch);
    persistPendingConfig().catch((e) => U.toast('保存设置失败：' + String(e.message || e), 'err'));
  }

  function flushConfig() {
    if (configSave) return configSave;
    if (!Object.keys(pendingConfig).length) return Promise.resolve();
    const patch = pendingConfig;
    pendingConfig = {};
    const saving = Promise.resolve().then(() => XAI.setConfig(patch)).catch((error) => {
      // 保存失败时保留改动；随后排队的新值优先于失败批次中的旧值。
      pendingConfig = Object.assign({}, patch, pendingConfig);
      throw error;
    }).finally(() => {
      if (configSave === saving) configSave = null;
    });
    configSave = saving;
    return saving;
  }

  async function persistPendingConfig() {
    while (configSave || Object.keys(pendingConfig).length) await flushConfig();
  }

  async function waitForConfigSave() {
    try { await persistPendingConfig(); }
    catch (error) {
      // 每次打开或生成最多重试一次；持续故障交给可重试的 UI 报错。
      await persistPendingConfig();
    }
  }

  /* ------------------------------------------------------------------ *
   * 构建 DOM
   * ------------------------------------------------------------------ */

  const CSS = `
.xai-panel{position:fixed;z-index:2147483000;width:420px;max-width:calc(100vw - 32px);
  max-height:calc(100vh - 28px);
  background:#15202b;color:#e7e9ea;border:1px solid #38444d;border-radius:16px;
  box-shadow:0 12px 40px rgba(0,0,0,.55);font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",sans-serif;
  display:none;flex-direction:column;overflow:hidden;animation:xaiIn .16s ease-out}
.xai-panel.is-open{display:flex}
@keyframes xaiIn{from{opacity:0;transform:translateY(6px) scale(.99)}to{opacity:1;transform:none}}
.xai-panel *{box-sizing:border-box}

/* ---- 拖拽 ---- */
.xai-hd{cursor:grab;user-select:none;-webkit-user-select:none}
.xai-panel.is-drag .xai-hd{cursor:grabbing}
.xai-panel.is-drag{transition:none;box-shadow:0 18px 50px rgba(0,0,0,.7)}
/* 拖拽时给个轻微抬升感 */
.xai-panel.is-drag .xai-hd__ico{transform:scale(1.06)}
.xai-hd__ico{transition:transform .12s}
.xai-hd__grab{font-size:11px;color:#5b7688;letter-spacing:-1px;flex:none}

/* 双击手柄复位 */
.xai-hd__reset{background:none;border:0;color:#71767b;cursor:pointer;font-size:11px;
  padding:3px 6px;border-radius:6px;flex:none;opacity:0;transition:.13s}
.xai-hd:hover .xai-hd__reset{opacity:1}
.xai-hd__reset:hover{background:#1e2b36;color:#1d9bf0}

.xai-hd{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid #2f3b47;flex:none}
.xai-hd__ico{width:22px;height:22px;border-radius:6px;background:linear-gradient(135deg,#1d9bf0,#7856ff);
  display:flex;align-items:center;justify-content:center;font-size:13px;flex:none}
.xai-hd__t{font-weight:700;font-size:14px;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.xai-hd__x{background:none;border:0;color:#8899a6;cursor:pointer;font-size:17px;line-height:1;padding:4px 6px;border-radius:6px;flex:none}
.xai-hd__x:hover{background:#1e2b36;color:#e7e9ea}

.xai-src{padding:9px 12px;background:#0f1620;border-bottom:1px solid #2f3b47;flex:none;
  max-height:88px;overflow:hidden;position:relative}
.xai-src__m{font-size:11px;color:#71767b;margin-bottom:3px;font-weight:600;letter-spacing:.02em}
.xai-src__t{font-size:12.5px;color:#b7c3cc;line-height:1.45;
  display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}

.xai-ctl{padding:10px 12px;display:flex;flex-wrap:wrap;gap:8px;align-items:center;border-bottom:1px solid #2f3b47;flex:none}
.xai-grp{display:flex;background:#0f1620;border:1px solid #2f3b47;border-radius:8px;overflow:hidden;flex:none}
.xai-grp__lb{font-size:11px;color:#71767b;padding:0 7px;display:flex;align-items:center;border-right:1px solid #2f3b47;flex:none}
.xai-grp__b{background:none;border:0;color:#8b98a5;padding:5px 9px;cursor:pointer;font-size:12px;
  border-right:1px solid #1c2732;transition:.12s;white-space:nowrap}
.xai-grp__b:last-child{border-right:0}
.xai-grp__b:hover{background:#1c2732;color:#e7e9ea}
.xai-grp__b.is-on{background:#1d9bf0;color:#fff;font-weight:600}
.xai-sel{background:#0f1620;border:1px solid #2f3b47;color:#e7e9ea;border-radius:8px;
  padding:5px 7px;font-size:12px;outline:none;cursor:pointer;flex:none}
.xai-sel:focus{border-color:#1d9bf0}

.xai-act{padding:10px 12px;display:flex;gap:8px;align-items:center;flex:none}
.xai-auto{display:flex;align-items:center;gap:5px;font-size:12px;color:#8b98a5;
  cursor:pointer;flex:none;user-select:none;-webkit-user-select:none}
.xai-auto:hover{color:#e7e9ea}
.xai-auto__cb{accent-color:#1d9bf0;cursor:pointer;margin:0;flex:none}
.xai-btn{flex:1;padding:9px 12px;border-radius:999px;border:0;cursor:pointer;font-size:13.5px;font-weight:700;
  display:flex;align-items:center;justify-content:center;gap:7px;transition:.14s;white-space:nowrap}
.xai-btn--go{background:#1d9bf0;color:#fff}
.xai-btn--go:hover:not(:disabled){background:#1a8cd8}
.xai-btn--go:disabled{background:#1e3a4d;color:#5b7688;cursor:not-allowed}
.xai-btn--stop{background:#42181a;color:#f4212e;flex:none;padding:9px 14px}
.xai-btn--stop:hover{background:#571d20}
.xai-btn--mini{flex:none;background:#22303c;color:#b7c3cc;padding:8px 12px;font-size:12.5px}
.xai-btn--mini:hover{background:#2c3d4b;color:#fff}

.xai-bar{height:3px;background:#22303c;flex:none;overflow:hidden}
.xai-bar__i{height:100%;width:0;background:linear-gradient(90deg,#1d9bf0,#7856ff);transition:width .3s}

.xai-st{padding:6px 12px;font-size:11.5px;color:#71767b;display:flex;align-items:center;gap:7px;flex:none;min-height:28px}
.xai-st--err{color:#f4212e}
.xai-spin{width:11px;height:11px;border:2px solid #38444d;border-top-color:#1d9bf0;border-radius:50%;
  animation:xaiSpin .7s linear infinite;flex:none}
@keyframes xaiSpin{to{transform:rotate(360deg)}}

.xai-list{padding:4px 8px 10px;overflow-y:auto;flex:1;min-height:60px}
.xai-it{position:relative;border:1px solid #2f3b47;border-radius:12px;padding:10px 12px;margin:6px 4px;
  cursor:pointer;transition:.13s;background:#0f1620}
.xai-it:hover{border-color:#1d9bf0;background:#16212c;transform:translateY(-1px)}
.xai-it:active{transform:translateY(0)}
.xai-it__x{font-size:13.5px;line-height:1.55;white-space:pre-wrap;word-break:break-word;color:#e7e9ea}
.xai-it__f{display:flex;align-items:center;gap:8px;margin-top:8px}
.xai-chip{font-size:10.5px;color:#71767b;background:#0b1219;border:1px solid #2f3b47;
  border-radius:5px;padding:2px 6px}
.xai-chip--warn{color:#ffd166;border-color:#5c4a1a;background:#241d0c}
.xai-it__u{margin-left:auto;font-size:11px;color:#1d9bf0;opacity:0;transition:.13s;font-weight:600}
.xai-it:hover .xai-it__u{opacity:1}
.xai-it__cp{background:none;border:0;color:#71767b;cursor:pointer;font-size:11px;padding:2px 5px;border-radius:5px}
.xai-it__cp:hover{background:#22303c;color:#e7e9ea}
.xai-it--used{border-color:#00ba7c;background:#0d2119}
.xai-it--used .xai-it__u{opacity:1;color:#00ba7c}

/* 流式中"还有更多"的占位 */
.xai-it--pending{border-style:dashed;opacity:.6;cursor:default;pointer-events:none;
  background:transparent;padding:8px 12px}
.xai-it--pending:hover{border-color:#2f3b47;transform:none}
.xai-dots{display:inline-block;font-size:15px;letter-spacing:3px;color:#1d9bf0}
.xai-dots::after{content:'●';animation:xaiDot 1.2s infinite ease-in-out}
@keyframes xaiDot{0%,80%,100%{opacity:.2}40%{opacity:1}}

.xai-empty{padding:26px 16px;text-align:center;color:#71767b;font-size:12.5px}
.xai-empty__ico{font-size:26px;margin-bottom:8px;opacity:.5}

.xai-toast-host{position:fixed;left:50%;transform:translateX(-50%);bottom:26px;z-index:2147483100;
  display:flex;flex-direction:column;gap:7px;align-items:center;pointer-events:none;font-family:system-ui,sans-serif}
.xai-toast{background:#15202b;color:#e7e9ea;border:1px solid #38444d;border-radius:9px;
  padding:9px 15px;font-size:13px;box-shadow:0 6px 22px rgba(0,0,0,.45);opacity:0;transform:translateY(9px);
  transition:.22s;max-width:400px}
.xai-toast.is-in{opacity:1;transform:none}
.xai-toast--ok{border-color:#00ba7c;color:#00e39b}
.xai-toast--err{border-color:#f4212e;color:#ff7a85}
`;

  function build() {
    if (host) return;

    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    host = document.createElement('div');
    host.className = 'xai-panel';
    host.innerHTML = `
      <div class="xai-hd" title="按住拖动可移动面板，双击此处复位">
        <div class="xai-hd__ico">✦</div>
        <div class="xai-hd__t">AI 回复助手</div>
        <button class="xai-hd__reset" title="复位到默认位置">复位</button>
        <div class="xai-hd__grab">⠿</div>
        <button class="xai-hd__x" title="关闭">✕</button>
      </div>

      <div class="xai-src" style="display:none">
        <div class="xai-src__m">回复对象</div>
        <div class="xai-src__t"></div>
      </div>

      <div class="xai-ctl">
        <div class="xai-grp" data-k="style">
          <div class="xai-grp__lb">风格</div>
          <div class="xai-grp__bs"></div>
        </div>
        <div class="xai-grp" data-k="count">
          <div class="xai-grp__lb">条数</div>
          <div class="xai-grp__bs"></div>
        </div>
        <select class="xai-sel" data-k="lang" title="输出语言">
          ${XAI.langs.map((l) => `<option value="${l.id}">${l.label}</option>`).join('')}
        </select>
      </div>

      <div class="xai-act">
        <label class="xai-auto" title="勾选：打开面板即自动生成回复；不勾选：手动点「生成回复」">
          <input type="checkbox" class="xai-auto__cb" />自动生成
        </label>
        <button class="xai-btn xai-btn--go">✦ 生成回复</button>
        <button class="xai-btn xai-btn--stop" style="display:none">中止</button>
      </div>

      <div class="xai-bar" style="display:none"><div class="xai-bar__i"></div></div>
      <div class="xai-st"></div>
      <div class="xai-list"></div>
    `;
    document.body.appendChild(host);

    els = {
      panel: host,
      src: host.querySelector('.xai-src'),
      srcText: host.querySelector('.xai-src__t'),
      styleWrap: host.querySelector('[data-k="style"] .xai-grp__bs'),
      countWrap: host.querySelector('[data-k="count"] .xai-grp__bs'),
      lang: host.querySelector('[data-k="lang"]'),
      go: host.querySelector('.xai-btn--go'),
      autoCb: host.querySelector('.xai-auto__cb'),
      stop: host.querySelector('.xai-btn--stop'),
      bar: host.querySelector('.xai-bar'),
      barIn: host.querySelector('.xai-bar__i'),
      st: host.querySelector('.xai-st'),
      list: host.querySelector('.xai-list'),
      close: host.querySelector('.xai-hd__x'),
      head: host.querySelector('.xai-hd'),
      reset: host.querySelector('.xai-hd__reset'),
    };

    // 风格按钮
    els.styleWrap.innerHTML = XAI.styles
      .map((s) => `<button class="xai-grp__b" data-v="${s.id}" title="${U.escapeHtml(s.desc)}">${s.label}</button>`)
      .join('');
    // 条数按钮
    els.countWrap.innerHTML = [1, 2, 3, 4, 5]
      .map((n) => `<button class="xai-grp__b" data-v="${n}">${n}</button>`)
      .join('');

    bind();
  }

  function bind() {
    els.close.addEventListener('click', () => P.close());
    els.reset.addEventListener('click', () => P.resetPosition());

    els.styleWrap.addEventListener('click', (e) => {
      const b = e.target.closest('.xai-grp__b');
      if (!b) return;
      markOn(els.styleWrap, b);
      saveConfig({ style: b.dataset.v });
    });

    els.countWrap.addEventListener('click', (e) => {
      const b = e.target.closest('.xai-grp__b');
      if (!b) return;
      markOn(els.countWrap, b);
      saveConfig({ count: Number(b.dataset.v) });
    });

    els.lang.addEventListener('change', () => saveConfig({ lang: els.lang.value }));

    // 「自动生成」复选框：与设置页「交互行为」里的开关是同一个配置项
    els.autoCb.addEventListener('change', () => {
      saveConfig({ autoGenerate: els.autoCb.checked });
    });

    els.go.addEventListener('click', () => {
      if (state.loading) P.cancel();
      else P.generate();
    });
    els.stop.addEventListener('click', () => P.cancel());

    bindDrag();

    els.list.addEventListener('click', (e) => {
      const cp = e.target.closest('.xai-it__cp');
      if (cp) {
        e.stopPropagation();
        navigator.clipboard.writeText(cp.dataset.txt).then(
          () => U.toast('已复制', 'ok'),
          () => U.toast('复制失败', 'err')
        );
        return;
      }
      const it = e.target.closest('.xai-it');
      if (it) P.use(Number(it.dataset.i));
    });

    // 键盘：Esc 关闭，Ctrl/Cmd+Enter 生成
    document.addEventListener('keydown', (e) => {
      if (!state.open) return;
      if (e.key === 'Escape') {
        e.stopPropagation();
        P.close();
      } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        if (!state.loading) P.generate();
      }
    }, true);

    window.addEventListener('resize', () => {
      if (state.open) schedulePosition();
    });
  }

  function markOn(wrap, btn) {
    wrap.querySelectorAll('.xai-grp__b').forEach((b) => b.classList.remove('is-on'));
    if (btn) btn.classList.add('is-on');
  }

  /* ------------------------------------------------------------------ *
   * 拖拽移动
   * ------------------------------------------------------------------ */

  /**
   * 面板拖拽。用 pointer 事件统一处理鼠标/触控。
   *
   * 关键：拖拽开始时必须先同步读取当前实际位置再记录偏移，
   * 否则 rAF 里的自动定位可能已把面板移走，导致「一按下就跳」。
   */
  function bindDrag() {
    const hd = els.head;
    if (!hd) return;

    let dragging = false;
    let startX = 0;
    let startY = 0;
    let startL = 0;
    let startT = 0;
    let moved = false;

    const onDown = (e) => {
      // 点在按钮上就不拖
      if (e.target.closest('button')) return;
      if (e.button !== undefined && e.button !== 0) return;

      dragging = true;
      moved = false;
      // 同步取真实位置，避免与自动定位竞争
      const r = host.getBoundingClientRect();
      startX = e.clientX;
      startY = e.clientY;
      startL = r.left;
      startT = r.top;

      hd.setPointerCapture && e.pointerId != null && hd.setPointerCapture(e.pointerId);
      e.preventDefault();
    };

    const onMove = (e) => {
      if (!dragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      // 阈值：避免把"点击标题栏"误判为拖拽
      if (!moved && Math.abs(dx) + Math.abs(dy) < 3) return;
      if (!moved) {
        moved = true;
        host.classList.add('is-drag');
      }

      // 夹在视口内，保证标题栏不会被拖出屏幕
      const w = host.offsetWidth;
      const h = host.offsetHeight;
      const GAP = 4;
      const left = Math.max(GAP - Math.min(w, 80), Math.min(window.innerWidth - w - GAP, startL + dx));
      const top = Math.max(0, Math.min(window.innerHeight - 40, startT + dy));

      host.style.left = Math.round(left) + 'px';
      host.style.top = Math.round(top) + 'px';
    };

    const onUp = (e) => {
      if (!dragging) return;
      dragging = false;
      host.classList.remove('is-drag');
      try {
        hd.releasePointerCapture && e.pointerId != null && hd.releasePointerCapture(e.pointerId);
      } catch (err) {
        /* noop */
      }
      if (moved) {
        // 拖过了 -> 锁定位置，不再被自动定位覆盖
        state.pinned = true;
      }
    };

    hd.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);

    // 双击标题栏复位
    hd.addEventListener('dblclick', (e) => {
      if (e.target.closest('button')) return;
      P.resetPosition();
    });
  }

  /** 复位到自动定位（取消锁定） */
  P.resetPosition = function resetPosition() {
    state.pinned = false;
    position();
    U.toast('已复位到默认位置');
  };

  /* ------------------------------------------------------------------ *
   * 打开 / 关闭 / 定位
   * ------------------------------------------------------------------ */

  P.open = async function open(composer, tweetHint) {
    build();
    const revision = ++openRevision;
    const loadedAt = configRevision;
    await waitForConfigSave();
    const loaded = await XAI.getConfig();
    if (revision !== openRevision) return false;
    if (loadedAt === configRevision) cfg = loaded;
    if (!cfg.enabled) { P.close(); return false; }

    // null 是明确的「待填入」模式，不能绑定首页内联框或另一个发帖框。
    let current = null;
    if (composer) {
      const fresh = D.findComposer();
      if (!fresh || !fresh.dialog || !fresh.isReply || fresh.dialog !== composer.dialog) return false;
      current = fresh;
    }
    const tweet = (current && D.extractTargetTweet(current)) || tweetHint || null;
    if (!tweet) return false;
    setTarget(tweet, current);

    markOn(els.styleWrap, els.styleWrap.querySelector(`[data-v="${cfg.style}"]`));
    markOn(els.countWrap, els.countWrap.querySelector(`[data-v="${cfg.count}"]`));
    els.lang.value = cfg.lang;
    els.autoCb.checked = cfg.autoGenerate !== false;

    refreshSrc();

    state.open = true;
    host.classList.add('is-open');
    schedulePosition();

    if (!state.results.length) renderEmpty();
    if (state.pending) setStatus('点这条推文的回复气泡，打开弹层后即可回填', 'warn');
    return true;
  };

  function setTarget(tweet, composer) {
    if (!U.sameTweet(state.tweet, tweet)) {
      cancelRequest();
      state.contextVersion++;
      state.results = [];
      state.resultsTweet = null;
      state.lastGenKey = null;
      state.lastGenTweet = null;
      state.failed = false;
      renderEmpty();
    }
    state.tweet = tweet;
    state.composer = composer;
    state.pending = !composer;
  }

  /** 渲染「回复对象」信息条 */
  function refreshSrc() {
    const t = state.tweet;
    if (!t) {
      els.src.style.display = 'none';
      return;
    }
    els.src.style.display = '';
    const head = [t.author, t.handle].filter(Boolean).join(' ');
    els.srcText.textContent = head + '\n' + (t.text || '（纯媒体推文）');
  }

  P.close = function close() {
    openRevision++;
    state.open = false;
    // 关闭后解除位置锁定：下次打开（新的发帖弹层）重新自动跟随
    state.pinned = false;
    // 清幂等键：下次再打开（哪怕同一条推文）允许重新自动生成
    state.lastGenKey = null;
    state.lastGenTweet = null;
    cancelRequest();
    state.contextVersion++;
    state.results = [];
    state.resultsTweet = null;
    state.tweet = null;
    state.composer = null;
    state.pending = false;
    if (host) host.classList.remove('is-open');
    if (host) stopTimer();
  };

  /**
   * 延后到浏览器完成布局后再定位。
   *
   * 坑：`display:flex` 刚加上时 offsetWidth 仍是 0，
   * 此刻定位会算出 NaN 或错误位置。必须等一帧让浏览器完成 reflow。
   */
  let posRaf = 0;
  function schedulePosition() {
    if (posRaf) cancelAnimationFrame(posRaf);
    posRaf = requestAnimationFrame(() => {
      posRaf = 0;
      position();
      // 若首帧尺寸仍未就绪（内容多时），再等一帧
      if (!host.offsetWidth) {
        requestAnimationFrame(() => position());
      }
    });
  }

  /**
   * 面板定位：优先贴在弹层**左侧**空白处，绝不遮挡弹层本身
   * （用户需要随时看到自己填入的内容和发帖按钮）。
   * 左侧放不下时，退到弹层右侧；再不行才退到页面右侧。
   */
  let ro = null; // 监听弹层尺寸变化
  let roTarget = null;

  function observeComposer(node) {
    if (roTarget === node) return;
    roTarget = node;
    try {
      if (ro) ro.disconnect();
      if (node && window.ResizeObserver) {
        ro = new ResizeObserver(() => {
          if (state.open) schedulePosition();
        });
        ro.observe(node);
      }
    } catch (e) {
      /* noop */
    }
  }

  function position() {
    const c = state.composer;
    if (!host || !state.open) return;

    // 用户拖过面板 -> 尊重手动位置，不再自动跟随。
    // 但窗口尺寸变化后要修正，避免面板跑到屏幕外。
    if (state.pinned) {
      const w = host.offsetWidth;
      const h = host.offsetHeight;
      const l = parseFloat(host.style.left) || 0;
      const t = parseFloat(host.style.top) || 0;
      host.style.left = Math.round(Math.max(4, Math.min(window.innerWidth - w - 4, l))) + 'px';
      host.style.top = Math.round(Math.max(0, Math.min(window.innerHeight - 40, t))) + 'px';
      return;
    }

    observeComposer(c && (c.dialog || c.editor));

    const W = host.offsetWidth || 420;
    const H = host.offsetHeight || 420;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const GAP = 14;

    if (!c) {
      host.style.top = Math.max(10, Math.round((vh - H) / 2)) + 'px';
      host.style.left = Math.max(10, Math.round((vw - W) / 2)) + 'px';
      return;
    }

    const anchor = c.dialog || c.editor;
    const r = anchor.getBoundingClientRect();

    // 首选：弹层左侧
    const leftFit = r.left - W - GAP;
    if (leftFit >= GAP) {
      host.style.left = Math.round(leftFit) + 'px';
      host.style.top = Math.round(Math.max(GAP, Math.min(vh - H - GAP, r.top))) + 'px';
      return;
    }

    // 次选：弹层右侧
    const rightFit = r.right + GAP;
    if (rightFit + W <= vw - GAP) {
      host.style.left = Math.round(rightFit) + 'px';
      host.style.top = Math.round(Math.max(GAP, Math.min(vh - H - GAP, r.top))) + 'px';
      return;
    }

    // 兜底：页面右侧（贴近弹层但不压住）
    host.style.left = Math.round(Math.max(GAP, vw - W - GAP)) + 'px';
    host.style.top = Math.round(Math.max(GAP, Math.min(vh - H - GAP, r.top))) + 'px';
  }

  /* ------------------------------------------------------------------ *
   * 生成
   * ------------------------------------------------------------------ */

  P.generate = async function generate() {
    if (!state.open || state.loading || !state.tweet) return;
    const fresh = D.findComposer();
    if (!state.pending && !matchesComposer(fresh, state.tweet)) {
      U.toast('回复对象已变化，请重新打开这条推文的回复面板', 'err');
      return;
    }
    if (matchesComposer(fresh, state.tweet)) {
      state.composer = fresh;
      state.pending = false;
    }

    if (!state.tweet || (!state.tweet.text && !(state.tweet.media || []).length)) {
      U.toast('未能读取推文正文，无法生成', 'err');
      setStatus('未能读取推文正文，请先关闭弹层再点时间线的 ✦ 按钮', 'err');
      return;
    }

    const request = {
      id: U.uid(),
      context: state.contextVersion,
      tweet: state.tweet,
      port: null,
      finishStream: null,
      cancelled: false,
    };
    state.request = request;
    state.taskId = request.id;
    state.failed = false;
    state.results = [];
    state.resultsTweet = state.tweet;
    renderEmpty();
    setLoading(true);
    startTimer();
    state.streamText = '';
    state.port = null;
    try {
      // 用户刚修改的选项必须先保存，后台才能读到同一份配置。
      await waitForConfigSave();
      if (!isCurrentRequest(request)) return;
      state.lastGenKey = tweetKey(state.tweet);
      state.lastGenTweet = state.tweet;
      const payload = {
        taskId: request.id,
        tweet: request.tweet,
        extra: {
          style: cfg.style,
          count: cfg.count,
          lang: cfg.lang,
          length: cfg.length,
          customInstruction: '',
        },
      };
      if (cfg.stream) {
        await runStream(payload, request);
        return;
      }
      const res = await chrome.runtime.sendMessage({ type: 'xai:generate', payload });
      if (!isCurrentRequest(request)) return;
      if (!res || !res.ok) throw new Error((res && res.error) || '未知错误');
      onDone(res.data, request);
    } catch (e) {
      if (isCurrentRequest(request)) onFail(String((e && e.message) || e), request);
    }
  };

  function matchesComposer(composer, tweet) {
    if (!composer || !composer.dialog || !composer.isReply) return false;
    const extracted = D.extractTargetTweet(composer);
    if (extracted) return U.sameTweet(extracted, tweet);
    // 无法读取正文时，只信任 P.open 用一次性点击兜底绑定过的那个弹层。
    return !!(state.composer && state.composer.dialog === composer.dialog && U.sameTweet(state.tweet, tweet));
  }

  function isCurrentRequest(request) {
    return state.open && state.request === request && !request.cancelled &&
      request.context === state.contextVersion && U.sameTweet(request.tweet, state.tweet);
  }

  function cancelRequest() {
    const request = state.request;
    state.request = null;
    state.taskId = null;
    if (request) {
      request.cancelled = true;
      if (request.finishStream) request.finishStream();
      cleanupPort(request);
      Promise.resolve(chrome.runtime.sendMessage({
        type: 'xai:cancel', payload: { taskId: request.id },
      })).catch(() => {});
    }
    if (host) {
      setLoading(false);
      stopTimer();
    }
  }

  /** 流式生成：Port 长连接，边收边渲染 */
  function runStream(payload, request) {
    return new Promise((resolve, reject) => {
      let port;
      try {
        port = chrome.runtime.connect({ name: 'xai:generate' });
      } catch (e) {
        reject(e);
        return;
      }
      request.port = port;
      state.port = port;
      state.streamFirstAt = 0;
      let settled = false;
      const finish = (error) => {
        if (settled) return;
        settled = true;
        request.finishStream = null;
        if (port.onMessage.removeListener) port.onMessage.removeListener(onMessage);
        if (port.onDisconnect.removeListener) port.onDisconnect.removeListener(onDisconnect);
        cleanupPort(request);
        if (error) reject(error);
        else resolve();
      };
      request.finishStream = finish;

      const onMessage = (msg) => {
        if (!isCurrentRequest(request) || !msg || !msg.type) return;

        if (msg.type === 'delta') {
          state.streamText = msg.text;
          if (!state.streamFirstAt) state.streamFirstAt = Date.now();

          // 边流边解析：模型逐条吐完时，能提前显示已完成的几条
          const partial = U.parseCompleteReplyList(state.streamText).slice(0, cfg.count);
          if (JSON.stringify(partial) !== JSON.stringify(state.results)) {
            state.results = partial;
            state.resultsTweet = request.tweet;
            renderList(true);
          }
        } else if (msg.type === 'thinking') {
          setStatus('模型思考中… ' + U.fmtDuration(state.elapsed), 'busy');
        } else if (msg.type === 'done') {
          onDone(msg, request);
          finish();
        } else if (msg.type === 'error') {
          finish(new Error(msg.error));
        }
      };

      const onDisconnect = () => finish(new Error('生成连接已断开'));
      port.onMessage.addListener(onMessage);
      port.onDisconnect.addListener(onDisconnect);

      try { port.postMessage({ type: 'generate', payload }); }
      catch (e) { finish(e); }
    });
  }

  function cleanupPort(request) {
    const port = request && request.port;
    if (port) {
      request.port = null;
      if (state.port === port) state.port = null;
      try {
        port.disconnect();
      } catch (e) {
        /* noop */
      }
    }
  }

  /** 生成成功 */
  function onDone(data, request) {
    if (!isCurrentRequest(request)) return;
    const list = (data.list || []).filter((text) => typeof text === 'string' && text.trim() && !U.isSkipReply(text));
    if (!list.length) {
      onFail('未能生成可用回复，请换个风格重试', request);
      return;
    }
    state.request = null;
    state.taskId = null;
    state.results = list;
    state.resultsTweet = request.tweet;
    state.failed = false;
    renderList();
    const ttfb = state.streamFirstAt ? (state.streamFirstAt - state.startedAt) / 1000 : 0;
    setStatus(
      `${list.length} 条 · ${(data.elapsedMs / 1000).toFixed(1)}s` +
        (ttfb ? `（首字 ${ttfb.toFixed(1)}s）` : '') +
        ` · ${data.model}`,
      'ok'
    );
    setLoading(false);
    stopTimer();
    schedulePosition();
    if (cfg.autoInsertFirst && state.results.length) P.use(0);
  }

  /** 生成失败 —— 按钮必须变「重试」且保持可点，绝不能变成死按钮 */
  function onFail(msg, request) {
    if (request && !isCurrentRequest(request)) return;
    state.request = null;
    state.taskId = null;
    state.failed = true;
    setLoading(false);
    stopTimer();
    setStatus(msg, 'err');
    if (!state.results.length) renderEmpty(msg);
    U.toast(msg, 'err', 5000);
    schedulePosition();
  }

  /** 生成请求的幂等键：同一条推文不重复自动生成 */
  function tweetKey(t) {
    return U.tweetKey(t);
  }

  /**
   * 自动生成入口（main.js 在面板打开后调用）。
   * 规则：正在生成就不打断；同一条推文已自动生成过就不再重复
   * （悬浮按钮先生成 -> 用户再点回复气泡打开弹层，不会发起第二次请求）。
   */
  P.autoGenerate = function autoGenerate() {
    if (cfg.autoGenerate === false) return; // 设置页「交互行为」可关
    if (state.loading) return;
    if (!state.tweet) return;
    const key = tweetKey(state.tweet);
    if (key && (key === state.lastGenKey || U.sameTweet(state.tweet, state.lastGenTweet))) return;
    P.generate();
  };

  P.cancel = function cancel() {
    if (!state.loading) return;
    cancelRequest();
    state.lastGenKey = null;
    state.lastGenTweet = null;
    setStatus('已中止', 'warn');
    schedulePosition();
  };

  /* ------------------------------------------------------------------ *
   * 计时器 + 进度条
   * ------------------------------------------------------------------ */

  function startTimer() {
    stopTimer();
    state.elapsed = 0;
    state.startedAt = Date.now();
    const t0 = Date.now();

    state.timer = setInterval(() => {
      state.elapsed = (Date.now() - t0) / 1000;
      if (state.loading) {
        // 已经在流式输出正文时，不再用"生成中…"覆盖更具体的状态
        if (!state.streamText) {
          setStatus(`生成中… ${U.fmtDuration(state.elapsed)}`, 'busy');
        }
      }
      // >30s 显示进度条（用对数曲线，永不假装能到 100%）
      if (state.elapsed > 30 && els.bar.style.display !== 'flex') {
        els.bar.style.display = 'block';
      }
      if (els.bar.style.display === 'block') {
        const pct = Math.min(92, (Math.log(1 + state.elapsed) / Math.log(1 + 120)) * 100);
        els.barIn.style.width = pct.toFixed(1) + '%';
      }
    }, 200);
  }

  function stopTimer() {
    if (state.timer) {
      clearInterval(state.timer);
      state.timer = null;
    }
    els.bar.style.display = 'none';
    els.barIn.style.width = '0';
  }

  function setLoading(on) {
    state.loading = on;
    els.go.disabled = on;
    els.stop.style.display = on ? 'flex' : 'none';
    if (on) {
      els.go.innerHTML = '<span class="xai-spin"></span> 生成中';
    } else {
      // 失败后保留「重试」文案，且按钮恢复可点
      els.go.innerHTML = state.failed ? '↻ 重试' : '✦ 生成回复';
      els.go.disabled = false;
    }
  }

  function setStatus(text, kind) {
    els.st.textContent = text;
    els.st.className = 'xai-st' + (kind === 'err' ? ' xai-st--err' : '');
  }

  /* ------------------------------------------------------------------ *
   * 渲染
   * ------------------------------------------------------------------ */

  function renderEmpty(msg) {
    els.list.innerHTML = `
      <div class="xai-empty">
        <div class="xai-empty__ico">✦</div>
        ${msg ? U.escapeHtml(msg) : '选择风格后点「生成回复」<br>结果会出现在这里，点击任一条即可回填'}
      </div>`;
  }

  /**
   * 渲染候选列表。
   * @param streaming true = 还在流式接收中（保留滚动位置，不打断用户阅读）
   */
  function renderList(streaming) {
    if (!state.results.length) return renderEmpty();

    // 流式中保留滚动位置；非流式（新结果）回到顶部
    const keepScroll = streaming ? els.list.scrollTop : 0;

    els.list.innerHTML = state.results
      .map((t, i) => {
        const w = U.weightedLength(t);
        const over = w > 280;
        return `
      <div class="xai-it" data-i="${i}">
        <div class="xai-it__x">${U.escapeHtml(t)}</div>
        <div class="xai-it__f">
          <span class="xai-chip${over ? ' xai-chip--warn' : ''}">${w}/280${over ? ' 超长' : ''}</span>
          <button class="xai-it__cp" data-txt="${U.escapeHtml(t)}">复制</button>
          <span class="xai-it__u">填入 →</span>
        </div>
      </div>`;
      })
      .join('');

    if (streaming && state.loading && state.results.length < cfg.count) {
      // 还没收完，给个"正在来"的提示
      els.list.insertAdjacentHTML(
        'beforeend',
        `<div class="xai-it xai-it--pending"><div class="xai-it__x">${'<span class="xai-dots"></span>'}</div></div>`
      );
    }

    els.list.scrollTop = keepScroll;
  }

  /** 流式中只更新第一条的文本与字数（避免整表重绘） */
  function updateFirstItem(text) {
    if (!text) return;
    const node = els.list.querySelector('.xai-it[data-i="0"]');
    if (!node) return renderList(true);
    const xEl = node.querySelector('.xai-it__x');
    const cEl = node.querySelector('.xai-chip');
    if (xEl) xEl.textContent = text;
    if (cEl) {
      const w = U.weightedLength(text);
      cEl.textContent = `${w}/280${w > 280 ? ' 超长' : ''}`;
      cEl.className = 'xai-chip' + (w > 280 ? ' xai-chip--warn' : '');
    }
    const cp = node.querySelector('.xai-it__cp');
    if (cp) cp.dataset.txt = text;
  }

  /* ------------------------------------------------------------------ *
   * 回填
   * ------------------------------------------------------------------ */

  P.use = async function use(i) {
    const text = state.results[i];
    if (!state.open || !text || !U.sameTweet(state.resultsTweet, state.tweet)) return false;

    const c = D.findComposer();
    if (!matchesComposer(c, state.resultsTweet)) {
      U.toast('请先打开这条推文的回复弹层，确认回复对象后再填入', 'err', 4200);
      setStatus('回复对象尚未匹配，未填入', 'warn');
      return false;
    }

    const context = state.contextVersion;
    if (!(await E.setText(c.editor, text))) {
      U.toast('未能填入输入框，请重试', 'err');
      return false;
    }
    if (!state.open || context !== state.contextVersion) return false;
    state.composer = c;
    state.pending = false;

    // 高亮已使用项
    els.list.querySelectorAll('.xai-it').forEach((n) => n.classList.remove('xai-it--used'));
    const node = els.list.querySelector(`.xai-it[data-i="${i}"]`);
    if (node) {
      node.classList.add('xai-it--used');
      node.scrollIntoView({ block: 'nearest' });
    }

    const ctr = E.getCounter(c.dialog);
    U.toast('已填入输入框' + (ctr ? '（字数 ' + ctr + '）' : ''), 'ok');
    // 不关闭面板，方便连续挑选
    return true;
  };

  P.isOpen = () => state.open;

  /**
   * 测试钩子：直接注入候选结果并渲染，跳过真实 AI 调用。
   * 仅供 tools/preview.py 与自动化测试使用，正常流程不会走到。
   */
  P._debugSetResults = async function _debugSetResults(list, meta) {
    if (!state.open) {
      const composer = D.findComposer();
      if (!(await P.open(composer))) return false;
    }
    cancelRequest();
    state.results = (list || []).filter((text) => typeof text === 'string' && !U.isSkipReply(text));
    state.resultsTweet = state.tweet;
    state.failed = false;
    renderList();
    setStatus(
      (meta && meta.status) ||
        `${state.results.length} 条 · ${((meta && meta.elapsedMs) || 2100) / 1000}s · glm-4.6`,
      'ok'
    );
    setLoading(false);
    stopTimer();
    schedulePosition();
  };

  /** 设置"待填入"的推文（用户点悬浮按钮时还没有发帖弹层） */
  P.setPendingTweet = function setPendingTweet(tweet) {
    if (!tweet || !state.open) return;
    setTarget(tweet, null);
    if (!host) return;
    els.src.style.display = '';
    const head = [tweet.author, tweet.handle].filter(Boolean).join(' ');
    els.srcText.textContent = head + '\n' + (tweet.text || '（纯媒体推文）');
    setStatus('点时间线的回复气泡打开弹层后，点结果即可回填', 'warn');
  };

  /** 弹层出现时（main.js 调用），若处于待填入模式则保留结果 */
  P.onComposerReady = function onComposerReady(composer) {
    if (!state.pending || !matchesComposer(composer, state.tweet)) return;
    state.composer = composer;
    state.pending = false;
  };
})(typeof window !== 'undefined' ? window : self);
