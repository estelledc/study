---
title: CryptoVerif — 让计算机直接证密码协议在真实计算模型下安全
来源: 'Bruno Blanchet, "A Computationally Sound Mechanized Prover for Security Protocols", FOSAD 2008'
日期: 2026-05-31
分类: 形式化方法
难度: 高级
---

## 是什么

CryptoVerif 是一个**半自动证明密码协议安全性的工具**。前辈 [[proverif-2001]] 把加密当成黑盒棋子；CryptoVerif 把加密看成**真正的位串函数**——攻击者是任意多项式时间概率算法，结论更接近密码学论文里手写的归约（reduction）证明。

日常类比：ProVerif 像按规则下棋（攻击者只能走合法棋步）；CryptoVerif 像真实赛道（攻击者可以乱来，只要时间和算力够）。两者都叫"安全证明"，含金量差一截。

底层把 Shoup 2004 系统化的 **game hopping**（游戏序列：一串差距很小的相邻游戏）机械化：从现实协议游戏出发，一步步改到"攻击者等于在破某个已被假定困难的底层原语"。

你可以把它想成：不是让计算机"灵机一动证明安全"，而是把密码学家本来就会写的那串游戏改写，变成可重复执行、可累加概率界的脚本。

## 为什么重要

不理解 CryptoVerif，下面这些事都不好解释：

- 为什么 TLS 1.3 相关标准化讨论里会出现机器辅助的 **computational**（计算模型）证明材料——它给的不是纯符号模型结论
- 为什么 ProVerif 过了的协议，有时还要再上 CryptoVerif——符号模型证不出"带概率界的真密码学安全"
- 为什么 WireGuard 等协议会专门做 CryptoVerif 证明，而另一些协议用 ProVerif/Tamarin——工具与结论强度要匹配
- 为什么手写 game-hopping 证明长期难自动化——直到把"合法变换"编成工具可执行的步骤

对工程读者更直白一点：它回答的不是"协议长什么样好看"，而是"若底层原语满足这些假设，攻击者优势最多多大"。

再补一句边界：它**不**替代密码分析，也**不**保证实现没有缓冲区溢出；它保证的是"协议逻辑 + 声明假设"这一层的归约关系可被机器复查。

入门路径建议：先读 Shoup 的游戏序列直觉 → 跑官方最小 example → 再碰 TLS/WireGuard 那种千行证明，否则容易被脚本细节淹没。

## 核心要点

工作流程可以想成三步：

1. **计算模型设定**：消息是位串；攻击者是 **PPT**（多项式时间概率算法，像"算力有限但很狡猾的对手"）。安全 ≈ 任意这类对手赢的概率"可忽略"（比任何多项式倒数还小）。这和 **Dolev-Yao** 符号模型（把密码当完美黑盒）不是一回事。
2. **声明密码学假设**：你告诉工具"这个加密满足 **IND-CPA**（密文不该让对手分辨出加密的是哪条消息）"、"这个 MAC 是 **UF-CMA**（对手伪造不出合法标签）"。每条假设对应一条合法的游戏改写规则，并带上优势界 Adv。
3. **自动/半自动 game hopping**：工具把当前游戏改成差距小的下一个游戏，累加概率界，例如 `Adv ≤ q² · Adv_IND-CPA + …`。复杂协议几乎总要人写证明脚本指挥下一步。

三步加起来产出**可机器检查的归约证明**。权衡很清楚：结论更接近真密码学论文，但自动化远低于 ProVerif。把"证不动"当成信号——多半是建模、假设或脚本步骤还没对齐，而不是工具随便罢工。

## 实践案例

### 案例 1：一次加密的最小 game hop

协议片段：A 用密钥 k 加密 secret s 发出去。工具在 IND-CPA 假设下做：

```
G0：发送 enc(k, s)          ← 现实
G1：发送 enc(k, 0…0)       ← 换成等长全 0
```

差距 ≤ Adv_IND-CPA。到了 G1，密文不再带 s 的信息，攻击者优势容易上界。这就是"密码学家心算两步、工具写成可检查证明"的最小样子。

跟读命令风格（示意，以手册为准）：

1. 用 CryptoVerif 输入语言描述角色进程与安全查询（保密性 / 认证性等）
2. 声明加密、密钥等满足哪些假设
3. 对加密符号执行类似 `crypto ind_cpa enc` 的变换，让工具展开下一游戏并累加界

你不必第一天就跑通 TLS；先把"G0→G1 差一个 Adv"在纸上走通，再对照手册命令。

若 G1 里 secret 已与攻击者视图独立，剩余工作往往是把"显然 ≤ 可忽略 / 1/2"写成工具认的终态——大协议只是把这一步重复很多遍。

### 案例 2：同一协议，两套结论

一个简单认证协议：

1. ProVerif 可能很快说"符号攻击者赢不了"（棋盘规则下无解）。
2. 真实攻击者仍可能利用长度泄漏、填充等——符号模型默认看不见。
3. CryptoVerif 要求你声明加密是 **IND-CCA**（更强：对手还能问解密预言机）或至少 IND-CPA，再给出带具体项的概率界。

同一份协议，两份证明含义差很多：一个说"结构上没破绽"，一个说"在这些假设下优势 ≤ …"。读论文或 RFC 附录时，先看它用的是哪一类工具，再决定你能把结论信到哪一步。

### 案例 3：TLS 1.3 战场，以及工具卡住时

Bhargavan、Blanchet 等用 CryptoVerif 为 TLS 1.3 草案主要握手模式做 computational 证明，输入与人工 hint 都很长，结果进入相关标准化讨论材料。WireGuard 后来也有公开的 CryptoVerif 机械化证明可对照阅读。

若哈希被建成 **random oracle**（随机预言机：新输入给出新鲜随机串，重复输入给相同值）仍证不动，通常要：改建模、换更强/更贴协议的假设，或承认"只在当前抽象下成立"。工具卡住不是失败羞耻，而是在逼你把威胁模型写清楚。

## 踩过的坑

1. **学习曲线陡**：要同时碰协议描述、游戏证明和工具启发式；ProVerif 一天能上手，CryptoVerif 常要数月才能独立写新证明。
2. **几乎不能纯自动**：复杂协议要写 `SArename` / `crypto …` / `remove_assign` 这类脚本；错一步就推不下去。
3. **声明错假设 = 漂亮的错证明**：协议实际需要 IND-CCA，你却只声明 IND-CPA——工具仍可能"证过"，那是错误模型下的伪证。先写清威胁模型再动手。
4. **概率界与 runtime**：输出一长串 `N² · Adv_PRF + …` 时要分清主项与可忽略项；TLS 规模跑数小时也常见，迭代调试很耗。

## 适用 vs 不适用场景

**适用**：

- 需要**真密码学**风格的协议安全性证明（论文、部分标准化材料）
- 原语假设清晰（IND-CPA/CCA、UF-CMA、PRF、random oracle 等）
- 要**具体概率界**，不要只给"安全/不安全"二值
- 已有 ProVerif/Tamarin 结构结论，还想再要一层 computational 含金量

**不适用**（对照选工具）：

- 快速排协议结构 bug → [[proverif-2001]]（符号模型，自动化高）
- 要精确状态机/多重集重写 → [[tamarin-2012]]
- 通用密码学构造（不止协议）→ [[easycrypt-2011]] / [[fstar]]
- 侧信道、实现漏洞（如 Heartbleed）→ 形式化协议证明管不到，需 fuzzing 与代码审计

记住分层：CryptoVerif 证的是"**协议用法**在假设下是否安全"，不是 AES 等**原语本身**是否被密码分析攻破。工程上常见组合是先 ProVerif 排结构，再 CryptoVerif 收计算模型结论。

## 历史小故事（可跳过）

- **1980s**：概率多项式时间对手与归约证明传统成形
- **2001**：Blanchet 推出 ProVerif（符号模型）
- **2004**：Shoup《Sequence of Games》把 game hopping 写成可教学流程
- **2006**：Blanchet 在 CSFW 发表 CryptoVerif 首篇——game hopping 机械化
- **2008**（本文）：FOSAD 综述/教程，系统介绍工具与理论
- **2014–2017**：TLS 1.3 相关 computational 证明工作把工具推进工程视野
- **2019 前后**：WireGuard 等出现公开的 CryptoVerif 机械化证明

## 学到什么

1. **符号模型与计算模型不是二选一**——前者抓结构，后者抓概率与归约含金量；工业上常两层并用。
2. **Game hopping 是通用心法**：难目标 → 一串小差距中间游戏 → 已知困难假设。
3. **机器辅助 ≠ 全自动**：把"凭直觉"提升到"可机器检查"，仍要人指挥关键步。
4. **抽象决定结论强度**：random oracle 等强假设下证过，只说明在这些假设下成立；换假设要重证。
5. **先问威胁模型，再问工具绿灯**：证过只相对于你写下的假设与查询成立。

6. **工具表不是宗教**：ProVerif / Tamarin / CryptoVerif / EasyCrypt 各管一截；选错工具会得到"正确但答非所问"的证明。

## 延伸阅读

- 官方主页：[CryptoVerif](https://bblanche.gitlabpages.inria.fr/CryptoVerif/)（手册、示例、教程）
- Shoup 2004 *Sequence of Games*——game hopping 最好入门之一
- Bhargavan et al. 2017 *Verified Models and Reference Implementations for the TLS 1.3 Standard Candidate*（IEEE S&P）
- Lipp-Blanchet-Bhargavan 2019 *A Mechanised Cryptographic Proof of the WireGuard Virtual Private Network Protocol*
- [[proverif-2001]] —— 同作者符号模型前作，常与本文配套
- [[tls-1.3]] —— 看 computational 证明如何进入协议工程叙事

## 关联

- [[proverif-2001]] —— 符号模型版本；常先 ProVerif 再 CryptoVerif
- [[easycrypt-2011]] —— 同属 computational，面向更通用密码学
- [[tamarin-2012]] —— 符号 + 状态机，与 ProVerif 互补
- [[fstar]] —— 依赖类型路线上的另一条机械化证明路
- [[tls-1.3]] —— CryptoVerif 实战的重要协议舞台
- [[wireguard-2017]] —— 有公开 CryptoVerif 证明的现代 VPN 协议
- [[milner-pi-calculus]] —— 协议描述语言的祖宗气质

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[bernstein-sphincs-2015]] —— SPHINCS 2015 — 不用记状态的后量子哈希签名
- [[gmw-mental-game-1987]] —— GMW Mental Game — 多个人不交出秘密也能一起算答案
- [[mitls-2014-triple-handshake]] —— Triple Handshake — TLS 同一把主密钥被复用，黑客就能换人不换锁
- [[rabin-ot-1981]] —— Rabin OT 1981 — 不知道对方是否收到的秘密交换
- [[shor-1994]] —— Shor 1994 — 量子傅里叶变换把分解整数变成找周期
- [[wireguard-2017]] —— WireGuard — 4000 行代码重写 VPN 的极简主义
- [[yao-garbled-circuits-1986]] —— Yao Garbled Circuits — 两个人不摊牌也能一起算答案
