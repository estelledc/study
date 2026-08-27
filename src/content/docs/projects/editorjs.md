---
title: Editor.js — 按块存 JSON、按 Tool 渲染和保存的编辑器
description: 把文档当成块数组，启动时 prepare 模块，保存时逐块校验再消毒
来源: 'https://github.com/codex-team/editor.js'
日期: 2026-08-27
分类: 编辑器
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/codex-team/editor.js
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 4ea9eb389847181ceb757735f8bd45cc8c2f1673
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 2.31.6
---

## 是什么

Editor.js 是 CodeX 的块风格编辑器。日常类比：不像 [[draft-js]] 把全文当成一条字符尺子，它更像一叠卡片——每张卡有 `type`、`data` 和一个 Tool；保存时每张卡自己交卷，内核只负责排队、校验和消毒。

你写：

```js
import EditorJS from "@editorjs/editorjs";

const editor = new EditorJS({
  holder: "editorjs",
  onReady() {
    console.log("ready");
  },
});

await editor.isReady;
const output = await editor.save();
```

固定 2.31.6 的包名是 `@editorjs/editorjs`。构造函数先 `new Core(config)`，再把 `isReady` 暴露出去；核心模块准备好后 `exportAPI` 才把 `save` / `clear` / `render` 接到实例上。

## 为什么重要

不理解这块启动和保存合同，下面这些事会误判：

- 为什么 `new EditorJS({ holder: "missing" })` 在 DOM 还没出现时会直接失败
- 为什么没传 `data` 也会渲染出一块 paragraph
- 为什么未知 Tool 不会丢数据，而是变成 stub
- 为什么只读模式可能在启动阶段就抛 `CriticalError`

## 核心要点

固定源码的主链可以拆成四步：

1. **配置先归一**：对象配置原样展开；只传字符串时当成 `holder`。`holderId` 已弃用并回填到 `holder`。空 holder 默认 `'editorjs'`；`defaultBlock` 默认 `'paragraph'`；`minHeight` 默认 `300`；默认 sanitizer 是 `{ p: true, b: true, a: true }`。`data.blocks` 为空时补一块 `{ type: defaultBlock, data: {} }`。

2. **启动是一条 Promise 链**：`validate` 要求字符串 holder 当时就能在文档里找到。然后 `init` 构造全部模块并互相同 `state`。`start` 按序 `prepare`：`Tools`、`UI`、`BlockManager`、`Paste`、`BlockSelection`、`RectangleSelection`、`CrossBlockSelection`、`ReadOnly`。再 `Renderer.render`，打开 `ModificationsObserver`，可选把光标放到第一块开头。

3. **Tool 分内部和用户**：`Tools.prepare` 把内部工具 deepMerge 进 `config.tools`。内部集合包含 `convertTo` / `link` / `bold` / `italic`、`paragraph`（`@editorjs/paragraph`）、`stub`，以及 `moveUp` / `delete` / `moveDown` 三个 tune。缺工具或渲染抛错时，Renderer 改写为 stub，并把原文放进 `savedData`。

4. **保存是逐块交卷**：`save()` 对每块 `block.save()` + `validate`，再按 Tool 的 `sanitizeConfig` 消毒。校验失败的块被跳过；stub 块吐回原来的 `{ type, data }`。输出是 `{ time, blocks, version }`。`onChange` 由 `ModificationsObserver` 以 400ms 批量发出。

## 实践示例

### 案例 1：等 isReady 再 save

```js
const editor = new EditorJS({
  holder: document.getElementById("editorjs"),
});
await editor.isReady;
const { blocks, version } = await editor.save();
```

`isReady` 成功后才会 `exportAPI`。在此之前调用 `save` 只是在等 Promise，不是“已经有 API”。`destroy()` 会跑各模块 `destroy`、清 listener，并把实例原型设成 `null`。

### 案例 2：未知工具变成 stub，保存时还原

```js
const editor = new EditorJS({
  holder: "editorjs",
  data: {
    blocks: [{ type: "header", data: { text: "Hi", level: 2 } }],
  },
});
```

固定内核没有内置 header。Renderer 会警告并把该块做成 stub。`save()` 遇到 `stub` 时直接 `blocks.push(data)`，于是 JSON 里仍是原来的 `header`。

### 案例 3：只读启动会检查 Tool 合同

```js
const editor = new EditorJS({
  holder: "editorjs",
  readOnly: true,
  tools: {
    header: Header,
  },
});
```

`ReadOnly.prepare` 扫所有 block tools：任一 `isReadOnlySupported === false`，启动链抛 `CriticalError`。这不是运行时开关失败，是构造阶段就停。

## 踩过的坑

1. **holder 必须先在 DOM 里**：字符串 id 在 `validate()` 时用 `$.get(holder)` 查找，找不到就 throw。后挂载节点来不及。

2. **空配置不是零块**：没有 `data` 时内核会塞一块默认 paragraph。`blocks: []` 同样被补齐。

3. **用户 tools 覆盖内部同名项**：deepMerge 先放内部、再放用户。自己注册 `paragraph` 会盖掉内置实现。

4. **onChange 是 400ms 批**：`ModificationsObserver` 用 Map 按 `blockId + mutationType` 去重。不要把它理解成每次按键同步回调。

5. **npm 没有 gitHead**：`@editorjs/editorjs@2.31.6` 是 latest，但不发布 gitHead。本文只认 GitHub tag 解出的提交。

## 适用 vs 不适用场景

**适用**：

- 产品要把正文存成块 JSON，而不是一份 HTML 字符串
- 标题、图片、列表由独立 npm Tool 提供，内核只做编排
- 需要未知块保底，而不是渲染失败就丢数据

**不适用**：

- 需要字符级 inline style / entity 和受控 React 状态——看 [[draft-js]] / [[lexical]]
- 需要 schema 约束和 Step 级协同——看 [[prosemirror]]
- 需要代码编辑、补全或语言服务——看 [[monaco-editor]]
- 准备在只读态加载不声明 `isReadOnlySupported` 的第三方 Tool

## 固定版本边界

- 本文绑定 `codex-team/editor.js@4ea9eb38...`，即 tag `v2.31.6`；包版本同为 `2.31.6`。
- npm latest 也是 `2.31.6`，但没有 `gitHead`；身份是 tag + 包版本 + 提交。
- 运行时依赖 `@editorjs/caret@^1.0.1`、`codex-notifier`、`codex-tooltip`。`@editorjs/paragraph` 由内核源码直接 import。
- 默认 sanitizer 只放行 `p` / `b` / `a`；块级消毒另看各 Tool `sanitizeConfig`。
- 本文未安装依赖、未跑 Cypress、未测粘贴或移动端 popover，状态保持 `UNVERIFIED`。

## 学到什么

1. **块编辑器的文档合同是数组，不是字符偏移**——保存、协同和未知块策略都围着 `type + data`
2. **启动失败和运行失败要分开**——holder / read-only Tool 在 `isReady` 之前就决定生死
3. **内部 Tool 不是可选项**——paragraph 与 stub 被 merge 进用户配置
4. **消毒发生在 save，不发生在输入瞬间**——屏幕上的 DOM 不是输出 JSON

## 应用型自测

1. `new EditorJS({ holder: "nope" })` 的 `isReady` 会成功吗？
2. 不传 `data` 时，第一块的 `type` 是什么？
3. 渲染失败的 Tool 在 `save()` 后还会留下原来的 `type` 吗？

检查点：

1. 不会。`validate()` 发现字符串 holder 不在文档里就 reject `isReady`。
2. `paragraph`（`defaultBlock` 默认值）；空 data 会被补成一块默认块。
3. 会。Renderer 把它做成 stub，`save()` 对 stub 回推 `savedData`。

## 延伸阅读

- 官方文档：[editorjs.io](https://editorjs.io/)
- 固定源码：[codex-team/editor.js](https://github.com/codex-team/editor.js) —— 本文绑定提交 `4ea9eb389847181ceb757735f8bd45cc8c2f1673`
- [[draft-js]] —— 同期对照：不可变字符文档，而不是块 JSON
- [[lexical]] —— 快照 + 事务的后继富文本内核

## 关联

- [[draft-js]] —— 字符偏移 + React 受控状态
- [[lexical]] —— 节点快照，不是 Tool 数组
- [[prosemirror]] —— schema 先定，DOM 后服从
- [[yjs]] —— 若要把块数组接到 CRDT，需要另做文档合同
