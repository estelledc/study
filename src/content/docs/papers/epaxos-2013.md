---
title: EPaxos — 没有 leader 的 Paxos，让每个副本平起平坐
来源: Moraru, Andersen, Kaminsky, "There Is More Consensus in Egalitarian Parliaments", SOSP 2013
日期: 2026-05-30
分类: 分布式系统
难度: 高级
---

## 是什么

EPaxos（**Egalitarian Paxos**，平等议会式 Paxos）是一个**去掉 leader** 的共识协议——任何副本都可以提议命令，不冲突的命令在 **1 个 RTT** 内就能 commit。

日常类比：传统 Multi-Paxos / Raft 像一个公司必须经过总经理签字——所有事都要先排到总经理桌上，他批了才生效，他出差了大家都得停摆。EPaxos 则像合伙人制律所——每个合伙人都能独立处理客户案子；只有当两个案子涉及同一份合同时，才需要互相协调谁先谁后。

论文标题里的 "More Consensus" 是双关：既指**更多的副本能达成共识**（任何一个都能主导），也指**比传统 Paxos 学到了更多**。

## 为什么重要

- **跨地域部署**：Multi-Paxos 把 leader 钉在某一个地理区域，其他区域的客户端每次写都要绕 leader 一圈。EPaxos 让本地副本直接 commit
- **抗慢节点**：Mencius 轮转 leader 也想解决"leader 偏心"，但慢节点会拖累每个 slot；EPaxos 没有"轮到谁"的概念
- **影响巨大**：CockroachDB / Cassandra 的 **Accord** 协议、TiKV 的多区域设计、学术界 Tempo / Caesar / Atlas 全部在它基础上改进
- 它是**早期把去 leader 共识做到可实现、并强调跨地域延迟**的代表工作（Mencius 等更早探索轮转 leader；EPaxos 把任意副本命题 + 冲突感知做到工程可跑）

## 核心要点

### 1. 干扰关系（interference relation）

两条命令"干扰"的定义：**操作同一个 key，且至少一个是写**。读读不干扰，互不相关 key 的写也不干扰。这是 EPaxos 能并行的根基——大部分命令彼此不干扰，所以可以同时 commit。

### 2. Fast path vs Slow path

- **Fast path**（1 RTT）：命题 P 提议命令 c，向 fast quorum 发询问；如果所有人都同意 c 的依赖集合，直接 commit
- **Slow path**（2 RTT）：有副本反对 / 命题需要更新依赖时，走 Paxos 风格的 accept 阶段达成共识

3 副本集群下，**fast quorum = slow quorum = 2**——这是为什么 EPaxos 在小集群里特别有竞争力。

### 3. 依赖图 + 拓扑排序

每条 commit 的命令记录两件事：**deps**（在它前面、它依赖的命令集合）+ **seq**（一个序号用于打破环）。执行时构建依赖图，找强连通分量（SCC），SCC 内按 seq 排序——保证所有副本得到一致的执行顺序。

为什么要 SCC？因为两个并发命题方可能**互相把对方写进自己的 deps**——形成环。如果不允许环，协议会陷入"等你先 commit"的死锁。EPaxos 的设计是**允许环**，执行时统一用 SCC + seq 解开。

### 4. Quorum 大小的精妙权衡

经典 Paxos 要求 quorum 大小 > N/2（多数派交集非空）。EPaxos 的 fast path 要求更强：任意两个 fast quorum 的交集**至少包含一个非命题方副本**——这样才能保证两个并发命题方"看到"彼此。这就是 fast quorum = F + ⌊(F+1)/2⌋ 公式的来源。

## 实践案例

### 案例 1：跨地域写延迟

假设三副本部署在北京、上海、新加坡，客户端在新加坡。

```
Multi-Paxos（leader 在北京）：
  客户端 → 新加坡副本 → 北京 leader → 北京广播 → 北京收齐 → 回新加坡
  ≈ 2 × 新加坡-北京 RTT ≈ 100 ms

EPaxos：
  客户端 → 新加坡副本（命题）→ 新加坡副本广播 → 收齐两票 commit
  ≈ 1 × 新加坡-上海 RTT ≈ 30 ms（因为上海近）
```

**省了一半延迟**——前提是命令不冲突。

### 案例 2：依赖图执行

三条命令并发到达：

```
c1: PUT key=x value=1   命题方 R1
c2: PUT key=y value=2   命题方 R2
c3: PUT key=x value=3   命题方 R3
```

c1 和 c3 操作 x，互相干扰；c2 与谁都不冲突。EPaxos 推出依赖：

```
c1 deps = {}    seq = 0
c2 deps = {}    seq = 0
c3 deps = {c1}  seq = 1
```

执行图：c1 → c3，c2 独立。所有副本都按这个顺序执行，得到一致状态。

### 案例 3：fast path 落空

如果两个命题方**同时**提议冲突命令：

```
R1 提议 c1: PUT x=1（认为 deps={}）
R2 提议 c2: PUT x=2（认为 deps={}）
```

它们并发广播，副本收到后会发现两边的 deps 不一致——fast path 失败。两个命题方都进入 slow path，重新协商谁的 deps 包含谁，**多花一个 RTT**。

## 踩过的坑

1. **fast quorum 大小有讲究**：优化版 fast quorum = F + ⌊(F+1)/2⌋。3 副本 F=1 → fast=2；5 副本 F=2 → fast=3（与 slow 的 F+1=3 相同）。N 再大时 fast 往往严于多数派，冲突或慢节点下更难走满 fast path；3 副本通常最甜
2. **依赖追踪是工程深坑**：随冲突率上升，依赖集合非线性膨胀；执行端要算 SCC，热点 key 上 SCC 可能很大
3. **故障恢复路径复杂**：副本挂掉时新命题方要跑 explicit prepare 协议，把"未决命令"的状态对齐——比 Multi-Paxos 的 leader 选举复杂得多
4. **Accord（CockroachDB / Cassandra）花了 5+ 年才稳定**——理论 1 RTT 漂亮，工程要处理时钟、跨 shard 事务、流控、回放，每一项都不简单
5. **同 DC 内不一定划算**：本地 RTT 已经低到 1ms 量级，Multi-Paxos 的 2 RTT 也只有 2ms，依赖图开销可能反而拖累

## 适用 vs 不适用场景

**适用**：

- 跨地域 / 跨可用区强一致复制——客户端能就近 commit 是杀手级优势
- 写负载分散（不集中在某些热点 key）——fast path 命中率高
- 需要避免 leader 单点故障的高可用场景——任何副本挂掉，其他副本继续接收命令

**不适用**：

- 同 DC 内毫秒级 RTT——Multi-Paxos / Raft 的 2 RTT 已经够快，没必要承担 EPaxos 的复杂度
- 高冲突 workload（购物秒杀、单计数器）——fast path 几乎不触发，退化到 slow path 还多了依赖追踪的成本
- 团队工程能力一般——Raft 工业实现已经成熟（etcd / Consul / TiKV），EPaxos 实现门槛高一档

## 历史小故事（可跳过）

- **2013 年**：Iulian Moraru 在 CMU 跟 David Andersen（FAWN 论文作者）和 Intel Lab 的 Michael Kaminsky 合作，为 SOSP 投了这篇论文。当时业界刚被 Raft（同年问世）"Paxos 难懂"的 narrative 抓住注意力，EPaxos 反其道——不是简化 Paxos，而是更激进地重构
- **2014–2018**：学术界陆续出 Tempo / Caesar / Atlas，都是想把 EPaxos 的 fast path 延迟再压一压
- **2019 年起**：CockroachDB 团队开始研究 Accord 协议，2023 年 Cassandra Accord 进入主线——EPaxos 的工业落地用了**整整十年**

## 学到什么

1. **leader 不是共识的必需品**——这是过去十年分布式系统最重要的认识之一
2. **冲突感知**让协议有了"分支"：不冲突走快路，冲突走慢路。这种"乐观执行"思想后来在事务系统（OCC）、CRDT、协作编辑里反复出现
3. **理论漂亮 ≠ 工程容易**：1 RTT commit 的承诺背后是依赖图、SCC、故障恢复的复杂工程
4. **协议设计的代价分布**：EPaxos 把 Multi-Paxos 的"leader 协调"代价均摊到每条命令的"依赖追踪"上——总体功夫没变少，只是换了形态

## 一句话总结

**EPaxos 把"谁来主导共识"从 Multi-Paxos 的"一个固定 leader"改成"任何副本都行"，代价是引入命令依赖图——不冲突的命令换来 1 RTT，冲突命令付出依赖追踪的工程复杂度。**

## 延伸阅读

- 论文 PDF：[EPaxos SOSP 2013](https://www.cs.cmu.edu/~dga/papers/epaxos-sosp2013.pdf)（16 页，前 6 页足够理解核心）
- 工业落地：[CockroachDB Accord](https://www.cockroachlabs.com/blog/) / [Cassandra Accord CEP-15](https://cwiki.apache.org/confluence/display/CASSANDRA/CEP-15)
- 改进版：[Tempo](https://www.usenix.org/conference/atc21/presentation/enes) / [Atlas](https://arxiv.org/abs/2003.11789)
- 对比阅读：[[raft-2014]] —— Raft 把 Multi-Paxos 工程化清晰化的另一条路
- 视频：Iulian Moraru SOSP 2013 现场演讲（YouTube 搜 "EPaxos SOSP"）

## 关联

- [[raft-2014]] —— 同年问世的另一条路：保留 leader 但简化协议
- [[paxos-1998]] —— EPaxos 的祖宗，所有 quorum 思想的源头
- [[spanner-2012]] —— Google 全球强一致 DB，用 Multi-Paxos + TrueTime；EPaxos 是不依赖时钟的另一种解法
- [[crdt]] —— 同样用"冲突感知"思想，但走最终一致而非强一致路线
- [[occ]] —— 乐观并发控制，与 EPaxos fast path 共享"先乐观、冲突再回退"的设计哲学

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[borg-omega-kube-2016]] —— Borg / Omega / Kubernetes — Google 调度器三代同源
- [[flexible-paxos-2016]] —— Flexible Paxos — 两阶段不一定都要多数派
- [[janus-2016]] —— Janus 2016 — 把并发控制和共识捏成一个协议
