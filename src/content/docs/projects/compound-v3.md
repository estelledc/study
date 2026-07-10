---
title: Compound III (Comet) — 单基础资产借贷重构
来源: 'https://github.com/compound-finance/comet'
日期: 2026-05-30
分类: blockchain
难度: 高级
---

## 是什么

Compound III（代号 Comet）是 Compound 团队 2022 年推出的第三代去中心化借贷协议。它把前作 V2 那套「多资产共一个池子、人人都能借任何资产」的设计彻底推翻，改成「每个市场只有一种可借资产 + 多种抵押资产」。

打个比方。V2 像一个超市，所有货架（USDC / ETH / DAI / WBTC）都能存能借，存哪个赚哪个的利息，每种货架间互相影响价格。Comet 改成「单口柜台」：USDC 池只让人借出 USDC，ETH 和 WBTC 只能押在柜台门口当抵押品；想借 ETH 得换一家分店。

代码层面 Comet 把核心逻辑收敛到一个 `Comet.sol`，加上 `CometExt`（避开 24KB 合约上限）、`Configurator`（参数热更新）、`Bulker`（多步操作打包）。账本直接存在合约内部 mapping，不再像 V2 给每种资产铸 `cToken`。最小心智模型：一个池子 = 一个 base asset 的借贷账本 + 一组抵押物的状态映射。

## 为什么重要

- 不理解「单借贷资产」模型，就看不懂 Compound 团队为什么放弃自己一手做大的 V2 共池设计
- 不理解 Comet 的 absorb 清算路径，就解释不了「为什么清算人不直接拿抵押物却能盈利」
- 不理解 Configurator + Proxy 升级模式，就读不懂主流 DeFi 协议的治理可变参数体系
- 不理解 Bulker 聚合器，就写不出 gas 高效的多步借贷脚本
- 不理解 V2 → V3 的取舍，就抽象不出「资本效率 vs 风险隔离」这条 DeFi 协议演进主线
- 不理解 baseSupplyIndex / baseBorrowIndex 双索引，就写不对 Comet 头寸对账逻辑

## 核心要点

1. **单 base asset 模型**：每个 Comet 实例只有一个可借资产（首发 USDC，后续陆续上 ETH、USDT）。其它资产（WETH / WBTC / LINK 等）只能存进来做抵押，不能从这个池子借出。要借 ETH 得切到 ETH 池子，是完全独立的合约部署。
2. **Comet 主合约统一入口**：`supply / withdraw / transfer / absorb / buyCollateral` 全部从 `Comet.sol` 进出。无 cToken，存款余额通过 `baseSupplyIndex × principal / 1e15` 推算。账本直接存在合约的 `userBasic[user]` 与 `userCollateral[user][asset]` 两张 mapping 上。
3. **Configurator + ERC1967 Proxy**：参数（利率曲线、清算因子、清算奖励）由 `Configurator` 持有，治理改完调 `deploy()` 把新参数推入代理。逻辑升级走标准 OpenZeppelin Proxy 套路，治理拥有最终升级权。
4. **Absorb 二段式清算**：HF 跌破时清算人调 `absorb(account)`，协议把坏账抵押物收归自己并补足债务。事后清算人可调 `buyCollateral` 折扣买走这些抵押物盈利，绕开 V2 那种「现场撮合」。
5. **Bulker + Rewards**：`Bulker.sol` 把「supply WETH + borrow USDC + 转账」三步打包成一笔 tx。`CometRewards` 按 utilization 分发 COMP 给 supplier / borrower 两边，激励两侧流动性。

## 实践案例

### 案例 1：读 Comet 的核心账本结构

```solidity
// Comet.sol（节选）
struct UserBasic {
    int104 principal;        // 正数=存款本金, 负数=借款本金
    uint64 baseTrackingIndex;
    uint64 baseTrackingAccrued;
    uint16 assetsIn;         // bitmask: 哪几种抵押在用
    uint8  _reserved;
}
mapping(address => UserBasic) public userBasic;
mapping(address => mapping(address => UserCollateral)) public userCollateral;
```

`principal` 用 `int104` 一个字段同时表达存款（正）与借款（负）——同一个用户不能既存又借 base asset，节约一个槽。`assetsIn` 是 16 位掩码，第 i 位为 1 表示用户用了第 i 种抵押物。把多资产状态压进一个槽里是 V3 节约 gas 的关键技巧。

### 案例 2：在测试网做一笔抵押借款

```solidity
IERC20(WETH).approve(address(comet), 1e18);
comet.supply(WETH, 1e18);                  // 存抵押
comet.withdraw(USDC, 1500e6);              // 直接 withdraw 即借款
// 注意：USDC 池里 withdraw 超过 supplyBalance 时会自动转为 borrow
require(comet.borrowBalanceOf(msg.sender) > 0, "should be borrower now");
```

V3 取消了 `borrow` 函数——`withdraw` 一旦超过你存的 base asset 余额，剩余部分自动变借款。这是 Comet 最反直觉的设计之一：存借同口，差额即仓位。

### 案例 3：触发一笔 absorb 清算

```solidity
// 1) 检查目标账户是否可清算
require(comet.isLiquidatable(target), "healthy");
// 2) 协议吸收坏账（清算人不需垫资）
address[] memory accounts = new address[](1);
accounts[0] = target;
comet.absorb(msg.sender, accounts);
// 3) 折扣买走被吸收的抵押物
comet.buyCollateral(WETH, 0, 1_000e6, msg.sender); // 花 1000 USDC 买折价 WETH
```

`absorb` 不需要清算人先准备 base asset：协议自己用储备金把负债填平，然后把抵押物登记成「待售」。`buyCollateral` 才是清算人真正盈利的步骤——按 `storeFrontPriceFactor` 折扣价（通常 0.5%~5%）买走 WETH 转手卖出赚差价。这把「发现」与「处置」解耦的设计，让协议有时间在极端行情里慢慢拍卖，不被瞬时砸盘。

## 踩过的坑

1. **V2 cToken 思维迁移**：上手就找 cUSDC、cETH 这种 token——V3 没有。账本直接 mapping，没有可转移的 ERC20 凭证（少数派生合约才有 wrapper）。
2. **跨池借贷被拒**：押 WETH 想借 ETH——发现 USDC 池只能借 USDC，要找 ETH 池另开仓位。每个池子是独立合约部署。
3. **withdraw 隐式转借款**：以为 withdraw 5000 USDC 是从存款里取——结果只存了 3000，剩下 2000 自动变债务。前端要先用 `userBasic.principal` 判一下。
4. **absorb 没收益吓退新人**：调完 absorb 链上没看到收益—收益在 buyCollateral 那一步。两步必须连着做才划算。
5. **rewards 数字跳动**：CometRewards 的 claimable 是动态算出来的，前端轮询会看到数字小步上跳，新手以为有 bug。
6. **Configurator 改参数延迟感知**：治理改完清算因子，监控仓位还按旧值算 HF，结果实际已被清算。要订阅 `SetCollateralFactor` 事件刷新本地状态。
7. **Bulker 不是必须**：以为不用 Bulker 就跑不了——直接调 Comet 也行，只是多花 30%~50% gas。

## 适用 vs 不适用场景

适用：

- DAO 国库集中管理 USDC 借贷头寸，单资产风控简单
- 用 ETH / WBTC / LINK 等抵押借 USDC 做杠杆做空
- DeFi 聚合器对接：Comet 接口比 V2 干净，集成成本低
- 想拿 COMP 奖励的存款人，base asset 端 APR 通常比 V2 略高
- 写清算 bot：absorb 路径标准化，比 V2 的 `liquidateBorrow` 简单

不适用：

- 想在同一池里互借多种资产（V3 不支持，要去 Aave V3 / Morpho）
- 需要稳定利率（Comet 只有可变利率，没 stable 模式）
- 极端长尾资产做抵押（仅治理白名单内主流资产）
- 用户量极小的 base asset 市场（gas 占比高于利息收益）
- 借非主流币种（V3 池子有限，去 Aave / Euler 找）

## 历史小故事（可跳过）

- 2018 年 9 月：Compound V1 上线，第一代去中心化货币市场
- 2019 年 5 月：V2 发布，cToken 化债权 + 多资产互借池，确立池化借贷范式
- 2020 年 6 月：COMP 治理代币上线，开启 DeFi yield farming 浪潮
- 2022 年 8 月：V3 / Comet 主网上线首个 USDC 池，单借贷资产模型问世
- 2023 年：Comet 扩展到 Polygon / Arbitrum / Base，新增 ETH 池
- 2024 年：陆续上线更多 base asset 与抵押物，多链 TVL 重回前列
- 2025 年：治理讨论 V4 方向，向更模块化的 isolated lending 演进
- 2026 年初：Comet 在多链稳定运行，V3 成为 Compound 主力版本，V2 仍保留兼容存量用户

## 学到什么

- 「单 base asset」本质是「风险隔离 + 心智简化」的折中：牺牲一点资本效率换清算逻辑的确定性，与 Aave V3 isolation mode 思路同源
- 「absorb 二段式清算」把「发现坏账」与「处置抵押」解耦，给协议留缓冲空间，这是把数据库 ACID 里「先写日志再持久化」的思路搬到金融协议
- Configurator + Proxy 是合约升级的常用模板：把「参数」与「逻辑」都做成治理可变量，治理即配置
- Bulker 聚合器是 EVM 高 gas 时代的产物——把多次调用合并一个 tx 是链上工程的标准优化
- 用 `int104 principal` 一个字段同时表达存款 / 借款，是 storage layout 优化的精彩例子，反映 EVM 工程师对每个槽都斤斤计较的心智
- V2 → V3 的演进路径揭示「复杂度（多资产共池）vs 稳定性（单资产专池）」的折中——一旦资产数量多到难以风控，宁可分池
- COMP 双边激励（存借两端都给）是「双面市场」经济学在 DeFi 协议设计中的直接落地

## 延伸阅读

- Compound III 官方文档：<https://docs.compound.finance/>
- Comet GitHub 仓库：<https://github.com/compound-finance/comet>
- Compound V3 技术博客（团队 2022 年发布介绍）：<https://medium.com/compound-finance>
- OpenZeppelin / Trail of Bits 对 V3 的安全审计报告（PDF）
- 关联：[[aave-v3]] —— 同领域旗舰，多资产共池模型，与 Comet 形成对照
- 关联：[[uniswap-v3]] —— DeFi 主力 DEX，给清算路径提供价格发现

## 关联

- [[bitcoin]] —— 区块链原型，Comet 的资产流动建立在中本聪的去中心账本之上
- [[go-ethereum]] —— EVM 实现，Comet 合约编译后跑在 geth 这类节点上
- [[aave-v3]] —— 同领域旗舰，多资产共池 vs Comet 单资产专池形成对照
- [[uniswap-v3]] —— 同生态 DEX，TWAP 是 Comet 的备选喂价源之一
- [[paxos-1998]] —— 共识算法，区块链共识层与 Comet 应用层正交但底层依赖
- [[tcp]] —— RPC 调用 Compound 节点最终走 TCP，理解链下到链上调用栈
- [[skip-list-1990]] —— Comet 没用，但其它 DeFi 协议的索引结构借鉴这种分层查找

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[aave-v3]] —— Aave V3 — 借贷协议旗舰
- [[aragon]] —— Aragon OSx — 一份内核合约管所有 DAO 的乐高套件
- [[balancer]] —— Balancer V2 — 通用 AMM 与权重池
- [[bitcoin]] —— Bitcoin 白皮书
- [[curve]] —— Curve — 稳定币低滑点兑换协议
- [[go-ethereum]] —— Go-Ethereum (Geth) — 以太坊主流 Go 客户端
- [[makerdao]] —— MakerDAO — 用抵押 ETH 铸出锚定美元的 DAI
- [[optimism]] —— Optimism — 以太坊 L2 旗舰栈，把交易搬到便宜车道再回主网结算
- [[paxos-1998]] —— Paxos 1998 — 古希腊议会寓言里藏的共识协议
- [[skip-list-1990]] —— Skip List — 用抛硬币代替平衡树
- [[snapshot]] —— Snapshot — DAO 不花 Gas 也能投票的链下治理前端
- [[tcp]] —— TCP — 在不可靠的 IP 上凿出一条 reliable 字节流
- [[uniswap-v3]] —— Uniswap V3 — 集中流动性 AMM 核心合约

