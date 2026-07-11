---
title: Scroll — 字节码级 zkEVM
来源: 'https://github.com/scroll-tech/scroll'
日期: 2026-05-30
分类: blockchain
难度: 中级
---

## 是什么

Scroll 是一条**用零知识证明给以太坊主网"交作业"的 L2 链**——把昂贵的主网交易先搬到便宜的 L2 上跑，跑完附一份"我没作弊"的数学证明发回主网，主网验完就接受新状态。

日常类比：主网像**一个学校的总教务处**——所有成绩都要它盖章才算数，但教务处一周只上班一天。Scroll 像**校外的快速辅导班**——学生在辅导班做完作业，老师不用把每张卷子带回教务处批，只需带一张"我们 1000 份作业全对"的密封证书；教务处验完证书就给所有人盖章。证书一过，分数立刻生效。

Scroll 的关键词是 **zkEVM** — "zero-knowledge EVM"。它把 EVM 每条字节码都翻译成可以用零知识证明覆盖的"算术约束"，所以你写的 Solidity 合约**一行不改**就能跑。

## 为什么重要

不理解 Scroll，下面这些事都没法解释：

- 为什么有些 L2 提现要 7 天（[[arbitrum]]、[[optimism]]），Scroll 不用——因为 zk 证明不留挑战期
- 为什么 zkEVM 比 ZK-Rollup 这个词更晚出现——专用 ZK 链不兼容 EVM，要把 EVM 整个塞进证明系统是 2022 年后的工程突破
- 为什么 Scroll 跑 prover 要一柜 GPU——电路有几亿个约束，CPU 算到天荒地老
- 为什么 EVM 兼容会分 Type 1 / Type 2 / Type 3——每一档对应的"和主网一致"程度不同，做证明的难度也不同

## 核心要点

Scroll 的设计可以拆成 **三个关键决定**：

1. **bytecode-equivalent zkEVM 电路**：每条 EVM opcode（ADD、SLOAD、CALL 等）都有对应的算术电路。合约不用改，编译产物也不用改，主网跑什么 L2 就跑什么。类比：以前的 ZK 链像"国际学校"——必须用它的语言；Scroll 像"装了同声传译的普通学校"——你说中文系统自动翻成证明语。

2. **状态树：早期 zk-trie → Euclid 后回到 MPT**：主网上线时用 **zk-trie**（Poseidon + 二叉）换掉慢电路里的 Keccak MPT，证明更快但 `eth_getProof` 格式和主网不同。**2025-04 Euclid** 换 OpenVM 后，证明 MPT 变得可行，Scroll **弃用 zk-trie、改回以太坊 MPT**——读旧文档时别把 zk-trie 当现行默认。

3. **三层节点 + GPU prover**：Sequencer 排序交易、Execution Node 跑 EVM、Rollup Node 攒批写主网；最重的"生成证明"交给独立的 GPU Prover 集群，由 Coordinator 调度。Euclid 后电路从专用 Halo2 迁到 **OpenVM**（RISC-V zkVM），三层骨架仍在。

三件事让 Scroll 既"和主网长得一样"又"能在合理时间出证明"。

## 实践案例

### 案例 1：把一份合约部署到 Scroll

合约源码**不改一行**，只换 RPC：

```bash
# 部署到主网
forge create MyContract --rpc-url https://eth.llamarpc.com --private-key $PK

# 部署到 Scroll mainnet
forge create MyContract --rpc-url https://rpc.scroll.io --private-key $PK
```

**逐部分解释**：

- `forge create` 是 [[foundry]] 的部署命令，主网和 L2 完全一样
- 唯一差别是 `--rpc-url`——指向不同链的入口
- 钱包、ABI、字节码都不变；这就是 bytecode-equivalent 的好处

### 案例 2：一笔交易在 Scroll 链路里走的全流程

```
你 → Sequencer（排序）→ Execution Node（跑 EVM，出新状态）
   → Rollup Node（攒一批 → 写主网 calldata）
   → Coordinator → Prover（GPU 算证明）
   → 主网 Verifier 合约（一次验证整批）
```

**逐部分解释**：

- Sequencer 1-3 秒给你"软确认"——这时只是 L2 内排好了序
- Execution Node 真跑你的合约，更新状态根（Euclid 后为 MPT；早期文档仍可能写 zk-trie）
- Rollup Node 把这一批交易压缩后写回主网（这一步交易"上链"但还没"被证明"）
- Prover 集群算几十分钟到几小时，证明生成后主网验证，状态根才"硬确认"——这时才能安全提现

### 案例 3：从 Scroll 提现 ETH 回主网

```
你在 L2 调 withdraw → 这笔交易进 batch
   → batch 等 prover 出证明（数小时）
   → 主网 Verifier 合约验证 → 状态在 L1 更新
   → 你在 L1 调 claim → 收到 ETH
```

和 [[arbitrum]] 的对比一目了然：OR 是"先放行 → 等 7 天没人挑战"；ZK 是"等证明 → 放行"。OR 的 7 天是结构性的，Scroll 的几小时只受 prover 算力限制——证明一过就立刻安全。

## 踩过的坑

1. **以为 zkEVM 完全等于 EVM**：bytecode-equivalent ≠ 完全一致。Scroll 在历次主网升级里对 PUSH0、某些预编译、gas 计费有过临时差异；迁合约前要看官方升级公告，否则部署上去某条 opcode 报 panic。

2. **以为 zk 提现立刻到账**：证明生成本身要算几十分钟到几小时，主网验证 + finalize 还有窗口。比 OR 的 7 天快很多，但不是即时——新人常以为"按一下 withdraw 就到了"。

3. **把 sequencer 当去中心化**：Scroll 早期 sequencer 单点（项目方自营），它能审查或重排你的交易。zk 证明保证的是"状态算得对"，不保证"谁都能上车"——抗审查要等 sequencer 去中心化（在 roadmap 里）。

4. **状态树升级会弄断旧集成**：Euclid 前靠 zk-trie proof 的桥/轻客户端必须迁移；升级后对齐 MPT，仍要核对 Scroll 与主网在预编译、gas、proof 字段上的残余差异，别假设 `eth_getProof` 字节级一致。

## 适用 vs 不适用场景

**适用**：

- 普通 DeFi / NFT / 游戏合约——EVM 兼容，gas 便宜 90%+
- 需要快速终局性的应用（不能等 OR 7 天）——证明一过就安全
- 主网级安全 + 低 gas 的散户高频交易、链上游戏

**不适用**：

- 需要即时确认（毫秒级）的场景——sequencer 软确认 1-3 秒已经是上限
- 极端依赖某条主网 opcode 精确语义的合约——bytecode-equivalent 有少数边界差异
- 要主网级抗审查的关键交易——sequencer 单点期间不行
- prover 成本敏感的高频小额场景——单笔分摊证明费在 batch 不满时不便宜

## 历史小故事（可跳过）

- **2021 年**：Ye Zhang、Sandy Peng 等创立 Scroll，最初和以太坊基金会的 PSE 团队合作做 zkEVM 研究
- **2022 年**：发布 Pre-Alpha 测试网，跑通字节码级 zkEVM 的第一版电路（基于 Halo2）
- **2023 年 2 月**：Alpha 测试网上线，第一次把"完整 EVM + zk 证明"做到端到端
- **2023 年 10 月**：主网正式上线，主打 bytecode-equivalent zkEVM（同期还有 Polygon zkEVM 等，定位不完全相同）
- **2025 年 4 月**：Euclid 升级：prover 换 OpenVM，状态承诺从 zk-trie 迁回 MPT，方向从"专用电路"转向"通用 zkVM"

## 学到什么

1. **zkEVM 是工程胜利**：把整个 EVM 装进证明系统是上百万行代码 + 几亿约束的工程，不是单纯密码学突破
2. **OR vs ZK 是路线选择**：OR 假设诚实 + 7 天反悔；ZK 每批附证明 + 几小时终局。安全模型不同，体验也不同
3. **bytecode-equivalent 是 EVM 兼容的最高梯度**：开发者无感迁移，代价是电路复杂度暴涨
4. **GPU prover 是 ZK 链的隐藏工程**：链上看不见，但没它整条链跑不动；这是 ZK 路线的真正成本中心
5. **抽象 vs 兼容会随升级翻转**：早期 zk-trie 用证明性能换 proof 格式一致；Euclid 证明能力上来后又迁回 MPT——工程权衡不是一次性写死的

## 延伸阅读

- 官方文档：[Scroll Architecture](https://docs.scroll.io/en/technology/)（三层架构 + 升级路线）
- zkEVM 综述：[Vitalik — Different types of ZK-EVMs](https://vitalik.eth.limo/general/2022/08/04/zkevm.html)（Type 1-4 分类的源头）
- 视频：[Ye Zhang — Scroll zkEVM Design Talk](https://www.youtube.com/watch?v=W2HeOcOnwPM)
- Halo2 教程：[ZCash Halo2 Book](https://zcash.github.io/halo2/)（Scroll 早期电路就在 Halo2 上写的）
- 底层：[[zk-snark]] —— Scroll 证明系统的密码学基石
- 兄弟项目：[[arbitrum]] —— 同样做 L2，走 Optimistic 路线对照参考

## 关联

- [[arbitrum]] —— Optimistic Rollup 代表，对比 zk vs OR 两条路线
- [[optimism]] —— 另一条 OR，Cannon MIPS 欺诈证明 vs Scroll 的 zk 电路
- [[go-ethereum]] —— Scroll 的 EVM 行为以 Geth 为基准对齐
- [[zk-snark]] —— Halo2 是 Scroll 早期电路用的 zk-SNARK 体系
- [[uniswap-v3]] —— Scroll 上 TVL 最高的 DEX，是 zkEVM 实战压力测试主力
- [[foundry]] —— 部署 / 测试合约的工具链，对 Scroll RPC 原生支持
- [[remix-ide]] —— 浏览器 IDE，可直接连 Scroll RPC 部署合约

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[arbitrum]] —— Arbitrum Nitro — Offchain Labs 的 Optimistic Rollup 客户端
- [[foundry]] —— Foundry — Paradigm 出品的 Rust 合约工具链
- [[go-ethereum]] —— Go-Ethereum (Geth) — 以太坊主流 Go 客户端
- [[optimism]] —— Optimism — 以太坊 L2 旗舰栈，把交易搬到便宜车道再回主网结算
- [[polygon-zkevm]] —— Polygon zkEVM — 用零知识证明给以太坊扩容
- [[remix-ide]] —— Remix IDE — 浏览器内 Solidity IDE
- [[uniswap-v3]] —— Uniswap V3 — 集中流动性 AMM 核心合约
- [[zk-snark]] —— zk-SNARK 零知识证明
- [[zksync-era]] —— zkSync Era — Matter Labs 的 zkEVM L2

