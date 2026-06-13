---
title: A Survey of Test-Time Compute: From Intuitive Inference to Deliberate Reasoning
来源: https://arxiv.org/abs/2501.02497
日期: 2026-06-13
分类: 机器学习
子分类: 推理计算
provenance: pipeline-v3
---

# A Survey of Test-Time Compute: From Intuitive Inference to Deliberate Reasoning

> 作者：Yixin Ji, Juntao Li, Yang Xiang, Hai Ye, Kaixin Wu, Kai Yao, Jia Xu, Linjian Mo, Min Zhang
> 来源：arXiv 2501.02497 (v3, 2025-06-29)

## 核心概念：什么是"测试时计算"？

先问一个问题：你小时候做数学题，有两种状态。

第一种：题目简单，你一看就知道答案。这是"直觉反应"。
第二种：题目很难，你要在草稿纸上一步步推导，甚至推翻重来。这是"深度思考"。

测试时计算（Test-Time Compute）就是让 AI 模型在面对难题时，能进入第二种状态——多花一些计算时间，多想一会儿，从而给出更好的答案。

过去我们训练模型时，用的是"训练时计算"（训练时花大量算力和数据）。测试时计算的意思是：模型训练完了，但用的时候不是"秒回"，而是允许它多花时间去推理。

OpenAI 的 o1 模型就是典型代表。它面对复杂数学题时，会自己生成一步步的推理过程，甚至自我检查、自我纠正。这就是从 System-1（直觉推理）走向 System-2（深思推理）的过程。

## 两个系统：System-1 vs System-2

这个概念来自心理学家丹尼尔·卡尼曼的著作《思考，快与慢》。

- **System-1（快思考）**：直觉式、快速、自动。就像你看到"2+2="，你马上反应出"4"。对应的模型能直接给出答案，但面对复杂任务容易出错。
- **System-2（慢思考）**：分析式、缓慢、需要努力。就像你面对一道微积分题，你必须一步步来。对应的模型会生成中间推理步骤，逐个验证。

论文的核心主线就是：测试时计算如何推动 AI 从 System-1 走向 System-2。

## 第一部分：System-1 的测试时适应（TTA）

在模型还是"直觉型"的时候，测试时计算也有用武之地。论文把它分为四类方法。

### 1. 更新模型参数

在推理过程中，用小批量测试样本来微调模型参数，让它适应当前输入的数据分布。

- **TTT（Test-Time Training）**：训练时加入辅助任务（比如旋转图片预测），推理时利用辅助任务的损失来指导参数更新。
- **Tent（Fully TTA）**：直接用模型预测的"不确定性"（熵）作为信号来更新参数。模型越不确定，熵越大，更新幅度也越大。

**关键挑战**：模型越大（比如 LLM），参数更新越慢，甚至不现实。

```python
# 伪代码：Tent 方法的思想
# 模型对输入的预测概率分布为 p
entropy = -sum(p * log(p))

# 熵越大，说明模型越"困惑"
# 用熵作为损失函数来更新少量参数（如归一化层）
loss = entropy
update_model_parameters(loss, learning_rate=0.001)
```

### 2. 修改输入

不用改模型，改输入。对 LLM 来说，这就是在测试样本前加几个"示例"（示范），利用模型的上下文学习能力（In-Context Learning, ICL）。

- 选择与测试样本最相似的示例
- 按最佳顺序排列这些示例

### 3. 编辑内部表示

大模型的"中间层"其实已经包含了有用知识，只是没能有效传递到输出。这个思路是在推理时，直接修改模型内部的"中间状态"。

方法举例：给模型一个正面提示和一个负面提示，计算它们表示的差值（称为"导向向量"），加到中间层上，让输出朝期望的方向偏移。

### 4. 校准输出

用外部信息校准模型的输出概率。最经典的是 kNN-MT（k 近邻机器翻译）：

- 维护一个存储了训练数据表示的"记忆库"
- 推理时，找到与当前输入最近的 k 个邻居
- 将邻居的答案与模型自己的预测按权重融合

```python
# 伪代码：kNN-MT 校准思想
def calibrate_output(model, query, datastore, k=10):
    # 从记忆库中检索最近的 k 个样本
    neighbors = datastore.knn_search(query, k=k)
    
    # 获取邻居的答案分布
    neighbor_probs = compute_neighbor_distribution(neighbors)
    
    # 获取模型自己的预测分布
    model_probs = model.predict(query)
    
    # 加权融合
    alpha = 0.5
    calibrated_probs = alpha * model_probs + (1 - alpha) * neighbor_probs
    return calibrated_probs
```

## 第二部分：System-2 的测试时推理

进入 LLM 时代后，测试时计算的核心任务变成了增强推理能力。这是论文的重点，分为两块：反馈建模 + 搜索策略。

### 1. 反馈建模（给推理过程打分）

就像考试后要批改试卷，模型生成推理过程后，也需要有人来判断"这一步对不对"。

- **ORM（结果验证器）**：只看最终答案对不对。简单，但无法定位中间步骤的错误。
- **PRM（过程验证器）**：对每一步推理都打分，精确到每个推理步骤。更准确，但标注成本更高。

```python
# 伪代码：ORM vs PRM 的区别
def verify_answer_orm(final_answer):
    """只看最终结果"""
    return final_answer == ground_truth

def verify_answer_prm(reasoning_steps):
    """对每一步推理都打分"""
    scores = []
    for step in reasoning_steps:
        score = process_verifier.evaluate(step)
        scores.append(score)
    # 返回每一步的分数，可以定位哪一步出错
    return scores
```

### 2. 搜索策略（让模型多想想）

有三种主要方法，对应人类思考的不同方式。

#### 方法 A：重复采样

从模型中多次生成答案，选最好的那个。就像一个人想了很多次，最后选最满意的答案。

- 对应方法：多数投票（Majority Voting）、SC-CoT
- 原理：模型每次生成都有随机性，多试几次能碰上好答案

#### 方法 B：自我纠正

模型生成答案后，回头自己检查、发现自己错了、修正它。

- 对应方法：Self-Correct、Reflexion、Shepherd
- 原理：让模型扮演自己的"批评者"，检查自己的推理过程

```python
# 伪代码：自我纠正流程
def self_correct_model(model, question, max_iterations=3):
    for i in range(max_iterations):
        # 第一步：生成答案和推理过程
        reasoning = model.generate(question)
        
        # 第二步：用验证器检查每一步
        scores = process_verifier.evaluate(reasoning)
        
        # 第三步：如果有步骤得分低，说明有误
        if has_error(scores):
            # 生成纠正后的推理
            feedback = generate_feedback(scores)
            question = f"{question} (Previous reasoning had errors. {feedback} Please correct.)"
            question = reasoning + "\n" + question  # 追加到上下文中
        else:
            # 全部通过，返回答案
            return reasoning
    return reasoning  # 达到最大迭代次数，仍返回最终结果
```

#### 方法 C：树搜索

把推理过程想象成一棵树，模型在每个节点探索多种可能的下一步，然后搜索最优路径。

- 对应方法：ToT（Tree of Thoughts）、RAP、MCTS
- 原理：人类思考时会"分支"——想到多条路，如果走不通就回溯换一条

```python
# 伪代码：树搜索思路（简化版）
def tree_search(model, question, max_depth=5, branching_factor=3):
    # 根节点 = 问题
    root = Node(question)
    queue = [root]
    
    while queue:
        current = queue.pop(0)
        
        # 在每个节点，生成多个可能的推理分支
        children = []
        for _ in range(branching_factor):
            child_text = model.generate(current.text + " -> ")
            children.append(Node(child_text))
        
        # 用验证器给每个分支打分
        for child in children:
            child.score = verifier.evaluate(child.text)
        
        # 选择分数最高的分支继续扩展
        best_child = max(children, key=lambda c: c.score)
        if best_child.score > threshold:
            queue.append(best_child)
        else:
            break  # 分数太低，回溯
    
    # 返回路径上得分最高的节点
    return find_best_path(root)
```

## 第三部分：为什么这个研究很重要？

论文指出几个关键趋势：

1. **训练时算力越来越稀缺**：高质量训练数据快用完了，模型再变大也不划算
2. **System-1 模型的局限性**：直接输出答案的模式在面对复杂任务时表现很差
3. **测试时算力是可替代路径**：既然训练时加料困难，不如在推理时多花算力

这就像学生考试——如果你平时没好好读书（训练数据不足），考试时多花点时间思考（测试时计算），也能答出更好的卷子。

## 未来方向

论文提到三个重要方向：

- **测试时扩展定律（Test-Time Scaling Law）**：测试时计算量和模型性能之间是否存在类似训练时扩展定律的关系？
- **策略组合**：上述各种方法（采样、纠正、搜索）如何组合使用效果更好？
- **新范式**：能否设计全新的测试时计算方式，突破现有框架？

---

*本文基于论文 arXiv:2501.02497 撰写，旨在帮助零基础学习者理解"测试时计算"的核心概念。*
