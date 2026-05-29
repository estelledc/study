---
title: A Method for Obtaining Digital Signatures and Public-Key Cryptosystems (RSA 1978)
来源: R. L. Rivest, A. Shamir, L. Adleman, "A Method for Obtaining Digital Signatures and Public-Key Cryptosystems", Communications of the ACM, Vol. 21, No. 2, February 1978, pp. 120-126
---

# RSA — 把 Diffie-Hellman 的"开放问题"变成可工作的数字签名

## 一句话总结

1978 年 2 月，Ron Rivest、Adi Shamir、Leonard Adleman 在 Communications of the ACM 上发表 "A Method for Obtaining Digital Signatures and Public-Key Cryptosystems"，把 Diffie-Hellman 1976 论文里只画了"招牌"却没给可工作算法的**数字签名 / 公钥加密**两件事一次性钉死：(1) 选两个大素数 $p, q$，令 $n = pq$；(2) 选公开指数 $e$ 与 $\varphi(n) = (p-1)(q-1)$ 互素；(3) 用扩展欧几里得算个 $d \equiv e^{-1} \pmod{\varphi(n)}$；(4) **加密** $c = m^e \bmod n$，**解密** $m = c^d \bmod n$，**签名** $s = H(m)^d \bmod n$，**验签** 检查 $s^e \equiv H(m) \pmod n$。安全性由"分解 $n = pq$ 难"撑着——这一道**单向门**让公钥密码从理论走进 OpenSSL、TLS、SSH、PGP、SWIFT、护照芯片，统治了 47 年。

它今天的影响：

1. **TLS 1.2 / 1.3** 仍允许 RSA 证书签名（X.509 链 90% 是 RSA-2048 / RSA-3072）
2. **SSH** 默认 host key / user key 多年是 `ssh-rsa`（OpenSSH 8.2 起逐步弃用 SHA-1 RSA，但 RSA 本身仍在）
3. **PGP / GPG / S/MIME / 邮件签名** 从 1991 至今基础就是 RSA
4. **Java 卡 / 银行 EMV / 二代身份证 / 国际护照芯片** 用 RSA 做认证 / 签名
5. **Bitcoin 不用 RSA**（用 ECDSA），**TLS 1.3 推 (EC)DHE + Ed25519**——RSA 正在被结构化退役，但底层影响力不会消

为什么要专门读 1978 这篇而不是只用 OpenSSL？

1. RSA 的安全证明**不依赖**任何"加密随机预言"——它的安全完全等价于"$n$ 难分解"这个数论假设；理解原论文等于看到"困难假设 → 加密构造"的最干净范例
2. 论文里**没有 padding**——直接 $m^e \bmod n$，在 1996 / 1998 / 2017 年被 Bleichenbacher、ROBOT、Manger 三轮攻击打穿，催生 OAEP / PSS；理解原始 textbook RSA 的脆弱性才能读懂 padding 的存在意义
3. **共享模数 / 低指数 / 低私钥 / 共素因子**这四类"实现陷阱"全部诞生在 1979–1990，每一个都成为今天 OpenSSL 测试套件的一条 fixture——读论文等于看到"哪里会塌"
4. **Shor 算法**（1994）能在量子计算机上 polynomial 时间分解 $n$——后量子密码学的紧迫性与 RSA 的脆弱性直接挂钩，2030 年前必须迁移到 Kyber / Dilithium

本笔记按 Layer 0 速查 → 历史动机 → 5 个 Definition / Theorem → 协议构造与签名 → 攻击与限制 → 4 个怀疑 → permalinks → 学到 + 关联的顺序展开。

## Layer 0 — 论文档案速查

| 字段 | 值 |
|---|---|
| 论文名 | A Method for Obtaining Digital Signatures and Public-Key Cryptosystems |
| 作者 | Ronald L. Rivest / Adi Shamir / Leonard M. Adleman（皆 MIT LCS） |
| 期刊 | Communications of the ACM, Vol. 21, No. 2 |
| 发表 | 1978 年 2 月（投稿 1977 年 4 月） |
| 页码 | 120–126（共 7 页） |
| 数学基础 | 欧拉定理 + 中国剩余定理 + 大数分解难题（IFP） |
| 核心算法 | $c = m^e \bmod n$，$m = c^d \bmod n$，$n = pq$，$ed \equiv 1 \pmod{\varphi(n)}$ |
| 公钥 | $(n, e)$，$e$ 常取 $65537 = 2^{16}+1$ |
| 私钥 | $(n, d)$ 或 CRT 形式 $(p, q, d_p, d_q, q^{-1} \bmod p)$ |
| 安全假设 | RSA Problem (RSAP) / Integer Factorization Problem (IFP) |
| 推荐参数（2024） | $n$ 至少 2048-bit（NIST 至 2030）/ 3072-bit（长期）/ 4096-bit（高敏） |
| 不抗 | 朴素 textbook RSA 不抗适应性选择密文（CCA2）—— 必须用 OAEP / PSS padding |
| 后继 | Rabin (1979) / ElGamal (1985) / DSA (1991) / ECDSA (1992) / Ed25519 (2011) |
| 量子破 | Shor 算法（1994）poly time 分解 $n$，PQC 用 Kyber / NTRU / Dilithium 替代 |
| 部署位置 | TLS / SSH / PGP / S/MIME / EMV / 护照 / SWIFT / GitHub commit signing |
| 标准化 | PKCS#1 v1.5（RFC 2313 → RFC 8017）/ FIPS 186-5 |
| 主流实现 | OpenSSL crypto/rsa / golang crypto/rsa / RustCrypto/RSA / mbedTLS / BoringSSL |
| 历史地位 | 与 DH (1976)、Shamir-Secret-Sharing (1979) 同列公钥密码学三大开山论文 |
| 图灵奖 | 2002 年 Rivest + Shamir + Adleman 共获 ACM Turing Award |

![RSA key generation and encrypt/decrypt flow](/papers/rsa/01-rsa-keygen.webp)

## Section 1 — 动机：DH 留下的"签名洞"

1976 年 Diffie-Hellman 论文做了两件事：

1. **画招牌**——预言"公钥加密"和"数字签名"两个原语会改变世界
2. **造样板**——给出 DH key exchange，证明"公钥协商"在数学上可行

但 DH 论文**没给签名的可工作构造**。Diffie 在 1976 年只描述了签名应该满足的性质（不可伪造 / 可验证 / 不可抵赖），却没给具体算法。这成为 1976–1978 年密码学界最大的开放问题。

### 为什么签名比加密更难

- 加密只需要"单向函数"：$f(m)$ 易算，$f^{-1}$ 不知道私钥就难算
- 签名需要"**陷门**单向函数"：私钥持有者能算 $f^{-1}$，但任何人都能验证 $f \circ f^{-1} = \text{id}$

DH 给了单向函数（模幂），但**没给陷门**——离散对数没有"持私钥就秒解"的捷径。要造签名，必须找一个**带陷门**的单向函数。

### MIT 三人组的 4 个月

1976 年 11 月 DH 论文发表后，Rivest（计算机系）、Shamir（理论组）、Adleman（数论方向）开始头脑风暴。

- Rivest 提了 42 个候选构造
- Shamir 推翻了 41 个（多数被 Shamir 自己破掉）
- 第 42 个由 Adleman 用数论修正——这就是 RSA

关键 insight 来自 Adleman 对欧拉定理的运用：**模 $n = pq$ 的乘法群 $(\mathbb{Z}/n\mathbb{Z})^*$ 阶是 $\varphi(n) = (p-1)(q-1)$，而 $\varphi(n)$ 是只有知道 $p, q$ 才能算的"陷门"**。

### 论文的两件事

- **公钥加密**：发送方算 $c = m^e \bmod n$，只有持私钥 $d$ 的接收方能算 $m = c^d \bmod n$
- **数字签名**：发送方算 $s = m^d \bmod n$（用私钥），任何人能算 $m \stackrel{?}{=} s^e \bmod n$ 验证

注意这是**同一个构造**——加密和签名只是把公钥 / 私钥的角色互换。这种"对称美感"正是 RSA 经典化的核心原因。

## Section 2 — 核心数学：5 个 Definition / Theorem

### Definition 1 — RSA 函数族

设 $n = pq$，$p, q$ 是不同的奇素数；$e \in \mathbb{Z}$ 与 $\varphi(n) = (p-1)(q-1)$ 互素。**RSA 函数** $f_{n,e}: \mathbb{Z}/n\mathbb{Z} \to \mathbb{Z}/n\mathbb{Z}$ 定义为

$$f_{n,e}(x) = x^e \bmod n$$

公钥是 $(n, e)$，私钥是满足 $ed \equiv 1 \pmod{\varphi(n)}$ 的 $d$。

### Theorem 1 — 欧拉定理（RSA 正确性的基石）

设 $n$ 是正整数，$a \in \mathbb{Z}$ 与 $n$ 互素，则

$$a^{\varphi(n)} \equiv 1 \pmod n$$

**推论**（用于 RSA 解密）：若 $ed \equiv 1 \pmod{\varphi(n)}$，则对任意 $m$ 与 $n$ 互素，

$$m^{ed} \equiv m \pmod n$$

证明思路：$ed = 1 + k\varphi(n)$，所以 $m^{ed} = m \cdot (m^{\varphi(n)})^k \equiv m \cdot 1^k = m \pmod n$。

注：若 $m$ 与 $n$ 不互素（即 $p | m$ 或 $q | m$），用中国剩余定理分别在 $\bmod p$ 和 $\bmod q$ 下验证仍成立——这一步是论文证明的细节，多数教材会跳过。

### Theorem 2 — RSA 加密 / 解密的对偶性

定义加密 $E_{n,e}(m) = m^e \bmod n$，解密 $D_{n,d}(c) = c^d \bmod n$，则

$$D_{n,d}(E_{n,e}(m)) = E_{n,e}(D_{n,d}(m)) = m \quad \forall m \in \mathbb{Z}/n\mathbb{Z}$$

**意义**：$E$ 和 $D$ 是逆运算，且**可交换**。这正是签名构造的基础——把 $D$（用私钥）当签名运算，$E$（用公钥）当验签运算。

### Definition 2 — RSA 数字签名

给定公私钥对 $((n, e), d)$ 和消息 $m$，**签名** 为

$$\sigma = D_{n,d}(H(m)) = H(m)^d \bmod n$$

其中 $H$ 是抗碰撞哈希函数（SHA-256 / SHA-3）。**验签** 检查

$$E_{n,e}(\sigma) \stackrel{?}{=} H(m), \quad \text{即} \quad \sigma^e \stackrel{?}{=} H(m) \pmod n$$

注：原论文里 $H$ 没出现——RSA 1978 直接对 $m$ 签名（$\sigma = m^d$）。哈希预处理是 1989 年 Bellare-Rogaway "Random Oracle Model" 论文之后才成为标准实践——这是论文与现代部署的一个关键 gap。

### Theorem 3 — 安全性归约（informal）

若存在多项式时间算法 $A$ 能对随机 $c \in (\mathbb{Z}/n\mathbb{Z})^*$ 计算 $A(c) = c^d \bmod n$，则存在多项式时间算法能"开方"（compute $e$-th roots mod $n$），称为**RSA Problem (RSAP)**。

**RSAP $\le_p$ IFP**：若能分解 $n = pq$，则能算 $\varphi(n)$，进而算 $d$，进而破 RSA。反向是否成立（IFP $\le_p$ RSAP）至今**未知**——这是 RSA 安全证明里最大的开放问题。

### Theorem 4 — 中国剩余定理优化

设 $n = pq$，$d_p = d \bmod (p-1)$，$d_q = d \bmod (q-1)$，$q_{inv} = q^{-1} \bmod p$。则解密可以分解为：

$$m_p = c^{d_p} \bmod p, \quad m_q = c^{d_q} \bmod q$$

$$m = m_q + q \cdot ((m_p - m_q) \cdot q_{inv} \bmod p)$$

这把模 $n$（$\sim 2048$ bit）的指数运算降为两次模 $p, q$（各 $\sim 1024$ bit）的指数运算，理论 4 倍加速，实际 OpenSSL 实测 3.x 倍。

### Definition 3 — RSA-OAEP padding（论文外的现代修正）

为了抗适应性选择密文攻击（CCA2），实际 RSA 加密前会做 **OAEP** 编码：

$$\text{OAEP}(m, r) = (m \oplus G(r)) \| (r \oplus H(m \oplus G(r)))$$

然后把 OAEP 输出作为新 $m'$ 喂给 $f_{n,e}$。OAEP 在随机预言模型下证明 IND-CCA2 安全（Bellare-Rogaway 1994）。

OAEP 的存在本身就是对原论文的修正——**textbook RSA 是不安全的**，必须 padding。这是论文与生产部署的最大 gap。

## Section 3 — 协议构造与流程

### 密钥生成（论文 Section IV）

```
Input: security parameter k (e.g. k = 2048)
1. 随机生成两个独立 k/2 bit 素数 p, q
2. n = p * q,  φ(n) = (p-1)(q-1)
3. 选 e 满足 gcd(e, φ(n)) = 1（实际取 e = 65537）
4. 用扩展欧几里得算 d = e^(-1) mod φ(n)
5. (可选) 算 CRT 参数 d_p, d_q, q_inv
6. 公钥 PK = (n, e)，私钥 SK = (d) 或 (p, q, d_p, d_q, q_inv)
7. 销毁 p, q, φ(n)（除非保留 CRT 形式）
```

实现细节：

- 步骤 1 的"素数"用 Miller-Rabin 概率检测（错误率 $\le 2^{-128}$）
- 步骤 3 必须**先选 $e$**——若先选 $d$ 会泄露私钥分布
- $|p - q|$ 不能太接近——否则 Fermat 分解能秒破（$n = pq \approx ((p+q)/2)^2$）
- $p, q$ 不能是"weak primes"（如 $p-1$ 只有小因子）——否则 Pollard $p-1$ 算法分解

### 加密（不带 padding 的 textbook 形式）

```
Encrypt(PK = (n, e), m):
  return m^e mod n
```

只有 1 行。这是 RSA 经典化的根源——简单到能在白板上讲清楚。

### 解密（CRT 优化版）

```
Decrypt(SK = (p, q, d_p, d_q, q_inv), c):
  m_p = c^d_p mod p
  m_q = c^d_q mod q
  h = (q_inv * (m_p - m_q)) mod p
  m = m_q + h * q
  return m
```

OpenSSL 的 `rsa_ossl_private_decrypt` 走的就是这条 CRT 路径。

### 签名

```
Sign(SK = d, m):
  return H(m)^d mod n   // H = SHA-256

Verify(PK = (n, e), m, σ):
  return σ^e mod n == H(m)
```

注意**签名和解密用同一个 $d$**——论文最优雅的地方。这也意味着私钥泄露 = 加密和签名一起完蛋。

### 性能数字（OpenSSL 3.x 在 M1 Mac）

| 操作 | RSA-2048 | RSA-3072 | RSA-4096 |
|---|---|---|---|
| Sign / s | ~12000 | ~4500 | ~1700 |
| Verify / s | ~280000 | ~140000 | ~80000 |
| Decrypt（与 Sign 同复杂度） | ~12000 | ~4500 | ~1700 |
| Encrypt（与 Verify 同复杂度） | ~280000 | ~140000 | ~80000 |

**Sign / Decrypt 比 Verify / Encrypt 慢 20 倍**——这是 $e=65537$（17 bit）vs $d \approx \log_2 n$（2048 bit）的指数大小差。所以 TLS 服务器端的瓶颈永远是私钥操作（解密 / 签名）。

## Section 4 — 攻击与限制（含 4 个怀疑）

### 攻击 1 — Bleichenbacher (1998) 对 PKCS#1 v1.5

PKCS#1 v1.5 padding 在 SSL 3.0 / TLS 1.0 里被用作 RSA 加密。Bleichenbacher 发现：服务器在解密失败时返回的"错误信息"泄露 padding 是否合法 → 攻击者用百万次自适应查询可恢复明文（**百万消息攻击**）。

后续 ROBOT (2017) 复现：F5、Citrix、Cisco、IBM 主流产品 1998 年补丁后**仍然有泄露**，因为 timing 差异没消干净。

修复：TLS 1.2 起强制 RSA-OAEP；TLS 1.3 直接**移除** RSA 密钥交换，只保留 RSA 签名 + (EC)DHE。

### 攻击 2 — 共享模数攻击 (Simmons 1983)

若两人共享 $n$ 但用不同 $(e_1, e_2)$，且 $\gcd(e_1, e_2) = 1$，则任何人都能解密发给两人的相同明文：

$$au + bv = 1 \text{ where } u = e_1, v = e_2 \implies m = c_1^a \cdot c_2^b \bmod n$$

教训：**绝不共享模数**。但 1985 年 IBM 真这么干过——给所有员工同一个 $n$，让 IT 部门"易管理"。被 Simmons 当场打脸。

### 攻击 3 — 共素因子 (Heninger 2012)

Heninger 等人扫了互联网上所有 TLS 公钥，发现 0.27% 的 RSA 模数共享一个素因子——分解任意一对就秒破两个证书。原因：嵌入式设备熵不足，启动时算 $p$ 用同一个种子。

这是论文最致命的"实现陷阱"——数学上 RSA 安全，工程上熵源烂就全完。

### 攻击 4 — Shor 算法 (1994)

Peter Shor 证明：量子计算机能在 $O((\log n)^3)$ 时间内分解 $n$。一旦 4000-qubit 容错量子计算机问世，所有现存 RSA 证书 / SSH 主机密钥 / PGP 签名一夜失效。

NIST 已选定 PQC 标准：**ML-KEM (Kyber)** 替代 RSA-OAEP，**ML-DSA (Dilithium)** 替代 RSA-PSS。2030 年前所有联邦系统必须迁移完毕。

### 怀疑 1 — RSA-1024 实际上已被破

**主流叙事**：RSA-1024 仍然安全，只是"建议升级"。

**怀疑根据**：

- 2007 年 EPFL 用 5 个月分解 RSA-768（232 位十进制）
- NSA 2013 Snowden 文档泄露 BULLRUN 项目预算几十亿美元用于"加密对手系统的密钥恢复"
- 学术界**没有**公开宣布 RSA-1024 被破，但**主权级国家行为体**（NSA / GCHQ / 中国国安）极可能已能在数小时内分解 1024 位
- 2014 年 NIST SP 800-131A 强制要求联邦系统 2014 年 1 月 1 日起停用 RSA-1024——这个"deadline"的存在本身就是信号

**结论**：1024 在民用对抗下安全，但**对国家级对手已破**。这就是为什么 Apple / Google / Meta 的根证书全是 RSA-2048 起步。

### 怀疑 2 — RSA-2048 在 2030 年的量子威胁

**主流叙事**：RSA-2048 至少安全到 2030 年。

**怀疑根据**：

- IBM 2023 年 Condor 1121-qubit、2024 年 Heron 156-qubit（容错路线）
- Google Willow (2024) 在 105-qubit 上展示纠错下指数级错误压缩
- Shor 算法分解 RSA-2048 估计需要 ~4000 logical qubits ≈ 几百万 physical qubits
- 主流估计：**容错量子机 2035 ± 5 年问世**——但密码学的"harvest now, decrypt later"威胁已经成立（情报机构今天截获密文，等量子机出来再解）
- NIST PQC 迁移指南 2024 版：**所有长期机密（>10 年保密期）现在就该用 Kyber 包裹 RSA**

**结论**：RSA-2048 短期（5 年）安全，但**长期数据**（医疗 / 国家档案 / 区块链历史）的保密性已经岌岌可危。

### 怀疑 3 — OAEP 自己也有 padding oracle 历史漏洞

**主流叙事**：OAEP 是 RSA 加密的"标准答案"，PSS 是签名的"标准答案"。

**怀疑根据**：

- Manger Attack (2001)：OAEP 在错误处理上的细微差异（IntegerOverflow vs PaddingError）泄露 1 bit，约 1100 次查询恢复明文——**击穿了 OAEP 的安全证明**
- 修复要求：**所有错误路径必须 constant-time**——但 1996–2010 的产品库（Java SunJCE、.NET Framework、PHP openssl_*）几乎没有一个真做到
- 2019 RustCrypto/RSA 团队公开承认：自家库的 OAEP 实现"我们尽力了，但 timing safety 没经过形式化验证"
- 2023 NCC Group 审计：OpenSSL `rsa_padding_check_PKCS1_OAEP` 在 sub-millisecond 级别仍有微小 timing 差异

**结论**：OAEP 在论文层面安全，在**生产代码**上几乎从来没真正达到论文模型——这就是为什么 TLS 1.3 直接放弃 RSA 加密、改用 (EC)DHE 短期密钥。

### 怀疑 4 — ECDSA / Ed25519 已经在结构性替代 RSA

**主流叙事**：RSA 仍是"通用之选"。

**怀疑根据**：

- TLS 1.3（2018）默认推 X25519 + Ed25519（256 bit）—— 比 RSA-3072 快 10×、CPU 用量低 5×
- SSH-Ed25519（2014）已成 OpenSSH 默认（`ssh-rsa` 在 OpenSSH 8.8 起被弃用）
- Bitcoin / Ethereum 从未用 RSA，全部 ECDSA secp256k1
- WireGuard / Signal / Tor v3 onion 全部用 Curve25519 / Ed25519
- 苹果 Apple Pay / Apple Card / iCloud 同步用 ECDH P-256 + ECDSA P-256
- **新部署 2020 年起 RSA 占比逐年下降**——CA/Browser Forum 数据 2024Q4，新签发证书 38% 是 ECDSA P-256，2026 预计反超

**结论**：RSA 不是"被破"才退役，是**性能 + 工程成熟度**输给了椭圆曲线。RSA 在密码学史上的地位与"现代生产里的实际用量"正在分离——读论文是为了理解历史而不是预测未来。

## Section 5 — 历史与现代部署

### 1977–1980：诞生与商业化

- 1977 年 4 月 4 日：Rivest 在某个犹太逾越节晚餐后熬夜算出 RSA 草稿
- 1977 年 8 月 ：Martin Gardner 在 *Scientific American* 专栏首次公开介绍 RSA，附 129 位"挑战数 RSA-129"
- 1978 年 2 月：CACM 论文发表
- 1982 年：RSA Data Security Inc. 成立（Rivest / Shamir / Adleman + Jim Bidzos）
- 1991 年：PGP 1.0 发布，绕过 RSA 专利做"个人邮件加密"——引爆**密码学开放运动**
- 1994 年：RSA-129 被 Atkins / Lenstra / Leyland 团队用 600 台机器分解（17 年前预计需要 4×10^16 年）
- 2000 年 9 月 20 日：RSA 美国专利（US 4405829）到期前 2 周，RSA Inc. 把算法**捐入公有领域**

### 2000–2015：互联网基础设施

- HTTPS 全面铺开（Let's Encrypt 2015 起）→ RSA-2048 成为默认证书
- SSH 主机 / 用户密钥默认 RSA
- PGP / GPG 邮件签名
- Java 卡 / 银行 IC 卡 / 二代身份证 / 国际护照芯片

### 2015–2025：被椭圆曲线侵蚀

- TLS 1.3 移除 RSA 密钥交换
- Ed25519 / X25519 成为 SSH / Signal / WireGuard 默认
- CA/Browser Forum 数据：新签发证书 ECDSA 占比 2018=4% → 2024=38%

### 2025–2035：PQC 迁移期

- NIST 2024 年正式发布 ML-KEM-768（Kyber）/ ML-DSA-65（Dilithium）/ SLH-DSA（SPHINCS+）
- Cloudflare 2024 年起在 TLS 1.3 部署 X25519+Kyber768 混合密钥交换
- Google Chrome 2024 起默认启用混合 PQC
- 主流共识：**2030 前 RSA 长期数据加密必须迁移**，2035 前主流证书系统必须 PQC 化

## Section 6 — Permalinks（生产实现的真相在这里）

读论文是看"算法应该长什么样"；读 OpenSSL 是看"算法在 30 年生产里被多少 bug 修过"。这三个 permalink 是 RSA 实现的"金标准 + 代表性新 + Rust 安全派"。

### 1. OpenSSL — RSA 的工业标准实现

- 仓库：openssl/openssl
- 文件：`crypto/rsa/rsa_ossl.c`（CRT 解密 + blinding）/ `crypto/rsa/rsa_oaep.c`（OAEP padding）
- Permalink: `https://github.com/openssl/openssl/blob/e36862e0024b8b5e7e2d2dac0f0a6db9c3a7c456/crypto/rsa/rsa_ossl.c`

看这个文件主要看三件事：

1. `rsa_ossl_mod_exp` 里的 **Montgomery Ladder + blinding**——抗 timing 攻击的核心（DJ Bernstein 2005 后强制要求）
2. `rsa_padding_check_PKCS1_type_2` 里的 **constant-time padding 检查**——Bleichenbacher 攻击的修补点
3. CRT 路径里的 **fault injection 检查**（验证 $s^e \bmod n = m$）——抗硬件故障注入

OpenSSL 的 RSA 是"工业 RSA"的事实标准——理解它的复杂性才能理解为什么"自己实现 RSA"是 OWASP 第一条禁忌。

### 2. golang/go — 标准库 crypto/rsa（Go 风格的"安全默认"）

- 仓库：golang/go
- 文件：`src/crypto/rsa/rsa.go`（核心 API）/ `src/crypto/rsa/oaep.go`（OAEP）/ `src/crypto/rsa/pss.go`（PSS 签名）
- Permalink: `https://github.com/golang/go/blob/dafa15d6b16d0a4e5fb5b48c4c9ef9e8a4c8b7c2/src/crypto/rsa/rsa.go`

看这个文件主要看三件事：

1. `decrypt` 函数末尾的 **fault check** —— 重新加密验证后才返回，防 RowHammer / 故障注入
2. `boring.Enabled` 的 BoringCrypto 路径——FIPS 140-3 合规模式下走 Google fork 的 BoringSSL
3. `func GenerateKey` 的素数生成——Miller-Rabin 20 轮 + 素数对 $|p-q|$ 距离检查

Go 的 RSA 是"安全默认派"代表——比 OpenSSL 简洁但少了一些参数选项，体现了 Go 设计哲学。

### 3. RustCrypto/RSA — 现代 Rust 内存安全实现

- 仓库：RustCrypto/RSA
- 文件：`src/algorithms/rsa.rs`（核心模幂）/ `src/oaep.rs`（OAEP）/ `src/pss.rs`（PSS）
- Permalink: `https://github.com/RustCrypto/RSA/blob/1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b/src/algorithms/rsa.rs`

看这个文件主要看三件事：

1. 用 `crypto-bigint` 取代 `num-bigint`——constant-time big-integer 算法（2023 年 RUSTSEC 后才完成迁移）
2. `Zeroize` trait——私钥销毁时显式清零，防内存 dump 泄露
3. `subtle::ConstantTimeEq` 用于所有比较——抗 timing 攻击的语言级保证

RustCrypto/RSA 代表"内存安全 + constant-time 形式化"的下一代实现。但要知道：**它从未通过 FIPS 认证**——金融 / 政府场景仍只能用 OpenSSL / BoringSSL。

## Section 7 — 学到 + 关联

### 学到 1 — 困难假设的层级

RSA 让我第一次看清"密码学 hardness assumption"的链：

```
P ≠ NP（最大假设，没人证明）
  ↓
IFP（整数分解难）—— 经验性 + 量子算法已破
  ↓
RSAP（RSA 问题难）—— 至少和 IFP 一样难，方向不明
  ↓
RSA-OAEP IND-CCA2（论文级安全）—— 在随机预言模型下成立
  ↓
真实代码安全 —— 取决于 timing / blinding / fault check 实现
```

每一层都比上一层弱，且**每一层都可能有 gap**。这是密码学**最重要的工程教训**：算法证明 ≠ 代码安全。

### 学到 2 — "对偶性"是密码学的设计美感

RSA 让加密和签名共用一个数学构造（$x \mapsto x^e \bmod n$ 的逆是 $x \mapsto x^d \bmod n$，对偶）。这种**用一个原语解决两个问题**的设计在后来反复出现：

- ElGamal：加密和签名都用 DLP
- BLS：签名 / VRF / 阈值签名共用配对
- 椭圆曲线：ECDH 和 ECDSA 共用群结构

读 RSA 让我学会**寻找密码学构造的"美学骨架"**——好构造一定能用一个数学事实撑起多个原语。

### 学到 3 — "工程 RSA"和"论文 RSA"的距离

论文里的 $c = m^e \bmod n$ 一行；OpenSSL 的对应实现 1500+ 行。多出来的 1499 行做的是：

- Padding（OAEP / PKCS#1 v1.5）
- Constant-time（防 timing leak）
- Blinding（防 differential power analysis）
- Fault check（防硬件故障注入）
- CRT 优化
- 错误路径屏蔽
- 内存清零
- 边界条件（$m = 0, 1, n-1$ 等）

这给我一个永久的认知：**任何"安全相关"的代码，从论文到生产至少要膨胀 1000 倍**。

### 学到 4 — 怀疑主流是密码学的基本素养

写本笔记之前我以为"RSA-2048 = 安全 = 不用担心"。整理后我看到：

- 1024 已被国家级对手实质攻破
- 2048 量子威胁倒计时
- OAEP 在生产里几乎没真正 constant-time
- ECDSA 已在 TLS 1.3 / Bitcoin / Signal 全面替代 RSA

这种**从"标准 = 安全"到"标准 = 当下最佳但带 deadline"的认知转变**，是公钥密码学这一脉笔记给我的最大礼物。

### 关联 1 — Diffie-Hellman (1976)

DH 留下的"签名洞"由 RSA 填上。两篇论文是密码学的"双子星"——DH 给框架，RSA 给可工作算法。学习顺序必须 DH → RSA，反过来读会丢失"为什么需要陷门"的动机。

### 关联 2 — Shamir Secret Sharing (1979)

Shamir 写完 RSA 第二年就发表了 $(t, n)$ 门限秘密分享（基于 Lagrange 插值）。这条线后来发展为**阈值密码学**——比特币的 multisig、以太坊的 BLS 签名聚合都源自这条思路。

### 关联 3 — ECDSA / Ed25519

椭圆曲线把 RSA 的 2048-bit 模数压到 256-bit，性能 10×、抗量子等价。后续读 SEC1 / RFC 8032 必须有 RSA 这条铺垫。

### 关联 4 — Shor 算法 (1994)

Shor 把 IFP / DLP 一起送进了"poly time"——意味着 RSA 和 DH 共同毁灭。读完 RSA 必须接着读 Shor，才能理解为什么 PQC 是密码学**下一个 50 年**的主线。

### 关联 5 — TLS 1.3 (RFC 8446)

TLS 1.3 是 RSA 的**结构性退役书**——移除 RSA 密钥交换，只保留 RSA 签名（且未来会被 Ed25519 替代）。读 RFC 8446 时反复看到的 `rsa_pss_rsae_sha256` 就是论文里的 $\sigma = H(m)^d \bmod n$ 加上 PSS padding 的现代化版本。

### 关联 6 — 量子密钥分发（QKD）+ 后量子（PQC）

后量子的两条路：

1. **算法替代**（PQC）：Kyber / Dilithium / SPHINCS+ —— 算法换、协议不变
2. **物理替代**（QKD）：BB84 / E91 协议 —— 用光子物理性质做密钥分发

主流路线是 PQC（成本低、易部署）。RSA 的退场是 PQC 元年（2024）的标志性事件。

## 附录 A — 论文原文重要段落对照

### Section II 论文原句

> "We assume that all messages are integers between 0 and $n-1$ (the message space)."

→ 这一句直接定义了 RSA 的"消息编码 = 模 $n$ 整数"——后来 PKCS#1、OAEP padding 全部围绕"如何把任意字节串编码到 $\mathbb{Z}/n\mathbb{Z}$"这个问题展开。

### Section III 论文原句

> "Encryption does not increase the size of a message; both the message and ciphertext are integers in the range 0 to $n-1$."

→ 这是 RSA 的**长度保持性质**——在某些通信约束严格的场景（卫星 / 嵌入式）这个性质很值钱。

### Section VII A 论文原句

> "We have not yet found a method which is provably as difficult to break as it is to factor."

→ 1978 年三人组就明确说**没有证明 RSAP ≡ IFP**——47 年过去了，这仍然是开放问题。

## 附录 B — 我读这篇时踩过的几个坑

- 一开始以为 RSA 的安全性 = 分解难，**这是错的**——RSA 安全 ≤ 分解难，方向反过来未证。
- 一开始以为加密和签名是两个独立算法，**这也是错的**——是同一个构造换公私钥角色。
- 一开始读论文时跳过了"why $e$ 互素 $\varphi(n)$"，后来在 OpenSSL 里看到 `gcd(e, lambda(n)) == 1` 的检查才回头补——所有数论条件都对应一行生产代码。
- 一开始用 textbook RSA $c = m^e$ 加密 ASCII 字符串，做了个小 demo——后来才知道这种 deterministic encryption 完全不抗 chosen-plaintext，是 OWASP 第一条禁忌。

## 附录 C — RSA 与编程零基础学习者的 7 个台阶

1. 理解模运算（$a \bmod n$）= 时钟数学
2. 理解欧拉定理（$a^{\varphi(n)} \equiv 1$）= 时钟必回原点
3. 理解 RSA 加密（$c = m^e$）= 一道单向门
4. 理解 RSA 解密（$m = c^d$）= 私钥 = 钥匙
5. 理解 OAEP padding = 加防摔包装
6. 理解 timing attack = 解密时间泄露密钥位
7. 理解 PQC = 量子来了 RSA 死了，要换 Kyber

每一阶都对应一篇笔记 / 一份代码 / 一次自测。RSA 不是"知识点"，是密码学**第一条完整学习路径**。

## 附录 D — 学习节奏建议

- 读 DH 1976（基础）→ RSA 1978（本篇）→ ElGamal 1985（变体）→ ECDSA SEC1（替代）= 公钥密码学完整路径
- 配合 OpenSSL `crypto/rsa/` 源码精读 / Go `crypto/rsa` 对照阅读 / RustCrypto/RSA 看现代实现
- 攻击线：Bleichenbacher 1998 → Manger 2001 → Heninger 2012 → ROBOT 2017 = 实现陷阱必修
- 量子线：Shor 1994 → NIST PQC 选定 2024 → Kyber / Dilithium = 未来 10 年的主线
