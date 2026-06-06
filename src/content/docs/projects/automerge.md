---
title: 'Automerge — 让两份 JSON 自动合并的 CRDT 库'
来源: 'https://github.com/automerge/automerge'
日期: 2026-05-30
子分类: 实时通信
分类: 通信
难度: 中级
provenance: pipeline-v3
---

## 是什么

Automerge 是一个 **JSON CRDT 库**——你把它当普通 JSON 对象用，但它能让任意两份副本（即便各自离线改过）**自动合并成同一份**，没有冲突弹窗，也不需要服务器仲裁。日常类比：像两个人各自带着同一份共享笔记本去咖啡馆改，回家把两本本子叠在一起，神奇地拼成一本完整的——任何顺序合都得到同样结果。

它由 Rust 内核 + JS / Swift / Go / Python 绑定组成。最常见的用法：

```js
import * as A from '@automerge/automerge'
let doc = A.from({ todos: [] })                  // 起一份文档
doc = A.change(doc, d => d.todos.push('write'))  // 改它（在闭包里）
const bytes = A.save(doc)                        // 序列化发出去
const merged = A.merge(doc, otherDoc)            // 收到别人的就合并
```

任何调用 `A.change` 都会被记成一串带 Lamport 时间戳的 ops，`A.merge` 只是把两边 ops 取并集 + 重排。

## 为什么重要

不理解 Automerge，下面这些事都说不清：

- 为什么 **local-first software** 这一波（Ink & Switch / Linear / Pixelboard）能做"先离线、再同步"——它就是参考实现
- 为什么 Martin Kleppmann（《DDIA》作者）2017 年发完 JSON CRDT 论文还要再花 7 年写库——把数学落到 100KB JS 包里要解决一堆工程难题
- 为什么 [[yjs]] 和 Automerge 长得像但分两派——Automerge 更"论文派、保历史"，Yjs 更"工程派、更小更快"
- 为什么 [[crdt-json-2017]] 说"嵌套结构能收敛"在 2017 年才证完——之前 10 年都卡在平坦类型（[[crdt-shapiro-2011]] 还是单 set / counter）

## 核心要点

Automerge 的工作机制可以拆成 **三件事**：

1. **每个改动是一条带 ID 的 op**：`A.change(doc, fn)` 里你做的每个赋值 / push / splice，都被记成一个 op，op ID = `(Lamport 时钟, actor id)`。类比：每个人的便签写"自己名字 + 第几张"，全世界不会重号。

2. **合并 = 取并集 + 按 ID 排序**：`A.merge(a, b)` 不需要"谁赢谁输"，只是把两边的 op 集合并起来，按 ID 全序重放——所有副本算出同样的最终状态。这就是 CRDT 的"无冲突"数学根，和 [[logoot-2010]] 用稠密位置标识保证全序是同一思路。

3. **传输是 column-oriented 二进制**：2.0 版本把 op log 按列压缩（actor 列 / clock 列 / 值列分开），大文档加载提速 50x。比纯 JSON 小一个数量级，IndexedDB / WebSocket / 文件系统都能直接落。

三件事加起来叫 **Automerge 文档模型**。

## 实践案例

### 案例 1：两份副本各自改、合并后一致

```js
import * as A from '@automerge/automerge'

let alice = A.from({ title: 'draft', tags: ['a'] })
let bob   = A.clone(alice)

// 各自离线改
alice = A.change(alice, d => { d.title = 'final'; d.tags.push('b') })
bob   = A.change(bob,   d => { d.tags.unshift('z'); d.tags.push('c') })

// 重连后任一方收到对方都能合
const merged = A.merge(alice, bob)
console.log(merged)
// { title: 'final', tags: ['z', 'a', 'b', 'c'] }   两人都得到这个
```

不论谁先收谁，最终结构 100% 一样——论文证明过的"强最终一致性"。

### 案例 2：增量同步而不是发整个文档

```js
const changes = A.getChanges(oldDoc, newDoc)   // 拿到这次的增量
sendOverWebsocket(changes)                     // 只发增量
// 对面：
const updated = A.applyChanges(localDoc, changes)
```

更进一步用 sync protocol（基于 Bloom filter）让两端**只发对方缺的 op**——大文档断网重连后秒回。

### 案例 3：用 automerge-repo 一行接好持久化 + 网络

```js
import { Repo } from '@automerge/automerge-repo'
import { IndexedDBStorageAdapter } from '@automerge/automerge-repo-storage-indexeddb'
import { BrowserWebSocketClientAdapter } from '@automerge/automerge-repo-network-websocket'

const repo = new Repo({
  storage: new IndexedDBStorageAdapter(),
  network: [new BrowserWebSocketClientAdapter('wss://sync.example')],
})
const handle = repo.create({ todos: [] })
handle.change(d => d.todos.push('first'))   // 自动落盘 + 自动同步
```

## 踩过的坑

1. **保留所有历史 = 文档会涨**：Automerge 默认保所有 op，方便做历史回放、time travel。但长寿文档可能涨到几百 KB。`A.save` 会做 GC 删去被覆盖的内容，但 op 元数据还在——大文档场景要权衡。

2. **`A.change` 闭包里只能改、不能读外部状态**：闭包里 `d.todos.push(externalVar)` 没问题，但 `if (d.todos.length > otherDoc.length)` 这种跨文档比较会让 op 不可重放。规则：闭包里**纯函数式只看 d**。

3. **数组 splice 在并发场景顺序不一定符合直觉**：A 在 index 2 插 X，B 同时在 index 2 插 Y。合并后 X 和 Y 都在那位置附近，但谁前谁后由 ID 决定，不是"先到先得"。要"我说了算"语义就别用 CRDT。

4. **Rust 内核 + WASM 体积**：浏览器里 automerge-wasm 大约 200KB gzip，移动端首屏要算进预算。

## 适用 vs 不适用场景

**适用**：

- local-first 应用：先离线写、后台同步——笔记 / todo / 看板 / 白板 / RPG 战报
- 多设备同一用户：手机改、电脑改、回头自动合
- 端到端加密协同：服务器只转发密文 op，无法解密内容
- 需要审计 / 时间旅行 / undo 的产品（op log 自带历史）

**不适用**：

- 强一致 + 唯一仲裁场景（银行余额 / 库存扣减）→ 用 [[crdt-shapiro-2011]] 都不合适，要中心化事务
- 文档极大且改动频繁（GB 级日志） → op log 会拖垮内存
- 需要服务器端聚合查询 → CRDT 是端侧合并，不是 SQL
- 不能容忍 200KB WASM 的极端瘦身场景 → 看 [[yjs]] 或 Loro

## 历史小故事（可跳过）

- **2017**：Kleppmann & Beresford 发 [[crdt-json-2017]]，证明任意嵌套 JSON 可 CRDT。论文派的奠基。
- **2018**：第一版 Automerge 发布，纯 JS 实现。能跑，但大文档慢、内存涨。
- **2020**：Ink & Switch 发"local-first software"宣言，Automerge 被点名为参考实现。
- **2022**：Automerge 2.0 把核心改写成 Rust，JS 通过 WASM 调用——加载 50x 提速、内存掉一个数量级。
- **2023-2025**：automerge-repo 套件成熟（存储 + 网络 + 文档发现），社区开始有 SwiftUI / SolidJS / React 绑定。

之后这条线还在继续——CRDT 怎么和富文本编辑器（ProseMirror / Lexical）做更精细的协同、怎么处理 schema migration，是 2026 年正在解的题。

## 学到什么

1. **CRDT 不是某个数据结构，是一类合并规则**——只要满足"交换 + 幂等 + 结合"，副本怎么交换 op 都收敛
2. **op log + Lamport 时钟** 是 local-first 的两根骨头：log 让历史可回放，时钟让顺序可全序化
3. **论文 → 库 → 套件**：2017 论文是数学，2018 库是数学到代码，2022 重写是代码到工程，2023 套件是工程到产品。每一步都隔几年。
4. **协同不一定要服务器**：服务器只是"消息中继"，合并发生在端侧——这是 local-first 和 Google Docs 模型的本质区别

## 延伸阅读

- 官方教程：[Automerge 文档站](https://automerge.org/docs/) —— 从 hello world 到 sync protocol 都有
- Kleppmann 讲座：[CRDTs: The Hard Parts](https://www.youtube.com/watch?v=x7drE24geUw) —— 一小时把"为什么这么难"讲透
- Ink & Switch 宣言：[Local-First Software](https://www.inkandswitch.com/local-first/) —— 解释 Automerge 为何而生
- [[crdt-json-2017]] —— Automerge 的理论根
- [[yjs]] —— 同赛道工程派代表，对比着读

## 关联

- [[crdt-json-2017]] —— 论文证 CRDT 收敛，Automerge 是它的官方参考实现
- [[crdt-shapiro-2011]] —— CRDT 概念奠基论文，平坦类型起步
- [[logoot-2010]] —— 早期文本 CRDT，用稠密位置标识保证全序，与 Automerge 列表合并思路同根
- [[yjs]] —— 同为 JSON CRDT 库，工程派对照组

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[collabora-online]] —— Collabora Online — 浏览器里直接编辑 Office 文档的开源后端
- [[crdt-shapiro-2011]] —— CRDT — 让多副本各改各的，最终自动合一
- [[liveblocks]] —— Liveblocks — 多人协作的托管基础设施
- [[logoot-2010]] —— Logoot — 给每个字符发一张"永不过期的座位号"
- [[partykit]] —— PartyKit — Cloudflare Durable Objects 上的实时协作 framework
- [[pouchdb]] —— PouchDB — 浏览器里的 CouchDB
- [[sharedb]] —— ShareDB — 基于 OT 的实时数据库
- [[yjs]] —— Yjs — 让任何编辑器都能接的协同编辑内核

