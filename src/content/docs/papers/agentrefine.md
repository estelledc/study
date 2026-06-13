---
title: "AgentRefine 学习笔记：通过修正微调增强智能体泛化能力"
来源: https://arxiv.org/abs/2501.01702
日期: 2026-06-13
分类: 机器学习
子分类: 智能体
provenance: pipeline-v3
---

# AgentRefine：通过修正微调增强智能体泛化能力

## 一、日常类比：为什么"会改错"比"背答案"更重要

想象你让一个学生做数学题。传统的训练方式是给他 100 道一模一样的练习题，他背下了答案和步骤——这就是"记忆"。考试时如果题目完全一样，他能满分；但题目稍微变一下数字或问法，他就懵了。

AgentRefine 的核心理念是：**与其让学生背答案，不如让他学会从错误中改正**。

具体做法是：

1. 给学生出一道新题
2. 他先做一次（可能会犯错）
3. 老师指出错误原因
4. 学生根据反馈修正自己的做法
5. 重复这个过程

关键洞察是：**修正错误的过程本身，就是在学习**。模型不是记住了"看到 A 就选 B"，而是学会了"当我看到结果不对时，我应该反思并调整"。

这就像程序员调试代码——你不需要背诵每种错误的修复方法，你学会的是"读错误信息 -> 理解哪里出了问题 -> 修正代码"这个通用能力。

## 二、背景与问题

### 2.1 LLM 智能体的"记忆"困境

大语言模型（LLM）作为智能体的核心控制器，已经在复杂任务中展现了类人能力（如 AutoGPT、BabyAGI 等项目）。开源模型（如 LLaMA、Mistral）正在成为商业模型（GPT-4）的有力替代。

许多研究通过**指令微调**（instruction tuning）来提升开源模型的智能体能力。方法是在特定任务数据上训练模型，让它学会"思考-行动-观察"的循环（即 ReAct 范式）。

### 2.2 核心问题：泛化能力差

研究团队发现了一个关键现象：

| 评估类型 | 定义 | 现有方法的表現 |
|---------|------|--------------|
| **Held-in**（训练环境内） | 测试环境与训练数据来自同一环境 | 表现满意 |
| **Held-out**（训练环境外） | 测试环境是完全没见过的新环境 | **表现很差** |

以 Agent-FLAN 为例：它在 AlfWorld 环境训练后，在 AlfWorld 测试集（held-in）上成功率为 67.2%，但在其他新环境（held-out）如 SciWorld 上的成功率只有 1.1%。

**问题根源**：
- 模型**过拟合**了少数几个手工设计的智能体环境
- 模型只记住了"观察-动作"的对应关系，而不是学会如何应对新情况
- 遇到错误时，模型会反复犯同一个错误，无法从反馈中学习

## 三、核心概念：修正微调（Refinement Tuning）

### 3.1 核心思想

AgentRefine 提出了一种名为**修正微调**（Refinement Tuning）的新方法。其核心思想是：

> **让模型学会通过观察环境反馈来修正自己的错误行为。**

用一个类比：传统微调教模型"怎么走是对的"，修正微调教模型"走错了怎么回头、怎么调整方向"。

### 3.2 数据构造流程

AgentRefine 的数据生成包含三个步骤：

```
Step 1: 生成场景脚本 (Script Generation)
        ↓
Step 2: 生成交互轨迹 (Trajectory Generation)
        ↓
Step 3: 验证与过滤 (Verification)
```

#### 第一步：生成多样化的场景

研究团队使用了丰富的"人设数据"（persona data），涵盖各种职业角色和个人兴趣，让生成的环境多样化。每个场景脚本包含：

- **环境初始状态**：场景里有什么、在哪里
- **目标**：玩家需要完成什么
- **可用动作**：玩家可以做什么
- **完成条件**：如何判断任务完成

例如，一个场景可能是："一个刚加入 IT 部门的新人需要学习 UNIX 系统管理"。

#### 第二步：生成包含错误的交互轨迹

强 LLM（GPT-4o）被用来模拟多轮交互。每一轮分为两个角色：

- **DM（场景管理员）**：提供观察结果、判断动作是否有错
- **Player（玩家）**：思考并采取行动

关键设计：生成的轨迹中**必须包含至少两次错误和修正的过程**。如果生成的轨迹太顺利（错误少于两次），就会被丢弃重做。

#### 第三步：验证与过滤

验证器检查：
- 动作格式是否正确
- 任务是否最终完成
- 错误-修正的轮次是否充足

## 四、代码示例

### 示例 1：修正微调的数据格式

修正微调将每条交互轨迹转换为以下用户-助手对话格式：

```python
# 修正微调数据示例 - 一条完整的"犯错-修正"轨迹
refinement_data = [
    # 第一轮：玩家犯错
    {
        "user": "Observation: You are in a room. There is a table with a key on it. Goal: Take the key and open the door.",
        "assistant": "Thought: I need to first pick up the key from the table.\nAction: take key from table"
    },
    # 第二轮：DM 指出错误，玩家修正
    {
        "user": "Observation: Error: You cannot take the key because the door is locked and the key is inside.\nParameter error: true",
        "assistant": "Thought: Ah, I see. The key is locked inside the room. I should first look for another way to access it, or check if there's a different key.\nAction: examine table"
    },
    # 第三轮：玩家继续修正，走向正确方向
    {
        "user": "Observation: You examine the table. Under the table, you find a hidden compartment containing a small note.",
        "assistant": "Thought: There's a hidden compartment under the table. Let me read the note for clues.\nAction: read note"
    }
]
```

这里的关键是：**第二个助手的回复（Thought + Action）是基于 DM 指出的错误进行修正的**。模型需要学会"根据反馈调整行为"这个模式，而不是记住特定的动作序列。

### 示例 2：修正微调的 Loss 计算

传统微调对所有 token 都计算 loss，但修正微调**只修正确正确的步骤计算 loss**，跳过错误的步骤：

```python
import torch
import torch.nn.functional as F

def refinement_tuning_loss(model, trajectory, is_correct_fn):
    """
    修正微调的 Loss 计算方式。
    
    参数:
        model: 被训练的 LLM 模型
        trajectory: 完整交互轨迹 [turn_0, turn_1, ..., turn_N]
        is_correct_fn: 判断每一步是否正确 (返回 1 表示正确，0 表示错误)
    
    核心思想:
        只在正确的步骤上计算 loss，跳过错误的步骤。
        这样模型不会从错误的数据中学习，而是学习"修正后的正确行为"。
    """
    total_loss = 0.0
    correct_count = 0
    
    for i, turn in enumerate(trajectory):
        thought = turn["Thought"]
        action = turn["Action"]
        observation = turn.get("Observation", "")
        
        # 构建模型输入
        # 历史上下文 + 当前步骤的思考 + 动作
        context = build_context(trajectory[:i])
        input_text = f"{context}\nThought: {thought}\nAction: {action}"
        target_text = f"Thought: {thought}\nAction: {action}"
        
        # 判断当前步骤是否正确
        is_correct = is_correct_fn(turn)  # 1 if correct, 0 if error
        
        # 编码输入和目标
        inputs = tokenizer(input_text, return_tensors="pt")
        targets = tokenizer(target_text, return_tensors="pt")
        
        # 只有在正确步骤上才计算 loss
        if is_correct:
            outputs = model(**inputs)
            logits = outputs.logits
            
            # 提取 target 部分的 log probability
            loss = F.cross_entropy(
                logits[:, :-1, :],  # 去掉最后一个 token
                targets.input_ids[:, 1:],  # 去掉第一个 token
                ignore_index=tokenizer.pad_token_id
            )
            total_loss += loss
            correct_count += 1
        else:
            # 错误步骤不计算 loss，模型不需要学习错误模式
            # 但模型会"看到"这个错误步骤作为上下文
            pass
    
    # 平均所有正确步骤的 loss
    avg_loss = total_loss / max(correct_count, 1)
    return avg_loss


# 使用示例
# 假设我们有一条包含错误和修正的轨迹
trajectory = [
    {"Thought": "I should go to the kitchen.",
     "Action": "go to kitchen",
     "Observation": "You enter the kitchen.", "Correct": True},
    {"Thought": "I should open the cabinet.",
     "Action": "open cabinet",
     "Observation": "Error: The cabinet is locked.", "Correct": False},
    {"Thought": "The cabinet is locked. I need to find a key first.",
     "Action": "search counter",
     "Observation": "You find a key on the counter.", "Correct": True},
    {"Thought": "Now I can use the key to open the cabinet.",
     "Action": "use key on cabinet",
     "Observation": "The cabinet opens. Inside is a recipe.", "Correct": True},
]

# 构建判断函数
def is_correct(turn):
    return 1 if turn["Correct"] else 0

# 计算 loss（只有正确步骤会贡献 loss）
loss = refinement_tuning_loss(model, trajectory, is_correct)
loss.backward()
optimizer.step()

print(f"总步骤数: {len(trajectory)}, 正确步骤数: {sum(1 for t in trajectory if t['Correct'])}")
# 输出: 总步骤数: 4, 正确步骤数: 3
```

这个 loss 设计的精妙之处在于：
- **模型不会从错误中学习**（错误步骤的 loss 被 mask 掉）
- **但模型会"看到"错误作为上下文**，从而学会"当上下文显示我之前犯了错时，我应该这样修正"
- 这是一种**间接学习**：模型不是记住"犯错→X"，而是学会"当我看到错误反馈时→修正为Y"

### 示例 3：推理阶段的对比

```python
# 传统微调的模型在遇到新环境时的表现
def traditional_model_react(observation, history):
    """传统模型：基于记忆做出反应"""
    thought = model.generate_thought(observation, history)
    action = model.generate_action(observation, history, thought)
    # 问题：如果之前没见过这个环境，模型可能重复犯错
    # 例如：DM 指出错误后，下一轮仍然犯同样的错误
    return thought, action


# AgentRefine 训练后的模型在遇到新环境时的表现
def agentrefine_model_react(observation, history):
    """AgentRefine 模型：学会从错误中修正"""
    thought = model.generate_thought(observation, history)
    action = model.generate_action(observation, history, thought)
    
    # 关键区别：模型能识别之前的错误并修正
    # 例如：当观察到 "Error: Invalid command" 时，
    # 模型不会重复同样的动作，而是尝试不同的格式
    return thought, action


# 对比：同一个错误场景下的不同反应
scenario = {
    "observation": "Error: Action 'open cabinet' failed. The cabinet is locked.",
    "history": [
        {"thought": "I'll open the cabinet.", "action": "open cabinet"},
    ]
}

# 传统模型（可能）：
# Thought: The cabinet is locked. I need a key.
# Action: open cabinet   # 仍然尝试 open cabinet，没有真正改变策略！

# AgentRefine 模型（更可能）：
# Thought: The cabinet is locked, so I need to find a key first.
# Action: search room    # 学会了调整策略，去寻找钥匙
```

## 五、实验结果

### 5.1 在五个任务上的表现

研究团队在五个智能体评估任务上进行了测试：

| 方法 | AlfWorld | BabyAI | SciWorld | PDDL | Jericho |
|------|----------|--------|----------|------|---------|
| | 成功率 | 进度 | 成功率 | 进度 | 成功率 | 进度 | 成功率 | 进度 | 成功率 | 进度 |
| GPT-4o | 66.4 | 79.9 | 48.2 | 64.1 | 40.0 | 76.9 | 61.7 | 69.8 | 10.0 | 34.0 |
| Agent-FLAN | **67.2** | **79.7** | 25.0 | 35.3 | 1.1 | 10.9 | 8.3 | 25.5 | 0.0 | 10.1 |
| **AgentRefine** | 44.8 | 63.8 | **37.5** | **50.4** | **14.4** | **42.6** | **16.6** | **37.8** | **10.0** | **32.3** |

**关键发现**：
- 在 held-out 任务（BabyAI、SciWorld、PDDL、Jericho）上，AgentRefine 显著超越 Agent-FLAN
- 在 SciWorld 上，成功率从 1.1% 提升到 37.5%（提升超过 34 个百分点）
- 在 Jericho 上，成功率从 0% 提升到 10%

### 5.2 消融实验

| 模型变体 | SciWorld 成功率下降 |
|----------|-------------------|
| 完整 AgentRefine | - |
| 去掉修正数据（w/o refinement） | 大幅降低 |
| 去掉验证器（w/o verification） | 大幅降低 |
| 只用一半训练数据 | 大幅降低 |

这说明修正数据、验证器、数据多样性都是不可或缺的组件。

## 六、关键启示

### 6.1 泛化与自我修正正相关

研究最重要的发现是：

> **智能体的泛化能力与其自我修正能力密切相关。**

不是训练数据越多越好，而是训练数据中"犯错-修正"的比例和质量决定了模型的泛化能力。

### 6.2 不要只记忆，要学"怎么学"

传统微调让模型记住"在 A 环境下做 B 动作"，但换到 C 环境就失效了。修正微调让模型学会"当我看到结果与预期不符时，我应该检查什么、调整什么"——这是一个通用能力。

### 6.3 对环境扰动的鲁棒性

修正微调的模型在面对环境描述的细微变化时（如将 "clean obj with recept" 改为 "clean obj using recept"），表现比传统微调更稳定，标准差更小。

## 七、总结

AgentRefine 的核心贡献可以浓缩为一句话：

> **与其让模型记住一千道题的答案，不如教它从错误中学习的方法。**

方法简洁但有效：
1. 生成包含"错误-修正"过程的训练数据
2. 训练时只在正确步骤上计算 loss
3. 模型学会通过观察反馈来修正自己的行为

这种方法在多个不同任务上展现了显著的泛化优势，甚至在某些任务上接近了 GPT-4o 的水准。

## 参考资料

- 论文: [AgentRefine: Enhancing Agent Generalization through Refinement Tuning](https://arxiv.org/abs/2501.01702)
- 项目页面: https://agentrefine.github.io/
- 发表: ICLR 2025
- 作者: Dayuan Fu, Keqing He, Yejie Wang 等（北京邮电大学、美团）
