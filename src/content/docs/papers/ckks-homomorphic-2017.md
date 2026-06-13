---
title: CKKS 同态加密 — 在加密数据上做近似浮点运算
来源: https://eprint.iacr.org/2016/421.pdf
日期: 2026-06-13
分类: 安全与隐私
子分类: 安全与隐私
难度: 高级
provenance: pipeline-v3
---

## 是什么

这篇 2017 年发表于 ASIACRYPT 的论文 **Homomorphic Encryption for Arithmetic of Approximate Numbers**（作者 Jung Hee Cheon、Andrey Kim、Miran Kim、Yongsoo Song）提出了 **CKKS 方案**——今天工业界最常用的「近似全同态加密」之一。开源实现 HEAAN 库（CryptoLab）的名字直接来自论文标题里的 **HE**（Homomorphic Encryption）+ **AAN**（Arithmetic of Approximate Numbers）。

日常类比：

> 想象你把一叠**带小数点的测量数据**（体温、血压、模型权重）锁进一个**透明保险箱**里。保险箱外的人看不见数字，但可以在箱子上拧旋钮：拧一次「加」，箱内所有数同时加同一个值；拧一次「乘」，所有数同时乘同一个系数——全程不用开锁。拧多了，数字会有一点**磨损**（噪声和舍入误差），就像老式机械计算器最后一位会飘。CKKS 的天才之处在于：**不把磨损当敌人，而是把它当成近似算术里本来就会有的误差**，用「Rescaling（重缩放）」定期擦掉最不重要的尾数位，让磨损可控。

这和 [[brakerski-bgv-2012]]、BFV 的精确整数路线根本不同：后者要求明文是**精确整数**，解密结构是 `m + t·e` 或 `q·I + (q/t)·m + e`，乘法会把「噪声」和「有效数字」搅在一起，做浮点近似非常别扭。CKKS 把解密结构改成：

\[
\langle c, sk \rangle = m + e \pmod q
\]

噪声 `e` 直接加在消息 `m` 旁边——如果 `e` 相对 `m` 足够小，就把 `m + e` 整体当作「带误差的近似值」继续算，和浮点运算的「有效位 + 尾数误差」哲学一致。

## 零基础前置：同态加密三句话

如果你从未接触过同态加密（Homomorphic Encryption，HE），先记住三句话：

1. **加密**：明文 `m` 变成密文 `c`，外人看不出 `m`。
2. **同态**：在密文上算 `f(c)`，解密后得到 `f(m)` 的近似——**不用先解密**。
3. **CKKS 特化**：`m` 是**实数/复数向量**，`f` 是加法和乘法（以及由它们拼出的多项式、Taylor 级数等），结果允许有**可控误差**。

论文信息速览：

| 项目 | 内容 |
|------|------|
| 预印本 | [eprint.iacr.org/2016/421](https://eprint.iacr.org/2016/421.pdf) |
| 会议 | ASIACRYPT 2017 |
| 作者 | Cheon, Kim, Kim, Song（简称 **CKKS**） |
| 实现 | HEAAN、Microsoft SEAL、OpenFHE、TenSEAL |
| 安全假设 | Ring-LWE（环上学习与错误） |

## 为什么重要

不理解 CKKS，下面这些事都讲不清：

- 为什么 **加密推理**（在云端算神经网络而不暴露输入）默认选 CKKS，而不是 RSA 或 AES
- 为什么 Microsoft SEAL、OpenFHE、TenSEAL 文档里到处是 `scale`、`coeff_modulus`、`rescale`——它们不是随便起的 API 名字，而是论文里的核心操作
- 为什么隐私机器学习论文里常说「精度损失约 log(depth) 比特」——这是论文 Section 1 证明的**近似最优性**
- 为什么 NIST 后量子标准化里，**精确整数 HE**（BFV）和 **近似实数 HE**（CKKS）是两条平行产品线，不能互相替代

论文在 i5-2.9GHz 上实测：14 位精度的**同态乘法逆**摊销约 0.11 ms/slot；用七阶 Taylor 级数同态算 **logistic 函数**约 0.13 ms/slot——比当时没有 batching 的实现快两个数量级。这让「在加密数据上跑统计回归 / 神经网络一层」从理论可行变成工程可测。

## 论文要解决的核心矛盾

Gentry 的全同态加密奠基工作证明 HE **存在**，但早期方案对「近似实数」极不友好：

| 路线 | 解密形态 | 近似算术的麻烦 |
|------|----------|----------------|
| BGV 型 | `m + t·e` | 乘法后噪声乘在明文模 `t` 上，**有效位被噪声淹没** |
| BFV/FV 型 | `q·I + (q/t)·m + e` | 乘法产生 `t·I₁·I₂` 项，**MSB 被破坏** |
| 比特编码 | 每位一个密文 | 深度 `d` 需要 `Ω(η·2^d)` 次运算或昂贵 bootstrapping |

CKKS 的目标：**在 RLWE 安全假设下，对复数/实数向量做 SIMD 同态加乘，模数比特数只随电路深度线性增长，精度损失最多比明文浮点多 1 bit**。

## 核心概念

### 1. 明文空间：特征零的 cyclotomic 环

明文不是 `Z_t` 上的多项式，而是 **R = Z[X]/(Φ_M(X))** 里系数有界的整系数多项式（特征零）。通过 **复数典范嵌入（complex canonical embedding）** σ，把多项式映到 `C^{φ(M)/2}` 的向量——这是一个**等距**环同态，小误差不会在编码时放大。

编码流水线（论文 Section 1）：

```
z ∈ C^{φ(M)/2}  →  π⁻¹  →  H  →  round  →  σ(R)  →  σ⁻¹  →  m(X) ∈ R
```

`π` 是到子群 T 的投影，`round` 把复数格点化。解码是逆过程。这样 **N/2 个复数 slot** 打进一个密文，同态加乘变成 slot 上的逐元素运算（SIMD）。

### 2. 加密与解密

- 环：`R_q = Z_q[X]/(X^n+1)`，`n` 是 2 的幂
- 私钥 `s` 是小系数多项式
- 密文 `c = (c₀, c₁) ∈ R_q²`，满足 `c₀ + c₁·s ≈ m + e (mod q)`
- **scale（缩放因子 Δ）**：加密前把消息乘 `Δ`（如 `2^40`），让噪声相对有效位更小

同态加法：密文分量相加，噪声线性增加。

同态乘法：张量积 + **relinearization**（用公开密钥把 `s²` 项压回 `s`），噪声约平方增长——和 BGV 类似，但消息也在变大。

### 3. Rescaling（重缩放）——CKKS 的灵魂

乘法后消息幅度和噪声都放大约 `Δ` 倍。Rescaling 做：

```
输入：c 加密 m，⟨c, sk⟩ = m + e (mod q)
输出：c' = round(p⁻¹ · c) (mod q/p)，加密 m/p，噪声约 e/p
```

`p` 通常取最后一个模数因子（与 `Δ` 对齐）。效果等价于浮点运算里**丢掉若干 LSB、缩小尾数**——模数链从 `q₀ > q₁ > … > q_L` 逐级下降，**比特数随深度线性增长**，而不是指数爆炸。

论文 Figure 2 对比：BGV/FV 乘法破坏 MSB；CKKS 乘法 + Rescale 保留 MSB、裁掉 LSB。

### 4. 精度定理（直观版）

对 `η` 位精度的 `d` 个数做深度 `d` 的乘法电路：

- 明文浮点：结果约 `η - log d` 位有效精度
- CKKS 同态：结果约 `η - log d - 1` 位——**最多多损失 1 bit**

所需最大模数约 `O(η log d)` 比特，远小于比特编码路线的 `Ω(η·2^d)`。

### 5. 超越函数

Rescaling 让模数可控后，可用 Taylor 级数**同态**算 `exp`、`log`、三角函数、**乘法逆**（论文给出专门优化算法）。实测 logistic 函数（七阶 Taylor）适合疾病预测等统计场景。

### 6. 安全假设

基于 **Ring-LWE**：给定 `(a, a·s + e)` 无法区分 `e` 是随机还是小噪声。参数由环维数 `n`、模数 `q`、噪声分布决定安全级别（论文实现用 80-bit 安全参数做 benchmark）。

## 与 BFV/BGV 怎么选

| 维度 | CKKS | BFV / BGV |
|------|------|-----------|
| 明文 | 近似实数/复数 | 精确整数 |
| 解密 | `m + e` | `m + t·e` 或带 `q/t` 缩放 |
| 乘法后 | Rescale 降精度 | Modulus switching / 模数链 |
| 典型场景 | 神经网络推理、统计、浮点 ML | 整数电路、比较、精确计数 |
| 误用后果 | 把工资总额当浮点近似 → 分钱级误差 | 把模型权重塞 BFV → 参数爆炸、极慢 |

## 实践案例

### 案例 1：纯 Python 玩具模型——理解「噪声 + Rescale」

下面**不是**真正的 CKKS 实现，而是用浮点数模拟论文的核心直觉：解密得到 `m + e`，乘法放大误差，Rescale 像除以 scale 并四舍五入。

```python
import math

def encrypt_approx(m: float, scale: float, noise: float) -> tuple[float, float]:
    """模拟 Enc(m): 存 (scaled_message, noise)，解密时 m + e/scale"""
    return m * scale, noise

def decrypt_approx(scaled_m: float, noise: float, scale: float) -> float:
    return scaled_m / scale + noise / scale

def homomorphic_add(a, b, scale):
    return (a[0] + b[0], a[1] + b[1])

def homomorphic_mul(a, b, scale):
    # (m1*scale + e1)(m2*scale + e2) ≈ m1*m2*scale^2 + cross_terms
    m1, e1 = a[0] / scale, a[1]
    m2, e2 = b[0] / scale, b[1]
    prod_m = m1 * m2
    prod_noise = m1 * e2 + m2 * e1 + (e1 * e2) / scale  # 交叉项
    return prod_m * scale * scale, prod_noise * scale

def rescale(ct, p: float):
    """除以 p 并四舍五入到整数格点，模拟 rescale_to_next"""
    scaled_m = round(ct[0] / p)
    scaled_noise = round(ct[1] / p)
    return scaled_m, scaled_noise

scale, p = 1024.0, 1024.0
x, y = 3.14, 2.71

cx = encrypt_approx(x, scale, noise=0.5)
cy = encrypt_approx(y, scale, noise=0.3)

# 同态乘法 + rescale
cmul = homomorphic_mul(cx, cy, scale)
cmul = rescale(cmul, p)
result = decrypt_approx(cmul[0], cmul[1], scale)

print(f"明文: {x} * {y} = {x * y:.6f}")
print(f"同态近似: {result:.6f}")
print(f"相对误差: {abs(result - x * y) / (x * y):.2e}")
```

运行后你会看到：误差在 `1/scale` 量级，和论文「噪声跟在有效数字后面」的图景一致。真正的 CKKS 在多项式环上操作，但**Rescale 的语义**就是这里演示的「缩小幅度 + 舍入」。

### 案例 2：TenSEAL — 加密向量上的多项式求值

TenSEAL 封装 Microsoft SEAL，最适合快速体验 CKKS 的「加密浮点向量 + SIMD」。

```python
import tenseal as ts

# poly_modulus_degree=8192 → 4096 个 slot；coeff_mod 链长度决定乘法深度
context = ts.context(
    ts.SCHEME_TYPE.CKKS,
    poly_modulus_degree=8192,
    coeff_mod_bit_sizes=[60, 40, 40, 40, 60],  # 每层乘法消耗一档模数
)
context.generate_galois_keys()   # 旋转 slot 时需要
context.global_scale = 2**40     # Δ，与 rescale 对齐

plain = [1.5, 2.5, 3.5, 4.5]
enc = ts.ckks_vector(context, plain)

# 同态算 f(x) = x^2 + x（近似）
result = enc * enc + enc
decoded = result.decrypt()

for i, (a, b) in enumerate(zip(plain, decoded)):
    expected = a * a + a
    print(f"slot {i}: plain={a}, hom={b:.6f}, expected={expected:.6f}")
```

**读代码时注意**：

- `coeff_mod_bit_sizes` 里有几个「中间档」，大致就能做几次乘法（每次 `rescale` 掉一档）
- `global_scale` 设太大 → 噪声相对消息变小，但模数链要更长；设太小 → 精度不够
- 解密结果和明文差在 `1/Δ` 量级是正常的，不是实现 bug

### 案例 3：Microsoft SEAL（C++）— 手动跟踪 scale 与 rescale

生产环境更常用 SEAL 原生 API；理解 `scale` 与 `rescale_to_next` 是读 CKKS 源码的钥匙。

```cpp
#include "seal/seal.h"
using namespace seal;

size_t poly_modulus_degree = 8192;
EncryptionParameters parms(scheme_type::ckks);
parms.set_poly_modulus_degree(poly_modulus_degree);
parms.set_coeff_modulus(CoeffModulus::Create(
    poly_modulus_degree, {60, 40, 40, 60}));

SEALContext context(parms);
KeyGenerator keygen(context);
auto secret_key = keygen.secret_key();
PublicKey public_key;
keygen.create_public_key(public_key);
RelinKeys relin_keys;
keygen.create_relin_keys(relin_keys);
Encryptor encryptor(context, public_key);
Evaluator evaluator(context);
Decryptor decryptor(context, secret_key);

CKKSEncoder encoder(context);
double scale = pow(2.0, 40);

std::vector<double> input{3.0, 4.0};
Plaintext plain;
encoder.encode(input, scale, plain);

Ciphertext encrypted;
encryptor.encrypt(plain, encrypted);

// 乘法：scale 变为 scale^2，必须 rescale
evaluator.multiply_inplace(encrypted, encrypted);
evaluator.relinearize_inplace(encrypted, relin_keys);
evaluator.rescale_to_next_inplace(encrypted);

Plaintext plain_result;
decryptor.decrypt(encrypted, plain_result);
std::vector<double> output;
encoder.decode(plain_result, output);

// output[0] ≈ 9.0, output[1] ≈ 16.0
```

**与论文对应关系**：

- `encode(..., scale)` = 消息乘 `Δ` 再加密
- `multiply` + `relinearize` = 同态乘 + 密钥切换
- `rescale_to_next` = 论文的 `p⁻¹·c (mod q/p)`，scale 也除以 `p`

### 案例 4：同态 logistic（论文动机场景）

论文用 batching 同态算 logistic 的七阶 Taylor 近似，用于**加密基因/医疗数据的疾病风险评分**。工程上可拆成：

1. 用案例 2 加密特征向量
2. 预计算 Taylor 系数为明文，同态累加 `Σ cᵢ · xⁱ`
3. 每乘一次 `x` 做一次 `rescale`，提前规划模数链深度

若电路深度超过模数链，需要 **bootstrapping**（论文原版未强调；后续工作把 CKKS bootstrap 做到实用，OpenFHE 支持）。

## 踩过的坑

1. **把 CKKS 当精确整数加密**：账本、投票计数请用 BFV；CKKS 解密是「近似」，误差累积可审计但不可消除。
2. **忘记 rescale**：乘法后不调 `rescale_to_next`，scale 爆炸，下一轮乘法或解密直接错。
3. **模数链深度不够**：规划电路时数清楚「几次乘法」，每档 `coeff_modulus` 通常支撑一次乘法+rescale。
4. **slot 数误算**：`poly_modulus_degree = N` 时 slot 数是 **N/2**，不是 N。
5. **混淆 CKKS 与 HEAAN 商标**：HEAAN 是韩国 CryptoLab 的实现名；算法统称 CKKS；Microsoft SEAL / OpenFHE 实现的是同一方案族，参数不互通。
6. **忽略 bootstrapping 成本**：无限深度电路需要 bootstrap，单次仍可能秒级——和论文里「浅电路 + rescaling」的毫秒级不是一回事。

## 适用 vs 不适用

**适用**：

- 云端推理（加密输入 + 明文或加密权重）
- 联邦学习里的安全聚合（近似梯度）
- 统计分析（均值、方差、回归系数）——容忍 `10⁻⁶` 级误差
- 学习 HE 栈：CKKS API 是工业文档最丰富的入口

**不适用**：

- 精确金融记账、加密货币余额
- 需要密文比较 / 分支（CKKS 不原生支持，要配合其他原语）
- 超低延迟在线服务（毫秒级单 op 可接受，但大模型全链路仍慢几个数量级）
- 不做参数审计就上生产（80-bit 论文 benchmark ≠ 128-bit 产品要求）

## 历史小故事

- 论文 **eprint 2016/421** 先挂 IACR ePrint，HEAAN 库 2016 年 5 月已在 GitHub 开源——实现领先正式发表。
- 名称 **CKKS** 来自四位作者姓氏 Cheon-Kim-Kim-Song；第二、三位 Kim 是不同研究者。
- ASIACRYPT 2017 发表后，CKKS 迅速成为 **隐私机器学习** 默认 HE 方案；BFV 仍在整数场景活跃。
- 论文把加密噪声重新定义为「误差的一部分」，影响后续 **近似 FHE** 整条线（含 bootstrap 综述里对 CKKS 的专门章节）。

## 学到什么

- **同态加密不止一条路线**：精确整数（BFV/BGV）与近似实数（CKKS）解决不同问题，选型先于调参。
- **Rescaling 是 CKKS 相对 modulus switching 的概念创新**：不是简单换模数，而是**对齐浮点舍入语义**。
- **SIMD batching + 典范嵌入** 让一次密文算一整条向量，论文里 logistic 加速主要来自这里。
- **安全与精度一起规划**：模数链、scale、噪声预算要在加密前画电路深度表。
- 读实现时盯住三个词：`scale`、`relinearize`、`rescale`——它们几乎就是论文 Algorithm 1–3 的代码化。

## 延伸阅读

- 原文 PDF：[eprint.iacr.org/2016/421](https://eprint.iacr.org/2016/421.pdf)
- HEAAN 原始库：`github.com/snucrypto/HEAAN`
- Microsoft SEAL 文档：CKKS 编码与 rescaling 章节
- [[brakerski-bgv-2012]] —— 模数切换与层级 FHE
- [[ducas-dilithium-2018]] —— 同站后量子密码笔记（格密码另一应用：签名）
- [[rsa-1978]] —— 公钥密码范式起源

## 关联

- [[brakerski-bgv-2012]] —— BGV：精确整数 + 模数切换
- [[ducas-dilithium-2018]] —— 格密码签名
- [[rsa-1978]] —— 公钥密码范式起源
- [[signal-double-ratchet-2016]] —— 端到端加密另一路线（对称 + DH，非同态）

## 维护备注

- `来源` 字段指向 eprint PDF；正式会议版本见 ASIACRYPT 2017。
- 分类由 `node scripts/classify-notes.mjs --apply --area=papers` 维护。
