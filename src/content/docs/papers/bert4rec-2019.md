---
title: BERT4Rec — 把 BERT 的 MLM 搬进序列推荐做双向建模
来源: 'Sun et al., "BERT4Rec: Sequential Recommendation with Bidirectional Encoder Representations from Transformer", CIKM 2019'
日期: 2026-05-31
分类: 推荐系统
难度: 中级
---

## 是什么

**BERT4Rec** 是 Sun Fei 等 2019 年的论文，把 [[bert]] 的 **Masked Language Model（MLM）** 任务原样搬到序列推荐上。

日常类比：你刷电商，最近 50 次点击是一串"键盘 → 键帽 → 蓝牙耳机 → 跑鞋 → 跑鞋 → 跑步袜"。[[sasrec-2018]] 让模型站在最后一件回头看，**只能看左边**（因果 mask）。BERT4Rec 把这个限制撕掉——随机盖住中间几件（比如把"蓝牙耳机"换成 `[mask]`），让模型**同时看左右两边**还原它。这就是 BERT 在 NLP 里干的事，搬到推荐序列上一字不改。

一句话：把"预测下一项"换成"预测被盖住的任意项"，再让 attention 双向跑。

## 为什么重要

不理解 BERT4Rec，下面这些事都没法解释：

- 为什么 2019 年之后推荐论文开始大量出现 `[mask]` 训练目标——cloze 任务从 NLP 跨进推荐只隔了一年
- 为什么"推荐与 NLP 范式互通"成了显学——同一个 Transformer encoder + 同一个 MLM 损失，换个 token 词表（item ID 替换 word ID）就能跑
- 为什么后来 S3Rec / UniSRec / P5 / Recformer 一路把对比学习、prompt、instruction tuning 全搬进推荐——BERT4Rec 是第一块跨界的基石
- 为什么 2022 年又冒出"SASRec 其实没输 BERT4Rec"的复现争议——这一篇方法论上漂亮，但工程结论被质疑

引用数 2000+，是序列推荐近 5 年最常见的对照基线之一。

## 核心要点

BERT4Rec 在三件事上跟 SASRec 不同：

1. **去掉 causal mask**：SASRec 位置 t 只看 1..t-1，BERT4Rec 让每个位置看完整序列两侧。**为什么敢这样？** 训练时输入序列里有 `[mask]` 占位，模型不会"偷看到"它要预测的目标——目标已经被换成 mask 了。

2. **Cloze 训练目标**：随机选 ρ（默认 15%-20%）比例的位置替换为 `[mask]`，模型只对这些被 mask 的位置算 cross entropy。**和 next-item 预测的差别**：如果只拿最后一步做训练，cloze 会给更多监督；如果像 SASRec 那样每个位置都做下一项预测，两者都能产多个信号，真正差别是 BERT4Rec 的被 mask 位置可以同时利用左右上下文。

3. **推理时追加 `[mask]`**：训练目标是"还原被盖住的任意位置"，但推理要的是"下一项是什么"。论文做法：把用户序列末尾追加一个 `[mask]` token，整个序列过一遍 encoder，取末位输出和所有 item embedding 点积——分数最高的就是预测。这是 cloze 训练 + next-item 推理的桥梁。

整套结构等价于："BERT encoder 原封不动 + 输入 token 改成 item ID + 输出层对 item 词表做 softmax"。

## 实践案例

### 案例 1：训练一步在做什么

```
原序列：  i1  i2  i3  i4  i5  i6  i7  i8
随机盖：  i1  i2  [M] i4  i5  [M] i7  i8
模型预测 [M] 位置：
  位置 3 → P(i3)=0.71, P(其他 item)=...
  位置 6 → P(i6)=0.55, P(其他 item)=...
loss = -log P(i3 at pos 3) - log P(i6 at pos 6)
```

模型必须**同时**看左边 `i1 i2` 和右边 `i4 i5 i7 i8` 才能定位被盖住那两项是什么。这一来梯度信号比 SASRec 单向密集得多。

### 案例 2：推理阶段怎么变成"预测下一项"

```
用户真实序列：i1 i2 i3 i4 i5 i6
推理输入：    i1 i2 i3 i4 i5 i6 [M]   ← 末尾追加 mask
encoder 一次前向 → 取最后一位（[M] 位置）的 hidden
hidden . item_emb 全表点积 → top-K
```

训练时 mask 在中间任意位置，推理时强行放末尾——分布有偏移，但实测效果可接受。后来工作改成"训练阶段也保留一定比例 mask 在末尾"以贴合推理（例如 BERT4Rec 自己就有 mask-last 的训练策略变种）。

### 案例 3：和 SASRec 在数据流上的对比

```
SASRec：每个用户序列长度 N → N-1 个监督信号（下一项预测，causal）
BERT4Rec：每个用户序列长度 N → ρ·N 个监督信号（cloze，双向）
ρ=0.2, N=200 时，BERT4Rec 单序列产 40 个信号，SASRec 199 个（看似多但每个 loss 只用 1 个负样本）
```

注意：SASRec 单序列虽然信号多，但每位置 loss 是 BCE 一对一负采样；BERT4Rec 是 softmax 全词表（或大批量负采样）——单信号信息量不一样，不能光数数。

## 踩过的坑

1. **Petrov 2022 复现争议**：[A Systematic Review and Replicability Study of BERT4Rec](https://arxiv.org/abs/2207.07483) 指出 BERT4Rec 在论文里赢 SASRec 主要因为**训练步数比 SASRec 多 10 倍**——把 SASRec 训等量步数后两者基本打平。这不否定 cloze 思路，但提醒"看论文别只看 HR/NDCG 数字"。

2. **mask 比例 ρ 难调**：原论文给 0.2，但短序列（< 20）用 0.2 等于盖掉 4 个，模型上下文太稀。短序列建议 ρ=0.15 或更低；长序列（> 200）可以 0.3。这是个长度敏感超参。

3. **训练 vs 推理分布不一致**：训练时 mask 散落各处，推理时只在末尾——位置嵌入学到的"末尾长什么样"和训练分布有差。一些后续工作通过"把最后一位也以一定概率纳入训练 mask 集合"缓解。

4. **item 词表巨大时 softmax 太贵**：BERT 词表 30k，推荐 item 经常 100 万级。原论文用 sampled softmax；工业落地常配 in-batch negatives 或层次 softmax。

5. **位置嵌入用可学习还是相对位置**：原文用可学习绝对位置嵌入，对长序列泛化差；TiSASRec 风格的"时间间隔"位置嵌入对 BERT4Rec 同样适用，是常见改进。

## 适用 vs 不适用场景

**适用**：
- 中等长度（50-500）用户行为序列建模，且数据量足够支撑双向建模
- 想用 NLP 预训练范式做推荐预训练（先 cloze 预训练，再下游 finetune）
- 离线指标场景，论文复现或基线对比

**不适用**：
- 严格在线 next-item 预测且训练预算紧——SASRec 单向更省，效果接近
- 极短序列（< 10）→ mask 后剩不下几个 token，cloze 任务退化
- 召回阶段百万级候选打分 → 用双塔 [[youtube-two-tower-2019]] 类结构
- 需要时间敏感建模 → 配 TiSASRec 风格时间间隔嵌入

## 历史小故事（可跳过）

- **2017 年 6 月**：[[attention]] 论文发表，Transformer encoder + decoder
- **2018 年 10 月**：BERT 把 Transformer encoder + MLM 推到 NLP 王座
- **2018 年 8 月**：[[sasrec-2018]] 把 Transformer decoder + causal mask 推到序列推荐
- **2019 年 4 月**：Sun 等在 Alibaba 把 BERT 直接套到序列推荐——BERT4Rec
- **2022 年 7 月**：Petrov & Macdonald 发表系统复现，质疑 BERT4Rec 优势主要来自训练量

至 2026 年这两条路线（单向因果 vs 双向 cloze）仍在序列推荐论文里并行存在。

## 学到什么

1. **范式跨域复用**：NLP 的 MLM 不是 NLP 专属——只要序列里"被盖住的项"和"上下文"这种结构存在，cloze 就能用
2. **训练目标决定梯度密度**：next-item 1 个信号 vs cloze ρ·N 个，但单信号信息量不同；选哪个看数据量和稀疏度
3. **训练-推理分布对齐**：cloze 训练 + next-item 推理本身就有偏，论文常给个工程补丁——这种"补丁式 trick"是范式跨域时的典型代价
4. **方法论新 ≠ 实证赢**：Petrov 复现提醒看论文要分清"思路新颖性"和"实验对照公平性"，两者经常被论文写作混在一起
5. **推荐与 NLP 互通是双向的**：BERT4Rec 之后是推荐借 NLP，再后来有人把推荐里的"用户兴趣建模"反过来启发 NLP 个性化生成

## 延伸阅读

- 原论文 PDF：[BERT4Rec arXiv](https://arxiv.org/abs/1904.06690)
- 官方 TensorFlow 实现：[FeiSun/BERT4Rec](https://github.com/FeiSun/BERT4Rec)
- 复现争议：[Petrov & Macdonald 2022](https://arxiv.org/abs/2207.07483)（必读，搞清楚 BERT4Rec 真实战力）
- PyTorch 复现：RecBole 框架内置实现，社区常用
- [[bert]] —— BERT4Rec 的母模型，理解 MLM 与双向编码
- [[sasrec-2018]] —— 单向因果对照组，必须配套读

## 关联

- [[bert]] —— BERT4Rec 的训练目标（MLM/Cloze）和 encoder 直接搬自 BERT
- [[sasrec-2018]] —— 同样基于 Transformer 的序列推荐，单向 causal 对照
- [[attention]] —— self-attention 公式两者共用
- [[gru-2014]] —— 上一代 RNN 序列推荐主力，BERT4Rec 间接对手
- [[wide-deep-2016]] —— 推荐范式的上一代基础结构
- [[youtube-two-tower-2019]] —— 召回阶段双塔，与 BERT4Rec 精排互补

## 一句话总结

**把 BERT 的 encoder + MLM 整套搬到序列推荐——撕掉 SASRec 的 causal mask 让 attention 双向，把 next-item 预测换成 cloze 任意位置预测**。这是"NLP 范式跨域到推荐"的标志性一步：论文方法论漂亮、训练信号密度高，但 2022 年复现指出实证优势主要来自训练步数；从此推荐领域学会大量借用 NLP 预训练范式，但也学会用更严格的对照实验衡量它们。

## 一行公式速查

```
loss = - sum_{t in masked} log P(i_t | i_{<t}, i_{>t}, theta)
推理：append [mask] at end → encoder → hidden_last . item_emb_table → top-K
```

读法：训练时只对被 mask 的位置算交叉熵，每个位置的预测概率由序列两侧（不包括自己）的双向 attention 输出决定；推理时在序列末尾追加一个 mask token，过一次 encoder，取末位 hidden 与全 item 表点积取 top-K。

## 一个常见误解

很多新人读完会以为"双向一定优于单向"。这条结论在 NLP 任务（理解类，如分类、问答）成立，但**在序列推荐里不一定**：推荐本质是"用过去预测未来"，未来交互在训练时是已知的，所以可以让模型双向看；但模型学到的"双向上下文表示"对"预测下一项"这一具体任务到底有没有增益，要看数据稀疏度、序列长度、训练预算三件事。Petrov 2022 的复现就是在指这一点——双向不是免费午餐。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）
