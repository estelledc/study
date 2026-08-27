---
title: Remarkable — 用三条 Ruler 把 Markdown 编成 token 再渲染的解析器
description: 介绍 Remarkable 如何用 core/block/inline 规则表和 preset 决定 CommonMark 与 GFM 扩展
来源: https://github.com/jonschlinkert/remarkable
日期: 2026-08-27
分类: markdown / 解析
难度: 入门
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/jonschlinkert/remarkable
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 58b6945f203ca7a0bb5a0785df90a3a6a8b9e59c
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 2.0.1
---

## 是什么

Remarkable 是一个可配置的 JavaScript Markdown 解析器：输入文本，先得到扁平 token，再拼成 HTML。日常类比：三条有名字的传送带——core / block / inline——按规则表决定这一站开不开；最后 Renderer 按 token 类型填标签。

你写：

```js
import { Remarkable } from 'remarkable';

const md = new Remarkable();
md.render('# Hello\n\n这是 **粗体**');
```

构造函数第一个参数若不是字符串，就当成 options，preset 回落到 `default`。固定 2.0.1 的发布入口是 `dist/cjs/index.js` / `dist/esm/index.js`。

## 为什么重要

不读固定 2.0.1 的 preset 和 `validateLink`，下面这些合同很容易被 README 一句话带偏：

- 为什么“默认像 GFM、HTML 关掉”成立，而“已经 100% CommonMark”不能当本轮测量
- 为什么 `new Remarkable('commonmark')` 反而打开 `html: true`
- 为什么构造参数里的 `linkify` 只会 `console.warn`
- 为什么 `javascript:` 和所有 `data:` 链接在解析阶段就会失败

## 核心要点

固定 2.0.1 的主链可以拆成五步：

1. **三条 parser + 一个 Renderer**：实例上挂 `inline` / `block` / `core` / `renderer` / `ruler`。`parse()` 建 `StateCore`，`core.process` 按 Ruler 顺序跑；`render()` 再把 token 交给 `Renderer.render`。

2. **preset 同时改选项和规则表**：`configure` 在组件带 `rules` 时用 `ruler.enable(rules, true)`，未列出的规则关掉。`default` 保留 table / del / footnote；`commonmark` 裁掉它们，并设 `html: true`、`xhtmlOut: true`；`full` 的 components 是空对象，规则保持全开。

3. **默认选项**：`html: false`、`breaks: false`、`typographer: false`、`maxNesting: 20`、`highlight: null`。`replacements` 与 `smartquotes` 规则在 default 里是启用的，但函数开头看到 `typographer` 为假就直接返回。

4. **链接在解析期过滤**：`validateLink` 拒绝 `vbscript` / `javascript` / `file` / `data`（含 `data:image/...`），并先 `replaceEntities` 再看协议。`parse_link_destination` 与 autolink 都走它。

5. **linkify 是插件，不是选项**：构造里若出现 `linkify`，只打印迁移警告。要用 `import linkify from 'remarkable/linkify'` 再 `md.use(linkify)`；插件依赖 `autolinker`，命中后仍再跑 `validateLink`。

## 实践示例

### 案例 1：默认实例会出表，CommonMark preset 不会

```js
const gfmish = new Remarkable();
gfmish.render('| a | b |\n| --- | --- |\n| 1 | 2 |');

const strict = new Remarkable('commonmark');
// html: true, xhtmlOut: true, 无 table / del / footnote
strict.render('<em>x</em>');
```

用户内容应保持 `html: false`。要规范锚点用 preset 名，不要只关几个选项。

### 案例 2：改 `link_open` 而不是手写整段 `<a>`

```js
md.renderer.rules.link_open = function (tokens, idx, options) {
  const href = tokens[idx].href;
  const extra = href.startsWith('http') ? ' rel="noopener"' : '';
  return '<a href="' + href + '"' + extra + '>';
};
```

`Renderer` 构造时 `assign` 一份默认 `rules`。`md.use(plugin, options)` 只是 `plugin(this, options)`。

### 案例 3：用 Ruler 开关实验语法

```js
md.inline.ruler.enable(['ins', 'mark']);
md.block.ruler.disable(['table', 'footnote']);
md.core.ruler.enable(['abbr']);
```

README 把 `ins` / `mark` / `sub` / `sup` 标成默认关闭；`full` preset 才会一次打开全部已注册规则。

## 踩过的坑

1. **把 default 当成 CommonMark 参考实现**：默认会出表格和 `~~del~~`。`commonmark` preset 才裁规则，并打开 HTML。
2. **`html: true` 没有 sanitizer**：`htmlblock` / `htmltag` 规则直接回写 `content`。
3. **继续传 `linkify: true`**：选项已删，只会警告；要单独 `use` 插件。
4. **以为 `data:image/png` 能过**：`validateLink` 把整个 `data` 协议拉黑，比 [[commonmark]] 的 `safe` 白名单更严。
5. **把 README 的“100% CommonMark / high speed”写成本轮事实**：本轮未跑 `test/fixtures/commonmark/spec.txt`，也未测吞吐。

## 适用 vs 不适用场景

**适用**：

- 需要默认表、删除线、脚注，并能接受 `html: false`
- 想用 named Ruler 插规则或换 renderer，而不换引擎
- 解析期就要丢掉 `javascript:` / `data:` 链接

**不适用**：

- 必须先得到可改 AST，再决定渲染——[[commonmark]]
- 要 micromark / remark 插件链——[[unified]]
- 还没跑 spec 或 sanitizer，却把“默认 100% CommonMark 且安全”写成无条件事实

## 固定版本边界

- 本文绑定 `jonschlinkert/remarkable@58b6945f203ca7a0bb5a0785df90a3a6a8b9e59c`，tag `v2.0.1` 与源码 `package.json` 的 `2.0.1` 一致。
- npm `remarkable@2.0.1` 未提供 `gitHead`；本页不把 registry metadata 当成同一提交的第三份证明。
- 生产依赖是 `argparse` 与 `autolinker`；`engines.node` 为 `>= 6.0.0`。
- 本文未安装依赖、未跑 mocha / specsplit、未测 bundle，状态保持 `UNVERIFIED`。

## 学到什么

1. **preset 比单个选项更能说明合同**——default 和 commonmark 同时改规则表和 `html`。
2. **Ruler 的 `enable(..., true)` 是独占开关**——未点名的规则会被关掉。
3. **过滤发生在认链接时**——失败的协议不会先做成 token 再等 renderer 删。
4. **文档里的速度和合规率不是本页证据**——静态阅读只能核对规则表，不能代替 spec 运行。

## 应用型自测

1. `new Remarkable().render('| a | b |\n| --- | --- |\n| 1 | 2 |')` 会不会出 `<table>`？
2. `new Remarkable('commonmark').render('<em>x</em>')` 会不会把标签转义掉？
3. `new Remarkable().render('[x](javascript:alert(1))')` 会不会得到带 `javascript:` 的 `<a>`？

检查点：

1. 会。default 的 block 规则包含 `table`。
2. 不会转义。commonmark preset 的 `html` 为 `true`。
3. 不会。`validateLink` 在解析目的地时拒绝该协议。

## 延伸阅读

- 仓库文档：[jonschlinkert/remarkable](https://github.com/jonschlinkert/remarkable) 的 `docs/`
- 固定源码：本文绑定提交 `58b6945f203ca7a0bb5a0785df90a3a6a8b9e59c`
- CommonMark spec：[spec.commonmark.org](https://spec.commonmark.org/)
- [[commonmark]] —— 官方 JS 参考实现，先 AST 再渲染
- [[markdown-it]] —— 后继的 named Ruler 实现，preset 合同相近但不相同

## 关联

- [[commonmark]] —— AST 参考实现；默认不过滤 HTML
- [[markdown-it]] —— 同类三条链，默认 `html: false` 且 `validateLink` 放行部分 data image
- [[marked]] —— 更少依赖、默认 GFM、无 HTML 开关
- [[micromark]] —— unified 生态的底层状态机
- [[unified]] —— remark / rehype 流水线

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
