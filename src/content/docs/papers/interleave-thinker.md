---
title: InterleaveThinker: Reinforcing Agentic Interleaved Generation
来源: https://arxiv.org/abs/2606.13679
日期: 2026-06-13
分类: 机器学习
子分类: 智能体
provenance: pipeline-v3
---

# InterleaveThinker: Reinforcing Agentic Interleaved Generation

## 1 一句话总结

这篇文章提出了一套"多智能体流水线"，让原本只能画单张图片的 AI 图像生成器，拥有了连续生成"文字+图片"交替序列的能力。

## 2 日常类比：拍一部四格漫画

想象你要让一位画家按你的要求画一部四格漫画：

- **传统做法**（现有模型）：你告诉画家"画第一格"，他画完。然后你指着第一格说"接着画第二格"，画家看着第一格画第二格，再看第二格画第三格……问题是：画家常被前面已经画好的格子"带偏"，画到第三格时可能突然觉得"嗯，这跟结局很像"就提前收尾了。而且一旦第二格画歪了，第三格、第四格会越画越歪——这就是论文说的"视觉过度依赖"和"逐步误差累积"。

- **InterleaveThinker 的做法**：你请来三个人协作。
  1. **规划师（Planner）**：先不看画布，一次性把所有格子的画法写在纸上（全局计划）。
  2. **画家（Generator）**：按照纸上写的步骤，一格一格地画。
  3. **质检员（Critic）**：每画完一格就看一眼——"这格跟规划师写的步骤对得上吗？"如果不对，就修改画法的描述，让画家重画这一格，直到合格为止。

关键区别：规划师在开始时就把所有步骤想好了，画家画图时看不到中间结果，所以不会被前面的格子带偏。质检员负责在每个步骤上把关。

## 3 核心概念拆解

### 3.1 什么是"交错生成"（Interleaved Generation）

传统图像生成模型只接受一段文字，输出一张图片。而"交错生成"指的是输入和输出都是**文字和图片交替排列的序列**，比如：

```
[文字: "一只猫坐在窗台上"]
[图片: 猫的图像]
[文字: "然后月亮升起来了"]
[图片: 月亮升起后的场景]
[文字: "最后星星出现了"]
[图片: 星空下的猫]
```

这种能力对于制作视觉叙事（故事漫画）、操作指导（一步步的教学图解）、机器人操控（每一步的动作可视化）都非常重要。

### 3.2 为什么现有模型做不到？

有两种主流方法尝试解决这个问题，都有缺陷：

**方法一：直接训练端到端的多模态模型（UMM）**

像 Janus-Pro、Emu3.5 这样的模型，天生就能生成文字+图片交替序列。但它们在生成长序列时会遇到两个问题：

- **视觉过度依赖**：模型太依赖前面已经生成的图片，容易在中间状态就"误以为"已经完成了目标，提前结束。
- **逐步误差累积**：第一步稍微画歪了一点，第二步就会跟着歪，第三步更歪，最后完全失控。

**方法二：让同一个 VLM 既规划又评估**

如果用一个模型同时做规划和评估，它会因为不断看到中间生成的图片而"短视"——只顾眼前的局部反馈，忘了最终目标。

### 3.3 InterleaveThinker 的解决方案：三人协作

论文的核心创新就是把"规划"和"评估"拆给两个不同的模型来做：

```
输入: 用户的文字/图片描述
         │
         ▼
   ┌───────────┐
   │  Planner   │  ← 一次性生成所有步骤的计划（不看中间图片）
   └─────┬─────┘
         │ 输出: [(步骤1指令, 步骤1提示词, 辅助文本), ...]
         │
         ▼
   ┌───────────┐
   │ Generator  │  ← 用现有的图像生成模型（如 FLUX.2-klein）
   └─────┬─────┘
         │ 输出: 当前步骤的图片
         │
         ▼
   ┌───────────┐
   │   Critic   │  ← 对比图片和计划，判断是否合格
   └─────┬─────┘
         │ 不合格? → 修改提示词 → 回到 Generator 重画
         │ 合格?  → 进入下一步
         ▼
   输出: 完整的文字+图片交替序列
```

## 4 代码示例

### 示例一：整个流程的工作伪代码

```python
# 用户输入: "画一个苹果从红变绿的过程"
input_sequence = "画一个苹果从红变绿的过程"

# === 第 1 步: Planner 生成全局计划 ===
# Planner 一次性输出所有步骤，不看任何图片
plan = planner(input_sequence)
# plan 的输出类似:
# [
#   {"instruction": "画一个红色的苹果",
#    "prompt": "a fresh red apple on a wooden table, realistic style",
#    "auxiliary": "apple should be bright red with a small stem"},
#   {"instruction": "苹果开始变黄",
#    "prompt": "the same apple now showing yellow patches, transition phase",
#    "auxiliary": "yellow should appear as gradual color shift"},
#   {"instruction": "苹果完全变成绿色",
#    "prompt": "a fresh green apple on a wooden table, realistic style",
#    "auxiliary": "green apple should look ripe and shiny"}
# ]

# === 第 2~3 步: Generator + Critic 循环执行每个步骤 ===
output_sequence = []
for step in plan:
    refined_prompt = step["prompt"]  # 初始提示词
    for _ in range(max_iterations=5):
        # Generator 根据提示词生成图片
        image = generator(refined_prompt, previous_image)

        # Critic 评估这张图片是否符合当前步骤的要求
        judgment, refined_prompt, reasoning = critic(
            previous_image,   # 上一张图
            image,             # 刚生成的图
            step["prompt"],    # 原始计划中的提示词
            refined_prompt     # 当前使用的提示词
        )

        if judgment == True:
            # 质检通过，记录结果并进入下一步
            output_sequence.append({
                "text": step["instruction"],
                "image": image,
                "auxiliary": step["auxiliary"]
            })
            break  # 跳出重试循环，进入下一步
        else:
            # 质检不通过，用 Critic 给出的新提示词重试
            pass  # refined_prompt 已经被更新了

# === 最终输出 ===
# 得到完整的交错序列:
# [文字, 图片, 文字, 图片, 文字, 图片]
```

### 示例二：Critic 的奖励函数（GRPO 强化学习）

Critic 模型通过强化学习来改进自己的"质检能力"。论文提出了一个巧妙的**双奖励机制**，而不是对整个长序列做优化（那样计算量太大，一个序列可能需要 25 次以上调用图像生成器）。

```python
# 假设 Critic 在第 i 步的第 t 次迭代中做出了判断
def compute_reward(previous_image, current_image, next_image,
                   original_prompt, refined_prompt):
    """
    计算 Critic 在这一轮迭代中的综合奖励。
    只优化单步，不优化整个长序列 —— 这是论文的关键设计。
    """

    # --- 奖励 1: 准确性奖励 (Accuracy Reward) ---
    # 衡量 Critic 的判断是否正确
    predicted_judgment = critic.predict(previous_image, current_image,
                                        original_prompt, refined_prompt)
    ground_truth_judgment = get_ground_truth(previous_image, current_image)
    accuracy_reward = -abs(predicted_judgment - ground_truth_judgment)
    # 判断越准确，负值越小（奖励越大）

    # --- 奖励 2: 步骤奖励 (Step-wise Reward) ---
    # 衡量 Critic 修改提示词后，图片质量是否有提升
    # 用 Gemini 2.5 Pro 作为评分器来打分
    original_score = gemini_score(previous_image, current_image,
                                  original_prompt, refined_prompt)
    improved_score = gemini_score(previous_image, next_image,
                                  original_prompt, next_refined_prompt)
    step_reward = improved_score - original_score
    # 分数提升了，step_reward 就是正的

    # --- 综合奖励 ---
    alpha = 0.2  # 准确性奖励的权重
    format_reward = 1.0 if critic_output_format_correct else 0.0

    total_reward = (
        0.5 * format_reward
        + 0.5 * (alpha * accuracy_reward + (1 - alpha) * step_reward)
    )
    return total_reward
```

为什么要这样设计？

- 一个完整的交错生成序列可能需要 25 次以上的图像生成调用
- 如果用传统的强化学习优化整个序列，计算成本极高且不稳定
- 把问题拆解成"单步优化"，每一步的奖励独立计算，大大降低了难度
- 因为 Planner 已经把全局计划定好了，只要每一步都做好，整个序列自然就好

## 5 训练数据是怎么来的？

论文构建了三个专用数据集：

| 数据集 | 规模 | 用途 |
|--------|------|------|
| Interleave-Planner-SFT-80k | 8 万条 | 训练 Planner 学会分解任务 |
| Interleave-Critic-SFT-112k | 11.2 万条 | 训练 Critic 学会评估和修改提示词 |
| Interleave-Critic-RL-13k | 1.3 万条 | 用强化学习进一步训练 Critic |

构建流程大致是：先用 Gemini 2.5 Pro 和 Nano Banana Pro 生成高质量的多智能体交互轨迹，然后用严格的过滤流程筛选出高质量样本。

## 6 实验结果亮点

- 在 UEval 基准测试上，InterleaveThinker + FLUX.2-klein 达到了 **66.3 分**，超过了所有开源多模态模型，接近闭源的 Nano Banana（76.1 分）。
- 更令人意外的是，这个方法还大幅提升了基础模型的**推理能力**：
  - WISE 基准：从 0.47 提升到 **0.73**
  - RISE 基准：从 13.3 提升到 **28.9**
- 这套框架是**模型无关**的——换用更强的图像生成器（如 Qwen-Image-Edit），效果还会进一步提升。

## 7 关键设计决策：为什么只给 Critic 做强化学习？

这是一个值得思考的设计选择：

- **Planner 不做 RL**：因为一个序列可能涉及 25 次以上的图像生成调用，奖励信号太稀疏，RL 极不稳定。而且 SFT 阶段的效果已经足够好。
- **Critic 做 RL**：因为 Critic 的每次判断都是"局部"的（只看一步），奖励信号密集且明确，适合用 GRPO 做单步强化学习。

这体现了论文的一个核心理念：**把复杂问题拆解成可以独立优化的局部问题**。

## 8 我的理解

InterleaveThinker 最打动我的一点是：它没有试图去训练一个更大的模型来解决这个问题，而是用了一种"工程化"的思路——把一个大问题拆成三个角色，各司其职。规划师负责"想清楚"，画家负责"画出来"，质检员负责"把关"。这种思路在很多 AI 场景中可能都有借鉴价值。

另外，双奖励机制的设计也很巧妙——与其费力优化一个长长的序列，不如确保每一步都走对。这让我想到了一句老话："千里之行，始于足下"。
