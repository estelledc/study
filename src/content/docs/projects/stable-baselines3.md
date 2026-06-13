---
title: 'Stable Baselines3 — 强化学习的"sklearn"'
来源: 'https://github.com/DLR-RM/stable-baselines3'
日期: '2026-06-13'
分类: 机器学习
子分类: ai-ml-frameworks
provenance: pipeline-v3
---

## 是什么

Stable Baselines3（简称 SB3）是一套**在 PyTorch 上实现的强化学习算法库**。日常类比：它就像强化学习里的 sklearn——你不需要自己从零写反向传播、经验回放或者策略梯度，只要选一个算法（PPO、SAC、DQN 之类）、喂给它一个环境，调用 `model.learn()`，模型就开始训练。

你写：

```python
from stable_baselines3 import A2C
import gymnasium as gym

model = A2C("MlpPolicy", "CartPole-v1")
model.learn(total_timesteps=10_000)
model.save("a2c_cartpole")
```

三行代码搞定一个智能体在平衡车环境里的训练。**这是过去 4 年强化学习入门和基准测试的事实标准**——大量论文和教程用它当 baseline。

SB3 是 Stable Baselines（Python/TensorFlow 版）的完全重写，核心动机就一件事：**用 PyTorch 替换 TensorFlow，同时保持 API 一致**。2021 年发表在 JMLR 上。

## 为什么重要

不理解 SB3，下面这些事都没法解释：

- 为什么 2020 年后几乎所有 RL 论文都用 PPO / SAC 当 baseline——SB3 让它们变得"一行代码就能跑"
- 为什么 Gymnasium 成了标准环境接口——SB3 是第一个全面迁移到 Gymnasium 的主流 RL 库
- 为什么"向量化环境（VecEnv）"成了 RL 标配——SB3 内部强制使用，让训练速度提升 5-10 倍
- 为什么 PyTorch 在 RL 领域碾压 TensorFlow——SB3 的成功证明了这一点，后续大多数 RL 库都选了 PyTorch

## 核心概念

### 强化学习的基本循环

强化学习可以理解为**让一个 AI 在模拟环境里通过试错来学习**。每一步发生的事：

1. 智能体看到当前状态（observation）
2. 根据策略决定动作（action）
3. 环境给出奖励（reward）和新状态
4. 重复直到完成任务或超时

SB3 做的事情就是把这套循环自动化，用神经网络做策略映射。

### 算法家族

SB3 实现了 6 种主流算法，分成两大类：

| 算法 | 类型 | 适合的动作空间 | 一句话描述 |
|------|------|---------------|-----------|
| PPO | On-policy | 连续 / 离散 | 目前最流行的 RL 算法，稳定、通用 |
| A2C | On-policy | 连续 / 离散 | PPO 的前身，更简单但稳定性差一些 |
| SAC | Off-policy | 连续 | 连续控制任务 SOTA，样本效率高 |
| TD3 | Off-policy | 连续 | SAC 的竞争对手，用截断双 Q 减少高估 |
| DQN | Off-policy | 离散 | 经典中的经典，Atari 游戏靠它突破人类水平 |
| HER | Off-policy（扩展）| 离散 / 连续 | 稀疏奖励问题的解决方案，通过" hindsight "重新标记目标 |

**On-policy** 意思是策略更新时只用当前策略产生的数据，数据用完就丢。**Off-policy** 可以利用历史数据（经验回放），样本效率更高。

### 向量化环境（VecEnv）

SB3 内部强制使用向量化环境——本质上就是**同时跑多个并行环境实例**。类比：与其让一个学生做 1000 道题，不如让 10 个学生每人做 100 道题，最后汇总结果。训练速度直接提升 N 倍（N = 并行环境数）。

## 代码示例

### 示例 1：训练 + 保存 + 加载一个 PPO 智能体

```python
from stable_baselines3 import PPO
import gymnasium as gym

# 创建环境（也可以用 "Pendulum-v1" 等任何 Gymnasium 注册的环境名）
env = gym.make("CartPole-v1")

# 初始化模型：MlpPolicy 表示用多层感知机做策略网络
model = PPO("MlpPolicy", env, verbose=1, learning_rate=3e-4)

# 训练 50000 步
model.learn(total_timesteps=50_000)

# 保存模型到磁盘
model.save("ppo_cartpole")

# ---- 之后在另一个脚本中加载使用 ----
# from stable_baselines3 import PPO
# model = PPO.load("ppo_cartpole", env=env)
# obs, _ = env.reset()
# for _ in range(1000):
#     action, _ = model.predict(obs, deterministic=True)
#     obs, reward, done, info = env.step(action)
#     env.render()
#     if done:
#         obs, _ = env.reset()
```

`verbose=1` 会在终端打印训练进度（每 1000 步输出一行奖励均值）。`deterministic=True` 让预测结果固定不变——调试和演示时用这个，开发时可以设 `False` 增加探索。

### 示例 2：用 SAC 训练连续控制任务 + TensorBoard 可视化

```python
from stable_baselines3 import SAC
from stable_baselines3.common.env_util import make_vec_env
from stable_baselines3.common.callbacks import EvalCallback, CheckpointCallback
import gymnasium as gym

# 创建 4 个并行的 Pendulum 环境（连续控制， swinging pendulum 保持不倒）
vec_env = make_vec_env("Pendulum-v1", n_envs=4)

# 定义回调：每 5000 步保存一次模型
checkpoint_cb = CheckpointCallback(save_freq=5000, save_path="./logs/")

# 训练 SAC 模型
model = SAC("MlpPolicy", vec_env, verbose=1, tensorboard_log="./tb/")
model.learn(total_timesteps=100_000, callback=[checkpoint_cb])

# 所有检查点保存在 ./logs/ 目录下
# TensorBoard 用 tensorboard --logdir ./tb/ 查看
```

SAC 是**连续动作空间**的首选算法。`make_vec_env` 自动帮你创建并行环境（底层用 DummyVecEnv）。`CheckpointCallback` 定期存盘，防止训练中断白跑。TensorBoard 可以看奖励曲线、熵值等训练指标。

### 示例 3：自定义环境的骨架

```python
import gymnasium as gym
import numpy as np

class MyCustomEnv(gym.Env):
    """最简单的自定义环境：随机走，走到右边得 +1 奖励"""

    def __init__(self):
        super().__init__()
        self.action_space = gym.spaces.Discrete(3)  # 左、停、右
        self.observation_space = gym.spaces.Box(
            low=np.array([0]), high=np.array([10]), dtype=np.float32
        )
        self.position = 5

    def reset(self, seed=None, options=None):
        super().reset(seed=seed)
        self.position = 5
        return np.array([self.position], dtype=np.float32), {}

    def step(self, action):
        if action == 0:
            self.position -= 1
        elif action == 2:
            self.position += 1
        # 到达右边得奖励
        reward = 1.0 if self.position >= 10 else 0.0
        terminated = self.position >= 10 or self.position <= 0
        return np.array([self.position], dtype=np.float32), reward, terminated, False, {}
```

自定义环境只需继承 `gym.Env`，实现 `reset()` 和 `step()` 两个方法，声明 `action_space` 和 `observation_space`。然后直接喂给任何 SB3 算法：`model = PPO("MlpPolicy", MyCustomEnv())`。

## 踩过的坑

1. **Gymnasium vs Gym**：SB3 只兼容 Gymnasium（`import gymnasium`），老的 Gym（`import gym`）不行。`pip install gymnasium` 之后用 `gym.make()`，不是 `gymnasium.make()`——包名和函数名不一样，新手经常搞混。

2. **VecEnv 重置是自动的**：在 `DummyVecEnv` 或 `SubprocVecEnv` 中，环境 done 后会自动 reset，obs 永远是当前有效状态。如果你在里面写了 `if done: obs = env.reset()`，反而会导致双重 reset 出错。

3. **DQN 只支持离散动作**：如果你的任务是机械臂角度控制（连续），用 DQN 会直接报错。选 SAC 或 TD3。

4. **NaN 问题**：RL 训练不稳定时 loss 会变成 NaN。SB3 提供了 `VecCheckNan` wrapper，包装环境后会自动检测并报错：`from stable_baselines3.common.vec_env import VecCheckNan; env = VecCheckNan(vec_env)`。

5. **PPO 的 clip_range 很重要**：默认 0.2，太大会导致策略更新幅度过大、训练崩溃；太小则学得太慢。调参时优先动这个和 learning_rate。

6. **保存的模型绑定了环境**：`model.save()` 存的不只是权重，还有环境配置。`model.load()` 时需要传入原来的 env 对象，或者用 `model.load(path, env=None)` 但后续操作可能出问题。

## 适用 vs 不适用场景

**适用**：

- 快速验证 RL 想法——选算法 + 环境，几行代码出 baseline
- 标准连续/离散控制任务（机械臂、平衡车、机器人行走）
- 需要 TensorBoard 监控训练过程的工程场景
- 和 RL Baselines3 Zoo 配合做超参数调优

**不适用**：

- 需要自定义训练循环（比如 GAN 式的交替训练）——直接写 PyTorch
- 大规模分布式训练——SB3 的并行是进程级的，不支持多机
- 研究新算法——应该去 SB3 Contrib（`stable-baselines3-contrib`），那里放实验性代码

## 生态

- **RL Baselines3 Zoo**：SB3 的训练框架，预训练了 100+ 个环境的智能体，一行命令就能训练和对比
- **SB3 Contrib**：实验性算法仓库，包含 QR-DQN、Masking、HER 等不在主仓库的代码
- **SBX**：SB3 + JAX 的版本，追求极致推理速度

## 学到什么

1. **RL 入门不需要从头实现算法**——SB3 把 90% 的工作封装了，新手应该先会用再理解
2. **On-policy 和 Off-policy 的根本区别**在于数据能不能复用，这决定了样本效率和算法选择
3. **向量化环境是 RL 工程的标配**——单环境串行训练在现实中已经不够用了
4. **RL 的稳定性远不如监督学习**——NaN、策略崩溃、奖励不收敛是常态，需要耐心调参

## 延伸阅读

- 官方文档：[Stable-Baselines3 Docs](https://stable-baselines3.readthedocs.io/)（完整的 API 参考和教程）
- 快速开始：[Quick Start Guide](https://stable-baselines3.readthedocs.io/en/master/guide/quickstart.html)（10 分钟跑通第一个模型）
- JMLR 论文：[Stable-Baselines3: Reliable Reinforcement Learning Implementations](https://jmlr.org/papers/v22/20-1364.html)（2021）
- [[pytorch]] —— SB3 的底层框架
- [[scikit-learn]] —— SB3 的 API 风格模仿对象，`model.learn()` 类似 `model.fit()`
- [[gymnasium]] —— SB3 使用的标准环境接口

## 关联

- [[pytorch]] —— SB3 的底层深度学习框架
- [[scikit-learn]] —— API 风格参照物，都是"选算法 → 初始化 → learn/fit"
- [[gymnasium]] —— SB3 的标准环境接口
- [[tensorflow]] —— 原版 Stable Baselines (v2) 用的框架
- [[fastai]] —— 同样定位"低代码 ML"，但面向监督学习
