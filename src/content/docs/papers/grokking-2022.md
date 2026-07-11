---
title: Grokking — 训练 loss 早归零，几千步后才突然学会
来源: 'Power et al., "Grokking: Generalization Beyond Overfitting on Small Algorithmic Datasets", arXiv 2201.02177, 2022'
日期: 2026-06-01
分类: 机器学习
难度: 中级
---

## 是什么

**Grokking** 是 OpenAI 2022 年的一篇短论文报告的一种诡异训练现象：

在小规模算术任务（比如"算 a + b mod 97"）上训练一个小 Transformer，会看到：

- 训练 loss 早就降到 0（看着像完全过拟合）
- 验证 loss 长时间停在"随机猜"水平
- 继续训练 10 倍、100 倍、甚至 1000 倍的步数后……
- 验证 loss 在一段很短的窗口里**突然崩塌**，模型从"瞎猜"一夜变成"100% 正确"

日常类比：你看一个学生背了一万道题，每道都能答出来，可换稍微改个数就完蛋。你心想"算了背书的"。结果你又让他刷了一万倍的题，某一天他忽然开窍，不仅会做新题，**还能讲清楚规律**。这就是 grokking——"硬背 → 真懂"的相变。

英文动词 *grok* 来自科幻小说，意思"完全理解到融会贯通"。

## 为什么重要

不理解 grokking 这件事，下面这些直觉都会出错：

- "验证 loss 不降就该早停"——grokking 反例：早停你永远看不到泛化
- "训练 acc = 100% 就是过拟合"——错，可能只是处于"记忆阶段"，再练下去会突然懂
- "神经网络训练是单调收敛过程"——错，存在**相变**，loss landscape 上有跳跃
- 机制可解释性（mechanistic interpretability）整个领域把 grokking 当作头号实验玩具——因为它**可复现、可控、内部电路能拆开看**

## 核心要点

论文的实验装置极其简单：

1. **任务**：模 p 加法、模 p 减法、群运算等"算术表"任务。比如 p = 97，输入 (a, b) 输出 (a + b) mod 97
2. **模型**：2 层 Transformer，几十万参数
3. **数据切分**：train/val 比例从 30% 到 80% 不等
4. **优化器**：AdamW（论文发现 **weight decay 对数据效率帮助极大**；著名延迟泛化图也可用无 wd 的 Adam 跑很久才出现）

观察到三件事：

1. **训练 loss 在前几千步降到 ~0**，模型看似在"背"训练集
2. **验证 loss 在前几千到几十万步纹丝不动**，停在随机水平
3. **某一刻验证 loss 突然崩塌**，模型在很短一段步数内学会泛化

三个关键变量：

- **weight decay**：极有效。大幅减少"要多少数据才能泛化"；关掉后模型更容易停在记忆解（后续工作如 Omnigrok 把这点讲得更死）
- **数据比例**：越小越延迟。30% 数据可能要 100 万步才 grok
- **任务难度**：越复杂的运算（如群操作）grok 来得越晚

## 实践案例

### 案例 1：典型 grokking 曲线

```
step      train_acc    val_acc
1k        50%          1%        ← 还没学会记忆
10k       100%         1%        ← 已记忆训练集，但完全不泛化
100k      100%         1%        ← 仍然不泛化（这里很多人会早停）
500k      100%         5%        ← 开始有迹象
600k      100%         95%       ← 突然学会
700k      100%         100%      ← 完全 grok
```

注意 100k → 600k 这段——验证 loss 几乎平的——是 grokking 最反直觉的部分。**朴素早停策略到这里就放弃了，永远看不到后面的相变。**

### 案例 2：weight decay 如何改变数据效率

```
配置                          典型结果（论文/复现经验）
AdamW, wd=1.0                 更少数据、更早泛化
AdamW, wd=0.1                 仍可 grok，往往更晚
Adam / AdamW, wd=0            仍可能 grok，但常要多得多的步数；小数据上更容易停在记忆解
```

直觉解释：weight decay 是个"压力"，把权重往小的方向推。模型的"记忆解"权重更杂乱，"泛化解"权重更结构化（更小的范数）。weight decay 给模型一个**朝泛化解滑过去的动力**——所以论文说它"特别有效"，而不是"唯一开关"。

可以把训练动力学想成一座山谷：

- **记忆解**：山谷里的一个小坑。权重大、形状乱，但 train loss = 0
- **泛化解**：另一个更深更平的坑。权重小、结构清晰，train loss = 0 而且 val loss = 0

没有足够正则时，模型一旦掉进记忆解的小坑，就可能在外面看起来像"永远过拟合"。weight decay（以及小 batch 噪声等）像一只手，把模型慢慢推出去。整个滑动过程在外部看就是 grokking 的"突然顿悟"。

### 案例 3：grokking 之后模型在算什么

Nanda 等人 2023 年的后续工作 *Progress measures for grokking via mechanistic interpretability* 把 grok 后的网络拆开，发现：

- 模型在做 **modular addition** 任务时学到的不是查表
- 而是把数字嵌入到一个"圆"上（离散傅里叶基），用三角恒等式：
  `cos(a) cos(b) - sin(a) sin(b) = cos(a + b)`
- 这是一个**真正的算法电路**，不是记忆

也就是说，grokking 不只是"延迟泛化"，它是模型从**记忆电路**切换到**算法电路**的过程。

Nanda 还给出了一个**进度度量**（progress measure）——一个能在验证 acc 还是随机水平时就预测"快 grok 了"的内部信号。他追踪傅里叶基系数的稀疏度：训练初期所有频率都活跃（记忆），grok 临近时少数几个频率开始主导（电路在凝聚），相变完成时只有这几个频率的成分。这意味着相变并非真的"突然"——只是用 val acc 看不到，**用电路结构看，过程是连续凝聚的**。

## 踩过的坑

1. **早停会让你完全错过 grokking**。看到 val loss 不降就停，你看到的永远是"过拟合"假象
2. **复现 grokking 不简单**：超参敏感。weight decay、学习率、数据比例都得对，差一点就观察不到
3. **不要把 grokking 推广到所有任务**：论文实验都在小算术任务上，大模型上是否有同类现象仍在研究中（"延迟泛化"在 LLM 上确实出现过，但机制是否一致不清楚）
4. **train acc = 100% 不是终点**——这个观念要彻底改
5. **batch size 影响也很大**：小 batch 噪声大，反而对 grokking 有利；大 batch 训练稳定但更难看到相变。论文里没系统研究，但社区复现帖普遍报告这一点
6. **不要混淆 grokking 和 double descent**：double descent 描述的是模型容量与泛化误差的非单调关系，grokking 描述的是**训练步数**维度上的非单调关系。两者都是"非单调"，但坐标轴完全不同

## 适用 vs 不适用场景

**适用（当作研究/教学工具时）**：
- 研究神经网络训练动力学的相变
- 机制可解释性入门——拆 Transformer 学到的电路
- 反驳"验证 loss 不降就过拟合"的朴素观点
- 教 weight decay 不只是正则化，而是塑形优化路径

**不适用（当作实践指南时）**：
- 不要在生产训练里"等 grokking"——大模型训练成本不允许
- 不要把 grokking 当成"万能延迟泛化"——它对任务、模型大小、超参极敏感
- 不要从 grokking 推断 LLM 涌现能力——两者机制是否同源仍在争论

## 历史小故事（可跳过）

- **2022 年 1 月**：OpenAI 团队（Power, Burda, Babuschkin, Edwards, Misra）在 ICLR 2022 MATH-AI workshop 投了这篇短文。论文不长，几个图，但震撼了机器学习社区。最先在 Twitter 上传开的就是那张"训练 acc 早早 100%、验证 acc 几十万步后才跳到 100%"的折线图
- **2022-2023**：grokking 成为机制可解释性领域的"果蝇"——可复现、可控、可拆开。Anthropic、DeepMind、独立研究者纷纷在它上面做实验
- **2023 年**：Neel Nanda 等人发表 *Progress measures for grokking via mechanistic interpretability*，把 grok 后的电路完全拆开，证明模型学的是离散傅里叶变换。这成为机制可解释性领域最经典的成功案例之一
- **2024-2025**：grokking 被推广到更复杂任务（多步推理、组合泛化），并与 deep double descent、neural scaling laws 等现象相互映照。也有研究开始追问"大模型上的涌现能力"是不是宏观尺度的 grokking——尚无定论

## 学到什么

1. **训练 loss 和泛化能力之间不是单调关系**——存在跳跃式相变
2. **weight decay 不只是防过拟合，它在塑造优化路径**——常决定模型更快滑向泛化解，还是长时间停在记忆解
3. **小玩具任务能驱动大问题**：grokking 是一个 50 行代码就能复现的现象，但它撬动了整个机制可解释性领域
4. **早停是个会骗人的启发**：在 grokking 场景下，朴素早停让你永远看不到模型真正学懂的那一刻
5. **"看不见的进度"是真的存在**：val 曲线纹丝不动时，模型内部可能正在悄悄重组电路。这逼着研究者去找新的内部进度信号，而不是只盯外部 loss

## 延伸阅读

- 论文 PDF：[Power et al. 2022 — Grokking](https://arxiv.org/abs/2201.02177)（短文，10 页内）
- 后续机制拆解：[Nanda et al. 2023 — Progress measures for grokking](https://arxiv.org/abs/2301.05217)
- 视频解读：[Neel Nanda — A Mechanistic Interpretability Analysis of Grokking](https://www.youtube.com/watch?v=ob4vuiqG2Go)
- 自己复现：[Nanda 的 colab notebook](https://colab.research.google.com/github/neelnanda-io/Easy-Transformer/blob/main/Grokking_Demo.ipynb)（一个 GPU 跑几小时就能看到相变）
- [[anthropic-circuits]] —— grokking 是机制可解释性领域的核心实验玩具
- [[adamw-2017]] —— AdamW 的 weight decay 是 grokking 实验里提升数据效率的关键旋钮

## 关联

- [[anthropic-circuits]] —— grokking 之后用电路分析能拆出 Transformer 学到了什么算法
- [[adamw-2017]] —— weight decay 是 grokking 实验里提升数据效率的关键旋钮，论文反复对比
- [[attention]] —— grokking 实验用的就是小 Transformer，attention 头是被分析的主要对象
- [[scaling-laws]] —— 同样研究"训练曲线"形状，但 scaling laws 是平滑的，grokking 是跳跃的，两者互补
- [[adam-2014]] —— Adam 与 AdamW 的差别就在 weight decay 的实现位置，而 weight decay 是 grokking 的关键超参

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
