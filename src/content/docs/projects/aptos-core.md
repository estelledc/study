---
title: Aptos — Move 系高性能 L1
来源: 'https://github.com/aptos-labs/aptos-core'
日期: 2026-05-30
分类: 区块链
难度: 中级
---

## 是什么

Aptos 是一条**用 Move 语言写合约、靠并行执行提速的 L1 区块链**，由原 Meta Diem 团队 fork 代码继续做的项目。日常类比：像把"同一栋写字楼里所有租户都排队用一台电梯"改成"几台电梯并行送人，临时撞了再安排谁先谁后"——把"严格串行处理交易"改成"先各自跑、事后调和"。

写传统 EVM 链合约的痛苦：所有交易都得严格串行（一笔改完状态下一笔才能开始）；Solidity 的存储模型容易写出资产被复制、被吞的漏洞；协议升级一动就要硬分叉。

Aptos 的解法是 **四件套**：Move 语言（资源类型，资产只能转移不能复制，编译期保证）+ Block-STM（交易乐观并行，冲突再重试）+ AptosBFT v4（HotStuff 派生的 BFT 共识，亚秒 finality）+ 链上框架模块升级（常见框架改动不必硬分叉）。

## 为什么重要

不理解 Aptos，下面这些事都没法解释：

- 为什么 2022 年 Meta 的 Diem 黄了，但代码和团队没消失，反而养出两条主流链（Aptos / Sui）
- 为什么 Move 这门语言 2026 年还在活跃——它的"资源类型"思想和 Rust 所有权同源，但落地在合约领域更彻底
- 为什么"高 TPS L1"不是只有 Solana 一种解法——Aptos 走的是 BFT + 并行执行，Solana 是 PoH + 单线程优化
- 为什么 Block-STM 论文成了 2022 年最被引用的区块链系统论文之一——它把数据库领域的乐观并发控制移植到了链上

## 核心要点

Aptos 的工程价值可以拆成 **三层**：

1. **Move + 资源类型**：合约里"资产"是一个**线性资源**（linear resource）——你只能 `move` 它，不能 `copy` / 不能凭空生产 / 不能丢。类比：现实世界的现金——递给别人就不在你手上了。Solidity 的 `balance[user] -= 100` 是改一个数字，Move 的 `coin = withdraw(account, 100)` 是真的把"那 100 个币"拿出来。编译期就拒绝大量"凭空增发""转账后还在原账户"这类漏洞。

2. **Block-STM 乐观并行执行**：同一区块里 N 笔交易**先并行跑**（每个 worker 拿一笔），跑完比较读写集是否有冲突；有冲突的按区块内顺序重试。类比：餐厅 5 桌点菜，5 个服务员同时下单——如果两桌点同一道有限量的菜，再回头按到店顺序补救。背后是数据库 OCC（乐观并发控制）思路在区块链落地。

3. **AptosBFT v4 + 链上升级框架**：共识是 HotStuff 派生的 BFT，三阶段提交、流水线化让 finality 接近 1 秒。Aptos Framework 这类 Move 模块放在链上，通过治理提案升级；更底层的节点二进制、VM native 逻辑和共识实现仍要按版本发布和运维升级。

三层加起来：Move 给安全、Block-STM 给吞吐、AptosBFT 给确定性、链上升级给可演进。

## 实践案例

### 案例 1：最简 Coin 合约（资源类型对比）

```move
module my_addr::teaching_coin {
    use std::signer;

    struct Coin has store { value: u64 }
    struct Wallet has key { coin: Coin }

    public entry fun create_wallet(owner: &signer, amount: u64) {
        move_to(owner, Wallet { coin: Coin { value: amount } });
    }

    public entry fun transfer(from: &signer, to: address, amount: u64) acquires Wallet {
        let coin = withdraw(from, amount);
        deposit(to, coin);
    }

    fun withdraw(owner: &signer, amount: u64): Coin acquires Wallet {
        let wallet = borrow_global_mut<Wallet>(signer::address_of(owner));
        wallet.coin.value = wallet.coin.value - amount;
        Coin { value: amount }
    }

    fun deposit(to: address, coin: Coin) acquires Wallet {
        let wallet = borrow_global_mut<Wallet>(to);
        let Coin { value } = coin;
        wallet.coin.value = wallet.coin.value + value;
    }
}
```

`Coin` 没有 `copy` / `drop` 能力，所以 `withdraw` 返回的资源必须被 `deposit` 接住；如果中途把它丢掉，编译器会拦。Solidity 写 ERC20 多半是改 `mapping(address => uint)`，Move 则把"资产流动"显式写进类型系统。

### 案例 2：Block-STM 怎么并行

一个区块有交易 A（Alice→Bob 10 APT）、B（Carol→Dave 5 APT）、C（Eve→Bob 3 APT）。

- A 和 B 账户完全不重叠 → 并行成功，各自提交
- A 和 C 都写 Bob 余额 → 后到的 C 检测到读写集冲突，丢弃中间结果，按区块序重试

执行流程：
1. 每个 worker 拿一笔交易乐观执行，记下读写集到多版本内存
2. 验证阶段按区块序号回放，检测到读了"被提前覆盖"的版本则标记为脏
3. 脏交易丢弃中间结果，按依赖顺序重新执行

实测：DeFi 互不相关的转账区块里 80% 交易能并行；中心化撮合那种"所有人改同一账户"的场景退化成串行（这是 Block-STM 已知短板）。

### 案例 3：链上模块化升级

`aptos-framework`（账户、coin、staking 等链上 Move 模块）部署在 `0x1` 地址。社区提案 → 治理签名收集 → 生效高度到达 → 新模块在链上发布，验证节点按版本执行。**不是所有协议代码都在链上**，但大量 framework 级改动不需要像传统硬分叉那样让每个客户端手动协调。

升级流程：

```
proposal -> staking voting -> threshold reached
  -> on-chain script execution -> framework module replaced
  -> all validators load new bytecode at next block
```

对比以太坊一次硬分叉（Berlin / London 等）需要所有客户端协调升级版本，Aptos 至少能把 framework 模块改动收拢到链上治理流程里，运维和协调成本更低。

## 踩过的坑

1. **Move 资源不能复制**：从 Solidity 转过来的开发者写 `let a = my_coin; let b = my_coin;` 编译失败——资源类型不允许 copy。需要用 `borrow_global` 拿引用或显式 split。

2. **Block-STM 写冲突热点退化**：所有人都改同一个账户（中心化撮合 / 全局计数器），并行版本反复重试反而比串行慢。设计合约要尽量分散写位置（per-user storage）。

3. **Gas 双层**：execution gas（CPU 时间）+ storage gas（占用槽位的押金）。新人只算 execution，simulation 过了上链却报 OUT_OF_STORAGE_GAS。要在创建对象时预留 storage 押金。

4. **链上升级双刃剑**：治理框架把协议改动门槛降低很多，但若签名收集逻辑或新模块有 bug，全链节点会同时坏掉——升级前必须 testnet 滚一遍并设回滚开关。

## 适用 vs 不适用场景

**适用**：
- 高吞吐、低延迟的链上应用——DeFi 撮合、链游、CEX 上链对账，1 秒 finality 体验接近 web2
- 资产安全敏感场景——Move 资源类型把"凭空增发""双花"拦在编译期
- 需要协议演进的链——链上模块升级避免硬分叉

**不适用**：
- 完全 EVM 兼容场景——Aptos 不跑 EVM 字节码，迁移 Solidity 合约需要重写为 Move
- 极端去中心化诉求——AptosBFT 验证人数百量级，比不上 PoW / 大型 PoS 链的去中心程度
- 写冲突高的中心化撮合 → Block-STM 退化，性能不如专门设计的 CEX 系统
- 需要复用以太坊生态工具链——大多数 EVM 工具不直接适配 Move

## 历史小故事（可跳过）

- **2019 年**：Meta（当时还叫 Facebook）启动 Libra 项目，做全球稳定币结算链，团队设计 Move 语言、写出 LibraBFT 共识
- **2020-2021 年**：监管压力剧增，Libra 改名 Diem 试图自救，但仍未获批
- **2022 年初**：Diem 项目正式终止，资产卖给 Silvergate
- **2022 年中**：Mo Shaikh + Avery Ching（前 Diem 工程负责人）创立 Aptos Labs，fork Diem 代码继续做
- **2022 年 10 月**：Aptos 主网上线，a16z / FTX 投资（FTX 倒闭后这部分股权重组）
- **2023-2024 年**：Block-STM 论文（Gelashvili et al., VLDB 2023）发表，并行执行作为 Aptos 核心卖点形成业界共识
- **2026 年**：仍是 Move 系两大主流链之一（另一条是 Sui）

## 学到什么

- **资源类型 ≠ 普通类型**——Move 把"资产"提到语言层级，编译期就堵掉一类漏洞，比运行时检查可靠得多
- **乐观并发控制能上链**——数据库领域 30 年的 OCC 思路移植到区块链，前提是事务读写集可知
- **协议升级是 L1 的核心能力**——把升级写进链上治理而不是依赖节点二进制版本，是软件工程视角的进步
- **同一团队两条链（Aptos / Sui）**——同源代码 + 不同设计哲学的对照实验，是观察"L1 设计选择"最好的样本

## 延伸阅读

- 官方文档：[aptos.dev](https://aptos.dev)（Move 教程 + 节点部署 + SDK 一整套）
- Block-STM 论文：[Gelashvili et al., 2023 (VLDB)](https://arxiv.org/abs/2203.06871)（讲清楚乐观并行 + 多版本内存的细节）
- Move Book：[move-language.github.io/move](https://move-language.github.io/move/)（Move 语言完整规范）
- 源码：[github.com/aptos-labs/aptos-core](https://github.com/aptos-labs/aptos-core)（aptos-vm / aptos-consensus / aptos-framework 三个核心 crate）
- [[solana]] —— 同样追求高性能 L1 但走不同路线的对照
- [[anchor]] —— Solana 的合约框架，对比 Move 直接是语言级安全 vs 框架级安全

## 关联

- [[solana]] —— 同代竞品高性能 L1，但用 Rust + PoH 单线程，对比 Aptos 的 Move + 并行
- [[anchor]] —— Solana 的合约 DSL，和 Move 是不同思路（框架 vs 语言）的安全策略
- [[cosmos-sdk]] —— Cosmos 应用链框架，Tendermint BFT 与 AptosBFT 同属 BFT 家族
- [[cairo-lang]] —— Starknet 的 zk 友好语言，与 Move 同属"为合约重新设计语言"流派
- [[uniswap-v3]] —— EVM 主流 DeFi，迁移到 Aptos 需用 Move 重写
- [[aave-v3]] —— EVM 借贷协议，对比 Move 系借贷的资源类型设计差异
- [[arbitrum]] —— 以太坊 L2 用 Optimistic Rollup 提速，对比 Aptos 直接做 L1 的不同路线
- [[optimism]] —— 同上，L2 路线 vs L1 路线的扩容哲学对比
- [[zksync-era]] —— L2 zk 路线，又一种扩容思路对照
- [[foundry]] —— EVM 工具链，Aptos 侧对应是 aptos-cli + Move Prover

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[aave-v3]] —— Aave V3 — 借贷协议旗舰
- [[anchor]] —— Anchor — Solana 合约开发框架
- [[arbitrum]] —— Arbitrum Nitro — Offchain Labs 的 Optimistic Rollup 客户端
- [[cairo-lang]] —— Cairo — Starknet 的 zk 友好编程语言
- [[foundry]] —— Foundry — Paradigm 出品的 Rust 合约工具链
- [[ipfs]] —— IPFS / Kubo — 按内容哈希定位的去中心化文件系统
- [[move-language]] —— Move — 资源型智能合约语言
- [[optimism]] —— Optimism — 以太坊 L2 旗舰栈，把交易搬到便宜车道再回主网结算
- [[solana]] —— Solana — Rust 写的高性能 PoH 链
- [[sui]] —— Sui — 把链上资产拆成一个个独立对象的 L1
- [[uniswap-v3]] —— Uniswap V3 — 集中流动性 AMM 核心合约
- [[zksync-era]] —— zkSync Era — Matter Labs 的 zkEVM L2

