---
title: ProseMirror — schema 先定 DOM 后服从的富文本编辑器框架
来源: 'https://github.com/ProseMirror/prosemirror'
日期: 2026-05-30
分类: 编辑器
难度: 高级
---

## 是什么

ProseMirror 是 Marijn Haverbeke 写的**富文本编辑器框架**——不是开箱即用的编辑器组件，是一套让你**自己定义文档结构**再让浏览器服从的协议。日常类比：像办报纸排版——主编先定"标题字号 + 段落间距 + 引文格式"的版式规则，作者写稿子时只能在版式里填内容，不能擅自加一种新格式。

浏览器里有个原生 API 叫 contentEditable：给任意 div 加 `contenteditable="true"`，用户就能在里面输入和粘贴。问题是它**没规矩**——用户粘进来一段 Word 文本，浏览器自己生成一堆 `<font>` 和嵌套到第六层的 `<span>`，谁也保证不了文档结构合法。

ProseMirror 的反转是：**你先用 schema 声明合法形态**（"段落里只能有文本和加粗，标题只能有文本不能有加粗"），然后**任何编辑都被拆成 Step 序列**——每一步都能 apply、能 invert（撤销）、能 map（远端来的 step 重新对齐到本地最新位置）。Tiptap、Atlassian Editor、The New York Times、早期 Notion 都站在它上面。

## 为什么重要

不理解 ProseMirror，下面这些事都没法解释：

- 为什么 Notion / Atlassian / Linear 这种富文本能做协同编辑，但很多自研编辑器加协同就崩——Step 抽象让 rebase 几乎免费
- 为什么 Tiptap 不自己重写一个编辑器内核——因为重写就要重新证明 schema 约束、协同 rebase、undo/redo 全都不出 bug
- 为什么 Slate.js 文档看着更友好但生产环境踩坑更多——它直接 patch DOM，没有 Step 这层抽象
- 为什么 contentEditable 二十年了还没被一个"更好的 API"取代——浏览器知道它有问题但没人提得出更好的替代

## 核心要点

ProseMirror 的设计可以拆成 **三件抽象**：

1. **Schema（合法形态判定器）**：你声明"什么节点能套什么节点"——doc 里能有 paragraph 和 heading，paragraph 里能有 text 和加粗 mark，heading 里只能有 text。类比：办报纸的版式手册，违反规则的内容直接被拒。

2. **Step（原子修改的语法）**：每一次编辑——插入字符、删除一段、加粗一个词——都是一个 Step 对象。它必须实现三件事：apply（在文档上执行）、invert（生成反向 step 用于 undo）、map（把自己重新对齐到一个新的位置链上）。类比：会计分录，每一笔都能正向记和反向冲。

3. **State + View（不可变快照 + 浏览器薄壳）**：State 是某一刻的完整文档 + 选区 + plugin 状态，不可变。View 把当前 State 渲染到一块 contentEditable，并用 MutationObserver 捕获浏览器对 DOM 的偷改，把它翻译回 Step。类比：React 的 state + render，但加了一层"浏览器在偷偷改 DOM 我得抓回来"的反向通道。

三件抽象合起来的效果：协同编辑不是后挂的功能，是 Step 抽象的副产品——远端发来的不是 DOM 而是 Step 序列，本地把它 map 过自己最近的 step 链，就能干净 apply。

## 实践案例

### 案例 1：最小可用的段落编辑器

```ts
import { Schema } from 'prosemirror-model'
import { EditorState } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'

const schema = new Schema({
  nodes: {
    doc: { content: 'paragraph+' },
    paragraph: { content: 'text*', toDOM: () => ['p', 0] },
    text: {},
  },
})

const state = EditorState.create({ schema })
new EditorView(document.querySelector('#editor'), { state })
```

**逐部分解释**：

- `content: 'paragraph+'` 是 content 表达式——doc 里必须有至少一个 paragraph
- `toDOM: () => ['p', 0]` 告诉 ProseMirror 怎么把 paragraph 渲染成 DOM，0 是子节点占位符
- 没传 dispatch 也能跑，但用户的输入会被直接吃掉——下一个案例补上

### 案例 2：自己写一个 ReplaceStep 看三件套

```ts
import { ReplaceStep } from 'prosemirror-transform'
import { Slice } from 'prosemirror-model'

// 在位置 5 处插入一段 slice
const step = new ReplaceStep(5, 5, slice)
const result = step.apply(doc)        // 得到新 doc
const inverse = step.invert(doc)      // 得到撤销 step
const remapped = step.map(otherMap)   // 远端到来时重新对齐位置
```

**逐部分解释**：

- `apply` 在旧 doc 上跑得到新 doc，旧 doc 不变（immutable）
- `invert` 给 history plugin 用，撤销时把 inverse 反过来 apply 一次
- `map` 是协同编辑的灵魂——本地刚 typed 了几个字，远端发来一个 step，map 让远端 step 的位置自动避开本地的新字

### 案例 3：协同编辑的最小骨架

```ts
import { collab, sendableSteps, receiveTransaction } from 'prosemirror-collab'

const state = EditorState.create({ schema, plugins: [collab()] })
// 本地有未提交 step 时
const sendable = sendableSteps(state)
if (sendable) socket.send(JSON.stringify(sendable.steps))
// 远端来 step 时
socket.on('message', steps => {
  view.dispatch(receiveTransaction(view.state, steps, clientIds))
})
```

**逐部分解释**：

- `collab()` plugin 帮你管 step version 号和未确认 step 队列
- `sendableSteps` 拿出本地未确认的 step 发到服务端
- `receiveTransaction` 把远端 step 应用到本地——内部会 rebase 本地未确认 step

## 踩过的坑

1. **schema content 表达式 'inline*' 和 'inline+' 行为差异巨大**——前者允许空段落，后者不允许，编辑空段落时表现完全不同
2. **协同编辑不能直接发 DOM diff**——Slate.js 的设计在并发删除+插入场景会让两端文档分裂，必须走 Step 序列化
3. **View 层 contentEditable 兼容性是永远的苦活**——Safari shadow root、Chrome IME、Firefox space-eaten 各自要专门补丁，看 prosemirror-view 的 commit 历史就知道
4. **自定义 NodeView 忘了 update / destroy 会内存泄漏**——React 包装层尤其容易出现 stale closure，每次 dispatch 都把旧组件留在内存里

## 适用 vs 不适用场景

**适用**：

- 需要协同编辑的富文本（Notion / Atlassian / Linear 这类）——Step 抽象天然适配 OT/CRDT
- 文档结构需要强约束的场景——医疗病历、法律合同、技术写作工具
- 已经有自己的 schema 设计且不愿被现成编辑器锁死的团队
- 需要可预测的 undo / redo 行为——Step.invert 让历史栈干净

**不适用**：

- 只需要简单评论框 / 帖子输入框——直接 textarea 或 contentEditable 即可，ProseMirror 上手成本太高
- 团队没人能维护 schema 和 plugin——这是个框架不是组件，必须自己写胶水
- 需要 React/Vue 风格 declarative API——直接用 [[tiptap]] 这种包装层
- 富文本但完全没有结构（如纯日记本无格式）——Lexical 或纯 markdown 编辑器更轻

## 历史小故事（可跳过）

- **2013 年**：Marijn Haverbeke 已经在维护 CodeMirror，意识到富文本场景需要类似的"plugin + immutable state"范式
- **2014-2016 年**：ProseMirror 雏形迭代，2016 年发布首个稳定版本，分成 6 个独立 npm 包
- **2018 年**：全面 TypeScript 重写
- **2020 年**：Tiptap v2 在它之上做 React/Vue 包装，让前端开发者能用而不是只有编辑器专家能用
- **2022 年**：Atlassian 把内部 Editor 抽出来公开发布，证明它能扛超大型 SaaS 的复杂需求

## 学到什么

- **schema 先定 DOM 后服从**是反直觉但威力巨大——把"我接受任何 DOM"反过来变成"DOM 必须满足 schema"，整套约束链就稳了
- **协同编辑应该是 Step 抽象的副产品而不是后挂功能**——任何先做编辑器再加协同的项目都会被并发场景反噬
- **immutable + apply/invert/map 三件套**是事件溯源思想在富文本场景的一次成功落地
- **bus factor 的现实**：核心维护者一个人（Marijn）同时挑 CodeMirror、Lezer、ProseMirror，重要项目要警惕单点依赖

## 延伸阅读

- 官方文档：[ProseMirror Guide](https://prosemirror.net/docs/guide/)（最权威，作者亲笔，但学术腔重）
- 作者博客：[The Architecture of ProseMirror](https://marijnhaverbeke.nl/blog/prosemirror.html)（30 分钟讲完整体设计哲学）
- 视频：[ProseMirror Deep Dive](https://www.youtube.com/results?search_query=prosemirror+deep+dive)（社区讲座，多个版本可选）
- [[codemirror]] —— 同作者的代码编辑器，分包思路一脉相承
- [[tiptap]] —— ProseMirror 的 React/Vue 包装层，多数前端真正在用的是它

## 关联

- [[codemirror]] —— 同作者的代码编辑器，6 包架构和 plugin 范式如出一辙
- [[tiptap]] —— ProseMirror 上层包装，让 React/Vue 项目零成本接入
- [[lezer]] —— 同作者的增量语法分析器，CodeMirror 6 用它做高亮，思路上和 ProseMirror 的 ContentMatch DFA 互通
- [[slate-js]] —— 设计上的反面教材：直接 patch DOM 没有 Step 抽象，协同场景吃亏
- [[lexical]] —— Meta 写的新一代富文本框架，借鉴了 ProseMirror 的不可变思路但 API 更 declarative

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
