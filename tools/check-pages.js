/**
 * 扩展页面脚本依赖审计。
 *
 * 背景 bug：popup.html 只加载了 config.js，漏了 utils.js，
 * 而 popup.js 里调用了 XAI.utils.escapeHtml → 运行时 undefined。
 * 因为调用点在 async init() 内，报错形式是
 * 「Uncaught (in promise) TypeError: Cannot read properties of undefined」，
 * 页面看着还挺正常（只是底部状态框空着），极难一眼看出。
 *
 * 本工具静态检查：每个扩展页面引用了哪些 XAI.* 成员，
 * 以及它是否加载了提供这些成员的 shared 脚本。
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

// 每个 shared 模块对外提供的顶层成员
const PROVIDES = {
  'config.js': [
    'defaults', 'providerPresets', 'styles', 'lengths', 'langs', 'promptVars',
    'defaultSystemTemplate', 'defaultUserTemplate', 'storageKey',
    'storageSessionKey', 'getConfig', 'setConfig', 'resetConfig',
  ],
  'utils.js': [
    'parseReplyList', 'detectLang', 'cleanText', 'escapeHtml', 'fmtDuration',
    'weightedLength', 'toast', 'uid', 'isXDomain',
  ],
  'prompt.js': ['renderTemplate', 'findUnknownVars', 'buildPrompt'],
  'proxy.js': ['extractHost', 'buildScheme', 'apply', 'get', 'clear', 'diagnose'],
};

// 成员 -> 提供它的文件
const OWNER = {};
for (const f of Object.keys(PROVIDES)) {
  for (const m of PROVIDES[f]) if (!OWNER[m]) OWNER[m] = f;
}

// 扩展页面：html -> 页面逻辑 js
const PAGES = [
  { html: 'src/popup/popup.html', js: 'src/popup/popup.js' },
  { html: 'src/options/options.html', js: 'src/options/options.js' },
];

function audit() {
  const problems = [];

  for (const page of PAGES) {
    const htmlPath = path.join(ROOT, page.html);
    const jsPath = path.join(ROOT, page.js);
    if (!fs.existsSync(htmlPath) || !fs.existsSync(jsPath)) {
      problems.push({ page: page.html, msg: 'html 或 js 不存在' });
      continue;
    }

    const html = fs.readFileSync(htmlPath, 'utf8');
    const js = fs.readFileSync(jsPath, 'utf8');

    const loaded = new Set(
      (html.match(/src="\.\.\/shared\/([\w.]+\.js)"/g) || []).map((s) =>
        s.replace(/src="\.\.\/shared\//, '').replace(/"$/, '')
      )
    );

    // 收集 js 里用到的 XAI.* 与 U.* 成员
    const used = new Set();
    let m;
    const re1 = /\bXAI\.(\w+)/g;
    while ((m = re1.exec(js)) !== null) used.add(m[1]);
    const re2 = /\bU\.(\w+)/g;
    while ((m = re2.exec(js)) !== null) used.add(m[1]);

    const missing = [];
    for (const u of used) {
      const owner = OWNER[u];
      if (owner && !loaded.has(owner)) {
        missing.push(u + ' (需要 ' + owner + ')');
      }
    }

    if (missing.length) {
      problems.push({
        page: page.html,
        msg: '引用了未加载的模块成员: ' + missing.join(', '),
      });
    }
  }

  return problems;
}

const problems = audit();
if (problems.length) {
  console.log('发现 %d 个页面脚本依赖问题：\n', problems.length);
  for (const p of problems) {
    console.log('  ✗ %s', p.page);
    console.log('    %s', p.msg);
  }
  console.log(
    '\n修复：在 html 里补上对应的 <script src="../shared/xxx.js"></script>' +
      '\n（注意要放在页面逻辑脚本之前）'
  );
  process.exit(1);
}

console.log('✅ 扩展页面脚本依赖完整（审计 %d 个页面）', PAGES.length);
