---
title: SASRec — 用 Transformer 的 self-attention 替 RNN 做下一步推荐
来源: 'Kang & McAuley, "Self-Attentive Sequential Recommendation", ICDM 2018'
日期: 2026-05-31
分类: 推荐系统
难度: 中级
---

## 是什么

**SASRec（Self-Attentive Sequential Recommendation）** 是 Wang-Cheng Kang 和 Julian McAuley 2018 年的论文，把 Transformer 的 **self-attention** 第一次完整搬到序列推荐里。

日常类比：你刷淘宝，最近 50 次点击是一串"键盘 → 键帽 → 蓝牙耳机 → 跑鞋 → 跑鞋 → 跑步袜"。系统要预测你**下一次会点什么**。老办法（GRU4Rec）让一个 RNN 像传话游戏一样从第 1 件传到第 50 件，慢且容易遗忘前面。SASRec 让你**站在最新一件回头扫一遍**——每一件按"和当前位置多相关"加权汇总，再预测下一件。

一句话：把"读你最近 N 次行为"从 RNN 顺序展开换成 attention 一次并行。

## 为什么重要

不理解 SASRec，下面这些事都没法解释：

- 为什么 2018 之后序列推荐论文几乎全用 attention，GRU4Rec 退成历史基线
- 为什么 BERT4Rec / SSE-PT / TiSASRec / FMLP-Rec 全把 SASRec 当起点——它定义了"item embedding + 位置 embedding + self-attention block + 点积打分"这套范式
- 为什么 self-attention 同年从 NLP（Transformer）跨进推荐，论文之间只隔 1 年——同一套 Q/K/V 换个输入照样跑
- 为什么训练比 GRU4Rec 快 11 倍——RNN 必须按时间顺序展开，attention 一次矩阵乘搞定全部位置

## 核心要点

SASRec 的核心可以拆成 **三块**：

1. **输入层**：取用户最近 N 个交互 item，每个 item 查一个 embedding，再加一个**位置 embedding**（标记"这是倒数第几次"）。这是 Transformer 标配，但推荐场景里位置很重要——RNN 用顺序自动带上，attention 没顺序就要手动注入。

2. **self-attention block × b 层**：每层做 multi-head self-attention（多组注意力并行再拼）+ 残差 + LayerNorm（把向量尺度拉齐）+ 前馈网络。**关键是 causal mask**：位置 t 只能看 1..t（含自身），不能偷看 t 之后——这叫**单向**。原始 Transformer encoder 是双向的，SASRec 砍掉一半保留因果。

3. **预测层**：取最后一个位置的输出向量，和**所有候选 item 的 embedding** 做点积，分数最高那个就是预测的下一个。Loss 用 BCE（二分类交叉熵：把「是不是下一项」当成对/错题来训）：每个位置用 1 个真实下一项 + 1 个负采样 item。

整套结构去掉了 Transformer 的 encoder-decoder 架构，只留 decoder 风格——和后来 GPT 的思路同源。

## 实践案例

### 案例 1：和 GRU4Rec 的对比

GRU4Rec（Hidasi 2016）用 GRU 顺序读 item，第 50 步的 hidden 还要"记得"第 1 步的信息——稀疏数据上记不住。

SASRec 用 attention 让第 50 个位置直接和第 1 个位置算点积——**距离再远关系也只隔一次乘法**。Beauty / Games 数据集上 Hit at 10 提升 6%-19%，MovieLens-1M 这种稠密数据更明显。

### 案例 2：训练速度差距

```
N=200 序列长度
GRU4Rec：必须 t=1 → 2 → ... → 200 串行，每步等上一步
SASRec： 一次矩阵乘 [N, d] x [d, N] 算出全部位置，并行
```

论文实测 SASRec 训练每 epoch 比 GRU4Rec 快约 **11 倍**，这是 attention 在长序列上对 RNN 的结构性优势。

### 案例 3：causal mask 是怎么写的

```
attention_score[t, j] = q[t] . k[j] / sqrt(d)
if j > t: attention_score[t, j] = -inf   # 屏蔽未来
attention_weight = softmax(attention_score)
```

把"未来位置"的分数置为负无穷，softmax 后权重为 0——位置 t 的输出只由 1..t 的 value 加权得到。这一行代码把"双向 Transformer"变成"单向 SASRec"。

### 案例 4：从训练到打分的一条龙

训练阶段，对每个用户的序列 `[i1, i2, ..., iN]` 同时拿到 N-1 个监督信号：

```
输入位置 1..N-1 → 预测位置 2..N
位置 t 的 loss = -log sigmoid(score(it+1)) - log(1 - sigmoid(score(neg_t)))
```

推理阶段只取最后一个位置的输出，与全 item 表点积取 top-K——一次前向同时拿到训练监督和打分能力，工程上非常省。

## 踩过的坑

1. **单向 vs 双向之争**：BERT4Rec（Sun 2019）次年把 SASRec 改成双向 + cloze 任务（随机 mask 中间 item），声称更优。但 2022 年 Petrov 复现指出：BERT4Rec 真正赢的是训练时间长，超参对齐后两者打平。SASRec 仍是首选基线。

2. **位置 embedding 用什么**：原论文用可学习的位置 embedding（不像 Transformer 原文的 sin/cos）。后续 TiSASRec 改成"两次交互的时间间隔"作为位置——稀疏长序列更适配。

3. **负采样数量**：原文每个正样本只配 1 个负样本，loss 是 BCE。后续工作改成 sampled softmax / in-batch negatives，效果更稳。

4. **N 设多大**：默认 N=50 或 200。太长稀疏数据反而下降——attention 也会被无关历史稀释。工业落地常用动态截断。

5. **embedding 共享 vs 独立**：item 输入 embedding 与输出打分 embedding 默认共享一份。共享省参数但耦合训练；独立更灵活但容易过拟合稀疏 item。两种都有论文支持。

6. **dropout 位置**：attention 权重、FFN、embedding 三处都需要——只加一处效果不显著。原论文给的默认值（0.2-0.5）对小数据集敏感，需调。

## 适用 vs 不适用场景

**适用**：
- 用户行为序列建模（电商、视频、新闻、音乐）
- 中等长度交互（50-500 步）
- 想用一份代码同时建短期和长期兴趣——attention 一视同仁

**不适用**：
- 极长序列（> 1000）→ 用 [[transformer-xl-2019]] / 线性 attention / 稀疏 attention
- 需要候选广告 attention（query-aware）→ 用 [[din-2018]]
- 冷启动新用户/新 item → SASRec 依赖历史，需配 [[wide-deep-2016]] 类宽特征
- 召回阶段（百万级候选打分）→ 用双塔 [[youtube-two-tower-2019]]，SASRec 更适合精排或重排

## 历史小故事（可跳过）

- **2017 年 6 月**：Vaswani 等发表 Transformer，self-attention 在机器翻译横扫
- **2017 年下半年**：GRU4Rec 与 Caser 是序列推荐主力，分别用 RNN 和 1D 卷积
- **2018 年 8 月**：Kang 在 UCSD McAuley 组实习，用同一套 attention 套到 Amazon Reviews 序列上，发现稀疏数据比 GRU4Rec 强很多——投 ICDM 2018
- **2019 年**：Sun 等把单向改双向得到 BERT4Rec，两者并列成为序列推荐黄金基线
- **2020-2024**：TiSASRec / SSE-PT / S3-Rec / FMLP-Rec / LinRec 全部基于 SASRec 范式

至 2026 年被引超 3000，序列建模在精排重排两个环节里基本都借了 SASRec 骨架。

## 学到什么

1. **Q/K/V 范式跨域复用**：NLP 的 attention 换个输入直接跑推荐——结构本身和领域无关
2. **单向 mask 是因果性的代价**：推荐天然有时间方向，未来交互一漏即 leak；这一行 mask 决定整个模型能不能上线
3. **并行 vs 顺序**：RNN 的串行依赖是训练瓶颈，attention 用矩阵乘换内存换并行——长序列尤其值
4. **简化即创新**：SASRec 比 Transformer 砍了一半（去 encoder、去 cross-attention），但在新场景立住了；不是所有创新都靠加复杂度
5. **位置嵌入决定时序敏感度**：把"顺序"显式注入而不是依赖结构本身——这套思路后来在 ViT / Whisper 等同样跨域工作里反复出现

## 延伸阅读

- 原论文 PDF：[Self-Attentive Sequential Recommendation](https://arxiv.org/abs/1808.09781)
- 官方实现：[kang205/SASRec](https://github.com/kang205/SASRec)（TensorFlow，参考价值高）
- PyTorch 复现：[pmixer/SASRec.pytorch](https://github.com/pmixer/SASRec.pytorch)（社区常用）
- 后续对比：[Petrov & Macdonald 2022 — A Systematic Review and Replicability Study of BERT4Rec](https://arxiv.org/abs/2207.07483)
- 时间间隔扩展：[TiSASRec — Time Interval Aware Self-Attention](https://dl.acm.org/doi/10.1145/3336191.3371786)
- [[attention]] —— SASRec 的母引擎
- [[gru-2014]] —— SASRec 要替代的对照组所用 RNN 单元

## 关联

- [[attention]] —— self-attention 公式 SASRec 直接搬来用
- [[gru-2014]] —— GRU4Rec 的底层结构，SASRec 的对照组
- [[din-2018]] —— 同年另一种 attention 用法：query-aware 而非 self
- [[wide-deep-2016]] —— 推荐范式的上一代基础结构
- [[youtube-two-tower-2019]] —— 召回阶段的双塔结构，与 SASRec 互补
- [[transformer-xl-2019]] —— 处理超长序列的 attention 改进，可接 SASRec 后端

## 一句话总结

**把 Transformer decoder 砍下来贴到推荐序列上，加一个 causal mask 防止看未来——靠并行训练把 RNN 时代的 GRU4Rec 在准度和速度两条线同时打穿，自此序列推荐进入 attention 时代**。这是"已有结构换新场景"的典型范式跨域案例：核心创新不在算法本身，而在敢于把它原样搬过来并完整跑通。

## 一行公式速查

```
score(i, t) = e_i . SelfAttn(causal_mask, e_{i_1}+p_1, ..., e_{i_t}+p_t)[t]
```

读法：把序列 t 之前的 item embedding 加位置 embedding 一起塞进带因果 mask 的多层 self-attention，取最后位置的输出向量，再和候选 item 的 embedding 点积——分数最高那一项是预测的下一次交互。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[attention]] —— Attention Is All You Need
- [[bert4rec-2019]] —— BERT4Rec — 把 BERT 的 MLM 搬进序列推荐做双向建模
- [[din-2018]] —— DIN — 让推荐模型按你看的广告决定该激活你哪段历史
- [[gru-2014]] —— GRU 2014 — 用两个门替代 LSTM 三个门，编码-解码范式登场
- [[transformer-xl-2019]] —— Transformer-XL — 让 Transformer 像 RNN 那样把上下文滚动传下去
- [[wide-deep-2016]] —— Wide & Deep — 让模型同时学会"记住"和"举一反三"
- [[youtube-two-tower-2019]] —— YouTube 双塔召回 — 把 DSSM 搬进推荐并补上两件工业关键

