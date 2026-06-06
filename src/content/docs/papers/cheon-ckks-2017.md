---
title: Homomorphic Encryption for Arithmetic of Approximate Numbers
来源: 'Homomorphic Encryption for Arithmetic of Approximate Numbers'
日期: 2026-06-06
分类: 安全与隐私
子分类: 安全与隐私
难度: 高级
provenance: pipeline-v3
---

## 是什么

**Homomorphic Encryption for Arithmetic of Approximate Numbers** 提出：CKKS：近似浮点算术上的同态加密。

日常类比：像带误差的加密算盘，适合神经网络浮点推理。

读论文时先抓「威胁模型/假设→核心构造→复杂度/开销」三件事。

## 为什么重要

- 隐私 ML 工业默认
- 近似噪声预算管理
- 链 BFV/BGV 对照
- 加密推理服务

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

阅读 [[fan-vercauteren-bfv-2012]]，画时间线：哪篇解决 setup/性能/证明长度。

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

## 核心算法细节

### CKKS 编码与近似算术

CKKS（Cheon-Kim-Kim-Song）的核心创新是允许**近似算术**，用消息精度换取效率：

1. **复数打包**：将 N/2 个复数编码到一个多项式密文（通过 FFT-like 嵌入），实现 SIMD 并行计算
2. **Rescaling 操作**：乘法后密文模数增大，通过除以缩放因子 Δ 保持精度，类似浮点的规格化
3. **近似误差分析**：每次运算引入 O(1/Δ) 级别误差，需在应用层预估误差累积
4. **参数选取**：缩放因子 Δ ≈ 2^40-2^60，模数链深度决定支持的乘法次数

```python
import tenseal as ts

# 创建 CKKS 上下文
context = ts.context(
    ts.SCHEME_TYPE.CKKS,
    poly_modulus_degree=8192,
    coeff_mod_bit_sizes=[60, 40, 40, 60]
)
context.generate_galois_keys()
context.global_scale = 2**40

# 加密向量并计算
plain = [1.1, 2.2, 3.3, 4.4]
enc = ts.ckks_vector(context, plain)
result = enc * enc + enc   # 同态计算 x^2 + x（近似）
print(result.decrypt())    # 输出近似结果
```

### Bootstrapping 思路

CKKS bootstrapping 将噪声密文"刷新"到高模数：
- 通过同态计算 Mod 函数（用多项式近似）恢复消息
- 每次 bootstrap 消耗约 16-20 层乘法深度，提供无限乘法深度支持

## 工程实现要点

- **Microsoft SEAL**：微软开源 C++ 库，对 CKKS 支持最成熟，有向量化和 AVX512 优化
- **OpenFHE**：继承 PALISADE，支持 CKKS + bootstrapping，学术首选
- **TenSEAL**：Python 封装 SEAL，适合隐私 ML 原型开发
- **HEaaN**：韩国 CryptoLab 商业实现，性能最优，用于实际部署
- **精度陷阱**：CKKS 是近似加密，不适合需要精确整数计算的场景（改用 BFV/BGV）
- **Bootstrapping 开销**：单次 bootstrap 在当前硬件约 1-10 秒，生产部署需评估可行性

## 延伸阅读

- 原文：https://eprint.iacr.org/2016/421
- [[fan-vercauteren-bfv-2012]]
- [[brakerski-bgv-2012]]
- [[abadi-dpsgd-2016]]

## 关联

- [[fan-vercauteren-bfv-2012]] —— 同路线前后文
- [[brakerski-bgv-2012]] —— 同路线前后文
- [[abadi-dpsgd-2016]] —— 同路线前后文

## 维护备注

- 引用格式保持单引号包裹 `来源` 字段。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[abadi-dpsgd-2016]] —— DP-SGD — 深度学习差分隐私训练
- [[brakerski-bgv-2012]] —— Fully Homomorphic Encryption without Bootstrapping
- [[fan-vercauteren-bfv-2012]] —— Somewhat Practical Fully Homomorphic Encryption
- [[gentry-fhe-2009]] —— Gentry FHE — 全同态加密开山
- [[sgx-2013]] —— Innovative Instructions and Software Model for Isolated Execution

