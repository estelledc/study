---
title: 'ShareDB — 基于 OT 的实时数据库'
来源: 'https://github.com/share/sharedb'
日期: 2026-05-30
分类: 协同编辑
难度: 中级
---

## 是什么

ShareDB 是一个**把"多人改一份 JSON 文档"做成数据库 API** 的开源后端。日常类比：MongoDB 让你把 JSON 文档存起来再读出来，ShareDB 让你把 JSON 文档**存起来 + 多人同时改 + 自动收敛**——多了一层"实时同步"。

它的核心入口长这样：

```js
const ShareDB = require('sharedb')
const backend = new ShareDB({ db: require('sharedb-mongo')('mongodb://localhost/test') })
const connection = backend.connect()
const doc = connection.get('articles', 'hello')
doc.subscribe(() => {
  doc.submitOp([{ p: ['title'], oi: '你好' }])  // 在 title 路径写入"你好"
})
```

`submitOp` 推送的是一条 **JSON OT 操作**（path + insert/delete），服务端拿到后做 transform、广播给其他订阅者、落库——整套是 [[ot-1989]] 的工程化产物，沿用 [[jupiter-1995]] 的 client-server 简化路径。

## 为什么重要

不理解 ShareDB 这类 OT 后端，下面这些事就说不清：

- 为什么 Google Docs / 飞书文档 早期能在 2010 年代规模化跑——它们走的是同一条 OT 路线，ShareDB 是这条路线的开源代表
- 为什么 [[yjs]] / [[automerge]] 这类 CRDT 后来居上但 OT **没死**——结构化 JSON 文档（不只是文本）OT 仍有优势：op 小、语义清晰、回溯审计直接
- 为什么 Derby / Racer 框架曾是"实时 web"的标杆方案——它的整个数据层就是 ShareDB
- 为什么 [[liveblocks]] 这类 SaaS 出现时大家会拿来对比——它们解决同一个问题（多人改共享状态），但走 LWW（Last-Write-Wins，后写覆盖）+ CRDT 路线，不是 OT

## 核心要点

ShareDB 的运行模型可以拆成 **四层**：

1. **OT Type（操作类型）**：定义"什么是合法的 op"和"两个并发 op 怎么变换"。默认常用 `json0`（路径化 JSON op）；`json1` / `text` / `rich-text` 需另行注册或安装，不是开箱全内置。每种 type 实现 `apply(snapshot, op)` 和 `transform(op1, op2, side)` 两个函数。

2. **Doc（文档单位）**：每个 doc 由 `(collection, id)` 标识，含 snapshot + version。客户端通过 `connection.get('users', 'alice')` 拿到一个 Doc 对象，subscribe 后所有变更自动推过来。

3. **Server-side Transform（服务端权威变换）**：[[jupiter-1995]] 的核心思想——每个 doc 在服务器上有一条线性 op log，新 op 进来时和"当前 version 之后的所有 op"做 transform，得到适用于最新状态的版本。客户端只需和服务器对齐，不用 P2P 协调。

4. **可插拔存储 + 传输**：DB 适配器（`sharedb-mongo` / `sharedb-postgres` / 内存）只要实现 `getSnapshot` / `commit` / `getOps` 三个钩子；传输只要是 duplex stream（默认 WebSocket）。

四层加起来就是 **ShareDB 的全部抽象**——比 [[yjs]] 多一层"权威服务器"，比 [[liveblocks]] 少一层 SaaS 托管。

## 实践案例

### 案例 1：30 行写出"多人共编 todo 列表"

```js
// server.js
const http = require('http')
const WebSocket = require('ws')
const WebSocketJSONStream = require('@teamwork/websocket-json-stream')
const ShareDB = require('sharedb')
const backend = new ShareDB()
const server = http.createServer()
const wss = new WebSocket.Server({ server })
wss.on('connection', ws => backend.listen(new WebSocketJSONStream(ws)))
server.listen(8080)

// client.js
const sharedb = require('sharedb/lib/client')
const ws = new ReconnectingWebSocket('ws://localhost:8080')
const conn = new sharedb.Connection(ws)
const doc = conn.get('todos', 'list')
doc.subscribe(() => {
  if (!doc.type) doc.create({ items: [] })
  doc.on('op', () => render(doc.data.items))
})
function addTodo(text) {
  doc.submitOp([{ p: ['items', doc.data.items.length], li: { text, done: false } }])
}
```

`li` = "list insert"——json0 的指令字典之一。`p` 是路径数组，`['items', 3]` 表示 items 数组的第 3 位。

### 案例 2：JSON OT 的 transform 直觉

两个客户端同时在 `items` 数组的不同位置插入：

- A 在位置 0 插 `{text: 'apple'}` → op_A = `[{p:['items',0], li:{...}}]`
- B 在位置 1 插 `{text: 'banana'}` → op_B = `[{p:['items',1], li:{...}}]`

服务器先收到 A，提交后 version+1。然后收到 B（B 是基于 version 0 的），ShareDB 调 `json0.transform(op_B, op_A, 'right')`：因为 A 在 0 位插了一个，B 的目标位置要 +1 → 变成 `[{p:['items',2], li:{...}}]`。两边收敛。

这就是 [[ot-1989]] 的核心：op 不直接重放，而是**先按已发生的 op 改写自己，再 apply**。

### 案例 3：Presence——传光标位置不落库

```js
const presence = doc.connection.getDocPresence('articles', 'hello')
presence.subscribe()
const local = presence.create('user-alice')
local.submit({ index: 42, length: 5 })  // 选中第 42-47 字符
presence.on('receive', (id, range) => render(id, range))
```

Presence 走同一条 WebSocket，但不进 op log，断开就消失——和 [[liveblocks]] 的 Presence 二分法是一样的设计。

## 踩过的坑

1. **OT type 选错很贵**：`json0` 不能在嵌套结构里安全插入新键 + 同时改它的子键（两个 op 顺序反了会丢数据）；要这种语义就用 `json1`。但 `json1` 生态薄，很多老插件还停在 json0。

2. **服务器是单点权威**：所有 op 必须经过同一个 ShareDB 实例做 transform。多机部署要用 `sharedb-redis-pubsub` 在前面做粘性路由（同一个 doc 总打到同一个进程），否则 transform 顺序乱掉。

3. **MongoDB 后端的 op 集合会膨胀**：每个 doc 的所有历史 op 写到 `o_<collection>`，长期跑下来比 snapshot 大几个数量级。要定期 milestone snapshot + 清理旧 op。

4. **客户端断网重连的 op 缓存有上限**：默认 100 条，超了会被服务器拒绝（version gap 太大），需要重新拉 snapshot。频繁离线场景应改用 [[automerge]] 这类 local-first CRDT。

5. **rich-text type 不是 ShareDB 自带**：要装 `rich-text` OT type（Quill 编辑器使用），它和 json0 不能混在同一个 doc 里。

## 适用 vs 不适用场景

**适用**：

- 结构化 JSON 文档的多人协作（在线表单 / 看板 / 配置编辑器 / 简单文档）
- 需要中央权威 + 完整审计 op 历史的场景（合规 / 撤销重做要精确）
- 已经有 MongoDB / Postgres 的团队，想"加一层实时"而不换数据库
- Derby / Racer 全栈实时 web 应用

**不适用**：

- 纯文本富文本场景（更复杂的 attribution / 长光标） → [[yjs]] 的 YText 工程化更成熟
- local-first / 离线优先 / P2P → [[automerge]]（CRDT 不需要中央服务器）
- 不想自己运维 → [[liveblocks]] 这类 SaaS 直接租
- 高频小 op（每秒上千次） → OT 的 transform 在长 op log 上是 O(n)，CRDT 更扛得住

## 历史小故事（可跳过）

- **2011 前后**：Joseph Gentle 做 ShareJS，把 OT 做成 Node.js 里可嵌入的实时编辑库。
- **2014–2015**：Derby / Racer 把 ShareJS 当数据层；社区开始把「数据库 API + OT」拆成独立后端。
- **约 2015**：ShareDB 从 ShareJS 演进出来，专注服务端 transform、可插拔存储与 WebSocket 传输。
- **此后**：json0 仍是默认主力；Presence、Redis pub/sub 等能力陆续补齐，成为自托管 OT 后端的代表。

## 学到什么

1. **OT vs CRDT 不是谁淘汰谁**——OT 有中央权威 + 结构化 op，CRDT 走最终一致 + 数学收敛，各自占据不同象限
2. **[[jupiter-1995]] 的 client-server 简化** 让 OT 真的能上工业——比 [[ot-1989]] 原始的 N×N transform 容易实现得多
3. **可插拔的存储 + 传输** 是开源中间件的常见姿态——核心算法稳定，外围组件随场景换
4. **op 即审计日志**——OT 系统天然有"谁在什么时候改了什么"的细粒度记录

## 延伸阅读

- 源码：[share/sharedb](https://github.com/share/sharedb)（lib/ot.js 是 transform 入口；lib/agent.js 是 server-side session）
- json0 OT type：[ottypes/json0](https://github.com/ottypes/json0) 看 transform 的 case 分析
- 入门教程：[ShareDB 官方 Counter / Rich-text 例子](https://github.com/share/sharedb/tree/master/examples)
- 对比阅读：[[ot-1989]] —— OT 的原始论文
- 对比阅读：[[jupiter-1995]] —— ShareDB 走的简化路线
- 对比阅读：[[yjs]] / [[automerge]] —— CRDT 路线的对照

## 关联

- [[ot-1989]] —— OT 的奠基论文；ShareDB 的 transform 函数就是它的工程化
- [[jupiter-1995]] —— client-server OT；ShareDB 的服务端权威架构源于此
- [[yjs]] —— CRDT 路线的富文本协同；和 ShareDB 在同一应用层竞争
- [[automerge]] —— local-first JSON CRDT；和 ShareDB 的中央权威路线对立
- [[liveblocks]] —— 协作基建的 SaaS 化；ShareDB 是自托管的同类

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[overleaf]] —— Overleaf — 在线 LaTeX 协作
- [[partykit]] —— PartyKit — Cloudflare Durable Objects 上的实时协作 framework
- [[pouchdb]] —— PouchDB — 浏览器里的 CouchDB
