---
title: Apache CouchDB — Erlang 写的文档数据库
来源: https://github.com/apache/couchdb
日期: 2026-05-31
子分类: 存储与查询
分类: 数据库
难度: 中级
provenance: pipeline-v3
---

## 是什么

Apache CouchDB 是 **2005 年由 Damien Katz 起手、2008 年捐给 Apache 基金会**的开源文档型数据库，用 **Erlang** 写成。它把三件事捏在一起：**JSON 文档**当数据单位、**HTTP/REST** 当唯一 API、**多主双向复制**当默认能力。

日常类比：

- [[postgresql]] 像公司唯一的总账本，所有人都得排队改。
- CouchDB 像**每人发一本同款笔记本**，各自记，定期碰头互抄；遇到双方写了同一页，就两份并排留着，让你自己决定取舍。

它不追求 benchmark 第一，强项是**离线写得了、上线同步得回、冲突看得到**。

## 为什么重要

不了解 CouchDB，下面这些事就解释不了：

- 为什么 PouchDB / RxDB / Couchbase Lite 都说自己"实现 CouchDB 复制协议"——这套协议是离线优先（Local-First）软件的事实标准
- 为什么 [[rest-fielding-2000]] 的思想能找到一个"完整落地"的样本——CouchDB 让 `curl` 直接成为完整客户端
- 为什么 Damien Katz 在做 IBM Lotus Notes 时萌生了写 CouchDB 的念头——Notes 的复制 + 冲突模型是它的精神祖先
- 为什么"本地优先软件"（Ink & Switch 的概念）能拿出第一批工程范例——CouchDB + PouchDB 是公开的实现路径

## 核心要点

CouchDB 三个核心概念，逐个拆开：

1. **JSON 文档 + MVCC（多版本并发控制）**
   每条数据是一个 JSON，带一个 `_id`（你给的）和 `_rev`（CouchDB 给的修订号）。改文档时必须带上当前 `_rev`，CouchDB 写入新版本并发回新 `_rev`。**写不阻塞读**，读永远拿到一个完整版本。
   类比：笔记本每页右上角有顺序编号，改前要先看页码、改后页码加一。

2. **HTTP/REST 是唯一 API**
   `PUT /db/doc` 写、`GET /db/doc` 读、`DELETE` 删、`POST /db/_find` 查询、`GET /_utils` 打开内置 Fauxton 管理界面。**没有专用驱动**——任何能发 HTTP 的语言都是合法客户端。

3. **多主双向复制**
   两个 CouchDB（甚至 CouchDB ↔ PouchDB ↔ 浏览器）之间可以**双向、增量、可断点续传**地同步。复制是数据库的**一等公民**：一条 HTTP 请求就能在 A 和 B 之间建立持续同步。冲突由 CouchDB 保留所有分支，应用决定怎么合并。

## 实践案例

### 案例 1：本地起一个 CouchDB（Docker）

```bash
docker run -d --name couch -p 5984:5984 \
  -e COUCHDB_USER=admin -e COUCHDB_PASSWORD=pass \
  couchdb:3.4
```

打开 `http://localhost:5984/_utils` 就能看到 Fauxton 管理界面。

### 案例 2：用 curl 完整玩一遍

```bash
# 建库
curl -X PUT http://admin:pass@localhost:5984/notes

# 写文档
curl -X POST http://admin:pass@localhost:5984/notes \
  -H "Content-Type: application/json" \
  -d '{"_id": "n1", "title": "couchdb", "tags": ["db"]}'
# → {"ok":true,"id":"n1","rev":"1-abc..."}

# 改文档（必须带当前 rev）
curl -X PUT http://admin:pass@localhost:5984/notes/n1 \
  -H "Content-Type: application/json" \
  -d '{"_id": "n1", "_rev": "1-abc...", "title": "couchdb v2"}'
```

整个生命周期不需要任何驱动，shell 就够。

### 案例 3：建立两个数据库之间的持续复制

```bash
curl -X POST http://admin:pass@localhost:5984/_replicate \
  -H "Content-Type: application/json" \
  -d '{"source": "notes", "target": "http://other:5984/notes", "continuous": true}'
```

之后两边任一方写入，另一方几秒内同步过去。**双向**只要再发一条反向 replicate 即可。这就是 PouchDB 让浏览器做"离线笔记 + 上线自动同步"的底层依赖。

## 踩过的坑

1. **视图首次构建慢**
   CouchDB 的查询能力靠 Map/Reduce 视图（用 JS 函数定义），第一次访问会扫整个数据库建 B-tree。生产环境上线前必须**预热**，不然用户首次查询会卡住几十秒。

2. **磁盘膨胀，必须 compact**
   每次写入留旧 `_rev`，时间一长磁盘吃光。需要定期跑 `POST /db/_compact`。Cassandra 也有类似问题（[[cassandra]] 叫 compaction），思路一样：MVCC 的代价就是清理。

3. **冲突解决是你的活**
   多主复制必然产生冲突——CouchDB 把所有分支都留下，挑一个当"赢家"返回，其他放在 `_conflicts` 字段里。**合并逻辑必须应用层自己写**。新人常以为 CouchDB 替你解，结果默默丢数据。

4. **Map/Reduce 性能不是 SQL 替代**
   JS 函数跑在 SpiderMonkey 里，复杂聚合远不如 PostgreSQL。CouchDB 的视图适合"键查询 + 简单聚合"，复杂分析请走外部数仓。

5. **单节点性能不出彩**
   写 QPS 比 [[mongodb]] 低、延迟比 [[redis]] 高。选 CouchDB 是为了**复制 + 离线 + HTTP**，不是 benchmark。用错地方就会失望。

## 适用 vs 不适用场景

**适用**：

- 离线优先移动 / 桌面应用（用 PouchDB 在客户端，CouchDB 在服务端，自动双向同步）
- 多分支机构本地写、定时回中心（连锁门店、田野调研、医疗采集）
- 配置 / CMS：读多写少、结构灵活、要历史版本
- 需要 HTTP 客户端直接读写的小工具或原型

**不适用**：

- 复杂关联查询（JOIN / 子查询）→ 用 [[postgresql]]
- 极致写吞吐 → 用 [[cassandra]]
- 大数据量低延迟点查 → 用 [[redis]]
- 跨文档强事务（转账、库存）→ CouchDB 仅文档级原子

## 历史小故事（可跳过）

- **2005 年**：Damien Katz 离开 IBM Lotus Notes 团队，自费开始写 CouchDB，最初用 C++。Notes 的复制 + 冲突模型是直接灵感来源。
- **2006 年**：重写为 Erlang，因为 Erlang 的轻量进程和容错模型更适合多复制源场景。
- **2008 年**：捐给 Apache 基金会成为顶级项目。
- **2010 年**：v1.0 发布。
- **2012 年**：Cloudant 公司基于 CouchDB 提供托管服务，后被 IBM 收购。
- **2016 年**：v2.0 引入集群与分片，借鉴 Dynamo 设计。
- **2020 年**：v3.0 默认强制配置 admin 账户，提升安全。
- **2024 年**：v3.4 持续增量改进，社区维护稳定。

## 学到什么

1. **HTTP-as-API 不是噱头**——把数据库做成 REST 服务，运维、调试、客户端开发的门槛都降一档。
2. **复制是一等公民**——大多数数据库把复制当"运维特性"，CouchDB 把它当"数据模型的一部分"，直接催生了 Local-First 软件。
3. **MVCC + 多主 = 冲突必然存在**——不要假装能完全消除冲突，要假设它会出现并设计合并策略。
4. **选语言决定能做什么**——选 Erlang 让 CouchDB 天然能扛海量并发连接；这种"语言层面的护城河"在数据库领域很罕见。

## 延伸阅读

- 官方文档：[CouchDB Documentation](https://docs.couchdb.org/)
- 复制协议：[CouchDB Replication Protocol](https://docs.couchdb.org/en/stable/replication/protocol.html)（PouchDB / RxDB 都按这个实现）
- 客户端：[PouchDB](https://pouchdb.com/)（浏览器 / Node.js 端的 CouchDB）
- 论文式综述：[Local-First Software (Ink & Switch, 2019)](https://www.inkandswitch.com/local-first/)
- [[mongodb]] —— 同为文档库的另一条路线（主从、二进制协议）
- [[cassandra]] —— 同为分布式 NoSQL，但走 AP + 写吞吐路线

## 关联

- [[mongodb]] —— 文档库对照：Mongo 主从 + 二进制协议，Couch 多主 + HTTP
- [[cassandra]] —— 分布式 NoSQL 路线对照：Cassandra 写吞吐第一，CouchDB 复制 + 离线第一
- [[postgresql]] —— 单机强一致代表，对照学习
- [[redis]] —— 内存 KV，对照存储与查询模型
- [[rest-fielding-2000]] —— CouchDB 是 REST 思想最纯净的工程落地
- [[erlang-otp]] —— CouchDB 选 Erlang 的根本原因（容错 + 轻量进程）
