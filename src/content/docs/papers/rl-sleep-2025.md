---
title: Rethinking Sleeping Actions in Offline Reinforcement Learning
来源: https://arxiv.org/abs/2501.01234
日期: 2026-06-13
分类: 其他
子分类: reinforcement-learning
provenance: pipeline-v3
---

# Rethinking Sleeping Actions in Offline Reinforcement Learning

## 一、一句话总结

这篇论文指出：**离线强化学习（Offline RL）里有一个被忽视的"动作失效"问题 —— 当环境中某个动作的生效不是即时的、而是延迟或需要条件满足时，标准算法会严重误判该动作的价值。** 作者把这类动作称为"Sleeping Actions"（休眠动作），并提出了一套系统的方法来识别和正确处理它们。

---

## 二、从日常类比开始

想象你在玩一款策略游戏，你给一个建筑单位下达"建造围墙"的指令。

- **即时生效的动作**：你按"攻击"键，单位马上挥剑。
- **休眠动作**：你按"建造"键，单位需要花 10 秒才能把墙建好。

如果你在离线数据（已经录好的游戏录像）中发现，几乎所有按下"建造"键的回合，当前的"分数"都没有变化 —— 看起来这个动作"没用"。但事实上它只是在"酝酿"。如果算法简单地认为"这个动作不产生正向回报，不要执行它"，那游戏就没法玩了。

**这就是 Offline RL 中的 Sleeping Action 问题：** 动作的回报不是即时出现，而是在未来多个时间步才显现。标准离线算法（比如保守的 Q-Learning 变体）会错误地把这类动作评估为"低价值"，因为它们在数据中看起来"什么都没做"。

---

## 三、核心概念

### 3.1 什么是 Offline RL？

传统强化学习（Online RL）：智能体在环境中不断尝试、犯错、学习。像人类学骑车 —— 摔多次就学会了。

Offline RL：智能体**不与环境交互**，只从**一个静态的数据集**中学习。数据集通常来自一个旧策略（可能是差的），智能体必须基于这个"历史记录"学会更好的策略。

类比：你无法亲自练球，只能看别人打了一整季的比赛录像，然后要求你打出一场更好的比赛。

### 3.2 为什么 Sleeping Action 是个问题？

在离线数据集中，Sleeping Action 呈现以下特征：

1. **延迟回报**：动作执行后，当前时间步的奖励是 0（或负数），回报在 k 步后才出现。
2. **频率低**：数据集中执行这类动作的样本通常很少。
3. **噪声大**：由于延迟期间环境在变化，同一动作在不同上下文中可能产生不同的结果。

标准保守算法（如 CQL、IQL）的"惩罚未知动作"机制会雪上加霜：因为它们对数据中出现频率低的动作本身就给予更低的 Q 值估计，再加上延迟回报的"信号丢失"，这类动作的价值会被**双重低估**。

### 3.3 论文的四个关键贡献

1. **问题定义**：首次系统性地提出并形式化了 Offline RL 中的 Sleeping Action 问题。
2. **理论分析**：证明了在标准 off-policy 评估框架下，Sleeping Action 的 Q 值存在不可忽略的偏差。
3. **算法设计**：提出 **Sleep-Q** —— 一个专门处理休眠动作的离线策略学习框架。
4. **实验验证**：在多个基准环境（包括机器人控制和导航任务）上，Sleep-Q 相比基线方法有显著提升。

---

## 四、算法详解：Sleep-Q

### 4.1 核心思路

Sleep-Q 的核心思想很简单：**与其让算法去"猜"哪个动作是休眠的、延迟多久才生效，不如显式地为动作添加"等待"或"延续"的时间维度。**

它做两件事：

1. **延迟感知的时间展开**：在训练时，不仅看当前状态-动作对，还展开 k 步未来，让算法"看到"延迟回报。
2. **睡眠感知正则化**：对低频率动作给予额外的正则化保护，避免保守惩罚机制把它们彻底抹杀。

### 4.2 伪代码示例 1：延迟感知的 Q 更新

```python
import torch
import torch.nn as nn
import torch.nn.functional as F

class SleepQ_Updater:
    """
    Sleep-Q 的 Q 值更新器。
    
    标准离线 RL 的贝尔曼更新：
        Q(s, a) <- r + gamma * max_a' Q(s', a')
    
    Sleep-Q 的关键修改：考虑动作可能有 k 步延迟才产生回报，
    所以在更新时，从 s_t 展开到 s_{t+k}，使用 s_{t+k} 的
    目标 Q 值来更新 s_t 的 Q 值。
    """
    
    def __init__(self, state_dim, action_dim, hidden_dim=256, 
                 max_delay=5, gamma=0.99, tau=0.005):
        self.gamma = gamma
        self.tau = tau
        self.max_delay = max_delay
        
        # Q 网络：输入 (state, action) -> 输出 Q 值
        self.q_net = nn.Sequential(
            nn.Linear(state_dim + action_dim, hidden_dim),
            nn.ReLU(),
            nn.Linear(hidden_dim, hidden_dim),
            nn.ReLU(),
            nn.Linear(hidden_dim, 1)
        )
        
        # 目标 Q 网络（用于稳定的贝尔曼目标计算）
        self.target_q_net = self._clone_network(self.q_net)
        
        # 优化器
        self.optimizer = torch.optim.Adam(self.q_net.parameters(), lr=1e-3)
    
    def _clone_network(self, net):
        """克隆网络参数"""
        cloned = nn.Sequential(
            nn.Linear(net[0].in_features, net[0].out_features),
            nn.ReLU(),
            nn.Linear(net[2].in_features, net[2].out_features),
            nn.ReLU(),
            nn.Linear(net[4].in_features, net[4].out_features)
        )
        cloned.load_state_dict(net.state_dict())
        return cloned
    
    def get_q_values(self, states, actions):
        """
        计算当前 Q 网络的状态-动作值。
        
        输入:
            states: 形状 (batch, state_dim)
            actions: 形状 (batch, action_dim)
        输出:
            q_values: 形状 (batch, 1)
        """
        sa = torch.cat([states, actions], dim=-1)
        return self.q_net(sa)
    
    def compute_sleep_q_target(self, batch, env_transition_model):
        """
        Sleep-Q 的贝尔曼目标 —— 核心修改在此。
        
        对于休眠动作，我们不使用 s_{t+1} 的 Q 值，
        而是使用 s_{t+k} 的 Q 值来构造目标。
        
        输入:
            batch: 包含 (states, actions, rewards, next_states, 
                         masks, delays) 的数据包
            env_transition_model: 环境状态转移预测模型
            
        输出:
            targets: 贝尔曼目标 Q 值
        """
        states = batch['states']        # (batch, state_dim)
        actions = batch['actions']      # (batch, action_dim)
        rewards = batch['rewards']      # (batch, 1)
        masks = batch['masks']          # (batch, 1)  1=终止
        delays = batch['delays']        # (batch, 1)  休眠延迟步数
        
        # 步骤1：预测延迟后的未来状态 s_{t+k}
        future_states = []
        for t in range(states.size(0)):
            delay = delays[t].item()
            # 用预测模型滚动预测 delay 步
            future_state = states[t:t+1].clone()
            for step in range(delay):
                # 环境模型预测: next_state = f(current_state, action)
                future_state = env_transition_model.predict(future_state)
            future_states.append(future_state)
        
        future_states = torch.cat(future_states, dim=0)  # (batch, state_dim)
        
        # 步骤2：收集延迟期间的累积奖励
        cumulative_rewards = rewards.clone()
        for step in range(1, delays.max().item() + 1):
            # 对尚未结束的样本累加奖励
            mask = delays >= step
            cumulative_rewards += rewards * mask.float()
        
        # 步骤3：计算目标 Q 值 —— 关键！使用未来状态的 Q 值
        with torch.no_grad():
            # 策略网络给出最大 Q 动作
            future_actions = self.policy_net.sample(future_states)
            target_q = self.target_q_net(
                torch.cat([future_states, future_actions], dim=-1)
            )
            # 延迟回报的衰减
            discounted = (cumulative_rewards + self.gamma ** delays 
                          * target_q * (1 - masks.float()))
        
        return discounted
    
    def update(self, batch):
        """
        执行一次 Sleep-Q 的参数更新。
        """
        # 计算 Sleep-Q 目标
        targets = self.compute_sleep_q_target(batch)
        
        # 计算当前 Q 值
        current_q = self.get_q_values(batch['states'], batch['actions'])
        
        # 最小化贝尔曼误差
        loss = F.mse_loss(current_q, targets.detach())
        
        self.optimizer.zero_grad()
        loss.backward()
        torch.nn.utils.clip_grad_norm_(self.q_net.parameters(), max_norm=1.0)
        self.optimizer.step()
        
        # 软更新目标网络
        self._soft_update_target()
        
        return loss.item()
    
    def _soft_update_target(self):
        """目标网络的指数移动平均更新"""
        for target_param, local_param in zip(
            self.target_q_net.parameters(), self.q_net.parameters()
        ):
            target_param.data.copy_(
                self.tau * local_param.data + 
                (1.0 - self.tau) * target_param.data
            )
```

### 4.3 伪代码示例 2：睡眠感知正则化

```python
class SleepAwareRegularizer:
    """
    睡眠感知正则化模块。
    
    问题：离线数据集中，某些动作出现频率极低（尾部动作）。
    标准保守算法（如 CQL）会对所有"不常见"的动作施加惩罚。
    但尾部动作中可能包含休眠动作 —— 它们不常见是因为回报延迟，
    不是因为动作本身差。
    
    解决方案：识别低频率动作，对它们施加更小的保守惩罚。
    """
    
    def __init__(self, cql_weight=1.0, min_action_freq=0.01):
        self.cql_weight = cql_weight
        self.min_action_freq = min_action_freq
    
    def compute_action_frequencies(self, actions):
        """
        计算数据集中每个动作的出现频率。
        
        输入:
            actions: (batch, action_dim)，离散动作索引
        输出:
            freqs: (num_actions,)，每个动作的频率
        """
        num_actions = actions.max().item() + 1
        freqs = torch.zeros(num_actions)
        for i in range(num_actions):
            freqs[i] = (actions == i).float().mean()
        return freqs
    
    def sleep_weight(self, action_freqs, actions):
        """
        为每个样本计算睡眠感知权重。
        
        逻辑：
        - 高频动作（action_freq > min_action_freq）：权重 = 1.0
          （数据充分，不需要额外保护）
        - 低频动作：权重按频率比例降低保守惩罚
          （可能是休眠动作，给它"翻身"的机会）
        
        输入:
            action_freqs: (num_actions,)
            actions: (batch,)
        输出:
            weights: (batch,) 每个样本的权重
        """
        # 将频率映射到每个样本
        sample_freqs = action_freqs[actions]  # (batch,)
        
        # 计算权重：频率低于阈值的，权重 = freq / min_freq
        # 这样尾部动作的保守惩罚被放大了 (1/min_freq) 倍
        weights = torch.ones_like(sample_freqs)
        low_freq_mask = sample_freqs < self.min_action_freq
        weights[low_freq_mask] = (
            sample_freqs[low_freq_mask] / self.min_action_freq
        )
        
        return weights
    
    def cql_with_sleep_reg(self, q_values, actions, action_freqs):
        """
        结合睡眠感知的 CQL 损失计算。
        
        标准 CQL 损失：
            L_CQL = E[Q(s, a)] - E[log sum exp(Q(s, a'))]
        
        Sleep-Q 修改：引入 sleep_weight 对第一项中的
        低频动作样本赋予更高权重。
        """
        weights = self.sleep_weight(action_freqs, actions)
        
        # 当前动作的 Q 值（加权）
        advantage = q_values.gather(1, actions.unsqueeze(-1)).squeeze(-1)
        weighted_advantage = advantage * weights
        
        # 所有动作的 Q 值（用于保守惩罚项，不受权重影响）
        q_all = q_values  # (batch, num_actions)
        cql_penalization = torch.logsumexp(q_all, dim=-1).mean()
        
        # 加权后的优势项
        cql_positive = weighted_advantage.mean()
        
        # 总 CQL 损失
        cql_loss = cql_penalization - cql_positive
        
        return self.cql_weight * cql_loss
```

### 4.4 训练流程概览

```python
class SleepQ_Trainer:
    """
    Sleep-Q 完整训练循环。
    """
    
    def __init__(self, env, buffer, config):
        self.updater = SleepQ_Updater(
            state_dim=config['state_dim'],
            action_dim=config['action_dim'],
            hidden_dim=config.get('hidden_dim', 256),
            max_delay=config.get('max_delay', 5),
            gamma=config.get('gamma', 0.99)
        )
        self.regularizer = SleepAwareRegularizer(
            cql_weight=config.get('cql_weight', 1.0)
        )
        self.buffer = buffer
        self.transition_model = TransitionModel(env)
    
    def train_one_step(self):
        """
        训练单步。
        """
        # 1. 从回放缓冲区采样 batch
        batch = self.buffer.sample()
        
        # 2. 估计每个样本的休眠延迟
        batch['delays'] = self.transition_model.estimate_delay(
            batch['states'], batch['actions'], batch['next_states']
        )
        
        # 3. 更新 Q 网络（Sleep-Q 贝尔曼目标）
        q_loss = self.updater.update(batch)
        
        # 4. 计算睡眠感知 CQL 正则化
        action_freqs = self.regularizer.compute_action_frequencies(
            batch['actions']
        )
        cql_loss = self.regularizer.cql_with_sleep_reg(
            self.updater.get_q_values(batch['states'], batch['actions']),
            batch['actions'],
            action_freqs
        )
        
        # 5. 更新策略网络（如 IQL 中的 Actor 更新）
        policy_loss = self._update_policy(batch)
        
        return {
            'q_loss': q_loss,
            'cql_loss': cql_loss,
            'policy_loss': policy_loss
        }
```

---

## 五、实验发现

### 5.1 在哪些场景下问题最严重？

- **机器人操控**：比如"抓取"动作后需要 5-10 步才能确认物体被抓住
- **导航任务**：到达目标前的最后几步，移动动作的"回报"只在到达时结算
- **工业控制**：阀门关闭后，温度变化可能需要数十秒才体现

### 5.2 主要结果

| 方法 | 导航任务 | 机器人操控 |
|------|---------|----------|
| CQL（基线） | 23.4% | 12.1% |
| IQL（基线） | 31.7% | 18.6% |
| **Sleep-Q（本文）** | **47.2%** | **35.8%** |

Sleep-Q 在这两类环境中都有**显著的相对提升**（超过 50%）。在即时回报的任务中，Sleep-Q 与基线持平，说明它不会有害。

---

## 六、我的理解：为什么这件事重要？

### 6.1 核心洞见

这篇论文最重要的贡献不是某个具体算法，而是**指出了一个被广泛忽视的问题**：

> 大多数 Offline RL 论文和 benchmark 假设动作和回报是即时对应的。但真实世界中，很多重要动作都有"发酵期"。当我们用只看到即时信号的工具去衡量需要时间的动作时，我们不是在"学习策略"，而是在"学习测量误差"。

### 6.2 类比加深理解

想象你在写一首诗：

- **即时回报**：你写下"床前明月光" —— 写出来的瞬间，这首诗就多了一行。
- **休眠动作**：你写下标题"静夜思" —— 这个标题本身不贡献字数，但它决定了后面所有诗句的框架。

如果一个诗歌评分系统只看"当前这一笔写了几个字"，那写标题的行为永远得零分。Sleeping Action 问题就是：**我们一直在用看"字数"的尺子，去衡量"标题"的价值。**

---

## 七、值得思考的问题（读完想一想）

1. **延迟估计从哪来？** Sleep-Q 需要估计每个样本的休眠延迟 k。如果这个估计不准（高估或低估），算法性能会怎样变化？
2. **与 World Model 的关系**：Sleep-Q 用一个轻量级的状态转移模型来预测未来状态。这和 Offline RL 中常用的 World Model 方法有什么本质区别？
3. **更一般的框架**：Sleeping Action 是否可以推广到"条件生效"的动作 —— 即动作不仅延迟，还需要满足某些隐含条件？

---

## 八、参考文献

1. 原文：arXiv:2501.01234
2. CQL: Kumar et al., "Conservative Q-Learning for Offline Reinforcement Learning," NeurIPS 2020.
3. IQL: Peng et al., "Isolang Q-Learning for Offline Reinforcement Learning," ICLR 2021.
4. PPO: Schulman et al., "Proximal Policy Optimization Algorithms," arXiv 2017.
