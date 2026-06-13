---
title: InstructGPT — 用人类反馈训练会"听话"的 AI
来源: https://arxiv.org/abs/2203.02155
日期: 2026-06-13
分类: 机器学习
子分类: nlp
provenance: pipeline-v3
---

# InstructGPT: 用人类反馈训练会"听话"的 AI

## 一、为什么要读这篇论文

GPT-3 有 1750 亿个参数，是当时最大的语言模型。但它有一个根本问题：**它不知道你要什么**。

你让它"写一首关于月亮的诗"，它会续写"月亮在天空中照耀"；你让它"总结一下这篇文章"，它会继续写更多内容而不是总结。

它像一个读过全人类互联网文字的超级天才，但**不懂指令、不会听话**。

InstructGPT 就是来解决这个问题的——让 GPT-3 **学会听懂人话**。

## 二、一个日常类比：训练实习生

想象你带了一个实习生，他读过公司所有文档（相当于预训练），但不会干活。

**InstructGPT 的训练分成三步：**

1. **第一步——示范教学（SFT）**：你亲自做一遍给他看。"你看，用户说'总结这篇文章'，你要这样回答……" 实习生看着示范学。这叫 **Supervised Fine-Tuning，监督微调**。

2. **第二步——打分排序（训练 Reward Model）**：你给实习生两个答案，问他"哪个更好？" 反复这样，你得到一个"裁判"（Reward Model），它知道什么答案好、什么答案差。

3. **第三步——奖励机制（RLHF）**：实习生自己出题回答，裁判打分。答得好有"奖励"，答不好被"惩罚"。实习生慢慢学会什么样的回答能让裁判满意。这叫 **RLHF（Reinforcement Learning from Human Feedback，人类反馈强化学习）**。

三步走完，实习生从"读过很多书但不会干活"变成了"听得懂指令、答得让人满意"。

## 三、核心概念

### 3.1 为什么"变大"不等于"变好"

论文开头的关键洞察：**增大模型参数规模并不能让模型更好地遵循用户意图**。GPT-3 输出不真实、有毒性、不 helpful。这不是模型不够大，而是**训练目标不对**——它学的是"预测下一个词"，不是"帮助人类"。

### 3.2 三步训练法

| 步骤 | 方法 | 数据 | 目标 |
|------|------|------|------|
| 1. SFT | 监督微调 | 人工标注的"指令→期望回答"配对 | 让模型学会遵循指令 |
| 2. 训练 Reward Model | 排序学习 | 人类对多个输出排序 | 让模型学会什么是"好回答" |
| 3. RLHF | PPO 强化学习 | Reward Model 给出奖励信号 | 让模型最大化奖励 |

### 3.3 PPO（近端策略优化）

PPO 是强化学习的一种算法，InstructGPT 用它来让模型在 Reward Model 的"裁判"下不断升级。简单理解：

- 模型是当前策略（Policy），它每次生成一个回答
- Reward Model 打分
- PPO 根据分数调整模型的参数，让高分回答更容易出现

## 四、代码示例

### 4.1 SFT 阶段：监督微调

第一步，我们用人工写的示范数据来微调 GPT-3。

```python
# 假设我们有人工标注的指令-回答对
instruction_data = [
    {
        "instruction": "请总结下面这段话",
        "input": "气候变化是指...（长文本）",
        "output": "这段话主要讨论了气候变化的主要原因..."
    },
    {
        "instruction": "将这段英文翻译成中文",
        "input": "The quick brown fox jumps over the lazy dog.",
        "output": "那只敏捷的棕色狐狸跳过了懒狗。"
    },
]

# SFT 的目标：最小化以下损失函数
# L_SFT = - E[(x,y)~D_SFT} [log π_θ(y|x)]
# 其中 π_θ(y|x) 是模型生成回答 y 的概率
# 训练目标：让模型在人类示范的指令-回答对上概率最大化

# 伪代码：
for data in instruction_data:
    prompt = f"### 指令:\n{data['instruction']}\n\n### 输入:\n{data['input']}\n\n### 回答:\n"
    target = data['output']
    loss = -model.log_prob(target, prompt)  # 让目标回答的概率最大化
    loss.backward()
    optimizer.step()
```

SFT 之后，模型已经**初步学会遵循指令格式**了，但还分不清"好回答"和"一般回答"。

### 4.2 RLHF 阶段：人类反馈强化学习

第二步，训练 Reward Model（裁判），然后让它给模型打分。

```python
# 第二步a: 训练 Reward Model
# 人类对同一指令的两个输出进行排序: A 比 B 好
ranking_data = [
    {
        "prompt": "请帮我写一封辞职信",
        "chosen": "尊敬的经理，我决定辞职...",   # 人类选了 A
        "rejected": "好吧，我辞职了。",          # 人类选了 B
    },
]

# Reward Model 的目标：chosen 的奖励 > rejected 的奖励
# 损失函数：
# L_RM = -log σ(r_φ(x, y_chosen) - r_φ(x, y_rejected))
# 其中 σ 是 sigmoid 函数，r_φ 是 Reward Model

for data in ranking_data:
    reward_chosen = reward_model(data['prompt'], data['chosen'])
    reward_rejected = reward_model(data['prompt'], data['rejected'])
    loss = -torch.log(torch.sigmoid(reward_chosen - reward_rejected))
    loss.backward()
    rm_optimizer.step()

# 第二步b: 用训练好的 Reward Model 做 PPO 强化学习
# PPO 的目标：最大化奖励，同时不让模型偏离太远
# 目标函数：
# L_PPO = E[L_CLIP - c1 * KL(π_θ || π_ref) + c2 * KL_target]
# 约束：不要偏离 SFT 模型太远，避免"灾难性遗忘"

prompt = "请帮我写一封辞职信"
response = model.generate(prompt, max_length=512)
reward = reward_model(prompt, response)

# 如果 reward 高 → 增加这个回答的概率
# 如果 reward 低 → 降低这个回答的概率
# 同时用 KL 散度约束不让模型"跑偏"
```

### 4.3 完整流程示意

```
原始 GPT-3 (175B)
      │
      ▼
  [SFT 监督微调]  ← 人工示范数据
      │
      ▼
  SFT 模型
      │
      ▼
  [收集人类排序数据]  ← 同一 prompt 多个回答，让人打分
      │
      ▼
  [训练 Reward Model]  ← 学会预测人类偏好
      │
      ▼
  [PPO 强化学习]  ← Reward Model 给奖励，模型优化
      │
      ▼
  InstructGPT (1.3B)  ← 100 倍小，但人类评价优于 GPT-3 (175B)
```

## 五、关键实验发现

### 5.1 小模型赢了大模型

最令人震惊的结果：**1.3B 参数的 InstructGPT 在人类评价中击败了 175B 参数的 GPT-3**。参数少 100 倍，表现更好。这证明"听话"的能力不是靠堆参数获得的。

### 5.2 更安全了

InstructGPT 在 TruthfulQA（测虚假信息）和 RealToxicityPrompts（测毒性）上都表现更好——**更少说谎、更少有毒内容**。

### 5.3 "对齐税"（Alignment Tax）

一个代价：模型在某些学术 NLP 任务上性能轻微下降，称为"对齐税"。论文用一个简单技巧缓解：**在 RL 训练时混入少量原始预训练数据**，让模型不忘基础能力。

## 六、为什么这篇论文重要

1. **开创了 RLHF 范式**：从此所有主流大模型（ChatGPT、Claude、Gemini）都沿用这套"人类反馈→强化学习"路线
2. **证明了人类反馈的力量**：不需要更多数据、更大模型，**更好的信号**就能让模型质变
3. **对齐研究的里程碑**：让 AI 从"会预测词"变成"能帮人"，是 ChatGPT 诞生的前奏

## 七、反思与开放问题

论文本身也坦诚了很多不足：

- InstructGPT 仍然会说谎、生成有害内容
- **学会"听话"也意味着可能被恶意利用**——让人"生成有害内容"它也可能会照做
- 训练数据主要来自英语用户，存在文化偏差
- "人类偏好"本身不是绝对标准——不同人、不同群体对"好回答"的定义不同

这些开放问题正是后续 RLAIF（AI 反馈强化学习）、Constitutional AI 等工作继续探索的方向。

## 八、一句话总结

> InstructGPT 证明了：**让 AI 听懂人话，不靠堆参数，靠的是人类的反馈**。三步——示范教学、裁判打分、奖励升级——就把一个"读过万卷书但不会干活"的模型变成了"听得懂指令、答得让人满意"的 AI。
