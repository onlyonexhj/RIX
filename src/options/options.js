/**
 * 设置页逻辑：绑定表单 ↔ 配置。
 * 普通配置自动保存（防抖）；代理配置仅在明确应用后保存。
 */
(function () {
  'use strict';

  const XAI = window.XAI;
  const $ = (id) => document.getElementById(id);
  const t = (key, params) => XAI.i18n ? XAI.i18n.t(key, params) : String(key).replace(/\{(\w+)\}/g, (all, name) => params && params[name] != null ? params[name] : all);
  // 仅翻译共享层识别的后台说明；未知服务报错及 API 原始 detail 保留原文。
  const backendText = (message) => XAI.i18n && XAI.i18n.translateError
    ? XAI.i18n.translateError(message) : t(message);
  const messages = new Map();

  const FIELDS = [
    'enabled', 'provider', 'baseUrl', 'apiKey', 'model', 'maxTokens', 'timeoutSec',
    'disableThinking', 'vision', 'style', 'count', 'lang', 'uiLang', 'length', 'customInstruction',
    'autoGenerate', 'autoInsertFirst', 'debug',
    // 提示词配置
    'promptFormat', 'persona', 'systemPrompt', 'userPrompt',
    // 网络 / 代理
    'stream', 'proxyMode', 'proxyHost', 'proxyPort', 'proxyScheme',
  ];
  const PROXY_FIELDS = ['proxyMode', 'proxyHost', 'proxyPort', 'proxyScheme'];

  let saveTimer = null;
  let pendingSave = Promise.resolve();
  let resetting = false;
  let formEpoch = 0;
  let savedProxy = {};
  let savedFields = {};
  let languageRevision = 0;
  const languageWrites = new Set();

  /* ---------------- 初始化 ---------------- */

  async function init() {
    const cfg = await XAI.getConfig();
    localize(cfg.uiLang || 'auto');
    fillForm(cfg);

    bind();
    showTip();
    // 只同步界面语言，不覆盖本页尚未保存的表单/代理草稿。
    if (chrome.storage && chrome.storage.onChanged) chrome.storage.onChanged.addListener((changes, area) => {
      const change = changes && changes[XAI.storageKey];
      if (area !== 'local' || !change) return;
      const before = normalizeLanguage((change.oldValue || {}).uiLang);
      const next = normalizeLanguage((change.newValue || {}).uiLang);
      if (before === next) return;
      // 本页较早的保存结果不能盖掉用户刚刚选中的新语言。
      if (languageWrites.has(next) && $('uiLang').value !== next) return;
      if ($('uiLang').value === next) {
        savedFields.uiLang = next;
        return;
      }
      languageRevision++;
      $('uiLang').value = next;
      savedFields.uiLang = next;
      localize(next);
    });
  }

  function setText(el, key, params) {
    messages.set(el, () => { el.textContent = t(key, params); });
    messages.get(el)();
  }

  function setHtml(el, render) {
    messages.set(el, () => { el.innerHTML = render(); });
    messages.get(el)();
  }

  function normalizeLanguage(language) {
    return ['auto', 'zh', 'en', 'ja', 'vi', 'ko'].includes(language) ? language : 'auto';
  }

  function localize(language) {
    language = normalizeLanguage(language);
    if (XAI.i18n) {
      XAI.i18n.setLocale(language);
      XAI.i18n.apply(document);
      if (document.documentElement) document.documentElement.lang = XAI.i18n.getLocale();
    }
    document.title = t('X AI 回复助手 · 设置');
    // 保留 select 节点、已选项以及所有输入框的草稿/光标。
    fill($('uiLang'), [['auto', t('跟随浏览器')]].concat(
      (XAI.i18n ? XAI.i18n.languages : [
        { id: 'zh', label: '中文' }, { id: 'en', label: 'English' }, { id: 'ja', label: '日本語' },
        { id: 'vi', label: 'Tiếng Việt' }, { id: 'ko', label: '한국어' },
      ]).filter((lang) => lang.id !== 'auto').map((lang) => [lang.id, lang.label])
    ));
    $('uiLang').value = language;
    fill($('preset'), [['', t('— 选择预设自动填充 —')]].concat(
      XAI.providerPresets.map((p) => [p.id, t(p.label) + (p.note ? ' — ' + t(p.note) : '')])
    ));
    fill($('style'), XAI.styles.map((s) => [s.id, t(s.label) + ' — ' + t(s.desc)]));
    fill($('length'), XAI.lengths.map((s) => [s.id, t(s.label) + ' — ' + t(s.desc)]));
    fill($('lang'), XAI.langs.map((s) => [s.id, t(s.label)]));
    updateEnabledLabel($('enabled').checked);
    updateStyleTip($('style').value);
    updateBaseUrlTip($('baseUrl').value);
    setText($('peekKey'), $('apiKey').type === 'password' ? '显示' : '隐藏');
    renderVars();
    for (const render of messages.values()) render();
  }

  function fillForm(cfg) {
    localize(cfg.uiLang || 'auto');
    for (const k of FIELDS) {
      const el = $(k);
      if (!el) continue;
      if (el.type === 'checkbox') el.checked = !!cfg[k];
      // stream 存布尔，表单是 "1"/"0"
      else if (k === 'stream') el.value = cfg.stream ? '1' : '0';
      else if (k === 'uiLang') el.value = normalizeLanguage(cfg.uiLang);
      else el.value = cfg[k];
    }
    updateEnabledLabel(cfg.enabled);
    updateStyleTip(cfg.style);
    updateBaseUrlTip(cfg.baseUrl);
    updateProxyUI(cfg);
    savedProxy = proxyValues(cfg);
    savedFields = {};
    for (const k of FIELDS) {
      if (!PROXY_FIELDS.includes(k) && $(k)) savedFields[k] = fieldValue(k);
    }
    $('preset').value = '';
  }

  function fill(sel, pairs) {
    const value = sel.value;
    sel.innerHTML = pairs
      .map(([v, t]) => `<option value="${XAI.utils.escapeHtml(v)}">${XAI.utils.escapeHtml(t)}</option>`)
      .join('');
    if (pairs.some(([id]) => String(id) === value)) sel.value = value;
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
      setText($('peekKey'), show ? '隐藏' : '显示');
    });

    $('save').addEventListener('click', async () => {
      if (resetting) return;
      await doSave();
      flash($('saveState'), proxyDraftChanged() ? '其他设置已保存；代理更改需点「应用代理设置」' : '已保存 ✓');
    });

    $('test').addEventListener('click', onTest);

    $('reset').addEventListener('click', async () => {
      if (resetting) return;
      if (!confirm(t('恢复默认设置？API Key 会被清空。'))) return;
      resetting = true;
      formEpoch++;
      clearTimeout(saveTimer);
      saveTimer = null;
      $('reset').disabled = true;
      fillForm(XAI.defaults);
      try {
        // 先排空本页已发出的保存，再由后台串行重置配置及代理。
        await pendingSave.catch(() => {});
        const cfg = await XAI.resetConfig();
        fillForm(cfg);
        checkVars();
        setText($('proxyState'), '已恢复默认代理设置，扩展已交还控制权');
        setText($('saveState'), '普通设置自动保存；代理设置需单独应用');
        flash($('resetOut'), '已恢复默认，API Key 已清空', 'is-ok');
      } catch (e) {
        fillForm(await XAI.getConfig());
        flash($('resetOut'), '恢复失败：{error}', 'is-err', { error: String((e && e.message) || e) });
      } finally {
        resetting = false;
        $('reset').disabled = false;
      }
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

  function proxyValues(cfg) {
    const values = {};
    for (const k of PROXY_FIELDS) values[k] = cfg[k];
    return values;
  }

  function collectProxy() {
    return {
      proxyMode: $('proxyMode').value,
      proxyHost: $('proxyHost').value.trim(),
      proxyPort: Number($('proxyPort').value) || 0,
      proxyScheme: $('proxyScheme').value,
    };
  }

  function proxyDraftChanged() {
    const draft = collectProxy();
    return PROXY_FIELDS.some((k) => draft[k] !== savedProxy[k]);
  }

  function bindProxy() {
    $('proxyApply').addEventListener('click', async () => {
      if (resetting) return;
      const epoch = formEpoch;
      const out = $('proxyState');
      const patch = collectProxy();
      if (patch.proxyMode === 'custom' && (!patch.proxyHost ||
          !Number.isInteger(patch.proxyPort) || patch.proxyPort < 1 || patch.proxyPort > 65535)) {
        flash(out, '请填写代理主机及 1–65535 之间的整数端口', 'is-err');
        return;
      }
      const warning = patch.proxyMode === 'direct'
        ? t('⚠️ 此操作会关闭整个浏览器的代理（不只本扩展）。\n\n所有标签页都会改为直连，部分网站可能打不开。\n\n确定保存并应用全局直连吗？')
        : patch.proxyMode === 'custom'
          ? t('⚠️ 此操作会替换整个浏览器的代理规则。\n\nAI 接口域名直连，其余网站将走 {proxy}。现有 PAC、分流和绕过规则不会保留。\n\n确定保存并应用吗？', { proxy: patch.proxyHost + ':' + patch.proxyPort })
          : '';
      if (warning && !confirm(warning)) {
        flash(out, '已取消，代理更改未保存');
        return;
      }
      out.className = 'test-out is-busy';
      setText(out, '应用中…');
      try {
        const cfg = await doSave({ proxyPatch: patch });
        if (resetting || epoch !== formEpoch) return;
        savedProxy = proxyValues(cfg);
        const res = await chrome.runtime.sendMessage({ type: 'xai:proxyApply' });
        if (epoch !== formEpoch) return;
        if (!res || !res.ok) throw new Error(backendText((res && res.error) || '未知错误'));
        if (!res.data || !res.data.ok) throw new Error(backendText((res.data && res.data.message) || '代理设置失败'));
        out.className = 'test-out ' + (res.data.ok ? 'is-ok' : 'is-err');
        // 明确告知影响范围
        if (res.data.scope === 'global') {
          out.className = 'test-out is-err';
          setText(out, '已应用｜影响范围：整个浏览器');
        } else if (res.data.scope === 'partial') {
          setText(out, '已应用｜影响范围：整个浏览器（AI 域名绕过，其余走固定代理）');
        } else {
          setText(out, '已应用｜未改变你的网络设置');
        }
      } catch (e) {
        if (epoch !== formEpoch) return;
        out.className = 'test-out is-err';
        setText(out, '失败：{error}', { error: String((e && e.message) || e) });
      }
    });

    $('proxyClear').addEventListener('click', async () => {
      if (resetting) return;
      const epoch = formEpoch;
      const out = $('proxyState');
      out.className = 'test-out is-busy';
      setText(out, '恢复中…');
      try {
        const patch = proxyValues(XAI.defaults);
        const cfg = await doSave({ proxyPatch: patch });
        if (resetting || epoch !== formEpoch) return;
        savedProxy = proxyValues(cfg);
        for (const k of PROXY_FIELDS) $(k).value = patch[k];
        updateProxyUI(patch);
        const r = await chrome.runtime.sendMessage({ type: 'xai:proxyClear' });
        if (epoch !== formEpoch) return;
        if (!r || !r.ok || !r.data || !r.data.ok) {
          throw new Error(backendText((r && (r.error || (r.data && r.data.message))) || '恢复代理设置失败'));
        }
        out.className = 'test-out is-ok';
        setText(out, '已恢复默认｜扩展已交还控制权，不再影响你的网络');
      } catch (e) {
        if (epoch !== formEpoch) return;
        out.className = 'test-out is-err';
        setText(out, '{error}', { error: String((e && e.message) || e) });
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
          setHtml(out, () => XAI.utils.escapeHtml(t('{state}（受控级别：{level}）', {
            state: backendText(r.data.desc || r.data.mode || '未知'), level: r.data.levelOfControl || 'unknown',
          })));
        } else {
          out.className = 'test-out';
          setHtml(out, () => XAI.utils.escapeHtml(backendText((r && r.data && r.data.message) || '读取失败')));
        }
      })
      .catch(() => {
        setText($('proxyState'), '读取失败（可能不支持 chrome.proxy）');
      });
  }

  /** 测速对比：仅在能保留当前固定代理规则时追加 API 直连测试。 */
  async function onDiag() {
    if (resetting) return;
    const epoch = formEpoch;
    const btn = $('proxyDiag');
    const box = $('diagOut');
    btn.disabled = true;
    setText(btn, '测速中…');
    box.style.display = '';
    setHtml(box, () => '<div class="diag__row">' + XAI.utils.escapeHtml(t('正在检测当前网络；仅在能保留现有固定代理规则时进行 API 直连对比…')) + '</div>');

    try {
      // 必须在点击事件的同步阶段发起权限请求，不能先 await 保存。
      await beginHostPermission();
      if (resetting || epoch !== formEpoch) return;
      await doSave();
      if (resetting || epoch !== formEpoch) return;
      const res = await chrome.runtime.sendMessage({ type: 'xai:proxyDiagnose' });
      if (epoch !== formEpoch) return;
      if (!res || !res.ok) throw new Error(backendText((res && res.error) || '未知错误'));

      setHtml(box, () => res.data
        .map((d) => {
          const cls = d.skipped ? 'is-warn' : d.ok ? (d.ms < 800 ? 'is-ok' : 'is-warn') : 'is-err';
          const tag = t(d.skipped ? '未执行' : d.ok ? (d.status === 401 ? '可达(key问题)' : '可达') : '不可达');
          return `<div class="diag__row"><b>${XAI.utils.escapeHtml(backendText(d.label))}</b>
            <span class="diag__v ${cls}">${d.skipped ? tag : d.ms + 'ms · ' + tag}</span>
            <span class="diag__s">${XAI.utils.escapeHtml(backendText(d.err || (d.status ? 'HTTP ' + d.status : '')))}</span></div>`;
        })
        .join('') + (!res.data.some((d) => d.skipped)
          ? '<div class="diag__row diag__tip">' + XAI.utils.escapeHtml(t('数值越小越快。需要调整代理时，请先核对固定代理地址及全局影响，再点「应用代理设置」。')) + '</div>'
          : ''));
    } catch (e) {
      if (epoch !== formEpoch) return;
      setHtml(box, () => '<div class="diag__row is-err">' + XAI.utils.escapeHtml(t('测速失败：{error}', { error: String((e && e.message) || e) })) + '</div>');
    } finally {
      btn.disabled = false;
      setText(btn, '测速对比');
    }
  }

  /* ---------------- 提示词编辑器 ---------------- */

  /** 记录最后聚焦的模板框，点变量时插入到光标处 */
  let lastPromptBox = 'systemPrompt';

  function renderVars() {
    $('varList').innerHTML = XAI.promptVars
      .map(
        (v) =>
          `<button class="vchip" data-v="{{${v.key}}}" title="${XAI.utils.escapeHtml(t(v.desc))}">${XAI.utils.escapeHtml(
            v.key
          )}</button>`
      )
      .join('');
  }

  function bindPromptEditor() {
    renderVars();

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
      if (!confirm(t('当前已有自定义内容，点「确定」将用默认模板覆盖它。继续？'))) return;
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
      setHtml(warn, () => XAI.utils.escapeHtml(t('⚠ 以下变量名不存在，生成时会被替换成空：')) + '<code>' +
        bad.map((b) => XAI.utils.escapeHtml(b)).join('</code> <code>') +
        '</code>');
    } else {
      warn.style.display = 'none';
    }
    return bad.length === 0;
  }

  /** 预览渲染结果（走 service worker，不消耗 API 额度） */
  async function onPreview() {
    const btn = $('preview');
    btn.disabled = true;
    setText(btn, '渲染中…');

    const cfg = await collectPromptCfg();
    try {
      const res = await chrome.runtime.sendMessage({
        type: 'xai:previewPrompt',
        payload: {
          cfg: cfg,
          extra: { style: cfg.style, count: cfg.count, lang: cfg.lang, length: cfg.length },
        },
      });
      if (!res || !res.ok) throw new Error((res && res.error) || t('未知错误'));

      $('pvSystem').textContent = res.data.system;
      $('pvUser').textContent = res.data.user;
      $('previewBox').style.display = '';
      $('previewBox').scrollIntoView({ block: 'nearest' });
    } catch (e) {
      flash($('testOut'), '预览失败：{error}', 'is-err', { error: String((e && e.message) || e) });
    } finally {
      btn.disabled = false;
      setText(btn, '预览渲染结果');
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
      if (!res || !res.ok) throw new Error((res && res.error) || t('未知错误'));
      const full = '===== SYSTEM =====\n' + res.data.system + '\n\n===== USER =====\n' + res.data.user;
      await navigator.clipboard.writeText(full);
      flash($('testOut'), '完整提示词已复制到剪贴板 ✓', 'is-ok');
    } catch (e) {
      flash($('testOut'), '复制失败：{error}', 'is-err', { error: String((e && e.message) || e) });
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
    if (resetting) return;
    const k = e.target.id;
    if (PROXY_FIELDS.includes(k)) {
      updateProxyUI({ proxyMode: $('proxyMode').value });
      flash($('proxyState'), '代理更改尚未保存；请点「应用代理设置」');
      return;
    }
    if (k === 'enabled') updateEnabledLabel(e.target.checked);
    if (k === 'uiLang') {
      languageRevision++;
      localize(e.target.value);
    }
    if (k === 'style') updateStyleTip(e.target.value);
    if (k === 'baseUrl') updateBaseUrlTip(e.target.value);
    if (k === 'maxTokens') warnMaxTokens(e.target.value);
    // 提示词模板改动 -> 校验变量名
    if (k === 'systemPrompt' || k === 'userPrompt') checkVars();
    scheduleSave();
  }

  function onPreset(e) {
    if (resetting) return;
    const p = XAI.providerPresets.find((x) => x.id === e.target.value);
    if (!p) return;
    if (p.id === 'custom') {
      $('provider').value = p.provider;
      $('baseUrl').focus();
      flash($('baseUrlTip'), '填入你的 OpenAI 兼容地址，例如 Ollama: http://localhost:11434/v1');
      scheduleSave();
      return;
    }
    $('provider').value = p.provider;
    $('baseUrl').value = p.baseUrl;
    $('model').value = p.model;
    updateBaseUrlTip(p.baseUrl);
    setHtml($('baseUrlTip'), () => XAI.utils.escapeHtml(t('已填充 {provider} 配置', { provider: t(p.label) }) + (p.note ? ' (' + t(p.note) + ')' : '')));
    $('baseUrlTip').className = 'tip is-ok';
    scheduleSave();
  }

  /* ---------------- 校验与提示 ---------------- */

  function updateEnabledLabel(on) {
    setText($('enabledLabel'), on ? '已启用' : '已停用');
  }

  function updateStyleTip(id) {
    const s = XAI.styles.find((x) => x.id === id);
    setHtml($('styleTip'), () => XAI.utils.escapeHtml(s ? t('当前：{style}', { style: t(s.label) + ' — ' + t(s.desc) }) : ''));
  }

  function updateBaseUrlTip(url) {
    const el = $('baseUrlTip');
    el.className = 'tip';
    if (!url) {
      messages.delete(el);
      el.textContent = '';
      return;
    }
    let host = '';
    try {
      host = new URL(url).host;
    } catch (e) {
      setText(el, '⚠ 地址格式可能不正确');
      return;
    }
    if (/localhost|127\.0\.0\.1/.test(host)) {
      setText(el, '本机服务：首次点「测试连接」时会请求此域名的访问权限，授权后即可生成回复。');
    } else if (!/^https:/.test(url)) {
      setText(el, '⚠ 明文 HTTP 会传输 API Key，远程服务建议使用 https://。首次测试时会请求域名访问权限。');
    } else {
      setText(el, '首次点「测试连接」时会请求所填 API 域名的访问权限，授权后即可生成回复。');
    }
  }

  function warnMaxTokens(v) {
    const n = Number(v);
    const el = $('testOut');
    if (n && n < 2000) {
      el.className = 'test-out is-err';
      setText(el, '⚠ max_tokens 偏小，推理型模型很可能返回空内容。');
    }
  }

  /* ---------------- 保存 ---------------- */

  function scheduleSave() {
    if (resetting) return;
    clearTimeout(saveTimer);
    setText($('saveState'), '保存中…');
    saveTimer = setTimeout(() => doSave().then(() => {
      if (!resetting) flash($('saveState'), proxyDraftChanged() ? '普通设置已保存；代理更改尚未应用' : '已自动保存');
    }).catch((e) => flash($('saveState'), '保存失败：{error}', 'is-err', { error: String((e && e.message) || e) })), 600);
  }

  function doSave(options) {
    if (resetting) return pendingSave;
    clearTimeout(saveTimer);
    saveTimer = null;
    const values = {};
    for (const k of FIELDS) {
      // 代理表单是草稿，自动保存、保存、测试及诊断都不能使草稿生效。
      if (PROXY_FIELDS.includes(k)) continue;
      const el = $(k);
      if (!el) continue;
      values[k] = fieldValue(k);
    }
    const proxyPatch = options && options.proxyPatch;
    const revision = languageRevision;
    // baseUrl 去掉尾斜杠，避免拼出 //chat/completions
    $('baseUrl').value = fieldValue('baseUrl');
    pendingSave = pendingSave.catch(() => {}).then(async () => {
      // 先前保存完成后再比较快照，才能保存「保存中又改回原值」的操作。
      const patch = {};
      for (const k of Object.keys(values)) {
        if (k === 'uiLang' && revision !== languageRevision) continue;
        if (values[k] !== savedFields[k]) patch[k] = values[k];
      }
      if (proxyPatch) Object.assign(patch, proxyPatch);
      if (patch.uiLang) languageWrites.add(patch.uiLang);
      let cfg;
      try {
        cfg = Object.keys(patch).length ? await XAI.setConfig(patch) : await XAI.getConfig();
      } finally {
        if (patch.uiLang) languageWrites.delete(patch.uiLang);
      }
      for (const k of Object.keys(patch)) {
        if (!PROXY_FIELDS.includes(k)) savedFields[k] = patch[k];
      }
      return cfg;
    });
    return pendingSave;
  }

  function fieldValue(k) {
    const el = $(k);
    if (el.type === 'checkbox') return el.checked;
    if (k === 'maxTokens' || k === 'timeoutSec') return Number(el.value) || XAI.defaults[k];
    if (k === 'count') return Number(el.value) || 3;
    if (k === 'stream') return el.value === '1' || el.value === 'true';
    if (k === 'baseUrl') return String(el.value || '').trim().replace(/\/+$/, '');
    return el.value;
  }

  function flash(el, msg, cls, params) {
    setText(el, msg, params);
    el.className = 'test-out ' + (cls || 'is-ok');
    setTimeout(() => {
      if (el.id === 'saveState') setText(el, proxyDraftChanged()
        ? '代理更改尚未应用；普通设置自动保存'
        : '普通设置自动保存；代理设置需单独应用');
    }, 2200);
  }

  /* ---------------- 测试连接 ---------------- */

  function beginHostPermission() {
    const url = new URL($('baseUrl').value.trim());
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      throw new Error(t('Base URL 必须使用 http:// 或 https://'));
    }
    if (!chrome.permissions || !chrome.permissions.contains || !chrome.permissions.request) {
      throw new Error(t('浏览器不支持网站访问授权，请检查扩展权限'));
    }
    // 主机权限按协议和域名授权，不包含端口。两个调用都在用户点击时同步启动，
    // 已授予的域名不会再次弹框；不可 await contains 后才调用 request。
    const details = { origins: [url.protocol + '//' + url.hostname + '/*'] };
    const existing = chrome.permissions.contains(details);
    const requested = chrome.permissions.request(details);
    return Promise.all([existing, requested]).then(([alreadyGranted, granted]) => {
      if (!granted) throw new Error(t('未获准访问 API 域名 {host}；请再次点「测试连接」并允许访问', { host: url.hostname }));
      return { alreadyGranted: alreadyGranted, origin: details.origins[0] };
    });
  }

  async function onTest() {
    if (resetting) return;
    const epoch = formEpoch;
    const btn = $('test');
    const out = $('testOut');

    if (!$('apiKey').value.trim()) {
      out.className = 'test-out is-err';
      setText(out, '请先填写 API Key');
      return;
    }

    btn.disabled = true;
    out.className = 'test-out is-busy';
    setText(out, '等待网站访问授权…');
    let tick = null;

    try {
      // 点击后立即启动 request，保存等异步工作只能放在它之后。
      await beginHostPermission();
      if (resetting || epoch !== formEpoch) return;
      await doSave();
      if (resetting || epoch !== formEpoch) return;
      const t0 = Date.now();
      tick = setInterval(() => {
        setText(out, '连接中… {seconds}s', { seconds: ((Date.now() - t0) / 1000).toFixed(1) });
      }, 200);
      const res = await chrome.runtime.sendMessage({ type: 'xai:test' });
      if (epoch !== formEpoch) return;
      if (!res || !res.ok) throw new Error((res && res.error) || t('未知错误'));
      out.className = 'test-out is-ok';
      setText(out, '连接成功 ✓ {seconds}s ｜ 示例：{sample}', { seconds: ((Date.now() - t0) / 1000).toFixed(1), sample: res.data.sample });
    } catch (e) {
      if (epoch !== formEpoch) return;
      out.className = 'test-out is-err';
      setText(out, '失败：{error}', { error: String((e && e.message) || e) });
    } finally {
      clearInterval(tick);
      btn.disabled = false;
    }
  }

  /* ---------------- 首次安装引导 ---------------- */

  function showTip() {
    if (location.hash !== '#welcome') return;
    const el = $('testOut');
    el.className = 'test-out is-busy';
    setText(el, '👋 首次使用：先选服务商预设 → 填 API Key → 点「测试连接」');
  }

  init();
})();
