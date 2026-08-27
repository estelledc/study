---
title: Tiptap — 把 ProseMirror 收成 Extension 与 Command 的无头编辑器
description: 固定 3.30.3 源码里，Tiptap 用 Extension 与 Command 包装 ProseMirror schema 和事务。
来源: 'https://github.com/ueberdosis/tiptap'
日期: 2026-08-27
分类: 编辑器
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/ueberdosis/tiptap
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: db790a7c5a6009b0a94382e12e1a5e9c642e1660
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 3.30.3
---

## 是什么

Tiptap 是一套**无头富文本编辑器**：文档模型、选区、事务和协同 rebase 仍由 [[prosemirror]] 负责，Tiptap 负责把这些能力收成 Extension、Command 和框架适配层。日常类比：像给一台精密印刷机加了一套标准化按钮面板——油墨和纸张规则没变，操作员不必再直接拧滚筒。

你写：

```ts
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";

const editor = new Editor({
  element: document.querySelector("#editor"),
  extensions: [StarterKit],
  content: "<p>Hello</p>",
});
```

固定 3.30.3 里，`Editor` 先建 `ExtensionManager` 与 `CommandManager`，再从扩展合成 ProseMirror `Schema` 与初始 `EditorState`；传入 `element` 才会 `mount()` 出 `EditorView`。未挂载时 `editor.view` 是一层 Proxy，只保证 `state` / `dispatch` / `updateState`。

## 为什么重要

不理解 Tiptap 这层包装，下面这些事都解释不通：

- 为什么多数 React / Vue 产品说“用了 Tiptap”，真正约束文档形态的仍是 ProseMirror schema
- 为什么 `editor.chain().toggleBold().run()` 能一次提交多步，而 `editor.commands.toggleBold()` 会立刻 `view.dispatch`
- 为什么协同、气泡菜单、StarterKit 都是扩展，而不是内核里的默认按钮皮肤
- 为什么 SSR / Next.js 下 `useEditor` 默认不立刻构造实例

## 核心要点

固定源码的主链可以拆成四步：

1. **扩展合成 schema**：`enableCoreExtensions` 默认为 true，内核会先装 `Editable`、`Commands`、`Keymap`、`Paste`、`Drop`、`Delete`、`FocusEvents`、`Tabindex`、`ClipboardTextSerializer`、`TextDirection`，再拼接用户传入的 `extensions`。`Extension` / `Node` / `Mark` 都走 `Extendable` 的 `create` / `configure` / `extend`。

2. **Command 有三条调用面**：`commands.foo()` 对当前 `state.tr` 执行后立刻 `view.dispatch`；`chain()` 把多次命令记到同一条 transaction，最后 `run()` 才 dispatch，并要求每步都返回 true；`can()` 用 `dispatch: undefined` 做干跑。

3. **事务仍是 ProseMirror transaction**：`dispatchTransaction` 走 `state.applyTransaction`，发出 `beforeTransaction`；若根事务被过滤则直接返回。成功后 `view.updateState`，再按需发 `transaction` / `selectionUpdate` / `focus` / `blur` / `update`。文档没变或带了 `preventUpdate` 时不发 `update`。

4. **框架层只订阅，不重写内核**：`@tiptap/react@3.30.3` 的 `useEditor` 用 `useSyncExternalStore` 拿实例；`immediatelyRender` 在普通浏览器默认 true，探测到 SSR 或未显式声明的 Next.js 时改为 false；`shouldRerenderOnTransaction` 默认 false。

## 实践示例

### 案例 1：StarterKit 最小编辑器

```ts
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";

const editor = new Editor({
  element: document.querySelector("#editor"),
  extensions: [StarterKit],
  content: "<p>Hello</p>",
});

editor.chain().focus().toggleBold().run();
console.log(editor.getJSON(), editor.getHTML());
```

**逐部分**：`StarterKit` 在固定版本里按选项装配 Document / Paragraph / Text、常见 mark、列表、Heading、Link、UndoRedo、Dropcursor、Gapcursor、TrailingNode 等；`getJSON()` 读 `state.doc.toJSON()`，`getHTML()` 用 schema 把 fragment 渲成 HTML。

### 案例 2：先问 can，再 chain

```ts
if (editor.can().toggleBold()) {
  editor.chain().focus().toggleBold().setLink({ href: "https://tiptap.dev" }).run();
}
```

`can()` 不 dispatch；`chain().run()` 只有每一步都返回 true 才算成功。需要检查能力时不要先 `commands.toggleBold()`，那条路径会立刻提交。

### 案例 3：React 适配层的渲染边界

```tsx
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";

function NoteEditor() {
  const editor = useEditor({
    extensions: [StarterKit],
    content: "<p>Hello</p>",
    immediatelyRender: true,
  });
  return <EditorContent editor={editor} />;
}
```

在 Next.js 里若不显式传 `immediatelyRender`，开发态会警告并默认 false，避免 hydration 对不上。需要按交易重渲染时才打开 `shouldRerenderOnTransaction`。

## 踩过的坑

1. **把 Tiptap 当成独立文档模型**：schema、Step、选区映射仍在 `@tiptap/pm` 里。协同、undo 和粘贴清洗最终都要回到 ProseMirror 合同。

2. **未挂载就读 `view.dom`**：构造时可暂不传 `element`；此时 `view` 是 Proxy，访问未 stub 的字段会抛“editor view is not available”。

3. **在 decoration `create()` 里读 `editor.state`**：固定版本会警告它仍是交易前文档，应使用 `create()` 传入的 `state`。

4. **内容非法时的协作边界**：`enableContentCheck` 为 true 且 JSON/HTML 非法时，会先用剥离后的 fallback 文档，再发 `contentError`；回调里的 `disableCollaboration` 会去掉名为 `collaboration` 的扩展并重建 ExtensionManager。

5. **npm 3.30.5 没有对应 GitHub tag**：registry 上 `@tiptap/core@3.30.5` 存在，但 `ueberdosis/tiptap` 没有 `v3.30.5`。本文绑定可达的 `v3.30.3`，不猜测 3.30.5 的提交。

## 适用 vs 不适用场景

**适用**：

- 需要 schema 约束、Step 级 undo / rebase 的产品富文本
- React 17–19 或 Vue 适配层，并接受 `@tiptap/pm` 作为 peer
- 用独立扩展加协同、菜单、表格，而不是改内核

**不适用**：

- 只要一份 HTML 字符串和工具栏，不需要 schema——[[quill]] 的 Delta 路径更短
- 代码编辑器 / IDE 体验——应看 CodeMirror 或 Monaco，而不是富文本内核
- 想绕过 ProseMirror 自己管 DOM mutation——Tiptap 没有提供这条旁路

## 固定版本边界

- 本文绑定 `ueberdosis/tiptap@db790a7c...`，即 GitHub tag `v3.30.3`；`@tiptap/core` 与 `@tiptap/react` 的 package 版本均为 `3.30.3`。
- 内核 peer 依赖 `@tiptap/pm`；React 包 peer 为 React / React DOM `^17 || ^18 || ^19`。
- 默认 `enableCoreExtensions: true`、`enableInputRules` / `enablePasteRules: true`、`enableContentCheck: false`、`enableExtensionDispatchTransaction: true`。
- npm 上已有 `@tiptap/core@3.30.5`，canonical remote 无同名 tag；未绑定该版本。
- 本文未安装依赖、未运行上游测试、未测 bundle 或输入法/协同，状态保持 `UNVERIFIED`。

## 学到什么

1. **无头编辑器不是“更简单的编辑器”**，而是把文档合同留给内核、把产品 API 收成扩展
2. **Command 的立即 dispatch 与 chain 合批**是同一套 transaction 的两种提交时机
3. **框架适配层的默认值会为 hydration 让路**，不能把浏览器 demo 的立即渲染抄到 SSR
4. **版本要以可达 Git 标签为准**；npm 更新本身不能证明仓库里存在对应 revision

## 应用型自测

1. `editor.commands.toggleBold()` 和 `editor.chain().toggleBold().run()` 谁会立刻 `view.dispatch`？
2. 构造时不传 `element`，访问 `editor.view.state` 会怎样？访问 `editor.view.dom` 呢？
3. 固定 3.30.3 的 `useEditor` 在探测到 Next.js 且未显式传 `immediatelyRender` 时，默认会立刻创建 Editor 吗？

检查点：

1. `commands.*` 成功后立刻 dispatch；`chain()` 要等到 `run()`。
2. `state` 可由 Proxy 提供；`dom` 不在 stub 集里，会抛未挂载错误。
3. 不会。该路径把 `immediatelyRender` 设为 false。

## 延伸阅读

- 官方文档：[tiptap.dev](https://tiptap.dev/)
- 固定源码：[ueberdosis/tiptap](https://github.com/ueberdosis/tiptap) —— 本文绑定提交 `db790a7c5a6009b0a94382e12e1a5e9c642e1660`
- [[prosemirror]] —— schema / Step / State 的真正内核
- [[quill]] —— 同期对照：Delta + Parchment，而不是 ProseMirror schema

## 关联

- [[prosemirror]] —— Tiptap 的文档与事务底座
- [[quill]] —— 另一条富文本主线：OT Delta 而不是 Step
- [[lexical]] —— 快照 + 事务，但不走 ProseMirror
- [[hocuspocus]] —— 常与 Tiptap 协同扩展一起出现的 Yjs 后端
- [[react]] —— `@tiptap/react` 的 peer 框架
