---
title: PouchDB — 浏览器里的 CouchDB
来源: https://github.com/pouchdb/pouchdb
日期: 2026-05-31
分类: 数据库 / 离线优先
难度: 中级
---

## 是什么

PouchDB 是 **CouchDB 复制协议的 JavaScript 实现**，2012 年由 Mikeal Rogers 起意、Dale Harvey 主推。同一份 API 在**浏览器**（默认 IndexedDB 后端）和 **Node**（默认 LevelDB 后端）都能跑；最关键能力是一行 `db.sync(remote)` 就能与 CouchDB 双向、增量、断点续传地同步。

日常类比：

- 普通前端用 fetch 调后端，像每次写字都要打电话给云端笔记本，断网就废。
- PouchDB 像在你浏览器里**藏了一本同款笔记本**，本地随便写；联网时它自己跟服务器那本对页码、把差的部分补齐；冲突就把两个版本并排留着让你挑。

它不是新数据库，是把 [[couchdb]] 的"多主复制 + 文档 + REST"模型搬到 JavaScript 运行时里跑的客户端实现。

## 为什么重要

不了解 PouchDB，下面几件事就拼不起来：

- 为什么"离线优先"（Offline-First）web 应用社区最早能拿出工程范例——PouchDB + CouchDB 是公开样板
- 为什么 [[automerge]] / [[yjs]] / RxDB / Couchbase Lite 在写文档时都要对照 PouchDB——它定义了 local-first 同步的最小可用面
- 为什么 [[rest-fielding-2000]] 的思想能在前端找到完整落地——CouchDB 的 HTTP API 加上 PouchDB 的本地缓存，就是 REST + 离线
- 为什么 IndexedDB 这种难用的浏览器原生 API 还是值得封装——抽象一层就能换三种后端

## 核心要点

PouchDB 的设计可以拆成 **三件事**：

1. **Adapter（适配器）抽象**
   一份 API，背后插不同存储引擎：浏览器走 IndexedDB、Node 走 LevelDB、测试用 in-memory、远端用 HTTP 代理。换后端不用改业务代码。

2. **Document + `_rev` 修订号**
   每条文档自带 `_id`（你给）和 `_rev`（PouchDB 给）。改时必须带上当前 `_rev`，否则报 409 conflict。**写不阻塞读**，读永远拿到一个完整版本。

3. **Replication 协议 = 拉 changes feed + 比对 rev tree**
   两端互相拉对方的 `_changes`，比对 `_rev` 树，缺哪份抓哪份；中途断了可以从上次的 checkpoint 续。`db.sync(remote)` 就是同时跑两个方向的 replication。

冲突处理是 PouchDB 的招牌：**不强行合并**，把所有分支保留在 rev 树里，默认按 `_rev` 字典序选一个 winner，应用层可以读出所有分支自己挑。

## 实践案例

### 案例 1：浏览器本地写一条，上线后同步到 CouchDB

```js
import PouchDB from "pouchdb-browser";

const local = new PouchDB("todos");
const remote = new PouchDB("https://couch.example.com/todos");

await local.put({ _id: "todo-1", text: "买牛奶", done: false });

local.sync(remote, { live: true, retry: true })
  .on("change", info => console.log("同步进度", info))
  .on("paused", () => console.log("已同步或离线"))
  .on("active", () => console.log("重新开始同步"))
  .on("error", err => console.error(err));
```

`live: true` 表示持续监听变更，`retry: true` 表示断网自动重连。这一段代码就是离线优先 web 应用的最小骨架。

### 案例 2：处理冲突——读出所有分支自己挑 winner

```js
// GET 时默认只返回 winner，要看全部分支：
const doc = await db.get("todo-1", { conflicts: true });

if (doc._conflicts) {
  for (const rev of doc._conflicts) {
    const branch = await db.get("todo-1", { rev });
    // 应用决定：取最新 updated_at？合并字段？让用户选？
  }
  // 选定后用 db.bulkDocs 把败者标 _deleted: true 删掉
}
```

PouchDB 不替你决定怎么合，但保证**没有数据被悄悄丢掉**。

### 案例 3：切换 adapter 让测试跑得快

```js
import PouchDB from "pouchdb";
import memory from "pouchdb-adapter-memory";
PouchDB.plugin(memory);

const db = new PouchDB("test", { adapter: "memory" });
// 跑完测试自动消失，无需清理 IndexedDB
```

同一份业务代码，生产用 IndexedDB、测试用 memory，是 adapter 模式的直接收益。

## 踩过的坑

1. **IndexedDB 不总是可用**：Safari 隐私模式、跨域 iframe、第三方 cookie 限制下会被禁或限额。要写 fallback 到 memory 适配器，并提示用户数据不会持久化。

2. **`live + retry` 会无限重连**：网络长期断开时，PouchDB 会一直重试，UI 上要监听 `paused` / `active` 事件自己切提示，不然用户看不到状态。

3. **winner 不是按时间选的**：默认按 `_rev` 字典序，跟 wall-clock 没关系。靠 _rev 比大小判定"后写的赢"会踩坑——业务字段里要自己存 `updated_at`。

4. **不擅长复杂查询**：mango find 能做基础筛选 + 排序，但联表、全文搜索、聚合统计要么自建 map/reduce view，要么换 [[meilisearch]] / [[postgresql]]。

5. **WebSQL 弃了之后兼容窗口缩窄**：PouchDB **7.0**（2018）起不再带 WebSQL 适配器，老 iOS Safari 上要么升级要么换 in-memory + 自己持久化。

## 适用 vs 不适用

**适用**：

- PWA / 离线优先 web 应用：本地 IndexedDB 写，联网 sync 到 CouchDB
- 移动 web 笔记 / todo / 表单类：能离线编辑、能多端同步、冲突可见
- Electron / Capacitor 桌面应用：嵌一个本地 DB 当唯一持久层

**不适用**：

- 强一致 OLTP（银行账务）：CouchDB 协议是**最终一致**，不是 ACID 跨文档事务
- 复杂联表 / 全文检索：用 [[postgresql]] / [[elasticsearch]] / [[meilisearch]]
- 实时协同编辑（多人同时改一段文字）：冲突粒度是**文档**不是字段，应该用 [[yjs]] / [[automerge]] 的 CRDT

## 历史小故事（可跳过）

- **2012 年**：Mikeal Rogers（Node.js 早期核心）和 Dale Harvey 起意 "CouchDB in the browser"，第一个版本只是个玩具。
- **2014 年**：1.0 发布，IndexedDB / WebSQL / LevelDB 三套适配器齐全，被 Hoodie 框架带火。
- **2016 年**：项目讨论过进 Apache 基金会孵化，最终保留独立组织 pouchdb/pouchdb。
- **2020 年后**：维护节奏放缓但仍跟进 IndexedDB 新 API，下游 RxDB / Couchbase Lite 把它当参考。

## 学到什么

1. **离线优先不是奢侈品**：本地写 + 后台同步比"前端只调后端"对用户更友好，PouchDB 把这条路走通了。
2. **adapter 模式值钱**：一份 API、四种后端，业务代码 0 改动——这是"接口窄、实现可换"的活样本。
3. **冲突不是错误，是事实**：分布式写一定会冲突，PouchDB 选择保留所有分支让应用挑，比悄悄合并更诚实。
4. **协议比实现更长寿**：CouchDB 的复制协议从 2008 活到今天，PouchDB 只是它在 JS 生态的化身——理解协议，换实现也能继续用。

## 延伸阅读

- 官方指南：[PouchDB Guide](https://pouchdb.com/guides/) — 从 hello world 到 sync 一站式
- 协议规范：[CouchDB Replication Protocol](https://docs.couchdb.org/en/stable/replication/protocol.html) — PouchDB 实现的就是这份
- 文章：[Offline-First with PouchDB](https://hacks.mozilla.org/2018/11/offline-first-with-pouchdb/) — Mozilla Hacks 上的实战
- 下游参考：[RxDB](https://rxdb.info/) 的早期版本就是 PouchDB 的响应式封装
- 仓库 README：[github.com/pouchdb/pouchdb](https://github.com/pouchdb/pouchdb) — 适配器矩阵和插件清单都在这
- 类比对照：读完 PouchDB 再读 [[couchdb]] 源码会顺很多——名字一样、`_rev` 树语义一样，只是宿主不同

## 关联

- [[couchdb]] —— PouchDB 实现的就是它的复制协议，浏览器里的同款笔记本
- [[automerge]] —— 同样面向 local-first，但用 CRDT 做字段级合并；PouchDB 是文档级
- [[yjs]] —— CRDT 实时协同编辑器，目标场景重叠但语义不同
- [[sharedb]] —— OT 协议实时协同的对照组
- [[rest-fielding-2000]] —— CouchDB / PouchDB 把 REST 推到极致的理论根
- [[postgresql]] —— 当你需要强一致和复杂查询时的对照选择
- [[elasticsearch]] —— 全文搜索的对照选择，PouchDB 不擅长这块

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
