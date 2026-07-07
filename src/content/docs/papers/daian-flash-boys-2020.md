---
title: Flash Boys 2.0 — MEV 把交易排序变成一门生意
来源: 'Philip Daian, Steven Goldfeder, Tyler Kell, Yunqi Li, Xueyuan Zhao, Iddo Bentov, Lorenz Breidenbach, Ari Juels, "Flash Boys 2.0: Frontrunning, Transaction Reordering, and Consensus Instability in Decentralized Exchanges", IEEE S&P 2020'
日期: 2026-07-07
分类: security-privacy
难度: 中级
---

## 是什么

想象你在食堂排队买最后一份鸡腿饭，旁边有人看到你要买，立刻加钱请窗口先给他。Flash Boys 2.0 研究的就是区块链版的这件事：大家都能看到待处理交易，于是机器人会抢在别人前面成交。

这篇论文系统研究了去中心化交易所里的抢跑、交易重排和共识不稳定问题。它最出名的贡献，是把矿工能从交易排序里抽走的价值命名为 **MEV**。

当时论文说的是 miner-extractable value，也就是矿工可提取价值。后来以太坊进入 PoS 后，行业常把它扩成 maximal extractable value，因为不只矿工，验证者、搜索者、构建者也可能参与这条价值链。

一句话：它告诉我们，智能合约不是只看代码是否正确，还要看“谁有权决定交易先后顺序”。

## 为什么重要

不理解 Flash Boys 2.0，下面这些事很难解释：

- 为什么“链上透明”不一定等于“交易公平”，因为透明也会让机器人提前看到机会。
- 为什么 DEX 上的套利不只是应用层问题，它会改变矿工或验证者的经济激励。
- 为什么同一笔交易，排在前面和排在后面，可能是赚钱和亏钱的区别。
- 为什么后来的 Flashbots、MEV-Boost、PBS 都绕不开这篇论文提出的问题。

## 核心要点

1. **交易排序是一种资源**。类比：演唱会前排座位本来有限，谁能决定座位，就能决定额外收益。区块链里，出块者能决定区块内交易顺序，所以“先执行”本身有价格。

2. **PGA 是链上的抢座竞价**。PGA 指 priority gas auction，机器人不断提高 gas price，让矿工优先打包自己的交易。论文观察到机器人会在十几秒内连续发几十笔替换交易，像两个人不断举牌竞价。

3. **MEV 会反过来影响共识安全**。类比：如果一张旧的彩票已经知道中奖号码，有人可能愿意花钱回到昨天重买。论文指出，当过去区块里可重排的利润足够大时，攻击者可能尝试重写链上历史。

## 实践案例

### 案例 1：纯收益套利为什么适合研究

```py
buy_eth_cost = 2.0
sell_eth_return = 3.0
gas_cost = 0.02
profit = sell_eth_return - buy_eth_cost - gas_cost
print(profit)  # 0.98
```

**逐部分解释**：

- `buy_eth_cost` 是机器人先在一个市场买入的成本。
- `sell_eth_return` 是机器人立刻在另一个市场卖出的收入。
- `gas_cost` 是为了让交易被执行付给矿工的费用。
- 如果一组操作能在同一笔交易里原子完成，失败就整体回滚，机器人承担的风险会小很多。

论文选择 “pure revenue opportunities” 作为测量对象，就是因为它们的意图清楚：同一笔交易执行多次兑换，最后每种资产都不亏。

### 案例 2：PGA 里的 gas 替换像不断举牌

```ts
let gasPrice = 40
while (seenCompetitorBid()) {
  gasPrice = gasPrice * 1.125
  replaceTransaction({ nonce: 1453, gasPrice })
}
```

**逐部分解释**：

- `nonce` 相同，表示新交易会替换旧交易。
- `1.125` 对应论文观察到的最小加价趋势，很多机器人后来收敛到 12.5% 附近。
- `seenCompetitorBid()` 说明机器人不是安静等结果，而是根据内存池里看到的对手交易继续出价。

论文里的一个例子中，两个机器人在约十几秒内分别发出 42 和 43 笔竞价交易，最后只有排在前面的交易真正吃到套利机会。

### 案例 3：为什么 MEV 会威胁共识

```py
block_reward = 3.0
mev_in_block = 101.6

if mev_in_block > block_reward:
    print("重排这个区块的诱惑很大")
```

**逐部分解释**：

- `block_reward` 是老 PoW Ethereum 里诚实出块的基础收益。
- `mev_in_block` 是某个区块中可通过排序拿走的额外价值。
- 当额外价值远大于正常奖励，攻击者就有动机考虑分叉、抢走套利，甚至重写一段历史。

论文举到的高 MEV 区块里，单笔套利收入达到 101.6 ETH，明显高过当时 3 ETH 的区块奖励。

## 踩过的坑

1. **把 MEV 理解成“矿工贪心”**：不准确，MEV 是协议允许的排序权带来的经济空间，参与者可能是矿工、验证者、搜索者或构建者。

2. **以为透明就一定公平**：透明只表示大家都能看见，低延迟机器人反而更容易利用这些公开信息。

3. **只看成功上链交易**：PGA 的关键过程发生在 mempool 里，失败和被替换的交易也很重要；只看链上最终结果会漏掉竞价过程。

4. **把 DEX 套利当成普通应用 bug**：论文的重点是应用层套利会改变底层共识激励，所以它不是单个合约修一修就结束的问题。

## 适用 vs 不适用场景

**适用**：

- 解释 MEV、抢跑、三明治攻击、套利机器人这些 DeFi 基础概念。
- 分析“交易排序权”如何从一个技术细节变成经济资源。
- 理解为什么 mempool 数据比最终区块更能反映链上竞争过程。
- 讨论 PoW 链上高额手续费或排序收益对共识安全的影响。

**不适用**：

- 直接当作今天以太坊 PoS 架构的完整说明，因为论文写于 PoW 时代。
- 评估所有 MEV 类型的精确规模，因为论文只保守测量了其中一小类纯收益套利。
- 把它当智能合约漏洞清单，它更像市场结构和共识激励分析。
- 用它预测某个具体机器人现在是否盈利，因为交易生态已经变化很多。

## 历史小故事（可跳过）

- **2017 年**：作者团队先公开过一篇关于 0x 和 EtherDelta 去中心化套利成本的分析，意外让更多人看到这个市场。
- **2018 年**：团队改造 Go-Ethereum 节点，部署六个跨地域监控点，开始记录普通区块浏览器看不到的 mempool 竞价过程。
- **2019 年**：论文初版出现在 arXiv，提出 PGA 和 miner-extractable value 的系统化说法。
- **2020 年**：论文发表于 IEEE Symposium on Security and Privacy，成为后来 MEV 研究和工程实践的共同入口。
- **后来**：Flashbots、MEV-Boost、PBS 等方案，都在不同层面回应“排序权怎么公开、怎么约束、怎么分配”这个问题。

## 学到什么

1. **排序权就是钱**：在链上交易里，谁先执行不是小细节，而是可以定价、竞价、套利的资源。

2. **测量 mempool 才能看见竞争过程**：论文用 9 个月、约 300GB 数据和 7 亿多条观察记录，还原了被最终区块隐藏的 PGA 过程。

3. **应用层和共识层不是两张皮**：DEX 的套利机会会变成矿工收益，矿工收益又会影响是否诚实出块。

4. **MEV 是系统设计问题**：它不是靠骂机器人就能消失，而要靠市场机制、协议设计和交易隐私一起处理。

## 延伸阅读

- 论文原文：[Daian et al. 2020, Flash Boys 2.0](https://arxiv.org/abs/1904.05234)。
- Carlsten et al., "On the instability of bitcoin without the block reward", ACM CCS 2016：论文用它解释高额费用如何影响矿工稳定性。
- Eskandari, Moosavi, Clark, "SoK: Transparent Dishonesty: frontrunning attacks on Blockchain", arXiv 2019：更像抢跑问题的分类综述。
- Budish, Cramton, Shim, "The High-Frequency Trading Arms Race", QJE 2015：理解传统金融里低延迟竞赛的背景。
- [[go-ethereum]] —— 论文测量 mempool 时改造的客户端生态入口。
- [[uniswap-v3]] —— 后来的 AMM 交易设计，让 MEV 问题变得更日常。

## 关联

- [[bitcoin]] —— 论文多次对比普通支付链和智能合约链的矿工激励差异。
- [[go-ethereum]] —— 论文 fork geth 记录未确认和被替换交易，才能看见 PGA。
- [[uniswap-v3]] —— AMM 让价格差不断出现，是理解 DeFi 套利的关键背景。
- [[ethereum-yellow-paper]] —— gas、nonce、交易执行顺序这些机制的底层规范来源。
- [[carlsten-instability-bitcoin-2016]] —— 高费用区块可能破坏矿工诚实激励，是本文共识风险分析的前置论文。
- [[eskandari-frontrunning-2019]] —— 从抢跑攻击分类角度补充本文的测量和建模视角。
- [[flashbots]] —— 工程上回应 MEV 透明化和竞价外置化的后续生态。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
