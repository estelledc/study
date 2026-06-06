---
title: CRYSTALS-Dilithium — 量子计算机来了也签不掉的数字签名
来源: 'Ducas, Kiltz, Lepoint et al. "CRYSTALS-Dilithium: A Lattice-Based Digital Signature Scheme". TCHES 2018'
日期: 2026-06-06
分类: 安全与隐私
子分类: 安全与隐私
难度: 中级
---

## 是什么

Dilithium 是一个**让量子计算机也无法伪造签名**的数字签名方案。日常类比：普通的电子签名就像锁上了一把用数字做的锁——量子计算机可以用 Shor 算法十分钟开锁；Dilithium 换了一把用"格子问题"做的锁，目前没有任何量子算法能高效破解。

你可以把"格子"理解成一个高维空间里密密麻麻的点阵，就像一个超级复杂的多维棋盘。在这个棋盘里找一条最短路径是数学上的 NP 困难问题，量子计算机对此也没有指数级加速的办法。

Dilithium 是 CRYSTALS（代数格密码套件）的签名组件，搭档是加密方案 Kyber。2024 年它以 **ML-DSA**（Module Lattice-Based Digital Signature Algorithm）的名字被 NIST 收录为 FIPS 204 标准，成为政府和工业界后量子签名的官方算法。

## 为什么重要

不理解 Dilithium，下面这些事都没法解释：

- 为什么 2030 年之前所有 TLS 证书、代码签名证书都要替换成后量子算法——现有 RSA/ECDSA 证书在量子计算机面前相当于没加密
- 为什么 HSM（硬件安全模块）厂商在 2024 年后统一支持 ML-DSA，而不只是加 Kyber
- 为什么格密码实现比 RSA 实现更难写对——错误往往不在数学上而在侧信道上
- 为什么 NIST PQC 标准化耗时 7 年（2016-2024）——选算法不只看安全，更看"全世界程序员能不能安全地把它写进芯片"

## 核心要点

1. **Fiat-Shamir with Aborts：签名是"不断重试直到无法泄密"的结果**
   传统的 Fiat-Shamir 协议会把秘密密钥的信息混进签名里。Dilithium 的解决方案是：签名时生成一个随机掩码向量 y，计算出候选签名 z = y + c·s1（c 是消息哈希）。如果 z 的系数太大（可能暴露 s1），就**丢弃这次签名、重新来过**。这个"拒绝采样"机制保证最终输出的 z 和秘密密钥统计上无关联。
   类比：就像写考场答案时，如果草稿上的字迹可能暴露你的笔迹习惯，你就撕掉重写，直到交出去的答案看不出任何笔迹特征。

2. **Hint 机制：用 1 bit 换掉 10 位公钥**
   Dilithium 的公钥中故意省略了 t 向量的低阶比特，让公钥从 3.5KB 压缩到 1.3KB。验证时，验证者不能完整重算 Az - ct 的精确值。解决办法是：签名者在签名里附一个小小的"提示"向量 h，告诉验证者"哪些位置有进位"。
   类比：你只发给对方账单的整数部分，零钱另附一张"哪几笔有四舍五入"的备注——对方加在一起就能还原完整金额，但通信量更少。

3. **Module 格：在速度和安全之间取中间档**
   早期格签名用 Ring-SIS/Ring-LWE，安全性依赖单个多项式环的特殊结构，一旦那个环被攻破就全完了。Dilithium 用 Module 格（k×l 矩阵，每个元素是多项式环里的元素）。它比纯 Ring 方案保守：用多个多项式并排，使安全性不依赖单一环的特殊性；比纯 LWE 方案高效：仍然可以用 NTT（数论变换，多项式乘法的快速算法）加速。
   类比：Ring 格是单线程、纯 LWE 是单核慢速、Module 格是多核中等速——Dilithium 选了工程上最合理的中间方案。

## 实践案例

### 案例 1：用 Python（pqcrypto 库）签名和验证

```python
from pqcrypto.sign.dilithium3 import generate_keypair, sign, verify

# 密钥生成
pk, sk = generate_keypair()
print(f"公钥大小: {len(pk)} bytes")   # ~1952 bytes (Dilithium3)
print(f"私钥大小: {len(sk)} bytes")   # ~4000 bytes

# 签名
message = b"Hello, post-quantum world"
signature = sign(message, sk)
print(f"签名大小: {len(signature)} bytes")  # ~3293 bytes

# 验证
try:
    verified_msg = verify(message, signature, pk)
    print("验证通过")
except Exception:
    print("验证失败 / 签名被篡改")
```

**逐部分解释**：
- `generate_keypair()` 内部生成矩阵 A（从随机种子展开）、秘密向量 s1/s2、公钥 t = As1 + s2
- `sign()` 调用 Fiat-Shamir with Aborts 循环，平均 4-7 次才找到合法签名
- `verify()` 只用公钥重建 w1' = HighBits(Az - ct)，检查它和签名中记录的 w1 一致

### 案例 2：TLS 握手中切换为 ML-DSA 证书

```bash
# 生成 Dilithium3 私钥和自签名证书（OpenSSL 3.x 支持）
openssl genpkey -algorithm dilithium3 -out server.key
openssl req -new -x509 \
  -key server.key \
  -out server.crt \
  -subj "/CN=example.com" \
  -days 365

# 查看证书的签名算法
openssl x509 -in server.crt -text -noout | grep "Signature Algorithm"
# 输出: Signature Algorithm: id-ML-DSA-65 (即 Dilithium3)
```

**关键点**：
- 证书本身的结构（Subject、Validity、SubjectPublicKeyInfo）不变，只是签名算法从 `ecdsa-with-SHA256` 换成了 `id-ML-DSA-65`
- 公钥从 64 bytes（P-256）变成 1952 bytes——这是后量子的代价，但握手次数不变
- 浏览器需要支持 ML-DSA 扩展才能验证，过渡期常见做法是**混合证书**（ECDSA + ML-DSA 双签名）

### 案例 3：理解拒绝采样的统计意义

```python
import random

# 简化版拒绝采样演示（不是真正的 Dilithium，只是说明原理）
def sign_with_rejection(secret, gamma1, beta):
    """签名直到找到不暴露秘密的 z"""
    attempts = 0
    while True:
        attempts += 1
        # 生成随机掩码 y
        y = [random.randint(-gamma1, gamma1) for _ in range(4)]
        # 假设挑战 c 已经确定
        c_weight = 2  # 简化：c 的非零系数
        # 候选签名 z = y + c*s（secret 系数最大为 beta//c_weight）
        z = [yi + c_weight * si for yi, si in zip(y, secret)]
        # 检查：z 的系数不能太大（会泄露 secret）
        if all(abs(zi) < gamma1 - beta for zi in z):
            print(f"第 {attempts} 次尝试成功")
            return z  # z 的分布与 secret 无关

secret = [2, -1, 3, -2]  # 假设秘密系数
sign_with_rejection(secret, gamma1=100, beta=10)
# 输出类似: 第 5 次尝试成功
```

**要点**：返回的 `z` 统计上是均匀分布在 [-gamma1+beta, gamma1-beta] 范围内，即使攻击者收集上千个签名也无法从 z 的分布反推 secret。

## 踩过的坑

1. **随机数（nonce）复用必死**：签名中的掩码向量 y 如果在两条不同消息的签名里相同，攻击者联立两个方程 z1 = y + c1·s1，z2 = y + c2·s1 可直接求解 s1——就像 ECDSA 的 nonce 重用漏洞一样致命。Dilithium 的对策是确定性签名（用私钥种子 + 消息一起派生 y），但自己动手改随机数生成绝对不能省略这一步。

2. **非常数时间的大小比较会被时序攻击**：拒绝采样里有 `if |z| >= gamma1 - beta then reject`，这个分支耗时不同。攻击者通过精确测量签名耗时可以推断有多少次被拒绝，进而了解密钥分布。所有比较必须用 constant-time 掩码比较（libsodium 的 `crypto_verify_*` 系列）。

3. **Hint 向量 h 验证必须严格**：验证方在解析签名时如果不检查 h 的 Hamming 重量上限（Dilithium3 中 ≤ 55），攻击者可以伪造 h 来绕过某些安全保障。OpenSSL 早期实现就漏了这个检查（CVE-2023-5678 相关补丁）。

4. **参数级别混用导致静默错误**：Dilithium2、Dilithium3、Dilithium5 的密钥格式不兼容，但序列化时不强制带版本标签。用 Dilithium2 的私钥尝试验证 Dilithium3 的签名，某些实现不报错而是静默返回"验证失败"——在自动化流水线里很难察觉。

## 适用 vs 不适用场景

**适用**：
- 服务器 TLS 证书签名（后量子迁移第一优先级）
- 代码签名、固件验证、软件包签名
- 政府/军事文件签名（FIPS 204 合规场景）
- 混合签名过渡期：ECDSA + ML-DSA 双签名，同时向前兼容和向后安全
- HSM 芯片内置，对签名延迟不敏感的场景（1-5ms 范围内可接受）

**不适用**：
- 嵌入式 IoT 设备（公钥 1.3KB + 签名 2.4KB 对内存只有几 KB 的 MCU 太重）
- 区块链交易签名（每笔交易的签名存储成本会从 64 bytes 升至 ~2.4KB，链上存储爆炸）
- 需要极低延迟签名的高频场景（每次签名约 0.6ms，对 HFT 类应用可能太慢）
- 已有强量子安全要求但带宽极受限的通信链路（优先考虑更小的 Falcon 方案）

## 历史小故事（可跳过）

- **2016 年**：NIST 宣布后量子密码标准化征集，全球密码学界提交 82 个方案。Ducas（CWI 荷兰）、Kiltz（波鸿大学）、Lyubashevsky（IBM Zurich）等七人组成团队提交 Dilithium。
- **2017 年**：ePrint 预印本发布，同年提交 NIST Round 1。算法名来自《星际迷航》中的 Dilithium 晶体——一种能调节反物质反应炉的稀有矿物，隐喻"量子时代的密码燃料"。
- **2019-2020 年**：Round 2 期间，团队发现原方案的高斯采样版本实现风险太高，果断删除，统一到均匀采样+拒绝采样版本——简洁性胜过了理论上的效率优化。
- **2021 年**：入选 Round 3 最终候选。同年学界发表多篇针对实现的侧信道攻击论文，团队积极配合修复，证明方案本身的数学基础没有问题，问题都在实现层。
- **2024 年 8 月**：NIST 正式发布 FIPS 204（ML-DSA），Dilithium 成为全球第一个联邦后量子签名标准。微软、谷歌、Cloudflare 相继宣布在产品中支持 ML-DSA。

## 学到什么

1. **安全性的敌人是实现复杂度，不是数学**：Dilithium 故意删掉高斯采样（虽然用高斯采样签名更小），因为常数时间高斯采样极难写对。宁要大一点的签名，也要每个实现者都能安全落地。
2. **拒绝采样是把"输出分布"和"秘密分离"的通用工具**：只要最终输出的分布独立于秘密，就算中间计算用到了秘密也无妨。这个思路贯穿格签名、差分隐私和零知识证明。
3. **模块化设计让安全级别调节变成参数调节**：Dilithium 改变 k、l 就能升降安全级，底层多项式环不变——硬件加速器可以复用同一个 NTT 核心。
4. **后量子迁移是工程问题，不是数学问题**：算法本身 2017 年就成熟了，2024 年才标准化，中间七年都是在对抗"我能不能安全部署它"的工程不确定性。

## 延伸阅读

- NIST FIPS 204 官方文档：[ML-DSA Standard (FIPS 204)](https://csrc.nist.gov/pubs/fips/204/final)（正式标准，含完整参数和测试向量）
- 原始论文 PDF：[CRYSTALS-Dilithium TCHES 2018](https://eprint.iacr.org/2017/633.pdf)（算法设计动机和安全证明，适合想理解"为什么这么设计"的读者）
- 实现参考：[pq-crystals/dilithium on GitHub](https://github.com/pq-crystals/dilithium)（官方 C + AVX2 参考实现，带测试向量）
- Lyubashevsky 讲解视频：[Lattice-Based Crypto at Eurocrypt 2020](https://www.youtube.com/watch?v=K026C5YaB3A)（作者之一亲讲格签名原理，适合无背景入门）
- [[bos-kyber-2018]] —— Kyber 是同一 CRYSTALS 套件的加密组件，与 Dilithium 配套使用
- [[regev-lwe-2005]] —— LWE 困难问题是 Dilithium 安全性的数学根基

## 关联

- [[bos-kyber-2018]] —— CRYSTALS 家族的加密兄弟，密钥交换用 Kyber、签名用 Dilithium，TLS 两个都需要
- [[regev-lwe-2005]] —— Regev 的 LWE 问题是 Module-LWE 的前身，Dilithium 的安全归约最终落到这里
- [[rsa]] —— Dilithium 要取代的经典方案，RSA 签名被量子 Shor 算法攻破后 Dilithium 是接班人
- [[aes]] —— AES 是对称密码中的量子安全幸存者（Grover 只把安全位减半），与 Dilithium 的格密码形成后量子时代的双支柱
- [[tls-1.3]] —— TLS 1.3 握手中服务器证书签名是 Dilithium 最重要的落地场景，混合签名草案已进入 IETF 标准轨道
- [[diffie-hellman-1976]] —— Diffie-Hellman 密钥交换的量子威胁与 RSA 同源，配合 Kyber/Dilithium 构成完整后量子 TLS

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[bernstein-sphincs-2015]] —— SPHINCS — 无状态哈希签名，后量子密码的"保险"
- [[bos-kyber-2018]] —— CRYSTALS-Kyber: A CCA-Secure Module-Lattice-Based KEM
- [[regev-lwe-2005]] —— On Lattices, Learning with Errors, Random Linear Codes, and Cryptography
- [[rsa]] —— RSA 公钥密码

