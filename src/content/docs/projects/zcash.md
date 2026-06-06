---
title: Zcash — 让转账在链上"既能被验证，又看不见内容"
来源: https://github.com/zcash/zcash
日期: 2026-05-30
子分类: 链与合约
分类: 区块链
难度: 中级
provenance: pipeline-v3
---

## 是什么

Zcash 是一条**加密货币区块链**，核心卖点是：一笔转账谁都能验证它合法，但发送者、接收者、金额**都不暴露**。

日常类比：比特币像**明信片**——邮差、邻居、谁路过都能看到正反两面（发件人、收件人、内容）；Zcash 像**银行加密信封**——邮局确认你贴了正确邮票、地址格式合法，但拆不开里面写了什么。再延伸一点：邮局还能数学证明"这个信封里塞的钱真是这位寄件人合法持有的、没双花、签名也对"，但拆开看是什么字依然不行。

技术核武器叫 **zk-SNARK**（零知识简洁非交互证明）。它让你在本地算出一张几百字节的"小票"，链上谁拿到都能验证"这笔交易没双花、收支相等、签名合法"，但小票里没有任何具体细节。

代码层面 Zcash 是 **Bitcoin Core 的 fork**。也就是说底层 P2P 网络、UTXO 模型几乎完全一样，**改的是"账本里存什么"和"怎么证明合法"**。这个"借壳"决策让 Zcash 一上线就有成熟的网络层、矿工激励、共识机制，把全部精力放在 ZK 电路本身。

## 为什么重要

不理解 Zcash，下面这些事都没法解释：

- 为什么 Vitalik 多次称 Zcash 是"加密货币里少有的真正学术工程"——它是首个把 ZK 证明推上主网并跑了 10 年的链
- 为什么 zkSync / Scroll / Polygon zkEVM 这些 zk-rollup 的工程师大多读过 Zcash 协议规范——Sapling/Orchard 电路是工业 ZK 的鼻祖
- 为什么"trusted setup ceremony"（多方仪式）能上《纽约时报》——Zcash 的 Sprout 仪式是密码学第一次做这种公开表演
- 为什么很多交易所**下架**了 Zcash——监管和"完整隐私"天然冲突

## 核心要点

Zcash 的隐私机制可以拆成 **三块**：

1. **commitment / nullifier 替换"地址余额"**：比特币账本记的是"地址 X 有多少 BTC"。Zcash 屏蔽池里记的是两个集合——commitment（某个秘密金额的承诺哈希）和 nullifier（证明"我花掉了某个 commitment"的一次性票据）。看的人只能看到一堆哈希在增长，看不到谁给谁多少。打个比方：传统账本像"实名快递柜"，每个柜子贴了名字和余额；Zcash 像一面"全是密码锁的墙"，只看到锁多了几个、开了几个，但谁开的、里面装多少全不知道。

2. **zk-SNARK 替换"明文校验"**：比特币校验靠"全节点把 UTXO 抠出来比对"。Zcash 让发送者**自己**用 zk-SNARK 证明：我知道一个未花掉的 commitment、它金额加起来等于输出、签名我有。证明小到几百字节、验证只需毫秒。零知识三个性质——"完备性（合法的能证）、可靠性（伪造的证不出）、零知识（验证者只学到合法这一件事）"——三个全要。

3. **Sapling / Orchard 两次升级**：Sprout（2016）证明慢到 40 秒、内存几个 GB；Sapling（2018）重写电路压到几秒、手机能跑；Orchard（2022）换到 Halo 2，**消掉了 trusted setup 这个历史包袱**。每次升级都要做一次"shielded pool migration"——老池子的钱可以一直留着，但新功能只在新池子用。

## 实践案例

### 案例 0：先理解"零知识"到底零什么

零知识证明 = "我能让你相信某个陈述为真，但你除了'它为真'之外什么都学不到"。日常类比：你想让朋友相信你能区分可口可乐和百事可乐，但**不**告诉他你的味觉特征。你说"你随机倒一杯，我猜对就是真的"，盲测 10 次都猜对，他就信了——但他依然不知道你是怎么分辨的。

把这个搬到转账场景：

- 陈述："这笔交易合法"（输入存在、未花掉、收支等额、签名正确）
- 学不到的："谁、给谁、多少钱"

zk-SNARK 把这套盲测压缩成一个非交互的小证明字串，只检查一次。

### 案例 1：transparent 地址 vs shielded 地址

Zcash 同一条链上有两种地址：

- **transparent（t-address，t1... 开头）**：和比特币一模一样，公开地址、公开金额，毫无隐私。
- **shielded（z-address，zs... 或 u1... 开头）**：commitment/nullifier 模型，金额和对手都隐藏。

转账可以四种组合：t→t（=比特币）、t→z（资金进屏蔽池）、z→z（**完全隐私**）、z→t（资金出屏蔽池）。**只有 z→z 是真正零知识**，其他三种都至少泄漏一端。这是 Zcash 隐私模型最常被误解的地方。

### 案例 2：一次 z→z 转账在节点视角看到了什么

```
区块新增一笔交易，节点看到：
  - 几个"消费的 nullifier"（一次性哈希，没人能反查回 commitment）
  - 几个"新增的 commitment"（秘密金额的哈希）
  - 一份 zk-SNARK 证明（约 2-3 KB 的 Groth16 证明字节）
  - 矿工费（这部分必须明文，否则没法收）
```

节点验证 zk-SNARK 通过 → 接受交易。**金额是多少？发给谁？节点不知道。** 也没法知道。

视角对比表（直观看出 Zcash 在哪一格）：

| 链/协议 | 发送者 | 接收者 | 金额 | 链上图 | 隐私机制 |
|---------|--------|--------|------|--------|----------|
| Bitcoin | 公开 | 公开 | 公开 | 完整可见 | 无 |
| Monero | 隐藏 | 隐藏 | 隐藏 | 模糊 | 环签名+隐身地址 |
| Zcash z→z | 隐藏 | 隐藏 | 隐藏 | 不可见 | zk-SNARK |
| Zcash t→z | 公开 | 隐藏 | 公开 | 半可见 | 进池泄漏 |

### 案例 3：trusted setup 仪式（"有毒废料"）

Sapling 的 zk-SNARK（Groth16）需要一组**公共参数**才能用。生成这组参数时会附带一些**随机数（toxic waste）**，谁拿到这堆随机数就能伪造证明、凭空印钱。

Zcash 用**多方仪式（MPC ceremony）**生成：6 个国家的人各出一份随机数、各自销毁、最后聚合。**只要至少一人真的销毁了，整个系统安全**。仪式过程是公开的——飞机舱、汽车后备厢、燃烧硬盘的视频都有。

Orchard 升级换到 **Halo 2**，**不再需要 trusted setup**——这个历史包袱终于卸掉了。

## 踩过的坑

1. **shielded 池太小 = 隐私集太小**：链上 90% 的钱仍在 transparent 池，z→z 的人很少，**对手集小到几百笔**就容易被时间戳、金额相关性戳穿。"隐私功能存在不等于你有隐私"。

2. **很多钱包只支持 transparent**：早期 Sprout 证明太慢、手机跑不了，多数交易所/钱包默认只接 t-address，结果 Zcash 在使用上经常**等于一个慢一点的比特币**。

3. **trusted setup 是历史阴影**：尽管多方仪式做得很认真，"理论上可能存在伪造能力"这件事让密码学家长期不安，直到 Halo 2 落地才彻底翻篇。

4. **监管压力 → 下架潮**：Coinbase、Bittrex、eToro 等多家交易所先后下架 Zcash 或限定到只能用 transparent 模式。完全 shielded 的链很难过 KYC/AML，反过来推出了 **view key**（把"看账权限"单独发给税务/审计）这种半透明设计。

5. **shielded 池升级要"换池子"**：每次大升级都开新 shielded pool（Sprout pool / Sapling pool / Orchard pool），老池子的资金只能先转到 transparent 再进新池——这一步**会暴露金额**，是隐私模型上的硬伤，称为 turnstile 攻击面。

## 适用 vs 不适用场景

**适用**：

- 想理解 zk-SNARK 在工业系统真实落地是什么样子（Sapling/Orchard 电路是范本）
- 学习"如何在公链上做合规友好的隐私"——view key、selective disclosure 这些词最早在 Zcash 出现
- 读 zk-rollup 类项目（zkSync / Scroll / Polygon zkEVM）前的最佳热身

**不适用**：

- 想要"匿名币"日常用：实际 z→z 占比低、流动性差、交易所支持有限
- 想避开 trusted setup：用 Sprout/Sapling 老池子还有这个包袱（Orchard 池才彻底消除）
- 想要可编程合约：Zcash 不是 EVM 链，没有智能合约层，**只是转账隐私**；要可编程隐私看 Aleo / zkSync

## 历史小故事（可跳过）

- **2013**：Matt Green 等人发布 Zerocoin 论文，思路是混币池但效率低
- **2014**：Eli Ben-Sasson、Matthew Green 等人发表 Zerocash 论文（Oakland Security Symp.），首次把 zk-SNARK 设计成完整加密货币协议
- **2016 年 10 月**：Zcash 主网上线，Sprout 协议；trusted setup 仪式被《纽约时报》报道，参与者把硬盘**当场烧掉**
- **2018 年 10 月**：Sapling 升级，电路重写、性能 100×，手机钱包终于可用
- **2020**：Halo 论文发布——递归证明、无 trusted setup，从根上解决了 Sprout 的历史阴影
- **2022 年 5 月**：NU5（Network Upgrade 5）激活 Orchard 协议，换到 Halo 2，**告别 trusted setup**
- 之后：zk-rollup 生态全面开花，但**第一个把 ZK 推到生产 10 年没翻车的链仍是 Zcash**

## 学到什么

1. **隐私不是加密那么简单**：要在公开账本上做隐私，必须重新设计"账本里存什么"——commitment/nullifier 模型替代地址/余额是关键发明。简单地"把交易加密"是不够的，因为节点必须能验证它合法。
2. **零知识 = 验证与内容解耦**：验证者不需要知道内容就能确认合法。这条原则后来支撑了所有 zk-rollup（用 ZK 把"链下计算"压缩进链上证明）。Zcash 是这条路线的**第一个工业证据**。
3. **trusted setup 是工程妥协**：早期 zk-SNARK 必须有；Halo 2 / STARK 把它消掉。理论选型和工程节奏要分开看——别因为"完美方案存在"就否定"先用次好方案上线"。
4. **隐私 vs 监管的拉锯**：技术能做到完全隐私不代表市场会接纳。view key 这种"可选择披露"是隐私链长期生存的妥协方案——这件事在以太坊隐私生态（Aztec、Tornado Cash）反复重演。
5. **匿名集决定真实隐私强度**：协议级隐私 ≠ 用户级隐私。如果只有几百人在用 z→z，时间和金额相关性就能把人分出来。这个教训对所有混币、隐私池都成立。

## 延伸阅读

- 协议规范：[Zcash Protocol Specification](https://zips.z.cash/protocol/protocol.pdf)（密度极高，Sapling/Orchard 完整电路定义）
- 入门视频：[Zcash Foundation — How Zcash Works](https://www.youtube.com/c/ZcashFoundation)（动画讲 commitment/nullifier）
- 起源论文：[Zerocash: Decentralized Anonymous Payments from Bitcoin (2014)](https://eprint.iacr.org/2014/349.pdf)
- Halo 2 文档：[zcash/halo2](https://github.com/zcash/halo2)（无需 trusted setup 的 ZK 框架）
- [[bitcoin]] —— Zcash fork 自 Bitcoin Core，UTXO 模型同源
- [[uniswap-v3]] —— 同样在以太坊系生态、但走了"公开 AMM + 集中流动性"另一条路

## 关联

- [[bitcoin]] —— 代码与 P2P 层同源；Zcash 改了"账本存什么"和"怎么验证"
- [[arbitrum]] —— L2 路线（optimistic rollup）vs Zcash 的隐私链路线，对照看公链扩展两个方向
- [[uniswap-v3]] —— 公开账本上的金融基础设施代表，反衬隐私链的取舍
- [[move-language]] —— 资源型语言关心"谁能花什么"，Zcash 关心"花了别人不知道"
- [[filecoin]] —— 同样大规模用 zk-SNARK（PoRep / PoSt）的工业系统
- [[solana]] —— 高吞吐 vs 强隐私是公链两个方向

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[arbitrum]] —— Arbitrum Nitro — Offchain Labs 的 Optimistic Rollup 客户端
- [[bitcoin]] —— Bitcoin 白皮书
- [[filecoin]] —— Filecoin / Lotus — IPFS 之上的去中心化存储市场
- [[monero]] —— Monero — 默认隐私的 PoW 加密货币
- [[move-language]] —— Move — 资源型智能合约语言
- [[solana]] —— Solana — Rust 写的高性能 PoH 链
- [[uniswap-v3]] —— Uniswap V3 — 集中流动性 AMM 核心合约

