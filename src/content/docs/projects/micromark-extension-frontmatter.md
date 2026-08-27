---
title: micromark-extension-frontmatter — 在状态机入口认出 YAML/TOML 围栏
description: 介绍 micromark-extension-frontmatter 2.0.0 如何把 YAML/TOML 围栏登记成 flow construct，并在 HTML 阶段整段丢弃。
来源: https://github.com/micromark/micromark-extension-frontmatter
日期: 2026-08-27
分类: Markdown / 解析
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/micromark/micromark-extension-frontmatter
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 519a2880cab7d0065f534a70c851a38dd9b5a7f2
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 2.0.0
---

## 是什么

`micromark-extension-frontmatter` 是 [[micromark]] 的 syntax / HTML 扩展：它在字符状态机里认出文档开头的 YAML 或 TOML 围栏，发出 token，并在转 HTML 时把这段元数据丢掉。日常类比：安检口只核对行李箱拉链是不是按规定拉上，并不打开箱子清点衣服。

你写：

```js
import {micromark} from 'micromark'
import {frontmatter, frontmatterHtml} from 'micromark-extension-frontmatter'

micromark('---\ntitle: Venus\n---\n# Hi', {
  extensions: [frontmatter()],
  htmlExtensions: [frontmatterHtml()]
})
// '<h1>Hi</h1>'
```

默认只认 YAML（`---`）。固定 2.0.0 的公开符号是 `frontmatter`、`frontmatterHtml` 和 `toMatters`。仓内可读源在 `dev/`；发布物的默认入口是 `micromark-build` 生成的 `index.js`。

## 为什么重要

不读这层 construct，就很难解释 unified 管线为什么“看见了 frontmatter，页面上却没有它”：

- 为什么单独一行 `---` 仍是 thematic break，而 `---\n---` 才是空 YAML
- 为什么默认只认文档第一行、第一列，中间再写 `---` 不会变成元数据
- 为什么加了 syntax 扩展却忘了 `htmlExtensions` 时，HTML 里仍可能漏出原文
- 为什么它从不告诉你 `title` 等于什么——围栏里面只是原始文本

## 核心要点

固定 2.0.0 的主链可以拆成五步：

1. **先把 options 收成 matter 表**：`toMatters` 把缺省值收成 `['yaml']`。内建 preset 只有 `yaml`（marker `-`）和 `toml`（marker `+`）。未知字符串会抛 `Missing matter definition`。

2. **按开栏首字符挂到 `flow`**：`frontmatter()` 用开栏第一个字符当 construct 键，并始终放进数组。construct 标了 `concrete: true`，认成功就不再让别的 flow 规则争。

3. **位置合同很窄**：开栏必须在第 1 列；默认还要在第 1 行。`anywhere: true` 才能在后文再认一次，源码注释把它写成“terrible idea”。

4. **围栏长度和后缀都卡死**：`marker` 会重复三次；`fence` 用完整字符串。栏后只允许空白。少一个、多一个、后面跟别的字符，或一直读到 EOF 还没闭合，都会 `nok`。

5. **HTML 扩展负责吞掉**：`frontmatterHtml` 在 enter 时 `buffer()`，exit 时 `resume()` 并设置 `slurpOneLineEnding`。它不把 YAML 编成标签，也不做反序列化。

## 实践示例

### 案例 1：默认 YAML 只影响文档头

```js
import {micromark} from 'micromark'
import {frontmatter, frontmatterHtml} from 'micromark-extension-frontmatter'

micromark('---\na: b\n---\n# c', {
  extensions: [frontmatter()],
  htmlExtensions: [frontmatterHtml()]
})
// '<h1>c</h1>'
```

`frontmatter()` 不传参时等价于 YAML preset。标题仍按普通 markdown 渲染；围栏本身不出现在 HTML 里。

### 案例 2：TOML 要显式换 preset

```js
micromark('+++\ntitle = "Venus"\n+++\n# Body', {
  extensions: [frontmatter('toml')],
  htmlExtensions: [frontmatterHtml('toml')]
})
```

`+` 不是 YAML。syntax 和 HTML 两侧都要传同一份 options，否则一边认围栏、一边不会丢掉对应 token。

### 案例 3：自定义 fence 与失败回退

```js
const json = {type: 'json', fence: {open: '{', close: '}'}}
micromark('{\n"a": 1\n}\n# After', {
  extensions: [frontmatter(json)],
  htmlExtensions: [frontmatterHtml(json)]
})
```

`fence` 不必是三个相同字符。单独 `---` 没有闭合栏，测试里会退回 `<hr />`，不会建成空 YAML。

## 踩过的坑

1. **把“认围栏”当成“解析 YAML”**：token 的 `Value` 只是原文。`title: Venus` 不会变成对象。要树节点再看 [[mdast-util-frontmatter]]；要字段值得自己接 YAML 库。

2. **只挂 syntax、不挂 HTML 扩展**：`frontmatter()` 只改状态机。没有 `frontmatterHtml()`，编译阶段不知道这段该丢掉。

3. **给围栏加缩进或写在第二段**：` ---\n---` 是两个 thematic break。默认也不认标题后面的 `---`。

4. **把 `anywhere` 当常规开关**：类型注释写明这会让 markdown 更难移植。测试里它确实能在中间再认一次，但不该当默认。

5. **未知 preset 不会静默忽略**：`frontmatter('jsonml')` 直接抛错，不是退回 YAML。

## 适用 vs 不适用场景

**适用**：

- 已经在用 [[micromark]]，只想让文档头的 YAML/TOML 围栏变成可丢弃 token
- 需要和 [[mdast-util-frontmatter]] 共用同一份 matter 表
- 自定义围栏字符，但不想改 micromark 核心

**不适用**：

- 业务代码只想 `unified().use(...)` 一次配好——应走上层 remark 插件，而不是直接拼 construct
- 需要把 frontmatter 解析成对象并做 schema 校验——本包不读 YAML 语义
- 不能接受“必须成对闭合、不能缩进、默认只在文首”的 GitHub 风格合同

## 固定版本边界

- 本文绑定 `micromark/micromark-extension-frontmatter@519a2880cab7d0065f534a70c851a38dd9b5a7f2`，tag `2.0.0` 与 npm `gitHead` 指向同一提交。
- `package.json` 无 `engines` 字段；README 写明 Node 16+、ESM only，并声明兼容 `micromark` 3+。
- 生产依赖是 `fault`、`micromark-util-character`、`micromark-util-symbol`、`micromark-util-types`。
- 本轮读的是 `dev/`；未运行 `micromark-build`，也未安装依赖或跑上游测试。状态保持 `UNVERIFIED`。

## 学到什么

1. **frontmatter 在 micromark 里是 flow construct，不是正则预处理**——认不认得出，取决于列、行、精确围栏和闭合栏。
2. **syntax 和 HTML 是两套扩展**——前者发 token，后者决定这些 token 会不会变成 HTML。
3. **preset 只负责围栏字符**——`yaml` / `toml` 不内置对应语言的 parser。
4. **失败要退回普通 markdown**——未闭合或缩进的 `---` 仍按 thematic break 处理。

## 应用型自测

1. `micromark('---', {extensions: [frontmatter()], htmlExtensions: [frontmatterHtml()]})` 会得到空字符串吗？
2. 默认 `frontmatter()` 会不会把文档中间的 `---\nkey: v\n---` 收成 YAML token？
3. `frontmatterHtml()` 会不会把 `title: Venus` 编进 `<pre>` 或 data 属性？

检查点：

1. 不会。单栏没有闭合，会按 thematic break 输出 `<hr />`。
2. 不会。默认要求第 1 行；中间这段仍是普通分隔线与段落。
3. 不会。它 `buffer` / `resume`，HTML 里不留下这段文本。

## 延伸阅读

- 固定源码：[micromark/micromark-extension-frontmatter](https://github.com/micromark/micromark-extension-frontmatter) —— 本文绑定提交 `519a2880cab7d0065f534a70c851a38dd9b5a7f2`
- [[micromark]] —— 被挂入的字符状态机
- [[mdast-util-frontmatter]] —— 把同一批 token 收成 mdast Literal
- [[unified]] —— 上层 processor 如何把 micromark 扩展和 mdast 扩展串起来

## 关联

- [[micromark]] —— flow construct 的宿主
- [[mdast-util-frontmatter]] —— 建树 / 序列化对照层
- [[unified]] —— remark 管线会把这两层一起挂上

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
