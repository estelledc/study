---
title: unified — 用冻结 processor 串起 parse / run / stringify
来源: https://github.com/unifiedjs/unified
日期: 2026-05-30
分类: Markdown / 解析
难度: 中级
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/unifiedjs/unified
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 242105bd6e18c61ca10f37d99529b89f1be37518
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 11.0.5
---

## 是什么

unified 是一个**文档处理器内核**：它不认识 Markdown 或 HTML，只约定三段——parser 把文本变成树，transformer 改树，compiler 把树变成结果。日常类比：一条可以换刀具的流水线；默认导出是已经冻结的空线，调用 `unified()` 才复制出还能装刀的新线。

固定 `11.0.5` 的公开入口是 `new Processor().freeze()`。真正干活的是副本上的 `.use()` / `.parse()` / `.run()` / `.stringify()` / `.process()`。

```js
import {unified} from 'unified'
import remarkParse from 'remark-parse'
import remarkStringify from 'remark-stringify'

const file = await unified()
  .use(remarkParse)
  .use(remarkStringify)
  .process('*hi*')
```

没有 parser 或 compiler 时，`process` 会直接抛 `Cannot process without parser/compiler`。

## 为什么重要

不读固定 11.0.5 源码，很容易把 unified 讲成“一个 Markdown 引擎”：

- 为什么 `unified` 自己不能 `process('# hi')`——默认导出是冻结空 processor，还没装 parser
- 为什么 `.use(plugin)` 当时看起来“什么都没发生”——plugin 在 `freeze()` 才被调用
- 为什么第一次 `process` 之后不能再 `.use()`——冻结不可逆，必须先 `processor()` 复制
- 为什么 Markdown 快捷方式可以只有一行——它只是预装了 parse 与 stringify 的 unified 副本

## 核心要点

固定版本可以拆成四层：

1. **可调用实例**：`CallableInstance` 让 `unified` 既是对象又是函数。调用它等于 `copy()`：重放 `attachers`，深拷贝 `namespace`，得到未冻结后代。

2. **先登记，后冻结**：`.use(plugin, opts)` 把元组推进 `attachers`。同函数再次 `.use` 会合并 options（两边都是 plain object 就 `extend(true)`）。`freeze()` 才以 processor 为 `this` 调用 plugin；返回函数就挂到 `trough`。`.use(plugin, false)` 在 freeze 时跳过。

3. **三段可以拆开跑**：`parse` 只建树，`run` 只跑 transformer，`stringify` 只编译。`process` 把三段串起来。compiler 返回 `string` / `Uint8Array` 写入 `file.value`，否则写入 `file.result`。

4. **同步 API 不容异步**：`processSync` / `runSync` 若 transformer 没立刻完成，就抛 `` finished async ``。异步插件必须走 `process` / `run`。

## 实践示例

### 案例 1：空核不能 process，装上才能走完

```js
import {unified} from 'unified'

// unified.process('# x')  // TypeError: Cannot process without parser
const copy = unified() // 未冻结副本
```

默认导出已经 `freeze()`。要配置，先调用它。这不是风格问题，是 `assertUnfrozen` 的硬边界。

### 案例 2：plugin 在 freeze 时才执行

```js
function plugin(options) {
  const self = this
  return function (tree, file) {
    file.data.seen = options?.flag ?? true
  }
}

const processor = unified().use(plugin, {flag: false})
// 此时 attachers 有记录，transformers 还是空 trough
await processor.process(file) // freeze() 才调用 plugin
```

调试“plugin 没生效”时，先问：processor 冻过没有、options 是不是被第二次 `.use` 合并掉、是不是传了 `false`。

### 案例 3：只跑其中一段

```js
const tree = processor.parse('# Hi')
const next = await processor.run(tree)
const text = processor.stringify(next)
```

AST 变换不必每次都经过 stringify。反过来，已经有树时也不必再 parse。

## 踩过的坑

1. **对冻结 processor 调用 `.use()` / `.data(key, value)`**：会抛 `Cannot call … on a frozen processor`；先 `processor()`。
2. **把 plugin 当成“注册时立刻改树”**：它在 freeze 时配置 parser/compiler 或返回 transformer，第一次 process 才跑树。
3. **`processSync` 配了返回 Promise 的 transformer**：同步 API 会认为自己“异步结束了”并抛错。
4. **compiler 返回 React 树却去读 `file.value`**：非 `string`/`Uint8Array` 在 `file.result`。
5. **把 11.0.5 的浏览器修复写成兼容性保证**：GH-246 只改了 `CallableInstance` 不再复制函数自有属性，本页没有跑浏览器。

## 适用 vs 不适用场景

**适用**：

- 需要把 parse、变换、序列化拆开，并让 plugin 共享 `data`
- 同一套 processor 既输出文本，也输出非文本 `file.result`
- 阅读 remark / rehype / retext 为什么能共用一套 `.use()` 合同

**不适用**：

- 只要“Markdown 进、HTML 出”，且不打算碰 AST：应看具体 parser，而不是本核
- 需要本包自带 Markdown 语法：那是 [[micromark]] 或 remark 预配置，不是 `unified`
- 想把静态阅读写成“跑过上游测试”或性能结论

## 固定版本边界

- 本文绑定 `unifiedjs/unified@242105bd6e18c61ca10f37d99529b89f1be37518`，tag / npm 均为 `11.0.5`，`gitHead` 一致。
- 运行时依赖含 `trough`、`vfile`、`extend`、`bail`；parser/compiler 由 plugin 注入。
- readme 写明当前主线兼容 Node.js 16+；`package.json` 无 `engines` 字段。
- 未安装依赖、运行 `test-api` 或测量下载量，状态保持 `UNVERIFIED`。

## 学到什么

1. **unified 是协议，不是语法引擎**——空核加三段，才出现 Markdown / HTML 生态
2. **冻结是复制点**——配置发生在未冻结副本，执行前一次性 freeze
3. **plugin 的 `this` 是 processor**——它可以改 parser/compiler/data，也可以返回 transformer
4. **vfile 是贯穿载体**——文本走 `value`，非文本结果走 `result`，消息走 `messages`

## 应用型自测

1. `import {unified} from 'unified'` 之后直接 `unified.process('# x')` 会得到 HTML 吗？
2. `.use(plugin)` 之后、第一次 `process` 之前，transformer 链里已经有这个 plugin 了吗？
3. 一个 plugin 的 transformer 返回 Promise。还能安全调用 `processSync` 吗？

检查点：

1. 不会。默认导出没有 parser/compiler，`process` 会抛错。
2. 没有。`use` 只记 `attachers`，`freeze()` 才挂到 `trough`。
3. 不能。`processSync` 要求回调同步完成。

## 延伸阅读

- 官方文档：[unifiedjs.com](https://unifiedjs.com/)
- 固定源码：[unifiedjs/unified](https://github.com/unifiedjs/unified) —— 本文绑定 `242105bd6e18c61ca10f37d99529b89f1be37518`
- 审查记录：仓库内 `docs/markdown-pipeline-source-review-20260827-dj.md`
- [[micromark]] —— 常见 Markdown tokenizer；remark-parse 经 `fromMarkdown` 消费它的事件
- remark（`remarkjs/remark`）—— 预装 parse/stringify 的 unified 副本，本轮未新建 Study 页

## 关联

- [[micromark]] —— Markdown 状态机，通常经 `mdast-util-from-markdown` 进入本核
- remark 预配置 —— `unified().use(remarkParse).use(remarkStringify).freeze()`，仓库无独立项目页
- [[markdown-it]] —— 另一条 renderer/rule 模型，不是 trough plugin
- [[astro]] —— 站点 Markdown 管线常接 unified plugin
- [[starlight]] —— 文档主题，扩展口仍是 remark/rehype

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
