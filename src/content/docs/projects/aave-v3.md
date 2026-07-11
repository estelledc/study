---
title: Aave V3 — 借贷协议旗舰
来源: 'https://github.com/aave/aave-v3-core'
日期: 2026-05-30
分类: blockchain
难度: 高级
---

## 是什么

Aave V3 是一组运行在 Ethereum 及主流 L2 上的智能合约，它让任何人把闲置代币存进一个共享池子赚利息，也让任何人用自己的代币做抵押从同一个池子里借出别的代币去用。

打个比方。传统银行是一对一找对手方的撮合，每笔借款都要单独签合同。Aave 像一个永远营业的自动柜员机：你存进 1000 USDC 拿到一张「凭证票」（aToken），凭证票上的数字会随时间自己往上长；别人想借 USDC 就把 ETH 押进来按当前公示利率取走，公示利率本身随池子的「利用率」实时变动。

代码层面 v3-core 的中心是 `Pool` 合约：所有 supply / borrow / repay / withdraw / liquidationCall 都从这一个入口走。每种资产有一组配套合约——计息凭证 `AToken`、可变利率债务 `VariableDebtToken`、稳定利率债务 `StableDebtToken`、利率策略 `DefaultReserveInterestRateStrategy`，外加全局共享的 `PriceOracle` 与 `ACLManager`。

最小心智模型：池子里只有「每种资产的总流动性」与「每个用户的存 / 借头寸」两类账本。利率是利用率 `U = totalDebt / (totalDebt + availableLiquidity)` 的分段函数；健康因子 `HF = ∑(抵押 × 清算阈值) / ∑债务`，跌破 1 就允许清算人替还一半债务换走对应抵押 + 奖励金。

## 为什么重要

- 不理解 Aave 的 Pool 模型，就读不懂主流 DeFi 借贷协议（Compound III、Spark、Radiant）的代码结构
- 不理解 isolation mode，就解释不了「为什么新资产上市初期只能借出几种稳定币」
- 不理解 e-mode，就理解不了「为什么 stETH 抵押借 ETH 能拿到 93% LTV 而正常资产只有 80%」
- 不理解债务代币化（VariableDebtToken），就读不懂闪电贷与债务转移这类高级用法
- 不理解 health factor 与清算路径，就写不出安全的杠杆策略合约

## 核心要点

1. **Pool 中心化入口**：所有用户操作都从 `Pool.supply / borrow / repay / withdraw / liquidationCall` 进，再分发到对应的 aToken / debt token。这种设计让外部合约只需对接一个地址，所有资产的逻辑被收敛在同一处。
2. **aToken 与 Debt Token**：存款拿到 aToken（1:1 计息凭证，余额随时间自动增长），借款生成 VariableDebtToken（数字随利率累计变多）。两个 token 都是 ERC20，转账即转头寸，但 aToken 的 `transfer` 会同步调整背后存款。
3. **Isolation Mode（隔离模式）**：新资产上线先开启隔离，抵押该资产时只能借出协议白名单里的稳定币，且总债务有 `debtCeiling` 上限。一旦风险被验证再「升级」为正常抵押品。这是把新资产风险与全局账本隔开的关键。
4. **E-Mode（高效模式）**：把强相关资产分到同一档位（如全部稳定币、全部 ETH 衍生品），档位内 LTV 与清算阈值同步抬高（最高 95%）。用户主动开启 e-mode 后只能在该档位资产间互借互押。
5. **利率策略 + Health Factor**：每个资产配一个 `InterestRateStrategy`，按利用率 U 分两段（U < optimalUsage 走 slope1，超过走 slope2 陡升）。健康因子是清算引擎的总开关，HF < 1 即任何清算人都可来处理。

## 实践案例

### 案例 1：读懂一个 reserve 的核心配置

```solidity
// IPool.sol（节选）
function getReserveData(address asset) external view returns (
    DataTypes.ReserveData memory        // 含 liquidityIndex / variableBorrowIndex
);                                      // / currentLiquidityRate / aTokenAddress 等
function getUserAccountData(address user) external view returns (
    uint256 totalCollateralBase,
    uint256 totalDebtBase,
    uint256 availableBorrowsBase,
    uint256 currentLiquidationThreshold,
    uint256 ltv,
    uint256 healthFactor                // 1e18 = 1.0，跌破即可被清算
);
```

`liquidityIndex` 与 `variableBorrowIndex` 都是 27 位定点数（RAY），分别记「自池子开张以来 1 单位存款 / 1 单位借款累计变成多少」。aToken 余额 = `principal × liquidityIndex / userIndex`，靠这两个 index 实现「不需逐用户更新」的全局计息。

### 案例 2：在测试网做一笔抵押借款

```solidity
// 1) 授权并存入 1 ETH 作抵押
IERC20(WETH).approve(address(pool), 1e18);
pool.supply(WETH, 1e18, msg.sender, 0);
// 2) 设为抵押品（V3 默认开启，但 e-mode / isolation 资产要确认）
pool.setUserUseReserveAsCollateral(WETH, true);
// 3) 借出 1500 USDC（变动利率）
pool.borrow(USDC, 1500e6, 2, 0, msg.sender);
//   interestRateMode: 1=stable, 2=variable
```

第三步成功的前提是健康因子借完后仍 ≥ 1。借完之后 `getUserAccountData` 里 `totalDebtBase` 立刻变大、`healthFactor` 缩小。注意 V3 把 stable debt 模式逐渐弱化，新部署池子很多直接禁用 stable 模式，借款时传 `1` 会 revert。

### 案例 3：监控并触发一笔清算

```solidity
( , , , , , uint256 hf) = pool.getUserAccountData(target);
require(hf < 1e18, "healthy");
// 替这位用户还掉一半 USDC 债务，换走他押的 WETH 抵押
IERC20(USDC).approve(address(pool), debtToCover);
pool.liquidationCall(
    WETH,            // collateralAsset
    USDC,            // debtAsset
    target,          // user
    debtToCover,     // 不超过 50%（closeFactor）
    false            // receiveAToken: false 就直接拿底层 WETH
);
```

清算成功能多拿到 `liquidationBonus`（一般 5%~10%）作为奖励。`closeFactor` 默认 50%，意思是单笔最多还掉对方一半债务；只有当 HF 跌到协议阈值以下（常见是 0.95）才会切到 100% close factor，允许一次覆盖全部债务。要做清算 bot 就得盯着每个用户的 HF 与 mempool 里的喂价更新，先到先得。

## 踩过的坑

1. **aToken 的 rebasing 行为**：把 aToken 当普通 ERC20 算余额，扣掉 transfer 数额做对账会发现「凭空多出来」一点——那是利息累计，不是 bug；做合约层面的会计要用 `scaledBalanceOf` 配合 index 自己换算。
2. **Stable debt 模式被弃用**：照旧版教程传 `interestRateMode = 1` 借款，新池子直接 revert；要先查目标资产的 `getReserveData` 里 stable rate 是否启用。
3. **Isolation 资产的债务上限**：抵押新上市的隔离资产去借 USDC，借到一半 revert——查 `debtCeiling` 已经被全局借满；这种资产只能等额度释放或换抵押品。
4. **E-mode 切换风险**：用户从 e-mode（LTV 93%）切回普通模式（LTV 80%），原来正好的仓位瞬间 HF 跌到 0.95；前端要在切换前先模拟新 HF。
5. **Oracle 跌价但未上链**：Chainlink 的喂价有 heartbeat（1h~24h），价格跌了但喂价合约还没更新，HF 看着安全但实际已危险；做 keeper 不要只信链上 HF，要 cross-check 现货价。
6. **closeFactor 50% 误以为能一次清完**：刚入门做清算 bot，容易写成「HF<1 就一次还完所有债」，结果 revert——除非 HF 跌穿 close-factor 阈值进入 100% close factor，多数情况只能分两次清。
7. **Reserve Factor 与协议金库**：借款利息有一部分（通常 10%~25%）作为 Reserve Factor 流入 DAO 金库不分给存款人；做收益对账要把这部分扣掉，否则前端展示的 APR 与到手不一致。

## 适用 vs 不适用场景

适用：
- 让代币产生持有收益（存进去拿 aToken 自动计息，比放钱包高）
- 不卖出抵押币就拿到稳定币流动性（典型抵押 ETH 借 USDC 应急）
- 杠杆做多 / 做空（循环存借放大头寸，配合 e-mode LTV 拉高）
- 给清算 bot / DeFi 聚合器对接做底层借贷源

不适用：
- 想要固定利率长期借款（V3 stable 模式实际已被关，利率随 U 跳动）
- 借小币种 / 长尾资产（多数没在 Aave 上市，要去 Morpho / Euler）
- 需要无抵押信贷（Aave 只服务超额抵押，纯信用借走 Goldfinch / TrueFi）
- 在 gas 极贵的窗口做小额操作（Pool 调用每步 SSTORE 多，单笔 80k+ gas）
- 想要纯无许可的资产上市（Aave 治理审批门槛较高，新资产排队周期长，不像 Morpho 那样开放）

## 历史小故事（可跳过）

- 2017 年 11 月：ETHLend 上线，P2P 撮合借贷，没池化，效率很低
- 2020 年 1 月：项目改名 Aave（芬兰语「鬼魂」），转型池化借贷 V1
- 2020 年 12 月：V2 上线，引入 stable / variable 双轨债务 token，闪电贷正式产品化
- 2022 年 3 月：V3 主网部署，提出 isolation mode + e-mode + Portal 跨链
- 2023 年 7 月：原生稳定币 GHO 上线，与 Pool 利率联动
- 2024 年：V3 在 zkSync / Scroll / Linea 等 L2 全面铺开，TVL 多数时间稳居 DeFi 借贷头部
- 2025 年：社区开始讨论 V4，将抵押与借贷分离为「Vault + Hub」式架构
- 2025 年下半：V4 草案细化，提出「unified liquidity layer」让多池共享存款，进一步降低做市分散
- 2026 年初：Aave 在 Base / Arbitrum 等 L2 的 TVL 持续上涨，逐步接管以太坊主网长期占据的借贷头部位置

## 学到什么

- 「Pool 单入口 + 资产化的存 / 借头寸」这套抽象，把传统银行需要逐笔记账的负债转成可转账的 ERC20，DeFi 任何与借贷相关的二次开发（聚合器、清算 bot、固定利率层）都靠这层抽象拼装
- 「全局 index + 用户 scaledBalance」相乘得到当前真实余额，是无需逐用户写 SSTORE 的高效计息术，也是定点数（RAY）与 27 位精度选取背后的工程考量
- isolation mode 是软件工程里「先沙箱再放行」思路在金融协议上的对应——新风险源默认有限暴露，跑过一段时间再扩权限
- 用利用率分段曲线表达利率，是「市场出清」与「协议可控」的折中：协议守住 optimalUsage 这个目标点，利率激进升高把流动性逼回来
- 把每个用户的债务都铸成单独的 token，让债务能转账、能被合约持有，是「一切皆资产」DeFi 思想的最纯粹体现
- E-mode 这类「按相关性分档」的设计，是金融工程「风险隔离 vs 资本效率」二律背反在协议代码里的妥协：相关高就放一起加杠杆，相关低就强制分桶，本质上是把表外风险显式落到合约配置里
- Health Factor 这种「单一标量阈值 + 公开可验证 + 谁都能触发」的设计，是无信任清算的范式，凡是涉及强制平仓的链上协议都直接套用

## 延伸阅读

- Aave V3 技术论文：<https://github.com/aave/aave-v3-core/blob/master/techpaper/Aave_V3_Technical_Paper.pdf>
- 官方文档：<https://aave.com/docs/developers/aave-v3>
- 开发者指南（含合约接口与代码片段）：<https://aave.com/docs>
- Christoph Michel 关于 Aave 利率模型的博客系列
- ChainSecurity / Trail of Bits 对 V3 的安全审计报告（PDF）
- 关联：[[uniswap-v3]] —— DeFi 主力 DEX，V3 的 oracle 给 Aave 喂价
- 关联：[[bitcoin]] —— 区块链原型，定义价值无信任转移的语义

## 关联

- [[bitcoin]] —— 区块链原型，Aave 的资产流动建立在中本聪的去中心账本之上
- [[go-ethereum]] —— EVM 实现，Aave 合约编译后跑在 geth 这类节点上
- [[uniswap-v3]] —— 同生态主力 DEX，V3 TWAP 是 Aave 备选喂价源之一
- [[chainlink]] —— Aave 的健康因子依赖预言机价格，Chainlink 是最常见的数据源
- [[compound-v3]] —— 同类借贷协议，适合对比“多资产池”与“单基础资产池”的设计
- [[openzeppelin-contracts]] —— ERC20、权限控制和安全模式是读 Aave 合约的基础
- [[viem]] —— 前端和 bot 调 Aave 合约时常用的现代 TypeScript EVM 客户端

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[aptos-core]] —— Aptos — Move 系高性能 L1
- [[arbitrum]] —— Arbitrum Nitro — Offchain Labs 的 Optimistic Rollup 客户端
- [[balancer]] —— Balancer V2 — 通用 AMM 与权重池
- [[chainlink]] —— Chainlink — 智能合约的"感官系统"
- [[chainlink-ccip]] —— Chainlink CCIP — 让两条链像两个银行那样互转钱
- [[compound-v3]] —— Compound III (Comet) — 单基础资产借贷重构
- [[curve]] —— Curve — 稳定币低滑点兑换协议
- [[ethers-js]] —— ethers.js — 浏览器和 Node 都能用的以太坊客户端库
- [[ipfs]] —— IPFS / Kubo — 按内容哈希定位的去中心化文件系统
- [[layerzero]] —— LayerZero V2 — 让一条链上的合约能给另一条链上的合约发消息
- [[makerdao]] —— MakerDAO — 用抵押 ETH 铸出锚定美元的 DAI
- [[openzeppelin-contracts]] —— OpenZeppelin Contracts — 以太坊智能合约的事实标准库
- [[optimism]] —— Optimism — 以太坊 L2 旗舰栈，把交易搬到便宜车道再回主网结算
- [[pyth]] —— Pyth Network — 一手数据上链的低延迟预言机
- [[reservoir-sdk]] —— Reservoir SDK — 跨市场 NFT 聚合
- [[viem]] —— viem — 现代 TypeScript EVM 库
- [[wormhole]] —— Wormhole — 多链之间替你跑腿的"邮政系统"
