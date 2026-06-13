---
title: Soft Actor-Critic Algorithms and Applications — 零基础学习笔记
来源: https://arxiv.org/abs/1812.05905
日期: 2026-06-13
分类_原始: 论文笔记
分类: 其他
子分类: reinforcement-learning
provenance: pipeline-v3
---

# Soft Actor-Critic (SAC) — 零基础学习笔记

## 一、从日常类比开始

想象你在一家自助餐厅学做菜。

**传统方法**（比如 DQN、PPO）像是这样的：你尝一道菜，厨师告诉你"盐放多了"或者"火候刚好"。你每次都只记住"这一种做法是对的"，然后严格按这个做法来。好处是简单，坏处是你很"死板"——遇到稍微不同的食材就懵了。而且你每次都要从头试起，浪费很多食材（样本）。

**SAC 的做法**不一样：厨师不仅告诉你"这道菜怎么做"，还鼓励你"多尝试不同的调味组合"。你一边努力做出好吃的菜（拿高分），一边也保持一定的随机性去探索新配方（最大化熵）。结果就是：

- 你学到的菜谱更通用（鲁棒性强）
- 你不需要反复试错同样的东西（样本效率高）
- 即使换个厨房也能上手（跨任务迁移好）

这个"既做好本职工作，又保持探索精神"的理念，就是 SAC 的核心。

## 二、核心概念拆解

### 2.1 什么是"最大熵"强化学习？

传统强化学习的目标很简单：让智能体拿到最高的累计奖励。

SAC 的目标变成了两个：

1. **拿高分**：和以前一样，尽量多拿奖励
2. **保持随机**：在完成任务的同时，行为不要太单一

数学上就是：

```
最大化 = 累计奖励 + 温度系数 × 策略的熵（随机程度）
```

"熵"在这里就是"不确定性"或"多样性"的度量。熵越高，说明智能体的行为越多样化，不会过早地锁定在某一种固定的做法上。

**温度系数（temperature）** 控制着这两个目标的权衡：
- 温度高 → 更倾向于探索，行为更多样
- 温度低 → 更倾向于 exploit，行为更确定

### 2.2 Actor-Critic 架构

SAC 用了经典的 Actor-Critic 结构，可以理解为两个人：

| 角色 | 职责 | 类比 |
|------|------|------|
| **Actor（演员）** | 决定做什么动作 | 厨师，负责做菜 |
| **Critic（评论家）** | 评价 Actor 做得好不好 | 美食评委，负责打分 |

SAC 的特殊之处：

- **Actor 是随机的**：它输出的不是一个确定的动作，而是一个概率分布（比如高斯分布）。每次采样从这个分布中取一个动作。
- **有两套 Critic（Twin Q-Networks）**：不是只有一个评委，而是两个。这样可以减少过估计的问题（两个评委打分取较小的那个，更保守、更稳定）。

### 2.3 关键组件一览

1. **随机策略网络（Stochastic Policy Network）**：输入状态，输出动作的概率分布
2. **两个 Q 网络（Twin Q-Networks）**：评估"在当前状态下做某个动作值多少钱"
3. **两个目标 Q 网络（Target Q-Networks）**：Q 网络的"慢速版本"，用于稳定训练
4. **温度参数（Temperature α）**：自动调节探索与利用的平衡
5. **经验回放缓冲区（Replay Buffer）**：把过去的经历存起来，反复学习

## 三、训练流程

整个训练过程可以概括为以下几个步骤，每一步都在循环中进行：

1. 智能体观察当前状态，从 Actor 的输出分布中采样一个动作
2. 执行动作，得到新状态、奖励、是否结束
3. 把这些经历存入经验回放缓冲区
4. 从缓冲区中随机抽取一批数据，更新 Critic（两个 Q 网络）
5. 固定 Critic，更新 Actor（让它的动作在 Critic 看来更值钱，同时熵更高）
6. 缓慢更新目标 Q 网络（软更新 / polyak 平均）
7. 自动调整温度参数 α

## 四、代码示例

### 示例 1：用 Stable-Baselines3 快速训练一个 SAC 智能体

这是最实用的入门方式。Stable-Baselines3 (SB3) 是业界最常用的强化学习库之一，SAC 是它的内置算法。

```python
import gymnasium as gym
from stable_baselines3 import SAC

# 1. 创建一个环境
# Pendulum-v1 是一个经典的控制任务：把一根摆锤荡到最高点并保持
env = gym.make("Pendulum-v1")

# 2. 创建 SAC 模型
# "MlpPolicy" 表示用多层感知器作为神经网络
# gamma=0.98: 未来的奖励打 98% 的折扣（不那么重视太远将来）
# learning_rate=3e-4: 学习率，控制每次更新的步长
model = SAC(
    "MlpPolicy",
    env,
    gamma=0.98,
    learning_rate=3e-4,
    ent_coef=0.05,       # 初始温度系数（熵的权重）
    buffer_size=1_000_000,  # 经验回放缓冲区大小
    batch_size=256,       # 每次训练采样的批次大小
    verbose=1,
)

# 3. 开始训练
# total_timesteps=10000 表示总共与环境交互 10000 步
model.learn(total_timesteps=10000)

# 4. 保存模型
model.save("sac_pendulum")
```

**逐行解释：**

- `gamma=0.98`：这叫"折扣因子"。想象你现在有 100 块钱，明年的 100 块钱只值今天的 98 块。智能体也是类似的——它认为"眼前的奖励比遥远的奖励更重要"。
- `ent_coef=0.05`：这就是前面说的"温度系数"。值越大，智能体越爱探索；值越小，越倾向于稳扎稳打。
- `buffer_size=1_000_000`：缓冲区能存 100 万条"经历"。每条经历包括：状态、动作、奖励、下一个状态。训练时从中随机抽一批来学习，这样数据利用率高。

### 示例 2：用训练好的模型进行推理（让智能体表演）

训练完成后，你可以让智能体展示它学到的本事：

```python
import gymnasium as gym
from stable_baselines3 import SAC
import numpy as np

# 加载之前保存的模型
model = SAC.load("sac_pendulum")

# 创建环境（这次带可视化）
env = gym.make("Pendulum-v1", render_mode="human")

# 重置环境，获取初始状态
obs, info = env.reset()

total_reward = 0

# 让智能体不断与环境交互
for step in range(500):
    # 用 deterministic=True 让行为更稳定（每次选概率最大的动作）
    # 如果想看智能体"探索"的一面，改成 deterministic=False
    action, _states = model.predict(obs, deterministic=False)

    # 执行动作，得到新状态、奖励等信息
    obs, reward, terminated, truncated, info = env.step(action)

    total_reward += reward

    # 如果 episode 结束了，重置环境
    if terminated or truncated:
        print(f"Episode 结束 | 总奖励: {total_reward:.2f}")
        total_reward = 0
        obs, info = env.reset()

env.close()
```

**关键区别：**

- `deterministic=False`：从 Actor 输出的概率分布中采样动作。你会看到智能体有时做出不同的选择，这体现了 SAC 的"探索性"。
- `deterministic=True`：总是选概率最大的那个动作。适合部署到实际场景中，行为更可预测。

### 示例 3：自定义网络结构（进阶）

当你的任务比较复杂时，默认的网络可能不够用。你可以自定义网络层：

```python
from stable_baselines3 import SAC

# 自定义 Actor 和 Critic 的网络结构
# pi=[128, 128]: Actor 用两层，每层 128 个神经元
# qf=[256, 256]: Critic 用两层，每层 256 个神经元
policy_kwargs = dict(
    net_arch=dict(pi=[128, 128], qf=[256, 256])
)

model = SAC(
    "MlpPolicy",
    "Pendulum-v1",
    policy_kwargs=policy_kwargs,
    verbose=1,
)

model.learn(total_timesteps=20000)
```

## 五、SAC 为什么比传统方法好？

| 对比维度 | 传统方法（如 DQN/PPO） | SAC |
|----------|----------------------|-----|
| 样本效率 | 需要大量数据 | 利用率高，数据复用 |
| 稳定性 | 对超参数敏感 | 非常稳定，跨种子表现一致 |
| 探索能力 | 固定探索策略 | 自动探索，熵最大化 |
| 适用场景 | 离散动作空间为主 | 连续动作空间表现极佳 |
| 收敛速度 | 较慢 | 更快收敛到高质量策略 |

## 六、实际应用

SAC 不仅在实验室里跑分好看，在真实世界中也有广泛应用：

1. **机器人运动控制**：四足机器人行走、机械臂抓取（论文中展示了 MIT 的 Mini Cheetah 和 Shadow Hand）
2. **自动驾驶**：车辆轨迹规划、速度控制
3. **游戏 AI**：需要精细连续操作的游戏
4. **工业控制**：温度、压力等连续变量的精确调控

## 七、一句话总结

SAC 的核心思想就一句话：**让智能体在做好的同时，也不要忘了多试试别的路**。这种"既专注又开放"的态度，让它成为目前最强、最稳定的深度强化学习算法之一。

## 八、延伸阅读

- 原始论文：arXiv:1801.01290（首篇提出 SAC）
- 本文：arXiv:1812.05905（扩展版，含应用评估）
- 官方代码：https://github.com/haarnoja/sac
- Stable-Baselines3 文档：https://stable-baselines3.readthedocs.io/
