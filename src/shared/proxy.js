/**
 * 代理管理（service worker 专用）。
 *
 * ★ 重要技术前提（决定了为什么只能这么做）：
 *   浏览器的 `fetch()` **不支持为单个请求指定代理** —— 没有 proxy 选项。
 *   所以要"让 AI 请求走某条路"，只能通过 `chrome.proxy` 改**浏览器全局**规则。
 *
 *   三种模式的全局影响差异很大：
 *     auto   = system 模式，扩展**不改任何设置**，零风险（默认）
 *     custom = fixed_servers + bypassList，把 AI API 域名加进 bypassList，
 *              实现「AI 直连、其他流量仍走你指定的代理」—— 精准可控
 *     direct = 全局直连，**会关掉整个浏览器的代理**，影响面最大
 *
 *   注意：绝大多数情况下不需要动这里 ——
 *   挂 VPN 变慢的真正解药是开「流式输出」（见 cfg.stream）。
 */
(function (root) {
  'use strict';

  const XAI = (root.XAI = root.XAI || {});
  const P = (XAI.proxy = {});

  /**
   * 从 Base URL 提取主机名（用于 bypassList 精准控制）。
   *
   * 不依赖 `new URL()`：某些沙箱/旧环境没有 URL 全局，会静默失败
   * 导致 bypassList 丢域名（用户以为精准模式生效，实际没有）。
   * 这里用正则做兜底，保证总能拿到主机名。
   */
  P.extractHost = function extractHost(baseUrl) {
    const s = String(baseUrl || '').trim();
    if (!s) return '';
    // 去掉协议头
    const noProto = s.replace(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//, '');
    // 主机 = 第一个 / ? # 之前的部分
    let host = noProto.split(/[/?#]/)[0];
    // 去掉 user:pass@ 部分
    const at = host.lastIndexOf('@');
    if (at !== -1) host = host.slice(at + 1);
    // 去掉端口
    host = host.split(':')[0];
    return host.trim().toLowerCase();
  };

  /**
   * 构造 bypassList：始终包含 AI API 域名。
   * 这样在 custom 模式下，只有 AI API 走直连，其他流量仍走用户指定的代理。
   */
  function buildBypassList(cfg, extraHosts) {
    const list = ['localhost', '127.0.0.1', '::1'];
    const hosts = [cfg.apiHost].concat(extraHosts || []);
    for (const h of hosts) {
      const host = String(h || '').trim().replace(/^\.+/, '');
      // 去掉端口，PAC bypassList 按主机名匹配
      const bare = host.split(':')[0];
      if (bare && list.indexOf(bare) === -1) list.push(bare);
    }
    return list;
  }

  /**
   * 把代理模式 + 主机端口，转成 chrome.proxy 的配置值。
   * @param {object} cfg      配置
   * @param {string[]} extraHosts 额外的直连域名（如诊断时用的 API 域名）
   */
  P.buildScheme = function buildScheme(cfg, extraHosts) {
    const mode = cfg.proxyMode || 'auto';

    if (mode === 'direct') {
      return { mode: 'direct' };
    }

    if (mode === 'custom') {
      const host = String(cfg.proxyHost || '').trim();
      const port = Number(cfg.proxyPort) || 0;
      if (!host || !port) {
        throw new Error('自定义代理需要填写主机和端口');
      }
      return {
        mode: 'fixed_servers',
        rules: {
          singleProxy: { scheme: cfg.proxyScheme || 'http', host: host, port: port },
          bypassList: buildBypassList(cfg, extraHosts),
        },
      };
    }
    return { mode: 'system' };
  };

  /**
   * 应用代理设置。
   * @param scope 'regular' = 常规窗口；'fixed_servers' 用 regular 即可
   * @returns {ok, mode, message}
   */
  /**
   * 应用代理设置。
   * @param {object} cfg        配置（需含 apiHost，即 AI 服务商域名）
   * @param {string[]} extraHosts 额外直连域名
   */
  P.apply = async function apply(cfg, extraHosts) {
    if (!chrome.proxy || !chrome.proxy.settings) {
      return { ok: false, message: '当前环境不支持 chrome.proxy（service worker 不可用）' };
    }
    const value = P.buildScheme(cfg, extraHosts);
    try {
      await chrome.proxy.settings.set({ value: value, scope: 'regular' });
      const api = P.extractHost(cfg.baseUrl);
      return {
        ok: true,
        mode: value.mode,
        scope:
          value.mode === 'direct'
            ? 'global' // 全局生效
            : value.mode === 'fixed_servers'
              ? 'partial' // 只影响 API 域名之外的部分
              : 'none', // system 模式不改变用户设置
        apiDirect: value.mode === 'fixed_servers' && value.rules.bypassList.indexOf(api) !== -1,
        message:
          value.mode === 'direct'
            ? '⚠ 已全局直连：整个浏览器的流量都不再走代理'
            : value.mode === 'fixed_servers'
              ? '已设固定代理 ' +
                value.rules.singleProxy.host +
                ':' +
                value.rules.singleProxy.port +
                (api ? '（' + api + ' 直连，其他照旧走代理）' : '')
              : '已恢复跟随系统默认（扩展未改变你的设置）',
      };
    } catch (e) {
      return { ok: false, message: '设置代理失败：' + String((e && e.message) || e) };
    }
  };

  /** 读取当前生效的代理配置（用于设置页展示真实状态） */
  P.get = async function get() {
    if (!chrome.proxy || !chrome.proxy.settings) {
      return { ok: false, message: '不可用' };
    }
    try {
      const v = await chrome.proxy.settings.get({});
      const val = v && v.value ? v.value : {};
      let desc = '';
      if (val.mode === 'fixed_servers' && val.rules && val.rules.singleProxy) {
        desc = val.rules.singleProxy.scheme + '://' + val.rules.singleProxy.host + ':' + val.rules.singleProxy.port;
      } else if (val.mode === 'direct') {
        desc = '强制直连';
      } else if (val.mode === 'system') {
        desc = '跟随系统';
      }
      return { ok: true, mode: val.mode, desc: desc, levelOfControl: v ? v.levelOfControl : '' };
    } catch (e) {
      return { ok: false, message: String((e && e.message) || e) };
    }
  };

  /** 清除扩展的代理设置（恢复 Chrome 原状） */
  P.clear = async function clear() {
    if (!chrome.proxy || !chrome.proxy.settings) return { ok: false, message: '不可用' };
    try {
      await chrome.proxy.settings.clear({});
      return { ok: true, message: '已清除代理设置' };
    } catch (e) {
      return { ok: false, message: String((e && e.message) || e) };
    }
  };

  /**
   * 诊断：对比「当前设置」与「AI API 直连」两种情况的耗时与可达性。
   *
   * ★ 注意：测"直连"时**不切 direct 模式**（那会全局关代理、影响用户正在看的其他网站），
   *   而是临时用 fixed_servers + bypassList(仅 API 域名) —— 只影响 AI API 这一条路。
   */
  P.diagnose = async function diagnose(cfg) {    const base = String(cfg.baseUrl || '').trim().replace(/\/+$/, '');
    const results = [];

    const probe = async (label) => {
      const t0 = Date.now();
      try {
        const ctl = new AbortController();
        const timer = setTimeout(() => ctl.abort(), 15000);
        const res = await fetch(base + '/models', {
          method: 'GET',
          headers: { Authorization: 'Bearer ' + (cfg.apiKey || '') },
          signal: ctl.signal,
        });
        clearTimeout(timer);
        const ms = Date.now() - t0;
        // 401 说明网络通、只是 key 问题 => 判定「可达」
        results.push({ label, ok: res.status < 500, status: res.status, ms: ms });
      } catch (e) {
        results.push({
          label,
          ok: false,
          status: 0,
          ms: Date.now() - t0,
          err: String((e && e.message) || e),
        });
      }
    };

    // 1) 当前设置下测一次
    await probe('当前网络设置');

    // 2) 临时让 API 直连（只影响 API 域名，不动其他流量）
    const apiHost = P.extractHost(cfg.baseUrl);
    const prev = await P.get();
    const tempDirect = await P.apply(
      Object.assign({}, cfg, { proxyMode: 'custom', proxyHost: '127.0.0.1', proxyPort: 1 }),
      [apiHost]
    );
    if (tempDirect.ok) {
      await probe('API 直连');
      // 恢复原状
      await P.apply(cfg);
    }
    void prev;

    return results;
  };
})(typeof window !== 'undefined' ? window : self);