---
title: 自进化 AI agent 综述 — 给"会自己升级"的 agent 画一张统一地图
来源: 'Fang et al., "A Comprehensive Survey of Self-Evolving AI Agents", arXiv:2508.07407, 2025'
日期: 2026-06-01
分类: agents
难度: 初级
---

## 是什么

这是 2025 年 8 月一篇综述，把"自进化 agent"（self-evolving agent）整理成**一张反馈回路图**：System Inputs → Agent System → Environment → Optimisers → 又回到 Inputs。

日常类比：像一个新员工入职。第一天他靠 mentor 给的固定手册（基础模型）干活。但每做一单他都把"这事我做错了"写进笔记本，每次开会拿出来翻——慢慢的他不靠手册也能干，甚至比手册好。"自进化 agent"就是把这套学习闭环显式建在 agent 里。

普通 agent 部署完就"冻"住——prompt、工具、流程都不变。自进化 agent 把"运行中产生的数据"变成下一轮的输入，让系统自己改自己。综述把这条路上的几十种做法收拢到 4 个组件里，方便看清谁在动、为什么动。

## 为什么重要

不读这篇综述，下面这些事都拼不到一起：

- 为什么 ReAct、Reflexion、Voyager、Generative Agents 看起来很像但又有差别
- 为什么"加 memory"、"换 prompt"、"加工具"、"重排 workflow" 这四种改进不能混在一起谈
- 为什么生物医药 / 编程 / 金融领域的 agent 进化目标长得不一样
- 为什么"自进化"必须配套讨论安全和评估——agent 能改自己就能把自己改坏

## 核心要点

综述用 **4 件套**框架：

1. **System Inputs（输入）**：用户给的 task、prompt 模板、初始知识库。类比：员工接到的工单。

2. **Agent System（agent 本体）**：模型权重、prompt、记忆、工具、多 agent 协作图。类比：员工的脑子 + 工作笔记 + 工具箱。

3. **Environment（环境）**：浏览器、代码沙箱、操作系统、外部 API、其他 agent。类比：员工干活的办公室和客户。

4. **Optimisers（优化器）**：把"环境反馈"翻译成"对 Agent System 的改动"的那一层。常见做法：RL fine-tune、prompt 自动改写、memory 写入、工具自动生成、workflow 重排。类比：mentor + 月度复盘会。

四件套之外还有两条横切线：domain-specific 进化（医药/code/金融各有目标函数）和 evaluation+safety（怎么测、怎么不让它跑偏）。

## 实践案例

### 案例 1：用 4 件套读懂 Voyager

Minecraft 里跑的 Voyager（Wang et al. 2023）一进框架就清楚：

```
System Inputs: 当前任务（"造一把石镐"）
Agent System: GPT-4 + skill library（一堆已学到的 JS 函数）
Environment: Minecraft 世界 + Mineflayer API
Optimisers: 自我反思 → 把成功的 skill 写回 library
```

Voyager 改的是 **Agent System 里的 skill library**。这就是综述里"工具进化"分支的代表。

### 案例 2：把 prompt 优化当 optimiser

DSPy 或 PromptBreeder 这类工作的位置：

```python
# 简化逻辑
for episode in episodes:
    out = agent.run(prompt, task)
    score = env.eval(out)
    if score < threshold:
        prompt = rewrite_prompt(prompt, error_traces)  # optimiser
```

它没改模型权重也没加工具，只改 **System Inputs 里的 prompt**。综述把这类归到"prompt-level evolution"。

### 案例 3：memory 路径上的进化

A-MEM、MemGPT、Generative Agents 都改 **Agent System 的记忆模块**：把每次交互的总结写回长期向量库，下次检索。综述把这一路单独成节，并指出"memory 增长 → 检索质量下降"是开放问题——后面的 [[evo-memory-2511]] 就在啃这块骨头。

### 案例 4：domain-specific 进化的差别

医药 agent（如 ChemCrow）的 optimiser 必须考虑分子安全性约束；编程 agent（如 SWE-agent）的 optimiser 围绕单元测试通过率；金融 agent 围绕回测收益和风险——综述指出**目标函数差异比方法差异更重要**，借鉴时不要只搬方法不看目标。

### 案例 5：4 件套之外的 evaluation

综述给评估开了独立一节：传统 benchmark 是一次性测试，自进化 agent 必须看**长期曲线**——前 100 步好、第 1000 步崩才是完整画像。这条线索后来被 [[evo-memory-2511]] 接过去做成 benchmark。

## 踩过的坑

1. **把"agent 框架更新"当"自进化"**：开发者发版改 prompt 不算——必须 agent 在运行中自己改自己。

2. **只看一个组件的进化忽略反馈回路**：很多论文只动 prompt 不更 memory，结果跑长了 prompt 学到的"教训"和实际记忆对不上。

3. **没区分 online vs offline 进化**：online 是边跑边改（高风险），offline 是收一批 trace 再训一次（稳但慢）。混着说会让对比不公平。

4. **忽视安全收益和成本不对称**：能力提升 +5% 但安全对齐 -20% 是常见结果——综述专门有一节讲，引出了 [[misevolution-2509]] 这条线。

5. **把短期 benchmark 数字当长期能力**：很多新 agent 在 100 step 内表现亮眼，1000 step 后退化，**不跑长不显形**。

## 适用 vs 不适用场景

**适用**：
- 想入门"自进化 agent"领域，先建心理地图
- 看一篇新 agent 论文时定位它在哪一格
- 设计自家 agent 系统时盘点要不要加进化能力
- 给团队同步：用 4 件套作 onboarding 词表

**不适用**：
- 想要"哪个方法最强"的 leaderboard——综述不打榜
- 想要可跑代码——只有概念框架不发模型
- 只关心单一窄领域（如 web agent）——综述是横向扫描，垂直深度有限
- 已经熟悉所有相关文献的资深研究者——会觉得章节较浅

## 历史小故事（可跳过）

- **2022 年**：ReAct（Yao et al.）把"想 + 做 + 观察"循环写进 prompt，agent 第一次能在测试时调整动作
- **2023 年**：Reflexion / Voyager 让反思写回 prompt 或 skill 库；MemGPT 把分层 memory 做成可读写的 OS 隐喻——"自进化"概念落地
- **2024 年**：A-MEM、AutoAgents 等继续让 memory 与 workflow 动态改
- **2025 年 8 月**：本综述出现，先把这条路的全貌画出来；之后 [[apex-policy-exploration]]、[[exg-experience-graphs]]、[[misevolution-2509]] 各自补一块

## 学到什么

1. **自进化 = 反馈回路 + 闭环**：不是某个 trick，是一种系统设计范式
2. **四件套是好用的脑图**：拿到任何 agent 论文先问"它在改哪个组件"
3. **进化能力 ↔ 安全成本**：能改自己就能改坏，不要忽视代价
4. **领域特化是真痛点**：医药 agent 的 reward 和 web agent 完全不同，没有银弹优化器
5. **生命周期视角胜过单点比较**："哪个方法最强"在自进化里没意义，要看长曲线
6. **综述本身的价值在"对齐术语"**：让分散研究者用同一个词指同一件事

## 延伸阅读

- 论文 PDF：[arXiv:2508.07407](https://arxiv.org/abs/2508.07407)
- 配套 GitHub list：[Awesome-Self-Evolving-Agents](https://github.com/EvoAgentX/Awesome-Self-Evolving-Agents)
- 综述地图复习：把 4 件套画在白板上，每读一篇 agent 论文往里贴标签
- [[apex-policy-exploration]] —— 探索坍缩这一具体痛点的解法
- [[evo-memory-2511]] —— memory 这个组件的专门 benchmark
- [[misevolution-2509]] —— 自进化的"翻车"风险综述
- [[code-as-agent-harness]] —— 同期姊妹综述，专讲 code 维度

## 关联

- [[apex-policy-exploration]] —— 用策略图缓解探索坍缩
- [[exg-experience-graphs]] —— 把经验组织成关系图供复用
- [[evo-memory-2511]] —— 流式任务下 memory 进化的 benchmark
- [[misevolution-2509]] —— 自进化的安全副作用画像
- [[code-as-agent-harness]] —— 把 code 当 agent 基础设施的姊妹综述
- [[react-agent]] —— 自进化的最早雏形
- [[reflexion]] —— 第一次让 agent 把"反思"写回 prompt
- [[swe-agent]] —— code 类自进化 agent 的代表
- [[agentless]] —— 反衬：不进化也能达 SOTA 的对照组
- [[sleeper-agents]] —— 训练阶段对齐风险的姊妹工作
- [[generative-agents-2023]] —— memory 路径的早期开创性工作

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[agent-r1-2511]] —— Agent-R1 — 把 LLM agent 当 RL 环境训练的模块化框架
- [[apex-policy-exploration]] —— APEX — 给自进化 agent 配一张"策略图"防止它走老路
- [[code-as-agent-harness]] —— Code as Agent Harness — 把代码当 agent 的"骨架"来重新看 agentic AI
- [[eve-agent-evidence]] —— EVE-Agent — 自我训练前先把证据钉在桌上
- [[evo-memory-2511]] —— Evo-Memory — 给"会自己长记性"的 agent 出一份统一考卷
- [[exg-experience-graphs]] —— EXG 经验图 — 把 agent 的成败拼成一张可复用的关系图
- [[llm-wiki-retrieval-reasoning]] —— LLM-Wiki — 把外部知识编译成 agent 自己的"维基"
- [[memcoder-co-evolution]] —— MemCoder — code agent 跟着你 git commit 一起成长
- [[mind-skill]] —— MIND-Skill — 用归纳和演绎双 agent 抽 skill 并保证质量
- [[misevolution-2509]] —— Misevolution — 自进化 agent 也会"越改越坏"，连顶配模型也躲不过
- [[self-evolving-recsys-2602]] —— Self-Evolving RecSys — 让 LLM agent 自己跑超参实验上线
- [[self-evolving-software-agents]] —— BDI-LLM Self-Evolving Agents — 让 agent 自己改自己源代码
- [[soundness-bench]] —— SoundnessBench — 判断 AI 科学家会不会把坏点子当好点子
