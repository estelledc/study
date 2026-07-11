---
title: Narwhal & Tusk — 把 BFT 共识拆成『谁说过』和『谁先说』两件事
来源: 'Danezis et al., "Narwhal and Tusk: A DAG-based Mempool and Efficient BFT Consensus", EuroSys 2022'
日期: 2026-05-31
分类: 分布式系统
难度: 高级
---

## 是什么

Narwhal & Tusk 是一对配套设计，告诉你**怎么让一群互不信任的节点又快又稳地达成一致**。

日常类比：想象 100 个法官要按时间顺序签发判决。

- **传统做法（HotStuff / PBFT）**：每次都选一个『主审法官』把案子念出来，其他人签字同意。主审一卡，所有人空等。
- **Narwhal 做法**：每个法官**自己写**当天的案子集合，挂到公告栏，**互相引用对方的公告**。
- **Tusk 做法**：等公告栏涨到一定厚度，按一个**全员都能算出**的固定规则读出顺序，**不需要再开会**。

把『把数据发到全网』（mempool）和『排出顺序』（consensus）**拆成两件事**——这就是 DAG-BFT 范式的起点。

## 为什么重要

不理解 Narwhal/Tusk，下面这些事都没法解释：

- 为什么 **Sui** 的高吞吐路线建立在 Narwhal 式 mempool 上，而不是把交易塞进 HotStuff leader 提案
- 为什么 **Aptos** 仍跑 Jolteon（HotStuff 系），却单独做了 Quorum Store——把 Narwhal 的『数据传播与排序解耦』思想接到 leader-based 共识前
- 为什么传统 BFT（PBFT、HotStuff、Tendermint）吞吐容易卡在 leader 带宽——提案路径与数据路径绑死
- 为什么一个节点掉线，**HotStuff 吞吐可崩到接近 0**，Narwhal+Tusk 在论文设定下几乎还能维持高吞吐

论文实测：HotStuff 故障下 throughput 崩到 0；Narwhal+Tusk 在同等故障下维持 **160k tx/s**，延迟 < 3 秒。

## 核心要点

### 把共识拆成两层

传统 BFT 把『发数据』和『排序』揉在一起：每个 round 都让 leader 既广播交易又主导投票。瓶颈就是 leader 的带宽和延迟。

Narwhal/Tusk 把这两件事**物理拆开**：

| 层 | 名字 | 职责 |
|---|---|---|
| 下层 | **Narwhal**（mempool） | 保证『某交易已经发到全网，且能被读出』 |
| 上层 | **Tusk**（consensus） | 在 Narwhal 给出的 DAG 上排顺序 |

### Narwhal：造一张『可证明已存在』的 DAG

每轮（round）每个验证人做三件事：

1. 把自己手头的交易打包成一个 **block**
2. 在 block 里**引用上一轮收到的 2f+1 个 certificate**（f 是最多容忍的恶意节点）
3. 把 block 广播出去；收到 2f+1 个签名后，block 升级成 **certificate of availability**——意思是『至少 2f+1 个诚实节点已经存了这份数据』

每轮的 certificate 互相引用，整体形成一张 **DAG**（有向无环图）。一旦你看到某个 certificate，**沿着它的引用回溯**，就能拿到完整的因果历史。

### Tusk：在 DAG 上做零通信排序

DAG 已经把『谁说过什么』全部记下来了。Tusk 的活就是：**给同一张 DAG，让每个节点独立地读出同一个顺序**——这一步**不发任何额外消息**，叫 zero message overhead。

规则（简化）：

- 每 3 轮叫一个 **wave**
- 每个 wave 通过共享随机数选一个 **leader block**
- 如果 wave 里有足够多 certificate **引用了这个 leader**，就提交它和它的所有因果历史
- 否则跳过，继续下个 wave

leader 不需要『主持开会』，因为 DAG 已经替它说完了所有话。

## 实践案例

### 案例 1：为什么 leader 卡住对 Narwhal 影响很小

HotStuff 流程：leader 收交易 → leader 广播 → 等 2f+1 vote → 下一个 leader。leader 网络一抖，**整条链停**。

Narwhal 流程：每个验证人**同时**在写自己的 block，互相引用。某一个节点慢了，DAG 仍然在长，因为别人不必等它——只要还有 2f+1 个能跑，就能继续。

### 案例 2：worker / primary 拆分让带宽线性扩展

Narwhal 把每个验证人内部再拆成：

- **primary**：负责签名、引用、参与协议（CPU 重）
- **workers**：负责接收和广播交易（带宽重）

加一台 worker 机器，吞吐就涨一截。HotStuff 加机器没用，因为 leader 仍然是单点。论文里 Narwhal 单 worker 推到 ~170k tx/s，10 worker 推到 **600k tx/s**。

### 案例 3：Sui / Aptos 怎么『抄作业』

- **Sui**：主线是 Narwhal mempool + [[bullshark-2022]]（Tusk 的部分同步版），再演进到 Mysticeti，把 commit 延迟从约 3 个 round 压到 1–2 个 round
- **Aptos**：生产共识长期是 **Jolteon**（HotStuff/Tendermint 快路径变体）；Narwhal 的影响主要在 **Quorum Store**（先散数据、共识只排元数据）。Bullshark/Shoal 是 Aptos Labs 的 DAG-BFT 研究线，不宜写成『主网现役共识就是 Bullshark』
- 共同点：都接受『数据可用性』和『排出顺序』分层；差别是上层用嵌入式 DAG 共识，还是继续用 leader-based 共识

## 踩过的坑

1. **DAG ≠ 区块链**：Narwhal 的 DAG 是 mempool 的内部数据结构，**不是最终账本**。最终账本是 Tusk 在 DAG 上读出的**线性顺序**。新人常把两者搞混。

2. **certificate 不等于 commit**：拿到 2f+1 签名只代表『这块数据全网都存了』，**不代表它已经被提交进账本**。提交是 Tusk 的活。Aptos 早期文档把这两个词混用过，导致开发者误以为 certificate 出现 = 交易已上链。

3. **wave 周期 = 至少 3 轮延迟**：Tusk 的 commit 至少要 3 个 round；理想 throughput 高，但单笔延迟比 HotStuff 长。Mysticeti 后来才把这个砍下来。

4. **随机数源是攻击面**：选 leader 用的共享随机数如果被预测，恶意节点可以提前组织『不引用 leader』的攻击。论文用 threshold signature 解决，工程上不简单。

5. **DAG 存储成本**：每个 certificate 都要持久化原始 block + 引用关系，长跑下来 DAG 历史巨大。生产里要做定期 garbage collection——Tusk 提交后的 block 可以删，但删的时机要算准。

## 适用 vs 不适用场景

**适用**：

- 高 TPS 公链 / 联盟链（Sui 主线；Aptos 的 Quorum Store 数据层；部分联盟链实验）
- 网络大体同步、偶有拜占庭节点，且更在乎吞吐而不是极限单笔延迟
- throughput >> latency 的场景（批量上链、可接受约 1–3s 量级最终性）

**不适用**：

- 节点数极少（n < 4）→ 用 Raft / Paxos 就够
- 要求**亚秒级 finality** → 看 Mysticeti / Jolteon 等低延迟变体，而不是原版 Tusk（wave ≥ 3 round）
- 完全异步网络 → 需要 DAG-Rider / Aleph 这类异步变种

## 历史小故事（可跳过）

- **2018**：HotStuff 把 PBFT 的复杂度从 O(n²) 降到 O(n)，被 Diem（前 Libra）选为共识。
- **2020**：Diem / Meta 团队发现 HotStuff 在工程上仍然撞 leader 瓶颈，开始做 mempool / consensus 解耦的研究原型。
- **2021-05**：Narwhal & Tusk 论文挂上 arXiv，作者主要来自 Mysten Labs（后来做 Sui）和 Novi（前 Diem 团队）。
- **2022-04**：论文正式发表在 EuroSys 2022。同年 Aptos 主网上线，生产共识走 Jolteon；Quorum Store / Bullshark 研究并行推进。
- **2023**：Sui 推进 Mysticeti，把 Narwhal 路线的延迟再往下压。

## 学到什么

1. **关注点分离**在分布式系统里也成立——把 mempool 和 consensus 拆开，吞吐量天花板立刻消失
2. **leaderless 不等于无序**——DAG 替你记录因果，leader 只用来挑哪个 wave 提交，不用主持广播
3. **零消息开销共识**听起来魔法，实际上是『把通信成本前置到 mempool 那一层』——总成本不变，但吞吐瓶颈被搬走了
4. **可证明可用性**（proof of availability）是 DAG-BFT 的核心安全保证，等价于 PBFT 的 prepare 阶段，但能被复用

## 延伸阅读

- 论文 PDF：[Narwhal and Tusk arXiv:2105.11827](https://arxiv.org/abs/2105.11827)
- 视频讲解：[George Danezis at EuroSys 2022](https://www.youtube.com/watch?v=K5ph4-7vvHk)（作者亲自讲，30 分钟）
- Aptos 工程博客：[Bullshark: DAG BFT Protocols Made Practical](https://medium.com/aptoslabs/bullshark-the-partially-synchronous-version-c9d76bbe2e87)
- Sui 演进：[Mysticeti: Reaching the Limits of Latency with Uncertified DAGs](https://arxiv.org/abs/2310.14821)
- [[hotstuff-2019]] —— Narwhal 想取代的对象，pipelined BFT 的代表
- [[pbft-1999]] —— BFT 共识的祖先，理解为什么 leader 是瓶颈

## 关联

- [[hotstuff-2019]] —— 上一代 leader-based BFT，被 Narwhal 用 throughput 数据正面对比
- [[pbft-1999]] —— BFT 共识鼻祖，Narwhal 的 certificate 概念直接来自它的 prepare 阶段
- [[tendermint-2016]] —— 同样是 leader-based BFT，被 Cosmos 采用，遭遇相同的吞吐瓶颈
- [[bullshark-2022]] —— Tusk 的部分同步版；Sui 曾用，Aptos Labs 有研究实现
- [[move-language]] —— Aptos / Sui 智能合约语言，跑在各自共识栈之上

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[tendermint-2016]] —— Tendermint — 把拜占庭共识塞进开放区块链的工程模板
