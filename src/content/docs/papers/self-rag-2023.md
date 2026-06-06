---
title: Self-RAG — 让模型自己决定何时该查资料
来源: 'Asai et al., "Self-RAG: Learning to Retrieve, Generate, and Critique through Self-Reflection", ICLR 2024 / arXiv 2310.11511'
日期: 2026-06-01
子分类: 模型与训练
分类: 机器学习
难度: 中级
provenance: pipeline-v3
---

## 是什么

Self-RAG（**Self-Reflective Retrieval-Augmented Generation**）是华盛顿大学 + AI2 在 2023-10 提出的——**训一个 LLM，让它在生成的时候自己决定要不要去查资料、查到的资料有没有用、自己写的答案对不对**。

日常类比：[[rag-lewis-2020]] 像一个学生**每道题都翻一次书**（不管题简单复杂），Self-RAG 像一个**懂得分情况的学生**——简单题直接答，难题才翻书，翻完还会自己检查"这本书是不是真讲到这个点"。

把"检索"从外部硬塞的固定流程，变成模型内部能自己控制的一个动作。

## 为什么重要

不理解 Self-RAG，下面这些事都没法解释：

- 为什么 2024 年开始所有 agentic RAG 框架（CRAG / Adaptive-RAG / FLARE）都长得很像——它们都在 Self-RAG 的 reflection token 这条路上演化
- 为什么 LangGraph / LlamaIndex 的"自反思 RAG"模板默认带"判断要不要查"这一步——这步是 Self-RAG 引入主流的
- 为什么"让 LLM 自己调工具"成了 agent 范式的核心——Self-RAG 是 retrieval 这条线上的奠基样本
- 为什么纯 [[rag-lewis-2020]] 在闲聊场景反而变笨——它强制查资料引入噪声，Self-RAG 修了这个问题

## 核心要点

Self-RAG 的关键发明是 **4 类 reflection token**——把"自我评估"变成模型词表里的特殊词，用生成的方式输出：

1. **Retrieve（要不要查？）**：取值 `Yes / No / Continue`。模型在生成下一段前自己输出这个 token，决定是否触发检索。

2. **IsRel（查到的相关吗？）**：取值 `Relevant / Irrelevant`。检索到一段后让模型自己判断，不相关的直接丢。

3. **IsSup（生成的内容被资料支持吗？）**：取值 `Fully / Partially / No`。每生成一段就标自己有没有"忠于原文"。

4. **IsUse（整体效用打几分？）**：1-5 分。给最终输出打总分，用于多候选选优。

**训练数据怎么来**：用 GPT-4 当 critic 给 150K 样本打这 4 类标签，再把"会输出这些 token 的能力"蒸馏到一个 Llama2-7B / 13B 里。

**推理流程**：模型边写边输出 Retrieve token → 若是 Yes 就并行查 K 段 → 每段都续写一份候选并自评 IsRel/IsSup/IsUse → 按打分组合选最终段。

## 训练流程拆解

理解 Self-RAG 必须看清训练数据是怎么造出来的——这是它能力的来源：

1. **种子数据**：从公开指令数据集（OpenAssistant / GPT-4 Alpaca / FLAN）拿 150K 样本，覆盖问答、长文、闲聊、事实校验。

2. **离线 critic 标注**：每条样本喂 GPT-4，让它按 4 类 reflection token 的定义打标签——"这个问题该不该查"、"查到的段相关吗"、"答案被支持吗"、"整体打几分"。

3. **生成 critic-augmented 数据**：每条样本被改写成"原文 + reflection token + 续写"的训练目标。

4. **监督微调**：用这批标注好的数据微调 Llama2-7B / 13B，让模型学会"在该输出 reflection token 的位置生成对应 token"。

整个过程关键是 **离线生成、在线推理**——critic 只在训练阶段需要 GPT-4，部署时单一模型自给自足。

## 实践案例

### 案例 1：闲聊 vs 事实题，模型自己分流

问题 A："今天天气真好，给我讲个笑话吧。"

- vanilla [[rag-lewis-2020]]：照样去查文档库（查到一堆不相关段落），generator 被噪声干扰。
- Self-RAG：第一个 Retrieve token 输出 `No`，直接生成笑话，干净利落。

问题 B："2023 年诺贝尔化学奖给了谁？"

- Self-RAG：Retrieve token 输出 `Yes`，触发检索，拉回 5 段新闻，IsRel 过滤掉无关的，最终给出 "Moungi Bawendi, Louis Brus, Aleksey Yekimov"。

**关键差异**：vanilla RAG 是"无脑查"，Self-RAG 是"按需查"。

### 案例 2：论文里的硬数字

| 模型 | PopQA (acc) | biography FactScore | ARC-Chal acc |
|---|---|---|---|
| Llama2-chat-13B | 20.0 | 55.9 | 38.4 |
| ChatGPT (RAG) | 50.8 | 71.8 | 75.3 |
| **Self-RAG-13B** | **55.8** | **80.2** | **73.1** |

13B 的 Self-RAG 在多数知识密集任务上超过 ChatGPT-RAG，特别是 biography 长文事实正确率比 ChatGPT 高约 10 分。

### 案例 3：reflection token 长什么样

```text
[Retrieve=Yes] <p>Moungi Bawendi 是 MIT 的化学家...</p>
[IsRel=Relevant][IsSup=Fully Supported] 2023 年诺贝尔化学奖授予
Bawendi、Brus 和 Yekimov，表彰他们在量子点合成上的贡献。
[IsUse=5]
```

token 直接夹在生成文本里，靠 special token id 区分。推理时把这些 token 解析出来做选段和过滤。

## 踩过的坑

1. **critic 成本高**：训练数据靠 GPT-4 给 150K 样本打 reflection 标签，光 OpenAI 调用就花了几万美金。critic 选什么模型直接决定上限。

2. **延迟翻倍**：每段生成都要多吐 reflection token + 并行多候选续写。实测推理比同尺寸 Llama2 慢 1.5-2 倍。生产场景里这是硬成本。

3. **Retrieve 校准不准**：模型有时候该查不查（aleatoric 题误判为常识题）、不该查乱查（"今天心情不好"也去查文档库）。本质是 GPT-4 标签和真实分布有 gap。

4. **不能简单接到现成 LLM 上**：Self-RAG 必须重训——它要改词表、要监督信号。已有的 GPT-4 / Claude 没法"加个 wrapper 变成 Self-RAG"。后来的 CRAG / Adaptive-RAG 走的是"用现成 LLM 投票"的路，不需重训但效果略弱。

### 案例 4：长文生成里的"逐句 IsSup"

写传记类长文时 Self-RAG 不只在开头查一次，而是 **每写一段都检查 IsSup**：

- 第 1 段写"出生地"——查到一段 wiki，IsSup=Fully，保留
- 第 2 段写"获奖经历"——续写时模型自己输出 Retrieve=Yes，再查一段，IsSup=Partially，标注"待校核"
- 第 3 段写"个人评价"——Retrieve=No（主观内容不必查），直接写

这样最终输出能逐段标"哪些有据、哪些是模型推测"，对学术 / 法律 / 医疗类长文落地特别有用。

## 适用 vs 不适用场景

**适用**：

- 混合任务流（既有事实查询又有闲聊 / 创作）——Retrieve token 自动分流
- 需要 citation + 事实校核的长文生成（biography / 综述）——IsSup 提供"逐句被支持"的信号
- 你能掌控基模型（开源 Llama2 / Qwen 系）愿意微调——Self-RAG 必须重训
- 有预算调 GPT-4 当 critic 生数据——训一次的 cost 不便宜

**不适用**：

- 只能用闭源 API（GPT-4 / Claude）做底座——改不了词表、加不了 reflection token，走 [[crag-2024]] 风格的外挂方案更现实
- 极低延迟场景（实时语音 / 高并发对话）——reflection 多吐 token 撑不住 SLA
- 文档库特别小或全部已在 context——根本不需要"按需查"，直接 long-context 更省事
- 创作 / 头脑风暴主导——Retrieve 永远 No，Self-RAG 退化成普通 LLM 不划算

## 历史小故事（可跳过）

- **2020**：[[rag-lewis-2020]] 发——retrieval 是固定外挂，generator 不能选择跳过
- **2022**：Toolformer（Meta）让 LLM 学会自己插入 API call token——"模型自主决定调工具"的思路被 retrieval 这条线继承
- **2023-04**：FLARE（CMU）做 active retrieval——在生成低置信度处回头查，但还没"自评打分"
- **2023-10**：Asai 等把"按需检索 + 自我批判"统一成 reflection token，发 arXiv 2310.11511，UW + AI2 团队
- **2024-04**：ICLR 2024 录用为 Oral；同年 CRAG（Yan 等）/ Adaptive-RAG（Jeong 等）跟进，都在改 Self-RAG 的局部
- **2024 下半**：LangGraph 把"self-reflective RAG"做成开箱模板，Self-RAG 思路工程化进主流框架

## 学到什么

1. **把"控制流"嵌进生成本身**——reflection token 是这一招最早成功的样本。后来 OpenAI o1 的 thinking token、Anthropic 的 extended thinking 都在同一思路上
2. **"按需"比"总是"经常更划算**——vanilla RAG 强制查反而引入噪声；让模型自己分流是更精细的工程取舍
3. **critic 蒸馏**是做"自我评估"的标准路径：先用强模型打标签，再蒸到小模型变内置能力
4. **agentic 不是必须有 multi-agent**——一个 LLM 通过 reflection token 也能做出 agent 行为。这是 Self-RAG 留给 2024 agent 浪潮最大的方法论遗产

## 延伸阅读

- 论文 30 页 PDF：[Asai et al. 2023 — Self-RAG](https://arxiv.org/abs/2310.11511)（Section 3 reflection token 设计 + Section 4 训练流程是必读）
- 项目主页 + 代码 + 模型权重：[selfrag.github.io](https://selfrag.github.io/)（Llama2-7B / 13B 直接可下载）
- LangGraph 教程：[Self-Reflective RAG with LangGraph](https://blog.langchain.dev/agentic-rag-with-langgraph/)（把论文流程翻译成可跑的代码图）
- [[rag-lewis-2020]] —— 必先理解 RAG 奠基才看得懂 Self-RAG 改了什么
- [[crag-2024]] —— "不重训用 critic 投票"的替代方案，对照看能看清两条路的取舍

## 关联

- [[rag-lewis-2020]] —— RAG 奠基；Self-RAG 把它的"固定检索"升级成"按需检索"
- [[graphrag]] —— 同样是对 vanilla RAG 的批评；它改 retriever 结构，Self-RAG 改 generator 控制流
- [[atlas-2022]] —— 把 retriever 和 generator 一起训；Self-RAG 走得更远，把"判断要不要查"也一起训了
- [[replug-2023]] —— 反向思路：不动 LLM 把 retriever 调到 LLM 口味；Self-RAG 反过来是把 retrieval 决策塞进 LLM

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[atlas-2022]] —— Atlas — 把检索器和生成器一起训练，11B 打 540B
- [[graphrag]] —— GraphRAG — 微软的知识图谱 + RAG
- [[rag-lewis-2020]] —— RAG (Lewis 2020) — 检索增强生成奠基

