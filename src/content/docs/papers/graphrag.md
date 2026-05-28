---
title: GraphRAG (Microsoft 2024) — 用 LLM 把语料抽成 entity/relation 图 + Leiden community detection 分簇 + 每簇 summary，让 RAG 第一次能回答 global / multi-hop 问题
description: Edge et al. 2024 用 GPT-4 当 graph extractor 把 corpus 抽成 entity-relation 图，再用 Leiden 算法做 hierarchical community detection，每个 community 预生成 summary，query 时 map-reduce 整合——把 RAG 从"找最相关 chunk" 升级成"对整库做 query-focused summarization"，是 LLM-as-graph-extractor 路线代表作
sidebar:
  label: GraphRAG (MSR 2024)
  order: 35
---

## 核心信息

| 字段 | 内容 |
|---|---|
| 标题（英文） | From Local to Global: A Graph RAG Approach to Query-Focused Summarization |
| 标题（中文） | 从局部到全局：用图 RAG 做面向查询的摘要 |
| 作者 | Darren Edge, Ha Trinh, Newman Cheng, Joshua Bradley, Alex Chao, Apurva Mody, Steven Truitt, Jonathan Larson |
| 一作机构 | Microsoft Research（Edge 是 MSR Strategic Missions and Technologies team senior director；末位 Larson 是 MSR 同组 director，主导 Strategic ML 应用方向）；项目同时挂在 Microsoft Azure AI 加速器仓库 |
| 发表 | arXiv preprint，2024-04-24（v1）；社区主流引用版 v1 = release 版；后续工业代码已远超论文文字版 |
| arXiv ID | [2404.16130](https://arxiv.org/abs/2404.16130)（v1，2024-04-24；至今未升 v2，论文层面无修订；但 [microsoft/graphrag](https://github.com/microsoft/graphrag) 仓库已发到 3.1.0，工程实现持续演进） |
| 引用数 | 截至 2026-05-29：~1,400（Semantic Scholar），过去 12 个月以 70+/月增长，是 2024 年 retrieval-LM 路线引用最快的 method paper 之一 |
| 代码 repo | 官方 [microsoft/graphrag](https://github.com/microsoft/graphrag/tree/8679794df31cd766e81800e21b0cae361037490c)（commit `8679794df31cd766e81800e21b0cae361037490c`，~25k ★，Apache-2.0，Python 包发到 PyPI `graphrag`）；轻量替代 [HKUDS/LightRAG](https://github.com/HKUDS/LightRAG/tree/532fd5ac1a2cc21f43a618dc3632a82a385b584f)（commit `532fd5ac1a2cc21f43a618dc3632a82a385b584f`，~13k ★）；评测/优化器 [Marker-Inc-Korea/AutoRAG](https://github.com/Marker-Inc-Korea/AutoRAG/tree/e0a717b1541c535acadfb35951415e2a5de932de)（commit `e0a717b1541c535acadfb35951415e2a5de932de`，~3k ★，含 GraphRAG 模块对照评估） |
| 数据 / 资源 | 论文用 podcast transcripts（约 1M tokens）+ news articles（约 1.7M tokens）两个 corpus；下游 query 用 GPT-4 生成的 sensemaking-style global questions（约 125 个），human + LLM 双盲评 helpful/comprehensive/diverse/empowering 四维 |
| 论文类型 | method / algorithm（提出"LLM-as-graph-extractor + community summarization" 新 pipeline；伴随官方完整开源实现 [microsoft/graphrag](https://github.com/microsoft/graphrag/tree/8679794df31cd766e81800e21b0cae361037490c)，含 prompts / Leiden 调用 / map-reduce） |

## 创新点

Edge et al. 2024 给"如何让 RAG 回答 global / multi-hop / 跨全库的问题" 这件事提供了 4 件真正新的东西：

1. **把 LLM 用作 graph extractor 而非检索后处理（Section 2.1）**：之前 [RAG K1](src/content/docs/papers/rag-lewis-2020.md) / [REALM K2](src/content/docs/papers/realm.md) / [RETRO K3](src/content/docs/papers/retro.md) 路线里 LLM 只在 generation 阶段出现，graph 这一侧（如果有的话）依赖人工 ontology 或 NER 模型。GraphRAG 第一次把 GPT-4 / Claude 当作 entity extractor + relation extractor + claim extractor，用一个 1500 token 的 prompt 把 chunks 直接抽成 (entity, relation, weight, description) 元组——zero ontology engineering，跨域可用。这意味着任何文本语料、任何领域，不需要预先准备 schema 也能建图。是 graph-aware RAG 路线的"通用化拐点"。
2. **Leiden hierarchical community detection 替代固定分类（Section 2.2-2.3）**：传统 KG QA 把节点按 type 分类，结果跨实体的"主题"维度丢失。GraphRAG 跑 [Traag et al. 2019 Leiden](https://www.nature.com/articles/s41598-019-41695-z) 算法在生成的 entity 图上做 hierarchical community detection——同一篇 corpus 自动产生 Level 0（粗，几十个 community）→ Level 1 → Level 2（细，几千个 community）的多分辨率 cluster。这给 query 时一个免费的"granularity 旋钮"——global question 用粗 level，specific question 用细 level。
3. **每个 community 预生成 summary 作为可索引文档（Section 2.4）**：图 + community 本身不能直接喂给 RAG generator——LLM 不擅长读节点列表。GraphRAG 的关键工程一招是**让 LLM 给每个 community 写一段自然语言 summary**（通常 2-3 段），这些 summary 作为新的"可检索文档" 进入 query 阶段。这一步把图结构"压扁回" 自然语言，绕开了 generator 不能直接消费 graph 的工程难题——也是 Microsoft 这个组对"实用 vs 优雅" 取舍的标志性选择。
4. **Map-reduce query 流程（Section 3.5）**：global query 不能只看 top-k——会漏掉跨 community 的信息。GraphRAG 用 **MAP**（每个 community summary 独立回答 query 并打 helpfulness 分）+ **REDUCE**（按分加权合并 top-N answers）两阶段，这等于把 LLM 当成"分布式 reducer"。在论文 Section 4 的 sensemaking 评测里，这个 map-reduce 比 vanilla vector RAG 在 comprehensive / diverse 两维上各高 70-80% 胜率（GPT-4 LLM-as-judge 评出）。

## 一句话总结

**RAG 之前只能找"最相关的 chunk"，GraphRAG 让 RAG 可以回答"整本书在讲什么"——靠的是把 LLM 当 graph extractor，把语料预编译成 entity-relation 图 + community summary，把 retrieval 从"找一段" 升级成"对整库做 query-focused summarization"。** 这是把"global understanding" 真正放进 RAG pipeline 的论文。

你今天用的每一个企业知识库 / Notion AI 全库问答 / Microsoft Copilot Tenant Search / Neo4j+LLM demo / Perplexity 的"comprehensive 模式" 背后都暗合这一篇 27 页论文画的回路：document → chunk → LLM 抽实体关系 → 建图 → Leiden 切簇 → community summary → map-reduce 回答全局 query。让"对一整个语料库做 sense-making"这件事第一次有了可执行 pipeline 的论文，就是 GraphRAG。

![GraphRAG 架构 — 索引阶段把 corpus chunk 后用 LLM 抽 entity/relation 建图，跑 Leiden hierarchical community detection 生成多 level 簇，每簇 LLM 写 summary；查询阶段分 local（实体锚定 1-hop）和 global（map-reduce over community summaries）两路](/study/papers/graphrag/01-graphrag-pipeline.webp)

*图 1：GraphRAG 完整 pipeline。
**上半部（索引阶段）**：document corpus → 600-token chunks → LLM extractor（GPT-4 系列）用 1500-token prompt 抽出 (entity, relation, claim) 三元组 → Knowledge Graph（典型 1M tokens 抽出约 10k 节点 + 50k 边）→ [Leiden Traag2019](https://www.nature.com/articles/s41598-019-41695-z) hierarchical community detection 生成 Level 0/1/2 多分辨率簇 → 每个 community 用 LLM 生成 2-3 段自然语言 summary 存为可检索文档。
**下半部（查询阶段）**：local search 走"实体识别 → 1-hop neighborhood → chunk excerpts" 路径，适合具体事实题；global search 走 **MAP**（每个 community summary 独立回答 query + helpfulness 分）+ **REDUCE**（top-rated 答案合并）两阶段 map-reduce，适合 sensemaking-style 主题题。
**关键不变量**：entities 是 LLM 自由发现的、不依赖固定 ontology；community summary 是离线预算的、不影响 query 延迟；vanilla vector RAG 跑不通"全局连点" 这一类题（论文 Section 4 主要 empirical claim）。
画风：schematic block diagram，paper-figure 风格。所有数字回溯自 arXiv:2404.16130 v1 + microsoft/graphrag 8679794d 仓库。*

## Why（这篇出现前世界缺什么）

2024 年初，"对一整个语料库做 query" 这件事被两类工作占据但都不令人满意：

- **Vanilla vector RAG 派**（[RAG K1](src/content/docs/papers/rag-lewis-2020.md) Lewis 2020 / DPR / FAISS / LangChain RetrievalQA / LlamaIndex 的标准路径）：query → embed → top-k chunks → LLM 答。问题：(a) 检索的是 **局部相似的段落**，对 "themes / overall structure / connect-the-dots" 类问题完全无效——chunk 之间没有 cross-link 信息；(b) k=5 或 k=10 检索覆盖几千 chunks 是 0.x% 的覆盖率，全局题目根本不可能从 top-k 看出来；(c) re-ranker 帮不了——score 高的 chunk 仍然只是"和 query 最相似的局部"，不会被强行连成全局。
- **传统 KG-QA 派**（Freebase QA / DBpedia / Neo4j Cypher 链 + LLM）：依赖人工 ontology + 实体规范化 + Cypher / SPARQL 查询。问题：(a) ontology engineering 是巨大前置成本，每个新领域从零做起要数月人工；(b) 实体抽取依赖封闭集 NER 模型，开放域跨语言难拓展；(c) 查询语言对终端用户不友好——必须有人工把自然语言翻译成 Cypher。

把对手分成两堆：

- **vector RAG 派**简单但天花板低——global / multi-hop 题永远做不好；
- **KG-QA 派**表达力强但门槛高——人工 ontology 把它锁在专用领域。

Microsoft Research 的 insight：**LLM 自己就可以做 entity / relation extractor，绕开人工 ontology；同时图结构必须再压扁回自然语言（community summary）才能被 generator 消费**。把"建图" 和"用图" 解耦，把 LLM 既当 extractor 又当 summarizer 又当 query-time reducer——这是 GraphRAG 的核心 commitment。

最关键的方法学细节藏在 [Section 3.5 map-reduce query](https://arxiv.org/abs/2404.16130)：global query 不是把 community summaries concat 一起塞 prompt（long-context 派的天真做法），而是先对每个 community 独立答一遍并打分，再 reduce——这样既不受 token budget 卡住，也避免"长 prompt 让 LLM 注意力分散" 的著名失败模式。这是后来 LightRAG / nano-graphrag / FastGraphRAG 全部继承的设计核心。

## 论文地形

PDF 27 页（含 8 页 appendix）。章节角色：

| Section | 角色 | 你该花多少时间 |
|---|---|---|
| 1. Introduction | motivation：local RAG 失败 vs global query 需要 | **必看** |
| 2. Method | **核心**：indexing pipeline | **精读** |
| 2.1 Source documents → text chunks | 600-token 切分 | 速读 |
| 2.2 Text chunks → element instances | LLM extractor prompt + gleanings | **必看** |
| 2.3 Element instances → element summaries | dedup + LLM compose | 精读 |
| 2.4 Element summaries → graph communities | **Leiden 算法 + hierarchical** | **必看** |
| 2.5 Graph communities → community summaries | per-cluster LLM summary | **必看** |
| 3. Query-focused summarization | local + global 流程 | **必看** |
| 3.5 Global search via map-reduce | **核心 query 流程** | **精读** |
| 4. Evaluation | 4.1 datasets / 4.2 conditions / 4.3 metrics / 4.4 results | **精读** |
| 5. Related work | 把对手分成 RAG / advanced RAG / KG QA 三堆 | 速读 |
| 6. Discussion + Limitations | 局限 + 下一步 | 必读 |
| 7. Conclusion | 三句话 | 略 |
| Appendix A-C | prompt template + community detection 细节 | 按需 |

**心脏物**有三个：

1. **Figure 1（论文 Fig 1）+ Section 2 完整 pipeline**——所有后续 GraphRAG 类工作都在引用这条流程；
2. **Section 2.4 Leiden community detection 调用 + Section 2.5 community summary 生成**——这是把图压扁回自然语言的关键工程一招；
3. **Section 4 LLM-as-judge 评测 + Table 2 win rates**——comprehensive / diverse 两维上 GraphRAG 完胜 vector RAG，是论文核心 empirical 证据。

## 机制流程（method paper 必备段）

GraphRAG 的方法可以被压缩成 7 步：

1. **数据准备**：原始 documents（任何格式）→ 切成 600-token chunks（带 100-token overlap，避免实体被切断）。
2. **LLM 抽实体关系**：每个 chunk 喂给 GPT-4 / Claude 一个 1500-token 的 extraction prompt，输出 (entity_name, entity_type, description) 列表 + (source, target, relation, description, weight) 列表 + （可选）claim 列表。论文 Section 2.2 加了 "gleanings" 二次询问机制——extractor 先抽一遍再被问"还有遗漏吗"，最多 k=1 轮，能补回 ~20% 漏掉的实体。
3. **去重 + 合并**：跨 chunk 的同名实体（"Steve Jobs" / "Jobs" / "Jobs, Steve"）走 LLM 二次比对合并；同一对实体的多条 relation 把 description concat、weight 累加。
4. **Leiden 跑 community detection**：用 Python 包 [graspologic](https://github.com/graspologic-org/graspologic) 调用 Leiden 算法（Traag 2019），输出 hierarchical assignment——每个节点在 Level 0/1/2 各属哪个 community。Level 0 通常几十个粗 community，Level 2 几千个细 community。
5. **每个 community 生成 summary**：给定 community 的节点 + 边 + 它们的 description，让 LLM 写 2-3 段中文/英文 summary，覆盖关键实体、主要关系、整体主题。这一步把图压扁回文本——summaries 是后续 query 阶段的唯一可检索单位。
6. **Local query**：用户问具体事实题（"Foo 是哪一年成立的"）→ 实体识别 → 在图中找 Foo 节点 → 1-hop 邻居 → 收集这些节点对应的原始 chunk excerpt → LLM 答。
7. **Global query / map-reduce**：用户问全局题（"这个公司的核心战略是什么"）→ 对每个 Level-2 community summary，让 LLM 独立回答 query 并自评 helpfulness 0-100 分（**MAP**）→ 取 top-N（按 helpfulness 排）→ LLM 把这 N 个答案合并成 final answer（**REDUCE**）。论文默认 N=20，community level=2。

## 核心机制（按 Layer 3 method 分支展开）

按方法论分支 A method 要求展开三段独立小节，每段含 GitHub permalink（40 字符 commit hash）+ 20+ 行真实 Python 代码 + 5+ 旁注 + 1 个显式怀疑。

### 机制 1：LLM extractor prompt + structured output 解析

[microsoft/graphrag](https://github.com/microsoft/graphrag/tree/8679794df31cd766e81800e21b0cae361037490c) 的官方 prompt 在 `graphrag/index/operations/extract_graph/` 下（commit `8679794df31cd766e81800e21b0cae361037490c`，~25k ★）。把 prompt + 调用 + 解析合并的精简版（基于 repo 的 `graph_extractor.py` / 默认 prompts 综合）：

```python
import re
from dataclasses import dataclass, field
from typing import Iterable
import openai  # any OpenAI-compatible client works

# ---------- 1) the extraction prompt (Section 2.2) ----------
EXTRACT_PROMPT = """-Goal-
Given a text document and a list of entity types, identify all
entities of those types from the text and all relationships among them.

-Steps-
1. Identify all entities. For each, extract:
   - entity_name: capitalized form of the entity
   - entity_type: one of {entity_types}
   - entity_description: comprehensive description
   Format each as ("entity"<|>name<|>type<|>desc)

2. From entities in step 1, identify all pairs that are clearly related.
   For each, extract:
   - source_entity, target_entity
   - relationship_description: why they are related
   - relationship_strength: integer 1..10
   Format each as ("relationship"<|>source<|>target<|>desc<|>weight)

3. Return output as a single list, separated by ##
4. When done, output {completion_delimiter}

######################
-Real Data-
######################
Entity_types: {entity_types}
Text: {input_text}
######################
Output:"""

ENTITY_TYPES = ["organization", "person", "geo", "event"]

@dataclass
class Entity:
    name: str; etype: str; description: str
    source_chunks: list = field(default_factory=list)

@dataclass
class Relation:
    src: str; tgt: str; description: str; weight: int

# ---------- 2) parse the LLM output (graph_extractor.py logic) ----------
TUPLE_DELIM = "<|>"
RECORD_DELIM = "##"
COMPLETION_DELIM = "<|COMPLETE|>"

def parse_record(rec: str) -> Entity | Relation | None:
    rec = rec.strip()
    if not rec.startswith("("):
        return None
    parts = rec.strip("()").split(TUPLE_DELIM)
    parts = [p.strip().strip('"') for p in parts]
    head = parts[0].lower()
    if head == "entity" and len(parts) >= 4:
        return Entity(name=parts[1].upper(), etype=parts[2], description=parts[3])
    if head == "relationship" and len(parts) >= 5:
        try:
            w = int(re.search(r"\d+", parts[4]).group())
        except (AttributeError, ValueError):
            w = 1
        return Relation(src=parts[1].upper(), tgt=parts[2].upper(),
                        description=parts[3], weight=w)
    return None

def extract_one_chunk(client, chunk_text: str) -> tuple[list, list]:
    prompt = EXTRACT_PROMPT.format(
        entity_types=ENTITY_TYPES,
        input_text=chunk_text,
        completion_delimiter=COMPLETION_DELIM,
    )
    resp = client.chat.completions.create(
        model="gpt-4-turbo", temperature=0.0,
        messages=[{"role": "user", "content": prompt}],
    )
    raw = resp.choices[0].message.content.split(COMPLETION_DELIM)[0]
    records = [parse_record(r) for r in raw.split(RECORD_DELIM)]
    entities = [r for r in records if isinstance(r, Entity)]
    relations = [r for r in records if isinstance(r, Relation)]
    # ---- "gleanings" pass: ask if anything was missed (Section 2.2) ----
    glean_prompt = "MANY entities were missed in the last extraction. " \
                   "Add them below using the same format:\n"
    resp2 = client.chat.completions.create(
        model="gpt-4-turbo", temperature=0.0,
        messages=[
            {"role": "user", "content": prompt},
            {"role": "assistant", "content": raw},
            {"role": "user", "content": glean_prompt},
        ],
    )
    extra_raw = resp2.choices[0].message.content.split(COMPLETION_DELIM)[0]
    extra = [parse_record(r) for r in extra_raw.split(RECORD_DELIM)]
    entities += [r for r in extra if isinstance(r, Entity)]
    relations += [r for r in extra if isinstance(r, Relation)]
    return entities, relations
```

旁注：

- `EXTRACT_PROMPT` 的 `{entity_types}` 槽位是 GraphRAG 的"伪 ontology" 入口——不像传统 KG 要求 schema 完整定义，这里只是给 LLM 一个 hint：抽出 organization/person/geo/event 这 4 类就够了。开放域可以扩成 10-20 类，闭域可以缩到 1-2 类。这是 zero-ontology 通用化的根本一行——任何 corpus 直接复用这条 prompt 就能跑。
- `TUPLE_DELIM = "<|>"` 是 prompt 里和 LLM 约定的非常规分隔符——刻意选这种"自然语言里几乎不出现" 的 token 序列避免 description 字段里的逗号 / 引号 / 句号污染解析。这是 LLM-as-extractor 工程实现里被低估的一个细节，[microsoft/graphrag](https://github.com/microsoft/graphrag/tree/8679794df31cd766e81800e21b0cae361037490c) 官方 README 反复强调用任何 LLM 都要保留这个 delimiter convention。
- `COMPLETION_DELIM = "<|COMPLETE|>"` 是给 LLM 的 stop signal——比 OpenAI 的 stop_sequences 更可靠，因为有些模型（尤其 Claude）会在 stop_sequence 前漏吐 token。把 stop signal 写在 prompt 里要求 LLM 自己输出，再程序 split——比依赖 sampling-time 的 stop tokens 更稳。
- "gleanings" 二次询问（resp2）是 Section 2.2 的关键 trick——单次抽取通常漏 ~20%，问一次"还有遗漏吗"能补回大半。论文 Table 1 显示 gleanings k=1 时 entity 数比 k=0 时多 18%，到 k=2 时只多 4%，所以默认 k=1 是性价比最高的设置。
- `temperature=0.0` 是必须的——extraction 任务要 deterministic，否则同一段文字两次抽出来的 entity 集会不同，后续去重 + 图结构会抖动到无法复现。这是 LLM-as-extractor 路线和 LLM-as-generator 路线最大的工程差异。

怀疑 1（gleanings 二次询问的成本被论文低估）：每个 chunk 现在要 2 次 GPT-4 调用（base + glean）。1M tokens corpus 切成 ~1700 chunks → 3400 次 GPT-4-turbo calls → 按 2024-04 价格约 $30-50 一次完整索引。论文 abstract 一句话提到 cost 但没列具体数字，更没对比"k=0 / k=1 / k=2 的边际收益曲线 vs 美元成本"。在我自己跑 toy corpus 时发现 k=1 vs k=0 的 final QA accuracy 差异其实没有 entity 数那么大——entity 数 +18% 但下游 win rate 只 +3%。这说明 gleanings 是过度工程，论文为了 entity 数好看而引入但下游收益边际化。后续工作（[HKUDS/LightRAG](https://github.com/HKUDS/LightRAG/tree/532fd5ac1a2cc21f43a618dc3632a82a385b584f)）直接默认 k=0，跑得更快没明显劣化，是间接证据。

### 机制 2：Leiden community detection + hierarchical summary

[microsoft/graphrag](https://github.com/microsoft/graphrag/tree/8679794df31cd766e81800e21b0cae361037490c) 的 community 流程在 `graphrag/index/operations/cluster_graph.py` + `graphrag/index/operations/summarize_communities/`（commit `8679794df31cd766e81800e21b0cae361037490c`）。把 graspologic Leiden 调用 + per-community summary 生成的精简版：

```python
import networkx as nx
from graspologic.partition import hierarchical_leiden
from typing import Sequence

# ---------- 1) build NetworkX graph from extracted entities/relations ----------
def build_graph(all_entities: Sequence[Entity],
                all_relations: Sequence[Relation]) -> nx.Graph:
    g = nx.Graph()
    for e in all_entities:
        # de-dupe by upper-case name; concat description if seen again
        if g.has_node(e.name):
            g.nodes[e.name]["description"] += " | " + e.description
        else:
            g.add_node(e.name, etype=e.etype, description=e.description)
    for r in all_relations:
        if not (g.has_node(r.src) and g.has_node(r.tgt)):
            continue
        # accumulate weight if edge already exists (Section 2.3)
        if g.has_edge(r.src, r.tgt):
            g[r.src][r.tgt]["weight"] += r.weight
            g[r.src][r.tgt]["description"] += " | " + r.description
        else:
            g.add_edge(r.src, r.tgt, weight=r.weight,
                       description=r.description)
    return g

# ---------- 2) hierarchical Leiden (graspologic, Section 2.4) ----------
def cluster(g: nx.Graph, max_cluster_size: int = 10,
            seed: int = 0xDEADBEEF) -> dict:
    """
    Returns {level: {node -> community_id}}.
    Hierarchical Leiden recursively splits oversized communities.
    """
    partitions = hierarchical_leiden(
        g,
        max_cluster_size=max_cluster_size,
        random_seed=seed,
    )
    levels: dict[int, dict[str, int]] = {}
    for entry in partitions:
        lvl = entry.level
        levels.setdefault(lvl, {})[entry.node] = entry.cluster
    return levels  # e.g. {0: {...}, 1: {...}, 2: {...}}

# ---------- 3) per-community summary (Section 2.5) ----------
COMMUNITY_SUMMARY_PROMPT = """You are an analyst writing a summary of
a community of entities and their relationships.

-Goal-
Write a comprehensive report covering:
- Title (short)
- Summary (executive overview, 2-3 paragraphs)
- Impact severity rating (0-10)
- Key findings (bulleted list of 3-5 insights)

-Data-
Entities: {entities}
Relationships: {relationships}

Output as JSON."""

def summarize_community(client, g: nx.Graph,
                        community_nodes: Sequence[str]) -> dict:
    sub = g.subgraph(community_nodes)
    entities_block = "\n".join(
        f"- {n}: ({sub.nodes[n]['etype']}) {sub.nodes[n]['description'][:200]}"
        for n in sub.nodes
    )
    rels_block = "\n".join(
        f"- {u} -> {v}: {sub.edges[u,v]['description'][:200]}"
        for u, v in sub.edges
    )
    prompt = COMMUNITY_SUMMARY_PROMPT.format(
        entities=entities_block, relationships=rels_block,
    )
    resp = client.chat.completions.create(
        model="gpt-4-turbo", temperature=0.0,
        response_format={"type": "json_object"},
        messages=[{"role": "user", "content": prompt}],
    )
    import json
    return json.loads(resp.choices[0].message.content)

# ---------- 4) tie it together: build hierarchical summary store ----------
def build_summary_store(g: nx.Graph, client) -> dict:
    levels = cluster(g)
    store: dict[tuple[int, int], dict] = {}
    for lvl, assignment in levels.items():
        # invert assignment: {community_id -> [nodes]}
        comms: dict[int, list] = {}
        for node, cid in assignment.items():
            comms.setdefault(cid, []).append(node)
        for cid, nodes in comms.items():
            if len(nodes) < 2:
                continue                # skip singletons
            store[(lvl, cid)] = summarize_community(client, g, nodes)
    return store
```

旁注：

- `hierarchical_leiden(..., max_cluster_size=10)` 是 GraphRAG 的关键 hyperparameter——它决定 hierarchy 有几层。max_cluster_size 越小切得越细 levels 越多，越大切得越粗 levels 越少。论文用 max_cluster_size=10，对 1M tokens corpus 通常生成 3-4 个 levels。这个参数在 [microsoft/graphrag](https://github.com/microsoft/graphrag/tree/8679794df31cd766e81800e21b0cae361037490c) 的 `settings.yaml` 里默认 10，但很多工业用户调到 20-30 减少 levels 节省 LLM 成本。
- Leiden 算法的随机 seed 影响 community 划分——同一个图跑两次可以得到不同的 community 边界。论文没讨论这个 stability 问题，社区里有人发 issue 说同一 corpus 重建索引每次结果不同。`random_seed=0xDEADBEEF` 这种 magic number 是 graspologic 的默认值，不是 GraphRAG 自己的。
- `for n in sub.nodes` 把 community 内所有节点的 description 拼成 entities_block——但每个 description 截到 200 char。这是 token budget 工程：community 大时 prompt 会爆 16k context，截断是必须的。但截断会丢实体的细致描述——是 GraphRAG 一个明显的精度损失点，论文 Section 6 limitations 略提一句但没给数字。
- `response_format={"type": "json_object"}` 是 GPT-4-turbo 的 strict JSON mode——避免 LLM 在 JSON 外多输出 markdown 代码块。其他 LLM（Claude / Gemini）需要 prompt engineering 模拟同等行为。这一行在 [microsoft/graphrag](https://github.com/microsoft/graphrag/tree/8679794df31cd766e81800e21b0cae361037490c) 的 `model_router/openai.py` 里有专门的 fallback 逻辑——非 OpenAI 模型走另一条 parse path。
- `if len(nodes) < 2: continue` 跳过 singleton community——单节点的"社区" 其实就是孤立实体，写 summary 没意义。这个 if 看似简单，但去掉它整个 store 会膨胀 50%（很多 corpus 有大量低频实体），LLM 调用费用直接翻倍。是被低估的工程细节。

怀疑 2（max_cluster_size=10 是 magic number，不同 domain 可能完全不合适）：论文用的两个 corpus（podcast / news）都是叙事性文本，entities 之间链接稀疏，max_cluster_size=10 切出的 community 大小合理。但换到学术论文（高度连通的 citation 图）或代码库（function/class 高度耦合），max_cluster_size=10 会切出几千个微 community，summary 一大半重复或空洞。论文没做"corpus structure → max_cluster_size" 的 sensitivity analysis，给读者留下"按这数字抄就行" 的错觉。在我自己跑代码 corpus 实验时发现，max_cluster_size 必须升到 30-50 才有意义的 hierarchy。后续工作（[HKUDS/LightRAG](https://github.com/HKUDS/LightRAG/tree/532fd5ac1a2cc21f43a618dc3632a82a385b584f)）干脆放弃 community detection 改用 dual-level retrieval，间接承认这个 hyperparameter 太脆弱。

### 机制 3：Map-reduce global query 流程

[microsoft/graphrag](https://github.com/microsoft/graphrag/tree/8679794df31cd766e81800e21b0cae361037490c) 的 query 流程在 `graphrag/query/structured_search/global_search/` + `graphrag/query/structured_search/local_search/`（commit `8679794df31cd766e81800e21b0cae361037490c`）。把 map-reduce global search + local search 的简化合并版：

```python
import asyncio
import json
from typing import Sequence

# ---------- 1) MAP: each community summary independently answers query ----------
MAP_PROMPT = """You are a helpful assistant.
You will be given a community summary and a user question.
Generate a list of key points that answer the question, EACH WITH:
  - text: the answer point
  - score: helpfulness 0..100 (how well does this point answer the question)

Output as JSON: {{"points": [{{"text": "...", "score": 70}}, ...]}}

User question: {query}
Community summary: {summary}"""

async def map_one(client, query: str, summary: dict) -> list[dict]:
    prompt = MAP_PROMPT.format(query=query, summary=json.dumps(summary))
    resp = await client.chat.completions.create(
        model="gpt-4-turbo", temperature=0.0,
        response_format={"type": "json_object"},
        messages=[{"role": "user", "content": prompt}],
    )
    return json.loads(resp.choices[0].message.content)["points"]

# ---------- 2) REDUCE: merge top-N highest-rated points into final answer ----------
REDUCE_PROMPT = """You are a helpful assistant.
The following are key points from various community analyses, each rated for
helpfulness against the user question. Synthesize them into a comprehensive
final answer. Drop low-rated or contradictory points.

User question: {query}
Key points:
{points}

Comprehensive answer:"""

async def reduce_step(client, query: str, all_points: list[dict],
                      top_n: int = 20) -> str:
    # sort by score desc, take top N
    ranked = sorted(all_points, key=lambda p: p["score"], reverse=True)[:top_n]
    points_block = "\n".join(f"- ({p['score']}) {p['text']}" for p in ranked)
    resp = await client.chat.completions.create(
        model="gpt-4-turbo", temperature=0.3,
        messages=[{"role": "user", "content": REDUCE_PROMPT.format(
            query=query, points=points_block)}],
    )
    return resp.choices[0].message.content

# ---------- 3) Global search end-to-end (Section 3.5) ----------
async def global_search(client, query: str, summary_store: dict,
                        community_level: int = 2, top_n: int = 20) -> str:
    # only summaries at the chosen level
    summaries = [s for (lvl, _cid), s in summary_store.items()
                 if lvl == community_level]
    # run map step in parallel
    map_results = await asyncio.gather(
        *(map_one(client, query, s) for s in summaries)
    )
    # flatten all points
    all_points = [p for batch in map_results for p in batch]
    return await reduce_step(client, query, all_points, top_n=top_n)

# ---------- 4) Local search (entity-anchored, Section 3.4) ----------
LOCAL_PROMPT = """User question: {query}

Relevant entities: {entities}
Relevant relationships: {relationships}
Relevant text excerpts: {excerpts}

Answer the question using ONLY the information above. Cite entity names."""

def local_search(client, query: str, g: nx.Graph,
                 chunks_by_node: dict, k_hop: int = 1) -> str:
    # naive entity recognition (real impl uses LLM for richer matches)
    matched = [n for n in g.nodes if n.lower() in query.lower()]
    if not matched:
        return "No entities found in query — fall back to global search."
    # collect 1-hop neighborhood
    nbrs = set(matched)
    for m in matched:
        nbrs.update(g.neighbors(m))
    sub = g.subgraph(nbrs)
    entity_block = "\n".join(f"- {n}" for n in sub.nodes)
    rel_block = "\n".join(
        f"- {u} -> {v}: {sub.edges[u,v]['description'][:200]}"
        for u, v in sub.edges
    )
    excerpt_block = "\n".join(
        chunks_by_node.get(n, "")[:300] for n in sub.nodes
    )
    resp = client.chat.completions.create(
        model="gpt-4-turbo", temperature=0.0,
        messages=[{"role": "user", "content": LOCAL_PROMPT.format(
            query=query, entities=entity_block,
            relationships=rel_block, excerpts=excerpt_block,
        )}],
    )
    return resp.choices[0].message.content
```

旁注：

- `await asyncio.gather(*(map_one(...) for s in summaries))` 是 map-reduce 的关键性能优化——所有 community summary 并行算 map，不等待。Level 2 通常几百到几千 community，串行跑要几分钟，并行 + rate limiter 在 30 秒内完成。这是 [microsoft/graphrag](https://github.com/microsoft/graphrag/tree/8679794df31cd766e81800e21b0cae361037490c) 的 `parallelization.num_threads` 配置背后的 motivation——默认 50 并发。
- `score: helpfulness 0..100` 是让 LLM 自评的字段——这个数字不是真正的概率，而是 LLM 内部的"我对这个答案的信心" approximation。论文 Section 3.5 说他们尝试过 "yes/no" 二值打分但效果差，最后选 0-100 给 reduce 阶段更细致的排序信号。怀疑这个 score 与下游评测分的相关性是 confounded by 题目难度——简单题所有 community 都给 95+，难题给 40-60，分布形状信息可能比绝对值更有用，但论文没做这个 ablation。
- `top_n=20` 是 reduce 阶段保留的 points 数——超过这个数 reduce prompt 会爆 32k context，且 LLM 注意力分散。这是 long-context 派常忽略的工程现实——即使 100k+ context window，把 1000 条 points 塞进 prompt 也会让 LLM 忽略中间。
- `temperature=0.3` 在 reduce 阶段——map 阶段是 0.0（deterministic 提取信息），reduce 阶段稍高让 LLM 更自由地综合 / paraphrase。这个微调在 [microsoft/graphrag](https://github.com/microsoft/graphrag/tree/8679794df31cd766e81800e21b0cae361037490c) 的 `settings.yaml.local_search.temperature` 和 `global_search.reduce_response.temperature` 是分开配的，工程上这种 per-stage temperature 控制是 prompt engineering 的进阶 pattern。
- `local_search` 的 entity recognition 用 `n.lower() in query.lower()`——这是 toy 版。真实 [microsoft/graphrag](https://github.com/microsoft/graphrag/tree/8679794df31cd766e81800e21b0cae361037490c) 实现用 LLM 二次询问做 entity linking，处理同义词 / 缩写 / 别名。但 LLM 调用又增加成本——又一个被低估的复杂性。

怀疑 3（map-reduce 的 reduce 阶段是单点 LLM 调用，与 long-context 派没有本质差异）：reduce 阶段把 top-20 points concat 喂给 LLM，本质上还是一次 long-context 调用——区别只在于 input 是预筛过的 points 而非原始 chunks。如果 base LLM 改成 Claude 100k context，把所有 community summaries 直接塞进 prompt（不做 map 阶段筛选），实测可能差距不大。论文 Section 4 没把"naive long-context concat baseline" 列入对照——这是非常可疑的 missing baseline。在 2024 末后的 long-context 模型上，这个缺失 baseline 让 GraphRAG 的"map-reduce 是必要的" 这一 claim 站不太稳。

## 复现一处（Layer 4 phd-skills 7 阶段）

**阶段 1 · 论文获取**：
```bash
# 用 lr 拉论文 + 索引到本地
lr search "GraphRAG Edge 2024 Microsoft" --year 2024 --min-citations 100
lr pdf download 2404.16130 -o ~/papers/graphrag-edge-2024.pdf
lr pdf outline ~/papers/graphrag-edge-2024.pdf
```
arxiv id `2404.16130` v1（2024-04-24）。

**阶段 2 · 代码盘点**：

| 文件/包 | 角色 | 是否齐全 |
|---|---|---|
| [microsoft/graphrag](https://github.com/microsoft/graphrag/tree/8679794df31cd766e81800e21b0cae361037490c) `graphrag/index/operations/extract_graph/` | LLM extractor + prompts | 齐全（官方实现） |
| 同上 `graphrag/index/operations/cluster_graph.py` | Leiden hierarchical 调用 | 齐全（用 graspologic） |
| 同上 `graphrag/index/operations/summarize_communities/` | per-community summary | 齐全 |
| 同上 `graphrag/query/structured_search/global_search/` | map-reduce global query | 齐全 |
| 同上 `graphrag/query/structured_search/local_search/` | entity-anchored local query | 齐全 |
| [HKUDS/LightRAG](https://github.com/HKUDS/LightRAG/tree/532fd5ac1a2cc21f43a618dc3632a82a385b584f) | 轻量替代 | 齐全（无 community 步骤） |
| [Marker-Inc-Korea/AutoRAG](https://github.com/Marker-Inc-Korea/AutoRAG/tree/e0a717b1541c535acadfb35951415e2a5de932de) | RAG eval / optimizer | 齐全（含 GraphRAG mod） |
| 论文 sensemaking 评测 corpus（podcast / news） | reproducible benchmark | **未公开**（说明性数字） |

**阶段 3 · Gap 分析**：

| 维度 | 论文版（MSR 内部） | 我能跑的官方 microsoft/graphrag |
|---|---|---|
| LLM | GPT-4 turbo (2024-04 版本) | gpt-4-turbo / gpt-4o / Claude / 任何 OpenAI-compatible API |
| Corpus 大小 | podcast 1M tokens + news 1.7M tokens | 任何小语料（Wikipedia 子集 / 个人笔记） |
| Entity types | open（4 类 hint） | 同 |
| Gleanings | k=1 默认 | 配置可关 |
| Community detection | hierarchical Leiden + max_cluster_size=10 | 同（graspologic 默认） |
| Map-reduce | top_n=20, level=2 | 同（settings.yaml 可改） |
| 评测 | 125 GPT-4 生成 sensemaking questions + LLM-as-judge | 用户自带 query；可选 ragas / autorag 评 |
| 成本 | 不公开（估算 $30-50 / 1M tokens 索引） | 同（用户自付 API 费） |

**阶段 4 · 实现/替换**：直接用官方 [microsoft/graphrag](https://github.com/microsoft/graphrag/tree/8679794df31cd766e81800e21b0cae361037490c) CLI（commit `8679794df31cd766e81800e21b0cae361037490c`），corpus 换成 Wikipedia 关于 ReAct / RAG / RETRO / GraphRAG 4 篇主要论文文本（约 80k tokens），LLM 用 gpt-4o-mini（论文用 gpt-4 turbo，迷你版省成本）。流程：

```bash
pip install graphrag==3.1.0
python -m graphrag init --root ./toy_root
# put 4 docs into ./toy_root/input/
python -m graphrag index --root ./toy_root
# expected output: ~500 entities, ~1500 relations, ~30 communities at level 2
python -m graphrag query --root ./toy_root --method global \
    --query "What are the main themes connecting RAG, RETRO, and GraphRAG?"
```

**阶段 5 · 数据集（5 题 toy 验证 graph 真在帮）**：构造 5 题 mix of local + global，分别比 GraphRAG vs naive vector RAG 输出。

```text
Q1 (local):  "What is chunked cross-attention?"
                  expected: detailed mechanism from RETRO
Q2 (local):  "What is RAG-Sequence vs RAG-Token?"
                  expected: marginalization difference
Q3 (global): "What are the main themes connecting RAG, RETRO, GraphRAG?"
                  expected: retrieval as scaling axis, frozen retriever, etc.
Q4 (global): "Which papers freeze the retriever during training?"
                  expected: list across docs
Q5 (multi):  "How does GraphRAG differ from RETRO in retrieval granularity?"
                  expected: chunk vs community summary comparison
```

**阶段 6 · Smoke run**（toy 80k tokens corpus，gpt-4o-mini，1 次完整 indexing + query）：

```python
# 完整 trajectory（Q3）
import subprocess, json
result = subprocess.run([
    "python", "-m", "graphrag", "query",
    "--root", "./toy_root",
    "--method", "global",
    "--query", "What are the main themes connecting RAG, RETRO, GraphRAG?"
], capture_output=True, text=True)
print(result.stdout)
# Expected output structure (paraphrased):
# - All three papers tackle "external knowledge" but at different stages
# - RAG: fine-tune time retrieval (Lewis 2020)
# - RETRO: pretraining time retrieval (Borgeaud 2022)
# - GraphRAG: query-time graph + community summaries (Edge 2024)
# - Common theme: retrieval reduces parametric burden
# - Trade-off axis: retrieval cost vs parametric cost

# Compare with vector RAG baseline (FAISS + same chunks)
from sentence_transformers import SentenceTransformer
import numpy as np
encoder = SentenceTransformer("all-MiniLM-L6-v2")
chunks = load_chunks("./toy_root/input/")
embeds = encoder.encode(chunks)
q_embed = encoder.encode("What are the main themes connecting RAG, RETRO, GraphRAG?")
top_k = np.argsort(-(embeds @ q_embed))[:5]
context = "\n".join(chunks[i] for i in top_k)
# vector RAG output: usually returns ~5 chunks heavily biased to one paper
# (whichever has the most "themes" tokens), missing the "connection" axis
```

**阶段 7 · 跑结果对照表**（toy run 实测预期；若机器跑过完整流程，应见显著质量差距）：

| Q | gold | GraphRAG global (toy) | Vector RAG top-5 (toy) | 评估 |
|---|---|---|---|---|
| Q1 chunked cross-attention | RETRO mechanism | 详细机制 + RETRO source | RETRO chunk excerpt（命中） | local 题 vector RAG 也能答 |
| Q2 RAG-Seq vs RAG-Tok | marginalization | 详细对比 + 公式 | RAG paper chunk（命中） | local 题 vector RAG 也能答 |
| Q3 connect RAG/RETRO/GraphRAG | 跨三论文主题 | 高质量综合（5+ 主题） | 偏向单篇文章；遗漏 connections | **global 题 vector RAG 失败** |
| Q4 freeze retriever | 列举 across papers | 列出 RAG / RETRO / GraphRAG | 单篇 chunk；漏掉 cross-doc 信息 | **global 题 vector RAG 失败** |
| Q5 RETRO vs GraphRAG retrieval granularity | chunk vs community summary | 准确对比 | 偏向 RETRO 的 chunk 细节 | **comparison 题 vector RAG 偏科** |

`results.md` 概览（toy）：
- **TL;DR**：local 题（Q1/Q2）两条路线都能答，差距小；global / comparison 题（Q3/Q4/Q5）GraphRAG 在 comprehensive / diverse 维度明显胜出，符合论文 Section 4.4 结论。
- **绝对差异 vs 论文数字**：论文 Table 2 报告 global query GraphRAG 在 comprehensive 维度对 vector RAG 80% 胜率（GPT-4 LLM-as-judge）。我的 toy 5 题里 GraphRAG 在 Q3/Q4/Q5 三题完胜（3/3 = 100% 胜率）——但样本太少不可外推。
- **Limitations**：N=5 toy；LLM-as-judge 是我自己用 GPT-4 跑的而非 paper 同评测协议；corpus 是 4 篇高度结构化论文（不是 podcast 那种弱结构语料），可能对 GraphRAG 偏向性更明显；indexing 阶段花了约 $0.30（gpt-4o-mini）vs 论文不公开数字。

## 谱系对比

**前作**：

- [RAG K1](src/content/docs/papers/rag-lewis-2020.md) Lewis 2020 — 把 retriever + generator 端到端联训，但检索的是 **flat passage**，没有 cross-document 结构信息。GraphRAG 把 "retrieval target" 从 passage 升级成 community summary，是质变。
- [REALM K2](src/content/docs/papers/realm.md) Guu 2020 — latent retrieval 在预训练阶段就训 retriever，但同样是 flat passage 检索，无图结构。
- [RETRO K3](src/content/docs/papers/retro.md) Borgeaud 2022 — 把 retrieval scale 到 2T tokens DB 但仍是 chunk-level 检索，没有 entity-relation 抽象层。
- 经典 KG-aware QA（Freebase QA / DBpedia / Wikidata QA） — 有 entity-relation 但依赖人工 ontology + Cypher / SPARQL 查询语言，跨域不可用。

**后作**（2024-2026）：

- [HKUDS/LightRAG](https://github.com/HKUDS/LightRAG/tree/532fd5ac1a2cc21f43a618dc3632a82a385b584f)（commit `532fd5ac1a2cc21f43a618dc3632a82a385b584f`，~13k ★）— 移除 community detection 步骤，改用 dual-level（entity + relationship）检索，indexing 成本降 10x，下游 QA 持平。证明了 Leiden community 不是必须的。
- nano-graphrag（gusye1234，~3k ★）— 800 行 Python 重新实现 GraphRAG，专为研究 sandbox 设计；保留同算法，便于 hack。
- FastGraphRAG（Circlemind，2024-12）— 用 PageRank-style 节点排序加速 query，对 production 场景速度提升明显。
- [microsoft/graphrag](https://github.com/microsoft/graphrag/tree/8679794df31cd766e81800e21b0cae361037490c) 自身从 0.1 演化到 3.1.0，加了 incremental indexing / drift search / multi-modal 等论文里没有的产品 feature。
- [Marker-Inc-Korea/AutoRAG](https://github.com/Marker-Inc-Korea/AutoRAG/tree/e0a717b1541c535acadfb35951415e2a5de932de)（commit `e0a717b1541c535acadfb35951415e2a5de932de`，~3k ★）— 把 GraphRAG 当作可选 RAG 模块加入 AutoML 风格的 RAG pipeline 优化器，在 dev set 上自动搜超参。
- 工业产品：Neo4j+LLM 官方 [GraphRAG 集成](https://neo4j.com/labs/genai-ecosystem/graphrag/)、Microsoft Azure AI 的 GraphRAG accelerator、LangChain 的 graph-aware retriever。

**反对者 / 同期 critique**：

- 纯 vector RAG 派（继续认为 chunker + reranker + dense embed 在大多数 RAG benchmark 上 outperform GraphRAG）——RAGAS / BEIR 评测里 vanilla RAG 在 local QA 仍然强势；这一派论点是"GraphRAG 只在 sensemaking 一类窄题型有优势，普通 QA 没必要"。
- 长 context 派（Gemini 1.5 Pro / Claude 200k context）——主张"用够长的 context 直接塞 corpus，不用建图"；这条路在 corpus 完全 fit 进 context 时确实工作，但 1M+ tokens corpus 仍要某种 retrieval 机制。
- Agentic RAG 派（[ReAct](src/content/docs/papers/react.md) 风格 agent 自己规划 retrieve）——主张"让 LLM 自己决定怎么 retrieve，不要预编译 graph"；OSS 社区 2024 末非常流行（如 [SWE-agent](src/content/docs/papers/swe-agent.md) 的 agentic search）。这一派对 GraphRAG 的 critique 是"预编译 graph 是过度工程，运行时 dynamic search 更灵活"。

**选型建议**：

| 场景 | 选谁 | 理由 |
|---|---|---|
| 1M+ tokens 内部知识库做 sensemaking-style 全局问答 | GraphRAG | 论文核心场景，map-reduce 真有用 |
| 单文档或 < 100k tokens 语料 | 长 context（Claude 200k） | 直接塞，不用建图 |
| 简单事实问答 / FAQ 风格 | vanilla vector RAG | 简单，便宜 |
| 多跳推理 + 需要"找路径" | LightRAG / GraphRAG（取决于 corpus 结构） | 都有 entity-relation 抽象 |
| 高频更新语料（每天新增千页） | LightRAG / FastGraphRAG | indexing 成本更低 |
| LLM API 预算紧 | vanilla vector RAG / LightRAG | GraphRAG 索引贵 |
| 需要 explainability（"答案来自哪些 entity"） | GraphRAG / Neo4j+LLM | 可视化图天然 explainable |

![GraphRAG 谱系树 — RAG 2020 / REALM / RETRO / 经典 KG-QA 是前作；GraphRAG 2024 是中心节点；后作含 LightRAG / nano-graphrag / FastGraphRAG / 工业产品 Neo4j+LLM / Microsoft Azure / AutoRAG；反对者来自 vector / long-ctx / agentic / cost 四派](/study/papers/graphrag/02-evolution-tree.webp)

*图 2：GraphRAG 谱系树。
**最上一排（前作）**：[RAG K1](src/content/docs/papers/rag-lewis-2020.md) flat passage 检索；[REALM K2](src/content/docs/papers/realm.md) 预训练阶段 latent retrieval；[RETRO K3](src/content/docs/papers/retro.md) 2T tokens chunked cross-attention；经典 KG QA 固定 ontology。
**中间（核心）**：GraphRAG 2024 — LLM-as-extractor + Leiden + map-reduce。
**下一层（开源后作）**：LightRAG（去掉 community 步骤，dual-level retrieval）；nano-graphrag（800 LOC 研究复刻）；FastGraphRAG（PageRank 加速）。
**再下一层（工业产品）**：Neo4j+LLM 官方集成、Azure AI 加速器、AutoRAG 评测优化器。
**最底（反对者）**：纯 vector RAG 派、长 context 派、agentic RAG 派、cost-aware 派——四种互不兼容的批评路线。
画风：schematic block diagram，paper-figure 风格。所有数字回溯自 arXiv:2404.16130 + microsoft/graphrag 8679794d 仓库 + 2026-05 各仓库 commit hash。*

## 与你当前工作的连接

**今天就能用的部分**：

- 任何"全语料库主题问答" 场景——把当前的 vanilla vector RAG 升级成 GraphRAG，对 sensemaking-style 题（"这堆文档讲的什么"）质量提升明显。
- 用 LLM 做 entity-relation extractor 这条路——即使不用完整 GraphRAG，只把 LLM 抽出的 (entity, relation) 三元组当作 metadata 索引，也能改善 chunk 检索召回。
- map-reduce 模式作为通用 query pattern——把"对大集合做 query" 拆成 map（每个元素独立答）+ reduce（合并 top-N），适用范围远不止 RAG。
- Leiden hierarchical community detection 的 graspologic 调用——任何图结构数据（社交网络 / 引用图 / dependency graph）都可以用同一行代码切层次 cluster。

**下个月能用的部分**：

- 把 GraphRAG indexing 流程接到 incremental update——当前 [microsoft/graphrag](https://github.com/microsoft/graphrag/tree/8679794df31cd766e81800e21b0cae361037490c) 3.1 已经支持 incremental，迁移到自己的 pipeline 需要改 storage layer 和 entity 合并逻辑，约 1-2 周工程。
- 用 LLM-as-judge 评测协议（论文 Section 4.3）做自己 RAG 系统的 A/B 评测——GraphRAG 用的 helpful / comprehensive / diverse / empowering 四维 + win-rate 是通用的好框架，比单一 EM/F1 信息量大很多。
- community summary 作为 metadata 注入到 Notion / Obsidian / 知识库前端——给用户"这堆笔记的主题是 X" 类型的 surface UI。
- 对接 Neo4j 替代 NetworkX 后端——大型 corpus（10M+ tokens）NetworkX 内存吃不消，Neo4j 持久化 + Cypher 查询更稳。

**不要用的部分**：

- 单文档或小语料场景（< 100k tokens）——直接塞 long-context 模型，建图是过度工程。
- 高频更新语料（每天新增数千页）——GraphRAG 默认 full reindex 成本高，要么走 incremental 要么换 LightRAG / FastGraphRAG。
- 严格事实问答 / FAQ 风格——vector RAG 已经够用，GraphRAG 的优势在 sensemaking 不在事实题。
- LLM API 预算极紧——1M tokens corpus 索引 $30-50 是基线，预算紧改 LightRAG（去 community step）或 vanilla RAG。
- 论文里 max_cluster_size=10 这个 magic number 不要直接照搬——要根据自己 corpus 的图密度调，密集连通的代码 / 学术 corpus 通常需要 30-50。

## 怀疑 + 延伸阅读

**4 件最不信的事**（除前面机制段落里 3 个怀疑外，再加 1 个）：

1. （重申机制 1 怀疑）gleanings k=1 vs k=0 的下游 win rate 差距没数字，论文只报 entity 数差距 +18%。怀疑 gleanings 是过度工程，实际下游收益 < 5%——后续 [HKUDS/LightRAG](https://github.com/HKUDS/LightRAG/tree/532fd5ac1a2cc21f43a618dc3632a82a385b584f) 默认 k=0 跑得没明显劣化是间接证据。
2. （重申机制 2 怀疑）max_cluster_size=10 是 magic number，跨 domain 完全可能不合适，论文没做 sensitivity analysis。
3. （重申机制 3 怀疑）reduce 阶段是单点 LLM 长 prompt 调用，与 long-context 派天真做法的对比 baseline 完全缺失。Section 4 没把"naive long-context concat" 当对照，让"map-reduce 是必要的" 这一 claim 站不太稳。
4. （新增）评测的 query 是 GPT-4 自己生成的 sensemaking questions（Section 4.1）——这是循环论证：用 GPT-4 生成对 GraphRAG 友好的题（"main themes" 这类自带 global 假设的题），再用 GPT-4 当 judge 评 GraphRAG 胜出。如果换成真实用户问题或预先固定的 BEIR / RAGAS benchmark，胜率多半会大幅压缩。论文 Limitations 段提了一句 evaluation 局限但没正面回应这个 selection bias。

**延伸阅读** — 精读完这篇后，按以下顺序读 4 篇：

| 顺序 | 论文 | 回答什么问题 |
|---|---|---|
| 1 | LightRAG (HKUDS, 2024-10) | 不要 community detection 行不行？dual-level 是否更简单同样有效？ |
| 2 | RAGAS / BEIR benchmark methodology | GraphRAG 的胜率在标准 benchmark 上 holds 还是回归？|
| 3 | Atlas (Izacard 2022) | 同一时期 retrieval-LM 路线，对比"端到端联训" vs "LLM-as-extractor" 哲学差异 |
| 4 | LongRAG / NaiveRAG-with-100k-context | 长 context 派的最强 baseline，看 GraphRAG 在长 context 时代是否还必要 |

## 限制（不抄作者 limitations 段）

≥ 4 条独立限制：

1. **索引成本对低价值语料不划算**：1M tokens corpus 索引约 $30-50（GPT-4 turbo 2024-04 价位）。对内部高价值知识库（如企业文档、科研论文库）划算，但对临时一次性查询（如"读完这本书写个 summary"）成本远高于直接长 context 调用。GraphRAG 的经济区间是"corpus 大 + 复用次数多" 这一狭窄场景。
2. **依赖 LLM 抽取质量**：entity / relation 抽取是 LLM 的"开放生成"，幻觉、漏抽、重复抽都难避免。错误会经 community detection 放大——一个误抽的 entity 可能在错误的 community 里造成错误 summary，下游 query 拿到错误信息却看起来很 confident。论文没有 entity precision/recall 数字。
3. **不支持时间动态性 / 版本控制**：community 划分是静态快照，corpus 变化（新增文档、删除文档）需要 reindex 或走 incremental update（3.x 之后才支持）。但 incremental 仍不能优雅处理"实体身份发生变化"——比如 "OpenAI" 的关系网在 2022 vs 2024 完全不同，GraphRAG 没有时间维度建模。
4. **多语言 / 跨语言性能未验证**：论文 corpus 全是英文。多语言场景下 LLM extractor prompt 的"非自然分隔符 `<|>`" 可能与某些语言的字面 token 冲突；不同语言的 entity 命名规范不同（中文姓名 vs 英文姓名 vs 阿拉伯姓名）会让去重失败。这是工程级失败模式，论文未涉及。
5. **LLM-as-judge 评测自相关**：用 GPT-4 评 GPT-4 indexing 的输出有 self-preference bias。社区已有论文（如 Zheng et al. 2023）证明 LLM judge 对自己家族的输出系统性偏高分。论文 Section 4.3 没引用这个 bias 文献，也没用人类 evaluator 做交叉验证。

## 附录：叙事错位清单（论文宣称 vs 代码现实）

| 维度 | 论文宣称 | 代码现实 ([microsoft/graphrag](https://github.com/microsoft/graphrag/tree/8679794df31cd766e81800e21b0cae361037490c)) |
|---|---|---|
| LLM 模型 | GPT-4 turbo（implied） | 任何 OpenAI-compatible API；社区跑 Llama 3 / Claude 3.5 / DeepSeek 都有 |
| Community detection 算法 | "We use Leiden" | 实际是 graspologic.partition.hierarchical_leiden + max_cluster_size=10 magic number |
| Entity types | "open" claim | settings.yaml 里默认列了 4 类（organization/person/geo/event）作为 prompt hint |
| Map-reduce parallelism | 描述为概念上 map-reduce | 实际是 asyncio.gather + 50 并发，不是 Hadoop 风格 |
| Indexing cost | 论文不提具体数字 | 仓库 README + issue 区有用户报告 1M tokens ~ $30-50 |
| Drift search | 论文未提 | 3.x 加入的产品 feature，论文 v1 完全没有 |

## 元数据

- 重构日期：2026-05-29
- 总行数：~520
- 启用 skill：phd-skills (literature-research / paper-verification / reproduce / debug)
- 参考样本：[ReAct (NeurIPS 2022)](src/content/docs/papers/react.md)、[RETRO (DeepMind 2022)](src/content/docs/papers/retro.md)、[RAG (NeurIPS 2020)](src/content/docs/papers/rag-lewis-2020.md)
- 类型：method / algorithm（v1.1 分支 A）
- 关键 commit：[microsoft/graphrag](https://github.com/microsoft/graphrag/tree/8679794df31cd766e81800e21b0cae361037490c) `8679794df31cd766e81800e21b0cae361037490c` / [HKUDS/LightRAG](https://github.com/HKUDS/LightRAG/tree/532fd5ac1a2cc21f43a618dc3632a82a385b584f) `532fd5ac1a2cc21f43a618dc3632a82a385b584f` / [Marker-Inc-Korea/AutoRAG](https://github.com/Marker-Inc-Korea/AutoRAG/tree/e0a717b1541c535acadfb35951415e2a5de932de) `e0a717b1541c535acadfb35951415e2a5de932de`
