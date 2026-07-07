---
title: STARK — 不需要"可信第三方"的计算正确性证明
来源: 'Ben-Sasson, Bentov, Horesh, Riabzev. "Scalable, Transparent, and Post-Quantum Secure Computational Integrity", IACR ePrint 2018/046'
日期: 2026-06-24
分类: security-privacy
难度: 高级
---

## 是什么

STARK（Scalable Transparent ARgument of Knowledge）是一套**让验证者用极少时间确认一段巨大计算确实被正确执行**的证明系统。日常类比：你请会计算了一整年的公司账，但你只花 5 分钟翻几个抽样数字就能确定账没做错——而且这个过程不需要你信任任何第三方审计师。

传统零知识证明（如 zk-SNARK）需要一个"可信设置仪式"：几个人共同生成一串随机数，如果其中任何人保留了那串随机数就能伪造证明。STARK 把这个设置完全去掉——验证者用的随机数全是公开抛硬币产生的，所以叫"透明"（transparent）。同时 STARK 只依赖抗碰撞哈希函数，不怕量子计算机，所以叫"后量子安全"。

论文全称 "Scalable Transparent ARgument of Knowledge" 里每个词都是关键属性：Scalable 指验证时间随计算量对数增长；Transparent 指不需要任何秘密参数；ARgument 指计算安全性（而非信息论安全）；Knowledge 指证明者必须"真的知道"答案才能生成合法证明。

## 为什么重要

不理解 STARK，下面这些事都没法解释：

- StarkNet / Polygon zkEVM / RISC Zero 为什么敢说"没有可信设置也能做 rollup"——因为底层就是 STARK
- 为什么以太坊的 Layer-2 方案能把上万笔交易压缩成一个几百 KB 的证明——STARK 的验证时间是 log(计算量)
- 为什么后量子密码学讨论中 STARK 被反复提及——它不依赖椭圆曲线或离散对数，只依赖哈希函数
- 为什么 ZK 系统有 SNARK 和 STARK 两大路线之争——本文就是 STARK 路线的奠基论文

这篇论文是 ZK-STARK 路线的"创世论文"，之后所有使用 FRI 的证明系统（ethSTARK、Plonky2、Circle STARK）都是它的直系后代。

## 核心要点

STARK 的证明过程拆成**三步**：

1. **算术化（Arithmetization）**：把"这段程序跑对了"翻译成"这组多项式满足约束"。类比：把一道应用题翻译成代数方程组——如果方程有解，说明原题答案正确。具体做法是把计算的每一步记录为执行轨迹（execution trace），然后用多项式约束（AIR，Algebraic Intermediate Representation）描述"相邻两行之间必须满足的关系"。

2. **低度测试（Low-Degree Testing via FRI）**：验证者不会去读完整个多项式（太长了），而是随机挑几个点抽查，看它是不是"真的是低次多项式"。核心协议叫 FRI（Fast Reed-Solomon IOP of Proximity）——每轮把多项式折半，直到剩一个常数。类比：验证一本 1000 页的书确实是合法印刷品，不必读完，只需随机翻 10 页检查格式。FRI 的巧妙之处在于每一轮折半都是随机线性组合，使得作弊者无法预测该伪造哪些点。

3. **透明随机性 + Fiat-Shamir**：把交互式证明压缩成非交互式——验证者的"随机挑战"用哈希函数对之前所有消息求摘要来替代，任何人都能复现同样的挑战序列。不需要可信第三方，也不需要验证者在线。

## 实践案例

### 案例 1：DNA 数据库匹配（论文原始场景）

```
场景：警察声称"总统候选人的 DNA 不在犯罪数据库中"
问题：公众如何相信，又不暴露数据库内容？

STARK 做法：
1. 警察（证明者）对数据库做 commitment（哈希指纹）
2. 运行匹配搜索，生成 STARK 证明
3. 任何人（验证者）用几毫秒验证证明，确认搜索结果正确
```

验证者不需要看数据库内容，不需要信任警察，也不需要信任任何审计师。

论文实测：数据库约 100 万条 DNA 记录时，证明者生成证明约数分钟，验证者验证只需毫秒级，通信量约几百 KB。

### 案例 2：区块链 Layer-2 Rollup

```
场景：以太坊主链一秒只处理 15 笔交易
STARK rollup 做法：
1. 链下排序器执行 10000 笔交易（证明者）
2. 生成一个 STARK 证明，约 200KB
3. 主链合约验证证明（验证者），约 log(10000) 步
4. 一笔链上交易确认了 10000 笔链下交易的正确性
```

这就是 StarkNet 的核心架构。验证时间随交易数量对数增长，而非线性增长。

核心收益：主链不需要重新执行所有交易，只需验证一个简短证明。吞吐量提升 100-1000 倍，同时继承主链的安全性。

### 案例 3：RISC Zero 通用计算证明

```
场景：证明"我确实运行了这段 Rust 程序并得到这个输出"
做法：
1. 把 RISC-V 指令集的每一步执行转化为算术约束
2. 用 STARK 证明所有约束被满足
3. 任何人验证证明 → 确信程序确实被正确执行
```

这把 STARK 从"证明特定电路"扩展到"证明任意程序"。关键洞察：只要能把计算表示为执行轨迹（execution trace），就能用 STARK 证明它。

## 踩过的坑

1. **证明体积大**：STARK 证明约几百 KB，而 SNARK 只有几百字节——这是透明性的代价。不需要可信设置但证明更大，对链上存储成本敏感的应用要三思。

2. **证明生成慢于验证**：证明者时间是 O(n·log²n)，验证者是 O(log²n)；对证明者来说计算量仍然很大，工业级系统往往需要 GPU 或专用 ASIC 加速证明生成。

3. **有限域选择影响效率**：论文用二进制域实现，后续工程（如 StarkNet）改用质数域（Goldilocks/BabyBear），性能差异可达 10 倍以上。选错域 = 白做优化。

4. **安全参数和证明大小的权衡**：论文实现只有 60-bit 安全性；提高到 128-bit 会让证明更长、生成更慢。实际部署时安全参数不能照搬论文默认值。

## 适用 vs 不适用场景

**适用**：

- 需要公开可验证且不依赖可信第三方的计算完整性证明（如公共审计、选举）
- 大规模计算（交易数 > 数千）——STARK 的对数验证优势才显现
- 后量子安全要求的场景——只依赖哈希函数，不依赖椭圆曲线
- 需要证明者在生成证明后不再被信任——透明性保证任何人都能验证

**不适用**：

- 证明体积必须极小（< 1KB）的场景——用 SNARK 或 Groth16 更合适
- 小规模计算（< 100 步）——STARK 的常数开销不划算，直接重算更快
- 需要基于配对的递归组合——SNARK 在递归证明上目前更成熟
- 链上验证 gas 成本敏感的场景——STARK 证明大意味着 calldata 费用高

## 历史小故事（可跳过）

- **1992 年**：PCP 定理被证明——理论上"验证只需读常数个 bit"的证明系统存在，但完全不实用
- **2013 年**：Ben-Sasson 参与 libSNARK / Zerocash，用 SNARK 做隐私交易，但可信设置是心病
- **2016 年**：Ben-Sasson 等提出 IOP（Interactive Oracle Proofs）模型，为去掉可信设置打下理论基础
- **2017 年**：FRI 协议发表（Fast Reed-Solomon IOPP），第一次让低度测试达到准线性证明 + 对数验证
- **2018 年**：本论文发表，首次实现完整 ZK-STARK 系统并在 DNA 匹配问题上实测
- **2021 年**：StarkNet 主网上线，STARK 从学术论文走向日处理百万笔交易的生产系统
- **2023 年**：Polygon 宣布用 STARK 替换其 SNARK 方案；RISC Zero 发布通用 zkVM

从 PCP 定理到工业落地，跨越 30 年。Ben-Sasson 本人从学者转型为 StarkWare CEO，是少见的"自己的论文自己做成公司"的案例。

## 学到什么

- **透明性 = 不需要信任任何人**——这是 STARK 相对于 SNARK 最本质的区别，也是"去中心化"真正需要的安全属性
- **对数验证是可扩展性的关键**——验证时间 O(log n) 意味着计算量增 1000 倍，验证只慢一点点
- **后量子安全不是噱头**——只用哈希函数意味着量子计算机攻不破，而基于椭圆曲线的 SNARK 在量子面前会崩塌
- **工程落地需要 10 年**——2018 理论 → 2021 主网，中间全是优化有限域、证明压缩、硬件加速

## 延伸阅读

- STARK 101 动手教程：[StarkWare STARK 101](https://starkware.co/stark-101/)（Python 从零写证明器，初学者友好）
- Vitalik 三篇系列博客：[STARKs, Part I](https://vitalik.eth.limo/general/2017/11/09/starks_part_1.html)（从多项式讲起，配图清晰）
- FRI 协议论文：Ben-Sasson et al., "Fast Reed-Solomon Interactive Oracle Proofs of Proximity", ICALP 2018
- 深入 zk-STARK 原理：[trapdoor-tech zkstark-book](https://trapdoor-tech.github.io/zkstark-book/)（中文，含安全性分析）
- [[zk-snark]] —— STARK 的"对手"：需要可信设置但证明更小
- [[bitcoin]] —— 区块链最早的计算完整性方案（全节点重算，不可扩展）

## 关联

- [[zk-snark]] —— SNARK 需要可信设置，STARK 不需要；两者是 ZK 证明的两大路线
- [[bitcoin]] —— 比特币靠全节点重算保证完整性，STARK 把验证压缩到对数级
- [[diffie-hellman-1976]] —— DH 依赖离散对数假设，STARK 刻意回避这类假设以获得后量子安全
- [[cook-levin]] —— Cook-Levin 证明 NP 完全性，STARK 的算术化本质是把计算归约为约束满足问题
- [[shannon-1948]] —— Reed-Solomon 码源于信息论纠错，FRI 协议复用了这套数学工具
- [[reed-solomon-1960]] —— FRI 直接建立在 Reed-Solomon 码的低度测试性质之上
- [[rsa]] —— RSA 依赖大数分解，量子计算机能破；STARK 只用哈希函数所以安全

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[bitcoin]] —— Bitcoin 白皮书
- [[cook-levin]] —— Cook-Levin 定理 — NP-完全性的诞生
- [[reed-solomon-1960]] —— Reed-Solomon 编码
- [[rsa]] —— RSA 公钥密码
- [[shannon-1948]] —— Shannon 1948 — 信息论的诞生
- [[zk-snark]] —— zk-SNARK 零知识证明

