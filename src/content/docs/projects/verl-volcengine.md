---
title: "verl: Volcano Engine RL for LLMs"
来源: https://github.com/volcengine/verl
日期: 2026-06-13
分类: 机器学习
子分类: ML 系统
provenance: pipeline-v3
---

# verl: Volcano Engine RL for LLMs

## 日常类比：教小孩做数学题

想象你在教一个小孩做数学题。小孩一开始什么也不会，随便猜答案。每答完一题，你告诉他"对"或"错"，还可能给出分数。小孩听到高分答案多猜，低分答案少猜，慢慢就越答越对了。

这个"试错 → 得到反馈 → 调整策略 → 再试"的过程，就是**强化学习（Reinforcement Learning, RL）**的核心。

而 **verl**（Volcano Engine Reinforcement Learning for LLMs）就是一个专门用来对大语言模型做这种"奖励驱动训练"的工具库。它能让 GPT 级别的模型通过强化学习变得更强——比如更会做数学题、更会写代码。

## 它是什么

verl 是一个灵活、高效、可用于生产的**大模型强化学习训练框架**。它原本是字节跳动 Seed 团队的内部框架 HybridFlow，后来开源了。

简单说：你有一个预训练好的大模型（比如 Qwen、Llama），verl 帮你对它做 RLHF（Reinforcement Learning from Human Feedback），让模型在特定任务上表现更好。

## 核心概念

### 1. Actor（执行者）

Actor 就是那个"正在学习的大模型"。它负责尝试生成答案，然后根据反馈调整自己的生成策略。

### 2. Critic（批评者）

Critic 是一个独立的模型，它的任务是给 Actor 的回答打分。它不是只看"对或错"，而是从多个维度（比如流畅度、逻辑性）来评估。

### 3. Reference Model（参考模型）

Reference 是 Actor 训练前的"原始版本"。它的作用是防止 Actor"跑偏"——训练过程中如果 Actor 偏离原始模型太远，Reference 就把它拉回来。

### 4. Rollout（ rollout = 实际跑一遍）

Rollout 是让 Actor 面对新的题目，生成答案的过程。生成的答案会被送去评估，拿到分数后，Actor 再根据分数调整自己。

### 5. HybridEngine（混合引擎）

这是 verl 最核心的技术创新。传统方法中，模型在"训练"和"生成"之间切换时要反复搬运数据，非常慢。HybridEngine 让这两个阶段共享 GPU 内存，大幅减少了切换开销。

类比：传统方法像是厨师炒菜——每炒一道菜就要洗一次锅；HybridEngine 像是厨房流水线——锅不用洗，连续炒，效率翻倍。

## 支持的 RL 算法

verl 支持多种 RL 算法，常见的有：

- **PPO**（Proximal Policy Optimization）：最经典的 RLHF 算法，稳定但计算量大
- **GRPO**（Group Relative Policy Optimization）：DeepSeek 提出的简化版 PPO，不需要 Critic 模型，更快更省显存
- **DAPO**：SOTA 算法，在数学推理上表现优异
- **ReMax**、**REINFORCE++**、**RLOO** 等

## 代码示例

### 示例 1：用命令行运行 GRPO 训练

verl 的设计哲学是"配置驱动"。你看下面的 shell 脚本，不需要写 Python 代码就能启动训练：

```bash
# GRPO | Qwen3-4B | FSDP 分布式训练 | NVIDIA GPU

# 基本参数
MODEL_PATH=Qwen/Qwen3-4B
TRAIN_FILE=/home/data/gsm8k/train.parquet
TRAIN_BATCH_SIZE=512          # 每个批次 512 道题
ROLLOUT_N=5                   # 每道题让模型生成 5 个答案
TOTAL_EPOCHS=15               # 训练 15 轮

python3 -m verl.trainer.main_ppo \
    data.train_files=${TRAIN_FILE} \
    data.train_batch_size=${TRAIN_BATCH_SIZE} \
    data.max_prompt_length=1024 \
    data.max_response_length=1024 \
    \
    actor_rollout_ref.model.path=${MODEL_PATH} \
    actor_rollout_ref.model.enable_gradient_checkpointing=True \
    \
    algorithm.adv_estimator=grpo \
    algorithm.use_kl_in_reward=False \
    \
    actor_rollout_ref.actor.optim.lr=1e-6 \
    actor_rollout_ref.actor.ppo_mini_batch_size=256 \
    actor_rollout_ref.actor.ppo_micro_batch_size_per_gpu=2 \
    actor_rollout_ref.actor.use_kl_loss=True \
    actor_rollout_ref.actor.kl_loss_coef=0.001 \
    \
    actor_rollout_ref.rollout.name=vllm \
    actor_rollout_ref.rollout.tensor_model_parallel_size=2 \
    actor_rollout_ref.rollout.gpu_memory_utilization=0.6 \
    actor_rollout_ref.rollout.n=5 \
    \
    trainer.n_gpus_per_node=8 \
    trainer.total_epochs=${TOTAL_EPOCHS} \
    trainer.logger='["console","wandb"]'
```

这段命令做的事情：
1. 加载 Qwen3-4B 模型
2. 从 gsm8k（小学数学题数据集）读取训练数据
3. 用 GRPO 算法，每个题目生成 5 个答案，选最好的那个来更新模型
4. 用 vLLM 做高速推理，用 FSDP 做分布式训练
5. 训练 15 轮，每轮 512 道题

### 示例 2：定义自定义奖励函数

verl 让你自己写"评分标准"。比如你要训练模型写代码，你可以这样定义奖励：

```python
from typing import List, Dict
import re

def custom_reward_fn(
    prompts: List[str],
    completions: List[str],
    responses: List[str],
    **kwargs
) -> List[float]:
    """
    自定义奖励函数：给模型生成的代码打分。
    分数 = 格式正确 + 10 + 有注释 + 5 + 通过了测试 + 20
    """
    rewards = []

    for prompt, completion in zip(prompts, completions):
        score = 0.0

        # 检查格式：是否包含 code block
        if re.search(r"```.*?\n.*?```", completion, re.DOTALL):
            score += 10.0

        # 检查是否有中文注释
        if re.search(r"#[^\n]*[一二三四五六七八九十]", completion):
            score += 5.0

        # 代码长度惩罚：太短可能没写完，太长可能啰嗦
        code_length = len(completion.split())
        if 50 <= code_length <= 500:
            score += 5.0
        elif code_length < 50:
            score -= 3.0

        rewards.append(score)

    return rewards
```

这个奖励函数让模型学会：写代码要包在 code block 里、加注释、别太短别太长。

## 为什么 verl 快

verl 的核心速度优势来自几项技术：

| 技术 | 解决的问题 |
|------|-----------|
| **3D-HybridEngine** | 训练/生成切换时不用搬数据，省时间 |
| **FSDP / FSDP2 后端** | 把模型切到多张卡上训练，显存够用 |
| **vLLM / SGLang 推理** | 用业界最快的推理引擎做 rollout |
| **Megatron-LM 支持** | 训练千亿级模型也能跑 |
| **LoRA RL** | 只训练小参数适配器，省 80% 显存 |

实际数据：verl 能在 64 张 H800 上训练 671B 参数的大模型（比如 DeepSeek-V3），这在业界是非常少见的。

## 实际产出

用 verl 训练出来的模型已经有很多成果：

- **豆包 Doubao 1.5 Pro**：数学推理达到 OpenAI O1 级别（AIME 2024 得分 70.0）
- **Seed-Thinking v1.5**：AIME 2024 得分 86.7
- **DAPO-32B**：超越 DeepSeek-GRPO，AIME 2024 得分 50
- **Mind Lab**：在 10 张 GPU 上训练万亿参数推理模型的 GRPO-LoRA

## 下一步学习建议

1. 先读官方教程：https://verl.readthedocs.io/en/latest/start/quickstart.html
2. 跑通 GSM8K 数学题 GRPO 训练（入门最简单）
3. 尝试写自己的奖励函数（进阶）
4. 读 HybridFlow 论文：https://arxiv.org/abs/2409.19256

## 参考资料

- GitHub: https://github.com/volcengine/verl
- 论文: HybridFlow: A Flexible and Efficient RLHF Framework (EuroSys 2025)
- 官方文档: https://verl.readthedocs.io/
- 算法仓库: https://github.com/verl-project/verl-recipe
