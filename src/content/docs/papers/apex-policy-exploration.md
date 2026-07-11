---
title: APEX — 给自进化 agent 配一张"策略图"防止它走老路
来源: 'Li et al., "APEX: Autonomous Policy Exploration for Self-Evolving LLM Agents", arXiv:2605.21240, 2026'
日期: 2026-06-01
分类: agents
难度: 中级
---

## 是什么

APEX 是 2026 年 5 月的论文，专治自进化 agent 的"探索坍缩"（exploration collapse）：agent 跑久了 memory 里都是过去走通的成功路径，新动作越来越少，被困在局部最优。

日常类比：像一个老员工，第一次解决问题时做了 10 种尝试，找到一种能用就把它写进"标准操作流程"。从此他每次都套这套，再也不试新方法。短期效率高，长期看，他错过了所有可能更好的解法。APEX 给他一张**策略地图**——显式标注"已走过的路径"和"可能值得探索但还没碰的方向"，强迫他偶尔走新路。

策略地图是一张 **DAG（有向无环图）of milestones**——节点是子目标，边是"前置依赖"。agent 在图上规划时同时做 fork discovery（找新分叉）和 policy selection（在新旧之间平衡）。

简单说：传统自进化 agent 的反馈回路只奖励"走通了"，APEX 把"还没走过的路"也变成显式信号纳入回路。这是把 RL 里"explore vs exploit"的老课题搬到 LLM agent 时代的一次对齐。

## 为什么重要

不解决探索坍缩，自进化 agent 走不远：

- 为什么部署 100 个 episode 后 agent 性能不再提升，反而轻微下滑
- 为什么 memory 越大越倾向于"贴最近邻"——失去多样性
- 为什么传统 RL 的 ε-greedy 在 LLM agent 场景几乎没效果（动作空间太大）
- 为什么"加 reflection"治标不治本——reflection 还是会引向旧路径
- 为什么真实部署的 agent 都需要"诊断面板"才能 debug

## 核心要点

APEX 三块拼图：

1. **Strategy Map**：显式建一张 milestone DAG。节点是 agent 在任务空间识别出的子目标（如"找到登录页"、"提交表单"），边是依赖（"先登录再下单"）。类比：迷宫地图，已走过的格子标灰，未走过的标红。

2. **Fork Discovery**：每个 episode 后扫描已有 trace，找"证据支持但还没尝试的分叉"。比如观察到页面有"高级搜索"按钮但 agent 一直没点过，就生成一条新策略加入图。类比：地图上发现了一条岔路，标记"待探索"。

3. **Policy Selection**：规划时不再只挑历史最高 reward，而是按"图覆盖率 + 期望价值"加权。类比：不光走最快路，还要每周走一条新路看看。

三件套配合的核心理念：把"探索"从动作级（按 token 抖动）抬到策略级（按子目标抖动）。在 LLM agent 的巨大动作空间里，这是唯一现实的探索粒度。

## 实践案例

### 案例 1：在 Jericho 文字冒险游戏

Jericho 是 9 个经典文字冒险游戏的 RL benchmark。基线 agent 跑 50 episode 后陷在局部解：

```
trace 1-50: enter cave → light torch → fight troll → die → restart
```

APEX 在多轮 episode 后通过 fork discovery 标出"east of cave 没去过"，policy selection 给它探索权重，后续 episode 解锁新路径，最终通关率相对基线提升。

### 案例 2：在 WebArena 上下单

WebArena 是真实电商网站模拟。基线 agent 学会了"点搜索框 → 输入 → 点第一个结果 → 加购物车"。APEX 的策略图发现"过滤器侧栏 + 排序"分叉从未尝试，加进图后 agent 学会了用过滤器更快锁定商品，效率和成功率都高于只复用旧路径的基线。

### 案例 3：消融实验看每块贡献

```
       论文消融的读法
baseline           容易重复旧路径
+ strategy map      节点显式化已经有用
+ fork discovery    新分叉真的能跑出新策略
+ policy selection  平衡才避免坍缩
```

三块都是必要的，去掉任何一块退化明显。

### 案例 4：策略图可视化辅助 debug

论文给了一组截图：策略图节点用颜色编码"已走/已挫败/未探索"，线条粗细代表通过频次。开发者看一眼就知道 agent 在哪段卡住——比看 trace log 直观 10 倍。这是结构化 memory 的隐形红利。

### 案例 5：跨任务策略迁移

把策略图当成"领域经验包"，给同领域新任务直接挂载。论文展示在一组 Jericho 游戏里学到的图可以迁移到相邻任务，相比 cold start 更早达到同等通过率——经验复用的边际收益清晰。

## 踩过的坑

1. **milestone 抽得太细**：每个原始动作都成一个节点，图爆炸；每个大目标一个节点，又粒度不够。论文给的经验是按"语义可命名的子目标"来切。

2. **fork discovery 的"证据"被噪声主导**：页面里所有元素都被当成"潜在分叉"，agent 被低价值方向淹没。论文加了相关性过滤——只有过去成功 trace 里多次出现但没被走的才算。

3. **policy selection 的探索权太大变随机游走**：太小退化成贪心。论文用退火（episode 多了权重下降）和任务难度自适应。

4. **图持续增长无上限**：跑久了节点上千。论文加了图修剪：长期未触发的节点降权直至剔除。

5. **跨任务复用图时 milestone 命名歧义**：同一个名字在不同任务下含义不同——需要带任务上下文 tag。

6. **fork discovery 不能只看一次 trace**：偶发证据噪声大，论文要求"≥3 次出现"才算 fork 候选。

## 适用 vs 不适用场景

**适用**：
- 长期部署的 agent，有"跑久了变笨"的迹象
- 任务空间结构化、子目标可命名（web 操作、文字冒险、家务）
- 已经有 memory 但 reflection 收益递减
- 想给团队提供"可视化诊断面板"
- 同领域多任务可共享策略图

**不适用**：
- 短期一次性任务（没机会坍缩）
- 任务子目标无法显式拆分（开放对话、创意写作）
- 计算预算极紧——APEX 的图维护和分叉扫描有额外开销（论文给的是 +15% latency）
- 任务回报极稀疏（探索改进难以体现在短期 reward）
- 真实环境带高破坏代价（探索新策略可能造成不可逆操作）

## 历史小故事（可跳过）

- **2017-2020 年**：传统 RL 的 curiosity-driven exploration（ICM、RND）把"新颖度"作信号——idea 类似但作用在像素或低维状态
- **2023-2024 年**：Voyager / Reflexion 让 LLM agent 通过 reflection 探索，但都偏 textual
- **2024 年底**：MCTS-Agent 类工作把搜索树搬回来，但开销大、难维护
- **2025 年中**：有人指出 "memory bloat = exploration collapse" 同根问题，明确提出需要显式策略表征
- **2026 年 5 月**：APEX 把它做成 milestone DAG + 双机制，第一次在 Jericho + WebArena 同时拿到提升

## 学到什么

1. **探索不是动作级随机，是策略级显式**：LLM agent 的动作空间太大，需要在更高抽象上探索
2. **图是好载体**：DAG 自然表达依赖、覆盖、未访问区域
3. **memory 需要"反义词"**：除了记成功，还要记"什么没试过"
4. **fork discovery 像 mutation，policy selection 像 selection**：自进化 agent 借鉴了进化算法的两段式
5. **可视化是副产品也是诊断工具**：策略图天然能画，开发者受益巨大
6. **退火参数和图修剪共同决定长期稳定**：少了任一项跑长就出 bug
7. **跨任务复用策略图收益显著**：同领域 cold start 提速明显
8. **APEX 给 explore-exploit 老课题添了"图视角"**：传统 RL 的探索基本都是状态级，这里抬到子目标级

## 延伸阅读

- 论文 PDF：[arXiv:2605.21240](https://arxiv.org/abs/2605.21240)
- benchmark：[Jericho](https://github.com/microsoft/jericho) / [WebArena](https://webarena.dev)
- [[self-evolving-agents-survey]] —— APEX 在 4 件套里属于 optimiser 改进
- [[exg-experience-graphs]] —— 经验图的姊妹设计（侧重复用，APEX 侧重探索）
- [[evo-memory-2511]] —— 流式 benchmark 让探索坍缩首次量化
- [[misevolution-2509]] —— 探索坍缩与错误进化的相邻文献
- [[code-as-agent-harness]] —— harness 之上才能做策略层

## 关联

- [[self-evolving-agents-survey]] —— APEX 是其 optimiser 路径的具体方法
- [[exg-experience-graphs]] —— 同样用图，但 EXG 重组织成功经验，APEX 重发现未走路径
- [[evo-memory-2511]] —— memory 是探索坍缩的主因之一
- [[misevolution-2509]] —— 探索坍缩 vs 错误进化是相邻风险
- [[react-agent]] —— APEX 在 ReAct 之上加策略层
- [[reflexion]] —— APEX 显式补 reflection 的盲点
- [[code-as-agent-harness]] —— 策略图天然是一种 code-shaped artifact
- [[swe-agent]] —— SWE 任务中策略图能避开"重复改错文件"

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[agent-r1-2511]] —— Agent-R1 — 把 LLM agent 当 RL 环境训练的模块化框架
- [[code-as-agent-harness]] —— Code as Agent Harness — 把代码当 agent 的"骨架"来重新看 agentic AI
- [[eve-agent-evidence]] —— EVE-Agent — 自我训练前先把证据钉在桌上
- [[evo-memory-2511]] —— Evo-Memory — 给"会自己长记性"的 agent 出一份统一考卷
- [[exg-experience-graphs]] —— EXG 经验图 — 把 agent 的成败拼成一张可复用的关系图
- [[llm-wiki-retrieval-reasoning]] —— LLM-Wiki — 把外部知识编译成 agent 自己的"维基"
- [[memcoder-co-evolution]] —— MemCoder — code agent 跟着你 git commit 一起成长
- [[misevolution-2509]] —— Misevolution — 自进化 agent 也会"越改越坏"，连顶配模型也躲不过
- [[reflexion]] —— Reflexion — 让 LLM 自我反思
- [[self-evolving-agents-survey]] —— 自进化 AI agent 综述 — 给"会自己升级"的 agent 画一张统一地图
- [[self-evolving-recsys-2602]] —— Self-Evolving RecSys — 让 LLM agent 自己跑超参实验上线
- [[self-evolving-software-agents]] —— BDI-LLM Self-Evolving Agents — 让 agent 自己改自己源代码
- [[swe-agent]] —— SWE-Agent — Princeton SWE-bench 解法

