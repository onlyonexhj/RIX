/* auto 风格提示词渲染验证（临时脚本） */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

// 沙箱里没有 window/self 之外的浏览器全局，prompt.js 用 root 兜底 self
global.self = global;
eval(fs.readFileSync(path.join(ROOT, 'src/shared/config.js'), 'utf8'));
eval(fs.readFileSync(path.join(ROOT, 'src/shared/utils.js'), 'utf8'));
eval(fs.readFileSync(path.join(ROOT, 'src/shared/prompt.js'), 'utf8'));

const XAI = global.XAI;
let fail = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fail++;
  console.log((ok ? 'PASS' : 'FAIL') + ' ' + name + (ok ? '' : '  got=' + JSON.stringify(got).slice(0, 200)));
};

const tweetZh = { author: '老王', handle: 'laowang', text: '以太坊最近这波行情看不懂，基金会操作确实迷。'.repeat(30), time: '2026-10-17T06:00:00Z', media: [] };
const tweetJa = { author: 'タロウ', handle: 'taro_jp', text: 'これは私の新しいプロジェクトです、よろしく！', media: [] };
const tweetEn = { author: 'Bob', handle: 'bob_x', text: 'Just shipped a new feature today!', media: [] };

// 1) 中文推 → 中文指令 + 400 字截断 + JSON 输出段
const p1 = XAI.buildPrompt(tweetZh, { style: 'auto', count: 3, promptFormat: 'json' }, {});
eq('中文推注入中文语言指令', p1.system.includes('【语言】必须用中文回复【长度】15-50字'), true);
eq('日文推指令未注入中文推', p1.system.includes('日本語で返信'), false);
eq('正文截断到400字', p1.user.includes(tweetZh.text.slice(0, 400)), true);
eq('正文未超400字', p1.user.includes(tweetZh.text.slice(0, 401)), false);
eq('含当前时间', /现在时间：\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(p1.user), true);
eq('含作者handle', p1.user.includes('@laowang'), true);
eq('JSON输出段含条数', p1.system.includes('本次需要生成 3 条不同的候选'), true);
eq('SKIP 条目说明注入', p1.system.includes('需要跳过的条目在数组中写 "SKIP"'), true);
eq('铁律注入', p1.system.includes('【铁律】') && p1.system.includes('禁止说教式金句'), true);
eq('不含未渲染变量', p1.system.includes('{{') === false && p1.user.includes('{{') === false, true);

// 2) 日文推 → 日文指令
const p2 = XAI.buildPrompt(tweetJa, { style: 'auto', count: 2 }, {});
eq('日文推注入日文指令', p2.system.includes('日本語で返信してください'), true);

// 3) 英文推 → 英文指令
const p3 = XAI.buildPrompt(tweetEn, { style: 'auto' }, {});
eq('英文推注入英文指令', p3.system.includes('Must reply in English'), true);
eq('韩文推跟随原文使用韩文', XAI.buildPrompt({ text: '안녕하세요 반갑습니다' }, { style: 'auto' }, {})
  .system.includes('반드시 한국어로 답글'), true);

// 4) plain 模式 → 序号格式段，无 JSON 约束
const p4 = XAI.buildPrompt(tweetZh, { style: 'auto', promptFormat: 'plain' }, {});
eq('plain 模式用序号格式', p4.system.includes('以「1. 」「2. 」这样的序号开头'), true);
eq('plain 模式不强制 JSON', p4.system.includes('只输出一个 JSON 字符串数组'), false);

// 5) 用户自定义模板优先于 auto 内置模板
const p5 = XAI.buildPrompt(tweetZh, { style: 'auto', systemPrompt: '我的自定义系统提示 {{count}}', userPrompt: '自定义用户消息' }, {});
eq('自定义模板优先', p5.system === '我的自定义系统提示 3', true);

// 6) 非 auto 风格不受影响（默认模板、无 langRule/outputFormat 残留）
const p6 = XAI.buildPrompt(tweetZh, { style: 'humor', count: 3 }, {});
eq('humor 用默认模板', p6.system.includes('只输出一个 JSON 字符串数组'), true);
eq('humor 不含 auto 语言指令', p6.system.includes('【语言】必须用中文回复') === false, true);
eq('humor 无空变量残留', p6.system.includes('{{langRule}}') === false && p6.system.includes('{{outputFormat}}') === false, true);

// 7) 面板/设置页能拿到 auto 风格
eq('styles 含 auto 且在第一位', XAI.styles[0].id === 'auto', true);
eq('styles 共 9 个', XAI.styles.length === 9, true);

// 8) SW 的 SKIP 过滤逻辑（复制 isSkipEntry 语义验证）
const isSkipEntry = (s) => /^\s*skip\s*$/i.test(String(s || ''));
const parsed = ['好评论', 'SKIP', 'skip ', '另一条'];
const filtered = parsed.filter((x) => !isSkipEntry(x));
eq('过滤 SKIP 条目', JSON.stringify(filtered), JSON.stringify(['好评论', '另一条']));
eq('全 SKIP 过滤后为空', JSON.stringify(['SKIP'].filter((x) => !isSkipEntry(x))), '[]');

console.log('\n' + (fail ? 'FAIL ' + fail + ' 项' : '全部通过'));
process.exit(fail ? 1 : 0);
