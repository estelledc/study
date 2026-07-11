---
title: EffiSkill — 把代码效率优化经验抽成两层 skill 库
来源: 'EffiSkill: Agent Skill Based Automated Code Efficiency Optimization, arXiv:2603.27850, 2026'
日期: 2026-06-01
分类: agents
难度: 中级
---

## 是什么

EffiSkill 是一套**让 agent 从大量"代码效率优化案例"里挖出两层 skill 库，再把这些 skill 应用到没见过的程序上**的方法。两层指 Operator skill（具体改写动作，如"换 hash map 替线性查"）和 Meta skill（更高层模式，如"先识别热点再选优化方向"）。日常类比：以前的 code review agent 是"看到一个慢函数就猜怎么改"；EffiSkill 是先建本工具书"常见瓶颈和对应改法 + 怎么先找到瓶颈"，下次直接查书。

旧路线靠 LLM 在 prompt 里硬扛——给一段慢代码，让模型直接出优化版。问题：（a）相同 pattern 反复推理浪费 token；（b）模型见过的优化案例多但没显式抽取经验，效率不稳定；（c）没有"先找瓶颈再改"的层次感，改一些不是热点的地方。

EffiSkill 的两阶段流程是：**Mining 阶段**——从大量慢/快程序对里抽出 Operator skill（具体改写机制）和 Meta skill（怎么诊断、检索、组合这些机制）。**Application 阶段**——对新程序做**不依赖在线跑分**的诊断与改写：先定位瓶颈，再检索 skill、组成 2–3 条优化计划并生成候选。论文在 EffiBench-X 上报告，optimization success rate 相对最强基线高约 3.7~12.5 个百分点。

## 为什么重要

不理解 EffiSkill，下面这些事都没法解释：

- 为什么单靠"再写一版更快的代码"不够——需要把可复用的优化机制显式抽出来
- 为什么 LLM 单看一段慢代码很难给出根本性优化——它需要先有"瓶颈分类知识"
- 为什么"经验显式化"比"扩大模型"在工程任务上提升更稳——pattern 数有限，记一遍就够
- 为什么这条路对 LLM 训练数据集策展也有启发——好数据是 mined skill 不是 raw code

## 核心要点

EffiSkill 的关键是 **两层结构**，可以拆成 **三步**：

1. **Mining**：从慢/快程序对里抽 skill。Operator skill 写清适用条件、改写步骤、复杂度效果和常见坑；Meta skill 管诊断、检索与计划组合。类比：师傅整理徒弟做过的活，分两本书——"基本功手册"和"工序总览"。

2. **Hierarchical Application**：新代码进来，先诊断瓶颈，再检索相关 skill，用 Meta skill 组成多条计划，再生成候选实现。两层串联避免"不重要的地方瞎改"。

3. **Execution-free 推理**：应用阶段**不**在循环里反复跑程序拿反馈；skill 卡里的"何时不用 / 常见坑"在离线挖掘时就写好。类比：出诊时查手册，而不是每开一方药都先拿病人做实验。

三步加起来：有库、分层用、推理时可不依赖在线执行。面对没见过的代码时更像"查手册"，而不是"盲猜一版再测"。

## 实践案例

### 案例 1：从慢/快对里挖 Operator skill

慢版本：

```python
result = []
for x in data:
    if x['key'] in lookup:  # lookup 若是 list，每次都是线性扫
        result.append(x)
```

快版本：

```python
keys = set(lookup)
result = [x for x in data if x['key'] in keys]
```

**逐部分解释**：

- 慢版在循环里反复做成员检查，容器选错就会变成 O(n²) 量级。
- 快版先把右侧收成 `set`，单次检查接近 O(1)。
- Mining 抽出 Operator skill："成员检查前把右侧转 set"，并写上适用信号与常见坑。

### 案例 2：Meta skill 决定该往哪边改

新代码：

```python
for user in users:
    profile = db.query(User).filter(User.id == user.id).first()
    process(profile)
```

**逐部分解释**：

- 单看一行查询，局部语法没问题，硬套"换 set"这类 Operator 对不上。
- Meta / 诊断步骤先标出"循环内重复小查询"这类瓶颈画像。
- 再检索到 "**N+1 → batch query**" Operator，改写成一次 `id.in_(...)` 拉取。

Meta 管方向与组合，Operator 管具体改写，缺一不可。

### 案例 3：skill 卡里的"何时不用"

Operator skill 不只写"怎么改"，还带 **When not to use / Common pitfalls**。例如 vectorize 类 skill 会写：输入很小、调用开销大于收益时不要改。

**逐部分解释**：

- 这些边界来自离线挖掘时对慢/快对与失败模式的归纳，不是推理时跑一轮 benchmark 再回写库。
- Application 阶段用这些字段做 execution-free 筛选：计划里直接跳过不适用的改写。
- 论文评测仍会在 EffiBench-X 上离线量 OPT 成功率，但那是实验协议，不是部署时的在线闭环。

## 踩过的坑

1. **两层边界要看场景**：有些知识既像动作又像策略，粒度细的进 Operator，粗的进 Meta，混放会检索混乱。
2. **冷启动依赖慢/快语料**：没有成对优化数据的领域，skill 库几乎要从零挖；竞赛语料不等于你的业务代码分布。
3. **"何时不用"写太宽会误杀**：例如写成"任何场景都不要 vectorize"，会把本来划算的改写也滤掉。
4. **别把离线评测当成在线闭环**：EffiBench-X 可以跑分，但框架设计目标是推理时 execution-free；没有代表负载时，在线反复试跑往往不可用。

## 适用 vs 不适用场景

**适用**：

- 有大量慢/快程序对可挖 skill（如竞赛/基准里的效率优化对）
- 部署时难拿到代表负载或安全沙箱，需要 execution-free 出候选
- 瓶颈机制可复用（数据结构、DP 压缩、常数因子改写等）

**不适用**：

- 算法本身被业务约束锁死，几乎没有合法改写空间
- 性能瓶颈主要在 IO / 网络 / 外部服务，源码级 Operator 覆盖不到
- 完全没有可挖掘的优化语料，又付不起冷启动建库成本
- 必须依赖在线 profiling 才能决策的系统级调优（缓存容量、并行度、硬件参数）

## 历史小故事（可跳过）

- **2014**：Spark / Pandas 等高阶 API 把"vectorize 改写"工程化，但仍靠人手判断
- **2022**：Codex / Copilot 让"改一段慢代码"成 LLM benchmark 任务，但模型直接 prompt 改写
- **2024**：CodeAct / [[voyager]] 让 agent 攒 skill，路径开通但 skill 单层
- **2025**：EffiBench / SciCode benchmark 出现，性能优化任务正式 benchmark 化
- **2026 年初**：EffiSkill 提出 Operator + Meta 两层 skill，并强调应用阶段 execution-free
- **同期**：[[mind-skill]] / [[skill-as-pseudocode]] 在通用 skill 表示上做工作

代码效率优化先一步显式化经验结构，因为 benchmark 反馈最快、收益最直接。

## 学到什么

1. **两层 skill 比单层强**：机制（Operator）和调度（Meta）分开，复用更准
2. **"何时不用"要写进卡里**：适用边界和常见坑是 skill 的一部分，不是事后补丁
3. **execution-free 是部署约束**：很多真实环境给不出在线试跑预算
4. **语料决定天花板**：慢/快对的质量与覆盖，直接决定 skill 库能迁移多远
5. **粒度划分有取舍**：太细库爆炸，太粗失去可检索的机制差异

## 延伸阅读

- 论文原文：[arXiv 2603.27850](https://arxiv.org/abs/2603.27850)
- 论文 HTML：[arXiv HTML](https://arxiv.org/html/2603.27850)（含 Stage I/II 总览图）
- [[voyager]] —— skill 库奠基
- [[skill-as-pseudocode]] —— 同期 skill 表示工作
- [[mind-skill]] —— 同期 skill 质量工作
- [[react-agent]] —— ReAct 推理循环，Meta skill 编排可对照

## 关联

- [[voyager]] —— skill 库奠基；EffiSkill 在它基础上做层次化
- [[skill-as-pseudocode]] —— 同期 skill 表示工作；垂直方向
- [[mind-skill]] —— 同期 skill 质量工作；横向互补
- [[skill-pro-nonparametric-ppo]] —— 同期 skill 选择优化路线
- [[skill-sd-self-distillation]] —— 同期 skill 自蒸馏
- [[webxskill]] —— Web agent skill；同期跨领域参考
- [[react-agent]] —— ReAct 推理循环；EffiSkill 用 Meta skill 做诊断与计划组合

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[mind-skill]] —— MIND-Skill — 用归纳和演绎双 agent 抽 skill 并保证质量
- [[skill-as-pseudocode]] —— Skill-as-Pseudocode — 把 agent 笔记本写成可校验的伪代码
- [[skill-pro-nonparametric-ppo]] —— Skill-Pro — 不动权重学可复用 skill 的非参数 PPO
- [[skill-sd-self-distillation]] —— Skill-SD — 用 agent 自己抽出的 skill 当 dynamic teacher 自蒸馏
- [[webxskill]] —— WebXSkill — 给 Web agent 的可执行 skill 是参数化代码 + URL 图索引
