---
title: Reflexion — 让 LLM 自我反思
来源: 'Shinn et al., "Reflexion: Language Agents with Verbal Reinforcement Learning", NeurIPS 2023'
日期: 2026-05-29
分类: AI / Agent
难度: 中级
---

## 是什么

Reflexion 是在 [[react]] 那种 agent 之上**加一层"反思"**——agent 跑完一次任务，如果失败了，让它**用自然语言写一段"我刚才哪步错了 + 下次怎么改"**，把这段反思存进 memory，下一轮 prompt 顶部塞进去重跑。

日常类比：

- [[react]] 是侦探查案——边想边查，但**一次查不到就只能放弃**
- Reflexion 是侦探破完案后**写日记总结**——"下次遇到密室案，先看通风口"——下次再查同类案少走弯路

技术上看：

```
Trial 1: 跑 ReAct → 失败
         ↓
       反思："我搜了 'Inception' 但忘搜导演 → 下次先搜导演"
         ↓
Trial 2: 把反思加到 prompt 顶部 → 重新跑 ReAct → 成功
```

最关键的一点：**整个过程不更新模型权重**。LLM 还是那个 LLM，变化的只是 prompt 里多了一段反思文本。这是 2023 年最有影响力的 agent 工程思路之一。

## 为什么重要

不理解 Reflexion，下面这些事都没法解释：

- 为什么 Cursor / Claude Code 跑测试失败后能"自己改"——背后就是 Evaluator + Self-Reflection 的回路
- 为什么 2023 年后大家不再迷信"必须 fine-tune 才能让 agent 学习"——文字反思就够用
- 为什么 HumanEval pass@1 能从 80% 跳到 91% 不靠堆算力——只靠 prompt 工程
- 为什么"Agent 长期记忆"从抽象概念变成可工程化模块——Reflexion 给了第一个落地的双层 memory 设计

## 核心要点

Reflexion 的架构可以拆成 **3 个 LLM + 1 个 memory**：

1. **Actor**——执行任务的 LLM，跑 [[react]] 那种 think-act-observe 循环。和 ReAct 完全一样，就是普通 agent。

2. **Evaluator**——判断 Actor 输出对不对的"裁判"。三种常见实现：
   - **字符串匹配**：答案字符串等于正确答案？适合 QA 任务
   - **单元测试**：跑 LLM 写的代码，全过 = 对。适合编程
   - **启发式**：例如"3 次同动作返回相同结果 = 卡住了"

3. **Self-Reflector**——错了之后写反思的 LLM。关键 prompt 大致是：
   > "诊断你刚才失败的可能原因，并提出一个简短的高层 plan，避免再犯。用完整句子。"

   注意：反思**不把正确答案喂给 Actor**，而是说"应该先搜 X 再做 Y"——是**操作层面**的指导。字符串匹配 / 单元测试类 Evaluator 自己持有标准答案或测试预言，但 Self-Reflector 的输出刻意不泄题。

4. **Memory buffer**——存历次反思的列表（论文建议上限 1-3 条）。下一轮 Actor 跑之前，把整段 memory 塞到 prompt 顶部。

整个流程叫 **Algorithm 1**：trial → 失败 → 反思 → 存 memory → 重跑 trial 2 → 直到成功或用光 max_trials（通常 3-12 次）。

## 实践案例

### 案例 1：HumanEval 编程任务

```
Trial 1:
  题目：写一个函数返回数组第 k 大的元素
  LLM 写：sorted(arr)[k]    ← 错，应该是 sorted(arr)[-k]
  Evaluator：跑 unit test → 失败（[1,2,3] k=1 期望 3 但返回 1）

Self-Reflector 写反思：
  "我把'第 k 大'当成了'第 k 小'。Python 的 sorted 默认升序，
   要取倒数第 k 个用 [-k]，或加 reverse=True。下次写 top-k 类
   函数前，先确认是从大到小还是从小到大。"

Trial 2:
  Prompt 顶部含上面反思 → LLM 写 sorted(arr, reverse=True)[k-1]
  → 测试通过
```

### 案例 2：AlfWorld 模拟家居环境

```
Trial 1:
  任务：找钥匙开门
  LLM：try_open_door() → 锁着 → try_open_door() → 锁着 → ...
       → 卡死循环
  Evaluator (启发式)：3 次同动作 = 死循环 → 失败

Self-Reflector：
  "我反复尝试开门但门一直锁着。我应该先找钥匙——可能在抽屉
   或柜子里。下次先 explore 房间所有可打开的容器，再回来开门。"

Trial 2:
  LLM：open_drawer() → 找到钥匙 → use_key_on_door() → 成功
```

### 案例 3：与 [[cot]] / [[react]] 的关系

这三个方法**正交但叠加**：

| 层 | 方法 | 作用 |
|---|---|---|
| 单步推理 | [[cot]]（Chain of Thought） | 让 LLM 一步一步想，而不是一口气出答案 |
| 单 trajectory 行动 | [[react]] | 在 CoT 基础上加"调工具"——边想边查 |
| 跨 trajectory 学习 | Reflexion | 在 ReAct 基础上加"失败后反思"——错了能改 |

现代 agent（Cursor / Claude Code / Devin）三层都用：CoT 推理 + ReAct 行动 + Reflexion 反思。

## 踩过的坑

1. **小模型反思容易"诊断错"**：参数量小于 7B 的模型写反思常常把失败归因到不存在的步骤，反而误导下一次 trial。Reflexion 在 GPT-4 上 work，在小开源模型上效果差很多。

2. **字符串匹配假阴性污染反思**：如果答 "United Kingdom" 但标准答案是 "Britain"，EM（Exact Match，字符串必须完全一样）判错 → 反思写"我应该改答 Britain"——但**语义其实对**，反思被 grading bug 误导。

3. **反思列表越长越浪费 context**：论文说 memory 上限 1-3 条最佳，但**实际代码里没强制 cap**，跑久了会塞爆 prompt。落地时一定要自己加 `if len(reflections) > 3: pop(0)`。

4. **Evaluator 是单点失败**：单元测试有 bug、裁判 LLM 有偏见、启发式不通用——任何一种 Evaluator 错判，反思就是错的，下次 trial 反而更糟。

## 适用 vs 不适用场景

**适用**：

- 有清晰对错信号的多步任务（编程 + 单元测试、QA + 标准答案、agent + 启发式）
- 不能或不想 fine-tune 模型的场景（直接调 OpenAI / Anthropic API）
- 失败成本低、能多次重试的任务（每个 trial 几秒到几分钟）
- backend 是强模型（GPT-4 / Claude 3.5 及以上）

**不适用**：

- 单步任务（一段文本生成、一次分类）→ 用 Self-Refine 更轻量
- 没有可靠 evaluator 的任务（开放式创作、主观偏好）→ 反馈信号不可靠
- 实时任务（要求 1 秒内响应）→ 多 trial 太慢
- 弱 backend（小于 7B 的模型）→ 反思质量不够

## 历史小故事（可跳过）

- **2022 年**：[[cot]] 论文（Wei 等）证明"让 LLM 一步步想"能解数学题；同年 [[react]]（Yao 等）把 CoT 扩展成"想 + 行动"。
- **2023 年 3 月**：Shinn 等发 Reflexion v1 arXiv；同月 Self-Refine（Madaan 等）也上线——后者只做单步精炼，不带跨 trial 长期 memory。
- **2023 年 10 月**：Reflexion 在 NeurIPS 录用版改标题为 "Verbal Reinforcement Learning"——把"用文字代替梯度"的理论框架前置。
- **2024 年**：Cursor / Claude Code / Devin 等工程产品在 agent loop 内置错误反思——Reflexion 思想从论文落地到日用工具。

## 学到什么

1. **不动权重也能"学习"**——只要把经验写成自然语言塞进 prompt，agent 就有记忆。这是 LLM 时代最重要的 paradigm shift 之一
2. **3 个 LLM 分工 > 1 个 LLM 闭环**——Actor / Evaluator / Self-Reflector 解耦，每一环都能独立换 backend 或测试效果
3. **反馈是"怎么做"而非"是什么"**——反思说"应该先搜 X"（操作指导），不说"答案是 Y"（陈述答案）——这是核心精髓
4. **理论标签可能过度营销**——"verbal reinforcement learning" 这个名字是审稿意见改出来的，并不真正等价于 RL（无梯度、无收敛保证）。读论文要分清技术贡献和营销定位

## 延伸阅读

- 论文 PDF：[Reflexion 2023](https://arxiv.org/abs/2303.11366)（28 页含 appendix，主体 11 页）
- 代码：[noahshinn/reflexion](https://github.com/noahshinn/reflexion) —— `hotpotqa_runs/agents.py` 是最值得读的 393 行
- [[react]] —— Reflexion 的直接前作，先读这个
- [[cot]] —— [[react]] 的前作，思维链推理的起点

## 关联

- [[react]] —— Reflexion = ReAct + 反思层；先理解 ReAct 才能理解 Reflexion 加了什么
- [[cot]] —— 单步推理的祖宗，[[react]] 和 Reflexion 都建立在 CoT 之上
- [[constitutional-ai]] —— 同样用"AI 自评 + 自改"思路，但目标是对齐而非任务成功
- [[autogen]] —— 多 agent 框架，本质是把 Reflexion 的 3-LLM 分工扩展成 N-agent 协作

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[apex-policy-exploration]] —— APEX — 给自进化 agent 配一张"策略图"防止它走老路
- [[clawtrace-cost-aware]] —— ClawTrace — 把 agent 每步操作的"成本账"先算清再蒸馏
- [[constitutional-ai]] —— Constitutional AI — Anthropic 的对齐方法
- [[cot]] —— Chain-of-Thought Prompting
- [[mind-skill]] —— MIND-Skill — 用归纳和演绎双 agent 抽 skill 并保证质量
- [[misevolution-2509]] —— Misevolution — 自进化 agent 也会"越改越坏"，连顶配模型也躲不过
- [[mmskills-multimodal]] —— MMSkills — 把视觉 agent 的"操作经验"做成多模态卡片
- [[nlp-agent-2024]] —— Cognitive Architectures for Language Agents (CoALA)
- [[react]] —— React UI 组件库
- [[self-evolving-agents-survey]] —— 自进化 AI agent 综述 — 给"会自己升级"的 agent 画一张统一地图
- [[swe-bench]] —— SWE-bench — 真实 GitHub Issue 评测
- [[zombie-agents-2602]] —— Zombie Agents — 自进化 agent 的长期记忆能被持久化"借尸还魂"

