/** Content regressions: execute the unmodified scripts against a small DOM and Chrome transport. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const flush = () => new Promise((resolve) => setImmediate(resolve));
const decode = (text) => text.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

class Element {
  constructor(tag, doc) {
    this.tagName = tag.toUpperCase();
    this.ownerDocument = doc;
    this.nodeType = 1;
    this.children = [];
    this.attrs = {};
    this.style = {};
    this.events = {};
    this.scrollTop = 0;
    this.offsetWidth = 420;
    this.offsetHeight = 420;
    this.dataset = new Proxy({}, {
      get: (_, key) => this.attrs['data-' + String(key).replace(/[A-Z]/g, (x) => '-' + x.toLowerCase())],
      set: (_, key, value) => { this.attrs['data-' + String(key).replace(/[A-Z]/g, (x) => '-' + x.toLowerCase())] = String(value); return true; },
    });
    this.classList = {
      add: (...names) => { this.className = [...new Set(this.className.split(/\s+/).filter(Boolean).concat(names))].join(' '); },
      remove: (...names) => { this.className = this.className.split(/\s+/).filter((x) => !names.includes(x)).join(' '); },
      contains: (name) => this.className.split(/\s+/).includes(name),
    };
  }
  get className() { return this.attrs.class || ''; }
  set className(value) { this.attrs.class = value; }
  get isConnected() { return this === this.ownerDocument.body || this === this.ownerDocument.head || !!(this.parentNode && this.parentNode.isConnected); }
  appendChild(child) { child.parentNode = this; this.children.push(child); return child; }
  remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter((x) => x !== this); this.parentNode = null; }
  contains(node) { return this === node || this.children.some((child) => child.contains(node)); }
  setAttribute(name, value) { this.attrs[name] = String(value); }
  getAttribute(name) { return this.attrs[name] ?? null; }
  hasAttribute(name) { return name in this.attrs; }
  get href() { return this.attrs.href || ''; }
  matches(selector) {
    return selector.split(',').some((part) => {
      const s = part.trim();
      const tag = s.match(/^[a-zA-Z][\w-]*/);
      if (tag && this.tagName !== tag[0].toUpperCase()) return false;
      for (const m of s.matchAll(/\.([\w-]+)/g)) if (!this.classList.contains(m[1])) return false;
      for (const m of s.matchAll(/\[([\w-]+)(?:="([^"]*)")?\]/g)) {
        if (!(m[1] in this.attrs) || (m[2] !== undefined && this.attrs[m[1]] !== m[2])) return false;
      }
      return true;
    });
  }
  closest(selector) { for (let node = this; node; node = node.parentNode) if (node.matches(selector)) return node; return null; }
  compareDocumentPosition(other) {
    let root = this; while (root.parentNode) root = root.parentNode;
    let otherRoot = other; while (otherRoot.parentNode) otherRoot = otherRoot.parentNode;
    if (root !== otherRoot) return 1;
    const nodes = [];
    const walk = (node) => { nodes.push(node); node.children.forEach(walk); };
    walk(root);
    return nodes.indexOf(this) < nodes.indexOf(other) ? 4 : 2;
  }
  querySelectorAll(selector) {
    const selectors = selector.split(',').map((s) => s.trim().split(/\s+/));
    const matches = (node, parts) => {
      if (!node.matches(parts[parts.length - 1])) return false;
      let ancestor = node.parentNode;
      for (let i = parts.length - 2; i >= 0; i--) {
        while (ancestor && !ancestor.matches(parts[i])) ancestor = ancestor.parentNode;
        if (!ancestor) return false;
        ancestor = ancestor.parentNode;
      }
      return true;
    };
    const found = [];
    const walk = (node) => { for (const child of node.children) { if (selectors.some((s) => matches(child, s))) found.push(child); walk(child); } };
    walk(this);
    return found;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  set textContent(text) { this.children.forEach((child) => { child.parentNode = null; }); this.children = []; this._text = String(text); }
  get textContent() { return (this._text || '') + this.children.map((child) => child.textContent).join(''); }
  get innerText() { return this.textContent; }
  set innerHTML(html) {
    this.textContent = '';
    this._html = html;
    const stack = [this];
    for (const token of String(html).match(/<[^>]+>|[^<]+/g) || []) {
      if (token.startsWith('</')) { if (stack.length > 1) stack.pop(); continue; }
      if (!token.startsWith('<')) { stack[stack.length - 1]._text = (stack[stack.length - 1]._text || '') + decode(token); continue; }
      const tag = token.match(/^<([\w-]+)/);
      if (!tag) continue;
      const child = new Element(tag[1], this.ownerDocument);
      for (const attr of token.matchAll(/([\w-]+)="([^"]*)"/g)) child.setAttribute(attr[1], decode(attr[2]));
      stack[stack.length - 1].appendChild(child);
      if (!/^(input|br|img|hr|meta)$/i.test(tag[1]) && !token.endsWith('/>')) stack.push(child);
    }
  }
  get innerHTML() { return this._html || ''; }
  insertAdjacentHTML(_, html) { const holder = new Element('div', this.ownerDocument); holder.innerHTML = html; for (const child of [...holder.children]) this.appendChild(child); }
  addEventListener(type, fn) { (this.events[type] ||= []).push(fn); }
  removeEventListener(type, fn) { this.events[type] = (this.events[type] || []).filter((x) => x !== fn); }
  async fire(type, detail = {}) {
    const event = { target: this, relatedTarget: null, preventDefault() {}, stopPropagation() {}, ...detail };
    await Promise.all((this.events[type] || []).map((fn) => fn(event)));
  }
  getBoundingClientRect() { return { top: 100, left: 500, right: 920, width: 420, height: 420 }; }
  scrollIntoView() {}
}

function environment(patch = {}, withMain = false) {
  const doc = { events: {}, createElement(tag) { return new Element(tag, this); } };
  doc.head = doc.createElement('head');
  doc.body = doc.createElement('body');
  doc.addEventListener = Element.prototype.addEventListener;
  doc.fire = Element.prototype.fire;
  doc.querySelectorAll = (s) => doc.head.querySelectorAll(s).concat(doc.body.querySelectorAll(s));
  const intervals = new Map(), timeouts = new Map();
  let nextTimer = 0, current = null, saved, saveGate = null, getGate = null;
  const jobs = [], ports = [], sent = [], insertions = [], notices = [];
  const window = { location: { hostname: 'x.com' }, innerWidth: 1600, innerHeight: 900, addEventListener() {} };
  const listenerSet = () => {
    const listeners = new Set();
    return { addListener: (fn) => listeners.add(fn), removeListener: (fn) => listeners.delete(fn), emit: (...args) => [...listeners].forEach((fn) => fn(...args)), snapshot: () => [...listeners] };
  };
  const chrome = {
    storage: { onChanged: listenerSet() },
    runtime: {
      sendMessage(msg) {
        sent.push(msg);
        if (msg.type === 'xai:generate') { const job = deferred(); jobs.push(job); return job.promise; }
        return Promise.resolve({ ok: true });
      },
      connect() {
        const port = { onMessage: listenerSet(), onDisconnect: listenerSet(), closed: false,
          postMessage(msg) { sent.push(msg); }, disconnect() { this.closed = true; } };
        ports.push(port);
        return port;
      },
    },
  };
  const context = vm.createContext({ window, self: window, location: window.location, document: doc, chrome, console,
    navigator: { clipboard: { writeText: async () => {} } },
    setInterval: (fn) => { const id = ++nextTimer; intervals.set(id, fn); return id; },
    clearInterval: (id) => intervals.delete(id),
    setTimeout: (fn) => { const id = ++nextTimer; timeouts.set(id, fn); return id; },
    clearTimeout: (id) => timeouts.delete(id),
    requestAnimationFrame: () => ++nextTimer, cancelAnimationFrame() {},
  });
  const load = (file) => vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
  load('src/shared/config.js');
  load('src/shared/utils.js');
  load('src/shared/i18n.js');
  load('src/content/detector.js');
  const XAI = window.XAI;
  const realDetector = XAI.detector;
  const detectIsReply = XAI.detector.detectIsReply;
  saved = { ...XAI.defaults, ...patch };
  XAI.getConfig = async () => { if (getGate) await getGate.promise; return { ...saved }; };
  XAI.setConfig = async (delta) => { if (saveGate) await saveGate.promise; saved = { ...saved, ...delta }; return { ...saved }; };
  XAI.utils.toast = (text) => notices.push(text);
  XAI.detector = {
    detectIsReply,
    findComposer: () => current,
    extractTargetTweet: (c) => c.tweet || null,
    findTweetArticle: (node) => node?.closest?.('article[data-testid="tweet"]') || null,
    extractTweetFromArticle: (article) => article?.tweet || null,
    isReplyButton: (node) => !!node?.closest?.('[data-testid="reply"]'),
  };
  XAI.editor = { setText: (editor, text) => { insertions.push({ editor: editor.id, text }); return true; }, getCounter: () => null };
  load('src/content/panel.js');
  if (withMain) load('src/content/main.js');
  const tweetA = { author: 'A', handle: '@a', text: 'tweet A', url: 'https://x.com/a/status/100' };
  const tweetB = { author: 'B', handle: '@b', text: 'tweet B', url: 'https://x.com/b/status/200' };
  const composer = (tweet, id) => {
    const dialog = doc.createElement('div'); dialog.setAttribute('role', 'dialog'); doc.body.appendChild(dialog);
    return { dialog, editor: { id }, tweet, isReply: true };
  };
  const a = composer(tweetA, 'editorA'), b = composer(tweetB, 'editorB');
  current = a;
  return { XAI, realDetector, P: XAI.panel, doc, chrome, jobs, ports, sent, insertions, notices, a, b, tweetA, tweetB,
    current: (c) => { current = c; }, saved: () => saved,
    saveGate: (gate) => { saveGate = gate; }, getGate: (gate) => { getGate = gate; },
    element: (selector) => doc.body.querySelector(selector),
    tick: async () => { for (const fn of [...intervals.values()]) fn(); await flush(); },
    runTimeouts: async () => { const batch = [...timeouts.values()]; timeouts.clear(); for (const fn of batch) await fn(); await flush(); },
    requests: () => sent.filter((msg) => msg.type === 'xai:generate' || msg.type === 'generate'),
  };
}

let passed = 0;
async function test(name, fn) {
  let watchdog;
  try {
    await Promise.race([fn(), new Promise((_, reject) => {
      watchdog = setTimeout(() => reject(new Error('Timed out: ' + name)), 3000);
    })]);
    passed++; console.log('  OK ' + name);
  } finally { clearTimeout(watchdog); }
}
const done = (text) => ({ type: 'done', list: [text], elapsedMs: 10, model: 'mock' });
async function run() {
  await test('stream parser returns only closed JSON strings and filters SKIP', async () => {
    const { XAI } = environment();
    const parse = (s) => Array.from(XAI.utils.parseCompleteReplyList(s));
    assert.deepEqual(parse('["unfinished'), []);
    assert.deepEqual(parse('["done","SKIP","unfinished'), ['done']);
    assert.deepEqual(parse('```json\n["a\\\"b","line\\nend"'), ['a"b', 'line\nend']);
    assert.deepEqual(parse('1. unfinished plain reply'), []);
  });
  await test('tweet identity uses status IDs or complete text and distinguishes media-only targets', async () => {
    const { XAI, tweetA } = environment();
    assert.equal(XAI.utils.sameTweet(tweetA, { ...tweetA, url: 'https://twitter.com/a/status/100?s=20' }), true);
    assert.equal(XAI.utils.sameTweet(tweetA, { ...tweetA, url: '' }), true);
    const prefix = 'x'.repeat(100);
    assert.equal(XAI.utils.sameTweet({ handle: '@a', text: prefix + 'A' }, { handle: '@a', text: prefix + 'B' }), false);
    assert.equal(XAI.utils.sameTweet({ handle: '@a', text: '', images: ['a'] }, { handle: '@a', text: '', images: ['b'] }), false);
  });
  await test('reply detection rejects ordinary quote composers and accepts original text before editor', async () => {
    const e = environment();
    const dialog = e.doc.createElement('div');
    const editor = e.doc.createElement('div'); editor.setAttribute('contenteditable', 'true');
    const draftText = e.doc.createElement('div'); draftText.setAttribute('data-testid', 'tweetText'); editor.appendChild(draftText);
    const quote = e.doc.createElement('div'); quote.setAttribute('data-testid', 'quoteTweet');
    const quoteText = e.doc.createElement('div'); quoteText.setAttribute('data-testid', 'tweetText'); quote.appendChild(quoteText);
    dialog.appendChild(editor); dialog.appendChild(quote);
    assert.equal(e.XAI.detector.detectIsReply(dialog, editor), false);
    quote.remove(); editor.remove(); dialog.appendChild(quote); dialog.appendChild(editor);
    assert.equal(e.XAI.detector.detectIsReply(dialog, editor), true);
    quote.remove(); assert.equal(e.XAI.detector.detectIsReply(dialog, editor), false);
    dialog.setAttribute('aria-label', 'Reply'); assert.equal(e.XAI.detector.detectIsReply(dialog, editor), true);
  });
  await test('reply extraction uses the outer tweet instead of its nested quote and preserves media-only fallback', async () => {
    const e = environment();
    const make = (tag, testid, text) => {
      const node = e.doc.createElement(tag);
      if (testid) node.setAttribute('data-testid', testid);
      if (text) node.textContent = text;
      return node;
    };
    const dialog = make('div'); const original = make('article', 'tweet');
    original.appendChild(make('div', 'User-Name', 'Original @original'));
    const link = make('a'); link.setAttribute('href', 'https://x.com/original/status/100');
    link.appendChild(make('time', null, 'now')); original.appendChild(link);
    const ownText = make('div', 'tweetText', 'Own commentary'); original.appendChild(ownText);
    const quoted = make('div', 'quoteTweet'); quoted.appendChild(make('div', 'User-Name', 'Quoted @quoted'));
    quoted.appendChild(make('div', 'tweetText', 'Nested quote text')); original.appendChild(quoted);
    const editor = make('div'); editor.setAttribute('contenteditable', 'true');
    dialog.appendChild(original); dialog.appendChild(editor);
    const parsed = e.realDetector.extractTargetTweet({ dialog, editor });
    assert.equal(parsed.text, 'Own commentary'); assert.equal(parsed.handle, '@original'); assert.equal(parsed.url, 'https://x.com/original/status/100');
    ownText.remove(); quoted.remove(); original.appendChild(make('div', 'tweetPhoto'));
    const media = e.realDetector.extractTargetTweet({ dialog, editor });
    assert.equal(media.handle, '@original'); assert.equal(media.text, ''); assert.deepEqual(Array.from(media.media), ['image']);
    original.remove(); dialog.appendChild(quoted);
    assert.equal(e.realDetector.extractTargetTweet({ dialog, editor }), null);
  });
  await test('hovering never creates an AI entry, even with the legacy setting enabled', async () => {
    const e = environment({ autoGenerate: false, showFloatingButton: true }, true); await flush(); e.current(null);
    const article = e.doc.createElement('article'); article.setAttribute('data-testid', 'tweet'); article.tweet = e.tweetA; e.doc.body.appendChild(article);
    await e.doc.fire('mouseover', { target: article });
    await e.doc.fire('mouseout', { target: article, relatedTarget: e.a.dialog });
    await e.doc.fire('mouseover', { target: e.a.dialog, relatedTarget: article });
    assert.equal(e.element('.xai-float'), null);
    assert.equal(e.P.isOpen(), false);
    assert.equal(e.requests().length, 0);
    const reply = e.doc.createElement('button'); reply.setAttribute('data-testid', 'reply'); article.appendChild(reply);
    await e.doc.fire('click', { target: reply }); e.current(e.a);
    await e.tick(); await e.runTimeouts();
    assert.equal(e.P.isOpen(), true);
    assert.match(e.element('.xai-src__t').textContent, /tweet A/);
    assert.equal(e.element('.xai-float'), null);
  });
  await test('watcher ignores new posts and validates the original delayed reply dialog', async () => {
    const e = environment({}, true); await flush();
    e.current({ ...e.a, isReply: false }); await e.tick(); await e.runTimeouts(); assert.equal(e.P.isOpen(), false);
    e.current(e.a); await e.tick(); e.current({ dialog: null, editor: { id: 'home' }, isReply: false });
    await e.runTimeouts(); assert.equal(e.P.isOpen(), false); assert.equal(e.requests().length, 0);
  });
  await test('reply-click fallback is consumed once and never reused by another dialog', async () => {
    const e = environment({ autoGenerate: false }, true); await flush();
    const article = e.doc.createElement('article'); article.setAttribute('data-testid', 'tweet'); article.tweet = e.tweetA;
    const reply = e.doc.createElement('button'); reply.setAttribute('data-testid', 'reply'); article.appendChild(reply); e.doc.body.appendChild(article);
    await e.doc.fire('click', { target: reply }); e.a.tweet = null;
    await e.tick(); await e.runTimeouts(); assert.equal(e.P.isOpen(), true);
    e.current(null); await e.tick(); assert.equal(e.P.isOpen(), false);
    e.b.tweet = null; e.current(e.b); await e.tick(); await e.runTimeouts(); assert.equal(e.P.isOpen(), false);
  });
  await test('closing while configuration loads prevents an async open from reopening', async () => {
    const e = environment(); const gate = deferred(); e.getGate(gate);
    const opening = e.P.open(e.a); e.P.close(); gate.resolve(); assert.equal(await opening, false); assert.equal(e.P.isOpen(), false);
  });
  await test('switching targets clears candidates and blocks use in another composer', async () => {
    const e = environment(); await e.P.open(e.a); await e.P._debugSetResults(['reply A']);
    e.current(e.b); assert.equal(await e.P.use(0), false); assert.equal(e.insertions.length, 0);
    await e.P.open(e.b); assert.equal(e.element('.xai-it[data-i="0"]'), null);
    assert.equal(await e.P.use(0), false);
  });
  await test('pending candidates bind only to the matching reply and survive that transition', async () => {
    const e = environment(); e.current(null); await e.P.open(null, e.tweetA); await e.P._debugSetResults(['reply A']);
    e.current({ ...e.a, isReply: false }); assert.equal(await e.P.use(0), false);
    e.current(e.a); await e.P.open(e.a); assert.equal(await e.P.use(0), true);
    assert.deepEqual(e.insertions, [{ editor: 'editorA', text: 'reply A' }]);
  });
  await test('incomplete streaming JSON is not clickable; complete strings update even at equal count', async () => {
    const e = environment(); await e.P.open(e.a); const generating = e.P.generate(); await flush(); const port = e.ports[0];
    port.onMessage.emit({ type: 'delta', text: '["incomplete' }); assert.equal(e.element('.xai-it[data-i="0"]'), null); assert.equal(await e.P.use(0), false);
    port.onMessage.emit({ type: 'delta', text: '["first","SKIP","unfinished' }); assert.equal(e.element('.xai-it[data-i="1"]'), null);
    port.onMessage.emit({ type: 'delta', text: '["corrected","unfinished' }); await e.P.use(0);
    assert.equal(e.insertions[0].text, 'corrected'); e.P.cancel(); await generating;
  });
  await test('stream cancellation settles the promise, restores controls and permits immediate restart', async () => {
    const e = environment(); await e.P.open(e.a); const first = e.P.generate(); await flush();
    const stale = e.ports[0].onMessage.snapshot()[0]; e.P.cancel();
    assert.equal(e.element('.xai-btn--go').disabled, false); assert.equal(e.element('.xai-btn--stop').style.display, 'none'); await first;
    const second = e.P.generate(); await flush(); stale(done('stale A'));
    assert.equal(e.element('.xai-btn--go').disabled, true); assert.equal(e.element('.xai-it[data-i="0"]'), null);
    e.ports[1].onMessage.emit(done('fresh A')); await second; assert.match(e.element('.xai-it__x').textContent, /fresh A/);
  });
  await test('changing target cancels an active stream and ignores queued messages', async () => {
    const e = environment(); await e.P.open(e.a); const first = e.P.generate(); await flush(); const stale = e.ports[0].onMessage.snapshot()[0];
    e.current(e.b); await e.P.open(e.b); await first; assert.equal(e.ports[0].closed, true);
    stale(done('stale A')); assert.equal(e.element('.xai-it[data-i="0"]'), null);
  });
  await test('late nonstream success cannot replace another target or auto-insert', async () => {
    const e = environment({ stream: false, autoInsertFirst: true }); await e.P.open(e.a); const first = e.P.generate(); await flush();
    e.P.close(); e.current(e.b); await e.P.open(e.b); const second = e.P.generate(); await flush();
    e.jobs[0].resolve({ ok: true, data: done('late A') }); await first;
    assert.equal(e.element('.xai-btn--go').disabled, true); assert.equal(e.insertions.length, 0);
    e.jobs[1].resolve({ ok: true, data: done('reply B') }); await second; await flush(); assert.deepEqual(e.insertions, [{ editor: 'editorB', text: 'reply B' }]);
  });
  await test('late cancellation failure cannot end the next nonstream request', async () => {
    const e = environment({ stream: false }); await e.P.open(e.a); const first = e.P.generate(); await flush(); e.P.cancel();
    const second = e.P.generate(); await flush(); e.jobs[0].resolve({ ok: false, error: '已中止' }); await first;
    assert.equal(e.element('.xai-btn--go').disabled, true);
    e.jobs[1].resolve({ ok: true, data: done('fresh') }); await second;
  });
  await test('panel option changes are immediate and generation waits for all saves', async () => {
    const e = environment({ lang: 'en' }); await e.P.open(e.a); const gate = deferred(); e.saveGate(gate);
    const style = e.element('[data-k="style"] .xai-grp__bs'); const count = e.element('[data-k="count"] .xai-grp__bs');
    await style.fire('click', { target: style.querySelector('[data-v="humor"]') });
    await count.fire('click', { target: count.querySelector('[data-v="5"]') });
    const lang = e.element('[data-k="lang"]'); lang.value = 'zh'; await lang.fire('change');
    const generating = e.P.generate(); await flush(); assert.equal(e.requests().length, 0); gate.resolve(); await flush();
    assert.equal(e.requests()[0].payload.extra.style, 'humor'); assert.equal(e.requests()[0].payload.extra.count, 5); assert.equal(e.requests()[0].payload.extra.lang, 'zh');
    assert.equal(e.saved().style, 'humor'); e.P.cancel(); await generating;
  });
  await test('a failed save is retained and generation can retry without changing another option', async () => {
    const e = environment(); await e.P.open(e.a);
    const save = e.XAI.setConfig; let offline = true, attempts = 0;
    e.XAI.setConfig = async (patch) => { attempts++; if (offline) throw new Error('temporary storage failure'); return save(patch); };
    const style = e.element('[data-k="style"] .xai-grp__bs');
    await style.fire('click', { target: style.querySelector('[data-v="humor"]') }); await flush(); assert.equal(attempts, 1);
    const failed = e.P.generate(); await failed; assert.equal(attempts, 3); assert.equal(e.requests().length, 0);
    assert.equal(e.element('.xai-btn--go').disabled, false);
    offline = false; const generating = e.P.generate(); await flush();
    assert.equal(e.saved().style, 'humor'); assert.equal(e.requests()[0].payload.extra.style, 'humor');
    e.P.cancel(); await generating;
  });
  await test('reopening retries failed configuration and new saves retain previously failed patches', async () => {
    const e = environment(); await e.P.open(e.a);
    const save = e.XAI.setConfig; let offline = true;
    e.XAI.setConfig = async (patch) => { if (offline) throw new Error('temporary storage failure'); return save(patch); };
    const style = e.element('[data-k="style"] .xai-grp__bs');
    await style.fire('click', { target: style.querySelector('[data-v="humor"]') }); await flush();
    e.P.close(); offline = false; assert.equal(await e.P.open(e.a), true); assert.equal(e.saved().style, 'humor');
    offline = true;
    const lang = e.element('[data-k="lang"]'); lang.value = 'zh'; await lang.fire('change'); await flush();
    offline = false;
    const count = e.element('[data-k="count"] .xai-grp__bs'); await count.fire('click', { target: count.querySelector('[data-v="5"]') }); await flush();
    assert.equal(e.saved().lang, 'zh'); assert.equal(e.saved().count, 5); assert.equal(e.saved().style, 'humor');
  });
  await test('auto-generation checkbox suppresses automatic requests immediately', async () => {
    const e = environment(); await e.P.open(e.a); const checkbox = e.element('.xai-auto__cb');
    checkbox.checked = false; await checkbox.fire('change'); e.P.autoGenerate(); await flush(); assert.equal(e.requests().length, 0);
    checkbox.checked = true; await checkbox.fire('change'); e.P.autoGenerate(); await flush(); assert.equal(e.requests().length, 1); e.P.cancel();
  });
  await test('reopening the same reply does not duplicate an in-flight or completed request', async () => {
    const e = environment(); await e.P.open(e.a); const generating = e.P.generate(); await flush();
    await e.P.open(e.a); e.P.autoGenerate(); assert.equal(e.requests().length, 1);
    e.ports[0].onMessage.emit(done('reply A')); await generating; e.P.autoGenerate(); await flush(); assert.equal(e.requests().length, 1);
  });
  await test('an old configuration read cannot overwrite a newer interface language event', async () => {
    const e = environment({ uiLang: 'en', style: 'humor' }); await e.P.open(e.a);
    const gate = deferred(); const old = { ...e.saved() };
    e.XAI.getConfig = () => gate.promise;
    const opening = e.P.open(e.a); await flush();
    e.chrome.storage.onChanged.emit({ [e.XAI.storageKey]: { newValue: { ...old, uiLang: 'ja' } } }, 'local');
    gate.resolve(old); assert.equal(await opening, true);
    assert.equal(e.element('[data-k="uiLang"]').value, 'ja');
    assert.equal(e.XAI.i18n.getLocale(), 'ja');
    assert.ok(e.element('[data-k="style"] [data-v="humor"]').classList.contains('is-on'));
  });
  await test('a later external language event is replayed after the local save completes', async () => {
    const e = environment({ uiLang: 'zh' }); await e.P.open(e.a);
    const gate = deferred(); e.XAI.setConfig = () => gate.promise;
    const selector = e.element('[data-k="uiLang"]'); selector.value = 'en';
    await selector.fire('change'); await flush();
    e.chrome.storage.onChanged.emit({ [e.XAI.storageKey]: { newValue: { ...e.saved(), uiLang: 'en' } } }, 'local');
    e.chrome.storage.onChanged.emit({ [e.XAI.storageKey]: { newValue: { ...e.saved(), uiLang: 'ja' } } }, 'local');
    assert.equal(e.XAI.i18n.getLocale(), 'en');
    gate.resolve({ ...e.saved(), uiLang: 'en' }); await flush();
    assert.equal(e.XAI.i18n.getLocale(), 'ja'); assert.equal(selector.value, 'ja');
  });
  console.log(`\n${passed} content regression tests passed.`);
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
