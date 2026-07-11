---
title: Consistent Hashing — 加机器只搬一小部分数据的哈希环
来源: Karger et al., "Consistent Hashing and Random Trees", STOC 1997
日期: 2026-05-31
分类: 分布式系统
难度: 中级
---

## 是什么

**一致性哈希**（Consistent Hashing）是一套**让你给 N 台服务器分数据时，加减机器只需搬动 1/N 的数据**的方法。

日常类比：班里 100 个同学按学号分到 5 个小组。
- 老办法（取模分组）：`学号 % 5`。来了一个新组变 6 个，几乎所有人都得换组。
- 新办法（哈希环）：在操场画一个圆圈，每个小组站一个固定位置，每个同学也按学号站到圆上。**每个同学加入离自己顺时针最近的那个小组**。新来一个小组，只有它身后那段弧上的人换组，其他人原地不动。

这个"圆圈分配"的想法就是一致性哈希。

## 为什么重要

不理解一致性哈希，下面这些事都没法解释：

- 为什么 Akamai CDN 1998 年敢把全球网站缓存分到几千台机器，加机器不用全网清缓存
- 为什么 Cassandra / DynamoDB / Riak 这些 KV 存储扩容时只搬一小部分数据
- 为什么 Memcached 客户端会算一个"环"再选服务器，而不是简单 `% N`
- 为什么 Discord / Stripe 在中文技术博客里讲 sharding 时总会画一个圆环

一句话：**这是互联网规模"把数据分到 N 台机器"的基础原语**。

## 核心要点

一致性哈希做的事可以拆成 **三步**：

1. **同一个环**：把 servers 和 keys 都用同一个哈希函数（比如 MD5 取前 32 位）映射到 0 到 2^32-1 的整数。把这个区间想象成首尾相接的圆环。

2. **顺时针归属**：每个 key 在环上的位置往顺时针走，**碰到的第一个 server 就是它的归属**。这一步不需要任何中心调度，每台机器自己算就知道。

3. **虚拟节点（virtual nodes）**：每个物理 server 在环上放 100~200 个分身（用 `hash(server-id + i)` 算位置）。这样负载更均匀，少数热点服务器不会塌方。

加机器：新 server 落到环上某点，**只接管它逆时针那一段弧**上的 keys；减机器：那一段弧的 keys 顺时针换到下一个 server。**搬动量 ≈ 1/N**。

## 实践案例

### 案例 1：Memcached 客户端的 ketama

```python
# 伪代码：ketama 客户端选 server
ring = []
for server in servers:
    for i in range(160):  # 每个 server 160 个虚拟点
        h = md5(f"{server.ip}-{i}")
        ring.append((h, server))
ring.sort()

def lookup(key):
    h = md5(key)
    # 在 ring 里二分找第一个 >= h 的位置
    idx = bisect_left(ring, (h, None))
    if idx == len(ring): idx = 0  # 绕回环开头
    return ring[idx][1]
```

**关键**：客户端**自己算**就知道 key 该去哪台。不用问 master、不用 zookeeper。

### 案例 2：Cassandra token ring

Cassandra 启动时每个节点选 256 个 token（默认 num_tokens=256），就是它在环上的 256 个虚拟位置。

加节点：新节点选自己的 256 个 token，**从邻居那里把对应区间的数据 streaming 过来**。其他节点之间的数据**完全不动**。

这是 DynamoDB / Cassandra / Riak 几乎一样的扩容机制——直接抄了 1997 年这篇论文的结构。

### 案例 3：和取模分片对比

8 个 keys 分到 3 台 server：

```
hash(k) % 3 → [0,1,2,0,1,2,0,1]
扩容到 4 台：
hash(k) % 4 → [0,1,2,3,0,1,2,3]
```

**8 个 key 里 6 个换了 server，搬动率 75%**。如果是 1000 万缓存条目，扩容期间几乎全 miss，缓存穿透打挂数据库。

一致性哈希同样场景下搬动率 ≈ 1/N，**N=4 时只搬 25%**，且穿透有界。

## 踩过的坑

1. **不加虚拟节点时负载严重不均**：直接把 N 个 server 哈希到环上，最重和最轻节点能差 5~10 倍。论文证明加 V 个虚拟点后偏差降到 O(1/sqrt(V))，工程经验 V=100~200 够用。

2. **热 key 还是会压垮单 server**：一致性哈希解决"加减机器搬动量"，**没解决某个 key 突然爆红**。Google 2018 年 Bounded-Load CH 加了一条：每个 server 负载不超过平均的 (1+epsilon) 倍，超了就溢出到下一个。

3. **节点容量异构**：32 核机器和 8 核机器各放 200 个虚拟点不公平。要按权重放——大机器 400 个、小机器 100 个。

   实际工程里还要考虑磁盘容量、网络带宽不一致，所以 Cassandra 的 num_tokens 配置是每节点独立的。

4. **环结构对范围查询不友好**：`SELECT WHERE id BETWEEN 100 AND 200` 在哈希环上会散到所有节点。DynamoDB 也因此**主键不支持范围查询**，要用 sort key 在 partition 内部排序。

5. **再哈希一致性**：节点扩缩容时如果上下游用了不同 hash 函数版本，会出现"同一 key 不同视角到不同 server"的灾难。生产环境要把 hash 函数和虚拟节点数版本化、所有客户端协调升级。

6. **缓存预热盲区**：刚加入的 server 一开始 hit 率为零。如果直接接流量会拖慢平均延迟，工程上常用 shadow read 或灰度放量先把缓存预热到 60% 再切真流量。

## 适用 vs 不适用场景

**适用**：
- 分布式 KV 存储分片（DynamoDB / Cassandra / Riak / etcd）
- CDN 边缘节点选源站（Akamai 起家场景）
- 分布式缓存（Memcached / Redis Cluster 的 slot 是变体）
- 负载均衡 session 粘连（同一个用户路由到同一台机器）

**不适用**：
- 范围查询为主的场景 → 用 range partitioning（HBase / Bigtable）
- 节点 < 10 台 → 直接用 `% N`，简单透明
- 强一致顺序读写 → 一致性哈希只管路由，不管复制和共识，要配 Paxos / Raft
- 关系型数据库横向分片 → 关联查询跨节点很贵，慎用

## 历史小故事（可跳过）

- **1996 年**：MIT LCS 实验室 Tom Leighton（应用数学教授）带博士生研究"网页突然爆红怎么办"。
- **1997 STOC**：Karger / Leighton / Lewin 等六人发表 Consistent Hashing 论文。同期还有一篇 Random Trees 用类似思想做 cache 树。
- **1998 年**：Leighton 和博士生 Daniel Lewin 用这套算法创办 Akamai。Akamai 后来成为全球最大 CDN，2025 年市值百亿美元。
- **2001-9-11**：Lewin 在美航 11 号航班上遇害，年仅 31 岁。Akamai 总部 cambridge 办公楼一直挂着他的纪念牌。
- **2007 年**：Amazon Dynamo 论文把一致性哈希带进工业 KV 存储主流。Cassandra / Riak 几乎逐字照抄 Dynamo 的环结构。
- **2014~2018 年**：Jump CH / Maglev / Bounded-Load CH 三个变体陆续出现，都不否定原论文，只补足"实战中发现的洞"。

## 学到什么

1. **加减机器只搬 1/N 数据**——这是分布式系统避开"扩容雪崩"的核心招式
2. **环 + 虚拟节点** 是工程化的两个支柱：环给 monotonicity，虚拟节点给 balance
3. **客户端自己算路由** 比中心调度更扛压——任何场景下能去掉协调点就去掉
4. **理论 → 工程 → 工业**：1997 论文 → 1998 Akamai → 2007 Dynamo → 2010 后全行业默认。每一步隔 5~10 年

## 延伸阅读

- 论文 PDF：[Consistent Hashing and Random Trees, STOC 1997](https://www.cs.princeton.edu/courses/archive/fall09/cos518/papers/chash.pdf)（核心定理在第 3-4 节，工程不需要细推）
- David Karger 在 MIT 6.854 课程视频里亲自讲：[Consistent Hashing lecture](https://www.youtube.com/results?search_query=karger+consistent+hashing)
- Damien Katz（CouchDB 作者）的工程视角：[The Tao of Memcached](https://memcached.org/)
- [[bigtable-2006]] —— Google 用 range partitioning 而不是哈希环的对照案例
- [[paxos]] —— 一致性哈希管路由，Paxos 管复制，两件事

## 关联

- [[bigtable-2006]] —— BigTable 选 range partition；同期 DynamoDB 选哈希环，两条路线分叉
- [[dynamo-2007]] —— Dynamo 把这篇 1997 年的算法第一次推向工业 KV 存储
- [[cassandra]] —— Cassandra 几乎逐字实现 Dynamo 的 token ring
- [[paxos]] —— 一致性哈希解决数据放哪里，Paxos 解决多副本怎么达成一致
- [[brewer-cap-2000]] —— CAP 定理；一致性哈希的系统通常选 AP（Dynamo 系）
- [[chord-2001]] —— P2P 路由协议，把一致性哈希推到去中心化场景

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[akamai-2002]] —— Akamai 2002 — 把网站搬到离用户 10 毫秒的地方
- [[akamai-2010]] —— Akamai 2010 — 从内容分发网络长成全球应用平台
- [[donar-2010]] —— DONAR 2010 — 把 DNS 全球调度写成一道可解的优化题
- [[kademlia-2002]] —— Kademlia — 用 XOR 当距离的 P2P 路由表
- [[lsh-indyk-1998]] —— LSH — 让相似点撞同一个桶，把高维最近邻查询从线性变成亚线性
- [[on-demand-container-loading]] —— On-demand Container Loading — Lambda 把大镜像按需搬上车
- [[vitess]] —— Vitess — 给 MySQL 装上水平分片的代理层
