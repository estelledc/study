---
title: Halo 2019 — 不靠可信仪式递归压缩证明
来源: 'Sean Bowe, Jack Grigg & Daira Hopwood, "Recursive Proof Composition without a Trusted Setup", IACR ePrint 2019/1021, 2019, https://eprint.iacr.org/2019/1021'
日期: 2026-07-07
分类: security-privacy
难度: 高级
---

## 是什么

Halo 是一种让零知识证明“证明另一个零知识证明也正确”的递归 SNARK 技术。

日常类比：你不想每天把一整箱发票重新查一遍，就让今天的审计报告引用昨天的审计报告，再补上今天新增的几张发票。只要今天这份报告可信，前面一长串历史也被一起带上了。

放到密码学里，证明者每次生成一个新证明时，把“上一个证明通过验证”也写进当前证明要证明的事情里。这样验证者不用下载和验证所有历史证明，只看最新的一份证明，就能相信一大串计算都接上了。

这篇 2019 年论文的关键突破是：以前实用递归证明通常要 trusted setup 和昂贵的 pairing-friendly 椭圆曲线；Halo 给出一个实际可运行的方案，只依赖普通椭圆曲线上的离散对数假设。

## 为什么重要

不理解 Halo，下面这些事会很难解释：

- 为什么“证明很短、验证很快”还不够，区块链同步仍然可能被历史数据拖垮。
- 为什么 trusted setup 被叫做“毒废料”风险：如果隐藏参数泄露，攻击者可能伪造证明。
- 为什么递归 SNARK 会被用来讨论轻客户端、证明聚合、succinct blockchain。
- 为什么 Zcash 后来把 Orchard 迁到 Halo 2 / Pasta 曲线，而不是继续只依赖 Groth16。

一句话：Halo 让“把很多证明叠成一个证明”这件事，第一次在无 trusted setup 路线上看起来足够实用。

## 核心要点

1. **递归证明组合**：像把每天的账本结论盖在下一天账本首页。当前证明验证上一个证明，再证明新的状态转移，于是最新证明代表整条链的历史。

2. **嵌套摊销**：像把每次都很贵的总复核先记账，等最后合并检查一次。Halo 不让递归电路完整执行所有线性成本验证，而是把内积论证里的重活折叠到下一轮。

3. **无 trusted setup**：像不用一次秘密开模的印章，而用公开规则和普通难题来保证没人留后门。Halo 的多项式承诺来自内积论证和离散对数假设，不需要带隐藏结构的 SRS。

4. **曲线成环**：像两种语言互相当翻译。曲线 A 的证明在曲线 B 的电路里好验证，曲线 B 的证明又回到曲线 A，递归才不会被“错误的有限域”拖死。

## 术语小地图

- **SNARK**：短证明。验证者不用重跑整个计算，只验证一小段证明材料。
- **递归**：当前证明把“旧证明有效”当作自己要证明的一部分。
- **trusted setup**：启动时生成公共参数的仪式；若秘密随机数没销毁，系统可靠性会出问题。
- **inner product argument**：内积论证。Halo 用它构造多项式承诺，并把昂贵验证摊销掉。
- **curve cycle**：两条椭圆曲线的标量域和基域互相配合，方便在电路里验证对方的群运算。
- **Halo 2**：后续工程化证明系统，吸收 PLONKish 算术化，用于 Zcash Orchard；它不是这篇论文的同一套协议原样部署。

## 实践案例

### 案例 1：把整条区块链历史压进最新证明

```text
old_proof = proof(state_0 -> state_999)
new_step = verify_tx(block_1000)
new_proof = prove(verify(old_proof) && new_step)
```

逐部分解释：

- `old_proof` 代表前 999 个状态转移已经被证明过。
- `new_step` 是第 1000 个区块或交易批次的本地规则检查。
- `new_proof` 同时证明旧证明有效和新增步骤有效，验证者只保留最新证明。

### 案例 2：把昂贵验证延后摊销

```text
claimed = prover_says(expensive_check(input))
statement = include(input, claimed)
next_proof = prove(statement && fold_with_previous_claim())
```

逐部分解释：

- 递归电路先不完整执行 `expensive_check`，否则证明里会塞进线性成本。
- 证明把输入和声称输出公开绑定，防止下一轮随便改口。
- 后续证明不断折叠这些声明，最后只做一次足够强的随机检查。

### 案例 3：理解 Orchard 里 Halo 2 的边界

```text
orchard_action_bundle -> halo2_proof
zcash_node verifies halo2_proof
recursive_feature = reserved_for_future_upgrades
```

逐部分解释：

- Orchard 交易把多个 action 放进一个 bundle，用一份 Halo 2 证明覆盖。
- 节点验证这份证明是共识规则的一部分，所以 Halo 2 已经进入 Zcash 协议核心。
- 但 ZIP 224 明确说 Orchard 当前没有使用 Halo 2 的递归证明能力，这个边界不能混淆。

## 踩过的坑

1. **把 Halo 理解成“零知识证明本身”**：原因是 Halo 关注递归组合和承诺验证摊销，底层仍要搭配具体证明系统。

2. **以为无 trusted setup 等于无公共参数**：原因是协议仍需要公开生成元、曲线、哈希等参数，只是没有必须销毁的秘密结构。

3. **把 Halo 2019 和 Halo 2 画等号**：原因是 Halo 2 是后续工程系统，采用 PLONKish 算术化和 Pasta 曲线，不是论文协议逐字落地。

4. **说 Orchard 已经使用递归证明**：原因是 Orchard 使用 Halo 2 proving system，但 ZIP 224 明说递归能力留给未来升级。

## 适用 vs 不适用场景

**适用**：

- 需要把许多证明聚合成一个证明的链上或链下系统。
- 不能接受 per-circuit trusted setup 风险的隐私协议。
- 希望未来支持轻客户端、快速同步、证明携带数据的系统。
- 团队有能力审计椭圆曲线、transcript、约束系统和实现细节。

**不适用**：

- 只需要一次性小证明，递归和摊销的复杂度可能不划算。
- 追求最小单笔证明体积且能接受 trusted setup 的固定电路场景。
- 不能接受椭圆曲线离散对数假设的长期风险场景。
- 初学者直接照论文实现生产协议；这类密码工程必须依赖成熟库和审计。

## 历史小故事（可跳过）

- **2008 年**：Paul Valiant 提出 incrementally verifiable computation，让证明递归验证旧证明的想法成型。
- **2014 年**：BCTV 用椭圆曲线 cycle 做 scalable zero knowledge，但依赖 trusted setup 和 pairing-friendly 曲线。
- **2016 年**：Groth16 变成实用短证明代表，Zcash Sapling 也沿用 pairing-based SNARK 路线。
- **2019 年 9 月**：Bowe、Grigg、Hopwood 发布 Halo，展示无 trusted setup 的实用递归证明组合。
- **2020 年后**：Halo 2 转向更工程化的 PLONKish 路线，并为 Zcash Orchard 的无 trusted setup shielded pool 铺路。

## 和 Zcash Orchard 的关系边界

这篇 Halo 论文来自 Electric Coin Company 背景，目标之一就是解决 Zcash 长期面对的两个问题：trusted setup 风险，以及未来扩展性不足。

但是要分清三层：

- **Halo 2019**：研究论文，提出递归 proof composition without trusted setup 的路线和嵌套摊销技巧。
- **Halo 2**：后续 Rust 工程实现和证明系统，结合 PLONKish arithmetization、Pallas / Vesta Pasta 曲线。
- **Orchard**：Zcash 的新 shielded protocol；ZIP 224 是 consensus 类 ZIP，规定 Orchard 使用 Halo 2 证明系统，但当前不使用递归证明。

所以“ Halo 2 是 Zcash Orchard 共识层核心”可以说，因为节点要按协议验证 Orchard 的 Halo 2 proof；“Halo 2019 的递归能力已经在 Orchard 主网上启用”则不能这么说。

## 学到什么

1. 递归证明的价值不是“证明里再塞证明”这么炫，而是让验证成本不随历史线性增长。
2. trusted setup 的问题不只是麻烦，而是会影响货币系统的伪造风险和升级成本。
3. Halo 的精妙处在摊销：把每层递归都做不起的重检查，变成跨层共享的一次检查。
4. 曲线选择不是论文脚注；能不能在电路里高效验证另一条曲线，决定递归能不能实用。

## 延伸阅读

- 论文页面：[IACR ePrint 2019/1021](https://eprint.iacr.org/2019/1021)
- 论文 PDF：[Recursive Proof Composition without a Trusted Setup](https://eprint.iacr.org/2019/1021.pdf)
- Zcash 规范：[ZIP 224: Orchard Shielded Protocol](https://zips.z.cash/zip-0224)
- ECC 解释：[Technical explainer: Halo on Zcash](https://electriccoin.co/blog/technical-explainer-halo-on-zcash/)
- Halo 2 背景：[Explaining Halo 2](https://electriccoin.co/blog/explaining-halo-2/)
- [[zk-snark]] —— 先理解短证明和零知识，再读递归会轻松很多。

## 关联

- [[zk-snark]] —— Halo 是 SNARK 递归和无 trusted setup 路线的一次关键推进。
- [[bunz-bulletproofs-2018]] —— 同样不用 trusted setup，但验证成本和应用重点不同。
- [[gabizon-plonk-2019]] —— Halo 2 采用 PLONKish 思路，和 PLONK 家族关系很近。
- [[ben-sasson-stark-2018]] —— STARK 也是透明证明路线，可对照看证明大小和验证成本。
- [[zcash]] —— Orchard 把 Halo 2 带进 Zcash 共识规则和隐私支付工程。
- [[bitcoin]] —— 帮助理解“全节点验证整条历史”为什么会成为扩展性压力。
- [[rsa]] —— 公钥密码学基础，帮助区分加密、签名、承诺和证明系统。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
