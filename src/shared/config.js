/**
 * 全局共享配置：默认配置 + 模型预设 + 回复风格。
 * 同时被 content script / service worker / options 页面加载（普通 <script>，非 ESM）。
 */
(function (root) {
  'use strict';

  const XAI = (root.XAI = root.XAI || {});

  /** 默认配置 */
  XAI.defaults = {
    enabled: true,

    // —— 服务商 ——
    // openai = OpenAI 兼容协议（DeepSeek / GLM / Kimi / OpenRouter / Ollama / vLLM 等）
    // anthropic = Claude Messages API
    provider: 'openai',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    apiKey: '',
    model: 'glm-4.6',

    // —— 生成参数 ——
    temperature: 1.0,
    // ★ 推理模型（GLM 全系 / o系列 / Claude 思考版）必须给足，
    //   否则 reasoning_tokens 会吃光 max_tokens 导致正文为空字符串且不报错。
    maxTokens: 4000,
    // 是否显式关闭 GLM 的深度思考（写微博回复不需要思考链）
    disableThinking: true,
    timeoutSec: 90,

    // —— 图片识别 ——
    // 把推文图片一并发给模型（需模型支持视觉：GLM-4V / GPT-4o / Claude 等）。
    // 默认关：多数纯文本模型（glm-4.6 / deepseek-chat）不支持图片，开了会 400
    vision: false,

    // —— 流式输出 ——
    // ★ 网络慢（尤其挂 VPN）时开流式，感知延迟从「等全部生成完」
    //   降到「第一个字约 1 秒可见」。强烈建议保持开启。
    stream: true,

    // —— 代理 ——
    // auto   = 跟随浏览器/系统默认（VPN 已在系统层生效时走这条）
    // direct = 强制直连，绕过系统代理（适合国内直连更快的情况）
    // custom = 指定固定代理服务器（需填 host/port）
    proxyMode: 'auto',
    proxyHost: '',
    proxyPort: 0,
    proxyScheme: 'http', // http | socks4 | socks5

    // —— 交互默认值 ——
    // 打开回复面板时自动请求 AI（点「回复」气泡 / 悬浮 ✦ 按钮后立即生成）。
    // 关掉则保持老流程：面板打开后手动点「生成回复」
    autoGenerate: true,
    count: 3,
    style: 'auto',
    lang: 'auto', // auto | zh | en | ja | ko
    length: 'medium', // short | medium | long
    customInstruction: '',

    // —— 面板位置 ——
    panelPos: { x: null, y: null }, // 拖拽后的位置（null = 自动跟随弹层）

    // —— 提示词模板 ——
    // systemPrompt / userPrompt 留空 = 使用内置默认模板（推荐，保证输出格式可控）
    // 填了 = 完全接管，用 {{变量}} 占位
    systemPrompt: '',
    userPrompt: '',
    // 导出格式：json = 强制 JSON 数组（稳）；plain = 让模型自由输出再解析（容错高）
    promptFormat: 'json',
    // 额外注入的「人设 / 背景」说明，会插在 system prompt 开头
    persona: '',

    // —— 高级 ——
    autoInsertFirst: false, // 生成完是否自动回填第 1 条
    showFloatingButton: true, // 时间线上是否显示悬浮 AI 按钮
    debug: false,
  };

  /**
   * 提示词可用变量表（设置页的提示词编辑器会据此渲染说明与补全）
   */
  XAI.promptVars = [
    { key: 'tweet.text', label: '推文正文', desc: '被回复推文的纯文本' },
    { key: 'tweet.author', label: '作者昵称', desc: '如「会跳舞的企鹅」' },
    { key: 'tweet.handle', label: '作者 handle', desc: '如 @penguin_dance' },
    { key: 'tweet.time', label: '发布时间', desc: 'ISO 格式时间' },
    { key: 'tweet.media', label: '媒体类型', desc: '如「图片、视频」，无则空' },
    { key: 'tweet.url', label: '推文链接', desc: '完整 URL' },
    { key: 'now', label: '当前时间', desc: '生成时刻，如「2026-10-17 14:30」' },
    { key: 'tweet.text400', label: '推文前 400 字', desc: '正文截断到 400 字（auto 风格用）' },
    { key: 'count', label: '生成条数', desc: '本次要生成几条' },
    { key: 'imageCount', label: '附图数量', desc: '本次随消息发给模型的图片张数' },
    { key: 'style', label: '风格描述', desc: '当前风格的中文说明' },
    { key: 'styleName', label: '风格名', desc: '如「幽默」' },
    { key: 'length', label: '长度描述', desc: '如「1-2 句，30-80 字」' },
    { key: 'lang', label: '输出语言', desc: '如「简体中文」' },
    { key: 'customInstruction', label: '补充要求', desc: '设置页或面板里填的额外要求' },
  ];

  /** 内置默认 system 模板（留空时使用） */
  XAI.defaultSystemTemplate = [
    '你是一位精通 X（Twitter）文化的中文/多语言社交媒体操盘手，任务是给用户写「回复」。',
    '硬性要求：',
    '1. 只输出一个 JSON 字符串数组，例如 ["第一条","第二条"]。不要 markdown 代码块，不要任何解释文字。',
    '2. 数组长度必须严格等于 {{count}} 条。',
    '3. 每条都是能直接发出去的成品回复，不是提纲、不带引号包裹的说明文字。',
    '4. {{style}}',
    '5. {{length}}',
    '6. 输出语言：{{lang}}。除非用户要求，否则不要混用语言。',
    '7. 各条之间要有明显差异：不同切入角度、不同句式，不要是同一句话的改写。',
    '8. 不要出现"作为AI""以下是""回复如下"这类元叙述。',
    '9. 不要编造事实、数据或引用。若原文信息不足，就用态度/感受/提问来回复。',
    '10. 可以用 emoji，但别堆砌，通常最多 1-2 个。',
    '{{customInstruction}}',
  ]
    .filter(Boolean)
    .join('\n');

  /** 内置默认 user 模板（留空时使用） */
  XAI.defaultUserTemplate = [
    '请针对下面这条推文写 {{count}} 条回复。',
    '',
    '【原作者】{{tweet.author}} {{tweet.handle}}',
    '【发布时间】{{tweet.time}}',
    '【正文】',
    '{{tweet.text}}',
    '{{customInstruction}}',
  ]
    .filter(Boolean)
    .join('\n');

  /** 可选服务商预设（选填后自动填 baseUrl / model） */
  XAI.providerPresets = [
    {
      id: 'zhipu',
      label: '智谱 GLM',
      provider: 'openai',
      baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
      model: 'glm-4.6',
      note: '中文表达自然，性价比高',
    },
    {
      id: 'deepseek',
      label: 'DeepSeek',
      provider: 'openai',
      baseUrl: 'https://api.deepseek.com/v1',
      model: 'deepseek-chat',
      note: '便宜，适合批量生成',
    },
    {
      id: 'openai',
      label: 'OpenAI',
      provider: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o-mini',
      note: '通用',
    },
    {
      id: 'anthropic',
      label: 'Claude',
      provider: 'anthropic',
      baseUrl: 'https://api.anthropic.com/v1',
      model: 'claude-sonnet-4-20250514',
      note: '长文理解好',
    },
    {
      id: 'kimi',
      label: '月之暗面 Kimi',
      provider: 'openai',
      baseUrl: 'https://api.moonshot.cn/v1',
      model: 'moonshot-v1-32k',
      note: '',
    },
    {
      id: 'openrouter',
      label: 'OpenRouter',
      provider: 'openai',
      baseUrl: 'https://openrouter.ai/api/v1',
      model: 'anthropic/claude-3.5-sonnet',
      note: '一个 key 用多家模型',
    },
    {
      id: 'custom',
      label: '自定义（OpenAI 兼容）',
      provider: 'openai',
      baseUrl: '',
      model: '',
      note: '本地 Ollama / vLLM / one-api 等',
    },
  ];

  /** 回复风格 */
  XAI.styles = [
    { id: 'auto', label: '自动', desc: '按推文自动选口吻与语言，不合适就跳过' },
    { id: 'humor', label: '幽默', desc: '轻松调侃，接梗，适度玩梗' },
    { id: 'pro', label: '专业', desc: '有数据、有观点，干货感强' },
    { id: 'sharp', label: '犀利', desc: '观点鲜明，有锋芒敢反驳' },
    { id: 'warm', label: '共情', desc: '真诚走心，情绪共鸣' },
    { id: 'sharpw', label: '争议', desc: '反主流、挑战共识，钓评论' },
    { id: 'meme', label: '抽象', desc: '发疯文学、无意义梗' },
    { id: 'translate', label: '翻译润色', desc: '忠实翻译成目标语言' },
    { id: 'sarcasm', label: '嘲讽', desc: '阴阳怪气但克制' },
  ];

  XAI.lengths = [
    { id: 'short', label: '短', desc: '一句话，≤30字' },
    { id: 'medium', label: '中', desc: '1-2句，30-80字' },
    { id: 'long', label: '长', desc: '3句以上，可展开观点' },
  ];

  XAI.langs = [
    { id: 'auto', label: '跟随原文' },
    { id: 'zh', label: '中文' },
    { id: 'en', label: 'English' },
    { id: 'ja', label: '日本語' },
    { id: 'ko', label: '한국어' },
  ];

  XAI.storageKey = 'xai_config';
  XAI.storageSessionKey = 'xai_session';

  /** 读取配置（带默认值兜底） */
  XAI.getConfig = async function getConfig() {
    let stored = {};
    try {
      const bag = await chrome.storage.local.get(XAI.storageKey);
      stored = bag[XAI.storageKey] || {};
    } catch (e) {
      stored = {};
    }
    return Object.assign({}, XAI.defaults, stored);
  };

  // 所有页面都由同一个 service worker 写入，避免多个页面读旧快照后相互覆盖。
  // 无 runtime 的预览/测试环境仍可使用本地队列。
  let configWrites = Promise.resolve();

  function writeConfig(patch, reset) {
    const changes = {};
    for (const key of Object.keys(patch || {})) {
      if (Object.prototype.hasOwnProperty.call(XAI.defaults, key)) changes[key] = patch[key];
    }
    const pending = configWrites.then(async () => {
      const current = reset ? XAI.defaults : await XAI.getConfig();
      const next = Object.assign({}, current, changes);
      await chrome.storage.local.set({ [XAI.storageKey]: next });
      return next;
    });
    // 一次存储失败不能阻断后续保存；错误仍由本次调用的 Promise 返回。
    configWrites = pending.catch(() => {});
    return pending;
  }

  async function sendConfigMessage(type, payload) {
    const response = await chrome.runtime.sendMessage({ type, payload });
    if (!response || !response.ok) {
      throw new Error((response && response.error) || '保存配置失败，请重新加载扩展');
    }
    return response.data;
  }

  function usesConfigWorker() {
    return typeof window !== 'undefined' && typeof chrome !== 'undefined' &&
      chrome.runtime && typeof chrome.runtime.sendMessage === 'function';
  }

  XAI.setConfig = function setConfig(patch) {
    return usesConfigWorker()
      ? sendConfigMessage('xai:setConfig', patch)
      : writeConfig(patch, false);
  };

  XAI.resetConfig = function resetConfig() {
    return usesConfigWorker()
      ? sendConfigMessage('xai:resetConfig')
      : writeConfig({}, true);
  };
})(typeof window !== 'undefined' ? window : self);
