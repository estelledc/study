---
title: Label Smoothing — 别让模型对正确答案过度自信
来源: Szegedy et al., "Rethinking the Inception Architecture for Computer Vision", CVPR 2016
日期: 2026-06-01
分类: 机器学习
难度: 入门
---

## 是什么

**Label Smoothing**（标签平滑，简称 **LS**）是一个改训练目标的小技巧：把"正确答案是第 3 类，概率 100%"改成"正确答案是第 3 类，概率 90%，剩下 10% 平均分给其他类"。

日常类比：考试老师改答案——以前只承认"标准答案"，现在告诉学生"这个答案最对，但其他选项也别完全否定，留点余地"。

数学上一行话：

```
原目标 q = [0, 0, 1, 0, 0]      # one-hot
平滑后 q* = [0.025, 0.025, 0.9, 0.025, 0.025]   # ε=0.1, K=5
```

ε 通常取 **0.1**，K 是类别数。然后用平滑后的 q* 跟模型输出算 cross-entropy。

## 为什么重要

这个 trick 表面看像随手一改，实际影响极大：

- **Transformer 论文 2017 直接引用**——`ε=0.1` 写进默认训练配方
- **多种后续大模型训练配方常采用**（机器翻译、部分 LM 预训练/SFT；并非每个 BERT/GPT 变体都"默认开启"）
- **2019 年 Hinton 团队论文**证明：LS 不只是正则，还能让模型**校准（calibration）**——输出 0.9 的概率时，真的有 90% 是对的，而不是 99% 是对的（过自信）
- 在大模型 RLHF / SFT 阶段也常见，用来避免模型对某个 token 钉死

不理解 LS，下面这些事都没法解释：

- 为什么 Transformer 训练 loss 看起来很高（PPL 不会降到极小）但 BLEU 反而更好
- 为什么 LLM 输出"我有 60% 把握"时常常真的是 60%，而不是嘴硬说 99%
- 为什么知识蒸馏的老师如果开了 LS，反而蒸不出好学生

## 核心要点

LS 可以拆成 **三个层面**理解：

1. **目标层**：把 one-hot 标签改成"主类 1-ε，其他类均分 ε"。一行代码：

   ```python
   q_smooth = (1 - eps) * q_onehot + eps / K
   ```

2. **损失层**：等价于在原 cross-entropy 上**加一个 KL 正则项**，逼 softmax 输出靠近均匀分布。推导：

   ```
   H(q*, p) = (1-ε) · H(q, p) + ε · H(u, p)
                ↑ 原 CE           ↑ 这项 = KL(u||p) + 常数
   ```

   翻译成人话：你不能让 logit 差距无限拉大，否则 H(u, p) 会爆炸。

3. **几何层**：原 one-hot 训练时，正确类的 logit 会被推到 +∞，错误类推到 -∞，logit 在高维空间形成"长矛"。LS 把这些"长矛"剪短，输出分布的几何结构变紧凑。

## 实践案例

### 案例 1：PyTorch 一行启用

```python
import torch.nn as nn
loss_fn = nn.CrossEntropyLoss(label_smoothing=0.1)
```

PyTorch 1.10+ 内置。1.10 之前要手写：

```python
def label_smooth_ce(logits, target, eps=0.1, K=None):
    K = K or logits.size(-1)
    log_p = torch.log_softmax(logits, dim=-1)
    nll = -log_p.gather(1, target.unsqueeze(1)).squeeze(1)
    smooth = -log_p.mean(dim=-1)
    return ((1 - eps) * nll + eps * smooth).mean()
```

### 案例 2：Transformer 配方为什么是 ε=0.1

Vaswani 2017 Table 3（En→De dev，base 模型）报告：

| ε | PPL（越低越好） | BLEU（越高越好） |
|---|----|------|
| 0.0 | 4.67 | 25.3 |
| **0.1** | **4.92** | **25.8** |

PPL 反直觉地"变差"了——因为 LS 让模型不再对正确 token 输出 99.9%，PPL 自然抬高。但 **BLEU 涨了**，说明翻译质量真的更好。这告诉我们：**PPL 不是越低越好，要看下游指标**。

### 案例 3：校准（calibration）改善

模型说"这张图 90% 是猫"时，真实正确率应该接近 90%，否则就是过自信。

| 训练方式 | ECE（校准误差，越小越好） |
|---------|------|
| 普通 CE | 0.064 |
| CE + LS (ε=0.1) | 0.024 |

数据来自 Müller-Kornblith-Hinton 2019 (CIFAR-100, ResNet-56)。LS 让 ECE 砍掉一半多。

## 踩过的坑

1. **ε 太大会欠拟合**：ε=0.3 时模型连训练集都拟合不好。一般 0.05~0.1 安全。

2. **小心和蒸馏一起用**：老师模型开了 LS 后，输出 logit 被压扁，"暗知识"（dark knowledge，错误类之间的相对大小）丢了，学生学不到细节。**做蒸馏时老师别开 LS**。

3. **和 mixup/cutmix 叠加效果不一定加**：mixup 本身就是一种隐式标签软化，再叠 LS 可能正则化过度。

4. **超大数据集帮助变小**：LS 像 dropout 一样，本质是抗过拟合的正则。当数据足够多（如 ImageNet-22k 全量），LS 增益从 0.5% 跌到 0.1%。

5. **PPL 看起来变差不是 bug**：上面案例 2 已说明，初学者第一次跑 LS 会以为代码写错。

## 适用 vs 不适用场景

**适用**：

- 大多数监督分类任务（图像、文本、语音）
- Transformer 训练（机器翻译、语言模型预训练）
- 中小数据集 + 大模型容量（容易过拟合的组合）
- 需要好校准的场景（不确定性估计、医疗诊断、金融风控）

**不适用**：

- 知识蒸馏的**老师端**（学生端可以开）
- 已经有强正则（mixup + cutout + 强增强）的训练
- 类别极不平衡时（LS 会把所有类拉向均匀分布，伤害少数类）
- 需要极致 PPL 的场景（如某些语言模型评测）

## 历史小故事（可跳过）

- **1995 年**：Bishop 在《Neural Networks for Pattern Recognition》提到"输入加噪 = 隐式正则"，思路很接近，但没具体到标签
- **2015 年 12 月**：Szegedy 等人放出 Inception v3 论文 (arxiv 1512.00567)，**主菜是新卷积架构**，LS 只在附录 §7 用半页解释
- **2016 年 CVPR**：论文正式发表，ImageNet 准确率 21.2% top-5 error，state-of-the-art
- **2017 年**：Vaswani 团队写 Transformer 论文，照搬 LS、ε=0.1，从此变成 NLP 默认
- **2019 年**：Müller-Kornblith-Hinton 在 NeurIPS 写《When Does Label Smoothing Help?》，**第一次系统证明 LS 改善校准但损害蒸馏**
- **2020 年起**：LS 成为许多大模型训练配方里的常驻开关（具体是否默认因模型/阶段而异）

附录里的小段子，最后影响了一整代大模型。

## 学到什么

1. **过度自信是隐藏成本**：one-hot 训练让模型"嘴硬"，LS 教它"留余地"——这是正则也是校准
2. **PPL/loss 不是越低越好**：要看下游任务和实际可靠性
3. **小修改可以走 10 年**：一个附录的 trick，被后人在不同场景反复印证
4. **正则 ≠ 校准**：dropout 是正则不一定校准好，LS 同时做到两件事
5. **trick 落地要看数据规模**：小数据帮助大，超大数据帮助小

## 延伸阅读

- 论文 PDF：[arxiv 1512.00567](https://arxiv.org/abs/1512.00567)（10 页正文 + 1 页 LS 附录）
- 必读后续：[Müller, Kornblith, Hinton 2019 — When Does Label Smoothing Help?](https://arxiv.org/abs/1906.02629)（NeurIPS，校准 vs 蒸馏权衡）
- PyTorch 文档：[`nn.CrossEntropyLoss(label_smoothing=...)`](https://pytorch.org/docs/stable/generated/torch.nn.CrossEntropyLoss.html)
- 视频：[Yannic Kilcher — Label Smoothing 解读](https://www.youtube.com/results?search_query=label+smoothing+yannic)（10 分钟版）

## 关联

- [[attention]] —— Transformer 原论文，把 LS 带进 NLP 默认配方
- [[dropout-2014]] —— 另一个经典正则，机制和 LS 互补但都属"小修改大影响"族
- [[batchnorm-2015]] —— 同样属于 Inception 时代落地的训练 trick
- [[adam-2014]] —— LS 通常和 Adam 一起用，调参经验互相影响
- [[resnet]] —— 同期视觉架构里程碑，也是 LS 第一批受益者

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[adam-2014]] —— Adam — 让深度学习自己挑步长的优化器
- [[attention]] —— Attention Is All You Need
- [[batchnorm-2015]] —— Batch Normalization — 把每层激活值规整到 0 均值 1 方差，深网训练时间砍成 1/14
- [[dropout-2014]] —— Dropout — 训练时随机关掉一半神经元，反而学得更好
- [[resnet]] —— ResNet — 残差连接

