'use strict';

const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const source = fs.readFileSync(path.join(__dirname, '../src/shared/config.js'), 'utf8');
const clone = (v) => JSON.parse(JSON.stringify(v));
const nextTurn = () => new Promise((resolve) => setImmediate(resolve));
let passed = 0;

async function check(name, fn) {
  await fn();
  passed++;
  console.log('PASS ' + name);
}

function setup() {
  let stored = { autoGenerate: true, style: 'auto', count: 3 };
  let rejectWrite = false;
  let concurrentWrites = 0;
  let maxConcurrentWrites = 0;
  const storage = {
    async get(key) {
      const snapshot = clone(stored);
      await nextTurn();
      return { [key]: snapshot };
    },
    async set(bag) {
      concurrentWrites++;
      maxConcurrentWrites = Math.max(maxConcurrentWrites, concurrentWrites);
      try {
        await nextTurn();
        if (rejectWrite) {
          rejectWrite = false;
          throw new Error('write failed');
        }
        stored = clone(bag.xai_config);
      } finally {
        concurrentWrites--;
      }
    },
  };
  const worker = { self: {}, chrome: { storage: { local: storage } } };
  vm.createContext(worker);
  vm.runInContext(source, worker);
  const messages = [];
  function createPage() {
    const page = { window: {}, chrome: {
      storage: { local: { get: storage.get, set() { throw new Error('page must not write storage'); } } },
      runtime: { async sendMessage(msg) {
        messages.push(msg.type);
        try {
          const data = msg.type === 'xai:resetConfig'
            ? await worker.self.XAI.resetConfig()
            : await worker.self.XAI.setConfig(msg.payload);
          return { ok: true, data };
        } catch (e) {
          return { ok: false, error: e.message };
        }
      } },
    } };
    vm.createContext(page);
    vm.runInContext(source, page);
    return page.window.XAI;
  }
  return {
    worker: worker.self.XAI, createPage, messages,
    stored: () => clone(stored), maxWrites: () => maxConcurrentWrites,
    failNext: () => { rejectWrite = true; },
  };
}

(async () => {
  await check('并发补丁保留所有字段且不撤销自动生成开关', async () => {
    const s = setup();
    await Promise.all([
      s.worker.setConfig({ autoGenerate: false }),
      s.worker.setConfig({ style: 'sharp' }),
      s.worker.setConfig({ count: 5 }),
    ]);
    assert.equal(s.stored().autoGenerate, false);
    assert.equal(s.stored().style, 'sharp');
    assert.equal(s.stored().count, 5);
    assert.equal(s.maxWrites(), 1);
  });
  await check('多个页面通过同一后台保存，无页面直接写入', async () => {
    const s = setup(), a = s.createPage(), b = s.createPage();
    await Promise.all([a.setConfig({ autoGenerate: false }), b.setConfig({ style: 'pro' })]);
    assert.equal(s.stored().autoGenerate, false);
    assert.equal(s.stored().style, 'pro');
    assert.deepEqual(s.messages, ['xai:setConfig', 'xai:setConfig']);
  });
  await check('reset 排在已进入队列的保存之后并清空凭据', async () => {
    const s = setup(), a = s.createPage(), b = s.createPage();
    const before = a.setConfig({ apiKey: 'FAKE_TEST_KEY', style: 'sharp' });
    const reset = b.resetConfig();
    await Promise.all([before, reset]);
    assert.deepEqual(s.stored(), clone(s.worker.defaults));
    assert.equal(s.stored().apiKey, '');
    assert.equal(s.messages[1], 'xai:resetConfig');
  });
  await check('保存错误返回给调用者且不会阻断后续更新', async () => {
    const s = setup(), a = s.createPage();
    s.failNext();
    await assert.rejects(a.setConfig({ count: 4 }), /write failed/);
    await a.setConfig({ count: 5 });
    assert.equal(s.stored().count, 5);
  });
  await check('仅接受已定义的配置字段', async () => {
    const s = setup();
    await s.worker.setConfig(JSON.parse('{"count":4,"unknownField":true,"__proto__":{"polluted":true}}'));
    assert.equal(s.stored().count, 4);
    assert.equal(Object.hasOwn(s.stored(), 'unknownField'), false);
    assert.equal(Object.hasOwn(s.stored(), '__proto__'), false);
  });
  console.log('通过 ' + passed + ' / ' + passed);
})().catch((e) => { console.error(e); process.exitCode = 1; });
