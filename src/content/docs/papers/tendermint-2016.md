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
- 为什么"应用层和共识层用 socket 解耦"会成为后来 Substrate / Cosmos SDK 的标配

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

- 最多 33 个作恶/掉线，链照常出块
- 第 34 个开始作恶，链**停止出块**（停摆，但不会出错）
- 永远不会"两个块都最终化"——这是 BFT 的安全性保证

这条**安全 > 活性**的设计哲学很关键：宁可停摆等人工介入，绝不允许账本分叉。

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

Tendermint 只负责"块 1 → 块 2 → 块 3 这个顺序对所有人一致"，**不管块里装什么**。业务用任何语言写一个 ABCI server 接上来就行。Cosmos SDK（Go）、Anvil（Rust）、甚至 Python 玩具链都能接入——这就是 Cosmos 生态"百链齐放"的工程基础。

具体来说 ABCI 暴露的核心方法只有 4 个：`CheckTx`（交易进 mempool 前过一遍业务校验）/ `BeginBlock` / `DeliverTx`（块内每条交易让业务执行）/ `EndBlock` + `Commit`（业务返回新状态根写进块）。一份不到 200 行的 ABCI server 就能起一条玩具链，**这是 Tendermint 工程友好度的核心来源**。

### 案例 4：锁定为什么必要

如果没有锁定机制，会发生什么？设想 100 个验证人正在第 1 轮投票：

- 50 个看到了块 A，正准备投 prevote
- 50 个看到了块 B（同一轮值出了两个块，比如网络分区导致），也准备投

没有锁定时，这 100 个人下一轮可能任意切换，永远凑不齐 +2/3。**有了锁定**：只要任何节点曾经在某一轮看到过 +2/3 prevote 锁住块 A，下一轮就只能继续投 A，除非看到更高轮的 +2/3 解锁——这把"投票分裂"问题压死了，保证了**安全性优于活性**。

## 踩过的坑

1. **1/3 是硬上限**：超过 1/3 验证人合谋就停摆，且不能恢复，必须人工介入升级。这是 BFT 类协议的共同短板，Solana 的 Tower BFT 也只是把这个上限调到不同位置。

2. **O(n²) 通信代价**：每轮每个验证人要给所有其他人发 prevote/precommit 消息，n=150 时还能撑，n=1000 就崩。这是 Cosmos Hub 验证人数量长期限制在 ~150 的根因。

3. **弱主观性（weak subjectivity）**：新节点同步链时，不能像比特币那样"只信创世块就够"——它必须信任一个近期检查点（最多几周前），否则可能被一段假历史欺骗。这是所有 PoS 链共同的工程妥协。

4. **锁定+超时调参极敏感**：早期 Cosmos Hub 主网出过"轮超时设短了 → 验证人锁定后还没解锁就进下一轮 → 全网卡死"的事故。这套参数直到 v0.34 才稳定下来。

5. **MEV（最大可提取价值）问题被绕过**：Tendermint 没有内置交易排序的去中心化机制——本轮提案人想怎么排就怎么排。链上抢跑 / 三明治攻击的研究在 2016 年还没出现，论文没回应这个问题。后来 Skip Protocol / Mekatek 等团队补丁式做了 PBS（提案者-构建者分离）。

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
- 需要异步安全（FLP 极端假设）→ Tendermint 是部分同步模型，强同步才保证活性

## 历史小故事（可跳过）

- **1980 年**：Lamport / Shostak / Pease 在《拜占庭将军问题》论文里第一次形式化"有人作恶时如何达成一致"。纯理论，f < n/3 上限就来自这里。
- **1999 年**：Castro & Liskov 在 OSDI 发表 PBFT，第一个工程能跑的拜占庭协议。但参与者固定——必须事先知道所有节点身份和公钥。
- **2008 年**：中本聪用 PoW 绕开了"参与者集合"问题，代价是高能耗 + 概率最终性。
- **2014 年**：Jae Kwon 在博客发"Tendermint: Consensus without Mining"，第一次把 PoS 和 BFT 拼起来，但偏概念。
- **2016 年**：Jae 的合作者 Buchman 在 University of Guelph 完成 MSc 论文，把这套协议系统化，加了 ABCI 接口和工程实现细节。**这就是这本论文**。
- **2019 年**：Cosmos Hub 主网上线，Binance Chain 同年用 Tendermint 启动。一个学位论文真的变成了几百亿美元资产的底座。

## 学到什么

1. **共识协议不是数学问题，是经济问题**——没有 slashing 配套，再漂亮的 BFT 协议都防不住开放参与者作恶
2. **3 步投票 + 锁定**是把 PBFT 改造成开放参与的关键工程动作，比想象中朴素
3. **接口分层（ABCI）**让一个共识引擎能服务无限多业务，这是 Cosmos 生态比以太坊单链路线更分散的原因
4. **学位论文也能是工程模板**——Buchman 这本不到 100 页的 MSc，影响远超大多数顶会论文
5. **安全性 > 活性**是 BFT 设计的灵魂：宁可让链停摆等人类介入，也绝不让账本分叉。这是金融系统能把链当结算层用的前提

## 延伸阅读

- 论文 PDF：[Tendermint: BFT in the Age of Blockchains, 2016](https://atrium.lib.uoguelph.ca/items/5459099e-67aa-4a23-83ae-d3471d8fa738)（不到 100 页，工程导向，比读 PBFT 原文友好）
- Jae Kwon 早期博客：[Tendermint: Consensus without Mining, 2014](https://tendermint.com/static/docs/tendermint.pdf)（看协议雏形，6 页）
- Cosmos 白皮书：理解 Tendermint Core + Cosmos SDK 配合的完整图景
- PBFT 原文：Castro & Liskov, "Practical Byzantine Fault Tolerance", OSDI 1999——读完会立刻明白 Tendermint 简化了哪些步骤
- HotStuff 论文（PODC 2019）：把 BFT 通信复杂度从 O(n²) 降到 O(n)，是 Tendermint 的"下一代"
- [[uniswap-v3]] —— 同样是"协议即基础设施"的另一条路线：DeFi vs 共识
- [[move-language]] —— 资源型智能合约语言，与 Cosmos 的 Cosmwasm 同期但路线不同

## 关联

- [[uniswap-v3]] —— 区块链协议工程化的另一面：把 AMM 做成基础设施
- [[move-language]] —— 智能合约语言路线，与 Tendermint 的"应用层自由"哲学呼应
- [[lamport-tla-1994]] —— TLA+ 用来形式化分布式协议；Tendermint 的安全性证明部分用了同类工具
- [[paxos-1998]] —— 非拜占庭场景的共识鼻祖；Tendermint 是其拜占庭+开放参与的扩展

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）

