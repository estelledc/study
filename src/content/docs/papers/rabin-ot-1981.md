---
title: Rabin OT 1981 — 不知道对方是否收到的秘密交换
来源: 'Michael O. Rabin, "How to Exchange Secrets with Oblivious Transfer", Technical Report TR-81, Aiken Computation Lab 1981'
日期: 2026-07-07
分类: security-privacy
难度: 中级
---

## 是什么

Rabin 的 oblivious transfer（OT）是一种**我把秘密交出去，但我不知道你到底有没有拿到**的协议。日常类比：像一个会随机漏信的邮箱，你把信投进去，收件人有一半概率拿到信；你只知道自己投了，不知道对方最后拿没拿到。

这听起来像坏邮箱，反而是密码学里的好工具：有时协议正需要这种“可验证的随机不确定性”。Rabin 把它用在“交换秘密”问题上：Alice 和 Bob 各有一个秘密，谁都不想先交，因为先交的人会吃亏。

论文的关键贡献不是给出现代工程库，而是提出一个底层原语：**信息可以被转移，但发送方保持 oblivious**。后来 OT 成为安全多方计算、乱码电路、私有集合求交等协议的地基。

## 为什么重要

不理解 Rabin OT，下面这些事很难解释：

- 为什么安全计算常说 OT 是“密码学里的万能插座”：很多高级协议最后都要插回它。
- 为什么公平交换这么难：谁先拿到对方秘密，谁就有机会中途退出。
- 为什么 RSA / Rabin 加密里的“平方根”会变成协议构件：不是只拿来加密，还能制造 1/2 的成功概率。
- 为什么 [[yao-garbled-circuits-1986]] 这类 2PC 协议离不开“选择一个标签但不暴露选择”的底层机制。

## 核心要点

1. **交换秘密的死结**：普通协议总有一个“第一时刻”，一方已经能恢复对方秘密，而对方还不能。类比：两个人换钥匙，总有一只手先松开。

2. **OT 制造可控的不确定性**：Bob 通过平方根技巧有 1/2 概率得到 Alice 的因子分解，Alice 不知道他是否成功。类比：你递出一张刮刮卡，自己看不到对方是否刮中大奖。

3. **状态位把“是否知道”接进协议**：Bob 发 `εB = SB XOR νB`，其中 `νB` 表示他是否拿到因子。类比：把秘密和“我有没有中奖”绑在一张票上，之后一旦他行动，Alice 就能反推出自己的缺口。

## 实践案例

### 案例 1：平方根为什么能泄露因子

```js
const n = 21              // Alice 知道 21 = 3 * 7
const x = 2               // Bob 偷偷选
const c = (x * x) % n     // Bob 发 c = 4
const x1 = 5              // Alice 回一个平方根：5^2 mod 21 = 4
gcd(Math.abs(x - x1), n)  // gcd(3, 21) = 3
```

**逐部分解释**：

- 模合数 `n = p * q` 时，一个平方通常有 4 个平方根。
- Alice 随机回一个根；如果不是 `x` 或 `-x mod n`，Bob 用 `gcd(x - x1, n)` 就能挖出因子。
- 四个根里两个有用、两个没用，所以 Bob 成功概率是 1/2，而 Alice 不知道他落在哪一边。

### 案例 2：状态位怎么和秘密绑在一起

```js
const secretB = 1          // Bob 的秘密 bit
const nuB = 0              // 0 表示 Bob 已经知道 Alice 的因子
const epsilonB = secretB ^ nuB
// Alice 单看 epsilonB 不能安全使用；
// 但若后来看到 Bob 已经读文件，就知道 nuB = 0，于是 epsilonB 就是 secretB。
```

**逐部分解释**：

- `νB = 0` 表示 Bob 拿到了因子分解，能解出 Alice 的最终密文。
- `εB` 单独看只是一个被状态位遮住的 bit，Alice 不能拿它赌文件密码。
- 一旦 Bob 真的使用了 Alice 的秘密，Alice 就知道他的状态位，从而恢复 Bob 的秘密。

### 案例 3：为什么成功率不能无限放大

```js
function eosFailure(oneSideMiss) {
  return oneSideMiss * oneSideMiss
}

eosFailure(1 / 2)  // 1/4：原始一次 OT
eosFailure(1 / 4)  // 1/16：每边做两次 OT
```

**逐部分解释**：

- 双方各有一次 OT；两边都没拿到对方秘密时，协议没有完成。
- 重复 OT 可以把失败率从 `1/4` 降到 `1/16`。
- 但成功率太高会带来诱惑：如果 `εB` 几乎肯定就是 `SB`，Alice 可能提前赌密码并停止协议。

## 踩过的坑

1. **把 Rabin OT 当成现代 1-out-of-2 OT**：Rabin 原型是“收到或收不到一个秘密”，1-out-of-2 OT 是后续 Even-Goldreich-Lempel 等工作发展的更常用形式。

2. **以为 1/2 成功率是缺陷**：这里的随机失败是协议安全性的一部分，用来避免“某一方确定先拿到好处”。

3. **忽略论文里的额外假设**：EOS 需要签名、可仲裁、文件密码错误会销毁文件、读文件会被对方知道；离开这些假设，结论不能直接搬走。

4. **把平方根技巧等同于安全加密实现**：论文用的是思想原型，今天真要加密还要语义安全、padding、抗侧信道和严格参数。

## 适用 vs 不适用场景

**适用**：

- 理解 OT 的第一种形式：发送方不知道接收方是否得到消息。
- 解释为什么安全多方计算需要一个“带选择但不暴露选择”的底层原语。
- 学习因式分解、平方根、陷门函数如何从数学性质变成协议动作。
- 讨论公平交换、合同签名、秘密交换这类“谁先交付谁吃亏”的问题。

**不适用**：

- 直接当生产 OT 协议使用；现代系统会选更强的 1-out-of-2 OT、OT extension 或 UC 安全版本。
- 没有公钥基础设施、签名和仲裁机制的场景；论文的 EOS 依赖这些外部条件。
- 需要保证协议必然完成的场景；Rabin 明确留下了非零失败概率。
- 抗量子长期安全；这里的核心例子依赖因式分解困难。

## 历史小故事（可跳过）

- **1976 年**：[[diffie-hellman-1976]] 把公钥密码学的方向画出来，密码协议开始脱离“先共享密钥”的老路。
- **1978 年**：[[rsa]] 让大整数分解困难成为可工作的公钥加密与签名工具。
- **1981 年**：Rabin 写出这份 Aiken Lab 技术报告，把“oblivious transfer”这个名字和概念带入密码学。
- **1985 年**：Even、Goldreich、Lempel 发展 1-out-of-2 OT，让“接收者选一个、发送者不知道选哪个”成为主流形式。
- **1988 年**：Crépeau 证明 Rabin OT 与 1-out-of-2 OT 等价；Kilian 说明 OT 足以构造一般安全计算。
- **2000 年以后**：OT extension 让少量昂贵公钥 OT 扩展成海量廉价对称操作，MPC 和 PSI 才真正能工程化。

## 学到什么

1. **密码协议有时需要“可控失败”**：失败不是 bug，而是让双方无法确定抢跑的机制。

2. **数学难题可以变成交互动作**：平方根、最大公约数、因式分解不只是课本公式，而是协议里的信息门。

3. **公平性和隐私是两件事**：隐私关注多知道了什么，公平性关注谁先知道、谁能中途退出。

4. **OT 是后续协议的地基**：Yao 乱码电路、MPC、PSI、私有查询等都把“选而不泄露”当成基本能力。

## 延伸阅读

- 原文 PDF：[Rabin 1981 — How to Exchange Secrets with Oblivious Transfer](https://eprint.iacr.org/2005/187.pdf)（IACR 扫描与 typeset 版）
- 图谱入口：[OpenAlex — How to Exchange Secrets with Oblivious Transfer](https://openalex.org/works/W2119422255)（引用数约 784）
- 后续等价性：Crépeau, "Equivalence Between Two Flavours of Oblivious Transfers", CRYPTO 1987
- 工程化路线：Naor & Pinkas, "Oblivious Transfer and Polynomial Evaluation", STOC 1999
- [[yao-garbled-circuits-1986]] —— OT 后来成为乱码电路选择输入标签的关键拼图
- [[rsa]] —— Rabin 协议借用了同一类大整数分解陷门直觉

## 关联

- [[rsa]] —— 公钥、因式分解和陷门函数提供 Rabin OT 的数学直觉。
- [[diffie-hellman-1976]] —— 公钥密码学起点，没有这条线就没有后来的 OT 协议族。
- [[yao-garbled-circuits-1986]] —— 2PC 需要 OT 来分发输入标签而不暴露选择。
- [[cryptoverif-2008]] —— 后来的密码协议验证工具会形式化检查“协议到底泄露什么”。
- [[easycrypt-2011]] —— 把密码学证明交给机器检查，适合验证 OT / MPC 的安全归约。
- [[goldreich-micali-wigderson-1987]] —— 合理预测会存在；它把 OT 推向一般 MPC 完备性。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
