---
title: LLM-Wiki — 把外部知识编译成 agent 自己的"维基"
来源: 'Haoliang Ming et al., "Retrieval as Reasoning: Self-Evolving Agent-Native Retrieval via LLM-Wiki", arXiv:2605.25480, 2026'
日期: 2026-06-01
分类: agents
难度: 中级
---

## 是什么

LLM-Wiki 是一种**让 agent 把外部文档编译成自己内部的维基百科页**，再像人翻 wiki 一样查阅的方法。日常类比：上学时你不是把课本影印一份揣兜里，而是把它整理成自己的笔记本——按章节、加批注、关键词互相链接。LLM-Wiki 让 agent 也这么干，而且还会自己改自己的笔记。

传统 RAG（检索增强生成）的玩法：用户问问题 → embedding（向量）检索 → 把 top-k 段文档塞进 prompt → 模型回答。这种做法把 retrieval 当成**一次性取数**，不能复用结构、不能跨文档跳转、不能纠错。问题一变就全部重算，对 multi-hop（多跳）任务尤其吃力。

LLM-Wiki 的不同：先把语料编译成一组**结构化 wiki 页面**，每页带 bidirectional link（双向链接）。agent 主要通过 `wiki_search` / `wiki_read` 两种 tool call 查页、读页；读到的页面里带着可点的链接，于是可以继续跳转——检索动作和推理动作合一。论文口号是 "retrieval as reasoning"。

## 为什么重要

不理解 LLM-Wiki，下面这些事都没法解释：

- 为什么 GraphRAG / HippoRAG 等"图谱化 RAG"在 multi-hop 上比 vanilla RAG 强但仍有上限
- 为什么"retrieval as reasoning"成为 2026 年 agent 论文的关键命题
- 为什么 agent 能力的瓶颈正在从**模型大小**转向**外部知识的组织形式**
- 为什么"自我纠错"放在知识编译层，往往比只在生成层补救更省钱

## 核心要点

LLM-Wiki 由 **三件套** 组成：

1. **Compilation（编译）**：原始文档 → 结构化 wiki 页。每页有 title / content / links 等字段。链接是 bidirectional——A 提到 B 时，B 页里也写明"被 A 引用"。类比：把一堆论文 PDF 转成 Notion workspace。

2. **Interface（接口）**：agent 主要用两种工具——`wiki_search(query)` 找候选页，`wiki_read(paths)` 读目录或全文。页面正文里的 wikilink 就是下一跳入口，**link-following 是读页后的推理动作，不是第三个独立工具**。类比：搜索框 + 打开词条，点蓝链继续逛。

3. **Error Book（错误簿）**：编译/校验时发现的结构错误、悬空链接、无出处事实等写入 Error Book；系统把根因沉淀成约束，注入后续编译，并做代码层 + LLM 层修复。类比：维基的版规越写越细，坏页会被修，而不是等读者答错题才动手。

## 实践案例

### 案例 1：multi-hop 用 search → read → 跟链接

问题："发明 transformer 架构的人后来去哪家公司？"

```text
wiki_search("transformer 架构")
  → 候选页: "Attention is All You Need"
wiki_read(["Attention is All You Need"])
  → 正文提到 Vaswani et al.，并带链接 "Ashish Vaswani"
wiki_read(["Ashish Vaswani"])   # 跟页内链接再读
  → "2023 年加入 Cohere"
```

**逐部分解释**：

- 第 1 步只定位入口页，不一次塞满 top-k 碎片
- 第 2 步读全文拿中间实体；链接是页面内容的一部分
- 第 3 步再 `wiki_read`，完成多跳；整条 tool 序列就是推理路径（教学示例，非论文原题）

### 案例 2：Error Book 修的是编译质量

编译一批文档后，校验发现 page X 把年份写成 "1985"，且与 source digest 矛盾：

- 条目进 Error Book：现象、根因、约束（"属性必须有出处"）
- Layer 1 代码修复悬空链接；Layer 2 周期性 LLM 修复语义矛盾
- 约束注入下一轮编译 prompt，同类错误更少复发

**逐部分解释**：主线是**知识库自演化**，不是"答错一道 HotpotQA 再临时改页"。查询时 agent 仍受 `T_max`（如 15 次 tool call）预算约束。

### 案例 3：和 GraphRAG 差在哪

| 维度 | GraphRAG | LLM-Wiki |
|---|---|---|
| 知识结构 | 三元组 + community summary | wiki 页 + 双向链接 |
| 检索原语 | 一次检索/摘要 | wiki_search / wiki_read（可多轮） |
| 自纠错 | 常需重建 | Error Book 增量约束与修复 |
| 可解释性 | 摘要黑盒感更强 | tool 调用序列即推理路径 |

**逐部分解释**：GraphRAG 先把社区摘要好再取；LLM-Wiki 让 agent 按需打开词条。论文在 HotpotQA / MuSiQue / 2WikiMultiHopQA 上相对最强图基线高约 2.0–8.1 F1；AuthTrace（论文自建、偏多文档结构化查询）上 overall accuracy 也最好。跳数越深，相对 flat RAG 的优势通常越大。

## 踩过的坑

1. **wiki 编译质量决定上限**：拆得太碎，跟链接会变成"看碎片猜全文"——按章节/实体边界编译，不要只按固定 chunk size。
2. **链接错误会传播**：双向链接错一个，相关页全歪；需要校验孤儿链接，并定期抽查。
3. **Error Book 会膨胀**：条目一多就要聚类压缩，压缩过猛会丢约束精度；开放问题仍在。
4. **遍历会死循环**：A→B→A 要靠 tool 预算（论文设定里常见 `T_max≈15`）、耐心阈值、已访问集合截断，不要无限跟链。
5. **把 Error Book 当成答题后处理**：它主要服务编译质量；查询失败应先查预算/链接/页质量，而不是默认"再跑一遍 editor agent"。

## 适用 vs 不适用场景

适用：

- multi-hop QA（HotpotQA、MuSiQue、2WikiMultiHopQA）
- 知识库定期增量更新——改 wiki / 注入约束，往往比全量重嵌便宜
- 需要可解释 retrieval 路径（tool 序列可审计）的合规或调试场景
- agent 要长期维护结构化外部知识（个人助理、领域专家库）

不适用：

- 单跳简单 QA——编译与多轮 tool 的 overhead 不划算
- 每秒级实时语料——compilation 跟不上
- 结构很弱的语料（纯聊天日志）——编不出有意义的 wiki 页
- 一次性短任务——Error Book 的演化优势体现不出来

## 历史小故事（可跳过）

- 2020：DPR / dense retrieval 让 RAG 流行，奠定"取数"范式
- 2023：HippoRAG 等把记忆检索推向 graph-style
- 2024：GraphRAG 用 community summary 把"结构"塞进 retrieval
- 2025：LightRAG 等分层检索仍多是单步检索动作；业界开始强调 agent 要自己决定下一步查什么
- 2026：LLM-Wiki 把 retrieval 做成可组合的 tool 序列，并在 HotpotQA / MuSiQue / 2WikiMultiHopQA / AuthTrace 上报告强结果

## 学到什么

- retrieval 可以是"推理动作序列"，不必只是一次性取数
- 知识的**结构形式**应和 agent 的**工具动作集**对齐
- 自纠错放在编译/知识层，往往比只在 generation 层补救更划算
- bidirectional link 让正向跳转和反向追溯变成同一种读页动作
- 系统健康度取决于能否沉淀可复用的错误约束——这是 Error Book 的价值
- 多跳优势通常随推理深度增加；评测时别只看最简单的 2-hop 子集

## 延伸阅读

- arXiv 2605.25480 — LLM-Wiki 原论文（Retrieval as Reasoning）
- [[graphrag-2024]] — GraphRAG，对照 community summary
- [[hipporag]] — HippoRAG，PageRank 检索前身
- [[evo-memory-2511]] — long-term memory 的另一形态
- [[self-evolving-agents-survey]] — self-evolving 综述
- [[exg-experience-graphs]] — 经验图谱，结构化记忆另一思路

## 关联

- [[graphrag-2024]] —— 同样接入图结构，但 LLM-Wiki 把动作显式化
- [[hipporag]] —— PageRank-style 记忆检索的前身
- [[evo-memory-2511]] —— 长期记忆演化的对照
- [[self-evolving-agents-survey]] —— 把 agent-native retrieval 放进更大地图
- [[eve-agent-evidence]] —— 同样关心证据可追溯
- [[code-as-agent-harness]] —— 把能力暴露成 tool-call 的同类思路
- [[exg-experience-graphs]] —— wiki-like 结构化记忆
- [[apex-policy-exploration]] —— self-correction 的策略探索维度

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[apex-policy-exploration]] —— APEX — 给自进化 agent 配一张"策略图"防止它走老路
- [[code-as-agent-harness]] —— Code as Agent Harness — 把代码当 agent 的"骨架"
- [[eve-agent-evidence]] —— EVE-Agent — 自我训练前先把证据钉在桌上
- [[evo-memory-2511]] —— Evo-Memory — 给"会自己长记性"的 agent 出统一考卷
- [[exg-experience-graphs]] —— EXG 经验图 — 把成败拼成可复用关系图
- [[self-evolving-agents-survey]] —— 自进化 AI agent 综述
- [[self-evolving-software-agents]] —— BDI-LLM Self-Evolving Agents
