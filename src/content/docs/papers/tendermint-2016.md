---
title: Tendermint — 把拜占庭共识塞进开放区块链的工程模板
来源: 'Ethan Buchman, "Tendermint: Byzantine Fault Tolerance in the Age of Blockchains", MSc Thesis, University of Guelph, 2016'
日期: 2026-05-31
分类: 分布式系统
难度: 中级
---

## 是什么

Tendermint 是一套**让一群互不信任的节点对"下一块账本写什么"达成一致**的共识协议+引擎。日常类比：班里有 100 个学生轮流当值日生收作业，每天选出一个值日生把当天作业封进档案袋，剩下 99 个人投票"这袋我认"——只要超过 2/3 人签字，这袋作业就不可改了，哪怕值日生作弊也没用。

技术上它做的事：

- 把 1999 年的经典 BFT 共识（PBFT）从"参与者固定的银行内网"搬到"任何人质押代币就能进的开放链"
- 用 **Proof-of-Stake（PoS）** 决定谁能参与共识，作恶会被没收抵押
- 提供**秒级最终性**——块一旦被 +2/3 验证人确认就不可回滚，不像比特币要等 6 个确认还可能分叉

它是 Cosmos Hub、Binance Chain（BNB Beacon Chain）、Terra（历史）等几十条 PoS 链的共识底座。

## 为什么重要

不理解 Tendermint，下面这些事都没法解释：

- 为什么 Cosmos / Binance Chain 转账几秒钟就"到账"，而比特币要等十几分钟
- 为什么 Solana / Avalanche / Aptos 这些"高性能链"的设计文档反复提"Tendermint 的 1/3 上限我们要突破"
- 为什么 PoS 链总在讲"slashing"（罚没）——这套机制的工程模板就来自 Tendermint
- 为什么"应用层和共识层用 socket 解耦"会成为后来 Cosmos SDK 的标配（同类思路也影响了其他链框架）

它把 1999 年学院派的 PBFT 真正变成了一个能给陌生人开放注册的共识引擎，**这是 PoS 链工业化的关键拼图**。

## 核心要点

Tendermint 的一轮共识可以拆成 **3 步**（每步都要 +2/3 验证人投票）：

1. **Propose（提案）**：本轮轮值的验证人（按股权权重轮选）打包一批交易成块，广播给所有人。类比：值日生把今天作业封袋。

2. **Prevote（预投票）**：每个验证人检查这个块合不合法，合法就广播 prevote。看到 +2/3 的 prevote 后，节点把这个块"锁定"——下一轮还想换块？除非看到更高轮的 +2/3 prevote 解锁。

3. **Precommit（预提交）**：看到 +2/3 prevote 的节点广播 precommit。一旦看到 +2/3 precommit，块就**最终化**，不可回滚。

三步加起来叫**一轮（round）**。如果某步超时（比如轮值的人没出块），自动进入下一轮换人。这套"锁定 + 超时换轮"是 Tendermint 区别于 PBFT 的关键工程改动。

## 实践案例

### 案例 1：3f+1 容错具体什么意思

假设链上 100 个验证人，按 3f+1 公式，f = 33。意思是：

- **最多 33 个**作恶/掉线：链照常出块，且不会出现两个互相冲突的最终块
- **第 34 个起**作恶：BFT 数学保证失效——可能停摆，也可能被诱导出冲突最终化
- 工程上靠双签证据 + slashing 让"敢签两份"的人赔钱，把数学缺口补成经济威慑

设计哲学仍是**安全优先**：诚实方 ≥2/3 时宁可停摆也不分叉；超过 1/3 作恶时，安全与活性都可能坏掉。

### 案例 2：作恶为什么不划算（slashing）

```
验证人 Alice 抵押了 100 万代币
Alice 在同一轮对两个不同的块都签了 precommit（双签）
任何人捡起这两个签名提交到链上当证据
链上自动把 Alice 的 100 万代币没收（罚没 slashing）
```

这就是 PoS 的工程要点：**作恶必须留下密码学证据，证据可以被任何人变现成罚款**。比特币 PoW 没这条——你算错块顶多浪费电，账本不会罚你。

### 案例 3：ABCI 把共识层和业务层分开

```
[ Application（业务状态机，比如转账/合约） ]
            ↑ ABCI socket 协议
[ Tendermint Core（共识引擎，只管块顺序） ]
```

Tendermint 只负责"块顺序对所有人一致"，**不管块里装什么**。业务用任何语言写一个 ABCI server 接上来就行——Cosmos SDK（Go）、自写 Go/Rust ABCI、甚至 Python 玩具链都能接入。

把 ABCI 想成三步流水线（方法名只是挂钩）：

1. **进池前检查**：`CheckTx`——交易进 mempool 前先过业务校验
2. **执行交易**：`BeginBlock` → 每条 `DeliverTx` → `EndBlock`
3. **交状态根**：`Commit`——业务返回新状态根写进块

一份不到 200 行的 ABCI server 就能起玩具链，**这是工程友好度的核心来源**。

## 踩过的坑

1. **1/3 是硬上限**：超过 1/3 验证人合谋，安全与活性都可能失效，通常要人工介入。BFT 类协议的共同短板。

2. **O(n²) 通信代价**：每轮每人给所有人发 prevote/precommit，n≈150 还能撑，n=1000 就崩——Cosmos Hub 验证人长期卡在 ~150 的根因。

3. **弱主观性**：白话说"新来的同学不能只信开学第一天的花名册，还得信最近几周的班委名单"。新节点同步时必须信任近期检查点，否则可能被假历史骗——PoS 共同妥协。

4. **锁定+超时调参极敏感**：早期 Cosmos Hub 出过"超时设短 → 锁定未解锁就进下一轮 → 全网卡死"；参数到 v0.34 才稳。

5. **MEV 被绕过**：MEV=谁先排交易谁能多赚钱（抢跑）。Tendermint 让本轮提案人随意排序，2016 年论文未回应；后来才有 PBS（提案者只出块、别人组交易包）一类补丁。

6. **不适用异步极端**：FLP 直觉是"网络永远乱序时，确定性共识做不到"。Tendermint 是部分同步：网络最终恢复才保证继续出块。

## 适用 vs 不适用场景

**适用**：

- 验证人数量可控（< 200）的许可链 / 联盟链 / PoS 公链
- 要求秒级最终性的场景（金融结算、跨链桥）
- 业务逻辑复杂、希望和共识层解耦（Cosmos SDK 模式）
- 验证人身份和股权可问责，能用 slashing 经济激励

**不适用**：

- 验证人数量要上万 → 用 Algorand 抽签 / Solana Tower BFT / 中本聪式 PoW
- 完全开放无 stake 门槛 → PoW 才是这个生态位的解
- 极低延迟（< 100ms）需求 → BFT 类协议的多轮投票天然有 1-2s 下限
- 需要异步安全（网络永远乱序也能最终一致）→ Tendermint 是部分同步模型，网络恢复后才保证活性

## 历史小故事（可跳过）

- **1980 年**：Lamport / Shostak / Pease 在《拜占庭将军问题》论文里第一次形式化"有人作恶时如何达成一致"。纯理论，f < n/3 上限就来自这里。
- **1999 年**：Castro & Liskov 在 OSDI 发表 PBFT，第一个工程能跑的拜占庭协议。但参与者固定——必须事先知道所有节点身份和公钥。
- **2008 年**：中本聪用 PoW 绕开了"参与者集合"问题，代价是高能耗 + 概率最终性。
- **2014 年**：Jae Kwon 在博客发"Tendermint: Consensus without Mining"，第一次把 PoS 和 BFT 拼起来，但偏概念。
- **2016 年**：Jae 的合作者 Buchman 在 University of Guelph 完成 MSc 论文，把这套协议系统化，加了 ABCI 接口和工程实现细节。**这就是这本论文**。
- **2019 年**：Cosmos Hub 主网上线，Binance Chain 同年用 Tendermint 启动。一个学位论文真的变成了几百亿美元资产的底座。

## 学到什么

1. **共识协议是经济问题**——没有 slashing，再漂亮的 BFT 也防不住开放参与者作恶
2. **3 步投票 + 锁定**是把 PBFT 改造成开放参与的关键工程动作
3. **接口分层（ABCI）**让一个共识引擎服务无限多业务，是 Cosmos 多链路线的底座
4. **安全性优先于活性**是 BFT 灵魂：诚实 ≥2/3 时宁可停摆也不分叉；这是金融结算能用链的前提

## 延伸阅读

- 论文 PDF：[Tendermint: BFT in the Age of Blockchains, 2016](https://atrium.lib.uoguelph.ca/items/5459099e-67aa-4a23-83ae-d3471d8fa738)（不到 100 页，工程导向）
- Jae Kwon 早期博客：[Tendermint: Consensus without Mining, 2014](https://tendermint.com/static/docs/tendermint.pdf)（协议雏形，6 页）
- Cosmos 白皮书：Tendermint Core + Cosmos SDK 完整图景
- PBFT 原文：Castro & Liskov, "Practical Byzantine Fault Tolerance", OSDI 1999
- HotStuff（PODC 2019）：把 BFT 通信复杂度从 O(n²) 往 O(n) 推，Tendermint 的"下一代"
- [[paxos-1998]] —— 非拜占庭共识鼻祖，对照读更清楚 Tendermint 多了什么

## 关联

- [[uniswap-v3]] —— 区块链协议工程化的另一面：把 AMM 做成基础设施
- [[move-language]] —— 智能合约语言路线，与 Tendermint 的"应用层自由"哲学呼应
- [[lamport-tla-1994]] —— TLA+ 用来形式化分布式协议；Tendermint 安全性证明用了同类工具
- [[paxos-1998]] —— 非拜占庭场景的共识鼻祖；Tendermint 是其拜占庭+开放参与的扩展
- [[narwhal-tusk-2022]] —— 把 BFT 拆成数据传播与排序两层，正面回应 O(n²) 瓶颈
- [[raft]] —— 非拜占庭复制状态机；对照看"信任模型一变，协议差多远"
## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[narwhal-tusk-2022]] —— Narwhal & Tusk — 把 BFT 共识拆成『谁说过』和『谁先说』两件事
