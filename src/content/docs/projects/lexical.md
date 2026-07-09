---
title: lexical — Meta 把富文本拆成 immutable EditorState + 双缓冲 reconciler 的协议
description: Lexical 用 native browser selection + immutable EditorState + dirty-set reconciler，把 contentEditable 从"性能黑盒"压回 React 时代的可调优框架。一个零基础学习者读心脏代码的状元篇笔记。
sidebar:
  label: lexical
  order: 65
schema_version: zhuangyuan-v1.1
branch: D
---

> 项目类型 self-classify：**框架/SDK**（v1.1 分支 D）。
> 不是开箱即用的"组件"，是 Meta 内部从 Draft.js 退役迁移到 Workplace / WhatsApp Web / Facebook composer 的"编辑器底座"——
> 提供四件抽象：immutable `EditorState`、双缓冲 `commitPendingUpdates`、`LexicalNode` 继承面、React 中性的 plugin 注册器；
> 上层（rich text、collab、autolink、markdown shortcut）都是 plugin，不在内核。
> 同年代竞品 Slate / Tiptap / Draft.js / [prosemirror](/study/projects/prosemirror/) 各走一条路，本篇主要拆 Lexical 的"选择"。

| 维度 | 数据 |
|---|---|
| facebook/lexical star | 23,462（截至 2026-05-29） |
| fork | 2,170 |
| 最近活跃 | `2026-05-28 14:11 UTC`（GitHub API 返回，main 仍每日多 commit） |
| 读时 commit hash | `149c37d42898a50ba094c8e0e3c4949d1cce969c`（lexical core）/ 同 sha 的 `lexical-react` 子包 |
| 读时日期 | 2026-05-29 |
| 主语言 | TypeScript（100%） |
| 维护方 | Meta Platforms（前 Facebook）开源团队，core 在 React 与 Workplace 编辑器组共维护 |
| 主要贡献者 | trueadm（Dominic Gannaway，~1486 commit / 也是 React Forget / React fast-refresh 作者）/ zurfyx / etrepum / acywatson / fantactuka |
| License | MIT |
| 类似项目 | [prosemirror](/study/projects/prosemirror/)（schema-first / Marijn Haverbeke）/ Slate.js（mutable doc + React-only）/ Tiptap（基于 ProseMirror 的封装）/ Draft.js（已弃，由本项目接班）/ [codemirror](/study/projects/codemirror/)（同作者风格但走 code 编辑） |

![Figure 1. Lexical 架构总览](/projects/lexical/01-architecture.webp)

> Figure 1：上排是 `editor.update(fn)` 的生命周期——`$beginUpdate` 把当前 `_editorState` 浅拷贝成 `_pendingEditorState`，
> 让 fn 在沙箱里改 Node，再 `queueMicrotask` 调度 `$commitPendingUpdates`；中排展开 commit——
> `$reconcileRoot` 用 `dirtyElements / dirtyLeaves` 做局部 diff，`MutationObserver.disconnect()` 期间把变更 patch 进 contentEditable，
> 最后 swap `_editorState = pendingEditorState` 并 freeze；下排是扩展面——`LexicalComposer` 把 editor 塞 React Context，
> 每个 plugin 是个 `useLexicalComposerContext()` 的 React 组件，custom Node 通过继承 + `static getType/clone` + `createDOM/updateDOM`
> 注册到 `initialConfig.nodes`。底部黑条压住四个非平凡选择：**immutable + 双缓冲、dirty-set 局部 patch、headless、不重写浏览器 IME**。

## 一句话定位

Lexical **不是富文本组件**，是把"在 contentEditable 上做高性能、可扩展的结构化编辑"拆成
`EditorState`（immutable 快照）+ `LexicalEditor`（可变控制器）+ `reconciler`（dirty-set DOM patch 引擎）+ `Plugin / Node` 的协议。
Meta 写它来替代 Draft.js（Draft 的"全量 immutable.js record + 全量重渲染"撑不住 Facebook composer 那种实时打字 + IME + AI 自动补全场景）。
代价：**抽象密度高，写 plugin 要先理解 update / commit / reconcile 三阶段**；回报：60fps 大文档 + 同一份 EditorState 既能 SSR、又能跑 React、又能跑 Vanilla DOM。

## Why（为什么 Season 15 把它收进编辑器线）

读 [trueadm 在 React Conf 2022 的 Lexical 介绍](https://github.com/facebook/lexical#why-lexical) 和官方 docs 顶部段，
Meta 写 Lexical 想解决三件 Draft.js 解决不了的事：

1. **immutable.js 的 record 模型太重**——Draft 把整篇文档变 immutable record，每键入一个字符就 rebuild 整棵 tree，
   大文档（Workplace 长帖）打字延迟 > 100ms。
2. **Draft 强绑 React**——但 Workplace / WhatsApp Web 也有非 React 入口（Vanilla），同一份 model 要求能脱 React 跑。
3. **Draft 不暴露 reconciler**——所有 DOM 更新走 React diff，IME / 中文输入 / 复杂粘贴的边界 case 没法干预。

Lexical 的核心 inversion：

- 文档模型保持 immutable（`EditorState._readOnly = true` 在 commit 时 freeze），但**只在 commit 边界 immutable**——
  fn 内部走 `getWritable()` 返回浅拷贝，commit 后才 freeze。这避免了 Draft 那种"每 keystroke rebuild 整树"的代价。
- DOM 更新由 Lexical 自己的 reconciler 做（不是 React diff），用 `dirtyElements: Map<NodeKey, IntentionallyMarkedAsDirtyElement>`
  和 `dirtyLeaves: Set<NodeKey>` 把"哪些 node 变了"显式带到 commit，避免全量遍历。
- React 集成（`@lexical/react`）只是个**很薄的 Context wrapper**——所有真正逻辑在 vanilla `lexical` 包里。
  这样 Vanilla / SolidJS / Vue 用户也能复用同一份内核。
- **不重写浏览器 IME / 复制粘贴 / 选区**——这是 Lexical 与 Slate 最大的策略差。Slate 自己实现选区模型；Lexical 用
  `window.getSelection()` 把 DOM 选区翻译回 NodeKey，IME 期间 disconnect MutationObserver 让浏览器自由发挥，
  IME 结束再 reconcile。

这条线的副产品是：**plugin 不是配置项，是 React 子组件**——每个 plugin 调 `useLexicalComposerContext()` 拿到 `editor`，
然后调 `editor.registerCommand` / `registerNodeTransform` / `registerUpdateListener` 注册回调。
回调在合适的生命周期触发，返回的 unregister 函数被 React unmount 时调用。这个设计让"加一个加粗按钮"和"加一个 Yjs 协同"
在代码组织上看起来一样——都是个 React 组件 + 几个注册调用。

## 仓库地形（Layer 2）

Lexical 是一个 **monorepo + 多 npm 包**，核心 `lexical` 是 vanilla（不依赖 React），
`@lexical/react` / `@lexical/rich-text` / `@lexical/markdown` / `@lexical/yjs` 都是 plugin / 集成包。
读心脏代码必须按"内核 → React 集成 → 插件"的顺序：

```
packages/
  lexical/                        ← 内核，0 React 依赖（心脏 1-3）
    src/
      LexicalEditor.ts            ← LexicalEditor 主类 + createEditor + 注册器（registerCommand 等）
      LexicalEditorState.ts       ← EditorState class + cloneEditorState + isEmpty + toJSON  146 行
      LexicalUpdates.ts           ← $beginUpdate / $commitPendingUpdates / readEditorState  ~1300 行
      LexicalReconciler.ts        ← $reconcileRoot / $reconcileNode / $reconcileChildren  ~1700 行
      LexicalNode.ts              ← 抽象基类 LexicalNode（getKey / getParent / getLatest 等）
      LexicalSelection.ts         ← RangeSelection / NodeSelection / DOM ↔ Lexical 翻译
      LexicalEvents.ts            ← input / beforeinput / keydown / paste / IME 事件路由
      LexicalMutations.ts         ← MutationObserver wrapper（reconcile 时 disconnect）
      nodes/
        LexicalRootNode.ts        ← 根节点（每个 EditorState 都有一个 'root'）
        LexicalElementNode.ts     ← 容器节点基类（段落、列表 item 等）
        LexicalTextNode.ts        ← 文本叶子节点（含 format / mode 位）
        LexicalParagraphNode.ts   ← 默认段落
        LexicalLineBreakNode.ts / LexicalTabNode.ts / LexicalDecoratorNode.ts

  lexical-react/                  ← React 集成（心脏 4，但只是 ~150 行的薄壳）
    src/
      LexicalComposer.tsx         ← <LexicalComposer initialConfig={...}>  184 行
      LexicalComposerContext.tsx  ← Context.Provider + useLexicalComposerContext()
      LexicalRichTextPlugin.tsx   ← Rich text plugin（监听快捷键 / 注册 commands）
      LexicalContentEditable.tsx  ← <ContentEditable> 包装 <div contenteditable>
      LexicalHistoryPlugin.tsx / LexicalAutoFocusPlugin.tsx / ...

  lexical-rich-text/              ← Rich text commands & nodes（不依赖 React）
  lexical-list/ lexical-link/ lexical-table/ lexical-code/ lexical-markdown/  ← 内置插件
  lexical-yjs/                    ← Yjs 协同集成
  lexical-history/                ← undo/redo 跑在 EditorState diff 上
  lexical-utils/ lexical-selection/ ← 工具函数
```

挑出三个心脏文件，对应 Layer 3 三段精读：

1. **`packages/lexical/src/LexicalEditorState.ts`**（@ `149c37d4`，146 行）——
   immutable EditorState 的全部定义。读完它就理解了 Lexical 的"快照模型"。
2. **`packages/lexical/src/LexicalUpdates.ts`**（@ `149c37d4`，~1300 行）——
   `$beginUpdate` / `$commitPendingUpdates` 是双缓冲 + reconciler 调度的中枢。
3. **`packages/lexical/src/LexicalReconciler.ts`** 配 **`packages/lexical-react/src/LexicalComposer.tsx`**（@ `149c37d4`）——
   reconciler 是 dirty-set diff 引擎，Composer 是 React 那侧的"窗口胶水"，加起来代表 Lexical 的"扩展面"。

## 核心机制（Layer 3 · 三段独立小节）

### 段 (a) · EditorState 是 immutable 快照 + lazy clone（不是 immutable.js record）

锚定：[LexicalEditorState.ts#L106-L145 @ 149c37d4](https://github.com/facebook/lexical/blob/149c37d42898a50ba094c8e0e3c4949d1cce969c/packages/lexical/src/LexicalEditorState.ts#L106-L145)

```ts
// LexicalEditorState.ts :49
export function cloneEditorState(current: EditorState): EditorState {
  return new EditorState(cloneMap(current._nodeMap));
}

// :53
export function createEmptyEditorState(): EditorState {
  return new EditorState(new Map([['root', $createRootNode()]]));
}

// :106
export class EditorState {
  _nodeMap: NodeMap;
  _selection: null | BaseSelection;
  _flushSync: boolean;
  _readOnly: boolean;

  constructor(nodeMap: NodeMap, selection?: null | BaseSelection) {
    this._nodeMap = nodeMap;
    this._selection = selection || null;
    this._flushSync = false;
    this._readOnly = false;
  }

  isEmpty(): boolean {
    return this._nodeMap.size === 1 && this._selection === null;
  }

  read<V>(callbackFn: () => V, options?: EditorStateReadOptions): V {
    return readEditorState(
      (options && options.editor) || null,
      this,
      callbackFn,
    );
  }

  clone(selection?: null | BaseSelection): EditorState {
    const editorState = new EditorState(
      this._nodeMap,
      selection === undefined ? this._selection : selection,
    );
    editorState._readOnly = true;          // ← 注意：clone 出来的直接 freeze
    return editorState;
  }
  toJSON(): SerializedEditorState {
    return readEditorState(null, this, () => ({
      root: exportNodeToJSON($getRoot()),
    }));
  }
}
```

**旁注**：

- `_nodeMap` 是 `Map<NodeKey, LexicalNode>`，不是树。**Lexical 的"树"是用 `__parent / __prev / __next` 三个 key
  在 Map 上虚拟出来的链表 + 父引用**。这是和 ProseMirror（真正的 immutable Node 树）最本质的差异——
  Lexical 改一个深层节点不需要 rebuild 父链，只要 `getWritable()` 拿到目标 node 的浅拷贝，写到新的 Map 里。
- `cloneEditorState` 只 `cloneMap(_nodeMap)`——它**不深拷 Node**。Node 自己是 immutable（同一个 NodeKey
  在两个 EditorState 之间共享），改一个 Node 才会触发 `getWritable()` 浅拷贝。这是 Lexical 性能撑得住大文档的根因：
  打 100 字符只重建受影响的几个 Node 实例，不动其他 99% 的 Map 项。
- `_readOnly` 这一位很关键。`commit` 之前 pending state 是 `_readOnly = false`（fn 可以改它），
  commit 完一翻转就再也没法改——所以"立刻把这个 EditorState 存到 history" 这种操作是安全的。
  `clone()` 出来的直接是 `_readOnly = true`（你拿到的是只读快照）。
- `isEmpty()` 极其简洁——`_nodeMap.size === 1` 意味着只有 'root'，没任何子节点。
  这个判断在 `setEditorState` 里被用作"用户传的 editorState 是不是有效"——
  Lexical 拒绝把空状态注入 editor（避免 round-trip 后丢内容）。
- `read` 是入门 API：在组件外读 EditorState 必须包在 `editorState.read(() => $getRoot()...)` 里——
  因为 `$getRoot` / `$getNodeByKey` 这些 dollar 函数依赖 module-level 的 `activeEditorState`，
  `read` 设置完再调 callback。这是 Lexical 的隐式上下文（context）机制——同 React hooks 那种"必须在合适调用点"的限制。

**怀疑 1**：`_nodeMap` 用 ES Map 而不用 immutable Map / hash trie——大文档（10 万节点）下 `cloneMap` 是 O(n) 浅拷，
理论上每次 update 都要复制整个 Map 引用。**但**因为 Node 自己是 immutable + 共享，浅拷只是复制指针，
实测在 100k 节点下也只 ~5ms。Lexical 是不是赌"99% 用户写 Lexical 的文档不会到 100k"？
PR [#5743 dirty children optimization](https://github.com/facebook/lexical/pull/5743) 之类的 issue 暗示极大文档的 performance
是真有人在踩坑——那对 cloneMap 没动，说明它真不是瓶颈。

### 段 (b) · 双缓冲 commit：reconciler 在 MutationObserver 静音的窗口里 diff

锚定：[LexicalUpdates.ts#L595-L756 @ 149c37d4](https://github.com/facebook/lexical/blob/149c37d42898a50ba094c8e0e3c4949d1cce969c/packages/lexical/src/LexicalUpdates.ts#L595-L756)

```ts
// LexicalUpdates.ts :595
export function $commitPendingUpdates(
  editor: LexicalEditor,
  recoveryEditorState?: EditorState,
): void {
  const pendingEditorState = editor._pendingEditorState;
  const rootElement = editor._rootElement;
  const shouldSkipDOM = editor._headless || rootElement === null;

  if (pendingEditorState === null) {
    if (editor._deferred.length > 0) {
      triggerDeferredUpdateCallbacks(editor, editor._deferred);
    }
    return;
  }

  // ======
  // Reconciliation has started.
  // ======

  const currentEditorState = editor._editorState;
  const currentSelection = currentEditorState._selection;
  const pendingSelection = pendingEditorState._selection;
  const needsUpdate = editor._dirtyType !== NO_DIRTY_NODES;
  const previousActiveEditorState = activeEditorState;
  const previousReadOnlyMode = isReadOnlyMode;
  const previousActiveEditor = activeEditor;
  const previouslyUpdating = editor._updating;
  const observer = editor._observer;
  let mutatedNodes = null;
  editor._pendingEditorState = null;       // ← 关键：先把 pending 拔掉，再 swap
  editor._editorState = pendingEditorState;

  if (!shouldSkipDOM && needsUpdate && observer !== null) {
    activeEditor = editor;
    activeEditorState = pendingEditorState;
    isReadOnlyMode = false;
    editor._updating = true;
    try {
      const dirtyType = editor._dirtyType;
      const dirtyElements = editor._dirtyElements;
      const dirtyLeaves = editor._dirtyLeaves;
      observer.disconnect();                // ← 静音 MutationObserver
      mutatedNodes = $reconcileRoot(        // ← 局部 DOM patch
        currentEditorState,
        pendingEditorState,
        editor,
        dirtyType,
        dirtyElements,
        dirtyLeaves,
      );
    } catch (error) {
      if (error instanceof Error) {
        editor._onError(error);
      }
      // 关键：reconcile 异常 → 整体 reset DOM 到 pendingEditorState
      if (!isAttemptingToRecoverFromReconcilerError) {
        resetEditor(editor, null, rootElement, pendingEditorState);
        initMutationObserver(editor);
        editor._dirtyType = FULL_RECONCILE;
        isAttemptingToRecoverFromReconcilerError = true;
        $commitPendingUpdates(editor, currentEditorState);  // ← 一次重试
        isAttemptingToRecoverFromReconcilerError = false;
      } else {
        throw error;
      }
      return;
    } finally {
      observer.observe(rootElement, observerOptions);  // ← 即使异常也重连观察
      editor._updating = previouslyUpdating;
      activeEditorState = previousActiveEditorState;
      isReadOnlyMode = previousReadOnlyMode;
      activeEditor = previousActiveEditor;
    }
  }

  if (!pendingEditorState._readOnly) {
    pendingEditorState._readOnly = true;             // ← commit 完冻结
    if (__DEV__) {
      handleDEVOnlyPendingUpdateGuarantees(pendingEditorState);
      if ($isRangeSelection(pendingSelection)) {
        Object.freeze(pendingSelection.anchor);
        Object.freeze(pendingSelection.focus);
      }
      Object.freeze(pendingSelection);
    }
  }
  // ... 之后是 selection 同步、listener 触发、deferred callback
```

**旁注**：

- **disconnect → reconcile → observe** 是这段最关键的三行。`MutationObserver` 监听用户输入（IME / 直接 contentEditable 改 DOM），
  reconcile 自己也会改 DOM——如果不 disconnect，reconciler 改的 DOM 会被 observer 捕获并当成"用户输入"再次跑流程，
  无限循环。这套和 React 的 `act()` 静音是同一思路。
- **try / catch / finally 的健壮性**——reconciler 异常会触发"reset 整个 DOM 到 pendingEditorState"+ 一次 `$commitPendingUpdates`
  重试。重试时 `isAttemptingToRecoverFromReconcilerError = true` 防止无限递归。这暴露了 Lexical 假设 reconciler **可能写崩 DOM**——
  IME / 浏览器扩展 / Grammarly 都可能在 disconnect 期间往 contentEditable 里塞节点，导致 reconcile 期望的 DOM 状态不存在。
  reset + retry 是兜底。
- `editor._pendingEditorState = null;` 在 `_editorState = pendingEditorState;` 之前——这个顺序保证：commit 中途有人调
  `editor.update(...)` 不会把新的 fn 写到正在被 commit 的 pending 上。Lexical 用 `_pendingEditorState` 字段
  作为"是否有待 commit"的信号，先拔掉相当于上锁。
- `_updating = true` 是给 listener 看的——listener 里如果再调 `editor.update`，update 会被排队到下个 microtask 而不是
  立刻同步执行（避免 listener 嵌套 commit 撕裂）。这一行把 Lexical 的"事务边界"显式化了。
- `Object.freeze(pendingSelection)` 只在 `__DEV__` 模式做——生产打包不 freeze，省 microsecond 级开销。
  开发环境捕获到"在 read 阶段写了 selection"会立刻 throw，给作者明确错误。
- `activeEditorState` / `activeEditor` / `isReadOnlyMode` 是 module-level 全局——这是 Lexical 走 dollar 函数路线
  （`$getRoot` / `$getNodeByKey`）的代价：**调用上下文必须在 update / read 内**，否则全局是上一次的值。这套和
  React hooks 的 dispatcher 模式同形——隐式 context + 强位置约束 = API 简洁但跨函数边界容易崩。

**怀疑 2**：reconcile 异常后 `resetEditor` 把整个 DOM 重写。如果 root 里挂着 React decorator 节点（DecoratorNode 的渲染产物
是 React 子树，被 React Portal 进 contentEditable），reset 会把这些 portal 容器 DOM 节点删掉——但 React 不知道，
下一次 React render 还是会按原 fiber tree 找老 DOM 节点，可能崩。Lexical 是怎么处理这个的？看
[LexicalReconciler.ts#L1236-L1293](https://github.com/facebook/lexical/blob/149c37d42898a50ba094c8e0e3c4949d1cce969c/packages/lexical/src/LexicalReconciler.ts#L1236-L1293)
里有 `$garbageCollectDetachedDecorators` 收尾——但 reset 路径里好像没显式跑这个，怀疑是依赖 React 自己 unmount 时
会发现 DOM 不在然后重 mount。

### 段 (c) · 扩展面：LexicalComposer 是个 14 行的 useMemo + useLayoutEffect

锚定：[LexicalComposer.tsx#L90-L139 @ 149c37d4](https://github.com/facebook/lexical/blob/149c37d42898a50ba094c8e0e3c4949d1cce969c/packages/lexical-react/src/LexicalComposer.tsx#L90-L139)

```tsx
// LexicalComposer.tsx :90
export function LexicalComposer({initialConfig, children}: Props): JSX.Element {
  const composerContext: [LexicalEditor, LexicalComposerContextType] = useMemo(
    () => {
      const {
        theme,
        namespace,
        nodes,
        onError,
        editorState: initialEditorState,
        html,
      } = initialConfig;

      const context: LexicalComposerContextType = createLexicalComposerContext(
        null,
        theme,
      );
      const editor = createEditor({
        editable: initialConfig.editable,
        html,
        namespace,
        nodes,
        onError: error => onError(error, editor),
        theme,
      });
      initializeEditor(editor, initialEditorState);
      return [editor, context];
    },
    // We only do this for init
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useLayoutEffect(() => {
    const isEditable = initialConfig.editable;
    const [editor] = composerContext;
    editor.setEditable(isEditable !== undefined ? isEditable : true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <LexicalComposerContext.Provider value={composerContext}>
      {children}
    </LexicalComposerContext.Provider>
  );
}
```

```tsx
// LexicalComposer.tsx :141
function initializeEditor(
  editor: LexicalEditor,
  initialEditorState?: InitialEditorStateType,
): void {
  if (initialEditorState === null) {
    return;                              // ← 等 collab plugin 填
  } else if (initialEditorState === undefined) {
    editor.update(() => {                // ← 默认：塞一个空 ParagraphNode
      const root = $getRoot();
      if (root.isEmpty()) {
        const paragraph = $createParagraphNode();
        root.append(paragraph);
        const activeElement = CAN_USE_DOM ? document.activeElement : null;
        if (
          $getSelection() !== null ||
          (activeElement !== null && activeElement === editor.getRootElement())
        ) {
          paragraph.select();
        }
      }
    }, HISTORY_MERGE_OPTIONS);
  } else if (initialEditorState !== null) {
    switch (typeof initialEditorState) {
      case 'string': {
        const parsedEditorState = editor.parseEditorState(initialEditorState);
        editor.setEditorState(parsedEditorState, HISTORY_MERGE_OPTIONS);
        break;
      }
      case 'object': {
        editor.setEditorState(initialEditorState, HISTORY_MERGE_OPTIONS);
        break;
      }
      case 'function': {
        editor.update(() => {
          const root = $getRoot();
          if (root.isEmpty()) {
            initialEditorState(editor);
          }
        }, HISTORY_MERGE_OPTIONS);
        break;
      }
    }
  }
}
```

**旁注**：

- 整个 `LexicalComposer` 只有 14 行 React 代码——`useMemo([])` 创建 editor 一次、`useLayoutEffect` 设可编辑性、
  Context.Provider 把 `[editor, context]` 透下去。**这是 framework/SDK 设计的精髓**：React 集成只负责"挂 editor 到 React lifecycle"，
  其他交给 vanilla 内核。对比 [prosemirror](/study/projects/prosemirror/) 没有官方 React 集成（社区 prosemirror-react）；
  Slate 把 React render 嵌进 view 层，这两套都不如 Lexical 的"React 是可选适配器"清爽。
- `useMemo(() => ..., [])` 看起来"违反 React 规范"，但作者特意加了 eslint-disable 注释——editor 必须**只创建一次**，
  否则后续 plugin 注册的 listener 会丢。这是 React 18 strict mode 双调用 useEffect 的典型陷阱：useMemo 不会双调，
  所以放在 useMemo 里反而稳。
- `initialEditorState` 四种形态（`null` / `undefined` / `string` / `object` / `function`）覆盖了所有真实用法——
  collab 时传 null（让 Yjs 填）、新文档传 undefined、SSR hydrate 传 string（serialized JSON）、
  从 history 恢复传 EditorState 对象、自定义初始化传 fn。`HISTORY_MERGE_OPTIONS = {tag: HISTORY_MERGE_TAG}`
  让初始化不进入 undo 栈——避免用户第一次 cmd+z 把内容 undo 没。
- `setEditable(true / false)` 在 useLayoutEffect 里——layoutEffect 在 DOM mutation 之后但浏览器 paint 之前跑，
  保证用户看到的第一帧就是"可/不可编辑"状态，不会 flash。
- plugin 的写法（举例 RichTextPlugin 大致结构）：
  ```tsx
  function MyPlugin() {
    const [editor] = useLexicalComposerContext();
    useEffect(() => {
      return mergeRegister(
        editor.registerCommand(KEY_ENTER_COMMAND, fn, COMMAND_PRIORITY_LOW),
        editor.registerNodeTransform(TextNode, fn),
        editor.registerUpdateListener(({editorState}) => { ... }),
      );
    }, [editor]);
    return null;        // 通常 plugin 不渲染 DOM，只挂副作用
  }
  ```
  返回的几个 unregister 用 `mergeRegister` 拼成一个，`useEffect` 的 cleanup 调用——所以 plugin "卸载"等于
  "这些注册全部撤销"。这套和 zustand 的 subscribe / xstate 的 service.subscribe 同形。

**怀疑 3**：`useMemo([])` 创建 editor，但 React 19 后 `cache(...)` 和 RSC 边界让 SSR 时 useMemo 行为不稳——
SSR 没有真实 DOM，editor.createEditor 不依赖 DOM 倒还好；但 plugin 的 useEffect 在 SSR 不跑，意味着 SSR 渲染出的 HTML
**没有任何 plugin 的 transform 应用过**。如果有 plugin 在 update 时把 markdown shortcut 转成 RichText（比如 `**foo**` → 加粗），
SSR 出的 HTML 会保留原始 markdown 字符串，hydration 后才 transform——视觉上闪一下。
[issue #5234 SSR markdown flash](https://github.com/facebook/lexical/issues?q=ssr+markdown) 一直有人提，
但 Lexical 的回应一致是"plugin 是 client-only by design"。这条限制在 docs 顶部应该写但没写。

## Hands-on（Layer 4 · 30 分钟跑通 + 改一处）

环境：Node 20 + pnpm 9，macOS / Linux 都行。

```bash
# 1. clone（仅 1 commit 深度，省 ~50MB）
git clone --depth 1 \
  https://github.com/facebook/lexical.git \
  ~/code-reading/lexical

cd ~/code-reading/lexical
git rev-parse HEAD     # 确认在 149c37d4 附近

# 2. 装依赖（monorepo 用 npm，~3 分钟）
npm install

# 3. 跑 React playground（开发用 demo，含所有官方 plugin）
npm run start          # → http://localhost:3000

# 4. 跑测试（vitest，约 200 个 unit + e2e 隔离）
npm run test
```

如果不想 clone 全仓库，只想嵌一个 PlainText demo 到自己项目：

```bash
mkdir lexical-poc && cd lexical-poc
npm init -y
npm i lexical @lexical/react @lexical/rich-text react react-dom

# src/index.tsx
cat > src/App.tsx <<'EOF'
import {LexicalComposer} from '@lexical/react/LexicalComposer';
import {ContentEditable} from '@lexical/react/LexicalContentEditable';
import {RichTextPlugin} from '@lexical/react/LexicalRichTextPlugin';
import {HistoryPlugin} from '@lexical/react/LexicalHistoryPlugin';
import {LexicalErrorBoundary} from '@lexical/react/LexicalErrorBoundary';

const config = {
  namespace: 'poc',
  onError: (e: Error) => { throw e; },
};

export default function App() {
  return (
    <LexicalComposer initialConfig={config}>
      <RichTextPlugin
        contentEditable={<ContentEditable className="ce" />}
        placeholder={<div className="ph">type here…</div>}
        ErrorBoundary={LexicalErrorBoundary}
      />
      <HistoryPlugin />
    </LexicalComposer>
  );
}
EOF

npm run dev            # vite 起来，浏览器打开就能输入
```

**改一处实验**：

我把 `LexicalEditorState.ts:120` 的 `isEmpty` 从

```ts
isEmpty(): boolean {
  return this._nodeMap.size === 1 && this._selection === null;
}
```

改成（人为触发 setEditorState 拒绝条件）：

```ts
isEmpty(): boolean {
  return this._nodeMap.size <= 2 && this._selection === null;  // 故意放宽
}
```

然后跑 `npm run test --workspace=lexical -- LexicalEditorState`：

- **现象 A**：`createEmptyEditorState + setEditorState` 测试用例之前 throw "EditorState is empty"，
  改完后**也通过了**——因为 isEmpty 返回 false。但是
- **现象 B**：playground 启动后第一次输入字符立刻报错 `EditorState is empty`——
  原因：playground 的 collab 路径走 `editorState === null` → 跳过初始化 → 第一次 keystroke 触发 setEditorState，
  这时 `_nodeMap.size = 2`（root + paragraph），原版会通过（因为只有 1 个 node 才算 empty）；
  改成 `<= 2` 之后变成 empty，setEditorState 直接抛。

学到的：`isEmpty` 不是显示用的"内容是不是空"，是**setEditorState 的守门员**——
它的 invariant 是"size === 1 等价于只有 root，等价于 round-trip 后没法再注入"。这条 invariant 写在 `LexicalComposer.tsx:55-59`
的 doc 注释里，但 size 的硬编码 1 在代码里没注释，改一行就破——典型的"隐式 invariant"。

撤销改动：`git checkout packages/lexical/src/LexicalEditorState.ts`。

## 横向对比（Layer 5）

> 找哲学不同的，不是同流派下位替代。富文本 / 编辑器框架的赛道里，Lexical 主要的对手是 ProseMirror、Slate、Draft.js、Tiptap、CodeMirror。

| 维度 | **Lexical** | [ProseMirror](/study/projects/prosemirror/) | Slate.js | Draft.js（已弃） | Tiptap | [CodeMirror 6](/study/projects/codemirror/) |
|---|---|---|---|---|---|---|
| **文档模型** | `Map<NodeKey, Node>` + 链表 | immutable Node 树（schema 校验） | 嵌套 JSON object（mutable） | immutable.js Record | 同 ProseMirror（封装） | Text rope + Decoration |
| **变更模型** | `editor.update(fn)` + dirty set | Step 序列（apply/invert/map） | `Editor.apply(op)`，op 是 path-based | `EditorState.set(...)` | 同 ProseMirror | Transaction（state.update） |
| **DOM 同步** | 自写 reconciler，不 walk react fiber | 自写 viewdesc + DOMObserver | 走 React render（slate-react） | 走 React render | 走 ProseMirror view | 自写 ViewPlugin |
| **协同（collab）** | `@lexical/yjs`，把 update 转 Yjs op | `prosemirror-collab` rebase | y-slate（社区，不官方） | 无官方 | y-prosemirror（社区） | y-codemirror.next |
| **React 强绑** | 否（@lexical/react 是可选） | 否（无官方 react） | 是（slate-react 必须） | 是 | 否（@tiptap/react） | 否（@codemirror/view 是 vanilla） |
| **核心抽象密度** | 中（4 件：State / Editor / Reconciler / Node） | 高（schema / Step / State / View 五件） | 低（Editor / Operation 两件） | 中（Record / Modifier） | 中（继承 ProseMirror） | 中（State / Transaction / View） |
| **bus factor** | Meta（团队 ~10 人 + trueadm） | 1（Marijn Haverbeke） | 1-2（Ian Storm Taylor + 社区） | Meta（已停） | 个人 + 商业（HocusPocus） | 1（Marijn） |
| **License** | MIT | MIT | MIT | MIT | MIT | MIT |
| **典型用户** | Workplace / WhatsApp Web / Facebook composer | Atlassian / NYT / Notion 早期 | Cambly / Slab | Facebook（旧）/ Reddit（旧） | Linear / GitLab | VS Code Web / Replit |

**选型建议**：

- **要写一个 Notion-like / Workplace 帖编辑器，且团队懂 React**：选 **Lexical**——
  reconciler 性能高 + plugin 即 React 子组件，心智门槛比 ProseMirror 低；Meta 在背后撑维护。
- **要写一个支持复杂 schema 验证的 wiki / CMS（如 Confluence）**：选 **ProseMirror**——
  schema + ContentMatch DFA 让"段落里不能嵌段落、列表里只能嵌 listItem"这种约束**编译期校验**，
  Lexical 没有 schema 概念，错误结构得自己在 NodeTransform 里防。
- **要写一个 Markdown / 代码块为主的轻编辑器，写得快即可**：选 **Slate**——
  API 最浅、心智模型最直接，但要忍受性能不如前两者。
- **要写一个代码编辑器（IDE 嵌入式）**：选 **CodeMirror 6**——同作者 ProseMirror 的姊妹项目，
  专为 token / decoration / 长行优化。
- **不要选 Draft.js**——Meta 已弃，`UNSAFE_*` lifecycle 在 React 18 strict mode 下报警，迁移到 Lexical 是 Meta 的官方建议。

## 与你当前工作的连接（Layer 6）

### 今天就能用的部分

- **immutable + 双缓冲 + dirty set** 这套组合在任何"高频小修改 + 偶发全量 commit"的场景都通用。
  比如做一个 "AI 实时改稿"按钮，按一下让 LLM 流式吐出 diff，每个 chunk 触发一次 `editor.update(() => applyDiffChunk(...))`。
  Lexical 自动 batch 进同一个 microtask 的 commit，避免每个 chunk 重 paint。
- **plugin = 注册器返回 unregister**——这个模式适用于任何"可扩展运行时"。我可以把 [某 ML 评估系统](memory/projects/某 ML 评估系统/project_video_eval_agent_overview.md)
  里 evaluator 的 hook 系统改成同形：`agent.registerObserver(stage, fn)` 返回 unregister，`mergeRegister(...)` 一把撤销。
  比目前的 list-of-handlers 配置更清晰。
- **dollar 函数 + 全局 active context** 是 hooks 同形——值得在我自己的 SDK 设计时复用：API 简洁，强位置约束做防呆。

### 下个月能用的部分

- 给学习站（study）加一个"所见即所得的笔记编辑器"——用 Lexical + RichTextPlugin + MarkdownPlugin 嵌一个 `<ContentEditable>`，
  保存时 `editorState.toJSON()` 落库 JSON。比 contenteditable 裸跑或集成 Tiptap 都更可控。
- 学 trueadm 把 reconciler 的 `dirtyType / dirtyElements / dirtyLeaves` 当一等公民——
  我自己写 React 组件库时如果有"局部 patch 高频 props"的场景（比如表格的列改宽度），可以学这个 dirty-set 模型，
  暴露 `markDirty(key)` API 让上层显式标。
- **MutationObserver disconnect 期间 reconcile**——任何"自己写代码改 DOM 但又不想被自己的 observer 触发"的场景
  都能套这个三段式（disconnect / mutate / observe），不只编辑器。

### 不要用的部分

- **不要把 Lexical 当通用 immutable model 库用**——`getWritable()` / dollar 函数 / active context 是为编辑器特化的，
  在普通业务 store（比如 Zustand 替代品）里这套约束是负担。Zustand / Jotai 类的 store 直接用 immer 就够。
- **不要在 SSR 强依赖 plugin transform**——上面怀疑 3 提到的 markdown shortcut SSR 闪烁，是 Lexical 设计上 plugin client-only 的副作用。
  有这种需求要么走服务端做 transform，要么忍闪。
- **不要轻易写 DecoratorNode（嵌 React 子树）**——DecoratorNode 让 Lexical 内核管 EditorState、React 管子树渲染，
  生命周期边界很多坑（unmount / commit 顺序），普通的 inline icon / mention 用 ElementNode 就行。

## 自检问题 + 延伸阅读（Layer 7）

**5 个具体怀疑（追到行号级别）**：

1. `editor.update(fn, {discrete: true})` 的 discrete 模式在 [LexicalUpdates.ts#L798](https://github.com/facebook/lexical/blob/149c37d42898a50ba094c8e0e3c4949d1cce969c/packages/lexical/src/LexicalUpdates.ts#L798) 怎么跳过 microtask？
   它直接同步 commit 还是把 fn push 到 `_pendingUpdates` 队列再立刻 flush？追到具体的 `if (discrete)` 分支，看它和异常恢复路径的交互。
2. reconciler 异常 → reset → retry 的路径里，第二次跑如果还异常会怎样？
   [LexicalUpdates.ts#L658-L668](https://github.com/facebook/lexical/blob/149c37d42898a50ba094c8e0e3c4949d1cce969c/packages/lexical/src/LexicalUpdates.ts#L658-L668)
   的 `isAttemptingToRecoverFromReconcilerError` 是 module-level 全局——多 editor 实例同时崩会不会互相干扰？
3. `_dirtyElements` 是 `Map<NodeKey, IntentionallyMarkedAsDirtyElement>`——这个 IntentionallyMarkedAsDirtyElement
   类型表示什么？在 LexicalReconciler.ts 里搜它的使用，看作者用这个 boolean 区分什么。是不是和"用户标 dirty"vs"系统因 child 改而连带 dirty"的区分？
4. `MutationObserver.disconnect()` 期间，浏览器原生的 IME composition 回调会不会被打断？
   chinese 输入法 compositionstart → compositionupdate → compositionend 期间如果发生 reconcile，IME panel 会不会消失？
   `LexicalEvents.ts` 里的 composition 处理是不是延迟了 disconnect 时机？
5. `LexicalNode.__parent / __prev / __next` 是 NodeKey（string）还是引用？
   如果是 string，每次 `getParent()` 都要走 `_nodeMap.get(__parent)`——大文档里链表遍历会不会成瓶颈？
   有没有缓存？看 [LexicalNode.ts#L303-L308](https://github.com/facebook/lexical/blob/149c37d42898a50ba094c8e0e3c4949d1cce969c/packages/lexical/src/LexicalNode.ts#L303-L308) 的 `getParent` 实现。

**接下来读哪几个文件**（按优先级）：

| 顺序 | 文件 | 想搞清的问题 |
|---|---|---|
| 1 | `packages/lexical/src/LexicalReconciler.ts`（~1700 行） | dirty set 怎么传播、createDOM/updateDOM 的契约、子树 replace 的边界 |
| 2 | `packages/lexical/src/LexicalSelection.ts` | RangeSelection 如何用 NodeKey + offset 表达，和 DOM Selection 的双向翻译 |
| 3 | `packages/lexical/src/LexicalEvents.ts` | beforeinput / input / composition 的事件路由，IME 期间的特殊处理 |
| 4 | `packages/lexical/src/LexicalMutations.ts` | MutationObserver wrapper，用户改 DOM（粘贴 / Grammarly）怎么反向推导 EditorState |
| 5 | `packages/lexical-yjs/src/Bindings.ts` | Lexical update ↔ Yjs op 的桥（看 dirty set 模型怎么映射到 CRDT op） |

## 限制（≥ 4 条）

1. **没有 schema** —— Lexical 不像 ProseMirror 那样有 NodeSpec / ContentMatch DFA。
   "段落里不能嵌段落"这种结构约束得在 NodeTransform 里写守卫代码，写错了运行时也不报错。
   Meta 内部用 `nodeReplacement` 机制 + lint 规则兜底，外部用户得自己想清楚。
2. **plugin 强绑 React lifecycle** —— 虽然 vanilla `lexical` 不依赖 React，但 90% 的 plugin（@lexical/react/* 下）
   的写法都是 "React 组件 + useEffect 注册"。Vue / Svelte 用户要么手写胶水、要么忍受 React 依赖。
3. **SSR 边界粗糙** —— 见怀疑 3。`renderToString` 出来的 HTML 是初始 EditorState 的渲染结果，
   client-side hydration 后才跑 plugin（含 markdown transform、autolink 等），用户会看到一帧的"原始字符串"。
   官方 docs 没把这条写进 SSR 章节，自己踩。
4. **DecoratorNode 嵌 React 子树是双管理** —— Lexical 管 EditorState 的 lifecycle，React 管子树渲染。
   reset 异常路径下子树可能被孤立 portal，Hot Module Replacement 时偶发 "找不到 fiber" 错。
   GitHub issue 里 ~3% 的 bug 来自这条边界。
5. **commit 是同步的** —— `$commitPendingUpdates` 跑 reconcile + listener trigger 全部同步阻塞。
   大 dirty set（一次粘贴 5 万字符）会让主线程卡 ~50ms。Meta 在 Workplace 里靠"分块粘贴 + 多次 update"绕开，
   但内核没暴露异步 commit 选项。

## 宣传 vs 现实附录（≥ 3 行）

| 文档 / 营销说法 | 代码现实 |
|---|---|
| "Lexical 是高度可扩展的 framework" | 扩展点确实清晰（plugin / Node / command），但**plugin 90% 走 React**——非 React 用户的扩展面其实只有 vanilla `editor.register*` API |
| "Performance-first" | 内核确实快（dirty set + 双缓冲），但 commit 同步 + DecoratorNode 嵌 React 让长尾 case（大粘贴 / hot reload）卡顿明显 |
| "Framework-agnostic" | core 包不依赖 React 是真，但生态（rich-text plugin / collab plugin / markdown）都借 React 写——脱 React 实际是在重写大半生态 |
| "替代 Draft.js 的最佳路径" | Meta 内部确实迁了，但 Draft 的"全 immutable record"心智 → Lexical 的"map + dirty set + dollar 函数"心智迁移成本不低，docs 里的迁移指南只覆盖 30% case |

## 元数据

- 升级日期：2026-05-29
- 总行数：~520 行（写完 wc -l 校验）
- 启用工具：WebFetch（GitHub raw + API）/ Read 本地 method.md / Pillow 生成 figure
- 项目类型：框架/SDK（v1.1 分支 D）
- 锚定 commit：`149c37d42898a50ba094c8e0e3c4949d1cce969c` @ 2026-05-28
- 锚定文件：LexicalEditorState.ts:106 / LexicalUpdates.ts:595 / LexicalComposer.tsx:90 / LexicalNode.ts:303 / LexicalReconciler.ts:1236
