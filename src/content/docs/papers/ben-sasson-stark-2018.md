---
title: Scalable, Transparent, and Post-Quantum Secure Computational Integrity
来源: 'Scalable, Transparent, and Post-Quantum Secure Computational Integrity'
日期: 2026-06-06
分类: 安全与隐私
子分类: 安全与隐私
难度: 高级
provenance: pipeline-v3
---

## 是什么

**Scalable, Transparent, and Post-Quantum Secure Computational Integrity** 提出：STARK：透明、后量子安全的简洁证明。

日常类比：像公开抽签的审计：不要秘密仪式，用哈希承诺自证。

读论文时先抓「威胁模型/假设→核心构造→复杂度/开销」三件事。

## 为什么重要

- StarkNet/RISC Zero 根
- 无 trusted setup
- 对照 PLONK SNARK
- L2 扩容

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
- 透明设置（transparent setup）消除了 "toxic waste" 风险，使 STARK 适合无需信任第三方的公开场合。
- 证明大小与计算步数呈准线性增长，是 STARK 相比 SNARK 的主要代价；换来后量子安全和无 SRS。

## 核心算法细节

### AIR（Algebraic Intermediate Representation）

计算被编码为执行迹 (execution trace)：一个 `T × W` 的矩阵，每行代表一步计算状态。约束系统由两类多项式组成：
1. **边界约束**：规定初始/终止状态（如 `trace[0][0] = input`）
2. **转移约束**：相邻行之间的代数关系（如 `trace[i+1][0] = trace[i][0] + trace[i][1]`）

若执行迹满足所有约束，则证明者知道合法的计算过程。

### FRI 协议（Fast Reed-Solomon IOP）

FRI 是 STARK 中多项式接近性测试的核心，让验证者无需读取完整多项式即可确认证明：

1. **折叠（Folding）**：将度 `d` 的多项式 `f(x)` 用随机数 `r` 折叠为度 `d/2` 的多项式 `g(x) = f_even(x) + r·f_odd(x)`
2. **迭代**：重复 `log d` 轮折叠，最终多项式是常数，验证者直接检查
3. **查询（Query）**：验证者在原始域的随机点抽样，检查折叠一致性
4. **复杂度**：证明大小 O(d·log²d)，验证时间 O(log²d)

### 多项式承诺与 Merkle 树

STARK 用 Merkle 树承诺多项式求值：
- 叶节点 = 多项式在扩展域各点的求值
- 验证者用 Merkle proof 打开任意点，无需信任哈希树之外的任何东西
- 安全性仅依赖哈希函数的抗碰撞性，后量子安全

### 证明大小与开销对比

| 方案 | 证明大小 | 验证时间 | 可信初始化 | 后量子安全 |
|------|---------|---------|-----------|-----------|
| STARK | ~100 KB | 毫秒级 | 不需要 | 是 |
| Groth16 | ~200 B | <1ms | 需要 | 否 |
| PLONK | ~1 KB | <10ms | 需要 | 否 |

## 工程实现要点

- **Cairo 语言**：StarkWare 设计的 STARK 原生 VM 语言，支持证明任意 Cairo 程序；Rust/Python 可编译为 Cairo 字节码
- **RISC Zero**：基于 RISC-V ISA 的 STARK 实现，直接证明 Rust 程序
- **域选择**：推荐使用 Goldilocks 域（`p = 2^64 - 2^32 + 1`）以兼顾 64 位友好和 NTT 效率
- **FRI soundness 参数**：每轮查询次数直接影响安全位数，生产环境通常取 40–80 次查询（约 128 bit 安全）
- **递归聚合**：用一个 STARK 证明另一个 STARK 的正确性，实现 zkRollup 中的链下批量证明

## 延伸阅读

- 原文：https://eprint.iacr.org/2018/046
- [[gabizon-plonk-2019]]
- [[bowe-halo-2019]]

## 关联

- [[gabizon-plonk-2019]] —— 同路线前后文
- [[bowe-halo-2019]] —— 同路线前后文

## 维护备注

- 引用格式保持单引号包裹 `来源` 字段。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[bohme-aflfast-2016]] —— AFLFast — 灰盒 Fuzz 的马尔可夫调度
- [[bowe-halo-2019]] —— Halo: Recursive Proof Composition without a Trusted Setup
- [[cadar-klee-2008]] —— KLEE — 符号执行自动生成高覆盖测试
- [[ducas-dilithium-2018]] —— CRYSTALS-Dilithium — 格上的后量子数字签名
- [[gabizon-plonk-2019]] —— PLONK: Permutations over Lagrange-bases for Oecumenical Noninteractive arguments of Knowledge
- [[gentry-fhe-2009]] —— Gentry FHE — 全同态加密开山

