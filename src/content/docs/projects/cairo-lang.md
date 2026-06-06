---
title: Cairo — Starknet 的 zk 友好编程语言
来源: 'https://github.com/starkware-libs/cairo'
日期: 2026-05-30
子分类: 链与合约
分类: 区块链
难度: 中级
provenance: pipeline-v3
---

## 是什么

Cairo 是一种**写出来的程序不仅能跑，还能附带一份"我真的是这么跑的"的密码学证明**的编程语言。日常类比：普通语言像考试当场口算，老师必须在场盯着；Cairo 像答完题再附一张"封条"，老师只要查封条就知道你没作弊，根本不用重做一遍题。

你写：

```cairo
fn add(a: felt252, b: felt252) -> felt252 {
    a + b
}
```

这看起来就是 Rust，但编译器会把它转成一组**多项式约束**（叫 AIR）。运行时不只算出结果，还顺手记下"轨迹（trace）"，一会儿能压缩成几 KB 的 STARK 证明。

Cairo 是以太坊 L2 网络 **Starknet** 上唯一的合约语言，由 StarkWare 团队开发，1.0 起用 Rust 重写编译器。

## 为什么重要

不理解 Cairo，下面这些事都没法解释：

- 为什么 Starknet 能比以太坊 L1 便宜几十倍但安全性还能传回 L1
- 为什么 zk-Rollup 要单独发明一种语言，不能直接用 Solidity
- 为什么 Cairo 1.0 的语法长得像 Rust——不是凑热闹，是为了好读 + 编译器能复用 Rust 工具链
- 为什么 felt252 这种"古怪类型"在 Cairo 里到处都是，背后是密码学的素数域运算

## 核心要点

Cairo 的核心可以拆成 **三层**：

1. **felt252（素数域整数）**：所有底层数都是某个大素数 p 以下的 252 位整数。类比：你以为在用普通整数，其实在玩一个"超过 p 就绕回来"的环形跑道。p 选得让 STARK 证明最快。

2. **AIR（代数中间表示）**：编译器把 Cairo 程序翻成一组多项式约束。类比：把"程序对不对"重写成"这组方程是不是都成立"，然后用密码学方式证明方程都成立。

3. **STARK prover/verifier**：执行时记下每一步状态形成 trace，prover 把 trace 压成证明（通常几十 KB），verifier 验证只需几毫秒。这一步**不可信**也没关系——证明本身自带数学保证。

三层串起来就是 Cairo 的核心循环：写 → 编译成约束 → 跑出 trace → 生成证明 → 任何人验证。

## 实践案例

### 案例 1：写一个最简 Starknet 合约

```cairo
#[starknet::contract]
mod Counter {
    #[storage]
    struct Storage {
        count: u128,
    }

    #[external(v0)]
    fn increment(ref self: ContractState) {
        self.count.write(self.count.read() + 1);
    }
}
```

**逐部分解释**：
- `#[starknet::contract]` 是宏，告诉编译器这是个合约模块
- `#[storage]` 标的 struct 字段会被持久化到链上存储
- `#[external(v0)]` 标的函数是外部可调用入口
- `self.count.read() / write()` 是 Cairo 风格的存储访问，类似 Solidity 的 state variable 但更显式

### 案例 2：从 Solidity 迁移踩到的"felt 不是 uint256"

```cairo
fn unsafe_add(a: felt252, b: felt252) -> felt252 {
    a + b   // 不是 256 位整数，是模 p 的素数域加法
}
```

如果你以为 felt252 就是 uint256，会发现：超过 p 不会"溢出回 0"，而是绕回到某个奇怪的小数。要做正经无符号整数，应该用 `u256` 类型，编译器会用两个 felt 拼出来。

### 案例 3：本地跑 Cairo 并生成证明

```bash
scarb build              # 用 Cairo 包管理器编译
cairo-run --program ./target/dev/my_pkg.sierra.json
# 拿到 trace 后，喂给 prover
stone-prover prove --trace trace.bin --output proof.json
```

`scarb` 是 Cairo 的 cargo 等价物，`cairo-run` 是 VM，`stone-prover` 是 StarkWare 开源的 STARK 证明器。这套流程把"写代码 / 跑 / 生成证明"分成三段，普通开发者前两段就够用了。

## 踩过的坑

1. **felt252 不是 uint256**：从 Solidity 迁来的人最常见的混淆。用整数运算请显式选 `u128 / u256`，不要直接拿 felt 当数字。

2. **Cairo 0 vs Cairo 1.0 几乎两门语言**：网上 2022 年前的教程是汇编风（`tempvar` / `assert` / `[ap]` 这些），现在的 Cairo 1.0 是仿 Rust。看教程一定先确认版本。

3. **本地开发感觉不到 prover 慢**：`cairo-run` 只跑 VM，几毫秒出结果；但真正生成 STARK 证明可能几分钟到几小时，复杂合约部署到主网经常因为这个排队。

4. **存储槽寻址不是 EVM 那套**：Starknet 用 Pedersen 哈希派生 storage key，和以太坊 keccak256 不同；用 Foundry/Hardhat 心智模型直接读链上槽位会读到错位置。

## 适用 vs 不适用场景

**适用**：
- 部署到 Starknet L2 的 DeFi / NFT / 社交合约（Argent、Ekubo、JediSwap）
- 需要把大量计算搬到链下、然后把"做对了"证明传回 L1 的 zk-Rollup 场景
- 想体验"程序自带可验证性"的密码学应用（隐私转账、链下匹配引擎等）

**不适用**：
- 部署到以太坊 L1 或其他 EVM 链——它根本跑不起来，要先转译
- 需要复杂浮点 / 大整数库的科学计算——素数域算术对这些不友好
- 团队完全不熟 Rust 语法且没有学习预算
- 对编译时间 / 证明生成时间极其敏感的高频小合约

## 历史小故事（可跳过）

- **2018 年**：StarkWare 由 Eli Ben-Sasson 等人成立，目标是把 STARK 证明系统工业化
- **2020 年**：第一版 Cairo 0 发布，汇编风语法（直接暴露 `[ap]` `[fp]` 这些寄存器引用），写起来非常痛苦但够灵活
- **2022 年**：宣布 Cairo 1.0 用 Rust 重写编译器，新语法仿 Rust，引入 trait / generic / borrow 检查
- **2023 年**：Cairo 1.0 + Starknet v0.11 主网正式上线，社区从 Solidity 大规模迁入
- **2024-2025 年**：scarb 包管理器成熟，OpenZeppelin Cairo 标准合约库稳定，Cairo 成为 zk-friendly 语言事实标准

## 学到什么

1. **可验证执行 = 程序 + 证明**——不是普通"跑得对"，而是"任何人都能验证你跑得对"
2. **底层类型反映数学结构**：felt252 不是任性，是素数域算术的直接暴露
3. **L2 不只是"更便宜的 L1"**：它换了执行模型——计算在链下，验证在 L1
4. **重写一门语言要对老用户残酷**：Cairo 0 → 1.0 的语法断代，让 StarkWare 收获了易学性，也丢了一批早期开发者

## 延伸阅读

- 官方书：[The Cairo Book](https://book.cairo-lang.org/)（仿 Rust Book 写法，从 Hello World 到合约部署）
- StarkWare 博客：[Cairo 1.0 announcement](https://medium.com/starkware/cairo-1-0-aa96eefb19a0)
- [[zk-snark]] —— Cairo 用的是 STARK，不是 SNARK，但思想同源
- [[polygon-zkevm]] —— 另一种 zk-Rollup 路线，选择兼容 EVM 而非另起语言
- 视频：[StarkWare YouTube — Cairo for Solidity Devs](https://www.youtube.com/@StarkWareLtd)（45 分钟从 Solidity 视角讲 Cairo）

## 关联

- [[zk-snark]] —— 同属零知识证明系，Cairo 选 STARK，二者在透明性 / 量子抗性上有差异
- [[polygon-zkevm]] —— 另一种 zk-Rollup 实现，路线不同（兼容 EVM）
- [[arbitrum]] —— Optimistic Rollup 路线对照，不需要 zk 证明但有挑战期
- [[optimism]] —— 同样 Optimistic Rollup，对比可见 zk 路线在终局性上的优势
- [[argent-x]] —— Starknet 上最主流钱包，账户抽象 + Cairo 合约结合
- [[foundry]] —— EVM 工具链对照，Cairo 这边对应的是 scarb + starknet-foundry
- [[rust-lang]] —— Cairo 1.0 编译器用 Rust 写，语法也仿 Rust

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[anchor]] —— Anchor — Solana 合约开发框架
- [[aptos-core]] —— Aptos — Move 系高性能 L1
- [[arbitrum]] —— Arbitrum Nitro — Offchain Labs 的 Optimistic Rollup 客户端
- [[argent-x]] —— Argent X — 让账户本身就是一个合约的 Starknet 钱包
- [[cosmwasm]] —— CosmWasm — Cosmos 上的 wasm 智能合约
- [[foundry]] —— Foundry — Paradigm 出品的 Rust 合约工具链
- [[optimism]] —— Optimism — 以太坊 L2 旗舰栈，把交易搬到便宜车道再回主网结算
- [[polygon-zkevm]] —— Polygon zkEVM — 用零知识证明给以太坊扩容
- [[zk-snark]] —— zk-SNARK 零知识证明

