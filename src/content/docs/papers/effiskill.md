---
title: EffiSkill — 把代码效率优化经验抽成两层 skill 库
来源: 'EffiSkill: Agent Skill Based Automated Code Efficiency Optimization, arXiv:2603.27850, 2026'
日期: 2026-06-01
子分类: 智能体与 LLM
分类: Agent
难度: 中级
provenance: pipeline-v3
---

## 是什么

EffiSkill 是一套**让 agent 从大量"代码效率优化案例"里挖出两层 skill 库，再把这些 skill 应用到没见过的程序上**的方法。两层指 Operator skill（具体改写动作，如"换 hash map 替线性查"）和 Meta skill（更高层模式，如"先识别热点再选优化方向"）。日常类比：以前的 code review agent 是"看到一个慢函数就猜怎么改"；EffiSkill 是先建本工具书"常见瓶颈和对应改法 + 怎么先找到瓶颈"，下次直接查书。

旧路线靠 LLM 在 prompt 里硬扛——给一段慢代码，让模型直接出优化版。问题：（a）相同 pattern 反复推理浪费 token；（b）模型见过的优化案例多但没显式抽取经验，效率不稳定；（c）没有"先找瓶颈再改"的层次感，改一些不是热点的地方。

EffiSkill 的两阶段流程是：**Mining 阶段**——分析一批已知的 before/after 优化对，让一个写者 LLM 写出 Operator skill（"把 list-of-dict 转 ndarray 用 vectorize 改写"）和 Meta skill（"识别 N+1 查询模式 → 批量化改写"）。**Application 阶段**——给一段新代码，先用 Meta skill 定位优化方向，再用 Operator skill 落地具体改写。论文报告 EffiBench-X 上提升 3.7~12.5pp。

## 为什么重要

不理解 EffiSkill，下面这些事都没法解释：

- 为什么 2026 年代码效率优化 agent 论文集体往"两层 skill"走——单层不够区分 what 和 how
- 为什么 LLM 单看一段慢代码很难给出根本性优化——它需要先有"瓶颈分类知识"
- 为什么"经验显式化"比"扩大模型"在工程任务上提升更稳——pattern 数有限，记一遍就够
- 为什么这条路对 LLM 训练数据集策展也有启发——好数据是 mined skill 不是 raw code

## 核心要点

EffiSkill 的关键是 **两层结构**，可以拆成 **三步**：

1. **Mining**：从历史优化案例（如 GitHub PR 标 "performance"、benchmark 优化对）里抽 skill。Operator skill 单点改写，Meta skill 跨 case 共享的 pattern。类比：师傅整理徒弟做过的所有活，分两本书——"基本功手册"（Operator）和"工序总览"（Meta）。

2. **Hierarchical Application**：新代码进来，先用 Meta skill 库做"定位"——识别这段代码可能的瓶颈类型；再用 Operator skill 库做"落地"——选具体改写动作。两层串联避免"不重要的地方瞎改"。

3. **Closed-loop Verification**：改写完跑 benchmark 验证，慢了或错了把这次失败也送回 Mining，提炼出"反例 skill"——下次相似 pattern 不要这样改。

三步加起来：有库、分层用、能学反例。这种结构让 EffiSkill 在面对没见过的代码时不再是"猜"，而是"查"。

## 实践案例

### 案例 1：从 PR 里挖 Operator skill

GitHub 上某 PR 把：

```python
result = []
for x in data:
    if x['key'] in lookup:
        result.append(x)
```

改成：

```python
keys = set(lookup)
result = [x for x in data if x['key'] in keys]
```

EffiSkill mining 抽出 Operator："**list-membership 检查时把右侧从 list/dict 转 set**——O(n) 降 O(1)"。这个 skill 只描述具体改写，不管什么时候用。

### 案例 2：Meta skill 决定该往哪边改

新代码：

```python
for user in users:
    profile = db.query(User).filter(User.id == user.id).first()
    process(profile)
```

直接用 Operator skill 找不到合适改写——单点没问题。

但 Meta skill "**循环里多次小查询 = N+1 模式**" 触发，定位到这是批量查询场景。然后 Application 阶段查 Operator 库找到 "**N+1 改 batch query**" 这条具体动作，改写为：

```python
profiles = db.query(User).filter(User.id.in_([u.id for u in users])).all()
```

Meta 找方向、Operator 落细节，缺一不可。

### 案例 3：失败回灌成反例 skill

某次改写："循环改成 `numpy.vectorize`"——结果 benchmark 反而慢了（数据规模太小，向量化开销不划算）。

EffiSkill 把这次失败 mining 出反例："**N < 1000 时 numpy 改写不划算，保留原循环**"。下次类似情况查到这条会跳过 vectorize 改写。

反例和正例同等价值——这是 EffiSkill 与单纯"积累成功经验"路线的区别。

## 踩过的坑

1. **两层边界要看场景**：有些 skill 既像 Operator 又像 Meta（如"用缓存"既是动作又是模式），要看任务粒度划——粒度细的算 Operator，粗的算 Meta。
2. **冷启动问题**：EffiBench-X 是 mined-from 数据，没这个数据的领域 skill 库要从零起。论文用 GitHub PR 自动挖填库，但质量参差。
3. **反例 skill 要严格匹配条件**：写得太宽（"任何场景都不要 vectorize"）会让原本对的改写也被否决。
4. **改写后必须跑 benchmark 验证**：LLM 自评说"这样应该更快"经常错——只有真测才知道。

## 适用 vs 不适用场景

**适用**：

- 性能优化场景，瓶颈类型有限可枚举（Web 后端 / 数据处理 / 计算密集脚本）
- 有 benchmark 框架可一键测速（pytest-benchmark / criterion 等）
- 历史优化案例积累足够（开源大项目 PR 历史 / 内部 review 库）

**不适用**：

- 算法本身不能改（业务逻辑约束死）
- 性能瓶颈在 IO / 网络等外部因素（Operator 库覆盖不到）
- 极小规模代码（一次性脚本）——建库的开销大于直接重写
- 需要硬实时（本身就是 hot path 不能停下来分析）

## 历史小故事（可跳过）

- **2014**：Spark / Pandas 等高阶 API 把"vectorize 改写"工程化，但仍靠人手判断
- **2022**：Codex / Copilot 让"改一段慢代码"成 LLM benchmark 任务，但模型直接 prompt 改写
- **2024**：CodeAct / [[voyager]] 让 agent 攒 skill，路径开通但 skill 单层
- **2025**：EffiBench / SciCode benchmark 出现，性能优化任务正式 benchmark 化
- **2026 年初**：EffiSkill 提出 Operator + Meta 两层结构——这是当前最显式的层次化 skill 实现
- **同期**：[[mind-skill]] / [[skill-as-pseudocode]] 在通用 skill 表示上做工作

代码效率优化先一步显式化经验结构，因为 benchmark 反馈最快、收益最直接。

## 学到什么

1. **两层 skill 比单层强**：what 和 how 分开记，复用更精准
2. **反例 skill 同等重要**：不能只攒成功经验
3. **必须配 benchmark 闭环**：LLM 自评不可靠
4. **冷启动靠 PR 历史**：开源生态是 skill 库的最大补给来源
5. **粒度划分有 art**：太细 skill 库爆炸，太粗失去复用性

## 延伸阅读

- 论文原文：[arXiv 2603.27850](https://arxiv.org/abs/2603.27850)
- EffiBench-X 测评：[github.com/effibench](https://github.com/) （论文 repo）
- [[voyager]] —— skill 库奠基
- [[skill-as-pseudocode]] —— 同期 skill 表示工作
- [[mind-skill]] —— 同期 skill 质量工作

## 关联

- [[voyager]] —— skill 库奠基；EffiSkill 在它基础上做层次化
- [[skill-as-pseudocode]] —— 同期 skill 表示工作；垂直方向
- [[mind-skill]] —— 同期 skill 质量工作；横向互补
- [[skill-pro-nonparametric-ppo]] —— 同期 skill 选择优化路线
- [[skill-sd-self-distillation]] —— 同期 skill 自蒸馏
- [[webxskill]] —— Web agent skill；同期跨领域参考
- [[react]] —— agent 标准循环；EffiSkill 在 think 阶段做两次（meta + operator）

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[mind-skill]] —— MIND-Skill — 用归纳和演绎双 agent 抽 skill 并保证质量
- [[react]] —— React UI 组件库
- [[skill-as-pseudocode]] —— Skill-as-Pseudocode — 把 agent 笔记本写成可校验的伪代码
- [[skill-pro-nonparametric-ppo]] —— Skill-Pro — 不动权重学可复用 skill 的非参数 PPO
- [[skill-sd-self-distillation]] —— Skill-SD — 用 agent 自己抽出的 skill 当 dynamic teacher 自蒸馏
- [[voyager]] —— Voyager — LLM 终身学习智能体
- [[webxskill]] —— WebXSkill — 给 Web agent 的可执行 skill 是参数化代码 + URL 图索引

