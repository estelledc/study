---
title: HACL* — 用数学证明过的 C 加密代码，跑在你 Firefox 和 Linux 内核里
来源: 'Zinzindohoué, Bhargavan, Protzenko, Beurdouche, "HACL*: A Verified Modern Cryptographic Library", ACM CCS 2017'
日期: 2026-05-31
子分类: 形式化验证
分类: 形式化方法
难度: 高级
provenance: pipeline-v3
---

## 是什么

HACL\*（读作 H-A-C-L-star）是一套**用 F\* 写代码 + Z3 自动证明 + 提取成 C 的密码学库**。日常类比：像药厂生产药——配方先在实验室（F\*）经数学家审一遍，证明"这个分子在任何条件下都不会出意外"，再走自动化产线（KreMLin）灌装成普通药片（C 代码），药店（Firefox / Linux 内核）直接上架。

它实现了一整套现代密码原语：

- **椭圆曲线**：Curve25519（密钥交换）、Ed25519（签名）
- **流密码**：ChaCha20、Salsa20
- **MAC**：Poly1305、HMAC
- **哈希**：SHA-2 全家族
- **密钥派生**：HKDF

每一个都附带**机器检查过的数学证明**：内存安全 + 功能正确 + 不泄密钥（常量时间）。

提取出的 C 代码**已经在 Firefox 浏览器、Linux 内核 WireGuard、Project Everest 验证过的 TLS 1.3 里跑着**——形式化验证第一次大规模进了普通人每天用的软件。

## 为什么重要

不理解 HACL\*，下面这些事很难解释：

- 为什么"密码学代码出 bug"是个工业灾难——OpenSSL Heartbleed（2014）让全互联网换证书；HACL\* 在源头消灭这类 bug
- 为什么 Linus 几乎不让新代码进 Linux 内核 crypto 子系统——但 WireGuard 用 HACL\* 的 Curve25519 进了 5.6 主线
- 为什么"形式化验证"长期被嫌"学术玩具"——HACL\* 证明可以工业级、可读、性能不输手工 C
- 为什么"常量时间"在密码学里是性命攸关的——执行时间泄密钥比代码 bug 还可怕

## 核心要点

HACL\* 在三个层面同时做证明：

1. **内存安全（memory safety）**：无越界访问、无悬垂指针、无 use-after-free。F\* 的精化类型让"数组下标必须 < 长度"成为编译期约束。

2. **功能正确（functional correctness）**：提取出来的 C 代码行为 = 数学规格（spec）。比如 ChaCha20 的 spec 直接写在 F\* 里照着 RFC 7539 抄一遍，证明"实现 ≡ spec"。

3. **不泄密钥（secret independence / 常量时间）**：执行路径、内存访问、分支跳转**都不依赖密钥的值**。攻击者从外部看代码跑了多久、访问了哪些缓存行，也猜不出密钥。这一性质用 F\* 的"标记类型"（secret int vs public int）静态保证。

证明工具链：

```
F* 源代码  →  Z3 自动证明  →  KreMLin 提取  →  可读 C 代码
（写规格 + 实现）  （SMT 解 80% 简单 VC）  （消除依赖类型/高阶）  （进 Firefox / Linux）
```

## 实践案例

### 案例 1：Curve25519 进 Linux 内核

WireGuard（VPN 协议，作者 Jason Donenfeld）2020 年合并进 Linux 5.6 主线。它的 Curve25519 实现用的就是 HACL\* 提取出的 `lib/crypto/curve25519-hacl64.c`：

```c
// 文件头部注释（节选）
/*
 * Copyright (C) 2016-2020 INRIA, CMU and Microsoft Corporation
 * This is a machine-generated formally verified implementation
 * of Curve25519 from the HACL* library.
 */
```

每一行 C 代码都是 F\* 编译产物。内核里头一回有"由数学证明背书的密码代码"。

### 案例 2：精化类型挡住越界访问

```fstar
val chacha20_block:
  out:lbuffer uint8 64ul ->     // 输出缓冲区，长度恰好 64
  key:lbuffer uint8 32ul ->     // 密钥，恰好 32 字节
  counter:uint32 ->
  nonce:lbuffer uint8 12ul ->   // nonce，恰好 12 字节
  Stack unit
    (requires fun h -> live h out /\ live h key /\ live h nonce)
    (ensures fun h0 _ h1 -> modifies (loc out) h0 h1)
```

`lbuffer uint8 64ul` = "长度精确为 64 的 uint8 数组"。任何调用方传错长度，**编译就过不去**。`requires`/`ensures` 是前置后置条件——Z3 会去证明实现满足。

### 案例 3：常量时间靠类型系统强制

```fstar
// 密钥被标记为 secret
let key: secret_int = ...

// 这一句编译报错：分支条件含 secret，会泄信息
if key = 0 then ... else ...

// 改成常量时间的等价写法（用按位运算代替分支）
let mask = eq_mask key 0ul
let result = (mask &^ a) |^ ((lognot mask) &^ b)
```

类型系统拒绝在 secret 上分支/索引，强制写常量时间代码。

## 踩过的坑

1. **F\* 学习曲线陡到劝退**——需要懂 refinement type、Dijkstra monad、Hoare 三元组。论文作者也承认普通工程师上手要几个月。

2. **Z3 慢且会"超时"**——SMT solver 是启发式的，复杂的证明义务（VC）会跑 30 分钟还出不来。这时候要手工拆 lemma 引导 Z3，或者写 tactic 兜底。

3. **spec 自身可能错**——证明的是"实现 = spec"，但 spec 是人写的。HACL\* 的 spec 紧贴 RFC（比如 ChaCha20 抄 RFC 7539），但 RFC 自己有歧义时也跟着错。

4. **性能不及手工汇编**——HACL\* 提取的 C 与 libsodium 手工 C 性能相当，但比 BoringSSL 的手工汇编（用 AVX2/BMI2 指令）慢 1.5-3x。后续工作 Vale/Jasmin 才补上汇编层验证。

## 适用 vs 不适用场景

**适用**：

- 安全敏感的密码原语（TLS / VPN / 端到端加密）
- 长期维护的库——一次证明、永久受益、改动有约束
- 跨平台分发——提取的 C 不依赖运行时，编译进任何系统都行

**不适用**：

- 一次性脚本 / 快速原型——证明成本远高于代码本身
- 需要榨干硬件性能的场景——手工汇编 + AES-NI 仍快 2-3x
- 协议层逻辑（TLS 状态机等）——HACL\* 只到原语，协议层用 miTLS

## 历史小故事（可跳过）

- **2013**：INRIA 的 miTLS 项目用 F\# 验证 TLS 协议状态机，但密码原语还得调 OpenSSL（不可信）。
- **2015**：F\* 1.0 发布，把 SMT 自动化拼进依赖类型语言，"pay-as-you-go"理念诞生。
- **2017 CCS**：HACL\* 论文公布，第一次给一整套现代密码原语集体上证明。
- **2018**：Mozilla NSS 合并 HACL\* 的 Curve25519 / ChaCha20-Poly1305，Firefox 用户全量切换。
- **2020**：WireGuard 进 Linux 5.6 主线，HACL\* Curve25519 入内核。
- **后续**：Project Everest 把 HACL\* + miTLS + Vale 拼成完整 verified TLS 1.3 栈。

## 学到什么

1. **形式化验证可以工业化**——不必所有代码都证，**密码原语**这种"小、关键、长寿"的场景投入产出比极高
2. **三性质同时证才有意义**——光证内存安全没用，常量时间不证就被时序攻击；HACL\* 三件齐全
3. **可读 C 是关键妥协**——选 C 而不是汇编/Rust，是为了让任何系统直接编译进去；性能稍差换可移植
4. **spec ≠ impl**——验证只能保证"实现满足规格"，规格自身要靠人审。HACL\* 紧贴 RFC 让规格审查可外包

## 延伸阅读

- 论文 PDF：[HACL\* CCS 2017](https://eprint.iacr.org/2017/536.pdf)
- 代码仓库：[hacl-star/hacl-star on GitHub](https://github.com/hacl-star/hacl-star)
- WireGuard 内核代码：Linux 源码 `lib/crypto/curve25519-hacl64.c`
- Project Everest 总览：[project-everest.github.io](https://project-everest.github.io/)
- Protzenko 的 KreMLin 论文（2017 ICFP）讲提取 C 的细节
- [[fstar]] —— HACL\* 的实现语言
- [[aes]] —— 对称加密标准，HACL\* 也实现了 AES-GCM

## 关联

- [[fstar]] —— F\* 是 HACL\* 的写法语言；refinement type + Dijkstra monad 都来自这里
- [[aes]] —— AES 是经典分组密码，HACL\* 把它和 ChaCha20 都做了验证版
- [[cakeml]] —— CakeML 验证编译器，与 HACL\* 同属"可信计算基"思路（验到机器码）
- [[lean-prover]] —— Lean 是另一种证明助手，但走 tactic 路线，与 F\* 的 SMT 路线对照
- [[hoare-logic]] —— Dijkstra monad 的数学根在 Hoare 三元组
- [[liquid-types]] —— Refinement type 的近亲，HACL\* 用的是 F\* 版

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[bernstein-sphincs-2015]] —— SPHINCS — 无状态哈希签名，后量子密码的"保险"
- [[cakeml]] —— CakeML — 从源码到机器码每一步都被数学证明的 ML 编译器
- [[fstar]] —— F* — 把依赖类型、SMT 自动化、副作用追踪揉到一门语言里
- [[hoare-logic]] —— Hoare Logic — 把"程序对不对"变成"数学证明对不对"
- [[lean-prover]] —— Lean 4 — 用 Lean 重写的 Lean，让数学家和程序员共用一种语言
- [[liquid-types]] —— Liquid Types — 让编译器自己推导出"哪些值才合法"

