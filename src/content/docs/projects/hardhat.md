---
title: Hardhat — Nomic Foundation 的 JS 合约框架
来源: 'https://github.com/NomicFoundation/hardhat'
日期: 2026-05-30
子分类: 链与合约
分类: 区块链
难度: 初级
provenance: pipeline-v3
---

## 是什么

Hardhat 是一个**用 TypeScript 写的以太坊智能合约开发环境**，由 Nomic Foundation 维护。日常类比：写后端服务你会装 Node.js + jest + nodemon，写以太坊合约就装 Hardhat——它把"编译合约 / 起本地链 / 跑测试 / 部署上链"这一整套打包成一条 `npx hardhat` 命令。

最大的卖点是**Solidity 里能 console.log**——传统合约出了 bug 只能看 revert 字符串猜，Hardhat 在合约里 `import "hardhat/console.sol"` 后，用 `console.log("balance:", x)` 能像 Node.js 一样把日志打到终端。

它还提供 **Hardhat Network**：一条**跑在 Node.js 进程内的本地 EVM 链**，启动 1 秒、出错时给出从 EVM 字节码反推到 Solidity 源行号的栈跟踪——这两件事是 Hardhat 在 2019-2024 年统治以太坊开发圈的根本原因。

## 为什么重要

不理解 Hardhat 怎么工作，下面这些事都没法解释：

- 为什么 OpenZeppelin / Aave / 早期 Uniswap 全在用 Hardhat 而不是更早的 Truffle
- 为什么以太坊教程 90% 都是 `npx hardhat init` 起手
- 为什么招聘 Solidity 工程师，JD 里几乎默认要会 Hardhat + ethers.js
- 为什么 [[foundry]] 这种 Rust 替代品近两年才能挑战它的地位

## 核心要点

Hardhat 的设计可以拆成 **三层**：

1. **Task 系统 + 插件机制**：每条命令（compile / test / run）本质是一个 task，定义在 `hardhat.config.js` 里。插件就是一个 npm 包，import 后给 task 注入新行为或新参数。类比：像 webpack / [[vite]] 的 plugin 思路——核心做最小事，能力靠插件叠加，所以社区能写出 hardhat-verify、hardhat-gas-reporter 等几十个工具。

2. **Hardhat Network 内嵌 EVM**（EVM = 以太坊虚拟机，运行合约字节码的"CPU"）：启动 `npx hardhat node` 在 Node.js 里跑一条 EVM 链，默认创世给 20 个测试账户每个 10000 ETH。它不是真链，但行为和主网一致。机制：把 Solidity 编出的字节码丢进 EVM 解释器执行，console.sol 的日志通过特定 opcode 拦截转发到 stdout。类比：像 [[jest]] 的本地测试沙盒——快、可控、出错可重放。

3. **Stack trace 重写**：合约 revert 时，Hardhat 拿到 EVM 级 trace 后，**反查编译时生成的 source map**，把"PC = 0x123"翻译回"Counter.sol 第 42 行"。类比：JS 报错时浏览器靠 sourcemap 把混淆后的栈映射回源文件——同一种思路在 EVM 上重做。

## 实践案例

### 案例 1：起一个项目跑通测试

```bash
npm init -y
npm install --save-dev hardhat @nomicfoundation/hardhat-toolbox
npx hardhat init    # 选 "JavaScript project"
npx hardhat compile
npx hardhat test
```

`init` 后目录里有 `contracts/Lock.sol`（合约）和 `test/Lock.js`（测试）。测试文件长这样：

```javascript
const { expect } = require("chai");
describe("Lock", function () {
  it("should set unlockTime correctly", async () => {
    const Lock = await ethers.getContractFactory("Lock");
    const lock = await Lock.deploy(2000000000);
    expect(await lock.unlockTime()).to.equal(2000000000);
  });
});
```

**逐部分解释**：

- `ethers` 是全局对象，由 `hardhat-toolbox` 注入，无需手动 require
- `getContractFactory` 编译并返回部署器；`deploy(2000000000)` 是构造参数
- 测试默认在 Hardhat Network 里跑，每个 `it` 块独立的链状态

### 案例 2：在合约里 console.log 调试

```solidity
// contracts/Counter.sol
pragma solidity ^0.8.0;
import "hardhat/console.sol";
contract Counter {
    uint256 public count;
    function increment() public {
        console.log("before:", count);
        count += 1;
        console.log("after:", count);
    }
}
```

跑 `npx hardhat test` 时，**控制台直接打印 `before: 0` / `after: 1`**。**关键点**：

- 仅在 Hardhat Network 内有效（部署到主网 console 是 no-op，不会报错但也无输出）
- 上线前要删 console.log，每条都消耗 gas（约 1500-3000）
- 支持多种类型：uint / address / string / bool 自动识别

### 案例 3：Mainnet forking 重放历史交易

```javascript
// hardhat.config.js
networks: {
  hardhat: {
    forking: {
      url: "https://eth.llamarpc.com",
      blockNumber: 18000000   // 锁定区块快照
    }
  }
}
```

启动 `npx hardhat node` 后，本地链就装作"以太坊 1800 万区块时的状态"——可以查到 USDC 真实余额、调真实 Uniswap 池子，但所有改动只在本地。**典型用法**：复现某个被攻击的交易，看 revert 在哪一行；或者在主网状态上试新合约逻辑。

## 踩过的坑

1. **忘了 `require('@nomicfoundation/hardhat-toolbox')`**：把 `hardhat.config.js` 当普通 JS 写，结果测试里 `ethers` is not defined / `chai` 找不到——toolbox 这一行 import 才是注入 ethers / chai / typechain 的开关。

2. **本地链私钥误抄到主网**：Hardhat Network 的 20 个测试账户私钥是**确定性派生**（写在文档里公开的），一旦把它们当真私钥转到主网部署，几秒内就会被空投扫钱机器人扫光。

3. **升级 Hardhat 3 时配置全变**：Hardhat 3 引入 ESM + Ignition 部署系统，旧的 `hre.ethers.getContractFactory` 写法和 `scripts/deploy.js` 模式都需要改写——升级前必看官方 migration guide，否则一片 red。

4. **console.log 忘删上主网**：开发时狂打日志很爽，部署后才发现每次调用多花几千 gas，用户吐槽手续费高。修法：上线前 `grep -r "console.log" contracts/` 全删，或写脚本把 import 注释掉。

## 适用 vs 不适用场景

**适用**：

- 教学场景 / 第一次写 Solidity——`npx hardhat init` 一条命令出可用项目
- 团队主语言是 JS/TS，前端 + 合约共享一份 ethers.js 代码
- 需要复杂部署编排（多链多步、人工确认、依赖管理）→ Ignition 模块
- 已有 Hardhat 项目维护——插件生态里 hardhat-verify / coverage / gas-reporter 都成熟

**不适用**：

- audit / 安全比赛对编译速度和 fuzz 要求高 → 用 [[foundry]] 更顺手
- 纯 Solidity 团队不想碰 Node.js 工具链 → Foundry 测试也用 Solidity 写，心智更统一
- 需要 Solidity REPL 一行行试 → Hardhat 没有，用 Foundry 的 chisel
- 非 EVM 链（Solana / Move 系）完全不通用——这是以太坊专属工具

## 历史小故事（可跳过）

- **2018 年**：Nomic Labs（即后来的 Nomic Foundation）创立，启动名为 **Buidler** 的项目，对标当时的事实标准 Truffle
- **2019-2020 年**：内部酝酿改名（社区调侃 "Buidler" 总被人拼成 "Builder"），2020 年正式以 Hardhat 品牌发布，同时推出 Hardhat Network 这个杀手锏
- **2021-2022 年**：靠 console.log + 优质栈跟踪 + 插件生态快速取代 Truffle，OpenZeppelin / Aave / Uniswap V2 全部迁过来
- **2023 年起**：[[foundry]] 凭借 Rust 速度抢占头部 DeFi 项目，Hardhat 团队启动 v3 重写计划应对
- **2024-2026 年**：Hardhat 3 发布，引入 Rust 内核（EDR）、原生 Solidity 测试、Ignition 部署，性能和易用性同时提升

## 学到什么

1. **降低使用门槛 > 极致性能**——Hardhat 一开始就比 Truffle 慢但更好用，靠"console.log + 栈跟踪"两件事赢得开发者
2. **插件机制是生态护城河**——核心做最小，把扩展能力留给社区，结果社区写出几十个工具反过来锁住用户
3. **本地化的开发循环极其重要**——能在本地秒级跑 1000 个测试，比"测试在 testnet 上排队 30 秒确认"对生产力影响大一个量级
4. **被对手逼着重写不是坏事**——Foundry 出现后 Hardhat 3 用 Rust 重写部分，反而把整个赛道推向了更专业的方向

## 延伸阅读

- 官方文档：[Hardhat Documentation](https://hardhat.org/docs)（getting started、Hardhat Network 配置、所有插件列表）
- 视频教程：[Patrick Collins — Solidity Hardhat 课程](https://www.youtube.com/@PatrickAlphaC)（YouTube 免费 30 小时系列）
- 插件目录：[hardhat-plugins](https://hardhat.org/hardhat-runner/plugins)（按热度排序，verify/coverage/gas-reporter 都在）
- 部署系统：[Hardhat Ignition 文档](https://hardhat.org/ignition)（声明式部署，替代旧的 scripts/deploy.js）
- 迁移指南：[Hardhat 2 → 3 Migration](https://hardhat.org/docs/migrating)（升级前必读）

## 关联

- [[foundry]] —— Rust 写的对手工具链，编译快 10 倍但 JS 集成弱；二选一或并用
- [[go-ethereum]] —— 以太坊主流执行层节点（geth），Hardhat fork 时拉的就是它的 RPC
- [[jest]] —— JS 测试框架；Hardhat 的测试约定（describe/it/beforeEach）来自这里
- [[vite]] —— 前端构建工具；dApp 项目常见组合是 Vite + Hardhat 共用一个 monorepo
- [[webpack]] —— 老前端打包；早期 Hardhat 项目用它打 dApp 前端
- [[esbuild]] —— Hardhat 内部曾用它加速 TypeScript 编译

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[ape-framework]] —— Ape Framework — Python 智能合约开发一条龙
- [[argent-x]] —— Argent X — 让账户本身就是一个合约的 Starknet 钱包
- [[axelar]] —— Axelar — 通用跨链 gateway
- [[esbuild]] —— esbuild — 用 Go 写的极速 JS bundler
- [[ethers-js]] —— ethers.js — 浏览器和 Node 都能用的以太坊客户端库
- [[foundry]] —— Foundry — Paradigm 出品的 Rust 合约工具链
- [[go-ethereum]] —— Go-Ethereum (Geth) — 以太坊主流 Go 客户端
- [[jest]] —— Jest — 一个包就能跑 JS 测试的全家桶
- [[lodestar]] —— Lodestar — ChainSafe 的 TypeScript 以太坊共识层客户端
- [[metamask]] —— MetaMask — 装在浏览器里的以太坊钱包
- [[opensea-js]] —— opensea-js — NFT 二级市场的官方 SDK
- [[openzeppelin-contracts]] —— OpenZeppelin Contracts — 以太坊智能合约的事实标准库
- [[rabby-wallet]] —— Rabby Wallet — 签名前先告诉你"会变成什么样"的 EVM 钱包
- [[remix-ide]] —— Remix IDE — 浏览器内 Solidity IDE
- [[safe-contracts]] —— Safe — 多签智能账户合约
- [[thirdweb-sdk]] —— thirdweb SDK — 一站式 Web3 全家桶
- [[vite]] —— Vite — 浏览器自己加载源码的构建工具
- [[walletconnect]] —— WalletConnect — dApp 与钱包之间的加密对讲机
- [[web3-js]] —— web3.js — 老牌 EVM JavaScript 客户端库
- [[webpack]] —— webpack 模块打包

