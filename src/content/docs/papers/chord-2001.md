---
title: Chord — 让上万台机器排成圈，查任何 key 都只走 log N 步
来源: 'Stoica et al., "Chord: A Scalable Peer-to-peer Lookup Service for Internet Applications", SIGCOMM 2001'
日期: 2026-06-01
分类: 网络协议
难度: 中级
---

## 是什么

Chord 是一套**让一堆没有中心服务器的机器自己组织起来、互相帮忙找东西**的协议。日常类比：一万人围成一个圈坐着，每人手里有一些信件。你想找编号 73 的信，不需要问中央台，只要顺着圈走一圈就一定能找到。但走一圈要一万步太慢——Chord 让你**只走 log N 步**就找到。

具体一点。Chord 把两件东西揉到同一个圆环上：

- **机器**（node）：每台机器拿自己 IP 算个 hash，得到一个 0 到 2^160-1 之间的编号
- **数据**（key）：每条数据也算 hash，得到同样区间的一个编号

规则：**编号 k 的数据，由"圆环上从 k 起、顺时针碰到的第一台机器"负责存。**

这样无论加机器还是删机器，每条数据该归谁都有明确答案，不用任何中心调度。

## 为什么重要

不理解 Chord，下面这些事都没法解释：

- 为什么 Cassandra / Dynamo / Riak 这类无主数据库**加节点不用停机**
- 为什么 BitTorrent / IPFS 这种没有中央服务器的网络**还能精确找到一个文件在谁那里**
- 为什么 Akamai 这类 CDN **挂掉一台机器，只有 1/N 的请求重新分配**而不是大塌方
- 为什么 2001 年的论文到 2026 年还是分布式系统课的必读

## 核心要点

Chord 的全部魔力来自**三件东西**：

1. **一致性哈希（consistent hashing）**：node 和 key 用同一个 hash 函数（论文用 SHA-1，160 位）映射到圆环。加一台机器只需要把它"插队的那段区间"的 key 转移过来——影响 O(K/N) 个 key，不是全表重洗。

2. **指针表（finger table）**：如果每台机器只知道自己的下一位（successor），查 key 要绕圈 O(N) 跳。Chord 让每台机器多记 m=160 个指针，第 i 个指针指向"圆环上距离我 2^(i-1) 远的那台机器"。这就像你查字典不会一页一页翻，而是先翻到"大概一半的位置"，再翻"剩一半的一半"。

3. **stabilization**：机器随时进进出出。Chord 用一个**异步后台协议**周期性问邻居"你的前驱是谁"，慢慢把指针修正过来。不追求时刻精确，追求**最终收敛**。

三件加起来：每台机器只记 log N 条指针，查任意 key **O(log N) 跳**完成。10000 台机器最多 14 跳。

## 实践案例

### 案例 1：查找过程走一遍

假设圆环 m=6（编号 0 到 63），有 6 台机器：N1、N8、N14、N32、N42、N56。
现在 N1 想查 key=54 在谁那里，也就是找顺时针第一个不小于 54 的节点。

```
N1 的 finger table（简化版）：
  i=1: 离我 1 的 → N8
  i=2: 离我 2 的 → N8
  i=3: 离我 4 的 → N8
  i=4: 离我 8 的 → N14
  i=5: 离我 16 的 → N32
  i=6: 离我 32 的 → N42
```

查 54 的过程：

1. N1 看：54 在我的指针表里"最远但还没越过 54"的是 N42（指针 i=6）
2. N1 把请求转给 N42
3. N42 看：自己的下一台是 N56，而 54 正好落在 (42, 56] 这段
4. 所以 N56 就是 successor(54)，查找结束

每跳**至少把剩余距离折半**——这就是 O(log N) 的来源。

### 案例 2：加一台机器要做什么

新机器 N26 想加入：

1. 找任意一台已知机器（比如 N1）问：26 的 successor 是谁？
2. 答：是 N32
3. N26 把自己塞到 N14 和 N32 之间，告诉 N32"我现在是你的前驱"
4. N32 把它存的、编号在 (14, 26] 的 key **转给 N26**——只转这一段
5. 后台 stabilization 协议慢慢通知其他机器更新指针表

**只有 N32 上的少量 key 被搬动**。如果换成传统 hash mod N，加一台机器要全表重洗。

### 案例 3：现实里的简化变形

**Cassandra / Dynamo** 都用了 Chord 的圆环 + 一致性哈希，但**砍掉了 finger table**：

- 它们假设节点数不会太多（几百到几千），每台机器**记住所有 peer**就够了
- 这样查找变成 O(1) 跳（直接知道 key 在谁那里）
- 代价：节点元数据 O(N)，但工业场景可接受

这是**理论 vs 工程**的经典取舍——纯 Chord 适合 N 很大、机器内存小的场景（比如 BitTorrent DHT 上百万节点）；Cassandra 这种集群规模有限就直接走 O(1)。

## 踩过的坑

1. **网络拓扑无感知**：圆环上下一跳可能从北京跳到圣保罗。实际延迟糟糕。后续的 Pastry / Tapestry 加了"邻近度"路由优化。

2. **抗 churn 弱**：node 进出频繁时 finger table 永远是过时的，stabilization 追不上。BitTorrent 的 Kademlia 用 XOR 距离 + 多副本路由，对 churn 鲁棒得多。

3. **递归 vs 迭代查找**：论文给的是**迭代**（每跳返回结果给发起方，由发起方继续问）。但实际系统用**递归**（每跳直接转发请求），消息数减半。

4. **Sybil / eclipse 攻击**：均匀 ID 分布的前提是**节点诚实**。恶意者可以挑选 ID 包围某个 key 区间。需要额外身份机制（PoW / 证书）才能上生产。

5. **160 位 m 是过度设计**：论文给 m=160 是因为 SHA-1 输出 160 位。实际部署 m=128 甚至 m=64 都够用。

## 适用 vs 不适用场景

**适用**：

- 节点数极大且高度动态（BitTorrent Mainline DHT 千万级节点）
- 没有可信中央协调者（去中心化网络 / 区块链 P2P 层）
- 数据可分片、查询主要是 key-value lookup
- IPFS / libp2p / Tor 隐藏服务这类"找一个东西在谁那里"的场景

**不适用**：

- 范围查询（圆环 hash 把相邻 key 散开了）→ 用 Cassandra 的 ByteOrderedPartitioner 或 B-tree
- 需要强一致 → Chord 只保证最终一致；强一致用 Raft / Paxos
- 节点数小（< 1000）且稳定 → 直接全互联省 finger table 复杂度
- 对延迟敏感 → log N 跳跨网络太慢，用客户端缓存或边缘 CDN

## 历史小故事（可跳过）

- **2001 年 SIGCOMM 同期**：Chord、Pastry、Tapestry、CAN 四篇 DHT 论文几乎同时投稿。MIT 的 Chord 因证明最干净、抽象最简洁成为引用最多的一篇。
- **2002 年**：Petar Maymounkov 和 David Mazières 提出 Kademlia，用 XOR 距离取代圆环，工程上更鲁棒。BitTorrent 后来选了 Kademlia，不是 Chord。
- **2006 年**：Amazon Dynamo 论文公开，承认借鉴一致性哈希思想，但用 preference list 替代 finger table 简化部署。
- **现在（2026）**：纯 Chord 几乎不在生产用，但**它的语言**——一致性哈希、successor、O(log N) 路由——是分布式系统课和 P2P 系统设计的通用词汇。

## 学到什么

1. **一致性哈希**是分布式系统的基础工具：加减节点只动 O(K/N) 个 key
2. **空间换时间**：每台机器多记 log N 条指针，把 O(N) 查找压到 O(log N)
3. **最终一致 + 异步修复**：Chord 不追求实时正确，靠后台 stabilization 收敛——这套思路后来被无主数据库广泛沿用
4. **理论简洁 vs 工程现实**：Chord 的证明优雅，但生产里大家都做了简化（Cassandra O(1) 路由、Kademlia XOR 距离）

## 延伸阅读

- 论文 PDF：[Chord SIGCOMM 2001](https://pdos.csail.mit.edu/papers/chord:sigcomm01/chord_sigcomm.pdf)（14 页，正文清晰）
- 视频：[MIT 6.824 Distributed Systems — DHT lecture](https://pdos.csail.mit.edu/6.824/)（Robert Morris 本人讲）
- 实现：[OpenDHT](https://github.com/savoirfairelinux/opendht)（C++ 库，Kademlia 实现，思想同源）
- [[akamai-2002]] —— 一致性哈希更早的工业落地（CDN）
- [[dynamo]] —— Amazon 用一致性哈希但砍掉 finger table

## 关联

- [[akamai-2002]] —— Akamai 用一致性哈希做 CDN 节点选择，比 Chord 早一年
- [[dynamo]] —— Dynamo 圆环 + preference list = Chord 简化版
- [[cassandra-2010]] —— Cassandra token ring 也是 Chord 后裔
- [[paxos-1998]] —— 强一致协议，与 Chord 解决正交问题（一致性 vs 路由）
- [[raft]] —— 同样是强一致，Chord 是最终一致
- [[gfs]] —— 中心 master 架构，与 Chord 去中心化形成对照

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[cassandra-2010]] —— Cassandra 2010 — 把 Dynamo 的 P2P 骨架和 Bigtable 的列族数据模型拼成一个东西
- [[ceph-2006]] —— Ceph — 让分布式文件系统不靠中心查表
- [[consistent-hashing-1997]] —— Consistent Hashing — 加机器只搬一小部分数据的哈希环
- [[ipfs-2014]] —— IPFS — 把"地址"换成"内容本身"的 P2P 文件系统
- [[kademlia-2002]] —— Kademlia — 用 XOR 当距离的 P2P 路由表
- [[karger-1997-consistent-hashing]] —— Karger 1997 一致性哈希 — 加机器不用全员搬家
- [[pastry-2001]] —— Pastry — 用 nodeId 的前缀一位一位逼近目标
