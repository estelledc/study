---
title: "Cognitive Architectures for Language Agents (CoALA)"
来源: 'https://arxiv.org/abs/2309.02427'
日期: 2026-06-13
分类: AI / NLP
难度: 中级
---

## 是什么

CoALA 是 2023 年 Princeton 大学 Sumers、Yao、Narasimhan 和 Griffiths 四人提出的一套**给 AI Agent 搭骨架的通用框架**。日常类比：

- 2022 年的各种 Agent（ReAct、Reflexion、Inner Monologue 等）像不同人各建各的房子，风格各异，术语不一——有人说 "tool use"，有人说 "grounding"，有人说 "actions"，没法统一比较。
- CoALA 就像是建筑的**标准平面图规范**：不管房子最后长什么样，都统一用三块积木来搭：**记忆（Memory）** + **动作（Action）** + **决策（Decision-making）**。

这篇论文做了两件事：

1. **回顾（Retrospective）**：用 CoALA 框架把当时已有的各种 LLM Agent 统一分类，告诉你谁属于哪一类。
2. **前瞻（Prospective）**：用同一套框架指出哪些方向还没人好好做，给未来的 Agent 设计指明路。

核心洞见：**LLM 本身只是一个"字符串生成器"**，给它加上记忆、动作空间和决策循环，它就变成了 Agent。这个思想不是全新的——它借用了认知科学里 50 年的"认知架构"（Cognitive Architecture）理论，比如经典的 Soar 系统。

## 背景：从生产系统到 LLM

论文花了大量篇幅讲了一个历史故事：

### 生产系统（Production System）

20 世纪 50 年代，逻辑学家 Post 提出"字符串重写规则"：如果字符串 `XYZ` 出现，可以把它重写为 `XWZ`。后来 Newell 和 Simon 把这个思想扩展到 AI，提出了**生产系统**——一组"条件-动作"规则：

```
IF 温度 > 70°F AND 温度 < 72°F → 保持
IF 温度 < 32°F → 开加热器
IF 温度 > 72°F → 关加热器
```

这就是一个最简单的 Agent：有状态（当前温度）、有规则（IF-THEN）、有动作（开/关）。

### 认知架构（Cognitive Architecture）

后来研究者发现，光有规则不够，还需要**控制流**来决定哪些规则先执行、哪些后执行，还需要**记忆系统**来存储信息。于是出现了 Soar 等认知架构，它们给生产系统加上了：

- **工作记忆（Working Memory）**：当前正在处理的信息
- **长期记忆（Long-term Memory）**：分程序性（规则）、语义性（事实）、情景性（经历）
- **决策循环（Decision Loop）**：感知 → 推理 → 行动 → 观察 → 再推理

### LLM 类比

论文的核心类比是：

| 生产系统 | LLM |
|---------|-----|
| 一条规则：IF XYZ → XWZ | LLM 对给定 prompt 输出一个 completion 的概率分布 |
| 控制流决定规则执行顺序 | Prompt engineering 决定 LLM 调用顺序 |
| 工作记忆存储当前状态 | Agent 的中间推理结果 / 对话历史 |
| 长期记忆存规则和事实 | LLM 的预训练参数 + 外部向量数据库 |

换句话说：**Prompt Chain = 生产系统的控制流，Agent = LLM + 认知架构。**

## 核心概念：CoALA 三要素

### 1. 记忆（Memory）

CoALA 把 Agent 的记忆分成两类，对应认知科学的经典划分：

- **工作记忆（Working Memory）**：Agent 当前正在思考的内容，包括当前目标、中间推理步骤、最近的观察结果。相当于人脑的"临时工作台"。
- **长期记忆（Long-term Memory）**：
  - 语义记忆：关于世界的知识（如"北京是中国的首都"）
  - 情景记忆：Agent 自己的经历（如"上次我用方法 A 做这个题失败了"）
  - 程序记忆：Agent 学会的规则或技能（如"遇到数学题先用分步推理"）

现实中的 Agent 实现方式：
- 工作记忆 = 对话上下文（context window）
- 语义记忆 = RAG（向量数据库）
- 情景记忆 = 经验数据库（如 Reflexion 的做法）

### 2. 动作（Action）

CoALA 把动作分成内外两类：

**外部动作（External Actions）**：和外部环境交互。
- **Grounding**：把 LLM 的输出转化为环境能理解的指令（如点击网页按钮、调用 API、控制机器人）
- **Retrieval**：从外部知识源拉取信息（如搜索 Google、查数据库）

**内部动作（Internal Actions）**：在 Agent 内部处理信息。
- **Retrieval**：从长期记忆里读信息
- **Reasoning**：用 LLM 对工作记忆做推理更新（如"上一步失败了，我应该换个策略"）
- **Learning**：把新信息写入长期记忆（如"这个方法有效，下次继续用"）

### 3. 决策（Decision-making）

这是 Agent 的"大脑循环"，每个周期做三件事：

```
观察 (Observation) → 规划 (Planning) → 执行 (Execution) → 再观察 → ...
```

1. **观察**：从环境或记忆中获取当前状态
2. **规划**：用 LLM 生成候选行动方案并评估
3. **执行**：选择最佳动作并执行
4. 回到步骤 1，形成循环

## 代码示例

### 示例 1：用 CoALA 框架拆解 ReAct Agent

ReAct 是最经典的 LLM Agent 之一。用 CoALA 来分析它：

```python
# ReAct Agent 的核心循环 —— CoALA 视角

class ReActAgent:
    def __init__(self):
        # ====== 记忆 ======
        self.working_memory = []        # 工作记忆：当前的推理链
        self.semantic_memory = VectorDB() # 语义记忆：外部知识（RAG）

    # ====== 动作 ======
    def external_action(self, tool_name, tool_input):
        """Grounding：把 LLM 的输出转为工具调用"""
        tool = get_tool(tool_name)
        return tool.run(tool_input)

    def internal_reasoning(self, prompt):
        """Reasoning：用 LLM 更新工作记忆"""
        response = llm_call(prompt)
        self.working_memory.append(response)
        return response

    # ====== 决策循环 ======
    def run(self, question, max_steps=5):
        for step in range(max_steps):
            # 规划：LLM 决定下一步做什么
            prompt = build_react_prompt(question, self.working_memory)
            output = self.internal_reasoning(prompt)

            # 解析输出：thought / action / action_input
            thought, action, action_input = parse_react(output)

            if action == "Final Answer":
                return action_input  # 完成

            # 执行：工具调用
            observation = self.external_action(action, action_input)

            # 记录：写入工作记忆
            self.working_memory.append(f"Observation: {observation}")
```

这个拆解告诉我们：ReAct 本质上就是一个**只有工作记忆 + 推理动作 + 循环决策**的简化 Agent。它没有长期记忆，也没有显式的学习机制。

### 示例 2：用 CoALA 设计一个带学习的 Agent

现在用 CoALA 的全套要素，设计一个能从经验中学习的新 Agent：

```python
# CoALA 全要素 Agent 框架

class CoALAAgent:
    def __init__(self):
        # ====== 记忆 ======
        self.working_memory = WorkingMemory()      # 当前目标、中间状态
        self.semantic_memory = SemanticMemory()     # 世界知识（RAG）
        self.episodic_memory = EpisodicMemory()     # 过去经历
        self.procedural_memory = ProceduralMemory() # 已学会的策略

    # ====== 内部动作 ======
    def retrieve(self, query, memory_type="semantic"):
        """Retrieval：从长期记忆读信息"""
        if memory_type == "semantic":
            return self.semantic_memory.search(query)
        elif memory_type == "episodic":
            return self.episodic_memory.search(query)

    def reason(self, prompt):
        """Reasoning：LLM 推理更新工作记忆"""
        result = llm_call(prompt)
        self.working_memory.update(result)
        return result

    def learn(self, experience, success_score):
        """Learning：把经验写入长期记忆"""
        # 成功的策略存入程序记忆
        if success_score > 0.7:
            self.procedural_memory.store(experience)
        # 所有经历存入情景记忆
        self.episodic_memory.store(experience)

    # ====== 外部动作 ======
    def ground(self, action_text):
        """Grounding：将 LLM 输出转为环境操作"""
        action = parse_action(action_text)
        return execute_in_environment(action)

    # ====== 决策循环 ======
    def decide(self, task):
        while not self.working_memory.is_complete():
            # 1. 观察：获取当前状态
            current_state = self.working_memory.read()

            # 2. 检索：从长期记忆查找相关经验
            relevant_experience = self.retrieve(current_state, "episodic")
            prior_strategy = self.retrieve(current_state, "procedural")

            # 3. 规划：LLM 结合经验和当前状态做决策
            plan_prompt = f"""
            当前任务: {task}
            当前状态: {current_state}
            过往经验: {relevant_experience}
            已知策略: {prior_strategy}
            下一步做什么?
            """
            decision = self.reason(plan_prompt)

            # 4. 执行：将决策落地
            result = self.ground(decision["action"])

            # 5. 学习：根据结果调整
            success = evaluate(result, task)
            self.learn({
                "task": task,
                "strategy": decision,
                "result": result,
                "success": success
            }, success_score=success)
```

这个 Agent 比 ReAct 多了：

- **长期记忆**（语义 + 情景 + 程序）
- **学习动作**（`learn` 方法，根据经验更新程序记忆）
- **检索动作**（从不同记忆类型读取信息辅助决策）

## 论文的分类体系：已有 Agent 的地图

CoALA 用这套框架把当时流行的 Agent 做了系统分类：

| Agent 类型 | 记忆 | 动作 | 决策 |
|-----------|------|------|------|
| **直接动作型**（如 Go-Action） | 无 | Grounding | 单步 LLM 输出动作 |
| **Chain-of-Thought** | 工作记忆 | Reasoning | 分步推理 |
| **ReAct** | 工作记忆 | Reasoning + Grounding | 思考→行动→观察循环 |
| **Reflexion** | 工作记忆 + 情景记忆 | Reasoning + Learning | 反思+重试 |
| **Program-Aiding LLM** | 工作记忆 | Reasoning + Grounding（代码执行） | 生成代码→执行→分析结果 |
| **Self-Correction** | 工作记忆 | Reasoning + Retrieval | 生成→批判→修正循环 |

这个分类的价值在于：你可以一眼看出某个 Agent 的"能力边界"。比如 ReAct 没有学习机制，所以它每次都是从头开始；Reflexion 加了情景记忆和反思学习，但还没有程序记忆（不会"积累经验形成套路"）。

## 论文指出的三个前沿方向

### 1. 改进记忆系统

现有 Agent 的工作记忆基本就是 LLM 的 context window，但**没有显式的结构化管理**。论文建议：

- 给工作记忆加**结构化存储**，而不是简单拼接到 prompt 里
- 长期记忆的**检索策略**需要优化：不是所有历史信息都有用，如何筛选相关记忆？
- 程序记忆的**生成机制**：如何让 Agent 自动从经验中抽象出可复用的策略？

### 2. 改进动作空间

- **Grounding 的质量**决定 Agent 能不能可靠地和环境交互。当前大多是"LLM 输出文本 → 解析为工具调用"的模式，缺乏统一的 grounding 规范。
- **内部动作的多样性**有待扩展。现在的 Agent 主要用 reasoning，retrieval 和 learning 用得少。

### 3. 改进决策机制

- 当前的决策循环大多是"LLM 想一步做一步"，缺乏**多步前瞻规划**（lookahead planning）。
- **决策的确定性 vs 探索性**：Agent 应该在已知策略和尝试新策略之间如何平衡？这类似于机器学习中的 exploration-exploitation tradeoff。
- **层级决策**（Hierarchical Decision）：复杂任务应该拆成子目标，由高层 LLM 规划大方向，低层 LLM 执行细节。

## 和 Soar 的对比

CoALA 直接借鉴了 Soar 架构，但有几个关键差异：

| | Soar | CoALA |
|---|------|-------|
| 规则来源 | 人工编写 IF-THEN 规则 | LLM 预训练学到的概率分布 |
| 规则表达能力 | 受限于逻辑谓词 | 任意自然语言/代码 |
| 可解释性 | 高（规则是人类可读的） | 低（黑盒参数） |
| 泛化能力 | 差（需要人工编写新规则） | 好（LLM 自带常识） |
| 稳定性 | 确定性的 | 概率性的（每次可能不同） |

CoALA 的核心观点是：**LLM 解决了传统认知架构的两个最大瓶颈——规则编写成本和领域泛化——所以我们不需要自己写规则，而是用认知架构的思想来组织 LLM。**

## 为什么重要

理解 CoALA 对后续学习和实践的意义：

- 它是**第一套用认知科学统一框架系统分析 LLM Agent 的论文**，之后很多 Agent 论文都在 implicitly 或 explicitly 使用这套分类
- 它解释了为什么"单纯加大 LLM 规模"不够——**架构设计（记忆 + 动作 + 决策）**和模型大小同等重要
- 它为 Agent 设计提供了一张"地图"：当你需要设计一个新 Agent 时，可以按 CoALA 的三个维度逐一思考缺了什么
- 它连接了两个领域：认知科学 / 符号 AI 的传统理论 和 现代 LLM Agent 实践，让后者不是"从零发明"

## 延伸阅读

- ReAct paper: [Yao et al., 2022](https://arxiv.org/abs/2210.03629)
- Reflexion paper: [Shinn et al., 2023](https://arxiv.org/abs/2303.11366)
- Soar 架构: [Laird, 2022](https://dl.acm.org/doi/10.1145/3512375)
- 论文配套的 Awesome Language Agents 列表: [github.com/ysymyth/awesome-language-agents](https://github.com/ysymyth/awesome-language-agents)
