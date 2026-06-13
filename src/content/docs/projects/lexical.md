---
title: "lexical — 把富文本拆成 immutable 快照 + 双缓冲 reconciler 的编辑器框架"
来源: 'https://github.com/facebook/lexical'
日期: 2026-06-13
分类: 后端 API
子分类: 编辑器与 IDE
难度: 中级
---

## 是什么

Lexical 是一个**可扩展的富文本编辑器框架**，由 Meta 开源。它的工作不是给你一个"开箱即用的加粗斜体工具栏"——它给你一套**引擎级抽象**：immutable 文档快照、自写 DOM reconciler、可扩展的 Node/Plugin 体系。上层功能（加粗、列表、协同编辑、Markdown 快捷输入）全部以插件形式加载。

**日常类比**：想象一个共享文档的"版本控制"系统。每次你打字，Lexical 不是直接改 DOM——它先在你自己的草稿本（pending EditorState）上改，改完确认无误，再一次性 commit 到正式版（current EditorState），同时只把真正变动的几个字同步到屏幕 DOM 上。就像 git 的 staging area + commit，而不是每次 keystroke 都直接 `push --force`。

这个"双缓冲"设计是 Lexical 区别于其他编辑器框架的核心。Draft.js 每打一个字重建整棵文档树，Lexical 只重建受影响的几个节点。代价是抽象密度更高——你要理解 update / commit / reconcile 三个阶段才能写出正确的代码。回报是：大文档打字 60fps，同一份 EditorState 既能 SSR、又能跑 React、又能跑 Vanilla DOM。

```tsx
// 最简例子：10 行代码出一个能打字的编辑器
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';

function Editor() {
  return (
    <LexicalComposer initialConfig={{ namespace: 'demo', onError: console.error }}>
      <RichTextPlugin contentEditable={<ContentEditable />} placeholder={<div>开始输入...</div>} />
      <HistoryPlugin />
    </LexicalComposer>
  );
}
```

## 为什么重要

不理解 Lexical 的设计思路，下面这些事都解释不清楚：

- 为什么同样是基于浏览器 `contentEditable`，Lexical 能做到大文档不卡、IME 中文输入不乱、粘贴 5 万字不崩——而裸用 `contentEditable` 会出各种诡异 bug
- 为什么写一个"按 `**` 自动变加粗"的功能在 Lexical 里是一个 `NodeTransform`（几行代码），在其他编辑器里可能要改事件处理、改选区、改 DOM 三步走
- 为什么元老级的 Draft.js 在 Meta 内部全线退役，被 Lexical 替代——性能、框架无关性、扩展面三方面都不如
- 为什么同样是"编辑器底座"，ProseMirror 选 schema-first（先定义文档能有什么结构），Lexical 选 Map-first（先定义 Node 怎么存改查）——两条哲学路线决定了各自的适用场景

## 核心要点

Lexical 的心脏只有**四件东西**，理解了它们就理解了整个框架：

**1. EditorState：immutable 文档快照。**和 Draft.js 不同，Lexical 的 EditorState 不是一整棵 immutable 树——它是一个 `Map<NodeKey, LexicalNode>`，Node 之间用 `__parent / __prev / __next` 三个 key 虚拟出链表 + 父引用。类比：不是一棵真树，是一张"谁挨着谁"的索引卡片，改一个节点不需要重建父链，只复制受影响的几张卡片。

**2. 双缓冲 + reconciler：只在 commit 边界变 DOM。**用户打字时，Lexical 在一个"pending EditorState"上改 Node（你的 `editor.update(fn)` 里的 fn 都在 pending 上跑），然后通过 `queueMicrotask` 调度 commit。commit 时 reconciler 对比 current 和 pending 的差异，用 `dirtyElements`（哪些容器节点变了）和 `dirtyLeaves`（哪些文本叶子变了）做局部 diff，只 patch 真的变了的 DOM 部分。类比：不是全屋重新装修，是只换那个坏了的灯泡。

**3. Plugin 即 React 子组件。**在 Lexical 里，"加一个加粗按钮"和"加一个 Yjs 实时协同"在代码组织上看起来一样——都是一个 React 组件，内部调用 `editor.registerCommand()` / `registerNodeTransform()` / `registerUpdateListener()` 注册回调，返回的 unregister 函数被 `useEffect` cleanup 自动调用。这个设计让功能组合像搭积木。

## 实践案例

### 案例 1：最简富文本编辑器

```tsx
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';

const config = {
  namespace: 'MyEditor',
  onError: (error: Error) => console.error(error),
};

export default function Editor() {
  return (
    <LexicalComposer initialConfig={config}>
      <RichTextPlugin
        contentEditable={<ContentEditable className="editor" />}
        placeholder={<div className="placeholder">写点什么...</div>}
      />
      <HistoryPlugin />
    </LexicalComposer>
  );
}
```

逐部分解释：
- `LexicalComposer` 只创建一次 editor 实例（用 `useMemo([])` 锁住），不随 React 重渲染重建
- `RichTextPlugin` 把 `contentEditable` div 和编辑器内核连起来，同时注册加粗/斜体/标题等快捷键
- `HistoryPlugin` 提供 undo/redo，底层靠 EditorState 快照做时间旅行
- 四个组件加起来不到 15 行，出来的就是一个能处理 IME、支持快捷键、支持 undo/redo 的编辑器

### 案例 2：自定义文本节点——创建一个高亮节点

```ts
import { TextNode, type SerializedTextNode } from 'lexical';

// 序列化格式（用于 JSON 持久化和协同编辑）
type SerializedHighlightNode = SerializedTextNode & { type: 'highlight' };

export class HighlightNode extends TextNode {
  // 每个自定义 Node 必须声明 getType 和 clone
  static getType(): string {
    return 'highlight';
  }

  static clone(node: HighlightNode): HighlightNode {
    return new HighlightNode(node.__text, node.__key);
  }

  // 告诉 DOM 怎么渲染这个节点
  createDOM(): HTMLElement {
    const element = document.createElement('span');
    element.style.backgroundColor = '#ffeb3b';
    element.style.borderRadius = '2px';
    return element;
  }

  // 节点数据更新时，告诉 DOM 怎么更新
  updateDOM(): boolean {
    return false; // 返回 false 表示不需要更新 DOM
  }

  // 序列化——支持 JSON 导出和跨端同步
  exportJSON(): SerializedHighlightNode {
    return { ...super.exportJSON(), type: 'highlight' };
  }
}
```

逐部分解释：
- 自定义节点继承 `TextNode`，等于说"我是一种特殊文本"
- `getType()` 返回唯一字符串标识——Lexical 靠这个反序列化时找到对应的类
- `createDOM()` 告诉 Lexical 在浏览器里用什么 HTML 元素渲染它
- `exportJSON()` 保证节点能被序列化（存数据库 / 发给协同方）
- 注册方式：把 `HighlightNode` 加到 `LexicalComposer` 的 `initialConfig.nodes` 数组里

### 案例 3：命令系统——按回车提交表单

```ts
import { KEY_ENTER_COMMAND, COMMAND_PRIORITY_LOW } from 'lexical';

function SubmitOnEnterPlugin({ onSubmit }: { onSubmit: () => void }) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return editor.registerCommand(
      KEY_ENTER_COMMAND,
      (event: KeyboardEvent) => {
        // Shift+Enter 正常换行，单独 Enter 提交
        if (!event.shiftKey) {
          event.preventDefault();
          onSubmit();
          return true; // true = "我处理了，不要再往上冒泡"
        }
        return false; // false = "我没处理，让别人处理"
      },
      COMMAND_PRIORITY_LOW,
    );
  }, [editor, onSubmit]);

  return null; // plugin 本身不渲染任何 DOM
}
```

逐部分解释：
- `registerCommand` 返回一个 unregister 函数——`useEffect` 的 cleanup 自动调用它，所以组件卸载时命令自动撤销
- 命令处理器返回 `true` 表示"已处理，停止冒泡"（类似 DOM 事件的 `stopPropagation`）
- `COMMAND_PRIORITY_LOW` 是优先级——Lexical 的每个命令可以有多个处理器，按优先级依次调用，直到有一个返回 true
- `return null` 是 Lexical plugin 的惯例——plugin 通常不渲染 DOM，只挂副作用（注册命令/监听器/transform）

## 踩过的坑

1. **dollar 函数必须在 update/read 里调**——在 `editor.update()` 或 `editor.read()` 外面调 `$getRoot()` / `$getSelection()` 会直接抛 runtime error。这和 React hooks 的"不能在条件语句里调"一样——隐式上下文 + 强位置约束。

2. **自定义 Node 的 `clone()` 写错会导致历史记录混乱**——undo/redo 靠 EditorState 快照做时间旅行，如果你的 `clone()` 没有正确复制关键属性，undo 回来的节点会丢数据。自查方法：`editorState.toJSON()` 看序列化结果是否完整。

3. **SSR 时 plugin transform 不跑**——`lexical` 内核可以在服务端跑（不依赖 DOM），但 plugin 的 `useEffect` 只在客户端执行。如果 plugin 做了 markdown shortcut 转换（`**foo**` 自动变加粗），SSR 出的 HTML 会保留原始 markdown 字符串，hydration 后才变——用户会看到一帧闪烁。

4. **大粘贴（5 万+ 字符）会卡**——commit 是同步的，`$commitPendingUpdates` 跑 reconcile + listener trigger 全部同步阻塞。Meta 在 Workplace 里用"分块粘贴 + 多次 update"绕开，但内核没暴露异步 commit 选项。如果你的场景有大量一次性插入，建议拆成多次 `editor.update()`。

## 适用 vs 不适用场景

**适用**：
- 做一个 Notion 风格 / Workplace 帖编辑器，团队熟悉 React——Lexical 的 reconciler 性能好，plugin 即 React 组件，心智门槛比 ProseMirror 低
- 需要在 React 和 Vanilla 之间共享编辑器内核——Lexical 内核零依赖，`@lexical/react` 只是薄壳
- 需要 headless 模式（无 DOM 运行）——比如跑在 Web Worker 里做服务端渲染、或单元测试里验证编辑逻辑
- 需要自定义块类型（嵌入视频 / 图表 / 公式）——`DecoratorNode` 让你能把任意 React 组件嵌在编辑器文档流里

**不适用**：
- 需要 schema 验证（"段落里不能嵌段落""列表里只能嵌 listItem"等结构约束）——选 ProseMirror，它有 ContentMatch DFA 在编译期校验；Lexical 没有 schema 概念，错误结构得在 NodeTransform 里手写守卫
- 主技术栈是 Vue / Svelte，不想引入 React 依赖——虽然 Lexical 内核不绑 React，但 90% 的官方插件用 React 写的，非 React 用户要么手写胶水、要么找社区替代
- 需要一个开箱即用的编辑器产品（toolbar、菜单、文件上传都做好）——Lexical 是引擎，不是产品；Tiptap（基于 ProseMirror）有更完整的预置 UI
- 项目规模很小，只想加个简单 textarea 带一点格式——Lexical 的初始化抽象成本（理解 update/commit/reconcile）不值得；用基础 `contentEditable` 或轻量库就够了

## 历史小故事（可跳过）

- **2016 年**：Meta 做 Draft.js，第一个把 React 模型搬进 contentEditable 的开源库。但它的 immutable.js record 模型太重——每键入一个字符就 rebuild 整棵文档树，Workplace 长帖打字延迟超过 100ms
- **2022 年**：React Forget 作者 Dominic Gannaway (trueadm) 在 React Conf 上公开 Lexical。核心 inversion：文档保持 immutable，但只在 commit 边界 immutable；fn 内部走 `getWritable()` 做浅拷贝。这个设计从 ProseMirror 的 schema-first 路线分道，走 immutable Map + dirty-set 局部 patch 路线
- **2024 年**：Lexical 成为 Meta 内部全线编辑器底座——Facebook 动态输入框、Instagram 消息、WhatsApp 网页版、Workplace 文档共用同一内核。同时 Figma、Bloomberg 等外部公司开始采用。GitHub stars 突破 17.7k
- **2025 年**：Lexical 扩展到 iOS 原生平台（Swift/TextKit），共享同一套 EditorState 序列化格式。核心包仍保持 ~22KB gzip，零依赖

## 学到什么

1. **immutable 不一定等于"全量重建"**——Draft.js 用 immutable.js 做整棵树不可变，Lexical 把 immutable 限定在 EditorState 边界 + Node 共享 + 浅拷贝。同样是 immutable，实现方式决定了能撑多大的文档
2. **reconciler 不一定是 React 的专利**——Lexical 自己写 reconciler，用 dirty set 做局部 patch，不 walk React fiber。任何需要高频小修改 + 局部 DOM 同步的场景都能用这套思路
3. **plugin = 注册器返回 unregister**——这个模式适用于任何可扩展运行时。Lexical 的每个 plugin 都是一个 React 组件，在 `useEffect` 里注册回调、cleanup 里撤销——和 Zustand 的 subscribe / XState 的 service 同形
4. **框架无关性的代价是生态分裂**——Lexical 内核确实不依赖 React，但官方 plugin 全用 React 写。非 React 用户拿到的是一个引擎加半套生态。设计"框架无关"的库时，生态和内核得一起规划

## 延伸阅读

- [Lexical 官方文档](https://lexical.dev/docs/intro) —— 设计理念 + 完整 API 参考，入门必读
- [Lexical GitHub 仓库](https://github.com/facebook/lexical) —— 源码 + 示例 playground
- [Lexical's Design 设计文档](https://lexical.dev/docs/design) —— 双缓冲 / reconciler / 命令系统的最简解释
- [[prosemirror]] —— schema-first 路线的代表，和 Lexical 形成路线对比
- [[codemirror]] —— 同赛道但走代码编辑方向，同一作者风格
- [[yjs]] —— Lexical 的协同编辑插件的后端，通用的 CRDT 实现

## 关联

- [[prosemirror]] —— 同样做编辑器底座，但走 schema-first 路线；选 Lexical 还是 ProseMirror 取决于你要不要结构校验
- [[codemirror]] —— 代码编辑器框架，和 Lexical 同属编辑器赛道但方向不同（代码 vs 富文本）
- [[react]] —— Lexical 的 React 集成只靠一个 14 行的 `LexicalComposer` 组件，是"框架可选适配器"设计的范本
- [[yjs]] —— Lexical 的协同编辑插件底层用的就是 Yjs，把 EditorState 的 dirty set 映射到 CRDT 操作
- [[immer]] —— 和 Lexical 的 `getWritable()` 同形——让人用"可变写法"操作不可变数据，底层靠浅拷贝保证 immutability
- [[dnd-kit]] —— 同样是"引擎级抽象"的项目类笔记：不给你完整的 drag-drop UI，给你可组合的 sensor/modifier/collision 协议

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[codemirror]] —— CodeMirror — 编辑器不是一个类，是一组扩展的合奏
- [[dnd-kit]] —— dnd-kit — React 现代拖拽 toolkit
- [[excalidraw]] —— Excalidraw — 手绘风协作白板
- [[hocuspocus]] —— Hocuspocus — 给 Yjs 配一个能直接上线的协作后端
- [[immer]] —— Immer — 用 Proxy 让你写"看起来可改"的代码却产出不可变状态
- [[monaco-editor]] —— monaco-editor — 把 VSCode 编辑器搬进浏览器的 SDK
- [[monaco-editor-2016]] —— Monaco Editor: VS Code's Editor as a Library — 把桌面 IDE 编辑器搬进网页
- [[prosemirror]] —— ProseMirror — schema 先定 DOM 后服从的富文本编辑器框架
- [[react]] —— React UI 组件库
- [[yjs]] —— Yjs — 让任何编辑器都能接的协同编辑内核

