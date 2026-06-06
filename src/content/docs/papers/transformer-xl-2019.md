---
title: Transformer-XL — 让 Transformer 像 RNN 那样把上下文滚动传下去
来源: 'Dai et al., "Transformer-XL: Attentive Language Models Beyond a Fixed-Length Context", ACL 2019'
日期: 2026-05-31
子分类: 模型与训练
分类: 机器学习
难度: 中级
provenance: pipeline-v3
---

## 是什么

Transformer-XL 是 2019 年 1 月 CMU + Google Brain 联合提出的 Transformer 改进版（XL = eXtra Long）。它做了两件事：

1. **段级循环**：把上一段的隐藏状态缓存起来，下一段可以直接看
2. **相对位置编码**：位置不再写死到 token 上，而是用「我和你差几步」当信号

日常类比：原始 Transformer 看小说像**一次只能读一页、读完就把上一页扔掉**——读到下一页第一个字时，前一页第一句话已经看不见了。Transformer-XL 是**把上一页折角夹住**，读下一页时还能瞄一眼上一页写了什么。

一句话：把 RNN 的「状态滚动」拿来补 Transformer 的「上下文盒子」。

## 为什么重要

不理解 Transformer-XL，下面这些事都没法解释：

- 为什么 **XLNet**（同一批作者 2019 年 6 月）能短暂超过 BERT——它的骨架就是 Transformer-XL
- 为什么 **Reformer / Compressive Transformer** 都拿段级循环做起点
- 为什么现代 LLM 推理用 **KV cache** 加速——概念上就是 Transformer-XL 段级循环的工程化版
- 为什么 **相对位置**（后来的 RoPE / ALiBi）成了主流——因为 Transformer-XL 第一次证明「位置可以是相对的，模型还能更好」

## 核心要点

Transformer-XL 解决的是原始 Transformer 的 **三大硬伤**：

1. **跨段无依赖**：训练时把长文档切成不重叠的段（比如每段 512 token），段与段之间信息断开。模型永远学不到「第 600 词依赖第 100 词」这种关系。
2. **上下文碎片化**：每段开头几个 token 没有任何历史上下文，建模质量差。
3. **评估慢**：推理时为了用上最大上下文，每生成一个新 token 都得把整段重算——计算极度浪费。

两板斧分别解决：

### 段级循环（segment-level recurrence）

读完第 N 段后，把每一层的隐藏状态**缓存**下来（截断梯度，不参与反传）。读第 N+1 段时，attention 的 Key 和 Value 不光来自当前段，还**拼上**缓存的那一份。

类比：考试做阅读理解，原始 Transformer 是「读完第 1 段就把它从脑子里删掉再读第 2 段」；Transformer-XL 是「读完第 1 段记笔记夹在题目里，做第 2 段时随时回看」。

数学上：当前段第 l 层的 hidden state h_τ+1 计算时，把上一段第 l-1 层缓存的 SG(h_τ) 拼到当前段 h_τ+1 前面（SG 表示 stop-gradient），共同算 attention 的 K、V。Q 仍只来自当前段。这样 attention 视野就拉长了一段。

### 相对位置编码（relative positional encoding）

原始 Transformer 给每个位置一个绝对 embedding。但跨段时，第 2 段的位置 0 和第 1 段的位置 0 长得一模一样，模型分不清谁先谁后。

Transformer-XL 把 attention 的打分公式改写：query 和 key 之间不看绝对位置，只看「相对距离」。等价于把「我离你 3 步」这个信号直接编进 attention bias 里。

具体做法：原始 attention score = Q·K，里面 Q 和 K 都是「内容 + 绝对位置」的混合。Transformer-XL 把这个分数拆成 4 项——内容对内容、内容对相对位置、全局内容偏置、全局位置偏置。绝对位置完全不出现，于是缓存里的 token 和当前段的 token 用的是同一套位置语义，跨段不再冲突。

## 实践案例

### 案例 1：依赖距离能拉多长

论文实测：Transformer-XL 学到的有效依赖距离，比 RNN 长 80%、比 vanilla Transformer 长 450%。在 WikiText-103 这种长文档语料上，原始 Transformer 因为段切断学不到跨段依赖，Transformer-XL 直接拿到 SOTA。

具体几个 benchmark 上的数字：

- enwiki8 bpc：1.06（vanilla Transformer）→ **0.99**（Transformer-XL）
- WikiText-103 ppl：23.5 → **18.3**
- One Billion Word ppl：30.0 → **21.8**
- Penn Treebank ppl（无 finetune）：56.1 → **54.5**

bpc / ppl 都是越低越好。看起来差几个点，对语言模型来说已经是显著改进。

### 案例 2：评估速度差 1800 倍

原始 Transformer 推理时为了用上 N 长的上下文，每生成一个 token 都要重算整段；Transformer-XL 因为有缓存，只需要算新 token 一步——同样上下文长度下评估快 **1800+ 倍**。这个工程优化思路后来演化成现代 LLM 的 KV cache。

### 案例 3：能写出连贯长文

只在 WikiText-103 上训练，Transformer-XL 能续写出**几千 token 长度**的连贯文章。原始 Transformer 因为段限制，写到 512 字之后就开始失忆。

## 踩过的坑

1. **缓存不传梯度**：段级循环只前向传递，反向传播仍然停在当前段边界。这是为了显存可控做的妥协——能让模型「看见」长上下文，但不能直接「学习」长程梯度。
2. **段长 + 缓存长是两个超参**：调起来比 vanilla Transformer 麻烦。一般缓存长度设成段长本身，再加显存允许的倍数。
3. **相对位置实现复杂**：论文里给了一个能高效计算的技巧（左移 + 重排），naive 实现会 O(N²) 增加常数。
4. **不是终极方案**：之后的 RoPE（旋转位置编码）和 ALiBi（线性注意力 bias）用更简单的方式实现「相对位置」，已经把 Transformer-XL 的这部分替代掉。但段级循环的思想活到了今天。

## 适用 vs 不适用场景

**适用**：

- 长序列语言建模 / 长文本生成（小说、代码、对话历史）
- 需要"段间信息传递"但显存吃紧的场景
- 想理解现代 LLM 的 KV cache 是怎么来的

**不适用**：

- 短序列任务（句子分类、QA）→ vanilla Transformer 或 BERT 够用
- 需要双向上下文（完形填空式）→ BERT 系更合适，Transformer-XL 是单向 LM
- 想要"段间梯度传递"→ 缓存被 detach 了，得换 Compressive Transformer 或长 context 模型

## 第一性原理视角（可跳过）

vanilla Transformer 把位置当成绝对坐标贴在 token 上，把 context 当成一个固定大小的盒子。Transformer-XL 的洞察很简单：

- attention 的本质是「谁看谁」，**关系是相对的不是绝对的** → 位置应当编码距离差
- context 不是一次性盒子，**可以像 RNN 那样滚动** → 缓存历史隐藏状态

把这两条想通，"段级循环 + 相对位置编码" 就是必然推论。两个看似独立的改进其实是一个洞见的两个面。

## 历史小故事（可跳过）

- **2017 年 6 月**：Vaswani 等人发表 Attention Is All You Need，Transformer 横空出世，但因为 attention 是 O(N²)，长文本只能切段。
- **2018 年**：BERT、GPT-1 都用 Transformer，但只在短文本（最多 512 token）上做。长文档建模仍是 RNN 的领地。
- **2019 年 1 月**：CMU 的 Zihang Dai 和 Google Brain 的 Quoc Le 等人发布 Transformer-XL，第一次让 Transformer 在长文本语言建模上**全面超过 LSTM**。
- **2019 年 6 月**：同一批作者基于 Transformer-XL 发布 XLNet，引入 permutation language modeling，短暂拿下多个 NLP benchmark SOTA，超过 BERT。
- **2020 年之后**：Reformer / Longformer / Compressive Transformer 等长 context 模型涌现，思想都能追溯到 Transformer-XL 的段级循环。
- **2021 年起**：相对位置编码经过 RoPE / ALiBi 几轮迭代，已是现代 LLM 标配；段级循环则演化成推理时的 KV cache。

一篇论文做了两个改进，分别开出两个分支，**6 年后还在影响每个 LLM**——这是基础架构论文的经典模板。

## 学到什么

1. **架构混血常常是出路**：Transformer 强在并行 attention，RNN 强在状态传递；Transformer-XL 是把后者的优点借过来补前者
2. **位置编码是隐藏的设计空间**：从绝对到相对，从加法到乘法（RoPE），位置怎么注入对长上下文影响巨大
3. **推理优化和训练优化是两码事**：1800 倍加速来自缓存复用，这个工程 trick 比架构本身影响更深远
4. **后续工作往往放大某一面**：XLNet 放大循环 + 排列、Reformer 放大长 context、KV cache 放大缓存复用——一篇论文能开多个分支才算真贡献

## 一句话总结全文

Transformer-XL 的两板斧——段级循环让上下文滚动起来、相对位置编码让位置不再粘死——把 vanilla Transformer 从「固定盒子」改成了「滚动磁带」。这两个改动看似工程优化，但它们打开了**长序列建模 + 推理缓存复用**两条路线，直接催生了 XLNet、Reformer、KV cache，以及今天每个 LLM 都依赖的相对位置思路。

读这篇论文的最大收获不是公式，而是体会到「Transformer 不是一个固定架构，而是一个可以被解剖、被混血、被替换的设计空间」。

## 延伸阅读

- 论文 PDF：[arxiv 1901.02860](https://arxiv.org/abs/1901.02860)（18 页，公式密度中等）
- 官方代码：[kimiyoung/transformer-xl](https://github.com/kimiyoung/transformer-xl)（TensorFlow + PyTorch 双版本）
- 博客解读：[The Illustrated Transformer-XL](https://medium.com/@_init_/transformer-xl-explained-combining-transformers-and-rnns-into-a-state-of-the-art-language-2475ed4a1ae0)
- [[attention]] —— Transformer-XL 的母体
- [[bert]] —— 双向版 Transformer，对比单向的 Transformer-XL

## 关联

- [[attention]] —— Transformer-XL 在 vanilla Transformer 上动刀
- [[bert]] —— 同年大热的另一个 Transformer 变体，方向相反（双向 vs 单向 + 长程）
- [[gpt-3]] —— 后来的大模型继承了"长 context 单向 LM"的路线
- [[flash-attention]] —— 同样是为长 context 服务，但路线是优化 attention 计算而非缓存
- [[fastertransformer-2021]] —— KV cache 的工程化实现，思想源头之一就是段级循环

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[attention]] —— Attention Is All You Need
- [[bert]] —— BERT — 双向 Transformer 预训练
- [[decision-transformer-2021]] —— Decision Transformer — 把强化学习当成"文字接龙"
- [[fastertransformer-2021]] —— FasterTransformer 2021 — NVIDIA 第一代开源 LLM 推理引擎
- [[flash-attention]] —— FlashAttention — 不改算法，只改数据怎么进 GPU
- [[gat-2018]] —— GAT — 让图神经网络的邻居自带权重
- [[gpt-3]] —— GPT-3 — Language Models are Few-Shot Learners
- [[graphormer-2021]] —— Graphormer — 标准 Transformer 直接刷爆 GNN
- [[reformer-2020]] —— Reformer — 用哈希分桶把 attention 从 O(L²) 压到 O(L log L)
- [[sasrec-2018]] —— SASRec — 用 Transformer 的 self-attention 替 RNN 做下一步推荐
- [[starcoder-2023]] —— StarCoder — 把训练数据完整公开的 15B 代码模型
- [[tabpfn-2023]] —— TabPFN — 一秒解决小表格分类的 Transformer
- [[xlnet-2019]] —— XLNet — 把句子打乱顺序读，借此同时拿到 AR 和双向

