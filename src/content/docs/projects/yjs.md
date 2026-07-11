---
title: Yjs — 让任何编辑器都能接的协同编辑内核
来源: 'https://github.com/yjs/yjs'
日期: 2026-05-30
分类: 协同编辑
难度: 中级
---

## 是什么

Yjs 是一个**编辑器无关的协同编辑库**——你写的文本、列表、地图，多人同时改不会冲突，断网回来也能自动合并。日常类比：像一群人一起填同一张共享表格，每个人手上都有副本，回来对一下就自动同步好了，没人当裁判。

它的核心是一组"共享数据类型"：`YText`（文本）/ `YArray`（数组）/ `YMap`（键值映射）/ `YXml`（XML 树）。你像操作普通对象一样操作它们，Yjs 在背后把每次改动序列化成二进制 update，发给其他人。

```js
import * as Y from 'yjs'
const doc = new Y.Doc()
const text = doc.getText('content')
text.insert(0, 'hello')        // 你这边
// 别人那边同时插了别的——重连后自动合并不冲突
```

ProseMirror、CodeMirror、Lexical、TipTap、Quill 都能接同一套 Yjs，绑定胶水通常 ≤ 500 行。

## 为什么重要

不理解 Yjs 这类 CRDT 库，下面这些事都没法解释：

- 为什么 JupyterLab、AFFiNE 能做"多人同时编辑、不卡、断网也能写"——底下是 Yjs；Notion / Linear 则用同类 CRDT 或 OT 方案
- 为什么 Google Docs 当年用 OT（Operational Transform，操作变换）那么难写，CRDT 出来后小团队都能做协同
- 为什么 local-first 软件运动（Ink & Switch）反复推 CRDT——它是"先离线、再合并"的数学基础
- 为什么协同编辑很少弹"冲突对话框"——CRDT 保证结构最终一致；两人改同一句时两边都留下，只是不再卡死

## 核心要点

Yjs 的工作机制可以拆成 **三步**：

1. **每个改动有唯一编号（Lamport ID）**：每个客户端有 `clientID`，本地操作计数 `clock`，合起来 `(clientID, clock)` 全局唯一。类比：每人便签写"姓名+第几张"，全世界不会重号。

2. **文档是一条双向链表**：每个字符是一个 `Item`（节点），记住左右邻居。两人同时往同一处插字（并发 / concurrent）时，YATA 算法看"各自锚定的左右邻居 + clientID 谁大"决定谁排前——所有人算出同一顺序。类比：两张便签都夹在同一对邻居之间，按学号大小排。

3. **传输是紧凑二进制**：update 用 9 列按列压缩（client、clock、标记位、字符串、父节点等）。比 JSON 小一个数量级，WebSocket / WebRTC / IndexedDB 都能直接收发。

三步加起来叫 **YDoc 模型**。

## 实践案例

### 案例 1：10 行接好协同富文本

用 y-prosemirror 把 ProseMirror 接到 Yjs：

```js
import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'
import { ySyncPlugin, yCursorPlugin } from 'y-prosemirror'
// EditorView / EditorState 来自 prosemirror-view / prosemirror-state

const ydoc = new Y.Doc()
const provider = new WebsocketProvider('wss://demo', 'room-1', ydoc)
const yXml = ydoc.getXmlFragment('prosemirror')

new EditorView(dom, { state: EditorState.create({
  schema, plugins: [ySyncPlugin(yXml), yCursorPlugin(provider.awareness)]
}) })
```

ProseMirror 不需要知道协同存在——`ySyncPlugin` 双向翻译 ProseMirror transaction 和 Yjs update。

### 案例 2：YArray 做实时白板图层列表

```js
const layers = ydoc.getArray('layers')
layers.observe(event => {
  event.changes.delta.forEach(d => {
    if (d.insert) renderLayers(d.insert)
    if (d.delete) removeLayers(d.delete)
  })
})
layers.push([{ id: 'rect-1', x: 10, y: 20 }])  // 多人同时拖图层不抢锁
```

`observe` 拿到的 `delta` 已经是合并后的最终顺序——CRDT 保证所有客户端 delta 序列等价。

### 案例 3：YMap + IndexedDB 做 local-first 笔记

```js
import { IndexeddbPersistence } from 'y-indexeddb'
const persistence = new IndexeddbPersistence('notes-db', ydoc)
const notes = ydoc.getMap('notes')

await persistence.whenSynced  // 先从本地恢复
notes.set('note-1', { title: '...', body: '...' })
// 离线写、上线自动合并到服务端
```

`y-indexeddb` 把整个 YDoc 存浏览器，断网随便写，重连后跟服务端自动 diff 同步。

## 踩过的坑

1. **改动必须包在 `transact()` 里**：单条调用没事，但同一 tick 多个改动如果不包，会发出多份 update 拖垮性能；用 `ydoc.transact(() => { ... })` 把它们合成一份。

2. **协同光标别存绝对索引**：别人在你前面插了一行，你的 `cursor: 5` 就指错位置了。用 `Y.RelativePosition` 锚定到 `Item`，索引随别人编辑自动跟。

3. **update 是 Uint8Array，不是 JSON**：发送时不能 `JSON.stringify`——会破坏二进制结构。WebSocket 走 `binaryType: 'arraybuffer'`，HTTP 走 base64 或 multipart。

4. **大量离线改动要切片**：堆了几小时改动后单条 update 可能几 MB，WebSocket 单帧打爆。要么 `Y.encodeStateAsUpdate(doc, stateVector)` 增量发，要么手动按 length 切片。

## 适用 vs 不适用场景

**适用**：
- 多人协同富文本 / 代码编辑器（接 ProseMirror / CodeMirror / Lexical）
- local-first app（先离线写，回来自动合并）
- 实时白板 / 看板（图层、卡片这种"列表式"对象）
- P2P 协作（y-webrtc 完全无中心服务器）

**不适用**：
- 强一致性事务（金融账本、库存扣减）→ 用数据库 + 锁
- 需要"操作可审计 / 可撤销到任意点"且要数学证明 → 选 Automerge（论文派，op log 可追溯）
- 极小内存设备（嵌入式 IoT）→ Yjs 的 Item 链表内存开销不低
- 不需要协同的本地 app → 直接用普通对象，别引入 CRDT 复杂度

## 历史小故事（可跳过）

- **2014 年**：Kevin Jahns 在博士期间开始写 Yjs 原型，最初尝试 OT 派实现，发现 transform 函数难写到爆。
- **2016 年**：改用自己提的 **YATA 算法**（RGA 家族双向链表变体），成为 CRDT 派——concurrent insert 冲突有了简洁可证的解。
- **2018 年**：发布 v13，确立 YDoc + YType + Item + UpdateEncoder 的四层架构，性能拉到"编辑器无感"。
- **2020 年起**：被 Linear、JupyterLab、GitBook 等工业项目采用。
- **现在**：GitHub Sponsors 上活跃度最高的 CRDT 项目，Kevin 个人维护接近 9 年。

## 学到什么

1. **协同不必绑死编辑器**——把"共享状态"和"传输 update"切开，编辑器只写薄胶水
2. **CRDT ≠ OT**：CRDT 让 concurrent op 有"天然全序"，不需要中央 transform；代价是数据结构复杂、内存占用高
3. **算法选择决定性能**：YATA 双向链表 vs flat ops vec（Automerge），同样满足公理但工程取舍完全不同
4. **二进制编码很重要**：9 列 column-oriented 比 JSON 小一个数量级，是 Yjs 能在生产用的关键

## 延伸阅读

- 官方文档：[docs.yjs.dev](https://docs.yjs.dev)（API 完整参考 + 教程）
- Kevin 自己讲 YATA：[Yjs internals talk](https://www.youtube.com/watch?v=0l5XgnQ6sB4)（45 min，讲链表 + integrate）
- 与 Automerge 对比：[Martin Kleppmann — CRDTs: The Hard Parts](https://www.youtube.com/watch?v=x7drE24geUw)
- [[crdt-json]] —— Kleppmann 走"flat ops vec"路线，与 Yjs 工程取舍完全相反
- [[prosemirror]] —— y-prosemirror 是 Yjs 富文本最重要的绑定层
- [[codemirror]] —— y-codemirror.next 让协同代码编辑器成为可能

## 关联

- [[crdt-json]] —— 同样满足 CRDT 公理，但用 op log 而不是链表骨干
- [[prosemirror]] —— Yjs 富文本的主力宿主，schema-first 让协同与编辑解耦
- [[codemirror]] —— y-codemirror.next 把协同接进代码编辑器
- [[lexical]] —— Meta 的新一代编辑器框架，也有 y-lexical 绑定
- [[lamport-1978]] —— Lamport 时钟是 Yjs Item ID 的理论基础
- [[paxos-1998]] —— 强一致协议的对比项；CRDT 选了"最终一致"而不是 Paxos 的强一致

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[affine]] —— AFFiNE — 文档和白板共用同一棵 block 树的开源知识库
- [[automerge]] —— Automerge — 让两份 JSON 自动合并的 CRDT 库
- [[codemirror]] —— CodeMirror — 编辑器不是一个类，是一组扩展的合奏
- [[collabora-online]] —— Collabora Online — 浏览器里直接编辑 Office 文档的开源后端
- [[crdt-json]] —— CRDT JSON — 协同编辑 JSON 数据结构
- [[excalidraw]] —— Excalidraw — 手绘风协作白板
- [[hocuspocus]] —— Hocuspocus — 给 Yjs 配一个能直接上线的协作后端
- [[lamport-1978]] —— Lamport 1978 — 分布式系统里没有"绝对的同时"
- [[liveblocks]] —— Liveblocks — 多人协作的托管基础设施
- [[partykit]] —— PartyKit — Cloudflare Durable Objects 上的实时协作 framework
- [[paxos-1998]] —— Paxos 1998 — 古希腊议会寓言里藏的共识协议
- [[pouchdb]] —— PouchDB — 浏览器里的 CouchDB
- [[prosemirror]] —— ProseMirror — schema 先定 DOM 后服从的富文本编辑器框架
- [[sharedb]] —— ShareDB — 基于 OT 的实时数据库

