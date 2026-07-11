---
title: Paxos Made Simple — Lamport 用平直英语把共识协议推导一遍
来源: 'Leslie Lamport, "Paxos Made Simple", ACM SIGACT News 2001'
日期: 2026-05-30
分类: 分布式系统
难度: 中级
---

## 是什么

Paxos Made Simple 是 Lamport 2001 年写的 14 页 PDF，对自己 1998 年那篇被吐槽难懂的《The Part-Time Parliament》的"用人话再讲一遍"。日常类比：原版像一本用古希腊神话写的物理教科书，三年后作者本人挠头重写成中文白话——内容没变，门槛降一截。

论文开篇 abstract 只有一句："The Paxos algorithm, when presented in plain English, is very simple." 副标题"Made Simple"等同直接认错。正文不再绕岛屿议会的寓言，而是从"我们想要什么 safety 性质"开始，一步一步推导出协议**为何长成那样**——"the algorithm follows almost unavoidably from the properties we want"。

工业界实际读的 Paxos 是这一份。Chubby / ZooKeeper / etcd / Spanner 一代工程师真正能读完的，都是这 14 页，不是 1998 那 36 页寓言版。

## 为什么重要

不理解 Paxos Made Simple 的推导路径，下面这些事都没法解释：

- 为什么 prepare 一定要带"承诺不再接受 < n 的提议"——这是 P2c 不变量逼出来的，不是工程师拍脑袋
- 为什么 proposer Phase 2 多数时候不能自由选值——promise 里若有旧接受记录，必须 replay 其中编号最高的值；只有多数派全空才能自选
- 为什么"single-decree synod"和"state machine replication"必须分两层讲，混在一起就讲糊
- 为什么 distinguished proposer（leader）属于 liveness 优化，**safety 不需要 leader 也成立**
- 为什么"用 no-op 命令填日志空洞"是 Lamport 在论文里写的，而不是工程师补的发明

读懂这份，再看 [[raft]] / [[chubby]] / [[spanner]] 才不至于把工程补丁误当成协议本体。本文与 1998 寓言版的最大区别：**它把推导链显式写出来，而不是只展示结果**。

## 核心要点

Lamport 在这篇里把整个推导链拆成 **五步**，每一步只解决前一步暴露的一个矛盾：

1. **safety 母条件 P1 + P2**：P1 要求"acceptor 必须接受第一个收到的提议"（否则只提一个值也可能永远选不出）；P2 要求"如果 v 被 chosen，所有更高编号的 chosen 提议也必须是 v"（保一致）。两条像物理基本定律。

2. **从 P2 反推到 P2c**：P2 → P2a → P2b → P2c 一步步加强。P2c 的精确表述是："对任意 v 和 n，如果一个编号 n、值 v 的提议被 issued，那么存在一个多数派 S，要么 S 里没人接受过 < n 的提议，要么 v 是 S 里所有 < n 提议中编号最高那个的值。"——P2c 把"未来"问题压回成"现在能查询的事实"。

3. **从 P2c 推出 prepare/accept**：proposer 要满足 P2c，就必须先问多数派"你接受过什么"——这就是 prepare/promise；拿到回答后**有记录就 replay 最高编号值，全空才能自由提新值**——这就是 accept/accepted。**整个协议是 P2c 不变量的强制推论，不是设计选择**。

4. **最后才出现 leader**：Lamport 在 §2.4 Progress 才引出 distinguished proposer，并明确"safety 与 leader 选举的成败无关"。这是这份论文最常被工程师忽略的一句话。

5. **§3 才讲 SMR**：把 single-decree synod 套到一长串 log slot 上，每个 slot 跑一次 Paxos 实例。leader 一次发 Phase 1 给所有未来 slot，正常态下每条命令只走 Phase 2 一个 RTT——§3 短短几页把"理论极简骨架 + 工业必加优化"拼齐。

## 实践案例

### 案例 1：从 P1 + 多数派到 P2c

```
P1: acceptor 必须接受第一个收到的提议（不然永远没人 chose）
+
多数派交集（任意两个多数派至少 1 个 acceptor 重叠）
=
acceptor 可能接受多个提议（不同 ballot 编号）
→ P2: 高编号 chosen 必须复读低编号的值
→ P2a: 高编号 accepted 必须复读
→ P2b: 高编号 issued 必须复读
→ P2c: issued 时存在多数派 S，要么 S 全空，要么 v 是 S 内最高
```

整个推导链 4 步，论文用 1 页讲完。注意终点 P2c 的双分支：多数派 S **全空** → Phase 2 可自由选值；S 里**有旧接受记录** → 必须 replay 最高编号值。这就是为什么 Lamport 说"follows almost unavoidably"——加强"任谁来读都只能想到这一种协议"的姿态。读者不是被告知协议，而是被牵着手一起推出来。

### 案例 2：single-decree synod 与 multi-paxos 的桥接

```
Single-decree Paxos: 选 1 个值
   ↓ × N
Multi-Paxos: 第 i 次实例选第 i 条命令
   ↓
State Machine Replication（论文 §3）
   ↓
Chubby / ZooKeeper / etcd
```

Lamport 第 8 页一句话："we implement a sequence of separate instances of the Paxos consensus algorithm, the value chosen by the i-th instance being the i-th state machine command。" 这句话被工业界引用了 25 年。SMR 思想本身要回到 Lamport 1978 年另一篇 *Time, Clocks*（论文里第 4 号引用），所以这条桥不是 2001 才出现，而是把两条 23 年前就有的成果拼起来。

### 案例 3：α 个 in-flight + no-op 填洞

```
leader 完成 Phase 1 (一次发给所有未来 slot)
↓
slot 141, 142 直接发 Phase 2（不再走 Phase 1）
↓
若 slot 138 提议丢失留下 gap → 用 no-op 填补 → 后续 slot 可执行
```

leader 一次跑无穷多个 slot 的 Phase 1（每个 acceptor 用一条短消息 OK 全部）。新 leader 上任时 replay 已知 chosen 值 + no-op 填空洞——这套是 Lamport 在 §3 给的，不是工程师后补。论文里写 "a leader can get α commands ahead"——α 是配置上限，决定 leader 失败时最多漏掉多少 slot。Chubby / Spanner 一类 Multi-Paxos 实现在调这个窗口；etcd 走 Raft，流水线窗口是同类工程旋钮，不是字面 α。

## 踩过的坑

1. **把 Paxos Made Simple 当 hands-on 实现指南**——Lamport 在 §3 末尾自己写"假设服务器集合不变"；工业实现 70% 工程量都在论文外（leader 选举细则、log compaction、成员变更、网络分区下行为）。Chandra-Griesemer-Redstone 的 *Paxos Made Live* 才是真实施工手册。

2. **漏读 P2c 的双分支语义**——Phase 2 输入并非自由选择，而是"sees-then-replays"：promise 回应里若有 < n 的接受记录，proposer 必须用其中**编号最高**那个的值，不能用自己原本想提的。这条被忽略 → safety 立刻破。

3. **误以为 simple 等于一目了然**——Lamport 的 simple 指**推导路径短**（P1+P2 → P2c → 协议），不是直觉门槛低。读完仍需在白板上画过 prepare/promise 才真懂。每年 6 月毕业季都有新工程师踩坑。

4. **把 distinguished proposer 当算法核心**——leader 选举只属于 liveness 优化。Lamport 明确写"safety is preserved——two different servers will never disagree on the value chosen as the i-th state machine command"。区分 safety 与 liveness 是阅读这篇的关键。

## 适用 vs 不适用场景

**适用**：

- 学习共识协议第一份必读材料（比 1998 寓言版友好得多）
- 给团队做"为什么 Paxos 长成这样"内部分享——推导链清晰可复述
- 理解 Multi-Paxos 与 SMR 的关系——§3 短文把工程蓝图讲清
- 校准对 [[raft]] 的认知——Raft 的"易懂"标的就是这份 2001

**不适用**：

- 真正动手实现——细节缺失太多，必须配合 *Paxos Made Live* 与开源 Raft/Paxos 实现看成员变更
- 拜占庭容错——本文模型明确是"non-Byzantine"，节点不撒谎
- 高吞吐流式数据——共识两阶段 + fsync 注定不是流处理协议
- 想看古希腊议会寓言——这篇恰恰拆掉了寓言

## 历史小故事（可跳过）

- **1989 年**：Lamport 在 DEC SRC 写完 Paxos 草稿，用古希腊议会寓言包装。
- **1990 年**：投稿被拒，论文塞抽屉。1996 年 Butler Lampson 在欧洲会议上重新讲述 Paxos，业界开始认真对待。
- **1998 年**：[[paxos-1998]]终于在 ACM TOCS 发表，但学术圈仍觉难懂。
- **2001 年 11 月**：Lamport 在 ACM SIGACT News 发 *Paxos Made Simple*，14 页平直英语。开篇副标题等同认错。
- **2006 年**：Burrows 写 *The Chubby Lock Service*——第一个公开 Paxos 工业部署，引用的就是这份 2001。
- **2007 年**：Chandra 等 *Paxos Made Live* 把工业实施补全；和本文配套读才完整。
- **2014 年**：[[raft]]论文标题《In Search of an Understandable Consensus Algorithm》，间接证明 2001 这份在 13 年后仍被认为"还不够简单"。
- **2025 年**：本文仍是分布式课最常布置的 14 页 PDF——比 1998 短一半，比 Raft 紧凑得多。

## 学到什么

1. **协议可以"推导"出来，不必"设计"出来**——Lamport 这篇示范：从 safety 需求出发用代数式推理，协议会自然涌现。这种叙述方式现在被很多 PL/分布式论文借鉴。

2. **simple 是一种持续抬高的标准**——2001 年的 simple 在 2014 年又被 Raft 当成竞品攻击点。"易懂"不是终点，每代教学都会重写一次。

3. **safety 与 liveness 是两个独立维度**——Paxos 选了"safety 永远成立 + liveness 在 leader 稳定时成立"。所有"我有更快共识"的宣称都要先看最坏情况下还能不能保 safety。

4. **作者认错比加注释更省力**——Lamport 没在 1998 论文里加脚注，而是另写一篇。这是技术写作里很贵但有效的一招：与其修补已有内容，不如承认旧版没说清，重新组织叙事路径。

## 延伸阅读

- [Paxos Made Simple PDF（14 页原文）](https://lamport.azurewebsites.net/pubs/paxos-simple.pdf) — 半小时能读完的版本
- [Paxos Made Live（Chandra-Griesemer-Redstone 2007）](https://www.cs.utexas.edu/users/lorenzo/corsi/cs380d/papers/paper2-1.pdf) — Google Chubby 团队 2007 年总结实施细节，对照本文读
- [Lamport 自传式介绍 Paxos 历程](https://lamport.azurewebsites.net/pubs/pubs.html) — Lamport 本人写的论文索引页带注释
- [Heidi Howard 的 Flexible Paxos 解读](https://fpaxos.github.io/) — 把多数派一般化为任意两个相交 quorum，是 P2c 的现代延伸
- [[paxos-1998]] —— 1998 年寓言版本，对照看推导路径与古希腊议会的差异
- [[raft]] —— 2014 年的"易懂"挑战者，承接 2001 这份的精神血脉

## 关联

- [[paxos-1998]] —— 同一协议的寓言原版；本文是它的"普通话翻译"，内容等价但表达路径短
- [[raft]] —— 13 年后的"易懂版共识"，本质是把 Multi-Paxos 的几个自由度锁死换可读性
- [[chubby]] —— 第一个公开引用本文的 Paxos 工业实现，给凡人用的分布式锁服务
- [[spanner]] —— Multi-Paxos 的最大规模工业部署，跨大洲全球数据库
- [[lamport-1978]] —— 同作者 23 年前的逻辑时钟论文，奠定异步消息推理的基本范式
- [[tigerbeetle]] —— 现代记账数据库，Multi-Paxos 派生协议的产品级实现
- [[bigtable]] —— 跑在 Chubby 之上的列式存储，证明 Paxos 抽象足以承载 PB 级业务

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[borg-2015]] —— Borg 2015 — Google 把一万台机器假装成一台
- [[borg-omega-kube-2016]] —— Borg / Omega / Kubernetes — Google 调度器三代同源
- [[fast-paxos-2006]] —— Fast Paxos — 给 Paxos 加一条乐观快车道
- [[flexible-paxos-2016]] —— Flexible Paxos — 两阶段不一定都要多数派
- [[flp-1985]] —— FLP 1985 — 一个坏节点就能让异步共识永不终止
- [[ironfleet-2015]] —— IronFleet — 把分布式协议证到一行 bug 都没有
- [[lamport-time-clocks-1978]] —— Lamport 逻辑时钟 — 分布式系统里先后顺序怎么说清楚
- [[lamport-tla-1994]] —— TLA — 把状态机和时序逻辑捏成一个公式
- [[linearizability-1990]] —— Linearizability 1990 — 让并发对象看起来像一次只执行一个操作
- [[mencius-2008]] —— Mencius — 让多台服务器轮流当 Paxos 的 leader
- [[raft]] —— Raft — 易理解的共识算法
- [[raft-2014]] —— Raft 2014 — 把共识拆成能实现的三件事
- [[sequential-consistency-1979]] —— Sequential Consistency 1979 — 多处理器内存模型的第一个正确性标准
- [[vr-1988]] —— VR 1988 — 用"主备 + 换届"做共识的另一脉
- [[vr-revisited-2012]] —— VR Revisited 2012 — VR 协议的"工程化重写版"
- [[zab-2011]] —— Zab — ZooKeeper 怎么把客户端写入按顺序复制到所有副本
