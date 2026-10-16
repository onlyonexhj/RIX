/**
 * 核心逻辑单测（Node 直接跑，无需浏览器）。
 * 验证：模型输出的多种脏格式都能被正确解析成数组。
 */
const path = require('path');
const fs = require('fs');
const vm = require('vm');

// 造一个最小的浏览器环境，把 shared + content 脚本灌进去。
// 这几个文件末尾都是 `(function(root){...})(typeof window !== 'undefined' ? window : self)`，
// 所以它们会挂到 sandbox.window 上。
// 注意：这些模块**加载时**不碰 DOM（只定义函数和常量），所以能在纯 Node 沙箱里跑。
const sandbox = { window: {}, console, setTimeout, clearTimeout };
sandbox.self = sandbox.window;
vm.createContext(sandbox);

const LOAD_ORDER = [
  'src/shared/config.js',
  'src/shared/utils.js',
  'src/shared/prompt.js',
  'src/shared/proxy.js',
  'src/content/detector.js',
  'src/content/editor.js',
  'src/content/panel.js',
];

for (const f of LOAD_ORDER) {
  const code = fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
  vm.runInContext(code, sandbox, { filename: f });
}

const XAI = sandbox.window.XAI;
if (!XAI) throw new Error('共享模块未正确挂载到 window.XAI');
const U = XAI.utils;
const cfg = XAI.defaults;

let pass = 0;
let fail = 0;

function eq(name, got, want, pred) {
  const ok = pred ? pred(got) : JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + '\n      期望: ' + JSON.stringify(want) + '\n      实际: ' + JSON.stringify(got)); }
}

console.log('\n【1】parseReplyList — 应对各种脏输出');
eq('纯 JSON 数组',
  U.parseReplyList('["a","b","c"]', 3), ['a', 'b', 'c']);

eq('带 ```json 包裹',
  U.parseReplyList('```json\n["a","b"]\n```', 2), ['a', 'b']);

eq('包裹 + 前后废话',
  U.parseReplyList('好的，以下是回复：\n["a","b"]\n希望有帮助！', 2), ['a', 'b']);

eq('从长文本里抠出数组',
  U.parseReplyList('思考过程 blah blah [忽略我]\n最终结果：\n["真1","真2"]\n结束', 2), ['真1', '真2']);

eq('正文含 [1] 引用不干扰抠取',
  U.parseReplyList('有人引用 [1] 说过\n["真1","真2"]', 2), ['真1', '真2']);

eq('数组元素内含方括号',
  U.parseReplyList('["看这里 [重要] 真的","第二条"]', 2), ['看这里 [重要] 真的', '第二条']);

eq('数组元素内含转义引号',
  U.parseReplyList('["他说\\"你好\\"","第二条"]', 2), ['他说"你好"', '第二条']);

// 纯数字/嵌套数组里没有字符串 → 不应被当作合法结果，退回兜底切分
eq('纯数字数组不被误认', U.parseReplyList('[1,2,3]', 3), ['[1,2,3]']);

// 单条字符串也要能拿到
eq('单元素数组', U.parseReplyList('["只有一条"]', 3), ['只有一条']);

eq('退化为编号列表',
  U.parseReplyList('1. 第一条回复\n2. 第二条回复\n3. 第三条回复', 3),
  ['第一条回复', '第二条回复', '第三条回复']);

eq('退化为破折号列表',
  U.parseReplyList('- 想法一\n- 想法二', 2), ['想法一', '想法二']);

eq('去重',
  U.parseReplyList('["重复","重复","不同"]', 5), ['重复', '不同']);

eq('按期望条数截断',
  U.parseReplyList('["a","b","c","d","e"]', 3), ['a', 'b', 'c']);

eq('过滤空串',
  U.parseReplyList('["a","","   ","b"]', 3), ['a', 'b']);

eq('空输入不崩', U.parseReplyList('', 3), []);
eq('null 不崩', U.parseReplyList(null, 3), []);

console.log('\n【2】detectLang — 语种识别');
eq('中文', U.detectLang('俗话。一方山水养一方人，桂林的美女也这么美的吗'), 'zh');
eq('英文', U.detectLang('One mountain water feeds another'), 'en');
eq('日文', U.detectLang('これは私の$xii'), 'ja');
eq('韩文', U.detectLang('안녕하세요 반갑습니다'), 'ko');
// 中文语境夹一两个英文单词，仍应判中文
eq('中文夹少量英文', U.detectLang('这个 design 真的很 nice 啊'), 'zh');
// 英文为主只夹一两个汉字 → 英文
eq('英文为主夹汉字', U.detectLang('This is by far the best design I have ever seen'), 'en');
eq('纯英文', U.detectLang('hello world'), 'en');
eq('纯中文', U.detectLang('你好世界'), 'zh');
eq('空串', U.detectLang(''), 'unknown');
eq('纯符号', U.detectLang('123 !!!'), 'unknown');

console.log('\n【3】weightedLength — X 的 280 计数（中日韩算 2）');
eq('中文 4 字 = 8', U.weightedLength('一二三四'), 8);
eq('英文 4 字母 = 4', U.weightedLength('abcd'), 4);
eq('中英混排 中文2+abc', U.weightedLength('中文abc'), 4 + 3);
eq('日文假名算 2', U.weightedLength('こんにちは'), 10);
eq('emoji 不计权', U.weightedLength('😀😀'), 2);
eq('空串', U.weightedLength(''), 0);

console.log('\n【4】cleanText — 去零宽字符');
eq('零宽空格', U.cleanText('helloworld'), 'helloworld');
eq('多空格压成单空格', U.cleanText('a   b\tc'), 'a b c');
eq('null 安全', U.cleanText(null), '');

console.log('\n【5】fmtDuration — 计时显示');
eq('0 秒', U.fmtDuration(0), '0:00');
eq('9 秒', U.fmtDuration(9), '0:09');
eq('65 秒', U.fmtDuration(65), '1:05');

console.log('\n【6】默认配置自检');
eq('maxTokens >= 2000（防推理 token 陷阱）', cfg.maxTokens >= 2000, true);
eq('默认语言跟随原文', cfg.lang, 'auto');
eq('默认条数 3', cfg.count, 3);

console.log('\n【7】escapeHtml — XSS 防护');
eq('尖括号', U.escapeHtml('<img src=x onerror=alert(1)>'),
  '&lt;img src=x onerror=alert(1)&gt;');

console.log('\n【8】renderTemplate — 模板变量插值');
const vars = {
  tweet: { text: '推文正文', author: '企鹅', handle: '@peng', time: '10:00', media: '图片', url: 'u' },
  count: 3, style: '幽默风', styleName: '幽默', length: '中等', lang: '简体中文',
  customInstruction: '不要emoji',
};
eq('简单变量', XAI.renderTemplate('写{{count}}条', vars), '写3条');
eq('嵌套变量', XAI.renderTemplate('{{tweet.author}}说', vars), '企鹅说');
eq('带空格的写法 {{ tweet.text }}', XAI.renderTemplate('{{ tweet.text }}', vars), '推文正文');
eq('未定义变量替换为空', XAI.renderTemplate('a{{nope.x}}b', vars), 'ab');
eq('空模板', XAI.renderTemplate('', vars), '');
eq('null 安全', XAI.renderTemplate(null, vars), '');
eq('数组变量用顿号连接',
  XAI.renderTemplate('{{tweet.media}}', { tweet: { media: ['图片', '视频'] } }), '图片、视频');

console.log('\n【9】findUnknownVars — 变量名校验');
const known = XAI.promptVars.map((v) => v.key);
eq('全部合法', XAI.findUnknownVars('{{tweet.text}}{{count}}', known), []);
eq('发现拼错的变量', XAI.findUnknownVars('{{tweet.body}}', known), ['tweet.body']);
eq('空模板无未知', XAI.findUnknownVars('', known), []);

console.log('\n【10】buildPrompt — 提示词构建');
const tweet = {
  author: '会跳舞的企鹅', handle: '@penguin_dance',
  text: '今天学会了用 AI 写代码，效率直接翻倍！',
  time: '2026-10-16T10:00:00.000Z', media: ['image'], url: '',
};

// 10a 默认模板
let p = XAI.buildPrompt(tweet, cfg, {});
eq('默认：条数正确', p.n, 3);
eq('默认：JSON 约束存在', p.system.includes('JSON'), true);
eq('默认：推文正文进 user', p.user.includes('今天学会了用 AI 写代码'), true);
eq('默认：handle 进 user', p.user.includes('@penguin_dance'), true);
eq('默认：中文原文->中文输出', p.system.includes('简体中文'), true);
eq('默认：无残留 {{}}', /\{\{/.test(p.system + p.user), false);

// 10b 自定义 system 模板
p = XAI.buildPrompt(tweet, Object.assign({}, cfg, {
  systemPrompt: '你是{{styleName}}风格助手。写 {{count}} 条。语言：{{lang}}',
}), {});
eq('自定义 system：风格名变量', p.system.includes('你是幽默风格助手'), true);
eq('自定义 system：条数变量', p.system.includes('写 3 条'), true);
eq('自定义 system：无 JSON 硬约束', p.system.includes('JSON'), false);
eq('自定义 system：user 仍用默认模板', p.user.includes('推文'), true);

// 10c 自定义 user 模板
p = XAI.buildPrompt(tweet, Object.assign({}, cfg, {
  userPrompt: '原文：{{tweet.text}}\n作者：{{tweet.author}}',
}), {});
eq('自定义 user：正文变量', p.user.includes('今天学会了用 AI 写代码'), true);
eq('自定义 user：作者变量', p.user.includes('作者：会跳舞的企鹅'), true);
eq('自定义 user：不含发布时间段', p.user.includes('【发布时间】'), false);

// 10d 人设前置
p = XAI.buildPrompt(tweet, Object.assign({}, cfg, { persona: '我是后端工程师。' }), {});
eq('人设插在 system 开头', p.system.startsWith('我是后端工程师。'), true);

// 10e 补充要求
p = XAI.buildPrompt(tweet, Object.assign({}, cfg, { customInstruction: '别用emoji' }), {});
eq('补充要求进 system', p.system.includes('别用emoji'), true);
p = XAI.buildPrompt(tweet, cfg, { customInstruction: '本次要简短' });
eq('本次临时要求也生效', p.system.includes('本次要简短'), true);

// 10f plain 模式
p = XAI.buildPrompt(tweet, Object.assign({}, cfg, { promptFormat: 'plain' }), {});
eq('plain：序号格式要求', p.system.includes('「1. 」'), true);
eq('plain：user 补媒体提示', p.user.includes('附带媒体'), true);

// 10g 边界
eq('条数上限 8',
  XAI.buildPrompt(tweet, cfg, { count: 99 }).n, 8);
eq('条数下限 1',
  XAI.buildPrompt(tweet, cfg, { count: 0 }).n, 1);
eq('空推文不崩',
  (() => { try { XAI.buildPrompt({}, cfg, {}); return true; } catch (e) { return false; } })(), true);
eq('无媒体时 plain 不加媒体行',
  XAI.buildPrompt(Object.assign({}, tweet, { media: [] }),
    Object.assign({}, cfg, { promptFormat: 'plain' }), {}).user.includes('附带媒体'), false);
eq('自定义模板里的未知变量被清空',
  XAI.buildPrompt(tweet, Object.assign({}, cfg, { systemPrompt: 'x{{不存在}}y' }), {}).system, 'xy');

console.log('\n【11】默认模板自检');
eq('默认 system 模板含条数变量', XAI.defaultSystemTemplate.includes('{{count}}'), true);
eq('默认 user 模板含正文变量', XAI.defaultUserTemplate.includes('{{tweet.text}}'), true);
eq('默认模板无未知变量',
  XAI.findUnknownVars(XAI.defaultSystemTemplate, known).length
  + XAI.findUnknownVars(XAI.defaultUserTemplate, known).length, 0);

console.log('\n【12】流式 SSE 解析');
const SSE = {
  /**
   * 模拟 SW 里 SSE 读取循环的解析逻辑。
   * 用与 service-worker.js 相同的正则与切分规则。
   */
  feed(chunks) {
    let full = '';
    let buf = '';
    let reasoning = 0;
    for (const piece of chunks) {
      buf += piece;
      let idx;
      while ((idx = buf.indexOf('\n\n')) !== -1) {
        const rawEvt = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        for (const line of rawEvt.split('\n')) {
          const s = line.trim();
          if (!s || s.startsWith(':') || !s.startsWith('data:')) continue;
          const data = s.slice(5).trim();
          if (data === '[DONE]') continue;
          let obj;
          try { obj = JSON.parse(data); } catch (e) { continue; }
          const ch = obj.choices && obj.choices[0];
          if (!ch) continue;
          const rc = ch.delta && ch.delta.reasoning_content;
          if (rc) { reasoning += rc.length; continue; }
          const pc = ch.delta && ch.delta.content;
          if (pc) full += pc;
        }
      }
    }
    return { full, reasoning, rest: buf };
  },
};
const d = (c) => 'data: ' + JSON.stringify({ choices: [{ delta: { content: c } }] }) + '\n\n';

eq('逐字流式拼接',
  SSE.feed([d('你'), d('好'), d('呀')]).full, '你好呀');
eq('标准 SSE 分块', SSE.feed([d('AB'), d('CD')]).full, 'ABCD');
eq('[DONE] 被忽略', SSE.feed([d('X'), 'data: [DONE]\n\n']).full, 'X');
eq('reasoning_content 不混入正文',
  SSE.feed([
    'data: ' + JSON.stringify({ choices: [{ delta: { reasoning_content: '思考中' } }] }) + '\n\n',
    d('正文'),
  ]).full, '正文');
eq('reasoning 被单独统计',
  SSE.feed([
    'data: ' + JSON.stringify({ choices: [{ delta: { reasoning_content: '思考中' } }] }) + '\n\n',
    d('正文'),
  ]).reasoning, 3);
eq('坏行不中断解析',
  SSE.feed(['data: {坏json}\n\n', d('好')]).full, '好');
eq('跨 chunk 的半包能被拼回',
  SSE.feed(['data: {"choices":[{"delta":{"con', 'tent":"完整"}}]}\n\n']).full, '完整');
eq('注释行(keepalive)被跳过',
  SSE.feed([': keep-alive\n\n', d('K')]).full, 'K');
eq('流式结果可被 parseReplyList 解析',
  U.parseReplyList(SSE.feed([d('["甲","乙"]')]).full, 2), ['甲', '乙']);
eq('流式 JSON 半成品解析为空（不报错）',
  U.parseReplyList(SSE.feed([d('["甲",')]).full, 2).length >= 0, true);

console.log('\n【13】代理配置');
const proxy = sandbox.window.XAI.proxy;
const base = {
  provider: 'openai',
  baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
  model: 'glm-4.6',
};

eq('auto -> system（扩展不改用户设置）',
  proxy.buildScheme({ proxyMode: 'auto' }).mode, 'system');
eq('direct -> direct', proxy.buildScheme({ proxyMode: 'direct' }).mode, 'direct');

// custom：AI 域名必须进 bypassList，实现「AI 直连、其他走代理」
const cs = proxy.buildScheme(Object.assign({}, base, {
  proxyMode: 'custom', proxyHost: '127.0.0.1', proxyPort: 7890, apiHost: 'open.bigmodel.cn',
}));
eq('custom -> fixed_servers', cs.mode, 'fixed_servers');
eq('custom AI 域名进 bypassList',
  cs.rules.bypassList.indexOf('open.bigmodel.cn') !== -1, true);
eq('custom 其他域名不受影响（bypassList 只含 AI + 本地）',
  cs.rules.bypassList.length, 4); // open.bigmodel.cn + localhost + 127.0.0.1 + ::1
eq('custom 带协议/主机/端口',
  [cs.rules.singleProxy.scheme, cs.rules.singleProxy.host, cs.rules.singleProxy.port],
  ['http', '127.0.0.1', 7890]);
eq('custom bypassList 去端口',
  proxy.buildScheme(Object.assign({}, base, {
    proxyMode: 'custom', proxyHost: 'h', proxyPort: 1, apiHost: 'api.x.com:443'
  })).rules.bypassList.indexOf('api.x.com') !== -1, true);
eq('custom 额外域名也进 bypassList',
  proxy.buildScheme(Object.assign({}, base, {
    proxyMode: 'custom', proxyHost: 'h', proxyPort: 1, apiHost: 'a.com'
  }), ['b.com']).rules.bypassList.indexOf('b.com') !== -1, true);
eq('custom 缺主机时抛错',
  (() => { try { proxy.buildScheme({ proxyMode: 'custom', proxyHost: '', proxyPort: 0 }); return false; }
           catch (e) { return true; } })(), true);
eq('custom 缺端口时抛错',
  (() => { try { proxy.buildScheme({ proxyMode: 'custom', proxyHost: 'a', proxyPort: 0 }); return false; }
           catch (e) { return true; } })(), true);
eq('socks5 协议透传',
  proxy.buildScheme({ proxyMode: 'custom', proxyHost: 'h', proxyPort: 1, proxyScheme: 'socks5' })
    .rules.singleProxy.scheme, 'socks5');
eq('extractHost 正常',
  proxy.extractHost('https://open.bigmodel.cn/api/paas/v4'), 'open.bigmodel.cn');
eq('extractHost 容错', proxy.extractHost(''), '');
eq('extractHost 去端口', proxy.extractHost('http://localhost:11434/v1'), 'localhost');
eq('extractHost 去 userinfo', proxy.extractHost('http://u:p@host.com/x'), 'host.com');
eq('extractHost 大小写归一', proxy.extractHost('HTTPS://API.OpenAI.COM/v1'), 'api.openai.com');
eq('extractHost 无协议头', proxy.extractHost('api.x.com/path'), 'api.x.com');
eq('extractHost 带 query', proxy.extractHost('https://a.com/x?y=1'), 'a.com');
eq('extractHost 带 hash', proxy.extractHost('https://a.com/x#z'), 'a.com');

console.log('\n【14】新增默认配置自检');
eq('流式默认开启', cfg.stream, true);
eq('代理默认跟随系统', cfg.proxyMode, 'auto');
eq('面板位置默认 null（自动跟随）', cfg.panelPos.x, null);
eq('proxy 权限已在 manifest 声明',
  (() => {
    const m = require(path.join(__dirname, '..', 'manifest.json'));
    return m.permissions.indexOf('proxy') !== -1;
  })(), true);

console.log('\n【15】模块完整性契约（防「注释吞代码」类回归）');
// 背景：曾因一处注释块漏写 */，导致 detector.js 后半段被吞，
// findTweetArticle / TWEET_ARTICLES 静默消失，node --check 却一片绿。
// 这里显式断言每个模块对外暴露的函数都存在。
const MODULE_CONTRACT = {
  'utils (XAI.utils)': [
    'parseReplyList','detectLang','cleanText','escapeHtml','fmtDuration','weightedLength','toast','uid','isXDomain',
  ],
  // prompt.js 的函数直接挂在 XAI 上（没有独立命名空间）
  'prompt (XAI.*)': [
    'renderTemplate','findUnknownVars','buildPrompt','defaultSystemTemplate','defaultUserTemplate',
  ],
  'proxy (XAI.proxy)': ['extractHost','buildScheme','apply','get','clear','diagnose'],
  'editor (XAI.editor)': ['getText','clear','setText','getCounter','appendText'],
  'detector (XAI.detector)': [
    'pick','safeMatch','findComposer','detectIsReply','isVisible',
    'extractTargetTweet','parseTweetCard','extractTweetFromArticle',
    'TWEET_ARTICLES','findTweetArticle','isReplyButton',
  ],
};
let contractFail = 0;
for (const label of Object.keys(MODULE_CONTRACT)) {
  const ns = label.indexOf('XAI.*') !== -1 ? XAI : XAI[label.split(' (')[0]];
  if (!ns) {
    console.log('  ✗ ' + label + ' 整个模块未定义');
    contractFail++;
    continue;
  }
  const missing = MODULE_CONTRACT[label].filter((k) => ns[k] === undefined);
  if (missing.length) {
    console.log('  ✗ ' + label + ' 缺少: ' + missing.join(', '));
    contractFail++;
  } else {
    console.log('  ✓ ' + label + ' (' + MODULE_CONTRACT[label].length + ' 个成员)');
  }
}
eq('所有模块成员齐全', contractFail, 0);

console.log('\n【16】静态检测（防静默失效类 bug）');
{
  const { execFileSync } = require('child_process');
  const run = (script) => {
    try {
      execFileSync(process.execPath, [path.join(__dirname, script)], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      return true;
    } catch (e) {
      console.log(String(e.stdout || '') + String(e.stderr || ''));
      return false;
    }
  };
  eq('check-comments 通过（无注释吞代码）', run('check-comments.js'), true);
  eq('check-pages 通过（页面脚本依赖完整）', run('check-pages.js'), true);
}

console.log('\n————————————————————————');
console.log(`通过 ${pass} / ${pass + fail}` + (fail ? `　❌ 失败 ${fail}` : '　✅ 全部通过'));
process.exit(fail ? 1 : 0);
