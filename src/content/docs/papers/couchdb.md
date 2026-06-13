---
title: "CouchDB — 把 HTTP + 多版本 + 多主复制揉成离线优先数据库"
来源: Anderson, Lehnardt, Slater, "CouchDB The Definitive Guide" (OReilly 2010); Apache CouchDB 项目 2005-
日期: 2026-05-31
子分类: 数据库
分类: 数据库
难度: 中级
provenance: pipeline-v3
---

## 是什么

CouchDB 是 Damien Katz 2005 年起做的**文档数据库**。日常类比：像一个**云笔记本**——每条笔记是一个 JSON 文档，有自己的 URL，可以在手机离线写，回到 wifi 自动和服务器对账，两边各自改了同一条也不会丢，会保留两个版本让你选。

它把三件事拧在一起：

- **HTTP 当唯一入口**：每个文档就是 `GET /db/doc-id`，写就 `PUT`，删就 `DELETE`，没有自定义协议
- **MVCC 多版本并发**：每次写带版本号，写不会锁读
- **多主复制**：任意两个节点能互相同步，谁都能写，冲突保留所有分支让应用层挑

这三条加起来，让 CouchDB 成为今天**离线优先架构**的开山祖师爷。

## 为什么重要

不理解 CouchDB，下面这些事不好解释：

- 为什么 PouchDB 能在浏览器里跑一份"小 CouchDB"，跟服务端用同一套同步协议
- 为什么 Linear、Notion、Figma 这些"本地优先"产品的同步思路最早能追到 2005 年的一个开源项目
- 为什么 Apple Notes、iCloud 同步的设计哲学和 CouchDB 高度重合
- 为什么"REST 当一等公民"在数据库里只有 CouchDB 真做到底——别的数据库 HTTP 都是外挂层

## 核心要点

**1. 文档 + `_rev`**

每个文档是 JSON，必有两个特殊字段：`_id`（主键）和 `_rev`（版本号）。`_rev` 不是时间戳，是文档内容的 hash 加序号，例如 `2-c1a3...`。

写文档时**必须带上当前 `_rev`**，否则返回 `409 Conflict`。这就是 MVCC——你以为在改 v2，结果别人已经改成 v3，服务器拒绝你的写。

**2. append-only B+ 树**

存储只追加从不原地改。崩溃恢复极简单：从文件尾倒着扫，找到最后一个完整的 B 树根就 OK，不需要 WAL replay。代价是磁盘膨胀，需要定期 `compact`。

**3. 多主复制**

复制是**拉模式 HTTP**：A 主动从 B 拉变更（`GET /db/_changes?since=N`）。反过来配一遍就是双向同步。三个节点全互拉就是三主。

冲突时**不自动合并**：两边各自改了同一文档，同步后两边都能看见两个分支，`_conflicts` 字段列出所有兄弟版本，由应用层挑赢家。

**4. view = 增量物化的 map/reduce**

查询用 JS 写 `map(doc) -> emit(key, value)`，CouchDB 把结果存进二级 B 树。新文档进来只增量算它一个，不重跑全表。

## 实践案例

### 案例 1：用 curl 直接操作数据库

```bash
# 建库
curl -X PUT http://localhost:5984/notes
# 写文档
curl -X PUT http://localhost:5984/notes/hello \
     -d '{"title":"first note","body":"hi"}'
# 返回 {"ok":true,"id":"hello","rev":"1-abc..."}

# 改文档（必须带 rev）
curl -X PUT http://localhost:5984/notes/hello \
     -d '{"_rev":"1-abc...","title":"first","body":"updated"}'
```

整个数据库就是一组 URL，浏览器都能直接访问。这就是"REST 一等公民"的字面意思。

### 案例 2：离线写 + 回联同步

```js
// PouchDB 在浏览器里
const local = new PouchDB("notes");
const remote = new PouchDB("https://server/notes");

// 离线时照常写
await local.put({ _id: "n1", body: "在地铁里写的" });

// 回到 wifi
local.sync(remote, { live: true, retry: true });
// 会自动把离线写过去，也把服务端的拉下来
```

这套 API 和服务端 CouchDB 完全一样。**离线优先 = 本地有完整副本 + 双向同步协议**。

### 案例 3：冲突如何显式处理

设备 A 离线把 `n1.body` 改成 X，设备 B 离线改成 Y。同步后：

```js
const doc = await db.get("n1", { conflicts: true });
// doc._conflicts = ["2-yyy..."]，当前 doc 是 2-xxx
const all = await Promise.all(
  [doc._rev, ...doc._conflicts].map((r) => db.get("n1", { rev: r }))
);
// 应用层挑一个或合并，把其他分支删掉
```

CouchDB **不替你做决定**——它的世界观是"冲突是业务问题不是数据库问题"。

## 踩过的坑

1. **view 第一次查会全量构建**：几百万文档时第一次访问能卡几分钟。生产环境必须预热（启动后立刻空查一遍）

2. **`_rev` 不是时间戳是 hash**：跨节点比较版本只能看 ancestor 关系（A 是不是 B 的祖先），**不能比大小**。新人常以为 `2-xxx > 1-yyy` 就更新，错

3. **冲突不读就永远留着**：应用层不主动处理 `_conflicts`，分支会一直在磁盘攒着，几个月后数据库膨胀好几倍

4. **JS map/reduce 慢**：v1 用 SpiderMonkey 跑，比 SQL 慢一个数量级，复杂查询要外接 Elasticsearch

5. **复制不是事务**：A 同步到 B 中途断网，部分文档已过去，部分没过去——必须靠应用层 idempotent 设计兜底

## 适用 vs 不适用

**适用**：

- 离线 / 弱网客户端 + 服务端同步（移动笔记、表单采集、田野数据）
- 多数据中心多主写入，能容忍最终一致
- schema 经常变的内容型应用（CMS、配置中心）
- 想直接用 HTTP 操作存储，不要 ORM

**不适用**：

- 强一致 ACID 事务 → 用 Postgres
- 高频小写（每秒上万）→ 用 Redis / RocksDB，HTTP 开销洗不掉
- 复杂关联查询（多表 JOIN）→ 用 SQL
- 超低延迟读（毫秒级）→ HTTP 开销硬伤

## 历史小故事（可跳过）

- **2005**：Damien Katz 从 Lotus Notes 离职，自费写 CouchDB。最初 C++，后改 Erlang——因为 Erlang 的轻量进程天然适合每个 HTTP 连接配一个 actor
- **2008**：捐给 Apache，0.8 版本发布
- **2010**：1.0 发布，OReilly 出 Definitive Guide
- **2013**：PouchDB 1.0 上线，浏览器端首次拥有同款数据库——同协议是关键
- **2017**：2.0 加入分片集群，用了 Dynamo 的一致性 hash（之前一直是单机）
- **2020s**：3.x 维护，离线优先理念被 Linear / Replicache 重新工程化

## 学到什么

1. **REST 不是 API 风格，是数据库设计哲学**——每个资源一个 URL 这件事可以贯彻到存储层
2. **冲突保留 vs 自动合并** 是两条路：CouchDB 选保留，因为业务知道怎么合并，数据库不知道
3. **离线优先 = 本地完整副本 + 双向协议**，不是"加个缓存"
4. **append-only 让崩溃恢复白送**，代价是 compact——这种 trade-off 后来在 RocksDB / LSM 树里再次出现

## 延伸阅读

- [CouchDB The Definitive Guide](https://docs.couchdb.org/en/stable/) — 官方接管的免费在线版
- [PouchDB](https://pouchdb.com/) — 浏览器版同协议实现，理解复制原理最快路径
- [Damien Katz "What is CouchDB?"](https://www.infoq.com/presentations/katz-couchdb/) — 作者亲讲设计动机
- [Apache CouchDB Replication Protocol](https://docs.couchdb.org/en/stable/replication/protocol.html) — 协议规范，多主同步必读

## 关联

- [[rest-fielding-2000]] —— REST 设计宪法，CouchDB 是它最忠实的数据库实现
- [[dynamo]] —— 一致性 hash + 多主写入，CouchDB 2.0 集群直接套
- [[chain-replication-2004]] —— 另一种多副本方案，对照看更清楚
- [[erlang-otp]] —— CouchDB 用 Erlang 写，每连接一进程
- [[http-2]] —— HTTP 当协议带来的开销，HTTP/2 多路复用部分缓解
