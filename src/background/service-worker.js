/**
 * Background Service Worker
 *
 * 职责：
 *  1. 统一代理 AI 请求（content script 受页面 CSP 限制，不能直接跨域 fetch）
 *  2. 拼装 prompt
 *  3. 支持 OpenAI 兼容协议 + Anthropic Messages 协议
 *  4. 支持多路并发生成 + 中止（AbortController）
 *
 * 为什么放 background：
 *  - content script 的 fetch 被 X 页面的 CSP / 同源策略拦截
 *  - API Key 放 background，不暴露给页面脚本（页面 JS 与 content script 隔离）
 */
'use strict';

importScripts(
  '../shared/config.js',
  '../shared/utils.js',
  '../shared/prompt.js',
  '../shared/proxy.js'
);

const XAI = self.XAI;
// 提示词构建已抽到 shared/prompt.js（settings 预览与实际发送共用同一份逻辑）
const buildPrompt = XAI.buildPrompt;
const U = XAI.utils;

/* ================================================================== *
 * 消息路由
 * ================================================================== */

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || !msg.type) return false;

  switch (msg.type) {
    case 'xai:generate':
      handleGenerate(msg.payload)
        .then((r) => sendResponse({ ok: true, data: r }))
        .catch((e) => sendResponse({ ok: false, error: String((e && e.message) || e) }));
      return true; // 异步

    case 'xai:cancel':
      cancelById(msg.payload && msg.payload.taskId);
      sendResponse({ ok: true });
      return false;

    case 'xai:test':
      handleTest(msg.payload)
        .then((r) => sendResponse({ ok: true, data: r }))
        .catch((e) => sendResponse({ ok: false, error: String((e && e.message) || e) }));
      return true;

    case 'xai:getConfig':
      XAI.getConfig().then((c) => sendResponse({ ok: true, data: maskConfig(c) }));
      return true;

    case 'xai:setConfig':
      XAI.setConfig(msg.payload || {})
        .then(async (cfg) => {
          if (msg.payload && (msg.payload.enabled === false || msg.payload.proxyMode === 'auto')) {
            const result = await XAI.proxy.clear();
            if (!result.ok) throw new Error('配置已保存，但清理代理失败：' + result.message);
          }
          return cfg;
        })
        .then((cfg) => sendResponse({ ok: true, data: cfg }))
        .catch((e) => sendResponse({ ok: false, error: String((e && e.message) || e) }));
      return true;

    case 'xai:resetConfig':
      XAI.resetConfig()
        .then(async (cfg) => {
          const result = await XAI.proxy.clear();
          if (!result.ok) throw new Error('配置已重置，但清理代理失败：' + result.message);
          return cfg;
        })
        .then((cfg) => sendResponse({ ok: true, data: cfg }))
        .catch((e) => sendResponse({ ok: false, error: String((e && e.message) || e) }));
      return true;

    case 'xai:previewPrompt':
      // 设置页实时预览：把模板用示例推文渲染出来（不消耗 API 额度）
      try {
        const cfg = Object.assign({}, XAI.defaults, (msg.payload && msg.payload.cfg) || {});
        const extra = (msg.payload && msg.payload.extra) || {};
        const tweet = (msg.payload && msg.payload.tweet) || {
          author: '会跳舞的企鹅',
          handle: '@penguin_dance',
          text: '今天学会了用 AI 写代码，效率直接翻倍！有人一起试试吗？',
          time: '2026-10-16T10:00:00.000Z',
          media: ['image'],
          url: 'https://x.com/penguin_dance/status/1',
        };
        const p = buildPrompt(tweet, cfg, extra);
        sendResponse({ ok: true, data: { system: p.system, user: p.user, n: p.n } });
      } catch (e) {
        sendResponse({ ok: false, error: String((e && e.message) || e) });
      }
      return false;

    case 'xai:proxyApply':
      XAI.getConfig()
        .then((c) => {
          // 传入 apiHost，让 custom 模式把 AI 域名加进 bypassList
          return XAI.proxy.apply(
            Object.assign({}, c, { apiHost: XAI.proxy.extractHost(c.baseUrl) })
          );
        })
        .then((r) => sendResponse({ ok: true, data: r }))
        .catch((e) => sendResponse({ ok: false, error: String((e && e.message) || e) }));
      return true;

    case 'xai:proxyClear':
      XAI.proxy.clear()
        .then((r) => sendResponse({ ok: true, data: r }))
        .catch((e) => sendResponse({ ok: false, error: String((e && e.message) || e) }));
      return true;

    case 'xai:proxyGet':
      XAI.proxy.get()
        .then((r) => sendResponse({ ok: true, data: r }))
        .catch((e) => sendResponse({ ok: false, error: String((e && e.message) || e) }));
      return true;

    case 'xai:proxyDiagnose':
      XAI.getConfig()
        .then((c) => XAI.proxy.diagnose(
          Object.assign({}, c, { apiHost: XAI.proxy.extractHost(c.baseUrl) })
        ))
        .then((r) => sendResponse({ ok: true, data: r }))
        .catch((e) => sendResponse({ ok: false, error: String((e && e.message) || e) }));
      return true;

    default:
      return false;
  }
});

/** 去掉 API Key 后再发给 content script */
function maskConfig(c) {
  const k = c.apiKey || '';
  return Object.assign({}, c, {
    apiKey: k ? k.slice(0, 6) + '****' + k.slice(-4) : '',
    hasKey: !!k,
  });
}

/* ================================================================== *
 * 流式通道（Port 长连接）
 * ================================================================== */

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'xai:generate') return;

  let started = false;
  port.onMessage.addListener((msg) => {
    if (!msg || msg.type !== 'generate') return;
    // 只处理一次；防止面板重发导致重复请求
    if (started) return;
    started = true;
    handleGenerateStream(port, msg.payload || {});
  });
});

/* ================================================================== *
 * 中止控制
 * ================================================================== */

const inflight = new Map(); // taskId -> AbortController

function cancelById(taskId) {
  const c = inflight.get(taskId);
  if (c) {
    try {
      c.abort();
    } catch (e) {
      /* noop */
    }
    inflight.delete(taskId);
  }
}

function throwIfAborted(signal) {
  if (!signal.aborted) return;
  const error = new Error('已中止');
  error.name = 'AbortError';
  throw error;
}

/* ================================================================== *
 * 调用：OpenAI 兼容 / Anthropic
 * ================================================================== */

function normalizeBase(cfg) {
  let base = (cfg.baseUrl || '').trim().replace(/\/+$/, '');
  if (!base) throw new Error('未配置 Base URL');
  return base;
}

/** OpenAI 兼容（含 GLM / DeepSeek / Kimi / OpenRouter / Ollama） */
async function callOpenAI(cfg, prompt, signal) {
  const base = normalizeBase(cfg);
  const url = /\/chat\/completions$/.test(base) ? base : base + '/chat/completions';

  // 视觉：带图时 user 消息改为多模态部件数组（OpenAI 兼容格式）
  const userContent =
    prompt.images && prompt.images.length
      ? [{ type: 'text', text: prompt.user }].concat(
          prompt.images.map((u) => ({ type: 'image_url', image_url: { url: u } }))
        )
      : prompt.user;

  const body = {
    model: cfg.model,
    messages: [
      { role: 'system', content: prompt.system },
      { role: 'user', content: userContent },
    ],
    temperature: typeof cfg.temperature === 'number' ? cfg.temperature : 1,
    max_tokens: Number(cfg.maxTokens) || 4000,
    stream: false,
  };

  // GLM 的深度思考开关（写回复不需要思考链，关掉更快也更省 token）
  if (/bigmodel|zhipu|glm/i.test(base + ' ' + (cfg.model || ''))) {
    body.thinking = { type: cfg.disableThinking ? 'disabled' : 'enabled' };
  }

  const headers = {
    'Content-Type': 'application/json',
    Authorization: 'Bearer ' + (cfg.apiKey || ''),
  };
  // OpenRouter 需要 referer 头
  if (/openrouter/i.test(base)) {
    headers['HTTP-Referer'] = 'https://github.com/xai-reply';
    headers['X-Title'] = 'RIX';
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: headers,
    body: JSON.stringify(body),
    signal: signal,
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error('HTTP ' + res.status + ' ' + (safeParse(text)?.error?.message || text.slice(0, 300)) + visionHint(prompt));
  }
  const json = safeParse(text);
  if (!json) throw new Error('返回非 JSON：' + text.slice(0, 200));

  const content =
    (json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content) || '';

  // 有正文也可能只是被截断的半个 JSON，不能按成功候选回填。
  const fr = json.choices && json.choices[0] && json.choices[0].finish_reason;
  throwIfOutputLimited(fr);
  return content;
}

/** Anthropic Messages API */
async function callAnthropic(cfg, prompt, signal) {
  const base = normalizeBase(cfg);
  const url = /\/messages$/.test(base) ? base : base + '/messages';

  // 视觉：带图时 user 内容改为块数组（Anthropic Messages 格式，URL source）
  const userContentA =
    prompt.images && prompt.images.length
      ? [{ type: 'text', text: prompt.user }].concat(
          prompt.images.map((u) => ({ type: 'image', source: { type: 'url', url: u } }))
        )
      : prompt.user;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': cfg.apiKey || '',
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: cfg.model,
      system: prompt.system,
      messages: [{ role: 'user', content: userContentA }],
      max_tokens: Number(cfg.maxTokens) || 4000,
      temperature: typeof cfg.temperature === 'number' ? cfg.temperature : 1,
    }),
    signal: signal,
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error('HTTP ' + res.status + ' ' + (safeParse(text)?.error?.message || text.slice(0, 300)) + visionHint(prompt));
  }
  const json = safeParse(text);
  if (!json) throw new Error('返回非 JSON：' + text.slice(0, 200));
  throwIfOutputLimited(json.stop_reason);
  return (json.content && json.content.map((c) => c.text || '').join('')) || '';
}

/** 服务商明确报告 token 上限时，不将不完整输出交给宽松的回复解析兜底。 */
function throwIfOutputLimited(reason) {
  if (reason === 'length' || reason === 'max_tokens') {
    throw new Error('模型输出已达到长度上限，请减少回复条数或提高输出上限后重试');
  }
}

function safeParse(s) {
  try {
    return JSON.parse(s);
  } catch (e) {
    return null;
  }
}

/** auto 风格的跳过语义：模型对不合适推文的候选输出 SKIP */
function isSkipEntry(s) {
  return /^\s*skip\s*$/i.test(String(s || ''));
}

/** 带图请求失败时，提示可能是不支持视觉（最常见的 400 原因） */
function visionHint(prompt) {
  return prompt && prompt.images && prompt.images.length
    ? '（本次已附带推文图片；若当前模型不支持视觉，请在设置中关闭「识别推文图片」或改用视觉模型）'
    : '';
}

/** 所有代理写入经过 proxy 模块的同一队列，等待诊断恢复原状后再生成。 */
async function ensureProxy(cfg) {
  try {
    if (!XAI.proxy || !XAI.proxy.apply) return;
    // 传入 apiHost，让 custom 模式能把 AI 域名加进 bypassList（精准直连）
    await XAI.proxy.apply(
      Object.assign({}, cfg, { apiHost: XAI.proxy.extractHost(cfg.baseUrl) })
    );
  } catch (e) {
    /* 代理失败不应阻断生成，降级为默认网络 */
  }
}

/** 按 SSE 行协议读取；CRLF 即使跨 chunk 也只算一次换行。 */
async function readSSE(body, onEvent) {
  const reader = body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let event = '';
  let data = [];
  let stopped = false;
  let completed = false;

  const line = (value) => {
    if (!value) {
      if (data.length) stopped = onEvent({ event, data: data.join('\n') }) === false;
      event = '';
      data = [];
      return;
    }
    if (value.startsWith(':')) return;
    const colon = value.indexOf(':');
    const field = colon < 0 ? value : value.slice(0, colon);
    let text = colon < 0 ? '' : value.slice(colon + 1);
    if (text.startsWith(' ')) text = text.slice(1);
    if (field === 'event') event = text;
    else if (field === 'data') data.push(text);
  };

  const consume = (text, final) => {
    buffer += text;
    let start = 0;
    for (let i = 0; i < buffer.length && !stopped; i++) {
      const char = buffer[i];
      if (char !== '\r' && char !== '\n') continue;
      if (char === '\r' && i + 1 === buffer.length && !final) break;
      line(buffer.slice(start, i));
      if (char === '\r' && buffer[i + 1] === '\n') i++;
      start = i + 1;
    }
    buffer = buffer.slice(start);
  };

  try {
    while (!stopped) {
      const { done, value } = await reader.read();
      if (done) {
        completed = true;
        consume(decoder.decode(), true);
        break;
      }
      consume(decoder.decode(value, { stream: true }), false);
    }
  } finally {
    if (!completed) {
      try { await reader.cancel(); } catch (e) { /* 请求已中止 */ }
    }
    reader.releaseLock();
  }
}

function throwStreamError(obj, event) {
  if (!obj || (!obj.error && obj.type !== 'error' && event !== 'error')) return;
  const error = obj.error || obj;
  throw new Error('流式请求失败：' + (typeof error === 'string' ? error : error.message || error.type || '接口返回错误'));
}

/**
 * 流式调用（OpenAI 兼容 /chat/completions 的 SSE）。
 *
 * 为什么用流式：网络慢（尤其挂 VPN）时，非流式要等模型把 N 条全生成完
 * 才有第一个字出现，用户干等；流式下第一条约 1 秒就能看到，
 * 感知延迟大幅下降。content script -> SW 用 Port 长连接推送增量。
 *
 * @param onDelta  (fullText, meta) => void  每次收到增量时回调
 * @returns 完整文本
 */
async function callOpenAIStream(cfg, prompt, signal, onDelta) {
  const base = normalizeBase(cfg);
  const url = /\/chat\/completions$/.test(base) ? base : base + '/chat/completions';

  // 视觉：带图时 user 消息改为多模态部件数组（OpenAI 兼容格式）
  const userContentS =
    prompt.images && prompt.images.length
      ? [{ type: 'text', text: prompt.user }].concat(
          prompt.images.map((u) => ({ type: 'image_url', image_url: { url: u } }))
        )
      : prompt.user;

  const body = {
    model: cfg.model,
    messages: [
      { role: 'system', content: prompt.system },
      { role: 'user', content: userContentS },
    ],
    temperature: typeof cfg.temperature === 'number' ? cfg.temperature : 1,
    max_tokens: Number(cfg.maxTokens) || 4000,
    stream: true,
  };
  if (/bigmodel|zhipu|glm/i.test(base + ' ' + (cfg.model || ''))) {
    body.thinking = { type: cfg.disableThinking ? 'disabled' : 'enabled' };
  }

  const headers = {
    'Content-Type': 'application/json',
    Authorization: 'Bearer ' + (cfg.apiKey || ''),
  };
  if (/openrouter/i.test(base)) {
    headers['HTTP-Referer'] = 'https://github.com/xai-reply';
    headers['X-Title'] = 'RIX';
  }

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error('HTTP ' + res.status + ' ' + (safeParse(t)?.error?.message || t.slice(0, 300)) + visionHint(prompt));
  }
  if (!res.body) {
    // 极少数环境不支持流式读取 -> 退化为一次性读取
    const t = await res.text();
    if (onDelta) onDelta(t, {});
    return t;
  }

  let full = '';
  let reasoningChars = 0;

  await readSSE(res.body, ({ event, data }) => {
    if (data.trim() === '[DONE]') return false;
    const obj = safeParse(data);
    throwStreamError(obj, event);
    const ch = obj && obj.choices && obj.choices[0];
    if (!ch) return;
    throwIfOutputLimited(ch.finish_reason);

    // 同一 delta 可以同时含推理与正文，不能因推理字段跳过正文。
    const rc = ch.delta && ch.delta.reasoning_content;
    if (rc) {
      reasoningChars += rc.length;
      if (onDelta) onDelta(full, { thinking: true, reasoningChars });
    }
    const piece = ch.delta && ch.delta.content;
    if (piece) {
      full += piece;
      if (onDelta) onDelta(full, { thinking: false, chars: full.length });
    }
  });

  // 流式下 finish_reason=length 且无正文 => 同样是 max_tokens 被推理吃光
  if (!full && reasoningChars > 0) {
    throw new Error(
      '模型只输出了思考过程、没有正文（max_tokens 被 reasoning 吃光）。请把「最大生成长度」调大后重试。'
    );
  }
  return full;
}

/** Anthropic Messages 流式（event: content_block_delta） */
async function callAnthropicStream(cfg, prompt, signal, onDelta) {
  const base = normalizeBase(cfg);
  const url = /\/messages$/.test(base) ? base : base + '/messages';

  // 视觉：带图时 user 内容改为块数组（Anthropic Messages 格式，URL source）
  const userContentAS =
    prompt.images && prompt.images.length
      ? [{ type: 'text', text: prompt.user }].concat(
          prompt.images.map((u) => ({ type: 'image', source: { type: 'url', url: u } }))
        )
      : prompt.user;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': cfg.apiKey || '',
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: cfg.model,
      system: prompt.system,
      messages: [{ role: 'user', content: userContentAS }],
      max_tokens: Number(cfg.maxTokens) || 4000,
      temperature: typeof cfg.temperature === 'number' ? cfg.temperature : 1,
      stream: true,
    }),
    signal,
  });

  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error('HTTP ' + res.status + ' ' + (safeParse(t)?.error?.message || t.slice(0, 300)) + visionHint(prompt));
  }
  if (!res.body) {
    const t = await res.text();
    if (onDelta) onDelta(t, {});
    return t;
  }

  let full = '';
  await readSSE(res.body, ({ event, data }) => {
    const obj = safeParse(data);
    throwStreamError(obj, event);
    if (!obj) return;
    const type = event || obj.type;
    if (type === 'message_delta') throwIfOutputLimited(obj.delta && obj.delta.stop_reason);
    if (type === 'message_stop') return false;
    if (type === 'content_block_delta' && obj.delta && obj.delta.type === 'text_delta') {
      full += obj.delta.text || '';
      if (onDelta) onDelta(full, { thinking: false, chars: full.length });
    } else if (type === 'content_block_delta' && obj.delta && obj.delta.type === 'thinking_delta') {
      if (onDelta) onDelta(full, { thinking: true });
    }
  });
  return full;
}

/* ================================================================== *
 * 对外：生成入口
 * ================================================================== */

async function handleGenerate(payload = {}) {
  const tweet = payload.tweet || {};
  const extra = payload.extra || {};
  const taskId = payload.taskId || U.uid();

  const controller = new AbortController();
  inflight.set(taskId, controller);

  let timer;
  const started = Date.now();
  try {
    // 任务必须在第一次 await 之前登记，配置读取期间也接受取消。
    const cfg = await XAI.getConfig();
    throwIfAborted(controller.signal);
    if (!cfg.enabled) throw new Error('插件已在设置中停用');
    if (!cfg.apiKey) throw new Error('未配置 API Key，请点击扩展图标打开设置');
    timer = setTimeout(() => controller.abort(), (Number(cfg.timeoutSec) || 90) * 1000);
    const prompt = buildPrompt(tweet, cfg, extra);
    const fn = cfg.provider === 'anthropic' ? callAnthropic : callOpenAI;
    await ensureProxy(cfg);
    throwIfAborted(controller.signal);
    const raw = await fn(cfg, prompt, controller.signal);

    const parsed = U.parseReplyList(raw, prompt.n);
    if (!parsed.length) {
      throw new Error('未能从模型输出中解析出回复内容。原始输出：' + String(raw).slice(0, 200));
    }
    // auto 风格：过滤模型按规则输出的 SKIP 条目，全 SKIP 时给出明确提示
    const list = parsed.filter((x) => !isSkipEntry(x));
    if (!list.length) {
      throw new Error('这条推文按「自动」风格规则被跳过了（内容模糊或立场不符），换个风格试试。');
    }

    return {
      list: list,
      raw: raw,
      elapsedMs: Date.now() - started,
      model: cfg.model,
    };
  } catch (e) {
    if (e && (e.name === 'AbortError' || /abort/i.test(String(e.message || '')))) {
      throw new Error('已中止');
    }
    throw e;
  } finally {
    clearTimeout(timer);
    if (inflight.get(taskId) === controller) inflight.delete(taskId);
  }
}

/**
 * 流式生成（Port 长连接）。
 * 消息协议：content -> SW { taskId, tweet, extra }
 *          SW -> content { type:'delta'|'thinking'|'done'|'error', ... }
 */
async function handleGenerateStream(port, payload = {}) {
  const tweet = payload.tweet || {};
  const extra = payload.extra || {};
  const taskId = payload.taskId || U.uid();

  const controller = new AbortController();
  inflight.set(taskId, controller);
  let timer;
  const started = Date.now();
  const onDisconnect = () => controller.abort();

  const send = (msg) => {
    try {
      port.postMessage(msg);
    } catch (e) {
      /* 面板已断开 */
    }
  };

  try {
    // 在读取配置前监听断开，避免面板已关闭后仍然启动收费请求。
    port.onDisconnect.addListener(onDisconnect);
    const cfg = await XAI.getConfig();
    throwIfAborted(controller.signal);
    if (!cfg.enabled) throw new Error('插件已在设置中停用');
    if (!cfg.apiKey) throw new Error('未配置 API Key，请点击扩展图标打开设置');
    timer = setTimeout(() => controller.abort(), (Number(cfg.timeoutSec) || 90) * 1000);

    const prompt = buildPrompt(tweet, cfg, extra);

    const onDelta = (full, meta) => {
      if (meta && meta.thinking) send({ type: 'thinking' });
      else send({ type: 'delta', text: full });
    };

    const fnStream = cfg.provider === 'anthropic' ? callAnthropicStream : callOpenAIStream;
    await ensureProxy(cfg);
    throwIfAborted(controller.signal);
    const raw = await fnStream(cfg, prompt, controller.signal, onDelta);

    const parsed = U.parseReplyList(raw, prompt.n);
    if (!parsed.length) {
      throw new Error('未能从模型输出中解析出回复内容。原始输出：' + String(raw).slice(0, 200));
    }
    // auto 风格：过滤模型按规则输出的 SKIP 条目，全 SKIP 时给出明确提示
    const list = parsed.filter((x) => !isSkipEntry(x));
    if (!list.length) {
      throw new Error('这条推文按「自动」风格规则被跳过了（内容模糊或立场不符），换个风格试试。');
    }

    send({
      type: 'done',
      list,
      raw,
      elapsedMs: Date.now() - started,
      model: cfg.model,
    });
  } catch (e) {
    const aborted = e && (e.name === 'AbortError' || /abort/i.test(String(e.message || '')));
    send({ type: 'error', error: aborted ? '已中止' : String((e && e.message) || e) });
  } finally {
    clearTimeout(timer);
    if (inflight.get(taskId) === controller) inflight.delete(taskId);
    port.onDisconnect.removeListener(onDisconnect);
  }
}

/** 设置页「测试连接」 */
async function handleTest(cfgIn) {
  const cfg = cfgIn ? Object.assign(await XAI.getConfig(), cfgIn) : await XAI.getConfig();
  if (!cfg.apiKey) throw new Error('请先填写 API Key');

  const fake = {
    author: '测试',
    handle: '@test',
    text: '今天天气不错，适合写代码。',
    media: [],
  };
  const prompt = buildPrompt(fake, cfg, { count: 1 });
  const fn = cfg.provider === 'anthropic' ? callAnthropic : callOpenAI;

  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), (Number(cfg.timeoutSec) || 60) * 1000);
  try {
    const raw = await fn(cfg, prompt, ctl.signal);
    const list = U.parseReplyList(raw, 1);
    return { ok: true, sample: list[0] || raw.slice(0, 120) };
  } finally {
    clearTimeout(t);
  }
}

chrome.runtime.onInstalled.addListener(async (d) => {
  if (d.reason === 'install') {
    await chrome.storage.local.set({ [XAI.storageKey]: XAI.defaults });
    chrome.tabs.create({ url: chrome.runtime.getURL('src/options/options.html') + '#welcome' });
  }
});

/* ================================================================== *
 * 安全网：不要永久霸占用户的代理设置
 *
 * chrome.proxy 改的是浏览器全局规则。如果用户选了 direct/custom，
 * 之后停用或卸载了扩展，设置可能残留，导致浏览器一直不走代理。
 * 所以在以下时机主动交还控制权：
 *   - 扩展停用时（onSuspend / onStartup 时若配置已停用）
 *   - 用户把模式切回 auto
 * ================================================================== */

chrome.runtime.onStartup.addListener(async () => {
  try {
    const cfg = await XAI.getConfig();
    // 已停用或回到 auto：确保没有残留的全局代理设置
    if (!cfg.enabled || (cfg.proxyMode || 'auto') === 'auto') {
      await XAI.proxy.clear();
    }
  } catch (e) {
    /* noop */
  }
});

chrome.runtime.onSuspend.addListener(() => {
  // SW 即将休眠，交还控制权（下次需要时 ensureProxy 会重新应用）
  // 注意：只在 auto/停用时清理，避免用户 custom 配置被频繁打断
  XAI.getConfig()
    .then((cfg) => {
      if (!cfg.enabled || (cfg.proxyMode || 'auto') === 'auto') return XAI.proxy.clear();
    })
    .catch(() => {});
});
