---
title: CryptoVerif — 让计算机直接证密码协议在真实计算模型下安全
来源: Bruno Blanchet, "A Computationally Sound Mechanized Prover for Security Protocols", FOSAD 2008
日期: 2026-05-31
子分类: 形式化验证
分类: 形式化方法
难度: 进阶
provenance: pipeline-v3
---

## 是什么

CryptoVerif 是一个**自动证明密码协议安全性的工具**。和它的前辈 ProVerif 不同的地方在：ProVerif 把加密视为黑盒，CryptoVerif 把加密看成**真正的位串函数**——攻击者是任意多项式时间概率算法，安全性等同密码学论文里手写的 reduction 证明。

日常类比：ProVerif 像在玩棋盘游戏（攻击者只能按规则走），CryptoVerif 像在跑真实赛道（攻击者可以乱来，只要时间和算力够）。两者输出的"安全证明"含金量差一个量级。

底层魔法是把 Shoup 2004 写成教程的 **game hopping**（游戏序列）机械化：从初始游戏开始，用一连串"差距小的游戏"把目标变成"攻击者破底层原语"——而底层原语已被密码学家证为困难。

## 为什么重要

不理解 CryptoVerif，下面这些事都没法解释：

- 为什么 TLS 1.3 标准化时 IETF 第一次接受了"机器辅助密码学证明"作为正式材料——CryptoVerif 给的是真 computational 证明
- 为什么 ProVerif 验证过的协议还要再上 CryptoVerif——符号模型证不出"真密码学安全"
- 为什么 Signal、WireGuard、Noise、5G AKA 这些 2017 年后的协议发布前都跑过 CryptoVerif
- 为什么"密码学家手写证明"这件事 60 年里没被自动化——直到 game-hopping 找到合适的机械化点

## 核心要点

CryptoVerif 工作流程拆成 **三步**：

1. **Computational 模型设定**：消息是位串，攻击者是任意 PPT（多项式时间概率）算法。安全性 = 任意 PPT 攻击者获胜概率"可忽略"（小于任何多项式倒数）。这是密码学家 1980s 起的标准模型，与 Dolev-Yao 完全不同。

2. **声明密码学假设**：用户告诉工具"这个加密满足 IND-CPA"、"这个 MAC 是 UF-CMA"。每条假设被编码成一条**合法的 game transformation**——比如 IND-CPA 允许把"加密真消息"换成"加密随机串"，差距界为 Adv_IND-CPA。

3. **Game hopping 自动应用**：工具不断把当前游戏改写成"差距小的下一个游戏"。终态是攻击者明显赢不了（比如 secret 在游戏里是均匀随机、从未被任何 query 触及）。每步累加概率界，得到总界 Adv ≤ q² · Adv_IND-CPA + q · Adv_UF-CMA + …

三步加起来产出**机器检查过的 reduction 证明**。**重要权衡**：自动化远低于 ProVerif，几乎每个协议都要人工写"证明脚本"指挥工具下一步动什么。

## 实践案例

### 案例 1：CryptoVerif 怎么"消化"一次加密

协议片段：A 把 secret s 用密钥 k 加密发出去。CryptoVerif 看到加密 enc(k, s) 后，应用 IND-CPA 假设：

```
游戏 G0：发 enc(k, s)            ← 现实
游戏 G1：发 enc(k, 0…0)         ← 把 s 替换成等长 0 串
```

差距 = Adv_IND-CPA(攻击者)。在 G1 里，密文不再含 s 任何信息，于是攻击者赢的概率显然 ≤ 1/2。总界：Adv(协议) ≤ Adv_IND-CPA。这就是一个"密码学家心算两秒、CryptoVerif 自动写出来"的小证明。

### 案例 2：TLS 1.3 的真实战场

Bhargavan、Blanchet 等 2017 年用 CryptoVerif 给 TLS 1.3 草案 18 的主要握手模式做了完整 computational 证明。证明文件超过 1000 行 CryptoVerif 输入 + 数千行人工 hint。结果直接进了 IETF 标准化材料——这是主流互联网协议第一次在公布前就有机器辅助的 computational 安全性证明。Signal X3DH、WireGuard、Noise pattern 之后陆续走同一条路。

### 案例 3：ProVerif vs CryptoVerif 同一个协议两套结论

一个简单认证协议，ProVerif 几秒证完："Dolev-Yao 攻击者赢不了"。但实际密码学攻击者可能利用密文长度泄漏一点信息——ProVerif 看不见这种攻击。CryptoVerif 跑一遍要求声明加密是 IND-CCA，跑半小时给出 Adv ≤ q²/2^128 + Adv_IND-CCA 的具体界。同一份协议，两份证明，含义差很多。

### 案例 4：CryptoVerif 也会"卡住"

哈希函数在 CryptoVerif 里通常建模为 **random oracle**（随机预言机）：每次查询返回均匀随机串，已查的查询返回相同值。但如果协议在哈希里塞了结构化输入（比如把会话状态混进去），random oracle 假设可能不够，工具证不动。这种时候要么改建模、要么换强假设、要么承认"我们只能在这个抽象下证"。

### 案例 5：一个 game hop 的最小例子

考虑挑战："给定 PRF F 和密钥 k，证攻击者拿不到 F(k, 0)"。三步走：

```
G0：攻击者看到 F(k, 0)            ← 真实
G1：攻击者看到 r（随机串）        ← 用 PRF 假设替换
```

差距 = Adv_PRF。在 G1 里 r 是均匀随机，攻击者猜中概率 = 2^-n。所以总界 Adv ≤ Adv_PRF + 2^-n。CryptoVerif 命令大概是 `crypto prf F`，工具自动算差距并展开下一个游戏。这个最小例子虽然简单，但所有大协议证明都是它的递归堆叠。

## 踩过的坑

1. **学习曲线极陡**：要同时懂 applied pi 演算 + 密码学游戏证明 + 工具内部启发式。ProVerif 一天能上手，CryptoVerif 工程师常说要 3-6 个月才能独立写新证明。

2. **几乎不能纯自动**：复杂协议要写大量"证明脚本"——`SArename x; crypto ind_cpa enc; remove_assign useless` 这种命令告诉工具下一步做什么。错一步证明就推不下去。

3. **概率界要会读**：最终输出可能是 `Adv ≤ N² · Adv_PRF + N · Adv_IND_CPA + N² / 2^256`。新人看到一长串项不知道哪些是主要项、哪些可忽略，需要练。

4. **声明错假设 = 错证明**：你声明加密是 IND-CPA 但协议其实需要 IND-CCA（攻击者能拿到解密 oracle）——工具仍会给你"证出"一个安全结果，但那是在错误模型下的伪证。**作者**告诫：先把"威胁模型"想清楚再动手。

5. **runtime 慢**：TLS 1.3 那种规模在好机器上跑数小时是常态。迭代调试很耗心力。

## 工具生态对比

| 工具 | 模型 | 强项 | 弱项 |
|------|------|------|------|
| **ProVerif** | Dolev-Yao 符号 | 自动化高、上手快 | 抽象掉概率与复杂度 |
| **Tamarin** | 符号 + 多重集重写 | 状态机精确 | 仍是符号模型 |
| **CryptoVerif** | computational | 真密码学 reduction 证明 | 学习曲线陡、慢 |
| **EasyCrypt** | computational + Hoare | 通用密码学（不止协议） | 工程化更弱 |

工程实战常用组合：先 ProVerif 快速排"协议结构 bug"，再 CryptoVerif 收"密码学可靠性"。两层各司其职。

## 适用 vs 不适用场景

**适用**：

- 协议**真密码学**安全性证明（顶会论文、IETF 标准化材料）
- 已知良好建模的标准原语（IND-CPA/CCA 加密、UF-CMA 签名、PRF、random oracle 哈希）
- 需要给出**具体概率界**而不止"安全/不安全"二值结论的场合

**不适用**：

- 快速早期排查 → 用 **ProVerif**
- 需要状态机精确建模 → 用 **Tamarin**
- 通用密码学构造（不止协议）的证明 → 用 **EasyCrypt** / **F***
- 侧信道、实现 bug（Heartbleed 这种）→ 形式化方法管不到，需 fuzzing 与代码审计

## 历史小故事（可跳过）

- **1980s**：Goldwasser-Micali 把概率引入密码学；Bellare-Rogaway 等奠定 reduction 证明传统
- **2001**：Blanchet 写 ProVerif（符号模型）
- **2004**：Shoup 写《Sequence of Games》教程，把 game hopping 系统化
- **2006**：Blanchet 在 CSFW 发表 CryptoVerif 第一篇——首次把 game hopping 机械化
- **2008**（本文）：FOSAD 综述版系统介绍工具与理论
- **2014-2017**：Bhargavan 团队用它做 TLS 1.3 完整 computational 证明
- **2017+**：Signal、WireGuard、Noise、5G AKA 陆续走同一条路

## 一个常被混淆的点：CryptoVerif 不证密码原语本身

CryptoVerif 证的是"**协议**用法对不对"，不是"**原语**安不安全"。比如它假设 AES-GCM 是 IND-CPA，然后在这条假设上推导 TLS 1.3 安全。AES 自己是不是真 IND-CPA？这是另一个问题，需要密码分析师手算或专门工具（比如 SAT 求解器跑差分线性攻击）。

这种分层和 ProVerif 的 Dolev-Yao 黑盒抽象本质相同——把"原语"当公理，集中精力证"组合"。区别只是公理形式：ProVerif 的公理是"加密不可逆"，CryptoVerif 的公理是"加密满足 IND-CPA 且具体界为 ε"。后者带了概率，所以能进一步累加成总界。

## 学到什么

1. **符号模型 vs 计算模型不是二选一**——它们证不同的东西。前者擅长协议结构，后者擅长密码学含金量。两者并用是工业 best practice。
2. **Game hopping 是个通用心法**：把"难证的目标"通过一连串"差距小的中间游戏"归约到"已知困难假设"。这种"小步走 + 累加界"的思路在密码学外也能用。
3. **机器辅助不等于全自动**：CryptoVerif 把密码学家的证明从"凭直觉"提升到"可机器检查"，但仍需要人指挥每一步。这是当前形式化方法的真实状态。
4. **抽象选择决定结论强度**：random oracle、ideal cipher、generic group 都是常用强假设——证明依赖它们，结论也只在它们下成立。要时刻清楚自己站在哪个假设上。
5. **工具落地需要 10+ 年**：2006 第一篇论文 → 2017 进入 IETF 标准化材料。形式化方法工程化是慢工。

## 延伸阅读

- CryptoVerif 官方主页：[https://bblanche.gitlabpages.inria.fr/CryptoVerif/](https://bblanche.gitlabpages.inria.fr/CryptoVerif/)（含手册、示例、教程）
- Shoup 2004 *Sequence of Games*——理解 game hopping 的最好入门
- Bhargavan et al. 2017 *Verified Models and Reference Implementations for the TLS 1.3 Standard Candidate*（IEEE S&P）——CryptoVerif 实战代表作
- Lipp-Blanchet-Bhargavan 2019 *A Mechanised Cryptographic Proof of the WireGuard Virtual Private Network Protocol*

## 关联

- [[proverif-2001]] —— 同作者前作；符号模型版本，常与 CryptoVerif 配套使用
- [[easycrypt-2011]] —— 同样在 computational 模型下证明，但面向通用密码学
- [[tamarin-2012]] —— 符号模型 + 状态机，与 ProVerif 互补
- [[fstar]] —— 把密码学证明嵌入依赖类型语言的另一条路
- [[milner-pi-calculus]] —— CryptoVerif 输入语言的祖宗

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[dwork-our-data-ourselves-2006]] —— 分布式噪声生成 — 去掉可信管理员也能保护隐私
- [[fstar]] —— F* — 把依赖类型、SMT 自动化、副作用追踪揉到一门语言里
- [[machanavajjhala-l-diversity-2007]] —— l-多样性 — k-匿名之后的隐私保护
- [[mitls-2014-triple-handshake]] —— Triple Handshake — TLS 同一把主密钥被复用，黑客就能换人不换锁
- [[proverif-2001]] —— ProVerif — 把密码协议翻成 Prolog 规则让计算机自己证安全
- [[tor-2004]] —— Tor 洋葱路由 — 让你的网络请求穿上三层马甲

