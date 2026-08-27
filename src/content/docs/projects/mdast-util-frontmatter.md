---
title: mdast-util-frontmatter — 把 frontmatter 事件收成 Literal 节点
description: 介绍 mdast-util-frontmatter 2.0.1 如何把 YAML/TOML 围栏编成 mdast Literal，并按同一套 matter 表写回 markdown。
来源: https://github.com/syntax-tree/mdast-util-frontmatter
日期: 2026-08-27
分类: Markdown / 解析
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/syntax-tree/mdast-util-frontmatter
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: d76616b88bdafdbbcd97247c4d3a8a41cc71ae48
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 2.0.1
---

## 是什么

`mdast-util-frontmatter` 给 mdast 补上 frontmatter 的“建树”和“写回”两端：一边把 [[micromark-extension-frontmatter]] 发出的事件收成 `{type, value}` Literal，一边再把这种节点序列化回围栏。日常类比：邮局只把信封原样装进档案袋并贴上“YAML”标签，并不拆信读内容。

你写：

```js
import {fromMarkdown} from 'mdast-util-from-markdown'
import {frontmatter} from 'micromark-extension-frontmatter'
import {frontmatterFromMarkdown} from 'mdast-util-frontmatter'

fromMarkdown('---\nfoo: bar\n---\n', {
  extensions: [frontmatter()],
  mdastExtensions: [frontmatterFromMarkdown()]
})
// children: [{type: 'yaml', value: 'foo: bar'}]
```

固定 2.0.1 只导出 `frontmatterFromMarkdown` 和 `frontmatterToMarkdown`。它自己不跑状态机，也不调用 YAML/TOML parser。

## 为什么重要

只装 syntax 扩展、不装这层 mdast 扩展时，树里不会出现 `yaml` / `toml` 节点。反过来，只装 mdast 扩展、不装 syntax 扩展，事件根本不会进来。这层还决定：

- `value` 里还剩不剩围栏两侧的换行
- 空 frontmatter 写回时是不是仍要成对输出 `---\n---`
- 正文里长得像围栏的文本会不会在序列化时被转义
- 为什么 TypeScript 默认认得 `yaml`，却不一定认得 `toml`

## 核心要点

固定 2.0.1 的主链可以拆成五步：

1. **options 直接复用 syntax 包**：`toMatters` 从 `micromark-extension-frontmatter` 引入。字符串 `'yaml'` / `'toml'`、自定义 `{type, marker|fence}` 以及数组，两边必须一致。

2. **from-markdown 按 type 挂 enter/exit**：每个 matter 注册 `enter[type]`、`exit[type]`、`exit[type + 'Value']`。enter 时压入 `{type: matter.type, value: ''}` 并开始 `buffer()`。

3. **value 当普通 data 收**：`type + 'Value'` 的 exit 只是转调 `config.enter.data` / `config.exit.data`。close 时 `resume()`，再用正则去掉首尾一个换行，得到最终 `value`。

4. **to-markdown 按围栏拼回文本**：`open + (value ? '\n' + value : '') + '\n' + close`。空字符串也会写出开栏、换行、闭栏。

5. **unsafe 防止正文再被当成围栏**：开栏第一个字符标成 `atBreak`，第二个字符经 `escape-string-regexp` 放进 `after`。自定义 `*` 这类 marker 时，正文里的 `*a` 会被写成 `\*a`。

## 实践示例

### 案例 1：YAML 进树时只保留栏内文本

```js
import {fromMarkdown} from 'mdast-util-from-markdown'
import {frontmatter} from 'micromark-extension-frontmatter'
import {frontmatterFromMarkdown} from 'mdast-util-frontmatter'

const tree = fromMarkdown('---\nfoo: bar\n---\n', {
  extensions: [frontmatter()],
  mdastExtensions: [frontmatterFromMarkdown()]
})
// tree.children[0] => {type: 'yaml', value: 'foo: bar'}
```

`foo: bar` 仍是字符串。没有 `title` 字段，也没有 JS 对象。

### 案例 2：空节点写回仍是一对围栏

```js
import {toMarkdown} from 'mdast-util-to-markdown'
import {frontmatterToMarkdown} from 'mdast-util-frontmatter'

toMarkdown(
  {type: 'root', children: [{type: 'yaml', value: ''}]},
  {extensions: [frontmatterToMarkdown()]}
)
// '---\n---\n'
```

`value` 为空时不加中间行，但开栏和闭栏都在。这和 from-markdown 把 `---\n---` 收成 `value: ''` 对得上。

### 案例 3：TOML 与自定义 type 要两侧一起开

```js
fromMarkdown('+++\ntitle = "New Website"\n+++\n# Other', {
  extensions: [frontmatter(['yaml', 'toml'])],
  mdastExtensions: [frontmatterFromMarkdown(['yaml', 'toml'])]
})
// 第一个子节点 type 为 'toml'
```

只给一边 `'toml'`，另一边仍默认 YAML，围栏会对不上。自定义 `{type: 'json', fence: {open: '{', close: '}'}}` 同样要两边同构。

## 踩过的坑

1. **以为节点里已经是解析后的对象**：`value` 是字面量。要字段，还得再接 YAML/TOML 库；本包只负责树形容器。

2. **漏挂 micromark 扩展**：`frontmatterFromMarkdown()` 只处理已经出现的 token。没有 [[micromark-extension-frontmatter]]，`---` 仍会按 thematic break 进树。

3. **TOML 类型在 `@types/mdast` 里不是默认成员**：README 要求把 `toml` 加进 `FrontmatterContentMap`。运行时节点可以存在，类型检查不会自动认。

4. **把首尾换行去净理解成“压缩空白”**：只剥第一和最后一个 EOL。栏内空行会保留，`a\n\nb` 写回仍是两段。

5. **自定义 marker 忘了看 unsafe**：序列化时会转义“看起来像开栏”的正文。这是为了 round-trip，不是样式选择。

## 适用 vs 不适用场景

**适用**：

- 已经在用 `mdast-util-from-markdown` / `mdast-util-to-markdown`，需要 YAML/TOML 节点进出树
- 要和 [[micromark-extension-frontmatter]] 共用同一套 matter
- 需要把 Literal 写回围栏，并接受 unsafe 转义

**不适用**：

- 只想直接得到 HTML、不要 AST——只挂 micromark 的 HTML 扩展即可
- 需要在这一层完成 frontmatter schema 校验或默认值填充
- 不能接受“文档头至多一个 frontmatter 节点”的 mdast 内容模型

## 固定版本边界

- 本文绑定 `syntax-tree/mdast-util-frontmatter@d76616b88bdafdbbcd97247c4d3a8a41cc71ae48`，tag `2.0.1` 与 npm `gitHead` 指向同一提交。
- `package.json` 声明 `sideEffects: false`、ESM only；README 写明 Node 16+，并要求 `mdast-util-from-markdown` / `mdast-util-to-markdown` 2+。
- 运行时依赖包含 `micromark-extension-frontmatter@^2.0.0`、`devlop`、`escape-string-regexp` 与两套 mdast util。
- 本文未安装依赖、运行上游测试或测量 bundle，状态保持 `UNVERIFIED`。

## 学到什么

1. **建树层不重复发明围栏规则**——matter 表来自 syntax 包，mdast 只负责节点形状。
2. **Literal 的 `value` 是去了围栏换行的原文**——不是解析后的映射。
3. **序列化是对称合同**——空值仍写一对围栏；自定义 marker 会进入 unsafe。
4. **类型默认值比运行时更窄**——`yaml` 在 `@types/mdast` 里现成，`toml` 要自己登记。

## 应用型自测

1. `fromMarkdown('---\n---', {extensions: [frontmatter()], mdastExtensions: [frontmatterFromMarkdown()]})` 的第一个子节点 `value` 是什么？
2. 只传 `mdastExtensions: [frontmatterFromMarkdown()]`、不传 micromark `extensions`，`---` 会变成 `yaml` 节点吗？
3. 把 `{type: 'yaml', value: ''}` 交给 `frontmatterToMarkdown()`，输出有几行围栏？

检查点：

1. 空字符串。close 会去掉首尾换行。
2. 不会。没有 syntax 扩展时它仍是 thematic break。
3. 两行：`---\n---\n`。空值不加中间内容行。

## 延伸阅读

- 固定源码：[syntax-tree/mdast-util-frontmatter](https://github.com/syntax-tree/mdast-util-frontmatter) —— 本文绑定提交 `d76616b88bdafdbbcd97247c4d3a8a41cc71ae48`
- [[micromark-extension-frontmatter]] —— 必须成对使用的 token 层
- [[micromark]] —— 事件流从这里发出
- [[unified]] —— mdast 节点随后交给 remark plugin

## 关联

- [[micromark-extension-frontmatter]] —— 同一份 matter 表的 tokenize / HTML 层
- [[micromark]] —— 不建树的底层状态机
- [[unified]] —— 把 from-markdown 扩展挂进 processor

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
