/** Offline regressions: load the real worker and proxy code; every browser API and fetch is mocked. */
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const copy = (value) => JSON.parse(JSON.stringify(value));
const tests = [];
const test = (name, run) => tests.push({ name, run });
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

function event() {
  const listeners = new Set();
  return {
    addListener: (fn) => listeners.add(fn),
    removeListener: (fn) => listeners.delete(fn),
    emit: (...args) => [...listeners].map((fn) => fn(...args)),
    get size() { return listeners.size; },
  };
}

function makePort() {
  return {
    name: 'xai:generate', disconnected: false, messages: [],
    onMessage: event(), onDisconnect: event(),
    postMessage(message) {
      if (this.disconnected) throw new Error('Port disconnected');
      this.messages.push(copy(message));
    },
    disconnect() {
      this.disconnected = true;
      this.onDisconnect.emit();
    },
  };
}

function streamResponse(text, chunkSize = 1) {
  const bytes = Buffer.from(text);
  const chunks = [];
  for (let i = 0; i < bytes.length; i += chunkSize) chunks.push(bytes.subarray(i, i + chunkSize));
  const state = { cancelled: 0, released: 0 };
  return {
    ok: true, status: 200, state,
    body: { getReader: () => ({
      async read() { return chunks.length ? { done: false, value: chunks.shift() } : { done: true }; },
      async cancel() { state.cancelled++; chunks.length = 0; },
      releaseLock() { state.released++; },
    }) },
  };
}

function environment({ value = { mode: 'system' }, owned = false, level, config = {} } = {}) {
  const base = copy(value);
  const state = {
    current: copy(value), level: level || (owned ? 'controlled_by_this_extension' : 'controllable_by_this_extension'),
    operations: [], fetches: [], storage: { xai_config: { apiKey: 'mock-key', baseUrl: 'https://api.example.test/v1', ...config } },
    failSet: false, failStorage: false,
  };
  const runtime = Object.fromEntries(['onMessage', 'onConnect', 'onInstalled', 'onStartup', 'onSuspend'].map((name) => [name, event()]));
  runtime.getURL = (url) => 'chrome-extension://mock/' + url;
  const chrome = {
    runtime,
    tabs: { create() {} },
    storage: { local: {
      async get(key) { return { [key]: copy(state.storage[key] || {}) }; },
      async set(bag) {
        if (state.failStorage) throw new Error('storage failed');
        Object.assign(state.storage, copy(bag));
      },
    } },
    proxy: { settings: {
      async get() { return { value: copy(state.current), levelOfControl: state.level }; },
      async set({ value: next, scope }) {
        state.operations.push({ op: 'set', value: copy(next), scope });
        if (state.failSet) { state.failSet = false; throw new Error('proxy set failed'); }
        state.current = copy(next);
        state.level = 'controlled_by_this_extension';
      },
      async clear() {
        state.operations.push({ op: 'clear' });
        state.current = copy(base);
        state.level = 'controllable_by_this_extension';
      },
    } },
  };
  const sandbox = { chrome, console, TextDecoder, AbortController, setTimeout, clearTimeout };
  sandbox.self = sandbox;
  sandbox.fetch = async (url, options) => {
    state.fetches.push({ url, options, proxy: copy(state.current) });
    if (!state.fetch) throw new Error('Unexpected mock fetch: ' + url);
    return state.fetch(url, options);
  };
  vm.createContext(sandbox);
  const load = (file) => vm.runInContext(fs.readFileSync(file, 'utf8'), sandbox, { filename: file });
  sandbox.importScripts = (...files) => files.forEach((file) => load(path.resolve(root, 'src/background', file)));
  load(path.join(root, 'src/background/service-worker.js'));
  const call = (name, ...args) => vm.runInContext(name, sandbox)(...args);
  const message = (payload) => new Promise((resolve, reject) => {
    const handled = runtime.onMessage.emit(payload, { id: 'mock-extension' }, resolve);
    if (!handled.some(Boolean)) reject(new Error('Message not handled: ' + payload.type));
  });
  return { state, sandbox, call, message, proxy: sandbox.XAI.proxy, XAI: sandbox.XAI };
}

const fixed = {
  mode: 'fixed_servers', rules: {
    proxyForHttp: { scheme: 'http', host: 'proxy.example.test', port: 8080 },
    proxyForHttps: { scheme: 'socks5', host: 'secure-proxy.example.test', port: 1080 },
    fallbackProxy: { scheme: 'http', host: 'fallback.example.test', port: 8081 },
    bypassList: ['*.internal.example.test'],
  },
};
const cfg = { proxyMode: 'auto', baseUrl: 'https://api.example.test/v1', apiKey: 'mock-key' };
const prompt = { system: 'test', user: 'test', n: 1 };
const openEvent = (content) => 'data: ' + JSON.stringify({ choices: [{ delta: { content } }] }) + '\n\n';
const anthropicEvent = (text) => 'event: content_block_delta\ndata: ' + JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text } }) + '\n\n';

test('auto clears this extension instead of setting system', async () => {
  const env = environment({ value: { mode: 'pac_script', pacScript: { url: 'https://proxy.example.test/pac' } } });
  const result = await env.proxy.apply(cfg);
  assert.equal(result.ok, true);
  assert.equal(result.scope, 'none');
  assert.deepEqual(env.state.operations, [{ op: 'clear' }]);
  assert.equal(env.state.current.mode, 'pac_script');
});

test('fixed-server diagnosis preserves every other route and restores exact owned rules', async () => {
  const env = environment({ value: fixed, owned: true });
  env.state.fetch = async () => ({ status: 200 });
  const results = await env.proxy.diagnose(cfg);
  assert.equal(results.length, 2);
  const temporary = copy(fixed);
  temporary.rules.bypassList.push('api.example.test');
  assert.deepEqual(env.state.fetches[1].proxy, temporary);
  assert.deepEqual(env.state.current, fixed);
  assert.deepEqual(env.state.operations.map((op) => op.op), ['set', 'set']);
});

test('diagnosis clears its temporary override when the original rules were external', async () => {
  const env = environment({ value: fixed });
  env.state.fetch = async () => ({ status: 200 });
  await env.proxy.diagnose(cfg);
  assert.deepEqual(env.state.operations.map((op) => op.op), ['set', 'clear']);
  assert.deepEqual(env.state.current, fixed);
});

for (const value of [{ mode: 'system' }, { mode: 'pac_script', pacScript: { data: 'function FindProxyForURL(){return "DIRECT";}' } }, { mode: 'direct' }]) {
  test('diagnosis skips unsafe rewriting of ' + value.mode, async () => {
    const env = environment({ value });
    env.state.fetch = async () => ({ status: 200 });
    const results = await env.proxy.diagnose(cfg);
    assert.equal(env.state.fetches.length, 1);
    assert.equal(results[1].skipped, true);
    assert.match(results[1].err, /未执行直连对比.*未更改浏览器代理/);
    assert.deepEqual(env.state.operations, []);
  });
}

test('diagnosis never changes rules controlled by another extension', async () => {
  const env = environment({ value: fixed, level: 'controlled_by_other_extensions' });
  env.state.fetch = async () => ({ status: 200 });
  const result = await env.proxy.diagnose(cfg);
  assert.equal(result[1].skipped, true);
  assert.deepEqual(env.state.operations, []);
});

test('failed direct probe still restores original rules', async () => {
  const env = environment({ value: fixed, owned: true });
  env.state.fetch = async () => {
    if (env.state.fetches.length === 2) throw new Error('mock network failure');
    return { status: 200 };
  };
  const result = await env.proxy.diagnose(cfg);
  assert.equal(result[1].ok, false);
  assert.deepEqual(env.state.current, fixed);
});

test('failed temporary write restores ownership and does not poison the proxy queue', async () => {
  const env = environment({ value: fixed });
  env.state.fetch = async () => ({ status: 200 });
  env.state.failSet = true;
  await assert.rejects(env.proxy.diagnose(cfg), /proxy set failed/);
  assert.deepEqual(env.state.operations.map((op) => op.op), ['set', 'clear']);
  assert.equal((await env.proxy.apply(cfg)).ok, true);
});

for (const operation of ['apply', 'clear']) {
  test(operation + ' waits for diagnosis restoration before changing proxy rules', async () => {
    const env = environment({ value: fixed, owned: true });
    const entered = deferred();
    const release = deferred();
    env.state.fetch = async () => {
      if (env.state.fetches.length === 2) { entered.resolve(); await release.promise; }
      return { status: 200 };
    };
    const diagnosis = env.proxy.diagnose(cfg);
    await entered.promise;
    const next = operation === 'clear' ? env.proxy.clear() : env.proxy.apply({ proxyMode: 'custom', proxyHost: 'new-proxy.example.test', proxyPort: 9090 });
    await Promise.resolve();
    assert.equal(env.state.operations.length, 1);
    release.resolve();
    await diagnosis;
    await next;
    assert.equal(env.state.operations[1].value.rules.proxyForHttps.host, 'secure-proxy.example.test');
    assert.equal(env.state.operations[2].op, operation === 'clear' ? 'clear' : 'set');
    if (operation === 'apply') assert.equal(env.state.current.rules.singleProxy.host, 'new-proxy.example.test');
  });
}

for (const [name, makeEvent, end] of [
  ['callOpenAIStream', openEvent, 'data: [DONE]\n\n'],
  ['callAnthropicStream', anthropicEvent, 'event: message_stop\ndata: {"type":"message_stop"}\n\n'],
]) {
  for (const [label, eol] of [['LF', '\n'], ['CRLF', '\r\n'], ['CR', '\r']]) {
    test(name + ' parses ' + label + ', split UTF-8, and event boundaries', async () => {
      const env = environment();
      const wire = (': ping\n\n' + makeEvent('["你') + makeEvent('好"]') + end).replace(/\n/g, eol);
      for (const size of [1, 2, 7, Buffer.byteLength(wire)]) {
        const response = streamResponse(wire, size);
        env.state.fetch = async () => response;
        const deltas = [];
        const result = await env.call(name, cfg, prompt, undefined, (text) => deltas.push(text));
        assert.equal(result, '["你好"]');
        assert.equal(deltas.at(-1), result);
        assert.equal(response.state.released, 1);
      }
    });
  }

  test(name + ' propagates an in-stream error after partial text', async () => {
    const env = environment();
    const response = streamResponse(makeEvent('["unfinished') + 'event: error\ndata: {"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}\n\n');
    env.state.fetch = async () => response;
    await assert.rejects(env.call(name, cfg, prompt), /Overloaded/);
    assert.equal(response.state.cancelled, 1);
    assert.equal(response.state.released, 1);
  });

  test(name + ' ignores an event without its terminating blank line', async () => {
    const env = environment();
    env.state.fetch = async () => streamResponse(makeEvent('["incomplete"]').replace(/\n\n$/, '\n'));
    assert.equal(await env.call(name, cfg, prompt), '');
  });
}

test('OpenAI combines multiline data fields and keeps content alongside reasoning', async () => {
  const env = environment();
  env.state.fetch = async () => streamResponse('data: {"choices":\r\ndata: [{"delta":{"reasoning_content":"thinking","content":"[\\"reply\\"]"}}]}\r\n\r\ndata: [DONE]\r\n\r\n');
  assert.equal(await env.call('callOpenAIStream', cfg, prompt), '["reply"]');
});

for (const name of ['callOpenAI', 'callAnthropic', 'callOpenAIStream', 'callAnthropicStream']) {
  test(name + ' preserves HTTP status and a non-JSON error body', async () => {
    const env = environment();
    env.state.fetch = async () => ({ ok: false, status: 502, text: async () => '<html>Bad gateway</html>' });
    await assert.rejects(env.call(name, cfg, prompt), /HTTP 502 <html>Bad gateway<\/html>/);
  });
}

test('non-stream cancellation while config is loading prevents proxy writes and API calls', async () => {
  const env = environment();
  const ready = deferred();
  const actual = await env.XAI.getConfig();
  env.XAI.getConfig = () => ready.promise;
  const generation = env.call('handleGenerate', { taskId: 'loading', tweet: { text: 'test' } });
  env.sandbox.chrome.runtime.onMessage.emit({ type: 'xai:cancel', payload: { taskId: 'loading' } }, {}, () => {});
  ready.resolve(actual);
  await assert.rejects(generation, /已中止/);
  assert.equal(env.state.fetches.length, 0);
  assert.equal(env.state.operations.length, 0);
  assert.equal(vm.runInContext('inflight.size', env.sandbox), 0);
});

for (const cancel of ['disconnect', 'message']) {
  test('stream ' + cancel + ' while config is loading prevents API calls', async () => {
    const env = environment();
    const ready = deferred();
    const actual = await env.XAI.getConfig();
    env.XAI.getConfig = () => ready.promise;
    const port = makePort();
    const generation = env.call('handleGenerateStream', port, { taskId: 'loading', tweet: { text: 'test' } });
    assert.equal(port.onDisconnect.size, 1);
    if (cancel === 'disconnect') port.disconnect();
    else env.sandbox.chrome.runtime.onMessage.emit({ type: 'xai:cancel', payload: { taskId: 'loading' } }, {}, () => {});
    ready.resolve(actual);
    await generation;
    assert.equal(env.state.fetches.length, 0);
    assert.equal(env.state.operations.length, 0);
    assert.equal(port.onDisconnect.size, 0);
    assert.equal(vm.runInContext('inflight.size', env.sandbox), 0);
    if (cancel === 'message') assert.equal(port.messages.at(-1).error, '已中止');
  });
}

test('cancellation while waiting for diagnosis never starts a generation request', async () => {
  const env = environment({ value: fixed, owned: true });
  const entered = deferred();
  const release = deferred();
  env.state.fetch = async () => {
    assert.match(env.state.fetches.at(-1).url, /\/models$/);
    if (env.state.fetches.length === 2) { entered.resolve(); await release.promise; }
    return { status: 200 };
  };
  const diagnosis = env.proxy.diagnose(cfg);
  await entered.promise;
  const port = makePort();
  const generation = env.call('handleGenerateStream', port, { taskId: 'waiting', tweet: { text: 'test' } });
  await Promise.resolve();
  port.disconnect();
  release.resolve();
  await diagnosis;
  await generation;
  assert.equal(env.state.fetches.length, 2);
});

test('actual worker config messages save fields, reset defaults, and clear proxy after reset', async () => {
  const env = environment({ value: fixed, owned: true });
  const saved = await env.message({ type: 'xai:setConfig', payload: { model: 'new-model', unknownField: true } });
  assert.equal(saved.ok, true);
  assert.equal(saved.data.model, 'new-model');
  assert.equal(saved.data.unknownField, undefined);
  assert.equal(env.state.operations.length, 0);
  const reset = await env.message({ type: 'xai:resetConfig' });
  assert.equal(reset.ok, true);
  assert.deepEqual(copy(reset.data), copy(env.XAI.defaults));
  assert.deepEqual(env.state.operations.map((op) => op.op), ['clear']);
});

test('worker clears old proxy overrides when saving auto or disabling generation', async () => {
  const env = environment({ value: fixed, owned: true });
  assert.equal((await env.message({ type: 'xai:setConfig', payload: { proxyMode: 'auto' } })).ok, true);
  assert.equal((await env.message({ type: 'xai:setConfig', payload: { enabled: false } })).ok, true);
  assert.deepEqual(env.state.operations.map((op) => op.op), ['clear', 'clear']);
});

test('failed config reset returns an error without clearing proxy, and later writes still work', async () => {
  const env = environment();
  env.state.failStorage = true;
  const result = await env.message({ type: 'xai:resetConfig' });
  assert.equal(result.ok, false);
  assert.match(result.error, /storage failed/);
  assert.deepEqual(env.state.operations, []);
  env.state.failStorage = false;
  assert.equal((await env.message({ type: 'xai:setConfig', payload: { model: 'retry' } })).data.model, 'retry');
});

(async () => {
  let passed = 0;
  for (const { name, run } of tests) {
    try {
      await run();
      passed++;
      console.log('  PASS ' + name);
    } catch (error) {
      console.error('  FAIL ' + name + '\n' + error.stack);
      process.exitCode = 1;
    }
  }
  console.log('\nNetwork regressions: ' + passed + '/' + tests.length + ' passed (offline mocks only).');
})().catch((error) => { console.error(error); process.exitCode = 1; });
