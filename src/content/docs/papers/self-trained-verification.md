---
title: Self-Trained Verification — 让模型先看标准答案学会挑错
来源: 'Chen Henry Wu & Aditi Raghunathan, "Self-Trained Verification for Training- and Test-Time Self-Improvement", arXiv 2026'
日期: 2026-05-28
分类: machine-learning
难度: 中级
---

## 是什么

Self-Trained Verification（**STV**）是一种**训练验证器，让它在没有标准答案时也能指出模型推理错误**的方法。日常类比：像老师先让助教拿着答案批改作业，等助教学会常见错法后，再把答案收起来，让助教独立批改。

这里的"验证器"不是只说"对 / 错"的打分器，而是会给生成器一句可执行反馈：哪里错了，下一轮该怎么改。

这篇论文的关键点是：模型自己看一个错误答案时，经常挑不出错；但如果旁边放着参考解，它就更容易比较出差异。STV 把这个"有答案时更会挑错"变成训练信号，再训练一个测试时不用答案的验证器。

## 为什么重要

不理解 STV，下面这些事都很难解释：

- 为什么让大模型"自己检查自己"常常分数越来越自信，但答案准确率没有涨
- 为什么只训练最终答案对错，不等于训练出了会写诊断意见的验证器
- 为什么测试时多跑几轮推理不一定有用，关键在于反馈是否能真的改变下一轮
- 为什么一个较小模型配好验证器，有时能超过更大但不验证的模型

## 核心要点

STV 可以拆成 **三件事**：

1. **先造一个有答案的老师**：同一个模型在批改时额外看到参考解。类比：助教第一次批卷时可以翻标准答案，所以更容易发现学生把哪一步偷换了。

2. **再训练一个没答案的学生验证器**：学生验证器只看题目和候选解，要模仿老师的反馈分布。类比：助教练多了以后，不用每次翻答案，也能识别常见错误模式。

3. **把验证器放回训练和测试循环**：测试时它给生成器反馈，让生成器改答案；训练时还可以把验证器放进 RL 回合里，让生成器学会利用反馈。类比：学生长期收到高质量批注后，第一稿也会写得更好。

论文里这个训练-测试闭环叫两部分：STV 训练验证器，ViL（verifier-in-the-loop）用验证器反过来训练生成器。

## 实践案例

### 案例 1：最小的验证-修改循环

```python
answer = generator(problem)
for _ in range(20):
    verdict, feedback = verifier(problem, answer)
    if verdict == "accept":
        break
    answer = generator(problem, previous=answer, feedback=feedback)
```

**逐部分解释**：

- `generator` 先交一份答案，像学生先写第一稿
- `verifier` 同时输出裁决和反馈，不只是给一个分数
- 如果反馈足够具体，下一轮 `generator` 才知道该改哪一步

### 案例 2：STV 怎么制造训练信号

```python
teacher_feedback = verifier(
    problem=problem,
    candidate=wrong_answer,
    reference=gold_solution,
)
student_feedback = student_verifier(problem, wrong_answer)
loss = distance(student_feedback, teacher_feedback)
```

**逐部分解释**：

- `gold_solution` 只在训练老师时出现，测试时不会给学生验证器
- `wrong_answer` 来自生成器自己的尝试，所以贴近真实测试分布
- `distance` 代表让学生输出更像老师，论文用 on-policy distillation 来减少偏移

### 案例 3：ViL 让生成器也学会用反馈

```python
for problem in train_set:
    answer = generator(problem)
    feedback = frozen_stv_verifier(problem, answer)
    revised = generator(problem, previous=answer, feedback=feedback)
    reward = check_final_answer(revised)
    update(generator, reward)
```

**逐部分解释**：

- `frozen_stv_verifier` 固定不动，像训练场里的教练
- 奖励仍然来自最终答案是否正确，不把验证器意见当成不可质疑的真理
- 论文发现这种训练不只提升带验证器的多轮表现，也提升生成器第一轮裸答能力

## 踩过的坑

1. **把验证器当成普通分类器**：只学对错会缺少"为什么错"的监督，所以生成器下一轮不知道怎么改。

2. **直接用老师样本做 SFT**：学生测试时会生成自己的前缀，一旦偏离老师轨迹，就遇到训练时没见过的状态。

3. **把分数上涨当成能力上涨**：未训练验证器可能越来越愿意接受答案，但接受的答案并不更正确，这是校准失败。

4. **以为更大生成器能替代验证器**：实验里 STV 引导的 8B 模型在硬题上超过没有验证的 32B，说明瓶颈不只是参数量。

## 适用 vs 不适用场景

**适用**：
- 有参考答案或可验证奖励的推理任务，例如数学、科学问答、程序题
- 需要多轮修改的 test-time compute 场景，不想只靠一次采样
- 生成器已经被 RL 训练到平台期，还想继续挖训练收益
- 想用较小验证器给较大生成器提供可执行反馈

**不适用**：
- 没有参考答案、也没有可靠最终判定的开放创作任务
- 反馈不能自然转成下一轮改进动作的任务，例如纯主观审美判断
- 训练预算极低、连生成器 rollout 都收集不了的场景
- 对外部事实要求很强但参考解本身可能过期的任务

## 历史小故事（可跳过）

- **2021 年**：GSM8K verifier 和 outcome reward model 让人看到"验证答案"能帮数学推理。
- **2022 年**：STaR 和 self-consistency 代表两条路线：训练时循环自产数据，测试时多采样再投票。
- **2023 年**：Self-Refine 和 Reflexion 把"模型给自己写反馈"推到前台，但也暴露了自我纠错不稳定。
- **2025-2026 年**：推理模型大量使用 RLVR 和 test-time compute，验证器质量成为新瓶颈。
- **2026 年**：STV 把"看到参考解时的自己"蒸馏成"看不到参考解也会挑错的自己"。

## 学到什么

1. **验证器的核心不是打分，而是可执行诊断**：它要告诉生成器下一步怎么修。
2. **参考答案可以当训练脚手架**：训练时给特权信息，测试时撤掉，这是一种自蒸馏。
3. **on-policy 很关键**：验证器要在自己真实会遇到的输出上学，而不是只背老师样本。
4. **反馈能反哺生成器**：ViL 说明高质量批注会改变生成器的第一稿能力，而不只是帮它改稿。

## 延伸阅读

- 论文 PDF：[Self-Trained Verification](https://arxiv.org/pdf/2605.30290v1.pdf)
- [[self-refine-2023]] —— 早期让模型自写反馈再自改，适合对比 STV 为什么要训练验证器
- [[reflexion]] —— 把文字反馈作为下一次行动记忆，和 ViL 的"从反馈中学习"相邻
- [[self-consistency-2022]] —— 另一种测试时扩展计算量的方法，用多次采样投票而不是逐轮修改
- [[rlhf-christiano]] —— 从人类反馈训练模型的经典路线，STV 则试图少依赖人工反馈
- [[deepseek-r1]] —— RLVR 推理模型背景，能帮助理解论文里的"标准 RL 已经收敛"是什么意思

## 关联

- [[reasoning-with-sampling]] —— STV 和采样扩展都在回答"测试时多花计算量值不值"
- [[self-consistency-2022]] —— self-consistency 靠投票选答案，STV 靠反馈改答案
- [[self-refine-2023]] —— Self-Refine 直接自我反馈，STV 先训练更可靠的反馈者
- [[reflexion]] —— Reflexion 把失败经验写成语言记忆，STV 把诊断反馈纳入训练回路
- [[rlhf-christiano]] —— RLHF 用外部偏好训练模型，STV 用参考解构造验证监督
- [[skill-sd-self-distillation]] —— STV 是一种带特权信息的自蒸馏，把有答案的自己教给没答案的自己
- [[deepseek-r1]] —— 论文里的 RLVR 平台期问题，是推理模型训练的重要背景

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）
