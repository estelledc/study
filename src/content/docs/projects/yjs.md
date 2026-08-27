---
title: Yjs — 让任何编辑器都能接的协同编辑内核
来源: https://github.com/yjs/yjs
日期: 2026-08-27
分类: 协同编辑
难度: 中级
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/yjs/yjs
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 1ce38f75f786e4bc0b2cc9703afbc6eea8fe7859
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 13.6.32
---

## 是什么

Yjs 是一个 **编辑器无关的 CRDT 内核**：文本、数组、映射、XML 都挂在同一份 `Y.Doc` 上，多人同时改、断网再合，靠类型自己收敛。日常类比：每人手里一份表格副本，改完对一下就齐，没有裁判。

固定 `yjs@13.6.32` 的共享类型是 `YText` / `YArray` / `YMap` / `YXmlElement` / `YXmlFragment`（导出别名 `Text` / `Array` / `Map` / …）。你像操作集合一样改它们，库把改动编成 `Uint8Array` update：

```js
import * as Y from "yjs"

const doc = new Y.Doc()
const text = doc.getText("content")
text.insert(0, "hello")
const update = Y.encodeStateAsUpdate(doc)
```

`getText` 等是 `Doc.get(name, TypeConstructor)` 的糖。同名再用不同构造器会抛 “already been defined with a different constructor”。`y-websocket` / `y-prosemirror` / `y-indexeddb` 不在本仓。

## 为什么重要

不按 13.6.32 读源码，下面这些旧说法会偏：

- 为什么 Jupyter / 各类编辑器绑定能共用一个内核——本仓只给 `Y.Doc` 和类型，传输与编辑器胶水在别的包
- 为什么 Google Docs 式 OT 难写，CRDT 小团队也能做协同——`Item#integrate` 用 origin / originRight 做就地全序
- 为什么光标不能存绝对下标——要用 `createRelativePositionFromTypeIndex`
- 为什么装了两个 Yjs 副本会“算法坏掉”——`index.js` 用全局标记做 constructor 检查
- 为什么现在不能把 v14 当默认——同仓已有 `v14.0.0-rc.*`，本文只绑稳定 13.6.32

## 核心架构与流程

固定源码把协同拆成五层：

1. **ID(client, clock)**：`generateNewClientId` 来自 `lib0/random.uint32`。clock 只随插入走；删除不占 clock，而是 DeleteSet + Item 上的 deleted 位。

2. **Item 是双向链表节点**：`left` / `right` 是文档序，`origin` / `rightOrigin` 记住插入时的左右锚。连续同 client 字符可挤进一个 Item，中途删除会拆开。

3. **integrate 是 YATA 判定**：并发插在同一位置时，扫冲突项；同 origin 则 `client` 较小者靠左。`INTERNALS.md` 指向 2016 YATA 论文，并说明 `originRight` 是实现里的补充。

4. **update 分 V1 / V2**：默认 `encodeStateAsUpdate` / `applyUpdate` 走 V1。V2 把 keyClock、client、left/right clock、info、string、parentInfo、typeRef、len 九列分开编，再追加 rest。`Doc` 同时发 `update` 与 `updateV2`。

5. **事务默认自动开**：单次 `insert` / `push` / `set` 内部也会 `transact`。显式 `ydoc.transact(() => { ... })` 把多步合成一次 observer 和一条 update。`gc` 默认 `true`。

## 实践示例

### 案例 1：两份文档交换 V1 update

```js
import * as Y from "yjs"

const a = new Y.Doc()
const b = new Y.Doc()
a.getText("content").insert(0, "hello")
Y.applyUpdate(b, Y.encodeStateAsUpdate(a))
```

`encodeStateAsUpdate(doc, stateVector)` 可只发对方缺的 struct。`applyUpdate` 第三个参数会写到 `transaction.origin`。V2 必须成对使用 `encodeStateAsUpdateV2` / `applyUpdateV2`。

### 案例 2：YArray 观察 delta

```js
const layers = doc.getArray("layers")
layers.observe(event => {
  for (const d of event.changes.delta) {
    if (d.insert) { /* 新增项 */ }
    if (d.delete) { /* 删除长度 */ }
  }
})
layers.push([{ id: "rect-1", x: 10, y: 20 }])
```

`push` 的参数是 **数组**，不是单个元素。`event.delta` 是 `event.changes.delta` 的别名；`YEvent` 写明必须在回调里读，事后再算可能错。

### 案例 3：相对位置而不是下标

```js
const text = doc.getText("content")
text.insert(0, "hello")
const rel = Y.createRelativePositionFromTypeIndex(text, 2)
text.insert(0, "ab")
const abs = Y.createAbsolutePositionFromRelativePosition(rel, doc)
```

`RelativePosition` 锚在 Item / 类型名上，可带 `assoc`。绝对下标会随前方插入漂移。

## 踩过的坑

1. **项目里出现两个 Yjs 副本**：`index.js` 会 `console.error`，`instanceof GC` 一类检查失效。
2. **`array.push(item)` 当原生数组用**：签名是 `push(content: Array<T>)`。
3. **同一 tick 多次改却不包 `transact`**：每次都会独立提交；要合成一条 update 就显式开事务。
4. **光标存 `5`**：别人在前面插入后下标失效，用相对位置。
5. **把 `y-websocket` / IndexedDB provider 写成这个 tag 的 API**：本仓只保证 `Doc`、类型和 update 编解码。

## 适用 vs 不适用场景

**适用**：

- 给 ProseMirror / CodeMirror / Lexical 接一层薄绑定，状态留在 `Y.Doc`
- 先离线写、再用 `encodeStateAsUpdate` / provider 合并
- 列表或映射式白板对象，用 `observe` 的 delta 重绘

**不适用**：

- 需要中心事务和唯一余额的账本
- 必须把每次删除的“谁、何时”留成可审计日志——删除不增 clock，内容在 `gc` 下可被 `GC` 替换
- 把 v14 RC 或未绑定的绑定包性能数字当 13.6.32 合同
- 本页没有运行编辑器或网络 provider

## 固定版本边界

- 本文绑定 `yjs/yjs@1ce38f75f786e4bc0b2cc9703afbc6eea8fe7859`。annotated tag `v13.6.32` 解引用到该提交，与 npm `yjs@13.6.32` 的 `gitHead` 一致。
- `package.json`：`license` MIT，`engines.node >= 16`，依赖 `lib0 ^0.2.99`。
- 访问当日同仓已有 `v14.0.0-rc.24`，未绑定。
- `UndoManager`、`Snapshot`、`PermanentUserData` 只确认导出，未走测试。
- 未安装依赖、未跑 `npm test` / rollup，状态保持 `UNVERIFIED`。

## 学到什么

1. **共享类型和传输字节必须切开**——本仓不绑编辑器，也不绑 WebSocket。
2. **YATA 的全序写在 `Item#integrate`，不在中央 transform**。
3. **默认 update 是 V1**——V2 的九列编码要成对调用。
4. **删除是状态型 CRDT**——和插入的顺序 ops 不是同一套记账。

## 应用型自测

1. `ydoc.get("t", Y.Array)` 之后再 `ydoc.get("t", Y.Map)` 会怎样？
2. `layers.push({ id: 1 })` 符合 13.6.32 的签名吗？
3. `Y.encodeStateAsUpdate(doc)` 默认是 V1 还是 V2？

检查点：

1. 抛错。同名类型已被另一构造器占用。
2. 不符合。`push` 要数组，应写 `push([{ id: 1 }])`。
3. V1。V2 入口是 `encodeStateAsUpdateV2`。

## 延伸阅读

- 文档：[docs.yjs.dev](https://docs.yjs.dev)
- 固定源码：[yjs/yjs](https://github.com/yjs/yjs) —— 本文绑定提交 `1ce38f75f786e4bc0b2cc9703afbc6eea8fe7859`
- 仓内说明：`INTERNALS.md`（YATA、Item、DeleteSet）
- [[automerge]] —— 不可变文档 + change log 对照
- [[lamport-1978]] —— ID 所用 Lamport 时钟的理论根

## 关联

- [[automerge]] —— 不可变快照 / OpId / Bloom sync vs 可变类型 / update
- [[prosemirror]] —— 常见宿主；绑定细节以对应包为准
- [[codemirror]] —— 代码编辑器绑定在独立包
- [[lexical]] —— 另一编辑器宿主
- [[crdt-json-2017]] —— 嵌套 JSON CRDT 的另一条实现线
- [[sharedb]] —— OT 对照

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[crdt-json]] —— CRDT JSON — 协同编辑 JSON 数据结构
- [[crdt-json-2017]] —— CRDT JSON 2017 — 给嵌套 JSON 一套有数学证明的合并算法
- [[affine]] —— AFFiNE — 文档和白板共用同一棵 block 树的开源知识库
- [[anytype-ts]] —— Anytype — 本地优先块编辑器
- [[automerge]] —— Automerge — 让两份 JSON 自动合并的 CRDT 库
- [[codemirror]] —— CodeMirror — 编辑器不是一个类，是一组扩展的合奏
- [[collabora-online]] —— Collabora Online — 浏览器里直接编辑 Office 文档的开源后端
- [[etherpad-lite]] —— Etherpad — 经典协作文本编辑器
- [[excalidraw]] —— Excalidraw — 手绘风协作白板
- [[hedgedoc]] —— HedgeDoc — 协作 Markdown 编辑
- [[hocuspocus]] —— Hocuspocus — 给 Yjs 配一个能直接上线的协作后端
- [[liveblocks]] —— Liveblocks — 多人协作的托管基础设施
- [[outline]] —— Outline — 团队 Wiki 协作平台
- [[overleaf]] —— Overleaf — 在线 LaTeX 协作
- [[partykit]] —— PartyKit — Cloudflare Durable Objects 上的实时协作 framework
- [[plane]] —— Plane — 开源版 Linear/Jira，把任务、冲刺和协同文档放进自己的机器
- [[pouchdb]] —— PouchDB — 浏览器里的 CouchDB
- [[sharedb]] —— ShareDB — 基于 OT 的实时数据库
- [[silverbullet]] —— SilverBullet — 自托管笔记 web 应用
- [[tldraw]] —— tldraw — 把白板做成可嵌入的 SDK
