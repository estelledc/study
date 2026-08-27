---
title: ProseMirror — schema 先定 DOM 后服从的富文本编辑器框架
来源: https://github.com/ProseMirror/prosemirror-state
日期: 2026-05-30
分类: 编辑器
难度: 高级
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/ProseMirror/prosemirror-state
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: d6fdcd19c4f7f68206b0a8d49649860365672585
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 1.4.4
---

## 是什么

ProseMirror 是一套**自己定义文档结构、再让浏览器服从**的富文本框架，不是开箱即用的输入组件。日常类比：办报纸要先定版式手册，作者只能在栏位里填内容，不能擅自发明一种新格式。

浏览器的 `contentEditable` 没这本手册。用户从 Word 粘一段进来，DOM 里可能出现多层 `<font>` / `<span>`，谁也保证不了结构合法。ProseMirror 反过来：**schema 先声明合法形态**，每次编辑被拆成可 `apply` / `invert` / `map` 的 `Step`。本文把编辑器内核钉在 `prosemirror-state@1.4.4`；schema、Step 与 View 来自一并阅读的配套包。

## 为什么重要

不理解 ProseMirror，下面这些事都没法解释：

- 为什么协同编辑要传 Step 序列，而不是 DOM diff
- 为什么 schema 里 `'paragraph+'` 和 `'paragraph*'` 会让空文档行为完全不同
- 为什么 View 必须用 `MutationObserver` 把浏览器对 DOM 的偷改翻译回 transaction
- 为什么两个带同一 `PluginKey` 的插件不能同时放进一份 state

## 核心要点

固定源码里可以把设计收成三件抽象：

1. **Schema（合法形态）**：`prosemirror-model@1.25.11` 把 `content` 表达式编成 `ContentMatch`（先 NFA 再 DFA）。`+` 不允许空匹配作为合法结束，`*` 允许。节点属性和嵌套规则在创建文档时就检查，而不是事后劝告。

2. **Step（原子修改）**：`prosemirror-transform@1.12.0` 的 `Step` 必须实现 `apply`、`invert`、`map` 和 JSON 往返。`ReplaceStep.invert` 用旧文档切片换回被替换区间；`map` 在两端都被 `deletedAcross` 时返回 `null`，表示这个 step 已被 concurrent 删除吃掉。

3. **State + View**：`EditorState` 是持久化快照。`apply` / `applyTransaction` 算出**新实例**，不改旧对象。插件可以 `filterTransaction` 否决，也可以 `appendTransaction` 追加；追加会循环到没有插件再追加为止。`EditorView`（`prosemirror-view@1.42.3`）把 state 画到 contentEditable，并用 `DOMObserver` 里的 `MutationObserver` 抓浏览器回头改 DOM。

`Transaction` 是带选区、stored marks 和 metadata 的 `Transform`。`state.tr` 从当前 state 长出一笔新账。

## 实践示例

### 案例 1：最小段落编辑器

```ts
import { Schema } from "prosemirror-model";
import { EditorState } from "prosemirror-state";
import { EditorView } from "prosemirror-view";

const schema = new Schema({
  nodes: {
    doc: { content: "paragraph+" },
    paragraph: { content: "text*", toDOM: () => ["p", 0] },
    text: {},
  },
});

const state = EditorState.create({ schema });
const view = new EditorView(document.querySelector("#editor"), {
  state,
  dispatchTransaction(tr) {
    view.updateState(view.state.apply(tr));
  },
});
```

**逐部分**：`content: "paragraph+"` 表示 doc 至少要有一个 paragraph，所以 `create` 会 `createAndFill()` 出合法初值。`toDOM: () => ["p", 0]` 的 `0` 是子节点洞。必须自己写 `dispatchTransaction`，否则用户输入产生的 transaction 不会回到 view。

### 案例 2：看 ReplaceStep 的三件套

```ts
import { Fragment, Slice } from "prosemirror-model";
import { ReplaceStep } from "prosemirror-transform";

const step = new ReplaceStep(5, 5, slice);
const result = step.apply(doc);
const inverse = step.invert(doc);
const remapped = step.map(otherMap);
```

**逐部分**：`apply` 得到新文档或失败信息，旧 `doc` 不变。`invert` 给 history 用。`map` 给并发编辑用——本地又打了几个字之后，远端 step 的位置要避开新插入。两端都已被删除映射掉时，`map` 返回 `null`，调用方必须丢掉这个 step。

### 案例 3：插件可以否决或追加 transaction

```ts
import { Plugin, PluginKey } from "prosemirror-state";

const key = new PluginKey("audit");
const audit = new Plugin({
  key,
  filterTransaction(tr) {
    return !tr.getMeta("blocked");
  },
  appendTransaction(trs, _old, state) {
    if (trs.some((tr) => tr.docChanged)) {
      return state.tr.setMeta("touched", true);
    }
  },
});
```

**逐部分**：同一 `PluginKey` 不能装两份，`EditorState.create` 会抛 `Adding different instances of a keyed plugin`。`filterTransaction` 返回 false 则整笔 root transaction 被丢弃。`appendTransaction` 看到新 step 可以再追加；别的插件又追加时，它只会再看到自己没见过的那几笔。

## 踩过的坑

1. **`'inline*'` 和 `'inline+'` 不是风格差异**：后者不允许空段落，编辑空文档时的补齐和光标行为会完全不同。

2. **协同不能直接发 DOM diff**：Step 才有 `map`。把 DOM 当真相，并发删除加插入时两端会对不齐。本文未运行协同包，不讨论具体 OT/CRDT 产品。

3. **View 层的浏览器补丁没有消失**：固定 `1.42.3` 仍保留 Firefox「空格被吃掉」的 hack node，以及 Safari shadow selection 的旁路。自定义 `NodeView` 必须实现 `update` / `destroy`，否则会漏卸载。

4. **重复 PluginKey 是硬错误**：不是后装覆盖先装，创建 state 时直接抛。

5. **GitHub 上的 model/view tag 可能落后 npm**：当前 latest model/view 的 `gitHead` 在 GitHub 不可达，源码在 `code.haverbeke.berlin`。不要用 GitHub 旧 tag 当 npm latest。

## 适用 vs 不适用场景

**适用**：

- 文档结构必须合法的编辑器：病历、合同、技术写作
- 需要把每次修改做成可 rebase 的 step 流
- 已经有 schema 设计、愿意自己写 plugin 胶水的团队
- 需要可预测的 undo：`Step.invert` 让历史栈可反演

**不适用**：

- 只要简单评论框——textarea 或更轻的包装就够
- 团队没人维护 schema 和 plugin
- 想要 React/Vue 声明式组件树当主 API——应看上层包装，而不是直接绑这四个包
- 代码编辑器赛道；那是同作者的 CodeMirror

## 固定版本边界

- 本文页面 revision 绑定 `ProseMirror/prosemirror-state@d6fdcd19...`，即 tag / npm `prosemirror-state@1.4.4`；GitHub `gitHead` 与 tag 一致。
- 配套阅读：`prosemirror-model@1.25.11`（`code.haverbeke.berlin` @ `09098e3b...`）、`prosemirror-transform@1.12.0`（GitHub @ `fb70a533...`）、`prosemirror-view@1.42.3`（haverbeke.berlin @ `20dc0a91...`）。
- GitHub `prosemirror-model` / `prosemirror-view` 最新 tag 分别停在 `1.25.4` / `1.41.7`，不能代表 npm latest。
- 重复 plugin key 会抛错；`applyTransaction` 会循环 `appendTransaction` 直到稳定。
- 本文未安装依赖、未跑上游测试、未跑协同或浏览器套件，状态保持 `UNVERIFIED`。

## 学到什么

- **schema 先定、DOM 后服从**把「我接受任何 DOM」反转成「DOM 必须满足表达式」。
- **apply / invert / map** 让撤销和并发变成同一套位置代数，而不是后挂功能。
- **持久化 state + MutationObserver 回读**是在承认：浏览器会偷改 DOM，编辑器必须把它翻译回来。
- **分包 + 双远程**要求按包钉 revision：state 仍在 GitHub，model/view 的最新源码已经迁到 haverbeke.berlin。

## 应用型自测

1. `EditorState.apply(tr)` 会就地改当前 state 吗？
2. 两个插件用了同一个 `PluginKey`，`EditorState.create` 会怎样？
3. `ReplaceStep.map` 在 from/to 都被 `deletedAcross` 时返回什么？

检查点：

1. 不会。它构造新的 `EditorState`，旧实例保持原样。
2. 抛 `RangeError`：`Adding different instances of a keyed plugin`。
3. 返回 `null`，表示这个 step 已被 concurrent 删除吞掉，不能再 apply。

## 延伸阅读

- 作者指南：[ProseMirror Guide](https://prosemirror.net/docs/guide/)
- 固定内核：[ProseMirror/prosemirror-state](https://github.com/ProseMirror/prosemirror-state) —— 本文绑定提交 `d6fdcd19c4f7f68206b0a8d49649860365672585`
- [[lexical]] —— 快照 + 脏节点路线，对照 schema/step
- [[codemirror]] —— 同作者的代码编辑器，分包思路相近

## 关联

- [[codemirror]] —— 同作者的代码编辑器，plugin 与不可变 state 一脉相承
- [[lexical]] —— Meta 的富文本内核：事务和脏集，而不是 schema 表达式
- [[lezer]] —— 同作者的增量语法分析器
- [[yjs]] —— 另一种把并发修改做成可交换操作的内核

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[affine]] —— AFFiNE — 文档和白板共用同一棵 block 树的开源知识库
- [[codemirror]] —— CodeMirror — 编辑器不是一个类，是一组扩展的合奏
- [[etherpad-lite]] —— Etherpad — 经典协作文本编辑器
- [[excalidraw]] —— Excalidraw — 手绘风协作白板
- [[fabric-js]] —— Fabric.js — 给 Canvas 加一层"对象模型"，让画布图形可以拖
- [[foam]] —— Foam — 把 VS Code 变成 Markdown 双链知识库
- [[hedgedoc]] —— HedgeDoc — 协作 Markdown 编辑
- [[hocuspocus]] —— Hocuspocus — 给 Yjs 配一个能直接上线的协作后端
- [[lexical]] —— Lexical — 把富文本编辑拆成快照、事务和插件
- [[marktext]] —— MarkText — 实时预览 Markdown 编辑器
- [[monaco-editor]] —— monaco-editor — 把 VSCode 编辑器搬进浏览器的 SDK
- [[outline]] —— Outline — 团队 Wiki 协作平台
- [[siyuan]] —— SiYuan — 国产块结构笔记
- [[trilium]] —— Trilium — 树形层级笔记系统
- [[yjs]] —— Yjs — 让任何编辑器都能接的协同编辑内核
- [[zettlr]] —— Zettlr — 学者向 Markdown 编辑器
