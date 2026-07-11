---
title: Lexical — 把富文本编辑拆成快照、事务和插件
description: "介绍 Lexical 如何用不可变快照、更新事务和脏节点协调富文本编辑。"
来源: 'Meta, "Lexical", GitHub repository 2026'
日期: 2026-05-29
分类: 编辑器框架
难度: 中级
---

## 是什么

Lexical 是一个用 TypeScript 写的富文本编辑器框架。它不是一个现成的输入框皮肤，而是一套让你自己搭编辑器的底座。

日常类比：如果 `contentEditable` 是一张会自己乱动的白纸，Lexical 就像一个带复写纸的记账本。用户先在草稿页上写，Lexical 检查哪些格子变了，再把变化誊到正式页。

它的核心不是按钮、菜单或主题，而是三件事：`EditorState` 保存文档快照，`editor.update()` 包住一次修改，reconciler 只把变脏的节点同步到 DOM。

React 用户常通过 `@lexical/react` 使用它，但内核包 `lexical` 本身不依赖 React。React 在这里更像插座，真正的电路在编辑器内核里。

## 为什么重要

不理解 Lexical，下面这些事都很难解释：

- 为什么裸用 `contentEditable` 很快就会被选区、粘贴、中文输入法和撤销栈拖垮
- 为什么同样是富文本编辑器，Lexical 写插件像注册监听器，ProseMirror 更像写文档 schema
- 为什么 Meta 会让它接替 Draft.js，而不是继续把所有变化交给 React diff
- 为什么一个看似简单的加粗按钮，背后需要事务、快照、DOM patch 和 history 合作

## 核心要点

1. **快照像银行账单**：`EditorState` 是某一刻文档的只读记录，提交之后就不应该再被直接改。想改内容，要进入 `editor.update(() => {...})`，像银行只允许通过一笔交易改账。

2. **双缓冲像草稿页和正式页**：更新函数里改的是 pending state，提交时再替换当前 state。这样打字、插件变换、选区同步可以被包成一个边界清楚的动作。

3. **脏节点像便利贴**：Lexical 不想每次都重画整篇文档，而是用 dirty leaves / dirty elements 标记哪些节点变了。提交时只处理贴了便利贴的地方，所以长文档打字还能保持顺滑。

## 实践案例

### 案例 1：先跑一个最小富文本框

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

逐部分解释：

- `LexicalComposer` 创建 editor，并通过 React Context 传给下面的插件
- `RichTextPlugin` 接管可编辑 DOM、基础快捷键和错误边界
- `HistoryPlugin` 注册撤销 / 重做；它不是菜单按钮，而是一个挂上去的副作用插件

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

逐部分解释：

- `registerUpdateListener` 在每次提交后收到新的 `EditorState`
- `editorState.read` 设置当前读取上下文，`$getRoot()` 这类 dollar 函数才知道该读哪棵树
- 不要把 `$getRoot()` 放到普通异步回调里直接调；那时上下文可能已经不存在

### 案例 3：写插件就是注册，再返回注销函数

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

逐部分解释：

- 插件本身可以不渲染任何 DOM，只在 `useEffect` 里注册能力
- `registerUpdateListener` 返回的函数会在组件卸载时注销，避免重复监听
- 复杂插件会把多个注销函数用 `mergeRegister` 合并，本质仍是"挂上去、用完摘下来"

## 踩过的坑

1. **把 `EditorState` 当普通对象改**：提交后的 state 是快照，绕过 `editor.update` 会破坏 history 和 DOM 同步。

2. **在 read / update 外调用 dollar 函数**：`$getRoot()` 依赖当前活动上下文，离开边界就像拿着过期门禁卡刷门。

3. **忽略中文输入法组合态**：IME 期间浏览器会临时管理 DOM，插件如果在错误时机强行改选区，候选框会跳或文字丢失。

4. **随便改 `isEmpty` 这类小函数**：旧笔记里的实验显示，`nodeMap.size === 1` 是"只有 root"的守门条件，改成 `<= 2` 会让初始化和注入逻辑误判。

## 适用 vs 不适用场景

**适用**：

- 需要富文本、评论框、知识库正文、邮件编辑器这类"用户一直打字"的产品
- 文档通常从几段到几万字符，希望每次输入只局部更新 DOM
- 团队愿意学习 `EditorState / Node / Command / Plugin` 四个核心概念
- React 项目尤其顺手，因为官方插件多以 React 组件形式暴露

**不适用**：

- 只需要一个 Markdown textarea，预览放到旁边就够了
- 需要非常严格的文档结构语法，比如 CMS 要禁止某些节点嵌套；ProseMirror 的 schema 更合适
- 要做代码编辑器、超长行、语法高亮和光标列操作；CodeMirror 更专门
- 非 React 团队想直接复用完整生态；内核可用，但许多现成插件要自己接线

## 历史小故事（可跳过）

- **2013 年前后**：Draft.js 在 Facebook 内部解决了 React 时代的富文本编辑，但模型和 React 绑定很深。
- **2020 年代初**：浏览器 IME、移动端输入、协同编辑和长文档让 Draft.js 的全量更新方式越来越吃力。
- **2022 年**：Lexical 对外展示为 Draft.js 的后继方向，强调性能、可靠性和可扩展插件。
- **2026 年 7 月**：GitHub 显示项目仍活跃，最新 release 到 v0.47.0，主语言是 TypeScript，许可证是 MIT。

## 学到什么

- 富文本编辑不是"给 div 加 contentEditable"这么简单，难点在状态、选区、输入法和撤销栈一起变化。
- immutable 快照不等于每次深拷贝整棵树；Lexical 用 Map + NodeKey + lazy clone 降低改一个节点的成本。
- 插件系统好用的关键是生命周期清楚：注册时拿能力，卸载时还能力。
- 框架宣传的"无关前端框架"要分层看：core 可以无关，生态插件未必无关。

## 延伸阅读

- 官方仓库：[facebook/lexical](https://github.com/facebook/lexical)
- 官方文档：[Lexical Documentation](https://lexical.dev/docs/intro)
- 发布记录：[Lexical releases](https://github.com/facebook/lexical/releases)
- 对照阅读：[[prosemirror]] —— schema-first 的富文本编辑器框架
- 对照阅读：[[codemirror]] —— 面向代码编辑的同类底层工程

## 关联

- [[prosemirror]] —— 另一条富文本路线：先定义 schema，再让 transaction 改文档
- [[codemirror]] —— 同样重视局部更新，但目标是代码编辑器
- [[react-server-components]] —— 提醒你区分 React 集成层和非 React 内核层
- [[salsa-adapton]] —— 都在追求"只重算真的变了的部分"
- [[self-adjusting]] —— dirty set 的思想和自调整计算有相通处
- [[compiler-errors]] —— 好编辑器也要把复杂状态变化翻译成用户能懂的反馈

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
