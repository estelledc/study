---
title: Janus 2016 — 把并发控制和共识捏成一个协议
来源: 'Mu, Nelson, Lloyd & Li, "Consolidating Concurrency Control and Consensus for Commits under Conflicts", OSDI 2016'
日期: 2026-05-30
分类: 分布式系统
难度: 高级
---

## 是什么

Janus 是一篇 OSDI 2016 论文，说的事情用一句话讲：**别再分两层做事务，并发控制和共识其实可以一次搞定**。

日常类比：

- 你和五个朋友合开一家店，每天结账要双重确认——先在自己店里"确认完成"（共识），再和其他几家"确认本地数据一致"（事务提交）。两件事其实在问同一个问题（"今天大家都同意吗"），却要分两轮通信。
- Janus 说：把两件事**写在同一张确认单上**。无冲突时一次电话搞定；有冲突时再追一通电话。

技术上的对照：

- 主流分布式数据库（Spanner、Percolator）= 上层跑 **2PC**（两阶段提交，做跨分片事务）+ 下层每个分片内部跑 **Paxos/Raft**（做副本一致）
- Janus = **一个协议**同时担两份活，无冲突 1 个 RTT，有冲突 2 个 RTT

## 为什么重要

不理解 Janus，下面这些事都没法解释：

- 为什么 Spanner 一次跨区事务要 4 个 RTT 起步——上层 2PC 两阶段、下层 Paxos 各嵌一轮
- 为什么 EPaxos（Moraru 等人，SOSP 2013）只解决了"一个操作"的复制，留了"一组操作（事务）"的坑给 Janus 用同类依赖图思路去填
- 为什么"分层架构"在 OS 教材里是真理，在分布式系统里有时候反而是性能杀手
- 为什么数据库圈和共识圈到 2016 年才正式握手——之前两边各自演化，互不串门

这篇论文是"协议合并"思路的代表作，后面 TAPIR、SLOG、Carousel 都是这条线的继承人。

## 核心要点

Janus 的关键三步：

1. **客户端打包**：客户端把整个事务（读哪些 key、写哪些 key、按什么逻辑算）作为**一段 stored procedure** 一次发给协调者。这一步限制了适用范围，但换来了协议简化的空间。

2. **pre-accept 阶段**：协调者把事务发给所有相关分片的所有副本。每个副本：
   - 把这个事务记下来，并标注**它依赖哪些已记录的冲突事务**（依赖图的边）
   - 立刻回包带上自己看到的依赖
   - 这一步类比：每家店把"今天又要做的这单"写进自家小本，并标注"这单和昨天那笔有冲突"

3. **决议阶段**（分快慢两条路）：
   - **快路径（fast path）**：所有副本回的依赖图**完全一致** → 协调者发 commit，**一共 1 个 RTT**
   - **慢路径（slow path）**：依赖图不一致 → 协调者跑一轮 accept 把"统一后的依赖图"再下发一次 → commit，**一共 2 个 RTT**

执行阶段：每个副本独立按依赖图做**拓扑排序**（环按确定规则打破），按这个顺序执行事务。**因为所有副本看到同样的图、用同样的规则破环，结果也一样**——这是 Janus 不用一次次回头协调"该谁先"的关键。

## 实践案例

### 案例 1：经典 4 RTT 是怎么来的

Spanner 跨两个分片做转账，简化算一下：

```
客户端 → 协调者
  ├─ Paxos: prepare    (1 RTT, 写 prepare log 到分片 A 的副本)
  ├─ Paxos: prepare    (1 RTT, 写 prepare log 到分片 B 的副本)
  ├─ 协调者收齐 prepare
  ├─ Paxos: commit     (1 RTT, 写 commit log 到分片 A 的副本)
  └─ Paxos: commit     (1 RTT, 写 commit log 到分片 B 的副本)
```

实际可以并行，但**关键路径**还是 2 次 Paxos × 2 阶段 = **至少 4 个消息延迟**。

Janus 的同样事务：

```
客户端 → 协调者 → 所有相关副本（一次广播）
  ├─ pre-accept (1 RTT, 副本回依赖图)
  └─ 协调者发现依赖图一致 → 直接 commit（无额外 RTT，piggyback）
```

无冲突时：**1 个 RTT 解决**。这就是论文里 "consolidating" 的字面意思。

### 案例 2：依赖图是怎么"自动"决定顺序的

两个事务：

- T1: 读 x，写 y
- T2: 读 y，写 x

副本 A 收到：T1 先到 → 标注 "T1 没依赖"；然后 T2 到 → 标注 "T2 依赖 T1"
副本 B 收到：T2 先到 → 标注 "T2 没依赖"；然后 T1 到 → 标注 "T1 依赖 T2"

两个副本看到的依赖图**不一样**——走慢路径。协调者把 "{T1↔T2 互相依赖}" 这个统一后的图下发，所有副本看到环就用同一个规则破（比如按事务 ID 字典序），就达成一致。

### 案例 3：和 EPaxos 的关系

EPaxos（Moraru / Andersen / Kaminsky，SOSP 2013）是共识层的依赖图协议——只复制单个命令，不做跨分片事务。Janus（不同作者团队）把同类"依赖图 + 拓扑排序"思路推广到**多操作事务 + 跨分片**。换句话说：EPaxos 解决命令级共识，Janus 在统一协议里同时做事务排序与副本一致。

## 踩过的坑

1. **只支持 one-shot 事务**：客户端必须**一次性**把整个事务逻辑打包发出去（stored procedure / 预定义函数），不能"读一下，看结果再决定下一步读什么"的交互式事务。这是 Janus 适用范围最大的限制。

2. **依赖图通信量**：副本回包要带上自己的依赖集，事务多了之后这个集合可能变大。论文里有截断和压缩策略，但不是免费午餐。

3. **冲突率高时优势缩水**：所有走快路径的协议（Janus、EPaxos、Fast Paxos）都吃这个亏——冲突一多就得走慢路径，原本 1 RTT 优势变成和 2-RTT 协议一样。论文实验显示在 Retwis、TPC-C 这类有冲突但不极端的负载里，Janus 比 OCC+Paxos 提速 2-5 倍。

4. **副本要独立按拓扑排序执行**：实现要保证所有副本破环规则严格一致——任何随机化、时间戳、本地时钟的影响都要规避。工程上很容易出 bug。

## 适用 vs 不适用场景

**适用**：

- 跨分片事务多、网络延迟高（跨数据中心）的 OLTP
- 事务可以预编译成 stored procedure（典型 OLTP benchmark：TPC-C、Retwis）
- 中低冲突负载——大多数事务能走快路径

**不适用**：

- 交互式事务（应用读了再决定怎么写） → 用 Spanner / CockroachDB（Calvin 同样偏 one-shot）
- 极高冲突负载 → 走慢路径就和传统 2PC+Paxos 持平
- 数据中心内（RTT 已经亚毫秒，省那一轮收益不大） → 用 Percolator / TiDB 这种简单分层方案
- 需要 SI / 可序列化以外语义 → Janus 提供的是 strict serializability

## 历史小故事（可跳过）

- **2007 年 Sinfonia**：把事务推进存储侧（远端原子操作 minitransaction），是"协议简化"思路的早期代表
- **2010 年 Calvin**：决定论复制——所有副本按同样确定顺序执行事务，跳过 2PC
- **2012 年 Spanner**：商业化双层架构（Paxos + 2PC + TrueTime）的标杆，全球部署但延迟受双层叠加之苦
- **2013 年 EPaxos**：Moraru 等人把"依赖图 + 快慢路径"用在共识层（与 Janus 作者不同）
- **2016 年 Janus**：Mu / Nelson / Lloyd / Li 借鉴同类依赖图思路，把并发控制和共识合二为一
- **2018+ 年**：TAPIR、Carousel、Meerkat 等继续往"更少协议层"方向卷

之后这条线的研究普遍放弃"分层洁癖"，承认"协议合并能省 RTT"的工程现实。

## 学到什么

1. **分层不一定是好事**：OS 教科书里"每层只关心自己"是真理，但在分布式系统里两层做相似的事情就会重复花 RTT
2. **依赖图 + 确定性破环**是个非常强的工具——只要所有节点看到同样的图、用同样的规则，就不用再多一轮"该谁先"协调
3. **快慢路径思想**：常态优化 + 偶发兜底，是分布式协议设计的常用招数（Fast Paxos、EPaxos、Janus 一脉相承）
4. **限制换性能**：放弃交互式事务、要求 stored procedure，是 Janus 用来换 1-RTT 的代价；工程上要清楚自己买了什么、卖了什么

## 延伸阅读

- 论文 PDF（17 页）：[Janus OSDI 2016](https://www.usenix.org/system/files/conference/osdi16/osdi16-mu.pdf)
- 相关讲解：[Morning Paper 解读](https://blog.acolyer.org/2017/03/01/consolidating-concurrency-control-and-consensus-for-commits-under-conflicts/)（the morning paper 一贯的精读风格）
- [[epaxos-2013]] —— Janus 的直系前驱，单操作版本
- [[spanner-2012]] —— Janus 的"反例"，双层架构典型
- [[percolator-2010]] —— Bigtable + 客户端 2PC，另一种分层风格
- [[sinfonia-2007]] —— 把事务下推到存储侧的早期尝试

## 关联

- [[epaxos-2013]] —— 2013 依赖图共识前驱；Janus 借鉴其思路从"复制单操作"推广到"复制事务"
- [[spanner-2012]] —— 双层架构（Paxos + 2PC）典型，Janus 反对的对象
- [[percolator-2010]] —— Bigtable 上的客户端 2PC，另一种分层范式
- [[sinfonia-2007]] —— 远端原子操作，"把协议下沉到存储"的另一条思路
- [[paxos-1998]] —— Janus 取代的"上层 2PC 之下"的经典共识算法
- [[raft]] —— 工业界更常用的共识协议，Janus 同样在替代场景中针对它

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[epaxos-2013]] —— EPaxos — 没有 leader 的 Paxos，让每个副本平起平坐
- [[paxos-1998]] —— Paxos 1998 — 古希腊议会寓言里藏的共识协议
- [[raft]] —— Raft — 易理解的共识算法
- [[spanner-2012]] —— Spanner 2012 — 用原子钟和 GPS 给全球数据库发时间戳

