---
title: CKKS — 让加密数据也能做浮点运算
来源: 'Cheon, Kim, Kim, Song. "Homomorphic Encryption for Arithmetic of Approximate Numbers". Asiacrypt 2017'
日期: 2026-06-24
分类: security-privacy
难度: 高级
---

## 是什么

CKKS 是一种**让你在加密状态下对浮点数做加法和乘法**的同态加密方案。日常类比：想象你把账本锁进保险箱交给会计，会计不用打开箱子就能帮你算出总额——结果取出来和你自己算的几乎一样，只有微小的四舍五入误差。

之前的全同态加密（FHE）方案只能处理整数或 0/1 比特。CKKS 的关键洞见是：**把加密噪声当作近似误差的一部分**。既然浮点数本身就有精度限制（IEEE 754 双精度也只有 53 位有效数字），那噪声只要比有效数字小就不影响结果。

这让 FHE 第一次能高效处理实数运算。如今 CKKS 已成为隐私机器学习推理（加密逻辑回归、加密神经网络）的工业默认方案，Microsoft SEAL、OpenFHE、Lattigo 等库都提供了成熟实现。

## 为什么重要

不理解 CKKS，下面这些事都没法解释：

- 为什么医院能把患者数据加密后送给云端模型做推理，结果只有医院自己能解密——而云端全程看不到明文
- 为什么之前的 FHE 方案（BFV/BGV）能做整数加法却没法直接跑神经网络——因为激活函数需要浮点近似
- 为什么 CKKS 乘法做多了结果会越来越"模糊"，必须靠 bootstrapping 才能继续——噪声预算是有限的
- 为什么 2020 年后几乎所有隐私 ML 论文都选 CKKS 而不是 BGV——浮点原生支持是决定性优势

## 核心要点

CKKS 的设计可以拆成**三个关键机制**：

1. **编码：把浮点向量变成多项式**。类比：把一排温度读数翻译成一首“数学诗”，诗的每个系数对应一个数据点。具体做法是用规范嵌入（canonical embedding）把复数向量映射到多项式环 Z[X]/(X^N+1) 上，再乘一个缩放因子 Δ 把小数变整数。
   这个编码步骤是 CKKS 能处理浮点的根本原因。

2. **rescaling：乘完之后“缩回去”**。类比：两个放大 100 倍的数相乘，结果会放大 10000 倍，必须除以 100 才能继续用。CKKS 每次密文乘法后做一次 rescaling——把模数 q 缩小一级，同时把噪声和结果一起等比缩小，保持精度可控。
   这是 CKKS 相对于 BGV/BFV 的核心创新。

3. **噪声即误差：安全和精度共享一个预算**。类比：对讲机本身有底噪，信号只要比底噪大就能听清。CKKS 利用 RLWE（环上学习带误差）问题的噪声来保证安全性，同时保证噪声远小于有效数字，解密后只丢失最低几位精度。这种设计让 CKKS 的安全性归结为格问题的困难性，与后量子密码学方向一致。

## 实践案例

### 案例 1：加密两个浮点数相加

用 Microsoft SEAL 库（C++/Python 绑定）：

```python
import seal
parms = seal.EncryptionParameters(seal.scheme_type.ckks)
parms.set_poly_modulus_degree(8192)         # 多项式环维度
parms.set_coeff_modulus(seal.CoeffModulus.Create(8192, [60,40,40,60]))
context = seal.SEALContext(parms)
encoder = seal.CKKSEncoder(context)
scale = 2.0 ** 40                           # 缩放因子 Δ
plain_a = encoder.encode(3.14, scale)       # 编码
plain_b = encoder.encode(2.72, scale)
# 加密 → 密文相加 → 解密 → 得到 ≈5.86
```

**逐部分解释**：`poly_modulus_degree` 决定安全级别和可打包的槽数（8192 对应 128-bit 安全级，4096 个槽）；`coeff_modulus` 是一串素数，每次 rescaling 消耗一个；`scale` 是 Δ，控制小数精度，越大精度越高但消耗模数越快。

### 案例 2：密文乘法 + rescaling

```python
ct_a = encryptor.encrypt(plain_a)
ct_b = encryptor.encrypt(plain_b)
ct_mul = evaluator.multiply(ct_a, ct_b)     # 密文相乘
evaluator.relinearize_inplace(ct_mul, relin_keys)  # 重线性化
evaluator.rescale_to_next_inplace(ct_mul)    # rescaling：缩模数
# 解密 → 得到 ≈ 3.14 * 2.72 = 8.5408
```

**为什么需要这两步**：乘法后密文维度从 2 变成 3，relinearize 把它压回 2，否则每次乘法都会让密文膨胀。rescale 把模数从 q₁·q₂ 缩到 q₁，噪声等比缩小。每次乘法消耗一级模数，所以 `coeff_modulus` 链的长度决定了最多能连乘几次（上面的例子中链长为 4，所以可以做 2 次乘法）。

### 案例 3：SIMD 批量加密

CKKS 支持把 N/2 个浮点数打包进一个密文（SIMD）：

```python
vec = [1.0, 2.0, 3.0, 4.0]   # 4 个槽
plain = encoder.encode(vec, scale)
ct = encryptor.encrypt(plain)
# 一次密文加法 = 4 个浮点加法同时完成
```

打包后一次密文运算等于 N/2 次并行浮点运算，这是 CKKS 在 ML 推理中高效的核心原因——矩阵乘法可以拆成批量内积。

CKKS 还支持密文旋转（rotation），可以把槽里的元素循环移位，配合加法就能实现向量内积、矩阵-向量乘法等线性代数操作。

## 踩过的坑

1. **rescaling 忘了对齐 scale**：两个密文做加法前 scale 必须匹配，否则等于把“米”和“厘米”直接相加，结果完全错误。解决办法是在加法前手动对齐两边的 level 和 scale。
2. **模数链用完了还想继续乘**：每次乘法消耗一级模数，链耗尽后密文“死掉”，必须提前规划计算深度或做 bootstrapping。
3. **把 CKKS 当精确计算用**：CKKS 是近似方案，每次运算都丢精度；需要精确整数结果（如投票计数、货币结算）应该用 BFV/BGV。
4. **参数选太小导致不安全**：poly_modulus_degree 太小或模数总比特太大会降低安全级别；必须查 Homomorphic Encryption Standard 的参数表，不能凭感觉选。

## 适用 vs 不适用场景

**适用**：

- 隐私机器学习推理——加密输入送云端模型，结果只有用户能解密
- 加密统计分析——医疗数据、金融数据在密文上求均值/方差/回归系数
- 基因组学隐私计算——加密基因数据跑关联分析，研究机构看不到个体基因
- 任何容忍微小精度损失的浮点批量计算

**不适用**：

- 需要精确整数运算的场景（如投票、货币计算）→ 用 BFV/BGV
- 需要比较大小或条件分支判断 → CKKS 不直接支持密文比较，需要多项式近似或额外协议
- 实时低延迟场景 → FHE 运算比明文慢 10⁴–10⁶ 倍，不适合毫秒级响应
- 需要无限深度计算但不想做 bootstrapping → bootstrapping 本身消耗大量计算和噪声预算

## 历史小故事（可跳过）

- **2009 年**：Craig Gentry 发表第一个 FHE 方案，证明"加密下做任意计算"理论可行，但只能处理比特，极慢。
- **2012 年**：Brakerski-Gentry-Vaikuntanathan（BGV）提出模数切换技术，把 FHE 加速了几个数量级，但仍限于整数运算。
- **2017 年**：韩国首尔大学的 Jung Hee Cheon、Andrey Kim、Miran Kim、Yongsoo Song 在 Asiacrypt 发表 CKKS，核心想法是"噪声就是近似误差"，让 FHE 第一次原生支持浮点。
- **2018–2020 年**：Microsoft SEAL、OpenFHE、HElib 等库陆续实现 CKKS；隐私 ML 论文开始大量采用。
- **2021 年**：Li & Micciancio 指出 CKKS 在 IND-CPA-D 模型下有被动攻击风险，社区改进了噪声填充策略。
- **2022 年起**：CKKS bootstrapping 效率持续提升，单次 bootstrapping 从秒级降到百毫秒级，实用性大幅增强。

## 学到什么

- **“噪声即误差”是 CKKS 的核心洞见**——把安全需要的随机噪声重新定义为计算精度损失，一石二鸟
- **rescaling 是让近似 FHE 可用的关键操作**——没有它，每次乘法噪声指数增长，几步之后结果就淹没在噪声里
- **SIMD 打包让 FHE 从“理论玩具”变成“工程可用”**——一个密文装 N/2 个浮点槽，吞吐量提升千倍
- **参数选择是安全 vs 性能 vs 精度的三角博弈**——poly degree 越大越安全但越慢，模数链越长能算越深但密文越大
- **近似计算不是缺点而是设计选择**——实际应用中数据本身就有测量误差，CKKS 的近似性在实践中几乎不构成问题

## 延伸阅读

- 系列教程：[CKKS Explained (OpenMined)](https://openmined.org/blog/ckks-explained-part-1-simple-encoding-and-decoding/)（5 篇从编码到 bootstrapping，有 Python 代码）
- 在线教科书：[FHE Textbook — CKKS Scheme](https://fhetextbook.github.io/CKKSScheme.html)（图文并茂，适合系统学习）
- MIT 讲义：[CKKS Homomorphic Encryption Part 1](https://www.mit.edu/~linust/files/CKKS_Homomorphic_Encryption_Part_1.pdf)
- 官方网站：[ckks.org](https://ckks.org/)（方案概述、论文列表、开源实现索引）
- 开源实现：[Microsoft SEAL](https://github.com/microsoft/SEAL)（C++ 库，支持 CKKS/BFV/BGV）
- [[gentry-fhe-2009]] —— Gentry 的第一个 FHE 方案，CKKS 的理论起点
- [[brakerski-bgv-2012]] —— BGV 方案，CKKS 的直接前身，提供了模数切换技术

## 关联

- [[gentry-fhe-2009]] —— 第一个 FHE 方案，证明了"加密下做任意计算"的可行性；CKKS 在此基础上解决浮点问题
- [[brakerski-bgv-2012]] —— BGV 的模数切换启发了 CKKS 的 rescaling；两者共享 RLWE 安全假设
- [[diffie-hellman-1976]] —— 公钥密码学的起点；CKKS 的密钥交换同样基于计算困难问题
- [[aes]] —— 对称加密的工业标准；CKKS 解决的是 AES 无法做到的"加密下计算"
- [[mcmahan-fedavg-2017]] —— 联邦学习用 CKKS 加密梯度聚合，防止服务器窥探单个客户端数据
- [[abadi-dpsgd-2016]] —— 差分隐私训练关注"学到什么"，CKKS 关注"看到什么"，两者正交互补
- [[zk-snark]] —— 零知识证明证明“我知道答案”但不泄露答案；CKKS 让你“在密文上算出答案”
- [[dwork-dp-icalp-2006]] —— 差分隐私保护“结果不泄露个体”，CKKS 保护“输入不泄露明文”，两者可叠加使用

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[abadi-dpsgd-2016]] —— DP-SGD 2016 — 给深度学习训练加上差分隐私保护
- [[brakerski-bgv-2012]] —— BGV 2012 — 不用自举也能做全同态加密
- [[chillotti-tfhe-2016]] —— TFHE 2016 — 把全同态加密的自举时间从分钟级压到 0.1 秒
- [[dwork-dp-icalp-2006]] —— 差分隐私 — 让统计结果有用但查不到任何一个人
- [[gentry-fhe-2009]] —— Gentry 2009 — 第一个全同态加密方案
- [[mcmahan-fedavg-2017]] —— FedAvg 2017 — 让手机本地训练模型再上传平均值
- [[zk-snark]] —— zk-SNARK 零知识证明

