---
title: Transformer-XL — 让 Transformer 像 RNN 那样把上下文滚动传下去
来源: 'Dai et al., "Transformer-XL: Attentive Language Models Beyond a Fixed-Length Context", ACL 2019'
日期: 2026-05-31
分类: 深度学习 / NLP
难度: 中级
---

## 是什么

Transformer-XL 是 2019 年 1 月 CMU + Google Brain 联合提出的 Transformer 改进版（XL = eXtra Long）。它做了两件事：

1. **段级循环**：把上一段的隐藏状态缓存起来，下一段可以直接看
2. **相对位置编码**：位置不再写死到 token 上，而是用「我和你差几步」当信号

日常类比：原始 Transformer 看小说像**一次只能读一页、读完就把上一页扔掉**。Transformer-XL 是**把上一页折角夹住**，读下一页时还能瞄一眼上一页写了什么。

一句话：把 RNN 的「状态滚动」拿来补 Transformer 的「上下文盒子」。

## 为什么重要

不理解 Transformer-XL，下面这些事都没法解释：

- 为什么 **XLNet**（同一批作者 2019 年 6 月）能短暂超过 BERT——它的骨架就是 Transformer-XL
- 为什么 **Reformer / Compressive Transformer** 都拿段级循环做起点
- 为什么现代 LLM 推理用 **KV cache** 加速——概念上就是段级循环的工程化版
- 为什么 **相对位置**（后来的 RoPE / ALiBi）成主流——Transformer-XL 把相对位置做成可与段级循环兼容的方案，并在长文本 LM 上验证有效（Shaw et al. 2018 已有相对位置雏形）

## 核心要点

Transformer-XL 解决原始 Transformer 的 **三大硬伤**：

1. **跨段无依赖**：长文档切成不重叠段（如每段 512 token），段间信息断开，学不到「第 600 词依赖第 100 词」。
2. **上下文碎片化**：每段开头几个 token 没有历史，建模质量差。
3. **评估慢**：推理时为用上最大上下文，每生成一个新 token 都得整段重算。

两板斧分别解决：

### 段级循环（segment-level recurrence）

读完第 N 段后，把每一层的隐藏状态**缓存**下来（截断梯度，不参与反传）。读第 N+1 段时，attention 的 Key 和 Value（K/V：被查询的「钥匙和内容」）不光来自当前段，还**拼上**缓存。

类比：考试做阅读理解——原始 Transformer「读完第 1 段就删掉再读第 2 段」；Transformer-XL「读完第 1 段记笔记夹在题目里，做第 2 段时随时回看」。

数学上：当前段第 l 层算 hidden 时，把上一段第 l-1 层缓存的 `SG(h)` 拼到前面。`SG` = stop-gradient（停止梯度：前向能看见，反向不更新那份缓存）。Q 仍只来自当前段，于是视野拉长了一段。

### 相对位置编码（relative positional encoding）

原始 Transformer 给每个位置一个绝对 embedding。跨段时，第 2 段的位置 0 和第 1 段的位置 0 长得一样，模型分不清谁先谁后。

日常说法：别问「你是第几号座位」，只问「我和你隔几排」。Transformer-XL 把 attention 打分改成只看相对距离，再拆成内容对内容、内容对距离、两个全局偏置——绝对位置不再出现，缓存里的 token 和当前段共用同一套位置语义。

## 实践案例

### 案例 1：段级循环伪代码

```python
# mem = 上一段各层 hidden（已 detach，不回传梯度）
h = concat(mem[l-1], h_cur)   # 拼历史
k, v = W_k(h), W_v(h)         # K/V 看得到历史
q = W_q(h_cur)                # Q 只来自当前段
out = attention(q, k, v)
```

**逐部分解释**：

- `concat(mem, h_cur)`：把上一页笔记钉在当前页前面
- `q` 只看当前段：新问题只由「这一页」提出
- `k, v` 看拼接后序列：答题时可回看笔记
- `mem` 已 detach：能看见长上下文，但不把梯度穿过段边界（省显存）

### 案例 2：评估速度差 1800 倍

无缓存：每生成 1 个 token，整段上下文从头重算 attention。

有缓存：只算新 token 一步，旧表示直接复用——论文 Table 9 同上下文下评估快 **1800+ 倍**。这就是后来 LLM **KV cache** 的思想源头。

### 案例 3：论文数字（对照要标清）

- enwiki8 bpc（越低越好）：Al-Rfou 64L Transformer **1.06** → XL **0.99**
- WikiText-103 ppl：前 SOTA Baevski & Auli **20.5** → XL Large **18.3**
- One Billion Word ppl：前 SOTA **23.7** → XL **21.8**
- Penn Treebank ppl（无 finetune）：约 **55.3** → XL **54.5**

另：有效依赖距离比 RNN 长约 80%、比 vanilla Transformer 长约 450%；只在 WikiText-103 上训练也能续写数千 token 连贯文章。

## 踩过的坑

1. **缓存不传梯度**：段级循环只前向传递，反向停在当前段——能「看见」长上下文，不能直接「学习」跨段梯度。
2. **段长 + 缓存长是两个超参**：一般 memory ≈ 段长（常见 128–512），再按显存加倍；调参比 vanilla 麻烦。
3. **相对位置实现复杂**：论文用左移 + 重排做高效计算，naive 实现会多一截 O(N²) 常数。
4. **不是终极方案**：RoPE / ALiBi 用更简单方式做相对位置；段级循环思想则活到了今天的 KV cache。

## 适用 vs 不适用场景

**适用**：

- 长序列语言建模 / 长文本生成（小说、代码、对话历史；文章均长 ≥ 1K token 时收益明显）
- 显存紧但仍要段间信息传递：memory 长度 128–512、显存大致随 `memory × 层数` 线性涨
- 想理解现代 LLM 的 KV cache 从哪来

**不适用**：

- 短序列任务（句子分类、短 QA）→ vanilla Transformer / BERT 够用
- 需要双向上下文（完形填空）→ BERT 系；Transformer-XL 是单向 LM
- 想要段间梯度传递 → 缓存被 detach，得换 Compressive Transformer 或更长 context 模型

## 第一性原理视角（可跳过）

- attention 本质是「谁看谁」，**关系是相对的** → 位置应编码距离差
- context 不是一次性盒子，**可以像 RNN 滚动** → 缓存历史隐藏状态

两条想通，「段级循环 + 相对位置」就是必然推论。

## 历史小故事（可跳过）

- **2017 年 6 月**：Vaswani 等人发表 Attention Is All You Need；attention O(N²)，长文本只能切段。
- **2018 年**：BERT、GPT-1 都用 Transformer，但多在 ≤512 token；长文档仍是 RNN 领地。
- **2019 年 1 月**：Dai、Yang、Le 等发布 Transformer-XL，长文本 LM 上全面超过 LSTM。
- **2019 年 6 月**：同批作者基于它发布 XLNet，短暂超过 BERT。
- **2020 年起**：Reformer / Longformer / Compressive Transformer 等可追溯到段级循环；相对位置经 RoPE / ALiBi 成 LLM 标配，段级循环演化为推理 KV cache。

## 学到什么

1. **架构混血常常是出路**：Transformer 强在并行 attention，RNN 强在状态传递；XL 把后者借来补前者
2. **位置编码是隐藏设计空间**：从绝对到相对，从加法到乘法（RoPE），对长上下文影响巨大
3. **推理优化和训练优化是两码事**：1800 倍加速来自缓存复用，工程影响往往比架构本身更深远
4. **后续工作往往放大某一面**：XLNet / Reformer / KV cache 各放大一面——一篇论文能开多个分支才算真贡献

## 一句话总结全文

两板斧——段级循环让上下文滚动、相对位置让位置不再粘死——把 vanilla Transformer 从「固定盒子」改成「滚动磁带」，催生了 XLNet、Reformer、KV cache 与今天的相对位置思路。

## 延伸阅读

- 论文 PDF：[arxiv 1901.02860](https://arxiv.org/abs/1901.02860)（18 页，公式密度中等）
- 官方代码：[kimiyoung/transformer-xl](https://github.com/kimiyoung/transformer-xl)（TensorFlow + PyTorch）
- 博客：[The Illustrated Transformer-XL](https://medium.com/@_init_/transformer-xl-explained-combining-transformers-and-rnns-into-a-state-of-the-art-language-2475ed4a1ae0)
- [[attention]] —— Transformer-XL 的母体
- [[bert]] —— 双向版 Transformer，对比单向的 Transformer-XL
- [[xlnet-2019]] —— 同一骨架上的排列语言模型

## 关联

- [[attention]] —— Transformer-XL 在 vanilla Transformer 上动刀
- [[bert]] —— 同年大热的另一个变体（双向 vs 单向 + 长程）
- [[gpt-3]] —— 后来大模型继承「长 context 单向 LM」路线
- [[flash-attention]] —— 同样服务长 context，但优化计算而非缓存
- [[fastertransformer-2021]] —— KV cache 工程化，思想源头之一是段级循环
- [[xlnet-2019]] —— 直接以 Transformer-XL 为骨干

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[decision-transformer-2021]] —— Decision Transformer — 把强化学习当成"文字接龙"
- [[gat-2018]] —— GAT — 让图神经网络的邻居自带权重
- [[gemini-1.5-2024]] —— Gemini 1.5 — 百万 token 多模态上下文的工程样板
- [[graphormer-2021]] —— Graphormer — 标准 Transformer 直接刷爆 GNN
- [[kv-fold]] —— KV-Fold — 把 KV cache 当成 fold 的累加器，一段一段读长文
- [[mem-ft-lora]] —— MemFT-LoRA — 用 LoRA 量出大模型能背多少精确内容
- [[reformer-2020]] —— Reformer — 用哈希分桶把 attention 从 O(L²) 压到 O(L log L)
- [[sasrec-2018]] —— SASRec — 用 Transformer 的 self-attention 替 RNN 做下一步推荐
- [[starcoder-2023]] —— StarCoder — 把训练数据完整公开的 15B 代码模型
- [[tabpfn-2023]] —— TabPFN — 一秒解决小表格分类的 Transformer
- [[xlnet-2019]] —— XLNet — 把句子打乱顺序读，借此同时拿到 AR 和双向
