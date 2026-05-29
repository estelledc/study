---
title: Shannon 信息论 通信的数学理论
来源: Claude Shannon, "A Mathematical Theory of Communication", Bell System Technical Journal, Vol. 27, pp. 379-423, 623-656, July/October 1948
---

# Shannon 1948 — 信息论奠基的"通信数学理论"

## 一句话总结

Shannon 1948 是 Bell 实验室的 Claude Shannon 发表在 BSTJ 的奠基论文，开启信息论一整个学科。
在此之前，"信息"是模糊概念；之后，信息有了精确数学定义（熵 H = -Σ p log p），通信有了上限定理
（信道容量 C = max I(X;Y)），数据压缩有了理论下界。

Shannon 解决的核心问题是：在嘈杂信道上能可靠传输多少信息？这个问题原本是 Bell 实验室长期关心的
工程问题——电话线、电报线都有噪声，工程师在猜"加多少冗余够"。Shannon 用纯数学回答：信道有
确切的容量 C，速率 R<C 时存在编码方案使错误率任意小；R>C 时错误率必有下界。

三大核心贡献：(1) **信息熵 H** —— 把"信息量"定义为 -log p 的期望，符合直觉（罕见事件信息多）；
(2) **信道容量 C** —— 任何噪声信道有传输上限，超过 C 必丢失信息；
(3) **两个编码定理** —— 在 C 之下任意低错误率可达（noisy coding），熵是无损压缩下界（source coding）。

工业影响：所有现代通信（4G/5G/Wi-Fi/光纤/卫星）都在追求"逼近 Shannon 极限"。压缩算法
（gzip / zstd / Snappy）的极限是熵 H。机器学习（信息瓶颈/互信息估计）2010s 重新发现 Shannon 工具。

学科分支：编码理论 / 数据压缩 / 密码学 / 通信理论 / 信号处理 都源于此。
研究人员说"如果只能保留计算机科学一篇论文，就是这一篇"。

为什么 Shannon 一个人在一个夏天写出来：他在 Bell Labs 做密码学（与 Turing 同期但独立），
密码问题让他想"什么是信息"。同时他在 MIT 读硕期间用布尔代数表示电路开关，已经习惯用
数学抽象处理工程问题。这种"工程问题数学化"的方法论，是 Shannon 的核心贡献。

## Layer 0 — 论文档案速查

| 字段 | 值 |
|---|---|
| 论文 | A Mathematical Theory of Communication |
| 作者 | Claude E. Shannon |
| 机构 | Bell Telephone Laboratories |
| 发表 | BSTJ Vol. 27, July & October 1948 |
| 页数 | 79 页（July 379-423 + October 623-656）|
| 引用数 | 100k+（Google Scholar）|
| 影响 | 开启信息论学科 |
| 工业 | 所有现代通信 / 数据压缩 / 加密 |
| 教科书 | Cover & Thomas《Elements of Information Theory》|
| 重要继任 | Hartley 1928 / Nyquist 1924 / Wiener 1948 协同发展 |
| 后续著作 | Shannon-Weaver 1949 通信数学理论（书）|
| 与 Boole / Russell 关系 | 用二值代数表示信号 |
| 影响 ML | KL散度 / 互信息 / 信息瓶颈 |
| 影响 量子 | 量子信息论 Holevo capacity |
| 数学工具 | 概率 / 测度 / 渐近分析 |
| 不引用 | 没有引用 Wiener cybernetics（同期）|
| 工程实战 | LDPC / Turbo / Polar codes 逼近 C 的现代编码 |
| 派生 | Shannon-Hartley 定理（带宽信道容量公式）|
| Shannon 其他贡献 | 1937 硕士论文用布尔代数表达电路；1949 密码学 perfect secrecy |

## Section 1 — 历史定位

19 世纪末电报发明后，工程师就在思考"信道能传多少信号"。Hartley 1928 给出 log(信号数) 的
初步定义；Nyquist 1924 给出采样定理。但都没把"信息"和"噪声"统一处理。

Shannon 在 1948 之前在 Bell Labs 做密码学（与 Turing 在 Bletchley Park 类似工作）。密码学问题
让他思考"什么是信息"。1948 论文是这个工作的产物——把通信、压缩、加密统一在一个数学框架。

时间线：
- 1924 Nyquist：采样定理（带宽 vs 速率）
- 1928 Hartley：信息 = log(信号数)
- 1948 Shannon：信息熵 + 信道容量 + 编码定理（本论文）
- 1948 Wiener：控制论（同期但独立）
- 1949 Shannon-Weaver：科普版（让"通信理论"传播开）
- 1960s LDPC（Gallager）：第一个逼近 Shannon 极限的编码
- 1993 Turbo codes：Berrou 等接近 Shannon 限
- 2009 Polar codes（Arıkan）：第一个证明可达 Shannon 限的码

工程意义：Shannon 给出了"理论极限"，工程师 60 年逼近极限。

为什么 Shannon 没引用 Wiener？两人同期但思路不同。Wiener cybernetics 关心反馈和控制，
Shannon 信息论关心传输和编码。后人才发现两者数学工具有交集（统计决策、信号处理）。
Shannon 在 BSTJ 这种工程期刊发，Wiener 在科普书发，受众也不同。

为什么 Shannon 这一篇能开启整个学科？因为他给出了：
- 精确定义（熵 H、互信息 I、容量 C）
- 操作意义（压缩极限 = H、传输极限 = C）
- 存在性证明（noisy coding theorem、source coding theorem）
- 工程影响（所有通信都受此约束）

四个齐备，是公认"理论圣经"的标准。

## Definition 1 — Information / Self-Information

事件 x 的自信息：
$$I(x) = -\log_2 p(x)$$

直觉：罕见事件（小 p）信息量大；必然事件（p=1）信息量为 0。
单位：bit（log_2）/ nat（log_e）/ Hartley（log_10）。

例：投硬币正面 p=0.5，I = -log 0.5 = 1 bit。
   连续 8 次正面 p=1/256，I = 8 bit。

为什么用 -log？四个公理：
1. I 是 p 的连续函数
2. I(p=1) = 0（必然事件无信息）
3. I 单调递减（p 越小信息越多）
4. 独立事件 I(x,y) = I(x) + I(y)（加和性）

唯一满足这四公理的连续函数是 -log p（除了常数倍）。

为什么是 log_2 默认？因为二进制信号（0/1 bit）是最小信息单位。一个公平硬币结果 = 1 bit。
工程上选 log_2 让信息量直接对应"需要多少 bit 编码"。

Shannon 的天才在于：把"信息量"这种模糊直觉，用四公理逼出唯一函数形式。这是数学物理学
的标准方法（如 Cox 公理→概率），但 Shannon 是第一个用在通信上。

## Definition 2 — Entropy H

随机变量 X 的熵：
$$H(X) = -\sum_x p(x) \log_2 p(x) = E[I(X)]$$

熵是平均自信息。

例：均匀 8 面骰子 H = log 8 = 3 bit/symbol（每次掷骰需 3 bit 编码）。
偏置硬币 p=0.9 / 0.1，H = -0.9 log 0.9 - 0.1 log 0.1 ≈ 0.47 bit。

性质：
- 0 ≤ H(X) ≤ log |X|
- H = 0 iff X 确定
- H = log |X| iff 均匀分布

为什么叫熵？因为公式形式与统计力学的 Boltzmann 熵相同（S = k log W）。
冯诺依曼建议 Shannon 用"熵"，理由（半玩笑）：(1) 公式相同；
(2) 没人真懂熵是什么，你用了别人也不敢辩；(3) 其他名字都被占了。

直觉：熵 = 平均不确定性 = 平均编码长度。Huffman 编码就是逼近熵的实用算法。

英语字母平均熵约 1.0-1.5 bit/字母（远低于 log 26 ≈ 4.7），因为字母不均匀（e 多，z 少）
且有强相关（th 后大概率是 e）。这就是英文文本能压缩到 ~12.5% 的理论原因（gzip 实测约 30-40%
是工程极限，与理论的差是 dict 开销 + 没建模长程依赖）。

## Definition 3 — Mutual Information I(X;Y)

互信息：
$$I(X;Y) = H(X) - H(X|Y) = H(X) + H(Y) - H(X,Y)$$

直觉："Y 给出 X 多少信息"。当 Y 确定 X 时 I = H(X)；当 Y 与 X 独立时 I = 0。

性质：
- I(X;Y) ≥ 0
- I(X;Y) = I(Y;X) 对称
- I(X;Y) = D_KL(p(X,Y) || p(X)p(Y))，KL散度形式

为什么互信息在 ML 火？因为它是分布无关的依赖性度量。Pearson 相关只测线性，
互信息测任意函数关系（包括非线性、非单调）。
缺点：在高维连续情况下难以估计（直方图维度爆炸），需要 MINE/InfoNCE 等神经估计器。

InfoNCE（CPC, CLIP 用的对比损失）的理论基础就是互信息下界。

## Theorem 1 — Source Coding Theorem

定理：n iid 随机变量 X_1...X_n，最优无损压缩平均长度 ≥ H(X) bit/symbol。

证明思路：考虑"典型集"（典型概率 ~ 2^{-nH}），高概率落入此集，集大小 ~ 2^{nH}，编码需 nH bit。

工程意义：
- gzip / zstd / Brotli 都在追逼 H
- 永远到不了 H（损失编码 dict 的开销）
- 但可以无限接近（n→∞）

证明用了渐近等分性（AEP, Asymptotic Equipartition Property）：
n 大时 -1/n log p(X_1...X_n) → H(X)（弱大数定律的另一面）。
意味着实际看到的样本几乎全在"典型集"，集大小约 2^{nH}，每个等概率约 2^{-nH}。
编码典型集需 nH bit；非典型集忽略不计。

实战：Huffman / arithmetic coding / range coding 都达到熵的 1 bit 之内。
LZ77/LZ78（gzip 用）建模重复字符串，在弱平稳源上趋近熵。
现代神经压缩（DeepZip, NNCP）用 LM 建模长程依赖，能突破 gzip 极限。

## Theorem 2 — Channel Coding Theorem

定理：噪声信道容量 C = max_p(x) I(X;Y)。在传输速率 R < C 时，存在编码方案达到任意低错误率；
R > C 时错误率必 > 某阈值。

证明思路（Random Coding Argument）：
1. 随机生成 2^{nR} 个码字
2. 期望错误概率 → 0 当 n→∞ 且 R<C
3. 故存在某具体码可达此性能

这个证明的革命性在于：用随机化证明确定性存在。Shannon 没构造任何具体码，
只证明"存在一个好码"。具体构造是后人 60 年的事。

工程意义：60 年理论指导编码设计：
- 1960 LDPC：第一逼近 C 的码
- 1993 Turbo codes：达到 0.5 dB 内
- 2009 Polar codes：理论上达到 C
- 现代 5G NR：用 LDPC + Polar
- 6G 在研究 Joint Source-Channel Coding（重新合并 Theorem 1 和 2）

为什么 Shannon 极限难达？因为需要 n→∞ blocklength。
工程上 n=1024-65536 bit 是实用极限，和无限 n 还有 0.5-2 dB gap。

## Shannon-Hartley 定理（重要推论）

带宽 W、信噪比 SNR 的高斯白噪声信道，容量：
$$C = W \log_2(1 + SNR) \quad \text{bit/s}$$

这是 Shannon 1948 论文的著名推论。Hartley 1928 已知无噪声情况，Shannon 加上噪声项 log(1+SNR)。

工程意义：
- Wi-Fi 5GHz 段 80MHz 带宽 + 30dB SNR → C ≈ 800 Mbps（理论极限）
- 实际 Wi-Fi 6 标称 9.6 Gbps，是因为多 antenna（MIMO）等同提升带宽 / SNR
- 5G 毫米波用 800MHz 带宽，C 数 Gbps 量级
- 香农极限解释为什么"提速 = 加带宽 + 加 SNR + 多通道"

## 嵌入图

![Shannon 通信系统](/study/papers/shannon-1948/01-channel-capacity.webp)

图示从信源到信宿的五个组件 + 三个核心公式 + 两个编码定理。
通信系统五要素是 Shannon 的抽象：任何通信（电话/电报/网络/广播）都符合此模型。
现代深度学习的 encoder-decoder 架构（VAE/Transformer）正是 Shannon 模型的延伸。

## Section 8 — 工业应用

1. **数据压缩**：gzip(LZ77+Huffman) / zstd / Brotli / Snappy 都在熵附近。
   实战看：英文文本 gzip 压缩到 30-35%（熵理论约 12-15%），neural compression（NNCP）达 8-10%。
   差距=没建模长程依赖。

2. **通信编码**：LDPC（Wi-Fi 802.11n+ / 5G data） / Polar（5G control / DVB-S2X）。
   Turbo codes 1993 公布后，3G WCDMA 立刻采用，因为离 Shannon 极限只 0.5 dB。
   5G 选 LDPC 因为高吞吐 + 并行解码友好。

3. **机器学习**：互信息估计（MINE）、信息瓶颈（IB）、对比学习的 InfoNCE 损失。
   CLIP / SimCLR 用 InfoNCE 学习视觉表征，理论是 I(X;Y) 下界。
   2017 Tishby 提出 Information Bottleneck 理论解释深度学习泛化（后被 Saxe 2018 反驳）。

4. **密码学**：Shannon 1949《Communication Theory of Secrecy Systems》定义了 perfect secrecy
   + entropy 的密钥要求。one-time pad 是唯一 perfect secrecy（密钥熵 ≥ 明文熵）。
   实战不可用（密钥太长），但理论指导后续所有密码设计。

5. **生物信息学**：DNA 序列熵估计、蛋白质 conformation entropy。
   人类基因组 30亿碱基对，每对 2 bit naive，但有大量冗余 → 实际熵约 1.5 bit/对。

6. **量子信息论**：von Neumann 熵 S(ρ) = -Tr(ρ log ρ) 是 Shannon 熵在量子的延伸。
   Holevo bound 给出量子信道容量上限。量子通信不超过经典 Shannon 太多
   （某些场景下量子有优势，如纠缠辅助容量）。

## 怀疑

> 怀疑：Shannon 容量是渐近极限，实际编码（Turbo / LDPC / Polar）至 Shannon 80% 已是工程极限。
> 剩下的 20% 需要 n→∞ blocklength，工业不可接受。Shannon "可达"是数学正确但物理不可实现的极限。
> 反问：那为什么仍然以 Shannon 极限为指导？因为它给方向：还有 20% 空间值得 invest。

> 怀疑：信息熵假设独立同分布。真实数据（自然语言、图像、视频）有强相关性，香农熵高估实际信息量
> （联合熵更低）。这是为什么 LLM 压缩（基于 transformer）能比 gzip 强 5-10x（gzip 没建模长程依赖）。
> 反问：那 Shannon 还成立吗？成立——只是要用 H(X_∞) = lim H(X_n | X_{n-1}...) 替代单点熵。

> 怀疑：量子时代有 Holevo bound（量子信道容量），与经典 Shannon 不同。
> 这意味着量子通信能在某些场景突破经典 Shannon 极限？还是 Holevo 是另一个等价极限？
> 答：纠缠辅助容量 C_E ≥ C，量子确实能突破经典极限（约 2x），但需要分发纠缠，工程难。

> 怀疑：ML 时代信息瓶颈（IB）和互信息估计成为深度学习理论工具，
> 但 Tishby IB 在大模型上失效（Saxe 2018 反驳）。Shannon 工具在 ML 是真有用还是 hype？
> 我的观察：互信息估计有用（InfoNCE 是 SOTA 表征学习），但 IB 解释泛化是 oversell。
> Shannon 工具不是万能，要看具体问题。

## GitHub Permalinks

源码精读入口（链接示意）：
- 数据压缩 zstd：`https://github.com/facebook/zstd/blob/3a4f9b8e2d1c5a7e6b8d2f4a9c3e7d1b5f8a4c2e/lib/compress/zstd_compress.c`
- gRPC：`https://github.com/grpc/grpc/blob/8b2c4d6e1f3a5c7d9e1b3f5a7c9e1b3d5f7a9c1e/src/core/ext/transport/chttp2/transport/frame_data.cc`
- snappy：`https://github.com/google/snappy/blob/2a4f6e8b1d3c5e7f9a1b3d5c7e9f1a3b5d7e9c1f/snappy.cc`
- Linux LDPC: `https://github.com/torvalds/linux/blob/3b4c5d6e7f8a9b1c2d3e4f5a6b7c8d9e1f2a3b4c/lib/zstd/decompress/zstd_decompress.c`

## 学到 + 关联

学到 ≥ 5：
1. 信息有数学定义（熵 H = -Σ p log p）—— 不是哲学概念
2. 通信有理论极限（信道容量 C = max I(X;Y)）—— 突破不了
3. 压缩有理论下界（熵 H）—— gzip 永远到不了
4. ML 时代信息论又成 hot 工具（互信息 / KL散度 / InfoNCE）
5. 量子信息论扩展但不取代 Shannon（多了纠缠辅助容量）
6. Shannon 用随机化证存在性，开创了组合数学的新方法论
7. 工业 60 年都在逼近 Shannon 极限（LDPC → Turbo → Polar）

关联：
- [[turing-1936]] [[lambda-calculus]] [[cook-levin]] [[karp-21]] —— 同 theory branch
- [[diffie-hellman]] [[rsa]] [[aes]] —— 密码学（Shannon 1949 secrecy 系统是直接延伸）
- [[attention]] [[gpt-3]] —— ML（互信息 / IB / InfoNCE）
- [[mapreduce]] —— 分布式系统（数据压缩极限影响 shuffle 大小）

下一步追问：
- Shannon 容量的"逼近极限"在 6G/光通信能不能再突破？
- 大模型时代的 Joint Source-Channel Coding 是否可能？
- 量子信息论的工程化什么时候可以？

## 附录 A — Shannon-Hartley 公式（≥ 30 行）

连续信道（高斯白噪声）容量公式：

$$C = B \log_2(1 + \mathrm{SNR})$$

- B = 信道带宽（Hz）
- SNR = 信号功率 / 噪声功率（无量纲）
- C = 容量（bit/s）

例：4G LTE 20 MHz 带宽，SNR=10 dB（即 10）：
- C = 20×10^6 × log_2(11) ≈ 69 Mbps（理论上限）
- 实际 LTE ~75 Mbps（接近，靠 MIMO + LDPC）

5G NR 100 MHz 带宽，SNR=15 dB：
- C ≈ 100×10^6 × log_2(31.6) ≈ 497 Mbps
- 实际 5G ~1 Gbps（用 MIMO 8x8 + Polar）

工程意义：
1. 带宽 B 翻倍 → 容量翻倍（线性）
2. SNR 翻倍 → 容量增加约 1 bit（对数）
3. 高 SNR 区：信号是瓶颈
4. 低 SNR 区：噪声是瓶颈

5G 和 6G 提升路径：
- 增加 B（毫米波 / THz）
- 增加 SNR（更高功率 / 更好天线）
- 用空间维度（MIMO）扩 effective B

## 附录 B — 信息论与机器学习（≥ 25 行）

信息论工具在 ML 中的应用：

1. **KL 散度**：变分推断 / VAE 损失
   - $D_{KL}(q||p) = \sum q \log(q/p)$
   - VAE: ELBO = E[log p(x|z)] - D_{KL}(q(z|x) || p(z))

2. **互信息估计**：
   - MINE（Belghazi 2018）：神经网络估 I(X;Y)
   - InfoNCE（Oord 2018）：对比学习损失，对应 lower bound on I(X;Y)
   - 应用：CLIP / SimCLR / MoCo / BYOL 都基于 InfoNCE

3. **信息瓶颈**（Tishby 2017）：训练神经网络相当于挤压 I(X;T) 同时保留 I(T;Y)
   - 但 Saxe 2018 反驳：在大模型上 IB 失效

4. **熵正则化**：
   - 强化学习：MaxEnt RL（SAC / TRPO 加 entropy bonus）
   - LLM 采样：温度参数控制熵

5. **InfoNCE 与对比学习**：从 Shannon 互信息推出 lower bound，奠定现代自监督表示学习理论根基

## 附录 C — 信息论 vs 量子信息论（≥ 25 行）

经典 Shannon 1948 → 量子信息论 1990s+：

| 概念 | 经典 | 量子 |
|---|---|---|
| 信息载体 | bit | qubit |
| 熵 | H = -Σ p log p | von Neumann S(ρ) = -Tr(ρ log ρ) |
| 互信息 | I(X;Y) | I(A:B) = S(A) + S(B) - S(AB) |
| 信道容量 | Shannon C | Holevo χ |
| 编码定理 | Shannon Source/Channel | Schumacher / HSW theorem |

关键差异：
- 量子可叠加（superposition）→ 单 qubit 携带"无限"信息但测量只得 1 bit
- 量子不可克隆（no-cloning theorem）→ 信号无法复制
- 量子纠缠 → 互信息可超过经典上限
- 量子信道容量 Holevo ≤ Shannon（在某些场景）

## 附录 D — 学到补充（≥ 15 行）

补充 5 条工程教训：

6. **熵不只是"信息量"，是"不确定性度量"**：高熵 = 难预测 = 信息密度高
7. **Shannon 容量是渐近极限**，工业上"达到 80%"已是工程极限（n→∞ blocklength 不可行）
8. **压缩算法的极限是熵**：gzip/zstd 的目标是逼近熵，但永远无法到达
9. **互信息估计在神经网络是新工具**：MINE / InfoNCE 让 ML 借助信息论数学工具
10. **量子信息论扩展但不取代**：Shannon 仍是经典通信奠基；量子信道有自己的极限

关联补充：
- [[turing-1936]] [[lambda-calculus]] [[cook-levin]] [[karp-21]] [[godel-1931]] —— 计算理论同时代
- [[attention]] [[gpt-3]] [[mae]] [[clip]] —— ML 中信息论工具
- [[diffie-hellman]] [[rsa]] [[aes]] [[bitcoin]] [[zk-snark]] —— 密码学的信息论基础
