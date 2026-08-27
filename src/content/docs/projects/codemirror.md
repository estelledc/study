---
title: CodeMirror — 编辑器不是一个类，是一组扩展的合奏
来源: 'https://code.haverbeke.berlin/codemirror/state'
日期: 2026-05-29
分类: projects / 前端
难度: 高级
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://code.haverbeke.berlin/codemirror/state
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: cce2dd5aa4982596b5fb9a27f54a396dfe4f87b5
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 6.7.1
---

## 是什么

CodeMirror 6 是一组**按扩展拼出来的浏览器代码编辑器**。日常类比：不是按一个按钮就亮的微波炉，而是乐高底盘——光标、选区、撤销、滚动是零件，行号和高亮也是零件。

你写：

```ts
import { EditorState } from "@codemirror/state"
import { EditorView, keymap, lineNumbers } from "@codemirror/view"
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands"
import { javascript } from "@codemirror/lang-javascript"
import { autocompletion, completionKeymap } from "@codemirror/autocomplete"

const state = EditorState.create({
  doc: "function hello() { return 'hi'; }\n",
  extensions: [
    lineNumbers(),
    history(),
    javascript(),
    autocompletion(),
    keymap.of([...defaultKeymap, ...historyKeymap, ...completionKeymap]),
  ],
})
new EditorView({ state, parent: document.getElementById("app")! })
```

`EditorState.create` 把字符串按 `lineSeparator` facet（默认 `/\r\n?|\n/`）切成不可变 `Text`，缺省选区是位置 0。`EditorView` 再把 state 投影到 DOM。2018 年的第 6 版才确立这套协议；第 5 版还是一个大类。

## 为什么重要

不理解这套协议，下面这些事会对不上：

- 为什么“核心”可以很小，功能却能长成在线 IDE
- 为什么撤销、协同、语法树缓存都更像“指向旧快照”，而不是改同一个可变对象
- 为什么插件不是 `editor.addXxx()`，而是往 Facet 插槽里塞值
- 为什么 2026-04-15 之后 GitHub `codemirror/*` 只剩 forwarding link，npm `gitHead` 要到 `code.haverbeke.berlin` 才对得上

## 核心要点

1. **不可变 state + transaction**：`EditorState` 禁止直接改属性。`state.update(...)` 解析成 `Transaction`，再构造新 state。旧对象留下，撤销就是回到它。

2. **Facet 是带合并规则的插槽**：`Facet.define` 用模块级 `nextID++` 分配 id。多个扩展往同一 facet 供值，`combine` 合成一份输出；没给 `combine` 时输出就是输入数组。`tabSize` 取第一个值，默认 4。`compare` / `compareInput` 默认 `===`。

3. **View 只画 viewport**：`EditorView` 只把可见范围（加边距）画进 `contentDOM`。直接改这个 DOM 会被观察器回滚；改内容必须 `dispatch` transaction。所有插件在同一条 `ViewUpdate` 流水线看到 `docChanged` / `selectionSet`。

4. **Lezer 树活在 StateField 里**：`@codemirror/language` 把当前 `Tree` 放进 `Language.state`。文档变化时用 fragments 增量重解析；未完成的解析只推进到旧终点与 viewport 的较大者，避免在 state 更新里解析整份文件。

## 实践示例

### 案例 1：最小可编辑组合

上面那段就是最小 IDE：行号、历史、JS 语法、补全都是独立扩展。`javascript()` / `autocompletion()` 来自另外的包，核心 `@codemirror/state` 并不知道它们。

### 案例 2：依赖文档的 Facet

```ts
import { Facet } from "@codemirror/state"

const wordCount = Facet.define<number, number>({
  combine: values => values.reduce((a, b) => a + b, 0),
})
const wordCountFromDoc = wordCount.compute(["doc"], state =>
  state.doc.toString().split(/\s+/).filter(Boolean).length
)
```

`["doc"]` 声明依赖：只有文档变才重算，选区移动不会走 `get`。这和 React `useMemo` 的 deps 同一思路，但是编辑器状态机上的数据流。

### 案例 3：同一条 update 流水线

```ts
import { ViewPlugin, ViewUpdate } from "@codemirror/view"

const logUpdates = ViewPlugin.fromClass(class {
  update(u: ViewUpdate) {
    if (u.docChanged) console.log("doc:", u.changes.toJSON())
    if (u.selectionSet) console.log("sel:", u.state.selection.main.from)
  }
})
```

输入、撤销、选区移动都进同一个 `update`。`history()` 默认 `minDepth: 100`、`newGroupDelay: 500`，相邻且碰到已有变更范围的事务会合并进同一undo 事件。

## 踩过的坑

1. **Facet 返回对象却不给 `compare`**：默认 `===`，每次都算“变了”，下游会跟着重算。要稳定输出就写 `compare`。

2. **两份 `@codemirror/state` 会静默错位**：`nextID++` 是模块级的。重复安装会得到两套 id 空间——一边写入、一边读默认值，常常不报错。必须 dedupe 成单实例。

3. **`StateField.update` 每次都 new 对象**：没变化时应 `return val`。否则 GC 与下游依赖会被无意义的引用变化带着走。

4. **GitHub 上的 6.6.x 不是当前 npm**：archived `codemirror/state` 停在 6.6.0；本文绑定的 6.7.1 只在 haverbeke.berlin 可达。不要用 GitHub `main` 的 forwarding commit 当版本真相。

## 适用 vs 不适用场景

**适用**：
- 嵌入网页的代码编辑（在线 IDE、文档里的可编辑块、代码浏览）
- 需要按功能选包、自己组合扩展
- 协同 / 撤销依赖不可变快照的场景

**不适用**：
- 要开箱即用的完整 IDE 协议，且接受 vscode 包装体积 → [[monaco-editor]]
- 富文本（段落、图片、链接节点）→ [[prosemirror]] / [[lexical]]；CodeMirror 文档是纯文本 + 语法树
- 仍在维护 CodeMirror 5 / Ace、没有重写预算

## 固定版本边界

- 本文绑定 `@codemirror/state@6.7.1` / `cce2dd5aa4982596b5fb9a27f54a396dfe4f87b5`（`code.haverbeke.berlin/codemirror/state`）。
- 同批对照包：`view@6.43.9` / `d4e1656e...`，`language@6.12.4` / `89974ce5...`，`commands@6.11.0` / `03580e55...`，`autocomplete@6.20.3` / `66587500...`。
- GitHub `codemirror/*` 于 2026-04-15 archived；npm latest 的 `gitHead` 在 GitHub 不可达。autocomplete 的 forge HEAD 新于 npm 6.20.3，本文绑 npm 提交而不是 HEAD。
- `history` 默认 `minDepth: 100`、`newGroupDelay: 500`；`tabSize` 默认 4。
- 本文未安装依赖、未跑上游测试或浏览器套件、未测 bundle，状态保持 `UNVERIFIED`。

## 学到什么

1. **协议比“完整功能”更耐用**——Facet / Transaction / Extension 三个口子让社区往上长，而不改核心类
2. **不可变不等于每次都拷整份文档**——`Text` 是树状结构共享；Language 的增量 parse 也复用 fragments
3. **模块级身份（`nextID`）把“单实例”变成运行时合同**，重复安装会静默坏掉
4. **迁移托管不等于项目死了**——canonical remote 变了，revision 必须跟着可达的 forge 走

## 应用型自测

1. `Facet.define` 不传 `combine` 也不传 `compare` 时，两个内容相同的新数组算“没变”吗？
2. 用户改了 `contentDOM` 里的一个字符，CodeMirror 会把它当成正式文档变更吗？
3. 文档很长、上次解析还没到文件末尾时，下一次 state 更新会先把整份文件解析完吗？

检查点：

1. 不算。默认 `compare` 是 `===`，新数组引用不同就会重算下游。
2. 不会。观察器会回滚直接 DOM 改动；正式变更必须 `dispatch` transaction。
3. 不会。未完成解析只推进到旧 tree 终点与当前 viewport 的较大者。

## 延伸阅读

- 设计原文：[The Architecture of CodeMirror 6](https://marijnhaverbeke.nl/blog/codemirror-6.html)
- 系统指南：[codemirror.net/docs/guide](https://codemirror.net/docs/guide/)
- 固定内核：[`code.haverbeke.berlin/codemirror/state`](https://code.haverbeke.berlin/codemirror/state) —— `cce2dd5aa4982596b5fb9a27f54a396dfe4f87b5`
- GitHub 归档镜像：[github.com/codemirror/state](https://github.com/codemirror/state)（停在 6.6.0 + forwarding）
- [[monaco-editor]] —— vscode 包装对照
- [[prosemirror]] —— 同一作者的富文本兄弟

## 关联

- [[monaco-editor]] —— 同领域，默认全量 vscode 协议
- [[lexical]] —— 不可变 + 组合，但是富文本 / React-first
- [[prosemirror]] —— 同作者，Transaction / Plugin 更偏文档 schema
- [[shiki]] —— 只读高亮对照
- [[yjs]] —— 常见协同后端，不在本批源码绑定内
- [[react]] —— 用社区包装嵌入，本文未绑包装包版本

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[bookstack]] —— BookStack — 文档型 Wiki
- [[etherpad-lite]] —— Etherpad — 经典协作文本编辑器
- [[foam]] —— Foam — 把 VS Code 变成 Markdown 双链知识库
- [[hedgedoc]] —— HedgeDoc — 协作 Markdown 编辑
- [[hocuspocus]] —— Hocuspocus — 给 Yjs 配一个能直接上线的协作后端
- [[jupyter-notebook]] —— Jupyter Notebook — 经典数据科学笔记本
- [[lapce]] —— Lapce — 把编辑器搬到 GPU 上的 Rust 实验
- [[lexical]] —— Lexical — 把富文本编辑拆成快照、事务和插件
- [[lite-xl]] —— Lite-XL — 不到 3MB 的编辑器也能扩展出花样
- [[monaco-editor]] —— monaco-editor — 把 VSCode 编辑器搬进浏览器的 SDK
- [[notepad-plus-plus]] —— Notepad++ — 比记事本多两个加号的 Windows 编辑器
- [[overleaf]] —— Overleaf — 在线 LaTeX 协作
- [[pluto-jl]] —— Pluto.jl — Julia 反应式笔记本
- [[prosemirror]] —— ProseMirror — schema 先定 DOM 后服从的富文本编辑器框架
- [[silverbullet]] —— SilverBullet — 自托管笔记 web 应用
- [[siyuan]] —— SiYuan — 国产块结构笔记
- [[trilium]] —— Trilium — 树形层级笔记系统
- [[vscode]] —— VS Code — 把编辑/调试/扩展捏成一个跨平台壳
- [[vscodium]] —— VSCodium — 去微软遥测的 VS Code 干净构建
- [[yjs]] —— Yjs — 让任何编辑器都能接的协同编辑内核
- [[zettlr]] —— Zettlr — 学者向 Markdown 编辑器
