---
title: CRYSTALS-Dilithium — 格上的后量子数字签名
来源: 'Ducas et al., "CRYSTALS-Dilithium: A Lattice-Based Digital Signature Scheme", TCHES 2018'
日期: 2026-06-06
分类: 安全与隐私
子分类: 安全与隐私
难度: 高级
---

## 是什么

CRYSTALS-Dilithium（简称 **Dilithium**）是一种基于**模格（Module Lattice）**的数字签名方案。日常类比：RSA/ECDSA 的安全性类似"大锁"——量子计算机造出来之前谁也打不开；Dilithium 的安全性像"迷宫"——量子计算机在里面和经典计算机一样迷路。

签名的核心思路非常优雅：签名者先随机投出一个"掩码向量"承诺，再用密钥对消息散列做出"响应向量"，最后拒绝掉会泄露秘密的采样结果（rejection sampling）。验证方只需要做几次矩阵乘法检查一致性，不需要知道任何秘密。

2024 年，NIST 将 Dilithium 正式标准化为 **ML-DSA（FIPS 204）**，OpenSSL 3.x、AWS KMS、Cloudflare 等已陆续支持，是后量子时代 TLS 证书、代码签名、固件签名的主力算法。

## 为什么重要

不理解 Dilithium，下面这些事都没法解释：

- 为什么量子计算机能"10 秒破 RSA-2048"——Shor 算法利用大数分解的周期结构，但格问题没有这种周期
- 为什么 TLS 1.3 证书未来会换成 2.5 KB 公钥而不是 RSA 的 256 B——Dilithium 公钥确实更大，但"安全到 2100 年"值这个空间
- 为什么签名系统的随机数复用会是灾难——Dilithium 的 rejection sampling 假设掩码每次独立新鲜
- 为什么格密码比 ECDSA 容易抗侧信道——NTT 多项式乘法是常量时间的，没有椭圆曲线的点加条件分支

## 核心要点

Dilithium 算法可以拆成三个操作，每个都值得精确理解：

1. **KeyGen（密钥生成）**：系统生成一个公开的"随机数字大表格"矩阵 A，然后你秘密采样两个"小系数"向量 s1、s2（系数很小，像骰子结果）。公钥 = A 乘上 s1 再加 s2 的高位压缩（`t = A·s1 + s2`，矩阵乘法——大表格 × 一列数 → 结果还是一列数）；私钥就是 s1、s2 本身。类比：A 是公开黑板，s1/s2 是只有你知道的"小扰动"。

2. **Sign（签名）**：先随机投一个掩码向量 y（像投骰子），算出 `w = A·y`（同一个大表格乘新的一列），取 w 的"高位部分" w₁；然后用消息和 w₁ 一起算哈希挑战 `c = H(消息 ‖ w₁)`；最后响应 `z = y + c·s1`。若 z 或残差 r₀ 超出安全范围，**丢掉重来**（rejection sampling）——这一步保证签名分布不泄露 s1。

3. **Verify（验证）**：已知签名 (z, c) 和公钥，计算 `A·z - c·t` 的高位；如果等于原来的 w₁ 且 z 在界内就接受。类比：验证方用公开信息重建"承诺高位"，和签名者存的对上就通过——全程不需要知道 s1。

三个安全级别（Dilithium2/3/5）对应 NIST L2/L3/L5，通过调整矩阵尺寸和拒绝采样阈值来缩放安全强度。

## 实践案例

### 案例 1：用 liboqs 在 Python 里跑一次签名/验签

```python
import oqs  # pip install liboqs-python

# 选 ML-DSA-65（Dilithium3，NIST Level 3）
with oqs.Signature("ML-DSA-65") as signer:
    pk = signer.generate_keypair()
    message = b"Hello, post-quantum world"
    signature = signer.sign(message)
    print(f"签名长度: {len(signature)} bytes")  # 3309 bytes

# 验证（可单独分发 pk）
with oqs.Signature("ML-DSA-65") as verifier:
    ok = verifier.verify(message, signature, pk)
    print(f"验证结果: {ok}")  # True
```

关键点：liboqs 封装了 NIST 参考实现；Python 层不需要了解 NTT，直接给业务代码用。

### 案例 2：在 TLS 1.3 中替换证书签名算法

用 OQS-OpenSSL（open-quantum-safe/openssl）分支，把服务器证书签名从 ECDSA P-256 换成 ML-DSA-65：

```bash
# 生成 ML-DSA-65 私钥 + 自签名证书
openssl req -x509 -newkey mldsa65 -keyout server.key \
  -out server.crt -days 365 -nodes \
  -subj "/CN=pq-demo.example.com"

# 启动测试服务器
openssl s_server -cert server.crt -key server.key \
  -tls1_3 -port 4433

# 客户端握手并打印证书信息
openssl s_client -connect localhost:4433 \
  -tls1_3 2>&1 | grep "Server public key"
```

观察点：握手时延增加 ~0.5 ms（密钥/签名更大导致传输量增加），但计算延迟实际低于 RSA-3072。

### 案例 3：对 Docker 镜像做后量子代码签名

```python
import hashlib, oqs

def pq_sign_artifact(artifact_path: str, sk_bytes: bytes) -> bytes:
    """对制品文件的 SHA-3-256 摘要用 ML-DSA-65 签名"""
    with open(artifact_path, "rb") as f:
        digest = hashlib.sha3_256(f.read()).digest()
    # 用已有私钥初始化 signer（构造时传入 secret_key）
    with oqs.Signature("ML-DSA-65", secret_key=sk_bytes) as signer:
        return signer.sign(digest)

def pq_verify_artifact(artifact_path: str, sig: bytes, pk_bytes: bytes) -> bool:
    """验签：重算摘要后用公钥校验"""
    with open(artifact_path, "rb") as f:
        digest = hashlib.sha3_256(f.read()).digest()
    with oqs.Signature("ML-DSA-65") as verifier:
        return verifier.verify(digest, sig, pk_bytes)
```

集成到 CI/CD：在 pipeline 里先用私钥签名制品 SHA-3-256 摘要，部署时用公钥验证——签名链完全抗量子，无需改 Sigstore 上层接口。

## 踩过的坑

1. **随机数（nonce）复用**：Sign 内部每次采样的 y 必须用 CSPRNG 独立生成。若两次使用相同 y 签不同消息，攻击者可解方程恢复 s1——就像 Sony PS3 用固定随机数签固件导致私钥泄露的教训。

2. **拒绝采样无限循环**：实现时若忘记处理采样失败重试（应约 4-7 次后成功），直接输出超界的 z 会导致安全性降为零。标准 Python 参考实现含 `max_attempts` 上限，移植时一定要保留重试逻辑。

3. **参数版本混用**：Dilithium2（安全级 L2）和 Dilithium3（L3）的 q、n、k、l、γ1、γ2、τ 全都不同，序列化格式也不同。把一个级别签的数据拿另一级别验证，不是安全降级而是直接报错——务必在 API 层锁定算法标识符。

4. **侧信道泄露**：NTT 多项式乘法必须常量时间执行，若移植到嵌入式平台时引入条件分支（如朴素的模约简），时序攻击可恢复部分秘密。建议直接用 PQClean 或 liboqs 的 ARM/AVX2 优化实现，而不是自己写。

## 适用 vs 不适用场景

**适用**：
- 需要抗量子攻击的长生命期密钥（CA 证书、固件签名、代码签名——预计 10+ 年有效期）
- 服务端 TLS 证书签名（算法侧延迟 < 1 ms，可接受）
- 批量签名场景（NTT 吞吐率高，GPU 实现可达每秒百万次签名）
- 替换 ECDSA / Ed25519 的场景（API 接口一对一替换，只是密钥/签名更大）

**不适用**：
- 受带宽严格约束的 IoT 设备（Dilithium2 签名 2420 B vs Ed25519 的 64 B，差 40 倍）
- 存储空间极小的嵌入式系统（公钥 1312 B，内存 < 4 KB 的 MCU 困难）
- 需要非交互零知识证明的场景（Dilithium 不提供 ZK 性质，改用 STARK / Bulletproofs）
- 现有硬件密码加速器（大部分 HSM 尚未原生支持 NTT 加速，需软件实现）

## 历史小故事（可跳过）

- **2005 年**：Oded Regev 提出 LWE（Learning With Errors）困难问题，奠定格密码现代基础——连量子计算机也无法高效求解。
- **2012 年**：Vadim Lyubashevsky 在 Fiat-Shamir-with-Aborts 框架内设计了首个实用格签名，核心思想就是"掩码 + 拒绝采样"，Dilithium 是其直接演化。
- **2017 年 6 月**：Ducas、Lepoint 等六位作者将 CRYSTALS-Dilithium 提交给 NIST 后量子标准化征集（Round 1）。同期提交了同一套件的密钥封装算法 Kyber（现 ML-KEM）。
- **2022 年 7 月**：NIST 宣布 Dilithium 胜出，选为主力签名算法，Falcon（另一种格签名）作为备选保留。
- **2024 年 8 月**：FIPS 204（ML-DSA）正式发布，标志着后量子密码从研究走向法规强制。OpenSSL 3.4 同年支持。

## 学到什么

1. **安全性可以来自"混乱"而非"大数"**——格密码用高维空间的随机噪声代替大整数分解，量子计算机提速幂次有限
2. **拒绝采样是密码系统设计的精妙工具**——让随机性对外不可预测的同时，签名分布独立于密钥
3. **效率与安全性不必二选一**——NTT 把多项式乘法压到 O(n log n)，Dilithium 在软件层速度超过 RSA-3072
4. **标准化是密码学的最后一公里**——NIST PQC 竞赛历时 7 年，过程中发现并修复多个提案的侧信道漏洞，标准化才让工业界敢于部署

## 延伸阅读

- 官方论文 PDF：[IACR ePrint 2017/633](https://eprint.iacr.org/2017/633)（TCHES 2018 版本，含完整安全证明）
- FIPS 204 标准：[NIST ML-DSA](https://csrc.nist.gov/pubs/fips/204/final)（正式规范，含测试向量）
- 参考实现：[PQClean/dilithium](https://github.com/PQClean/PQClean/tree/master/crypto_sign)（纯 C，无外部依赖）
- [[bos-kyber-2018]] —— 同 CRYSTALS 套件的密钥封装算法 ML-KEM
- [[regev-lwe-2005]] —— Dilithium 安全性归约的数学基础 LWE

## 关联

- [[bos-kyber-2018]] —— 同 CRYSTALS 套件，密钥封装方向；Dilithium 签名 + Kyber 加密构成完整后量子 PKI
- [[regev-lwe-2005]] —— Module-LWE 难题是 Dilithium 安全证明的数学归约起点
- [[brakerski-bgv-2012]] —— 同为格密码，BGV/BFV 是全同态加密方向，Dilithium 是签名方向
- [[rsa]] —— 被 Shor 算法威胁的前辈签名方案；Dilithium 在后量子时代承接其代码签名职责
- [[diffie-hellman-1976]] —— 公钥密码学的起点；Dilithium 延续"公钥公开、私钥保密"的架构但换了数学底座
- [[aes]] —— 对称密码与 Dilithium 互补：AES 负责数据加密，Dilithium 负责身份认证
- [[ben-sasson-stark-2018]] —— 同为后量子密码学工具但路线不同：STARK 基于哈希，Dilithium 基于格

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
