---
title: zk-SNARK 零知识证明
来源: 'Groth, "On the Size of Pairing-Based Non-interactive Arguments", Eurocrypt 2016'
日期: 2026-05-29
分类: 密码学
难度: 中级
---

## 是什么

zk-SNARK 是一种密码学证明：让 Prover（证明者）向 Verifier（验证者）证明"我知道某个秘密"或"某条件成立"，但**不泄露秘密本身**，且证明很短（约 200 字节）。

日常类比：你跟朋友说"我能解开这个密码锁"——朋友想确认你没吹牛，但你不想告诉他密码。你怎么证明？

zk-SNARK 给一个工程化答案：你交给朋友一张"证明卡片"，他花 0.1 秒读完就能确认你能解锁，但这张卡片里完全没有密码的影子。

名字拆开看：

- **zk**：zero-knowledge，零知识——验证者除"陈述为真"外什么都学不到
- **S**：succinct，证明短到几百字节、验证快到毫秒级
- **N**：non-interactive，单条消息搞定，不用反复问答
- **AR**：argument，在密码学假设下安全（不是无条件安全）
- **K**：of knowledge，证明 Prover 真"知道"那个秘密（不只是声称存在）

## 为什么重要

不理解 zk-SNARK，下面这些都解释不通：

- **zkRollup**（zkSync / Starknet / Polygon zkEVM）每秒处理几千笔交易、Gas 费降到几分之一——靠的就是把一批交易压成一个 200 字节的证明，L1 验证一次就行
- **隐私支付**（Tornado Cash / Aztec）链上转账金额可以隐藏，但仍能证明"账目守恒、没有凭空印钱"
- **AI 模型验证（zkML）**：证明"这个输出确实是模型 A 算出来的"而不暴露权重
- **匿名投票 / 身份验证 / 跨链桥**：证明属性（"我满 18 岁"/"在白名单"）而不暴露身份

一句话：zk-SNARK 把 1985 年纸面上的理论，变成 2016 年起每天在以太坊上跑的基础设施。

## 核心要点

zk-SNARK 的三大性质（每个都不能丢）：

1. **完备性（Completeness）**：陈述真的，验证一定通过
2. **可靠性（Soundness）**：陈述假的，验证几乎不可能通过（攻击者要破解某个公认密码学假设才行）
3. **零知识（Zero-Knowledge）**：验证者除"陈述为真"外学不到任何关于秘密的信息

工作流分三阶段：

```
Setup（一次性可信仪式）
  生成 (EK, VK)，分发给 Prover 和 Verifier
  用过的随机数必须销毁 —— 所谓 "toxic waste"

Prove（每次有新陈述时跑一次）
  Prover 用 EK + 秘密 w 生成证明 π（约 200 字节）
  这一步慢：10^6 约束要几分钟、吃几十 GB 内存

Verify（每次验证）
  Verifier 用 VK + 公开输入 + π，跑几次双线性配对
  毫秒级，且与电路大小无关
```

**核心抽象**：把"程序 C(x, w) = 1"翻译成"多项式恒等式存在解"。这一步叫 R1CS（Rank-1 Constraint System）→ QAP（Quadratic Arithmetic Program）转换。

## 实践案例

### 案例 1：toy 例子——证明"我知道 x 满足 x³ + x + 5 = 35"

把表达式拆成单步乘法（这是 R1CS 的核心要求——每条约束最多一次乘法）：

```
y = x · x         约束 1
z = y · x         约束 2  （此时 z = x³）
out = z + x + 5   约束 3  （out 应等于 35）
```

Prover 知道 x = 3 → 算出 (y, z, out) = (9, 27, 35) → 生成证明。Verifier 不知道 x 是几，只验证多项式恒等式成立。

### 案例 2：Groth16 的工程数字

Groth 2016 把证明压到极致：

- **证明大小**：3 个群元素，约 192 字节（一条短信的体积）
- **验证时间**：约 1.5 毫秒
- **验证只看 3 次配对运算**：`e(A, B) = e(α, β) · e(L, γ) · e(C, δ)`

代价：Prover 仍然慢、需要 per-circuit trusted setup、安全性基于"通用群模型"+ 一个非标准假设。但对 Zcash / Tornado Cash 这种"电路固定"的场景，这权衡很划算。

### 案例 3：zkVM——把任意程序变成 zk 证明

新一代项目（Risc0 / SP1）让你**直接写 Rust / C 代码**，编译到 RISC-V 字节码，然后让 zkVM 给整个执行 trace 生成 zk 证明：

- 你写 `fn fib(n: u32) -> u32 { ... }`
- zkVM 跑出结果 + 一个证明
- 任何人验证："这个函数确实按代码跑出来了，没作弊"

这把 zk 从"密码学家专用"推到"普通开发者也能用"。代价是 Prover 比直接计算慢约 100~1000 倍。

## 踩过的坑

1. **Trusted setup 是软肋**：Groth16 的 setup 会用到秘密随机数。泄露 = 攻击者能伪造任意证明。Zcash 搞过多人 ceremony（"只要 1 人诚实就安全"），但你怎么验证有人真销毁了硬盘？2019 年有参与者公开承认旧硬盘没销毁。Plonk / Halo2 用 universal setup 或无 setup 缓解这个问题。

2. **Prover 极慢且吃内存**：一笔交易的证明要几秒到几分钟。10⁶ 约束的电路 Prover 要 16-64 GB 内存。这是高频交易、实时游戏、大模型推理至今没法上 zk 的根本原因。

3. **电路表达力受限**：算术电路里没有 if-else（要把两个分支都算）、没有 while（要 unroll 到固定大小）、没有动态内存（用 Merkle tree 模拟）。一个 SHA-256 约 27000 约束、一个 EVM 交易约 10⁶ 约束。

4. **工具链生态分裂**：circom / R1CS / snarkjs / Halo2 / Noir / Cairo 五个生态不互通。学会一个不能直接迁到另一个，每个 zkRollup 都有自己的 prover、自己的 setup、自己的开发者文化。

## 适用 vs 不适用场景

**适用**：

- 计算可验证外包（client 让 cloud 跑算法，不想信任 cloud 没作弊）
- 隐私保护应用（链上支付、匿名投票、属性证明）
- L2 扩容（zkRollup：把 1000 笔交易压成一个证明，丢回 L1）
- 跨链桥（用 zk 证明源链状态，不依赖第三方多签）

**不适用**：

- Prover 延迟敏感的场景（毫秒级响应要求）
- 大模型实时推理（zkML 还在早期，慢 1000 倍以上）
- 资源受限设备做 Prover（手机不太行，要靠专用 GPU farm）
- 不能容忍密码学假设破解风险的场景（量子计算威胁部分 SNARK 方案）

## 历史小故事（可跳过）

- **1985**：Goldwasser-Micali-Rackoff 提出 ZKP 概念。三人后来都拿了图灵奖。但当时验证一个简单声明要花几分钟，纯理论玩具。
- **2010**：Groth-Sahai 把 pairing-based 零知识证明推进一步，但还不实用。
- **2013**：Pinocchio（Microsoft Research）做出第一个工程级系统：证明 288 字节、验证 9 毫秒。从理论到工业的引爆点。
- **2016**：Groth16（本笔记论文）把证明压到 3 个群元素、192 字节。Zcash 直接采用，至今仍是最被部署的版本之一。
- **2019**：Plonk 引入 universal setup——一次仪式所有电路共用。zkSync / Polygon zkEVM 大规模采用。
- **2020**：Halo / Halo2 实现无 trusted setup + 递归证明。
- **2022 起**：Risc0 / SP1 zkVM 把 zk 推向通用计算，开发者门槛大幅降低。
- **2024 起**：STARK + zkEVM 主流化，以太坊 L2 大半依赖 zk。

四十年从"理论可能"到"每天数千万笔交易跑在上面"。

## 学到什么

1. **零知识不是"什么都不知道"**——而是"除了陈述本身正确以外什么都不知道"。这个边界很微妙，决定了 zk 的应用边界
2. **succinct 是关键卖点**：证明短 + 验证快 ≠ 生成快。整个产业链就建在"Prover 受累、Verifier 享福"这个不对称上
3. **工程突破比性能调参影响深远**：Groth16 没发明新数学，但把"理论可能"压到"工业可用"，催生整个 L2 / 隐私链生态
4. **理论 → 工程 → 普及** 各隔约 15 年：1985 → 2013 → 2020s。值得长期跟踪的赛道往往就在这个时间轴上

## 延伸阅读

- Vitalik 的 zk-SNARK 三部曲：[vitalik.eth.limo/zk_snarks](https://vitalik.eth.limo/general/2017/01/14/zk_snarks.html)（中文圈最佳入门）
- Justin Thaler《Proofs, Arguments, and Zero-Knowledge》（2023 免费教科书，现代综述）
- Dan Boneh Stanford CS 251 公开课（密码学 + 区块链）
- Pinocchio 原文：[eprint.iacr.org/2013/279](https://eprint.iacr.org/2013/279)（从工程视角读最早的 zk-SNARK 实现）

## 关联

- [[godel-1931]] —— 数理逻辑根基；零知识的"模拟器"论证范式与不完备性的反证逻辑相通
- [[cook-levin]] —— NP-完全性；zk-SNARK 通常用于证明 NP 语言的成员资格
- [[turing-1936]] —— 可计算性；zkVM 把任意可计算函数变成可证明对象

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[arbitrum]] —— Arbitrum Nitro — Offchain Labs 的 Optimistic Rollup 客户端
- [[argent-x]] —— Argent X — 让账户本身就是一个合约的 Starknet 钱包
- [[cairo-lang]] —— Cairo — Starknet 的 zk 友好编程语言
- [[cook-levin]] —— Cook-Levin 定理 — NP-完全性的诞生
- [[dwork-calibrating-noise-2006]] —— 校准噪声 — 往统计结果里加多少噪音才能保护隐私
- [[dwork-dp-icalp-2006]] —— 差分隐私 — 让统计结果有用但查不到任何一个人
- [[godel-1931]] —— Gödel 1931 — 不完备性定理
- [[polygon-zkevm]] —— Polygon zkEVM — 用零知识证明给以太坊扩容
- [[scroll]] —— Scroll — 字节码级 zkEVM
- [[turing-1936]] —— Turing 1936 可计算性

