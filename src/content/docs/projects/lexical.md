---
title: Lexical — 把富文本编辑拆成快照、事务和插件
description: 介绍 Lexical 如何用不可变快照、更新事务和脏节点协调富文本编辑。
来源: https://github.com/facebook/lexical
日期: 2026-05-29
分类: 编辑器框架
难度: 中级
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/facebook/lexical
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: ffe90924bd55b5d450c88de0f9f1c8b228c4a221
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 0.49.0
---

## 是什么

Lexical 是一个 TypeScript 富文本编辑器框架。日常类比：`contentEditable` 像一张会自己乱动的白纸；Lexical 像带复写纸的记账本——用户先在草稿页上写，内核检查哪些格子变了，再誊到正式页。

它不是现成输入框皮肤。核心是三件事：`EditorState` 保存某一刻的节点图和选区，`editor.update()` 包住一次修改，reconciler 只把脏节点同步到 DOM。内核包 `lexical` 不依赖 React；React 用户走 `@lexical/react`。

## 为什么重要

不理解 Lexical，下面这些事都很难解释：

- 为什么裸用 `contentEditable` 很快会被选区、粘贴、中文输入法和撤销栈拖垮
- 为什么 `$getRoot()` 这类 dollar 函数不能丢进普通异步回调
- 为什么同样是富文本，Lexical 写插件像注册监听器，ProseMirror 更像写文档 schema
- 为什么一个加粗按钮背后需要事务、快照、DOM patch 和 history 合作

## 核心要点

固定 `0.49.0` 的更新链可以拆成五步：

1. **快照**：`EditorState` 持有 `_nodeMap` 与 `_selection`。`isEmpty()` 的判定是「只有 root 且没有选区」，不是「子节点很少」。

2. **事务边界**：`editor.update(() => { ... })` 用 `cloneEditorState` 复制一份 pending state。正在 `_updating` 时再调用 `update()`，新回调会进队列，而不是另开一套状态。

3. **按节点 copy-on-write**：`getWritable()` 第一次改某 key 会 clone 并标脏，同一次 update 里再改则复用这份 clone。这不是每次深拷贝整棵树。

4. **脏集 + reconciler**：叶子进 `_dirtyLeaves`，元素进 `_dirtyElements`。默认只处理脏节点；`FULL_RECONCILE` 才当全量重画。提交默认排到 microtask；`discrete: true` 或 composition key 变化会强制同步 flush。

5. **读也有边界**：`$` 函数依赖当前活动上下文。无参 `editor.read(fn)` 默认 `'force-commit'`，会先提交 pending 再读。

## 实践示例

### 案例 1：最小 React 富文本框

```tsx
import {LexicalComposer} from '@lexical/react/LexicalComposer';
import {ContentEditable} from '@lexical/react/LexicalContentEditable';
import {RichTextPlugin} from '@lexical/react/LexicalRichTextPlugin';
import {HistoryPlugin} from '@lexical/react/LexicalHistoryPlugin';
import {LexicalErrorBoundary} from '@lexical/react/LexicalErrorBoundary';

const initialConfig = {
  namespace: 'note-editor',
  onError(error: Error) {
    throw error;
  },
};

export function NoteEditor() {
  return (
    <LexicalComposer initialConfig={initialConfig}>
      <RichTextPlugin
        contentEditable={<ContentEditable aria-label="正文" />}
        placeholder={<p>在这里输入...</p>}
        ErrorBoundary={LexicalErrorBoundary}
      />
      <HistoryPlugin />
    </LexicalComposer>
  );
}
```

**逐部分**：`LexicalComposer` 只在挂载时读一次 `initialConfig`，省略 `editorState` 时会往空 root 塞一个 `ParagraphNode`。`RichTextPlugin` 在 0.49.0 被标成 legacy plugin，旁边已有 extension composer。`HistoryPlugin` 默认 `delay` 是 1000 ms。

### 案例 2：读内容必须进入 read 边界

```ts
import {$getRoot} from 'lexical';

editor.registerUpdateListener(({editorState}) => {
  editorState.read(() => {
    const text = $getRoot().getTextContent();
    console.log(text);
  });
});
```

**逐部分**：`registerUpdateListener` 在提交后收到新快照。`$getRoot()` 只能在 `read` / `update` 回调里同步调用。无参 `editor.read(fn)` 会先 flush pending；只要「当前已提交快照、不要触发提交」，用 `editor.read('latest', fn)`。

### 案例 3：插件就是注册，返回注销函数

```tsx
import {$getRoot} from 'lexical';
import {useLexicalComposerContext} from '@lexical/react/LexicalComposerContext';
import {useEffect} from 'react';

function WordCountPlugin() {
  const [editor] = useLexicalComposerContext();
  useEffect(() => {
    return editor.registerUpdateListener(({editorState}) => {
      editorState.read(() => {
        const words = $getRoot().getTextContent().trim().split(/\s+/).filter(Boolean);
        console.log(words.length);
      });
    });
  }, [editor]);
  return null;
}
```

**逐部分**：插件可以不渲染 DOM。`registerUpdateListener` 返回的函数在卸载时注销。多个监听器用 `mergeRegister` 合成一个清理函数。

## 踩过的坑

1. **把提交后的 `EditorState` 当可变对象改**：绕过 `editor.update` 会破坏 history 与 DOM 同步。

2. **在 read / update 外调用 `$` 函数**：没有活动上下文会直接 invariant。

3. **把 `EditorState.isEmpty()` 和 `root.isEmpty()` 混用**：前者是「nodeMap 只有 root 且无选区」；后者是「没有子节点且没有 slot」。`setEditorState` 会拒绝空快照。`LexicalComposer` 传入 `null` 是留给协同文档填充的，不是「空段落编辑器」。

4. **IME 组合态里强行改选区**：composition key 变化会强制同步 flush；插件若在错误时机改选区，候选框会跳。

5. **默认 `editor.read()` 会提交 pending**：嵌套在尚未提交的 update 里再 `read()`，观察到的是 flush 之后的状态。

## 适用 vs 不适用场景

**适用**：

- 评论框、知识库正文、邮件这类持续输入的富文本
- 希望每次输入只局部更新 DOM，而不是重画整篇
- 团队愿意学习 `EditorState` / `Node` / `Command` / Plugin
- React 18+ 项目；`@lexical/react@0.49.0` 的 peer 是 `react` / `react-dom` `>=18`

**不适用**：

- 旁边预览就够的 Markdown textarea
- 需要严格禁止某些节点嵌套的 CMS schema；[[prosemirror]] 更合适
- 代码编辑、超长行和列光标；那是 CodeMirror / Monaco 的赛道
- 非 React 团队想直接复用完整生态：内核可用，但许多现成插件要自己接线

## 固定版本边界

- 本文绑定 `facebook/lexical@ffe90924...`，即 annotated tag `v0.49.0`；`lexical` 与 `@lexical/react` 的 package 版本均为 `0.49.0`。
- npm 这两个包没有 `gitHead`；后续存在 `v0.49.1-nightly.*`，本文不绑定 nightly。
- `createEditor` 默认注册 Root / Text / LineBreak / Tab / Paragraph / ArtificialNode。
- `LexicalComposer` 省略 `editorState` 会种空段落；传 `null` 跳过初始化。
- `HistoryPlugin` 默认合并窗口 1000 ms；`RichTextPlugin` 在本版本是 legacy API。
- 本文未安装依赖、未跑上游测试或浏览器套件，状态保持 `UNVERIFIED`。

## 学到什么

- 富文本难点不在「给 div 加 contentEditable」，而在状态、选区、输入法和撤销栈一起变。
- immutable 快照不必深拷贝整棵树；Map + NodeKey + `getWritable()` 只 clone 被改到的节点。
- 插件好用的关键是生命周期清楚：注册时拿能力，卸载时还能力。
- 「与框架无关」要分层看：`lexical` 可以无关，`@lexical/react` 不行。

## 应用型自测

1. `EditorState.isEmpty()` 在「只有 root、但已经有选区」时为 true 吗？
2. 正在 `editor.update()` 里再调一次 `editor.update()`，第二次会立刻另开一份 pending state 吗？
3. 无参 `editor.read(fn)` 会不会先提交尚未 flush 的 pending update？

检查点：

1. 不会。`isEmpty()` 要求 `_nodeMap.size === 1` **且** `_selection === null`。
2. 不会。`_updating` 为真时，后续 update 进入 `_updates` 队列，复用当前 pending state。
3. 会。默认 mode 是 `'force-commit'`。

## 延伸阅读

- 官方文档：[Lexical Documentation](https://lexical.dev/docs/intro)
- 固定源码：[facebook/lexical](https://github.com/facebook/lexical) —— 本文绑定提交 `ffe90924bd55b5d450c88de0f9f1c8b228c4a221`
- 对照阅读：[[prosemirror]] —— schema-first 的富文本编辑器框架

## 关联

- [[prosemirror]] —— 另一条富文本路线：先定义 schema，再让 transaction 改文档
- [[codemirror]] —— 同样重视局部更新，但目标是代码编辑器
- [[react-server-components]] —— 提醒你区分 React 集成层和非 React 内核层
- [[yjs]] —— 协同文档常作为 `editorState: null` 的外部所有者

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[bookstack]] —— BookStack — 文档型 Wiki
- [[codemirror]] —— CodeMirror — 编辑器不是一个类，是一组扩展的合奏
- [[excalidraw]] —— Excalidraw — 手绘风协作白板
- [[hocuspocus]] —— Hocuspocus — 给 Yjs 配一个能直接上线的协作后端
- [[marktext]] —— MarkText — 实时预览 Markdown 编辑器
- [[monaco-editor]] —— monaco-editor — 把 VSCode 编辑器搬进浏览器的 SDK
- [[prosemirror]] —— ProseMirror — schema 先定 DOM 后服从的富文本编辑器框架
- [[yjs]] —— Yjs — 让任何编辑器都能接的协同编辑内核
