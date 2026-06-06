---
title: EXG 经验图 — 把 agent 的成败拼成一张可复用的关系图
来源: 'Jin et al., "EXG: Self-Evolving Agents with Experience Graphs", arXiv:2605.17721, 2026'
日期: 2026-06-01
子分类: 智能体与 LLM
分类: Agent
难度: 中级
provenance: pipeline-v3
---

## 是什么

EXG 是 2026 年 5 月一篇论文，提出把自进化 agent 的"经验"做成 **experience graph**——一张关系图，节点是任务/解法/失败原因，边是它们之间的依赖、相似、因果关系。

日常类比：传统 agent 的 memory 像散落抽屉里的便利贴——每次写一张，越攒越乱。EXG 是把每张便利贴**钉到一面板上**，画线连"这个解法用到了那个组件"、"这次失败和上次原因相同"。一面板比一抽屉好用一万倍——你能一眼看到知识脉络。

EXG 同时支持 **online**（边跑边长图）和 **offline**（把跑完的图当外部 memory 模块），并且号称 plug-and-play——能直接接到现有 agent 上。

## 为什么重要

不接受"经验需要结构化组织"，下面这些事就解释不通：

- 为什么 vanilla memory（向量库）跑久了检索越来越钝
- 为什么 reflection 笔记复用率低——本质是"无索引的笔记本"
- 为什么 RAG 检索"很相似"但常"不相关"——缺关系结构
- 为什么 multi-agent 协作时知识难以传递——格式不统一

## 核心要点

EXG 的三件套：

1. **节点类型**：task（任务）、solution（解决步骤序列）、failure（失败模式）、artifact（中间产物如代码、文档）。每类节点有自己的 schema。类比：白板上贴的便利贴有"任务"、"做法"、"翻车"、"产出"四种颜色。

2. **边类型**：solves（解法解决任务）、depends_on（解法依赖前置任务）、similar_to（任务/失败相似）、causes（失败原因链）。类比：连线的语义。

3. **双模式接入**：
   - online 模式：每次任务结束往图里加节点边
   - offline 模式：把已有图打包成只读 module，插给新 agent 用

EXG 的关键卖点是**"plug-and-play"**——不需要改 agent 的 prompt 模板，只需要在 memory 接口处替换。

## 实践案例

### 案例 1：online 模式跑 code generation

```
T1：任务"写一个 quicksort"
  → solution s1（5 步骤）→ artifact a1（代码）
T2：任务"写 mergesort"
  → 检索图：发现 t1 similar_to t2，s1 借用 → 复用部分逻辑
T3：任务"sort 大文件"
  → 检索：t1/t2 都不适用（数据规模），但 a1 的 partition 思路 depends_on 可借
```

随着图增长，新任务能从历史中"挑零件"而不是从零写。

### 案例 2：offline 模式做 plug-and-play

把 1000 个 code 任务的图导出，给一个完全没经验的新 agent 当外部 memory：

```python
agent = ReActAgent(model="gpt-4")
agent.memory = EXG.load("code_experiences.exg")  # plug
agent.run(new_task)  # 立刻拥有 1000 任务的"经验"
```

实验显示新 agent 比 cold start 提升 14%——经验图真的可迁移。

### 案例 3：失败链复用

```
failure f1: "missing import" causes failure f2: "NameError"
failure f3: "missing import" causes failure f4: "ImportError"
```

EXG 把"missing import"识别为公共上游，agent 看到 NameError 后能向上推到根因，而不是从单条 trace 里反复学。

### 案例 4：图查询替代向量检索

```python
# 传统：top-k 余弦相似
hits = vector_db.search(task_embedding, k=5)

# EXG：图遍历
hits = graph.bfs(task_node, edge_type="similar_to", max_hop=2)
       .filter(lambda n: n.type == "solution")
```

图查询能利用关系语义，而不是只看文本相似——在结构化任务上召回质量明显高。

## 踩过的坑

1. **节点 schema 设计太严**：所有 task 必须填 10 个字段，不填就插不进图——agent 写得很慢，pipeline 卡。论文给的经验是"必填只 2 个，其余可空"。

2. **图增长无上限**：跑长了节点几万。需要 LRU + 重要性双策略——常用边权重高，长期未访问的修剪。

3. **similar_to 边滥用**：相似度阈值低，几乎所有任务都互相相似——失去结构。需要按类型分阈值。

4. **offline 复用的"领域漂移"**：拿 web agent 的经验图给 code agent 用——图结构对了但内容驴唇不对马嘴。论文建议同领域复用为主。

5. **图查询延迟在大图上不可忽视**：上万节点 BFS 比向量检索慢一个量级——需要给 hot path 加缓存。

6. **失败链建模时易"记错原因"**：把表层错误当根因写进 causes 边，下次复用反而误导。需要 LLM 做 root-cause 分析后再写。

## 适用 vs 不适用场景

**适用**：
- 任务有重复模式但每次细节不同（code、SE 任务、SQL）
- 多 agent 团队需要共享经验
- 需要可解释的 memory（图可视化看得到 agent 学了什么）

**不适用**：
- 任务高度独立、复用率低
- 实时性要求高（图维护有开销）
- 任务高度开放无明显结构（创意写作）

## 历史小故事（可跳过）

- **早期**：知识图谱在搜索引擎里发光（Freebase 2007、Wikidata 2012），但和 agent 经验无关
- **2024 年**：A-MEM、Generative Agents 提出"结构化 memory"概念，但还停留在 list/tree
- **2025 年初**：[[self-evolving-agents-survey]] 综述把 memory 列为关键路径但没给方案
- **2025 年中**：多篇工作零散用 graph memory 但都耦合到具体 agent
- **2026 年 5 月**：EXG 把 graph memory 抽成独立组件 + plug-and-play API + 同时 online/offline，定义了通用接口

## 学到什么

1. **memory 的形式决定 agent 的能力上限**：list → tree → graph，每一步都解锁新检索能力
2. **可复用的关键是"接口标准化"**：plug-and-play 比"我们更强"更值得卖
3. **失败也是宝**：失败链建模（causes 边）比只记成功更有信息密度
4. **online + offline 双模式是必需**：online 让 agent 边跑边长，offline 让经验跨 agent 转移
5. **图遍历比向量检索更"懂关系"**：结构化任务上召回质量更高

## 延伸阅读

- 论文 PDF：[arXiv:2605.17721](https://arxiv.org/abs/2605.17721)
- 配套代码：作者 GitHub repo（论文链接）
- [[self-evolving-agents-survey]] —— EXG 在 4 件套里属于 memory 路径
- [[apex-policy-exploration]] —— 同样用图，APEX 重探索，EXG 重复用
- 经典对比：[Generative Agents（Park 2023）](https://arxiv.org/abs/2304.03442)

## 关联

- [[self-evolving-agents-survey]] —— EXG 是其中 memory 进化路径的代表
- [[apex-policy-exploration]] —— 互补：APEX 找新路径，EXG 复用老路径
- [[evo-memory-2511]] —— memory benchmark 给 EXG 这类方法打分
- [[misevolution-2509]] —— EXG 是否能缓解 memory misevolution 是开放问题
- [[code-as-agent-harness]] —— code-as-artifact 在图里是节点
- [[react-agent]] —— EXG 可作为 ReAct 的 memory 后端

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[apex-policy-exploration]] —— APEX — 给自进化 agent 配一张"策略图"防止它走老路
- [[code-as-agent-harness]] —— Code as Agent Harness — 把代码当 agent 的"骨架"来重新看 agentic AI
- [[eve-agent-evidence]] —— EVE-Agent — 自我训练前先把证据钉在桌上
- [[evo-memory-2511]] —— Evo-Memory — 给"会自己长记性"的 agent 出一份统一考卷
- [[llm-wiki-retrieval-reasoning]] —— LLM-Wiki — 把外部知识编译成 agent 自己的"维基"
- [[memcoder-co-evolution]] —— MemCoder — code agent 跟着你 git commit 一起成长
- [[misevolution-2509]] —— Misevolution — 自进化 agent 也会"越改越坏"，连顶配模型也躲不过
- [[self-evolving-agents-survey]] —— 自进化 AI agent 综述 — 给"会自己升级"的 agent 画一张统一地图

