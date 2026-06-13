---
title: Human-level Control Through Deep Reinforcement Learning (DQN)
来源: https://www.nature.com/articles/nature14236
日期: 2026-06-13
分类: 机器学习
子分类: rl
provenance: pipeline-v3
---

# Human-level Control Through Deep Reinforcement Learning

> 作者: Volodymyr Mnih et al. (DeepMind)
> 发表: Nature, Volume 518, pages 529-533, 2015年2月25日
> 引用: 61,600+ 次, 开创性论文

## 一、这篇论文在解决什么问题？

想象一个小孩第一次玩电子游戏。他面前只有一个屏幕和手柄，不知道规则，不知道怎么玩。但他通过不断尝试——按左、按右、吃到分数、GAME OVER——逐渐学会了如何通关。

传统的人工智能做不到这一点。以前的AI如果要玩游戏，研究人员得事先告诉它："这个是敌人，那个是得分点，你应该往左移动"。这就像教一个学生时，每一步都给他写好了答案。

这篇论文做了一个大胆的实验：**只给AI两样东西——屏幕上的像素画面和游戏分数变化——让它自己学会玩49种不同的Atari游戏，而且达到了人类专业玩家的水准。**

这就是 Deep Q-Network（DQN），也是第一个做到这一点的AI系统。

## 二、核心概念

### 2.1 强化学习：像训狗一样训练AI

强化学习（Reinforcement Learning, RL）的核心思想很简单：

- 有一个**智能体**（agent），就像一只小狗
- 有一个**环境**（environment），就像训练场
- 智能体做**动作**（action），比如"坐下"或"握手"
- 环境给**奖励**（reward），比如"真乖，给你骨头"或"不对，罚站"
- 目标是让智能体学会**最大化长期奖励的总和**

这和 supervised learning（监督学习）完全不同。监督学习是老师告诉你每个问题的正确答案；强化学习是老师什么都不说，只在你做对了的时候给一颗糖。

### 2.2 Q值：每个选择的"价值评分"

在强化学习中，最关键的概念是 **Q值**（Action-Value Function）。

Q(s, a) 的意思是："在当前状态 s 下，如果选择动作 a，我未来能拿到多少总分？"

比如打 Atar 游戏时：
- 状态 s = 屏幕上子弹的位置、敌人的位置、你的血量
- 动作 a = {向左、向右、射击、不动}
- Q(s, "向左") = 3.5（向左走平均能得3.5分）
- Q(s, "射击") = 8.2（射击平均能得8.2分）

智能体的目标就是学会准确估计每个 Q 值，然后每次都选 Q 值最高的动作。

### 2.3 Q-learning 的贝尔曼方程

Q-learning 的核心公式叫**贝尔曼方程**（Bellman Equation）：

```
Q(s, a) = E[r + γ × max Q(s', a')]
```

翻译成人话：
- 当前动作的价值 = 立即拿到的奖励 + 折扣后的"未来最佳价值"
- γ（gamma）是折扣因子，通常取 0.99，表示"明天的1块钱不如今天的1块钱值钱"
- s' 是执行动作后进入的新状态
- a' 是在新状态下最好的动作

这个公式告诉我们：想要知道现在做一件事值不值，要看"眼前收益 + 长远影响"。

### 2.4 为什么神经网络不能直接用？

如果把神经网络用来估计 Q 值（叫它 Q-network），会遇到三个致命问题：

**问题1：数据不是独立的**

神经训练最怕的是"数据之间有相关性"。但你打游戏时，第1帧和第2帧几乎一模一样——你只是动了一下而已。用这种连续相关的数据训练神经网络，结果会非常不稳定。

**问题2：目标在跑**

在普通学习中，你的目标是固定的（比如"识别猫还是狗"）。但在强化学习中，你的目标 Q 值本身也在变——因为你在学，你的策略在变，你收集到的数据也在变。就像一个人在跑步机上追自己的影子。

**问题3：反馈回路**

如果你总是学"向左走"的数据，网络就会越来越偏向"向左"，然后你就真的只会向左走了——永远不会去探索右边有什么好东西。

## 三、DQN 的两个关键创新

DeepMind 的解决方案非常巧妙，只有两个核心 idea。

### 3.1 Experience Replay（经验回放）

**类比：就像你复习错题本**

你打了一场游戏，经历了各种场景：看到敌人、吃到道具、被击中、GAME OVER……这些经历被存进一个叫"经验回放缓冲区"的地方。

训练时，不是按时间顺序一条一条学，而是**随机抽取**之前的经历来训练。

```
经验回放缓冲区（Replay Memory）: 容量 100万条

存储格式: (状态s, 动作a, 奖励r, 下一状态s')

示例:
  [1] (屏幕画面#1001, 向左, +1, 屏幕画面#1002)
  [2] (屏幕画面#2050, 射击, +5, 屏幕画面#2051)
  [3] (屏幕画面#3300, 不动,  0, 屏幕画面#3301)
  ...
  [999999] (屏幕画面#999999, 向右, -1, GAME_OVER)

训练时: 随机抽32条 → 训练网络 → 再随机抽32条 → 再训练
```

这样做的好处：

- **打破相关性**：随机抽样让训练数据不再连续相关
- **数据复用**：每条经历可以被反复学习多次，提高效率
- **平滑分布**：学习的是过去所有策略的平均，不会偏科

这其实模拟了人脑的海马体——我们在睡觉时，大脑会"回放"白天经历的事情来巩固记忆。

### 3.2 Target Network（目标网络）

**类比：考试时用旧答案来批改新作业**

如果 Q 值和 Q 的目标值来自同一个网络，就会出现"自己夸自己"的问题——网络稍微往一个方向偏一点，目标也跟着偏，然后继续偏，最后彻底失控。

DQN 的做法是：**建一个一模一样的"目标网络"，它的参数每隔 C 步（论文中 C=10000）才更新一次。**

```
主网络 (Q-network):        目标网络 (Target Q-network):
θ_i —— 每步都在更新         θ_i^- —— 每10000步才更新一次

训练时计算损失:
  损失 = (y_i - Q(s, a; θ_i))²

其中 y_i 是用目标网络计算的:
  y_i = r + γ × max Q'(s', a'; θ_i^-)

关键点: θ_i^- 在10000步内保持不变
       所以目标值是"锚定"的，不会跟着主网络乱跑
```

## 四、网络架构

DQN 用的是一个卷积神经网络（CNN），输入是游戏画面，输出是每个动作的 Q 值。

```
输入: 4帧画面堆叠，每帧 84×84 灰度图 → (4, 84, 84)
                    │
        ┌───────────┴───────────┐
        ▼                       ▼
  卷积层1: 32个8×8滤波器       ReLU激活
  步长(stride) = 4            → 输出 (32, 20, 20)
        │
        ▼
  卷积层2: 64个4×4滤波器       ReLU激活
  步长 = 2                   → 输出 (64, 9, 9)
        │
        ▼
  卷积层3: 64个3×3滤波器       ReLU激活
  步长 = 1                   → 输出 (64, 6, 6)
        │
        ▼
  全连接层1: 512个神经元       ReLU激活
        │
        ▼
  输出层: 每个动作一个Q值       线性输出
  (不同游戏动作数不同: 4-18个)
```

整个网络只有一个前向传播就能算出所有动作的 Q 值。

## 五、完整代码示例

### 示例1：Experience Replay Buffer

这是一个最简化的经验回放缓冲区实现：

```python
import random
from collections import deque
import numpy as np


class ReplayBuffer:
    """
    经验回放缓冲区

    类比：就像一个录像带仓库，你把每次游戏的经历录下来存进去，
    训练时随机抽几盘来看，而不是按时间顺序一盘一盘放。
    """

    def __init__(self, capacity=1_000_000):
        # capacity 就是仓库最大能存多少条经历
        self.buffer = deque(maxlen=capacity)

    def push(self, state, action, reward, next_state, done):
        """
        存一条新经历

        参数:
          state:     当前状态（游戏画面）
          action:    做的动作（0=左, 1=右, 2=射击...）
          reward:    拿到的奖励（+1, +5, -1, 0...）
          next_state: 做完动作后的新状态
          done:      游戏是否结束了（True/False）
        """
        experience = (state, action, reward, next_state, done)
        self.buffer.append(experience)

    def sample(self, batch_size):
        """
        随机抽取 batch_size 条经历用于训练

        这就是"回放"——随机抽，不按顺序！
        """
        batch = random.sample(self.buffer, batch_size)
        states, actions, rewards, next_states, dones = zip(*batch)
        return (
            np.array(states),
            np.array(actions),
            np.array(rewards, dtype=np.float32),
            np.array(next_states),
            np.array(dones, dtype=np.bool_),
        )

    def __len__(self):
        return len(self.buffer)


# ---------- 使用示例 ----------
buffer = ReplayBuffer(capacity=100_000)

# 模拟收集100条游戏经历
for step in range(100):
    state = np.random.rand(4, 84, 84)          # 模拟游戏画面
    action = random.randint(0, 4)               # 随机选一个动作
    reward = random.choice([-1, 0, 1, 5])       # 随机奖励
    next_state = np.random.rand(4, 84, 84)      # 模拟新画面
    done = random.choice([False, True])          # 可能结束了

    buffer.push(state, action, reward, next_state, done)

# 从100条中随机抽32条来训练
states, actions, rewards, next_states, dones = buffer.sample(batch_size=32)
print(f"采样了 {len(states)} 条经历")
print(f"状态形状: {states.shape}")
print(f"奖励分布: {rewards}")
```

### 示例2：完整的 DQN 训练循环

这是论文中 Algorithm 1 的简化实现：

```python
import torch
import torch.nn as nn
import torch.optim as optim


class DQN(nn.Module):
    """
    Deep Q-Network: 输入画面 → 输出每个动作的Q值

    类比：这个网络就是一个"游戏大脑"。
    你看一眼屏幕（输入），它告诉你每个按钮按下去"大概能得多少分"（输出）。
    """

    def __init__(self, num_actions):
        super().__init__()
        self.network = nn.Sequential(
            # 层1: 32个 8x8 卷积核，步长4
            nn.Conv2d(4, 32, kernel_size=8, stride=4),
            nn.ReLU(),
            # 层2: 64个 4x4 卷积核，步长2
            nn.Conv2d(32, 64, kernel_size=4, stride=2),
            nn.ReLU(),
            # 层3: 64个 3x3 卷积核，步长1
            nn.Conv2d(64, 64, kernel_size=3, stride=1),
            nn.ReLU(),
            # 展平 + 全连接层
            nn.Flatten(),
            nn.Linear(3136, 512),
            nn.ReLU(),
            # 输出层: 每个动作一个Q值
            nn.Linear(512, num_actions),
        )

    def forward(self, x):
        """x 的形状: (batch, 4, 84, 84)"""
        return self.network(x)


class DQNAgent:
    """
    完整的 DQN 智能体

    它包含:
      - 主网络 (online_net): 每步都在学习
      - 目标网络 (target_net): 每10000步才更新一次
      - 经验回放缓冲区: 存过去的经历
      - ε-greedy 策略: 偶尔随机探索，大部分时间相信网络
    """

    def __init__(self, num_actions, device="cpu"):
        self.device = device
        self.num_actions = num_actions

        # 主网络和目标网络结构完全一样
        self.online_net = DQN(num_actions).to(device)
        self.target_net = DQN(num_actions).to(device)
        # 初始化时，目标网络复制主网络的参数
        self.target_net.load_state_dict(self.online_net.state_dict())

        self.optimizer = optim.RMSprop(
            self.online_net.parameters(), lr=2.5e-4, alpha=0.95, eps=0.01
        )
        self.replay_buffer = ReplayBuffer(capacity=1_000_000)

        # ε-greedy 的探索率: 从1.0慢慢降到0.1
        self.epsilon = 1.0
        self.epsilon_min = 0.1
        self.epsilon_decay = 0.995
        self.gamma = 0.99  # 折扣因子

        # 目标网络更新频率
        self.target_update_freq = 10000
        self.training_step = 0

    def select_action(self, state):
        """
        ε-greedy 策略选动作

        类比：ε=1.0 时完全盲猜（刚开始学，啥也不懂）
              ε=0.1 时90%时间听网络的，10%时间随机探索（学得差不多了）
        """
        if random.random() < self.epsilon:
            return random.randint(0, self.num_actions - 1)
        else:
            with torch.no_grad():
                state_tensor = torch.FloatTensor(state).unsqueeze(0).to(self.device)
                q_values = self.online_net(state_tensor)
                return q_values.argmax(dim=1).item()

    def train_step(self, batch_size=32):
        """
        一步训练

        这就是 DQN 的核心：用贝尔曼方程计算目标，然后让网络去拟合它。

        贝尔曼方程:
          Q(s,a) ≈ r + γ × max Q'(s', a')

        左边是当前网络的预测，右边是目标网络给出的"参考答案"。
        网络的目标就是让自己的预测越来越接近参考答案。
        """
        if len(self.replay_buffer) < batch_size:
            return 0.0

        # 1. 从回放缓冲区随机抽一批经历
        states, actions, rewards, next_states, dones = self.replay_buffer.sample(
            batch_size
        )

        # 转成 tensor
        states_t = torch.FloatTensor(states).to(self.device)
        actions_t = torch.LongTensor(actions).to(self.device)
        rewards_t = torch.FloatTensor(rewards).to(self.device)
        next_states_t = torch.FloatTensor(next_states).to(self.device)
        dones_t = torch.FloatTensor(dones).to(self.device)

        # 2. 用目标网络计算"参考答案" y
        with torch.no_grad():
            next_q_values = self.target_net(next_states_t)
            max_next_q = next_q_values.max(dim=1)[0]
            targets = rewards_t + self.gamma * max_next_q * (1 - dones_t)

        # 3. 用主网络计算当前预测
        q_values = self.online_net(states_t)
        q_values_for_actions = q_values.gather(1, actions_t.unsqueeze(1)).squeeze(1)

        # 4. 计算损失（均方误差）并反向传播
        loss = nn.MSELoss()(q_values_for_actions, targets)

        self.optimizer.zero_grad()
        loss.backward()
        # 梯度裁剪，防止梯度爆炸
        torch.nn.utils.clip_grad_norm_(self.online_net.parameters(), 10.0)
        self.optimizer.step()

        # 5. 更新目标网络（每10000步复制一次参数）
        self.training_step += 1
        if self.training_step % self.target_update_freq == 0:
            self.target_net.load_state_dict(self.online_net.state_dict())

        # 6. 慢慢降低探索率
        self.epsilon = max(
            self.epsilon_min, self.epsilon * self.epsilon_decay
        )

        return loss.item()

    def store_experience(self, state, action, reward, next_state, done):
        """把一次交互存入回放缓冲区"""
        # 奖励裁剪: 正奖励最多+1，负奖励最少-1
        clipped_reward = max(-1.0, min(1.0, reward))
        self.replay_buffer.push(state, action, clipped_reward, next_state, done)
```

## 六、训练流程总览

```
┌─────────────────────────────────────────────────────┐
│                  每一帧的循环                          │
├─────────────────────────────────────────────────────┤
│                                                     │
│  1. 观察屏幕画面 → 预处理 → 拼接4帧 → 状态 s          │
│                                                     │
│  2. ε-greedy 选动作 a                                │
│     (刚开始随机乱按，后来 mostly 听网络的)             │
│                                                     │
│  3. 执行动作 a → 得到奖励 r 和新画面 s'               │
│                                                     │
│  4. 把 (s, a, r, s') 存入 Replay Buffer              │
│                                                     │
│  5. 从 Buffer 随机抽32条 → 计算 Loss → 更新网络       │
│     Loss = (y - Q(s,a))²                            │
│     y = r + γ × max Q'(s', a')                     │
│                                                     │
│  6. 每10000步: 把主网络参数复制到目标网络               │
│                                                     │
│  7. 慢慢降低 ε (1.0 → 0.1)                           │
│                                                     │
└─────────────────────────────────────────────────────┘
```

## 七、结果与意义

DQN 在 49 种 Atari 游戏中：

- **超过**了之前所有算法在 43 种游戏中的表现
- 在 29 种游戏中达到了人类专业玩家的 75% 以上水平
- 用的**是同一个算法、同一个网络结构、同一组参数**——没有为任何游戏做特殊设计

这意味着什么？意味着 AI 第一次不需要人类告诉它"怎么玩"，就能从原始像素中学会玩各种游戏。这就像给了一个孩子一台游戏机，他自己就学会了。

## 八、局限性

DQN 也不是万能的：

- **需要大量训练**：每种游戏要玩 5000 万帧（约 38 天）
- **对某些游戏表现不好**：比如《Montezuma's Revenge》，需要很长的长期规划，DQN 搞不定
- **奖励裁剪的代价**：把奖励限制在 [-1, 1] 后，网络无法区分"得5分"和"得100分"的区别

## 九、后续发展

这篇论文之后，DQN 催生了很多改进版本：

- **Double DQN**: 解决了 Q 值高估的问题
- **Dueling DQN**: 把状态价值和优势函数分开估计
- **Prioritized Experience Replay**: 重要的经历多学几遍
- **Rainbow**: 把所有改进组合在一起
- **AlphaGo / AlphaFold**: 同一套思路扩展到了围棋和蛋白质折叠

## 十、关键超参数速查

| 参数 | 值 | 含义 |
|------|-----|------|
| γ (折扣因子) | 0.99 | 未来奖励的折现率 |
| ε (探索率) | 1.0 → 0.1 | 随机探索的比例 |
| ε 衰减 | 0.995 | 每步衰减多少 |
| 学习率 | 2.5e-4 | RMSProp 优化器的学习率 |
| Batch Size | 32 | 每次训练的样本数 |
| Replay Buffer | 1,000,000 | 回放缓冲区容量 |
| Target Update | 每 10,000 步 | 目标网络更新频率 |
| 帧跳过 | 4 | 每 4 帧执行一次动作 |
| 训练帧数 | 50,000,000 | 总共玩多少帧 |
