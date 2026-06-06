---
title: Longformer — 滑窗加少数全局 token，把长文档喂进 Transformer
来源: 'Beltagy, Peters, Cohan, "Longformer: The Long-Document Transformer", arXiv 2004.05150 (2020)'
日期: 2026-05-31
子分类: 模型与训练
分类: 机器学习
难度: 中级
provenance: pipeline-v3
---

## 是什么

Longformer 是 Allen AI 在 2020 年 4 月放出的**长文档 Transformer**，目标只有一个：让 BERT 这一类模型能直接吃 4096 token 甚至更长的输入，不用截断、不用切块。日常类比：原版 self-attention 像让会场里每个人都和其他每个人单聊一遍——人多了根本聊不完；Longformer 让大部分人**只和左右几个邻居聊**，再钦定少数关键人物（比如主持人、记者）和**全场每个人都聊**。

它把 attention 拆成三种 pattern：

1. **sliding window**：每个 token 只看自己左右各 w/2 个邻居，w 通常取 512
2. **dilated sliding window**：在高层把窗口"打洞"，跳着看，让感受野指数级扩大
3. **global attention**：少数 task-driven 的 token（分类用 `[CLS]`，问答用问题里的 token）和**所有**位置双向 attend

整体复杂度从 O(L²) 降到 O(L·w)。L=4096、w=512 时，节省约 8 倍。

## 为什么重要

不理解 Longformer，下面这些事说不清：

- 为什么 2020 年前后冒出一批 efficient Transformer（[[reformer-2020]] / BigBird / Performer / Linformer），它们解决的都是同一个 O(L²) 痛点
- 为什么 HuggingFace 把"长文档"任务（HotpotQA / arXiv summarization / contract review）默认推 Longformer 而不是 Reformer
- 为什么 LED（Longformer-Encoder-Decoder）成了长文摘要的标配 baseline——把同一套滑窗思路搬进了 seq2seq
- 为什么 2023 年 LLM 圈炒"长上下文"的概念，其实学界 2020 就在攻这条线

它是"长文档 Transformer"这条赛道上**工程胜利者**：思路朴素、实现可控、预训练成本低。

## 核心要点

Longformer 的设计可以拆成三层：

1. **sliding window 是基础**：每层每个 token 看左右 w/2 个邻居。叠 N 层之后，最顶层一个 token 的感受野是 N·w——和 CNN 叠卷积扩感受野的逻辑一模一样。

2. **dilated window 拓远距离**：高层把 window 里的格子"打洞"，比如 dilation=2 表示隔一个看一个，dilation=4 表示隔三看一。这样不用增加计算量就能多看远处。论文推荐底层用普通滑窗、顶层用 dilated。

3. **global attention 处理"必须看全局"的 token**：分类任务里 `[CLS]` 必须看完所有位置才能聚合判断；问答任务里问题 token 必须扫一遍 context 才能定位答案。这些 token 走标准 full attention，但**数量很少**（通常 < 10 个），不影响整体复杂度。

实现上的关键工程点：

- 论文配了**自定义 CUDA kernel**（band-diagonal matmul）才让滑窗算得快
- HuggingFace 提供等价 PyTorch fallback，慢但不依赖编译
- 预训练**不是从零开始**，而是接着 RoBERTa checkpoint 继续训——positional embedding 从 512 复制 8 份扩到 4096

## 实践案例

### 案例 1：sliding window 怎么省到 O(L)

标准 attention 的 query × key 矩阵是 L×L，每行算一遍 softmax。

滑窗 attention 只算"对角带"——每个 query 只和左右 w/2 个 key 配对。矩阵从 L×L 缩成 L×w。L=4096、w=512 时，参与计算的 pair 从 16M 降到 2M。

形象点：

```
标准:    每个 token  ↔  全部 L 个 token  → O(L^2)
滑窗:    每个 token  ↔  左右 w 个 token  → O(L * w)
```

只要 w 是常数，复杂度就线性。

### 案例 2：global token 在问答里怎么用

HotpotQA 的输入是 "[问题文本] [上下文文档1] [上下文文档2] ..."，长度常常超过 4096。

Longformer 的玩法：

- 问题里的所有 token → 标记为 global，做 full attention
- context 里所有 token → 走 sliding window

这样问题 token 能看到全文档每个位置，回答时能定位证据；context token 之间只用滑窗就够了，因为大多数依赖都是局部的。

代码里就是给 `attention_mask` 标 1（local）或 2（global）：

```python
attention_mask = torch.zeros(input_ids.shape, dtype=torch.long)
attention_mask[:, :question_length] = 2  # 问题 token 走 global
attention_mask[:, question_length:] = 1  # context 走 local
```

### 案例 3：LED — 把滑窗搬进 seq2seq

原版 Longformer 是 encoder-only（替代 BERT/RoBERTa）。LED 把同一套滑窗 attention 装进 BART 的 encoder 部分，decoder 保持 full attention（因为 decoder 端通常不长）。

效果：arXiv 论文摘要任务上，LED 能直接吃 16384 token 的输入，超过 BART 的 1024 限制，ROUGE 指标显著提升。

## 踩过的坑

1. **窗口大小 w 调起来玄**：w 太小（< 128）远距离依赖丢；太大（> 1024）显存和速度优势没了。论文默认 512，但每个任务都要重调，没有万能值。

2. **dilation 不是越多越好**：dilated window 在底层用反而伤——底层负责局部 syntactic 模式，打洞会跳掉关键的相邻信息。论文推荐**只在顶 2 层用 dilation**，底层老老实实滑窗。

3. **global token 必须人工指定**：选哪些 token 当 global 是 task-specific 设计决策（分类选 `[CLS]`、问答选问题），不能端到端学出来。任务奇怪时（多跳推理、对话）规则不好定。

4. **CUDA kernel 不在主流 PyTorch 里**：要么用 HuggingFace 慢 fallback，要么自己编译 longformer 的 cuda 扩展。后者在新版 PyTorch / CUDA 下经常编译失败，是踩雷高发区。

5. **不是真的"无限长"**：理论上 O(L) 让你想塞多长就多长，实际还是受 GPU 显存（KV cache、激活）和 positional embedding 训练范围（默认 4096）限制。塞 16K 之前要重新预训练 position embedding。

## 适用 vs 不适用场景

**适用**：

- 长文档分类 / 抽取（IMDb、Hyperpartisan、合同条款抽取、长篇论文 metadata）
- 长文档问答（HotpotQA、TriviaQA、WikiHop）
- 长文摘要（arXiv / PubMed 论文摘要，用 LED）
- 任何"输入 > 1024、依赖局部为主、有少数关键全局信号"的任务

**不适用**：

- 短文本（< 1024）：滑窗 overhead 大于收益，直接用 BERT/RoBERTa
- 强长距离依赖任务：每个 token 都需要看全局信号时，滑窗会丢信息——考虑 BigBird 或直接换 [[flash-attention]]
- 需要端到端学全局位置：global token 必须任务规则指定，不会自己冒出来
- 训练资源极少：要从 RoBERTa 续训，再加 position embedding 扩展，仍是中等成本

## 历史小故事（可跳过）

- **2018**：BERT 出生，max_seq_length=512，被全行业当默认值
- **2019 末**：长文档任务（HotpotQA、arXiv summarization）开始把"512 截断"这一限制顶上水面
- **2020 年初**：[[reformer-2020]] / Longformer / BigBird 三个月内连发，都瞄准 O(L²) 这一痛点；Reformer 用 LSH 哈希、Longformer 用滑窗、BigBird 用 random + window + global
- **2020 后期**：HuggingFace 把 Longformer 收进 transformers 库，配套 LED 模型，长文档任务 baseline 落定
- **2022-2023**：[[flash-attention]] 出现，从工程上把 full attention 的常数压下来，sparse attention 的份额逐渐让出，但 Longformer 在"窗口足够、不想换 kernel"的任务上仍是常用 baseline

## 学到什么

1. **稀疏化是长序列的第一直觉**：能不能让大部分位置只看局部？滑窗给出最朴素的答案
2. **少量全局 token 兜底**：全靠局部不够，钦定几个关键 token 走 full attention，是工程性价比极高的折衷
3. **不是从零训**：从已有 checkpoint 续训、扩 positional embedding，比从头预训成本低一个量级——是 NLP 改造已有大模型的通用技巧
4. **工程胜过新颖**：理论最漂亮的不是最被用的；Longformer 没有数学证明，但易实现易调试，所以赢

## 延伸阅读

- 论文 PDF：[Longformer arXiv 2004.05150](https://arxiv.org/abs/2004.05150)（实验细节扎实）
- HuggingFace 文档：[transformers docs/model_doc/longformer](https://huggingface.co/docs/transformers/model_doc/longformer)（直接能跑）
- 对照阅读：BigBird 论文（NeurIPS 2020）数学上证明了这种 sparse pattern 可逼近 full attention
- [[reformer-2020]] —— 同一时期的 LSH 路线
- [[flash-attention]] —— 后来从工程层面"非近似地"把 attention 压下来

## 关联

- [[attention]] —— Longformer 改造的对象，本笔记假设你懂 Q/K/V 矩阵乘
- [[bert]] —— Longformer 在 BERT 系列上做改造，预训练复用 RoBERTa
- [[reformer-2020]] —— 同期解长序列的另一条路（LSH 哈希分桶）
- [[flash-attention]] —— 后来更彻底的工程方案，但思路完全不同
- [[t5]] —— LED 的精神参考，seq2seq 也可以装稀疏 attention

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[attention]] —— Attention Is All You Need
- [[bert]] —— BERT — 双向 Transformer 预训练
- [[flash-attention]] —— FlashAttention — 不改算法，只改数据怎么进 GPU
- [[reformer-2020]] —— Reformer — 用哈希分桶把 attention 从 O(L²) 压到 O(L log L)
- [[t5]] —— T5 — Text-to-Text Transfer Transformer

