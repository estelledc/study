---
title: Move — 资源型智能合约语言
来源: 'https://github.com/move-language/move'
日期: 2026-05-30
分类: 区块链
难度: 中级
---

## 是什么

Move 是一门**专门给智能合约写资产逻辑的语言**，它把"钱、币、NFT"这类资产当成**真实物体**而不是数字处理。日常类比：写 Solidity 像在 Excel 里改单元格——`balance[user] = 100`，本质是改一个数；写 Move 像在仓库里搬箱子——你必须**真的把那箱币从一个货架抬到另一个货架**，不能凭空复制，不能丢在地上。

最简对比：

```move
// Move：coin 是个对象，必须被显式搬走
let coin = withdraw(&account, 100);
deposit(&recipient, coin);
```

```solidity
// Solidity：balance 只是个数字，改完算完
balance[from] -= 100;
balance[to]   += 100;
```

Move 由 Meta（Facebook）的 Diem 项目团队 2019 年起设计。Diem 黄了，但 Move 没死——Aptos 和 Sui 两条 L1 链都靠它，Move 反而成了 EVM 系之外最被认真看待的合约语言。

## 为什么重要

不理解 Move，下面这些事都没法解释：

- 为什么过去十年 EVM 链上反复发生"重入攻击 / 凭空增发 / 转账后余额还在"的资产漏洞——Solidity 把资产当数字，编译器没办法替你守住"不可复制"
- 为什么 Aptos / Sui 敢说"合约层面更安全"——Move 的资源类型在**编译期 + 字节码验证期**两道关卡里就拒绝大量资产 bug
- 为什么写 Move 比写 Rust 还容易上手做形式化验证——Move Prover 内置在工具链里，不是事后接的
- 为什么 Sui 又改了一版 Move（object-centric）——原版 Move 的"资源存在账户全局存储里"对并行执行不够友好

## 核心要点

Move 这门语言的关键设计可以拆成 **四层**：

1. **资源类型（resources）**：用 `struct` 定义的类型可以带四种 ability——`copy`/`drop`/`store`/`key`。一个**没有 `copy` 也没有 `drop`** 的 struct 就是"资源"——编译器拒绝复制它，也拒绝在作用域结束时丢弃它，**它必须被显式 move 到某个地方**。这就是"资产语义"的语言级保证。

2. **abilities 四件套**：`copy`（能复制，比如 `u64` 整数）、`drop`（能直接丢弃，普通值都有）、`store`（能存进别的 struct）、`key`（能作为顶层资源放进账户存储）。资产币类型常见组合是 `has store`——能存进容器，但不能 copy、不能 drop。

3. **模块系统（module）**：代码组织单元是 module，发布到某个账户地址下，比如 `0x1::coin`。module 私有的 struct 字段外部不可见，必须通过 module 自己暴露的函数访问——天然封装。

4. **Move 字节码验证器 + Move Prover**：合约部署上链前，节点先跑 **bytecode verifier**——校验类型安全、资源不变量、引用借用规则（类似 Rust borrow checker 的简化版）。在此之上还有 **Move Prover**：你在函数旁写 `spec { ... }` 块声明前后置条件，工具链自动转成 Boogie + Z3 的求解任务，能在 CI 里证"这函数永远不会让总供应量变化"。

四层加起来：资源给安全语义、abilities 给精细控制、module 给封装、verifier+prover 给上链前的最后一道关。

## 实践案例

### 案例 1：最简 Coin —— 资源类型怎么防 double-spend

```move
module my_addr::my_coin {
    // 没有 copy / 没有 drop —— 这就是资源
    struct Coin has store, key { value: u64 }

    public fun withdraw(account: &signer, amount: u64): Coin acquires Coin {
        let c = borrow_global_mut<Coin>(signer::address_of(account));
        let taken = c.value;
        c.value = taken - amount;
        Coin { value: amount }   // 必须返回出去，不能丢
    }

    public fun deposit(to: address, coin: Coin) acquires Coin {
        let c = borrow_global_mut<Coin>(to);
        let Coin { value } = coin;   // 必须解构销毁，不能直接丢
        c.value = c.value + value;
    }
}
```

如果你写 `let _ = withdraw(...)` 想丢掉那个 Coin——**编译器直接报错**：`Coin` 没有 `drop` ability。这就是"资产不能凭空消失"的语言级保证。

### 案例 2：abilities 决定能做什么

```move
struct Token has copy, drop, store { id: u64 }   // 普通值，随便复制丢弃
struct NFT   has store, key         { id: u64 }   // 资产，必须显式搬运
```

同样是 `struct`，加什么 ability 决定它是"普通数据"还是"资产"。NFT 没有 `copy`，编译期就拒绝"印两份"；没有 `drop`，编译期就拒绝"扔了它"。

### 案例 3：Move Prover 一瞥

```move
public fun increment(c: &mut Counter) {
    c.value = c.value + 1;
}

spec increment {
    ensures c.value == old(c.value) + 1;
    aborts_if c.value == MAX_U64;
}
```

`spec` 块声明"调用后 value 必然加 1"和"溢出时必然 abort"。CI 里跑 prover，工具链把它编成 SMT 求解问题交给 Z3——证不出来就直接 fail，相当于给关键函数加了一道数学等级的单元测试。

## 踩过的坑

1. **abilities 学习曲线陡**：四种 ability 的组合规则刚开始反直觉——为什么 vector 装 Coin 要求 Coin `has store`？为什么 `key` 类型必须也 `has store`？需要把"这个类型能不能被复制/丢弃/存进容器/作为根资源"四个问题分开想清楚。

2. **和 Rust ownership 像但不一样**：Rust 是栈上所有权 + borrow checker；Move 是字节码层面的资源不变量 + 全局存储模型。"borrow_global_mut"是 Move 特有的——Rust 没有"按地址从全局存储里借一个 mutable 引用"这种操作。

3. **Aptos vs Sui 方言不互通**：Sui 把 Move 改成 object-centric——资源不再放账户全局存储里，而是每个 object 有 owner。代码写法、模块组织都不一样。学原版 Move（Aptos 这一支）的资料看 Sui 文档会卡。

4. **Prover 不是万能**：复杂循环、动态分派、跨 module 不变量——prover 经常超时或证不出来。它擅长"短函数 + 局部不变量"，不擅长"系统级安全属性"。

## 适用 vs 不适用场景

**适用**：
- 写需要严格守住资产语义的合约（DeFi、游戏物品、NFT 标准）
- 需要在部署前跑形式化验证的关键模块（央行级 / 大额金库）
- 想避开 Solidity 整套 reentrancy / overflow / 凭空增发坑的新链

**不适用**：
- 写复杂业务逻辑同时要兼容海量 EVM 工具链（钱包、indexer、bridge 都要重写）
- 团队里没人愿意学新语言——Move 生态比 Solidity 小一个数量级
- 需要超高频微交易但又不愿改链——原版 Move 的全局存储模型对并行不够友好（Sui 的 object-centric 才优化了这点）

## 历史小故事（可跳过）

- **2019 年**：Facebook（当时还没改名 Meta）启动 Libra 项目，Sam Blackshear 等人意识到"Solidity 那一套不能用"，从零设计 Move。灵感主要来自 Rust ownership 和 1990 年 Wadler 的 linear types 论文。
- **2020 年**：Libra 改名 Diem，Move 1.0 规范公布。同期论文《Resources: A Safe Language Abstraction for Money》发表。
- **2022 年**：监管压力下 Diem 卖给 Silvergate 后清盘。Diem 团队分流——一支去 Aptos Labs（保留原版 Move），一支去 Mysten Labs（做 Sui，改 object-centric Move）。
- **2023-2026 年**：Aptos / Sui 同时上主网；Move 反而成了 EVM 之外最被认真讨论的合约语言。

## 学到什么

1. **语言级保证 > 库级约定**——资产不能复制，不靠程序员自觉，靠编译器拒绝
2. **ability 系统是"类型的类型"**——给类型贴上元数据，控制它在程序里能扮演什么角色
3. **形式化验证想被普及，必须内置到工具链**——Move Prover 不是事后挂的检查器，是 `cargo test` 同级的一等命令
4. **设计语言要带场景**——Move 把"资产"当一等公民，所以它在合约领域比"通用语言加点限制"更顺

## 延伸阅读

- 论文：[Resources: A Safe Language Abstraction for Money](https://arxiv.org/abs/2004.05106)（Diem 团队 2020，30 页讲资源类型设计）
- 官方书：[The Move Book](https://move-book.com/)（Sui 这一支整理的，免费在线）
- Aptos 入门：[Aptos Move Tutorial](https://aptos.dev/move/move-on-aptos)（最简 Coin 模块走一遍）
- [[aptos-core]] —— Move 语言的主力 L1 之一，整链架构
- [[sui]] —— Sui 改造的 object-centric Move 方言
- [[linear-types]] —— Move 资源类型的理论根

## 关联

- [[aptos-core]] —— L1 链整体（Move + Block-STM + AptosBFT），这里只讲语言层
- [[sui]] —— Sui 把 Move 改成 object-centric，是同源不同分支
- [[linear-types]] —— 线性类型 1990，资源不能复制不能丢弃的理论起点
- [[hindley-milner]] —— Move 的类型推导比 HM 弱很多（不做 let 多态），但底层依然是单态类型 + 显式标注
- [[anchor]] —— Solana 上写合约的框架，对比 Move 可以看到"资源 vs 账户模型"两条路

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[hotstuff-2019]] —— HotStuff — 让换领导也只花线性消息的 BFT 共识
- [[ipfs-2014]] —— IPFS — 把"地址"换成"内容本身"的 P2P 文件系统
- [[narwhal-tusk-2022]] —— Narwhal & Tusk — 把 BFT 共识拆成『谁说过』和『谁先说』两件事
- [[tendermint-2016]] —— Tendermint — 把拜占庭共识塞进开放区块链的工程模板
- [[cosmwasm]] —— CosmWasm — Cosmos 上的 wasm 智能合约
- [[openzeppelin-contracts]] —— OpenZeppelin Contracts — 以太坊智能合约的事实标准库
- [[zcash]] —— Zcash — 让转账在链上"既能被验证，又看不见内容"
