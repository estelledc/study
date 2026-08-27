---
title: Quill — 用 Delta 描述文档、用 Blot 投影 DOM 的富文本编辑器
description: 固定 2.0.3 源码里，Quill 用 Delta 当文档日志、用 Parchment Blot 投影 DOM。
来源: 'https://github.com/slab/quill'
日期: 2026-08-27
分类: 编辑器
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/slab/quill
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 522fd7ee0682498516df7389bacb6f7eb6e92b77
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 2.0.3
---

## 是什么

Quill 是一个**以 Delta 为文档合同、以 Parchment Blot 为 DOM 投影**的富文本编辑器。日常类比：像一份可以逐条对账的记事本——正文不是“现在 DOM 长什么样”，而是一组 insert / retain / delete 操作；屏幕上的段落、加粗、图片只是这些操作的可视化。

你写：

```js
import Quill from "quill";

const quill = new Quill("#editor", { theme: "snow" });
quill.updateContents([{ insert: "Hello" }, { insert: "\n" }]);
```

固定 2.0.3 的仓库在 `slab/quill`，发布包是 `packages/quill`。内核依赖 `quill-delta@^5.1.0` 与 `parchment@^3.0.0`。`src/core.ts` 只注册 blot 与 clipboard / history / keyboard / uploader / input / uiNode；`src/quill.ts` 再注册 formats、toolbar、syntax、table 以及 snow / bubble 主题。

## 为什么重要

不理解 Quill 的 Delta 合同，下面这些事都解释不通：

- 为什么协同和 undo 交换的是操作日志，而不是 HTML 字符串
- 为什么容器里原先的 innerHTML 会被清空，再经 clipboard 转成 Delta 灌回去
- 为什么 `readOnly` 时用户输入会被丢掉，但 API 调用仍能改文档
- 为什么“所有格式都允许”和“只允许一部分格式”走的是两套 registry

## 核心要点

固定源码的主链可以拆成四步：

1. **展开配置再挂 DOM**：`expandConfig` 把选择器收成 `HTMLElement`，合并 `Quill.DEFAULTS`、主题默认值和用户 `modules`。默认模块是 `clipboard` / `keyboard` / `history` / `uploader` 四个为 true；`theme` 默认为 `'default'`，对应基础 `Theme` 类。`formats` 为 null 时用全局 registry，给出数组则 `createRegistryWithFormats` 收窄。

2. **Scroll + Editor + Theme**：构造函数清空容器、加上 `ql-container` / `ql-editor`，用 registry 里的 `ScrollBlot` 包住 root，再创建 `Editor`、`Selection`、`Composition`，最后由 theme 挂 keyboard / clipboard / history / uploader / input / uiNode。

3. **修改都走 `modify()`**：`setContents`、`updateContents`、`deleteText`、`format*` 最终都进入 `modify`。`source === USER` 且编辑器未 enable、又没有 `allowReadOnlyEdits` 时直接返回空 Delta。成功后按需平移选区，并在变更非空时发 `EDITOR_CHANGE` + `TEXT_CHANGE`。

4. **Delta 是真相，Blot 是投影**：`Editor.applyDelta` 先 `batchStart`，按 op 调用 `scroll.insertAt` / `formatAt` / `updateEmbedAt`，再统一 `deleteAt`，最后 `batchEnd` + `optimize`。`setContents` 会删掉当前全文、插入新 Delta，再删掉空编辑器初始化留下的尾部 `\n`。

## 实践示例

### 案例 1：Snow 主题 + Delta 写入

```js
import Quill from "quill";

const quill = new Quill("#editor", { theme: "snow" });
quill.updateContents([
  { insert: "Hello", attributes: { bold: true } },
  { insert: "\n" },
]);
console.log(quill.getContents(), quill.getLength());
```

**逐部分**：`theme: "snow"` 必须先由 `quill.ts` 把 `themes/snow` 注册进 `Quill.imports`；`updateContents` 默认 `source=API`，走 `editor.applyDelta`。`getLength()` 读的是 `scroll.length()`，不是 `innerText.length`。

### 案例 2：只允许一部分格式

```js
const quill = new Quill("#editor", {
  theme: "snow",
  formats: ["bold", "italic", "header"],
});
```

未提供 `registry` 时，`formats` 会新建一份只含这些格式的 Parchment registry。同时传 `registry` 和 `formats` 时，固定实现会警告并忽略 `formats`。

### 案例 3：只读界面仍允许 API 改文档

```js
quill.disable();
quill.updateContents([{ insert: "from API\n" }]); // source 默认 API，会生效
quill.updateContents([{ insert: "from user\n" }], Quill.sources.USER); // 被 modify() 丢掉
quill.editReadOnly(() => quill.insertText(0, "forced\n"));
```

`disable()` 只是 `scroll.enable(false)`。用户来源的编辑会被挡住；需要在只读态改文档时走 `editReadOnly`，它会短暂打开 `allowReadOnlyEdits`。

## 踩过的坑

1. **把 innerHTML 当文档**：构造时容器 HTML 会被读出后清空，再经 `clipboard.convert` 转 Delta 并 `setContents`；随后 `history.clear()`。事后读 DOM 看不到这份初始化合同。

2. **空编辑器也有一个 `\n`**：`setContents` 会删掉初始化留下的尾部换行。自己拼 Delta 时若漏了块级 `\n`，`applyDelta` 可能补隐式换行，长度会和直觉不一致。

3. **History 默认会记录 API 变更**：`History.DEFAULTS` 是 `delay: 1000`、`maxStack: 100`、`userOnly: false`。只想撤销用户输入时要显式 `userOnly: true`。

4. **toolbar 简写不是配置对象**：`modules.toolbar` 若不是普通对象，会被收成 `{ container: toolbar }`。把数组直接当成完整模块配置会看错合并结果。

5. **core 入口没有 Snow**：从 `quill/core` 导入得不到 formats 与 snow / bubble。要主题和常见格式，得走主入口 `quill`。

## 适用 vs 不适用场景

**适用**：

- 需要一份可 OT / 可 undo 的操作日志，而不是 schema 节点树
- 浏览器里的笔记、评论、邮件正文，格式集合相对固定
- 想用 Snow / Bubble 现成工具栏，而不是自己声明 ProseMirror schema

**不适用**：

- 需要严格节点约束、表格单元格选区、Step 级 rebase——看 [[prosemirror]] / [[tiptap]]
- 代码编辑、补全、语言服务——不是 Quill 的文档合同
- 官方 React / Vue 内核——固定 2.0.3 仓库只提供 DOM 构造函数与模块注册表

## 固定版本边界

- 本文绑定 `slab/quill@522fd7ee...`，即 annotated tag `v2.0.3` 解出的提交；npm `quill@2.0.3` 的 `gitHead` 与该提交一致。
- 运行时依赖：`quill-delta@^5.1.0`、`parchment@^3.0.0`、`eventemitter3@^5.0.1`、`lodash-es@^4.17.21`。
- package `engines.npm` 为 `>=8.2.3`；未声明浏览器矩阵之外的 Node 运行时合同。
- 默认模块：clipboard / keyboard / history / uploader；History 默认 `delay=1000`、`maxStack=100`、`userOnly=false`。
- 本文未安装依赖、未运行 unit / fuzz / e2e、未测协同或 IME，状态保持 `UNVERIFIED`。

## 学到什么

1. **文档合同可以是操作日志**——Delta 让 undo、协同和粘贴清洗共享同一种差值
2. **投影层和日志层必须分开**——Parchment blot 可以重建 DOM，但不能代替 `editor.delta`
3. **source 是权限开关**——USER / API / SILENT 决定只读态、历史栈和事件是否外溢
4. **入口包决定能力面**——`quill/core` 与 `quill` 注册的 formats / themes 不是同一张表

## 应用型自测

1. `new Quill(el)` 之后，原来写在 `el` 里的 HTML 还在吗？历史栈里还有初始化那一次吗？
2. `quill.disable()` 之后，`updateContents(delta)` 与 `updateContents(delta, Quill.sources.USER)` 谁会改文档？
3. History 默认会不会把 API 来源的 `TEXT_CHANGE` 推进 undo 栈？

检查点：

1. HTML 会被清空并经 clipboard 转 Delta；`setContents` 之后立刻 `history.clear()`。
2. 默认 API 来源会改；USER 来源在只读态返回空 Delta。
3. 会。默认 `userOnly` 为 false。

## 延伸阅读

- 官方文档：[quilljs.com](https://quilljs.com/)
- 固定源码：[slab/quill](https://github.com/slab/quill) —— 本文绑定提交 `522fd7ee0682498516df7389bacb6f7eb6e92b77`
- [[tiptap]] —— 同期对照：ProseMirror schema + Command，而不是 Delta
- [[prosemirror]] —— 另一条 schema / Step 主线

## 关联

- [[tiptap]] —— 无头 ProseMirror 包装，产品 API 形态相反
- [[prosemirror]] —— schema 先定、DOM 后服从
- [[lexical]] —— 快照 + 事务，文档模型不是 Delta
- [[automerge]] —— 另一类可自动合并的文档日志
- [[hocuspocus]] —— 若要把协同后端接到富文本，需要另选文档合同
