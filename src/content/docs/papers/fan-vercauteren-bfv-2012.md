---
title: Fan-Vercauteren BFV — 让加密数据上做整数运算变得实际可用
来源: 'Junfeng Fan & Frederik Vercauteren, "Somewhat Practical Fully Homomorphic Encryption", IACR ePrint 2012'
日期: 2026-06-24
分类: 安全与隐私
难度: 高级
---

## 是什么

BFV 是一种**全同态加密方案**——它能让你在**不知道密钥**的情况下，直接对加密后的整数做加减乘，算完解密还得到正确结果。日常类比：想象一个上锁的透明保险箱，你伸手进去操作里面的东西（加法、乘法），但打不开盖子看不到原物；算完把箱子还回去，主人开锁一看，里面正是他期望的结果。

传统的加密（比如 AES）是"锁上就别碰"——你必须先解密才能计算。BFV 打破了这个限制：**计算发生在加密态**。这篇 2012 年的论文把 Brakerski 基于 LWE 的方案搬到 Ring-LWE 上，加上优化的重线性化和模数切换，让全同态加密第一次"有点实用"了。

名字 BFV 来自 **B**rakerski（理论基础）+ **F**an 和 **V**ercauteren（本文作者）。它在工业界的影响远超学术圈——Microsoft SEAL、OpenFHE、PALISADE 三大开源 FHE 库都把 BFV 作为默认整数方案。

## 为什么重要

不理解 BFV，下面这些事都没法解释：

- 为什么 Microsoft SEAL 和 OpenFHE 默认提供 BFV 方案——它是工业界整数 FHE 的事实标准
- 为什么"加密云计算"不再只是论文里的概念——BFV 让服务端能在加密数据上做真正的算术运算
- 为什么全同态加密曾经慢到不可用——理解 BFV 的噪声管理和批处理才能理解效率瓶颈在哪
- 为什么 BGV 和 BFV 经常被并列提及——它们是同一时代的两条 Ring-LWE FHE 路线

## 核心要点

BFV 方案的工作方式可以拆成**三步**：

1. **加密：把整数藏进多项式**：明文整数被编码进一个多项式环 Z_t[x]/(x^n+1) 里，加上随机噪声后变成密文。类比：把消息写成一首诗，然后往每个字上泼墨点（噪声），别人看到墨迹猜不出原文。

2. **同态运算：加密态下直接算**：两个密文相加或相乘，对应明文也做了同样的运算。每次乘法会让噪声**显著膨胀**（近似二次增长，远不止翻倍）。类比：每复印一次，纸张上的噪点就厚一层，复印太多次就糊得看不清了。

3. **噪声控制：scale-invariant + 重线性化**：BFV 继承 Brakerski 的 scale-invariant 设计——密文相对模数的"比例"保持稳定，**不必像 BGV 那样靠模数切换管噪声**；乘法后密文维度从 2 涨到 3，重线性化再压回 2。论文里的模切主要用于简化 bootstrapping 分析，不是日常乘法的标配。

## 实践案例

### 案例 1：用 SEAL 风格 API 做 BFV 加密加法

（下列贴近 Microsoft SEAL 的 Python 绑定写法；装包名以官方/社区文档为准。）

```python
from seal import (EncryptionParameters, scheme_type, CoeffModulus,
                  SEALContext, KeyGenerator, Encryptor, Evaluator,
                  Decryptor, BatchEncoder, Plaintext, Ciphertext)

parms = EncryptionParameters(scheme_type.bfv)
parms.set_poly_modulus_degree(4096)          # 多项式度 n
parms.set_coeff_modulus(CoeffModulus.BFVDefault(4096))
parms.set_plain_modulus(1024)                # 明文模数 t
ctx = SEALContext(parms)

keygen = KeyGenerator(ctx)
pub, sec = keygen.public_key(), keygen.secret_key()
encoder = BatchEncoder(ctx)                  # 整数 ↔ 多项式槽
encryptor, evaluator = Encryptor(ctx, pub), Evaluator(ctx)
decryptor = Decryptor(ctx, sec)

# 四步：编码 → 加密 → 密文加法 → 解密
pt_a, pt_b = Plaintext(), Plaintext()
encoder.encode([42], pt_a); encoder.encode([10], pt_b)
ct_a, ct_b, ct_sum = Ciphertext(), Ciphertext(), Ciphertext()
encryptor.encrypt(pt_a, ct_a); encryptor.encrypt(pt_b, ct_b)
evaluator.add(ct_a, ct_b, ct_sum)            # 服务端无私钥
# decryptor.decrypt(ct_sum, ...) → 槽里是 52
```

逐部分解释：① 设 n / q / t（决定安全与乘法深度）；② 生成公私钥；③ `BatchEncoder` 把整数放进多项式槽再加密；④ 在密文上 `add`，解密得 52。

### 案例 2：密文乘法与重线性化

```python
relin_keys = keygen.relin_keys()
ct_prod = Ciphertext()
evaluator.multiply(ct_a, ct_b, ct_prod)      # 维度 2→3，噪声大涨
evaluator.relinearize_inplace(ct_prod, relin_keys)  # 压回维度 2
# 解密槽值 ≈ 420；不做 relinearize，连乘几次密文会胀到不可用
```

乘法后密文多一项，噪声也近似二次膨胀。`relinearize` 用重线性化密钥把维度压回 2，后续才能继续乘。

### 案例 3：批量打包（SIMD）

```python
pt_vec, pt_two, ct_batch, ct_doubled = Plaintext(), Plaintext(), Ciphertext(), Ciphertext()
encoder.encode([1, 2, 3, 4, 5, 6, 7, 8], pt_vec)
encryptor.encrypt(pt_vec, ct_batch)
encoder.encode([2] * 8, pt_two)
evaluator.multiply_plain(ct_batch, pt_two, ct_doubled)
# 解密得 [2, 4, 6, 8, 10, 12, 14, 16]——一条密文算 8 个槽
```

中国剩余定理（CRT）把环拆成多个槽，一次密文运算同时处理所有槽，吞吐量约提高 n 倍。

## 踩过的坑

1. **乘法深度有上限**：BFV 是 "somewhat" homomorphic——能做有限次乘法，不是无限。超过深度噪声就淹没明文，解密出垃圾。设计电路时必须先算乘法深度再选参数。

2. **参数选择互相牵制**：多项式度 n、系数模数 q、明文模数 t 三者耦合。n 太小不安全，q 太大太慢，t 太小溢出。论文给了参数推导方法，但实际工程仍需工具辅助。

3. **重线性化密钥本身就大**：重线性化密钥的大小和多项式度成正比。n=8192 时密钥可达几十 MB，存储和传输都是负担。

4. **浮点数用 BFV 会丢精度**：BFV 做的是模运算（整数环上的算术），浮点数需要先缩放成整数再算，精度损失大。浮点场景应该用 CKKS 方案而非 BFV。

## 适用 vs 不适用场景

**适用**：
- 加密数据上的整数算术（求和、统计、线性代数）
- 隐私保护的聚合统计（如医疗数据均值计算）
- 需要精确结果（非近似）的场景——BFV 是精确 FHE
- 批量处理大量相同运算——SIMD 打包让吞吐量倍增

**不适用**：
- 需要深度电路（几十层乘法）——BFV 的乘法深度有限，bootstrapping 代价高
- 浮点数或实数运算——用 CKKS 代替
- 高吞吐低延迟的在线服务——单次运算仍在毫秒级，不如明文计算
- 只需要加法同态——用 Paillier 更轻量

## 历史小故事（可跳过）

- **2009 年**：Craig Gentry 提出第一个全同态加密方案，基于理想格，用 bootstrapping 自举技术实现无限深度。但速度极慢——一次乘法要几十分钟。
- **2011 年**：Brakerski 和 Vaikuntanathan 提出基于 LWE 的 FHE 方案，引入维数模数切换控制噪声，比 Gentry 方案更简洁。
- **2012 年**：Fan 和 Vercauteren 把 Brakerski 的 LWE 方案搬到 Ring-LWE 上，提出优化的重线性化，这就是 BFV。同年 BGV 方案也提出——两条路线并行发展。
- **2015-2018 年**：Microsoft 发布 SEAL 库，BFV 成为主要方案之一。PALISADE、OpenFHE 相继支持 BFV 的 RNS 实现。
- **2018 年以后**：CKKS 方案（浮点 FHE）兴起，但 BFV 仍是精确整数运算的首选。

## 学到什么

1. **全同态加密的核心挑战是噪声**：加密时加的小噪声在运算中会增长，所有 FHE 方案的设计都在围绕"怎么控制噪声"做文章
2. **Ring-LWE 比 LWE 更高效**：把向量运算换成多项式环运算，利用 NTT（数论变换）加速，性能提升一个数量级
3. **"somewhat" 是务实选择**：论文标题说 "somewhat practical"——不追求无限深度，而是先让有限深度变得足够快、足够实用
4. **批处理是 FHE 实用的关键**：SIMD 打包让一个密文同时处理上千个整数，把单次运算的固定开销摊薄

## 延伸阅读

- 论文全文：[IACR ePrint 2012/144](https://eprint.iacr.org/2012/144)（8 页正文，数学密度高但推导完整）
- Microsoft SEAL 文档：[SEAL GitHub](https://github.com/microsoft/SEAL)（工业级 BFV 实现，有完整示例）
- MIT 讲义：[BFV Part 1](https://www.mit.edu/~linust/files/BFV_Homomorphic_Encryption_Part_1.pdf)（从原始论文角度逐步推导）
- [[gentry-fhe-2009]] —— FHE 的起点，理解 BFV 必须先理解 Gentry 的突破
- [[brakerski-bgv-2012]] —— 同期 Ring-LWE FHE，与 BFV 并称"算术 FHE 双雄"
- OpenFHE 文档：[openfhe.org](https://openfhe.org)（统一 FHE 库，BFV 的 RNS 实现细节参考）

## 关联

- [[gentry-fhe-2009]] —— Gentry 的开创性 FHE，BFV 是它的实用化后代
- [[brakerski-bgv-2012]] —— 同期 Ring-LWE FHE，与 BFV 并列，工程上经常二选一
- [[rsa]] —— 经典公钥加密，对比 FHE 的"加密态可计算"
- [[aes]] —— 对称加密，"锁上就别碰"的代表，BFV 打破了这个限制
- [[diffie-hellman-1976]] —— 密钥交换解决"如何安全通信"，FHE 解决"如何安全委托计算"
- [[zk-snark]] —— 零知识证明，另一种"不暴露信息做验证"的密码学工具
- [[dwork-dp-icalp-2006]] —— 差分隐私，用加噪声保护隐私，与 FHE 用加密保护隐私思路不同

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[brakerski-bgv-2012]] —— BGV 2012 — 不用自举也能做全同态加密
- [[chillotti-tfhe-2016]] —— TFHE 2016 — 把全同态加密的自举时间从分钟级压到 0.1 秒
- [[dwork-dp-icalp-2006]] —— 差分隐私 — 让统计结果有用但查不到任何一个人
- [[gentry-fhe-2009]] —— Gentry 2009 — 第一个全同态加密方案
- [[rsa]] —— RSA 公钥密码
- [[zk-snark]] —— zk-SNARK 零知识证明

