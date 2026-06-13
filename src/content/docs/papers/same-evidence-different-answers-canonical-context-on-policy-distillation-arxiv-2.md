---
title: Same Evidence, Different Answers: Canonical-Context On-Policy Distillation
来源: https://arxiv.org/abs/2605.30251
日期: 2026-06-13
分类: 机器学习
子分类: 模型与训练
provenance: pipeline-v3
---

# Same Evidence, Different Answers

## 一个日常类比

想象你在玩"猜数字"游戏。

规则是这样的：我手里有一个三位数，比如 **4-7-2**。

**场景 A（一次性给出）**：我说"答案是 4-7-2"。你立刻回答"472"。

**场景 B（分三轮给出）**：第一轮我说"第一位是 4"，第二轮说"第二位是 7"，第三轮说"第三位是 2"。每轮你都要猜一次。结果你前两轮乱猜，第三轮虽然知道全部信息了，却猜成了"274"。

为什么同样的证据，不同的呈现方式，答案就不一样了？

这就是这篇论文要解决的核心问题：**大语言模型（LLM）在一次性收到全部指令时能正确完成任务，但当同样的信息被拆分成多轮对话逐步给出时，模型就会出错。**

## 问题定义：FULL vs RAW-SHARDED

论文提出了两个关键概念：

| 模式 | 说明 | 例子 |
|------|------|------|
| **FULL** | 所有信息在一个 prompt 里 | "小明有3个苹果，小红给他2个，他又买了5个，现在有几个？" |
| **RAW-SHARDED** | 同一信息被拆成多轮对话 | 第1轮："小明有3个苹果" → 第2轮："小红给了他2个" → 第3轮："他又买了5个" → 问："现在有几个？" |

两种模式包含的信息完全一样，但模型在 RAW-SHARDED 下的表现差很多。

## 根因：自我锚定漂移（Self-Anchored Drift）

论文认为根本原因是 **self-anchored drift**（自我锚定漂移）。

用一个类比来理解：

> 你在拼图。有人一次性给你全部 100 块拼图（FULL），你能很快拼出完整的画面。
>
> 但如果是每次只给你 1-2 块（RAW-SHARDED），你会先根据手头的几块**猜测**整幅图是什么。猜错了没关系——但你已经"以为"自己知道了。等到最后一块拼图给你时，你之前的错误猜测已经影响了对最终画面的判断。

在 LLM 中，这个过程是这样的：

1. 第 1 轮：模型只看到部分信息，它会**不自觉做出假设**来"脑补"
2. 第 2 轮：这些假设已经被写进了对话历史，变成了"上下文的一部分"
3. 第 N 轮：当完整信息终于出现时，之前错误的假设已经像胶水一样粘在了上下文中，**污染了最终的推理**

这就是"自我锚定"——模型被自己早期产生的假设锚定了，无法回到正确的轨道上。

## 解决方案：CCOPD

论文提出的方法是 **Canonical-Context On-Policy Distillation**（规范上下文在策略蒸馏），简称 CCOPD。

### 核心思想

用一个简单的类比：

> 老师（Teacher）和学生在同一间教室里。老师面前有一本完整的参考答案书（FULL prompt），学生面前只有被撕碎分散在不同页的书页（RAW-SHARDED）。
>
> 每做完一道题，老师看一眼参考答案，告诉学生"你应该这样做"。学生反复练习，最终即使只看碎片化的书页，也能做出和参考答案一样的答案。

### 两个角色

CCOPD 中，**同一个基础模型**担任两个角色：

```
┌─────────────────────────────────────────────┐
│              同一个基础模型                    │
│                                             │
│  ┌──────────────┐       ┌──────────────┐    │
│  │   Teacher    │       │   Student    │    │
│  │  (冻结权重)   │       │  (可训练)     │    │
│  │              │       │              │    │
│  │ 输入: FULL   │       │ 输入: 逐轮    │    │
│  │ 输出: 标准答案 │       │ 输出: 逐步推理  │    │
│  └──────────────┘       └──────────────┘    │
│         │                      │             │
│         └────── 对齐 ──────────┘             │
│         (让学生行为贴近老师的标准行为)          │
└─────────────────────────────────────────────┘
```

- **Teacher（教师）**：权重冻结，接收完整的 FULL prompt，输出一份"标准答案"
- **Student（学生）**：权重可训练，接收逐轮给出的 RAW-SHARDED 对话，逐步生成回答

训练的目标就是让 Student 的行为尽可能靠近 Teacher 的标准行为。

### 代码示例 1：数据构造

首先，我们需要把一条完整的问题拆分成多轮对话：

```python
# 原始完整问题（FULL prompt）
full_prompt = """
小明有3个苹果。小红给了小明2个苹果。
然后小明又去商店买了5个苹果。
请问小明现在一共有多少个苹果？
"""

# 正确答案（Teacher 的输出）
teacher_answer = "小明现在有 10 个苹果。计算过程：3 + 2 + 5 = 10。"

# 将完整问题拆成多轮对话（RAW-SHARDED）
sharded_conversation = [
    {"role": "user", "content": "小明有3个苹果。"},
    {"role": "assistant", "content": "好的，小明目前有3个苹果。"},
    {"role": "user", "content": "小红给了小明2个苹果。"},
    {"role": "assistant", "content": "收到。"},
    {"role": "user", "content": "然后小明又去商店买了5个苹果。请问小明现在一共有多少个苹果？"},
]
```

注意：即使中间 assistant 的回复很简短（甚至可以是空回复），这些回复本身就会成为后续轮次的上下文，可能引入偏差。

### 代码示例 2：CCOPD 训练循环

```python
import torch
import torch.nn.functional as F

def ccopd_training_step(
    model,              # 同一个模型，既是 teacher 又是 student
    full_prompt,        # 完整 prompt（teacher 的输入）
    sharded_history,    # 逐轮对话历史（student 的输入）
    teacher_answer,     # teacher 的标准输出
    temperature=0.7,
):
    # ---- 第一步：Teacher 推理（权重冻结）----
    with torch.no_grad():
        teacher_output = model.generate(
            inputs=tokenizer(full_prompt, return_tensors="pt"),
            max_new_tokens=256,
            temperature=temperature,
        )
        # teacher_output 就是"标准答案"的概率分布

    # ---- 第二步：Student 推理（权重可训练）----
    # 模拟逐轮对话过程
    student_logits_list = []
    for turn in sharded_history:
        if turn["role"] == "user":
            # 累积对话历史
            current_input = build_dialogue_context(sharded_history[:sharded_history.index(turn)+1])
            inputs = tokenizer(current_input, return_tensors="pt")

            # 获取当前轮的 logits（用于蒸馏）
            with torch.set_grad_enabled(True):
                outputs = model(**inputs)
                student_logits_list.append(outputs.logits)

    # ---- 第三步：蒸馏损失 ----
    # 让 student 的每一轮输出都接近 teacher 的标准行为
    distillation_loss = 0.0
    for student_logits in student_logits_list:
        # KL 散度：student 分布 vs teacher 分布
        student_probs = F.softmax(student_logits / temperature, dim=-1)
        teacher_probs = F.softmax(teacher_output / temperature, dim=-1)
        kl_loss = F.kl_div(
            F.log_softmax(student_logits / temperature, dim=-1),
            teacher_probs,
            reduction="batchmean",
        )
        distillation_loss += kl_loss

    # 也可以加入普通的语言建模损失
    lm_loss = F.cross_entropy(
        student_logits.view(-1, student_logits.size(-1)),
        teacher_answer_ids,
    )

    total_loss = distillation_loss + lm_loss
    total_loss.backward()
    return total_loss
```

关键点：
- `torch.no_grad()` 确保 Teacher 的权重不会被更新
- Student 通过 KL 散度学习模仿 Teacher 的输出分布
- 每一轮对话的 student 输出都被拉到 teacher 的标准附近

## 实验结果

论文的训练数据**只用数学问题对话**。但效果出乎意料地好：

| 指标 | 结果 |
|------|------|
| RAW-SHARDED 性能提升 | 平均相对提升 **32%** |
| 覆盖范围 | 数学 + 5 个零样本跨领域任务 |
| FULL 性能 | 基本保持不变（没有退化） |

这意味着 CCOPD 不仅解决了"分轮给信息就出错"的问题，而且没有牺牲模型在正常场景下的能力。

## 深入分析：CCOPD 为什么有效？

论文做了进一步分析，发现 CCOPD 主要增强了两个方面：

1. **对用户证据的扎根程度（grounding）**：模型更依赖用户实际提供的信息，而不是自己脑补
2. **对早期 assistant 轮次污染的敏感度降低**：即使前面的对话里有误导性的 assistant 回复，模型也不容易被带偏

回到拼图的类比：CCOPD 就像是教学生"**每次拿到新拼图块时，都回头看一眼参考答案确认**"。久而久之，学生养成了习惯——即使拼图是碎片化给的，也会不断校正自己的猜测。

## 总结

| 要素 | 说明 |
|------|------|
| **问题** | LLM 在 FULL prompt 下做得好，但在 RAW-SHARDED 多轮对话下表现差 |
| **根因** | Self-anchored drift：早期不完整信息导致的假设污染后续推理 |
| **方法** | CCOPD：同一模型同时当 Teacher（看全文）和 Student（看碎片），用蒸馏对齐 |
| **效果** | 只用数学数据训练，跨领域提升 32%，不损害原有能力 |
| **关键洞察** | 训练时让模型学会"即使信息是分步给的，也要以完整视角来做判断" |

## 延伸思考

这篇论文揭示了一个 LLM 在实际使用中非常常见的问题：**现实中的交互往往是多轮的、渐进的**。用户不会一次性把全部信息塞进一个 prompt，而是像聊天一样慢慢说。如果模型不能很好地处理这种场景，那么在真实应用中的体验就会大打折扣。

CCOPD 的价值在于它提供了一种简单而有效的训练范式——不需要额外的标注数据，不需要复杂的架构改动，只需要"让模型自己教自己"。
