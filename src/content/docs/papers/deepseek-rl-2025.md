---
title: "DeepSeek-R1: 通过强化学习激励大模型的推理能力"
来源: https://arxiv.org/abs/2501.12948
日期: 2026-06-13
分类: 机器学习
子分类: machine-learning-deep-learning
provenance: pipeline-v3
---

# DeepSeek-R1: 通过强化学习激励大模型的推理能力

> 来源: arXiv:2501.12948 | Nature 645, 633-638 (2025) | 作者: DeepSeek-AI 等 200+ 人

---

## 一、一个日常类比：教小狗算算术

想象你在教一只小狗算数学题。

传统方法（监督学习）像这样：

- 你出一题："3 + 5 = ?"
- 你写出**完整的解题步骤**："首先 3 + 5，等于 8。"
- 小狗看一遍，记住答案和步骤
- 下次出一样的题，小狗照搬

问题在哪？换一道没见过的题，小狗就懵了。因为它只"背"了步骤，没有真正"学会思考"。

DeepSeek-R1 的做法完全不同：

- 你出一题："3 + 5 = ?"
- 小狗**自己试着回答**，可能答对也可能答错
- 你只告诉它"答对了"或"答错了"，**不给标准解题步骤**
- 小狗通过反复尝试，自己摸索出正确的思考方式
- 慢慢地，小狗不仅能算 3+5，还能算更复杂的题目

核心区别：

| 传统方法 | DeepSeek-R1 |
|---------|------------|
| 老师手把手教每一步 | 老师只给答案对错 |
| 学生背诵解题过程 | 学生自己发现思路 |
| 换题就不会了 | 真正学会了推理 |

---

## 二、论文要解决什么问题？

### 2.1 背景：Chain of Thought（思维链）

在大模型领域，有一个重要发现：如果你让模型"一步一步地想"（Chain of Thought），它在数学、逻辑推理上的表现会大幅提升。

比如：

```
问题：一个农场有 15 只鸡，鸭的数量是鸡的两倍少 3 只。有多少只鸭？

❌ 不思考直接回答：27

✅ 一步一步思考：
   鸡 = 15 只
   鸭 = 15 × 2 - 3 = 30 - 3 = 27 只
```

但问题来了：要生成这些"一步一步思考"的示范数据，需要大量人工标注，成本高、覆盖面有限。

### 2.2 DeepSeek-R1 的核心洞察

**推理能力不需要人类示范数据来"教"——它可以通过强化学习"自发涌现"。**

换句话说：模型自己摸索出来的思考方式，比人类教给它的更好。

---

## 三、核心概念拆解

### 3.1 强化学习（RL）是什么？

强化学习是一种"试错学习"方式，和传统监督学习不同：

- **监督学习**：你给我答案，我模仿你
- **强化学习**：我猜答案，你告诉我"对"还是"错"，我自己调整

强化学习有三个关键角色：

```
┌──────────┐     动作（答案）      ┌──────────┐
│          │ ───────────────────→  │          │
│  智能体   │                       │  环境    │
│ (模型)   │ ←───────────────────  │ (评分器)  │
│          │      奖励（反馈）       │          │
└──────────┘                       └──────────┘
```

### 3.2 DeepSeek-R1 的训练流程

DeepSeek-R1 的训练分三个阶段：

**第一阶段：冷启动（Cold Start）**

- 先用少量人类标注的推理数据做一个小的监督学习（SFT）
- 让模型"知道"推理是什么样的——相当于给小狗一个入门示范

```python
# 训练数据示例（SFT 阶段）
training_examples = [
    {
        "question": "一个数加 5 等于 12，这个数是多少？",
        "reasoning": "设这个数为 x。x + 5 = 12。x = 12 - 5 = 7。",
        "answer": "7"
    },
    {
        "question": "2 的 3 次方是多少？",
        "reasoning": "2^3 = 2 × 2 × 2 = 8。",
        "answer": "8"
    }
]
```

这个阶段的数据量不大，关键是让模型理解"我需要展示推理过程"。

**第二阶段：强化学习（RL）**

- 去掉人类标注的答案，只保留问题和最终答案是否正确
- 使用 GRPO（Group Relative Policy Optimization）算法
- 模型每次生成**一组**（多个）不同的推理路径
- 根据这些路径的结果，计算相对优势

```python
# GRPO 的核心思想（伪代码）
def grpo_update(model, question, reward_fn):
    # 1. 生成一组（G个）推理路径
    responses = []
    for i in range(G):
        response = model.generate(question, sample=True)
        responses.append(response)

    # 2. 用奖励函数评估每个回答
    rewards = [reward_fn(r) for r in responses]

    # 3. 计算相对优势（和组内平均相比）
    avg_reward = sum(rewards) / G
    advantages = [r - avg_reward for r in rewards]

    # 4. 更新模型：提升奖励高、降低奖励低的策略
    for response, advantage in zip(responses, advantages):
        model.update(question, response, advantage)

    # 奖励函数看什么？
    # - 答案正确性：最终答案对不对
    # - 格式正确性：有没有用 <answer> 标签包裹答案
    # - 逻辑一致性：推理过程中有没有矛盾
```

GRPO 的关键创新：**不需要单独的"评论家模型"（Critic）**。传统 PPO 算法需要一个额外的模型来评估"好不好"，GRPO 直接用一组回答的相对好坏来判断，省掉了评论家模型，既省算力又简单。

**第三阶段：监督微调（SFT on RL Data）**

- 把 RL 阶段学到的好推理数据收集起来
- 用这些数据再做一次监督学习
- 让模型能稳定地输出高质量的推理过程

### 3.3 思维模板（Reasoning Template）

DeepSeek-R1 让模型在推理时使用特殊的标签：

```xml
<thinking>
让我一步一步思考这个问题。
首先，我需要理解题目要求...
然后，我可以尝试用数学方法来解...
</thinking>

<answer>
最终答案
</answer>
```

这种显式的思维模板有两大好处：

1. **结构化**：模型知道哪里放思考过程，哪里放最终答案
2. **可提取**：可以轻松分离出推理过程和最终答案，分别用于不同场景

### 3.4 奖励函数设计

奖励函数是 RL 的灵魂，决定了模型学什么：

```python
def compute_reward(response, ground_truth):
    total_reward = 0.0

    # 1. 答案正确性奖励（最主要）
    predicted_answer = extract_answer(response)
    if predicted_answer == ground_truth:
        total_reward += 1.0

    # 2. 格式奖励
    if "<answer>" in response and "</answer>" in response:
        total_reward += 0.1

    # 3. 推理长度惩罚（避免模型一直胡说八道）
    thinking_length = count_thinking_tokens(response)
    if thinking_length > 2000:
        total_reward -= 0.2

    return total_reward
```

### 3.5 涌现的推理模式

训练后，模型自发产生了多种高级推理模式：

- **自我反思**：发现自己想错了，主动纠正
- **验证**：算完后再检查一遍
- **策略切换**：发现一条路走不通，换另一种方法
- **分解**：把大问题拆成小问题

这些都不是人工设计的，是模型自己在 RL 过程中"发明"的。

---

## 四、性能表现

DeepSeek-R1 在多个 benchmark 上表现优异：

| 任务类型 | 数据集 | 表现 |
|---------|--------|------|
| 数学 | GSM8K, MATH, AIME | 显著超越 SFT 基线 |
| 编程 | Codeforces, HumanEval | 超越同等规模 SFT 模型 |
| STEM | 各类科学推理任务 | 达到或接近更强模型水平 |

一个关键的发现：用 R1 的大模型推理数据**蒸馏**到小模型上，小模型的推理能力也能大幅提升。这证明了涌现推理模式的价值可以传递。

---

## 五、一个完整的代码示例

下面展示如何模拟 DeepSeek-R1 的 GRPO 训练核心：

```python
import random

class SimpleRLModel:
    """一个极简的强化学习推理模型，演示 GRPO 核心思想。"""

    def __init__(self, knowledge_base):
        # 知识基座：模型已有的"知识"
        self.knowledge_base = knowledge_base
        # 推理权重（可学习的参数）
        self.reasoning_weights = {k: random.random() for k in knowledge_base}

    def generate_response(self, question):
        """根据问题生成一条推理路径。"""
        # 简单策略：从知识库中随机选一条相关推理
        best_key = max(
            self.reasoning_weights.keys(),
            key=lambda k: self.reasoning_weights[k]
        )
        reasoning = self.knowledge_base[best_key]
        answer = self._apply_reasoning(question, reasoning)
        return f"<thinking>{reasoning}</thinking>\n<answer>{answer}</answer>"

    def _apply_reasoning(self, question, reasoning_template):
        """应用推理模板生成答案。"""
        # 简化：直接计算
        try:
            return eval(question.split("=")[1].strip())
        except:
            return "无法计算"

    def grpo_update(self, questions, ground_truths, batch_size=4, lr=0.01):
        """GRPO 更新：一组生成 → 计算奖励 → 更新权重。"""
        for question, ground_truth in zip(questions, ground_truths):
            # 生成一组（batch_size 个）不同的推理路径
            responses = []
            for _ in range(batch_size):
                response = self.generate_response(question)
                responses.append(response)

            # 评估奖励
            rewards = []
            for response in responses:
                predicted = self._extract_answer(response)
                reward = 1.0 if predicted == ground_truth else -1.0
                rewards.append(reward)

            # 计算组内相对优势
            avg_reward = sum(rewards) / len(rewards)

            # 更新权重：提升好策略的权重，降低差策略的权重
            for response, reward in zip(responses, rewards):
                advantage = reward - avg_reward
                # 梯度上升：朝着提高优势的方向更新
                self._apply_gradient_advantage(advantage, lr)

    def _extract_answer(self, response):
        """从回复中提取 <answer> 标签内的内容。"""
        if "<answer>" in response and "</answer>" in response:
            start = response.index("<answer>") + len("<answer>")
            end = response.index("</answer>")
            return response[start:end].strip()
        return None

    def _apply_gradient_advantage(self, advantage, lr):
        """根据优势值更新推理权重。"""
        # 简单演示：优势为正时增强随机权重，为负时减弱
        for key in self.reasoning_weights:
            change = advantage * lr * (random.choice([-1, 1]))
            self.reasoning_weights[key] += change


# ========== 运行演示 ==========
if __name__ == "__main__":
    # 模拟一个简单的问题集
    questions = ["3 + 5 = ", "2 * 4 = ", "10 - 3 = ", "6 / 2 = "]
    ground_truths = ["8", "8", "7", "3"]

    # 知识基座
    knowledge = {
        "addition": "先找到第一个数，然后加第二个数",
        "multiplication": "将两个数相乘",
        "subtraction": "从第一个数中减去第二个数",
        "division": "将第一个数除以第二个数",
    }

    # 初始化模型
    model = SimpleRLModel(knowledge)

    print("=== DeepSeek-R1 GRPO 训练演示 ===\n")
    print(f"初始推理权重: {model.reasoning_weights}\n")

    # 训练 5 轮
    for epoch in range(5):
        model.grpo_update(questions, ground_truths, batch_size=4, lr=0.1)
        print(f"第 {epoch + 1} 轮后权重: {model.reasoning_weights}")

    print("\n=== 生成推理回复 ===\n")
    for q, gt in zip(questions, ground_truths):
        response = model.generate_response(q)
        predicted = model._extract_answer(response)
        status = "✓" if predicted == gt else "✗"
        print(f"{status} 问题: {q}  答案: {predicted}  期望: {gt}")
        print(f"  回复: {response[:80]}...")
```

---

## 六、另一个实际例子：训练奖励函数

```python
def verify_and_reward(question, response, ground_truth):
    """
    DeepSeek-R1 使用的奖励函数设计示例。
    不仅检查答案对不对，还检查推理过程的质量。
    """
    score = 0.0
    feedback = []

    # 1. 答案正确性（最大权重）
    extracted = extract_answer_from_tags(response)
    if extracted == ground_truth:
        score += 1.0
        feedback.append("答案正确")
    else:
        score -= 0.5
        feedback.append(f"答案错误: 期望 {ground_truth}, 得到 {extracted}")

    # 2. 推理标签完整性
    if "<thinking>" in response and "</thinking>" in response:
        score += 0.1
        feedback.append("包含推理标签")
    else:
        feedback.append("缺少推理标签")

    if "<answer>" in response and "</answer>" in response:
        score += 0.1
        feedback.append("包含答案标签")
    else:
        feedback.append("缺少答案标签")

    # 3. 推理质量
    thinking_text = extract_thinking(response)
    reasoning_length = len(thinking_text.split())

    # 太短：没有认真思考
    if reasoning_length < 10:
        score -= 0.2
        feedback.append("推理过程过短")

    # 太长：可能在胡说
    if reasoning_length > 500:
        score -= 0.1
        feedback.append("推理过程过长")

    # 检查是否有自我验证
    verification_keywords = ["检查", "验证", "recheck", "verify", "确认"]
    has_verification = any(
        kw in thinking_text.lower() for kw in verification_keywords
    )
    if has_verification:
        score += 0.1
        feedback.append("包含自我验证")

    return {
        "total_reward": score,
        "feedback": " | ".join(feedback),
        "correct": extracted == ground_truth,
    }


def extract_answer_from_tags(response):
    if "<answer>" in response and "</answer>" in response:
        start = response.index("<answer>") + len("<answer>")
        end = response.index("</answer>")
        return response[start:end].strip()
    return None


def extract_thinking(response):
    if "<thinking>" in response and "</thinking>" in response:
        start = response.index("<thinking>") + len("<thinking>")
        end = response.index("</thinking>")
        return response[start:end].strip()
    return ""


# 演示
if __name__ == "__main__":
    sample_response = """<thinking>
    首先，我需要计算 15 乘以 2 再减去 3。
    15 × 2 = 30，然后 30 - 3 = 27。
    让我验证一下：15 × 2 确实是 30，30 - 3 确实是 27。
    </thinking>
    <answer>27</answer>"""

    result = verify_and_reward("题目", sample_response, "27")
    print(f"总奖励: {result['total_reward']:.1f}")
    print(f"反馈: {result['feedback']}")
```

---

## 七、总结：DeepSeek-R1 到底牛在哪里？

1. **不依赖大量人类标注数据**：只用少量 SFT 数据做冷启动，主体靠 RL 自发学习。省去了标注百万条推理数据的成本。

2. **推理能力是"涌现"的**：模型自己在试错中学会了自我反思、验证、策略切换——这些都不是人工设计的。

3. **GRPO 简化了 RL 流程**：不需要额外的评论家模型，直接一组回答的相对好坏来判断，省算力。

4. **数据可以蒸馏**：大模型的推理数据能教好小模型，形成正向循环。

5. **思维模板结构化**：`<thinking>` 和 `<answer>` 让推理过程可分离、可分析、可复用。

---

## 八、延伸阅读

- DeepSeek-R1 论文: https://arxiv.org/abs/2501.12948
- 开源代码: https://github.com/deepseek-ai/DeepSeek-R1
- GRPO 算法原始论文: "Simple Fine-Tuning Without RLHF: A Baseline for Reasoning in LLMs"
- Chain of Thought 原始论文: "Chain-of-Thought Prompting Elicits Reasoning in Large Language Models" (Wei et al., 2022)
- PPO 算法: "Proximal Policy Optimization Algorithms" (Schulman et al., 2017)

---

## 九、关键术语对照表

| 英文 | 中文 | 一句话解释 |
|------|------|-----------|
| LLM | 大语言模型 | 能理解并生成人类语言的超大规模AI模型 |
| RL | 强化学习 | 通过试错和奖励信号来学习 |
| SFT | 监督微调 | 用标注数据教模型模仿 |
| GRPO | 分组相对策略优化 | 不用评论家模型的 RL 方法 |
| PPO | 近端策略优化 | 经典的 RL 算法，需要评论家模型 |
| Chain of Thought | 思维链 | 让模型逐步推理的技术 |
| Reward Model | 奖励模型 | 给模型的输出打分 |
| Distillation | 知识蒸馏 | 用大模型教小模型 |
| Emergent | 涌现 | 模型自发产生的新能力 |
