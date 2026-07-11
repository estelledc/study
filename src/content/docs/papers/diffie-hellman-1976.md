---
title: New Directions 1976 — 给协议世界写下公钥宪法
来源: 'Diffie & Hellman, "New Directions in Cryptography", IEEE TIT vol 22, 1976'
日期: 2026-06-01
分类: 网络协议
难度: 中级
---

## 是什么

1976 年 Diffie 和 Hellman 这篇发表在 IEEE TIT **vol.22** 的短文（约 11 页，pp.644–654），给后来几十年的网络协议奠了两块基石：

1. **公钥密码框架**：每个人公布一把"锁"（公钥）、私藏一把"钥匙"（私钥），不必先见面交换密钥。
2. **数字签名构想**：能不能用一封电子文件证明"这是我写的，不是别人冒名"？论文里只提了需求，但把方向定下来了。

日常类比：以前寄秘密信必须先派信使送钥匙。论文的公钥框架说——**你寄个开口的盒子（公钥）出去，谁都能往里塞东西，但只有你的私钥能打开**。DH 则是论文给出的**第一个可算的密钥协商实例**（双方各公开一个数，各自算出同一个共享秘密），和"往盒子里塞信"不是同一步。

这一篇直接催生了 1977 年的 RSA、1985 年的椭圆曲线密码，以及现代 TLS / SSH / Signal / 区块链所有公钥协议的形态。

## 为什么重要

不理解这篇论文，下面这些事讲不清：

- 浏览器打开 https:// 网站时，**没预先和服务器共享过密码**就能加密——靠的就是公钥协商
- 为什么所有现代协议都长成"先公钥协商出会话密钥，再用对称加密走数据"这种两段式
- 为什么 1976 年的标题敢叫《New Directions》——它不是改进，是把整个领域从"军方专用 + 预共享"模式翻成"开放网络 + 零信任"模式
- 为什么"数字签名"四个字成了法律级概念——这篇论文是源头

## 核心要点

论文做了三件大事：

1. **提出公钥密码框架**：每个人有一对钥匙——公钥发布给所有人，私钥自己藏。加密用对方公钥，解密用自己私钥。这个非对称设计是颠覆性的。

2. **给出第一个可行实例（DH 密钥交换）**：基于"模素数下做指数容易、反过来求离散对数难"这个数学事实——
   - 公开参数 `p`（大素数）和 `g`（生成元）
   - Alice 选私钥 `a`，公开 `A = g^a mod p`
   - Bob 选私钥 `b`，公开 `B = g^b mod p`
   - 各自算 `B^a` 或 `A^b`，都得到 `g^(ab) mod p`——共享密钥诞生
   - 窃听者只看到 A、B，要还原 `g^(ab)` 必须解离散对数——大素数下计算不可行

3. **数字签名构想**：论文说"应该存在一种私钥签、公钥验的方案"。当时没给具体算法，但定义了需求——一年后 RSA 直接补上。

**和现有 [[diffie-hellman]] 笔记的区别**：那一篇讲算法本身怎么算；本文聚焦这篇论文作为**网络协议宪法**的影响——它定义了"握手"这个动作的数学模板。

## 实践案例

### 案例 1：TLS 1.3 握手就是 DH

抓一次 TLS 1.3 握手包，会看到：

```
ClientHello → key_share extension → 公钥 A = g^a mod p（或椭圆曲线点）
ServerHello → key_share extension → 公钥 B = g^b mod p
```

两边各自算出共享密钥后，立刻切换到对称加密（AES-GCM 等）。整个过程只一个 RTT。这就是 1976 论文的直接落地——握手即 DH。

### 案例 2：SSH 第一次连接

```bash
ssh user@host
# The authenticity of host can't be established.
# ECDSA key fingerprint is SHA256:...
# Are you sure you want to continue connecting (yes/no)?
```

那个 fingerprint 就是服务器的公钥指纹，确认 yes 就触发 ECDH 协商。这套流程几乎逐字对应 1976 论文里的"公钥分发 + 协商"两步。

### 案例 3：数字签名的现代形态

论文里只是构想，1977 RSA 给出实现。今天每次：

- 浏览器验 HTTPS 证书 → 验签
- Git commit 加 GPG 签名 → 验签
- 软件包 apt/npm 的发布者签名 → 验签
- 区块链每笔交易由发起方私钥签名 → 验签

全部源于这篇论文里"用私钥签，公钥验"的概念。

### 案例 4：用 Python 几行代码玩一遍

```python
from cryptography.hazmat.primitives.asymmetric.dh import generate_parameters

# 演示用：现场生成参数。真实协议多用命名曲线/固定组，不每次现场造 p、g
params = generate_parameters(generator=2, key_size=2048)
alice_priv = params.generate_private_key()
bob_priv = params.generate_private_key()

alice_pub = alice_priv.public_key()
bob_pub = bob_priv.public_key()

shared_alice = alice_priv.exchange(bob_pub)
shared_bob = bob_priv.exchange(alice_pub)
assert shared_alice == shared_bob
```

跑一遍能直观看到"两边各算各的，最后值相等"——这就是 1976 论文最核心的魔法。

## 踩过的坑

1. **DH 单用必被中间人攻击**：论文给了协商方法，**没解决身份认证**。攻击者站中间，分别和两端各跑一次 DH，两边都以为在和对方说话。所以现实协议里 DH **必须**配数字签名（证书机制），单跑 DH 在不可信网络上等于裸奔。

2. **参数选错灾难（Logjam 2015）**：1990s 美国出口管制，很多服务器用 512 位素数。学术团队 1 周破了——影响 8% HTTPS 站点。教训：素数 < 2048 位别用，椭圆曲线 < 256 位别用。

3. **静态 DH 无前向保密**：如果一端的私钥长期不变，攻击者今天截获密文存档，未来某天偷到私钥就能解密所有历史会话。修复：每次会话用临时密钥（Ephemeral DH，缩写 DHE / ECDHE）——这是"前向保密"在协议设计里的来源。

4. **离散对数难题不是绝对难**：1994 年 Shor 算法证明量子计算机能在多项式时间破 DLP。所以 NIST 2024 标准化 Kyber 等后量子 KEM——但短期内仍会和 ECDH 混合用。

## 适用 vs 不适用场景

**适用**：
- 设计任何"双方初次通信、没预共享密钥"的协议（HTTPS / SSH / VPN / IM / 区块链节点握手）
- 需要前向保密的会话型协议——用 ECDHE
- 学习现代协议时的入门钥匙——TLS、Signal、Noise 全是这套思想的变体

**不适用**：
- 直接加密大段数据 → 用对称密码（AES 等），DH 只协商密钥
- 1:N 广播加密 → DH 是两两协商，群组密钥要用专门方案（Signal 的 X3DH+Double Ratchet 等）
- 极度受限的嵌入式场景 → 模幂运算开销大，可能用预共享密钥更现实
- 后量子威胁场景 → 单纯 DH 不够，需要混合 KEM

## 历史小故事（可跳过）

- **1969 年**：英国 GCHQ 的 James Ellis 内部论文已经提出"非对称加密"的可能性，但属国家机密，1997 年才解密
- **1973 年**：GCHQ 的 Clifford Cocks 内部发明了等价于 RSA 的方案，同样保密
- **1976 年**：Diffie 和 Hellman 在斯坦福把整个想法**公开**发表——这是公钥密码进入开放学术界的元年
- **1977 年**：MIT 三人组（Rivest、Shamir、Adleman）受这篇启发造出 RSA，把数字签名构想兑现
- **1985 年**：Koblitz 和 Miller 各自独立提出椭圆曲线密码，后来变成 ECDH
- **1995 年**：Netscape 把 DH + RSA 拼成 SSL，把这套学术成果首次大规模铺到互联网
- **2017 年**：TLS 1.3 把所有非前向保密的密钥交换扔掉，强制 (EC)DHE
- **2024 年**：NIST 正式标准化 ML-KEM（Kyber），后量子时代起跑

## 学到什么

1. **协议设计的范式转移**：1976 之前所有密码协议假设"先共享密钥"；之后默认假设"零信任"。这是网络协议史上最大的范式翻转。
2. **构想也是贡献**：数字签名概念论文里只是一段话，但定义清需求让别人能填——一年后 RSA 就补上了
3. **公开是力量**：GCHQ 早 7 年发现等价方案但保密，工业界完全不知道。Diffie-Hellman 公开发表后，3 年内全行业跑起来
4. **理论 → 协议 → 工业**：1976 论文 → 1977 RSA 算法 → 1995 SSL 落地。每一步隔将近 10 年
5. **协议要可演进**：原始 DH 没解决身份验证、没有前向保密、没扛量子——但框架足够好，让后人能一层层补，而不是推倒重来

## 延伸阅读

- 论文原文 PDF：[New Directions in Cryptography 1976](https://ee.stanford.edu/~hellman/publications/24.pdf)（IEEE TIT vol.22，约 11 页；前几页就是核心思想）
- Hellman 本人回顾：[An Overview of Public Key Cryptography](https://ee.stanford.edu/~hellman/publications/31.pdf)
- Computerphile 视频：[Diffie Hellman -the Mathematics bit](https://www.youtube.com/watch?v=Yjrfm_oRO0w)（10 分钟把数学讲透）
- 教材：Katz & Lindell《Introduction to Modern Cryptography》第 11 章

## 关联

- [[diffie-hellman]] —— 同一篇论文的算法视角；这里偏协议宪法视角
- [[rsa]] —— 一年后兑现了 1976 论文里的数字签名构想
- [[tls-1.3]] —— 现代协议把这套思想推到极致，强制前向保密
- [[aes]] —— DH 协商出来的密钥用来给 AES 当对称密钥，两者搭档
- [[turing-1936]] —— 计算可行性的边界；DH 安全性建立在 DLP 计算上不可行之上

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[ben-sasson-stark-2018]] —— STARK — 不需要"可信第三方"的计算正确性证明
- [[bernstein-sphincs-2015]] —— SPHINCS 2015 — 不用记状态的后量子哈希签名
- [[chaum-1981-mix]] —— Mix Network — 用信封套信封让邮局也不知道谁寄给谁
- [[cheon-ckks-2017]] —— CKKS — 让加密数据也能做浮点运算
- [[chillotti-tfhe-2016]] —— TFHE 2016 — 把全同态加密的自举时间从分钟级压到 0.1 秒
- [[dwork-calibrating-noise-2006]] —— 校准噪声 — 往统计结果里加多少噪音才能保护隐私
- [[dwork-dp-icalp-2006]] —— 差分隐私 — 让统计结果有用但查不到任何一个人
- [[dwork-our-data-ourselves-2006]] —— 分布式噪声 — 大家一起加噪音比一个人加更安全
- [[fan-vercauteren-bfv-2012]] —— Fan-Vercauteren BFV — 让加密数据上做整数运算变得实际可用
- [[kim-rowhammer-2014]] —— RowHammer 2014 — 反复读一行内存也能翻转邻居比特
- [[logjam-2015]] —— Logjam 2015 — 全世界共用一把锁，国家级窃听者一次撬完
- [[paillier-1999]] —— Paillier 1999 — 能在密文上直接做加法的公钥加密
- [[rabin-ot-1981]] —— Rabin OT 1981 — 不知道对方是否收到的秘密交换
- [[reed-onion-routing-1998]] —— Onion Routing 1998 — Tor 前身把匿名连接做成网络积木
- [[regev-lwe-2005]] —— Regev LWE 2005 — 把带噪声方程变成后量子密码地基
- [[shor-1994]] —— Shor 1994 — 量子傅里叶变换把分解整数变成找周期
- [[yao-garbled-circuits-1986]] —— Yao Garbled Circuits — 两个人不摊牌也能一起算答案
