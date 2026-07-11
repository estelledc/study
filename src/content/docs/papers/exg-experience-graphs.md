---
title: EXG 经验图 — 把 agent 的成败拼成一张可复用的关系图
来源: 'Jin et al., "EXG: Self-Evolving Agents with Experience Graphs", arXiv:2605.17721, 2026'
日期: 2026-06-01
分类: agents
难度: 中级
---

## 是什么

EXG 是 2026 年 5 月一篇论文，提出把自进化 agent 的"经验"做成 **experience graph**——一张关系图：节点是一次次尝试（成功/失败案例）和任务锚点，边是归属、相似、纠错关系。

日常类比：传统 agent 的 memory 像散落抽屉里的便利贴——每次写一张，越攒越乱。EXG 是把每张便利贴**钉到一面板上**，再画线："这次尝试属于哪个任务"、"这两次尝试很像"、"这次修好了上次的翻车"。一面板比一抽屉好用——你能一眼看到知识脉络。

EXG 同时支持 **online**（边跑边长图）和 **offline**（把跑完的图当外部 memory 模块），并且号称 plug-and-play——能接到现有自进化 agent 上。

## 为什么重要

不接受"经验需要结构化组织"，下面这些事就解释不通：

- 为什么 vanilla memory（向量库）跑久了检索越来越钝
- 为什么 reflection 笔记复用率低——本质是"无索引的笔记本"
- 为什么 RAG 检索"很相似"但常"不相关"——缺关系结构
- 为什么 multi-agent 协作时知识难以传递——格式不统一

## 核心要点

EXG 的三件套（对齐论文图式）：

1. **节点类型**：Case 节点（golden=成功轨迹 / warning=失败轨迹）+ Task anchor（每个任务一个入口，把该任务的多次尝试挂在一起）。类比：白板上"任务标题贴"和"每次尝试贴"两种颜色。

2. **边类型**：contain（锚点→案例，表示归属）、similar_to（案例↔案例，语义相似）、fixed_by（失败案例→修好它的成功案例）。类比：连线的三种语义。

3. **双模式接入**：
   - online：每次尝试结束往图里加节点/边，立刻跨任务复用
   - offline：图冻结成只读外部 memory，给新任务检索用

卖点是 **plug-and-play**：主要在推理时注入经验提示，不必改模型参数。

检索不是"把整张图扫一遍"，而是：从任务锚点取种子 → 沿 similar_to 有界扩展 → 需要时再跟 fixed_by 拿纠错结果 → rerank 后塞进 prompt。

## 实践案例

### 案例 1：online 模式跑 code generation

```
任务 τ1「写 quicksort」
  → warning 案例 c1（缺 import）—fixed_by→ golden 案例 c2（补上 import 后通过）
任务 τ2「写 mergesort」
  → 检索：从 τ2 锚点附近 + similar_to 扩一跳，借到 c2 的分区/递归提示
```

图边长边用：新任务不是从零写，而是先拿"相似成功 + 纠错链"当 hint。

逐步看：① 失败案例先入库；② 修好后连 fixed_by；③ 新任务靠 similar_to 借到这条链。

### 案例 2：offline 冻结图当外部 memory（示意）

论文流程是：先 online 收集并建图 → 冻结 → 新任务只做 retrieve / rerank → 把 top hint 塞进 prompt。下面伪代码只帮助理解，不是官方 SDK：

```python
# 示意：offline = 图只读，不再写入
graph = build_exg_from_online_runs(code_tasks)  # 已含 anchor/case/边
hints = retrieve_and_rerank(graph, new_task, fanout=5)
agent.run(new_task, experience_hints=hints)
```

文中 HumanEval 学习曲线显示：跑到约 60 个任务时，EXG 系方法相对早期阶段大约多 **14–15 个百分点**的累计 Pass@1；相对长期平台期的基线，优势还会更大。这不是"随便换个 agent 就 +14%"的万能数。

### 案例 3：失败链用 fixed_by，而不是只记报错文本

```
warning c1: missing import → NameError
golden  c2: 补上 import 后通过
边：c1 —fixed_by→ c2
```

下次再撞到同类 warning，检索可以沿 fixed_by 直接拿到"怎么修"，而不是只在向量库里搜到相似报错句。

### 案例 4：图检索 vs 纯向量 top-k（示意）

```python
# 传统：只看文本相似
hits = vector_db.search(task_embedding, k=5)

# EXG：锚点种子 → similar_to 扩一跳 → 再看 fixed_by（论文是有界 fanout，不是全图裸 BFS）
hits = retrieve_from_anchors(graph, task, fanout_sim=5)
```

## 踩过的坑

1. **节点 schema 设计太严**：必填字段过多会拖慢写入。教学经验是先保证 case 结果与关键签名，其余可空。
2. **图增长无上限**：长部署后案例上万。需要按重要性/访问频率修剪，不能无限堆。
3. **similar_to 阈值过低**：几乎全连全，结构失效。应按任务类型分阈值，并限制 fanout。
4. **offline 跨领域复用**：web agent 的图硬塞给 code agent，结构对了内容不对。优先同领域复用。
5. **把检索写成全图 BFS**：论文是有界扩展；大图上无界遍历会比向量检索慢一个量级，hot path 要缓存。
6. **把表层报错当根因写进纠错边**：会误导下次复用。写 fixed_by 前先做 root-cause 归纳。

## 适用 vs 不适用场景

**适用**：
- 任务有重复模式但细节不同（code、多跳 QA）
- 需要可解释 memory（能画出"从哪次成功/纠错借的"）
- 想给现有 reflection/自进化 agent 加一层结构化经验，且能接受检索+重排的毫秒～数十毫秒开销

**不适用**：
- 任务高度独立、复用率低（经验边几乎连不起来）
- 强实时、不能承担图维护/检索开销（毫秒级预算很紧时）
- 高度开放、难抽稳定签名的任务（如纯创意写作）
- 需要改模型权重才能进步的场景——EXG 走的是推理期非参数记忆

## 历史小故事（可跳过）

- **早期**：知识图谱在搜索引擎里发光（Freebase 2007、Wikidata 2012），但和 agent 经验无关
- **2023–2024**：Generative Agents、A-MEM 等把"结构化 memory"推上台面，多停在 list/tree
- **2025**：自进化 agent 综述把 memory 列为关键路径，图记忆工作仍常耦合具体 agent
- **2026-05**：EXG（arXiv:2605.17721）把 experience graph 做成 online/offline 统一组件，并强调 plug-and-play

## 学到什么

1. **memory 形式会卡住能力上限**：list → tree → graph，每一步都解锁新检索方式
2. **可复用的关键是接口标准化**：plug-and-play 往往比"单次分数更高"更值钱
3. **失败也是宝**：fixed_by 纠错边比只存成功轨迹信息密度更高
4. **online + offline 要一起设计**：边跑边长，和冻结迁移，是同一张图的两种用法
5. **有界图遍历比纯向量更"懂关系"**：结构化任务上更吃香，但要控 fanout

## 延伸阅读

- 论文 PDF：[arXiv:2605.17721](https://arxiv.org/abs/2605.17721)
- [[self-evolving-agents-survey]] —— EXG 在 memory 进化路径上的位置
- [[apex-policy-exploration]] —— 同样用图，APEX 重探索，EXG 重复用
- [[evo-memory-2511]] —— memory benchmark
- 经典对比：[Generative Agents（Park 2023）](https://arxiv.org/abs/2304.03442)

## 关联

- [[self-evolving-agents-survey]] —— memory 进化路径代表之一
- [[apex-policy-exploration]] —— 互补：找新路径 vs 复用老路径
- [[evo-memory-2511]] —— 给这类方法打分
- [[misevolution-2509]] —— 是否缓解 memory misevolution 仍开放
- [[code-as-agent-harness]] —— 代码产物可落入 case 轨迹
- [[react-agent]] —— 可作为 ReAct 的经验后端思路
- [[memcoder-co-evolution]] —— 另一条"经验随代码一起长"的路线
- [[eve-agent-evidence]] —— 证据钉牢后再谈自训练，和"先结构化经验"同向

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

