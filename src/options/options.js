/**
 * 设置页逻辑：绑定表单 ↔ 配置。
 * 所有改动自动保存（防抖），「保存」按钮只是显式落盘的兜底。
 */
(function () {
  'use strict';

  const XAI = window.XAI;
  const $ = (id) => document.getElementById(id);

  const FIELDS = [
    'enabled', 'provider', 'baseUrl', 'apiKey', 'model', 'maxTokens', 'timeoutSec',
    'disableThinking', 'vision', 'style', 'count', 'lang', 'length', 'customInstruction',
    'showFloatingButton', 'autoGenerate', 'autoInsertFirst', 'debug',
    // 提示词配置
    'promptFormat', 'persona', 'systemPrompt', 'userPrompt',
    // 网络 / 代理
    'stream', 'proxyMode', 'proxyHost', 'proxyPort', 'proxyScheme',
  ];

  let saveTimer = null;

  /* ---------------- 初始化 ---------------- */

  async function init() {
    const cfg = await XAI.getConfig();

    // 填充下拉选项
    fill($('preset'), XAI.providerPresets.map((p) => [p.id, p.label + (p.note ? ' — ' + p.note : '')]));
    fill($('style'), XAI.styles.map((s) => [s.id, s.label + ' — ' + s.desc]));
    fill($('length'), XAI.lengths.map((s) => [s.id, s.label + ' — ' + s.desc]));
    fill($('lang'), XAI.langs.map((s) => [s.id, s.label]));

    // 回填
    for (const k of FIELDS) {
      const el = $(k);
      if (!el) continue;
      if (el.type === 'checkbox') el.checked = !!cfg[k];
      // stream 存布尔，表单是 "1"/"0"
      else if (k === 'stream') el.value = cfg.stream ? '1' : '0';
      else el.value = cfg[k];
    }
    updateEnabledLabel(cfg.enabled);
    updateStyleTip(cfg.style);
    updateBaseUrlTip(cfg.baseUrl);
    updateProxyUI(cfg);

    bind();
    showTip();
  }

  function fill(sel, pairs) {
    sel.innerHTML = pairs
      .map(([v, t]) => `<option value="${XAI.utils.escapeHtml(v)}">${XAI.utils.escapeHtml(t)}</option>`)
      .join('');
  }

  function bind() {
    for (const k of FIELDS) {
      const el = $(k);
      if (!el) continue;
      el.addEventListener('change', onChange);
      if (el.tagName === 'TEXTAREA') el.addEventListener('input', onChange);
      if (el.id === 'apiKey') el.addEventListener('input', () => scheduleSave());
    }

    $('preset').addEventListener('change', onPreset);

    $('peekKey').addEventListener('click', () => {
      const el = $('apiKey');
      const show = el.type === 'password';
      el.type = show ? 'text' : 'password';
      $('peekKey').textContent = show ? '隐藏' : '显示';
    });

    $('save').addEventListener('click', async () => {
      await doSave();
      flash($('saveState'), '已保存 ✓');
    });

    $('test').addEventListener('click', onTest);

    $('reset').addEventListener('click', async () => {
      if (!confirm('恢复默认设置？API Key 会被清空。')) return;
      await chrome.storage.local.set({ [XAI.storageKey]: XAI.defaults });
      flash($('resetOut'), '已恢复默认，正在刷新…', 'is-ok');
      setTimeout(() => location.reload(), 600);
    });

    bindPromptEditor();
    bindProxy();
  }

  /* ---------------- 网络 / 代理 ---------------- */

  function updateProxyUI(cfg) {
    const mode = cfg.proxyMode || 'auto';
    const box = $('proxyCustom');
    if (box) box.style.display = mode === 'custom' ? '' : 'none';
    // 「全局直连」是高风险操作：显示醒目警告
    const warn = $('directWarn');
    if (warn) warn.style.display = mode === 'direct' ? '' : 'none';
    // 非 auto 且非 direct 时提示风险
    const note = $('netNote');
    if (note) note.style.display = '';
  }

  function bindProxy() {
    $('proxyMode').addEventListener('change', (e) => {
      updateProxyUI({ proxyMode: e.target.value });
      scheduleSave();
    });

    $('proxyApply').addEventListener('click', async () => {
      await doSave();
      const out = $('proxyState');
      out.className = 'test-out is-busy';
      out.textContent = '应用中…';

      // 「全局直连」会关掉整个浏览器的代理，必须二次确认
      const mode = $('proxyMode').value;
      if (mode === 'direct') {
        const ok = confirm(
          '⚠️ 此操作会关闭整个浏览器的代理（不只本扩展）\n\n' +
            '应用后，你所有标签页的流量都不再走代理，正在访问的其他网站可能打不开。\n\n' +
            '如果只是想让 AI 接口快一点，请改用「AI 走直连，其他仍走代理」。\n\n' +
            '确定要全局直连吗？'
        );
        if (!ok) {
          out.className = 'test-out';
          out.textContent = '已取消';
          return;
        }
      }

      try {
        const res = await chrome.runtime.sendMessage({ type: 'xai:proxyApply' });
        if (!res || !res.ok) throw new Error((res && res.error) || '未知错误');
        out.className = 'test-out ' + (res.data.ok ? 'is-ok' : 'is-err');
        out.textContent = res.data.message || '已应用';
        // 明确告知影响范围
        if (res.data.scope === 'global') {
          out.className = 'test-out is-err';
          out.textContent += '｜影响范围：整个浏览器';
        } else if (res.data.scope === 'partial') {
          out.textContent += '｜影响范围：仅 AI 接口域名之外';
        } else {
          out.textContent += '｜未改变你的网络设置';
        }
      } catch (e) {
        out.className = 'test-out is-err';
        out.textContent = '失败：' + String((e && e.message) || e);
      }
    });

    $('proxyClear').addEventListener('click', async () => {
      const out = $('proxyState');
      out.className = 'test-out is-busy';
      out.textContent = '恢复中…';
      try {
        // 1) 先清除扩展对 chrome.proxy 的占用
        const r0 = await chrome.runtime.sendMessage({ type: 'xai:proxyApply' });
        void r0;
        // 2) 把模式重置为 auto 并重新应用（auto = system，等于把控制权还给系统）
        $('proxyMode').value = 'auto';
        updateProxyUI({ proxyMode: 'auto' });
        await doSave();
        const r = await chrome.runtime.sendMessage({ type: 'xai:proxyApply' });
        out.className = 'test-out ' + (r && r.data && r.data.ok ? 'is-ok' : 'is-err');
        out.textContent = (r && r.data && r.data.message) || '已恢复默认';
        out.textContent += '｜扩展已交还控制权，不再影响你的网络';
      } catch (e) {
        out.className = 'test-out is-err';
        out.textContent = String((e && e.message) || e);
      }
    });

    $('proxyDiag').addEventListener('click', onDiag);

    // 启动时读一次当前状态
    chrome.runtime
      .sendMessage({ type: 'xai:proxyGet' })
      .then((r) => {
        const out = $('proxyState');
        if (r && r.ok && r.data && r.data.ok) {
          out.className = 'test-out is-ok';
          out.textContent = `${r.data.desc || r.data.mode || '未知'}（受控级别：${r.data.levelOfControl || 'unknown'}）`;
        } else {
          out.className = 'test-out';
          out.textContent = (r && r.data && r.data.message) || '读取失败';
        }
      })
      .catch(() => {
        $('proxyState').textContent = '读取失败（可能不支持 chrome.proxy）';
      });
  }

  /** 测速对比：当前网络 vs 强制直连 */
  async function onDiag() {
    const btn = $('proxyDiag');
    const box = $('diagOut');
    await doSave();

    btn.disabled = true;
    btn.textContent = '测速中…';
    box.style.display = '';
    box.innerHTML =
        '<div class="diag__row">正在对比「当前设置」与「AI 接口直连」两种情况的耗时（测速期间其他网站不受影响）…</div>';

    try {
      const res = await chrome.runtime.sendMessage({ type: 'xai:proxyDiagnose' });
      if (!res || !res.ok) throw new Error((res && res.error) || '未知错误');

      box.innerHTML = res.data
        .map((d) => {
          const cls = d.ok ? (d.ms < 800 ? 'is-ok' : 'is-warn') : 'is-err';
          const tag = d.ok ? (d.status === 401 ? '可达(key问题)' : '可达') : '不可达';
          return `<div class="diag__row"><b>${XAI.utils.escapeHtml(d.label)}</b>
            <span class="diag__v ${cls}">${d.ms}ms · ${tag}</span>
            <span class="diag__s">${XAI.utils.escapeHtml(d.err || (d.status ? 'HTTP ' + d.status : ''))}</span></div>`;
        })
        .join('');
      box.insertAdjacentHTML(
        'beforeend',
        '<div class="diag__row diag__tip">数值越小越快。若「AI 接口直连」明显更快，'
          + '把代理模式设为「AI 走直连，其他仍走代理」即可（只影响 AI 接口）。</div>'
      );
    } catch (e) {
      box.innerHTML = '<div class="diag__row is-err">测速失败：' + XAI.utils.escapeHtml(String((e && e.message) || e)) + '</div>';
    } finally {
      btn.disabled = false;
      btn.textContent = '测速对比';
    }
  }

  /* ---------------- 提示词编辑器 ---------------- */

  /** 记录最后聚焦的模板框，点变量时插入到光标处 */
  let lastPromptBox = 'systemPrompt';

  function bindPromptEditor() {
    // 变量速查表
    $('varList').innerHTML = XAI.promptVars
      .map(
        (v) =>
          `<button class="vchip" data-v="{{${v.key}}}" title="${XAI.utils.escapeHtml(v.desc)}">${XAI.utils.escapeHtml(
            v.key
          )}</button>`
      )
      .join('');

    $('varList').addEventListener('click', (e) => {
      const chip = e.target.closest('.vchip');
      if (!chip) return;
      insertVar(lastPromptBox, chip.dataset.v);
    });

    // 记住用户最后在哪个框里编辑
    for (const id of ['systemPrompt', 'userPrompt']) {
      const el = $(id);
      el.addEventListener('focus', () => {
        lastPromptBox = id;
      });
    }

    $('clearSys').addEventListener('click', () => {
      $('systemPrompt').value = '';
      checkVars();
      scheduleSave();
    });
    $('clearUser').addEventListener('click', () => {
      $('userPrompt').value = '';
      checkVars();
      scheduleSave();
    });

    $('viewDefaultSys').addEventListener('click', () => {
      showDefault(XAI.defaultSystemTemplate, 'systemPrompt');
    });
    $('viewDefaultUser').addEventListener('click', () => {
      showDefault(XAI.defaultUserTemplate, 'userPrompt');
    });

    $('preview').addEventListener('click', onPreview);
    $('closePreview').addEventListener('click', () => {
      $('previewBox').style.display = 'none';
    });
    $('copyPrompt').addEventListener('click', onCopyPrompt);

    checkVars();
  }

  /** 把 {{var}} 插入到当前光标位置 */
  function insertVar(boxId, snippet) {
    const el = $(boxId);
    if (!el) return;
    lastPromptBox = boxId;
    const start = el.selectionStart == null ? el.value.length : el.selectionStart;
    const end = el.selectionEnd == null ? start : el.selectionEnd;
    el.value = el.value.slice(0, start) + snippet + el.value.slice(end);
    const pos = start + snippet.length;
    el.focus();
    el.setSelectionRange(pos, pos);
    checkVars();
    scheduleSave();
  }

  /** 展示默认模板（不覆盖用户内容，除非空着） */
  function showDefault(text, boxId) {
    const el = $(boxId);
    if (el.value.trim()) {
      if (!confirm('当前已有自定义内容，点「确定」将用默认模板覆盖它。继续？')) return;
    }
    el.value = text;
    checkVars();
    scheduleSave();
    el.scrollIntoView({ block: 'center' });
  }

  /** 校验模板里有没有拼错的变量名（复用 shared/prompt.js 的实现） */
  function checkVars() {
    const known = XAI.promptVars.map((v) => v.key);
    const bad = [
      ...XAI.findUnknownVars($('systemPrompt').value, known),
      ...XAI.findUnknownVars($('userPrompt').value, known),
    ].filter((b, i, a) => a.indexOf(b) === i); // 去重

    const warn = $('varWarn');
    if (bad.length) {
      warn.style.display = '';
      warn.innerHTML =
        '⚠ 以下变量名不存在，生成时会被替换成空：<code>' +
        bad.map((b) => XAI.utils.escapeHtml(b)).join('</code> <code>') +
        '</code>';
    } else {
      warn.style.display = 'none';
    }
    return bad.length === 0;
  }

  /** 预览渲染结果（走 service worker，不消耗 API 额度） */
  async function onPreview() {
    const btn = $('preview');
    btn.disabled = true;
    btn.textContent = '渲染中…';

    const cfg = await collectPromptCfg();
    try {
      const res = await chrome.runtime.sendMessage({
        type: 'xai:previewPrompt',
        payload: {
          cfg: cfg,
          extra: { style: cfg.style, count: cfg.count, lang: cfg.lang, length: cfg.length },
        },
      });
      if (!res || !res.ok) throw new Error((res && res.error) || '未知错误');

      $('pvSystem').textContent = res.data.system;
      $('pvUser').textContent = res.data.user;
      $('previewBox').style.display = '';
      $('previewBox').scrollIntoView({ block: 'nearest' });
    } catch (e) {
      flash($('testOut'), '预览失败：' + String((e && e.message) || e), 'is-err');
    } finally {
      btn.disabled = false;
      btn.textContent = '预览渲染结果';
    }
  }

  async function onCopyPrompt() {
    const cfg = await collectPromptCfg();
    try {
      const res = await chrome.runtime.sendMessage({
        type: 'xai:previewPrompt',
        payload: {
          cfg: cfg,
          extra: { style: cfg.style, count: cfg.count, lang: cfg.lang, length: cfg.length },
        },
      });
      if (!res || !res.ok) throw new Error((res && res.error) || '未知错误');
      const full = '===== SYSTEM =====\n' + res.data.system + '\n\n===== USER =====\n' + res.data.user;
      await navigator.clipboard.writeText(full);
      flash($('testOut'), '完整提示词已复制到剪贴板 ✓', 'is-ok');
    } catch (e) {
      flash($('testOut'), '复制失败：' + String((e && e.message) || e), 'is-err');
    }
  }

  /** 收集当前表单里的提示词相关配置 */
  async function collectPromptCfg() {
    const stored = await XAI.getConfig();
    const cfg = Object.assign({}, stored);
    for (const k of ['promptFormat', 'persona', 'systemPrompt', 'userPrompt', 'customInstruction']) {
      const el = $(k);
      if (el) cfg[k] = el.value;
    }
    cfg.style = $('style').value;
    cfg.count = Number($('count').value) || 3;
    cfg.lang = $('lang').value;
    cfg.length = $('length').value;
    return cfg;
  }

  /* ---------------- 事件 ---------------- */

  function onChange(e) {
    const k = e.target.id;
    if (k === 'enabled') updateEnabledLabel(e.target.checked);
    if (k === 'style') updateStyleTip(e.target.value);
    if (k === 'baseUrl') updateBaseUrlTip(e.target.value);
    if (k === 'maxTokens') warnMaxTokens(e.target.value);
    // 提示词模板改动 -> 校验变量名
    if (k === 'systemPrompt' || k === 'userPrompt') checkVars();
    scheduleSave();
  }

  function onPreset(e) {
    const p = XAI.providerPresets.find((x) => x.id === e.target.value);
    if (!p) return;
    if (p.id === 'custom') {
      $('baseUrl').focus();
      flash($('baseUrlTip'), '填入你的 OpenAI 兼容地址，例如 Ollama: http://localhost:11434/v1');
      return;
    }
    $('provider').value = p.provider;
    $('baseUrl').value = p.baseUrl;
    $('model').value = p.model;
    updateBaseUrlTip(p.baseUrl);
    flash($('baseUrlTip'), '已填充 ' + p.label + ' 配置' + (p.note ? '（' + p.note + '）' : ''), 'is-ok');
    scheduleSave();
  }

  /* ---------------- 校验与提示 ---------------- */

  function updateEnabledLabel(on) {
    $('enabledLabel').textContent = on ? '已启用' : '已停用';
  }

  function updateStyleTip(id) {
    const s = XAI.styles.find((x) => x.id === id);
    $('styleTip').textContent = s ? '当前：' + s.label + ' — ' + s.desc : '';
  }

  function updateBaseUrlTip(url) {
    const el = $('baseUrlTip');
    el.className = 'tip';
    if (!url) {
      el.textContent = '';
      return;
    }
    let host = '';
    try {
      host = new URL(url).host;
    } catch (e) {
      el.textContent = '⚠ 地址格式可能不正确';
      return;
    }
    if (/localhost|127\.0\.0\.1/.test(host)) {
      el.innerHTML =
        '本机服务提醒：Ollama / vLLM 这类本机接口需要在扩展的 <b>网站访问权限</b> 里加上 <code>' +
        XAI.utils.escapeHtml(host) +
        '</code>，否则浏览器会拦掉跨域请求。';
    } else if (!/^https:/.test(url)) {
      el.innerHTML = '⚠ 建议使用 <code>https://</code> 开头的地址，明文 http 在扩展里会被拒绝。';
    } else {
      el.textContent = '';
    }
  }

  function warnMaxTokens(v) {
    const n = Number(v);
    const el = $('testOut');
    if (n && n < 2000) {
      el.className = 'test-out is-err';
      el.textContent = '⚠ max_tokens 偏小，推理型模型很可能返回空内容。';
    }
  }

  /* ---------------- 保存 ---------------- */

  function scheduleSave() {
    clearTimeout(saveTimer);
    $('saveState').textContent = '保存中…';
    saveTimer = setTimeout(() => doSave().then(() => flash($('saveState'), '已自动保存')), 600);
  }

  async function doSave() {
    const patch = {};
    for (const k of FIELDS) {
      const el = $(k);
      if (!el) continue;
      if (el.type === 'checkbox') patch[k] = el.checked;
      else if (k === 'maxTokens' || k === 'timeoutSec') patch[k] = Number(el.value) || XAI.defaults[k];
      else if (k === 'count') patch[k] = Number(el.value) || 3;
      // stream 是 <select> 存 "1"/"0"，存成布尔给面板用
      else if (k === 'stream') patch[k] = el.value === '1' || el.value === 'true';
      else if (k === 'proxyPort') patch[k] = Number(el.value) || 0;
      else patch[k] = el.value;
    }
    // baseUrl 去掉尾斜杠，避免拼出 //chat/completions
    patch.baseUrl = String(patch.baseUrl || '').trim().replace(/\/+$/, '');
    $('baseUrl').value = patch.baseUrl;
    return XAI.setConfig(patch);
  }

  function flash(el, msg, cls) {
    el.textContent = msg;
    el.className = 'test-out ' + (cls || 'is-ok');
    setTimeout(() => {
      if (el.id === 'saveState') el.textContent = '所有改动自动保存';
    }, 2200);
  }

  /* ---------------- 测试连接 ---------------- */

  async function onTest() {
    const btn = $('test');
    const out = $('testOut');

    await doSave();

    if (!$('apiKey').value.trim()) {
      out.className = 'test-out is-err';
      out.textContent = '请先填写 API Key';
      return;
    }

    btn.disabled = true;
    out.className = 'test-out is-busy';
    const t0 = Date.now();

    const tick = setInterval(() => {
      out.textContent = '连接中… ' + ((Date.now() - t0) / 1000).toFixed(1) + 's';
    }, 200);

    try {
      const res = await chrome.runtime.sendMessage({ type: 'xai:test' });
      clearInterval(tick);
      if (!res || !res.ok) throw new Error((res && res.error) || '未知错误');
      out.className = 'test-out is-ok';
      out.textContent = '连接成功 ✓ ' + ((Date.now() - t0) / 1000).toFixed(1) + 's ｜ 示例：' + res.data.sample;
    } catch (e) {
      clearInterval(tick);
      out.className = 'test-out is-err';
      out.textContent = '失败：' + String((e && e.message) || e);
    } finally {
      btn.disabled = false;
    }
  }

  /* ---------------- 首次安装引导 ---------------- */

  function showTip() {
    if (location.hash !== '#welcome') return;
    const el = $('testOut');
    el.className = 'test-out is-busy';
    el.textContent = '👋 首次使用：先选服务商预设 → 填 API Key → 点「测试连接」';
  }

  init();
})();
