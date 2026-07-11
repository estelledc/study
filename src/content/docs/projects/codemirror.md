---
title: CodeMirror — 编辑器不是一个类，是一组扩展的合奏
来源: 'Marijn Haverbeke, "The Architecture of CodeMirror 6", marijnhaverbeke.nl 2018'
日期: 2026-05-29
分类: 前端
难度: 高级
---

## 是什么

CodeMirror 6 是一个**让你拼出自己的代码编辑器**的 JavaScript 库。日常类比：它不像微波炉（按一个按钮就能用），更像乐高（你拿一组零件，自己拼出想要的形状）。

你写网页里的"代码块编辑器"——比如 Replit 那种在线 IDE，或者 Sourcegraph 的浏览代码界面——CodeMirror 提供编辑器的**底盘**：光标、选区、撤销、滚动；至于行号、语法高亮、自动补全这些"特性"，每一个都是单独的 npm 包，按需装。

这个设计在 2018 年的第 6 版彻底重写后才成立。第 5 版以前，所有特性都缝在一个叫 `CodeMirror` 的大类上，加新功能要改它的内部。

## 为什么重要

不理解 CodeMirror 6，下面这些事都没法解释：

- 为什么 50 KB 的 JS 库能撑起 Replit / Sourcegraph / Sentry 这种几百万行代码的在线编辑器
- 为什么 Monaco（VS Code 内核）开箱即用却 600 KB，CodeMirror 复杂却能压到 50 KB——架构哲学差在哪
- 为什么"不可变状态"这个看起来反直觉的设计，反而让协同编辑、撤销重做、语法树缓存都变简单
- 为什么"插件"在 CodeMirror 不是函数注册，而是一种**数据流声明**

## 核心要点

1. **不可变状态内核**：每次编辑产生一个新的 `EditorState`，旧的不变。类比拍立得照片——按一次快门出一张新照片，旧照片还在。这让"撤销"只是把指针指回旧 state，"协同编辑"只是把别人的编辑指令在自己的 state 上重放一遍。

2. **Facet：每个特性是数据流的一个节点**。Facet 是带名字的"插槽"，多个插件往同一个插槽塞值，框架按规则合并。类比公司的意见箱——每个员工都能投，HR 按规则汇总。`tabSize` facet 取第一个非空值，`keymap` facet 把所有键位列表 flat 成一个。

3. **Lezer 增量解析**：编辑代码时不重新解析整个文件，只解析变化的那段。类比修一座房子——换一扇窗不用拆重盖。这是为什么超长文件打开瞬间高亮不卡的根本原因。

三个机制合起来叫 "extension-first architecture"：编辑器本身只有几百行，所有功能是组合上去的扩展。

## 实践案例

### 案例 1：30 行写一个能用的 IDE

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

打开浏览器：行号、语法高亮、Ctrl-Z 撤销、Ctrl-Space 补全全有。**没用一个 React/Vue 组件**——CodeMirror 自己管 contentEditable 的 DOM。

### 案例 2：自定义 Facet 计算实时词数

```ts
import { Facet } from "@codemirror/state"

const wordCount = Facet.define<number, number>({
  combine: values => values.reduce((a, b) => a + b, 0),
})

const wordCountFromDoc = wordCount.compute(["doc"], state =>
  state.doc.toString().split(/\s+/).filter(Boolean).length
)
```

把 `wordCountFromDoc` 加到 extensions，任何插件调 `state.facet(wordCount)` 都能拿到当前词数。`["doc"]` 是依赖声明：文档变才重算，光标移动不会重算——和 React `useMemo` 的 deps 数组同一思路。

### 案例 3：监听所有变更的日志插件

```ts
import { ViewPlugin, ViewUpdate } from "@codemirror/view"

const logUpdates = ViewPlugin.fromClass(class {
  update(u: ViewUpdate) {
    if (u.docChanged) console.log("doc:", u.changes.toJSON())
    if (u.selectionSet) console.log("sel:", u.state.selection.main.from)
  }
})
```

把 `logUpdates` 加进 extensions，输入 / 撤销 / 选区移动都会打印。**所有 view 状态变更走同一条 update 流水线**——这是 CodeMirror 6 设计纪律的精华。

## 踩过的坑

1. **Facet 用 `===` 比较 object 永远不等**：写 `combine` 返回对象但没传 `compare`，框架默认 `===` 比较，每次更新都重算下游——性能杀手，要传 `compare: (a, b) => deepEqual(a, b)`。

2. **多版本 `@codemirror/state` 共存会静默崩**：Facet 内部用模块级 `nextID++` 做全局计数，两次模块加载会产生两个不同 id 的"同名" Facet——provider 加到一个，reader 读另一个，全是默认值，不报错。必须用 npm dedupe 强制单实例。

3. **不可变写法的性能旋钮要手调**：`StateField.define({ update: (val, tr) => ... })` 里频繁返回新对象会触发 GC 抖动。要么手写 `if (!changed) return val` 早退，要么用结构共享。

4. **Lezer 写新语言不友好**：要给某个新语言加高亮，必须写 Lezer 自家的语法 DSL（不是 BNF / PEG），学习成本独立于 CodeMirror 本身。绝大多数项目直接用 `lang-javascript` / `lang-python` 等现成包就够。

## 适用 vs 不适用场景

**适用**：

- 跨框架嵌入式代码编辑器（Replit / Sourcegraph / 在线 IDE / 评论里的代码块）
- 需要极致包大小的场景——50 KB 核心，按需加扩展
- 需要深度定制：自定义补全源、自定义高亮、协同编辑

**不适用**：

- 需要"开箱即用"的完整 IDE 体验，团队接受 600 KB 包 → 用 [[monaco-editor]]
- 富文本编辑器（文档 / 笔记应用） → 用 [[prosemirror]] / [[lexical]]，CodeMirror 文档模型只是纯文本 + 语法树，没有"段落 / 图片块 / 链接节点"语义
- 老项目维护，没动力重写 → 留在 Ace 或 CodeMirror 5

## 历史小故事（可跳过）

- **2007 年**：Marijn Haverbeke（荷兰程序员）写出 CodeMirror 1，最早是给 Eloquent JavaScript 教程做的代码运行器
- **2014 年**：CodeMirror 5 发布，成为 GitHub 在线编辑、Chrome DevTools、Brackets 等工具的事实标准
- **2018 年**：Marijn 发表 The Architecture of CodeMirror 6，宣布完全重写——v5 的 god class 已经被各种 monkey-patch 缝满，加新功能撑不住
- **2021 年**：CodeMirror 6 正式发布，拆成 7 个独立 npm 包，TypeScript 100% 重写
- **2026-04-15**：Marijn 把所有仓库从 GitHub 迁到自建的 `code.haverbeke.berlin`——为脱离 issue 噪音，不是项目死了，仍在活跃维护

## 学到什么

1. **架构靠"协议"而不是"实现"**：CodeMirror 6 没有"完整功能"，只定义了 Facet / Transaction / Extension 三个协议，功能由社区往协议上长出来——这种"留接口不留实现"的纪律比"框架 vs 库"区分更深一层

2. **不可变 + 数据流 ≠ 性能差**：直觉上"每次产生新对象很慢"，但加上结构共享 + facet 依赖跟踪 + 增量重算，CodeMirror 处理 10 万行文件比许多 mutable 编辑器还快

3. **单一更新通道是可观测性的前提**：所有 view 状态变更走 `update(u: ViewUpdate)` 一个回调，加 logger / debugger / undo / collab 都在同一个口子接，比散落在 N 个 setState 容易追

4. **bus factor 和"个人主导"不是反义词**：Marijn 一个人维护 CodeMirror + ProseMirror + Lezer 二十年，靠的是把核心做小、把扩展开放给社区——是个人开源项目长期存活的可复用模式

## 延伸阅读

- 设计哲学一手描述：[Marijn Haverbeke — The Architecture of CodeMirror 6](https://marijnhaverbeke.nl/blog/codemirror-6.html)
- 官方系统教程：[CodeMirror System Guide](https://codemirror.net/docs/guide/)（按 EditorState / Extension / Facet 顺序讲）
- React 集成包：[react-codemirror](https://github.com/uiwjs/react-codemirror)（在 React 项目里嵌入的最短路径）
- 视频教程：YouTube 搜 "CodeMirror 6 tutorial"，挑 freeCodeCamp / Fireship 的版本
- [[monaco-editor]] —— 直接竞品，VS Code 内核切下来一块
- [[prosemirror]] —— 同一作者的富文本兄弟项目

## 关联

- [[monaco-editor]] —— 同领域，包大但开箱即用，哲学相反
- [[lexical]] —— 同样 immutable + composition 哲学，但 React-first
- [[prosemirror]] —— 同作者，富文本版，Transaction / Plugin 系统几乎一致
- [[shiki]] —— 静态高亮库，CodeMirror 在线版的"只读对照组"
- [[yjs]] —— 协同编辑 CRDT，CodeMirror 协同方案直接基于它
- [[react]] —— 用 react-codemirror 包装即可嵌入
- [[vite]] —— 配套的 dev server，跑 toy 项目首选

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
