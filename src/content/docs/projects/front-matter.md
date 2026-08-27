---
title: front-matter — 只用正则抽 YAML 头的小解析器
description: 介绍 front-matter 4.0.2 如何用首行分隔符和 js-yaml 3 抽出 attributes / body，并对照 gray-matter 的缺闭合语义。
来源: https://github.com/jxson/front-matter
日期: 2026-08-27
分类: Markdown / 解析
难度: 入门
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/jxson/front-matter
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: af61f89f5aa17cc848ba5a6796e1221c7c26cf96
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 4.0.2
---

## 是什么

front-matter 是一个只从字符串里抽 YAML 头的小库。日常类比：它不拆整封信，只看第一行是不是约定好的封条；封条成对，就把卡片读出来，否则整封原样还给你。

你写：

```js
var fm = require('front-matter');
var file = fm('---\ntitle: Home\n---\nOther stuff');
// file.attributes.title === 'Home'
// file.body === 'Other stuff'
// file.bodyBegin === 4
```

固定 `4.0.2` 不做文件 IO，没有 engine 表，也没有 excerpt。返回字段是 `attributes` / `body` / `bodyBegin` / `frontmatter`，不是 gray-matter 的 `data` / `content`。

## 为什么重要

不理解它的首行规则和闭分隔符，就解释不了下面几件事：

- 为什么 2.0 之后 front-matter 必须从文件第一行开始，中间的 `---` 不算
- 为什么闭标记可以是 `...`，而不只是再来一行 `---`
- 为什么缺闭合时它把原文当 `body`，而 [[gray-matter]] 会把正文吞掉
- 为什么默认遇到 YAML `!!js/function` 会抛错，要显式 `allowUnsafe`

## 核心要点

固定 4.0.2 的主链很短：

1. **先看第一行**：把输入按行切开。第一行匹配 `= yaml =` 或 `---` 才进入解析；否则返回空 `attributes`、原文 `body`、`bodyBegin: 1`。

2. **再用一条多行正则切块**：开分隔符允许可选 BOM，然后是 `---` 或 `= yaml =`；闭分隔符必须是**同一个开标记**或 `...`，并且单独占行。

3. **只走 YAML**：中间块 `trim` 后交给 `js-yaml@^3.13.1`。默认 `safeLoad`；`allowUnsafe: true` 才用 `load`。解析结果若是假值，就回退成 `{}`。

4. **记下正文起点**：`body` 是去掉整段匹配后的剩余字符串；`bodyBegin` 是 1-based 行号，指向正文开始行。

5. **`fm.test` 用同一条正则**：它要求开闭都在，因此半截 `---` 不会被判为 true。

## 实践示例

### 案例 1：`---` 与 `= yaml =`

```js
var fm = require('front-matter');

fm('---\ntitle: A\n---\nHello');
fm('= yaml =\ntitle: B\n= yaml =\nHello');
```

两种开标记都合法。闭标记必须与开标记成对，或者改成 YAML 文档结束符 `...`。

### 案例 2：用 `...` 结束 YAML 文档

```js
var file = fm('---\ntitle: Dots\n...\nIt should not break with ...\n');
// file.attributes.title === 'Dots'
```

这是 YAML 1.1 风格的文档结束，不是 Markdown 水平线。正文里再出现 `...` 不会被这条正则二次切开，因为它已经只匹配开头那一块。

### 案例 3：缺闭合与不安全 YAML

```js
fm('---\nfoo: bar');                 // attributes {}，body 仍是原文
fm(unsafe, { allowUnsafe: true });   // 才允许 js-yaml.load
```

测试里半截输入（只有 `---`、或 `---\nfoo: bar` 还没写下闭标记）保持“尚未形成 front-matter”。默认 `safeLoad` 会拒绝 `!!js/function` 这类构造；要复现测试里的 RegExp 字面量，必须传 `allowUnsafe: true`。

## 踩过的坑

1. **按 gray-matter 的字段名取值**：这里没有 `data` / `content`。要用 `attributes` / `body`。`frontmatter` 是中间那块原始 YAML 文本。

2. **以为它和 gray-matter 一样会吞掉缺闭合的正文**：本库在正则失败时把整段当 `body`。[[gray-matter]] 找不到闭分隔符时 `content` 变为 `''`。

3. **在正文中间写 `---` 当 front-matter**：2.0.0 起只认第一行。后面的 `---` 可以安全出现在 Markdown 里。

4. **把默认解析当成“能跑任意 YAML 类型”**：默认 `safeLoad`。`allowUnsafe` 才会调用 `load`，这会执行 YAML 里的危险标签。

5. **以为它能换分隔符或抽 excerpt**：固定源码没有 `delims`、engine 或 excerpt。那些是 [[gray-matter]] 的合同。

## 适用 vs 不适用场景

**适用**：

- 只要从字符串抽出 YAML 头，并且接受 `---` / `= yaml =` / `...` 这三种标记
- 调用方自己读文件，不希望库碰 `fs`
- 希望缺闭合时保持原文，方便边输入边解析

**不适用**：

- 需要 JSON / JavaScript front-matter、自定义分隔符或 excerpt——看 [[gray-matter]]
- 需要把正文解析成 Markdown AST——看 [[micromark]] / [[unified]]
- 不能接受 js-yaml 3，或必须在浏览器里安全执行不可信 YAML
- 要把体积或速度写成已测事实——本轮未打包、未跑 tape

## 固定版本边界

- 本文绑定 `jxson/front-matter@af61f89f5aa17cc848ba5a6796e1221c7c26cf96`，即 annotated tag `v4.0.2` 的 peel 提交；`package.json` 为 `4.0.2`，与 npm `front-matter@4.0.2` 的 `gitHead` 一致。
- 运行时依赖只有 `js-yaml@^3.13.1`。包没有 `engines` 字段。
- `package.json` 的 `files` 只列出 `index.d.ts`；发布面以 npm 实际打包为准，源码入口是 `index.js`。
- 本文未安装依赖、未跑 `make test` / `check-dts`，状态保持 `UNVERIFIED`。

## 学到什么

1. **返回字段名就是合同**——`attributes` / `body` 不能和 gray-matter 混用。
2. **首行 + 成对闭标记**决定“这是不是 front-matter”；半截输入保持原文。
3. **`...` 是 YAML 文档结束，不是第三种任意分隔符**。
4. **安全默认是 `safeLoad`**；`allowUnsafe` 才打开 `load`。

## 应用型自测

1. `fm('---\nfoo: bar')` 的 `attributes` 是 `{ foo: 'bar' }` 还是 `{}`？
2. 正文第一行不是分隔符、后面才出现 `---` 时，会不会抽出 YAML？
3. 默认解析 `!!js/function` 会走 `safeLoad` 还是 `load`？

检查点：

1. `{}`。正则没见到闭标记，整段当 `body`。
2. 不会。2.0 之后只检查第一行。
3. `safeLoad`。只有 `allowUnsafe: true` 才调用 `load`。

## 延伸阅读

- 仓库：[jxson/front-matter](https://github.com/jxson/front-matter) —— 本文绑定提交 `af61f89f5aa17cc848ba5a6796e1221c7c26cf96`
- 对照：[[gray-matter]] —— engine / excerpt / cache，缺闭合会吞正文
- YAML 实现：[nodeca/js-yaml](https://github.com/nodeca/js-yaml) 3.x
- 站点用法：[[astro]] / [[starlight]] 的 frontmatter 校验是另一层

## 关联

- [[gray-matter]] —— 同主题更厚的解析器，字段名与缺闭合语义都不同
- [[micromark]] —— Markdown 状态机，不管 YAML 头
- [[unified]] —— 文档 AST 管线
- [[marked]] / [[markdown-it]] —— 吃 `body`，不吃 `attributes`
- [[astro]] —— Content Layer 用自己的 schema 验 frontmatter

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
