---
title: Code as Agent Harness — 把代码当 agent 的"骨架"来重新看 agentic AI
来源: 'Ning et al., "Code as Agent Harness", arXiv:2605.18747, 2026'
日期: 2026-06-01
子分类: 智能体与 LLM
分类: Agent
难度: 初级
provenance: pipeline-v3
---

## 是什么

这是 2026 年 5 月一篇综述，提出一个新口号：**code is the harness**——代码不光是 agent 的输出，更是 agent 推理、行动、建模环境、自检的"骨架"。

日常类比：之前我们把 agent 想成一个员工，把代码当成他交付的"成品"。这篇说：不对，代码更像他**身上的外骨骼**——他用代码当工具调用接口、用代码描述世界、用代码记笔记、用代码跑测试看自己对不对。骨架穿在身上，决定他能做多远。

综述把"code as harness"的研究分成 3 层来讲，覆盖从单 agent 到多 agent 的演化路线，把过去两年散落的工作拢到一张图里。

## 为什么重要

不接受"code 是 harness"这个视角，下面这些事就解释得很别扭：

- 为什么 SWE-bench 拿 code 当评估底座，结果反而推动了 agent 推理质量
- 为什么 GUI agent 内部也在用 Python / DSL 描述操作，而不是直接产 click 序列
- 为什么 multi-agent 系统的协作越来越靠"共享 code repo + 编辑历史"
- 为什么"agent 工具调用"这个旧概念正在被"agent 写代码再跑"取代

## 核心要点

综述用 **3 层架构**：

1. **Harness Interface（接口层）**：code 是 agent 接到推理、动作、世界模型的接口。类比：骨架的关节——决定 agent 能往哪些方向动。包括 ReAct 风格的"思考+调用"、code-as-action（CodeAct）、世界建模（用 code 描述场景）。

2. **Harness Mechanism（机制层）**：在 code 之上跑 planning、memory、tool use 三件常驻能力，再叠 feedback control（执行结果回写、错误自修）。类比：骨架内部的肌肉——让骨架不光是骨架，还能动。

3. **Scaling（扩展层）**：从单 agent 扩到多 agent，靠 code artifact 共享（共享 repo / 共享 PR / 共享测试套件）做协作、review、validate。类比：从一个人穿外骨骼到一队人共穿，骨架在他们之间传递。

横切关切：评估超越 final success（要看中间状态）、缺反馈下的验证、回归不让进化走回头路、人类对安全关键操作的监督。

## 实践案例

### 案例 1：CodeAct——把动作就变成 Python

```python
# 传统 ReAct
Thought: 我要查天气
Action: search("weather Beijing")
Observation: ...

# CodeAct（Wang et al. 2024）
Thought: 我要查天气并平均三天
Action:
import api
days = [api.weather("Beijing", d) for d in range(3)]
print(sum(days)/3)
```

agent 的 action 直接是可执行 code。优势：能用循环、变量、错误处理；劣势：代码 bug 立刻变 agent bug。综述把它放在"harness interface"层。

### 案例 2：SWE-agent 用 code 当世界模型

SWE-agent（Yang et al. 2024）让 agent 通过一组**只读和读写的 file API**操作 git repo。文件树就是 agent 看到的世界：

```
agent.open("auth.py", line=42)
agent.edit("auth.py", line=42, new="...")
agent.run_tests()
```

agent 不直接看像素，而是通过这套 code-shaped API 看 repo。这是综述里"environment via code"的代表。

### 案例 3：多 agent 共享 repo

在 ChatDev / AutoCodeRover / OpenHands multi-agent 模式里，不同角色（PM / dev / reviewer）共享同一 repo：

```
PM agent → 写 spec.md
Dev agent → 写 src/ + 提交 commit A
Reviewer agent → 跑 tests，写 review.md
Dev agent → 看 review.md 改 commit B
```

协作就是 commit 历史 + diff 评论——和真实软件团队完全同构。这是综述里"scaling"层的核心论据。

### 案例 4：feedback control 让 harness 自修

```python
result = sandbox.run(agent_code)
if result.errors:
    diagnosis = llm("why did this fail: " + result.stderr)
    fixed = llm("rewrite to fix: " + diagnosis)
    sandbox.run(fixed)
```

执行失败时，error trace 自动回喂给 agent。综述把这块归 mechanism 层的"feedback-driven control"——很多 GUI agent 也用同样模式（截图 + DOM 当 feedback）。

## 踩过的坑

1. **把"agent 写代码"和"code 做 harness"搞混**：写代码是输出，做 harness 是基础设施——后者才是综述要讲的。

2. **沙箱安全成本被低估**：让 agent 跑 code 必须有 sandbox（Docker/eBPF/wasm），生产环境这一步常被省，结果 agent 删掉用户文件。

3. **缺反馈时假反馈最危险**：agent 跑了 code 但没人验证它跑对了，agent 把"无报错"当"成功"，沉淀进 memory 后下次错得更深。

4. **评估只看 final pass 漏掉中间路径**：两个 agent 都过了测试但一个走捷径作弊，单看 pass rate 看不出来——综述强调要评估中间 trace。

## 适用 vs 不适用场景

**适用**：
- 设计 agent 系统时选择"代码 as 接口"还是"自然语言 as 接口"
- 看 code agent 论文时找它在 3 层中的位置
- 多 agent 协作系统设计参考

**不适用**：
- 完全无代码场景（纯对话客服、内容创作）
- 需要硬实时低延迟控制（code 跑起来不够快）
- 对沙箱要求极严的领域（高合规金融、生产 OT 系统）

## 历史小故事（可跳过）

- **2022 年**：ReAct 让 agent 把"思考 + 工具调用"穿插写——但 action 还是字符串
- **2023 年**：ToolLLM、Toolformer 把工具调用规范化，code-as-action 概念萌芽
- **2024 年**：CodeAct 论文（Wang et al.）正式把 action = Python；SWE-agent 把 repo 当世界
- **2025 年**：GUI agent 把 DOM 当 code-shaped 接口，embodied agent 用 DSL 描述场景
- **2025-2026 年**：multi-agent 共享 repo 成主流（ChatDev / OpenHands），本综述总结这条路

## 学到什么

1. **接口选 code 不只是工程方便，是改变 agent 能力上限**：code 接口让 agent 能调试、能复用、能版本化
2. **3 层结构帮你看一篇论文在动哪里**：interface / mechanism / scaling
3. **code 让 agent 可验证**：没 code 的 agent 难做回归，加 code 至少有测试做兜底
4. **多 agent 协作的"共同载体"已经定型为 git repo**：未来 agent 团队的 stack overflow 是 PR diff
5. **harness 是用来打磨的，不是用来锁死的**：留好"换骨"接口，下一代 agent 还能继承

## 延伸阅读

- 论文 PDF：[arXiv:2605.18747](https://arxiv.org/abs/2605.18747)
- [[swe-agent]] —— SWE-agent 是 code-as-environment 的代表实现
- [[react-agent]] —— ReAct 是 code-as-action 的前身
- 视频：作者在 ICLR 2026 workshop 的 30 分钟 talk
- [[self-evolving-agents-survey]] —— 自进化的姊妹综述（agent 体本身怎么改）

## 关联

- [[self-evolving-agents-survey]] —— 讲"agent 怎么变"，本篇讲"agent 用什么变"
- [[swe-agent]] —— code-as-environment 的早期 SOTA
- [[agentless]] —— 不用 agent 也能做 SE 任务，反衬 harness 的价值
- [[react-agent]] —— code-as-action 之前的 baseline
- [[apex-policy-exploration]] —— harness 之上的策略探索
- [[exg-experience-graphs]] —— harness 之上的经验图

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[agent-r1-2511]] —— Agent-R1 — 把 LLM agent 当 RL 环境训练的模块化框架
- [[agentless]] —— Agentless — 反 Agent 派的 SWE-bench 解法
- [[apex-policy-exploration]] —— APEX — 给自进化 agent 配一张"策略图"防止它走老路
- [[eve-agent-evidence]] —— EVE-Agent — 自我训练前先把证据钉在桌上
- [[evo-memory-2511]] —— Evo-Memory — 给"会自己长记性"的 agent 出一份统一考卷
- [[exg-experience-graphs]] —— EXG 经验图 — 把 agent 的成败拼成一张可复用的关系图
- [[llm-wiki-retrieval-reasoning]] —— LLM-Wiki — 把外部知识编译成 agent 自己的"维基"
- [[memcoder-co-evolution]] —— MemCoder — code agent 跟着你 git commit 一起成长
- [[misevolution-2509]] —— Misevolution — 自进化 agent 也会"越改越坏"，连顶配模型也躲不过
- [[self-evolving-agents-survey]] —— 自进化 AI agent 综述 — 给"会自己升级"的 agent 画一张统一地图
- [[self-evolving-recsys-2602]] —— Self-Evolving RecSys — 让 LLM agent 自己跑超参实验上线
- [[self-evolving-software-agents]] —— BDI-LLM Self-Evolving Agents — 让 agent 自己改自己源代码
- [[swe-agent]] —— SWE-Agent — Princeton SWE-bench 解法

