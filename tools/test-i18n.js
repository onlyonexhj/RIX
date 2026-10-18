/** Runtime locale resolution and UI-catalog coverage; no network or browser needed. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
let passed = 0;
function check(name, test) { test(); passed++; console.log('PASS ' + name); }
function environment(navigator) {
  const window = navigator ? { navigator } : {};
  const context = vm.createContext({ window, self: window, console });
  for (const name of ['config', 'i18n']) vm.runInContext(read('src/shared/' + name + '.js'), context);
  return window.XAI;
}
const XAI = environment();
const I = XAI.i18n;
check('legacy settings retain browser UI locale independently of reply language', () => {
  assert.equal(XAI.defaults.uiLang, 'auto');
  assert.equal(XAI.defaults.lang, 'auto');
  assert.equal(I.getLocale(), 'zh');
  assert.ok(XAI.langs.some((language) => language.id === 'vi'));
});
for (const [browser, expected] of [['zh-CN','zh'],['en-US','en'],['ja-JP','ja'],['vi-VN','vi'],['ko-KR','ko'],['fr-FR','en']]) {
  check('browser locale ' + browser + ' resolves to ' + expected, () => {
    assert.equal(environment({ languages: [browser], language: browser }).i18n.getLocale(), expected);
  });
}
check('browser language preferences select the first supported language', () => {
  assert.equal(environment({ languages: ['fr-FR','vi-VN','en'] }).i18n.getLocale(), 'vi');
});
check('manual locale accepts region tags and overrides browser language', () => {
  const helper = environment({ languages: ['en-US'] }).i18n;
  assert.equal(helper.setLocale('JA_jp'), 'ja');
  assert.equal(helper.setLocale('auto'), 'en');
  assert.equal(helper.setLocale('invalid'), 'en');
});
check('locale selector has automatic mode and all five native language names', () => {
  assert.deepEqual(Array.from(I.languages, (language) => language.id), ['auto','zh','en','ja','vi','ko']);
});
for (const locale of ['zh','en','ja','vi','ko']) {
  check(locale + ' dictionary is complete and preserves interpolation variables', () => {
    const required = Object.keys(I.catalogs.zh).sort();
    assert.deepEqual(Object.keys(I.catalogs[locale]).sort(), required);
    const variables = (text) => [...new Set(Array.from(text.matchAll(/\{(\w+)\}/g), (m) => m[1]))].sort();
    for (const source of required) {
      const translated = I.catalogs[locale][source];
      assert.equal(typeof translated, 'string', source);
      assert.ok(translated.trim(), source);
      assert.deepEqual(variables(translated), variables(source), locale + ': ' + source);
    }
  });
}
check('all marked and programmatic UI phrases exist in every dictionary', () => {
  const sources = new Set();
  const decode = (value) => value.replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  for (const file of ['src/content/panel.js','src/content/main.js','src/options/options.js',
                      'src/options/options.html','src/popup/popup.js','src/popup/popup.html']) {
    const text = read(file);
    for (const match of text.matchAll(/data-i18n(?:-[\w-]+)?="([^"]+)"/g)) sources.add(decode(match[1]));
    for (const match of text.matchAll(/\b(?:T|t|setStatus|onFail)\(\s*('(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*")/g)) {
      const source = vm.runInNewContext(match[1]);
      if (/[\u3400-\u9fff]/.test(source)) sources.add(source);
    }
    for (const match of text.matchAll(/\b(?:setText|flash)\(\s*[^,\n]+,\s*('(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*")/g)) {
      const source = vm.runInNewContext(match[1]);
      if (/[\u3400-\u9fff]/.test(source)) sources.add(source);
    }
  }
  for (const entries of [XAI.styles,XAI.lengths,XAI.langs.filter((item) => ['auto','zh'].includes(item.id)),XAI.providerPresets,XAI.promptVars]) {
    for (const entry of entries) for (const property of ['label','desc','note']) {
      if (/[\u3400-\u9fff]/.test(entry[property] || '')) sources.add(entry[property]);
    }
  }
  const missing = [...sources].filter((source) => !Object.hasOwn(I.catalogs.en, source));
  assert.deepEqual(missing, []);
});
check('interpolation preserves values verbatim and does not execute markup', () => {
  I.setLocale('en');
  assert.equal(I.t('保存设置失败：{error}', {error:'<script>原始错误</script>'}),
    'Could not save settings: <script>原始错误</script>');
  assert.equal(I.t('unchanged user text'), 'unchanged user text');
});
check('known diagnostic errors are localized while unknown service messages stay intact', () => {
  I.setLocale('en');
  assert.equal(I.translateError('保存设置失败：upstream detail'), 'Could not save settings: upstream detail');
  assert.equal(I.translateError('Provider error 429: retry later'), 'Provider error 429: retry later');
});
console.log(passed + ' i18n checks passed.');
