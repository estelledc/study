---
title: Fully Homomorphic Encryption without Bootstrapping
来源: 'Fully Homomorphic Encryption without Bootstrapping'
日期: 2026-06-06
分类: 安全与隐私
子分类: 安全与隐私
难度: 高级
provenance: pipeline-v3
---

## 是什么

**Fully Homomorphic Encryption without Bootstrapping** 提出：BGV 全同态加密：模数切换避免昂贵 bootstrapping。

日常类比：像加密计算器：在锁箱里做加减乘，偶尔换锁尺寸降噪。

读论文时先抓「威胁模型/假设→核心构造→复杂度/开销」三件事。

## 为什么重要

- FHE 实用化关键一步
- HElib 默认路线
- 链 [[gentry-fhe-2009]]
- 隐私 SQL 理论根

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

阅读 [[gentry-fhe-2009]]，画时间线：哪篇解决 setup/性能/证明长度。

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
- 模数切换（modulus switching）是 BGV 区别于 Gentry FHE 的核心创新：将噪声控制从昂贵的 bootstrapping 转化为廉价的参数缩放。
- 层级 FHE（Leveled FHE）在实际应用中往往足够：固定乘法深度的电路不需要 bootstrapping，直接按层分配模数。

## 核心算法细节

### RLWE 问题与密文结构

BGV 基于 Ring-LWE：在多项式环 R_q = Z_q[X]/(X^n+1) 上，密文是一对多项式 (a, b)，其中 b = a·s + 2e + m，s 是私钥，e 是小噪声，m 是明文。

- **加法**：(a₁+a₂, b₁+b₂)，噪声线性增加
- **乘法**：密文张量积后 relinearization，噪声平方增长

### 模数切换（Modulus Switching）

这是 BGV 的核心贡献。将密文从模数 q 切换到较小模数 q'：

```
ct' = round(q'/q · ct) mod q'
```

切换后密文噪声从 B 降至约 B·q'/q + 小量。通过在每次乘法后缩小模数，将噪声增长从指数级压制到线性级，支持 L 层乘法的层级 FHE 只需模数链 q_0 > q_1 > ... > q_L。

### 密钥切换（Key Switching）

乘法后密文变为 s² 的函数，需切换回线性密文。密钥切换矩阵（relinearization key）预计算并公开：

- 计算开销：O(n log q) 次环运算
- 存储开销：每级需要一个切换密钥，约几 MB

### 噪声增长分析

| 操作 | 噪声上界 |
|------|---------|
| 加密 | B |
| 加法 | 2B |
| 乘法 + relinearization | B² + poly(n)·B |
| 模数切换后 | B·(q'/q) + small |

### 性能数据（HElib 参考实现）

| 操作 | 延迟（单核） | 批处理数量 |
|------|------------|-----------|
| 加法 | ~10µs | n/2 个槽 |
| 乘法 | ~10ms（无 amortize） | n/2 个槽 |
| 乘法（SIMD batching） | ~0.1ms/op | n/2 ≈ 16384 |

## 工程实现要点

- **参数选取**：乘法深度 L 决定最大模数 q，需用安全估计工具（如 `lattice-estimator`）确认参数安全
- **批处理 (SIMD)**：BGV 支持将 n/2 个明文值打包进一个密文（CRT packing），吞吐量提升数千倍
- **HElib**：IBM 研究院的 C++ 实现，支持 BGV 和 CKKS，适合研究原型
- **Microsoft SEAL**：商业级 C++ 库，提供 BGV/BFV/CKKS，API 更友好
- **模数链设计**：选择素数链使每个 q_i 支持 NTT（q_i ≡ 1 mod 2n），避免手动 CRT 分解

## 延伸阅读

- 原文：https://eprint.iacr.org/2011/277
- [[gentry-fhe-2009]]
- [[fan-vercauteren-bfv-2012]]
- [[cheon-ckks-2017]]

## 关联

- [[gentry-fhe-2009]] —— 同路线前后文
- [[fan-vercauteren-bfv-2012]] —— 同路线前后文
- [[cheon-ckks-2017]] —— 同路线前后文

## 维护备注

- 引用格式保持单引号包裹 `来源` 字段。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[cheon-ckks-2017]] —— Homomorphic Encryption for Arithmetic of Approximate Numbers
- [[chillotti-tfhe-2016]] —— Faster Fully Homomorphic Encryption: Bootstrapping in Less Than 0.1 Seconds
- [[ckks-homomorphic-2017]] —— CKKS 同态加密 — 在加密数据上做近似浮点运算
- [[fan-vercauteren-bfv-2012]] —— Somewhat Practical Fully Homomorphic Encryption
- [[gentry-fhe-2009]] —— Gentry FHE — 全同态加密开山
- [[regev-lwe-2005]] —— On Lattices, Learning with Errors, Random Linear Codes, and Cryptography

