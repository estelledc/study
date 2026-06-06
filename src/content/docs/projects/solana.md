---
title: Solana — Rust 写的高性能 PoH 链
来源: 'https://github.com/solana-labs/solana'
日期: 2026-05-30
子分类: 链与合约
分类: 区块链
难度: 高级
provenance: pipeline-v3
---

## 是什么

Solana 是一条**用 Rust 写的 L1 公链**，在不分片、不依赖 rollup 的前提下，把单链 TPS 设计目标推到 **65k+**。它不是又一个 EVM 兼容链，而是从 0 重做的执行模型。

日常类比：你去一家**预约制餐厅**。普通公链像散客排队（先到先点）；Solana 强制你**预约时声明要点哪几道菜、用哪些食材**——后厨可以提前把不冲突的菜并行切好，上菜速度自然快。

具体来说，Solana 把一条链拆成 4 件原创组件：

```
PoH（时间戳）  →  Gulf Stream（提前转发交易）
        ↓
Sealevel（并行执行）  →  Tower BFT（共识锁定）
        ↓
Turbine（树形传播给全网）
```

每件组件都尝试**绕开传统区块链的串行瓶颈**。组合起来，才有"高吞吐 L1"这件事。

## 为什么重要

不理解 Solana 这套设计，下面这些问题都没法解释：

- 为什么以太坊出块 12 秒、Solana 出块 400ms——这不只是参数调小，而是重新切了执行流水线
- 为什么 Solana 写合约要"预先声明所有读写账号"——这是并行化的入场票
- 为什么 Solana 历史上多次宕机——高吞吐和**垃圾交易抵抗力**是两件事
- 为什么 Jump Crypto 要花两年写第二个客户端 firedancer——单客户端是单点故障

## 核心要点

Solana 设计可以拆成 **4 个支柱**：

1. **PoH（Proof of History）—— 一个不依赖共识的全局时钟**。每个 leader 节点连续算 SHA-256 哈希链，每一步的输出当下一步输入。任何人拿这个序列就能验证"事件 A 发生在事件 B 之前"，不用先达成共识。类比：流水账上的连续编号——你撕不掉中间一页。

2. **Sealevel —— 并行运行时**。普通链一笔一笔跑交易；Sealevel 看交易声明的账号集，**没冲突的交易并行跑**。前提：交易必须显式列出读写账号。

3. **Gulf Stream —— mempool-less 转发**。普通链交易在公共 mempool 排队等打包；Solana 知道未来 N 个 slot 谁是 leader，钱包/RPC 直接把交易转发给那个节点，省掉 mempool 这一跳。

4. **Tower BFT —— PBFT 变体**。在 PoH 时间戳上做 PBFT 投票，每次投票锁定时间翻倍（"塔"），形成可验证的 finality。

四件加起来叫 **Solana 共识 + 运行时栈**。

## 实践案例

### 案例 1：账号必须预先声明（与 EVM 最大差别）

EVM 写法（Solidity）你想转 USDC，只写：

```solidity
usdc.transfer(bob, 100);
```

Solana 写法（Anchor）你必须**列出所有要读写的账号**：

```rust
#[derive(Accounts)]
pub struct Transfer<'info> {
    pub from: Account<'info, TokenAccount>,   // 显式
    pub to:   Account<'info, TokenAccount>,   // 显式
    pub authority: Signer<'info>,             // 显式
}
```

为什么？因为运行时拿到这份清单，**才能判断这笔交易和哪些其他交易没冲突**，可以并行执行。这是 Sealevel 的入场票。

### 案例 2：一笔交易从钱包到出块的完整路径

```
用户钱包签名
  ↓ Gulf Stream（直接发给未来 leader）
leader 节点收齐 ~64k 笔交易
  ↓ Sealevel 并行执行（无冲突的交易）
出 entry → PoH 哈希链插一笔
  ↓ Turbine 树形广播（O(log N) 跳）
全网验证 → Tower BFT 投票 → finalize
```

整个过程目标 400ms 一个 slot。对比以太坊（12s）少 30 倍。

### 案例 3：Solana vs 以太坊做同一个 swap

| 维度 | 以太坊 mainnet | Solana |
|---|---|---|
| 出块 | 12s | 400ms |
| Gas | $5-50（闲时 $1） | <$0.01 |
| 失败模式 | 交易卡 mempool | 直接被 leader 丢 |
| 编程模型 | 状态在合约 | 状态在账号 |

Solana 便宜 + 快，代价是**生态小、宕机风险**、写代码心智负担更高。

## 踩过的坑

1. **把 PoH 当共识**——其实它只是**可验证时钟**（VDF 风味），共识本身是 Tower BFT（PBFT 变体）。这是 Solana 文档最常被误读的一点。

2. **用 EVM 思维理解账号**——Solana 程序无状态，状态全在账号里。调用必须在交易里预先列出所有读写账号，否则直接被拒。新人最常踩。

3. **忘记 rent-exempt**——账号余额不到 rent-exempt 阈值会被回收。新人常用测试网转少额然后地址消失，以为是 RPC 出错。

4. **误以为高 TPS 等于稳定**——历史上多次大规模宕机（2021 IDO 抢跑、2022 NFT 铸造），对垃圾交易抵抗力曾很弱。引入 QUIC + 优先级费 + 本地费市场后才好转。

## 适用 vs 不适用场景

**适用**：

- 高频交易 / DEX —— 出块快 + 费用低，做市商真能跑
- 微支付 / 游戏内交易 —— 单笔 < 1 美分
- 链上订单簿（Phoenix / OpenBook）—— 因为延迟够低
- 大规模 NFT 铸造（前提：扛住流量）

**不适用**：

- 需要最高安全 / 最大去中心化的国库级金额 —— 用以太坊 mainnet
- 需要 EVM 兼容生态（合约 fork 即用）—— 用 Arbitrum / Optimism
- 需要复杂状态共享（多合约相互调用读状态）—— Solana 的账号模型反而成本高
- 团队只有 Solidity 经验且不愿学 Rust —— 学习曲线很陡

## 历史小故事（可跳过）

- **2017**：Anatoly Yakovenko（前高通工程师）写出 PoH 白皮书，洞见：给区块链一个不依赖共识的时钟，其他组件可以并行做事。
- **2018**：Anatoly + Greg Fitzgerald + Stephen Akridge 在硅谷创立 Solana Labs，开始用 Rust 实现。
- **2020-03**：主网 beta 上线。
- **2021**：DeFi/NFT 热潮把 Solana 推上主流视野，年内多次宕机暴露设计缺陷。
- **2022-2023**：引入 QUIC、优先级费、本地费市场；Jump Crypto 启动 firedancer（C 写的第二客户端）。
- **2024-2026**：firedancer 部分组件上主网，第二客户端缓解单点风险。

## 学到什么

1. **架构创新可以来自打破假设**——"每条链都该有 mempool"被 Gulf Stream 直接砍掉
2. **并行化的代价是显式契约**——你想要并发就得交出"我读写哪些数据"，没有免费午餐
3. **高 TPS ≠ 高可用**——抗垃圾流量是另一个独立工程问题，得专门设计费市场和限流
4. **单客户端是系统性风险**——这点和以太坊（多客户端）形成鲜明对比，firedancer 项目是迟来的修补

## 延伸阅读

- 白皮书：[Yakovenko 2017 — Solana PoH](https://solana.com/solana-whitepaper.pdf)（25 页，PoH 数学部分密度高）
- 文档：[docs.solana.com](https://docs.solana.com/)（账号模型 / 编程模型必读）
- Anchor 框架：[Anchor Book](https://book.anchor-lang.com/)（写 Solana 程序的事实标准）
- firedancer 设计：[Jump Crypto firedancer 博客](https://jumpcrypto.com/firedancer/)（第二客户端为什么要从 0 写）
- [[bitcoin]] —— Solana 想解决比特币 7 TPS 的吞吐问题
- [[ebpf]] —— Solana 程序跑在 SBF（Solana Berkeley Filter）VM 上，eBPF 风味

## 关联

- [[bitcoin]] —— PoW 区块链的起点；Solana 想替代它做高频场景
- [[paxos]] —— Tower BFT 是 BFT 共识，思想上和 Paxos 一脉相承
- [[raft]] —— 共识对照组：Solana 不用 Raft，但 leader-based 思路类似
- [[ebpf]] —— Solana 的 SBF VM 借鉴 eBPF 的 verifier 思路
- [[llvm]] —— Solana 程序通过 Rust + LLVM 编译到 SBF 字节码
- [[go-ethereum]] —— 主流对照客户端，多客户端 vs Solana 单客户端
- [[uniswap-v3]] —— 最大的 EVM DEX，Solana 上对应的是 Phoenix / Orca

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[anchor]] —— Anchor — Solana 合约开发框架
- [[aptos-core]] —— Aptos — Move 系高性能 L1
- [[arweave]] —— Arweave — 一次付费、永远存着的区块链
- [[bitcoin]] —— Bitcoin 白皮书
- [[cosmwasm]] —— CosmWasm — Cosmos 上的 wasm 智能合约
- [[ebpf]] —— eBPF — 用户写小程序，内核证明安全后再跑
- [[go-ethereum]] —— Go-Ethereum (Geth) — 以太坊主流 Go 客户端
- [[llvm]] —— LLVM — 模块化编译器框架
- [[paxos]] —— Paxos — 分布式共识算法
- [[raft]] —— Raft — 易理解的共识算法
- [[sui]] —— Sui — 把链上资产拆成一个个独立对象的 L1
- [[uniswap-v3]] —— Uniswap V3 — 集中流动性 AMM 核心合约
- [[zcash]] —— Zcash — 让转账在链上"既能被验证，又看不见内容"

