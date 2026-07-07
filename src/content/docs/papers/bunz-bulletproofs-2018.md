---
title: Bulletproofs 2018：不用可信仪式的短范围证明
来源: 'Bünz et al., "Bulletproofs: Short Proofs for Confidential Transactions and More", IEEE S&P 2018 / IACR ePrint 2017/1066'
日期: 2026-07-07
分类: security-privacy
难度: 中级
---

## 是什么

Bulletproofs 是一种零知识证明协议，最常见用途是范围证明：我证明一个隐藏金额在合法范围内，但不把金额说出来。

日常类比：你去坐过山车，工作人员要确认你身高超过标准，但你不想公开具体身高。Bulletproofs 像一个可信的量身规则：别人能确认“合格”，却看不到精确数值。

在加密货币里，金额通常会被承诺隐藏起来：

```text
commitment = commit(amount, random)
proof = prove(0 <= amount < 2^64)
verify(commitment, proof) == true
```

验证者知道承诺里的金额没有溢出、没有变成负数，但不知道它到底是 3、30 还是 300。

读验证结果时，可以先把它当成一句话：“这个被遮住的数，确实落在规则允许的区间里。”

这篇论文的亮点是：证明很短，不需要 trusted setup，还能把多笔范围证明聚合起来。

## 为什么重要

不理解 Bulletproofs，很多隐私系统会卡在“既隐藏又合法”这个矛盾上：

- 隐私交易要隐藏金额，但系统还要确认没有凭空造钱。
- 零知识证明如果太大，链上存储和同步成本会爆炸。
- SNARK 很短，但常见方案需要可信设置；Bulletproofs 避开了这件事。
- 范围证明是很多隐私协议的地基，金额、余额、资产证明都会用到。

## 核心要点

1. **零知识**：证明者给出“我知道合法见证”的证明，验证者不学到见证本身。

2. **范围证明**：最典型问题是证明隐藏值落在 `[0, 2^n)`。这能防止金额字段利用有限域绕回去。

3. **证明短**：论文给出的范围证明大小随位数对数增长，而不是线性增长。数值范围变大时，证明不会跟着膨胀太多。

4. **无 trusted setup**：不需要先举行一次“大家相信没人留后门”的仪式，部署门槛更低。

5. **聚合友好**：多笔输出可以合成一个证明，额外大小只小幅增加，特别适合一笔交易里有多个输出的场景。

6. **依赖离散对数假设**：它不是“什么数学都能证明”，而是在特定椭圆曲线群和承诺结构上工作。

## 实践案例

### 案例 1：隐藏交易金额

```text
输入承诺 - 输出承诺 = 手续费承诺
每个输出都带 range proof
验证者检查等式和范围证明
```

逐部分解释：

- 承诺让金额不可见，但仍能参与加减。
- 等式检查保证总账守恒。
- 范围证明保证输出不是“看似很小、实际绕回”的坏数。

### 案例 2：多输出交易聚合证明

```text
proof = prove_many([amount_a, amount_b, amount_c])
verify_many([commit_a, commit_b, commit_c], proof)
```

如果每个输出各带一份证明，交易会变胖；聚合后，一笔交易只带一个更紧凑的证明。Monero 后来采用 Bulletproofs，一个直接结果就是平均交易大小明显下降。

### 案例 3：证明偿付能力

```text
交易所隐藏用户余额明细
公开总负债承诺
证明每个余额非负，且总和正确
```

这个例子不一定要上链。它说明 Bulletproofs 的价值不是“只服务币”，而是服务任何“我想证明账没问题，但不想公开明细”的场景。

## 踩过的坑

1. **把 zero-knowledge 当成加密**：加密是把消息藏起来；零知识证明是证明某个陈述成立。两者经常配合，但不是一回事。

2. **以为不用 trusted setup 就一定最快**：Bulletproofs 的证明短，但验证通常比某些 SNARK 更重。没有免费午餐。

3. **忽略实现审计**：密码论文正确不等于代码安全。Monero 上线前做了专门审计，就是因为实现细节很敏感。

4. **把范围证明当余额证明的全部**：范围只说明每个数合法，还要配合承诺加法、签名和共识规则。

5. **混淆 Bulletproofs 和 Bulletproofs+**：后者是后续改进，结构相近但尺寸和速度又做了优化。

## 适用 vs 不适用场景

**适用**：

- 隐私交易里的隐藏金额范围证明。
- 不想做 trusted setup 的开放协议。
- 多个范围证明可以聚合的场景。
- 对证明大小敏感，但能接受较重验证的系统。

**不适用**：

- 极端追求毫秒级验证的大吞吐系统。
- 已经有成熟可信设置和高效 SNARK 基建的场景。
- 需要非常复杂通用电路且证明速度是瓶颈的任务。
- 没有密码工程经验的团队直接自己实现底层协议。

## 历史小故事（可跳过）

- 2017 年，Bünz、Bootle、Boneh、Poelstra、Wuille、Maxwell 发布 ePrint 版本。
- 2018 年，这项工作发表在 IEEE Symposium on Security and Privacy。
- Stanford Applied Crypto Group 的介绍页强调了它“短、非交互、无 trusted setup”的定位。
- Monero 在 2018 年网络升级中部署 Bulletproofs，官方资料提到平均交易大小和费用都明显下降。
- 2020 年后，Monero 社区又研究 Bulletproofs+，继续压缩证明大小和验证时间。

## 学到什么

1. 隐私系统不是只要“藏起来”，还必须能证明“藏起来的东西合法”。
2. Bulletproofs 的核心价值是短证明、无 trusted setup、适合范围证明和聚合。
3. 密码协议落地时，证明大小、验证时间、审计成本和共识升级都要一起看。
4. 读零知识论文时，先抓住应用陈述，再回头看内积论证和 Fiat-Shamir 这类机制。
5. 对初学者来说，先把“承诺、范围、验证”三件事画成流程图，比直接啃公式更稳。

## 延伸阅读

- IACR ePrint：[Bulletproofs 2017/1066](https://eprint.iacr.org/2017/1066)
- Stanford 介绍页：[Bulletproofs](https://crypto.stanford.edu/bulletproofs/)
- Monero 词条：[Bulletproofs | Moneropedia](https://web.getmonero.org/resources/moneropedia/bulletproofs.html)
- Monero 后续：[Bulletproofs+ in Monero](https://www.getmonero.org/2020/12/24/Bulletproofs%2B-in-Monero.html)
- [[zk-snark]] —— 对比有 trusted setup 的短证明路线

## 关联

- [[zk-snark]] —— 同样追求短证明，但常见权衡不同。
- [[ben-sasson-stark-2018]] —— STARK 走透明、抗量子、证明更大的路线。
- [[polygon-zkevm]] —— 工程化零知识证明系统的链上应用。
- [[zksync-era]] —— 用零知识证明做扩容的项目代表。
- [[layerzero]] —— 不是同类协议，但同样关心链上验证成本。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
