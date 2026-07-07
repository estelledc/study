---
title: RAG (Lewis 2020) — 检索增强生成奠基
来源: 'Lewis et al., "Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks", NeurIPS 2020'
日期: 2026-05-29
分类: AI / NLP
难度: 中级
---

## 是什么

RAG（**Retrieval-Augmented Generation**，检索增强生成）是 Meta 2020 年提出的——**先去文档库里查资料，再让大模型基于查到的资料生成答案**。

日常类比：[[gpt-3]] 像**闭卷考试**（凭脑子里记的内容答题）；RAG 像**开卷考试**（先翻书找到相关章节，再边看边写）。

把 LM 的"死记硬背"改成"先查资料再回答"——一个简单但根本的改动。

## 为什么重要

不理解 RAG，下面这些事都没法解释：

- 为什么 ChatGPT 加了 web search 模式后回答 2024 年新闻不靠重训——背后是 RAG
- 为什么 Bing Chat / Perplexity / Claude 文件上传后能引用具体段落——RAG 把检索来源暴露成 citation
- 为什么"减少幻觉"成了 LLM 落地最常被提的需求——RAG 给生成加了"有据可循"的回路
- 为什么现代企业 LLM 应用 80% 是 RAG 范式——它是第一个把"AI 学会查资料"工程化的方法
- 为什么后来出现 [[graphrag]] / Self-RAG / RAG 2.0 等一长串变体——它们都在改 Lewis 2020 这一篇的局部

## 核心要点

RAG 的核心可以拆成 **三件事**：

1. **Retriever（找资料的）**：把问题编码成向量，从文档库里捞出最相关的 top-k 段。常见实现是 DPR（BERT 双编码器）做稠密检索，或 BM25 做稀疏检索，或两者混用。类比：图书管理员看你问题去找书。

2. **Generator（写答案的）**：基于"问题 + 检索到的文档"一起生成答案。Lewis 2020 用的是 BART，现代实现用 Llama / GPT。类比：你看完书后用自己的话写答案。

3. **联合训练（两者一起学）**：retriever 不是固定的检索算法——它会通过"哪些文档帮 generator 答对题"这个信号反向更新自己。这是 Lewis 2020 真正新的贡献——让 retriever 学到"什么文档对 generation 有用"，而不仅是字面相似。

## 实践案例

### 案例 1：开卷 vs 闭卷的差距

问："Who won the Nobel Prize in Chemistry 2024?"

- **闭卷（GPT-3 / T5）**：只能靠训练时记住的内容答。训练 cutoff 是 2023，它要么乱编（hallucination），要么说不知道。
- **RAG（开卷）**：retriever 先查"2024 Nobel Chemistry"相关新闻段落，generator 看完段落生成 "Demis Hassabis, John Jumper, David Baker"。
- **关键差异**：RAG 不需要重训就能用最新数据——文档库更新就行。

### 案例 2：论文里的硬数字

Natural Questions（一个开放域问答评测集）上的 EM（Exact Match）准确率：

| 模型 | 参数量 | NQ EM |
|---|---|---|
| T5（闭卷，纯记忆） | 11B | 36.6% |
| RAG-Sequence（开卷） | 626M | **44.5%** |

626M 参数的 RAG 把 11B 参数的 T5 打了 8 分。这是社区被"retrieval 比单纯堆参数划算"说服的关键证据。

### 案例 3：现代实现长什么样

```python
# 伪代码：现代 RAG 的最小骨架
query = "什么是 lambda 演算？"

# 1. Retriever：把问题转向量，去 vector DB 查
query_vec = embed(query)                    # 比如 sentence-transformers
top_docs = milvus.search(query_vec, k=5)    # [[milvus]] 存的向量

# 2. Generator：把问题 + 文档拼成 prompt 喂给 LLM
prompt = f"基于以下资料回答：\n{top_docs}\n\n问题：{query}"
answer = llama.generate(prompt)
```

这就是 LangChain / LlamaIndex 的核心 5 行——本质都是 Lewis 2020 那张图的复刻。

## 踩过的坑

1. **检索质量决定一切**：如果 retriever 没找到相关文档，再强的 generator 也救不回来。"Garbage in, garbage out" 在 RAG 里特别明显。新人常以为换更大的 LLM 就能提升——其实 90% 的问题在 retrieval 端。

2. **chunking（切段）是工程灾区**：论文用 Wikipedia 100 词一段，结构干净。真实企业文档（合同 / 长 PDF / Markdown 文档）切多大、按什么切，至今没标准答案。切错了 retriever 找到的段落根本没包含答案。

3. **embedding 模型不通用**：DPR 是在英文 Wikipedia 上训的——直接拿到代码搜索 / 中文 / 法律领域效果会崩。需要换领域专用 encoder（unixcoder 搜代码、bge-zh 搜中文）。

4. **k 太小漏答案，k 太大塞爆 context**：top-k 取 5 漏关键文档，取 50 又把 context window 塞满让 generator 抓不住重点。需要按任务调。

## 适用 vs 不适用场景

**适用**：

- 时效性强的问答（新闻 / 金融 / 体育赛事）——文档库一更新就生效
- 企业知识库 + LLM（HR 政策、内部 wiki、客服 FAQ）——不需要重训就能用私有数据
- 需要给出引用的回答（学术、法律、医疗）——RAG 自带 source 可追溯
- 长尾事实问答（人名、地名、日期）——比纯参数化模型记得更准

**不适用**：

- 需要全局推理 / 多跳综合的任务——vector top-k 太 flat，[[graphrag]] 之类是补救
- 文档库特别小（< 100 段）——直接把文档塞进长 context 模型更省事
- 输入文档已经在 context 里——没必要再检索一遍
- 创造性任务（写诗 / 头脑风暴）——没"标准答案"可检索

## 历史小故事（可跳过）

- **2017 年**：DrQA（Chen 等）做开放域问答 pipeline——BM25 检索 + BERT reader 做 span 抽取。能查资料但只会 extract，不会 paraphrase。
- **2019 年**：ORQA（Lee 等）第一次让 retriever 端到端可学，但 generator 还是 extractive。
- **2020-04**：DPR（Karpukhin 等，同一家 Meta FAIR）发——稠密向量双编码器 + in-batch negatives，比 BM25 强且可微分。
- **2020-05**：Lewis 等把 DPR + BART 拼成 RAG，端到端训练，发 NeurIPS 2020。**这是本篇**。
- **2022**：Atlas / RETRO（DeepMind）证明检索式 LM 可以 scale 到 7B 参数，跟纯参数化模型在 few-shot 上打平。
- **2023**：LangChain / LlamaIndex 把 RAG 做成产品级框架——chunking / vector store / prompt 模板全部工程化。所有人都能 5 行代码搭 RAG。
- **2024**：GraphRAG（微软）批评 flat top-k 漏全局结构，用 graph + community summary 替代；混合检索（dense + sparse）成为新基线。

整个 RAG 赛道从 2020 一篇 19 页论文长成 2024 的整个工业生态。

## 学到什么

1. **"模型 + 外部记忆"比"更大的模型"经常更划算**——626M 参数的 RAG 打 11B 的 T5，是工程取舍上的重要教训
2. **联合训练让 retriever 学到任务特定的相关性**——"字面相似"和"对生成有用"是两件事
3. **方法论 → 工程取舍 → 产品化** 走了 4 年：2020 论文 → 2022 大规模化 → 2023 LangChain 工程化
4. **Hot-swap 索引**是 RAG 最酷的能力——换文档库 = 换知识，不需要重训模型
5. **chunking 策略决定 80% 检索质量**：太短切丢上下文，太长里塞噪声；现代 RAG 系统的 retriever 调到 95 分都没用，如果 chunking 还停在"500 字硬切"的水位
6. **检索结果不一定是答案**：RAG 假设"检索到的 top-k 包含真相"，但实际生产里 top-k 经常都对不上问题——这时候 generator 会编。RAG 系统的 hallucination 主要不是 generator 的错，是 retriever 的失败被 generator 兜了。
7. **联合训练 vs 冻结向量**：原版 RAG 让 retriever 跟着 generator 一起反向传播，所以 retriever 学到的"相关性" 是和最终生成对齐的；现代工程为了简单大多冻 retriever，相当于退化成"靠运气" 的版本。
8. **626M 打 11B 的工程意义**：模型 + 外部记忆 比"更大的模型" 经常更划算；这给了"小模型 + 大检索库" 一条独立路线，不需要每次都堆参数。
9. **知识更新不再等下次预训练**：RAG 把"知识" 从 weight 搬到 index，更新文档库就更新答案——这条工程红利让企业级 LLM 落地几乎离不开它。

## 延伸阅读

- 论文 19 页 PDF：[Lewis et al. 2020 — Retrieval-Augmented Generation](https://arxiv.org/abs/2005.11401)（推导公式 + 实验全在 Section 2-4）
- 视频教程：[Stanford CS224N — Open-Domain QA & RAG](https://web.stanford.edu/class/cs224n/)（把 retriever / generator 拆开讲）
- 自己搭一个：LangChain + Chroma + Llama，30 行代码跑通 toy RAG
- [[graphrag]] —— 微软 2024 年对 flat top-k 的批评和替代
- [[milvus]] —— 现代 vector DB 的代表，给 retriever 提供高效向量检索

## 关联

- [[gpt-3]] —— 闭卷派代表；RAG 是它的"开卷"对照组
- [[graphrag]] —— RAG 的反对者后作；批评 vector top-k 漏全局结构
- [[milvus]] —— 给 retriever 提供高效向量检索的工程基建
- [[bert]] —— DPR 双编码器的 backbone；RAG retriever 的实现基础

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[atlas-2022]] —— Atlas — 把检索器和生成器一起训练，11B 打 540B
- [[bert]] —— BERT — 双向 Transformer 预训练
- [[gpt-3]] —— GPT-3 — Language Models are Few-Shot Learners
- [[graphrag]] —— GraphRAG — 微软的知识图谱 + RAG
- [[milvus]] —— Milvus — 开源向量数据库
- [[nlp-agent-2024]] —— Cognitive Architectures for Language Agents (CoALA)
- [[nlp-rag-2024]] —— RAG for AIGC: 检索增强生成在 AI 生成内容中的应用 — 学习笔记
- [[realm]] —— REALM — 把检索器和 BERT 一起预训练的第一篇论文
- [[replug-2023]] —— REPLUG — 不动 LLM 一根毛，只把检索器调到它的"口味"上
- [[retro]] —— RETRO — DeepMind 的检索增强 LLM
- [[self-rag-2023]] —— Self-RAG — 让模型自己决定何时该查资料

