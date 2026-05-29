---
title: PPO Proximal Policy Optimization
来源: Schulman et al., "Proximal Policy Optimization Algorithms", arXiv 2017 / arXiv 1707.06347
---

# PPO — 强化学习的工业默认算法

## 一句话总结

PPO（Proximal Policy Optimization）是 OpenAI 的 John Schulman 团队 2017 年提出的强化学习算法（arXiv 1707.06347）。
从 2017 起 7 年内，PPO 成为 RL 领域的"工业默认"——OpenAI Five (Dota 2)、ChatGPT (RLHF)、
Stable Baselines 3 默认、几乎所有 robotics 论文都用 PPO 或其变种。

设计动机：vanilla policy gradient（PG）训练时大 step 容易毁掉 policy（catastrophic forgetting）。
Schulman 之前的 TRPO（2015）用 KL constraint 解决，但需要 second-order 优化（计算 Hessian-vector product）。
PPO 的核心创新：用 clipped surrogate objective L^CLIP = E[min(r·A, clip(r, 1-ε, 1+ε)·A)]
替代 KL constraint，让 first-order optimizer（Adam）就能稳定训练。

ε 通常取 0.2，意思是新 policy 的 action probability 不能比 old policy 大 1.2 倍或小 0.8 倍。
这个简单的 trick 让 PPO 比 TRPO 简单 10x（不需 conjugate gradient / Hessian）+ 比 vanilla PG 稳定 10x
（不会 catastrophic forgetting）。

7 年后 LLM RLHF 时代，PPO 仍是 ChatGPT / Claude / Gemini 等对齐训练的核心。
但 2023 后 DPO / APO / SimPO 等"无 critic"方法在 RLHF 蚕食 PPO 市场。
在 robotics / game AI 领域 PPO 仍是事实标准。

PPO 之所以能成为"默认"，原因有三：实现简单（< 200 行 PyTorch）、超参不敏感（ε=0.2 几乎所有任务都能用）、
sample efficiency 比 on-policy 老方法（A2C / vanilla PG）好一个量级。
也是因为这三点，PPO 成了 Stable Baselines 3 / Ray RLlib / CleanRL 三大 RL 框架的默认算法。

---

## Layer 0 — 论文档案速查

| 字段 | 值 |
|------|----|
| 标题 | Proximal Policy Optimization Algorithms |
| 作者 | John Schulman, Filip Wolski, Prafulla Dhariwal, Alec Radford, Oleg Klimov |
| 一作机构 | OpenAI |
| 发表 | arXiv 2017-07-20（无正式会议，arXiv-only） |
| arXiv | 1707.06347 |
| 引用数 | 25000+（截至 2024，RL 领域 top-3） |
| 实现仓库 | openai/baselines（官方）/ DLR-RM/stable-baselines3 / vwxyzjn/cleanrl |
| 主要竞品 | TRPO（2015，second-order）/ A2C/A3C（2016，async）/ DDPG（2016，off-policy） |
| 后来对手 | SAC（2018，off-policy）/ DPO（2023，no critic）/ SimPO（2024） |
| 工业用例 | OpenAI Five (Dota 2) / InstructGPT / ChatGPT RLHF / Robotics |
| Bench | MuJoCo（HalfCheetah / Hopper / Walker2d / Ant / Reacher / Swimmer）+ Atari ALE |
| 核心 trick | clipped surrogate objective + actor-critic + GAE |
| 默认超参 | ε=0.2, γ=0.99, λ=0.95, K_epochs=10, lr=3e-4, batch=2048 |
| 训练成本 | MuJoCo 1M steps ≈ 1 GPU-hour（A100） |
| 替代方案 | TRPO（更稳但慢 10x）/ DDPG（off-policy 但调参难）/ SAC（off-policy 默认） |
| 后续 | PPO-Penalty（自适应 KL）/ APO / DPO（RLHF 专用） |
| 一句话 Why | 用 clip 替代 KL，first-order 替代 second-order，让 RL 训练稳定且工程友好 |
| 一句话局限 | on-policy 数据效率比 off-policy（SAC）低；ε=0.2 是经验值无理论 |

---

## Section 1 — 动机：为什么需要 PPO

### 1.1 vanilla policy gradient 的核心痛点

policy gradient（PG）的核心 update：θ_new = θ_old + α·∇_θ J(θ)。
其中 J(θ) = E[Σ_t γ^t r_t]，∇_θ J(θ) = E[∇_θ log π_θ(a|s) · A(s,a)]。

问题：α 大了，policy 一步走太远，可能从"快走对了"突然变成"完全乱"。
RL 的 environment 是 non-stationary（policy 变了，sample distribution 也变），
所以 policy 一旦走偏，sample 也跟着偏，下一步 gradient estimate 就更错——这是 catastrophic forgetting。

具体场景：训练 Atari Breakout，policy 学会"接球+反弹"，但某个大 update 后 policy 变成"原地不动"，
再也收集不到正反馈样本，永远爬不出来。

### 1.2 TRPO 的解决方案：KL constraint

TRPO（Trust Region Policy Optimization, Schulman 2015）的思路：
每次 update 限制新旧 policy 的 KL divergence ≤ δ（trust region）。
数学：max L(θ) s.t. KL(π_old || π_new) ≤ δ。

TRPO 用 conjugate gradient + Fisher information matrix 求解 second-order 优化。
效果好但实现复杂：需要 Hessian-vector product、line search 回退、constraint 满足检查。
代码 1000+ 行，调试 hell。普通人根本写不对。

### 1.3 PPO 的核心 hypothesis

Schulman 假设：能不能用 first-order 优化（Adam）+ 一个简单的 clip 操作，
近似 TRPO 的 trust region 效果？

不需要 KL constraint，不需要 Hessian——只需要 clip(r(θ), 1-ε, 1+ε)，
就能让 policy 不走太远。这就是 PPO 的全部秘密。

---

## Section 2 — 三个 Definition + 数学

### Definition 1：Surrogate Objective L^PG

vanilla policy gradient 的目标：
J(θ) = E_τ~π_θ [Σ_t γ^t r_t]

但 trajectory τ 是用 π_θ 采样的，θ 一变 trajectory 也变，无法 off-policy reuse。
解决：importance sampling + truncation。

定义 surrogate objective：
L^PG(θ) = E_t [ π_θ(a_t|s_t) / π_θ_old(a_t|s_t) · A_t ]

其中 π_θ_old 是 collect data 时的 policy（固定），π_θ 是当前 update 的 policy。
这样可以多次 update（K epochs），不必每 step 重新 sample。

### Definition 2：Probability Ratio r(θ)

记 r_t(θ) = π_θ(a_t|s_t) / π_θ_old(a_t|s_t)。

r=1 表示新旧 policy 完全一致（刚开始 update 时）。
r>1 表示新 policy 更倾向选这个 action（增加概率）。
r<1 表示新 policy 不倾向选这个 action（降低概率）。

L^PG = E_t [ r_t(θ) · A_t ]。

问题：r 没有任何上界。如果 A_t 大且 r_t 也大，objective 可以无限增大，
gradient 把 r 推到 +∞——policy 会被毁掉。

### Definition 3：Clipped Objective L^CLIP

PPO 的核心：
L^CLIP(θ) = E_t [ min( r_t(θ)·A_t, clip(r_t(θ), 1-ε, 1+ε)·A_t ) ]

clip(r, 1-ε, 1+ε) 把 r 限制在 [0.8, 1.2]（ε=0.2 时）。
取 min 是 pessimistic bound：选两个里更小的那个。

#### 解释 clip 的两种情况

**case A>0（这个 action 是好的，应该增加概率）**：
- 如果 r ≤ 1+ε，objective = r·A，正常 gradient
- 如果 r > 1+ε，clip 把 r 卡在 1+ε，objective = (1+ε)·A，此时 ∂L/∂r = 0，gradient 消失

效果：policy 想增加这个 action 的概率，但最多增加到 1+ε，再多就不给 gradient 信号了。

**case A<0（这个 action 是坏的，应该减少概率）**：
- 如果 r ≥ 1-ε，objective = r·A（注意 A 是负的，r 越小 objective 越大）
- 如果 r < 1-ε，clip 把 r 卡在 1-ε，objective = (1-ε)·A，gradient 消失

效果：policy 想减少这个 action 的概率，但最多减少到 1-ε。

#### 为什么取 min？

min 的作用是 pessimistic：只在"r 走得太远"时停掉 gradient，
但"r 走错了方向"时不停（继续修正）。

举例 A>0 但 r=0.5（policy 不想选这个 action，但其实 advantage 大于 0）：
- clip(0.5, 0.8, 1.2)·A = 0.8·A
- r·A = 0.5·A
- min(0.5A, 0.8A) = 0.5A，正常 gradient 让 r 往上走

举例 A>0 且 r=1.5（policy 太想选这个 action，已经超过 1+ε）：
- clip(1.5, 0.8, 1.2)·A = 1.2·A
- r·A = 1.5·A
- min(1.5A, 1.2A) = 1.2A，gradient 消失（梯度对 r 为 0）

这就是 PPO 的 trust region 效果——不让 r 走太远。

---

## Section 3 — Algorithm 1: PPO 训练循环

```
Initialize policy π_θ, value function V_φ
for iteration = 1, 2, ... do
    # Phase 1: collect rollout
    Run π_θ_old (= current π_θ) in environment for T timesteps
    Compute advantage estimates A_1, ..., A_T using GAE

    # Phase 2: K epochs of update
    for epoch = 1, ..., K do
        Shuffle data, split into mini-batches of size M
        for each mini-batch do
            L^CLIP = E[min(r·A, clip(r, 1-ε, 1+ε)·A)]
            L^VF = E[(V_φ(s) - V_target)^2]
            L^ENT = E[-π_θ log π_θ]   # entropy bonus
            L = L^CLIP - c_1·L^VF + c_2·L^ENT
            θ ← θ + α·∇_θ L
            φ ← φ - α·∇_φ L^VF
        end for
    end for
end for
```

### 关键设计点

1. **K epochs（通常 10）**：对同一批 rollout 多次 update，提高 sample efficiency
2. **mini-batch（通常 64-256）**：标准 SGD 实践，避免 full-batch noise
3. **shuffle**：每 epoch 重新打乱，避免 trajectory order bias
4. **value loss + entropy bonus**：actor-critic 标配 + 探索正则化
5. **c_1=0.5, c_2=0.01**：value loss 权重 0.5，entropy 权重 0.01（默认）

---

## Section 4 — Actor-Critic + GAE

### 4.1 Actor-critic

PPO 是 actor-critic 算法：
- **Actor π_θ**：policy network，输入 state 输出 action distribution
- **Critic V_φ**：value network，输入 state 输出 expected return

实践中通常 actor / critic 共享 backbone（比如 CNN encoder），最后两个 head。
节省参数 + 共享表征。

### 4.2 GAE: Generalized Advantage Estimation

A_t = Σ_l (γλ)^l δ_{t+l}，其中 δ_t = r_t + γ V(s_{t+1}) - V(s_t)。

λ=1 等价于 Monte Carlo（高方差，无偏）。
λ=0 等价于 TD(0)（低方差，有偏）。
λ=0.95 是 bias-variance trade-off 的甜区，PPO 默认。

GAE 把 1-step TD error 加权累加，效果好于纯 MC 或纯 TD。

### 4.3 reward shaping

PPO 论文也讨论了 reward normalization：
- 把 reward 除以 running std
- value target 也做 normalization
- 实践证明这俩 trick 让训练稳定 2-3x

---

## Section 5 — PPO-Penalty 替代版

### 5.1 KL penalty 形式

L^KL(θ) = E_t [ r_t·A_t - β·KL(π_θ_old || π_θ) ]

β 控制 KL 的惩罚强度。和 clip 版本是两种"近似 trust region"的方式。

### 5.2 自适应 β

β 不是固定的——PPO 论文给了一个简单的 adaptive 规则：
- d = E[KL(π_old || π_new)]
- 若 d < d_target/1.5：β ← β/2（KL 太小，惩罚太重，放松）
- 若 d > d_target·1.5：β ← β·2（KL 太大，惩罚太轻，加强）

d_target 通常 0.01。

### 5.3 为什么社区主要用 Clip 版

PPO 论文的实验证明 Clip 比 Penalty 略好。
更重要的是 Clip 实现更简单——只需要一行 torch.clamp，不需要 KL 计算 + adaptive β。
所以 99% 的 implementation 都是 Clip 版。Penalty 版基本只在论文里提一下。

![](/study/papers/ppo/01-clip-objective.webp)

---

## Section 6 — 实验：MuJoCo + Atari

### 6.1 MuJoCo continuous control

PPO 在 7 个 MuJoCo 任务上 benchmark：
- HalfCheetah-v1：双足前进，reward = 速度
- Hopper-v1：单腿跳跃，reward = 前进 - control cost
- Walker2d-v1：双足走，reward = 前进 + 站立
- Ant-v1：四足走，reward = 前进 - control cost
- Reacher-v1：机械臂触点
- Swimmer-v1：游泳
- InvertedDoublePendulum-v1：双倒立摆平衡

每个任务 1M timesteps，3 random seed 平均。
结果：PPO > TRPO > A2C > vanilla PG（除了 Swimmer，TRPO 略好）。

### 6.2 Atari ALE

49 个 Atari 游戏，frame stacking + LSTM。
PPO 和 A2C 性能接近，A2C 略好（Atari 是 discrete action，A2C 优化得更成熟）。
PPO 在连续动作任务的优势更大。

### 6.3 OpenAI 内部实验

论文未明说但社区已知：OpenAI 内部 RoboSchool 实验、之后的 OpenAI Five，
PPO 都是首选——因为它在 wall-clock time 和 sample efficiency 之间平衡得最好。

![](/study/papers/ppo/02-mujoco-comparison.webp)

---

## Section 7 — 工业应用

### 7.1 OpenAI Five (Dota 2) 2018-2019

OpenAI Five 用 PPO 训练，128000 个 CPU + 256 个 P100 GPU，训练 10 个月。
2019 年 4 月以 2-0 战胜 OG（Dota 2 国际邀请赛冠军）。
这是 PPO 在大规模 scaling 下能跑的标志性事件。

技术细节：
- LSTM-based policy
- 80% self-play + 20% past policies
- reward shaping：KDA + tower kill + map control
- 380 个 hero pool 中只用 17 个

### 7.2 InstructGPT / ChatGPT RLHF（2022）

InstructGPT 论文（OpenAI 2022）描述了 RLHF 三步流程：
1. SFT（supervised fine-tuning on demos）
2. RM（reward model from preference data）
3. PPO（RL fine-tune SFT model with RM as reward）

PPO 在 RLHF 中的角色：
- policy = LLM（actor）
- reward = RM score - β·KL(π_LLM || π_SFT)（KL penalty 防止 reward hacking）
- value = separate value head on LLM

为什么用 PPO 不是别的：
- on-policy 适合 LLM（每个样本只 use 一次）
- clip 防止 LLM 走偏（语言模型 catastrophic forgetting 很严重）
- 工业实现成熟（trlx / TRL / DeepSpeed-Chat）

### 7.3 Robotics

Boston Dynamics、ETH Zurich ANYmal、CMU 机器人组都在用 PPO 训练 sim-to-real。
- domain randomization + PPO
- 1B+ timesteps in sim → policy transfer to real

为什么不是 SAC？
- SAC 是 off-policy，需要 replay buffer，sim 中可以但 real-time fine-tune 难
- PPO 是 on-policy，每次 collect 完直接 update 完丢弃，更适合 wall-clock real-time

### 7.4 Stable Baselines 3 默认

SB3 是 RL 最流行的开源库（10k+ star）。
默认 algorithm benchmarking 都用 PPO。
原因：实现稳定 + 调参容易 + 文档齐全。

---

## Section 8 — 后续 + 衍生

### 8.1 DAPO / DPO / SimPO（无 critic）

2023-2024 的 RLHF 趋势：去掉 critic，简化训练。

**DPO（Direct Preference Optimization, 2023）**：
直接用 preference pair 优化 policy，不训练 reward model 也不要 critic。
loss = -log σ(β·(log π_θ(y_w|x)/π_ref(y_w|x) - log π_θ(y_l|x)/π_ref(y_l|x)))。
优点：不需要 RL 循环，类似 SFT 训练。

**SimPO（2024）**：
比 DPO 再简化，去掉 reference policy。

**APO（Adversarial Preference Optimization, 2024）**：
DPO 变体，强化 rejected pair 的距离。

社区评价：DPO 在小模型 RLHF 上效果近似 PPO 但简单 5x；
但大模型 + 复杂 reward（如代码 / 数学）PPO 仍然更好。

### 8.2 IMPALA / R2D2（off-policy 改进）

**IMPALA（2018）**：DeepMind 的 distributed actor-critic，
用 V-trace 替代 PPO 的 importance sampling，scale 到 100+ actor。

**R2D2（2018）**：DeepMind 的 distributed Q-learning，64 actor 跑 Atari。

这些都是大规模 scaling 的工程方案，PPO 在此类场景下仍是 baseline 比对对象。

### 8.3 PPO 变种合集

- PPO-Atari（CleanRL）：针对 Atari 调优的 PPO
- PPO-LSTM：加 LSTM head 处理 partial observation
- PPO-Memory：加 transformer memory 处理 long horizon
- PPO-MultiAgent (MAPPO)：多 agent PPO
- PPO-Continual：持续学习 PPO

---

## Section 9 — 限制（≥ 6 条）

### 9.1 ε=0.2 是经验值，无理论支撑
PPO 论文用了 ε=0.1, 0.2, 0.3 做 ablation，发现 0.2 最好。
但这只是 MuJoCo 上的结果，没有理论证明 0.2 是 optimal。
不同任务可能需要不同 ε（比如 LLM RLHF 常用 0.05 或更小）。

### 9.2 on-policy sample efficiency 不如 off-policy
PPO 每次 update 完丢弃 trajectory，不能 replay。
和 SAC（off-policy + replay buffer）相比，sample efficiency 低 3-10x。
但 wall-clock time 因为可以 parallel rollout，反而 PPO 快。

### 9.3 K epochs 过大会 overfitting
论文推荐 K=10。
K=20 会让 policy 在同一 batch 上 update 太多次，发散。
K=3 又 sample efficiency 低。社区基本都用 K=10。

### 9.4 MuJoCo benchmark 内在偏差
PPO 在 MuJoCo 上调参好，但 MuJoCo 是简单的 continuous control。
真实机器人 / 复杂游戏 PPO 不一定 work，需要重新调参。
"在 MuJoCo 上 SOTA"≠"在你的任务上 SOTA"。

### 9.5 reward hacking
PPO 没有内建的 reward hacking 防护。
LLM RLHF 中常见：policy 学会输出 RM 喜欢的 pattern（比如冗长答案），但实际质量没提升。
需要额外 KL penalty + 人类抽检。

### 9.6 hyperparameter 之间耦合
ε / γ / λ / lr / K epoch / batch size 之间相互影响。
改一个参数往往要重新调其他几个。
有人认为 PPO 的"简单"是表象，深度调参时也很复杂。

---

## 怀疑总集

### 怀疑 1：PPO clip ε=0.2 是经验值

ε=0.2 是 PPO 论文 MuJoCo 实验调出来的，没有理论。
不同环境可能需要完全不同的 ε。
LLM RLHF 中很多团队用 ε=0.1 甚至 0.05，因为 LLM 的 action space 太大（vocab=50k+），
0.2 的 clip 范围太宽，会让 KL 过大。
我的怀疑：PPO 的"鲁棒性"很多时候是因为 RL 任务有大量随机性掩盖了次优 ε 的影响。
真要做 SOTA，每个任务都要调 ε。

### 怀疑 2：DPO 在 RLHF 蚕食 PPO

DPO（2023）已经在小型 LLM RLHF 上证明 ≈ PPO 效果。
但大模型 + 复杂 reward（比如 InstructGPT 那种综合 helpfulness/harmless/honest）
PPO 仍然占优。我猜 1-2 年内 RLHF 主流仍是 PPO，但 DPO 会从 SFT-like 任务扩展到部分 RLHF。
2026 后可能 70% RLHF 用 DPO/SimPO 类，30% 用 PPO（数学 / 代码 / 复杂奖励场景）。

### 怀疑 3：K epochs sample efficiency

论文用 K=10，但理论上 K=∞ 应该最 sample efficient（同一批数据榨干）。
为什么 K=10 反而最好？
我猜是因为 surrogate objective 在 K 大时偏差累积——policy 离 π_old 越远，
importance ratio r 估计越不准，clip 也救不回来。
K=10 是"在 r 估计准确的范围内多 update"的 sweet spot。

### 怀疑 4：MuJoCo benchmark 内在偏差

MuJoCo 任务都是 dense reward + 短 horizon + 低 dimension state。
PPO 在这上面调好不代表所有 RL 任务都能用 PPO。
sparse reward 任务（比如 Montezuma's Revenge）PPO 几乎完全不 work，需要 curiosity / RND。
long-horizon 任务（比如 StarCraft II）需要 hierarchical / memory，PPO 单独不够。
PPO 是"中等难度任务的最优解"，不是"所有 RL 任务的最优解"。

---

## GitHub Permalinks（链接示意）

- `https://github.com/openai/baselines/blob/3a4f9b8e2d1c5a7e6b8d2f4a9c3e7d1b5f8a4c2e/baselines/ppo2/ppo2.py` — OpenAI 官方 baselines 实现，参考用
- `https://github.com/DLR-RM/stable-baselines3/blob/8b2c4d6e1f3a5c7d9e1b3f5a7c9e1b3d5f7a9c1e/stable_baselines3/ppo/ppo.py` — Stable Baselines 3 默认 PPO
- `https://github.com/vwxyzjn/cleanrl/blob/2a4f6e8b1d3c5e7f9a1b3d5c7e9f1a3b5d7e9c1f/cleanrl/ppo.py` — CleanRL 单文件 PPO 实现，教学经典

---

## 实战例子：PyTorch 风格 PPO 训练循环伪代码

```python
import torch
import torch.nn as nn
import torch.optim as optim
from torch.distributions import Categorical

class ActorCritic(nn.Module):
    def __init__(self, obs_dim, act_dim):
        super().__init__()
        self.shared = nn.Sequential(
            nn.Linear(obs_dim, 64), nn.Tanh(),
            nn.Linear(64, 64), nn.Tanh(),
        )
        self.actor = nn.Linear(64, act_dim)
        self.critic = nn.Linear(64, 1)

    def forward(self, obs):
        h = self.shared(obs)
        return self.actor(h), self.critic(h)

def compute_gae(rewards, values, dones, gamma=0.99, lam=0.95):
    advantages = []
    gae = 0
    next_value = 0
    for t in reversed(range(len(rewards))):
        delta = rewards[t] + gamma*next_value*(1-dones[t]) - values[t]
        gae = delta + gamma*lam*(1-dones[t])*gae
        advantages.insert(0, gae)
        next_value = values[t]
    return advantages

def ppo_update(model, optimizer, obs, actions, log_probs_old, advantages, returns,
               eps=0.2, K=10, batch_size=64, c1=0.5, c2=0.01):
    advantages = (advantages - advantages.mean()) / (advantages.std() + 1e-8)
    n = obs.shape[0]
    for epoch in range(K):
        idx = torch.randperm(n)
        for start in range(0, n, batch_size):
            batch = idx[start:start+batch_size]
            logits, values = model(obs[batch])
            dist = Categorical(logits=logits)
            log_probs = dist.log_prob(actions[batch])
            ratio = torch.exp(log_probs - log_probs_old[batch])
            surr1 = ratio * advantages[batch]
            surr2 = torch.clamp(ratio, 1-eps, 1+eps) * advantages[batch]
            policy_loss = -torch.min(surr1, surr2).mean()
            value_loss = ((values.squeeze() - returns[batch])**2).mean()
            entropy = dist.entropy().mean()
            loss = policy_loss + c1*value_loss - c2*entropy
            optimizer.zero_grad()
            loss.backward()
            nn.utils.clip_grad_norm_(model.parameters(), 0.5)
            optimizer.step()
```

关键代码注解：
- `ratio = exp(log_probs - log_probs_old)` 是 importance sampling ratio r(θ)
- `torch.clamp(ratio, 1-eps, 1+eps)` 是 clip 操作
- `-torch.min(surr1, surr2).mean()` 是负的 L^CLIP（minimize loss = maximize objective）
- `nn.utils.clip_grad_norm_` 是 gradient clipping，PPO 默认 0.5（防止单步过大）

---

## 学到什么 + 关联

PPO 的核心 take-away：
1. 简单的 trick（clip）能打败复杂理论（trust region + second-order）
2. 工程实践 > 数学优雅性（PPO 比 TRPO 数学差但代码简单 10x）
3. 经验超参（ε=0.2, K=10）虽无理论但有可复用性
4. on-policy + actor-critic + GAE 是 RL 的稳定组合
5. RLHF 把 RL 推到 LLM 主舞台，PPO 是这场革命的工具
6. 未来可能 DPO 类替代 PPO 在 RLHF 的位置，但 robotics / game 短期不会变
7. RL 算法选型："简单 + 鲁棒"比"理论优雅"更值钱

关联笔记：
- [[dqn]] — RL 经典 value-based，PPO 是 policy-based
- [[attention]] — Transformer 在 PPO-LSTM / PPO-Transformer 中作为 backbone
- [[gpt-3]] — InstructGPT 的 base model，PPO 在 RLHF 中 fine-tune
- [[bert]] — pre-train 范式启发 SFT + RM + PPO 的 RLHF 三步
- [[t5]] — text-to-text 框架，RLHF 也是文本生成对齐
- [[chinchilla]] — scaling law，影响 PPO 在大模型 RLHF 中的算力分配
- [[mamba]] — 新架构，未来 PPO backbone 选型可能从 Transformer 切到 SSM

下一步学习方向：
- 读 InstructGPT / ChatGPT 论文，理解 PPO 在 LLM RLHF 中的具体 reward / KL 设计
- 实现 CleanRL 的 ppo.py（单文件 < 300 行），跑通 CartPole + LunarLander
- 对比 DPO 实现，理解"无 critic"为什么对 RLHF 仍然 work
- 学 GAE 的 bias-variance tradeoff 数学推导
- 学 TRPO 的 conjugate gradient 实现，理解为什么 PPO 比它简单 10x
