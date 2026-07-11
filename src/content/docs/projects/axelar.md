---
title: Axelar — 通用跨链 gateway
来源: 'https://github.com/axelarnetwork/axelar-cgp-solidity'
日期: 2026-05-30
分类: blockchain
难度: 中级
---

## 是什么

Axelar 是一条**专门替别的区块链跑腿送信的链**——它在每条接入的链上放一个 Gateway 合约（小邮局），自己用一组验证人当快递员，把 A 链合约写的话送到 B 链合约面前。日常类比：每个国家邮局柜台就是 Gateway，万国邮政联盟（UPU）就是 Axelar 主链，验证人是邮差。

你写的合约在以太坊上喊一声"给 Avalanche 上的 X 合约送 100 USDC + 一段指令"。Axelar 验证人观察到这一声，门限签名后跑到 Avalanche Gateway 上盖个章，最后由 relayer 触发目标合约的 `_execute()`。

它和"资产桥"不同：桥只能搬代币，Axelar 能搬**任意 payload**——这就是 General Message Passing（GMP）。

## 为什么重要

不理解 Axelar 这类通用消息层，下面这些事都没法解释：

- 为什么 2023 后跨链 dApp 不再每条链都重写——一份合约 + GMP 就能联动多链
- 为什么"资产桥"和"消息桥"是两件事——前者只懂 token，后者能调任意函数
- 为什么 LayerZero / Wormhole / Axelar 看起来差不多但安全模型完全不同
- 为什么跨链调用需要在源链先付目标链的 gas（看似反常识但合理）

## 核心要点

Axelar 跨链调用可以拆成 **三步**：

1. **源链触发事件**：合约调 `gateway.callContract(destChain, destAddr, payload)`，Gateway 只做一件事——发一个 `ContractCall` event。类比：你在邮局柜台填一张国际包裹单。

2. **验证人共识 + 门限签名**：Axelar 主链上 ~75 个验证人观察到事件，按 PoS 权重投票，达到门限后联合签一份"批准证明"。这一步类比：邮政联盟开会同意盖章，单个邮差盖不了。

3. **目标链 approve + execute**：验证人把签名提交到目标链 Gateway 的 `approveContractCall`，目标合约继承 `AxelarExecutable`，由任何人调 `execute()` 触发 `_execute(sourceChain, sourceAddr, payload)`。

整个机制叫 **CGP（Cross-Chain Gateway Protocol）**，axelar-cgp-solidity 就是 EVM 端的实现。

## 实践案例

### 案例 1：写一个跨链接收器

```solidity
import { AxelarExecutable } from "@axelar-network/axelar-gmp-sdk-solidity/contracts/executable/AxelarExecutable.sol";

contract MyReceiver is AxelarExecutable {
    string public lastMessage;
    constructor(address gateway_) AxelarExecutable(gateway_) {}

    function _execute(string calldata, string calldata, bytes calldata payload) internal override {
        lastMessage = abi.decode(payload, (string));
    }
}
```

**逐部分解释**：

- 继承 `AxelarExecutable`，构造时传入目标链 Gateway 地址
- `_execute` 只在 Gateway 校验过 approve 后才能进来——Gateway 替你做了"这条消息真的来自 Axelar 验证人"的检查
- `payload` 是源链 abi 编码的字节，自己 `decode`

### 案例 2：从源链发起调用

```solidity
function sendHello(string calldata destChain, string calldata destAddr) external payable {
    bytes memory payload = abi.encode("hello from chain A");
    gasService.payNativeGasForContractCall{ value: msg.value }(
        msg.sender, destChain, destAddr, payload, msg.sender
    );
    gateway.callContract(destChain, destAddr, payload);
}
```

先调 `gasService.payNativeGasForContractCall` 付目标链的 gas（用源链 native token），再调 `gateway.callContract` 触发事件。两步顺序不能反——relayer 看 Gas Service 的 event 决定要不要执行。

### 案例 3：跨链 swap（Squid 模式）

Squid 是 Axelar 上最大的应用。它在源链 swap 出 USDC → 通过 GMP 跨到目标链 → 目标链合约再 swap 成用户想要的 token。一笔交易完成"换币 + 跨链 + 换币"，用户只需在 Polygon 签一次。

伪代码大致流程：

```
sourceChain: USER → DEX → USDC → Squid → Axelar Gateway (callContract + token)
Axelar:      validators 观察 + 门限签名
destChain:   Squid receiver._execute → DEX swap USDC → DAI → 转给 USER
```

注意"带 token 的 GMP"是 `callContractWithToken`，比纯消息多了一步资产 lock/mint。Gateway 内置 USDC、axlUSDC 等 canonical token 的桥接逻辑。

## 踩过的坑

1. **把 Gateway 当无信任桥**：Axelar 安全只到验证人门限签名，验证人作恶（>1/3 串通）会盗资金；它不是以太坊级安全，关键资产应配合限速 / 监控。

2. **忘付 Gas Service**：调了 `callContract` 但没调 `payNativeGasForContractCall`，relayer 不会执行 `execute()`，消息卡住——日志里看 event 发了，但目标链没反应。

3. **`_execute` 不做权限校验**：Gateway 只验证消息真伪，不知道你的业务"谁能调"。开发者必须自己用 `sourceChain + sourceAddress` 白名单，否则任何链任何合约都能 `_execute` 你。

4. **Gateway 可升级**：Gateway 由验证人多签可升级，意味着 ABI 和逻辑可能变；写集成时不要硬编码 selector，用官方 SDK 的接口包。

## 适用 vs 不适用场景

**适用**：

- 跨链合约调用 / 跨链状态同步（投票、身份、抵押转移）
- 跨链 swap / yield 路由（结合 Squid 这类聚合器）
- 多链统一前端（一份合约逻辑，多链部署后用 GMP 同步）

**不适用**：

- 极致安全敏感场景（大额资金长期托管）→ 优先 [[optimism]] / [[arbitrum]] 这种共享以太坊安全的 L2
- 只搬资产、对消息无需求 → 用专用桥（更便宜）
- 高频交互（毫秒级）→ GMP 端到端 1-3 分钟，慢
- 链不在 Axelar 接入清单里 → 没办法

## 历史小故事（可跳过）

- **2020 年**：Sergey Gorbunov（前 Algorand 研究员）和 Georgios Vlachos 创立 Axelar，瞄准"跨链不是桥而是网络"的定位。
- **2021 年**：主网上线，原始白皮书命名 Cross-Chain Gateway Protocol（CGP）。
- **2022-2023 年**：快速接入 Polygon、Avalanche、Fantom、Moonbeam 等 EVM 链，承载 Squid 等跨链 dApp。
- **2024-2025 年**：扩展到 Sui、Stellar 等非 EVM 生态，AXL 代币成为主流跨链资产。
- 与 [[wormhole]] / [[layerzero]] 形成"通用消息层三巨头"格局。

## 学到什么

1. **跨链不等于桥**——Axelar 的 GMP 是把消息当一等公民，资产只是 payload 的一种特例
2. **共识层 + 应用层分离**——Axelar 主链负责签名共识，每条目标链的 Gateway 只是消息出入口
3. **Gas Service 的设计巧思**：跨链 gas 必须在源链预付，否则 relayer 没动力执行；这是工程上的关键
4. **去中心化跨链的安全边界**：验证人门限是上限，不是以太坊级保证；用之前要算清楚资产风险敞口

## 延伸阅读

- 官方文档：[Axelar Docs — General Message Passing](https://docs.axelar.dev/)（含完整接口表 + 示例）
- 视频教程：[Axelar Network — How It Works](https://www.youtube.com/results?search_query=axelar+network+gmp)（30 分钟看完跨链全流程）
- 仓库：[axelar-cgp-solidity](https://github.com/axelarnetwork/axelar-cgp-solidity)（EVM Gateway 实现，~270 个合约文件）
- [[wormhole]] —— Guardian 节点签名模型，比 Axelar 验证人更集中
- [[layerzero]] —— Oracle + Relayer 双方独立模型，与 Axelar 的 PoS 验证人模型形成对照

## 关联

- [[wormhole]] —— Guardian 19 节点 vs Axelar PoS 验证人，安全模型不同
- [[layerzero]] —— Oracle/Relayer 双独立 vs Axelar 单一验证人集合
- [[uniswap-v3]] —— 跨链 swap（Squid）通常路由到 Uniswap 完成 token 交换
- [[safe-contracts]] —— 多签钱包通过 GMP 做跨链治理的常见组合
- [[hardhat]] —— 部署 AxelarExecutable 子合约的标准工具链
- [[foundry]] —— 测试跨链调用 fork 模拟的常用框架
- [[arbitrum]] —— L2 与跨链通用消息层的协作关系
- [[optimism]] —— OP Stack 上的跨链消息也开始接入 Axelar

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[chainlink-ccip]] —— Chainlink CCIP — 让两条链像两个银行那样互转钱
- [[cosmos-sdk]] —— Cosmos SDK — 应用链开发框架
