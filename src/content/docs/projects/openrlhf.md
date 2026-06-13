---
title: OpenRLHF - 让大模型学会"自我改进"的强化学习框架
source: https://github.com/OpenRLHF/OpenRLHF
date: 2026-06-13
category: AI/ML
subcategory: 大语言模型
provenance: pipeline-v3
分类: 机器学习
子分类: ML 系统
---

# OpenRLHF - 让大模型学会"自我改进"的强化学习框架

## 什么是 RLHF？

在讲 OpenRLHF 之前，先理解一个概念：**RLHF**（Reinforcement Learning from Human Feedback，人类反馈强化学习）。

想象你在教一个小孩子写作文。一开始他写得乱七八糟，你不会直接告诉他正确答案，而是说"这段不错，但结尾可以再有力一些"。小孩子根据你的反馈，慢慢越写越好。RLHF 就是把这个过程自动化——让大语言模型（LLM）通过"奖励信号"自我改进。

整个过程分三步：

1. **SFT（监督微调）**：先给模型看一些"标准答案"，让它学会基本格式。
2. **训练奖励模型**：教模型判断"好回答"和"差回答"的区别。
3. **强化学习优化**：模型不断生成回答，根据奖励分数调整自己的策略，越变越好。

OpenRLHF 就是做了第 2 和第 3 步的**基础设施**——它帮你把这套流程高效地跑起来。

## OpenRLHF 是什么

OpenRLHF 是一个开源的、高性能的 RLHF 框架。它的核心卖点是：

- **高性能**：基于 Ray + vLLM 分布式架构，能跑 70B+ 参数的大模型
- **算法全面**：支持 PPO、REINFORCE++、GRPO、RLOO 等多种 RL 算法
- **Agent 驱动设计**：统一了单轮和多轮交互的执行方式
- **易用**：直接对接 HuggingFace 模型，开箱即用

GitHub 星标超过 9.6k，被 Google、字节跳动、腾讯、阿里等公司使用。

## 核心架构：三个模型一起跳舞

RLHF 的训练过程中，其实有**四个模型**在同时工作。你可以把它们想象成一个"教练团队"：

| 角色 | 模型 | 职责 |
|------|------|------|
| **Actor（演员）** | 正在学习的 LLM | 负责生成回答 |
| **Reward（裁判）** | 奖励模型 | 给回答打分 |
| **Reference（参考）** | 原始模型的副本 | 防止演员"跑偏"太远 |
| **Critic（评论家）** | 评论模型 | 评估当前策略的好坏 |

OpenRLHF 的创新在于：它用 **Ray** 做调度器，把这四个模型分配到不同的 GPU 上并行运行；用 **vLLM** 加速 Actor 的文本生成（RLHF 训练中 80% 的时间花在生成上）；用 **DeepSpeed** 做显存优化，让大模型能在有限硬件上训练。

## 支持的 RL 算法

OpenRLHF 内置了多种先进的 RL 算法，选择哪一个取决于你的场景：

| 算法 | 特点 | 适用场景 |
|------|------|----------|
| **PPO**（默认） | 最成熟稳定，有完整的 Critic 模型 | 通用场景，追求稳定性 |
| **REINFORCE++** | 不需要 Critic，省显存 | 显存受限，想要高效训练 |
| **REINFORCE++-baseline** | 用平均奖励作为基准 | 推理类任务（RLVR），对奖励尺度鲁棒 |
| **GRPO** | 组归一化，批量训练 | 批量场景 |
| **RLOO** | 逐 token 的 KL 惩罚 | 多样本训练 |

对于初学者，建议从 PPO 开始理解，因为它是 RLHF 领域的"经典款"。

## 两种执行模式

OpenRLHF 采用了统一的 Agent 执行范式：

**单轮模式（Single-Turn）**：每个提示词只生成一次回答。这是 99% 场景的默认选择，简单直接。

**多轮模式（Multi-Turn）**：模型可以和"环境"多轮对话，比如一步步推理、接收反馈再继续。适合复杂的推理任务。

## 代码示例 1：自定义奖励函数

这是 OpenRLHF 最实用的功能之一——你可以不用训练奖励模型，直接写一个 Python 函数来计算奖励：

```python
# reward_func.py
import torch

def reward_func(queries, prompts, labels):
    """
    为生成的回答计算自定义奖励。
    
    Args:
        queries: 完整文本列表（提示词 + 回答）
        prompts: 原始提示词列表
        labels: 参考答案（来自数据集）
    
    Returns:
        包含 rewards、scores 和日志的字典
    """
    batch_size = len(queries)
    
    # 示例：检查回答中是否包含关键词"因此"（逻辑连接词）
    has_logic = sum(1 for q in queries if "因此" in q or "所以" in q)
    reward = torch.full((batch_size,), 0.0)
    reward[:has_logic] = 1.0  # 包含逻辑词的得 1 分
    
    return {
        "rewards": reward,           # 用于 RL 的优势计算
        "scores": reward,            # 用于动态过滤（0-1 范围）
        "extra_logs": {
            "logic_ratio": has_logic / batch_size,
        },
    }
```

然后训练时通过 `--reward.remote_url` 指定这个函数即可，OpenRLHF 会自动调用它来计算每个回答的奖励分数。

## 代码示例 2：启动 PPO 训练

下面是启动一个完整的 PPO 训练流程的命令：

```bash
# 第一步：启动 Ray 集群（分配 8 张 GPU）
ray start --head --node-ip-address 0.0.0.0 --num-gpus 8

# 第二步：提交 PPO 训练任务
ray job submit --address="http://127.0.0.1:8265" \
   --runtime-env-json='{"working_dir": "/openrlhf"}' \
   -- python3 -m openrlhf.cli.train_ppo_ray \
   --ref.num_nodes 1 \
   --ref.num_gpus_per_node 8 \
   --reward.num_nodes 1 \
   --reward.num_gpus_per_node 8 \
   --critic.num_nodes 1 \
   --critic.num_gpus_per_node 8 \
   --actor.num_nodes 1 \
   --actor.num_gpus_per_node 8 \
   --vllm.num_engines 4 \
   --vllm.tensor_parallel_size 2 \
   --actor.model_name_or_path OpenRLHF/Llama-3-8b-sft-mixture \
   --reward.model_name_or_path OpenRLHF/Llama-3-8b-rm-700k \
   --ckpt.output_dir ./checkpoint/llama3-8b-rlhf \
   --train.batch_size 128 \
   --rollout.batch_size 1024 \
   --prompt_max_len 1024 \
   --generate_max_len 1024 \
   --ds.zero_stage 3 \
   --actor.adam.lr 5e-7 \
   --critic.adam.lr 9e-6 \
   --data.prompt_dataset OpenRLHF/prompt-collection-v0.1 \
   --data.apply_chat_template \
   --actor.gradient_checkpointing_enable \
   --ds.packing_samples
```

关键参数说明：

- `--actor.model_name_or_path`：正在训练的演员模型（可以是 HuggingFace 上的任意模型）
- `--reward.model_name_or_path`：奖励模型的路径
- `--vllm.num_engines`：启动几个 vLLM 推理引擎（越多生成越快）
- `--train.batch_size`：训练批次大小
- `--rollout.batch_size`：每次生成的样本数
- `--ds.zero_stage 3`：DeepSpeed ZeRO-3 显存优化级别

如果你不想用预训练的奖励模型，可以把 `--reward.model_name_or_path` 替换为 `--reward.remote_url /path/to/reward_func.py`，用自定义奖励函数。

## 为什么值得学

1. **RLHF 是主流**：几乎所有顶级 LLM（GPT、Claude、Gemini）都用到了 RLHF 或其变体来对齐人类价值观。理解 OpenRLHF = 理解工业界怎么做模型对齐。
2. **性能导向**：它不是学术玩具，而是真正在生产环境跑的框架，性能优化做得非常细。
3. **算法前沿**：从 PPO 到 REINFORCE++，OpenRLHF 紧跟学术界最新进展，是了解 RL 对齐领域的好窗口。
4. **Agent 范式**：它的 Agent-based 设计思路可以推广到更广泛的场景，不只是 RLHF。

## 进一步学习

- 官方文档：https://openrlhf.readthedocs.io/
- 技术报告：https://www.researchgate.net/publication/393414548
- CMU 课程教学案例：CMU Advanced NLP Spring 2025 使用 OpenRLHF 作为 RLHF 教学框架
- REINFORCE++ 论文：https://www.researchgate.net/publication/387487679
