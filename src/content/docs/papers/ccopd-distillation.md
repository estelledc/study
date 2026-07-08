---
title: CCOPD — 让多轮对话别被自己的旧话带偏
来源: 'Zizhuo Lin et al., "Same Evidence, Different Answers: Canonical-Context On-Policy Distillation for Multi-Turn Language Models", arXiv 2026'
日期: 2026-07-08
分类: machine-learning
难度: 中级
---

## 是什么

CCOPD 是一种训练大语言模型的方法，目标是：**同一份证据分多轮给出时，模型最后也要像一次性看到完整题目那样回答**。

日常类比：你和朋友一起做菜。完整菜谱一次给你，你会按步骤做；但如果朋友一会儿告诉你“先切土豆”，一会儿又补一句“其实要做咖喱”，你早先随口说的“像是炒土豆丝”可能会留在脑子里，最后把菜做偏。CCOPD 想训练模型学会：等信息齐了以后，回到完整菜谱，而不是被自己前面猜的话牵着走。

论文把这个问题叫 **canonical-context consistency**：FULL prompt 和 RAW-SHARDED 多轮对话包含同样的用户证据，最终答案分布应该接近。

它指出的核心失败模式叫 **self-anchored drift**：模型在信息不完整时生成了猜测、假设或半成品推理，后面信息补齐了，模型却继续依赖这些自己写过的旧话。

CCOPD 的做法是让同一个基础模型扮演两个角色：冻结教师看完整 FULL prompt，可训练学生看真实 RAW-SHARDED 对话；学生走到自己的最终答案前缀时，教师在同一个前缀上给出“完整上下文视角”的 token 分布。

## 为什么重要

不理解 CCOPD，下面这些事会很难解释：

- 为什么模型一次性看完整题目能答对，分三轮给同样信息却会答错。
- 为什么“让模型先随便猜一下”可能污染后续回答，即使后来用户已经补全了证据。
- 为什么简单 SFT 或奖励训练不一定能修好多轮对话里的“被自己带偏”。
- 为什么这篇只用数学多轮训练，却能在代码、函数调用、SQL、表格转文本和长文总结上带来零样本收益。

## 核心要点

1. **先定义同题不同包装**：FULL 是一次性完整题目，RAW-SHARDED 是把同一份证据拆成多轮。类比：同一张快递单，可以整张递给你，也可以分几次念给你；最后包裹信息应该一样。

2. **再定位污染源**：RAW-SHARDED 不只是更长的 prompt，它夹着模型早先的回复。类比：会议纪要里混入了你开会前的猜测，后面读纪要的人可能把猜测当事实。

3. **最后用同前缀蒸馏校准**：学生在多轮历史下生成自己的答案前缀，教师在完整题目下评分同一个前缀。类比：学生自己写到一半，老师不重写作文，只在同一句开头后告诉他“更像完整题意的下一个词是什么”。

## 实践案例

### 案例 1：FULL 和 RAW-SHARDED 是什么差别

```py
full = "小明有 3 个苹果，又买 4 个，一共有几个？"
raw = [
    ("user", "小明有 3 个苹果。"),
    ("assistant", "看起来可能是在问剩余数量。"),
    ("user", "他又买了 4 个，现在一共有几个？"),
]
```

**逐部分解释**：

- `full` 把全部证据放在一个问题里，模型没有机会先猜错方向。
- `raw` 的用户证据其实也完整，但中间多了 assistant 的早期猜测。
- 如果最后答案被“剩余数量”带偏，就是 self-anchored drift。

### 案例 2：CCOPD 的训练步长什么样

```py
for c, h in training_pairs:
    y = student.sample(context=h)
    for prefix in answer_prefixes(y):
        p_student = student.next_token(h, prefix)
        p_teacher = teacher.next_token(c, prefix)
        loss += reverse_kl(p_student, p_teacher)
```

**逐部分解释**：

- `c` 是完整 FULL prompt，`h` 是同题 RAW-SHARDED 历史。
- `student.sample` 让学生走到自己真实会到达的前缀，这叫 on-policy。
- `teacher.next_token(c, prefix)` 不生成新答案，只在同一前缀上给完整上下文分布。
- `reverse_kl` 会惩罚学生把概率放到偏离完整题意的续写上。

### 案例 3：为什么只训练最终答案

```py
for turn in conversation:
    if turn.after_all_user_evidence and turn.is_final_answer:
        train_on(turn.tokens)
    else:
        skip(turn.tokens)
```

**逐部分解释**：

- 中间轮次信息还不完整，强迫它匹配 FULL 教师会泄漏未来证据。
- 最后一轮用户证据齐了，RAW-SHARDED 和 FULL 才真正 task-equivalent。
- 这就是论文强调的 answer-masked objective：只在最终答案 token 上对齐。

## 踩过的坑

1. **把 RAW-SHARDED 当成长 prompt**：错在忽略了早期 assistant 回复会变成后续上下文里的污染源。

2. **以为教师更大才有效**：论文发现同 backbone 的 FULL 教师更合适，因为任务是学呈现不变性，不是灌入新知识。

3. **把 CCOPD 理解成 SFT**：SFT 学固定目标答案，CCOPD 学的是同一前缀下两个上下文分布要接近，信号更细。

4. **在中间轮也做 FULL 对齐**：这会让模型提前知道还没被用户说出的信息，训练目标反而不干净。

## 适用 vs 不适用场景

**适用**：

- 多轮任务里用户会逐步补充约束、事实或数据的产品。
- 模型一次性看完整任务能做对，但放进真实对话就被早期回复带偏。
- 想通过训练内化稳态行为，而不是每次推理都额外加反思、重置或多轮控制器。
- 已有可构造的 FULL / RAW-SHARDED 成对数据，并能确认最终轮证据已经完整。

**不适用**：

- 用户信息一直缺失，正确行为应该是追问或拒答，而不是强行对齐 FULL。
- 任务本身需要新知识，基础模型看 FULL 也不会做；这时同 backbone 教师帮不了太多。
- 高风险场景想靠它解决安全、隐私或事实性问题；论文只证明任务正确性，不是通用安全保证。
- 没有办法区分最终答案 token 和中间过程 token，answer mask 做不准会污染训练信号。

## 历史小故事（可跳过）

- **2021 年**：GSM8K 等数学推理数据集让研究者可以稳定测试模型的逐步推理能力。
- **2023 年**：Reflexion、Self-Refine 等方法把“推理时自我修正”做成额外控制环，但成本和系统复杂度更高。
- **2024 年**：on-policy distillation 开始强调学生要在自己生成的状态上学习，不只模仿教师示范。
- **2025 年**：Lost in Conversation 类评测显示，同一任务拆成多轮会让模型明显掉分。
- **2026 年**：CCOPD 把问题收窄到“同证据不同呈现”，用 FULL 教师校准 RAW-SHARDED 学生。

## 学到什么

- 多轮鲁棒性不只是上下文长度问题，还是“模型会不会相信自己旧话”的问题。
- 好的蒸馏不一定需要更强教师；有时同一个模型在更干净上下文里的行为就是最合适的监督。
- on-policy 的价值在于训练学生真实会遇到的前缀，而不是只看理想答案轨迹。
- 论文最强结果是 Qwen3-8B 的 RAW-SHARDED 综合表现从 41.6 提到 55.1，约 32% 相对提升，同时 FULL / CONCAT 基本不掉。

## 延伸阅读

- 论文 PDF：[Lin et al. 2026, Same Evidence, Different Answers](https://arxiv.org/pdf/2605.30251v1.pdf)。
- 相邻工作：[Ye et al. 2026, On-Policy Context Distillation for Language Models](https://arxiv.org/pdf/2602.12275v1.pdf)。
- 更新方向：[Multi-Turn On-Policy Distillation with Prefix Replay](https://arxiv.org/pdf/2607.04763v1.pdf)。
- 背景评测：[LLMs Get Lost in Multi-Turn Conversation](https://arxiv.org/pdf/2505.06120)。
- [[cot]] —— 理解“中间推理文本”为什么既能帮忙也能污染。
- [[ppo]] —— 对比奖励优化和本文的 reverse-KL 分布对齐。

## 关联

- [[cot]] —— CCOPD 处理的污染常来自模型早期写下的推理或猜测。
- [[ppo]] —— GRPO / PPO 类方法优化奖励，本文证明奖励训练不等于多轮呈现一致性。
- [[rlhf-christiano]] —— 都是让模型行为更符合目标，但监督信号来源和粒度不同。
- [[dspy]] —— DSPy 关注把 prompt / pipeline 编译好，CCOPD 则把多轮稳态行为训练进模型。
- [[toolformer]] —— Toolformer 教模型何时用工具，CCOPD 教模型何时重新锚定用户证据。
- [[swe-agent]] —— 多轮 agent 任务也容易被早期错误状态带偏，需要类似的上下文稳健性。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
