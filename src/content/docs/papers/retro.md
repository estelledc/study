---
title: RETRO — DeepMind 的检索增强 LLM
来源: 'Borgeaud et al., "Improving Language Models by Retrieving from Trillions of Tokens", DeepMind 2022'
日期: 2026-05-29
分类: AI / NLP
难度: 中级
---

## 是什么

RETRO 是 DeepMind 在 2022 年提出的一种**检索增强语言模型**——它把"模型参数 + 外部检索库"分开，让一个 7B 参数的小模型，配上一个 2 万亿 token 的检索库，做到接近 175B 大模型的效果。

日常类比：

- [[gpt-3]] 像一个"什么都背在脑子里的学者"——知识全靠 175B 参数硬塞进去
- RETRO 像一个"7B 脑子 + 一个超大图书馆"——脑子小，但写答案前先去图书馆翻几页相关书

写一个事实题：

```
问：RETRO 是哪一年发表的？
GPT-3：从 175B 参数里召回"2022"
RETRO：先在 2T 检索库里翻出"DeepMind 2022 RETRO" 这条，再写答案
```

模型小了 25 倍，分数却差不多——因为知识从"塞参数里"换成了"放外部库里"。

## 为什么重要

不理解 RETRO，下面这些事都没法解释：

- 为什么 2024 年的 RAG 系统、Bing Chat、Perplexity 都依赖"小模型 + 大检索库"——RETRO 是这条路线在数学和工程上第一个证明可行的论文
- 为什么"检索增强"不只是 RAG 那样事后查询，还可以**深度集成**进 Transformer 架构本身
- 为什么 [[chinchilla]] 同期出现的"参数越大越好"开始被质疑——RETRO 给出第二条路：不加参数，加检索库
- 为什么"知识更新"在 LLM 时代变得便宜——RETRO 只换检索库，不重训模型

## 核心要点

RETRO 把 [[rag-lewis-2020]] 的事后检索改造成**预训练阶段就用检索**，靠 3 个新设计：

1. **分块检索（Chunked retrieval）**：把输入切成 64 个 token 一组的小块，每块独立去 2T 检索库捞 2 个最相似的邻居。类比：写文章时每写 64 个字就去翻一次资料卡。

2. **跨注意力（Cross-attention）**：每隔 3 层 Transformer，插入一个"跨注意力层"，让生成时的当前 token 同时看自己写过的内容 + 检索回来的邻居。类比：写一句话时一只眼看已写的稿子，另一只眼看翻出的资料卡。

3. **训练时就检索**：RAG 只在推理时检索，RETRO 从预训练第一步就喂检索结果——模型从一开始就学会"怎么用资料卡写答案"，不是事后才被教。

## 实践案例

### 案例 1：7B vs 175B 的等效

DeepMind 实验：

```
175B 参数 GPT-3      →  Pile valid loss 1.85
7.5B 参数 RETRO + 2T  →  Pile valid loss 1.85
```

**模型小 25 倍，loss 一样**。原因：缺的 168B 参数那部分知识，被 2T 外部检索库补上了。

### 案例 2：检索回什么

输入 chunk："The capital of Australia is"

检索库捞出的 2 个邻居（每个 128 tokens）：

```
邻居 1: "...Canberra, the capital of Australia, was founded in 1913..."
邻居 2: "...Australia's federal capital Canberra has population of..."
```

跨注意力层让模型在生成下一个 token 时同时看到这两个邻居——所以它高概率输出 " Canberra"。

### 案例 3：换检索库 = 换知识

推理时，RETRO 的检索库是**热插拔**的：

```python
# 同一个 7.5B RETRO 模型
retro.eval(retrieval_db=wikipedia_2021)   # 用 2021 年 Wikipedia
retro.eval(retrieval_db=wikipedia_2024)   # 换成 2024 年 Wikipedia
```

模型参数完全没动，但回答的"事实"跟着检索库变。这就是"知识与参数解耦"的工程价值——更新知识不用重训模型。

## 踩过的坑

1. **训练集和检索库重叠会让 loss 假性变低**：DeepMind 用同一份 MassiveText 当训练集和检索库——结果模型可能"检索到自己将要训练的 token"，等于作弊。论文 Section 2.6 用 13-gram Jaccard 切出"干净评估子集"后，loss 提升从 ~20% 缩到 ~10%。

2. **跨注意力层不能加太多**：直觉上"每层都加检索"应该最强，实际 9/32 层（约 28%）才最优。原因：检索信号需要先经过几层自注意力消化才有用，加太密反而噪音过载。

3. **冻死的 BERT 检索器换 domain 就崩**：RETRO 用预训练好的 BERT-base 当检索器、永不更新参数。在通用语料上 OK，换到代码 / 法律 / 医疗，BERT 检索质量大跌——后续 RETRO++ 就是在改这一点。

4. **下游任务差距比 loss 大**：论文标题让人觉得"7.5B == 175B"，但这是 valid loss 维度。下游 QA（NaturalQuestions EM）：7.5B RETRO 36.0 vs 175B Gopher 41.5——还是有差距。

## 适用 vs 不适用场景

**适用**：

- 大规模预训练 + 自有 corpus 的场景——省参数，用检索补
- 需要"参数稳定 + 知识可换"的产品（频繁更新知识库但不想重训）
- 学术上理解"检索作为第二个 scaling axis"的根本论文

**不适用**：

- 产品级 chatbot / agent（直接用 GPT-4 / Claude + LangChain 更便宜）→ RAG 风格事后检索
- 长上下文单文档问答（直接塞 1M tokens 进 prompt）
- 跨 domain 部署（frozen BERT 检索器在专业域崩盘）
- 需要多跳推理（RETRO 是 chunk-level flat 检索，不擅长多跳）

## 历史小故事（可跳过）

- **2020-02**：REALM 第一次把检索做进预训练阶段，但 corpus 只有 13M 段，规模很小
- **2020-05**：RAG（Lewis et al.）把检索做进 fine-tune 阶段，奠定 retrieve-then-generate 范式
- **2021-12**：DeepMind 团队（Borgeaud / Mensch / Sifre 等）提出 RETRO，arXiv 首发
- **2022-02**：RETRO v3 终版补 leakage 分析后投 ICML 2022
- **2022-08**：Meta Atlas 出现，挑战 RETRO 的设计选择
- **2023**：NVIDIA RETRO++ / InstructRetro 在 RETRO 基础上加 instruction tuning
- **2024**：[[graphrag]] 批评 flat top-k 检索，提出社区检测式检索

之后 LLM 工业界分成两派：纯参数派（GPT-4 / Claude / Gemini）和检索派（RETRO 系 / RAG 产品栈）。

## 学到什么

1. **检索是第二个 scaling axis**——除了"加参数"，还可以"加检索库"。这是 LLM 工程的根本性洞见，2026 年仍然在影响每一个 RAG 系统的设计

2. **知识可以外置**——参数里塞知识贵又难更新，外部 DB 更便宜更可解释。RETRO 在数学和工程上同时证明了这条路可行

3. **预训练阶段就要喂检索信号**——比 RAG 那样事后才教模型用检索更彻底；模型从第一步就学会"怎么用资料卡"

4. **理论不一定全在实验里**——RETRO 的"7.5B == 175B"在 valid loss 上成立，但下游 QA 上仍有差距。读论文要看 metric 而非标题

## 延伸阅读

- 论文 PDF：[RETRO arXiv 2112.04426](https://arxiv.org/abs/2112.04426)（35 页，前 12 页足够理解核心）
- 社区复刻：[lucidrains/RETRO-pytorch](https://github.com/lucidrains/RETRO-pytorch)（700 星，可以自己跑 toy）
- 配套讲解：[Yannic Kilcher RETRO 视频](https://www.youtube.com/watch?v=A1eUVxscNq8)（30 分钟逐图讲解）
- [[rag-lewis-2020]] —— RETRO 的下游同辈，理解 fine-tune vs pretrain 阶段差异
- [[gpt-3]] —— RETRO 想要替代的 175B 参数化对手
- [[chinchilla]] —— RETRO 同期工作，从 scaling laws 角度质疑参数堆叠

## 关联

- [[rag-lewis-2020]] —— retrieve-then-generate 奠基；RETRO 是它的预训练版
- [[gpt-3]] —— 纯参数化路线的代表；RETRO 是反方
- [[chinchilla]] —— DeepMind 同期工作，从数据角度质疑参数堆叠
- [[graphrag]] —— 2024 年对 flat top-k 检索的批评，是 RETRO + RAG 共同的对立面

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[atlas-2022]] —— Atlas — 把检索器和生成器一起训练，11B 打 540B
- [[chinchilla]] —— Chinchilla — 训练大模型的数据/参数最优比
- [[gpt-3]] —— GPT-3 — Language Models are Few-Shot Learners
- [[graphrag]] —— GraphRAG — 微软的知识图谱 + RAG
- [[nlp-rag-2024]] —— RAG for AIGC: 检索增强生成在 AI 生成内容中的应用 — 学习笔记
- [[rag-lewis-2020]] —— RAG (Lewis 2020) — 检索增强生成奠基
- [[realm]] —— REALM — 把检索器和 BERT 一起预训练的第一篇论文

