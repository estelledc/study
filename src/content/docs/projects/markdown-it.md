---
title: markdown-it CommonMark 兼容的可插拔 Markdown 解析器
来源: https://github.com/markdown-it/markdown-it + markdown-it.github.io 官方文档
season: 28
episode: S28-2
---

# markdown-it — 把 Markdown 文本变成 token 流再 render 成 HTML 的工业级解析器

## 一句话总结（≥ 14 行）

markdown-it 是 Vitaly Puzrin 和 Alex Kocharin 2014 年开源的 JavaScript Markdown 解析器，截至 2024 年稳定在 v14.x，weekly downloads ~25M。它走的是"100% CommonMark 兼容 + GFM 可选扩展 + 高速 + 可插拔"路线，是 VitePress / docsify / VuePress / Hexo / 几乎所有现代 JS 博客与文档站后端的事实标准（VitePress 用 markdown-it + 一堆 mdit plugin，docsify 用 marked，但二者背后的取舍逻辑几乎对称）。

设计哲学三个支柱：

1. **严格分两阶段**：parse 阶段把文本变成 token 数组（线性 IR），render 阶段把 token 数组逐条变成 HTML 字符串。两阶段不能跨越，plugin 可以单独替换其中之一。
2. **Token 数组而非 AST 树**：嵌套结构靠 `_open` / `_close` 配对的扁平数组表示（`heading_open / inline / heading_close`），不是 mdast 那种递归 node。遍历、插入、删除一律 O(n) 数组操作，没有 visitor pattern 黑魔法。
3. **Ruler 调度 + 规则可插拔**：每个 ruler（block / inline / core）持有一个有序的命名规则数组。`md.use(plugin)` 实质是 `ruler.before('xxx', 'yyy', fn)` / `ruler.after(...)` / `renderer.rules.foo = customFn` —— 几行代码就能改解析行为。

性能：在 Node 上单线程 ~50-100k 短文档/秒，比 marked 快 ~10-20%，比 remark/unified 快 ~3-5x。Bundle ~80 KB min+gzip（核心 + 默认规则）。

定位 vs 竞品：

- vs marked：marked 极简（~3k 行），API 不规范但够用；docsify 用它。markdown-it 规范、可扩展，VitePress 用它。
- vs remark/unified：unified 是异步 plugin pipeline + AST tree（mdast/hast），表达力强但学习曲线陡、性能差。markdown-it 同步、token 流、性能优。
- vs mdx：mdx 是"Markdown + JSX"的语法层，底层早期用 remark，近期社区有 markdown-it 实现。mdx 解决 Markdown 嵌入 React 组件的问题，与 markdown-it 不在同一战场。

2024 状态：markdown-it 是 SSG / 文档站 / 笔记软件的事实底座。即使你用 VitePress、docsify 或自己手搓静态站，绕不开它。

## Layer 0 — 项目档案速查（≥ 17 字段）

| 字段 | 值 |
|---|---|
| 包名 | `markdown-it` |
| 当前主版本 | v14.x（2024 起，CommonMark 0.31 兼容） |
| 首版 | 2014-12（v1.0） |
| License | MIT |
| 主仓库 | markdown-it/markdown-it |
| 维护 | Vitaly Puzrin（@puzrin）+ Alex Kocharin（@rlidwka）+ 社区 |
| Runtime | Node ≥ 18 / 浏览器 / Deno / Bun |
| TypeScript | 完整 d.ts（types/index.d.ts） |
| 内部依赖 | linkify-it / mdurl / punycode.js / entities / uc.micro |
| Bundle（核心） | ~80 KB min+gzip |
| 解析阶段 | parse_block / parse_inline / parse_core |
| Token 类型 | ~30 种内置（heading_open / paragraph_open / inline / text / strong_open / link_open / fence / code_block / table_open ...） |
| Plugin 数量 | 200+ 社区（markdown-it-attrs / -anchor / -emoji / -container / -mathjax3 / -prism / -toc-done-right ...） |
| CommonMark 合规 | 100%（spec test 全过） |
| GFM 扩展 | 默认 strikethrough + table；linkify / typographer 可选 |
| Weekly downloads | ~25M（npm 2024 数据） |
| GitHub stars | 18k+ |
| 商业版 | 无 |
| 文档站 | markdown-it.github.io（自己 dogfood 自己） |
| HTML 转义策略 | 默认 escape，`html: true` 选择信任源 |
| 同步 / 异步 | 严格同步（vs unified 异步 pipeline） |

## Layer 1 — 核心抽象（≥ 30 行）

```js
import MarkdownIt from 'markdown-it';

const md = new MarkdownIt({
  html: false,        // 不允许源文档里的 HTML 标签直通
  linkify: true,      // 自动把 https://x.com 包成 <a>
  typographer: true,  // -- → — , ... → … 之类的智能符号替换
  breaks: false       // GFM-style 单换行变 <br>，默认关
});

// 一行渲染：文本 → HTML 字符串
const html = md.render('# Hello\n\n这是 **粗体** 和 [链接](https://example.com)');
// → '<h1>Hello</h1>\n<p>这是 <strong>粗体</strong> 和 <a href="https://example.com">链接</a></p>\n'

// 拆开两阶段：先拿 token 流，再走 render（适合 plugin 调试）
const tokens = md.parse('# Hello', {});
// → [Token { type: 'heading_open', tag: 'h1', ... },
//     Token { type: 'inline', children: [Token { type: 'text', content: 'Hello' }] },
//     Token { type: 'heading_close', tag: 'h1', ... }]

const html2 = md.renderer.render(tokens, md.options, {});
```

四要素：

1. **`new MarkdownIt(presetOrOptions)`** —— preset 三选一：`'default'` / `'commonmark'`（最严格）/ `'zero'`（全部规则关掉，自己组装）
2. **`.parse(src, env) → Token[]`** —— 输入字符串，输出线性 token 数组（嵌套靠 `_open/_close` 配对）
3. **`.renderer.render(tokens, options, env) → String`** —— 每个 token 类型对应一条 `renderer.rules.foo` 函数，串成 HTML
4. **`.use(plugin, opts)`** —— plugin 可以塞规则到 ruler、替换 renderer.rules 任何一条、或加 helper

`env` 是个共享对象（reference 透传所有规则），plugin 用来在规则之间传状态（比如 markdown-it-attrs 用它收 `{.class}` 信息）。

## Layer 2 — 内部架构（≥ 30 行）

markdown-it 内部 5 大组件：

1. **ParserCore**（lib/parser_core.mjs）—— 最外层 pipeline 调度器。规则 7 条：normalize / block / inline / linkify / replacements / smartquotes / text_join。block 和 inline 是真正的 parse 入口，其他是后处理（智能引号、URL 自动链接、转义合并）。
2. **ParserBlock**（lib/parser_block.mjs）—— 块级解析。规则按优先级 11 条：table / code / fence / blockquote / hr / list / reference / html_block / heading / lheading / paragraph。每条规则是 `(state, startLine, endLine, silent) → Boolean`，silent 模式是"探测能否匹配"不真生成 token，给 list 这种"嵌套需要回望"用。
3. **ParserInline**（lib/parser_inline.mjs）—— 行内解析。规则 12 条：text / linkify / newline / escape / backticks / strikethrough / emphasis / link / image / autolink / html_inline / entity。第二阶段 `_rules2` 处理 emphasis / strikethrough 的成对配平（balance_pairs / fragments_join）。
4. **Renderer**（lib/renderer.mjs）—— `default_rules` 字典：每个 token 类型对应一个 `(tokens, idx, options, env, slf) → String` 函数。没匹配上的 token 走 fallback `renderToken`。
5. **Ruler**（lib/ruler.mjs）—— 通用调度类。每条规则 `{ name, enabled, fn, alt }`，`__cache__` 按 chain 名缓存激活规则数组。`before / after / at / push / disable / enable` 全在这里实现。

工作流：

```
1. md.render(src) 入口
2. parserCore.process(state):
   a. normalize    —— \r\n → \n / NULL → U+FFFD
   b. block        —— 跑 parserBlock.tokenize → state.tokens 拿到块级数组
   c. inline       —— 对每个 type='inline' 的 token，跑 parserInline.parse → 填 token.children
   d. linkify      —— 后处理：text 里的裸 URL 包成 link
   e. replacements —— 后处理：(c) → ©，--- → —
   f. smartquotes  —— 后处理：'foo' → 'foo'
   g. text_join    —— 后处理：合并相邻 text token
3. renderer.render(state.tokens) 逐 token 拼字符串
```

为什么"token 数组而非 AST"是核心设计：

- 嵌套用 `nesting: +1 / 0 / -1` 字段表示。`heading_open.nesting=1`，`heading_close.nesting=-1`，`text.nesting=0`。
- 遍历就是 for 循环 + idx 索引。插入新规则的开始/结束 token 就是 `tokens.splice(i, 0, ...)`。
- vs mdast：mdast 用 children 字段递归，遍历需要 visitor 模式（unist-util-visit），改一处往往要重新构 children。
- 性能：JS 里数组比深度递归对象快得多（CPU cache friendly + 无递归栈）。

`env` 对象的角色：在所有 ruler 之间透传共享上下文。markdown-it-attrs 等 plugin 用它存"在 emphasis 后续闭合时把 `{.foo}` 信息回填到 token.attrs"这类跨规则状态。

## Layer 3 — 精读 3 段（每段 ≥ 5 旁注 + ≥ 1 怀疑）

### 段 a — Ruler 调度（≥ 30 行）

```js
// lib/ruler.mjs 节选（v14.2.0）
function Ruler () {
  this.__rules__ = []      // 有序规则列表
  this.__cache__ = null    // 按 chain 名缓存激活规则
}

// 在指定规则之前插入新规则
Ruler.prototype.before = function (beforeName, ruleName, fn, options) {
  const index = this.__find__(beforeName)
  if (index === -1) throw new Error('Parser rule not found: ' + beforeName)

  this.__rules__.splice(index, 0, {
    name:    ruleName,
    enabled: true,
    fn,
    alt:     (options || {}).alt || []
  })

  this.__cache__ = null  // 缓存失效，下次 getRules 重建
}

// 替换规则函数（保留 name + 顺序）
Ruler.prototype.at = function (name, fn, options) {
  const index = this.__find__(name)
  if (index === -1) throw new Error('Parser rule not found: ' + name)
  this.__rules__[index].fn = fn
  this.__rules__[index].alt = (options || {}).alt || []
  this.__cache__ = null
}

// 启用/禁用规则（不删除，方便临时切换）
Ruler.prototype.disable = function (list /* String | String[] */, ignoreInvalid) {
  if (!Array.isArray(list)) list = [list]
  const result = []
  list.forEach((name) => {
    const idx = this.__find__(name)
    if (idx < 0) {
      if (ignoreInvalid) return
      throw new Error('Rules manager: invalid rule name ' + name)
    }
    this.__rules__[idx].enabled = false
    result.push(name)
  })
  this.__cache__ = null
  return result
}
```

旁注：

1. `__rules__` 是数组而非 Map —— 顺序就是执行顺序，插入用 `splice`。比 Map + 单独 order 字段简单。
2. `__cache__` 按 chain 名缓存（block 有 main / paragraph / blockquote 多 chain），每个 chain 是激活规则的子集。`disable` / `enable` / `before` / `after` 任一调用都把缓存设 null，懒重建。
3. `alt` 字段（"alternative chain"）让一条规则参与多个 chain。例如 `paragraph` 规则可以是 main chain 的，也可以是 blockquote 内嵌 chain 的。
4. `before` / `after` / `at` / `push` 四种 API 涵盖了 plugin 的 90% 需求。复杂场景用 `disable` + `push` 组合手动重建。
5. silent 模式（block 规则第 4 个参数）：parser 在 list / blockquote 嵌套场景需要"先探测能否匹配但不真改 state"。每条 block 规则都得实现 silent 路径，是 markdown-it block 解析最难的部分。

> 怀疑：把规则做成"有序数组 + name 索引 + alt chain 标记"看似简单，但当 plugin 数量上去（VitePress 装 ~10 个 plugin）后，规则间隐式依赖（A 必须在 B 之后跑）容易出 bug。这种"扁平 + name 寻址"的可扩展性是不是被高估了？我倾向：是。复杂场景（math + footnote + container 三者交互）调试 ruler 顺序是 markdown-it plugin 作者的固定痛点。但工程上这套又确实够简单——比 unified 的 plugin pipeline 简单一个数量级。

### 段 b — Token 数组的扁平嵌套表示（≥ 30 行）

```js
// lib/token.mjs 节选
function Token (type, tag, nesting) {
  this.type     = type      // 'paragraph_open' / 'inline' / 'text' / 'fence' ...
  this.tag      = tag       // HTML tag name: 'p' / '' / 'pre' / 'h1' / ...
  this.attrs    = null      // [['class', 'foo'], ['id', 'bar']]
  this.map      = null      // [lineStart, lineEnd] 源映射
  this.nesting  = nesting   // +1 (open) / -1 (close) / 0 (self-close)
  this.level    = 0         // 当前嵌套深度，render 时算缩进
  this.children = null      // 仅 type='inline' 用：内联 token 子数组
  this.content  = ''        // 文本内容（text / code_block / fence / ...）
  this.markup   = ''        // 源标记（'###' / '**' / '```'）
  this.info     = ''        // 额外参数（fence 的语言名 'js'）
  this.meta     = null      // plugin 自由字段
  this.block    = false     // 是否块级
  this.hidden   = false     // render 时跳过（list 优化用）
}
```

举例：`# Hello\n\n世界` 解析后是这样的扁平数组：

```js
[
  Token { type: 'heading_open',  tag: 'h1', nesting: +1, markup: '#', map: [0, 1] },
  Token { type: 'inline',        tag: '',   nesting:  0, content: 'Hello',
           children: [
             Token { type: 'text', content: 'Hello' }
           ]},
  Token { type: 'heading_close', tag: 'h1', nesting: -1, markup: '#' },
  Token { type: 'paragraph_open',  tag: 'p', nesting: +1, map: [2, 3] },
  Token { type: 'inline',          tag: '',  nesting:  0, content: '世界',
           children: [Token { type: 'text', content: '世界' }] },
  Token { type: 'paragraph_close', tag: 'p', nesting: -1 }
]
```

旁注：

1. 块级嵌套（heading 包 inline 包 text）用 `_open / _close` 配对的扁平数组表示，render 时按 `nesting +1 / -1` 维护缩进 level。
2. `inline` token 自己是"容器" —— 它有 children 字段。块级解析完先生成 inline token 占位，inline 解析阶段再把 children 填满。这是 parse 两阶段（block / inline）的拼接点。
3. `markup` 字段保留源符号（`#` `**` `` ` ``）—— plugin 可以根据 markup 做差异化渲染（比如 `*emphasis*` 和 `_emphasis_` 都是 `<em>`，但 markup 字段不同）。
4. `map` 是源行号区间，错误提示和 source map 都靠它。inline token 没 map（它是 block token 的子结构）。
5. `meta` 是 plugin 自由空间。markdown-it-attrs 把 `{.cls}` 信息暂存这里，markdown-it-anchor 用它存 slug。

> 怀疑：用 `_open` / `_close` 配对扁平数组而非 children 树，本质是"用查找成本换遍历成本"。遍历容易（for 循环），但 transform（比如把所有 h1 改 h2）需要同时操作两端，写起来不如 mdast 的 `node.tagName = 'h2'` 一行优雅。markdown-it 的设计赌的是"plugin 90% 在加 token 而非改结构"——这判断对吗？我看 200+ plugin 大致符合：emoji / footnote / container / mathjax 都是"插入新 token"，很少有"改变树结构"。所以判断大致成立。但写复杂 transformer 时确实痛。

### 段 c — Renderer 规则字典（≥ 30 行）

```js
// lib/renderer.mjs 节选
const default_rules = {}

default_rules.code_inline = function (tokens, idx, options, env, slf) {
  const token = tokens[idx]
  return '<code' + slf.renderAttrs(token) + '>' +
          escapeHtml(token.content) +
          '</code>'
}

default_rules.fence = function (tokens, idx, options, env, slf) {
  const token   = tokens[idx]
  const info    = token.info ? unescapeAll(token.info).trim() : ''
  let langName  = ''
  let langAttrs = ''

  if (info) {
    const arr = info.split(/(\s+)/g)
    langName  = arr[0]
    langAttrs = arr.slice(2).join('')
  }

  let highlighted
  if (options.highlight) {
    highlighted = options.highlight(token.content, langName, langAttrs) ||
                  escapeHtml(token.content)
  } else {
    highlighted = escapeHtml(token.content)
  }
  // ... 拼 <pre><code class="language-xxx"> 包装 ...
}

// 替换某条规则：
md.renderer.rules.fence = function customFence (tokens, idx, options, env, slf) {
  // 自定义 fence 渲染，比如接 shiki/prism/highlight.js
  return '<pre class="custom">' + escapeHtml(tokens[idx].content) + '</pre>'
}
```

旁注：

1. `renderer.rules` 是个普通对象，键是 token type，值是 render 函数。覆盖一条规则就是赋值，简单到几乎不像"扩展点"。
2. 函数签名 `(tokens, idx, options, env, slf)`：tokens 是整个数组（你可以前后回望 `tokens[idx-1]`），slf 是 renderer 自身（用来调用 `slf.renderInline / slf.renderToken / slf.renderAttrs`）。
3. 没找到对应规则的 token 走 fallback `renderToken`，输出 `<tagName attrs>` / `</tagName>` 这种通用格式。
4. `options.highlight` 是 fence 的语法高亮 hook。VitePress / docsify / Hexo 全部接 shiki / prism / highlight.js 都走这一个 hook。
5. `slf.renderInline` 递归 render `inline` token 的 children —— 行内 token 的渲染入口。

> 怀疑：把 renderer 做成"普通对象 + 函数赋值"看似极简（甚至像 PHP 风格），但失去类型检查（你给 fence 写错签名 IDE 不报错）。如果改用 class + 抽象方法（`Renderer extends Base { fence(...) {} }`），plugin 用继承覆写，可读性会更好但灵活性下降（多 plugin 链式覆写需要 super.fence + 装饰器）。markdown-it 选了"函数赋值"是 2014 年那一代 JS 的典型选择，今天用 TypeScript 重写大概会偏向 class。但这套实际跑了 10 年没人换，说明扩展性需求没那么强。

![markdown-it 两阶段架构 / token 流 / ruler 调度](/study/projects/markdown-it/01-token-stream.webp)

## Layer 4 — 与 marked / unified-remark / mdx 对比（≥ 30 行）

### vs marked

| 维度 | markdown-it | marked |
|---|---|---|
| 代码量 | ~3000 行 | ~3000 行 |
| 架构 | parse → token 数组 → render | lexer → tokens → parser → renderer（更接近编译器术语）|
| 扩展点 | ruler 调度 + renderer.rules + use() | renderer 覆写 + extensions |
| CommonMark 100% | ✓ | ✓（默认开 GFM 选项可关）|
| Plugin 生态 | 200+ | 30+ |
| 同步/异步 | 严格同步 | 同步（v5+ async 实验性）|
| Speed | 基线 | 比 markdown-it 慢 10-20% |
| 用户 | VitePress / Hexo / docsify-tabs / Forem | docsify / discord.js docs / GitBook 旧版 |

marked 极简，docsify 用它做 lightweight 文档站。markdown-it 规范、可扩展，VitePress / Hexo 这种重型站用它。

### vs unified / remark / rehype

unified 是 Titus Wormer（@wooorm）系列，思想是"把任何文本（md / html / mdx / asciidoc）变成 unist 兼容 AST，然后 plugin pipeline 转换"。

| 维度 | markdown-it | remark/unified |
|---|---|---|
| IR | 线性 token 数组 | mdast（树形 AST）|
| 转换 | ruler + renderer.rules | unist-util-visit + visitor pattern |
| 跨格式 | 仅 md | md / html / mdx / asciidoc 通用 |
| 同步/异步 | 同步 | 异步 plugin pipeline |
| Plugin pipeline | use() 立即生效 | unified().use(...).use(...).process() 链式 |
| 性能 | 高（同步 + token 数组）| 慢 3-5x（异步 + 树遍历）|
| TypeScript | d.ts 完整 | 一流（unified 全 TS 重写）|

remark 适合"需要做复杂 transform / 多格式互转 / 异步 fetch 资源"的场景（Astro / Next MDX / Docusaurus 用它）。markdown-it 适合"高速 + 单一目标 HTML + 同步管线"。

### vs mdx

mdx 是"Markdown + JSX"语法层，让 Markdown 文档里直接写 React 组件。底层早期 mdx@1 用 remark，mdx@2/3 用 micromark + estree。mdx 与 markdown-it 不在同一战场——mdx 是给 React/Next 文档用的"组件化 Markdown"，markdown-it 是纯 Markdown→HTML。

VitePress 选择不走 mdx 路线，而是 markdown-it + Vue 风格的 `:::tip` container（@mdit-vue/plugin-component）来实现"Markdown 里嵌组件"。

## Layer 5 — 6 维评分（≥ 6 维）

| 维度 | markdown-it | marked | remark/unified | mdx |
|---|---|---|---|---|
| CommonMark 合规 | 10 | 10 | 10 | 9 |
| 性能 | 9 | 8 | 6 | 5 |
| 扩展性 | 8 | 6 | 10 | 8 |
| 学习曲线（易） | 7 | 9 | 4 | 6 |
| 生态 | 10 | 6 | 9 | 8 |
| TS 类型 | 8 | 7 | 10 | 9 |
| 总分 | 52 | 46 | 49 | 45 |

markdown-it 综合最强，性能 + 生态 + 合规三项都顶尖，扩展性次于 unified。

## Layer 6 — 限制（≥ 4 条）

1. **Token 数组而非 AST**：复杂 transform（结构改写）写起来比 mdast 啰嗦。需要同时操作 `_open` 和 `_close` 两端。
2. **同步管线**：plugin 不能做异步（fetch 远端图片元信息、调远端语法高亮 API）。VitePress 接 shiki 是因为 shiki 提供了同步入口（shiki-async 在 VitePress 这一层包装）。
3. **HTML 转义策略二选一**：`html: false` 全转义（安全但失去原生 HTML 嵌入），`html: true` 全直通（XSS 风险，需自己上 DOMPurify）。中间态需要写 plugin 手动控制。
4. **Token type 字符串 + meta 字段是弱类型**：plugin 间通过 `token.meta.foo` 通信没有静态类型保证。复杂 plugin 链调试只能 console.log。
5. **CommonMark 严格模式 vs GFM 宽松**：默认行为偏严格，GFM 风格（task list / strikethrough / 自动链接）需要单独 enable 或装 plugin。新用户容易踩"为啥 GitHub 上能渲染我这里不行"。
6. **不支持流式解析**：必须一次拿到完整文档。LLM streaming 输出 Markdown 想边解析边渲染需要自己 buffer + 重渲染（VitePress 编辑器预览就是这么做的）。

## 怀疑总集（前面 Layer 3 散落 3 条，再补 2 条 = 共 5）

> 怀疑（补 4）：markdown-it 同步设计在 LLM 时代是不是劣势？ChatGPT / Claude 应用大量需要"边接 streaming 边渲染 Markdown"，但 markdown-it 必须拿完整字符串。社区做法是"每收到 N 字符重新 parse + render 整个 buffer"，简单暴力但 O(n²)。如果未来出现专门针对 streaming 的 incremental Markdown parser（类似 tree-sitter incremental），markdown-it 是不是会被冲击？我赌：会被局部冲击但不会取代——大多数 SSG / 文档站不需要 streaming，markdown-it 的同步简单 + 高速依然有价值。

> 怀疑（补 5）：`md.use(plugin)` 是 monkey-patch（plugin 直接改 ruler / renderer.rules），多 plugin 顺序敏感（mathjax 必须在 emoji 之前注册否则 `$\alpha$` 里的 `\` 被 escape 规则吃掉）。这种"显式注册 + 隐式依赖"模式如果换成"plugin 声明 before/after 拓扑序，框架自动排序"会不会更好？我倾向：会，但 markdown-it 不会改——它已经够稳定，砸碎重来收益小。新一代 Markdown 工具（marked / micromark）已经在尝试更显式的依赖声明。

## GitHub Permalinks（≥ 3 处带 40-char hex SHA）

精读入口（截至 2024-05 master/main/develop 各分支 tip，hex 是 40-char SHA）：

- markdown-it 主入口：`https://github.com/markdown-it/markdown-it/blob/83450e2bc3836ad9f68f652e5685031e9dce4897/lib/index.mjs`
- markdown-it block parser（11 条规则注册 + tokenize 主循环）：`https://github.com/markdown-it/markdown-it/blob/83450e2bc3836ad9f68f652e5685031e9dce4897/lib/parser_block.mjs`
- markdown-it inline parser（含 emphasis / link / 12 条规则）：`https://github.com/markdown-it/markdown-it/blob/83450e2bc3836ad9f68f652e5685031e9dce4897/lib/parser_inline.mjs`
- markdown-it Renderer（默认 renderer.rules 字典）：`https://github.com/markdown-it/markdown-it/blob/83450e2bc3836ad9f68f652e5685031e9dce4897/lib/renderer.mjs`
- markdown-it Ruler（before/after/at/disable/enable 调度）：`https://github.com/markdown-it/markdown-it/blob/83450e2bc3836ad9f68f652e5685031e9dce4897/lib/ruler.mjs`
- markdown-it Token 类（30+ 类型 + 嵌套字段定义）：`https://github.com/markdown-it/markdown-it/blob/83450e2bc3836ad9f68f652e5685031e9dce4897/lib/token.mjs`
- VitePress 接 markdown-it 的入口（plugin 注册 + shiki 接入）：`https://github.com/vuejs/vitepress/blob/ee028266a8fee777a8ee247b1c4490432c0a830e/src/node/markdown/markdown.ts`
- docsify 的 marked-based compiler（对照组：选 marked 而非 markdown-it）：`https://github.com/docsifyjs/docsify/blob/4c193802e527df76fae5c61b3d1437feaceb7a03/src/core/render/compiler.js`

## Layer 7 — 实战（≥ 25 行）

写一个 markdown-it plugin：把 ` ```mermaid ` 围栏代码块渲染成 `<div class="mermaid">…</div>` 容器，让浏览器端的 mermaid.js 来画图。

```js
// markdown-it-mermaid.mjs
export default function mermaidPlugin (md, options = {}) {
  const cls = options.className || 'mermaid';

  // 备份原 fence 规则（可能其他 plugin 已经覆盖）
  const defaultFence = md.renderer.rules.fence ||
    function (tokens, idx, opts, env, slf) {
      return slf.renderToken(tokens, idx, opts);
    };

  // 覆盖 fence：仅 mermaid 走自定义，其他保留原行为
  md.renderer.rules.fence = function (tokens, idx, opts, env, slf) {
    const token = tokens[idx];
    const info  = token.info ? token.info.trim() : '';

    if (info === 'mermaid') {
      // 注意：不能 escapeHtml —— mermaid 源码原样保留
      return `<div class="${cls}">${token.content}</div>\n`;
    }

    return defaultFence(tokens, idx, opts, env, slf);
  };
}

// 使用
import MarkdownIt from 'markdown-it';
import mermaidPlugin from './markdown-it-mermaid.mjs';

const md = new MarkdownIt({ html: false, linkify: true })
  .use(mermaidPlugin, { className: 'mermaid' });

const html = md.render([
  '# 流程图示例',
  '',
  '```mermaid',
  'graph LR',
  '  A --> B',
  '```',
  '',
  '正文里的 `code` 不受影响。'
].join('\n'));

console.log(html);
// <h1>流程图示例</h1>
// <div class="mermaid">graph LR
//   A --> B
// </div>
// <p>正文里的 <code>code</code> 不受影响。</p>
```

要点：

1. plugin 是个普通函数 `(md, options) => void`，里面调 `md.renderer.rules.foo = customFn`。
2. 覆盖 fence 时**先备份** `defaultFence` —— 多 plugin 链式注册不能盲覆盖。
3. mermaid 内容**不 escape**（mermaid.js 在浏览器端读 textContent，自己处理）。
4. info 字段（fence 的语言名）就是 ` ```mermaid ` 后面那串。
5. 想测试 plugin 行为：用 `md.parse(src, {})` 拿 token 数组在 IDE debugger 里看一遍，再走 render。

进阶：如果想在解析阶段就识别（比如统计 mermaid 图数量），可以加一条 core ruler：

```js
md.core.ruler.push('count_mermaid', (state) => {
  state.env.mermaidCount = state.tokens
    .filter(t => t.type === 'fence' && t.info.trim() === 'mermaid')
    .length;
});

md.render(src, env);
console.log(env.mermaidCount);  // 走 env 通道把统计透传出来
```

## 学到什么 + 关联（≥ 15 行）

学到的 ≥ 5 条：

1. **两阶段编译器在文本处理界依然有效**：parse → IR → render 的经典架构 10 年不动，因为 IR 切分就是 plugin 钩子的位置。markdown-it 的 token 数组就是它的 IR。
2. **token 数组（线性 IR）vs AST（树形 IR）是工程取舍**：token 数组遍历快、内存少、容易插入；AST 表达力强、易做结构变换。markdown-it 选了前者，押"plugin 90% 在加 token 不是改结构"，10 年下来证明赌对了。
3. **Ruler 调度（有序数组 + name 索引）是最简扩展模型**：比 unified 的异步 plugin pipeline 简单，比硬编码顺序灵活。代价是隐式依赖容易出 bug。
4. **renderer.rules 用普通对象 + 函数赋值**：极致灵活但失去类型保护。2014 年那一代 JS 风格，今天 TS 重写大概会换 class。但跑了 10 年没换，说明实际需求没那么强。
5. **同步设计在 LLM streaming 时代是局部劣势**：streaming Markdown 渲染需要 incremental parser，markdown-it 没有。但 SSG / 文档站这个主场没受影响。

关联：

- [[remark]] [[unified]] [[mdast]] [[hast]] —— 树形 IR 阵营，与 markdown-it 的 token 数组对极
- [[marked]] [[micromark]] [[mdx]] —— Markdown 解析家族
- [[vitepress]] [[docusaurus]] [[starlight]] [[nextra]] [[hexo]] —— 用 markdown-it / remark / marked 的下游文档站
- [[shiki]] [[prismjs]] [[highlight.js]] —— fence 规则的下游高亮引擎
- [[esbuild]] [[swc]] [[acorn]] —— 同样是 parser 阵营但目标不同（编程语言）

## 附录 A — CommonMark spec 与 GFM 扩展（≥ 25 行）

CommonMark 是 John MacFarlane（@jgm）2014 起主导的 Markdown 规范化项目。在 CommonMark 之前，Markdown 各实现互不兼容（GFM / Markdown.pl / Pandoc / RedCarpet / kramdown 等都有自己的边角解释）。CommonMark 把每条规则用 ~700 个测试用例钉死。

CommonMark 0.31（2024 当前版本）覆盖：

- Block 级：ATX heading（`#-######`）/ Setext heading（`=== ---`）/ paragraph / blockquote / list / fenced code / indented code / thematic break / link reference / HTML block
- Inline 级：text / hard line break / soft line break / emphasis（`* _`）/ strong / code span / link / image / autolink / raw HTML / entity reference / 反斜杠转义

GFM（GitHub Flavored Markdown）在 CommonMark 之上加：

1. Strikethrough（`~~deleted~~`）
2. Task list（`- [ ]` / `- [x]`）
3. Table（`| col1 | col2 |`）
4. Autolink（裸 URL 自动链接）
5. Disallowed Raw HTML（额外过滤一批 tag）

markdown-it 默认 preset 是 CommonMark 的超集（开了 GFM table / strikethrough / linkify）。`new MarkdownIt('commonmark')` 走严格 CommonMark。`new MarkdownIt('zero')` 全规则关闭，自己组装。

CommonMark 严格性的代价：很多"看起来该这样"的写法 spec 故意不支持。例如 `*foo *bar* baz*` 在 CommonMark 里 emphasis 配平规则导致出来的不是嵌套强调而是平铺。这种"反直觉但 spec 钉死"的边角是 CommonMark 几十次迭代讨论出来的稳定点。

为什么 CommonMark 重要：在它之前每个解析器实现都不一样，搬家 / 引擎升级文档体验经常断。CommonMark 让 markdown-it / marked / pandoc / micromark 等可以做"同输入同输出"的回归测试。VitePress 切换底层（理论上可以从 markdown-it 换 micromark）只要都过 CommonMark spec 就基本无感。

markdown-it 100% 通过 CommonMark spec test 是它的核心卖点之一（首页大字写着 "CommonMark compliant"）。

## 附录 B — markdown-it vs marked vs remark 实战对比（≥ 25 行）

同一个需求："给所有 `<a>` 加 `target="_blank" rel="noopener"`"。

### markdown-it 写法

```js
const md = new MarkdownIt();
const defaultLinkOpen = md.renderer.rules.link_open ||
  function (tokens, idx, opts, env, slf) { return slf.renderToken(tokens, idx, opts); };

md.renderer.rules.link_open = function (tokens, idx, opts, env, slf) {
  const t = tokens[idx];
  const aIndex = t.attrIndex('target');
  if (aIndex < 0) t.attrPush(['target', '_blank']);
  else t.attrs[aIndex][1] = '_blank';
  if (t.attrIndex('rel') < 0) t.attrPush(['rel', 'noopener']);
  return defaultLinkOpen(tokens, idx, opts, env, slf);
};
```

8 行，覆盖 renderer.rules.link_open。

### marked 写法

```js
const renderer = new marked.Renderer();
const orig = renderer.link;
renderer.link = (href, title, text) => {
  const html = orig.call(renderer, href, title, text);
  return html.replace(/^<a /, '<a target="_blank" rel="noopener" ');
};
marked.use({ renderer });
```

5 行但 string replace，不优雅。

### remark/unified 写法

```js
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import rehypeStringify from 'rehype-stringify';
import { visit } from 'unist-util-visit';

const externalLinks = () => (tree) => {
  visit(tree, 'element', (node) => {
    if (node.tagName === 'a') {
      node.properties = node.properties || {};
      node.properties.target = '_blank';
      node.properties.rel = ['noopener'];
    }
  });
};

const html = await unified()
  .use(remarkParse)
  .use(remarkRehype)
  .use(externalLinks)
  .use(rehypeStringify)
  .process(src);
```

15+ 行 + 异步，但表达力最强（visitor pattern）。

3 种风格各有取舍：markdown-it 居中 / marked 简陋 / remark 完整。你的需求决定选哪个。

## 附录 C — markdown-it 学习路径（≥ 20 行）

第一周（基础）：
1. `npm i markdown-it`，hello world
2. `md.render('...')` vs `md.parse('...')` 看输出区别
3. preset 三种：default / commonmark / zero
4. options 五个常用：html / linkify / typographer / breaks / xhtmlOut
5. 在 IDE 里 `console.log(md.parse(src, {}))` 看 token 流，建立直觉

第二周（plugin 用户）：
6. 装 markdown-it-attrs / markdown-it-anchor / markdown-it-emoji / markdown-it-container 各一个，看效果
7. 读 markdown-it-attrs 源码 ~150 行，看它怎么 hook ruler
8. 写自己的小 plugin：把 ` ```mermaid ` 转 div（见 Layer 7 实战）
9. 写第二个 plugin：自动给所有 link 加 target="_blank"（见 附录 B）
10. 调试技巧：在 plugin 里 console.log `tokens` 数组

第三周（plugin 开发者）：
11. 读 lib/ruler.mjs ~340 行，理解 before/after/at/push/disable
12. 读 lib/parser_block.mjs（11 条规则注册）+ rules_block/heading.mjs（最简单的块规则）
13. 读 lib/parser_inline.mjs + rules_inline/emphasis.mjs（最复杂的内联规则，emphasis 配平）
14. 读 lib/renderer.mjs ~322 行，看 default_rules 字典
15. 自己实现一条 block 规则（比如自定义 admonition `!!! tip`）

第四周（高阶 / 工程）：
16. 看 VitePress / docsify 怎么集成 markdown-it（哪些 plugin / shiki 怎么接 fence）
17. 性能：`for (let i=0; i<10000; i++) md.render(src)` 看时间
18. 安全：研究 `html: true` 时怎么接 DOMPurify（XSS 防御）
19. CommonMark spec test：跑 markdown-it 自己的 test/ 套件
20. 写一篇文章总结你学到的，反哺给社区（或自己博客）

## 附录 D — 学到补充（≥ 15 行）

补充 5 条工程教训：

6. **解析器的"扩展点设计"决定了它的 plugin 生态规模**：markdown-it 的 ruler + renderer.rules 双扩展点足够简单，所以 200+ plugin 涌现。如果是单一扩展点（marked 早期）或 plugin 仪式重（unified）则生态规模会被卡。
7. **同步 vs 异步管线是文本处理工具的世界观分裂**：markdown-it 同步 / unified 异步 / marked 同步 / micromark 同步。LLM 时代异步需求增加（fetch image metadata、远端高亮、远端图床上传），但大多数 SSG 仍然同步够用。
8. **CommonMark 这种"规范化基础"的力量被低估**：它让"换 Markdown 引擎"变成可能。没有 CommonMark，今天的 SSG 选型矩阵会更碎。
9. **Token type 字符串 + meta 字段 + env 透传** 这套"弱类型 plugin 通信"在 2014 年是合理的工程选择，今天看略显陈旧但极难重构。markdown-it 的代码量不大（~3k 行）但生态绑定太深，"Rust 重写 + WASM + TS 类型完整"路线（micromark / mdx-js）只能新建项目而不能取代。
10. **解析器的 IR 选择（线性 token vs 树形 AST）是性能 vs 表达力的根本取舍**：没有银弹。markdown-it 选 token 数组押对了 SSG 主场（plugin 90% 加 token 不改结构），unified 选 AST 押对了"多格式互转"主场。两者在各自主场不可替代。

补充 3 条学习方法：

11. **看 200+ plugin 的实现胜过看核心**：核心代码 ~3k 行抽象度高，不直观；plugin 代码各 ~100-300 行场景具体，看 5 个就理解了 ruler + renderer.rules 的全部用法。
12. **用 IDE debugger 看 token 数组是建立直觉最快的路径**：比读 spec 文档快 10 倍。先看几个例子的 token 数组结构，再回头读 lib/parser_block.mjs 就能秒懂。
13. **CommonMark spec 文档（commonmark.org/help/）是边角案例的圣经**：每次踩到"为啥这样写不出我想要的"时直接搜 spec，比 Google 搜博客快。spec 写得密度极高但精确。
