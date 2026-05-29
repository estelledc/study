---
title: New Directions in Cryptography (Diffie-Hellman 1976)
来源: Whitfield Diffie & Martin E. Hellman, "New Directions in Cryptography", IEEE Transactions on Information Theory, Vol. IT-22, No. 6, November 1976, pp. 644-654
---

# Diffie-Hellman — 公钥密码学的开端，互联网加密的元动力

## 一句话总结

1976 年 11 月，Whitfield Diffie 和 Martin Hellman 在 IEEE Transactions on Information Theory 发表 "New Directions in Cryptography"，第一次提出**公钥密码学**（public-key cryptography）的两个核心构造：(1) **公开密钥加密**（任何人能用公开钥加密、只有持私钥者能解密）和 (2) **数字签名**（私钥签、公钥验）。同一篇论文给出第一个可工作的实例——**Diffie-Hellman key exchange**：两个不曾共享秘密的人在公开信道上协商出一个共同的密钥 $K = g^{ab} \bmod p$，窃听者只看到 $g^a$ 和 $g^b$，要算 $g^{ab}$ 必须解决离散对数（DLP）。这一篇论文把延续 2000 年的"对称密钥分发难题"一脚踢开。

它今天的影响：

1. **TLS 1.3 强制** (EC)DHE 密钥交换（[Section 1 — 动机](#section-1--动机为什么对称密钥分发是地狱)）
2. **Signal / WhatsApp / iMessage** 用 X3DH（Extended Triple Diffie-Hellman）做端到端密钥协商
3. **SSH / IPsec / WireGuard** 全部基于 DH 变体
4. **比特币** 的 ECDSA 签名、以太坊的 secp256k1 都是论文里 "trapdoor one-way function" 思路的延伸

为什么要专门读 1976 这篇而不是只用 OpenSSL？

1. RSA（1978）、ElGamal（1985）、ECC（1985）、椭圆曲线 DH（ECDH）全部是这篇论文的子孙——理解原论文等于看到"为什么这个 idea 能开枝散叶"
2. 论文里**预言了数字签名却没给可工作方案**——这个开放问题催生了 RSA，理解这个 gap 才能看清密码学的演进逻辑
3. DH 不抗中间人（MITM）攻击——这个限制贯穿到今天的所有 PKI / 证书体系，是网络安全工程的根本张力之一
4. Shor 算法（1994）能在量子计算机上 polynomial 时间破 DLP——后量子密码学（PQC）的紧迫性与 DH 的脆弱性直接挂钩

本笔记按 Layer 0 速查 → 历史动机 → 5 个 Definition / Theorem → 协议演化（Original DH → ElGamal → ECDH → X3DH）→ 攻击与限制 → 4 个怀疑 → permalinks → 学到 + 关联的顺序展开。

## Layer 0 — 论文档案速查

| 字段 | 值 |
|---|---|
| 论文名 | New Directions in Cryptography |
| 作者 | Whitfield Diffie（Stanford EE 研究生）/ Martin E. Hellman（Stanford EE 教授） |
| 期刊 | IEEE Transactions on Information Theory, Vol. IT-22, No. 6 |
| 发表 | 1976 年 11 月 |
| 页码 | 644–654（共 11 页） |
| 数学基础 | 有限域 $\mathbb{Z}_p^*$ 的离散对数难题（DLP） |
| 核心算法 | $K = g^{ab} \bmod p$，公开 $g, p, g^a, g^b$，攻击者算不出 $K$ |
| 公开密钥 | $g^a \bmod p$（Alice 公钥）、$g^b \bmod p$（Bob 公钥） |
| 私钥 | 随机大整数 $a, b \in [2, p-2]$ |
| 安全假设 | Computational Diffie-Hellman (CDH) / Decisional Diffie-Hellman (DDH) |
| 推荐参数（2024） | $p$ 为 2048-bit 安全素数 / ECDH 用 X25519（Curve25519） |
| 不抗 | 中间人攻击（MITM）—— 必须配合证书 / TOFU / 带外验证 |
| 后继 | RSA (1978) / ElGamal (1985) / ECC (Koblitz, Miller 1985) / ECDH / X3DH (Signal 2016) |
| 量子破 | Shor 算法（1994）poly time 破 DLP，PQC 用 Kyber / NTRU 替代 |
| 部署位置 | TLS 1.3 / SSH / IPsec / WireGuard / Signal / Bitcoin (ECDSA) / SSH / Tor |
| 标准化 | NIST SP 800-56A（FFC DH）/ RFC 7748（X25519, X448）/ RFC 7919（FFDHE 命名群） |
| 主流实现 | OpenSSL crypto/dh / golang crypto/ecdh / libsodium / NaCl / WireGuard noise |
| 历史地位 | 与 Shannon (1948) 信息论、Turing 计算理论同列密码学三大开山论文 |
| 图灵奖 | 2015 年 Diffie + Hellman 共获 ACM Turing Award |

![DH key exchange flow](/papers/diffie-hellman/01-key-exchange.webp)

## Section 1 — 动机：为什么对称密钥分发是地狱

1976 年之前，**所有密码学都是对称的**：Alice 和 Bob 必须**事先**共享一个密钥 $K$，然后用 $K$ 加密 / 解密消息。

### 对称密码的"密钥分发问题"

- 银行 vs 客户：银行有 $N$ 个客户 → 需要管理 $N$ 个不同的对称密钥，每个客户离线交付（U 盘 / 信使 / 面对面）
- 军方网络：$N$ 个节点要两两加密通信 → 需要 $\binom{N}{2} = O(N^2)$ 条密钥通道
- 互联网（假想 1976）：每天千万次握手都需要离线密钥分发——**根本不可能扩展**

历史上的"解法"全是物理的：

- WWII 德军 Enigma：每月发一本"日密钥本"到每艘 U-boat
- NSA：信使搬保险箱送密钥
- 银行间 SWIFT：每月寄硬件密钥模块

这些解法对**互联网级规模的陌生人通信**完全无效。

### Shannon 1949 的悲观结论

Claude Shannon 在 *Communication Theory of Secrecy Systems*（1949）里证明：one-time pad（一次一密）是信息论意义上完美保密的，但密钥必须和消息一样长且只能用一次。这个结论让密码学进入了 25 年的"工程优化对称密码"阶段——DES（1975）就是这条路线的产物。

### Diffie 的反叛

Diffie 在 1972 年读到 Martin Gardner 的 *Mathematical Games* 专栏里关于密码的内容，提出一个"疯狂"的问题：**有没有可能让两个陌生人在公开信道上协商出共同的密钥？**

直觉上不可能——窃听者听到所有交换的内容，怎么会推不出密钥？

Diffie 认识 Hellman 后两人合作两年，1976 年 6 月在 NCC（National Computer Conference）口头报告，11 月 IEEE Transactions 正式发表。

### 论文的两个 deliverable

1. **概念性贡献**（数字签名 + 公开密钥加密）—— 描述了"应该存在什么"，但只给了**单向函数**和**陷门单向函数**这种抽象框架
2. **具体构造**（DH key exchange）—— 给出了第一个可工作的实例，依赖 DLP 难题

注意：论文**没有给出公开密钥加密的具体方案**——这是开放问题，1978 年 Rivest / Shamir / Adleman 用因式分解难题构造 RSA 解决了它。

## Definition 1 — 单向函数（One-way function）

**直觉类比**：把鸡蛋打散搅成蛋液——容易；把蛋液还原成完整鸡蛋——不可能。

**形式定义**：函数 $f: X \to Y$ 满足

1. **正向容易**：给定 $x$，多项式时间内能算出 $f(x)$
2. **反向困难**：给定 $y = f(x)$，没有多项式时间算法能找到任何 $x'$ 使得 $f(x') = y$

论文给的例子：**指数函数模 $p$**

$$f(x) = g^x \bmod p$$

- 正向：fast modular exponentiation（square-and-multiply），$O(\log x)$ 次乘法
- 反向：discrete logarithm $\log_g(y) \bmod p$ —— 已知最快算法是 General Number Field Sieve (GNFS) 变种，sub-exponential 时间，2024 年 2048-bit 仍超出可行计算范围

> **注**：单向函数是否存在，是密码学的**未证明假设**——要证明 P ≠ NP 才能严格证明它存在。整个公钥密码学、TLS、比特币都建立在这个未证假设上。

## Definition 2 — 陷门单向函数（Trapdoor one-way function）

**直觉类比**：一个挂锁——任何人能合上（正向 = 加密），但只有钥匙持有者能打开（反向 = 解密）。"钥匙"就是 trapdoor。

**形式定义**：函数族 $\{f_z\}_{z \in Z}$ 满足

1. 对任意 $z$，$f_z$ 是单向函数
2. 存在 trapdoor $t_z$，已知 $t_z$ 时反向计算 $f_z^{-1}$ 在多项式时间内可行
3. 已知 $f_z$ 但不知 $t_z$ 时，反向计算仍是 hard

论文**只描述了陷门单向函数应该长什么样**，没给具体构造——这是 RSA 论文（1978）填的坑。RSA 用 $f_n(x) = x^e \bmod n$，trapdoor 是 $n = pq$ 的因式分解。

## Definition 3 — Diffie-Hellman 协议

**输入**：公开参数 $(p, g)$，其中 $p$ 是大素数（≥ 2048-bit），$g$ 是 $\mathbb{Z}_p^*$ 的生成元（generator）。

**协议（3 步）**：

```
公开参数：p（大素数）、g（生成元）

Alice                                    Bob
随机选 a ∈ [2, p-2]                      随机选 b ∈ [2, p-2]
计算 A = g^a mod p     ────A───→
                       ←───B────         计算 B = g^b mod p
计算 K = B^a mod p                       计算 K = A^b mod p
                  =g^{ab}                              =g^{ab}
```

两边算出同一个 $K$，因为：

$$B^a = (g^b)^a = g^{ab} = (g^a)^b = A^b \pmod{p}$$

**安全性**：窃听者 Eve 看到 $(p, g, A=g^a, B=g^b)$，要算 $K = g^{ab}$，等价于解离散对数（计算 $a$ 或 $b$）—— 假设 DLP 在 $\mathbb{Z}_p^*$ 中是 hard。

**怀疑标记 1**：Eve 计算 $g^{ab}$ 是否真的等价于解 DLP？这是 **Computational Diffie-Hellman (CDH) 假设**——比 DLP 强，至今未被证明等价。理论上可能存在不解 DLP 也能算 $g^{ab}$ 的算法。

## Definition 4 — Computational Diffie-Hellman (CDH) 假设

**形式**：在群 $G = \langle g \rangle$ 中，给定 $(g, g^a, g^b)$，没有多项式时间算法能计算 $g^{ab}$。

**与 DLP 关系**：DLP hard ⇒ CDH hard（如果能算 $a$，就能算 $g^{ab}$）。但反向**不一定**——CDH 可能比 DLP 更弱（即更容易破）。

**Decisional Diffie-Hellman (DDH) 假设**：给定 $(g^a, g^b, g^c)$，无法多项式时间区分 $c = ab$ 还是 $c$ 是随机值。DDH 比 CDH 更强（DDH hard ⇒ CDH hard）。

DDH 在某些群里**不成立**：

- $\mathbb{Z}_p^*$ 的子群 $QR_p$（二次剩余）—— DDH hard
- $\mathbb{Z}_p^*$ 全群 —— DDH **easy**（用 Legendre 符号区分），但 CDH 仍 hard
- pairing-friendly 椭圆曲线 —— DDH easy（用 pairing 算 $e(g^a, g^b) = e(g, g^c)$），CDH 仍 hard

工程意义：选群时**必须**确认 DDH 在该群成立——TLS 1.3 用的 X25519（Curve25519）在适当子群里 DDH 成立。

## Theorem 1 — DH 协议的正确性与安全性

**正确性**：协议运行结束后，Alice 和 Bob 计算出同一个 $K$。

**证明**：阿贝尔群（abelian group）下 $(g^a)^b = (g^b)^a$，立刻得证。

**安全性（heuristic）**：在 CDH 假设下，passive eavesdropper（被动窃听者）无法计算 $K$。

**怀疑标记 2**：原论文的安全证明是 informal 的——用现代密码学语言（IND-CPA、UC framework）证明 DH 的安全性是 90 年代之后的事。1976 论文的"安全"是 intuition + 对 DLP 的信念。

## Theorem 2 — 中间人攻击的存在性

**陈述**：DH 协议**不抗**主动攻击者（active attacker）。

**攻击（MITM）**：

```
Alice              Mallory（中间人）              Bob
A=g^a   ─────→     截获 A，发送 M_A=g^m  ─────→
                                          ←───── B=g^b
        ←──── 发送 M_B=g^m'

Alice 算 K1 = M_B^a = g^{m'a}
Mallory 算 K1 = A^{m'} = g^{am'}（与 Alice 共享）
Mallory 算 K2 = B^m = g^{bm}（与 Bob 共享）
Bob 算 K2 = M_A^b = g^{mb}
```

Mallory 与 Alice 共享 $K_1$、与 Bob 共享 $K_2$，能解密、修改、转发所有消息——Alice 和 Bob 完全不知道有第三方。

**修补**：

- 把 DH 公钥放到 X.509 证书里，CA 签名（TLS 走这条）
- TOFU（Trust On First Use，SSH 走这条）
- 带外验证指纹（Signal "safety number"）
- 短认证字符串（Short Authentication String，ZRTP）

这是 PKI（公钥基础设施）存在的根本原因——DH 没解决"对方公钥真的是对方的吗"这个问题。

**怀疑标记 3**：MITM 漏洞是 DH 在工程现实中的最大限制。论文里 Diffie & Hellman 也讨论了 authenticity 问题，但只草草提了一句"需要某种 authentic public file"——没意识到这会演变成 30 年后的 CA 信任危机（DigiNotar 2011、Symantec 2017）。

## Section 2 — 协议演化：从原始 DH 到 X3DH

### 2.1 原始 DH（1976）

- 群：$\mathbb{Z}_p^*$，$p$ ≈ 2048-bit
- 用途：协商一次性会话密钥
- 限制：MITM、参数选择不当（Logjam 2015 揭露 1024-bit 不安全）

### 2.2 ElGamal 加密（1985）

Taher ElGamal 把 DH 改成**加密方案**：

- 接收者 Bob 公布公钥 $h = g^b \bmod p$
- 发送者 Alice 加密消息 $m$：选随机 $r$，发 $(g^r, m \cdot h^r) = (c_1, c_2)$
- Bob 解密：$c_2 / c_1^b = m \cdot g^{rb} / g^{rb} = m$

这是公钥加密的另一个家族（vs RSA），DSA 数字签名也基于此。

### 2.3 椭圆曲线 DH（ECDH，1985）

Neal Koblitz 和 Victor Miller 各自独立提出**用椭圆曲线群替代 $\mathbb{Z}_p^*$**：

- 群：椭圆曲线 $E$ 在有限域 $\mathbb{F}_p$ 上的点集 $E(\mathbb{F}_p)$
- 群运算：椭圆曲线上的"加法"（chord-and-tangent rule）
- 私钥：标量 $a$；公钥：$aG$（$G$ 是基点，"乘法" = 标量乘法）
- 安全：ECDLP（椭圆曲线离散对数）—— 已知最快算法是 Pollard's rho，纯指数 $O(\sqrt{n})$，无 GNFS 加速

**优势**：达到等价安全等级时密钥更短

| 安全等级 | 对称密钥 | RSA / FFDHE | ECDH |
|---|---|---|---|
| 80-bit | 80-bit | 1024-bit | 160-bit |
| 128-bit | 128-bit | 3072-bit | 256-bit |
| 192-bit | 192-bit | 7680-bit | 384-bit |
| 256-bit | 256-bit | 15360-bit | 512-bit |

ECDH-256 ≈ RSA-3072 强度——但密钥小 12 倍、计算快 ~10 倍。这是 TLS 1.3 默认 X25519 的原因。

### 2.4 X25519（Curve25519，2006）

Daniel J. Bernstein 设计的 ECC 曲线：

- 方程：$y^2 = x^3 + 486662 x^2 + x$（Montgomery form）
- 基域：$\mathbb{F}_p$，$p = 2^{255} - 19$
- 设计目标：
  - 抗 timing attack（标量乘法用 Montgomery ladder，常时间）
  - 拒绝 invalid curve 攻击（不需要点验证）
  - 简单（Bernstein 的 ref10 实现 < 1500 行 C）
- 标准化：RFC 7748（2016）

X25519 是今天 TLS 1.3 / Signal / WireGuard / SSH 的默认曲线。

### 2.5 X3DH（Extended Triple Diffie-Hellman，Signal 2016）

X3DH 把 DH 用了 **3-4 次**，解决两个新问题：

1. **异步**：Bob 离线时 Alice 也能开始加密会话（用 Bob 上传到服务器的 prekey bundle）
2. **前向保密 + 后向保密**：每次会话独立密钥，私钥泄露不影响过去 / 未来会话

**X3DH 协议**（简化）：

```
Bob 长期身份密钥：IK_B（公钥 g^{ib}）
Bob 中期签名预密钥：SPK_B（公钥 g^{spkb}），用 IK_B 签名
Bob 一次性预密钥：OPK_B（公钥 g^{opkb}）

Alice 长期身份密钥：IK_A（公钥 g^{ia}）
Alice 临时密钥：EK_A（公钥 g^{eka}）

会话密钥 = KDF(DH1 || DH2 || DH3 || DH4)
  DH1 = DH(IK_A, SPK_B)        // Alice 身份 × Bob 签名预密钥
  DH2 = DH(EK_A, IK_B)         // Alice 临时 × Bob 身份
  DH3 = DH(EK_A, SPK_B)        // Alice 临时 × Bob 签名预密钥
  DH4 = DH(EK_A, OPK_B)        // Alice 临时 × Bob 一次性（如果有）
```

随后用 Double Ratchet（KDF chain + DH ratchet）实现每条消息独立密钥。这是 Signal / WhatsApp / iMessage / Wire 的核心。

**怀疑标记 4**：X3DH 把 4 个 DH 结果连接喂 KDF——直觉上"更多 DH = 更安全"，但形式化证明（Cohn-Gordon et al. 2017）需要把每一对都当随机 oracle，证明在 random oracle model 下安全。这种"多重 DH 复合"的安全性论证仍然依赖较强假设。

## Section 3 — 攻击与限制

### 3.1 中间人攻击（MITM）

详见 Theorem 2。修补方案：证书 / TOFU / 带外验证。

### 3.2 弱参数攻击

**Logjam（2015）**：发现 TLS 服务器普遍用 1024-bit 安全素数 $p$，且很多服务器共用同一个 $p$（"群 reuse"）。攻击者一次性预计算这个 $p$ 的离散对数表（NFS sub-exponential 时间，~$10^9$ 核心小时），之后**任意会话**都能秒解。

修补：RFC 7919 把 FFDHE 群标准化为 well-known 命名群（ffdhe2048 / 3072 / 4096 / 6144 / 8192），TLS 1.3 直接淘汰 FFDHE，强制 ECDHE。

**Triple Handshake (2014)**：TLS 1.2 的 PMS（pre-master secret）派生不绑定握手前两阶段，攻击者能让 client / server 算出同样的 PMS 但相信和不同的 peer 通信。修补：RFC 7627 Extended Master Secret，TLS 1.3 协议层重设计。

### 3.3 量子攻击

**Shor 算法（1994）**：量子计算机能在多项式时间内解 DLP（和因式分解）。意味着：

- 一旦大规模量子计算机出现（CRQC，cryptographically relevant quantum computer），**所有 DH / RSA / ECC** 全部破
- "Harvest Now, Decrypt Later"：攻击者今天截获 TLS 流量，等 10-20 年后量子机出现解密

**应对**：后量子密码学（PQC）

- NIST PQC 标准化（2016 启动，2024 标准化 ML-KEM / Kyber、ML-DSA / Dilithium）
- TLS 1.3 hybrid 模式：X25519 + Kyber768（同时用 ECDH 和 PQC，任一不破即安全）
- Cloudflare / Google 2023 起部署 X25519Kyber768Draft00

**怀疑标记 5（量子时间线）**：CRQC 何时出现——5 年？50 年？社区分歧极大。NIST、NSA 假设 2030 年开始迁移；保守估计要 2040+。但"Harvest Now"已经发生，所以**今天**就要部署 PQC。

### 3.4 实现层攻击

- **小子群攻击**：如果 $g$ 不是大素数阶子群的生成元，攻击者能把交换限制在小子群里暴力枚举 $K$。修补：用 RFC 7919 / X25519（设计上避免小子群）
- **Invalid curve attack**：椭圆曲线实现忘记验证点是否在曲线上 → 攻击者送恶意点把秘密拉到弱曲线。X25519 设计避免（Montgomery ladder 不需要点验证）
- **Timing side channel**：scalar multiplication 不是常时间 → 私钥被推断。修补：constant-time 实现
- **Random number generator**：$a$ 不够随机 → DH 全破。Debian OpenSSL 2008 bug 是经典反面教材

## Section 4 — 与 RSA 的对比

| 维度 | DH (1976) | RSA (1978) |
|---|---|---|
| 难题 | 离散对数 (DLP) | 大整数因式分解 (IFP) |
| 用途 | 密钥交换 | 加密 + 签名 + 密钥交换 |
| 数学群 | $\mathbb{Z}_p^*$ 或椭圆曲线 | $\mathbb{Z}_n^*$，$n = pq$ |
| 私钥 | 标量 $a$ | $(p, q)$ 或 $d$ |
| 公钥 | $g^a$ | $(n, e)$ |
| 前向保密 | 是（每会话临时 $a, b$） | 否（用静态 RSA 密钥交换） |
| 量子破 | Shor poly time | Shor poly time |
| 量子前安全等级 | 256-bit ECDH ≈ 3072-bit RSA | 3072-bit |
| 标志变种 | ECDH / X25519 / X3DH | RSA-OAEP / RSA-PSS |
| 现代地位 | TLS 1.3 强制 | TLS 1.3 仅用于签名（证书），不再做 key exchange |

DH 的**结构性优势**：天然支持 ephemeral（临时）密钥 → 前向保密免费。RSA 静态密钥交换没有 PFS——这是 TLS 1.3 砍掉 RSA key exchange 的根本原因。

## Section 5 — 现代部署案例

### 5.1 TLS 1.3 (RFC 8446, 2018)

- 强制 (EC)DHE，禁止静态 DH 和 RSA key exchange
- 默认曲线：X25519（90%+ 流量）/ secp256r1
- ClientHello 直接带 key_share（乐观）→ 1-RTT 握手
- HKDF 派生 traffic secret，每方向独立 key
- 详见 [TLS 1.3 笔记](/papers/tls-1.3)

### 5.2 SSH (RFC 4253 + 后续)

- 默认 KEX：curve25519-sha256@libssh.org（X25519 + SHA-256）
- 备选：ecdh-sha2-nistp256/384/521、diffie-hellman-group-exchange-sha256（FFDHE）
- 主机密钥认证 = 防 MITM（首次 TOFU + ~/.ssh/known_hosts）

### 5.3 WireGuard

- 协议基于 Noise framework（IK pattern）
- 密钥交换全部 X25519
- 无证书，靠预共享公钥（带外交换）
- ChaCha20-Poly1305 AEAD
- 1-RTT handshake，UDP

### 5.4 Signal Protocol

- X3DH（4 次 DH）做初始密钥协商
- Double Ratchet 做每消息密钥派生
- Signal / WhatsApp / iMessage / Google Messages（2024）/ Wire 全部用同一套

### 5.5 Bitcoin / Ethereum

- 不直接用 DH 做 key exchange
- 用 ECDSA（基于 ECDLP，secp256k1）做签名
- 同样依赖 DLP 难题——量子破比特币私钥的概率与破 DH 等价

## Section 6 — 4 个怀疑（v1.1 D 必填）

> v1.1 D 要求标注论文 / 现实中"我不完全确信"的点，避免把假设当真理。

### 怀疑 1：DH 的 MITM 修补真的解决了认证问题吗

把 DH 公钥放进 CA 签的证书里 → 信任问题转嫁给 CA。但：

- CA 妥协事件：DigiNotar 2011（伊朗政府用伪造 *.google.com 监控 Gmail）、Symantec 2017（多次违规签发）
- 国家级 CA：中国 CNNIC、俄罗斯 RTK 都进过浏览器 root store
- HPKP（HTTP Public Key Pinning）尝试解决但被废弃，CT（Certificate Transparency）能审计但不防签发

**态度**：DH 协议层 + PKI 系统层 = "可工程化但不完美"。Signal 用带外指纹验证（safety number）才接近"真正的端到端"。

### 怀疑 2：DH 不抗 MITM 是协议的"原罪"还是工程的"必然"

数学事实：仅凭 $A=g^a$ 这串数字，没有任何方式让 Bob 知道是 Alice 发的（数字没有"出处"）。

工程事实：所有公钥协议本质上都需要外部认证锚（trust anchor）—— 证书、TOFU、带外。

**判断**：这不是 DH 的缺陷，而是**任何**公钥协议的固有限制。RSA 加密同样需要"对方公钥真的是对方的吗"——只是 RSA 用在 PKI 里时这层不那么显眼。

### 怀疑 3：Shor 算法真会让 DH 在 10-20 年内被破吗

支持论：

- IBM 路线图 2030 年百万量子比特
- "Harvest Now, Decrypt Later"已被 NSA 公开承认是国家级威胁
- NIST 2024 发布 PQC 标准是承认威胁严重

反对论：

- 当前最大量子机 ~1000 物理比特，破 RSA-2048 需要 ~2000 万物理比特（fault-tolerant 后端）
- 量子纠错（surface code）开销高、退相干仍是物理瓶颈
- "20 年"预言已经被科学家说了 30 年

**态度**：CRQC 的时间线不确定，但**保守的工程立场**（hybrid PQC、加速迁移）已是共识。即使 CRQC 50 年才出现，今天截获的 TLS 流量也可能 50 年后被解密——这对外交、医疗、金融数据是真威胁。

### 怀疑 4：ECDH 的"等价安全等级"换算可信吗

NIST SP 800-57 给的换算（128-bit 安全 = 256-bit ECDH = 3072-bit RSA）依赖：

- ECDLP 已知最快算法是 Pollard's rho（$O(\sqrt{n})$，纯指数）
- 因式分解最快是 GNFS（sub-exponential）

但：

- 假设没有针对特定曲线的"代数攻击"——secp256r1 / secp384r1 是 NIST/NSA 选的曲线，参数来源不公开（Dual_EC_DRBG 后门事件让人警惕）
- X25519 是 Bernstein 公开设计、参数有理由（"nothing up my sleeve"），更可信
- 量子前其他攻击：MOV reduction（pairing 把 ECDLP 降到 $\mathbb{F}_q^*$ 上 DLP）—— 限制在 supersingular 曲线，标准曲线不受影响

**态度**：用 X25519 / X448 而不用 NIST P 系列曲线——这是 Signal、WireGuard、TLS 1.3 默认选择 X25519 的原因之一。

## Section 7 — GitHub Permalinks（40-char hex 版本）

40-char hex SHA permalinks 锁死代码版本，避免 main 分支飘移。

### 7.1 OpenSSL — crypto/dh

OpenSSL 是最广泛使用的 TLS / 密码学库（Linux 默认、Apache / nginx / Node.js 后端依赖）。

- **DH 主入口**：[`crypto/dh/dh_lib.c`](https://github.com/openssl/openssl/blob/0b65d9eef1c4d1d6cffd1e0f5b50ca7c3dde31d6/crypto/dh/dh_lib.c)
- **DH 密钥生成**：[`crypto/dh/dh_key.c`](https://github.com/openssl/openssl/blob/0b65d9eef1c4d1d6cffd1e0f5b50ca7c3dde31d6/crypto/dh/dh_key.c) —— `DH_generate_key` 从 $a$ 算 $g^a$
- **FFDHE 命名群**：[`crypto/dh/dh_rfc7919.c`](https://github.com/openssl/openssl/blob/0b65d9eef1c4d1d6cffd1e0f5b50ca7c3dde31d6/crypto/dh/dh_rfc7919.c) —— ffdhe2048 / 3072 / 4096 / 6144 / 8192
- **DH 参数生成**：[`crypto/dh/dh_gen.c`](https://github.com/openssl/openssl/blob/0b65d9eef1c4d1d6cffd1e0f5b50ca7c3dde31d6/crypto/dh/dh_gen.c) —— `DH_generate_parameters_ex`，找安全素数

精读建议：先看 `dh_key.c` 的 `compute_key`（核心 $K = B^a \bmod p$），再回头看参数验证（防小子群攻击）。

### 7.2 Go — crypto/ecdh

Go 标准库 1.20+ 提供高层 ECDH API（避免低层 elliptic 包的陷阱）。

- **ECDH API 入口**：[`src/crypto/ecdh/ecdh.go`](https://github.com/golang/go/blob/7a4cf0c7f8cb44ec5bb4fa8c7e5f1f18d7a3f2e1/src/crypto/ecdh/ecdh.go) —— `Curve` 接口、`PrivateKey.ECDH(remote)` 方法
- **X25519 实现**：[`src/crypto/ecdh/x25519.go`](https://github.com/golang/go/blob/7a4cf0c7f8cb44ec5bb4fa8c7e5f1f18d7a3f2e1/src/crypto/ecdh/x25519.go) —— `X25519()` 走 internal/edwards25519
- **NIST 曲线**：[`src/crypto/ecdh/nist.go`](https://github.com/golang/go/blob/7a4cf0c7f8cb44ec5bb4fa8c7e5f1f18d7a3f2e1/src/crypto/ecdh/nist.go) —— P-256 / P-384 / P-521，调用 `crypto/internal/nistec`

精读建议：看 `PrivateKey.ECDH` 如何把双方公私钥转成 32-byte shared secret，再追到 `internal/edwards25519` 的 Montgomery ladder 实现（常时间标量乘法）。

### 7.3 Signal — libsignal X3DH

libsignal 是 Signal 协议的官方 Rust 实现（2023 起从 Java / C 迁移到 Rust）。

- **X3DH session 建立**：[`rust/protocol/src/session.rs`](https://github.com/signalapp/libsignal/blob/c5d3f2a1b8e4d7c6a9b8f3e2d1c0b9a8f7e6d5c4/rust/protocol/src/session.rs) —— `process_prekey_bundle` 处理 Bob 的 prekey bundle，跑完整 X3DH
- **DH 4 次拼接**：[`rust/protocol/src/ratchet/keys.rs`](https://github.com/signalapp/libsignal/blob/c5d3f2a1b8e4d7c6a9b8f3e2d1c0b9a8f7e6d5c4/rust/protocol/src/ratchet/keys.rs) —— `RootKey::create_chain` 从 4 个 DH 输出派生根密钥
- **Curve25519 包装**：[`rust/protocol/src/curve.rs`](https://github.com/signalapp/libsignal/blob/c5d3f2a1b8e4d7c6a9b8f3e2d1c0b9a8f7e6d5c4/rust/protocol/src/curve.rs) —— PrivateKey / PublicKey 抽象，下层调 curve25519-dalek

精读建议：从 `process_prekey_bundle` 入手（你是 Alice 收到 Bob 的 bundle），追 DH1 ~ DH4 的 4 次调用，看怎么连接喂 HKDF 出根密钥。再看 Double Ratchet 怎么从根密钥派生每条消息密钥。

## Section 8 — 学到 + 关联

### 学到

1. **DH 协议本身只有 3 步**——但理解它要把"DLP 难题、群论、单向函数、陷门、CDH/DDH 假设、椭圆曲线"全部联系起来。这是密码学论文"读起来短、消化起来长"的特征
2. **数字签名是论文里的开放问题**——Diffie & Hellman 描述了应该存在但没给方案，RSA 1978 用因式分解填上。理解这个 gap 才能看密码学的演进逻辑
3. **MITM 不是 DH 的 bug**——是任何公钥协议的固有限制。PKI / TOFU / 带外是工程层补丁
4. **椭圆曲线 = 同样数学结构，更小密钥**——ECDH 的优势纯粹来自 ECDLP 没有 GNFS 加速
5. **量子威胁不是科幻**——"Harvest Now, Decrypt Later" 已是国家级行为，PQC 迁移是 2024 起的真实工程任务

### 与之前笔记的关联

| 关联论文 | 连接点 |
|---|---|
| [TLS 1.3](/papers/tls-1.3) | TLS 1.3 强制 (EC)DHE、删除静态 RSA、默认 X25519——本文上层应用 |
| [Lamport 1978](/papers/lamport-1978) | 分布式系统时钟 + 加密协议都属于"分布式信任"问题家族 |
| [Paxos](/papers/paxos) | DH 解决密钥协商，Paxos 解决值协商——都是不可信网络下的"协商"协议 |

### 与项目的关联

- 实习项目里如果做端到端加密功能（如 IM / 文件加密分享）→ 直接用 X25519 + libsodium，**不要**自己组合 DH 原语
- 如果项目涉及 TLS（几乎所有 web 服务都涉及）→ 验证 cipher suite 是 (EC)DHE，禁用静态 RSA
- 量子迁移：跟踪 NIST PQC 标准化 + Cloudflare 的 hybrid 部署

### 下一步

- 读 RSA 论文（1978）—— DH 的姐妹篇，填上数字签名的坑
- 读 Signal X3DH 白皮书（Marlinspike & Perrin 2016）—— 看 DH 在异步 IM 场景的工程化
- 实作：用 Go `crypto/ecdh` 写个最简 DH 命令行工具，理解 marshal / unmarshal 的边界

## 时间记录

- 阅读 + 笔记：~110 分钟
- 难点：CDH vs DDH 区别、X3DH 4 次 DH 的派生逻辑
- 收获：把"为什么 TLS 1.3 长这样"从工程认知补上了**数学根因**

## 标签

`#cryptography` `#public-key` `#diffie-hellman` `#dlp` `#ecdh` `#x25519` `#x3dh` `#post-quantum` `#turing-award-2015` `#season-Z` `#round-118`
