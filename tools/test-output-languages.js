/** Output language regressions: browser UI locale must never select the reply language. */
'use strict';
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const sandbox = { window: {}, console };
sandbox.self = sandbox.window;
vm.createContext(sandbox);
for (const file of ['config', 'utils', 'prompt']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src/shared', file + '.js'), 'utf8'), sandbox);
}
const XAI = sandbox.window.XAI;
let passed = 0;
function check(name, fn) { fn(); passed++; console.log('PASS ' + name); }
const cases = [
  ['zh', '中文原文的意思很清楚，可以开始回复。', '必须用中文回复', '简体中文'],
  ['en', 'A specific update about building a product today.', 'Must reply in English', 'English'],
  ['ja', 'この新しいツールは作業をもっと楽にしてくれます。', '日本語で返信してください', '日本語'],
  ['vi', 'Tôi vừa phát triển một công cụ giúp tiết kiệm thời gian.', 'Phải trả lời bằng tiếng Việt', 'Tiếng Việt'],
  ['ko', '오늘 새로운 기능을 만들었어요. 정말 편리합니다.', '반드시 한국어로 답글', '한국어'],
];

for (const [lang, text, autoRule, name] of cases) {
  check('detect ' + lang, () => assert.equal(XAI.utils.detectLang(text), lang));
  check('auto follows ' + lang, () => {
    const prompt = XAI.buildPrompt({ text }, { style: 'auto', lang: 'auto', uiLang: 'en' });
    assert.ok(prompt.system.includes(autoRule));
  });
  check('ordinary style follows ' + lang, () => {
    const prompt = XAI.buildPrompt({ text }, { style: 'humor', lang: 'auto' });
    assert.ok(prompt.system.includes('输出语言：' + name));
  });
  check('auto style honors explicit ' + lang, () => {
    const prompt = XAI.buildPrompt({ text: lang === 'zh' ? cases[1][1] : cases[0][1] }, {
      style: 'auto', lang, uiLang: 'ja',
    });
    assert.ok(prompt.system.includes(autoRule));
  });
  check('panel override selects ' + lang, () => {
    const prompt = XAI.buildPrompt({ text: cases[0][1] }, { style: 'auto', lang: 'en' }, { lang });
    assert.ok(prompt.system.includes(autoRule));
  });
}

check('panel auto overrides persisted explicit output language', () => {
  const prompt = XAI.buildPrompt({ text: cases[2][1] }, { style: 'auto', lang: 'en' }, { lang: 'auto' });
  assert.ok(prompt.system.includes('日本語で返信してください'));
  assert.ok(!prompt.system.includes('Must reply in English'));
});
check('regular style panel auto overrides persisted explicit language', () => {
  const prompt = XAI.buildPrompt({ text: cases[3][1] }, { style: 'humor', lang: 'en' }, { lang: 'auto' });
  assert.ok(prompt.system.includes('输出语言：Tiếng Việt'));
});
check('UI locale does not affect auto prompt', () => {
  const cfg = { style: 'auto', lang: 'vi' };
  const baseline = XAI.buildPrompt({ text: cases[0][1] }, Object.assign({}, cfg, { uiLang: 'zh' }));
  for (const uiLang of ['auto', 'en', 'ja', 'vi', 'ko']) {
    const prompt = XAI.buildPrompt({ text: cases[0][1] }, Object.assign({}, cfg, { uiLang }));
    assert.equal(prompt.system, baseline.system);
    assert.equal(prompt.user, baseline.user);
  }
});
check('Vietnamese decomposed marks normalize before detection', () => {
  assert.equal(XAI.utils.detectLang(cases[3][1].normalize('NFD')), 'vi');
});
check('Spanish accents alone are not Vietnamese', () => {
  assert.equal(XAI.utils.detectLang('El café está aquí, mañana veremos cómo funciona.'), 'en');
});
check('French accents alone are not Vietnamese', () => {
  assert.equal(XAI.utils.detectLang('Un café, une forêt et un hôtel près de la côte.'), 'en');
});
check('ASCII text is not guessed as Vietnamese', () => {
  assert.equal(XAI.utils.detectLang('Toi dang viet mot cong cu moi'), 'en');
});
check('media-only auto retains English fallback', () => {
  assert.ok(XAI.buildPrompt({ text: '' }, { style: 'auto', lang: 'auto' }).system.includes('Must reply in English'));
});
check('custom template can use Vietnamese lang variable', () => {
  assert.equal(XAI.buildPrompt({ text: cases[0][1] }, {
    style: 'auto', lang: 'vi', systemPrompt: 'Language: {{lang}}', userPrompt: 'Reply',
  }).system, 'Language: Tiếng Việt');
});
console.log('\n' + passed + ' output-language checks passed.');
