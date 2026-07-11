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
- 为什么后续长文档模型常谈相对位置编码——Transformer-XL / XLNet 这条线把「位置看相对距离」推成了长序列预训练的常见习惯（谱系里还有 Shaw 等更早工作）
- 为什么"统一 GPT 与 BERT"是 2019 - 2020 年预训练论文最常见的标题模板

## 核心要点

XLNet 的关键概念可以拆成 **三块**：

1. **排列语言模型 PLM**：类比——同一副牌反复洗牌，每次仍按「上一张猜下一张」出牌。对长度 T 的句子，理论上枚举 T!（T 的阶乘）种 token 顺序；每种顺序都做自回归分解：用已经出现过的词，预测下一个词的概率。训练目标是这些概率在所有排列上的平均。
2. **双流自注意力 two-stream attention**：类比——考试时「答题卡」不能偷看本题答案，但「草稿纸」可以记下本题内容给后面用。同一位置既要被预测、又要当历史，普通注意力会泄题。于是 content 流看自己+历史（给后面当上下文），query 流只看历史和位置编号、不看当前内容（用来猜当前位置）。
3. **底座 Transformer-XL**：类比——读长篇小说时把上一章摘要带进下一章，而不是每章从零开始。相对位置编码 + 段级循环，让预训练能跨长文档，而不是像 BERT 那样硬截断到 512。

补一个常见误解：排列**不是真的把 token 打乱输入**。位置编码保持原始顺序，模型仍读原句；改的只是注意力 mask——决定每个位置能看到哪些位置。

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

句子位置编号 `[1, 2, 3, 4]`，假设采到排列 z = `[3, 1, 4, 2]`。**实现上只改 attention mask，不 permute 输入张量**——词仍按原顺序进模型。

按排列顺序自回归预测：

- 预测位置 3：历史为空
- 预测位置 1：能看到位置 3
- 预测位置 4：能看到位置 3, 1
- 预测位置 2：能看到位置 3, 1, 4

**逐部分解释**：

- 位置 2 排到最后，上下文含原句**右边**的 3 和 4——双向性来自这里
- 下次采别的排列，位置 2 会换一套历史；多次采样后每个位置都见过多种「前面是谁」
- 工程对照：content mask 允许看历史+自己；query mask 只看严格历史——避免用答案猜答案

### 案例 3：实际训练只采样部分排列

T 的阶乘是天文数字（T=512 时不可枚举）。XLNet 实际做法：

```
每个序列采 1 个随机排列
只在排列尾部 K 个位置算 loss（K ≈ T/6 ~ T/7）
前面位置上下文太少，噪声大，不算
```

**逐部分解释**：

- 「排列」不贵：每步 forward 只比 BERT 多一条 query stream
- 真正贵的是总步数与数据量（约 32B tokens vs BERT 约 3B）
- 选型时把 wall-clock 慢约 1.5–2 倍算进预算

## 踩过的坑

1. **以为 XLNet 真的打乱了输入序列**：不是。打乱的是注意力 mask，输入和位置编码仍按原顺序。这点初读很容易误解。

2. **two-stream 实现复杂**：query / content 每层分别算且互相喂参数，开源代码量约比 BERT 多一倍，是难落地主因。

3. **公平对比争议**：XLNet 数据约 32B tokens（BERT 约 3B）且训更久；RoBERTa 证明同等数据+更长训练也能匹敌——PLM 纯增益至今没有干净对照。

4. **预训练排、finetune 不排**：下游按普通单向/双向用，这个不一致常被后来论文质疑；再叠加 wall-clock 慢约 1.5–2 倍，工业界很少大规模采用。

## 适用 vs 不适用场景

**适用**：

- 想从原理上理解"为什么 BERT mask 假设有偏"——XLNet 的反例是教科书级的
- 长文档预训练实验——Transformer-XL 的段循环让 XLNet 自带长上下文优势
- 研究 AR 与双向性如何统一的设计空间

**不适用**：

- 想直接拿现成模型上业务——2026 年主流是 LLaMA/Qwen 系 decoder-only，XLNet 的 encoder + PLM 已冷落
- 资源紧张——双流让训练 wall-clock 约慢 1.5–2 倍，性价比不如 RoBERTa
- 生成任务——XLNet 主打 understanding，不像 GPT 那样直接拿来生成

## 历史小故事（可跳过）

- **2018 年 10 月**：BERT 发布，刷爆 11 个 NLP 任务榜单。
- **2019 年 1 月**：同一批 CMU + Google Brain 作者发 Transformer-XL，解决长序列问题。
- **2019 年 6 月**：XLNet 发布，把 PLM 套在 Transformer-XL 上，一举在 20 个任务上超过 BERT。短短半年，"Transformer 预训练"的范式变了一次又一次。
- **2019 年 7 月**：RoBERTa 发布，证明"BERT 没调好"，把 BERT 用更大数据 + 更长训练 + 更大 batch 训出来，又把 XLNet 追回去了。
- **2020 年起**：decoder-only 风格（GPT-3）开始主导，encoder + 复杂 mask 设计（XLNet、ELECTRA）的研究热度逐步下降。

## 学到什么

1. **掩码语言模型的"独立性假设"是隐性的**：同时预测多个 mask 默认假设它们条件独立——自然语言里常常不成立。
2. **AR 与双向并非天然对立**：用排列重排上下文窗口，可在严格自回归分解下仍让每个位置看到「双向」信息。
3. **架构层和目标层可以解耦**：XLNet = Transformer-XL（架构）+ PLM（目标）+ two-stream（实现）；三件事可独立替换、独立比较。
4. **公平基线与工程代价**：数据/步数没对齐就难谈算法增益；two-stream 让代码与训练更贵，这也是 2020 年后 decoder-only 成默认的原因之一。

## 延伸阅读

- 原论文 PDF：[Yang et al. 2019](https://arxiv.org/abs/1906.08237)（Section 2 是 PLM 推导主战场）
- 官方代码：[zihangdai/xlnet](https://github.com/zihangdai/xlnet)（TensorFlow，two-stream 在 modeling.py）
- 解读博客：[Jay Alammar — The Illustrated Transformer](https://jalammar.github.io/illustrated-transformer/)（同作者图示风格；XLNet 排列 mask 可对照论文 Fig.1）
- 反方观点：[Liu et al. — RoBERTa](https://arxiv.org/abs/1907.11692)（同年 7 月，证明 BERT 没调好）
- 实现走读：HuggingFace `models/xlnet/modeling_xlnet.py`（PyTorch，query/content 两条 stream 命名清楚）
- [[bert]] —— 理解 MLM 才能理解 PLM 的针对性
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

- [[electra-2020]] —— ELECTRA — 把猜词题改成判真假题，训练效率 4 倍
- [[roberta-2019]] —— RoBERTa — 把 BERT 重训一遍就能拿 SOTA
- [[transformer-xl-2019]] —— Transformer-XL — 让 Transformer 像 RNN 那样把上下文滚动传下去
