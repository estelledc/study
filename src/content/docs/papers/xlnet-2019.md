---
title: XLNet — 把句子打乱顺序读，借此同时拿到 AR 和双向
来源: 'Yang et al., "XLNet: Generalized Autoregressive Pretraining for Language Understanding", NeurIPS 2019'
日期: 2026-05-31
分类: 机器学习
难度: 高级
---

## 是什么

XLNet 是 2019 年的一种语言模型预训练方法，核心思想叫**排列语言模型**（Permutation Language Modeling，PLM）。

日常类比：你要背一篇课文。GPT 的方式是从头读到尾（左→右），每次只能用前面已经读过的字猜下一个字。BERT 的方式是把课文里挖几个洞，让你看着上下文同时填这几个洞。XLNet 的方式更怪——它把这一句话的字顺序**全排列**一遍，每种排列都从头读到尾、每次猜下一个字。读得多了，每个字就在各种顺序下都被前面的字预测过——也就同时拿到了"自回归式"严谨建模 + "双向式"上下文覆盖。

它还顺手解决了 BERT 一个被低估的数学缺陷（下面会用反例说清）。

## 为什么重要

不理解 XLNet，下面这些事都没法解释：

- 为什么 BERT 的 `[MASK]` 不只是"工程上不方便"，而是**数学上有偏**
- 为什么 2019 年大家短暂相信"BERT 已经被超过了"，结果一年后 RoBERTa 又把它追回来
- 为什么后续长文档模型（Longformer、BigBird）都默认带相对位置编码——这个习惯是 Transformer-XL 留下来的，XLNet 把它推广了
- 为什么"统一 GPT 与 BERT"是 2019 - 2020 年预训练论文最常见的标题模板

## 核心要点

XLNet 的关键概念可以拆成 **三块**：

1. **排列语言模型 PLM**：对长度为 T 的句子，理论上枚举它的 T! 种 token 顺序排列，每种排列都做自回归分解 logP(x_{z_t} | x_{z_<t})。训练目标是这些分解 log-likelihood 在所有排列上的期望。
2. **双流自注意力 two-stream attention**：因为同一个位置在不同排列里既要"被预测"又要"作为历史给后面用"，普通自注意力会泄露答案。XLNet 同时维护两条流——content stream 看自己和历史（用于给后面位置当上下文），query stream 只看历史和当前位置编号、不看当前内容（用于预测当前位置）。
3. **底座 Transformer-XL**：相对位置编码 + 段级循环（segment recurrence），让预训练能跨长文档而不是 BERT 那样硬截断到 512。

补一个常见误解：排列**不是真的把 token 打乱输入**。位置编码保持原始顺序，模型仍读原句；改的只是注意力 mask——决定每个位置能看到哪些位置的 query。

## 实践案例

### 案例 1：BERT 缺陷的最小反例

句子：`New York is a city`。BERT 同时 mask `New` 和 `York`，损失函数是：

```
L_BERT = log P(New | is a city) + log P(York | is a city)
```

这个目标隐含假设 `New` 与 `York` 在给定上下文 `is a city` 时**条件独立**——但显然不独立，看到 `New` 后 `York` 概率剧增。XLNet 的 AR 分解写成：

```
L_XLNet = log P(New | is a city) + log P(York | New, is a city)
```

第二项把 `New` 当作历史，正确建模了相关性。这是论文 Section 2.1 给的标志性例子。

### 案例 2：排列语言模型的一种采样

句子 `[1, 2, 3, 4]`，假设采到一个排列 z = `[3, 1, 4, 2]`。模型按这个顺序自回归预测：

- 预测位置 3：用空历史
- 预测位置 1：能看到位置 3
- 预测位置 4：能看到位置 3, 1
- 预测位置 2：能看到位置 3, 1, 4

注意位置 2 在排列里排到最后，所以它的"上下文"其实包含了原句子里**右边**的位置 3 和 4——这就是双向性的来源。轮到下一次采样别的排列时，位置 2 又会换一种历史。许多次采样后，每个位置都见过各种"前面是谁"的组合。

### 案例 3：实际训练只采样部分排列

T! 是天文数字（T=512 时不可枚举）。XLNet 实际做法：

- 每个序列采一个随机排列
- 在排列尾部 K 个位置上算 loss（前面的位置上下文太少，损失噪声大），其他位置不算
- 论文里 K ≈ T/6 ~ T/7

所以"排列"并不昂贵，每步 forward 只比 BERT 多一个 stream 的开销，但训练总步数和数据量都比 BERT 大。

### 案例 4：双流注意力的 mask 长什么样

设 batch 内一条样本的排列为 z，序列长度 4。两个 mask 的语义可以这样直观描述：

- content mask `M_c[i][j] = 1`，当且仅当 j 在排列里位于 i 之前**或**等于 i——content stream 既看历史，也看自己。
- query mask `M_q[i][j] = 1`，当且仅当 j 在排列里**严格**位于 i 之前——query stream 只看历史。

所以两条流共享 K/V，只是第一层 query stream 拿不到自己 token 的内容（只用位置编码 + 上一层 query 表示），从而避免"用答案预测答案"。后续层每层都按这两套 mask 重新算 attention。这两步 mask 之差，就是 XLNet 全部"魔法"的工程实现。

## 踩过的坑

1. **以为 XLNet 真的打乱了输入序列**：不是。打乱的是注意力 mask，输入和位置编码仍按原顺序。这点初读很容易误解。

2. **two-stream 的实现细节复杂**：query stream 与 content stream 在每一层都要分别算且互相喂参数。开源实现里这部分代码量比标准 BERT 多一倍，是 XLNet 工程化难落地的主要原因。

3. **公平对比争议**：XLNet 用了比 BERT 多 10 倍的数据（约 32B tokens vs BERT 约 3B tokens）和更长训练。RoBERTa 后来证明 BERT 同等数据 + 更长训练也能匹敌 XLNet——所以 PLM 本身的增益究竟有多少，至今没有干净的对比答案。

4. **下游 finetune 仍按普通 LM 用**：预训练用排列，但 finetune 时不再排列，按正常单向或双向使用。这个不一致也是后来论文常拿来质疑的地方。

5. **训练慢**：双流 + 排列采样让 wall-clock 比同等参数的 BERT 慢约 1.5-2 倍，这是工业界没大规模采用的现实原因之一。

## 适用 vs 不适用场景

**适用**：

- 想从原理上理解"为什么 BERT mask 假设有偏"——XLNet 的反例是教科书级的
- 长文档预训练实验——Transformer-XL 的段循环让 XLNet 自带长上下文优势
- 研究 AR 与双向性如何统一的设计空间

**不适用**：

- 想直接拿现成模型上业务——2026 年主流早已是 LLaMA/Qwen 系 decoder-only AR，XLNet 的 encoder 风格 + PLM 已经被冷落
- 资源紧张——双流注意力让训练 / 推理都更贵，性价比不如 RoBERTa
- 生成任务——XLNet 是 understanding 模型，不像 GPT 那样直接拿来生成

## 历史小故事（可跳过）

- **2018 年 10 月**：BERT 发布，刷爆 11 个 NLP 任务榜单。
- **2019 年 1 月**：同一批 CMU + Google Brain 作者发 Transformer-XL，解决长序列问题。
- **2019 年 6 月**：XLNet 发布，把 PLM 套在 Transformer-XL 上，一举在 20 个任务上超过 BERT。短短半年，"Transformer 预训练"的范式变了一次又一次。
- **2019 年 7 月**：RoBERTa 发布，证明"BERT 没调好"，把 BERT 用更大数据 + 更长训练 + 更大 batch 训出来，又把 XLNet 追回去了。
- **2020 年起**：decoder-only 风格（GPT-3）开始主导，encoder + 复杂 mask 设计（XLNet、ELECTRA）的研究热度逐步下降。

## 学到什么

1. **掩码语言模型的"独立性假设"是隐性的**：BERT 写起来很自然，但同时预测多个 mask 的 loss 默认假设它们条件独立——这个假设在大多数自然语言里不成立。
2. **AR 与双向并非天然对立**：通过排列重排上下文窗口，可以在保持严格自回归分解的同时让每个位置看到"双向"的信息。
3. **架构层和目标层可以解耦设计**：XLNet = Transformer-XL（架构）+ PLM（目标）+ two-stream（实现细节）。三件事可以独立替换、独立比较，这是好的工程切分。
4. **公平基线很重要**：XLNet 与 BERT 的数据规模差异让纯算法增益难以估计；RoBERTa 的"调参翻案"提醒我们，所有"我们超过了 X"的论文都该先问数据和训练步数对齐了没。
5. **工程复杂度本身是一种代价**：two-stream 让代码量翻倍、训练慢一倍，即便论文数字漂亮，工业界仍会算性价比账。这也是为什么 2020 年后 decoder-only 成为大多数大规模预训练的默认选择。

## 延伸阅读

- 原论文 PDF：[Yang et al. 2019](https://arxiv.org/abs/1906.08237)（25 页，Section 2 是 PLM 推导主战场）
- 官方代码：[zihangdai/xlnet](https://github.com/zihangdai/xlnet)（TensorFlow，two-stream attention 在 modeling.py）
- 解读博客：[Jay Alammar — The Illustrated XLNet]（从图示出发推导排列 mask 的可视化）
- 反方观点：[Liu et al. — RoBERTa](https://arxiv.org/abs/1907.11692)（同年 7 月，证明 BERT 没调好）
- 实现走读：HuggingFace transformers 仓库 `models/xlnet/modeling_xlnet.py` 是当下能直接跑的最完整 PyTorch 复现，把 query / content 两条 stream 命名得很清楚
- [[bert]] —— XLNet 想要超越的对象，理解 MLM 才能理解 PLM 的针对性
- [[transformer-xl-2019]] —— XLNet 的底座架构

## 关联

- [[bert]] —— 掩码语言模型，XLNet 用 PLM 直接对标的对手
- [[transformer-xl-2019]] —— 提供相对位置 + 段循环底座
- [[attention]] —— self-attention 是 two-stream 的基本单元
- [[elmo-2018]] —— 早期"双向"通过两个反向 LSTM 拼接，XLNet 是统一目标式的下一代答案
- [[gpt-3]] —— AR 路线的代表，XLNet 想要把它和 BERT 揉成一个

## 一句话总结

**XLNet = "把句子顺序打乱采样，再用自回归严谨分解"**——这一行就把 BERT 同时预测多 mask 的独立性假设、GPT 单向看不到右边的局限，一次性绕过去；代价是双流注意力让训练贵一倍，所以 2020 年后大模型仍多走 decoder-only 路线。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[attention]] —— Attention Is All You Need
- [[bert]] —— BERT — 双向 Transformer 预训练
- [[gpt-3]] —— GPT-3 — Language Models are Few-Shot Learners
- [[roberta-2019]] —— RoBERTa — 把 BERT 重训一遍就能拿 SOTA
- [[transformer-xl-2019]] —— Transformer-XL — 让 Transformer 像 RNN 那样把上下文滚动传下去

