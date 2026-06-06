---
title: "Halo: Recursive Proof Composition without a Trusted Setup"
来源: 'Halo: Recursive Proof Composition without a Trusted Setup'
日期: 2026-06-06
分类: 安全与隐私
子分类: 安全与隐私
难度: 高级
provenance: pipeline-v3
---

## 是什么

**Halo: Recursive Proof Composition without a Trusted Setup** 提出：Halo：无 SRS 的递归 SNARK 组合。

日常类比：像证明套证明，层层打包还不换秘密参数。

读论文时先抓「威胁模型/假设→核心构造→复杂度/开销」三件事。

## 为什么重要

- Zcash Orchard 核心
- 递归组合省验证成本
- 链 PLONK/STARK
- 移动链轻客户端

## 核心要点

1. **问题设定**：作者要解决什么不可能三角（安全/性能/易用）。
2. **关键技巧**：一个构造或定理把难题拆成可实现步骤。
3. **安全假设**：信任根、敌手能力、失败概率。
4. **工程映射**：开源库与 RFC 如何落地论文思想。
5. **局限**：已知攻击面、参数选取、未来工作。

## 实践案例

### 案例 1：画威胁模型表

列：资产、敌手、能力、目标；对照论文假设勾选覆盖项。

### 案例 2：找开源实现

```bash
# 搜索论文标题 + library 名称，读 README 的 security note
```

### 案例 3：与邻居论文对照

阅读 [[gabizon-plonk-2019]]，画时间线：哪篇解决 setup/性能/证明长度。

### 案例 4：面试复述

用「类比 + 三要点」在 2 分钟内讲清；准备一条「为什么不用更简单方案」。

### 案例 5：与双千 atlas 交叉阅读

在 `papers-atlas` 找同子类 1 篇，对比实践案例是否覆盖实验/参数/失败模式。

## 踩过的坑

1. **把理想模型当产品默认**：论文参数在工业界常被放宽。
2. **忽略组合开销**：多个原语组合时安全界不是简单相加。
3. **误读实验规模**：小数据集上的 ε 不可直接外推。
4. **混淆相似缩写**：如 DP/LDP、SNARK/STARK 场景不同。
5. **行数与模板**：交付前用 quality-gate 扫一遍。

## 适用 vs 不适用场景

**适用**：
- 安全/系统/architecture 面试深挖
- 选型隐私或密码组件前的理论扫盲
- 读源码前的概念地图

**不适用**：
- 不做威胁建模直接上生产
- 替代官方标准文本（FIPS/RFC）
- 数学证明细节（请读原文附录）

## 历史小故事（可跳过）

- 论文常是多年社区实践的第一次形式化。
- 标准机构（NIST/IETF）往往在论文后收敛算法名。
- 开源实现与论文版本存在参数漂移，以 release 为准。
- 近年与 ML、TEE、区块链场景强交叉。

## 学到什么

- 安全方案先问威胁模型，再问漂亮数学。
- 工程落地看常量与实现漏洞，不只看渐近复杂度。
- 论文链式阅读比单篇精读更高效。
- 与站内 neighbors 互链能形成可复习的知识图。
- Halo 证明：trusted setup 不是 SNARK 的本质需求，而是早期构造的工程取舍。
- Accumulation scheme 将验证器工作批量化，是递归证明链实用化的关键抽象。

## 核心算法细节

### Inner Product Argument（IPA）

Halo 的核心原语是 Bulletproofs 中的内积论证（IPA），但在椭圆曲线 Pasta（Pallas/Vesta）上实现：

给定向量 **a**、**b** 和承诺 `C = <a,G> + <b,H> + <a,b>·Q`，IPA 在不透露 **a**、**b** 的情况下证明内积 `<a,b> = z`：

1. 证明者与验证者交互 `log n` 轮，每轮将向量折半
2. 最终只需发送 2 个域元素，验证者工作量 O(n)
3. 无需可信设置：生成元 G、H、Q 可公开推导（hash-to-curve）

### Accumulation Scheme（累积方案）

传统递归 SNARK 要求在电路内验证一个 SNARK，电路开销极大。Halo 引入 accumulation scheme：

- **Accumulate**：将多个 IPA 实例合并为一个 "累积器"，暂缓昂贵的最终验证
- **Decide**：只在链的终点（或批量点）调用一次完整 IPA 验证
- 每个证明步骤只需验证 accumulator 更新的正确性，成本远低于完整验证

### 双曲线配对与 Pasta 曲线族

Halo 使用 Pallas/Vesta 两条曲线互为对方的基域：
- Pallas 的标量域 = Vesta 的基域
- 交替在两条曲线上证明，避免配对开销
- Halo 2（升级版）用此实现深度无限的递归

### 为何不需要 Trusted Setup

PLONK/Groth16 依赖 KZG 多项式承诺，需要"有毒废料"（structured reference string）。Halo 用 IPA 替代 KZG：
- IPA 承诺的安全性仅依赖椭圆曲线离散对数
- 生成元可从公开字符串 hash 得到，任何人可验证

## 工程实现要点

- **halo2 库**：Zcash 基金会开源的 Halo 2 实现（Rust），已用于 Orchard shielded 协议
- **Pasta 曲线**：`pasta_curves` crate 提供高性能实现，Pallas 在 M1 上约 80µs/scalar mul
- **电路约束系统**：halo2 采用 PLONKish 算术化，自定义门（custom gate）可大幅减少约束数量
- **proof aggregation**：可将数千个独立证明聚合成一个，轻客户端只需验证聚合证明
- **Zcash Orchard**：2021 年 NU5 升级引入 Halo 2，消除了 Sapling 时期的 Groth16 可信初始化依赖

## 延伸阅读

- 原文：https://eprint.iacr.org/2019/1021
- [[gabizon-plonk-2019]]
- [[ben-sasson-stark-2018]]

## 关联

- [[gabizon-plonk-2019]] —— 同路线前后文
- [[ben-sasson-stark-2018]] —— 同路线前后文

## 维护备注

- 引用格式保持单引号包裹 `来源` 字段。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[ben-sasson-stark-2018]] —— Scalable, Transparent, and Post-Quantum Secure Computational Integrity
- [[bunz-bulletproofs-2018]] —— Bulletproofs: Short Proofs for Confidential Transactions and More
- [[gabizon-plonk-2019]] —— PLONK: Permutations over Lagrange-bases for Oecumenical Noninteractive arguments of Knowledge

