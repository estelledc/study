---
title: remark-frontmatter — 只认 frontmatter 围栏，不解析里面的值
description: 介绍 remark-frontmatter 如何把 YAML 与 TOML 围栏挂进 micromark 与 mdast，以及它为什么不把键值拆成对象。
来源: https://github.com/remarkjs/remark-frontmatter
日期: 2026-08-27
分类: Markdown / 解析
难度: 入门
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/remarkjs/remark-frontmatter
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: df7122f529563e35183f97e6643d9bf1725c60f2
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 5.0.0
---

## 是什么

remark-frontmatter 是一个 [[unified]] / remark 插件：它让处理器认出文档开头的 YAML、TOML 或其他围栏，并在 mdast 里留下对应节点。日常类比：像给传送带加一个“包装盒通道”——盒子会被单独抬下来，但盒子里的说明书原封不动，不会被拆开读。

```js
import remarkFrontmatter from 'remark-frontmatter'
import {remark} from 'remark'

const tree = remark().use(remarkFrontmatter).parse('---\ntitle: example\n---\n\n# Default')
```

固定 5.0.0 的默认选项是字符串 `'yaml'`。解析后第一个子节点是 `{type: 'yaml', value: 'title: example'}`，不是 `{title: 'example'}`。

## 为什么重要

不读固定 5.0.0 源码，下面几件事很容易被 README 例子带偏：

- 为什么 `.use(remarkFrontmatter)` 之后 `file.data` 仍然没有标题
- 为什么 `+++layout = "solar-system"+++` 默认会变成普通段落，而不是 `toml` 节点
- 为什么正文中间的 `---` 还是 thematic break，不会被收成 frontmatter
- 为什么它和 [[vfile-matter]] 常常成对出现：一个管语法树，一个管 YAML 取值

## 核心要点

固定版本的主链只有四步，全部发生在 `lib/index.js`：

1. **取配置**：`options || 'yaml'`。`null` / `undefined` 都回退到 YAML preset。
2. **拿到 processor 数据袋**：`const data = this.data()`，再保证三个数组存在：`micromarkExtensions`、`fromMarkdownExtensions`、`toMarkdownExtensions`。
3. **挂三层扩展**：`micromark-extension-frontmatter` 负责扫字符；`mdast-util-frontmatter` 的 `frontmatterFromMarkdown` / `frontmatterToMarkdown` 负责建树和写回。
4. **到此结束**：函数返回 `undefined`。没有任何 `yaml.parse`，也不会写 `file.data.matter`。

未知 preset、缺 `type`、或既没有 `marker` 也没有 `fence` 时，测试在 `.freeze()` 阶段抛错，例如 `Missing matter definition for \`jsonml\``。

## 实践示例

### 案例 1：默认只认 YAML，节点里仍是原文

```js
import {remark} from 'remark'
import remarkFrontmatter from 'remark-frontmatter'

const tree = remark()
  .use(remarkFrontmatter)
  .parse('---\ntitle: example\n---\n\n# Default')

tree.children[0]
// { type: 'yaml', value: 'title: example', position: ... }
```

空围栏 `---\n---` 也会建成 `yaml` 节点，只是 `value` 是空字符串。插件认出的是围栏，不是键值。

### 案例 2：TOML 必须显式打开

```js
const withToml = remark().use(remarkFrontmatter, ['yaml', 'toml'])
const onlyDefault = remark().use(remarkFrontmatter)

withToml.parse('+++\ntitle= "Title"\n+++\n\n# Default').children[0].type
// 'toml'

onlyDefault.parse('+++\n+++\n\n# Empty').children[0].type
// 'paragraph'，文本是 '+++\n+++'
```

反过来，只传 `['toml']` 时，文档开头的 `---\n---` 会退化成两个 `thematicBreak`。preset 是允许清单，不是“再加一种”。

### 案例 3：默认只看文档开头

```js
const tree = remark()
  .use(remarkFrontmatter)
  .parse('# Two horizontal rules\n\n---\nA horizontal rule\n---\n\nand another.')
```

标题后面的 `---` 仍是 thematic break / setext 标题，不会变成 `yaml`。`anywhere: true` 可以改，但源码注释把它标成“terrible idea”：那就不再是 frontmatter。

## 踩过的坑

1. **把语法插件当成 YAML 解析器**：`yaml` 节点的 `value` 仍是字符串。要对象，得另写 plugin，或接 [[vfile-matter]]。
2. **以为默认同时支持 TOML**：默认 `emptyOptions` 是 `'yaml'`。`+++` 未配置时按普通文本走。
3. **未闭合的开头 `---`**：`---\n\n# Unclosed` 会落成 thematic break，不会吞掉后面整篇。
4. **和 [[micromark]] 扩展抢顺序**：它往 `this.data('micromarkExtensions')` 里 `push`。谁先 `.use()`，状态机分支就按谁的顺序。
5. **把 README 的下载量或体积当成本轮测量**：本轮未安装依赖、未打包、未跑上游测试。

## 适用 vs 不适用场景

**适用**：

- 已经在 remark / [[unified]] 管线里，需要让 YAML 或 TOML 围栏进入 mdast
- 希望 frontmatter 在 stringify 时原样写回，位置信息还在
- 自己决定何时、用哪种语言解析围栏内的文本

**不适用**：

- 只想从文件头取出 `{title, date}`——[[vfile-matter]] 直接写 `file.data.matter`
- 不要 AST、只要 HTML——应看 micromark 加 `micromark-extension-frontmatter`
- 需要 JSON / TOML 取值，却只装了本插件
- 不能接受 ESM-only（`exports` 只有 `./index.js`）

## 固定版本边界

- 本文绑定 `remarkjs/remark-frontmatter@df7122f529563e35183f97e6643d9bf1725c60f2`，tag `5.0.0` 与 npm `remark-frontmatter@5.0.0` 的 `gitHead` 同指此提交。
- `package.json` 为 `"type": "module"`、`"sideEffects": false`；生产依赖是 `unified`、`micromark-extension-frontmatter`、`mdast-util-frontmatter`、`@types/mdast`。
- README 写当前主线兼容 Node 16+、unified 6+、remark 13+；本轮未执行兼容矩阵。
- 本文未安装依赖或运行上游 `test-api`，状态保持 `UNVERIFIED`。

## 学到什么

1. **认出围栏和读出对象是两件事**——本插件只做第一件。
2. **默认合同比名字窄**——包名写 yaml, toml, and more，默认却只有 `'yaml'`。
3. **扩展是 push 进 processor.data()**——顺序、preset 清单和 `anywhere` 都会改树形。
4. **失败发生在 freeze**——非法 matter 定义不会默默忽略。

## 应用型自测

1. `remark().use(remarkFrontmatter).parse('---\\ntitle: a\\n---\\n')` 的第一个子节点，是对象 `{title: 'a'}` 还是带 `value` 的 `yaml` 节点？
2. 不传 options 时，`+++title = "x"+++` 会不会建成 `toml` 节点？
3. 标题后面的 `---` 在默认配置下会不会被收成 frontmatter？

检查点：

1. 是 `{type: 'yaml', value: 'title: a'}`，不是解析后的对象。
2. 不会。默认只有 `'yaml'`；未配置的 `+++` 走段落文本。
3. 不会。默认不设 `anywhere`，文档中间的 `---` 仍是分隔线。

## 延伸阅读

- 文档：[github.com/remarkjs/remark-frontmatter](https://github.com/remarkjs/remark-frontmatter)
- 语法层：[github.com/micromark/micromark-extension-frontmatter](https://github.com/micromark/micromark-extension-frontmatter)
- 树层：[github.com/syntax-tree/mdast-util-frontmatter](https://github.com/syntax-tree/mdast-util-frontmatter)
- 固定源码：[remarkjs/remark-frontmatter](https://github.com/remarkjs/remark-frontmatter) —— 本文绑定提交 `df7122f529563e35183f97e6643d9bf1725c60f2`
- [[vfile-matter]] —— 同一作者生态里负责把 YAML 头读成对象
- [[unified]] —— `.use()` 与 `processor.data()` 的宿主

## 关联

- [[vfile-matter]] —— 解析 YAML 值，不建 mdast 节点
- [[unified]] —— plugin 接口与三次 `data.*Extensions` 登记处
- [[micromark]] —— 真正扫围栏的状态机
- [[starlight]] / [[astro]] —— 文档站常用 remark 管线挂本插件
- [[marked]] —— 另一条“正则换 HTML”的路径，没有这套 mdast 节点

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[vfile-matter]] —— vfile-matter — 用正则取出 YAML 头并写入 file.data.matter
