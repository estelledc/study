---
title: RSA 公钥密码
来源: 'Rivest, Shamir, Adleman, "A Method for Obtaining Digital Signatures and Public-Key Cryptosystems", CACM 1978'
日期: 2026-05-29
分类: 密码学
难度: 中级
---

## 是什么

RSA 是 1977 年 MIT 三人（Rivest / Shamir / Adleman）发明的"分两把钥匙"密码——**公钥锁、私钥开**。日常类比：邮箱投递口（公钥）所有人都能往里扔信，但只有钥匙持有人（私钥）能打开取信。

之前的密码（凯撒、Vigenère、AES）都是"一把钥匙"——加密和解密同一个 key，谁要发密信就得先安全地交换钥匙。RSA 第一次做到：**公钥可以贴在公告板上**，谁都能用它加密给你；只有你手里的私钥能解。更妙的是，**反着用**就是数字签名——你用私钥"签"一段消息，任何人用你的公钥能验证"这确实是你签的"。同一套数学把加密和签名两件事一起搞定。

## 为什么重要

不理解 RSA，下面这些事都讲不清：

- 为什么打开 HTTPS 网站浏览器小绿锁能"信任"服务器——是 RSA / ECDSA 证书在背书
- 为什么 GitHub `git push` 用 SSH key 不用每次输密码——是 RSA / Ed25519 在做身份验证
- 为什么"软件签名"能挡住病毒——苹果 / 微软用 RSA 签名 .app / .exe，篡改后签名验不过
- 为什么 Bitcoin / Ethereum 钱包能"只持私钥"控制资产——ECDSA 是 RSA 的椭圆曲线表亲
- 为什么 MIT 三人 2002 年拿图灵奖

RSA 是**第一个实用的公钥密码**。[[diffie-hellman]] 1976 年只画了招牌（"未来应该有公钥密码"），RSA 1977 年给了第一个能跑的工程化方案。

## 核心要点

RSA 安全靠**一个数学难题**撑着：

> 给两个大素数 p 和 q，相乘得到 n = p × q **极快**；但只给你 n，要倒推出 p 和 q **极慢**（2048 位 n 在普通机器上要算几亿年）。

这叫**整数因式分解难题**。

加密和解密的步骤：

1. **造钥匙**：选两个大素数 p、q；算 n = p × q；算 φ(n) = (p-1)(q-1)（欧拉函数：小于 n 且与 n 互素的个数，知道 p、q 就能秒算）；选公钥指数 e（常用 65537）；算私钥 d 满足 e · d ≡ 1 (mod φ(n))——像找「乘 e 再对 φ(n) 取余等于 1」的配对按钮。**公钥 = (n, e)，私钥 = (n, d)**。
2. **加密**：把消息 m 当成数字（必须 m < n），算 `c = m^e mod n`，发送 c。
3. **解密**：拿到 c，用私钥算 `m = c^d mod n`。欧拉定理保证这对运算能还原 m。
4. **签名**：把上面"反着用"——用私钥算 `s = m^d mod n` 当签名，任何人用公钥验 `s^e mod n == m`。

为什么不知道 p、q 就破不了？因为算 d 必须先有 φ(n)，而 φ(n) 必须先分解 n。**陷门 = p 和 q**——持有人能秒算，外人没辙。

## 实践案例

### 案例 1：toy RSA（手算一遍）

挑两个小素数：p = 11，q = 13。

- n = 11 × 13 = 143
- φ(n) = 10 × 12 = 120
- 选 e = 7（与 120 互素）
- 算 d：要找 d 使 `7 × d` 除以 120 余 1。试算 `7 × 103 = 721 = 6 × 120 + 1`，所以 d = 103（扩展欧几里得就是系统化找这个 d 的算法）

加密 m = 9 → `c = 9^7 mod 143 = 48`；解密 → `m = 48^103 mod 143 = 9`。回到 9。大整数版就是 RSA-2048。

### 案例 2：OpenSSL 命令行

```bash
openssl genrsa -out private.pem 2048          # 造 (n,d)
openssl rsa -in private.pem -pubout -out public.pem   # 抽出 (n,e)
openssl dgst -sha256 -sign private.pem -out doc.sig doc.txt
openssl dgst -sha256 -verify public.pem -signature doc.sig doc.txt
# Verified OK
```

对应论文：genrsa = 造钥匙，sign = `s = H(m)^d mod n`，verify = 用 e 验。

### 案例 3：JWT RS256 怎么签 token

RS256 = RSA-2048 + SHA-256。伪代码：

```
signing_input = base64url(header) + "." + base64url(payload)
sig = RSA_PSS_Sign(private_key, SHA256(signing_input))
token = signing_input + "." + base64url(sig)
# 网关用 public_key 验 sig，通过才信任 payload
```

OAuth / Auth0 / Firebase 的无状态登录都靠这条链。

## 踩过的坑

1. **不能直接加密大消息**：RSA 只能加密 < n 的整数（约 256 字节）。实际上从来不会"用 RSA 加密一封邮件"——做法是用 RSA 加密一个 [[aes]] 对称密钥，再用 AES 加密邮件本体。这叫**混合加密**，是 TLS 1.2 的核心模式。

2. **不带 padding 会被打穿**：教科书 RSA `c = m^e mod n` 是**确定性**的（同样的 m 永远得到同样的 c），攻击者能用"字典攻击"试遍常见明文。1996 年 Bleichenbacher 攻击进一步证明哪怕加了 PKCS#1 v1.5 padding 也不安全。**生产必须用 OAEP padding（加密）和 PSS padding（签名）**。

3. **1024 位现在不安全**：2010 年代以前 RSA-1024 是默认；公开估算与国家级算力下它已不可信。NIST 2014 年起弃用 1024，**新系统必须 2048 起步，长期数据 3072 / 4096**。

4. **私钥随机数发生器有问题就完了**：2010 年 Sony PS3 因 ECDSA 复用同一随机数 k 被算出根私钥。**密码学库的安全 = 它依赖的随机源的安全**。

5. **量子计算机会终结 RSA**：Shor 算法（1994）证明容错量子机可多项式时间分解 n。NIST 2024 年发布 PQC 标准（ML-KEM/ML-DSA，曾用名 Kyber/Dilithium）；联邦迁移时间表以 2035 为主目标，高风险系统更早。

## 适用 vs 不适用场景

**适用**：

- TLS 证书 / 代码签名 / 软件更新签名（RSA-2048 / 3072 仍是主流）
- SSH 主机和用户认证（虽然 Ed25519 更快，但 RSA 兼容性最好）
- 银行 / 护照 / EMV 智能卡（嵌入式生态对 RSA 支持成熟）
- JWT / OAuth / OIDC token 签名（RS256 / RS512）

**不适用**：

- 加密大文件 → 用 RSA 包对称密钥 + AES-GCM 加密内容（混合加密）
- 高频签名场景 → 用 [[ed25519]] / ECDSA，比 RSA-3072 快 10 倍
- 长期机密（>10 年保密期） → 现在就该用 Kyber 包裹 RSA（防"现在截获、量子时代再解"）
- 区块链钱包 → Bitcoin / Ethereum 用 ECDSA secp256k1，从未用 RSA

## 历史小故事（可跳过）

- **1976 年**：Diffie 和 Hellman 发表论文，画出"公钥密码"的招牌，但**没给可工作的签名算法**。
- **1977 年 4 月**：Rivest 在某次犹太逾越节晚餐后熬夜算出 RSA 草稿。Shamir 提了 42 个候选，前 41 个都被自己破掉，第 42 个由 Adleman 用数论修正成功。
- **1977 年 8 月**：Martin Gardner 在 *Scientific American* 专栏首次公开介绍 RSA，附挑战题"RSA-129"——129 位十进制数，预言"4×10^16 年才能分解"。
- **1978 年 2 月**：CACM 论文发表（投了 5 次才被接受，因为审稿人不信"算法能这么简单"）。
- **1982 年**：Rivest / Shamir / Adleman 创办 RSA Data Security 公司。
- **1991 年**：PGP 1.0 发布——绕过 RSA 专利做"个人邮件加密"，引爆**密码学开放运动**。
- **1994 年**：RSA-129 被 600 台机器分解（17 年前预计 4×10^16 年）。同年 Shor 算法发表。
- **1995 年**：Netscape SSL 用 RSA，HTTPS 时代开启。
- **2000 年**：RSA 美国专利到期，算法捐入公有领域。
- **2002 年**：三人共获 ACM 图灵奖。
- **2024 年**：NIST 正式发布 PQC 标准 ML-KEM / ML-DSA（曾用名 Kyber / Dilithium），开启后量子迁移。

## 学到什么

1. **公钥密码学的核心 = 找一个带"陷门"的单向函数**——大整数分解就是这样的函数：正向（乘）极快，反向（分解）极慢，**陷门 = 知道 p 和 q**。
2. **加密和签名是同一构造的两面**——RSA 的对偶美感（公钥锁 / 私钥开 ↔ 私钥签 / 公钥验）后来被 ElGamal、ECDSA 反复模仿。
3. **算法证明 ≠ 代码安全**——论文里 `c = m^e mod n` 一行；OpenSSL 实现 1500+ 行，多出来的全是 padding / constant-time / blinding / fault-check。
4. **困难假设的层级会变**——P ≠ NP（终极假设）→ 整数分解难（经验）→ RSA 安全（推论）。每一层都可能塌：量子计算把"分解难"这层敲碎了。

## 延伸阅读

- 论文 7 页 PDF：[Rivest-Shamir-Adleman 1978](https://people.csail.mit.edu/rivest/Rsapaper.pdf)（数学不重，主要看构造和证明思路）
- 视频教程：[Computerphile — Public Key Cryptography](https://www.youtube.com/watch?v=GSIDS_lvRv4)（10 分钟把 RSA 直觉讲透）
- 实践：[Cryptopals Set 5/6](https://cryptopals.com/sets/5)（自己实现 RSA 并把它打穿）
- [[diffie-hellman]] —— RSA 的前传，画招牌的人
- [[aes]] —— 与 RSA 配对的对称加密，混合加密里 RSA 包它的密钥

## 关联

- [[diffie-hellman]] —— DH 给框架，RSA 给可工作算法；学习顺序必须 DH → RSA
- [[aes]] —— RSA 加密对称密钥 + AES 加密内容 = TLS 1.2 的核心模式
- [[shor-algorithm]] —— 量子时代的 RSA 终结者，决定 2030 后必须迁移到 PQC
- [[ed25519]] —— 椭圆曲线签名，正在 SSH / TLS 1.3 替代 RSA
- [[turing-1936]] —— 可计算性的源头；Shor 算法证明"量子可计算"比经典更强

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[ben-sasson-stark-2018]] —— STARK — 不需要"可信第三方"的计算正确性证明
- [[bernstein-sphincs-2015]] —— SPHINCS 2015 — 不用记状态的后量子哈希签名
- [[bitcoin]] —— Bitcoin 白皮书
- [[bowe-halo-2019]] —— Halo 2019 — 不靠可信仪式递归压缩证明
- [[chaum-1981-mix]] —— Mix Network — 用信封套信封让邮局也不知道谁寄给谁
- [[chillotti-tfhe-2016]] —— TFHE 2016 — 把全同态加密的自举时间从分钟级压到 0.1 秒
- [[diffie-hellman]] —— Diffie-Hellman 密钥交换
- [[diffie-hellman-1976]] —— New Directions 1976 — 给协议世界写下公钥宪法
- [[ducas-dilithium-2018]] —— CRYSTALS-Dilithium 2018 — 后量子时代的主力数字签名
- [[dwork-dp-icalp-2006]] —— 差分隐私 — 让统计结果有用但查不到任何一个人
- [[fan-vercauteren-bfv-2012]] —— Fan-Vercauteren BFV — 让加密数据上做整数运算变得实际可用
- [[flush-reload-2014]] —— FLUSH+RELOAD 2014 — 用缓存时间偷看程序访问了哪行内存
- [[gabizon-plonk-2019]] —— PLONK — 一次通用布置，反复证明很多程序
- [[gentry-fhe-2009]] —— Gentry 2009 — 第一个全同态加密方案
- [[paillier-1999]] —— Paillier 1999 — 能在密文上直接做加法的公钥加密
- [[rabin-ot-1981]] —— Rabin OT 1981 — 不知道对方是否收到的秘密交换
- [[reed-onion-routing-1998]] —— Onion Routing 1998 — Tor 前身把匿名连接做成网络积木
- [[regev-lwe-2005]] —— Regev LWE 2005 — 把带噪声方程变成后量子密码地基
- [[saltzer-1984-e2e]] —— End-to-End Arguments — 把功能尽量推到端上做
- [[shor-1994]] —— Shor 1994 — 量子傅里叶变换把分解整数变成找周期
- [[yao-garbled-circuits-1986]] —— Yao Garbled Circuits — 两个人不摊牌也能一起算答案
