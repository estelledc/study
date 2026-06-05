---
title: Tamarin — 让计算机自己证 Signal、TLS 1.3 这种带 DH 的协议是不是真安全
来源: Schmidt, Meier, Cremers, Basin, "Automated Analysis of Diffie-Hellman Protocols and Advanced Security Properties", CSF 2012
日期: 2026-05-31
子分类: 形式化验证
分类: 形式化方法
难度: 进阶
provenance: pipeline-v3
---

## 是什么

Tamarin 是一个**自动验证密码协议安全性的工具**。你把协议（比如 Signal 的 X3DH 握手、TLS 1.3 的握手）写成它认得的语法，告诉它"我担心攻击者偷走会话密钥"，它就反复推理，要么给你一份机器证明，要么给你一条具体攻击路径。

日常类比：像一个不会累的"协议审稿人"，你写完一份新协议草案，丢给它过夜，第二天它要么说"我搜遍所有可能的攻击者动作都没法偷到密钥"，要么甩给你一份"先这样、再那样、就拿到了"的步骤清单。

它跟它哥哥 [[proverif-2001]] 的核心区别有两点：

1. **能处理 DH 群运算**：协议里写 `g^x^y`，Tamarin 知道这等于 `g^y^x`（指数可交换）。ProVerif 把 `g^x` 当不透明符号，处理不了。
2. **能处理可变状态**：比如密钥更新、消息计数器、Signal 的 ratchet。ProVerif 用 Horn 子句近似，遇到状态就失真。

代价是 Tamarin 半自动——工业级协议常需要专家写几十条辅助"提示"（lemma）才能收敛。

## 为什么重要

不理解 Tamarin，下面这些事都没法解释：

- 为什么 TLS 1.3 草案改了 28 版才定稿——Cremers 团队用 Tamarin 在草案 21 上找到密钥确认攻击，逼着 IETF 改协议
- 为什么 Signal 敢说"前向安全 + 后向自愈"是数学保证——Cohn-Gordon 等 2017 用 Tamarin 给 X3DH + Double Ratchet 写了机器证明
- 为什么 5G 的鉴权协议（5G AKA）发布前要送进学术界跑——3GPP 委托 Basin 团队用 Tamarin 发现 IMSI 泄露漏洞
- 为什么 EMV 银行卡 2021 年还能被破——Basel 团队用 Tamarin 发现 Visa 非接触绕过 PIN 的逻辑漏洞

Tamarin 已经是"严肃协议发布前的标配"。

## 核心要点

Tamarin 的工作原理拆成 **三块**：

1. **多重集重写（MSR）**：协议状态是一袋事实，比如 `Out(g^x), AliceState(k), AttackerKnows(g)`。每条规则形如 `[前提] --[动作]-> [结论]`，触发时把前提里的事实从袋子里拿走、把结论里的事实放进去。日常类比：像桌面上一堆便签，规则就是"看到这几张就换成那几张"。

2. **等式理论 E**：告诉工具哪些项相等。DH 的核心等式是 `(g^x)^y = (g^y)^x`，Tamarin 内置。还能加 XOR、双线性配对、数字签名等。这是处理代数运算的关键，也是它比 ProVerif 强的地方。

3. **反向归结搜索 + 引导 lemma**：从"攻击者拿到密钥"这个目标反向推，看看能不能凑出一条触发轨迹。复杂协议搜索空间爆炸，需要人写辅助 lemma（"密钥永远不会被泄露给非参与方"）切剪枝。

三块加起来：状态用 MSR 表达 + 代数用 E 处理 + 搜索靠归结 + 复杂时人帮一把。

## 实践案例

### 案例 1：一个最简单的 DH 协议怎么写

```
rule Init_Alice:
    [ Fr(~x) ]                       // 抽一个新鲜随机数 x
  --[ ]->
    [ Out(g^~x), AliceState(~x) ]    // 把 g^x 发到网上、自己存 x

rule Recv_Alice:
    [ AliceState(~x), In(Y) ]        // 收到对方的 Y
  --[ Secret(Y^~x) ]->               // 声称 Y^x 是会话密钥
    [ ]
```

接着写一条要证的属性："不存在轨迹让 `Secret(K)` 发生且 `K` 被攻击者知道"。

Tamarin 内部知道 `(g^y)^x = (g^x)^y`，所以 Alice 算出的 `Y^x` 跟 Bob 算出的 `(g^x)^y` 是同一个，能正确匹配。

### 案例 2：TLS 1.3 草案 21 的真实发现

2016 年 Cremers 团队用 Tamarin 建模 TLS 1.3 草案，发现一种 **密钥同步混淆攻击**：客户端和服务器虽然都协商出会话密钥，但**它们以为对方也确认了这个密钥**，而实际上只有一方确认了。攻击者可以利用这点欺骗一方"通信完成"。

修复方式：在握手最后加一轮显式 `Finished` 消息互相确认。这个改动直接进了草案 22，最终成为 RFC 8446。

机器证明放在那里，可以反复重跑——这是论文证明做不到的。

### 案例 3：Signal X3DH 的前向安全证明

Signal 的 X3DH 一次握手用了 **四个 DH 交换**（身份密钥、签名预共享密钥、一次性预共享密钥、临时密钥）。手算证明会算到崩溃。

Cohn-Gordon-Cremers-Dowling-Garratt-Stebila 2017 的论文把整套 X3DH + Double Ratchet 写进 Tamarin，证了：

- **前向安全**：长期身份密钥泄露不影响过去会话
- **后向自愈**：单次会话密钥泄露不影响未来会话（Ratchet 自我恢复）

证明跑了好几个小时，期间需要写约 30 条辅助 lemma 引导。但跑出来的是机器可重新验证的证书。

## 踩过的坑

1. **半自动 ≠ 全自动**：新手把协议丢进去等结果，跑了一个小时不出来——通常不是 bug 而是搜索没被 lemma 切。专家要会"调"。

2. **Sound 但 incomplete**：跑出"能证明"=一定安全；跑不出来 ≠ 一定不安全。区别于 [[proverif-2001]]，Tamarin 的 incomplete 是必要的代价。

3. **建模决定结论**：协议建模时漏掉一个变量（比如忘了把 nonce 也算进会话标识），证出来的"安全"对真协议可能没意义。这一步需要专家。

4. **等式理论越自定义越危险**：用户可以加自己的等式，但加错了可能让搜索不停或漏掉攻击路径。

5. **Dolev-Yao 抽象层**：Tamarin 证的是抽象层"攻击者拼不出密钥"，不证密码学原语本身（AES、RSA 是不是真的难破）。实现层 bug、侧信道泄露也不在它的责任范围。

## 适用 vs 不适用场景

**适用**：

- 协议规范阶段（草案）需要高保证——TLS、Signal、5G、EMV 都用
- 有 DH、密钥更新、ratchet 等代数 + 状态运算
- 团队里有人懂形式化，能写 lemma 调

**不适用**：

- 想完全不动脑全自动 → 用 [[proverif-2001]] 起步
- 协议语法层面出错（密文里塞错字段）→ 这是工程问题，不是建模能解决的
- 验证密码学原语本身 → 用 EasyCrypt / CryptoVerif（计算模型工具）
- 验证实现代码 → 用 F* / fiat-crypto

## 历史小故事（可跳过）

- **2009 年**：ETH Zurich 的 Meier 写 scyther-proof 工具前身
- **2012 年 CSF**：Schmidt-Meier-Cremers-Basin 论文给 DH 协议自动证明，**Tamarin 的诞生论文**
- **2013 年 CAV**：发布工具论文 The Tamarin Prover
- **2016-2017 年**：Cremers 团队用它验 TLS 1.3 草案，引发协议修改
- **2017 年**：Cohn-Gordon 等给 Signal X3DH + Double Ratchet 写出机器证明
- **2018-至今**：Basin 团队接 3GPP 5G AKA、EMV、Apple iMessage PQ3 等工业协议

工具到现在仍由 ETH 和 CISPA 维护，开源 Haskell 实现。

## 跟 ProVerif 的对比表

把核心差异列清楚，选工具时看这张：

| 维度 | ProVerif | Tamarin |
|------|----------|---------|
| 协议建模 | applied-pi 进程 → Horn 子句 | 多重集重写规则 |
| 状态支持 | 弱（Horn 近似失真） | 原生支持 |
| DH 群运算 | 弱（g^x 当不透明符号） | 内置等式 g^x^y = g^y^x |
| 自动化 | 全自动 | 半自动，复杂证需写 lemma |
| 终止性 | 通常会终止 | 可能不终止 |
| 工业用例 | Noise、WireGuard、早期 TLS | TLS 1.3、Signal、5G AKA、EMV |

实战中常常**两个都跑一遍**：先 ProVerif 快速过一遍，过不了再上 Tamarin 精细建模。

## 学到什么

1. **代数 + 状态 = MSR + 等式理论**：协议安全要同时处理"密钥怎么计算"和"协议进行到第几步"，多重集重写优雅地把两件事统一。
2. **半自动是工业落地的妥协**：TLS、Signal 这种规模的协议没法完全自动证，但"专家提示 + 机器搜索"配合够用。
3. **机器证明 vs 论文证明**：机器证明能反复重跑、可在协议变化时增量重证、可被审稿人独立复现。论文证明做不到。
4. **抽象层是双刃剑**：Dolev-Yao 让证明可行，但实现层 bug 不在它范围——所以工业上还要配 F* / 形式化代码生成。
5. **形式化方法工程化要 15 年**：2012 论文 → 2017 真正工业落地，期间靠 ETH 团队不停打磨工具、写教程、跟 IETF/3GPP 合作。理论到产品的路非常长。

## 延伸阅读

- 工具主页：[Tamarin Prover Manual](https://tamarin-prover.com/manual/)（章节式教程，从 DH 例子开始）
- 经典论文：[Schmidt-Meier-Cremers-Basin CSF 2012](https://people.cispa.io/cas.cremers/downloads/papers/SMCB2012-tamarin.pdf)
- 工业案例：[Cohn-Gordon et al. — A Formal Security Analysis of the Signal Messaging Protocol, EuroS&P 2017](https://eprint.iacr.org/2016/1013)
- 5G AKA：[Basin et al. — A Formal Analysis of 5G Authentication, CCS 2018](https://dl.acm.org/doi/10.1145/3243734.3243846)
- TLS 1.3：[Cremers et al. — A Comprehensive Symbolic Analysis of TLS 1.3, CCS 2017](https://dl.acm.org/doi/10.1145/3133956.3134063)

## 关联

- [[proverif-2001]] —— 兄弟工具，Horn 子句路线，全自动但状态/DH 弱
- [[tls-1.3]] —— Tamarin 在工业上最大规模的应用之一
- [[diffie-hellman]] —— 等式理论的核心对象 g^x^y = g^y^x
- [[lamport-tla-1994]] —— 同样是状态机 + 时序逻辑，但走分布式正确性而非密码协议路线
- [[hoare-logic]] —— 程序正确性的形式化，跟 Tamarin 的协议正确性一脉相承
