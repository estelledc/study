---
title: Diffie-Hellman 密钥交换
来源: 'Diffie & Hellman, "New Directions in Cryptography", IEEE TIT 1976'
日期: 2026-05-29
分类: 密码学
难度: 中级
---

## 是什么

Diffie-Hellman（**DH**）是一套**让两个互不认识的人，在所有人都能听到的公开广播频道上，协商出一个只有他俩知道的共享密钥**的方法。

日常类比：两个人各自手里调一种秘密颜料。

1. 大家先约好一种公开的"基础颜料"（黄色）
2. Alice 偷偷往黄色里加一勺"红"，得到橙色，把橙色寄给 Bob
3. Bob 偷偷往黄色里加一勺"蓝"，得到绿色，把绿色寄给 Alice
4. Alice 拿到绿色再加自己的"红"，得到棕色
5. Bob 拿到橙色再加自己的"蓝"，得到棕色

两人都得到棕色——但中间偷看的窃听者只看到黄、橙、绿，**没法把橙和绿"反向拆"出红和蓝**，所以也调不出棕色。

DH 把这个直觉用数学（指数运算 + 模素数）实现，让"调颜料"从比喻变成可计算的协议——安全性建立在离散对数难题假设上。

## 为什么重要

不理解 DH，下面这些事都没法解释：

- 为什么打开 https:// 网站时，浏览器和服务器**第一次连接就能加密**——它们没预共享密码，靠的就是 DH（或它的椭圆曲线版 ECDH）
- 为什么 SSH / VPN / WhatsApp / Signal 都说"端到端加密"——底层全部是 DH 协商出会话密钥
- 为什么 1976 年的论文叫《New Directions in Cryptography》——它第一次提出"公钥密码"概念，把密码学从"先共享密钥"时代推进到"零信任也能加密"
- 为什么一年后 [[rsa]] 出现就直接成为另一座大山——DH 给了 RSA 灵感

## 核心要点

DH 协议三步：

1. **公开参数**：选一个大素数 `p` 和生成元 `g`（`p` 通常 2048 位以上）。这两个数全世界都能看到。

2. **各自生成私钥 + 公钥**：
   - Alice 选一个秘密整数 `a`（私钥），算出 `A = g^a mod p`（公钥），公开发出去
   - Bob 选秘密整数 `b`，算出 `B = g^b mod p`，公开发出去

3. **各自计算共享密钥**：
   - Alice 拿到 `B`，算 `B^a mod p = g^(ab) mod p`
   - Bob 拿到 `A`，算 `A^b mod p = g^(ab) mod p`
   - 两人得到同一个值——这就是共享密钥

**为什么窃听者算不出来**：他看到 `g`、`p`、`A`、`B`，要算 `g^(ab)` 必须先从 `A = g^a` 反推出 `a`。这叫"离散对数难题"（DLP）：在大素数下没有已知高效算法，2048 位需要超算跑几亿年。

**椭圆曲线版（ECDH）**：把"指数运算 + 模素数"换成"椭圆曲线上的点乘"，安全性同等的前提下，密钥从 2048 位缩到 256 位，计算快几十倍。现代 TLS / Signal 默认用 ECDH。

## 实践案例

### 案例 1：toy DH 手算一遍

参数：`p = 23`、`g = 5`。

- Alice 选 `a = 4`，算 `A = 5^4 mod 23 = 625 mod 23 = 4`
- Bob 选 `b = 3`，算 `B = 5^3 mod 23 = 125 mod 23 = 10`
- 公开交换 A 和 B
- Alice 算 `10^4 mod 23 = 10000 mod 23 = 18`
- Bob 算 `4^3 mod 23 = 64 mod 23 = 18`

共享密钥 = **18**。窃听者看到 `p=23, g=5, A=4, B=10`，要算 18 必须先从 `5^x mod 23 = 4` 反推 x——p=23 太小一秒就破，但换成 2048 位素数就是宇宙时间。

### 案例 2：TLS 1.3 握手简化版

```
Client                              Server
  |  ClientHello (g, p, A=g^a)        |
  |---------------------------------->|
  |                                   |  生成 b，算 B=g^b、shared=A^b
  |  ServerHello (B=g^b) + 加密内容   |
  |<----------------------------------|
  |  算 shared=B^a，解密后续          |
```

TLS 1.3 一个 RTT（往返）就完成密钥协商 + 第一段加密数据，比 1.2 的两个 RTT 快一倍。

### 案例 3：openssl 命令行走完协商

```bash
# 生成 DH 参数（慢，可缓存复用）
openssl dhparam -out dhparams.pem 2048
# Alice / Bob 各自生成密钥对，并导出公钥互发
openssl genpkey -paramfile dhparams.pem -out alice.pem
openssl pkey -in alice.pem -pubout -out alice.pub
openssl genpkey -paramfile dhparams.pem -out bob.pem
openssl pkey -in bob.pem -pubout -out bob.pub
# 各自用「己方私钥 + 对方公钥」派生共享秘密（应相等）
openssl pkeyutl -derive -inkey alice.pem -peerkey bob.pub -out alice.shared
openssl pkeyutl -derive -inkey bob.pem -peerkey alice.pub -out bob.shared
cmp alice.shared bob.shared && echo "shared secret OK"
```

输出还只是原始共享材料，真实协议会再经 KDF 才交给 AES。

## 踩过的坑

1. **中间人攻击（MITM）**：原始 DH **不验证身份**。攻击者站中间，分别和 Alice / Bob 各跑一次 DH，两边都以为在和对方说话，实际都是和攻击者说。修复：DH **必须配数字签名**（如 RSA / ECDSA 签公钥），这就是 TLS 里"证书 + DH"的组合。

2. **短素数被破（Logjam 2015）**：当年很多服务器为了兼容旧浏览器，用 512 位素数。研究者用学术级算力 1 周破了——影响 8% 的 HTTPS 站。教训：素数 < 2048 位别用。

3. **静态 DH 没前向保密**：如果 Alice 的私钥 `a` 长期不变，攻击者今天截获密文存档，未来某天偷到 `a`，就能解密**所有历史会话**。修复：每次会话用临时 DH（**Ephemeral DH，DHE / ECDHE**），私钥用完即扔。这是"前向保密"（Forward Secrecy）的来源。

4. **不要自己实现**：随机数生成器有偏 / 模幂运算时序泄露 / 参数选错 → 全是漏洞历史。用 OpenSSL / libsodium，别造轮子。

## 适用 vs 不适用场景

**适用**：
- 双方初次通信、没预共享密钥时协商会话密钥（HTTPS / SSH / VPN / IM）
- 需要前向保密的场景（用 ECDHE）
- 后续配对称加密用——DH 只协商密钥，加密本身用 AES 等

**不适用**：
- 直接加密大段数据 → 用 [[aes]] 等对称密码，DH 只是给 AES 提供密钥
- 数字签名 / 身份认证 → 用 RSA / ECDSA / Ed25519，不是 DH
- 后量子时代 → Shor 算法能用量子计算机破 DLP；2024 起标准转向 Kyber 等后量子 KEM

## 历史小故事（可跳过）

- **1976 年**：Whitfield Diffie 和 Martin Hellman 在斯坦福发表《New Directions in Cryptography》——第一篇公开提出"公钥密码"概念的论文
- **1977 年**：MIT 三人组（Rivest、Shamir、Adleman）受 DH 启发，造出 [[rsa]]——第一个能签名 + 加密的公钥算法
- **1985 年**：Koblitz / Miller 提出椭圆曲线密码，后来演化成 ECDH
- **1997 年**：英国 GCHQ 解密档案——他们 1969 年内部已经发现类似想法，但保密 28 年
- **2017 年**：TLS 1.3 把所有非前向保密的密钥交换扔掉，强制 (EC)DHE
- **2024 年**：NIST 标准化 Kyber，准备后量子时代——但 DH 仍会和 Kyber 混合用很多年

## 学到什么

1. **公开通道也能协商秘密**——这是密码学过去 50 年最反直觉的结论
2. **难题驱动安全**：DH 的安全性不靠"藏算法"，靠"DLP 计算上不可行"。算法完全公开
3. **协议要配身份验证**：DH 单用必被中间人攻击，必须配签名——给后来的 TLS / Signal 协议设计立了规矩
4. **前向保密是重要属性**：临时密钥让"今天截获、明天偷钥匙"的攻击失效
5. **理论先行**：1976 论文提出概念，工业落地花了 20 年（1995 SSL 才铺开）

## 延伸阅读

- 视频：[Computerphile — Diffie Hellman -the Mathematics bit](https://www.youtube.com/watch?v=Yjrfm_oRO0w)（10 分钟把数学讲透）
- 教材：Katz & Lindell《Introduction to Modern Cryptography》第 11 章——DH 的形式化定义和证明
- 论文 PDF：[Diffie-Hellman 1976 原文](https://ee.stanford.edu/~hellman/publications/24.pdf)（10 页，前 3 页就是核心思想）
- 互动可视化：[CrypTool Online — DH](https://www.cryptool.org/en/cto/dh)（可改参数玩协议）

## 关联

- [[rsa]] —— DH 一年后的兄弟算法；DH 协商密钥、RSA 签名 + 加密；现代 TLS 同时用两者
- [[aes]] —— DH 协商出来的密钥用来给 AES 当对称密钥，两者搭档
- [[turing-1936]] —— 计算可行性的边界；DH 安全性建立在"DLP 计算上不可行"之上

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[aes]] —— AES Rijndael 对称分组密码
- [[bitcoin]] —— Bitcoin 白皮书
- [[diffie-hellman-1976]] —— New Directions 1976 — 给协议世界写下公钥宪法
- [[dingledine-mixminion-2003]] —— Mixminion — 用一次性回信票据保护匿名邮件
- [[freedman-psi-2004]] —— Freedman PSI 2004 — 把集合交集算出来但不交出名单
- [[logjam-2015]] —— Logjam 2015 — 全世界共用一把锁，国家级窃听者一次撬完
- [[ngabonziza-trustzone-2016]] —— TrustZone Explained — 把手机 CPU 分成普通区和保密区
- [[rsa]] —— RSA 公钥密码
- [[saltzer-1984-e2e]] —— End-to-End Arguments — 把功能尽量推到端上做
- [[sgx-2013]] —— Intel SGX — 在 CPU 里建一间谁都偷看不了的密室
- [[tamarin-2012]] —— Tamarin — 让计算机自己证 Signal、TLS 1.3 这种带 DH 的协议是不是真安全
- [[wireguard-2017]] —— WireGuard — 4000 行代码重写 VPN 的极简主义
- [[element-android]] —— Element Android — Matrix 协议官方 Android 客户端（Kotlin + Realm）
- [[matrix-rust-sdk]] —— matrix-rust-sdk — Matrix 客户端的"共享发动机"
- [[mbedtls]] —— Mbed TLS — 嵌入式设备的轻量级 TLS 加密库
- [[signal-android]] —— Signal Android — 让 Android 上的每条消息都只有两端能看见
- [[signal-ios]] —— Signal iOS — 让 iPhone 上的每条消息都只有两端能看见
