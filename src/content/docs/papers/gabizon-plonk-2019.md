---
title: PLONK — 一次通用布置，反复证明很多程序
来源: 'Ariel Gabizon, Zachary J. Williamson & Oana Ciobotaru, "PLONK: Permutations over Lagrange-bases for Oecumenical Noninteractive arguments of Knowledge", IACR ePrint 2019/953, 2019, https://eprint.iacr.org/2019/953'
日期: 2026-07-07
分类: 安全与隐私
难度: 高级
---

## 是什么

想象你开了一家考试中心。以前每换一门课，都要重新布置考场、重新封试卷、重新请监考；PLONK 想做的是：**只布置一次通用考场，以后很多不同考试都能用同一套布置来验证**。

在密码学里，"考试"就是一个计算任务，"考生"是证明者，"监考"是验证者。证明者想让验证者相信："我确实知道一个秘密输入，让这段计算得到正确结果"，但又不把秘密输入交出去。

PLONK 是 2019 年 Gabizon、Williamson、Ciobotaru 提出的 zk-SNARK 方案。它把计算改写成多项式关系，用 KZG 多项式承诺让验证者只检查少量点，就能确信整张"计算表格"没有作弊。

最重要的定位：PLONK 不是某个应用，而是一套**通用证明系统**。Aztec、Mina、zkSync、Polygon zkEVM 等系统中的许多方案，都能看到 PLONK 或 PLONK-family 的影子。

## 为什么重要

不理解 PLONK，下面这些事都很难解释：

- 为什么 zk 应用不想每写一个新电路就重新做一次专属 trusted setup
- 为什么"多项式承诺"会突然变成区块链扩容和隐私系统的核心积木
- 为什么很多 zkEVM、隐私转账、递归证明方案都在说自己是 PLONKish
- 为什么 Lagrange basis、permutation argument 这些抽象词会影响真实链上 gas 成本和证明时间

一句话说：PLONK 把 zk-SNARK 从"每个电路都要定制礼服"推进到"有一套可反复裁剪的通用布料"。

## 核心要点

PLONK 的核心可以拆成三件事：

1. **通用 trusted setup**：像先建一个最大容量的体育馆。只要你的比赛规模不超过容量，就不用为每场比赛重建场馆。PLONK 的 SRS 可以服务很多不同电路，而不是绑定某一个电路。

2. **Lagrange basis 上的电路表格**：像把程序运行过程写进电子表格，每一行是一步计算，每一列是一根线。PLONK 直接在这些行对应的点上看多项式取值，避免频繁在"系数表"和"取值表"之间来回搬家。

3. **Permutation argument 检查连线**：像老师检查同一个学生的姓名在多张表里是否对得上。电路里同一根线可能出现在不同位置，PLONK 用一个 grand product 证明"这些位置确实是同一批值，只是顺序换了"。

这三件事配合 KZG 承诺，就得到一个证明短、验证快、工程上能复用的 SNARK。

## 术语小地图

先把几个词翻成人话：

- **SNARK**：短证明。验证者不用重跑整段计算，只看一小份证明。
- **Zero-knowledge**：零知识。证明能说明"我知道"，但不泄露"我知道的是什么"。
- **Trusted setup**：启动仪式。先生成公共参数；如果秘密废料没销毁，系统可能有伪造风险。
- **Universal / Updatable**：通用、可更新。一次 setup 可给许多电路用，后来的人还可以加入随机性继续加固。
- **Polynomial commitment**：多项式承诺。先把一整条曲线锁进一个短承诺，之后只打开某几个点让别人检查。

## 实践案例

### 案例 1：把约束写成 PLONK 的一行

假设要证明某一步满足 `a * b + c = d`：

```text
qM*a*b + qL*a + qR*b + qO*d + qC = 0
qM=1, qL=0, qR=0, qO=-1, qC=c
```

逐部分解释：

- `a,b,d` 是这一行的三根主要线，像表格里的三列
- `qM,qL,qR,qO,qC` 是选择器，告诉这一行要检查什么公式
- 当公式等于 0，说明这一行计算合法；每一行都合法，整段电路才合法

### 案例 2：为什么需要 permutation argument

同一个中间值可能在第 2 行算出来，在第 9 行被继续使用：

```text
row 2:  x = a * b
row 9:  y = x + 5
copy constraint: row2.output == row9.left
```

逐部分解释：

- 如果只检查每一行公式，证明者可能在第 9 行偷偷换一个假的 `x`
- copy constraint 要求两个位置装的是同一个值
- PLONK 不逐个位置检查，而是把所有"应该相等的位置"编成一个置换，用一次乘积关系整体检查

### 案例 3：多项式承诺像密封信封

证明者先承诺一整张表格，再只打开验证者随机点 `z` 附近的值：

```text
commit(A), commit(B), commit(C)
verifier chooses z
open A(z), B(z), C(z), Z(z)
```

逐部分解释：

- `commit(A)` 像把整列 A 放进密封信封，之后不能改
- 验证者随机选 `z`，让证明者打开少数几个点
- 如果多项式关系在随机点都过关，作弊者很难让整条多项式只在被抽查处碰巧正确

## 踩过的坑

1. **把 PLONK 当成"不需要信任"**：PLONK 仍然依赖 trusted setup，只是这个 setup 更通用、可更新。

2. **把 universal 理解成无限大**：SRS 有最大规模，超过上限的电路仍然需要更大的参数。

3. **把 permutation 当成排序**：这里的置换不是为了排大小，而是为了证明"同一批值被重新排列后仍然对应"。

4. **只看证明大小，不看 prover 成本**：链上验证很便宜，不代表生成证明也便宜；prover 仍要处理整张计算表。

5. **以为 PLONK 是唯一方案**：Groth16、Marlin、STARK、Bulletproofs 都在不同约束下有优势，PLONK 只是工程均衡点之一。

## 适用 vs 不适用场景

**适用**：

- 需要为很多不同电路复用同一套公共参数的 zk 系统
- 链上验证成本敏感，希望证明短、验证快的场景
- 隐私交易、zk rollup、zkEVM、递归证明等需要通用算术电路的系统
- 团队能承担 setup、prover 优化、曲线与实现安全审计的工程成本

**不适用**：

- 完全不能接受 trusted setup 的场景，可以优先看 STARK 或 Bulletproofs
- 电路很小、只是一次性证明，PLONK 的工程复杂度可能不划算
- 需要透明哈希安全假设、抗量子叙事时，KZG+椭圆曲线配对不是最佳路线
- 只想理解零知识直觉的新手，应先学 `zk-snark`、承诺、有限域，再读 PLONK

## 历史小故事（可跳过）

- **2016 年前后**：Groth16 成为实用 zk-SNARK 代表，但每个电路通常要专属 setup，迁移成本高。
- **2019 年**：Sonic、Marlin、PLONK 等方案集中推动"通用/可更新 setup"，说明社区痛点已经很明确。
- **2019 年 8 月**：Gabizon、Williamson、Ciobotaru 发布 PLONK ePrint 论文，强调在 Lagrange basis 上做置换检查。
- **2020 年后**：plookup、TurboPLONK、UltraPLONK、Kimchi 等变体出现，把查表、自定义门、递归证明继续工程化。
- **2020s**：PLONK-family 成为主流 zk 工程词汇，尤其常见于隐私支付、rollup 和 zkEVM 方案。

## 学到什么

1. **PLONK 的主线是复用**：一次通用 setup 服务多种电路，降低了 zk 系统上线和迭代的摩擦。
2. **多项式是压缩计算的语言**：把每一步计算变成多项式等式，验证者就能用随机抽查代替重跑全程。
3. **置换参数解决"线连线"问题**：算术门只管每行对不对，permutation argument 负责跨行值是否真的相同。
4. **工程成功来自折中**：PLONK 没有消灭 trusted setup，也没有让 prover 免费；它是在证明大小、验证速度、通用性之间取得好平衡。
5. **PLONKish 是一个家族**：今天项目里说 PLONK，常常指原论文思想加上 lookup、自定义门、递归友好改造后的系统。

## 延伸阅读

- 论文原文：[Gabizon-Williamson-Ciobotaru 2019 ePrint 2019/953](https://eprint.iacr.org/2019/953)
- 友好讲解：[Vitalik Buterin — Understanding PLONK](https://vitalik.eth.limo/general/2019/09/22/plonk.html)
- 背景概念：先看 [[zk-snark]]，再回来看 PLONK 的通用 setup 和置换检查
- 相关方案：[[bunz-bulletproofs-2018]] —— 不需要 trusted setup，但证明和验证权衡不同
- 透明路线：[[ben-sasson-stark-2018]] —— 用哈希和 FRI 走另一条 zk 证明路线
- 密码基础：[[rsa]] / [[aes]] —— 帮助区分"加密隐藏内容"和"零知识证明知道内容"

## 关联

- [[zk-snark]] —— PLONK 是一类实用 zk-SNARK 方案，继承短证明与快速验证目标
- [[bunz-bulletproofs-2018]] —— 对照理解"不需要 setup"和"证明更长"之间的取舍
- [[ben-sasson-stark-2018]] —— 透明证明系统路线，与 PLONK 的 KZG+setup 路线形成对比
- [[cheon-ckks-2017]] —— 同态加密也追求"不暴露数据仍能计算"，但技术路径不同
- [[dwork-dp-icalp-2006]] —— 差分隐私保护统计输出，PLONK 保护证明过程中的秘密输入
- [[bitcoin]] —— 区块链公开验证需求推动了短证明系统的工程落地
- [[rsa]] —— 公钥密码学基础，帮助理解承诺、签名、证明系统背后的数学信任

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[bowe-halo-2019]] —— Halo 2019 — 不靠可信仪式递归压缩证明
