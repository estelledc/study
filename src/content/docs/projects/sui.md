---
title: Sui — 把链上资产拆成一个个独立对象的 L1
来源: 'https://github.com/MystenLabs/sui'
日期: 2026-05-30
分类: blockchain
难度: 中级
---

## 是什么

Sui 是 Mysten Labs 团队 2022 年开源的公有区块链。日常类比：以太坊像一家"中央账本银行"，所有钱进同一个总账，每笔账要排队改总账；Sui 像一个"快递柜"，每件资产是一个有自己锁孔的格子，谁拿钥匙谁就能直接动它，互不干扰的格子可以同时被人开。

链上状态不是一张大账户表，而是一堆带 `owner` 字段的 **object**——NFT、代币、配置卡片，每个都有 ID。简单转账（动自己对象）走"快速路径"绕过共识就能确认；只有要动**共享对象**（比如 AMM 池子）才进共识。

```move
public entry fun transfer_coin(coin: Coin<SUI>, recipient: address) {
    transfer::public_transfer(coin, recipient)
}
```

这段 Move 代码就是 Sui 的世界观：你**拿着**一个 Coin 对象，函数把它**搬给**别人，没人去查"全局余额表"。

## 为什么重要

不理解 Sui 的对象模型，下面的事都没法解释：

- 为什么 Sui 转账能做到亚秒确认，而 Ethereum 要等 12 秒一个区块——快速路径根本没进共识
- 为什么 Sui 的 TPS 压测能上万——大部分交易在不同对象上，天然并行
- 为什么 Sui 的 Move 代码不能直接搬到 Aptos——同样叫 Move，但 Sui 加了 object 能力，Aptos 走 resource group
- 为什么 Sui 钱包要拆 gas 对象——一个 Coin 只能被一笔交易锁住，不拆就排队

## 核心要点

Sui 的设计可以拆成 **三个支柱**：

1. **Object-centric 数据模型**：链上状态是一组对象，每个对象有 `id` 和 `owner`。类比："文件柜里一格一格的抽屉"，操作以抽屉为单位，不是去翻整个柜子的台账。

2. **双轨共识**：动**自己对象**的交易（owned）走 Byzantine 因果广播，validator 见到就确认，不排序；动**共享对象**的交易（shared）进 **Narwhal** 内存池 + **Bullshark** DAG 共识定序。类比：自己家钥匙开自家门不用排号，大家共用的会议室才需要预约系统。

3. **并行执行**：定序后的交易扫一遍读写集，不冲突的批量并行跑。类比：餐厅厨房里每个厨师切自己的菜，只有共用一口锅时才轮流。

三件事拼起来，叫 **Sui 共识协议**。

## 实践案例

### 案例 1：铸造一个 NFT object

```move
struct Hero has key, store {
    id: UID,
    name: String,
}

public entry fun mint(name: String, ctx: &mut TxContext) {
    let hero = Hero { id: object::new(ctx), name };
    transfer::public_transfer(hero, tx_context::sender(ctx))
}
```

**逐部分解释**：

- `has key, store` 表示 Hero 可以作为顶层对象存在链上、也能放进别的容器
- `id: UID` 是每个对象必须有的全局唯一 ID，由 `object::new` 生成
- `mint` 把新对象 `transfer` 给调用者——不是写到某个余额映射，是把对象**所有权**指向 sender

### 案例 2：简单转账走快速路径

Alice 把自己的 `Coin<SUI>` 转给 Bob：

1. Alice 钱包构造交易：`{ inputs: [coin_objectA], move_call: transfer_coin(coin_objectA, bob) }`
2. validator 检查 coin_objectA 的 owner 确实是 Alice（因果上 Alice 拿到过这个 Coin）
3. 多数 validator 签名 → 交易确认，**没进共识**

整个过程亚秒级。Ethereum 等价操作要等下一个区块（约 12 秒）。

### 案例 3：AMM 池子必须走共享对象

```move
struct Pool<phantom A, phantom B> has key {
    id: UID,
    reserve_a: Balance<A>,
    reserve_b: Balance<B>,
}

public entry fun swap<A, B>(pool: &mut Pool<A, B>, ...) { ... }
```

`Pool` 是 shared object（所有人都能读写）：

1. 多人同时 swap，全部进 Narwhal 内存池
2. Bullshark DAG 共识定序成一个全序
3. 执行层并行跑——只要不冲突（比如不同池子）就一起算

shared 对象牺牲一点延迟（要进共识）换上"全局可访问"。

## 踩过的坑

1. **以为有全局余额**：Sui 没有 `balanceOf(address)` 这种调用——你的"余额"是钱包里所有 `Coin<SUI>` 对象的总和，每个 Coin 各自有 ID，要按对象操作。

2. **owned 和 shared 搞混**：能用 owned 就用 owned，shared 每次都要进共识有延迟。我见过新手把全局配置写成共享对象，导致整个 dapp 串行化。

3. **Sui Move 不等于 Aptos Move**：Sui 加了 object 模型和 `UID` / `transfer::*` 接口，Aptos 用 resource group。同一份 Move 代码两边互拷会编译不过。

4. **gas 对象只有一个**：钱包只剩一个 Coin<SUI> 时所有交易必须串行（每笔交易要锁住一个 Coin 当 gas）。要先 `split` 出多个小 Coin 才能并行发交易。

## 适用 vs 不适用场景

**适用**：
- 高频小额支付 / NFT 铸造转让 / 链游道具——大部分操作都是 owned object，走快速路径
- 资产逻辑能自然按对象拆分的应用——每个用户/物品独立状态
- 对延迟敏感、对最终性要求亚秒的场景

**不适用**：
- 重度依赖全局共享状态的逻辑（如全局排行榜、复杂 DeFi 路由）——shared 对象会成瓶颈
- 想直接复用 Solidity / EVM 生态的项目——Move 是另一套语言和心智模型
- 需要 EVM 兼容钱包/工具链开箱即用——Sui 的钱包/RPC 自成一套

## 历史小故事（可跳过）

- **2019 年**：Meta（当时 Facebook）启动 Libra 项目，团队设计了 Move 语言和 Diem 区块链
- **2021 年**：Diem 项目在监管压力下被 Meta 关停，Sam Blackshear（Move 主设计师）、Evan Cheng（前 LLVM/Apple）等核心成员出走
- **2021 年底**：上述团队成立 Mysten Labs，从零设计新链——Move 语言保留，但数据模型从 Diem 的全局 resource 改成对象中心
- **2022 年 5 月**：Sui 主网代码开源，devnet 上线
- **2023 年 5 月**：主网正式上线，和同样 Diem 出身的 [[aptos-core]] 形成 Move 系两条主要 L1

## 学到什么

1. **数据模型决定上限**：Ethereum 的全局账户树注定串行，Sui 把状态拆成独立对象就能并行——这不是"优化"，是范式重选
2. **不是所有交易都需要共识**：动自己东西不需要全网排序，只有动公共资源才要——这个分类把简单转账的延迟从秒压到亚秒
3. **共识可以是 DAG 而不是链**：Narwhal/Bullshark 把内存池和定序解耦，吞吐和延迟都能涨
4. **同源也能分叉**：Sui 和 Aptos 都源自 Diem/Move，但数据模型选择不同，生态完全不互通

## 延伸阅读

- 官方文档：[Sui Move by Example](https://examples.sui.io/)（一节一节学 Move）
- Sui Lutris 论文：[Sui Lutris — A Blockchain Combining Broadcast and Consensus](https://arxiv.org/abs/2310.18042)（双轨共识的形式化描述）
- Narwhal/Bullshark 论文：[Narwhal & Bullshark — DAG-based Mempool and Efficient BFT Consensus](https://arxiv.org/abs/2105.11827)
- [[aptos-core]] —— Move 系另一条 L1，对照看数据模型差异
- [[solana]] —— 另一条主打高吞吐 + 并行执行的 L1，但模型完全不同

## 关联

- [[aptos-core]] —— 同样 Diem 出身的 Move 链，但保留全局 resource 模型，可对比对象模型的取舍
- [[solana]] —— 另一条并行执行 L1，靠交易声明读写集而不是对象 owner 来调度
- [[go-ethereum]] —— 全局账户树 + 单线程 EVM 的代表，是 Sui 想超越的对象
- [[bitcoin]] —— UTXO 模型某种意义上是 Sui 对象模型的远房祖先（每枚币也是独立对象）
- [[cosmos-sdk]] —— 另一条把链拆模块的思路，但仍是账户/状态机模型
- [[anchor]] —— Solana 上的 Move 等价物，对照看智能合约抽象差异
- [[uniswap-v3]] —— DeFi 标杆 AMM，Sui 上的 AMM 必然用 shared object 实现

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[move-language]] —— Move — 资源型智能合约语言
