---
title: "CRYSTALS-Kyber: A CCA-Secure Module-Lattice-Based KEM"
来源: 'CRYSTALS-Kyber: A CCA-Secure Module-Lattice-Based KEM'
日期: 2026-06-06
分类: 安全与隐私
子分类: 安全与隐私
难度: 高级
provenance: pipeline-v3
---

## 是什么

**CRYSTALS-Kyber: A CCA-Secure Module-Lattice-Based KEM** 提出：CRYSTALS-Kyber：NIST 标准 ML-KEM。

日常类比：像后量子时代的 TLS 握手新钥匙。

读论文时先抓「威胁模型/假设→核心构造→复杂度/开销」三件事。

## 为什么重要

- Cloudflare PQ TLS
- 理解 module-LWE KEM
- 链 [[regev-lwe-2005]]
- 混合经典+PQ

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

阅读 [[regev-lwe-2005]]，画时间线：哪篇解决 setup/性能/证明长度。

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
- Module-LWE 是 LWE 与 RLWE 之间的折中：比纯 LWE 更高效，比 RLWE 具有更保守的安全假设。
- NIST 标准化过程（2017–2024）历经多轮分析，Kyber 最终以 ML-KEM（FIPS 203）身份发布。

## 核心算法细节

### Module-LWE 问题

Kyber 的安全性归约到 Module-LWE (MLWE) 问题：给定矩阵 **A** ∈ R_q^{k×k} 和向量 **b** = **A**·**s** + **e**（**s**、**e** 是小系数多项式向量），在多项式环 R_q = Z_q[x]/(x^n+1) 上区分 (**A**, **b**) 与均匀随机是困难的。

### NTT 快速多项式乘法

多项式环中的乘法是 Kyber 的性能瓶颈。利用数论变换（NTT）将 O(n²) 降至 O(n log n)：
- **参数**：n=256，q=3329，支持 NTT 的 256 次单位根存在于 Z_3329
- **实现**：AVX2 向量化后每次 NTT 约需 3000 个时钟周期

### 压缩与解压缩

为减小公钥和密文大小，Kyber 对多项式系数做舍入压缩：
- `Compress_q(x, d)` = round(x · 2^d / q) mod 2^d
- `Decompress_q(x, d)` = round(x · q / 2^d)
- 压缩引入的误差在解密时与加密噪声叠加，参数设计保证解密失败率 < 2^{-128}

### 参数集对比

| 参数集 | k | 安全级别 | 公钥大小 | 密文大小 |
|--------|---|---------|---------|---------|
| Kyber-512 | 2 | AES-128 | 800 B | 768 B |
| Kyber-768 | 3 | AES-192 | 1184 B | 1088 B |
| Kyber-1024 | 4 | AES-256 | 1568 B | 1568 B |

### 与经典 KEM 性能对比

| 算法 | 密钥生成 | 封装 | 解封装 | 公钥大小 |
|------|---------|------|-------|---------|
| RSA-2048 | 慢（>1ms） | 快 | 快 | 256 B |
| ECDH P-256 | ~100µs | ~100µs | ~100µs | 64 B |
| Kyber-768 | ~30µs | ~30µs | ~30µs | 1184 B |

Kyber 速度与 ECDH 相近，但密钥尺寸较大是主要代价。

## 工程实现要点

- **侧信道防护**：NTT 系数比较和 Barrett 约简须做常数时间实现，避免时序攻击
- **混合 KEM**：TLS 1.3 中建议用 X25519+Kyber768 混合模式，保守过渡到后量子安全
- **liboqs**：Open Quantum Safe 提供 C 语言参考实现，已集成进 OpenSSL/BoringSSL fork
- **失败率监控**：硬件噪声可能导致解密失败，生产系统须统计失败率，Kyber-1024 失败率 <2^{-174}
- **Zeroize 密钥**：私钥在使用后须安全擦除（`zeroize` crate in Rust），防止内存泄露攻击

## 延伸阅读

- 原文：https://eprint.iacr.org/2017/634
- [[regev-lwe-2005]]
- [[ducas-dilithium-2018]]
- [[wireguard-2017]]

## 关联

- [[regev-lwe-2005]] —— 同路线前后文
- [[ducas-dilithium-2018]] —— 同路线前后文
- [[wireguard-2017]] —— 同路线前后文

## 维护备注

- 引用格式保持单引号包裹 `来源` 字段。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[bernstein-sphincs-2015]] —— SPHINCS — 无状态哈希签名，后量子密码的"保险"
- [[ducas-dilithium-2018]] —— CRYSTALS-Dilithium — 量子计算机来了也签不掉的数字签名
- [[regev-lwe-2005]] —— On Lattices, Learning with Errors, Random Linear Codes, and Cryptography
- [[wireguard-2017]] —— WireGuard: Next Generation Kernel Network Tunnel

