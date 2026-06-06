---
title: zkSync Era — Matter Labs 的 zkEVM L2
来源: 'https://github.com/matter-labs/zksync-era'
日期: 2026-05-30
子分类: 链与合约
分类: 区块链
难度: 中级
provenance: pipeline-v3
---

## 是什么

zkSync Era 是一条**跑在以太坊外面的"高速辅道"**——你的交易在它这里快速便宜地处理，但每隔一阵会用一份**零知识证明**回主网交差，证明"这一万笔交易我没造假"。日常类比：像快递公司分拣中心。包裹不一个个直接进总仓，先在分拣中心批量打包，最后只把"这批 1000 件已核对"的清单 + 一张防伪封条塞进总仓。

Era 不只是又一个 Rollup。它有三个特点：

- **EVM 兼容**：你的 Solidity 合约 99% 不用改就能搬上去
- **自研 LLVM 编译器**：把 Solidity/Yul/Vyper 编成自家 zkEVM 字节码（不是直接复用 EVM）
- **原生账户抽象**：所有账户都是合约，没有传统私钥账户（EOA），可以用 USDC 付 gas、用社交登录、用任意签名算法

第三点最特别——它不是装个插件实现的，而是**协议层**就这么设计的。

## 为什么重要

不理解 Era，下面这些事都解释不通：

- 为什么 2023 年之后冒出"用社交账号登录的钱包"——背后多半是某条 zkEVM L2 的账户抽象在撑
- 为什么以太坊主网拥堵但 dApp 依然能扩——因为大部分活动转移到 Era / Arbitrum / Optimism 这层
- 为什么 Matter Labs 要自己造 LLVM 后端——EVM 字节码不适合 zk 证明（指令开销不一样），需要重设计指令集
- 为什么有人能"用 USDC 付 gas"——账户抽象 + Paymaster 协作的产物，L1 做不到

## 核心要点

zkSync Era 把"L2 高速 + L1 验证"拆成 **三件事**：

1. **L2 执行**：你发交易给 zkSync 的 sequencer（排序器），它在 zkEVM 里跑合约，更新自己内部状态。这步快、便宜、和 L1 无关。类比：分拣中心当场盖章入库。

2. **证明生成**：sequencer 累积一批交易后，调 **Boojum 证明器**把"这批交易的状态变化"压成一个 PLONK 证明。这步慢（GPU 算几分钟）但只算一次。类比：每装满一货车才贴防伪封条。

3. **L1 验证 + 提交**：证明 + 状态差异（state diff）发到 L1 上的 zkSync 合约，L1 用约 100k gas 验证证明，接受状态。类比：总仓收到货车，扫一下封条就放行，不挨个验。

账户抽象贯穿三件事：因为所有账户都是合约，**第 1 步执行**就允许任意签名/付费逻辑，不像 L1 卡死在 ECDSA + ETH 付费。

## 实践案例

### 案例 1：把一个 ERC20 部署上 Era

用熟悉的 Hardhat，加 `@matterlabs/hardhat-zksync` 插件：

```js
// hardhat.config.ts
import "@matterlabs/hardhat-zksync";

export default {
  zksolc: { version: "1.5.0" },
  networks: {
    zkSyncEra: { url: "https://mainnet.era.zksync.io", ethNetwork: "mainnet", zksync: true }
  },
  solidity: "0.8.24"
};
```

**逐部分解释**：

- `zksolc` 是 Era 自家的 LLVM 后端，**不**是普通 solc——它把 Solidity 编成 zkEVM 字节码而不是 EVM
- `zksync: true` 触发 hardhat 走 zk 部署流程（用 paymaster 或 ETH 付 gas）
- 合约代码本身（ERC20）一字不改，但底层字节码完全不同

### 案例 2：写一个 Paymaster 让用户用 USDC 付 gas

```solidity
// 简化版 Paymaster
contract USDCPaymaster {
    function validateAndPayForPaymasterTransaction(
        bytes32, bytes32, Transaction calldata _tx
    ) external returns (bytes4 magic, bytes memory) {
        require(IERC20(USDC).transferFrom(_tx.from, address(this), priceOf(_tx)), "USDC fail");
        magic = PAYMASTER_VALIDATION_SUCCESS_MAGIC;
    }
}
```

用户签名时把这个 Paymaster 地址塞进交易，Era 协议会先调它验证，通过后由 Paymaster 替用户付 ETH gas。这套流程在 L1 完全做不到——L1 必须用户钱包里有 ETH 才能发交易。

### 案例 3：社交登录钱包

账户抽象意味着账户合约可以装任何验证逻辑。社交登录钱包（如 Argent X 风格）是这样工作的：

```solidity
function validateTransaction(...) external {
    // 不用 ECDSA！而是验证一份 OAuth JWT 签名
    require(verifyJWT(tx.signature, googlePublicKey), "JWT invalid");
}
```

钱包账户的"私钥"实际上是用户的 Google 账号。L1 上这套**根本写不出**，因为 L1 账户的签名校验写死在协议里。

## 踩过的坑

1. **Era 不是 100% EVM 等价**：少数 opcode 行为不同（CREATE2 地址算法、selfdestruct 语义、部分 precompile），从 L1 直接搬合约可能出 subtle bug——上线前必须在 Era testnet 全套跑过

2. **没有 EOA，传统 msg.sender 直觉失效**：因为所有账户都是合约，钓鱼检测、白名单这些"按地址类型分流"的代码经常误判——必须改为按合约接口（ERC-4337-style）判断

3. **Paymaster 是双刃剑**：dApp 替用户垫 gas 听着美好，但 `validateAndPayForPaymasterTransaction` 必须严格限制谁能用、用多少，否则任何人都能让你帮他付 gas，被薅到破产

4. **L1 finality 不瞬时**：交易在 L2 上执行完只是"软确认"，要等 commit → prove → execute 三阶段共约 1-24 小时才在 L1 终结，跨链桥取钱必须等完整流程

## 适用 vs 不适用场景

**适用**：

- 高频小额交易（DeFi swap、NFT mint、游戏物品交易）——L2 便宜
- 需要无 gas 体验或代币付 gas 的 dApp——账户抽象 + Paymaster 直接给
- 想做"Web2 风格登录"的钱包——社交账号、生物识别都能塞进账户合约
- 已有 Solidity 项目想下沉到 L2，团队不想换语言

**不适用**：

- 需要瞬时 L1 finality（如某些与 L1 合约强耦合的清算）——等 24 小时受不了
- 用了大量 inline assembly / 罕见 opcode 的合约——编译可能失败或行为偏差
- 极端低频但单笔金额巨大的资金（如金库托管）——直接 L1 更安全
- 需要跨多条 L2 频繁互通的场景——目前 L2 之间转账还是经 L1 中转

## 历史小故事（可跳过）

- **2019 年**：Matter Labs 启动 zkSync 1.0，只支持 ETH/ERC20 转账，不能跑智能合约——zk 证明生成成本撑不起 EVM
- **2022 年**：zkSync 2.0 测试网上线，首个真正的 zkEVM——开发者第一次能在 zk-rollup 上写 Solidity 合约
- **2023 年 3 月**：主网正式发布，更名 zkSync Era，标志 zkEVM 进入生产阶段
- **2023 年 8 月**：Boojum 证明系统替换早期 PLONK 实现，prover 速度提升约 10 倍，证明成本降到原来的 1/3
- **2024-2025**：账户抽象、Paymaster、跨链桥（zkBridge / Hyperchain）逐步成熟，Era 成为以太坊生态主流 L2 之一

## 学到什么

1. **L2 的核心交换是"L1 安全 ↔ 自家执行环境"**——你接受"主网最终验证"的安全保证，换来便宜快速的执行
2. **zkEVM 不是简单包装 EVM**——指令集、gas 模型、字节码都为 zk 证明重新设计，因此需要自家 LLVM 编译器
3. **账户抽象是体验拐点**：没有它你只有"程序员钱包"，有它才能做出"我妈也会用的钱包"
4. **协议层做正确的事 vs 应用层补救**：Era 在协议层就把账户抽象做成默认，比 L1 上事后造 EIP-4337 干净得多

## 延伸阅读

- 官方文档：[era.zksync.io/docs](https://docs.zksync.io)（开发者入门 / 系统合约规范）
- Boojum 证明系统博客：[Matter Labs blog — Boojum upgrade](https://blog.matter-labs.io/boojum-upgrade-introducing-the-foundation-of-the-future-of-zksync-7654b8ef03d2)
- 视频：[Vitalik on zkEVMs](https://vitalik.eth.limo/general/2022/08/04/zkevm.html)（解释 zkEVM 几种类型，Era 属 Type 4）
- [[polygon-zkevm]] —— 同期另一条主流 zkEVM L2
- [[scroll]] —— 第三条主流 zkEVM，更追求"严格 EVM 等价"

## 关联

- [[polygon-zkevm]] —— 同样的 zkEVM L2 路线，但选择字节码级兼容而非源码级
- [[scroll]] —— Type 2 zkEVM，比 Era 更接近 L1 行为但牺牲一些性能
- [[arbitrum]] —— 另一种 L2 路线（Optimistic Rollup）：欺诈证明而非有效性证明，对照学习 zk vs OP
- [[optimism]] —— Optimistic Rollup 代表，Era 的"对立面"路线
- [[argent-x]] —— 主打账户抽象 + 社交恢复的钱包，与 Era 的账户抽象同源思路
- [[llvm]] —— Era 的 zksolc 编译器后端基础，复用 LLVM 优化框架
- [[uniswap-v3]] —— 在 Era 主网部署的代表性 DeFi 应用之一

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[aptos-core]] —— Aptos — Move 系高性能 L1
- [[arbitrum]] —— Arbitrum Nitro — Offchain Labs 的 Optimistic Rollup 客户端
- [[argent-x]] —— Argent X — 让账户本身就是一个合约的 Starknet 钱包
- [[llvm]] —— LLVM — 模块化编译器框架
- [[optimism]] —— Optimism — 以太坊 L2 旗舰栈，把交易搬到便宜车道再回主网结算
- [[polygon-zkevm]] —— Polygon zkEVM — 用零知识证明给以太坊扩容
- [[scroll]] —— Scroll — 字节码级 zkEVM
- [[uniswap-v3]] —— Uniswap V3 — 集中流动性 AMM 核心合约

