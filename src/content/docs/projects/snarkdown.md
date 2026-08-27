---
title: Snarkdown — 一条正则吃掉 Markdown 的单函数解析器
description: 介绍 Snarkdown 怎样用一条全局正则和 TAGS 表把 Markdown 变成 HTML，以及它不处理表格、也不消毒
来源: https://github.com/developit/snarkdown
日期: 2026-08-27
分类: markdown
难度: 入门
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/developit/snarkdown
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: a6dc55c93e29e40d3d77b759ce3a6070537028ee
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 2.0.0
---

## 是什么

Snarkdown 是一个只导出一个函数的 Markdown → HTML 转换器。日常类比：口袋词典——翻开就对照，没有目录、没有插件架，也没有“先 lex 再 render”的两段工序。

```js
import snarkdown from 'snarkdown'

snarkdown('_this_ is **easy** to `use`.')
// <em>this</em> is <strong>easy</strong> to <code>use</code>.
```

固定 2.0.0 无生产依赖。类型声明是 `(urlStr: string, prevLinks?: Links) => string`；第二参数可把上一轮收集的 reference 链接传进来。

## 为什么重要

不读这 110 行，就很难分清“小”和“缺什么”：

- 为什么 `*em*` 与 `**strong**` 能共用一张 `TAGS` 表
- 为什么表格写了也不会变成 `<table>`
- 为什么 `<script>` 出现在段落里不会被编码
- 为什么未闭合的 `*foo` 仍会吐出 `</em>`

## 核心要点

固定版本可以看成四步：

1. **先收 reference definition**：`^\[name\]: url` 被写成 `links[name.toLowerCase()]`，并从输入里删掉。随后 `prevLinks` 与本轮定义合并使用。

2. **一条全局正则扫过去**：fence、缩进代码、引用/列表、图片、链接、Setext / ATX 标题、行内 code、以及 `*` / `_` / `~~` / 空行，都是同一条 `tokenizer` 的捕获组。谁先匹配谁赢。

3. **`TAGS` 看的是第二字符**：`tag(token)` 取 `token[1]`。单字符 `*`/`_` 没有第二字符，落到 `''` → `<em>`；`**`/`__` 的第二字符是 `*`/`_` → `<strong>`；`~~` → `<s>`；`---` / `* * *` 走到 `<hr />`。

4. **块级结构靠递归**：引用和列表会 `parse(outdent(...))` 再包标签；标题也会再 parse 一次内部。`flush()` 在结束时按栈补闭标签，所以 `*foo` 会变成 `<em>foo</em>`。

`encodeAttr` 只替换 `"` / `<` / `>`，用在 `href` / `src` / `alt` 和 code 文本上。正则没吃到的原始 HTML 会作为 `prev` 拼回输出。

## 实践示例

### 案例 1：强调标记不是两套引擎

```js
snarkdown('I *like* tiny libraries')
// <em>like</em>
snarkdown('I **like** tiny libraries')
// <strong>like</strong>
snarkdown('I __like__ tiny libraries')
// <strong>like</strong>
```

`*` 与 `_` 单用是 em，双写是 strong。不要按“下划线永远是 em”来记。

### 案例 2：reference 链接可以跨调用留下

```js
const links = {}
snarkdown('[site]: https://example.com\nSee [site].', links)
// See <a href="https://example.com">site</a>.
snarkdown('Again [site].', links)
// Again <a href="https://example.com">site</a>.
```

第一轮写进 `links`；第二轮把同一对象当 `prevLinks` 传入。类型里的参数名是 `urlStr`，实际吃的是整段 markdown。

### 案例 3：fence 会编码，表格不会变表

```js
snarkdown('```js\nconst x = "<hi>"\n```')
// <pre class="code js"><code class="language-js">const x = &quot;&lt;hi&gt;&quot;</code></pre>

snarkdown('| a | b |\n| --- | --- |\n| 1 | 2 |')
// 仍是普通文本，没有 <table>
```

README 写明表格尚未支持。code / 缩进块会走 `encodeAttr`；这不等于对整篇 HTML 消毒。

## 踩过的坑

1. **当成 sanitizer**：README 指向 issue #70，明确不清洗 HTML。段落里的标签会原样留下。
2. **期待 GFM 表格或任务列表**：源码和测试都没有 table 分支。
3. **以为未闭合标记会报错**：`flush()` 会补 `</em>` / `</strong>`；`foo**` 会变成 `foo<strong></strong>`。
4. **把 README 的 “1kb gzipped” 写成测量结果**：本轮未打包、未测体积。能核对的是单文件实现和无生产依赖。
5. **给它一套 Showdown 式的 options 对象**：函数签名没有 flavor，也没有 `html: false`。

## 适用 vs 不适用场景

**适用**：

- 可信的短文本、评论预览、体积敏感的浏览器小工具
- 只要强调、标题、链接、列表、fence、引用和 hr
- 想在一个下午读完全部实现

**不适用**：

- 用户提交内容且没有 sanitizer
- 需要表格、脚注、或可开关的 GFM
- 需要 flavor、事件、HTML → Markdown → 看 [[showdown]]
- 需要 AST、source map 或插件链 → 看 [[unified]]

## 固定版本边界

- 本文绑定 `developit/snarkdown@a6dc55c93e29e40d3d77b759ce3a6070537028ee`，tag / npm latest / `gitHead` 均为 `2.0.0`。
- `package.json` 无 `dependencies`；发布 `src`、`dist` 与 `snarkdown.d.ts`。
- 默认导出单函数；第二参数是可选的 reference 字典。
- README 写明不 sanitize、表格未支持；测试文件没有 table case。
- 本文未安装依赖、运行 mocha 或测量 bundle，状态保持 `UNVERIFIED`。

## 学到什么

1. **“一个正则”把优先级写进捕获组顺序**——谁先匹配，谁先变成 HTML。
2. **`TAGS[token[1]]` 是用字符串下标区分单双标记**——不是两套 tokenizer。
3. **小实现把安全边界推给调用方**——code 编码不等于文档消毒。
4. **递归 parse 换来列表/引用嵌套，也换来“缺表格就缺表格”**——没有 extension 口。

## 应用型自测

1. `snarkdown('*foo')` 会留下未闭合的 `<em>` 吗？
2. `snarkdown('| a | b |\n| --- | --- |')` 会生成 `<table>` 吗？
3. 段落里写 `<script>alert(1)</script>`，函数会把它转义掉吗？

检查点：

1. 不会。`flush()` 会补 `</em>`。
2. 不会。没有 table 分支。
3. 不会。未匹配文本按原样拼回；`encodeAttr` 只用于属性与 code。

## 延伸阅读

- 固定源码：[developit/snarkdown](https://github.com/developit/snarkdown) —— 本文绑定提交 `a6dc55c93e29e40d3d77b759ce3a6070537028ee`
- README 对 XSS 的说明：[issue #70](https://github.com/developit/snarkdown/issues/70)
- [[showdown]] —— 同是正则转换，但有 Converter / flavor
- [[marked]] —— 默认 GFM 的对照
- [[markdown-it]] —— 默认过滤协议与 HTML 直通

## 关联

- [[showdown]] —— flavor + subParser 的工业级正则路线
- [[marked]] —— token 数组，而不是单正则替换
- [[markdown-it]] —— Ruler 可插拔
- [[micromark]] —— 字符状态机
- [[unified]] —— 先建树再变换

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
