(function () {
  'use strict';

  const XAI = window.XAI;
  const $ = (id) => document.getElementById(id);
  const I = XAI.i18n;
  const t = (key, params) => I ? I.t(key, params) : key;
  const escape = XAI.utils.escapeHtml;
  let config = {};
  let storageRevision = 0;
  let editSequence = 0;
  let saveTail = Promise.resolve();
  const pending = new Map();

  function currentConfig() {
    const cfg = Object.assign({}, XAI.defaults, config);
    for (const [key, edit] of pending) cfg[key] = edit.value;
    return cfg;
  }

  function render() {
    const cfg = currentConfig();
    if (I) {
      I.setLocale(cfg.uiLang);
      I.apply(document);
      document.documentElement.lang = I.getLocale();
      document.title = t('RIX');
    }
    const languages = I ? I.languages : [{ id: 'auto', label: '跟随浏览器' }, { id: 'zh', label: '中文' }];
    $('uiLang').innerHTML = languages
      .map((lang) => `<option value="${escape(lang.id)}">${escape(lang.id === 'auto' ? t(lang.label) : lang.label)}</option>`)
      .join('');
    $('uiLang').value = cfg.uiLang || 'auto';
    $('style').innerHTML = XAI.styles
      .map((style) => `<option value="${escape(style.id)}">${escape(t(style.label))}</option>`)
      .join('');
    $('style').value = cfg.style;
    $('count').value = String(cfg.count);
    $('enabled').checked = !!cfg.enabled;
    renderStatus(cfg);
  }

  function save(patch) {
    const token = ++editSequence;
    for (const [key, value] of Object.entries(patch)) pending.set(key, { value, token });
    render();
    const operation = saveTail.then(async () => {
      const revision = storageRevision;
      const result = await XAI.setConfig(patch);
      // A storage event may contain a newer change from the options page.
      if (revision === storageRevision) config = Object.assign({}, XAI.defaults, result);
      for (const key of Object.keys(patch)) {
        if (pending.get(key)?.token === token) pending.delete(key);
      }
      render();
      return result;
    });
    saveTail = operation.catch(() => {
      for (const key of Object.keys(patch)) {
        if (pending.get(key)?.token === token) pending.delete(key);
      }
      render();
      $('st').className = 'st is-err';
      $('st').textContent = t('保存失败，请重试。');
    });
    return operation;
  }

  async function init() {
    // Subscribe before the initial read so opening this popup cannot restore stale UI.
    const initialRevision = storageRevision;
    chrome.storage.onChanged?.addListener((changes, area) => {
      if (area !== 'local' || !changes[XAI.storageKey]) return;
      storageRevision++;
      config = Object.assign({}, XAI.defaults, changes[XAI.storageKey].newValue || {});
      render();
    });
    const cfg = await XAI.getConfig();
    if (storageRevision === initialRevision) config = cfg;
    render();

    $('enabled').addEventListener('change', async (e) => {
      const on = e.target.checked;
      try { await save({ enabled: on }); } catch (error) { return; }
      // 停用时释放对浏览器代理的占用（chrome.proxy 是全局的，不能一直霸占）
      if (!on) {
        chrome.runtime.sendMessage({ type: 'xai:proxyClear' }).catch(() => {});
      }
    });
    $('style').addEventListener('change', (e) => save({ style: e.target.value }).catch(() => {}));
    $('count').addEventListener('change', (e) => save({ count: Number(e.target.value) }).catch(() => {}));
    $('uiLang').addEventListener('change', (e) => save({ uiLang: e.target.value }).catch(() => {}));

    $('openX').addEventListener('click', () => {
      chrome.tabs.create({ url: 'https://x.com/home' });
      window.close();
    });
    $('openOpt').addEventListener('click', () => {
      chrome.runtime.openOptionsPage();
      window.close();
    });
  }

  function renderStatus(cfg) {
    const el = $('st');
    if (!cfg.enabled) {
      el.className = 'st is-err';
      el.textContent = t('插件已停用。开启后，在 X 上点回复气泡即会出现 AI 面板。');
      return;
    }
    if (!cfg.apiKey) {
      el.className = 'st is-err';
      el.innerHTML =
        escape(t('未配置 API Key。')) + '<b>' + escape(t('点「全部设置」填一个。')) + '</b><br>' +
        shortcuts();
      return;
    }
    el.className = 'st is-ok';
    el.innerHTML =
      escape(t('已就绪')) + ' · <b>' +
      escape(cfg.model || t('未填模型')) +
      '</b><br>' +
      escape(t('点回复气泡 → 面板自动出现 → 点「生成回复」。')) + '<br>' +
      shortcuts();
  }

  function shortcuts() {
    return escape(t('快捷键：')) + '<span class="k">Ctrl/⌘ + Enter</span> ' +
      escape(t('生成')) + ' · <span class="k">Esc</span> ' + escape(t('关闭'));
  }

  init();
})();
