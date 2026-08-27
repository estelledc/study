---
title: vfile-matter — 用正则取出 YAML 头并写入 file.data.matter
description: 介绍 vfile-matter 如何用锚定正则取出 YAML 头并写入文件的 matter 字段，同时说明 strip 与 YAML 版本边界
来源: https://github.com/vfile/vfile-matter
日期: 2026-08-27
分类: Markdown / 解析
难度: 入门
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/vfile/vfile-matter
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 20c6193bb118f4c65488e0daaf2e66f5cafc733f
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 5.0.1
---

## 是什么

vfile-matter 是一个 vfile 工具函数：它在文件**开头**寻找 YAML 围栏，解析后写到 `file.data.matter`。日常类比：拆快递只看箱门上那张贴纸——贴纸读完贴到档案袋；箱子里的说明书默认还在，除非你明确说“把贴纸撕掉”。

```js
import {matter} from 'vfile-matter'
import {VFile} from 'vfile'

const file = new VFile('---\nkey: value\n---\n\n# Venus')
matter(file)
file.data.matter // { key: 'value' }
```

固定 5.0.1 只导出命名函数 `matter`。它不走 remark、不建 AST；`String(file)` 之后用一条锚定正则匹配。

## 为什么重要

不读固定源码，下面这些合同很容易写反：

- 为什么 remark 管线里“已经挂了 [[remark-frontmatter]]”仍拿不到对象
- 为什么 `+++` TOML 头在这里完全无效
- 为什么没有头时 `file.data.matter` 不是 `undefined`，而是 `{}`
- 为什么 `yes: no` 在 YAML 1.1 和 1.2 下会变成两套完全不同的对象

## 核心要点

`lib/index.js` 的主链可以按五行读完：

1. **取值**：`document = String(file)`。若 `file.value` 是 `Uint8Array`，按 UTF-8 文本处理。
2. **匹配**：`/^---(?:\r?\n|\r)(?:([\s\S]*?)(?:\r?\n|\r))?---(?:\r?\n|\r|$)/`。必须从第一字节开始，围栏字符写死为 `---`。
3. **解析**：命中则 `file.data.matter = yaml.parse(match[1] || '', yamlOptions) || {}`。解析结果是 `null` 时也落成空对象。
4. **可选剥离**：`strip: true` 时用 `document.slice(match[0].length)` 改写 `file.value`；原来是字节数组就再用 `TextEncoder` 编回去。
5. **未命中**：只做 `file.data.matter = {}`，不改 `file.value`。

`yaml` 选项原样传给 `yaml.parse('', x)`。测试里 `version: '1.2'` 让 `yes: no` 变成 `{yes: 'no'}`；`version: '1.1'` 变成 `{true: false}`。

## 实践示例

### 案例 1：解析对象，默认不删原文

```js
import {matter} from 'vfile-matter'
import {VFile} from 'vfile'

const file = new VFile('---\nkey: value\nlist:\n  - 1\n  - 2\n---\nHere is a document\n')
matter(file)

file.data.matter // { key: 'value', list: [1, 2] }
String(file).startsWith('---') // true，围栏还在
```

`strip` 默认是 `false`。对 markdown 保持位置信息时，通常不要剥。

### 案例 2：`strip: true` 只切开头那一段

```js
const file = new VFile(
  '---\nkey: value\n---\nHere is a document\nHere is a thematic break\n---\nEnd'
)
matter(file, {strip: true})
String(file)
// 'Here is a document\nHere is a thematic break\n---\nEnd'
```

正文里后来的 `---` 不是 frontmatter，正则也不会第二次匹配。整份文件若只有围栏，剥完是空字符串。

### 案例 3：空头、无头、空白行都落到 `{}`

```js
matter(new VFile('Here is a document\n'))           // { matter: {} }
matter(new VFile('---\n---\n'))                     // { matter: {} }
matter(new VFile('---\n\n---\n'))                   // { matter: {} }
matter(new VFile('---\n \t\n---\n'))                // { matter: {} }
```

空围栏时捕获组可能是 `undefined`，代码写成 `match[1] || ''` 再交给 `yaml.parse`。

## 踩过的坑

1. **拿它当 remark 插件**：公开 API 是 `matter(file, options)`，没有 default export，也不会登记 micromark 扩展。
2. **指望它读 TOML / JSON 围栏**：正则只认开头的 `---`。`+++` 不会进入 `yaml.parse`。
3. **把“没有 frontmatter”理解成“没有 `matter` 字段”**：未命中也会写成 `{}`。
4. **默认 YAML 版本依赖 `yaml@^2`**：`yes` / `on` / `no` 是否变成布尔，要看传入的 `yaml.version`。本轮未改上游默认。
5. **`strip: true` 会打乱 markdown 的行列号**：README 自己提醒，剥掉围栏后，lint 报错位置会对不上。

## 适用 vs 不适用场景

**适用**：

- 文件头是 YAML，目标是 `file.data.matter`
- HTML / 纯文本等“自己不懂 frontmatter”的语言，需要可选剥离
- 已经有 VFile，不想为了取几个字段拉整条 remark 管线

**不适用**：

- 需要把围栏保留成 mdast 节点并写回——应看 [[remark-frontmatter]]
- 文档用 TOML / JSON 头，或围栏出现在正文中间
- 需要在浏览器里流式解析超大文件——整份 `String(file)` 一次性进正则
- 不能接受 ESM-only 与 `yaml` / `vfile` 两个运行时依赖

## 固定版本边界

- 本文绑定 `vfile/vfile-matter@20c6193bb118f4c65488e0daaf2e66f5cafc733f`，tag `5.0.1` 与 npm `vfile-matter@5.0.1` 的 `gitHead` 同指此提交。
- `package.json` 为 `"type": "module"`、`"sideEffects": false`；生产依赖是 `vfile@^6.0.0` 与 `yaml@^2.0.0`。
- README 写当前主线兼容 Node 16+；本轮未执行兼容矩阵，也未跑 `test-api`。
- 本文未测量包体积或下载量，状态保持 `UNVERIFIED`。

## 学到什么

1. **取值库可以完全不碰 AST**——一条锚定正则加 `yaml.parse` 就构成合同。
2. **空结果也是合同**——没找到头时写入 `{}`，调用方不必判 `undefined`。
3. **strip 是破坏性选项**——对 markdown 通常留着围栏，交给 [[remark-frontmatter]] 管语法。
4. **YAML 方言会改变键和值**——`yes: no` 不是稳定的字符串对。

## 应用型自测

1. `matter(new VFile('# Hello'))` 之后，`file.data.matter` 是 `undefined` 还是 `{}`？
2. 文件以 `+++title = "x"+++` 开头时，`matter` 会不会解析出对象？
3. `matter(file, {yaml: {version: '1.1'}})` 解析 `---\nyes: no\n---\n` 会得到什么？

检查点：

1. 是 `{}`。未命中走 `else` 分支，仍赋值。
2. 不会。正则要求开头是 `---`，`+++` 不会匹配。
3. `{true: false}`。YAML 1.1 把 `yes`/`no` 当成布尔。

## 延伸阅读

- 文档：[github.com/vfile/vfile-matter](https://github.com/vfile/vfile-matter)
- YAML 实现：[eemeli/yaml](https://github.com/eemeli/yaml)
- 固定源码：[vfile/vfile-matter](https://github.com/vfile/vfile-matter) —— 本文绑定提交 `20c6193bb118f4c65488e0daaf2e66f5cafc733f`
- [[remark-frontmatter]] —— 同一生态里负责围栏语法，不负责取值
- [[unified]] —— `file.data` 作为贯穿管线的元数据口袋

## 关联

- [[remark-frontmatter]] —— 建 `yaml`/`toml` 节点，不调用 `yaml.parse`
- [[unified]] —— vfile 与 `file.data` 的宿主
- [[micromark]] —— 若只要 HTML 且要合规围栏，应走扩展而不是这条正则
- [[starlight]] —— 文档站元数据常见落点仍是 YAML 头
- [[markdown-it]] —— 另一条端到端 HTML 路径，不使用 vfile

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[remark-frontmatter]] —— remark-frontmatter — 只认 frontmatter 围栏，不解析里面的值
