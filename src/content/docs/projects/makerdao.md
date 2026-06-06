---
title: MakerDAO — 用抵押 ETH 铸出锚定美元的 DAI
来源: 'https://github.com/makerdao/dss'
日期: 2026-05-30
子分类: 链与合约
分类: 区块链
难度: 中级
provenance: pipeline-v3
---

## 是什么

MakerDAO 是一套**部署在以太坊上的去中心化稳定币系统**：你把 ETH 等波动资产锁进它的金库，它给你铸出和美元 1:1 锚定的 ERC20 代币 DAI。日常类比：像把房产抵押给银行换房贷，只是这里"银行"是一堆 Solidity 合约，"借出的钱"是 DAI，"房价"由预言机喂上链。

最常见的用法：

```text
锁 1 ETH（假设值 3000 USD） → 铸出 1500 DAI（150% 抵押率）
ETH 涨 → 你舒服 / ETH 跌过 150% 线 → 合约自动拍卖你的 ETH 还债
```

整套合约集叫 **dss**（Dai Stablecoin System），2019 年 11 月上线多抵押版本，至今是去中心化稳定币市值第一。

## 为什么重要

不理解 MakerDAO，下面这些事都没法解释：

- 为什么链上需要"超额抵押稳定币"——USDT/USDC 靠银行托管，DAI 想做到不需要银行也能锚 1 美元
- 为什么 DeFi 协议（Aave / Compound / Uniswap）的稳定币交易对绕不开 DAI
- 为什么 2020-3-12 黑色星期四一次性把 MakerDAO 推上风险管理的教材
- 为什么"链上治理"这套词从 Maker 开始流行——MKR 持币人投票就能改写借贷参数

## 核心要点

dss 这套合约可以拆成 **三层**：

1. **账本层（Vat）**：所有抵押物余额、债务、稳定费率都在 Vat 这一个合约里记账。Vat 不调用任何外部合约，也不做精度损失运算。类比：银行的总账本——其他业务都是来调它。

2. **风险层（Spotter / Jug / Cat / Dog）**：Spotter 拉预言机价更新抵押物的安全系数；Jug 按时累计稳定费（你借 DAI 的利息）；Cat / Dog（Liquidations 1.0 / 2.0）在抵押率跌破清算线时启动拍卖。

3. **平衡层（Vow / Flap / Flop / Pot）**：Vow 收坏账和盈余；盈余多了开 Flap 拍卖（用 DAI 换 MKR 销毁）；坏账多了开 Flop 拍卖（增发 MKR 换 DAI 补缺）；Pot 是 DSR——让 DAI 持有者把 DAI 锁进去吃存款利率。

治理通过 MKR 持有者投票，把 **Spell 合约**安排进 Pause 后调用 Vat / Jug / Spotter 改写参数。

## 实践案例

### 案例 1：在 fork 出来的主网上开一个 Vault

用 [[foundry]] 起一个本地 fork，跑通完整借贷流程：

```bash
anvil --fork-url $MAINNET_RPC

# 1. 拿一个有 ETH 的地址（Vitalik 的）impersonate
cast rpc anvil_impersonateAccount 0xab5801a7d398351b8be11c439e05c5b3259aec9b

# 2. 通过 ETH-A 的 GemJoin 把 ETH 包成 WETH 再存进 Vat
cast send $ETH_A_JOIN "join(address,uint256)" $ME 1ether --value 1ether

# 3. 在 Vat 里 frob：抵押 1 WETH，借出 1500 DAI
cast send $VAT "frob(bytes32,address,address,address,int256,int256)" \
  ETH-A $ME $ME $ME 1ether 1500ether
```

跑完看 `vat.urns(ETH-A, $ME)` 就能看到自己这条 Vault 的 ink（抵押）和 art（债务）。

### 案例 2：读一份历史 Spell 看治理怎么改参数

每次 MKR 投票通过的执行实质就是部署一份 Spell：

```solidity
// 简化版 Spell：把 ETH-A 的稳定费从 5% 改成 6%
contract DssSpellAction {
    function execute() external {
        Jug(jug).file("ETH-A", "duty", 1000000001847694957439350562);
        // ↑ 复利累计后约等于年化 6%，单位是 ray (1e27)
    }
}
```

Spell 通过 `pause.plot(spell, sig, data, eta)` 排进 GSM（Governance Security Module）冷静期，到点再 `cast`。读懂一份 Spell = 读懂 Maker 治理。

### 案例 3：在历史链上看一笔黑色星期四清算

到 etherscan 翻 2020-3-12 那天的 Flip 拍卖事件：

```text
事件: Tend(uint256 id, uint256 lot, uint256 bid)
中标 bid: 0 DAI
中标人: 0x... (孤独的 Keeper)
```

清算拍卖参数当时设定：tau=6h、ttl=10min、beg=3%。极端拥堵下没人来出价，唯一出现的 Keeper 用 0 DAI 拍走 ETH——系统记下 ~530 万 DAI 坏账。事后 MKR 增发 + 引入 PSM 才补上。

## 踩过的坑

1. **三套定点数 wad/ray/rad 别混用**：wad=1e18 表余额、ray=1e27 表利率、rad=1e45 表 Vat 内部"债务×费率"。乘除顺序错一位，精度差几个数量级。dss 用 mul/rmul/wmul 三套宏区分。

2. **预言机不是实时的**：Spotter 把 OSM（Oracle Security Module）冷却 1 小时后的中位价喂进 Vat，目的是防短时操纵；副作用是真实价格暴跌时清算线**滞后**——黑色星期四就是这条线被突破后无人出价。

3. **抵押率前端显示 ≠ 链上能不能 bite**：前端算的是 wad 比 wad，链上判定要等 Spotter 把 OSM 价喂进 Vat 后 spot 字段更新才算数。新人按前端 149% 算"还安全"，链上其实已经 bite 了。

4. **PSM 让 DAI 半中心化了**：Peg Stability Module 把 DAI 通过 1:1 兑 USDC 维持锚定，事实上把 USDC 的中心化风险（Circle 黑名单地址）传进了 DAI——"去中心化稳定币"叙事从 2020 后被打了折扣。

## 适用 vs 不适用场景

**适用**：

- 想理解链上稳定币是怎么"不靠托管"锚定法币的
- 写 DeFi 协议要和 DAI 打交道：清算、闪贷、利率
- 想读一份生产级 Solidity 合约——dss 代码注释密、模块边界清晰
- 想搞懂"链上治理"长什么样

**不适用**：

- 直接拿 dss 当 Solidity 入门教程——它假设你懂 ERC20 / 预言机 / 拍卖
- 想搞算法稳定币（如 UST）——MakerDAO 是超额抵押路线，不是算法路线
- 只想"用"DAI 不想看合约——那直接 [[metamask]] 装钱包买就行
- L2 上的稳定币方案（Maker 主体在 L1，桥到 L2 后机制不同）

## 历史小故事（可跳过）

- **2014 年**：Rune Christensen 在 reddit 发帖提出 eDollar，后来叫 Maker
- **2017 年 12 月**：单抵押 SAI 上线，只支持 ETH 抵押，铸出来的稳定币当时叫 SAI
- **2019 年 11 月**：多抵押 dss 上线，SAI 改名 DAI，加入 BAT、wBTC 等多种抵押物
- **2020 年 3 月 12 日**：黑色星期四，ETH 单日跌 50% + gas 飙到 1000 gwei，Keeper 出价 0 DAI 拍走 ETH，留下 ~530 万 DAI 坏账
- **2020 年之后**：引入 PSM、Liquidations 2.0（Clip 替代 Flip 改成"持续降价"拍卖）、Endgame 计划拆 Maker 成多个 SubDAO

## 学到什么

1. **链上稳定币的核心是清算机制不是铸币机制**——能不能在抵押物暴跌时回收坏账，决定系统会不会崩
2. **预言机延迟和清算参数要联调**——OSM 1h 冷却 + 拍卖 6h 时长，在极端市况下是叠加风险
3. **去中心化是光谱**——MakerDAO 从纯 ETH 抵押滑到 PSM/USDC，提醒"完全去中心化"在工程上很难守住
4. **治理也是合约**——Spell + Pause + GSM 这套设计把"投票通过"翻译成"链上可执行"，是后来 Compound / Aave 治理的模板

## 延伸阅读

- 官方文档：[docs.makerdao.com](https://docs.makerdao.com/)（dss 各模块详解，Vat / Cat / Spotter）
- 黑色星期四官方复盘：[Black Thursday Response](https://blog.makerdao.com/recent-market-activity-and-next-steps/)
- dss 源码导读：[dss/src/vat.sol](https://github.com/makerdao/dss/blob/master/src/vat.sol)（200 行就是整个账本）
- 视频：[Whiteboard Crypto — How MakerDAO Works](https://www.youtube.com/results?search_query=makerdao+dai+how+it+works)
- [[uniswap-v3]] —— 集中流动性 AMM，DAI/USDC 池子常驻链上
- [[aave-v3]] —— 同期最大借贷协议，DAI 是核心可借资产

## 关联

- [[bitcoin]] —— 第一个不靠托管的链上资产；MakerDAO 把这种思路搬到稳定币
- [[go-ethereum]] —— MakerDAO 跑在以太坊上，go-ethereum 是主流执行客户端
- [[uniswap-v3]] —— DAI 大量流动性来自 Uni 池子；Maker 和 Uni 是 DeFi 双柱
- [[aave-v3]] —— 借贷协议，常用 DAI 做超额抵押币种
- [[compound-v3]] —— 另一大借贷协议，与 Maker 思路相近但只做借贷不发稳定币
- [[foundry]] —— 本地 fork 主网调 dss 合约最常用的工具链
- [[safe-contracts]] —— 多签合约，Maker 治理冷钱包常用 Safe

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[aave-v3]] —— Aave V3 — 借贷协议旗舰
- [[balancer]] —— Balancer V2 — 通用 AMM 与权重池
- [[bitcoin]] —— Bitcoin 白皮书
- [[compound-v3]] —— Compound III (Comet) — 单抵押借贷重构
- [[curve]] —— Curve — 稳定币低滑点兑换协议
- [[foundry]] —— Foundry — Paradigm 出品的 Rust 合约工具链
- [[go-ethereum]] —— Go-Ethereum (Geth) — 以太坊主流 Go 客户端
- [[just]] —— just — 把 make 拆成两半，只留 ‘命令编排’ 那一半
- [[metamask]] —— MetaMask — 装在浏览器里的以太坊钱包
- [[safe-contracts]] —— Safe — 多签智能账户合约
- [[snapshot]] —— Snapshot — DAO 不花 Gas 也能投票的链下治理前端
- [[uniswap-v3]] —— Uniswap V3 — 集中流动性 AMM 核心合约

