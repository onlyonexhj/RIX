(function () {
  'use strict';

  const XAI = window.XAI;
  const $ = (id) => document.getElementById(id);

  async function init() {
    const cfg = await XAI.getConfig();

    $('style').innerHTML = XAI.styles
      .map((s) => `<option value="${s.id}">${s.label}</option>`)
      .join('');
    $('style').value = cfg.style;
    $('count').value = String(cfg.count);
    $('enabled').checked = !!cfg.enabled;

    renderStatus(cfg);

    $('enabled').addEventListener('change', async (e) => {
      const on = e.target.checked;
      const c = await XAI.setConfig({ enabled: on });
      renderStatus(c);
      // 停用时释放对浏览器代理的占用（chrome.proxy 是全局的，不能一直霸占）
      if (!on) {
        chrome.runtime.sendMessage({ type: 'xai:proxyClear' }).catch(() => {});
      }
    });
    $('style').addEventListener('change', (e) => XAI.setConfig({ style: e.target.value }));
    $('count').addEventListener('change', (e) => XAI.setConfig({ count: Number(e.target.value) }));

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
      el.innerHTML = '插件已停用。开启后，在 X 上点回复气泡即会出现 AI 面板。';
      return;
    }
    if (!cfg.apiKey) {
      el.className = 'st is-err';
      el.innerHTML =
        '未配置 API Key。<b>点「全部设置」</b>填一个。<br>' +
        '快捷键：点回复气泡后面板里 <span class="k">Ctrl/⌘ + Enter</span> 生成，<span class="k">Esc</span> 关闭。';
      return;
    }
    el.className = 'st is-ok';
    el.innerHTML =
      '已就绪 · <b>' +
      XAI.utils.escapeHtml(cfg.model || '未填模型') +
      '</b><br>' +
      '点回复气泡 → 面板自动出现 → 点「生成回复」。<br>' +
      '快捷键：<span class="k">Ctrl/⌘ + Enter</span> 生成，<span class="k">Esc</span> 关闭。';
  }

  init();
})();
