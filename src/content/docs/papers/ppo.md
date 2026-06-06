---
title: PPO — Proximal Policy Optimization
来源: 'Schulman et al., "Proximal Policy Optimization Algorithms", OpenAI 2017'
日期: 2026-05-29
子分类: 强化学习
分类: 机器学习
难度: 中级
provenance: pipeline-v3
---

## 是什么

PPO（**Proximal Policy Optimization**，近端策略优化）是 OpenAI 在 2017 年提出的强化学习算法。它的核心做法是**给每一步策略更新加一个"幅度上限"**——你想往新方向走可以，但一次最多走 ±20%，再多就不让走。

日常类比：以前的 RL 像激进股民——看到行情好就一把梭哈，一次错判就亏光本金回不来；PPO 像稳健投资人——每次最多调 10% 仓位，错了能回头，对了下次再加。

代码上看，"幅度上限"基本就是一行：

```python
ratio = torch.exp(new_log_prob - old_log_prob)
clipped = torch.clamp(ratio, 1 - eps, 1 + eps)
loss = -torch.min(ratio * advantage, clipped * advantage).mean()
```

ε 默认取 0.2，意思是"新策略选某个动作的概率不能比旧策略大 1.2 倍或小 0.8 倍"。

## 为什么重要

不理解 PPO，下面这些事都解释不通：

- 为什么 [[instructgpt]] / ChatGPT / Claude 训练流水线**最后一步必是 PPO**——它是 RLHF 的引擎
- 为什么 OpenAI Five 能在 Dota 2 击败职业战队——核心算法就是 PPO，128000 CPU 跑了 10 个月
- 为什么主流 RL 库（Stable Baselines 3 / Ray RLlib / CleanRL）都把 PPO 设为默认
- 为什么 2017 年的简单 trick 至今是工业 RL 的天花板，连 [[deepmind]] 系的 IMPALA / R2D2 都得拿它当 baseline 比对

PPO 的成功证明了一件事：**简单稳定的工程方案常常打败优雅复杂的理论方案**。它的前身 TRPO 用二阶优化（Hessian、共轭梯度）数学上更优雅，但代码 1000+ 行调试地狱；PPO 用一行 clip 达到 90% 效果，代码 200 行。

## 核心要点

PPO 训练一轮可以拆成 **三步**：

1. **采样（rollout）**：用当前策略 π_θ 在环境里跑 T 步，记下每一步的 `(state, action, reward)`。类比：让股民先用当前策略炒一周，把每笔交易和盈亏记下来。

2. **算优势（advantage）**：每个动作"比平均水平好多少"叫优势 A。PPO 用 GAE（Generalized Advantage Estimation）把短期 TD error 和长期 Monte Carlo 综合起来，λ=0.95 是经验甜区。类比：算每笔交易的"超额收益"——比大盘多赚多少。

3. **多轮裁剪更新（clipped update）**：同一批数据反复训 K 轮（通常 10），每轮用 clipped objective 更新策略。如果一个动作 advantage 为正、且新策略已经把它的概率提高到 1.2 倍以上，梯度就被砍成 0，再也不让你继续提。

三步合起来叫 **PPO-Clip**。还有一个变体 **PPO-Penalty** 用 KL 散度惩罚替代 clip，但工业界 99% 用 Clip 版（一行代码 vs 一段 adaptive β）。

## 实践案例

### 案例 1：CartPole（自己能跑起来的版本）

CartPole 是一根杆子立在小车上，目标是不让它倒。状态 4 维（位置、速度、角度、角速度），动作 2 个（左推、右推）。用 CleanRL 单文件 PPO 实现，一个 GPU 训练几分钟，模型就能学会平衡。

```python
for iteration in range(total_iterations):
    obs, actions, rewards, log_probs = rollout(env, policy, T=2048)
    advantages = compute_gae(rewards, values, gamma=0.99, lam=0.95)
    for _ in range(10):  # K=10 epochs
        for batch in mini_batches(obs, actions, batch_size=64):
            loss = ppo_clip_loss(policy, batch, eps=0.2)
            optimizer.step()
```

### 案例 2：[[instructgpt]] / ChatGPT 的 RLHF

InstructGPT 论文（OpenAI 2022）公开了 RLHF 三步流程：

1. **SFT**：在人类示范数据上 supervised fine-tune
2. **RM**：用人类偏好 pair 训练 reward model
3. **PPO**：以 RM 打分作为 reward，PPO 优化 LM 输出

PPO 在这里的角色：

- 策略（actor）= LLM 本身
- reward = RM(response) − β·KL(LLM ‖ SFT)，KL 项防止 reward hacking
- value = LLM 上加一个 value head 共享 backbone

为什么是 PPO？on-policy 每个样本只用一次符合 LLM 训练惯例；clip 防止 LLM 输出走偏（语言模型 catastrophic forgetting 极严重）；工程实现成熟（trlx / TRL / DeepSpeed-Chat）。

### 案例 3：OpenAI Five Dota 2

OpenAI Five 用 PPO 训练，128000 CPU + 256 GPU 跑了 10 个月。2019 年 4 月以 2-0 击败 Dota 2 世界冠军 OG。同一个 PPO 算法既能跑 CartPole（4 维状态）也能跑职业级游戏（数千维状态、长时序决策、多 agent 配合），这是它能成为"工业默认"的关键证据。

## 踩过的坑

1. **ε=0.2 是经验值，不是定律**：PPO 论文只在 MuJoCo 上调出 0.2 最好。LLM RLHF 中 vocab=50000+，0.2 的 clip 范围太宽会让 KL 爆炸，常用 0.1 甚至 0.05。

2. **K epochs 过大会发散**：同一批数据训 K=20 轮，policy 会把 surrogate objective 推得离 π_old 太远，importance ratio 估计失真，clip 救不回来。社区基本都用 K=10。

3. **on-policy 数据不能复用**：PPO 每次 update 完就丢弃 trajectory，不能像 SAC 那样进 replay buffer。sample efficiency 比 off-policy 低 3-10 倍——但 PPO 可以并行 rollout，wall-clock 反而更快。

4. **稀疏奖励任务挂掉**：MuJoCo 奖励稠密，PPO 表现 SOTA。但 Montezuma's Revenge 这种稀疏奖励任务 PPO 几乎完全不 work，需要配 curiosity / RND 等探索机制。

5. **超参之间耦合**：ε / γ / λ / lr / K / batch size 互相影响，改一个常常要重调其他几个。"PPO 简单"是表象，深度调参时一样麻烦。

## 适用 vs 不适用场景

**适用**：

- 中等难度连续控制（MuJoCo / robotics / 游戏 AI）
- LLM RLHF（[[instructgpt]] / ChatGPT / Claude / Gemini）
- 学习成本敏感的项目——实现简单，调参负担小
- 大规模分布式训练（OpenAI Five 模式）

**不适用**：

- 稀疏奖励任务（Montezuma's Revenge） → 需 curiosity / 探索奖励
- 需要极致 sample efficiency 的真实机器人 → 用 SAC（off-policy + replay buffer）
- 小模型 RLHF 偏好对齐 → DPO 更简单且效果近似
- 需要分层决策的复杂场景（StarCraft II） → 单层 PPO 不够，需 hierarchical RL

## 历史小故事（可跳过）

- **1992 年**：Williams 提出 REINFORCE——最早的 policy gradient 算法，公式简单但方差巨大，几乎学不动
- **2015 年**：Schulman 在 [[deepmind]] / OpenAI 圈子里提出 TRPO（Trust Region Policy Optimization），用二阶优化保证每步不偏太远；数学优雅但实现复杂
- **2017 年**：Schulman 团队在 OpenAI 提出 PPO，把 TRPO 的二阶优化简化成一行 clip——arXiv 论文不到 12 页，没投会议直接挂出来
- **2018-2019 年**：OpenAI Five 用 PPO 击败 Dota 2 世界冠军，证明 PPO 能 scale
- **2022 年**：[[instructgpt]] 公开 RLHF 三步流程，PPO 成为 LLM 对齐的标配
- **2024 年**：[[deepseek-r1]] 用 GRPO（Group Relative Policy Optimization，PPO 去掉 critic 的简化版）训练推理模型，PPO 家族继续演化

七年里 PPO 从一个 RL 算法变成 AI 对齐的基础设施，引用数 25000+，是 RL 领域 top-3 的论文。

## 学到什么

1. **简单的工程 trick 能打败复杂的理论方案**——一行 clip 就达到 TRPO 90% 的效果
2. **on-policy + actor-critic + GAE** 是 RL 的稳定铁三角组合
3. **经验超参（ε=0.2, K=10, λ=0.95）虽无理论支撑，但跨任务可复用性极强**
4. **clip 的本质是 pessimistic bound**——只在"走太远"时切断梯度，"走错方向"时不切，既保守又能修正错误
5. **RL 工业算法的选型标准是"简单 + 鲁棒"，不是"数学优雅"**
6. **同一个算法跨尺度 work**：CartPole（4 维）和 OpenAI Five（数千维）用同一个 PPO

## 延伸阅读

- 论文 PDF：[arXiv 1707.06347](https://arxiv.org/abs/1707.06347)（不到 12 页，密度低，能从头读到尾）
- 单文件实现：[CleanRL ppo.py](https://github.com/vwxyzjn/cleanrl/blob/master/cleanrl/ppo.py)（< 300 行，教学经典）
- 视频讲解：[Yannic Kilcher — PPO Paper Explained](https://www.youtube.com/watch?v=5P7I-xPq8u8)（45 分钟把推导和实验讲完）
- [[instructgpt]] —— PPO 在 LLM RLHF 中的奠基应用
- [[deepseek-r1]] —— GRPO 是 PPO 简化变体，去掉 critic

## 关联

- [[instructgpt]] —— RLHF 三步流程的最后一步就是 PPO
- [[deepmind]] —— TRPO 的研究圈之一，是 PPO 的直接前身
- [[deepseek-r1]] —— 用 GRPO（PPO 简化版）训练推理模型
- [[dqn]] —— RL 经典 value-based 算法，PPO 是 policy-based 一支
- [[attention]] —— Transformer 是 PPO-LSTM / PPO-Transformer 的常用 backbone
- [[gpt-3]] —— InstructGPT 的 base model，PPO 在其上做 RLHF
- [[chinchilla]] —— scaling law 影响 PPO 在大模型 RLHF 的算力分配

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[alphago]] —— AlphaGo — 击败围棋世界冠军
- [[attention]] —— Attention Is All You Need
- [[bert]] —— BERT — 双向 Transformer 预训练
- [[chinchilla]] —— Chinchilla — 训练大模型的数据/参数最优比
- [[decision-transformer-2021]] —— Decision Transformer — 把强化学习当成"文字接龙"
- [[deepseek-r1]] —— DeepSeek R1 — 强化学习推理模型
- [[dpo]] —— DPO — Direct Preference Optimization
- [[dqn]] —— DQN — Deep Q-Network
- [[gpt-3]] —— GPT-3 — Language Models are Few-Shot Learners
- [[instructgpt]] —— InstructGPT — RLHF 让 LLM 听话
- [[mamba]] —— Mamba — 选择性状态空间模型
- [[muzero]] —— MuZero — 不用规则也能下棋
- [[t5]] —— T5 — Text-to-Text Transfer Transformer
- [[td3-2018]] —— TD3 — 给 DDPG 装两副刹车，连续控制终于稳了
- [[world-model-robot-learning-2026]] —— 机器人世界模型综述 — 预测未来再动手

