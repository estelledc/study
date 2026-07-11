---
title: RAG (Lewis 2020) — 检索增强生成奠基
来源: 'Lewis et al., "Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks", NeurIPS 2020'
日期: 2026-05-29
分类: AI / NLP
难度: 中级
---

## 是什么

RAG（**Retrieval-Augmented Generation**，检索增强生成）是 Facebook AI Research（今 Meta）2020 年提出的——**先去文档库里查资料，再让大模型基于查到的资料生成答案**。

日常类比：[[gpt-3]] 像**闭卷考试**（凭脑子里记的内容答题）；RAG 像**开卷考试**（先翻书找到相关章节，再边看边写）。

把 LM 的"死记硬背"改成"先查资料再回答"——一个简单但根本的改动。

## 为什么重要

不理解 RAG，下面这些事都没法解释：

- 为什么 ChatGPT 加了 web search 模式后回答 2024 年新闻不靠重训——背后是 RAG
- 为什么 Bing Chat / Perplexity / Claude 文件上传后能引用具体段落——RAG 把检索来源暴露成 citation
- 为什么"减少幻觉"成了 LLM 落地最常被提的需求——RAG 给生成加了"有据可循"的回路
- 为什么企业 LLM 落地最常见的范式之一是 RAG——它是第一个把"AI 学会查资料"工程化的方法
- 为什么后来出现 [[graphrag]] / Self-RAG / RAG 2.0 等一长串变体——它们都在改 Lewis 2020 这一篇的局部

## 核心要点

RAG 的核心可以拆成 **三件事**：

1. **Retriever（找资料的）**：把问题编码成向量，从文档库里捞出最相关的 top-k 段。常见实现是 DPR（BERT 双编码器）做稠密检索，或 BM25（按词频打分的经典搜索，像图书馆按关键词找书）做稀疏检索，或两者混用。类比：图书管理员看你问题去找书。

2. **Generator（写答案的）**：基于"问题 + 检索到的文档"一起生成答案。Lewis 2020 用的是 BART（一种能读能写的序列到序列模型），现代实现用 Llama / GPT。类比：你看完书后用自己的话写答案。

3. **联合训练（两者一起学）**：retriever 不是固定的检索算法——它会通过"哪些文档帮 generator 答对题"这个信号反向更新自己。这是 Lewis 2020 真正新的贡献——让 retriever 学到"什么文档对 generation 有用"，而不仅是字面相似。

## 实践案例

### 案例 1：开卷三步答新题

问："Who won the Nobel Prize in Chemistry 2024?"

1. **检索**：retriever 用问题向量去文档库查"2024 Nobel Chemistry"相关新闻段
2. **拼 prompt**：把 top-k 段落和问题拼在一起，交给 generator
3. **生成**：generator 读完段落写出 "Demis Hassabis, John Jumper, David Baker"

闭卷模型（训练 cutoff 在 2023）只能靠记忆——要么乱编（hallucination），要么说不知道。RAG 不重训，文档库一更新就能答新题。

### 案例 2：论文里的硬数字

Natural Questions（开放域问答评测集）上的 EM（Exact Match，答案字符串完全对上才算分）：

| 模型 | 参数量 | NQ EM |
|---|---|---|
| T5（闭卷，纯记忆） | 11B | 36.6% |
| RAG-Sequence（开卷） | 626M | **44.5%** |

怎么读：右边一列越高越好；626M 的 RAG 比 11B 的 T5 高约 8 分——社区被"retrieval 比单纯堆参数划算"说服的关键证据。

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

这就是 LangChain / LlamaIndex 的核心骨架——本质都是 Lewis 2020 那张图的复刻。

## 踩过的坑

1. **检索质量决定一切**：retriever 没找到相关文档，再强的 generator 也救不回来；新人常以为换更大 LLM 就能提升，其实多数问题在 retrieval 端。
2. **chunking（切段）是工程灾区**：论文用 Wikipedia 约 100 词一段；真实合同 / PDF 切错，找到的段落里根本没有答案。
3. **embedding 模型不通用**：DPR 在英文 Wikipedia 上训——直接拿去搜代码 / 中文 / 法律会崩，要换领域 encoder。
4. **k 太小漏答案，k 太大塞爆 context**：top-k=5 可能漏关键段，=50 又让 generator 抓不住重点，需按任务调。

## 适用 vs 不适用场景

**适用**：

- 时效性强的问答（新闻 / 金融 / 体育）——文档库一更新就生效
- 企业知识库 + LLM（HR 政策、内部 wiki、客服 FAQ）——不重训就能用私有数据
- 需要给出引用的回答（学术、法律、医疗）——RAG 自带 source 可追溯
- 长尾事实问答（人名、地名、日期）——比纯参数化模型更稳

**不适用**：

- 需要全局推理 / 多跳综合——vector top-k 太 flat，[[graphrag]] 之类是补救
- 文档库特别小（< 100 段）——直接塞进长 context 更省事
- 输入文档已经在 context 里——没必要再检索一遍
- 创造性任务（写诗 / 头脑风暴）——没有"标准答案"可检索

## 历史小故事（可跳过）

- **2017 年**：DrQA（Chen 等）——BM25 检索 + BERT reader 做 span 抽取，能查但只会 extract。
- **2019 年**：ORQA（Lee 等）让 retriever 端到端可学，generator 仍是 extractive。
- **2020-04**：DPR（Karpukhin 等，FAIR）——稠密双编码器 + in-batch negatives。
- **2020-05**：Lewis 等把 DPR + BART 拼成 RAG，端到端训练，发 NeurIPS 2020。**这是本篇**。
- **2021–2022**：RETRO（DeepMind，2021 arXiv / ICML 2022）与 Atlas（2022）证明检索式 LM 可 scale，few-shot 上逼近纯参数化大模型。
- **2023–2024**：LangChain / LlamaIndex 工程化；GraphRAG 批评 flat top-k，混合检索成新基线。

从 19 页论文到整条工业赛道，核心仍是 Lewis 2020 那张「先查再写」的图。

## 学到什么

1. **"模型 + 外部记忆"常比"更大的模型"划算**——626M RAG 打 11B T5，给了"小模型 + 大检索库"一条独立路线
2. **联合训练让 retriever 学"对生成有用"**——字面相似 ≠ 任务相关；现代工程常冻住 retriever，等于丢掉这篇的核心红利
3. **Hot-swap 索引**：知识从 weight 搬到 index，换文档库 = 换知识，不必等下次预训练
4. **chunking 与 retrieval 失败主导幻觉**：top-k 对不上问题时 generator 会编——多数生产事故在检索端，不在生成端
5. **方法论 → 产品化大约走了三年**：2020 论文 → 2021–22 scale → 2023 框架把 chunking / vector store / prompt 模板工程化

## 延伸阅读

- 论文 19 页 PDF：[Lewis et al. 2020 — Retrieval-Augmented Generation](https://arxiv.org/abs/2005.11401)（推导公式 + 实验全在 Section 2-4）
- 视频教程：[Stanford CS224N — Open-Domain QA & RAG](https://web.stanford.edu/class/cs224n/)（把 retriever / generator 拆开讲）
- 自己搭一个：LangChain + Chroma + Llama，30 行代码跑通 toy RAG
- [[graphrag]] —— 微软 2024 年对 flat top-k 的批评和替代
- [[milvus]] —— 现代 vector DB 的代表，给 retriever 提供高效向量检索
- [[retro]] —— DeepMind 检索增强 LM，看 RAG 思路如何 scale

## 关联

- [[gpt-3]] —— 闭卷派代表；RAG 是它的"开卷"对照组
- [[graphrag]] —— RAG 的反对者后作；批评 vector top-k 漏全局结构
- [[milvus]] —— 给 retriever 提供高效向量检索的工程基建
- [[bert]] —— DPR 双编码器的 backbone；RAG retriever 的实现基础
- [[retro]] —— 把检索增强推到更大参数与更多 token 的后续路线
- [[realm]] —— 更早把检索器与语言模型一起预训练的近亲
## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[atlas-2022]] —— Atlas — 把检索器和生成器一起训练，11B 打 540B
- [[gemini-1.5-2024]] —— Gemini 1.5 — 百万 token 多模态上下文的工程样板
- [[graphrag]] —— GraphRAG — 微软的知识图谱 + RAG
- [[hullft-ttft]] —— HullFT — 让测试时微调既会挑样本又省算力
- [[loong-doc-mt]] —— Loong DocMT — 长文档翻译里的会挑上下文的代理
- [[medcase-fhir]] —— MedCase-Structured — 把病例文字变成 FHIR 病历来考 LLM
- [[mem-ft-lora]] —— MemFT-LoRA — 用 LoRA 量出大模型能背多少精确内容
- [[nlp-agent-2024]] —— Cognitive Architectures for Language Agents (CoALA)
- [[nlp-rag-2024]] —— RAG for AIGC: 检索增强生成在 AI 生成内容中的应用 — 学习笔记
- [[realm]] —— REALM — 把检索器和 BERT 一起预训练的第一篇论文
- [[replug-2023]] —— REPLUG — 不动 LLM 一根毛，只把检索器调到它的"口味"上
- [[retro]] —— RETRO — DeepMind 的检索增强 LLM
- [[self-rag-2023]] —— Self-RAG — 让模型自己决定何时该查资料
- [[milvus]] —— Milvus — 开源向量数据库
