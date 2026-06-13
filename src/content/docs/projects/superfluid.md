---
title: Superfluid 零基础入门：让加密货币像自来水一样流动
来源: https://github.com/superfluid-finance/protocol-core
日期: 2026-06-13
分类: 区块链
子分类: blockchain-and-crypto
provenance: pipeline-v3
---

# Superfluid 零基础入门：让加密货币像自来水一样流动

## 一、一个日常类比：电费和传统转账

想象你每个月交电费。有两种方式：

- **传统方式**：每月 1 号，电网公司一次性扣你 200 元。这是一次性的、离散的交易。
- **自来水方式**：水表每秒钟都在走，你用了多少水就付多少钱，实时累计。

Superfluid 做的事情，就是把加密货币的转账从"每月扣一次"变成"每秒都在流动"。

在传统的区块链上，每次转账都是一笔独立的交易（比如 ERC-20 代币的一次性发送），你需要支付 Gas 费，而且钱不会"自动"继续流动——你要手动一次次转。

Superfluid 引入了一个革命性的概念：**持续资金流（Money Streaming）**。你只需要设置一次流率（每秒转多少代币），之后每一秒余额都会自动变化，不需要任何额外的交易或 Gas。

> 核心思想：**一次设置，持续生效，按秒计账。**

## 二、核心概念

### 2.1 Super Token（超级代币）

Superfluid 的核心是一个叫 **Super Token** 的新型代币标准。你可以把它理解为"带超能力的 ERC-20 代币"。

传统 ERC-20 代币只有"静态余额"——你的账户里有多少币，就是一个固定的数字。

Super Token 引入了**实时余额**的概念：

```
当前余额 = 静态余额 + 实时余额
```

- **静态余额**：上次设置流之后的固定余额（类似传统 ERC-20）
- **实时余额**：从上次设置到现在，因为资金流产生的增减

举个例子：

| 项目 | 金额 |
|------|------|
| 静态余额 | 1,000 USDCx |
| 向外流出（工资） | -100 USDCx |
| 收到分配池分红 | +200 USDCx |
| **当前余额** | **1,100 USDCx** |

Super Token 有两种类型：

- **Wrapper Super Token**：把已有的代币（如 USDC）包装成 Super Token，获得流式转账能力
- **Pure Super Token**：天生就是 Super Token，没有底层代币

### 2.2 Money Streaming（资金流）

这是 Superfluid 最核心的功能。

**定义**：资金从一个账户向另一个账户，按照设定的每秒速率持续转移。

关键术语：

- **Flow Rate（流率）**：每秒转移的代币数量，单位是 wad/second
- **Sender（发送方）**：发起资金流的账户
- **Receiver（接收方）**：接收资金流的账户
- **CRUD Timestamp**：创建、更新或删除资金流的时间戳
- **Netflow（净流入）**：一个账户收到的总流率减去发出的总流率

实际例子：Alice 要给 Bob 发年薪 1200 USDCx 的工资。她设置流率为 **0.038 USDCx/秒**。Bob 的余额每秒增加 0.038，Alice 的余额每秒减少 0.038。这个流会一直持续到：

1. 发送方或接收方取消
2. 发送方的余额耗尽

**重要特性**：

- 资金流是**永久的**，直到被显式取消
- 余额是**每秒自动计算**的，不需要每笔都发交易
- 每个区块都在实时更新净流率，**不消耗额外 Gas**

### 2.3 Distributions（分配池）

除了点对点资金流，Superfluid 还支持**一对多的资金分配**。

想象一个 DeFi 项目要给所有流动性提供者发奖励。项目方创建一个分配池，设定总共有 1000 个单位。如果某个提供者拥有 100 个单位，他就获得 10% 的分配资金。

这非常适合的场景：

- DAO 成员分红
- 流动性挖矿奖励
- 社区空投的持续发放

### 2.4 Solvency 保护机制

如果一个账户一直在往外流钱，余额不够了怎么办？Superfluid 设计了保护机制：

- **Buffer（缓冲存款）**：创建资金流时，系统会扣除一部分代币作为缓冲，防止账户透支
- **Sentinels（哨兵）**：外部监控者负责关闭那些余额不足的账户的资金流，并可以获得缓冲存款作为奖励

## 三、代码示例

### 示例 1：部署一个 Mock Super Token 并设置资金流

这个合约展示了如何部署一个 Super Token，然后向接收方持续发送代币：

```solidity
// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import {
    SuperTokenV1Library,
    ISuperToken,
    ISuperfluid
} from "@superfluid-finance/ethereum-contracts/contracts/apps/SuperTokenV1Library.sol";
import { ISuperTokenFactory } from "@superfluid-finance/ethereum-contracts/contracts/interfaces/superfluid/ISuperTokenFactory.sol";
import { PureSuperTokenProxy, IPureSuperToken } from "./PureSuperToken.sol";

contract SuperfluidVesting {
    using SuperTokenV1Library for ISuperToken;

    ISuperToken public acceptedSuperToken;
    ISuperfluid public host;
    address public owner;

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner can call this function");
        _;
    }

    constructor(ISuperfluid _host) {
        host = _host;
        owner = msg.sender;
        // 部署一个 Pure Super Token
        acceptedSuperToken = IPureSuperToken(
            address(new PureSuperTokenProxy())
        );
        PureSuperTokenProxy(payable(address(acceptedSuperToken))).initialize(
            ISuperTokenFactory(host.getSuperTokenFactory()),
            "Mock Super Token",
            "mST",
            address(this),
            1_000_000e18  // 初始供应量 100 万
        );
    }

    // 设置/更新资金流
    // flowRate = 每秒发送的代币数（含 18 位小数）
    function setVesting(address recipient, int96 flowRate) public onlyOwner {
        require(flowRate > 0, "Flow rate must be > 0");
        require(
            acceptedSuperToken.balanceOf(address(this)) > 0,
            "Insufficient balance"
        );
        // 一行代码创建/更新资金流
        acceptedSuperToken.flow(recipient, flowRate);
    }
}
```

关键理解点：

- `acceptedSuperToken.flow(recipient, flowRate)` 这一行就完成了一个资金流的创建或更新
- `flowRate` 是 `int96` 类型，表示每秒的代币数量
- 如果调用时流已存在，它会更新流率；如果设为 0，则删除流

### 示例 2：完整的流控制合约（创建、查询、删除）

这个合约展示了更完整的流管理操作：

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { ISuperfluid, ISuperToken } from
    "@superfluid-finance/ethereum-contracts/contracts/interfaces/superfluid/ISuperfluid.sol";
import { SuperTokenV1Library } from
    "@superfluid-finance/ethereum-contracts/contracts/apps/SuperTokenV1Library.sol";

interface IFakeDAI is IERC20 {
    function mint(address account, uint256 amount) external;
}

contract FlowSender {
    using SuperTokenV1Library for ISuperToken;

    ISuperToken public daix;

    constructor(ISuperToken _daix) {
        daix = _daix;
    }

    // 第一步：获取代币并包装为 Super Token
    function gainDaiX() external {
        IFakeDAI fdai = IFakeDAI(daix.getUnderlyingToken());
        fdai.mint(address(this), 10_000e18);
        fdai.approve(address(daix), 20_000e18);
        // 将普通代币包装为 Super Token
        daix.upgrade(10_000e18);
    }

    // 第二步：设置资金流（创建/更新/删除）
    // flowRate > 0: 创建或更新流
    // flowRate = 0:  删除流
    function setStream(address receiver, int96 flowRate) external {
        daix.flow(receiver, flowRate);
    }

    // 第三步：查询当前流率
    function getFlowRate(address receiver)
        external
        view
        returns (int96 flowRate)
    {
        return daix.getFlowRate(address(this), receiver);
    }
}
```

这个合约展示了 Superfluid 的 CRUD 操作：

| 操作 | 方法 | 说明 |
|------|------|------|
| Create | `flow(receiver, flowRate)` | 创建新流 |
| Read | `getFlowRate(sender, receiver)` | 查询流率 |
| Update | `flow(receiver, newFlowRate)` | 更新流率 |
| Delete | `flow(receiver, 0)` | 删除流 |

## 四、流率怎么算？

流率的单位是**每秒**。如果你习惯按月/年计算，可以这样换算：

```
1 代币/月 ≈ 380,414,535,736 (wad, 18 位小数)
1 代币/年 ≈ 31,709,791,983 (wad, 18 位小数)
```

例如，月薪 1200 USDCx：

```
1200 / (365 * 24 * 3600) ≈ 0.038 USDCx/秒
```

## 五、为什么这很重要？

传统转账的问题：

1. 每次转账都要付 Gas
2. 无法实现"按使用量付费"
3. 订阅、工资等场景需要反复手动操作

Superfluid 带来的改变：

1. **一次设置，永久生效**——设置一次流率，余额每秒自动更新
2. **零额外 Gas**——后续每一秒的余额变化都不需要发交易
3. **实时结算**——适合订阅制、按秒计费的场景
4. **可编程金融**——资金流可以组合、嵌套、与其他 DeFi 协议交互

现实应用场景：

- 月薪按秒发放，随时到账
- SaaS 产品按使用量计费，每秒扣费
- DAO 成员持续分红
- NFT 版税按秒分配给创作者
- 代币锁仓/线性释放（Vesting）

## 六、总结

Superfluid 的核心就是一句话：**把"一次性转账"变成"持续水流"**。

它通过 Super Token 标准扩展了 ERC-20，引入了实时余额和资金流的概念。你只需要设置一次流率，之后每一秒余额都会自动变化，不需要任何额外的 Gas 或交易。

两个核心支柱：

1. **Money Streaming** —— 点对点的持续资金流
2. **Distributions** —— 一对多的资金分配池

理解了"流率"和"实时余额"这两个概念，你就掌握了 Superfluid 的精髓。
