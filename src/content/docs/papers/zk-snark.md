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

- **zkRollup**（zkSync / Polygon zkEVM 等 SNARK 系）把一批交易压成约 200 字节证明，L1 验证一次即可降 Gas（Starknet 同类思路但主路径是 STARK）
- **隐私支付**（Tornado Cash / Aztec）链上转账金额可隐藏，仍能证明"账目守恒、没有凭空印钱"
- **AI 模型验证（zkML）**：证明"这个输出确实是模型 A 算出来的"而不暴露权重
- **匿名投票 / 身份验证 / 跨链桥**：证明属性（"我满 18 岁"/"在白名单"）而不暴露身份

一句话：zk-SNARK 把 1985 年纸面上的理论，变成 2016 年后（Zcash Sapling 2018 起大规模落地）每天在链上跑的基础设施。

## 核心要点

zk-SNARK 的三大性质（每个都不能丢）：

1. **完备性（Completeness）**：陈述真的，验证一定通过。类比：真有钥匙，锁一定能开。
2. **可靠性（Soundness）**：陈述假的，验证几乎不可能通过。类比：没钥匙却开锁，概率极低。
3. **零知识（Zero-Knowledge）**：验证者除"陈述为真"外学不到秘密。类比：看你开了锁，仍不知道密码是几。

工作流分三阶段：Setup 生成密钥对 (EK, VK)（随机数须销毁，称 toxic waste）→ Prove 用 EK+秘密 w 生成约 200 字节证明 π（10⁶ 约束常要几分钟、十几 GB 内存）→ Verify 用 VK+公开输入+π 做几次配对检查，毫秒级且与电路大小无关。

**核心抽象**：先把程序拆成"每步最多一次乘法"的约束表（R1CS，像把菜谱拆成单步），再编成多项式考卷（QAP）。Verifier 的"双线性配对"像特殊验钞灯：不打开信封也能确认印章匹配。

## 实践案例

### 案例 1：证明"我知道 x 满足 x³ + x + 5 = 35"

把式子拆成单步乘法（R1CS：每条约束最多一次乘法）：

```
y = x · x         # 约束 1
z = y · x         # 约束 2 → z = x³
out = z + x + 5   # 约束 3；公开要求 out == 35
```

**逐部分解释**：公开输入 `out=35`；私密见证 `x=3`；中间值 `y=9, z=27`。Prover 交出 π；Verifier 只检查三条约束是否同时成立，看不到 x。

### 案例 2：Groth16 的 Setup → Prove → Verify

Groth 2016 把证明压到 3 个群元素（约 192 字节）：

1. **Setup**：对固定电路做可信仪式，产出 EK/VK；随机数销毁
2. **Prove**：Prover 用 EK + 见证算出 `(A, B, C)` 三点，组成 π
3. **Verify**：检查 `e(A, B) = e(α, β) · e(L, γ) · e(C, δ)`（约 3 次配对，~1.5 ms）

**逐部分解释**：A/B/C 是证明的三个"印章"；配对像验钞灯，确认印章匹配却不泄露见证。代价是 per-circuit trusted setup；电路固定时（Zcash Sapling / Tornado Cash）很划算。

### 案例 3：zkVM——任意程序变证明

```rust
fn fib(n: u32) -> u32 { /* ... */ }
// zkVM: 编译 → 跑出执行 trace → 对 trace 生成 π
assert!(verify(vk, public_n_and_out, π));
```

**逐部分解释**：你写普通 Rust；zkVM（Risc0 / SP1）记录每步 CPU 状态成 trace，再压成证明。验证者只确认"按这段代码跑出了该输出"。代价：Prover 比直接算慢约 100–1000 倍。

## 踩过的坑

1. **Trusted setup 是软肋**：Groth16 的 setup 会用到秘密随机数。泄露 = 攻击者能伪造任意证明。Zcash 搞过多人 ceremony（"只要 1 人诚实就安全"），但你怎么验证有人真销毁了硬盘？2019 年有参与者公开承认旧硬盘没销毁。Plonk / Halo2 用 universal setup 或无 setup 缓解这个问题。

2. **Prover 极慢且吃内存**：一笔交易的证明要几秒到几分钟。10⁶ 约束的电路 Prover 要 16-64 GB 内存。这是高频交易、实时游戏、大模型推理至今没法上 zk 的根本原因。

3. **电路表达力受限**：算术电路里没有 if-else（要把两个分支都算）、没有 while（要 unroll 到固定大小）、没有动态内存（用 Merkle tree 模拟）。一个 SHA-256 约 27000 约束、一个 EVM 交易约 10⁶ 约束。

4. **工具链生态分裂**：circom / R1CS / snarkjs / Halo2 / Noir / Cairo 五个生态不互通。学会一个不能直接迁到另一个，每个 zkRollup 都有自己的 prover、自己的 setup、自己的开发者文化。

## 适用 vs 不适用场景

**适用**：

- 计算可验证外包（证明约 192B、验证 1–2ms，适合"云端算、客户端验"）
- 隐私支付 / 匿名投票 / 属性证明（隐藏金额或身份，仍证守恒）
- L2 扩容（10⁵–10⁶ 约束电路把约 1000 笔交易压成一个证明回 L1）
- 跨链桥（用 zk 证源链状态，不依赖第三方多签）

**不适用**：

- Prover 要毫秒级响应（10⁶ 约束常要秒到分钟级）
- 大模型实时推理（zkML 早期，常慢 1000× 以上）
- 手机等做 Prover（常需 16–64GB 内存 + GPU farm）
- 不能接受配对型假设/量子威胁的场景（宜看 STARK 等后量子路线）

## 历史小故事（可跳过）

- **1985**：Goldwasser-Micali-Rackoff 提出 ZKP 概念。三人后来都拿了图灵奖。但当时验证一个简单声明要花几分钟，纯理论玩具。
- **2010**：Groth-Sahai 把 pairing-based 零知识证明推进一步，但还不实用。
- **2013**：Pinocchio（Microsoft Research）做出第一个工程级系统：证明 288 字节、验证 9 毫秒。从理论到工业的引爆点。
- **2016**：Groth16（本笔记论文）把证明压到 3 个群元素、约 192 字节。
- **2018**：Zcash Sapling 升级采用 Groth16，成为最早大规模部署之一。
- **2019**：Plonk 引入 universal setup；zkSync / Polygon zkEVM 等后续采用。
- **2020**：Halo / Halo2 实现无 trusted setup + 递归证明。
- **2022 起**：Risc0 / SP1 zkVM 降低开发门槛；STARK / zkEVM 在以太坊 L2 普及。

约四十年从"理论可能"到"每天大量链上交易跑在上面"。

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

- [[godel-1931]] —— 数理逻辑；零知识"模拟器"论证与反证范式相通
- [[cook-levin]] —— NP-完全性；zk-SNARK 常证 NP 成员资格
- [[turing-1936]] —— 可计算性；zkVM 把任意可计算函数变成可证明对象
- [[ben-sasson-stark-2018]] —— STARK；无 trusted setup 的对照路线
- [[polygon-zkevm]] —— 用 SNARK/STARK 给以太坊 L2 扩容的落地

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[arbitrum]] —— Arbitrum Nitro — Optimistic Rollup 客户端
- [[ben-sasson-stark-2018]] —— STARK — 不需要可信第三方的正确性证明
- [[cairo-lang]] —— Cairo — Starknet 的 zk 友好语言
- [[cook-levin]] —— Cook-Levin 定理 — NP-完全性的诞生
- [[godel-1931]] —— Gödel 1931 — 不完备性定理
- [[polygon-zkevm]] —— Polygon zkEVM — 用零知识证明给以太坊扩容
- [[scroll]] —— Scroll — 字节码级 zkEVM
- [[turing-1936]] —— Turing 1936 可计算性

