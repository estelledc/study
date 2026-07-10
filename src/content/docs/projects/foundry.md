---
title: Foundry — Paradigm 出品的 Rust 合约工具链
来源: 'https://github.com/foundry-rs/foundry'
日期: 2026-05-30
分类: blockchain
难度: 中级
---

## 是什么

Foundry 是一套**用 Rust 写的以太坊智能合约开发工具链**，由 Paradigm 团队 2021 年发起。日常类比：像装修房子，过去用一袋袋零散螺丝刀（Hardhat 插件 + npm 包），Foundry 直接给你一个**带电的工具箱**，钉锤、电钻、激光尺都在里面，互通互认。

四件套各司其职：

- **forge** —— 编译合约 + 跑测试 + fuzz 模糊测试 + 部署
- **cast** —— 链上 curl，查余额 / 调合约 / 解码 calldata
- **anvil** —— 本地起个 mock 节点，可以"快照主网状态"再随便操
- **chisel** —— Solidity REPL，像 Python `>>>` 那样一句句试

测试用例本身**也用 Solidity 写**（不是 JavaScript），所以你写测试的语言和写合约的语言是同一种，心智不切换。

## 为什么重要

不理解 Foundry 怎么工作，下面这些事都没法解释：

- 为什么 Uniswap / Aave / Optimism 这些头部项目大量从 Hardhat 迁到 Foundry、甚至默认用它
- 为什么一个 fuzz 测试能在 1 秒内跑完 256 轮，Hardhat 跑同样的得分钟级
- 为什么 audit 报告里到处是 `forge test --gas-report` 的截图
- 为什么 Solidity 开发者今天面试基本默认会问"用过 Foundry 吗"

## 核心要点

Foundry 的设计可以拆成 **三层**：

1. **Rust + revm 跑 EVM**：传统工具用 JS 起一个 ganache 节点跑测试，慢且和真实 EVM 行为有差。Foundry 直接在 Rust 进程里嵌入 revm（Rust 写的 EVM 实现），测试时不用启节点也不用 RPC，**编译速度比 Hardhat 快约 10 倍**。

2. **Cheatcodes 注入测试能力**：在测试里你能写 `vm.prank(alice)` 让下一次调用伪装成 alice 发起。机制：foundry 拦截发往特殊地址 `0x7109709E...` 的调用，识别出"这是测试指令不是真合约调用"，再改 EVM 状态。类比：你在玩游戏时按了 GM 命令面板，普通玩家没这权限。

3. **Fork 主网**：`anvil --fork-url <主网 RPC>` 起一个本地节点，**装作主网的某个区块**——你可以查到 USDC 真实余额、调真实 Uniswap 合约，但所有改动只在本地。类比：把博物馆复制一份到自家车库，随便摔随便砸都不影响真品。

## 实践案例

### 案例 1：起一个项目跑通测试

```bash
forge init counter && cd counter
forge build
forge test
```

`forge init` 生成的目录里有 `src/Counter.sol`（合约）和 `test/Counter.t.sol`（测试）。测试文件长这样：

```solidity
contract CounterTest is Test {
    Counter c;
    function setUp() public { c = new Counter(); }
    function test_Increment() public {
        c.increment();
        assertEq(c.number(), 1);
    }
}
```

**逐部分解释**：

- 继承 `Test` 拿到 `assertEq` / `vm` 这些工具
- `setUp()` 每个测试前自动跑一次（重置状态）
- `test_` 前缀函数会被自动发现，无需注册
- `assertEq` 失败时打印两边的值，不是只说 "false"

### 案例 2：cast 当链上 curl 查 USDC 总供应

```bash
cast call 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48 \
  "totalSupply()(uint256)" \
  --rpc-url https://eth.llamarpc.com
```

输出是个大整数（USDC 是 6 位小数，需要除以 1e6）。**关键点**：

- `cast call` 是只读调用，不上链不花 gas
- `"totalSupply()(uint256)"` 后半段告诉 cast 返回类型，否则收到的是 raw bytes
- 公链 RPC 经常限频，正式开发要用付费 RPC（Alchemy / Infura）

### 案例 3：fuzz 测试自动找 bug

```solidity
function testFuzz_AddNeverOverflow(uint128 a, uint128 b) public {
    uint256 sum = uint256(a) + uint256(b);
    assertGe(sum, a);
}
```

**逐部分解释**：

- 函数参数有类型，foundry 自动生成 256 组随机输入
- 用 `uint128` 而不是 `uint256` 是为了让加法不溢出（演示用）
- `assertGe(sum, a)` 要求 sum 永远 ≥ a；如果 fuzz 找到反例会打印那组输入

## 踩过的坑

1. **依赖管理用 git submodule 而非 npm**：clone 完别人的项目直接 `forge build` 会报"找不到 OpenZeppelin"，要先 `forge install` 或 `git submodule update --init --recursive`，新人来自 JS 圈很容易忘。

2. **vm.prank 只对下一次调用生效**：写 `vm.prank(alice); contract.foo(); contract.bar();` 时只有 `foo` 是 alice 调的，`bar` 又变回测试合约本身。多次调用要用 `vm.startPrank(alice) ... vm.stopPrank()` 包裹。

3. **fuzz 默认 256 轮覆盖不到罕见路径**：复杂状态机（如 AMM、借贷协议）光靠 fuzz 不够，需要写 invariant test 让 foundry 随机调用合约一系列函数，校验全局不变量始终成立。

4. **fork 首次仍慢、缓存也会 miss**：`anvil --fork-url` 虽有磁盘缓存，但冷启动、换 RPC、或跨很多历史区块时仍会狂打公链限频。修法：加 `--fork-block-number` 锁定区块，或本地起 archive 节点。

## 适用 vs 不适用场景

**适用**：

- 纯 Solidity 项目，从合约到测试到部署都不离开 Solidity
- 需要主网 fork 测试（DeFi 协议集成、抢跑模拟）
- audit / 比赛场景，gas 优化和 fuzz 是刚需
- CI 跑 1000+ 测试，传统工具会慢到不可接受

**不适用**：

- 项目重度依赖 JS 库做前端联调脚本（这种场景 Hardhat 仍然顺手，或两者并用）
- 需要复杂的部署编排（多链多步骤、需要人工确认）→ 可考虑 [[hardhat]] 的 ignition 模块或自己写脚本
- 团队里没人懂 Solidity 测试 DSL，只会 JS chai → 起步成本会高
- 非 EVM 链（Solana / Aptos / Move 系）→ 完全不通用

## 历史小故事（可跳过）

- **2021 年底**：Georgios Konstantopoulos 在 Paradigm 内部启动 Foundry，最初定位是 "dapptools 的 Rust 重写版"（dapptools 是 DappHub 用 Nix 写的更早工具链，使用门槛高）
- **2022 年**：正式开源，靠"测试用 Solidity 写 + 编译快十倍"快速圈粉
- **2023 年**：Optimism / Arbitrum / Base 等 L2 团队官方推荐 Foundry，Uniswap V4 全程 Foundry 开发
- **2024 年**：陆续加入 coverage、Vyper 支持等，头部 DeFi 协议越来越多默认用 Foundry
- **2025 年 2 月**：发布 v1.0（稳定 API 与发版节奏），之后进入维护 + 性能优化；社区围绕 cheatcodes / forge-std 扩展生态

## 学到什么

1. **工具链一体化 > 拼装多个最佳单点**——Hardhat 时代每个功能要装一个插件，Foundry 把编译/测试/REPL/链上交互捏一起
2. **测试语言 = 主语言**降低心智负担，比"用 JS 测 Solidity"少一层翻译
3. **Rust 在区块链工具圈的扩散**——revm / foundry / [[reth]] 系是同一个技术轴的产物
4. **对真实环境 fork 测试**远比 mock 准确——能挖出 Hardhat unit test 永远发现不了的集成 bug

## 延伸阅读

- 官方文档：[Foundry Book](https://getfoundry.sh)（覆盖率、cheatcode 列表、配置完整列表都在这）
- 视频教程：[Patrick Collins — Foundry Full Course](https://www.youtube.com/@PatrickAlphaC)（YouTube 30+ 小时系列，零基础到部署）
- 标准库：[forge-std](https://github.com/foundry-rs/forge-std)（社区写的 Test 基类、cheatcode 封装）
- 实战参考：[Uniswap V4 仓库](https://github.com/Uniswap/v4-core)（看头部项目怎么组织 foundry 项目）
- [[besu]] —— 企业版 Java 全节点，foundry 可以连它做 fork
- [[bitcoin]] —— 起源对照：bitcoin 没有图灵完备合约，无需此类工具链

## 关联

- [[bitcoin-core]] —— 比特币 C++ 节点；和 foundry 不在一个生态，但同属"协议官方实现"
- [[besu]] —— Java 实现的企业以太坊节点，可作 anvil 的远程对照
- [[erigon]] —— Go/C++ 写的 archive 节点，foundry fork 时如果跑大量历史回溯，配 erigon 比公链 RPC 稳
- [[nethermind]] —— C# 写的以太坊客户端，企业部署常见，foundry 部署脚本能直连
- [[prysm]] —— 共识层客户端（Go），与 foundry 关注的执行层互补
- [[teku]] —— 共识层客户端（Java），同上

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[anchor]] —— Anchor — Solana 合约开发框架
- [[ape-framework]] —— Ape Framework — Python 智能合约开发一条龙
- [[aptos-core]] —— Aptos — Move 系高性能 L1
- [[aragon]] —— Aragon OSx — 一份内核合约管所有 DAO 的乐高套件
- [[arbitrum]] —— Arbitrum Nitro — Offchain Labs 的 Optimistic Rollup 客户端
- [[argent-x]] —— Argent X — 让账户本身就是一个合约的 Starknet 钱包
- [[axelar]] —— Axelar — 通用跨链 gateway
- [[balancer]] —— Balancer V2 — 通用 AMM 与权重池
- [[besu]] —— Hyperledger Besu — 用 Java 写的以太坊客户端
- [[bitcoin]] —— Bitcoin 白皮书
- [[bitcoin-core]] —— Bitcoin Core — 比特币参考实现
- [[cairo-lang]] —— Cairo — Starknet 的 zk 友好编程语言
- [[curve]] —— Curve — 稳定币低滑点兑换协议
- [[erigon]] —— Erigon — 存储优化型以太坊客户端
- [[ethers-js]] —— ethers.js — 浏览器和 Node 都能用的以太坊客户端库
- [[hardhat]] —— Hardhat — Nomic Foundation 的 JS 合约框架
- [[makerdao]] —— MakerDAO — 用抵押 ETH 铸出锚定美元的 DAI
- [[metamask]] —— MetaMask — 装在浏览器里的以太坊钱包
- [[nethermind]] —— Nethermind — .NET 写的高性能以太坊客户端
- [[opensea-js]] —— opensea-js — NFT 二级市场的官方 SDK
- [[openzeppelin-contracts]] —— OpenZeppelin Contracts — 以太坊智能合约的事实标准库
- [[optimism]] —— Optimism — 以太坊 L2 旗舰栈，把交易搬到便宜车道再回主网结算
- [[prysm]] —— prysm — 用 Go 写的 Ethereum 共识层客户端
- [[rabby-wallet]] —— Rabby Wallet — 签名前先告诉你"会变成什么样"的 EVM 钱包
- [[remix-ide]] —— Remix IDE — 浏览器内 Solidity IDE
- [[safe-contracts]] —— Safe — 多签智能账户合约
- [[scroll]] —— Scroll — 字节码级 zkEVM
- [[teku]] —— Teku — 用 Java 写的以太坊共识层客户端
- [[thirdweb-sdk]] —— thirdweb SDK — 一站式 Web3 全家桶
- [[walletconnect]] —— WalletConnect — dApp 与钱包之间的加密对讲机
- [[web3-js]] —— web3.js — 老牌 EVM JavaScript 客户端库

