---
title: Uniswap V3 — 集中流动性 AMM 核心合约
来源: 'https://github.com/Uniswap/v3-core'
日期: 2026-05-30
分类: blockchain
难度: 高级
---

## 是什么

Uniswap V3 是一组运行在 Ethereum 上的智能合约，它让任何人在链上把两种代币相互交换，而提供资金的人（LP）可以**只在自己看好的价格区间内做市**。

打个比方。V2 像一个永远营业的兑换店，把货架从「1 块」一直摆到「1 亿块」每个价位都摆点货——但 99% 的货位永远不会有人来买。V3 让你说：「我只在 0.99~1.01 这段摆货」，结果同样多的资金被压缩在一小段里，被买卖触达的概率高得多，手续费收入也高得多。

代码层面 v3-core 主要就两个合约：`UniswapV3Factory` 负责创建池子，`UniswapV3Pool` 是每对代币 + 每档手续费组成一个独立的池子。价格在 V3 里不是连续的实数，而是被切成一个个 **tick**（价位刻度，像货架上的价签）——相邻 tick 之间价格相差 1.0001 倍（约 0.01%）。LP 头寸记成「我从 tick A 到 tick B 提供了多少 liquidity」（这段货架上摆了多少货）。

最小心智模型：池子只追踪「当前激活区间」的总 liquidity；swap 沿当前 tick 滑动消耗它。价格滑过有 LP 边界的 tick 时，合约读出「跨过我要加 / 减多少 liquidity」并更新激活值，再继续滑。复杂度是 O(跨过的 tick 数) 而不是 O(LP 数)。

## 为什么重要

- 不理解 V3 的 tick 模型，就读不懂主流 DEX 聚合器（1inch / CowSwap）的路由代码
- 不理解集中流动性，就解释不了为什么稳定币对在 V3 上手续费能比 V2 高出几十倍
- 不理解多档 fee tier 设计，就理解不了「同一对币为什么有 0.05% / 0.3% / 1% 三个池子」
- 不理解 V3 的累计 tick oracle，就会写出读 `slot0` 现货价当预言机的安全漏洞
- 不理解 LP NFT 的语义，就解释不了为什么 V3 头寸能像艺术品一样转账抵押却不像 ERC20 那样可拆分

## 核心要点

1. **集中流动性**：像往一个杯子里倒水，V2 是把水倒进无限长的水槽里，V3 让你指定水只灌在某一段。区间内你的资金按 V2 的曲线工作，区间外不参与做市，资金效率因此被放大到几十~几千倍。
2. **Tick 量化**：所有可能的价格被切成等比离散点 `1.0001^i`。LP 头寸不是「在某点做市」而是「在 tick 区间 [tickLower, tickUpper] 做市」。每个 tick 上记录「跨过我时 liquidity 要加减多少」，swap 走到这里就更新当前激活的 liquidity。
3. **多档 fee tier**：同一对代币可以有多个池子，每个收不同手续费（稳定币对常用 0.05%，普通币对 0.3%，高波动币对 1%）。Factory 部署时锁定 fee，池子之间互不串账。
4. **Oracle 升级**：V2 累计价格 oracle 容易在大幅波动时失真。V3 改成累计 tick + 累计 seconds-per-liquidity，调用 `observe()` 能算任意时窗 **TWAP**（时间加权平均价），比 V2 更难被单笔操纵。
5. **NFT 化的 LP 头寸**：每个 LP 头寸编码成 ERC721 NFT（在 v3-periphery 的 NonfungiblePositionManager），因为区间各异没法用同质化 LP token；转账 / 抵押 / 挂单都围绕 NFT 做。

## 实践案例

### 案例 1：读懂一个 V3 池子的核心状态

```solidity
// IUniswapV3Pool.sol（节选）
function slot0() external view returns (
    uint160 sqrtPriceX96,  // 当前价格的平方根 × 2^96
    int24 tick,            // 当前激活 tick
    uint16 observationIndex,
    uint16 observationCardinality,
    uint16 observationCardinalityNext,
    uint8 feeProtocol,
    bool unlocked
);
function liquidity() external view returns (uint128);
function ticks(int24 tick) external view returns (
    uint128 liquidityGross, int128 liquidityNet, /* ... */
);
```

`sqrtPriceX96`（当前价的平方根 × 2^96 定点数）让 swap 只做整数乘除、避免开方丢精度；`liquidity()` 是当前 tick 区间内的总货量，会随跨 tick 跳变。`ticks(t).liquidityNet` 是「跨过 tick t 时要加 / 减多少货」，正负号代表区间方向。

### 案例 2：在 testnet 加一段窄区间流动性

```solidity
// NonfungiblePositionManager（v3-periphery）；token0/token1 须按地址从小到大
// fee=3000 → tickSpacing=60，tick 必须是 60 的倍数
INonfungiblePositionManager.MintParams memory p = MintParams({
    token0: USDC, token1: WETH, fee: 3000,
    tickLower: -60, tickUpper: 60,                   // 约现价 ±0.6% 窄窗口
    amount0Desired: 1000e6, amount1Desired: 1e18,
    amount0Min: 0, amount1Min: 0,
    recipient: msg.sender, deadline: block.timestamp
});
positionManager.mint(p);
```

逐步看：① `fee: 3000` 选 0.3% 池，tick 只能是 60 的倍数（0.05% 池 spacing=10，1% 池=200），否则 revert；② `[-60, 60]` 把货压在现价附近约 ±0.6%，资金效率立刻数十倍于全曲线；③ 价格一旦走出窗口，头寸停赚手续费并变成单边币种。

### 案例 3：用 observe() 自算 TWAP

```solidity
uint32[] memory secs = new uint32[](2);
secs[0] = 1800;  // 30 分钟前
secs[1] = 0;     // 现在
(int56[] memory tickCumulatives, ) = pool.observe(secs);
// 累计 tick 差值 ÷ 秒数 = 这段时间的平均 tick（TWAP：时间加权平均价）
int24 avgTick = int24((tickCumulatives[1] - tickCumulatives[0]) / 1800);
// 再把 avgTick 换成价格：price ≈ 1.0001^avgTick
```

直接读 `slot0().sqrtPriceX96` 当价格，会被一笔闪电贷在同一 block 内推到任意值；用 `observe()` 拿过去 N 秒平均，攻击者得跨多个 block 持续付资金成本。部分借贷/清算场景会拿 V3 TWAP 当防操纵参考（主喂价仍多为 Chainlink）。

## 踩过的坑

1. **窄区间高收益但易出区间**：把头寸放在 ±0.5% 窗口手续费率高，但只要价格穿出，头寸自动转成单边币种相当于在边界做了一次单边卖出，无常损失被实质化。
2. **跨 tick gas 翻倍**：swap 每跨一个有 liquidity 变化的 tick 都要 SSTORE，gas 比 V2 同等额度的 swap 高出可观比例；路由器要尽量选 tick 跨越少的池子。
3. **JIT 流动性**：MEV bot 看到大单进入 mempool，会在大单前一笔 mint 一个超窄区间吃手续费、大单后立刻 burn，散户 LP 的窄区间会被这种夹击稀释。
4. **slot0 不是 oracle**：直接读 `sqrtPriceX96` 当价格喂给清算或借贷合约，等于把抵押品估值的话语权交给闪电贷攻击者；必须用 `observe()` 的累计 tick 算 TWAP。
5. **observation cardinality 默认很小**：池子刚部署时只能查很短窗口的 TWAP，要先调 `increaseObservationCardinalityNext` 扩容才能拿 30 分钟以上的均价，否则 observe() 会读到环形缓冲区里被覆盖的旧数据。

## 适用 vs 不适用场景

适用：
- 主流币对做市，用现价 ±1%~±2% 窄区间放大手续费收入
- DEX 聚合器路由，拼多个 fee tier 池子凑最优价
- 链上协议需要防操纵参考价时，用 `observe()` 算 TWAP（常作 Chainlink 补充）
- 把 LP NFT 当抵押物借贷，或当结构化产品底层资产

不适用：
- 想完全不管理头寸的「躺平 LP」——V2 或 Curve 更省心
- 极度长尾、价格几乎只单边走的小币——区间一直要追，gas 吃光收益
- 链上喂价直接读现货价（必须改用 TWAP，否则一定被攻击）
- 流动性极薄的小池子——单笔大单跨光 tick，滑点与 gas 都比 V2 离谱

## 历史小故事（可跳过）

- 2017 年：Vitalik Buterin 的 reddit 帖提出「on-chain market maker」概念，启发了一批 AMM 研究
- 2018 年 11 月：Uniswap V1 上线，只支持 ETH ↔ ERC20 单跳，作者 Hayden Adams 受 Vitalik 一篇博客启发
- 2020 年 5 月：V2 上线，支持任意 ERC20 对 + 累计价格 oracle，xy=k 全曲线 LP
- 2021 年 3 月：V3 白皮书发布，提出集中流动性 + tick + 多档 fee
- 2021 年 5 月：V3 主网部署，BSL 1.1 商用许可保护两年
- 2023 年 4 月：BSL 到期，V3 开源为 GPL，立刻被 PancakeSwap / Sushi 等 fork 到多链
- 2024 年 1 月：V4 草案发布，在 V3 基础上加 hooks 让外部合约介入 swap 生命周期

## 学到什么

- 「让用户自选区间」把 AMM 资金效率从全曲线分摊跳到按需聚焦——把自由度还给用户、靠市场博弈而不是协议侧规则
- 用平方根价格 + 定点数（`sqrtPriceX96`）避免开方丢精度，是链上数学合约的常见手法
- TWAP 与现货价的一般性教训：链上任何「价格」若能在一笔交易里被改动，就不能直接用作清算依据
- 把连续价离散成等比 tick、把头寸表达成区间，是把无限维问题压成两个 int24 的工程美学；LP NFT 化又打开了「流动性即资产」的二级市场

## 延伸阅读

- Uniswap V3 白皮书 PDF：<https://uniswap.org/whitepaper-v3.pdf>
- 官方文档：<https://docs.uniswap.org/contracts/v3/overview>
- Dan Robinson 的 V3 数学讲解：<https://www.youtube.com/watch?v=Ehm-OYBmlPM>
- Atis Elsts 的 tick math 推导博客（深入 sqrtPriceX96 的整数算法）
- Paradigm 关于 JIT 流动性与 LP 收益的分析报告
- 关联：[[bitcoin]] —— DeFi 最早的去中心化资产
- 关联：[[go-ethereum]] —— Uniswap 合约运行的底层执行层

## 关联

- [[bitcoin]] —— 区块链原型，V3 服务于以太坊但思想根源在中本聪共识
- [[go-ethereum]] —— EVM 实现，V3 合约最终编译成 EVM 字节码在 geth 这类节点上跑
- [[paxos-1998]] —— 共识算法，区块链共识层与 Uniswap 的合约层正交但是底层依赖
- [[tcp]] —— RPC 调用 V3 节点最终走 TCP，理解链下到链上调用栈
- [[boehm-gc]] —— Solidity 没 GC 但有引用计数的存储槽思维，对照学习内存管理
- [[hindley-milner]] —— Solidity 类型系统比 HM 弱很多，对照看为什么类型推断难
- [[skip-list-1990]] —— V3 的 tick bitmap 按 word 分层查找，结构上是简化版 skip list 思维

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[aave-v3]] —— Aave V3 — 借贷协议旗舰
- [[anchor]] —— Anchor — Solana 合约开发框架
- [[aptos-core]] —— Aptos — Move 系高性能 L1
- [[aragon]] —— Aragon OSx — 一份内核合约管所有 DAO 的乐高套件
- [[arbitrum]] —— Arbitrum Nitro — Offchain Labs 的 Optimistic Rollup 客户端
- [[arweave]] —— Arweave — 一次付费、永远存着的区块链
- [[axelar]] —— Axelar — 通用跨链 gateway
- [[balancer]] —— Balancer V2 — 通用 AMM 与权重池
- [[bitcoin]] —— Bitcoin 白皮书
- [[boehm-gc]] —— Boehm-Weiser 保守式垃圾回收 — 不改编译器也能给 C 加 GC
- [[chainlink]] —— Chainlink — 智能合约的"感官系统"
- [[chainlink-ccip]] —— Chainlink CCIP — 让两条链像两个银行那样互转钱
- [[compound-v3]] —— Compound III (Comet) — 单抵押借贷重构
- [[cosmos-sdk]] —— Cosmos SDK — 应用链开发框架
- [[curve]] —— Curve — 稳定币低滑点兑换协议
- [[ethers-js]] —— ethers.js — 浏览器和 Node 都能用的以太坊客户端库
- [[go-ethereum]] —— Go-Ethereum (Geth) — 以太坊主流 Go 客户端
- [[hindley-milner]] —— Hindley-Milner — 编译器自己猜变量类型
- [[ipfs-2014]] —— IPFS — 把"地址"换成"内容本身"的 P2P 文件系统
- [[layerzero]] —— LayerZero V2 — 让一条链上的合约能给另一条链上的合约发消息
- [[makerdao]] —— MakerDAO — 用抵押 ETH 铸出锚定美元的 DAI
- [[monero]] —— Monero — 默认隐私的 PoW 加密货币
- [[opensea-js]] —— opensea-js — NFT 二级市场的官方 SDK
- [[openzeppelin-contracts]] —— OpenZeppelin Contracts — 以太坊智能合约的事实标准库
- [[optimism]] —— Optimism — 以太坊 L2 旗舰栈，把交易搬到便宜车道再回主网结算
- [[paxos-1998]] —— Paxos 1998 — 古希腊议会寓言里藏的共识协议
- [[polygon-zkevm]] —— Polygon zkEVM — 用零知识证明给以太坊扩容
- [[pyth]] —— Pyth Network — 一手数据上链的低延迟预言机
- [[reservoir-sdk]] —— Reservoir SDK — 跨市场 NFT 聚合
- [[scroll]] —— Scroll — 字节码级 zkEVM
- [[skip-list-1990]] —— Skip List — 用抛硬币代替平衡树
- [[snapshot]] —— Snapshot — DAO 不花 Gas 也能投票的链下治理前端
- [[solana]] —— Solana — Rust 写的高性能 PoH 链
- [[sui]] —— Sui — 把链上资产拆成一个个独立对象的 L1
- [[tcp]] —— TCP — 在不可靠的 IP 上凿出一条 reliable 字节流
- [[tendermint-2016]] —— Tendermint — 把拜占庭共识塞进开放区块链的工程模板
- [[thirdweb-sdk]] —— thirdweb SDK — 一站式 Web3 全家桶
- [[viem]] —— viem — 现代 TypeScript EVM 库
- [[web3-js]] —— web3.js — 老牌 EVM JavaScript 客户端库
- [[wormhole]] —— Wormhole — 多链之间替你跑腿的"邮政系统"
- [[zcash]] —— Zcash — 让转账在链上"既能被验证，又看不见内容"
- [[zksync-era]] —— zkSync Era — Matter Labs 的 zkEVM L2

