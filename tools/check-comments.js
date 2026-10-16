/**
 * 注释吞代码检测器。
 *
 * 为什么需要它：`node --check` 只能查出「语法错误」。
 * 但下面这种 bug **语法完全合法**，却会让整段代码静默失效：
 *
 *     /* ---- 3. 时间线推文 ----
 *      D.findTweetArticle = function () {...};   ← 被当成注释，函数根本不定义
 *
 *  表现：运行时 `Xxx is not a function`，而语法检查一片绿。
 *  这类 bug 极难靠肉眼发现，必须用工具扫。
 *
 * 原理：用状态机跳过字符串/行注释，提取所有块注释的**内容**，
 * 若内容里出现可执行代码的特征（赋值、函数声明、return 等），即判定为吞代码。
 */
'use strict';

const fs = require('fs');
const path = require('path');

// 注释内容里出现这些模式，说明很可能是被吞掉的代码
const CODE_PATTERNS = [
  { re: /^\s*(?:const|let|var)\s+\w+\s*=/, msg: '变量声明' },
  { re: /^\s*\w+(?:\.\w+)+\s*=\s*(?:function|\()/, msg: '对象属性赋值' },
  { re: /^\s*function\s+\w+/, msg: '函数声明' },
  { re: /^\s*return\b/, msg: 'return 语句' },
  { re: /^\s*(?:if|for|while|switch|try)\s*[({]/, msg: '控制流语句' },
  { re: /=>\s*\{?\s*$/, msg: '箭头函数' },
];

/** 提取文件中所有块注释的内容与起止行 */
function extractBlockComments(src) {
  const out = [];
  let i = 0;
  const n = src.length;
  let line = 1;

  const advance = (to) => {
    for (; i < to; i++) if (src[i] === '\n') line++;
  };

  while (i < n) {
    const c = src[i];
    const nx = src[i + 1] || '';

    // 行注释：跳到行尾
    if (c === '/' && nx === '/') {
      while (i < n && src[i] !== '\n') i++;
      continue;
    }

    // 块注释开始
    if (c === '/' && nx === '*') {
      const startLine = line;
      const start = i;
      i += 2;
      line++; // 保守：块注释至少跨一行
      const bodyStart = i;
      let closed = false;
      while (i < n) {
        if (src[i] === '*' && src[i + 1] === '/') {
          closed = true;
          break;
        }
        if (src[i] === '\n') line++;
        i++;
      }
      if (!closed) {
        out.push({ startLine, endLine: line, body: src.slice(bodyStart), unterminated: true });
        break;
      }
      out.push({
        startLine,
        endLine: line,
        body: src.slice(bodyStart, i),
        unterminated: false,
      });
      i += 2;
      continue;
    }

    // 字符串：跳过（避免把字符串里的 /* */ 当注释）
    if (c === '"' || c === "'" || c === '`') {
      const q = c;
      i++;
      while (i < n) {
        if (src[i] === '\\') {
          i += 2;
          continue;
        }
        if (src[i] === q) {
          i++;
          break;
        }
        if (src[i] === '\n') line++;
        i++;
      }
      continue;
    }

    if (c === '\n') line++;
    i++;
    advance(i);
  }
  return out;
}

/** 判断一段注释内容是否含有可执行代码特征 */
function looksLikeCode(body) {
  const lines = body.split('\n');
  for (const raw of lines) {
    const l = raw.trim();
    if (!l) continue;
    // 跳过纯文档注释（* 开头且是中文说明）
    for (const p of CODE_PATTERNS) {
      if (p.re.test(l)) {
        // 排除明显是文档的：以 * 开头且含中文说明性文字
        if (/^\*/.test(raw) && /[，。：、]/.test(l) && !/[;{}]/.test(l)) continue;
        return { line: l, kind: p.msg };
      }
    }
  }
  return null;
}

function scanFile(file) {
  const src = fs.readFileSync(file, 'utf8');
  const comments = extractBlockComments(src);
  const problems = [];

  for (const c of comments) {
    if (c.unterminated) {
      problems.push({
        file,
        line: c.startLine,
        kind: 'unterminated',
        msg: '块注释从未闭合（/* 之后没有 */），其后所有代码都会失效',
      });
      continue;
    }
    const hit = looksLikeCode(c.body);
    if (hit) {
      problems.push({
        file,
        line: c.startLine,
        kind: 'swallowed',
        msg: '注释块里出现' + hit.kind + '：`' + hit.line.slice(0, 70) + '`',
      });
    }
  }
  return problems;
}

function walk(dir, acc) {
  for (const name of fs.readdirSync(dir)) {
    if (name === 'node_modules' || name === '.git') continue;
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, acc);
    else if (/\.(js|mjs|cjs)$/.test(name)) acc.push(p);
  }
  return acc;
}

/* ---------------------------- main ---------------------------- */

const root = path.join(__dirname, '..');
const files = walk(root, []);

const allProblems = [];
for (const f of files) {
  allProblems.push(...scanFile(f));
}

if (allProblems.length) {
  console.log('发现 %d 处「注释吞代码」风险：\n' % allProblems.length);
  for (const p of allProblems) {
    console.log('  ✗ %s:%d' % (path.relative(root, p.file).replace(/\\/g, '/'), p.line));
    console.log('    %s', p.msg);
  }
  console.log(
    '\n这类 bug 语法合法，node --check 查不出来，但会让函数在运行时' +
      '\n变成 undefined，表现为 "Xxx is not a function"。'
  );
  process.exit(1);
}

console.log('✅ 未发现注释吞代码（扫描 %d 个 JS 文件）', files.length);
