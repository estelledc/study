---
title: ReAct Agent — 推理和行动交替的工具使用范式
来源: 'Yao et al., "ReAct: Synergizing Reasoning and Acting in Language Models", arXiv 2022'
日期: 2026-07-09
分类: AI / Agent
难度: 中级
---

## 是什么

ReAct 像一个会边查资料边做题的同学：他不是坐在座位上硬想，也不是一拿到题就乱翻书，而是先想一步、查一步、看结果、再决定下一步。

技术上，ReAct 是一种让语言模型交替生成 **Thought、Action、Observation** 的提示方法。Thought 是模型写下的当前判断，Action 是调用搜索、点击、移动等外部动作，Observation 是环境返回的新信息。

最小形态长这样：

```text
Thought: 我需要知道作者和海军上将是谁。
Action: Search[David Chanoff]
Observation: 页面提到他和 William J. Crowe 合作。
Thought: 现在要查 Crowe 担任驻英大使时是哪位总统。
Action: Search[William J. Crowe ambassador]
Observation: 他在 Bill Clinton 任内担任驻英大使。
Action: Finish[Bill Clinton]
```

这篇论文的价值是把“语言模型会推理”和“语言模型能行动”放进同一条轨迹里，奠定了后来工具调用 agent 的基本循环。

## 为什么重要

不理解 ReAct，下面这些事都很难解释：

- 为什么今天很多 agent 都是“想一下 → 调工具 → 看结果 → 再想一下”的循环，而不是一次性回答
- 为什么纯 [[cot]] 容易编事实，纯 Act 又容易乱点；ReAct 把内部推理和外部证据绑在一起
- 为什么 Claude Code、LangChain agent、浏览器 agent 都需要可读的中间轨迹来调试
- 为什么工具调用不只是“给模型一个 API”，还要设计动作空间、观察格式和停止条件

## 核心要点

ReAct 的核心可以拆成三件事：

1. **Thought 负责定方向**。类比：出门前先看地图，决定先去哪个路口。模型用 Thought 分解目标、记录当前状态、判断是否需要换搜索词。

2. **Action 负责接触外部世界**。类比：只看地图不够，还要真的走到路口看路牌。论文里的动作包括 Wikipedia 搜索、Lookup、WebShop 点击、ALFWorld 里移动和拿取物品。

3. **Observation 负责纠偏**。类比：路牌告诉你刚才想错了，就要改路线。外部返回的信息会进入下一轮上下文，让模型能基于证据继续推理。

三者合起来，不是让模型“更会想”，而是让模型每一步都能把想法交给环境检验。

## 实践案例

### 案例 1：事实核查里的搜索循环

```text
Claim: 百慕大三角在太平洋。
Thought: 我需要查百慕大三角在哪里。
Action: Search[Bermuda Triangle]
Observation: 它位于北大西洋西部。
Thought: 北大西洋不是太平洋，所以说法错误。
Action: Finish[REFUTES]
```

逐部分解释：

- `Thought` 把模糊问题改写成可搜索的问题
- `Action` 不直接猜答案，而是去拿外部证据
- `Observation` 给出地理事实，最后一步才下结论

### 案例 2：网页购物里的属性匹配

```text
Goal: 买 16 包苹果肉桂冻干香蕉片，低于 50 美元。
Action: search[sixteen pack apple cinnamon freeze dried banana chips]
Observation: 搜索结果有香蕉脆片，但口味和包装数要点进商品页确认。
Thought: 第三个结果最接近，先检查它的选项。
Action: click[B092JLLYK6]
Observation: 有 apple cinnamon 和 0.53 ounce pack of 16 选项。
Action: click[apple cinnamon]
Action: click[0.53 ounce pack of 16]
Action: click[Buy Now]
```

逐部分解释：

- 纯 Act 可能看到第一个结果就买，忽略口味、数量、价格这些约束
- ReAct 的 Thought 把用户需求拆成检查清单
- 每次 Observation 都变成下一步点击的依据

### 案例 3：文本游戏里的子目标追踪

```text
Goal: 找到刀，清洗它，再放到台面上。
Thought: 我先要找到刀，可能在厨房台面或抽屉附近。
Action: go to countertop
Observation: 台面上有 knife 2。
Action: take knife 2
Thought: 已经拿到刀，下一个子目标是找水槽清洗。
Action: go to sinkbasin
Action: clean knife 2 with sinkbasin
Thought: 刀已经清洗，最后放回 countertop。
```

逐部分解释：

- ALFWorld 一局可能超过 50 步，不记录子目标就容易忘记自己做到哪
- Thought 像任务清单，标记“已拿到刀”“下一步清洗”
- Observation 让模型知道动作是否真的发生，避免一直重复同一步

## 踩过的坑

1. **把 Thought 当真实内心**：它只是模型写出来的中间文本，不保证等于模型真正的因果过程。
2. **搜索结果差会带偏全局**：论文统计里，ReAct 的失败有一类来自无效搜索结果，模型拿不到好证据就很难恢复。
3. **动作空间太大会爆上下文**：复杂任务需要更多示例和更长轨迹，few-shot prompt 很快塞满上下文窗口。
4. **接上真实外部系统有风险**：论文只让模型查 Wikipedia、玩 benchmark 和模拟购买；真实网页、数据库、机器人动作必须加权限和沙箱。

## 适用 vs 不适用场景

**适用**：

- 需要外部事实的问答、事实核查、资料检索
- 需要多步交互的网页、命令行、游戏、软件工程 agent
- 需要人类能检查中间过程的任务，例如调试、审计、教学
- 工具数量有限、动作格式清楚、每步观察能反馈成文本的环境

**不适用**：

- 单步常识题或简单翻译，加 ReAct 只会浪费 token
- 动作不可逆或代价很高的系统，例如真实支付、删库、机器人危险动作
- 观察质量很差的环境，模型会围绕错误反馈继续推
- 必须严格最优规划的任务，ReAct 本身不是搜索算法，常要配合 [[tree-of-thoughts-2023]]

## 历史小故事（可跳过）

- **2022 年初**：[[cot]] 证明大模型写出中间步骤后，多步推理会明显变强。
- **2022 年中**：WebGPT、SayCan、Inner Monologue 等工作开始让语言模型接触搜索、浏览器、机器人环境。
- **2022 年 10 月**：ReAct 提出把 Reasoning 和 Acting 交替组织，论文名里的 ReAct 就来自这两个词。
- **2023 年**：论文进入 ICLR，LangChain 等框架把 ReAct 做成常见 agent 模板。
- **2024 年以后**：[[swe-agent]]、[[agentless]]、函数调用和多 agent 框架继续围绕“循环多自由”与“流程多约束”分化。

## 学到什么

- Agent 不是模型本身，而是“模型 + 工具 + 环境反馈 + 控制循环”。
- Thought 的主要价值不是神秘推理，而是让下一步 Action 有理由、可检查、可修改。
- 外部行动能降低幻觉，但会引入搜索失败、循环卡死和安全风险。
- ReAct 最重要的遗产是轨迹格式：它把语言模型做事的过程拆成了可观察、可调试的步骤。

## 延伸阅读

- 论文 PDF：[ReAct: Synergizing Reasoning and Acting in Language Models](https://arxiv.org/pdf/2210.03629v3.pdf)
- 项目页面：[react-lm.github.io](https://react-lm.github.io/)
- [[cot]] —— ReAct 里的 Thought 继承了“先写推理步骤”的思想
- [[toolformer]] —— 另一条路线：把工具调用训练进模型权重里
- [[tree-of-thoughts-2023]] —— 把单条 ReAct 轨迹扩展成可搜索的多分支思考
- [[langchain]] —— 早期把 ReAct agent 产品化的常见框架

## 关联

- [[react]] —— 同一篇论文的已有笔记，适合对照看更早版本的整理
- [[cot]] —— CoT 只在脑内推，ReAct 在推理中插入外部行动和观察
- [[toolformer]] —— Toolformer 学会何时调工具，ReAct 更强调外部控制循环
- [[tree-of-thoughts-2023]] —— ToT 解决 ReAct 一条路走错后难回溯的问题
- [[swe-agent]] —— 把 ReAct 循环搬到软件工程命令行环境里
- [[agentless]] —— 反过来质疑自由 agent loop，主张固定流水线更稳
- [[langchain]] —— 工程框架里常见的 ReAct agent 模板来源

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
