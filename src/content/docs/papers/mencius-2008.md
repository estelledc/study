---
title: Mencius — 让多台服务器轮流当 Paxos 的 leader
来源: 'Mao, Junqueira, Marzullo, "Mencius: Building Efficient Replicated State Machines for WANs", OSDI 2008'
日期: 2026-05-30
分类: 分布式系统
难度: 中级
---

## 是什么

Mencius 是 **Paxos 的一个变种**：原版 Paxos 长期只有一个 **leader**（领导者，负责发起所有写入提案）；Mencius 让 N 台服务器**轮流当 leader**，每台只负责一部分写入。

日常类比：餐厅原来只有一个收银员收钱（再多顾客都得排他那一队），Mencius 做的事是开 N 个收银台，按"奇偶号 / 1 号窗口收 1 4 7、2 号窗口收 2 5 8"分流，吞吐量直接乘以 N。

它解决的是 **WAN（跨数据中心）部署下 Paxos leader 那台机器先饱和**的问题。

## 为什么重要

不理解 Mencius，下面这些事都没法解释：

- 为什么 2008 年之后的共识协议（EPaxos 2013、Raft 2014、Spanner 的 Paxos group 分区）几乎都在讨论"怎么避免单 leader 瓶颈"
- 为什么跨数据中心数据库不能直接拿 Multi-Paxos 用——leader 所在机房的出口带宽和 CPU 都会先打满
- 为什么"无 leader 共识"是 2010 年之后的研究热点——Mencius 是这条路上的第一篇严肃论文
- 为什么工业界最后选了 Raft（单 leader、简化）而不是 Mencius（多 leader、复杂）——这本身是个值得想清楚的取舍

## 核心要点

Mencius 把 Paxos 改造的过程可以拆成 **三步**：

1. **实例号预分配**：每个共识实例（一次写入）有一个全局编号 0, 1, 2 …。Mencius 让服务器 i 只**拥有** i, i+N, i+2N… 这些号——只有它能在自己那批号上发提议。

2. **skip 消息**：i 号服务器手头没写入要做时，**主动发一个 "skip" 让那个槽位空过去**，避免后面的人卡住等它。类比：餐厅 1 号窗口暂时没顾客，要喊一声"我这没人，下一桌走 2 号窗口"。

3. **revoke / 接管**：如果 i 号挂了或太慢，其他服务器走标准 Paxos 的 prepare 流程，**抢过那批实例的主导权**——本质退化成 Multi-Paxos 的 leader 切换。

正确性靠底层 Paxos 自己保（每个实例都跑完整 Paxos），创新在**调度层**：怎么把多个 Paxos 实例分给多个 leader 同时跑。

### 一致顺序怎么保

所有副本要按**实例号顺序**应用（apply）——这样状态机最终一致。0、1、2、3 … 依次进 commit 队列；任何一个号没决议就卡住后面。skip 就是为了不让"我手头没活"变成阻塞——它本质是一个空操作的决议，让槽位"通过"。

## 实践案例

### 案例 1：3 台服务器跨 3 个机房（伪代码时序）

服务器 A（北京）、B（上海）、C（深圳）；N=3，A 拥有 0,3,6…，B 拥有 1,4,7…，C 拥有 2,5,8…。

```text
# 客户端就近写入
client_bj.submit(req) -> A.propose(instance=0, value=req)
client_sh.submit(req) -> B.propose(instance=1, value=req)
client_sz.submit(req) -> C.propose(instance=2, value=req)

# 每台只在自己的实例号上跑完整 Paxos；按 0,1,2… 顺序 apply
```

**对比 Multi-Paxos**：所有客户端都得绕到唯一 leader（比如 A）→ 上海/深圳多一个跨机房 RTT，A 出口带宽先打满。

**Mencius 收益**：写负载摊到 N 台；本地客户端常能在 1 个 WAN RTT 量级完成提议路径。

### 案例 2：B 暂时没写入要做

时间 t1：A 提议了 0 号，C 提议了 2 号，但 1 号是 B 的，B 现在闲着。

```text
# 若不发 skip：0、2 已决议也无法 apply（状态机要按实例号顺序）
B.skip(instance=1)          # 空操作决议，让槽位通过
apply(0); apply(skip); apply(2); ...
```

### 案例 3：B 挂了

B 不发 skip 也不发提议 → A、C 等不到 1 号 → 卡住。

```text
A.revoke(instance=1)        # 走 Paxos prepare，抢过该实例主导权
A.propose(instance=1, no-op或别的请求)
# 系统继续推进 —— 等于「B 这个班次被同事顶上」
```

### 案例 4：消息合并的工程小技巧

实际跑起来 skip 消息很多（每个 leader 没事就要发一堆 skip 给其他 leader 让位）。论文做了**批量合并**：把"我接下来 K 个槽位都不要了"打包成一条 skip(start, K)，避免消息风暴。这是个看起来小但很实用的优化——单 RTT 里少走几百条小包。

## 踩过的坑

1. **慢节点拖累整体**：N 台里只要一台慢，commit 点就推不到它后面。要么发 skip，要么被 revoke——而 revoke 本身要消息往返。这个**木桶效应**在 EPaxos（2013）里被作者们再次提到，是 Mencius 的主要软肋。

2. **实现复杂度**：Multi-Paxos 一个状态机，Mencius 每台机器要管"自己的批号 + 别人的批号 + skip 时机 + revoke 接管"——状态多了一倍，工程同事容易写错边角。

3. **网络对称假设**：Mencius 假设各数据中心间链路质量差不多。如果有一条链路特别慢，那个数据中心的 leader 频繁需要被 revoke，多 leader 退化成单 leader。

4. **客户端要选对 leader**：客户端必须连到"离自己最近"的服务器才有收益，不然多 leader 没意义。这要求**应用层有路由策略**，不是协议层免费送的。

## 适用 vs 不适用场景

**适用**：

- 跨数据中心部署，客户端地理分散，希望就近写入
- 写入吞吐受单 leader 带宽 / CPU 限制
- 各副本机器配置和网络对称
- 工程团队能消化"多 leader 调度"的复杂度

**不适用**：

- 单数据中心 LAN（Multi-Paxos / Raft 的 leader 不会先饱和）
- 工程团队偏向稳健（用 Raft，少踩坑）
- 写入热点高度集中在某个客户端 / 某个 key（多 leader 也只一个在干活）
- 链路质量参差大（频繁 revoke 反而更慢）

## 名字由来（小八卦）

作者解释取名 "Mencius"（孟子）——Paxos 是希腊岛名（Lamport 的玩笑），他们想要一个**与之并列**的东方哲人名字，又能暗示"轮流当 leader"的"礼让"意味。学术圈里这种命名小心思偶尔出现，本身不是协议的一部分。

## 历史小故事（可跳过）

- **1998 年**：Lamport 发表 Paxos（[[paxos-1998]]），描述晦涩，工业界吐槽"看不懂"
- **2001 年**：Lamport 写 [[paxos-simple-2001]] 想把 Paxos 讲清楚，仍然只有单 leader
- **2006 年**：[[fast-paxos-2006]] 减少消息轮次，但 leader 瓶颈没解决
- **2008 年**：Mao、Junqueira、Marzullo 在 OSDI 发表 Mencius——**第一次系统性地拆掉单 leader**。论文名字取自孟子，作者解释 "Paxos 是希腊岛、Mencius 是中国哲人，并列暗示多 leader"
- **2013 年**：EPaxos 走得更激进——彻底去掉 leader 概念，用命令依赖图替代轮转
- **2014 年**：Raft 反向选了**简化**单 leader 的路，工业界采纳更广

## 关键数据（论文实测）

论文用 **NetEm 仿真 WAN**（不是真把节点扔到五大洲），典型设置约 50 ms 单向延迟、限带宽链路：

- 网络瓶颈、三站点：Mencius 约 **1550 ops/s**，Paxos 约 **540 ops/s**（受单 leader 出口带宽限制，约 1/3）
- 扩到五站点（ρ=4000）：Mencius 约 **360 ops/s**，Paxos 约 **75 ops/s**——多 leader 仍明显更吃得开总带宽
- 低负载时，客户端连本地 leader，commit 延迟可接近 **一个 RTT**；Paxos 非 leader 站点常要多一跳学到结果
- LAN / 单机房：leader CPU/带宽未饱和时，Mencius 的 skip 协调开销可能抵消收益

数字随拓扑和限速参数变；记住结论即可：**WAN 带宽被单 leader 绑死时，轮转 leader 把吞吐摊开。**

## 学到什么

1. **共识协议的瓶颈往往不在算法，在拓扑**——Paxos 算法本身能并行，是"单 leader"的工程实现把它绑死
2. **预分配 + 调度** 是解决"共享资源争抢"的通用思路——磁盘块分配、CPU 时间片、网络队列都用过
3. **正确性可以分层**：Mencius 的一致性靠底层 Paxos 实例各自保证，上层只管"谁干哪批活"——这是**协议组合**的好例子
4. **复杂度是工程界的硬通货**：理论上更优的 Mencius 没赢过更简单的 Raft，说明"可读性 / 可调试性"也是一种性能
5. **WAN vs LAN 不是同一个游戏**：Mencius 在 WAN 闪光，在 LAN 反而拖慢。设计协议要先问"部署拓扑长什么样"，不要默认 LAN 假设

## 延伸阅读

- 论文 PDF：[Mencius OSDI 2008](https://www.usenix.org/legacy/events/osdi08/tech/full_papers/mao/mao.pdf)（14 页，正文不长）
- 视频讲解：MIT 6.824 分布式系统课的 Paxos / Raft 系列（YouTube 公开课，Robert Morris 主讲）
- 后续工作：[EPaxos SOSP 2013](https://www.cs.cmu.edu/~dga/papers/epaxos-sosp2013.pdf)（彻底去 leader，用命令依赖图代替轮转）
- 综述对比：Howard 等 2020《Paxos vs Raft》——把单 leader / 多 leader 这条线梳理清楚
- [[paxos-1998]] —— Mencius 的底座
- [[raft]] —— 工业界选的另一条路（保留单 leader，简化协议）

## 关联

- [[paxos-1998]] —— 单 leader Multi-Paxos，Mencius 想优化的对象
- [[paxos-simple-2001]] —— Paxos 的"易读版"，Mencius 论文里假设读者读过它
- [[fast-paxos-2006]] —— 同期另一种优化，减少消息轮次而非 leader 数
- [[raft]] —— 反向走"简化单 leader"的路，工业接受度更高
- [[lamport-1978]] —— 分布式系统里"事件顺序"概念的起源，Mencius 实例号本质是逻辑时间

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）
