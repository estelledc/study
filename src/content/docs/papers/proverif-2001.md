---
title: ProVerif — 把密码协议翻成 Prolog 规则让计算机自己证安全
来源: Bruno Blanchet, "An Efficient Cryptographic Protocol Verifier Based on Prolog Rules", CSFW 2001
日期: 2026-05-31
分类: 形式化方法
难度: 进阶
---

## 是什么

ProVerif 是一个**自动验证密码协议安全性的工具**。你把协议写成它认得的语法，按一下按钮，它告诉你：要么"攻击者永远偷不到这个秘密"（证明），要么"我找到一条攻击路径"（反例）。

日常类比：像让一个不知疲倦的入侵测试员住在你电脑里。每写完一个新协议，先送进它跑一圈，再往世界上发布。

底层魔法是把协议翻成一堆"如果…就能推出…"的规则——形式化里叫 **Horn 子句**（Prolog 写法：`attacker(M) :- attacker(M1), attacker(M2)`），再用**归结**（resolution，规则互相拼）反复推，直到再也推不出新东西。若终点出现"attacker 知道秘密 S"就找到攻击；推完都没出现，秘密就是安全的。

## 为什么重要

不理解 ProVerif，下面这些事都没法解释：

- 为什么 TLS 1.3 / Signal / Noise / WireGuard / 5G AKA 发布前都要"送进工具跑一遍"——ProVerif 是这条流水线的鼻祖
- 为什么 2001 年这个工具到 2017 年才"真正进入工业实战"——形式化方法工程化需要 15 年磨合
- 为什么协议安全圈把"密码学对不对"和"协议用法对不对"分开两层证——分层观念就是 Dolev-Yao 抽象给的
- 为什么 Prolog（1972 年的语言）今天还在被用——它的 Horn 子句模型刚好能塞下"攻击者能拼出什么"这种问题

## 核心要点

ProVerif 的工作流程拆成 **三步**：

1. **Dolev-Yao 攻击者模型**：假设攻击者完全控制网络（拦截/篡改/重放/构造消息都行），但**视密码学为黑盒**——不能从密文猜明文，除非他已经知道密钥。这个抽象 1981 年就提出，简化到能让机器推理。

2. **协议翻成 Horn 子句**：协议每一步翻成一条规则。例：Alice 收到 `enc(k, m)` 后会回应 `m` →`attacker(m) :- attacker(enc(k, m)), attacker(k)`。"攻击者能学到 m，当且仅当他既有密文又有密钥。"

3. **归结饱和（resolution with selection）**：让计算机反复用规则相互组合推出新事实，直到再也不变。能推出 `attacker(secret)` 就找到攻击；推不出来就证明秘密安全。**关键创新**：选择性归结让**无界会话在实践中可分析**（该问题本身不可判定；早期有界工具如 CASPER / Athena 只能跑有限轮）。

三步加起来叫 **算法饱和**。**重要权衡**：sound 但 incomplete——证出来一定对，但证不出来不代表协议有问题；算法也可能不终止。

## 实践案例

### 案例 1：一个最简单的协议怎么翻

协议：A 用共享密钥 k 把秘密 s 加密发给 B。

翻译成 Horn 子句：

```prolog
attacker(enc(k, s)).              % 网络上能看到密文
attacker(M) :- attacker(enc(k, M)), attacker(k).   % 有密钥能解密
```

查询：`attacker(s)?` 计算机推一遍：要推出 `attacker(s)` 必须有 `attacker(k)`，但规则里没人发布 k。**结论：s 安全**。

如果有人不小心把 k 发到网上：

```prolog
attacker(k).
```

立刻推出 `attacker(s)`——**找到攻击**。

### 案例 2：工业协议怎么进工具流水线

你输入：把 TLS 1.3 握手抽象成约 300 行模型（ProVerif 或姊妹工具 Tamarin 都能吃）。工具输出：要么证明秘密性/认证性，要么给出攻击踪迹。Cremers 等人 2017 年用 **Tamarin** 发现早期草案 PSK 模式的**降级攻击**，直接改写了 RFC 8446；同一时期多家团队也用 ProVerif 类流水线扫握手。今天浏览器里的 HTTPS 锁，背后是被工具反复跑过、修过的协议。

### 案例 3：找到 Needham-Schroeder 的经典攻击

你输入：1978 年 Needham-Schroeder 公钥协议的 ProVerif 模型。工具输出：几秒内给出攻击踪迹——1995 年 Lowe 发现的**中间人攻击**（攻击者 C 假装成 A 跟 B 通信，骗 B 把 nonce 发给"A"）。系统反向列出每一步子句应用顺序，你能直接读出"攻击者先做了什么、再做了什么"。**自动找反例并复现**，是工具相对手工证明的最大胜利。

### 案例 4：ProVerif 自己也会"卡住"

你输入：带 `counter(i)`、约定"只能用一次"的防重放协议。工具输出：常报"无法证明"——Horn 模型只关心"能不能拼出"，没有"一次性"原语。协议可能其实是对的，只是抽象不到位。这时改用 Tamarin（带状态），或把"一次性"拆成多个查询分别证。这正是 sound-but-incomplete 的工程痛点。

## 踩过的坑

1. **Dolev-Yao 太理想化**：把密码原语视为完美黑盒。Heartbleed / Bleichenbacher / padding oracle 这些攻击都来自**密码实现**层面，ProVerif 看不见。需要 CryptoVerif（计算复杂度模型）补这一刀。

2. **Sound 但 incomplete**：报"cannot prove"时不要慌。可能是抽象太粗，也可能是真有问题。需要人去拆查询、加引理。新人常被这步劝退。

3. **状态难表达**：协议里的"会话密钥用一次就丢"、"计数器单调递增"这类性质，Horn 子句模型表达不了。Tamarin 用多重集重写补这个洞，但工具更难用。

4. **不一定终止**：归结饱和理论上半可判定。ProVerif 加了启发式，遇到复杂协议仍可能跑几小时或 OOM。**实战经验**：先简化模型再迭代加细节。

## 工具生态对比

ProVerif 不是孤岛，今天形式化协议验证有三大工具，定位各异：

| 工具 | 模型 | 强项 | 弱项 |
|------|------|------|------|
| **ProVerif** | Horn 子句 + Dolev-Yao | 自动化高、上手快、秘密性认证性快 | 难表达状态 / 计数器 / 一次性 |
| **Tamarin** | 多重集重写 | 状态机精确，能表达计数器 / 单调性 | 输入更长，需要更多人工引理 |
| **CryptoVerif** | 计算复杂度模型 | 给出真正的密码学可靠性证明 | 学习曲线陡，速度慢 |

实战经验：先 ProVerif 跑一遍快速排查，复杂状态用 Tamarin，要发顶会的硬证明上 CryptoVerif。

## 适用 vs 不适用场景

**适用**：

- 协议秘密性 / 认证性的**符号化**证明（TLS 握手、Signal X3DH、Noise pattern 等）
- 协议设计**早期**快速找明显漏洞——比 manual review 快几个数量级
- 标准密码原语（对称/公钥加密、签名、Diffie-Hellman）的标准用法

**不适用**：

- 需要精确状态机 → 用 **Tamarin**（多重集重写）
- 需要计算可靠性证明 → 用 **CryptoVerif**（基于 reduction）
- 侧信道 / 实现漏洞（Heartbleed 这种）→ 形式化方法管不到，需要 fuzzing 和代码审计
- 新颖密码原语（同态加密、零知识证明）→ 需要扩展等式理论，工具可能推不动

## 历史小故事（可跳过）

- **1981**：Dolev-Yao 在 IEEE TIT 提出符号攻击者模型——形式化协议分析的起点
- **1989**：Burrows-Abadi-Needham BAN 逻辑——第一代手工证明工具，需要专家
- **1990s 末–2000s 初**：CASPER / Athena 等——自动但只能跑有界会话，长协议易状态爆炸
- **2001**：Blanchet 在 Bell Labs 写出 ProVerif（本文）——早期能分析无界会话的全自动工具之一，秘诀是选择性归结
- **2002**：Abadi-Blanchet applied pi calculus——给 ProVerif 一套形式语义
- **2012–2013**：Tamarin 公开，用多重集重写处理带状态的协议
- **2017**：TLS 1.3 和 Signal 形式化验证发表——ProVerif/Tamarin 进入工业 due-diligence
- **2020+**：Noise Explorer 和 5G AKA 验证——形式化跑一遍已成新协议发布前默认动作

## 学到什么

1. **把现实问题翻成 Horn 子句是通用武器**——不止密码协议，编程语言静态分析（Datalog 系列）也用。学会这种"问题变成规则"的思维一辈子受用。
2. **Sound vs complete 是永恒取舍**：能终止就放弃完整，能完整就放弃终止。形式化方法每个工具都在这条线上选位置。
3. **Dolev-Yao 教会我们分层**：把"密码学对不对"和"协议用法对不对"分两层证，每层各司其职。这种 separation of concerns 远超协议安全本身的价值。
4. **工具落地需要 20 年**：1981 模型 → 2001 工具 → 2017 工业实战。不要看到论文就期待明天有人用。

## 延伸阅读

- ProVerif 官方手册：[manual.pdf](https://bblanche.gitlabpages.inria.fr/proverif/manual.pdf)（含大量教程示例，从 Hello World 到 TLS）
- Blanchet 2016 综述：Modeling and Verifying Security Protocols with the Applied Pi Calculus and ProVerif（Foundations and Trends in Privacy and Security）
- Cremers 等 TLS 1.3 形式化（S&P 2017）——用 Tamarin 但思路相通
- Cohn-Gordon 等 Signal 协议形式化（EuroS&P 2017）

## 关联

- [[prolog-colmerauer]] —— Horn 子句和归结的来源；ProVerif 直接借用 Prolog 的内核思想
- [[tls-1.3]] —— ProVerif 类工具的真实工业战场
- [[davis-putnam-1960]] —— 命题逻辑可满足性的早期奠基，与一阶归结同源
- [[hoare-logic]] —— 形式化方法另一支：证程序而非协议
- [[lamport-tla-1994]] —— 状态机时序逻辑，Tamarin 的精神近邻

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[cryptoverif-2008]] —— CryptoVerif — 让计算机直接证密码协议在真实计算模型下安全
- [[davis-putnam-1960]] —— Davis-Putnam 1960 — 让机器自动判断一堆逻辑式能不能同时成立
- [[easycrypt-2011]] —— EasyCrypt — 让密码学家的安全证明能被机器自动检查
- [[hoare-logic]] —— Hoare Logic — 把"程序对不对"变成"数学证明对不对"
- [[lamport-tla-1994]] —— TLA — 把状态机和时序逻辑捏成一个公式
- [[prolog-colmerauer]] —— Prolog 的诞生 — 让逻辑式子直接当程序跑
- [[tamarin-2012]] —— Tamarin — 让计算机自己证 Signal、TLS 1.3 这种带 DH 的协议是不是真安全

