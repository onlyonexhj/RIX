/** Settings regression tests: real page handlers, mocked Chrome APIs, no network or proxy writes. */
'use strict';
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = fs.existsSync(path.join(process.cwd(), 'manifest.json'))
  ? process.cwd() : path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

async function flush() {
  for (let i = 0; i < 35; i++) await Promise.resolve();
}

function deferred() {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
}

async function page(initial) {
  const elements = {};
  const listeners = {};
  const timers = new Map();
  const state = {
    config: {}, patches: [], messages: [], applied: [], clears: 0, resets: 0,
    confirmations: [], confirm: true, permissionGranted: true,
    permissions: [], allowed: new Set(), inGesture: false, writeGate: null, permissionGate: null,
    diagnostics: [{ label: '当前网络设置', ok: true, ms: 12, status: 200 }],
  };
  let timerId = 0;
  let now = 0;
  let workerTail = Promise.resolve();
  for (const match of read('src/options/options.html').matchAll(/<(input|select|textarea|button|span|p|div|pre)[^>]*\bid="([^"]+)"[^>]*>/g)) {
    let value = '';
    elements[match[2]] = {
      id: match[2], tagName: match[1].toUpperCase(),
      type: (match[0].match(/type="([^"]+)"/) || [])[1] || '',
      style: {}, checked: false, disabled: false, textContent: '', innerHTML: '',
      get value() { return value; }, set value(next) { value = String(next); },
      addEventListener(event, handler) { (listeners[this.id + ':' + event] ||= []).push(handler); },
      focus() {}, scrollIntoView() {}, setSelectionRange() {},
      insertAdjacentHTML(position, html) { this.innerHTML += html; },
    };
  }
  function queued(operation) {
    const pending = workerTail.then(operation);
    workerTail = pending.catch(() => {});
    return pending;
  }
  const chrome = {
    storage: { local: { get: async (key) => ({ [key]: structuredClone(state.config) }) } },
    runtime: {
      sendMessage(message) {
        state.messages.push(structuredClone(message));
        if (message.type === 'xai:setConfig') {
          state.patches.push(structuredClone(message.payload));
          return queued(async () => {
            if (state.writeGate) await state.writeGate.promise;
            Object.assign(state.config, structuredClone(message.payload));
            return { ok: true, data: structuredClone(state.config) };
          });
        }
        if (message.type === 'xai:resetConfig') {
          return queued(async () => {
            state.resets++;
            state.clears++;
            state.config = structuredClone(context.window.XAI.defaults);
            return { ok: true, data: structuredClone(state.config) };
          });
        }
        if (message.type === 'xai:proxyApply') {
          state.applied.push(structuredClone(state.config));
          return Promise.resolve({ ok: true, data: {
            ok: true, message: 'mock applied',
            scope: state.config.proxyMode === 'direct' ? 'global' : 'partial',
          } });
        }
        if (message.type === 'xai:proxyClear') {
          state.clears++;
          return Promise.resolve({ ok: true, data: { ok: true, message: 'mock cleared' } });
        }
        if (message.type === 'xai:proxyGet') {
          return Promise.resolve({ ok: true, data: { ok: true, desc: 'mock current proxy' } });
        }
        if (message.type === 'xai:proxyDiagnose') return Promise.resolve({ ok: true, data: state.diagnostics });
        if (message.type === 'xai:test') return Promise.resolve({ ok: true, data: { sample: 'mock reply' } });
        throw new Error('Unexpected message: ' + message.type);
      },
    },
    permissions: {
      contains(details) {
        state.permissions.push({ type: 'contains', inGesture: state.inGesture, details });
        return Promise.resolve(state.allowed.has(details.origins[0]));
      },
      request(details) {
        state.permissions.push({ type: 'request', inGesture: state.inGesture, details });
        assert.equal(state.inGesture, true, 'permission request must start during the user gesture');
        return Promise.resolve(state.permissionGate && state.permissionGate.promise).then(() => {
          if (state.permissionGranted) state.allowed.add(details.origins[0]);
          return state.permissionGranted;
        });
      },
    },
  };
  const context = {
    console, URL, chrome, window: {}, document: { getElementById: (id) => elements[id] },
    location: { hash: '' }, navigator: { clipboard: { writeText: async () => {} } },
    confirm(text) { state.confirmations.push(text); return state.confirm; },
    setTimeout(fn, delay) { timers.set(++timerId, { fn, at: now + delay }); return timerId; },
    clearTimeout(id) { timers.delete(id); }, setInterval() { return 0; }, clearInterval() {},
  };
  vm.createContext(context);
  for (const file of ['src/shared/config.js', 'src/shared/utils.js', 'src/shared/prompt.js']) {
    vm.runInContext(read(file), context, { filename: file });
  }
  state.config = Object.assign(structuredClone(context.window.XAI.defaults), { apiKey: 'FAKE_TEST_KEY' }, initial);
  vm.runInContext(read('src/options/options.js'), context, { filename: 'src/options/options.js' });
  await flush();
  async function trigger(id, type = 'change') {
    state.inGesture = true;
    let results;
    try { results = (listeners[id + ':' + type] || []).map((handler) => handler({ target: elements[id] })); }
    finally { state.inGesture = false; }
    await Promise.all(results);
  }
  async function advance(ms) {
    const end = now + ms;
    while (true) {
      const entry = [...timers].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!entry) break;
      timers.delete(entry[0]);
      now = entry[1].at;
      entry[1].fn();
      await flush();
    }
    now = end;
    await flush();
  }
  return { elements, state, trigger, click: (id) => trigger(id, 'click'), advance };
}

const tests = [];
function test(name, run) { tests.push({ name, run }); }
const proxyFields = ['proxyMode', 'proxyHost', 'proxyPort', 'proxyScheme'];

for (const mode of ['direct', 'custom']) {
  test(mode + ' draft stays out of autosave, save, test, diagnostics, and cancelled apply', async () => {
    const p = await page();
    Object.assign(p.elements.proxyMode, { value: mode });
    p.elements.proxyHost.value = '127.0.0.1';
    p.elements.proxyPort.value = '7890';
    p.elements.proxyScheme.value = 'socks5';
    for (const field of proxyFields) await p.trigger(field);
    await p.advance(650);
    assert.equal(p.state.patches.length, 0, 'proxy-only edits must not schedule saves');
    p.elements.style.value = 'sharp';
    await p.trigger('style');
    await p.advance(650);
    await p.click('save');
    await p.click('test');
    await p.click('proxyDiag');
    p.state.confirm = false;
    await p.click('proxyApply');
    assert.equal(p.state.config.proxyMode, 'auto');
    assert.equal(p.state.config.proxyHost, '');
    assert.equal(p.state.config.proxyPort, 0);
    assert.equal(p.state.config.proxyScheme, 'http');
    assert.equal(p.state.applied.length, 0);
    assert.ok(p.state.patches.every((patch) => proxyFields.every((field) => !(field in patch))));
    assert.match(p.elements.proxyState.textContent, /已取消/);
  });
}

test('confirmed custom apply saves all proxy fields and describes its browser-wide impact', async () => {
  const p = await page();
  p.elements.proxyMode.value = 'custom';
  p.elements.proxyHost.value = '127.0.0.1';
  p.elements.proxyPort.value = '7890';
  p.elements.proxyScheme.value = 'socks5';
  await p.click('proxyApply');
  assert.equal(p.state.applied.length, 1);
  assert.equal(p.state.config.proxyMode, 'custom');
  assert.equal(p.state.config.proxyHost, '127.0.0.1');
  assert.equal(p.state.config.proxyPort, 7890);
  assert.equal(p.state.config.proxyScheme, 'socks5');
  assert.match(p.state.confirmations[0], /整个浏览器/);
  assert.match(p.state.confirmations[0], /PAC/);
});

test('restore proxy defaults clears control without first applying the dangerous draft', async () => {
  const p = await page({ proxyMode: 'direct' });
  p.elements.proxyMode.value = 'custom';
  await p.click('proxyClear');
  assert.equal(p.state.config.proxyMode, 'auto');
  assert.equal(p.state.applied.length, 0);
  assert.equal(p.state.clears, 1);
});

test('normal save preserves another page\'s automatic-generation setting', async () => {
  const p = await page();
  p.state.config.autoGenerate = false; // A popup saved this after the options page opened.
  p.elements.style.value = 'pro';
  await p.click('save');
  assert.equal(p.state.config.autoGenerate, false);
  assert.equal(p.state.config.style, 'pro');
  assert.deepEqual(p.state.patches, [{ style: 'pro' }]);
});

test('a change reverted while its first save is pending still persists the latest value', async () => {
  const p = await page();
  const gate = deferred();
  p.state.writeGate = gate;
  p.elements.style.value = 'pro';
  const first = p.click('save');
  await flush();
  p.elements.style.value = 'auto';
  const second = p.click('save');
  gate.resolve();
  await Promise.all([first, second]);
  assert.equal(p.state.config.style, 'auto');
  assert.deepEqual(p.state.patches, [{ style: 'pro' }, { style: 'auto' }]);
});

test('reset cancels debounce, waits for an in-flight save, and clears the old form', async () => {
  const p = await page();
  p.elements.apiKey.value = 'FAKE_OLD_FORM_KEY';
  await p.trigger('apiKey', 'input');
  const gate = deferred();
  p.state.writeGate = gate;
  const saving = p.click('save');
  await flush();
  const resetting = p.click('reset');
  await flush();
  assert.equal(p.state.resets, 0, 'reset must wait for the old save');
  assert.equal(p.elements.apiKey.value, '', 'old key must immediately leave the form');
  gate.resolve();
  await Promise.all([saving, resetting]);
  await p.advance(1000);
  assert.equal(p.state.resets, 1);
  assert.equal(p.state.config.apiKey, '');
  assert.equal(p.elements.apiKey.value, '');
  assert.equal(p.state.clears, 1);
  await p.click('save');
  assert.equal(p.state.config.apiKey, '', 'later normal saves must not resurrect the key');
});

test('reset before the 600ms autosave leaves the key empty after the debounce deadline', async () => {
  const p = await page();
  p.elements.apiKey.value = 'FAKE_PENDING_KEY';
  await p.trigger('apiKey', 'input');
  await p.click('reset');
  await p.advance(850);
  assert.equal(p.state.config.apiKey, '');
  assert.equal(p.elements.apiKey.value, '');
  assert.equal(p.state.patches.some((patch) => patch.apiKey === 'FAKE_PENDING_KEY'), false);
});

test('Claude to custom selects OpenAI protocol and preserves the entered key', async () => {
  const p = await page();
  p.elements.preset.value = 'anthropic';
  await p.trigger('preset');
  p.elements.preset.value = 'custom';
  await p.trigger('preset');
  p.elements.baseUrl.value = 'https://custom.example.test/v1';
  p.elements.model.value = 'custom-model';
  await p.click('save');
  assert.equal(p.state.config.provider, 'openai');
  assert.equal(p.state.config.apiKey, 'FAKE_TEST_KEY');
});

test('custom host permission starts in the click gesture before saving or testing', async () => {
  const p = await page();
  p.elements.baseUrl.value = 'http://localhost:11434/v1/';
  const pending = p.click('test');
  assert.deepEqual(p.state.permissions.map((call) => call.type), ['contains', 'request']);
  assert.ok(p.state.permissions.every((call) => call.inGesture));
  assert.equal(p.state.messages.some((message) => message.type === 'xai:test'), false);
  await pending;
  assert.equal(p.state.permissions[1].details.origins[0], 'http://localhost/*');
  assert.ok(p.state.allowed.has('http://localhost/*'), 'permission remains available for later generation');
  assert.equal(p.state.config.baseUrl, 'http://localhost:11434/v1');
  assert.equal(p.state.messages.filter((message) => message.type === 'xai:test').length, 1);
});

test('a permission result arriving after reset cannot start an old connection test', async () => {
  const p = await page();
  const gate = deferred();
  p.state.permissionGate = gate;
  const testing = p.click('test');
  await flush();
  await p.click('reset');
  gate.resolve();
  await testing;
  assert.equal(p.state.config.apiKey, '');
  assert.equal(p.state.messages.some((message) => message.type === 'xai:test'), false);
});

for (const button of ['test', 'proxyDiag']) {
  test(button + ' does not call the API after a permission denial', async () => {
    const p = await page();
    p.elements.baseUrl.value = 'https://private.example.test/v1';
    p.state.permissionGranted = false;
    await p.click(button);
    assert.equal(p.state.messages.some((message) => ['xai:test', 'xai:proxyDiagnose'].includes(message.type)), false);
    assert.match(button === 'test' ? p.elements.testOut.textContent : p.elements.diagOut.innerHTML, /未获准访问 API 域名/);
  });
}

test('skipped direct diagnostics show the explanation without reporting a failed connection', async () => {
  const p = await page();
  p.state.diagnostics.push({ label: 'API 直连', skipped: true, ok: null, ms: 0, status: 0, err: '无法安全保留 <PAC>；未更改代理' });
  await p.click('proxyDiag');
  assert.match(p.elements.diagOut.innerHTML, /未执行/);
  assert.match(p.elements.diagOut.innerHTML, /无法安全保留 &lt;PAC&gt;/);
  assert.doesNotMatch(p.elements.diagOut.innerHTML, /不可达|数值越小越快/);
});

(async () => {
  let failed = 0;
  for (const item of tests) {
    try { await item.run(); console.log('PASS ' + item.name); }
    catch (error) { failed++; console.error('FAIL ' + item.name + '\n' + error.stack); }
  }
  console.log((tests.length - failed) + '/' + tests.length + ' settings regressions passed');
  process.exitCode = failed ? 1 : 0;
})();
