---
title: Dynamo 2007 — 让购物车在机器故障时也能写入
来源: 'Giuseppe DeCandia et al., "Dynamo: Amazon''s Highly Available Key-value Store", SOSP 2007'
日期: 2026-05-29
分类: 数据库
难度: 中级
---

## 是什么

Dynamo 是 Amazon 在 2007 年公开的一套**高可用键值存储系统**：给它一个 key，它存下一个 value，并且尽量在机器坏掉、网络抖动、机房出问题时仍然接受读写。

日常类比：像一个城市快递柜系统。用户只关心“我的包裹能不能放进去、能不能取出来”，系统背后可以把包裹复制到多个柜子、临时寄存在邻近柜子、等故障恢复后再补送。

这篇论文的重点不是“发明一个全新的数学协议”，而是把一致性哈希、复制、向量时钟、读修复、Merkle tree、gossip 这些技术拼成一个能跑在真实购物季流量里的系统。

它最核心的取舍是：在某些故障场景下，宁愿暂时返回多个版本让应用合并，也不要直接拒绝用户写入。

## 为什么重要

不理解 Dynamo，下面这些事都很难解释：

- 为什么很多 NoSQL 系统把“可用性”放在“立刻强一致”前面，尤其是购物车、会话、偏好这类业务
- 为什么 CAP 不是一句抽象口号，而会变成 N、R、W、冲突合并、读修复这些工程旋钮
- 为什么 Cassandra、Riak、DynamoDB 等系统都能看到 Dynamo 的影子
- 为什么 Amazon 论文反复看 99.9% 延迟，而不是只看平均延迟

## 核心要点

1. **把数据放到环上**：Dynamo 用一致性哈希把 key 映射到一个环，再沿环找负责节点。类比：给每个快递柜分一段街区，新增柜子时只搬附近一小段包裹。

2. **写入优先活下来**：每份数据复制到 N 个节点，读至少等 R 个响应，写至少等 W 个响应。类比：不要求所有收银员同时盖章，只要够多的人确认，订单就先成立。

3. **冲突留到能看懂业务的人处理**：Dynamo 用向量时钟判断版本先后；如果两个版本互不包含，就把多个版本交给应用合并。类比：仓库能发现两张购物车清单都是真的，但只有业务知道“加购不要丢、删除可能要重新确认”。

## 实践案例

### 案例 1：一致性哈希怎么减少搬家

```js
const ring = ["A", "B", "C", "D"]
function owner(hash) {
  return ring[hash % ring.length]
}
console.log(owner(10)) // C
console.log(owner(11)) // D
```

**逐部分解释**：

- `ring` 是一圈存储节点，真实 Dynamo 会用更大的哈希空间和虚拟节点
- `owner(10)` 表示某个 key 算出哈希后，落到负责它的节点
- 真实系统新增节点时，不希望全量重排，只希望局部 key 迁移

### 案例 2：N、R、W 是可用性和一致性的旋钮

```js
const N = 3
const W = 2
const replicas = [true, true, false]
const ack = replicas.filter(Boolean).length
console.log(ack >= W) // true
```

**逐部分解释**：

- `N = 3` 表示一份数据有 3 个副本
- `W = 2` 表示写入只要 2 个副本确认就成功
- 第 3 个副本挂了也不阻塞写入，但之后需要补齐和修复

### 案例 3：向量时钟为什么能发现冲突

```js
const v1 = { A: 2 }
const v2 = { A: 2, B: 1 }
const v3 = { A: 2, C: 1 }
function descends(x, y) {
  return Object.keys(y).every(k => (x[k] ?? 0) >= y[k])
}
console.log(descends(v2, v1)) // true
console.log(descends(v2, v3)) // false
```

**逐部分解释**：

- `v2` 包含 `v1` 的计数，所以 `v2` 可以覆盖 `v1`
- `v2` 和 `v3` 分别包含 B、C 的更新，谁也不包含谁
- 这时 Dynamo 不能随便丢一个版本，必须让应用做语义合并

## 踩过的坑

1. **把 eventual consistency 理解成“最后一定马上正确”**：正确说法是副本最终会收敛，但故障期间读到旧值或多个版本是设计内现象。

2. **以为 R + W > N 就万事大吉**：Dynamo 的 sloppy quorum 会跳过不可达节点，实际成员可能不是严格固定的那 N 个。

3. **把向量时钟当成时间戳**：向量时钟记录因果关系，不是记录谁的物理时间更晚。

4. **只看平均延迟**：Dynamo 面向用户体验，真正关注的是 99.9% 这类尾部延迟。

## 适用 vs 不适用场景

**适用**：

- 购物车、会话、用户偏好、商品目录缓存这类按 key 读写的小对象
- “拒绝写入比短暂冲突更糟”的业务
- 能接受应用参与冲突合并的团队
- 需要按服务单独调 N、R、W，控制性能、可用性和耐久性的系统

**不适用**：

- 银行转账、库存扣减这类强事务语义优先的场景
- 需要跨多个 key 做复杂查询、join、全局约束的关系型业务
- 应用完全不愿处理多个版本，只希望数据库永远给唯一正确答案的场景
- 不可信网络环境；论文里的 Dynamo 假设节点都在一个可信管理域里

## 历史小故事（可跳过）

- **2006 年购物季**：Dynamo 已经支撑 Amazon 核心服务，购物车服务单日处理数千万请求，带来数百万次结账。
- **2007 年 SOSP**：论文公开，把“最终一致 + 应用合并 + 高可用写入”的生产经验带进数据库和分布式系统社区。
- **论文中的生产数据**：多个内部服务两年内收到 99.9995% 成功响应，并且没有发生数据丢失事件。
- **后续影响**：Cassandra、Riak、Voldemort 等系统继承了 Dynamo 的许多设计；DynamoDB 则把这个方向产品化。

## 学到什么

- 高可用不是一句“多复制几份”，而是一整套故障期间仍能读写、故障后能补账的机制。
- Dynamo 的关键工程选择是“写入不轻易拒绝，冲突交给读路径和应用处理”。
- N、R、W 把数据库语义变成可调旋钮，但旋钮越自由，应用开发者越要理解代价。
- 真正的生产系统要同时关心数据分布、尾部延迟、后台修复、节点成员关系和机房级故障。

## 延伸阅读

- 论文 PDF：[Dynamo: Amazon's Highly Available Key-value Store](https://www.allthingsdistributed.com/files/amazon-dynamo-sosp2007.pdf)
- 作者博客：[All Things Distributed — Dynamo](https://www.allthingsdistributed.com/2007/10/amazons_dynamo.html)
- [[brewer-cap-2000]] —— 理解为什么网络分区会逼系统做取舍
- [[karger-1997-consistent-hashing]] —— Dynamo 分区和虚拟节点的基础来源
- [[vogels-eventual-2009]] —— Werner Vogels 后来系统解释 eventual consistency
- [[cassandra-2010]] —— 看 Dynamo 思想如何和 Bigtable 数据模型结合

## 关联

- [[brewer-cap-2000]] —— Dynamo 是 CAP 里偏 AP 路线的生产级案例
- [[cap-12-years-later-2012]] —— 帮你避免把 Dynamo 简化成“三选二”口号
- [[karger-1997-consistent-hashing]] —— 提供 Dynamo 增量扩容的哈希环直觉
- [[bigtable-2006]] —— 同期工业存储系统，但更偏结构化数据和强管控
- [[bayou-1995]] —— Dynamo 的应用级冲突合并可以追溯到弱连接复制系统
- [[cassandra-2010]] —— 直接继承 Dynamo 的去中心化复制与可调一致性
- [[chain-replication-2004]] —— 与 Dynamo 相反，更强调有序链式强一致复制

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
