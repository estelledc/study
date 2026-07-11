---
title: Balancer V2 — 通用 AMM 与权重池
来源: 'https://github.com/balancer/balancer-v2-monorepo'
日期: 2026-05-30
分类: 区块链
难度: 中级
---

## 是什么

Balancer V2 是以太坊上的**通用自动化做市商（AMM）协议**：把所有池子的资金集中到**一个 Vault 合约**里托管，池子合约只负责数学公式（输入多少 X 出多少 Y），不再自己拿 token。日常类比：以前每个商铺自己开收银台，现在整条街共用一个保险柜，收银员只负责算账。

你写一笔 swap，发给 Vault：

```solidity
vault.swap(
  SingleSwap({ poolId: 0xabc..., assetIn: WETH, assetOut: USDC, amount: 1e18 }),
  funds, limit, deadline
);
```

Vault 找到对应池子合约，问它"换出多少？"，池子按自己的不变量算完返回数字，Vault 完成转账。Uniswap V2 只能做 50/50 二元对，Balancer 可以做 80/20、60/20/20 任意权重 N 资产池，加权 / 稳定币 / 启动型池都是同一个 Vault 下的可插拔模块。

## 为什么重要

不理解 Balancer V2，下面这些事都没法解释：

- 为什么 DeFi 里的"指数基金池"（如 80% ETH + 20% BAL）能像股票指数一样自动再平衡，无需人工干预
- 为什么 Vault 单合约不是中心化风险，反而更省 gas、更容易组合
- 为什么 flash loan（闪电贷）在 Balancer V2 常被配置成 0 费率——它走 Vault 统一结算，但费率仍是协议参数
- 为什么 multihop swap（一笔交易跨多个池子）能比逐池 swap 节省 30%+ gas

## 核心要点

Balancer V2 的设计可以拆成 **三层**：

1. **Vault 单合约托管**：所有池子的 token 余额都记在 Vault 里。池子合约只是个"算账模块"，不持有资产。类比：池子合约是菜单，Vault 是后厨——客人下单走 Vault，菜单只决定怎么算。

2. **池子范式可插拔**：加权池（任意权重）、稳定币池（StableSwap 不变量）、启动池（权重随时间线性变化）、复合池（嵌套池）都实现同一套接口，挂到 Vault 上就能用。类比：插座是 Vault，电器（池子）只要插头标准就行。

3. **批量 swap + 内部记账**：`batchSwap` 一笔交易跨 N 个池子，所有中间转账只在 Vault 内部记账（不调 ERC20 transfer），最后只动一次余额。类比：在同一家银行内部转账不用走清算系统。

三层加起来，让 N 资产任意权重池子从"理论可行"变成"gas 上能用"。

## 实践案例

### 案例 1：加权池怎么算 swap

加权池的不变量是 Π B_i^w_i = k（B_i 是余额，w_i 是权重，加权几何平均恒定）。一个 80% ETH + 20% USDC 池：

```
swap 前: 100 ETH × 50000 USDC，权重 0.8 / 0.2
不变量 k = 100^0.8 × 50000^0.2 ≈ 346.57
现货价 = (B_USDC / w_USDC) / (B_ETH / w_ETH) = 250000 / 125 = 2000 USDC/ETH

用户给 1 ETH（不计手续费），求出多少 USDC？
新余额: 101 ETH × (50000 - x) USDC，仍要满足 k 不变
解出 50000 - x = (k / 101^0.8)^5 ≈ 48049
x ≈ 1951 USDC（接近 2000，因为 1 ETH 占 ETH 余额比例小，滑点低）
```

**逐部分解释**：

- 现货价由权重和余额一起决定，与 Uniswap V2 的"价格 = y/x"不同
- 50/50 池退化为 Uniswap V2 的 x × y = k
- 权重越偏（如 80/20），小资产侧的滑点越敏感
- LP 不需要做"对冲"，加仓只要按权重比例存入

### 案例 2：用 flashLoan 做零本金套利

```solidity
vault.flashLoan(
  recipient,    // 我的合约
  [USDC],       // 借什么
  [1_000_000e6], // 借多少
  data
);
// recipient 在回调里：
// 1. 用 1M USDC 在 Balancer 池低价买 ETH
// 2. 在 Uniswap 高价卖 ETH 拿回 USDC
// 3. 还款 1M USDC + 当前协议配置要求的 fee（很多时期 fee = 0）
// 4. 利润进自己口袋
```

recipient 必须实现 `IFlashLoanRecipient.receiveFlashLoan` 接口（Vault 在转账后回调进去），整笔交易原子执行——任一步失败就全部 revert。不要在集成里把"免费"写死：V2 很多时期 fee 为 0，但仍应从 Vault/协议配置读当前费率。

### 案例 3：batchSwap 跨池 multihop

想用 DAI 换最多的 USDT，路径 DAI → USDC → USDT：

```javascript
const swaps = [
  { poolId: pool1, assetInIndex: 0, assetOutIndex: 1, amount: 1000e18 },  // DAI→USDC
  { poolId: pool2, assetInIndex: 1, assetOutIndex: 2, amount: 0 },        // USDC→USDT
];
await vault.batchSwap(SwapKind.GIVEN_IN, swaps, [DAI, USDC, USDT], funds, limits, deadline);
```

中间的 USDC 从来没真的离开 Vault，只是内部记账两次。逐池 swap 要 2 次 ERC20 transfer + 2 次合约跳转，batchSwap 只动一次最终余额。

## 踩过的坑

1. **80/20 池不是"更安全的 50/50"**：相对 HODL 的无常损失通常比 50/50 小，但你仍然 80% 暴露在主资产上；如果主资产暴跌，账户净值照样大幅下滑。别把"IL 低一点"误读成"本金安全"。

2. **Vault 升级面是全协议级**：所有 token 都在 Vault 里，一旦 Vault 漏洞影响所有池子。这就是为什么 Balancer 的形式化验证 + 审计预算是 Uniswap 的好几倍。

3. **流动性引导池（LBP）权重会自动滑动**：项目方用 LBP 发币时，初始 90/10 慢慢滑到 50/50，不懂规则的散户高位接盘后看着权重往下走只能硬扛。

4. **复合池嵌套深 = 价格预言机延迟放大**：一个池子的 LP token 作为另一个池子的资产时，外层池价格依赖内层池更新，多层叠加延迟会被链上预言机攻击者利用。

## 适用 vs 不适用场景

**适用**：
- 做指数化资金池（如 ETH/BTC/USDC 任意比例）→ 选 WeightedPool
- 稳定币之间低滑点 swap → 选 StablePool（StableSwap 曲线）
- 项目方公平发币、避免狙击 → 选 LiquidityBootstrappingPool
- 需要 multihop / flashLoan 的 DeFi 集成 → Vault 接口最干净

**不适用**：
- 想做集中流动性（在某价格区间放大资本效率）→ 选 [[uniswap-v3]] 或 Balancer V3 hooks
- 单纯两资产 50/50 spot trading → Uniswap V2 简单 + 集成最广
- 需要 KYC / 许可制流动性 → AMM 模型不适合（链下做市商更合适）
- 高频套利做市 → AMM 滑点机制天然劣于 order book

## 历史小故事（可跳过）

- **2020 年初**：Mike McDonald 和 Fernando Martinelli 上线 Balancer V1，开创"任意权重多资产池"概念，但每个池子是独立合约，gas 高、组合差。
- **2021 年 5 月**：V2 白皮书发布，引入 Vault 单合约 + 模块化池子，TVL 一度过 30 亿美元。
- **2021-2022 年**：veBAL（投票托管 BAL）治理代币模型上线，借鉴 Curve 的 ve 模式锁定流动性激励。
- **2023 年**：V2 部分池型曝出安全风险，团队要求 LP 迁出或暂停相关池权重；这提醒大家 Vault 安全不等于每个池型都零风险。
- **2024 年**：V3 引入 hooks 等扩展点，进一步简化池子开发；但 V2 因存量深、集成多，仍长期保留主力部署。

## 学到什么

1. **架构上把"托管"和"逻辑"解耦**——不只是省 gas，还让池子开发门槛降到只写一个数学函数
2. **单合约不一定是中心化风险**——只要审计 + 形式化验证够，反而比每池一合约更安全
3. **flashLoan 免费 ≠ 福利**——它让套利者保持池子价格对齐，反过来对 LP 有利
4. **AMM 范式的扩展不是另起炉灶**——Balancer 走"通用 Vault + 可插拔池子"，Uniswap V3 走"集中流动性"，两条路都在解决资本效率

## 延伸阅读

- 官方文档：[Balancer Docs](https://docs.balancer.fi/)（V2/V3 都覆盖，有 invariant 推导）
- V2 白皮书：[Balancer V2 Whitepaper](https://github.com/balancer/balancer-v2-monorepo/blob/master/whitepaper.pdf)
- 视频讲解：[Finematics — How Balancer Works](https://www.youtube.com/watch?v=1dBUOZqA2Ec)（10 分钟把 AMM 多资产池讲透）
- 加权池数学：[Smart Pools: Weighted Math](https://medium.com/balancer-protocol/balancer-v2-generalizing-amms-16343c4563ff)
- [[uniswap-v3]] —— 同代竞品，走集中流动性而非多资产权重路线

## 关联

- [[uniswap-v3]] —— 集中流动性 AMM，与 Balancer 是 AMM 范式的两个分支
- [[curve]] —— StableSwap 不变量发明者，Balancer StablePool 借鉴了这一曲线
- [[aave-v3]] —— 借贷协议，常与 Balancer 组合做 flashLoan 套利
- [[compound-v3]] —— 同代借贷协议，搭配 Balancer 做收益策略
- [[makerdao]] —— DAI 发行协议，DAI 是 Balancer 稳定币池的常客
- [[safe-contracts]] —— 多签钱包，DAO 国库常用 Safe 持有 Balancer LP token
- [[foundry]] —— Solidity 测试框架，写 Balancer 集成时常用

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）
