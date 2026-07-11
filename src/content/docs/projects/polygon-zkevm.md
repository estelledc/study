---
title: Polygon zkEVM — 用零知识证明给以太坊扩容
来源: 'https://github.com/0xPolygonHermez/zkevm-node'
日期: 2026-05-30
分类: 区块链
难度: 高级
---

## 是什么

Polygon zkEVM 是一条 **以太坊 Layer 2**：你把合约调用和转账发到它身上，它在链下批量跑完，再用一份**零知识证明**告诉以太坊主网"我没作弊"。日常类比：像把一摞作业交给课代表批改，他改完只交给老师**一张签名小纸条**，老师不用一份份重读，验签就放行。

它的招牌是 **EVM 等价**——你在以太坊主网部署的合约、用的钱包、写的脚本，几乎不改就能搬过来。底层有一台叫 **zkProver** 的电路，负责把"EVM 把这条字节码跑了一步"翻译成数学上的多项式约束。

`zkevm-node` 是它的 L2 全节点实现（Go 写）。包含 sequencer（排交易）、aggregator（聚合证明）、synchronizer（拉 L1 数据）、JSON-RPC（兼容以太坊接口）几大件。

## 为什么重要

不理解 zkEVM，下面这些事都没法解释：

- 为什么 2023 年起一堆 DeFi 协议**直接复制 L1 合约**到一条新链就能跑——背后就是 EVM 等价
- 为什么"L2 便宜"但**安全性还能挂在以太坊**——靠的是 zk 证明被 L1 合约验证
- 为什么 prover 服务器要塞满显卡——电路约束几亿条，证明生成是重计算
- 为什么相同概念会有 zkSync / Scroll / Polygon zkEVM 三家在打——EVM 等价的实现路线不同

## 核心要点

zkEVM 的工作流可以拆成 **三步**：

1. **打包（sequencer）**：用户的交易先进 L2 mempool，sequencer 把若干笔交易排序、塞进一个 batch、写一份"trusted state"。类比：餐厅前台把订单按到达顺序贴到打印机。

2. **执行 + 证明（executor + prover）**：executor 真的把字节码跑一遍，得到状态变化；prover 同时把这次执行翻译成 **多项式约束**，再用 zk 算法（PLONK / STARK 系）压成一份简短证明。类比：厨师做菜的同时，监控录像把整段过程压成一段哈希。

3. **聚合 + 上链（aggregator + L1 verifier）**：aggregator 把多个 batch 的证明合并成一个，调用以太坊主网的 verifier 合约验证。验证通过 → "verified state" 落地，回滚不了。类比：监控带送到警局，警员只看签字封条就放行。

合起来：**链下执行 + 链上验签**。注意 prover 和 executor 是两个角色——executor 跑得快、给 sequencer 用来快速反馈；prover 跑得慢、专门生成证明给 L1 看。这种"快路径 + 慢证明"分离是 zkEVM 性能能上得来的关键。

## 实践案例

### 案例 1：把一份 L1 合约部署到 zkEVM

最小例子（Solidity 计数器）：

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract Counter {
    uint256 public count;
    function inc() external { count += 1; }
}
```

部署脚本（hardhat / foundry 都行）只需要换一个 RPC URL 和 chainId：

```bash
# .env
RPC_URL=https://zkevm-rpc.com
CHAIN_ID=1101
```

合约 bytecode、ABI、调用方式都不变。这就是"等价"的实际体感。

### 案例 2：钱包 / 前端怎么切到 zkEVM

ethers.js v6 里：

```js
import { JsonRpcProvider } from "ethers"
const provider = new JsonRpcProvider("https://zkevm-rpc.com", 1101)
const block = await provider.getBlockNumber()
console.log("zkEVM 当前高度:", block)
```

前端只是换个 chainId（1101 是 Polygon zkEVM 主网）。原本调用 L1 的 `eth_call`、`eth_sendRawTransaction` 全都直接复用。

### 案例 3：观察 batch 上链节奏

zkevm-node 暴露的 RPC 多了一个 `zkevm_batchNumber`，能看 batch 序号。普通用户的体感：

```
用户发交易 → 进入 trusted state（秒级，可被 sequencer 改）
sequencer 把 batch 写到 L1 → virtual state（约几分钟）
aggregator 提交证明并被 L1 verify → verified state（可能十几分钟到 1 小时，完全不可回滚）
```

三种"状态"对应三种"finality 等级"，应用层要按业务自己挑：刷脸点单用 trusted 就够，跨链取款必须等 verified。

## 踩过的坑

1. **batch 资源上限**：单 batch 限制 keccak 次数、字段元素总量。合约里循环 hash 太多会让交易"语法没错也被拒"，和 L1 gas 不是一回事。

2. **EVM 等价 ≠ 100% 一致**：极少数 opcode 与 precompile 行为有版本差异（如 `SELFDESTRUCT`、某些预编译合约），迁移前要查 fork 版本说明。

3. **prover 是重资产**：证明生成需要大显存 + 长时间，普通团队跑不动；多数项目依赖 Polygon 官方 prover，去中心化在路上。

4. **仓库已归档**：`zkevm-node` 在 2025-02 归档（最后版本 v0.7.3），新部署应迁移到继任者 **cdk-erigon**。老 README 里很多 CLI 指令已过时，找资料认准时间戳。

5. **状态机三档容易混**：trusted / virtual / verified 不是同义词，分别是"sequencer 说了算 / batch 已上 L1 但未证 / L1 已验过证"——业务设计前要分清"哪一档下结论"。

## 适用 vs 不适用场景

**适用**：
- DeFi / NFT / 游戏：合约现成、调用频繁、用户对 gas 敏感
- 钱包 / dapp 多链支持：换 chainId + RPC 即可上线
- 需要"挂在以太坊安全模型"而不是独立 PoS 共识的应用
- 高频交互：trusted state 秒级，体感接近 Web2

**不适用**：
- 想跑非 EVM 字节码（Move / WASM）→ 看 [[scroll]] 也不行，要改用 Sui / Aptos
- 不能容忍 verified state 延迟到 1 小时的跨链桥（要靠乐观挑战 + 流动性 LP 提前出款）
- 想自己跑全套基础设施但只有几张卡 → prover 要求过高
- 极小预算实验项目：上 L1 测试网或 [[arbitrum]] 等 optimistic rollup 更便宜

## 历史小故事（可跳过）

- **2021**：Polygon 收购 Hermez（早期 zk-rollup 项目，专做支付场景）
- **2022-07**：Polygon 公布 zkEVM 路线图，喊出 "EVM 等价" 口号，对标 zkSync 的 "EVM 兼容"
- **2023-03**：主网公测上线，DeFi 项目开始迁移
- **2024-08**：zkevm-node v0.7.3 发布，是 Go 实现的最后一个版本
- **2025-02**：仓库归档，团队转向基于 erigon 的 **cdk-erigon**（性能更好、更易做 CDK 多链）
- 大背景：与同期的 zkSync Era（2023-03）、Scroll（2023-10）形成 zkEVM 三足；他们都在追"Type-1 完全等价"目标

## 学到什么

1. **链下算 + 链上验** 是 zk-rollup 的核心套路；zkEVM 的难点是把 EVM 这个"指令集复杂度极高的虚拟机"塞进电路
2. **EVM 等价 vs 兼容** 是工程取舍：等价让生态零成本迁移，但电路约束更难写
3. **finality 不是单一概念**：trusted / virtual / verified 三档，业务层要按风险挑用哪档
4. 一个项目从 v0 到 archived 只要 2 年，**仓库选型要看活跃度**，不能只看明星名字

## 延伸阅读

- 官方文档：[Polygon zkEVM Docs](https://docs.polygon.technology/zkEVM/)（含 architecture / chain spec）
- 后继实现：[cdk-erigon](https://github.com/0xPolygonHermez/cdk-erigon)（zkevm-node 之后的方向）
- 论文式讲解：[Vitalik — Different types of ZK-EVMs](https://vitalik.eth.limo/general/2022/08/04/zkevm.html)（讲 Type 1-4 等价度光谱）
- [[zk-snark]] —— zk 证明的数学基础
- [[arbitrum]] —— 同为 L2 但走 optimistic rollup 路线，对照看
- [[scroll]] —— 另一条 zkEVM，目标 Type-1 等价

## 关联

- [[arbitrum]] —— 同为以太坊 L2，但用乐观证明而非 zk 证明，挑战期 7 天
- [[optimism]] —— Optimistic rollup 代表，OP Stack 与 Polygon CDK 是两套 L2 元框架对手
- [[scroll]] —— 另一家 zkEVM，目标更激进的 Type-1（连 hash 函数都和 L1 一样）
- [[zk-snark]] —— zkEVM 用的证明系统（PLONK / STARK 系）属于 zk-snark 大家族
- [[uniswap-v3]] —— 典型"L1 合约直接搬过来"的 DeFi 用户，验证 EVM 等价好用
- [[ethereum]] —— L1 验证合约就部署在以太坊，安全性继承自此
- [[circom]] —— 写 zk 电路的常用 DSL，和 zkProver 的电路语言是同类工具

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[bunz-bulletproofs-2018]] —— Bulletproofs 2018：不用可信仪式的短范围证明
- [[zk-snark]] —— zk-SNARK 零知识证明
- [[cairo-lang]] —— Cairo — Starknet 的 zk 友好编程语言
- [[layerzero]] —— LayerZero V2 — 让一条链上的合约能给另一条链上的合约发消息
- [[zksync-era]] —— zkSync Era — Matter Labs 的 zkEVM L2
