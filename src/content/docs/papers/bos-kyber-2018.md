---
title: Bos-Kyber 2018 — 把后量子密钥交换做成可落地的标准候选
来源: 'Bos et al., "CRYSTALS-Kyber: A CCA-Secure Module-Lattice-Based KEM", IEEE EuroS&P 2018'
日期: 2026-07-07
分类: security-privacy
难度: 中级
---

## 是什么

CRYSTALS-Kyber 是一套**后量子密钥封装机制**：两台机器隔着互联网，先不用共享秘密，也能协商出同一把会话密钥。日常类比：像快递柜取件码，寄件人把取件码锁进柜子，收件人用自己的钥匙打开，旁边看热闹的人只看到柜门编号和一张回执。

这里的"后量子"不是说它要在量子电脑上跑，而是说：即使未来有人有强量子电脑，它也不应该像 RSA、经典椭圆曲线那样被 Shor 算法轻松拆掉。

论文做的事情很具体：先设计一个基于 Module-LWE 的公钥加密方案，再用 Fujisaki-Okamoto 风格转换把它变成能抵抗选择密文攻击的 KEM，最后给出 C 和 AVX2 实现与性能对比。

后来 NIST 的 ML-KEM 标准就是从 Kyber 演化来的，所以这篇可以看成现代后量子 TLS 里"换钥匙那一步"的关键源头。

读这篇时先抓住一句话：Kyber 不是新的"锁"，而是一套把新钥匙安全交到双方手里的流程。

## 为什么重要

不理解 Kyber，下面这些事都没法解释：

- 为什么浏览器和服务器现在会讨论"混合密钥交换"，而不是只继续用椭圆曲线 Diffie-Hellman。
- 为什么 NIST 最终标准化的是 ML-KEM 这种 KEM，而不是直接把一篇论文原样塞进 TLS。
- 为什么格密码总在谈 LWE、Ring-LWE、Module-LWE：它们是在效率和保守性之间调旋钮。
- 为什么论文既讲数学安全证明，又花很多篇幅报 cycle count、字节数和向量化实现。

## 核心要点

1. **KEM 是"寄一个随机钥匙"**。类比：你不是把整份文件寄给对方，而是寄一个保险箱钥匙；真正的大文件后面用对称加密处理。Kyber 的 Encaps 产出一段密文和共享密钥，Decaps 用私钥从密文恢复同一把密钥。

2. **Module-LWE 是折中版的格难题**。类比：纯 LWE 像每次搬很多小砖，很稳但重；Ring-LWE 像用一块大预制板，很快但结构更多；Module-LWE 把几块中等预制板拼起来，试图兼顾速度和安全余量。

3. **CCA 安全靠"开柜前先验票"**。Kyber 先有一个只抵抗窃听的 CPA 加密，再加哈希、重加密检查和失败时的备用密钥，让攻击者不能通过乱投密文来试探私钥。这个包装思路来自 Fujisaki-Okamoto 转换。

## 实践案例

### 案例 1：KEM 在协议里长什么样

```text
client:  pk, sk = KeyGen()
client -> server: pk
server:  ct, ss1 = Encaps(pk)
server -> client: ct
client:  ss2 = Decaps(sk, ct)
assert ss1 == ss2
```

**逐部分解释**：

- `pk` 是公开钥匙，放到网络上也没关系；`sk` 是只能自己拿着的私钥。
- `ct` 是密钥封装后的"回执"，它不直接等于共享密钥。
- `ss1` 和 `ss2` 是双方最终拿到的 shared secret，后面再喂给 HKDF 或类似 KDF。

### 案例 2：LWE 的"带噪声线索"

```python
q = 17
a = [3, 5, 11]
s = [2, 4, 1]
e = 1
b = (sum(x * y for x, y in zip(a, s)) + e) % q
print(b)  # 10
```

**逐部分解释**：

- `a` 是公开随机向量，攻击者也能看到。
- `s` 是秘密向量，真实方案里长度和模数都大得多。
- `e` 是小噪声；没有它就是普通线性方程，有它才变成难题。

### 案例 3：FO 风格检查为什么能挡试探

```text
Decaps(sk, ct):
  m = decrypt(sk, ct)
  ct_check, key = encaps_again(m, pk)
  if ct_check == ct:
      return key
  return fallback_key
```

**逐部分解释**：

- 第一步先尝试解出隐藏消息 `m`，但不马上把结果暴露给攻击者。
- 第二步用 `m` 重新封装一次，看得到的密文是否和输入完全一致。
- 如果不一致，算法返回伪随机备用值，避免"错误信息"变成私钥侧信道。

## 踩过的坑

1. **把 Kyber 当成对称加密**：KEM 只负责协商共享密钥，原因是大流量数据仍应交给 AES-GCM 或 ChaCha20-Poly1305 这类对称算法。

2. **以为 CCA 只是数学装饰**：网络攻击者可以主动改密文，原因是 TLS 场景默认面对的不是旁观者，而是能投递坏输入的人。

3. **只看密钥长度不看参数语义**：Kyber-512、768、1024 对应不同安全目标，原因是 `k`、压缩位数和噪声分布一起决定安全和性能。

4. **自己手写随机数和常数时间代码**：格密码对采样、失败概率和侧信道很敏感，原因是一次偏差可能把安全证明里的假设打破。

## 适用 vs 不适用场景

**适用**：

- TLS、VPN、消息协议里需要协商会话密钥的地方。
- 希望提前抵抗"今天录流量，未来用量子电脑解密"的长期保密场景。
- 可以使用成熟标准库、并愿意采用混合模式逐步迁移的系统。

**不适用**：

- 想直接加密大文件内容的场景：KEM 不是文件加密器。
- 需要数字签名的场景：应看 Dilithium、Falcon、SPHINCS+ 一类签名方案。
- 随手复制论文伪代码进生产的场景：需要标准化参数、测试向量和抗侧信道实现。

## 历史小故事（可跳过）

- **2005 年**：Regev 提出 LWE，把"带噪声线性方程很难解"变成格密码的核心语言。
- **2016 年**：NewHope 等 Ring-LWE 方案进入浏览器实验，人们看到后量子密钥交换真的能跑。
- **2017 年**：Kyber 以 CRYSTALS 套件的一部分提交给 NIST 后量子标准化项目。
- **2018 年**：EuroS&P 论文系统写清 Kyber 的 KEM 构造、安全分析和实现性能。
- **2024 年**：NIST 发布 FIPS 203，ML-KEM 成为以 Kyber 为基础的标准化 KEM。

## 学到什么

- 后量子迁移的第一步不是"全换掉"，而是先把密钥协商从易受量子攻击的数论假设迁到格假设。
- Kyber 的工程味很重：安全证明、参数选择、字节大小、CPU cycle 和库集成都必须同时成立。
- Module-LWE 的价值在于折中：比普通 LWE 更快，比 Ring-LWE 少押注一些额外代数结构。
- 标准化会改名字和细节：读论文时看 Kyber，落地时还要对照 ML-KEM / FIPS 203。
- 密码论文的"能用"至少包含三层：数学上难破、协议上抗主动攻击、实现上不泄漏细节。

## 延伸阅读

- 论文 PDF：[Bos et al. 2018 — CRYSTALS-Kyber](https://eprint.iacr.org/2017/634)（原始算法、证明和 benchmark）。
- 标准文档：[NIST FIPS 203 — ML-KEM](https://nvlpubs.nist.gov/nistpubs/fips/nist.fips.203.pdf)（落地时应优先看的规范）。
- 项目主页：[CRYSTALS Kyber](https://pq-crystals.org/kyber/)（参数、实现和背景材料）。
- [[regev-lwe-2005]] —— LWE 难题的源头，Kyber 继承的是这条路线。
- [[fujisaki-okamoto-1999]] —— 把 CPA 加密包装成 CCA KEM 的关键思想。

## 关联

- [[regev-lwe-2005]] —— Kyber 的安全直觉来自"带噪声线性方程难解"。
- [[ml-kem-fips-203]] —— Kyber 标准化后的名字和工程规范。
- [[dilithium]] —— CRYSTALS 套件里的签名搭档，解决认证而不是密钥封装。
- [[tls-13]] —— Kyber/ML-KEM 最常见的落地场景之一是 TLS 握手。
- [[aes]] —— KEM 协商出密钥后，真正大量数据通常交给对称加密。
- [[openssl]] —— 生产环境使用后量子 KEM 时会通过密码库暴露接口。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
