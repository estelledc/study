---
title: "Soft Actor-Critic (SAC) — 既想拿高分又想玩得花的深度学习 RL"
来源: https://arxiv.org/abs/1801.01290
日期: 2026-06-13
分类: 机器学习
子分类: rl
provenance: pipeline-v3
---

# Soft Actor-Critic (SAC) — 既想拿高分又想玩得花的深度学习 RL

> 论文：*Soft Actor-Critic: Off-Policy Maximum Entropy Deep Reinforcement Learning with a Stochastic Actor*
> 作者：Tuomas Haarnoja, Aurick Zhou, Pieter Abbeel, Sergey Levine（UC Berkeley）
> 发表于 ICML 2018

---

## 一、一个日常类比：贪吃蛇的新玩法

想象你在玩贪吃蛇。

**传统 RL（如 PPO、DDPG）** 的学习方式像是这样：老师告诉你"吃到苹果得 1 分，撞到墙壁扣 10 分"。于是你拼命练一条最优路线——每次都走同一条路径去吃苹果，因为这条路得分最高。问题在于：如果墙壁的位置变了，或者苹果换了一个地方，你之前的训练几乎全废了，因为你只会那一条路。

**SAC 的学习方式** 则不同。老师说的是"吃到苹果得 1 分，但还有一个隐藏加分项：你走路的路线越多样化，额外加分越多"。于是你不仅会练最优路线，还会同时探索其他能吃到苹果的路径。万一墙壁变了？没关系，你早就知道三条以上的路线了。

这就是 SAC 的核心思想：**在追求高分的同时，也追求行为的多样性（熵最大化）**。

---

## 二、为什么要搞 SAC？

在 SAC 之前，深度强化学习有两个大痛点：

1. **样本效率极低**：PPO 这类"策略梯度"算法每次更新都要收集新数据，就像学生每做一次练习题就要老师重新出卷子一样浪费。
2. **极其脆弱**：DDPG 这类"离策略"算法虽然能用旧数据，但对超参数极其敏感，换个随机种子就可能完全学不好。

SAC 试图一举解决这两个问题。它的答案是：**最大熵强化学习 + 离策略 Actor-Critic 架构**。

---

## 三、核心概念拆解

### 3.1 Actor-Critic 架构：教练与选手

这是几乎所有高级 RL 算法的基础结构，包含两个网络：

- **Actor（演员/策略网络）**：根据当前状态决定做什么动作。好比**选手**，负责实际执行。
- **Critic（评论家/价值网络）**：评估选手刚才的动作好不好，给出一个"评分"。好比**教练**，负责打分和指导。

传统 RL 中，选手和教练通常是"在线"配合的——选手每走一步，教练立刻点评，然后选手根据点评调整。但 SAC 的创新在于引入了**经验回放池（Replay Buffer）**：选手的所有动作都会被记录下来存进一个"录像带仓库"，教练可以从仓库里随机抽取过去的录像来学习，而不需要选手实时演示。这就是**离策略（off-policy）**。

### 3.2 最大熵（Maximum Entropy）：既要得分又要花样

这是 SAC 的灵魂。标准 RL 的目标函数是：

> 最大化累计奖励

SAC 把它改成了：

> 最大化累计奖励 + 最大化策略的熵

**熵（Entropy）** 在这里衡量的是策略的"随机程度"或"多样性"。熵越高，策略输出的动作越分散；熵越低，策略越倾向于只选某一个固定动作。

用一个温度参数 α 来控制"奖励"和"熵"之间的权衡：

```
目标 = 累计奖励 + α × 策略熵
```

- α 很大：策略会很随机，愿意尝试各种奇怪的操作（探索优先）
- α 很小：策略会收敛到近似确定性的最优动作（利用优先）

### 3.3 双 Q 网络（Twin Q-Networks）：两个裁判更公正

SAC 使用了**两个 Critic 网络**，而不是一个。每次更新时取两个 Critic 评分的**较小值**作为目标值。

为什么？因为 Critic 在学习过程中往往会**高估**某个动作的价值（正偏差）。想象两个老师给同一份作业打分，如果一个老师偏严一个老师偏松，取较低的那个分数反而更接近真实水平。这被称为"双重 Q 学习"（Double Q-Learning）的思想。

### 3.4 目标网络（Target Network）：慢半拍的教练

SAC 为 Value 网络维护了两套参数：

- **在线参数**：实时学习的"快教练"
- **目标参数**：缓慢跟踪的"慢教练"（通过指数移动平均更新）

慢教练的变化速度远快于快教练，避免了"教练自己也在变，导致学生永远跟不上"的问题。更新公式为：

```
慢教练参数 = τ × 快教练参数 + (1 - τ) × 慢教练参数
```

其中 τ 是一个很小的数（通常 0.005）。

---

## 四、SAC 的训练流程

整个算法可以概括为以下循环：

1. **收集数据**：Agent 根据当前策略与环境交互，记录 (状态, 动作, 奖励, 下一状态) 存入回放池
2. **采样批次**：从回放池中随机抽取一小批历史数据
3. **更新 Critic**：用 Bellman 方程计算目标值，最小化预测值与目标值的差距
4. **更新 Actor**：让策略朝向"高 Q 值 + 高熵"的方向改进
5. **更新 Value**：最小化软价值函数的预测误差
6. **更新目标网络**：慢教练微微向快教练靠拢

---

## 五、代码示例

### 示例 1：SAC 的 Critic 更新（软贝尔曼备份）

这个片段展示了 SAC 中最关键的更新步骤——如何计算软 Q 函数的目标值并进行更新。理解这段代码是理解 SAC 的核心。

```python
import torch
import torch.nn as nn
import torch.nn.functional as F
import torch.optim as optim


class DoubleQCritic(nn.Module):
    """
    SAC 的双 Q 网络 Critic。

    每个 Critic 接收 (状态, 动作) 并输出一个标量 Q 值。
    训练时取两个 Critic 输出的较小值，防止高估。
    """

    def __init__(self, state_dim, action_dim, hidden_dim=256):
        super().__init__()
        # 每个 Q 网络都是一个简单的 MLP
        for i in range(2):
            setattr(self, f'q{i}', nn.Sequential(
                nn.Linear(state_dim + action_dim, hidden_dim),
                nn.ReLU(),
                nn.Linear(hidden_dim, hidden_dim),
                nn.ReLU(),
                nn.Linear(hidden_dim, 1),
            ))

    def forward(self, state, action):
        """返回两个 Q 网络的原始输出 [q1, q2]"""
        sa = torch.cat([state, action], dim=1)
        q1 = self.q0(sa)
        q2 = self.q1(sa)
        return q1, q2


def soft_q_update(
    critic,
    critic_optimizer,
    target_value_net,          # 目标价值网络 V_bar
    states,                      # 当前状态 batch
    actions,                     # 执行的动作 batch
    rewards,                     # 获得的奖励 batch
    next_states,                 # 下一状态 batch
    dones,                       # 是否结束 batch (0/1)
    gamma=0.99,                  # 折扣因子
):
    """
    Critic 的更新步骤：最小化软贝尔曼残差。

    核心公式：
        Q_target = r + gamma * V_bar(s_next) * (1 - done)
        loss = MSE(Q_theta(s, a), Q_target)

    注意：这里取两个 Q 网络输出的较小值作为 V_bar 的输入，
    这来自 Double Q-Learning 的思想，用来缓解高估问题。
    """
    q1, q2 = critic(states, actions)

    # 计算目标价值：从目标网络采样
    with torch.no_grad():
        next_v = target_value_net(next_states)
        # next_v 的形状是 [batch_size, 1]
        targets = rewards.unsqueeze(-1) + gamma * next_v * (1 - dones.unsqueeze(-1))

    # 分别计算两个 Q 网络的损失
    loss_q1 = F.mse_loss(q1, targets)
    loss_q2 = F.mse_loss(q2, targets)
    loss = loss_q1 + loss_q2

    # 反向传播
    critic_optimizer.zero_grad()
    loss.backward()
    critic_optimizer.step()

    return loss.item()
```

**逐行解释**：

- `DoubleQCritic` 定义了两个独立的 Q 网络，每个都是输入 (状态, 动作)、输出单个 Q 值的 MLP。
- `forward` 返回两个网络的输出，不取 min——取 min 是在计算目标值的时候做的。
- `soft_q_update` 中，先用 `target_value_net` 获取下一状态的软价值估计，加上当前奖励，构成贝尔曼目标 `targets`。
- 最后分别计算两个 Q 网络的 MSE 损失并相加，同时更新两个网络。

### 示例 2：SAC 的 Actor 更新（重参数化技巧 + 熵正则化）

这个片段展示了 SAC 中 Actor 是如何更新的。关键点是：它不仅要让 Q 值尽可能高，还要让策略的熵尽可能大。

```python
import torch
import torch.nn as nn
import torch.nn.functional as F


class TanhGaussianPolicy(nn.Module):
    """
    SAC 的标准策略网络：输出高斯分布的均值和对数方差，
    然后通过 Tanh 压缩到 [-1, 1] 区间（适配连续控制任务）。

    使用 reparameterization trick 使得梯度可以通过采样路径反向传播。
    """

    def __init__(self, state_dim, action_dim, hidden_dim=256, log_std_min=-20, log_std_max=2):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(state_dim, hidden_dim),
            nn.ReLU(),
            nn.Linear(hidden_dim, hidden_dim),
            nn.ReLU(),
            nn.Linear(hidden_dim, 2 * action_dim),  # 均值 + 对数方差
        )
        self.log_std_min = log_std_min
        self.log_std_max = log_std_max
        self.action_dim = action_dim

    def forward(self, state):
        """前向传播：返回均值 mu 和对数标准差 log_std"""
        output = self.net(state)
        mu, log_std = output.chunk(2, dim=-1)
        # 裁剪对数方差，防止数值不稳定
        log_std = torch.clamp(log_std, self.log_std_min, self.log_std_max)
        std = log_std.exp()
        return mu, std

    def sample(self, state):
        """
        重参数化采样：
            z ~ N(0, I)
            a_tanh = tanh(mu + std * z)

        梯度可以沿着 mu + std * z 这条路径反向传播，
        而 tanh 只是最后的确定性变换。
        """
        mu, std = self.forward(state)
        # 从标准正态分布采样
        dist = torch.normal(mu, std)
        # 通过 Tanh 压缩到 [-1, 1]
        action = torch.tanh(dist)
        return action, mu, std
```

```python
def soft_actor_update(
    actor,
    actor_optimizer,
    critic,                       # 双 Q 网络
    target_value_net,             # 目标价值网络
    states,                       # 当前状态 batch
    alpha=0.2,                    # 温度参数（熵的权重）
    gamma=0.99,
    reparameterize=True,          # 是否使用重参数化技巧
):
    """
    Actor 的更新步骤：最小化 KL 散度，让策略逼近 exp(Q) 分布。

    等价于最大化：E[Q(s, a) - alpha * log(pi(a|s))]

    也就是说，好的动作（高 Q 值）概率要提高，
    但整体策略的熵也不能太低（-log(pi) 鼓励均匀分布）。
    """
    # 采样动作
    with torch.no_grad():
        action, mu, std = actor.sample(states)

    # 计算两个 Q 值，取较小值（Double Q 思想）
    q1, q2 = critic(states, action)
    q = torch.min(q1, q2)

    # 计算当前策略的熵：H = -log(pi(a|s))
    # 对于 tanh 压缩的高斯分布，需要修正雅可比行列式
    log_prob = -(torch.log(std * (2 * 3.14159) ** 0.5 + 1e-6)
                 + 0.5 * ((action - torch.atanh(action.clamp(-0.999, 0.999)) - mu) / std) ** 2)
    # Tanh 的雅可比修正
    log_prob -= torch.sum(torch.log(1 - action ** 2 + 1e-6), dim=-1, keepdim=True)
    entropy = -log_prob.mean()

    # Actor 损失 = E[-Q + alpha * log(pi)] = -E[Q] + alpha * E[log(pi)]
    # 我们希望最小化这个损失，即最大化 E[Q - alpha * log(pi)]
    actor_loss = (alpha * log_prob.mean() - q.mean()).mean()

    # 反向传播
    actor_optimizer.zero_grad()
    actor_loss.backward()
    actor_optimizer.step()

    return actor_loss.item(), entropy.item()
```

**逐行解释**：

- `TanhGaussianPolicy` 输出高斯分布的参数（均值和标准差），然后用 `tanh` 把动作限制到 `[-1, 1]`。这是 SAC 论文推荐的参数化方式，适用于大多数连续控制任务。
- `sample` 方法实现了重参数化技巧：先采样 `z ~ N(mu, std)`，再通过确定性函数 `tanh` 映射。这样梯度可以从 `z` 一路传回网络参数。
- `soft_actor_update` 中，先采样动作，再用双 Q 网络取最小值。然后计算策略的对数概率和熵。
- 最终 Actor 损失是 `alpha * log_prob - q` 的期望——既要让 Q 值高（`-q` 越小越好），也要让熵大（`log_prob` 越大越好，即 `-log_prob` 越小越好）。

### 示例 3：完整的训练循环骨架

```python
class SACTrainer:
    """SAC 训练器的骨架代码"""

    def __init__(self, state_dim, action_dim):
        self.actor = TanhGaussianPolicy(state_dim, action_dim)
        self.critic = DoubleQCritic(state_dim, action_dim)
        self.target_value = SoftValueNetwork(state_dim)

        # 目标网络使用缓慢更新
        self.target_tau = 0.005

        self.actor_optim = optim.Adam(self.actor.parameters(), lr=3e-4)
        self.critic_optim = optim.Adam(self.critic.parameters(), lr=3e-4)
        self.value_optim = optim.Adam(self.target_value.parameters(), lr=3e-4)

        self.replay_buffer = ReplayBuffer(capacity=1_000_000)
        self.alpha = 0.2  # 温度参数
        self.gamma = 0.99

    def soft_update(self, src, dst, tau=0.005):
        """指数移动平均更新目标网络"""
        for src_param, dst_param in zip(src.parameters(), dst.parameters()):
            dst_param.data.copy_(tau * src_param.data + (1.0 - tau) * dst_param.data)

    def train_step(self, batch_size=256):
        """单次训练迭代"""
        states, actions, rewards, next_states, dones = \
            self.replay_buffer.sample(batch_size)

        # Step 1: 更新两个 Critic
        soft_q_update(
            self.critic, self.critic_optim,
            self.target_value,
            states, actions, rewards, next_states, dones,
            gamma=self.gamma,
        )

        # Step 2: 更新 Actor
        actor_loss, entropy = soft_actor_update(
            self.actor, self.actor_optim,
            self.critic, self.target_value,
            states, alpha=self.alpha, gamma=self.gamma,
        )

        # Step 3: 更新软价值网络 V
        # (省略具体实现，逻辑类似 Critic 更新)

        # Step 4: 缓慢更新目标网络
        self.soft_update(self.target_value, self.target_value, self.target_tau)

        return actor_loss, entropy
```

---

## 六、SAC 的关键创新点总结

| 创新点 | 解决的问题 | 类比 |
|--------|-----------|------|
| 最大熵目标 | 探索不足、容易陷入局部最优 | 不只练一条路，多探索几条 |
| 离策略更新 | 样本效率低 | 用历史录像学习，不依赖实时演示 |
| 双 Q 网络 | Q 值高估导致策略崩溃 | 两个裁判取低分更公正 |
| 目标网络软更新 | 训练不稳定 | 慢教练比快教练更靠谱 |
| 重参数化采样 | 连续动作空间的梯度传播 | 让随机性也能"反向传播" |

---

## 七、SAC 为什么这么稳定？

对比 DDPG：

- **DDPG 是确定性的**：同一个状态永远输出同一个动作。一旦这个动作"错了"，整个训练就崩了。
- **SAC 是随机的**：同一个状态可能输出不同的动作。即使某个动作不好，其他动作还能继续贡献学习信号。

论文的实验结果显示，在 Humanoid（人形机器人）这种 21 维动作空间的高难度任务上，DDPG 完全无法学习，而 SAC 不仅学会了，而且**不同随机种子之间的性能差异极小**——这就是"稳定"的含义。

---

## 八、延伸思考

SAC 的最大熵思想影响深远。它之后的很多工作都建立在"探索 + 利用并重"的基础上，比如：

- **世界模型中的 SAC**：在学到的世界模型中用 SAC 训练，大幅减少真实环境交互次数
- **多模态策略**：最大熵天然适合多模态任务——如果到达目标有多种方式，SAC 会同时学会所有这些方式
- **离线 RL**：SAC 的离策略特性使其天然适合从静态数据集中学习

理解 SAC，是理解现代强化学习从"单纯追求得分"走向"追求鲁棒性和泛化能力"这一范式转变的关键一步。

---

## 九、自测题

1. SAC 中的"熵"到底是什么？它为什么能帮助探索？
2. 为什么 SAC 要用两个 Q 网络而不是一个？取最小值的原因是什么？
3. 如果 α（温度参数）设得非常大，策略会变成什么样？这对学习任务有什么影响？
4. 重参数化技巧在 SAC 的 Actor 更新中起到了什么作用？为什么不能直接用似然比梯度？

---

*参考：Haarnoja et al., "Soft Actor-Critic: Off-Policy Maximum Entropy Deep Reinforcement Learning with a Stochastic Actor," ICML 2018. arXiv:1801.01290*
