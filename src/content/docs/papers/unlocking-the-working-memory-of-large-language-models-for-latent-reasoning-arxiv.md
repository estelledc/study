---
title: Unlocking the Working Memory of Large Language Models for Latent Reasoning
来源: https://arxiv.org/abs/2605.30343
日期: 2026-06-13
分类_原始: AI / 大语言模型
分类: 机器学习
子分类: ML 系统
provenance: pipeline-v3
---

# Unlocking the Working Memory of Large Language Models for Latent Reasoning

## 一句话总结

这篇论文提出了一种叫 **RiM（Reasoning in Memory）** 的新方法，让大语言模型像人一样，在"脑海中的工作记忆"里悄悄做推理，而不是把每一步思考都大声念出来。

## 日常类比：心算 vs 列竖式

想象你在做一道数学题：347 + 589。

有两种解法：

- **列竖式（显式推理）**：你把每一步都写在纸上，进位、相加、写结果。外人能完全看到你的思考过程。这就像目前主流的 "Chain of Thought"（思维链）方法——模型必须把中间推理步骤一个个生成成文字。
- **心算（隐性推理）**：你在脑子里记住进位、逐步计算，最后只说出答案 "936"。外人看不到你脑中的计算过程，但计算确实发生了。

RiM 要做的，就是让 AI 学会"心算"。

## 背景：为什么现有的方法不够好

### Chain of Thought（CoT）——"边想边说"

2022 年，Wei 等人提出了 Chain of Thought  prompting。核心思想很简单：如果你让模型在给出最终答案之前，先生成一些推理步骤（比如"第一步，347 + 500 = 847"），它的准确率会大幅提升。

但这有个代价：

1. **速度慢**：模型必须一步一步地生成文本，不能并行。每多一个推理步骤，就多一次生成。
2. **浪费算力**：生成的推理步骤必须符合自然语言的语法和流畅度——这部分计算是为了"让人看懂"，不是为了"帮助推理"。
3. **暴露过程**：推理过程被完整暴露，既可能泄露敏感信息，也可能被恶意利用来构造攻击。

### 已有的改进：Latent Reasoning

后来有人尝试用"连续向量"代替"文字"来做中间推理（比如 Coconut 方法）。虽然不再受自然语言限制，但本质上还是"一步一步生成"——只是从生成文字变成了生成数字向量。

**关键问题没有变：推理仍然被绑定在自回归生成上。**

### 人类的启示：工作记忆

认知心理学中有一个经典概念叫 **工作记忆（Working Memory）**。它是大脑中一个临时存放和操作信息的"内部工作台"。当你做复杂心算时，你不会把每一步都说出来——你在心里记住中间结果，逐步操作，最后才说出答案。

RiM 的作者问了一个关键问题：**如果让大语言模型也有类似的工作记忆呢？**

## 核心概念

### 1. 记忆块（Memory Blocks）

RiM 的核心发明是 **记忆块**。每个记忆块是一组固定的特殊标记，格式如下：

```
<b> <m> <m> </b>
```

- `<b>` 和 `</b>`：标记块的开始和结束
- `<m>`：实际的"工作记忆单元"，可以有多个

这些特殊标记在训练前不存在于模型的词汇表中，因此不会干扰模型已有的知识。训练时，只有这些特殊标记的嵌入向量会被更新，原有词汇的嵌入保持不变。

### 2. 单次前向传播

因为记忆块是 **固定输入**（不是模型生成的），整个推理过程只需要 **一次前向传播**：

```
输入: [问题] [<b> <m> <m> </b>] [<b> <m> <m> </b>] ... [<b> <m> <m> </b>]
                                              ↓
                                    一次前向传播
                                              ↓
                                    输出: 答案
```

对比 Chain of Thought：

```
输入: [问题]
  ↓ 第1步生成
输出: "第一步: 347 + 500 = ..."
  ↓ 第2步生成（依赖第1步的输出）
输出: "第二步: 847 + 89 = ..."
  ↓ 第3步生成
输出: "答案是 936"
```

CoT 需要 T 次串行生成，RiM 只需要 1 次前向传播。

### 3. 两阶段课程学习

记忆块本身没有预设的计算角色——它们只是随机初始化的特殊标记。如何让模型学会使用它们？作者设计了两个训练阶段：

**第一阶段：推理步骤监督（Reasoning Step Supervision）**

- 给定一个问题的标准推理过程，把它拆分成 T 个推理步骤
- 为每个推理步骤分配一个记忆块
- 训练模型：在每个记忆块之后，预测下一个推理步骤

这就像老师让学生做题时，先在草稿纸上写出每一步，然后老师检查每一步是否正确。通过这种方式，模型学会了把有用的中间信息存入记忆块。

**第二阶段：最终答案精炼（Final Answer Refinement）**

- 移除推理步骤的监督信号
- 训练模型：在每个记忆块之后，直接预测最终答案
- 随着记忆块数量增加，答案逐渐变得更准确

这就像学生已经学会了如何在草稿纸上记录思考过程，现在可以只在心里计算，最后只写出答案。

## 代码示例

### 示例 1：RiM 的训练数据构造

假设我们有一个数学问题和它的标准推理过程：

```python
# 原始问题
question = "小明有 347 个苹果，又买了 589 个。他一共有多少个苹果？"

# 标准推理过程（被拆分成 3 个步骤）
reasoning_steps = [
    "第一步：347 + 500 = 847",
    "第二步：847 + 80 = 927",
    "第三步：927 + 9 = 936",
]

# 最终答案
answer = "936"

# 构建 RiM 的训练序列
# 将推理步骤替换为固定数量的记忆块
num_memory_blocks = len(reasoning_steps)  # 3 个
memory_block = "<b> <m> <m> </b>"

# 训练输入：问题 + 记忆块
rim_input = f"{question} {memory_block} {memory_block} {memory_block}"

# 训练标签：在每个记忆块之后，分别对应下一个推理步骤
# 第 1 个记忆块之后 → 预测 "第一步：347 + 500 = 847"
# 第 2 个记忆块之后 → 预测 "第二步：847 + 80 = 927"
# 第 3 个记忆块之后 → 预测最终答案 "936"
rim_targets = reasoning_steps + [answer]

# 这就是第一阶段（Stage 1）的训练数据格式
# 模型学习：看到问题 + 前 k 个记忆块 → 预测第 k+1 个推理步骤
```

### 示例 2：RiM 的注意力掩码（Attention Mask）

RiM 使用了一个特殊的注意力掩码，确保每个记忆块的输出只能看到它之前的记忆块，而不能"偷看"其他推理步骤：

```
输入序列布局：
[问题] [<mb1>] [<mb2>] [<mb3>] [target1] [target2] [target3]

注意力掩码规则：
- mb1 可以看到：[问题]、[mb1]
- mb2 可以看到：[问题]、[mb1]、[mb2]
- mb3 可以看到：[问题]、[mb1]、[mb2]、[mb3]
- target1 可以看到：[问题]、[mb1]  （不能看到 target2 或 target3！）
- target2 可以看到：[问题]、[mb1]、[mb2]
- target3 可以看到：[问题]、[mb1]、[mb2]、[mb3]

这样设计的目的：
- 每个推理步骤的预测只能依赖记忆块中的信息
- 模型无法绕过记忆块直接"抄答案"
- 所有目标可以同时在一个前向传播中训练
```

用伪代码表示这个掩码：

```python
def build_rim_attention_mask(question_len, num_memory_blocks, target_per_block=1):
    """
    构建 RiM 的自定义注意力掩码
    
    参数:
        question_len: 问题部分的 token 数量
        num_memory_blocks: 记忆块的数量
        target_per_block: 每个记忆块后的目标数量（通常为 1）
    
    返回:
        attention_mask: 上三角掩码矩阵，确保因果性
    """
    block_size = 4  # <b> <m> <m> </b>
    total_seq_len = question_len + num_memory_blocks * block_size + num_memory_blocks
    
    # 初始化为全连接（允许所有位置互相注意）
    mask = torch.ones(total_seq_len, total_seq_len)
    
    for i in range(total_seq_len):
        for j in range(total_seq_len):
            # 规则 1: 不能看到未来的 token（因果性）
            if j > i:
                mask[i][j] = float('-inf')
            
            # 规则 2: 推理目标不能看到其他推理目标
            # 找到当前 token 属于哪个位置
            pos_in_seq = i - question_len
            if pos_in_seq >= num_memory_blocks * block_size:
                # 这是一个推理目标位置
                target_idx = pos_in_seq - num_memory_blocks * block_size
                # 它只能看到对应的记忆块及其之前的内容
                max_visible = question_len + (target_idx + 1) * block_size
                if j >= max_visible:
                    mask[i][j] = float('-inf')
    
    return mask
```

### 示例 3：推理时的使用

训练完成后，推理过程非常简单——只需一次前向传播：

```python
def rim_inference(model, question, memory_block="<b> <m> <m> </b>"):
    """
    RiM 推理函数
    
    与 Chain of Thought 的关键区别：
    - CoT: 需要 T 次自回归生成（串行）
    - RiM: 只需 1 次前向传播（并行）
    """
    # 构建输入：问题 + K 个记忆块
    k = 8  # 使用 8 个记忆块
    input_tokens = f"{question} " + f" {memory_block}" * k
    
    # 一次前向传播
    outputs = model(input_tokens)
    
    # 每个记忆块后面都有一个"读出口"（readout）
    # 可以得到 K 个逐步改进的答案
    answers_at_each_step = []
    for k in range(1, len(outputs.readouts) + 1):
        answer = outputs.readouts[k-1]  # 第 k 个记忆块之后的答案
        answers_at_each_step.append(answer)
    
    # 最终答案 = 最后一个记忆块之后的预测
    final_answer = answers_at_each_step[-1]
    
    return final_answer, answers_at_each_step

# 实际效果对比
# Chain of Thought: TTFT = 420ms, 总延迟 = 420ms + T × 生成时间
# RiM:             TTFT = 16ms, 总延迟 = 16ms（一次前向传播）
# 
# 在 Llama-3.2-1B 上，RiM 的推理延迟只有 CoT 的 ~4%，
# 但准确率仍然超过 CoT。
```

## 实验结果

作者在 GSM8K（小学数学题）和 GSM-Hard（更难题目）上进行了测试，主要结果：

| 模型 | 方法 | GSM8K 准确率 | 推理延迟 |
|------|------|-------------|---------|
| Llama-3.2-1B | SFT（无 CoT） | 23.9% | 16ms |
| Llama-3.2-1B | Coconut | 36.9% | 108ms |
| Llama-3.2-1B | **RiM** | **42.1%** | **16ms** |
| Llama-3.2-3B | SFT（无 CoT） | 36.2% | 28ms |
| Llama-3.2-3B | Coconut | 41.3% | 189ms |
| Llama-3.2-3B | **RiM** | **48.8%** | **28ms** |

关键发现：
- RiM 比 Coconut 准确率高 5-7.5 个百分点
- RiM 的推理延迟与直接回答（无 CoT）相同，因为只有 TTFT（Time To First Token）
- 即使使用更小的模型（1B），RiM 也能达到甚至超过更大模型的水平

## 为什么这个方法重要

1. **效率革命**：推理速度提升 25 倍，且准确率更高
2. **隐私保护**：推理过程不暴露，不会被逆向工程
3. **理论意义**：证明了 LLM 可以被训练出真正的"内在思考"能力，而不只是"复述思考"
4. **实用价值**：可以在资源受限的设备上运行高质量推理

## 类比总结

回到开头的类比：

- **CoT**：像一个学生做数学题时，大声念出每一步思考过程
- **Coconut**：像一个学生用密码本写推理步骤，外人看不懂但还是要一步步写
- **RiM**：像一个学生默默在心算，最后只说出答案——但答案是对的

RiM 的核心洞见是：**思考不一定需要说出来。真正聪明的推理，发生在沉默之中。**

## 参考文献

- Aichberger, L. & Hochreiter, S. (2026). *Unlocking the Working Memory of Large Language Models for Latent Reasoning*. arXiv:2605.30343.
- Wei, J. et al. (2022). Chain-of-Thought Prompting Elicits Reasoning in Large Language Models. NeurIPS.
- Hao, S. et al. (2025). Coconut: Latent Reasoning with Continuous Representations. ICML.
- Baddeley, A. (1992). Working Memory. Science.
