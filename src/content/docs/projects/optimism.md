---
title: Optimism — 以太坊 L2 旗舰栈，把交易搬到便宜车道再回主网结算
来源: 'https://github.com/ethereum-optimism/optimism'
日期: 2026-05-30
子分类: 链与合约
分类: 区块链
难度: 中级
provenance: pipeline-v3
---

## 是什么

Optimism 是一套**让以太坊提速降费**的"二楼"方案：交易在二楼（L2）便宜地执行，结果再批量打包送回一楼（L1，也就是以太坊主网）做最终结算。日常类比：北京二环堵车，你绕到外面的高速辅路，开完再下回主路——同一个目的地，路费便宜、速度快，但下高速时要做"安全检查"。

它的核心架构 OP Stack 把这条辅路拆成三个零件：

- **op-node**：辅路的"调度员"，决定哪些车按什么顺序走
- **op-batcher**：把成百上千辆车的行车记录压缩打包，写到 L1 账本（数据可用性）
- **op-proposer**：向 L1 提交一份"我们这批跑完后状态长这样"的快照

这套栈被 Coinbase 拿去做了 Base 链，被 Worldchain / Mode / Mantle 等几十条链分叉，是 2024 年 L2 生态最常见的底盘。

## 为什么重要

不理解 Optimism，下面这些事都讲不清：

- 为什么以太坊主网一笔 swap 要 5 美元，而 Base / Optimism 上只要 1 美分
- 为什么从 L2 取钱回 L1 要等 7 天，但你存进 L2 只要几分钟
- 为什么 Coinbase / Uniswap / Aave 都把新链建在 L2 而不是自己起一条 L1
- 为什么 EIP-4844（blob）一上线，所有 L2 的费用立刻降一个数量级

## 核心要点

L2 rollup 的本质可以拆成 **三件事**：

1. **乐观假设**：排序器（sequencer）默认诚实地执行交易，没人挑战就 7 天后自动当真。类比：饭店先上菜后买单，如果食客不喊"这不是我点的"，账就算结了。

2. **挑战窗口 + 欺诈证明**：7 天内任何人可以提交"第 17 笔交易算错了"的证明。OP 用 Cannon（一个 MIPS 解释器）在 L1 上**单步重放**有争议的指令，直到 L2 提交者和挑战者在某一步出现分歧——谁错谁罚。

3. **数据可用性锚定 L1**：所有 L2 交易压缩后写到 L1 的 calldata（或 EIP-4844 的 blob）里。哪怕 OP 团队整体跑路，任何人都能从 L1 重建完整 L2 状态。这是它和"侧链"最大的区别。

## 实践案例

### 案例 1：体感 L2 vs L1 的费用差

最直观的对比是同一笔 ERC-20 转账：

```js
// 用 viem 发一笔转账（L2 和 L1 代码完全一样）
import { createWalletClient, http, parseEther } from 'viem'
import { optimism, mainnet } from 'viem/chains'

const client = createWalletClient({ chain: optimism, transport: http() })
const hash = await client.sendTransaction({
  to: '0x...',
  value: parseEther('0.01')
})
// L1: gas ~21000 × 30 gwei ≈ $2-5，等 ~15 秒
// L2: gas ~21000 × 0.001 gwei ≈ $0.001，等 ~2 秒
```

**逐部分解释**：合约和 viem 调用完全不变，只把 `chain: mainnet` 换成 `chain: optimism`。这就是 EVM-equivalent 的承诺——旧代码不动，换链就跑。

### 案例 2：跨层取款要等 7 天的真实流程

```js
// L2 → L1 提款（用官方 SDK）
import { CrossChainMessenger } from '@eth-optimism/sdk'

const messenger = new CrossChainMessenger({ l1ChainId: 1, l2ChainId: 10, ... })
// 第 1 步：L2 上发起提款（几秒）
const tx = await messenger.withdrawETH(parseEther('1.0'))
// 第 2 步：等状态根上 L1（约 1 小时）
await messenger.waitForMessageStatus(tx.hash, 'READY_TO_PROVE')
// 第 3 步：在 L1 上证明这笔提款（一笔 L1 交易）
await messenger.proveMessage(tx.hash)
// 第 4 步：等 7 天挑战期
await messenger.waitForMessageStatus(tx.hash, 'READY_FOR_RELAY')
// 第 5 步：在 L1 上 finalize，钱才真正到账
await messenger.finalizeMessage(tx.hash)
```

**逐部分解释**：5 步分布在 7 天内，不是机制 bug。挑战期是 OP 安全模型的灵魂——拿掉它就退化成不安全的侧链。第三方"快速桥"用流动性池预付，让用户不用等，但有信任假设。

### 案例 3：在本地起一条 devnet 看 batcher 在干嘛

```bash
# 拉源码、编译、跑本地 L1 + L2
git clone https://github.com/ethereum-optimism/optimism
cd optimism && make devnet-up
# 看 batcher 日志：每隔几秒把 L2 交易打包送到 L1
docker logs optimism-batcher-1 -f
# 输出大致：
# t=2026-05-30T12:00:01 lvl=info msg="batch published"
#   l1_tx=0xabc... l2_block_count=120 calldata_size=8192
```

**逐部分解释**：batcher 不停地把 L2 出的块打包成压缩 calldata，发到 L1 的 BatchInbox 合约地址（其实是个 EOA，不执行代码，只让数据上链）。这是 L2 数据可用性的物理实现。

## 踩过的坑

1. **提款 7 天等不来不是 bug**：新手以为 5 分钟到账，等到怀疑钱包坏了。这是欺诈证明窗口的机制本身——挑战期是 L2 安全的代价，不能跳过。要快就走第三方流动性桥，但承担信任假设。

2. **排序器目前是中心化单点**：OP 团队运营 sequencer，它宕机时所有 L2 交易停摆（虽然历史上很短）。Conductor 高可用 + 去中心化排序方案在路上，但还没全面落地。

3. **EVM-equivalent 不等于 100% 一致**：`BLOCKHASH` / `COINBASE` / 部分 gas 费规则在 L2 上语义不同。MEV bot、抢跑保护合约依赖这些 opcode 的，迁移过来会出微妙 bug——审计时要专门查。

4. **calldata 费用占总成本 80%+**：DEX 每笔交易塞几百字节路径，不做压缩比 L1 还贵。EIP-4844 blob 上线后 calldata 改 blob 才把这块成本压下来——上链成本仍然是 L2 设计的核心战场。

## 适用 vs 不适用场景

**适用**：
- 高频低额场景：游戏、社交、转账、DEX swap 这种 L1 上 gas 费占比 > 价值 1% 的应用
- 需要 EVM 兼容 + 现成工具链（[[foundry]] / [[remix-ide]] / hardhat 直接能用）
- 想搭自己的 L2 链：基于 OP Stack fork 一份就有 Base 同款基础设施
- DeFi 协议外延：[[aave-v3]] / [[uniswap-v3]] / [[curve]] 都已部署 OP 主网，组合性现成

**不适用**：
- 需要即时最终性（< 7 天）的桥应用 → 走 ZK rollup（zkSync / Starknet）或第三方流动性桥
- 隐私敏感场景 → calldata 全公开，需要 [[argent-x]] / Aztec 类零知识方案
- 跨多 L2 高频通信 → 每跳都要 L1 中转，延迟和成本叠加，看 native interop 标准（如 Superchain）
- 不需要以太坊安全锚定的场景 → 起一条侧链或 app-specific chain 反而便宜

## 历史小故事（可跳过）

- **2019 年**：Optimism PBC（前身 Plasma Group）从 Vitalik 提出的 Plasma 方案转向 Optimistic Rollup，认识到欺诈证明 + L1 数据可用比 Plasma 的"挑战 + 子链状态"更稳健。
- **2021 年 1 月**：主网上线但只对 Synthetix / Uniswap 等少数白名单开放，验证机制可行性。
- **2022 年 6 月**：Bedrock 升级，EVM 等价性彻底落地，重写整套 client（op-geth + op-node 拆分）——这是它今天能做"开放栈"的工程基础。
- **2023 年**：OP Stack 开源，Coinbase 用它造了 Base 链，[[uniswap-v3]] / [[aave-v3]] / [[compound-v3]] 全套部署上来，正式进入多链共建。
- **2024 年**：Fault Proofs 主网激活，第一次实现"任何人都能挑战错误状态根"，从"信任 OP 团队"升级到"信任协议"。

## 学到什么

1. **乐观 vs 零知识是 L2 两条路线**：OP 假设诚实，错了再吵架（便宜慢）；ZK 每笔都数学证明（贵快但成熟度低）——选型看你愿意为速度付多少
2. **数据可用性是 rollup 和侧链的分水岭**：L2 数据上 L1，哪怕 sequencer 跑路也能恢复；侧链做不到这点，就只是另一条不安全的链
3. **EVM-equivalent 是工程胜利**：让旧合约不改代码就能搬，比"性能更强"更重要——开发者迁移成本决定生态
4. **挑战期是机制成本不是 bug**：7 天提款是欺诈证明留给挑战者的时间窗口，缩短窗口就削弱安全性，没有免费午餐

## 延伸阅读

- 视频：[Optimism Overview by Bankless](https://www.youtube.com/watch?v=7pWxCklcNsU)（30 分钟讲清 OP 和 Arbitrum 区别）
- 官方文档：[OP Stack Specs](https://specs.optimism.io/)（一切配置和协议定义的源真相）
- Bedrock 设计文档：[Bedrock Design Doc](https://github.com/ethereum-optimism/optimism/tree/develop/specs)
- 想自己写 rollup：[Rollup Encyclopedia](https://www.rollup.codes/optimism)（OP 和其他 L2 的 opcode 差异表）
- Vitalik 关于 rollup：[An Incomplete Guide to Rollups](https://vitalik.eth.limo/general/2021/01/05/rollup.html)

## 关联

- [[foundry]] —— 在 Optimism 上写合约最常用的开发框架，部署命令完全通用
- [[remix-ide]] —— 浏览器合约 IDE，对 OP 主网 / 测试网原生支持，新手起步首选
- [[uniswap-v3]] —— L2 上最大的 DEX，集中流动性 AMM 在 OP 主网每天处理数亿成交
- [[aave-v3]] —— 借贷协议在 OP 上的多链部署，演示了组合性怎么跨层延伸
- [[compound-v3]] —— 同样在 OP 上部署，体感低 gas 费对 DeFi UX 的影响
- [[rabby-wallet]] —— 钱包对 OP / Base 等 L2 链的多链 UX 优化标杆
- [[safe-contracts]] —— 多签账户合约，OP 上 DAO / 团队资金管理标配

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[aave-v3]] —— Aave V3 — 借贷协议旗舰
- [[aptos-core]] —— Aptos — Move 系高性能 L1
- [[aragon]] —— Aragon OSx — 一份内核合约管所有 DAO 的乐高套件
- [[arbitrum]] —— Arbitrum Nitro — Offchain Labs 的 Optimistic Rollup 客户端
- [[argent-x]] —— Argent X — 让账户本身就是一个合约的 Starknet 钱包
- [[axelar]] —— Axelar — 通用跨链 gateway
- [[cairo-lang]] —— Cairo — Starknet 的 zk 友好编程语言
- [[chainlink-ccip]] —— Chainlink CCIP — 让两条链像两个银行那样互转钱
- [[compound-v3]] —— Compound III (Comet) — 单抵押借贷重构
- [[cosmos-sdk]] —— Cosmos SDK — 应用链开发框架
- [[cosmwasm]] —— CosmWasm — Cosmos 上的 wasm 智能合约
- [[curve]] —— Curve — 稳定币低滑点兑换协议
- [[foundry]] —— Foundry — Paradigm 出品的 Rust 合约工具链
- [[layerzero]] —— LayerZero V2 — 让一条链上的合约能给另一条链上的合约发消息
- [[polygon-zkevm]] —— Polygon zkEVM — 用零知识证明给以太坊扩容
- [[rabby-wallet]] —— Rabby Wallet — 签名前先告诉你"会变成什么样"的 EVM 钱包
- [[remix-ide]] —— Remix IDE — 浏览器内 Solidity IDE
- [[safe-contracts]] —— Safe — 多签智能账户合约
- [[scroll]] —— Scroll — 字节码级 zkEVM
- [[uniswap-v3]] —— Uniswap V3 — 集中流动性 AMM 核心合约
- [[wormhole]] —— Wormhole — 多链之间替你跑腿的"邮政系统"
- [[zksync-era]] —— zkSync Era — Matter Labs 的 zkEVM L2

