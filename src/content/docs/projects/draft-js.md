---
title: Draft.js — 用不可变 ContentState 管 contentEditable 的 React 编辑器
description: 用不可变 ContentState 管 contentEditable，并由 push 决定何时写入 undo 栈
来源: 'https://github.com/facebookarchive/draft-js'
日期: 2026-08-27
分类: 编辑器
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/facebookarchive/draft-js
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: f55fa0f8da080fea74ae3fa98860c41db85cbeea
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 0.11.7
---

## 是什么

Draft.js 是 Facebook 归档的 React 富文本框架。日常类比：`contentEditable` 像一张会自己改字的白纸；Draft.js 强迫你把正文放进一本不可变账本（`ContentState`），把光标、撤销栈和装饰器放进另一本封面（`EditorState`）。屏幕上的 DOM 只是这本账的投影。

你写：

```jsx
import {Editor, EditorState} from "draft-js";

function Note() {
  const [editorState, setEditorState] = React.useState(() =>
    EditorState.createEmpty()
  );
  return <Editor editorState={editorState} onChange={setEditorState} />;
}
```

固定 0.11.7 的公开入口在 `src/Draft.js`：`Editor`、`EditorState`、`ContentState`、`Modifier`、`RichUtils`，以及 `convertFromRaw` / `convertToRaw` / `convertFromHTML`。运行时依赖 `immutable@~3.7.4`；peer 是 React / ReactDOM `>=0.14.0`。仓库现身份是 `facebookarchive/draft-js`。

## 为什么重要

不理解 Draft.js 的受控模型，下面这些事会对不上：

- 为什么组件必须同时拿 `editorState` 和 `onChange`，不能让 DOM 自己当真相
- 为什么连续打字有时不进 undo 栈，换选区或换命令后才会切边界
- 为什么 `contentState.createEntity(...)` 看起来像不可变 API，实体却写进模块级单例
- 为什么 Meta 后继 [[lexical]] 改成快照 + 事务，而不再让 React 重绘整棵块树

## 核心要点

固定源码的主链可以拆成四步：

1. **EditorState 是封面，ContentState 是账本**：`EditorState` 是 Immutable `Record`，字段包括 `currentContent`、`selection`、undo/redo 栈、`decorator`、`treeMap`、`directionMap`、`forceSelection`、`inCompositionMode`、`inlineStyleOverride` 和 `nativelyRenderedContent`。空编辑器走 `createEmpty` → `createWithText('')` → `ContentState.createFromText`。

2. **改文档要 push，不能改 Record 字段**：`Modifier.replaceText` 先 `removeEntitiesAtEdges` 再删选区、再插入带 style/entity 的 `CharacterMetadata`。得到新 `ContentState` 后，调用方必须 `EditorState.push(editorState, next, changeType)`。内容引用没变就直接返回；`allowUndo === false` 只换当前内容；否则在选区离开 `selectionAfter` 或 `mustBecomeBoundary` 时把旧内容推进 undo，并清空 redo。

3. **Editor 只是受控投影**：`DraftEditor` 默认 `contentEditable={!readOnly}`、`keyBindingFn=getDefaultKeyBinding`、`spellCheck=false`、`stripPastedStyles=false`。内部 `update()` 只写 `_latestEditorState` 再调用 `props.onChange`。默认块渲染表把 `unstyled` 画成 `div`（`p` 是别名），`atomic` 画成 `figure`。

4. **实体仍是全局表**：`ContentState.createEntity` 调用 `DraftEntity.__create` 后 `return this`。`getEntityMap()` 在固定版本仍返回这个模块单例，不是每份 ContentState 自带的 map。

## 实践示例

### 案例 1：加粗走 RichUtils，再交给 onChange

```jsx
import {Editor, EditorState, RichUtils} from "draft-js";

function toggleBold(editorState, onChange) {
  onChange(RichUtils.toggleInlineStyle(editorState, "BOLD"));
}
```

`RichUtils.handleKeyCommand` 只认 `bold` / `italic` / `underline` / `code` 和退格 / 删除族；其余命令返回 `null`，让调用方自己处理。

### 案例 2：从纯文本建文档

```js
import {ContentState, EditorState} from "draft-js";

const content = ContentState.createFromText("hello\nworld");
const editorState = EditorState.createWithContent(content);
```

`createFromText` 用 `/\r\n?|\n/g` 切行，每行一块 `unstyled`。空 `blockMap` 会回退到 `createEmpty`。

### 案例 3：插入文字必须经过 Modifier + push

```js
import {EditorState, Modifier} from "draft-js";

const next = Modifier.insertText(
  editorState.getCurrentContent(),
  editorState.getSelection(),
  "x",
);
const pushed = EditorState.push(editorState, next, "insert-characters");
```

`insertText` 要求选区折叠。`push` 默认 `forceSelection=true`，并把 `contentState.getSelectionAfter()` 写成新选区。

## 踩过的坑

1. **把 `createEntity` 当不可变更新**：它改的是模块级 `DraftEntity` 表，返回值仍是原来的 `ContentState`。多编辑器同页会串实体。

2. **连续插入不一定入 undo**：同类型的 `insert-characters` / `backspace-character` / `delete-character` 会复用上一次 `selectionBefore`，直到选区或 changeType 变成边界。

3. **HTML 不是 ContentState**：`convertFromHTML` 产出的是 content blocks，还要 `ContentState.createFromBlockArray` 才能喂给 `createWithContent`。

4. **组合输入期间不要强推选区**：`inCompositionMode` 和 `nativelyRenderedContent` 就是给 IME 留的窗口；固定版本没有在这里替你跑输入法测试。

5. **仓库已归档**：后续产品线在 [[lexical]]。本页只绑定 0.11.7，不外推未发布的修复。

## 适用 vs 不适用场景

**适用**：

- 已经在 React 里维护受控状态，需要字符级 inline style / entity
- 文档是线性块列表，而不是嵌套 schema 或块工具箱
- 需要读懂历史代码，而不是选新框架

**不适用**：

- 新项目需要事务、脏节点和插件注册表——看 [[lexical]]
- 需要 schema / Step 文档模型——看 [[prosemirror]]
- 需要块级 JSON 输出和按块校验——看 [[editorjs]]
- 不能接受 `immutable@3` 与 React 14+ 的 peer 合同

## 固定版本边界

- 本文绑定 `facebookarchive/draft-js@f55fa0f8...`，即 tag `v0.11.7`；npm `draft-js@0.11.7` 的 `gitHead` 一致。
- 包 `repository` 字段仍写 `facebook/draft-js`；GitHub 现身份是 `facebookarchive/draft-js`。
- 运行时依赖 `immutable@~3.7.4`、`fbjs@^2.0.0`、`object-assign@^4.1.1`。
- 本文未安装依赖、未跑 Jest/Flow、未测 IME 或粘贴，状态保持 `UNVERIFIED`。

## 学到什么

1. **受控编辑器必须把文档和选区一起版本化**——只存 HTML 无法做可靠 undo
2. **不可变文档不等于不可变实体表**——模块单例会泄漏跨实例状态
3. **undo 边界是 changeType 合同**——不是每一次按键都单独入栈
4. **归档库仍可做源码课**——后继产品换了事务模型，旧合同不能靠口碑外推

## 应用型自测

1. `EditorState.push(state, state.getCurrentContent(), 'insert-characters')` 会入 undo 栈吗？
2. `content.createEntity('LINK', 'MUTABLE', {url})` 返回的是新的 ContentState 吗？实体写在哪里？
3. `RichUtils.handleKeyCommand(state, 'split-block')` 会切块吗？

检查点：

1. 不会。内容引用不变时 `push` 直接返回原 `editorState`。
2. 不是新实例；实体进入模块级 `DraftEntity`，方法 `return this`。
3. 不会。固定实现对该命令返回 `null`。

## 延伸阅读

- 固定源码：[facebookarchive/draft-js](https://github.com/facebookarchive/draft-js) —— 本文绑定提交 `f55fa0f8da080fea74ae3fa98860c41db85cbeea`
- [[lexical]] —— Meta 后继：快照 + `editor.update`，不再让 React 当协调器
- [[prosemirror]] —— schema / Step 另一条主线
- [[editorjs]] —— 同期对照：块 JSON + Tool，而不是字符偏移

## 关联

- [[lexical]] —— 官方后继方向
- [[prosemirror]] —— 节点 schema，不是 CharacterMetadata
- [[editorjs]] —— 块工具箱，不是线性 Immutable 块图
- [[react]] —— DraftEditor 的受控外壳
- [[yjs]] —— 若要把协同接到旧 Draft 模型，需要另做绑定
