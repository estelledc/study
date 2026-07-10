---
title: Monero — 默认隐私的 PoW 加密货币
来源: 'https://github.com/monero-project/monero'
日期: 2026-05-30
分类: blockchain
难度: 中级
---

## 是什么

Monero 是一条**默认隐私**的 PoW 加密货币区块链——同一条链上**没有公开模式**，每笔转账都自动隐藏发送者、接收者、金额。

日常类比：Bitcoin 是**公告栏**，每个人的钱包余额和转账记录人人可见；Zcash 是**可选的银行加密信封**——你想用就贴上 ZK 邮票，不想用就直接走明信片；Monero 是**只卖加密信封的邮局**——根本没明信片可选，每封信都强制贴上"看不见内容"的封条。

技术核武器**不是** zk-SNARK，而是三件套——**环签名（Ring Signatures）+ 隐身地址（Stealth Addresses）+ RingCT/Bulletproofs**。三个机制各管一件事：环签名混淆"谁花的"、隐身地址混淆"谁收的"、RingCT 隐藏"花了多少"。

代码层面 Monero **不是** Bitcoin 的 fork，而是基于 **CryptoNote 协议**（2012 年匿名作者 Nicolas van Saberhagen 的白皮书）从零写起。这是它和 Zcash 最深层的分野——Zcash 借了 Bitcoin Core 的壳子专心改"账本里存什么"，Monero 从底层开始换骨。

## 为什么重要

不理解 Monero，下面这些事都没法解释：

- 为什么 Monero 是隐私币市占率第一、市值常年压在 Zcash 之上——**默认隐私**让所有用户共享一个匿名集，而不是只有少数人用屏蔽池
- 为什么 Bittrex / Kraken（部分地区）以及日韩监管陆续让交易所下架或禁上 Monero——**没有 transparent 模式**让 KYC/AML 无路可走（Coinbase 等从未正式上架）
- 为什么环签名路线**不需要 trusted setup**——它的安全只依赖椭圆曲线离散对数难题，不靠"有人销毁了随机数"
- 为什么 Monero 每 6 个月硬分叉一次——抗 ASIC 算法 RandomX + 协议参数（环大小、Bulletproofs+ 等）频繁升级是它的策略

## 核心要点

Monero 的隐私机制可以拆成 **三块**：

1. **环签名（Ring Signatures）替"我签的名"**：传统签名说"是 A 签的"。环签名说"A、B、C、D、E 这五个人里**有一个**签了"，外人无法判定是谁。Monero 默认环大小 16——每笔转账把真实输入和 15 个诱饵输入塞进同一个签名里。**key image** 是配套机制：每个真实输入产生一个一次性指纹，链上不允许重复，借此防双花——既能验证合法又不暴露真身。

2. **隐身地址（Stealth Address）替"收款地址"**：Bitcoin 的地址是固定的，转 100 次就被关联 100 次。Monero 的隐身地址：发送者用接收者的公开 view key + 自己的随机数，**为这一笔转账**派生一个**全新的、链上前所未见**的一次性地址。链分析公司从链上看不到接收者地址被复用，每笔都像发给陌生人。

3. **RingCT + Bulletproofs 隐藏金额**：Pedersen 承诺把"100 XMR"包成一个看似随机的椭圆曲线点，但保留"加法可验证"——节点能验证"输入和 = 输出和"而不知道具体数字。Bulletproofs（2018 年集成）是配套的范围证明，确保金额非负又不暴露金额，把交易体积压了 80%。

合起来：**默认隐私 = 全链匿名集** vs Zcash 的**可选隐私 = 屏蔽池匿名集**。这是两条路线最大的现实差异。

## 实践案例

### 案例 0：先理解"环签名"到底环什么

环签名 1991 年由 Rivest、Shamir、Tauman 提出。日常类比：你想匿名爆料公司丑闻，但又要让记者相信"爆料人确实是公司高管"。你列出 7 个高管名字，对消息做一个特殊签名——签名能验证"7 个里至少有一个签了"，但**算不出**到底是谁。

把这套搬到转账（RingCT 之后）：

- 你要花掉输出 X；钱包从链上按**花费年龄分布**抽 15 个诱饵输出（不必同额——金额已被 Pedersen 承诺藏住；pre-RingCT 才要求同面额）
- 钱包把「1 真 + 15 诱饵」组成环，对这笔转账做环签名，并附上该真实输入的 **key image**
- 节点验证"环里有一个真实持有者签了、且 key image 未见过" → 接受。但**不知道是哪一个**。

### 案例 1：一笔 Monero 转账在节点视角看到了什么

```
区块新增一笔交易，节点看到：
  - 一组环成员公钥（固定环大小 16：1 真 + 15 诱饵）
  - 一个 key image（这笔花费的一次性指纹，防双花）
  - 一个隐身一次性接收地址（链上从没出现过）
  - 一组 Pedersen 承诺（输入金额、输出金额，全是椭圆曲线点）
  - 一份 Bulletproof 范围证明（约 1-2 KB，证明所有输出 ≥ 0）
  - 矿工费（明文——节点要按费排序打包，没法藏）
```

节点只能验证"合法" → 接受。**谁花的？哪个输出真被花了？给谁多少？节点全部不知道。**

最小跟做（本机已同步节点时）：

```bash
# 钱包 CLI：转 0.1 XMR；环大小由协议固定为 16，用户不可改
transfer <地址> 0.1
# 链上随后能看到环成员、key image、承诺与范围证明，看不到真输入与金额
```

### 案例 2：与 Zcash z→z 对照——同样三隐藏，机制完全不同

| 维度 | Zcash z→z | Monero |
|---|---|---|
| 加密学根基 | zk-SNARK 零知识证明 | 环签名 + Pedersen 承诺 |
| 默认是否私密 | 否（要主动选 z-address） | **是（无明文模式）** |
| Trusted setup | Sprout/Sapling 需要，Orchard 才消除 | **从未需要** |
| 匿名集大小 | 屏蔽池所有钱（10% 量级） | **全链所有钱**（默认私密） |
| 证明大小 | ~2-3 KB Groth16 / Halo2 | ~2-3 KB（Bulletproofs） |
| 验证速度 | 毫秒级（SNARK 优势） | 较慢（环验证 O(N)） |
| 量子抗性 | 部分依赖椭圆曲线，长期被破 | 同样依赖椭圆曲线 |

一句话：**Zcash 优雅但有历史包袱（trusted setup + 屏蔽池利用率低）；Monero 朴实但默认隐私 + 无 setup 阴影**。两条路线都给了 zk-rollup 生态的工程师启发。

### 案例 3：为什么环大小一路从 5 涨到 16

早期 Monero 环大小默认 5。研究者发现链上很多 UTXO 的"年龄分布"明显——刚出来的 UTXO 比老 UTXO 更可能被花。把这个启发式喂给统计模型，**5 个候选里挑出真凶**的成功率显著高于 1/5。

应对：环大小逐步从 5→7→11→16，并改用更接近真实花费分布的诱饵采样曲线。**协议级环签名只是第一道墙**，配上"采样什么样的诱饵"才是隐私强度的关键——这个工程教训对所有混币池都成立。

## 踩过的坑

1. **环签名 ≠ 完全匿名**：链分析公司用启发式（输出年龄、UTXO 关联、节点 IP、交易所 KYC 数据）能在统计上削弱匿名集。早期环大小 5 时已被多次学术证伪能恢复部分发送者，这是后来涨到 16 + 改采样曲线的直接原因。

2. **默认隐私 = 监管压力天花板高**：日本、韩国先后禁止隐私币上交易所；Bittrex、Kraken（部分地区）下架。Monero 没有 view key 之外的"选择性披露"机制，颗粒度不如 Zcash，监管谈判余地小。

3. **频繁硬分叉是双刃剑**：每 6 个月升一次（RandomX 抗 ASIC + 协议参数），好处是矿工去中心化、ASIC 厂商投入打水漂；坏处是钱包/节点不升级就分叉掉队，生态摩擦大。

4. **View key 颗粒度粗**：你只能把"看所有收款"的权限发给审计/税务，**没法只发某一笔**。设计上没有 Zcash 那种 selective disclosure 钩子，是隐私链合规化的一个长期短板。

## 适用 vs 不适用场景

**适用**：

- 想理解非 ZK 路线的隐私链是怎么搭的——环签名 + 隐身地址 + RingCT 是另一套完整设计
- 学习"默认隐私"的工程权衡——为什么放弃 transparent 模式、放弃可编程性
- 链分析对抗研究——环签名启发式攻防、UTXO 年龄分布建模都在 Monero 上活跃

**不适用**：

- 要可编程合约：Monero 没有智能合约层，**只是转账隐私**；要可编程隐私看 Aleo / Aztec
- 要被监管市场广泛接受：默认隐私让 KYC 路径基本封死
- 要最小验证开销：环签名验证 O(N)，环大小 16 时单输入验证比 SNARK 慢约 1–2 个数量级
- 要量子安全：底层椭圆曲线和 Zcash 同属量子可破阵营，长期都需迁移

## 历史小故事（可跳过）

- **2012 年 10 月**：匿名作者 Nicolas van Saberhagen 发布 CryptoNote 2.0 白皮书，首次完整阐述环签名 + 隐身地址 + 区块链整合方案
- **2014 年 4 月**：Bytecoin（CryptoNote 第一个实现）被指控有大量"premined"老币；社区 fork 出 Monero（"门罗"，世界语意为"硬币"），换掉发行曲线
- **2017 年 1 月**：RingCT 强制启用，金额从此默认隐藏（之前金额还是明文）
- **2018 年 10 月**：Bulletproofs 集成，交易大小压缩 80%，单笔费用骤降
- **2019 年 11 月**：切换到 RandomX PoW，专门设计来抗 ASIC、偏向通用 CPU 挖矿
- **2022 年起**：Seraphis / FCMP++ 路线图推进——用全链成员证明替换固定环大小，匿名集扩到整条链输出集；工程量大，主网尚未切换

## 学到什么

1. **隐私路线不止一条**：zk-SNARK 是当下显学，但环签名 + Pedersen 承诺这条更老的路在工业上跑了 10 年没翻车，证明"非 ZK 隐私"也能做得很扎实。
2. **默认隐私 vs 可选隐私是产品决策**：Monero 选默认 → 匿名集最大但监管路径封死；Zcash 选可选 → 兼容透明但屏蔽池利用率低。技术等价时产品决策决定生死。
3. **trusted setup 是工程妥协，不是必须**：Monero 从一开始就证明了"不靠仪式也能做隐私链"。这条经验后来直接刺激了 Halo / STARK 这类无 setup ZK 路线的崛起。
4. **协议层匿名 ≠ 用户层匿名**：环大小、诱饵采样曲线、UTXO 年龄分布全是工程参数。把它们调对了才有真隐私——这条规律对所有隐私池、混币器都成立。

## 延伸阅读

- 协议白皮书：[CryptoNote v2.0](https://web.archive.org/web/20201028121818/https://cryptonote.org/whitepaper.pdf)（环签名 + 隐身地址完整数学）
- 入门视频：[Monero Outreach — How Monero Works](https://www.youtube.com/c/MoneroTalk)（动画讲三件套）
- Bulletproofs 论文：[Bünz et al., "Bulletproofs: Short Proofs for Confidential Transactions and More" (2018)](https://eprint.iacr.org/2017/1066)
- 链分析对抗研究：[Möser et al., "An Empirical Analysis of Traceability in the Monero Blockchain" (2018)](https://arxiv.org/abs/1704.04299)（早期环大小 5 时的攻击实证）
- [[zcash]] —— 同样做转账隐私但走 zk-SNARK 路线
- [[bitcoin-core]] —— 公开账本对照系
- [[go-ethereum]] —— EVM 链对照系，有合约无隐私

## 关联

- [[zcash]] —— 隐私链双子星之一；Zcash 走 zk-SNARK + 可选隐私，Monero 走环签名 + 默认隐私，两条路线对照看
- [[bitcoin-core]] —— 完全公开 vs 完全隐私的两极；Monero 不是 fork 而是 CryptoNote 全新实现
- [[go-ethereum]] —— 可编程账本；Monero 故意不做合约层，只做转账隐私，权衡相反
- [[cosmos-sdk]] —— 模块化区块链，Cosmos 生态有隐私链 Secret Network 走类似默认隐私路线
- [[uniswap-v3]] —— 公开账本上的金融基础设施代表，反衬隐私链的取舍
- [[arbitrum]] —— L2 扩展路线 vs Monero 的 L1 隐私路线，公链两条工程方向

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[arbitrum]] —— Arbitrum Nitro — Offchain Labs 的 Optimistic Rollup 客户端
- [[bitcoin-core]] —— Bitcoin Core — 比特币参考实现
- [[go-ethereum]] —— Go-Ethereum (Geth) — 以太坊主流 Go 客户端
- [[uniswap-v3]] —— Uniswap V3 — 集中流动性 AMM 核心合约
- [[zcash]] —— Zcash — 让转账在链上"既能被验证，又看不见内容"

