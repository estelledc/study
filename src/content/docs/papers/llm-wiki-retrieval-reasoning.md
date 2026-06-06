---
title: LLM-Wiki — 把外部知识编译成 agent 自己的"维基"
来源: 'Haoliang Ming et al., "Retrieval as Reasoning: Self-Evolving Agent-Native Retrieval via LLM-Wiki", arXiv:2605.25480, 2026'
日期: 2026-06-01
子分类: 智能体与 LLM
分类: Agent
难度: 中级
provenance: pipeline-v3
---

## 是什么

LLM-Wiki 是一种**让 agent 把外部文档编译成自己内部的维基百科页**，再像人翻 wiki 一样查阅的方法。日常类比：上学时你不是把课本影印一份揣兜里，而是把它整理成自己的笔记本——按章节、加批注、关键词互相链接。LLM-Wiki 让 agent 也这么干，而且还会自己改自己的笔记。

传统 RAG 的玩法：用户问问题 → embedding 检索 → 把 top-k 段文档塞进 prompt → 模型回答。这种做法把 retrieval 当成**一次性取数**，不能复用结构、不能跨文档跳转、不能纠错。问题一变就全部重算，对 multi-hop 任务尤其吃力。

LLM-Wiki 的不同：先把语料编译成一组**结构化 wiki 页面**，每页带 bidirectional link（双向链接），agent 通过 search / read / follow-link 三种 tool call 像人类查 wiki 一样推理——这一步可以多跳、可以重读、可以用错就回 Error Book 改。论文的口号是 "retrieval as reasoning"，把检索动作和推理动作合一。

## 为什么重要

不理解 LLM-Wiki，下面这些事都没法解释：

- 为什么 GraphRAG / HippoRAG 等"图谱化 RAG"在 multi-hop 上比 vanilla RAG 强但仍有上限
- 为什么"retrieval as reasoning"成为 2026 年 agent 论文的关键命题
- 为什么 agent 能力的瓶颈正在从**模型大小**转向**外部知识的组织形式**
- 为什么"自我纠错"在 retrieval 这一层比在 generation 那一层省钱

## 核心要点

LLM-Wiki 由 **三件套** 组成：

1. **Compilation（编译）**：原始文档 → 结构化 wiki 页。每页有 title / content / links 字段。链接是 bidirectional——A 提到 B 时，B 页里也写明"被 A 引用"。类比：把一堆论文 PDF 转成 Notion workspace。

2. **Interface（接口）**：agent 通过三种 tool 操作 wiki——`search(keyword)` 找页 / `read(page_id)` 读全文 / `follow(link_id)` 跳到下一页。这三种调用就是 agent 的"推理动作"，不再是"上下文塞料"。

3. **Self-correction（自纠错）**：agent 答错时，错误案例进 Error Book；后台进程定期读 Error Book，**改写或拆分有问题的 wiki 页**——这就是 self-evolving 的部分。类比：维基百科被破坏后版主修复，不影响读者。

## 实践案例

### 案例 1：multi-hop 推理走 follow-link

问题："发明 transformer 架构的人后来去哪家公司？"

vanilla RAG 流程：embedding 一次检索，top-k 大概率只命中"transformer 是 2017 年提出"，跳不到"人后来去哪"。

LLM-Wiki 流程：

```
search("transformer 架构") → page: "Attention is All You Need"
read(page) → 提到 Vaswani et al.
follow(link: "Ashish Vaswani") → page: "Ashish Vaswani"
read(page) → "2023 年加入 Cohere"
```

每一步都是一次 tool call，模型显式控制 retrieval 路径，**就是 reasoning 本身**。

### 案例 2：Error Book 自纠错

agent 在 HotpotQA 上答错一道题，root cause 分析发现是 wiki 页 X 把 "1995" 错成 "1985"。这个 case 进 Error Book，editor agent 读到后：

- 找原始 source 文档核对
- 改写 page X 的对应行
- 把和 page X 相关的 backlink 页面也扫一遍（防止矛盾扩散）

第二次同类问题来时，wiki 已经改好。这就是论文标题里的 "self-evolving"。

### 案例 3：和 GraphRAG 的差异

| 维度 | GraphRAG | LLM-Wiki |
|---|---|---|
| 知识结构 | 三元组图谱 | wiki 页面 + 链接 |
| 检索原语 | community summary | search/read/follow |
| 单次推理动作数 | 1（一次检索） | 多（多跳 tool call） |
| 自纠错 | 重建 graph 全量 | 增量改 page |
| 多文档融合 | 实体合并 | 显式 backlink |

LLM-Wiki 把"知识结构"和"推理动作"对齐——这是它在 multi-hop 上拉开差距的关键。论文报告 HotpotQA 上比 HippoRAG 2 / LightRAG / GraphRAG 高 2.0-8.1 F1 分。

### 案例 4：AuthTrace 上的复杂 multi-doc 查询

AuthTrace 是论文自己提出的 benchmark，专测"答案需要跨多个 doc 拼接"。LLM-Wiki 在它上面拿到全场最高的 overall accuracy，关键就在 follow-link 机制——agent 可以从 doc A 链到 doc B 再链到 doc C，不需要把三个 doc 全塞进 context。这种"按需展开"的检索方式比 GraphRAG 的"提前 summarize"更 token-efficient。

## 踩过的坑

1. **wiki 编译质量决定上限**：如果 compilation 阶段把文档拆得太碎，每页只有一句话，follow-link 会变成"看碎片猜全文"——这种情况下 LLM-Wiki 反而比 RAG 差。要按章节边界编译，不要按 chunk size。
2. **链接错误的传播**：bidirectional link 错一个，相关页全错。论文用 sanity check（每周扫"孤儿链接"）但仍是 open problem，长期运行需要人工抽查。
3. **Error Book 写满之后**：随训练时间推移 Error Book 会膨胀，全量重读不可行；论文用 cluster + summarize 压缩，但精度会损失。
4. **follow-link 容易死循环**：A → B → A 这种自引用会让 agent 卡住；要在 tool 层加访问深度限制（如 max_depth=4），并对已访问页打标记防止重复。

## 适用 vs 不适用场景

适用：

- multi-hop QA（HotpotQA、MuSiQue 这种跨文档推理）
- 知识库定期更新的场景——增量改 wiki 比全量重训 embedding 便宜
- 需要可解释 retrieval 路径的合规场景
- agent 需要长期"记住"知识结构的应用（如个人助理、领域专家）

不适用：

- 单跳简单 QA——LLM-Wiki 的 overhead 不划算
- 实时检索（每秒更新）的场景——compilation 太慢
- 文档结构性弱的语料（如对话日志）——编译不出有意义的 wiki
- 短期任务——self-evolving 的优势体现不出来

## 历史小故事（可跳过）

- 2020：DPR / dense retrieval 让 RAG 流行起来，奠定"取数"范式
- 2023：HippoRAG 提出"用 PageRank 做记忆检索"，向 graph-style 演进
- 2024：GraphRAG 把 LLM 用于 community summary，开始把"结构"塞进 retrieval
- 2025：multi-hop 评测上图谱方案触顶，"retrieval as reasoning" 命题提出
- 2025 末：LightRAG 引入分层 retrieval，但仍是单步检索动作
- 2026：LLM-Wiki 把 retrieval 完全转成 tool-calling 动作序列，HotpotQA / MuSiQue / AuthTrace 拿 SOTA

## 学到什么

- retrieval 不是"取数"而是"推理动作"——这个概念转变才是 LLM-Wiki 的核心贡献
- 知识的**结构形式**和 agent 的**推理动作集**应该对齐
- 自纠错放在 retrieval 层比放在 generation 层便宜得多
- bidirectional link 是关键，它让"反向追溯"和"正向跳转"成为同一种动作
- 把 retrieval 拆成多个 tool call 后，agent 的可解释性自然涌现——动作序列就是推理路径
- 一个 self-evolving 系统的健康度取决于它**能否定位错误的根**——LLM-Wiki 的 Error Book 实现了这点

## 延伸阅读

- arXiv 2605.25480 — LLM-Wiki 原论文
- [[graphrag-2024]] — GraphRAG 论文，对照 community summary
- [[hipporag]] — HippoRAG，PageRank 检索的前身
- [[evo-memory-2511]] — long-term memory 的另一形态
- [[self-evolving-agents-survey]] — self-evolving 综述里 LLM-Wiki 章节
- [[exg-experience-graphs]] — 经验图谱论文，结构化记忆的另一思路

## 关联

- [[graphrag-2024]] —— 同样想把"图结构"接入 RAG，但 LLM-Wiki 把动作显式化
- [[hipporag]] —— PageRank-style 记忆检索的前身
- [[evo-memory-2511]] —— Error Book 思路类似 long-term memory 的演化
- [[self-evolving-agents-survey]] —— 综述里把 LLM-Wiki 列为"agent-native retrieval"代表
- [[eve-agent-evidence]] —— 同样关注 evidence 可追溯，但侧重训练而不是推理
- [[code-as-agent-harness]] —— 把 retrieval 当 tool-call 是同一种思路在 code 域的体现
- [[exg-experience-graphs]] —— 经验图谱也是 wiki-like 结构
- [[apex-policy-exploration]] —— self-correction 的策略探索维度

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[apex-policy-exploration]] —— APEX — 给自进化 agent 配一张"策略图"防止它走老路
- [[code-as-agent-harness]] —— Code as Agent Harness — 把代码当 agent 的"骨架"来重新看 agentic AI
- [[eve-agent-evidence]] —— EVE-Agent — 自我训练前先把证据钉在桌上
- [[evo-memory-2511]] —— Evo-Memory — 给"会自己长记性"的 agent 出一份统一考卷
- [[exg-experience-graphs]] —— EXG 经验图 — 把 agent 的成败拼成一张可复用的关系图
- [[self-evolving-agents-survey]] —— 自进化 AI agent 综述 — 给"会自己升级"的 agent 画一张统一地图
- [[self-evolving-software-agents]] —— BDI-LLM Self-Evolving Agents — 让 agent 自己改自己源代码

