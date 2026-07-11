---
title: Curve — 稳定币低滑点兑换协议
来源: 'https://github.com/curvefi/curve-contract'
日期: 2026-05-30
分类: blockchain
难度: 高级
---

## 是什么

Curve 是一组运行在 Ethereum 上的智能合约，专门做**应该等价的两种代币**之间的兑换：USDC ↔ USDT、stETH ↔ ETH、wBTC ↔ renBTC 这种。代码主体用 **Vyper** 写，部署 / 测试脚本用 Python。

打个比方。Uniswap V2 像一台标准的恒定乘积兑换机：货架从 1 块到 1 亿块每个价位都摆点货，价格两边一拉就变。Curve 把货架重塑成"中段几乎是水平的、两端才陡起来"——因为对稳定币来说，1 USDC 永远应该约等于 1 USDT，没必要让中段也带斜率。中段平 = 滑点几乎没有，资金效率 1-2 个数量级地碾压恒定乘积。

代码层面 `StableSwap.vy` 是核心。它的不变量公式把"恒定和（x+y=D）"和"恒定乘积（xy=k）"线性混合，由一个**放大系数 A** 控制混合比例：A 越大越像恒定和（中段越平），A 越小越像恒定乘积（兜底防穿仓）。每次 swap / addLiquidity 内部都要解一遍 `get_D` / `get_y`，用 Newton 迭代逼近。

最小心智模型：把池子里 N 种币想成"虚拟一池"，所有币都按 1:1 折算成同一种。那个虚拟总额叫 D。曲线确保：当各币比例平均时（每种 D/N），总额刚好是 D；一旦失衡，价格按曲线惩罚远离平均的那一头。A 控制惩罚的"软硬"。

```vyper
# StableSwap.vy 节选
def get_y(i: int128, j: int128, x: uint256, _xp: uint256[N_COINS]) -> uint256:
    # 给定其它币的余额 + i 币新余额 x，反解出 j 币应有的余额
    # 内部跑 ~10-20 轮 Newton 迭代直到 |y_new - y_old| < 1
```

## 为什么重要

- 不理解 StableSwap 不变量，看不懂为什么 Curve 在稳定币兑换上能比 Uniswap V2 滑点低 1-2 个数量级
- 不理解放大系数 A，就解释不了"治理一改 A 池子净值为啥会跳"这种 LP 投诉
- 不理解 ve 锁仓 + gauge 投票，就读不懂 Curve War（Convex / Yearn / Frax 抢锁 CRV 那段历史）
- 不理解 Vyper 装饰器编译产物，就讲不清 2023 年 7 月那次 6000 万美元重入攻击为什么发生

## 核心要点

1. **StableSwap 不变量**：把"恒定和（x+y=D，价格永远 1）"和"恒定乘积（xy=k，价格随余额变）"做线性叠加。中段两个余额接近时偏向恒定和（平），两端余额严重失衡时偏向恒定乘积（陡兜底）。

2. **放大系数 A**：控制中段有多平。A=10 接近恒定乘积，A=1000 中段几乎水平。是治理可改参数，改一次池子曲线立刻变形，LP 头寸价值跳变。类比：A 像放大镜倍数，倍数越大中段越被"拉直"。

3. **池子类型分层**：plain pool（直接放 USDC/USDT 这种）/ lending pool（放 cUSDC/aUSDC 等带息凭证）/ meta pool（一种新币 + 一个底池 LP token，比如 FRAX + 3CRV）/ crypto pool（非稳定币也能用的 CryptoSwap 不变量）。每层在前一层之上扩展。

4. **veCRV + gauge**：CRV 是治理代币，锁 1-4 年换 veCRV（不可转），锁越久权重越大。每周 CRV emission 按 gauge 投票结果切给各池子。这把 LP / 流动性 / 治理 / 协议博弈拧成一根绳——后来催生了 Curve War。

5. **Vyper 而不是 Solidity**：Vyper 设计上更克制（无继承、无内联汇编、有 reentrancy 装饰器），适合金融合约。但也因为生态小，编译器漏洞影响面集中——2023 年那次就是 Vyper 自己的锅。

总结句：Curve = StableSwap 不变量 × veCRV 投票治理 × Vyper 写的纯函数式合约。三件事互相咬合。

## 实践案例

### 案例 1：读 get_D 看不变量怎么求解

```vyper
# 简化伪代码
def get_D(xp: uint256[N], A: uint256) -> uint256:
    S: uint256 = sum(xp)
    if S == 0: return 0
    D: uint256 = S
    Ann: uint256 = A * N
    for _ in range(255):
        D_P: uint256 = D
        for x in xp: D_P = D_P * D / (x * N)
        D_prev: uint256 = D
        D = (Ann * S + D_P * N) * D / ((Ann - 1) * D + (N + 1) * D_P)
        if abs(D - D_prev) <= 1: return D
```

`D` 是"虚拟总流动性"——所有币按 1:1 折算后的总量。Newton 迭代直到 D 稳定。理解这个就能理解：所有 swap、add、remove 操作内部都先算 D，再用 D 反解某个币的目标余额。

### 案例 2：A=10 vs A=1000 同样输入不同输出

在测试网用 Ape 部署一个 3pool，初始 USDC=USDT=DAI=1M。

```python
# Ape 测试脚本节选
def test_swap_under_different_A():
    pool_low_A = deploy_3pool(A=10, balances=[1_000_000e18]*3)
    pool_high_A = deploy_3pool(A=1000, balances=[1_000_000e18]*3)
    out_low = pool_low_A.get_dy(0, 1, 100_000e18)   # 10 万 DAI 换 USDC
    out_high = pool_high_A.get_dy(0, 1, 100_000e18)
    # out_high 比 out_low 多约 0.3%，因为高 A 中段更平
```

直观感受：同样大单，A 越大用户得到越多目标币，因为中段没斜率。这就是 Curve 招牌"低滑点"的来源。但 A 越大池子越脆——一旦某币挤兑出现严重失衡，价格会"突然跳到陡区段"，LP 损失放大。

### 案例 3：veCRV 锁仓 + 给 gauge 投票

```python
# 用 web3 调 VotingEscrow + GaugeController
voting_escrow.create_lock(amount=10_000e18, unlock_time=now + 4 * 365 * 86400)
# 锁 4 年最大权重，得到约 10000 veCRV
gauge_controller.vote_for_gauge_weights(gauge_3pool, 10000)  # 100% 票投 3pool
# 下一周 CRV emission 中分给 3pool 的份额会按所有人投票后归一化
```

这套设计的精妙之处：veCRV 不可转 + 锁期长，强迫长期对齐；gauge 投票让 LP 自己决定钱往哪流。Convex 后来把 veCRV 收益代币化（vlCVX 投票），引发了"谁手上锁的 CRV 多谁就能控制 emission"的 Curve War。

副作用是治理被聚合协议捕获——直接锁 CRV 的散户越来越少，绝大多数 veCRV 被 Convex / Yearn / Stake DAO 等 meta-DAO 持有，Curve 自己反而像底层基础设施而不是治理主权方。

## 踩过的坑

1. **直接读 get_dy 当现货价**：`get_dy` 返回的是"实际兑换后会拿到多少"，已经扣了手续费、按当前余额算，不同池子精度不同。把它当 oracle 会被三明治夹爆——正确做法是读累计余额或外部预言机。

2. **忘记 A 是治理可改的**：很多 LP 进池子时假设 A 永远不变，但 Curve 治理可以慢速调 A（ramp_A，每天最多变 10%）。A 一旦下调，曲线变陡，已建仓 LP 的虚拟净值会显著下降。

3. **Vyper 老版本 nonreentrant 装饰器失效**：2023 年 7 月，Vyper 0.2.15、0.2.16、0.3.0 三个版本的 `@nonreentrant` 装饰器编译后实际不起作用。Curve 上多个用这些版本的池（alETH/sETH 等）被重入攻击，损失约 6000 万美元。教训：合约审计要审编译器，不只是源码。

4. **metapool 自循环估值**：metapool 把 3CRV LP token 当报价基准，如果你又把这个 metapool 的 LP 拿去做抵押或聚合估值，很容易把同一份底层资产数两遍。Mim Spell / Abracadabra 早期清算引擎踩过这种坑。

5. **fee_admin 与 admin_fee 双费率混淆**：Curve 池子有两个相关数字——交易费（用户付）和 admin fee（从交易费里再切给 DAO 的比例）。读 ABI 时容易把两者搞混，导致 LP 收益估算多算或少算。

## 适用 vs 不适用场景

**适用**：
- 应该等价的资产对：USDC/USDT/DAI、stETH/ETH、wBTC/renBTC
- 大额低滑点需求：DEX 聚合器（1inch / CowSwap）路由稳定币时常走 Curve
- 协议级 LP 收益（Convex / Yearn 在上层包一层自动复利）

**不适用**：
- 普通波动币对（ETH/USDC 这种）：Curve 也有 CryptoSwap 不变量但流动性不如 Uniswap V3 集中
- 极小池 / 长尾资产：veCRV 投票冷启动慢，emission 切不到尾部池
- 想要 V3 那种主动管理头寸：Curve 全是被动 LP，没区间概念

## 历史小故事（可跳过）

- **2019 年底**：Michael Egorov（前 LEND / Aave 早期贡献者）发布 StableSwap whitepaper，4 页讲清不变量
- **2020 年 1 月**：Curve 主网上线，最早只有 3pool（DAI/USDC/USDT）
- **2020 年 8 月**：发 CRV 代币 + 引入 veCRV 锁仓 + gauge 投票，开启"DeFi 治理代币 + 流动性挖矿"老炮模式
- **2021-2022 年**：Convex 把 veCRV 收益代币化（cvxCRV），引发 Curve War——Convex / Yearn / Frax 等协议拼命囤 CRV 抢 emission 控制权
- **2023 年 7 月**：Vyper 0.2.15-0.3.0 reentrancy 装饰器漏洞被利用，多个 Curve 池被重入抽走约 6000 万美元，事件后双方做大版本审计与修复
- **2024 年至今**：Curve 团队推出 crvUSD（用 LLAMMA "软清算"曲线做抵押贷的稳定币），同样基于自定义 AMM 思路，可以看成 StableSwap 思想的衍生应用

## 学到什么

1. **不变量不是只能 x*y=k**：把"恒定和"和"恒定乘积"做线性叠加 + 一个调节系数，就得到一族新曲线。AMM 设计的关键洞见——曲线形状决定一切
2. **资金效率来自"少摆货位"**：V3 是手工挑货位（区间），Curve 是数学上把中段压平。两者本质都是"放弃永远不会被命中的价位"
3. **代币 + 锁仓 + 投票** 三合一是 DeFi 治理的经典招式，但也制造了 Curve War 这种博弈泥潭——任何治理设计都要预想"会被谁聚合 / 包装"
4. **合约安全 = 源码 + 编译器 + 部署版本**，2023 年那次教训彻底——审一份合约要把它依赖的 Vyper 版本一起审
5. **Newton 迭代在链上**：合约里跑数值算法是链上特色——只能整数、要 gas，得手写收敛条件 + 限步数，不能照搬 SciPy

## 延伸阅读

- StableSwap whitepaper：[curve.fi/files/stableswap-paper.pdf](https://classic.curve.fi/files/stableswap-paper.pdf)（4 页讲清不变量公式与放大系数 A）
- CryptoSwap whitepaper（Curve V2）：[curve.fi/files/crypto-pools-paper.pdf](https://classic.curve.fi/files/crypto-pools-paper.pdf)（非稳定币池如何动态调 A，类似自适应 AMM）
- Curve 官方文档：[docs.curve.fi](https://docs.curve.fi)（gauge / boost / fee 计算细节）
- Vyper 重入漏洞复盘：rekt.news / immunefi 2023-07 多篇事后分析
- crvUSD whitepaper：[curve.fi/files/crvusd-paper.pdf](https://classic.curve.fi/files/crvusd-paper.pdf)（LLAMMA 软清算曲线）
- [[uniswap-v3]] —— V3 的集中流动性是另一种"压低滑点"的思路，对比能看清两条不同路
- [[aave-v3]] —— Aave 借贷池本身也是 Curve 上 3pool 的常客客户

## 关联

- [[uniswap-v3]] —— 同样用 AMM 但走集中流动性思路，恒定乘积的另一种延展
- [[aave-v3]] —— 借贷协议常用 Curve 做稳定币兑换 / 清算路径
- [[compound-v3]] —— 同代借贷协议，治理代币 + 治理投票模式可对照 veCRV
- [[makerdao]] —— DAI 发行方，DAI 是 Curve 3pool 三大成员之一
- [[ape-framework]] —— Curve 推荐的 Vyper / Python 测试与部署框架
- [[safe-contracts]] —— Curve DAO 多签金库底层
- [[foundry]] —— 也能跑 Vyper，社区做集成的另一条路

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[balancer]] —— Balancer V2 — 通用 AMM 与权重池
- [[optimism]] —— Optimism — 以太坊 L2 旗舰栈，把交易搬到便宜车道再回主网结算
