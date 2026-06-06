---
title: HotStuff — 让换领导也只花线性消息的 BFT 共识
来源: Yin et al., HotStuff BFT Consensus in the Lens of Blockchain, PODC 2019
日期: 2026-05-31
子分类: 共识与复制
分类: 分布式系统
难度: 中级
provenance: pipeline-v3
---

## 是什么

HotStuff 是一套**让一群互不信任的机器对一件事达成共识**的协议，专门针对"里面可能有少数节点撒谎或宕机"的场景。日常类比：100 个评委打分，知道其中 33 个可能造假，怎么让剩下 67 个稳稳得出公认结果？

它解决的具体痛点是经典 BFT 协议（如 PBFT）的两个老问题：

- **换领导太贵**：PBFT 在 leader 失联时要让所有节点两两通信，消息数 O(n²)；100 个节点就是 1 万条消息
- **不够响应**：必须按"最坏网络延迟"计时，网快也得等

HotStuff 把这两个都修了：换领导只需 O(n) 消息（线性），节点能按实际网速推进（responsive）。

## 为什么重要

不理解 HotStuff，下面这些事都没法解释：

- 为什么 Facebook 的 Libra（后来叫 Diem）、Aptos、Sui 这一票公链都用它做共识基础
- 为什么 BFT 共识在 2019 年之后突然能跑到几百个节点——以前 PBFT 卡在十几个就难以扩展
- 为什么"3-chain rule"成了新的共识设计模板——Tendermint、Casper、Diem-BFT 都是它的变体
- 为什么"换 leader"这件事从特殊事件变成了"和正常一轮没区别"——这是工程上最大的简化

## 核心要点

HotStuff 的关键创新可以拆成 **三件事**：

1. **QC（Quorum Certificate，法定证书）**：当 2f+1 个节点对同一个块签名，把这些签名**聚合成一张证书**（用门限签名）。原本要传 n 条独立消息，现在变成"leader 收齐后广播一张 QC"——这就把 O(n²) 压到 O(n)。

2. **3-chain rule（三连锁规则）**：一个块要被"承诺"（commit，不可撤回），必须有 3 个连续区块都拿到 QC 并接在它后面。前两轮（prepare、pre-commit）是"锁定"，第三轮（commit）才真正承诺。**少一轮都可能丢安全性**——这是 HotStuff 论文最精妙的证明。

3. **view-change 就是普通一轮**：传统 BFT 把"换 leader"做成单独的子协议（贵且复杂）。HotStuff 让每一轮都用同一个消息格式，新 leader 只是带着上一个 QC 进场——换不换 leader 走的代码路径几乎一样。

三件事加起来叫 **chained HotStuff**——也是工业部署最常用的版本。

## 实践案例

### 案例 1：QC 怎么把消息收成线性

PBFT 的 prepare 阶段每个节点要向**其他所有节点**广播自己的投票：

```
节点 A → B/C/.../n  (n-1 条)
节点 B → A/C/.../n  (n-1 条)
... → 总共 n*(n-1) 条 ≈ O(n²)
```

HotStuff 改成"所有节点只发给 leader"：

```
所有节点 → leader  (n 条)
leader 聚合签名 → 广播一张 QC → 所有节点  (n 条)
总共 2n 条 ≈ O(n)
```

100 个节点的差别：1 万条 vs 200 条，**50 倍**。

### 案例 2：3-chain rule 在防什么

假设网络分成两半，leader 切换频繁。一个块只走了 1 轮投票就被承诺，可能出现：

- 节点 A 看到块 X 拿到 QC1 → 承诺
- 节点 B 因为网络分区没看到 QC1，新 leader 提了块 Y 也拿到 QC → 承诺
- 两个块都被"承诺"了 → 安全性破裂

3-chain 规则说：**X 要被承诺，必须再有 X→X'→X'' 三连 QC**。中间任何一轮失败都重来，等于多两道闸门，把"两个块同时被承诺"的可能堵死。论文的 Theorem 1 给了完整证明。

### 案例 3：你能在 Diem/Aptos 源码里看到的影子

Aptos（Facebook 团队后续）的共识代码 `consensus/safety-rules` 里直接照搬 HotStuff 的状态机，每个区块带三个字段：`parent_qc` / `grand_parent_qc` / `great_grand_parent_qc`——这就是 3-chain。Sui 的 Mysticeti 是 HotStuff 的进一步优化（DAG 化），但承诺规则同源。

### 案例 4：四个阶段在干什么

完整一轮 HotStuff 走 4 个阶段：

1. **prepare**：leader 提出新块，把上一个 QC 也带上
2. **pre-commit**：节点确认这个块"合法"（链得上、签名对），投票给 leader
3. **commit**：leader 收齐 2f+1 票生成 QC，广播；节点把这个块"锁定"
4. **decide**：再一轮 QC 确认锁定没被推翻，节点真正承诺（写入本地状态机）

每一阶段都是一次"全员签名 → leader 聚合 → 广播"的循环，每一轮都是 O(n) 消息。

## 踩过的坑

1. **响应性 ≠ 永远最快**：HotStuff 在网络稳定时跑得很快，但 leader 失联时仍然要等"超时"才换人。这个超时还得保守设——设短了好节点被误判，设长了响应慢。论文里叫 pacemaker，工程上需要自适应调参。

2. **门限签名（threshold signature）是工程难点**：QC 聚合靠 BLS 等门限签名方案，密钥分发、密钥轮换、撤销都很麻烦。Diem 早期版本就因为门限签名问题推迟了上线。

3. **3-chain 增加延迟**：每个块要等 3 轮才承诺，意味着确认时间至少是 3 个网络 RTT。在金融场景这是劣势——比 Raft（多数派立刻 commit）慢。所以 HotStuff 主要赢在"恶意环境下扩展性"，不是"延迟"。

4. **理论假设：partial synchrony**：HotStuff 假设网络最终会变同步（GST 后），现实中遭遇持续不稳定的网络（如跨大陆链路）会反复触发 view-change，吞吐崩溃。要混 DAG 共识（Narwhal/Bullshark）才扛得住。

5. **签名安全性是新的攻击面**：HotStuff 把"投票"变成"签名聚合"，那么如果有人偷了节点的签名密钥，就能伪造 QC——攻击成本从"控制节点"变成"偷密钥"。Diem 因此把签名密钥放进 HSM（硬件安全模块），运维复杂度提升一档。

## 适用 vs 不适用场景

**适用**：

- 公链 / 联盟链共识层（节点 >50，需要扩展性 + 拜占庭容错）
- 跨机构数据库（央行 CBDC、清算系统、区块链托管）
- 需要"换 leader 不会卡住整个系统"的高可用场景

**不适用**：

- 节点 ≤ 5 的内部高可用（用 Raft 或 Paxos 更简单 + 延迟更低）
- 完全同步、可信节点的环境（拜占庭容错是浪费）
- 高频交易等延迟敏感（3-chain 增加 2 个 RTT）
- 节点数 > 1000 的大规模 P2P（需要分片或 DAG 类协议）

## 历史小故事（可跳过）

- **1999**：Castro & Liskov 发表 PBFT，第一个实用 BFT，但 O(n²) 卡住了扩展性
- **2014**：Tendermint 提出 lock-on-PoLC 的两阶段思路，是 HotStuff 的精神前身
- **2018-03**：Yin 等人在 arXiv 发出 HotStuff 初稿，Facebook 团队同时在内部用它造 Libra
- **2019-08**：HotStuff 正式登 PODC，拿了当年 best paper
- **2019-06**：Facebook 公开 Libra，共识层是 LibraBFT = chained HotStuff
- **2022-2024**：Aptos / Sui / Espresso / Monad 等几乎所有新公链都基于 HotStuff 变体

## 学到什么

1. **聚合签名（aggregation）是把 O(n²) 压到 O(n) 的关键工具**——背后数学是双线性配对（BLS）
2. **共识协议的"轮数"和"安全性"有权衡**——少一轮可能漏掉攻击场景，HotStuff 用 3-chain 找到了能证的最少
3. **把异常路径合并到正常路径，整个系统就简单了**——view-change = 普通轮 是工程哲学，不只是优化
4. **理论 → 工程 → 公链落地** 隔了不到 2 年——这是分布式系统少见的快速迭代
5. **统一框架的价值**：HotStuff 论文不是只造一个新协议，而是用同一套语言重写了 DLS / PBFT / Tendermint / Casper，让大家能"按指标对比"——这种"理论统一"工作往往比单点优化更有长期影响

## 延伸阅读

- 论文 PDF（17 页，含完整证明）：[HotStuff PODC 2019](https://arxiv.org/abs/1803.05069)
- Dahlia Malkhi 在 a16z 的讲解：[BFT and HotStuff intro](https://a16zcrypto.com/posts/podcast/dahlia-malkhi-blockchain-research/)
- Aptos 的 DiemBFT v4 白皮书：[diembft-v4.pdf](https://developers.diem.com/papers/diem-consensus-state-machine-replication-in-the-diem-blockchain/2021-08-17.pdf)
- 视频：[Decentralized Thoughts — HotStuff explained](https://decentralizedthoughts.github.io/2022-09-10-flavours-of-hotstuff/)（一图把 3-chain 说清楚）
- [[pbft-1999]] —— HotStuff 的直接前身，理解 O(n²) 痛点
- [[tendermint]] —— 思想前身，先提出 lock-on-PoLC

## 关联

- [[pbft-1999]] —— PBFT 是 HotStuff 优化的对象，理解它才知道线性化的价值
- [[tendermint]] —— Tendermint 的两阶段提交是 HotStuff 三阶段的精神原型
- [[paxos-1998]] —— Paxos 处理崩溃故障，HotStuff 处理恶意故障；前者是后者的"非拜占庭版本"
- [[raft-2014]] —— Raft 的清晰度是 HotStuff 的设计参考——leader-based + 简化 view-change
- [[move-language]] —— Diem/Aptos 上跑的智能合约语言，下面共识就是 HotStuff
- [[byzantine-generals]] —— Lamport 1982 的拜占庭将军问题是所有 BFT 协议的共同源头

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[move-language]] —— Move — 资源型智能合约语言
- [[narwhal-tusk-2022]] —— Narwhal & Tusk — 把 BFT 共识拆成『谁说过』和『谁先说』两件事
- [[paxos-1998]] —— Paxos 1998 — 古希腊议会寓言里藏的共识协议
- [[pbft-1999]] —— PBFT — 让拜占庭容错从理论变成能跑的工程
- [[rabin-ot-1981]] —— Rabin 遗忘传输 — 发送方永远不知道你收到了什么

