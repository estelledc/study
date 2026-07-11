---
title: SPHINCS 2015 — 不用记状态的后量子哈希签名
来源: 'Bernstein, Hopwood, Hülsing, Lange, Niederhagen, Papachristodoulou, Schwabe, and Wilcox-O''Hearn, "SPHINCS: Practical Stateless Hash-Based Signatures", EUROCRYPT 2015'
日期: 2026-07-07
分类: security-privacy
难度: 中级
---

## 是什么

SPHINCS 是一种**只依赖哈希函数的数字签名方案**：别人拿你的公钥，可以确认消息确实由你签过；同时它不需要签名者记住“下一次该用哪把一次性钥匙”。

日常类比：像一本巨大的防伪票券册。传统哈希签名要求你每次撕票后都在本子上打勾，防止同一张票用两次；SPHINCS 的目标是让你不用维护打勾记录，也能把重复用票的风险压到很低。

这篇论文解决的是后量子签名里的一个尴尬点：RSA 和椭圆曲线签名会被足够大的量子计算机威胁；哈希签名的安全基础更朴素，但老方案通常是 stateful，一旦备份恢复、双机热备或断电写盘出错，重复使用一次性密钥就可能把安全性打穿。

SPHINCS 的答案是：用随机选择叶子、少次签名 HORST、多层超树和 WOTS+ 组合，换来可落地的无状态哈希签名。它的签名约 41 KB，公钥和私钥约 1 KB，论文报告 4 核 3.5GHz CPU 上每秒可签数百条消息。

读它时先记住一句话：SPHINCS 不是追求最小签名，而是在“抗量子、少假设、少运维状态”之间找一个可部署平衡点。

## 为什么重要

不理解 SPHINCS，下面这些事都很难解释：

- 为什么后量子签名不只有格密码路线，还需要一条“只信哈希”的保守保险路线。
- 为什么很多哈希签名方案看起来数学简单，工程上却被“状态同步”卡住。
- 为什么 NIST 后来的 SLH-DSA / SPHINCS+ 标准愿意接受较大的签名尺寸，换取更朴素的安全假设。
- 为什么论文反复比较签名大小、签名速度和安全证明：后量子算法不是只要“抗量子”就够，还要能塞进更新包、证书链和软件发布流程。

## 核心要点

SPHINCS 可以先抓三件事：

1. **哈希签名像一次性封条**。Lamport / Merkle 路线的核心是“公开哈希值，签名时揭开对应秘密”。类比：快递盒上的一次性封条，撕开一次就不能再当全新封条。

2. **无状态靠随机选叶子 + 少次容忍**。传统 Merkle 签名按顺序用叶子，必须记住计数器；SPHINCS 随机选叶子，并把叶子处的一次性签名换成少次签名 HORST。类比：不是按座位号排队发票，而是从巨大场馆里随机挑座位，并允许极少数座位被碰到几次。

3. **超树把巨树拆成很多小树**。直接建一棵天文数字级大树会太慢，SPHINCS 用多层小树互相认证。类比：公司组织架构不是一张从 CEO 直接连到每个员工的巨图，而是部门、组、小队逐级盖章。

## 实践案例

### 案例 1：为什么“一次性”不能重复用

```txt
secret_0 -> hash(secret_0) = public_0
secret_1 -> hash(secret_1) = public_1
sign bit 0: reveal secret_0
sign bit 1: reveal secret_1
```

**逐部分解释**：

- 公钥里只放哈希结果，别人很难从 `public_0` 倒推出 `secret_0`。
- 签名时揭开其中一个秘密，验证者重新哈希一次即可检查。
- 如果同一组秘密签过太多不同消息，攻击者看到的秘密会越来越多，最后可能拼出伪造签名。

### 案例 2：有状态 Merkle 签名为什么怕备份恢复

```txt
counter = 17
sign(update_A) with leaf 17
save counter = 18
restore old backup: counter becomes 17 again
sign(update_B) with leaf 17
```

**逐部分解释**：

- `counter` 是“下一片叶子编号”，正常情况下每次签名后递增。
- 备份恢复让计数器倒退，同一片叶子被两个消息复用。
- 哈希签名的强度常常建立在“不复用叶子”上，所以状态管理错误会变成密码学错误。

### 案例 3：SPHINCS 签名大致怎么走

```txt
R = random()
idx = hash(R, message) mod many_leaves
horst_sig = HORST.sign(message, leaf_seed(idx))
auth_path = build_paths_across_hypertree(idx)
signature = R || horst_sig || auth_path || wots_links
```

**逐部分解释**：

- `R` 给每次签名加随机性，让叶子选择不只由消息决定。
- `HORST` 负责在叶子层签消息，它允许极少量重复压力，而不是一次复用就立刻崩。
- `auth_path` 和 `wots_links` 把这片叶子的可信度一路接到最顶层公钥，验证者沿路径重新算哈希即可。

## 踩过的坑

1. **把无状态理解成“没有私钥变化”**：原因是签名算法仍会用随机数和伪随机种子派生大量临时材料，只是不要求把更新后的计数器写回长期私钥。

2. **以为哈希签名天然很小**：原因是签名里要携带被揭开的秘密片段、认证路径和多层链接，SPHINCS-256 的 41 KB 明显大于 RSA / ECDSA / Dilithium 常见签名。

3. **把 HORST 当成普通一次性签名**：原因是 HORST 是 few-time signature，设计目的就是让随机叶子偶尔碰撞时安全性平滑下降，而不是立刻归零。

4. **只看抗量子，不看部署接口**：原因是论文的关键卖点是“drop-in replacement”式无状态接口；如果方案要求每次签名后可靠写盘，很多真实系统会很难安全部署。

## 适用 vs 不适用场景

**适用**：

- 软件更新、固件发布、包管理器索引等“签名次数可控，但长期可信很重要”的场景。
- 想要一条安全假设非常保守的后量子签名路线，只主要依赖哈希函数性质。
- 不容易可靠维护签名计数器的系统，例如多机备份、离线签名机、灾备恢复流程。
- 可以接受几十 KB 签名开销，换取状态管理简单性的协议。

**不适用**：

- 极端带宽敏感的短消息协议，几十 KB 签名会压过消息本身。
- 需要海量高频在线签名且每条都必须很小的业务，例如高吞吐交易撮合链路。
- 已经能严格保护 stateful 哈希签名计数器，并且更看重更小签名的场景。
- 需要隐藏签名者公钥或消息模式的协议；SPHINCS 解决认证，不自动解决匿名性。

## 历史小故事（可跳过）

- **1979 年左右**：Lamport 提出一次性哈希签名思路，安全直觉非常朴素，但一次只能安全签很少内容。
- **1980 年代**：Merkle 树把很多一次性公钥压到一个根哈希下，让“签很多次”开始可想象。
- **2014 年**：SPHINCS 预印本给出无状态、高安全参数和向量化实现，试图把理论路线推向工程可用。
- **2015 年**：论文进入 EUROCRYPT，名字里的 “practical stateless” 正是在回应旧哈希签名的部署痛点。
- **2024 年**：NIST 发布 FIPS 205，把 SPHINCS+ 路线标准化为 SLH-DSA，SPHINCS 成为这条标准路线的重要前身。

## 学到什么

1. **后量子不是单一路线**：Kyber / Dilithium 代表格密码主线，SPHINCS 代表“哈希函数保守路线”。
2. **密码算法也会被文件系统和运维流程击败**：stateful 签名的计数器如果回滚，数学证明再漂亮也挡不住复用事故。
3. **工程可用性常常是折中**：SPHINCS 用较大签名换来无状态接口、清晰安全假设和可接受速度。
4. **组合结构比单个技巧更重要**：随机叶子、HORST、WOTS+、超树和参数分析合在一起，才让方案从“能定义”变成“能部署”。

## 延伸阅读

- 论文 PDF：[SPHINCS: Practical Stateless Hash-Based Signatures](https://sphincs.cr.yp.to/sphincs-20141001.pdf)（原文，重点看 introduction 和 construction 总览）
- 标准文档：[NIST FIPS 205 — Stateless Hash-Based Digital Signature Standard](https://csrc.nist.gov/pubs/fips/205/final)（SLH-DSA，也就是 SPHINCS+ 标准化结果）
- 背景论文：Leslie Lamport, "Constructing Digital Signatures from a One Way Function", 1979（一次性哈希签名源头）
- 背景论文：Ralph Merkle, "A Certified Digital Signature", CRYPTO 1989（Merkle 树签名路线）
- [[ducas-dilithium-2018]] —— 对照格密码签名路线，看“签名小但假设更复杂”的另一种选择。
- [[bos-kyber-2018]] —— 后量子密钥交换主线，和 SPHINCS 一起构成迁移 TLS 的两块拼图。

## 关联

- [[diffie-hellman-1976]] —— 提出公钥密码和数字签名愿景，SPHINCS 是量子威胁后的签名延续。
- [[rsa]] —— 经典签名代表；SPHINCS 的动机之一就是替代会被 Shor 算法威胁的路线。
- [[aes]] —— 同样依赖对称原语直觉，但 AES 是加密基元，SPHINCS 用哈希函数做签名。
- [[ducas-dilithium-2018]] —— NIST 后量子签名主力之一，和 SPHINCS/SLH-DSA 形成标准里的互补。
- [[bos-kyber-2018]] —— Kyber 解决“协商密钥”，SPHINCS 解决“证明是谁签的”。
- [[cryptoverif-2008]] —— SPHINCS 论文强调安全归约；形式化验证工具能帮助检查协议级证明。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）
