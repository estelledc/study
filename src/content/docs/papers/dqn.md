---
title: DQN Deep Q-Network 深度强化学习
来源: Mnih et al., "Human-level control through deep reinforcement learning", Nature 2015 (vol 518, pp 529-533) / arXiv 1312.5602 (NIPS 2013 workshop)
---

## 一句话总结

DQN 是 2013-2015 年 DeepMind 提出的一类算法，把 1989 年 Watkins 的 **Q-learning**
（一种「表格式」强化学习算法）和 2012 年之后火起来的**深度卷积神经网络**接在一起，
让一个 agent 仅仅看着 Atari 游戏的原始像素 + 当前得分，就能在 49 个游戏上达到甚至
超越人类水平。它做对的两件关键事是 **experience replay**（把经验存进一个大缓冲池
里随机采样训练，破除时序相关性）和 **target network**（让 Q 学习的「目标值」每隔
若干步才更新一次，避免学习目标和参数同时变化导致发散）。这两个工程改造把「神经网
络当 Q 函数」从 1990s 一直没成功的尝试，变成了第一个真正可以稳定收敛的方案。它的
意义不在 Atari 本身，而在于：之后的 AlphaGo、AlphaZero、MuZero、PPO、A3C、DDPG、
SAC、Rainbow 全是在 DQN 思路上演化的，现代 LLM 的 RLHF 阶段虽然算法不是 DQN，但
所采用的「reward + policy + value」范式也是这条线上长出来的。

## 历史定位

把 DQN 这条线放在一个时间轴上看：

- 1957: Bellman 提出动态规划与 Bellman 方程，强化学习的数学基础
- 1988: Sutton 提出 TD(λ) — 把蒙特卡洛和动态规划合在一起，时序差分学习
- 1989: Watkins 博士论文「Learning from Delayed Rewards」— **Q-learning 诞生**
- 1992: Tesauro TD-Gammon — 用浅层神经网络当价值函数，在双陆棋上达到大师水平
  （但当时被认为「特例」，因为双陆棋有掷骰子的随机性，天然探索充分）
- 1995: Boyan & Moore 论文「Generalization in Reinforcement Learning: Safely
  Approximating the Value Function」— 警告说神经网络做 Q 函数会发散
- 2005: Riedmiller 提出 Neural Fitted Q Iteration (NFQ) — DQN 的直接前身，
  已经用了 mini-batch 训练神经 Q 函数，但没有 replay buffer 和 target net 这两个
  关键稳定化手段
- 2012: AlexNet — CNN 在视觉爆发，DeepMind 团队（Mnih, Kavukcuoglu, Silver）开
  始考虑用 CNN 直接吃像素当 Q 函数
- **2013-12: NIPS workshop 论文 arXiv 1312.5602「Playing Atari with Deep
  Reinforcement Learning」← 本文 part 1，7 个游戏**
- **2015-02: Nature 论文「Human-level control through deep reinforcement
  learning」← 本文 part 2，49 个游戏 + 完整算法**
- 2015-09: Double DQN（van Hasselt）— 解决 Q-learning 的 overestimation bias
- 2016-01: AlphaGo Lee Sedol — DQN 思想 + MCTS 在围棋上 4-1 击败李世石
- 2016-06: Dueling DQN（Wang）— 把 Q(s,a) 拆成 V(s) + A(s,a) 两个头
- 2016-11: A3C / A2C（Mnih）— 异步 actor-critic，policy gradient 路线开始上位
- 2016-11: Prioritized Experience Replay（Schaul）— 按 TD error 加权采样
- 2017-07: PPO（Schulman）— 简单稳定的 policy gradient，逐步取代 DQN 成主流
- 2017-10: Rainbow（Hessel）— 把 DQN 6 大改进合一，Atari 性能再上一个台阶
- 2017-12: AlphaZero — 不再依赖人类棋谱，self-play + DQN-like value head
- 2019-12: MuZero — 不再依赖环境模型，自己学一个 latent dynamics
- 2022-03: InstructGPT / RLHF — RL 范式被搬到 LLM 微调阶段，PPO 替代 DQN

DQN 在这条线里的位置：它是「**第一次让神经 Q 函数能在视觉输入上稳定训练**」
的方法，是从「表格式强化学习」走向「深度强化学习」的转折点。它之前 RL 是
统计学习的小角落，它之后 RL 是 AI 圈最热的方向之一。

> 怀疑：常见叙事说「DQN 把深度学习和强化学习结合起来」，但这话不太精确。
> Tesauro 1992 已经把神经网络和 TD 学习结合起来，Riedmiller 2005 也用了
> mini-batch SGD 训练神经 Q 函数。DQN 真正的创新不是「结合」，而是两个
> **稳定化技巧**——experience replay 和 target network。这两个看似工程的
> 改造之所以重要，是因为它们解决了 Boyan & Moore 1995 警告的「致命三联体」
> （function approximation + bootstrapping + off-policy）发散问题。所以
> DQN 是一篇**工程胜过理论**的论文，它没解决发散的理论问题，只是给出了
> 让它在实践中收敛的具体配方。

## Section 1: 动机 —— 像素到动作的端到端

强化学习在 DQN 之前有一个根本困境：

**状态空间太大，根本写不下表格**

经典的 Q-learning 把每个状态-动作对 (s, a) 存一格表格里，每次更新一格的值。
这种方法在井字棋（状态 ≈ 5478）、双陆棋（10^20 状态但可以用神经网络近似）这种
状态空间小、或者有强结构的问题上还能用。但 Atari 游戏的状态是 210×160 像素的
RGB 图像，状态总数大约是 256^(210×160×3) ≈ 10^240000——表格法连存都存不下，
更别说访问每个格子无数次直到收敛。

### 1.1 在 DQN 之前，怎么办

之前的标准做法是 **手写特征 + 线性函数近似**：

- 玩 Atari 的话，写一组特征（屏幕上某区域的颜色直方图、敌人位置、子弹数等）
- 然后用 Q(s, a) = w^T φ(s, a) 这种线性形式
- 每个游戏要单独写一套特征

这条路有两个硬伤。第一是**不通用**——每个游戏写一套特征，等于每次都重新做一遍人
工特征工程，写 49 个游戏就是 49 倍工作量。第二是**精度上限低**——线性近似的表达
能力有限，复杂的视觉模式（比如 Breakout 里球的运动方向）很难用手写特征表示。

### 1.2 CNN 在 2012 之后变成了通用视觉特征器

ImageNet 2012 上 AlexNet 用 CNN 把图像分类错误率从 26% 干到 15%，从此 CNN
成了「输入图像、输出语义特征」的标准工具。DeepMind 的核心问题就变成了：
**能不能直接拿 CNN 当 Q 函数？**

也就是说：

- 输入：原始像素（Atari 屏幕）
- 输出：每个动作的 Q 值
- 中间：让 CNN 自己学怎么把像素变成「这个状态值多少分」

如果能行，那就是一个**一套架构、一套超参、49 个游戏全跑**的方案，工程上极其优雅。

> 怀疑：这个动机听起来很像「我有锤子，所以一切都是钉子」——CNN 在视觉刚火，所以
> 来强行套到 RL 上。但事后看效果其实是对的，深层原因是 CNN 的 inductive bias
> （平移不变、局部特征）确实和 Atari 的视觉结构匹配。如果是 19 维线性 control
> 任务（比如 MuJoCo 的 Humanoid），CNN 这套就完全没用，得换 MLP。所以「用 CNN」
> 是工具适配问题，不是普适真理。

### 1.3 直接训练为什么会失败

把 Q-learning 直接套上 CNN 不行，主要有三个失败模式：

**失败一：相邻样本高度相关**

Atari 一秒 60 帧，相邻两帧只差很小一点（球往右移了 2 像素），如果按时序顺序喂
CNN 训练，相当于一直在过同一类样本。神经网络的 SGD 假设样本独立同分布，相关样
本会让梯度估计严重 biased。

**失败二：目标值在动**

Q-learning 的更新规则是

```
Q(s, a) ← Q(s, a) + α [ r + γ max_a' Q(s', a') - Q(s, a) ]
```

如果 Q 是神经网络，那 `max_a' Q(s', a')` 这个「目标」也是同一个网络算出来的。
当我更新参数让 Q(s, a) 更接近目标，目标本身也跟着动——就像追自己的影子，永远
追不上，甚至发散。

**失败三：数据稀缺**

每跑一帧只产生一条 transition (s, a, r, s')，扔掉就再也没了。神经网络需要海量
样本才能训出来，纯 on-line 训练样本利用率极低。

DQN 的两个核心设计正是分别解决前两个问题，附带也解决了第三个。

## Definition 1: Q 函数

强化学习里 **Q 函数** Q(s, a) 的定义是：

> 在状态 s 下采取动作 a，**之后按某个策略走下去**，能拿到的累计期望奖励。

数学上：

```
Q^π(s, a) = E [ r_t + γ r_{t+1} + γ^2 r_{t+2} + ... | s_t = s, a_t = a, π ]
```

其中：

- π 是策略（一个从状态映射到动作分布的函数）
- γ ∈ [0, 1) 是折扣因子，越小越「短视」
- r_t 是在时刻 t 拿到的即时奖励
- E 是对环境随机性 + 策略随机性的期望

如果存在一个**最优策略 π***，对应的 Q 函数叫 **最优 Q 函数 Q***：

```
Q*(s, a) = max_π Q^π(s, a)
```

最优策略可以从 Q* 直接读出来：在状态 s 下选 `argmax_a Q*(s, a)` 就是最优动作。
所以「学到 Q*」 ≡ 「学到最优策略」，这是 Q-learning 的核心简化。

## Definition 2: Bellman 方程

Q* 满足一个递归关系，叫 **Bellman 最优方程**：

```
Q*(s, a) = E_{s' ~ P} [ r + γ max_a' Q*(s', a') ]
```

直观读法：「在 s 做 a 的最优值」 = 「立即奖励 r」 + 「折扣后下一状态的最优值」。

这个方程的右边可以当成一个**操作子**作用在 Q 函数空间上：

```
(T Q)(s, a) = E [ r + γ max_a' Q(s', a') ]
```

T 叫 **Bellman backup 操作子**。最优 Q* 是 T 的不动点（T Q* = Q*）。

Q-learning 的本质就是：

1. 从环境采样 (s, a, r, s')
2. 把 `r + γ max_a' Q(s', a')` 当成 Q(s, a) 应该接近的目标
3. 朝这个目标移动一小步

如果 Q 是表格，Watkins 1989 证明在某些条件下会收敛到 Q*。如果 Q 是神经网络，
理论上**不保证**收敛——这就是 Boyan & Moore 1995 的「致命三联体」警告：
function approximation（函数近似）+ bootstrapping（用估计来估计）+ off-policy
（用旧策略数据训新策略）三个一起上，可能发散。

> 怀疑：DQN 没有解决致命三联体的理论问题。它只是经验上让训练「在这些 Atari
> 游戏上不发散」。后来 Sutton 等人花了 10+ 年研究 Gradient TD、Emphatic TD
> 这些有收敛保证的算法，但实际效果都不如 DQN。所以这是一个「实践跑赢理论」
> 的典型案例——理论说可能炸，实际做工程稳定化就行。但这意味着 DQN 在某些环
> 境下仍可能发散，只是 Atari 这个 benchmark 没暴露。

## Definition 3: Experience Replay

**Experience replay**：把每一步交互产生的 transition `(s_t, a_t, r_t, s_{t+1})`
存进一个**循环缓冲池 D**（capacity 通常 100 万条），每次训练时不是用最新的，而是
**从 D 里随机采样一个 mini-batch**（通常 32 条）来做梯度下降。

这个想法不是 DeepMind 首创，Lin 1992 博士论文就提到过。DQN 是第一次把它跟深度
网络结合做出大成果。

Experience replay 一次解决了三件事：

1. **打破时序相关性**：随机采样让 mini-batch 里的 32 条经验来自不同时间段，
   样本近似独立同分布，SGD 可以好好工作
2. **数据复用**：每条 transition 平均会被采样 8 次（取决于 buffer 大小和采样
   频率），样本利用率提升 1 个量级
3. **平滑分布转移**：on-policy 的话当前策略一变，数据分布马上变；replay 让训
   练数据的分布「混合了过去几小时的策略」，分布转移更平滑

代价：

- 需要一个 1M frames × 84×84 × 4 ≈ 28 GB（uint8）的 buffer，内存吃紧
- 引入了 **off-policy** 性质：buffer 里的旧数据是按当时的策略采的，但现在的
  Q 函数已经不是当时那个策略了，所以这是 off-policy learning。Q-learning 本
  身就是 off-policy 的（它学最优策略而不是当前行为策略），所以无所谓。但如
  果换 SARSA 这种 on-policy 算法就不能直接套 replay。

## Section 3.1: 网络架构

Nature 论文 Methods 节给出的具体架构（Atari 用）：

**输入预处理**：

- 原始 Atari 帧是 210×160 RGB
- 转成灰度（不需要颜色信息）
- 下采样 + 裁剪到 84×84
- **把最近 4 帧叠在一起**——单帧无法区分球往哪个方向飞，需要时序信息
- 最终输入张量：84×84×4

**3 个卷积层**（2013 NIPS 版本只有 2 个，Nature 2015 加深到 3 个）：

```
Conv1: 32 filters, 8x8 kernel, stride 4, ReLU
Conv2: 64 filters, 4x4 kernel, stride 2, ReLU
Conv3: 64 filters, 3x3 kernel, stride 1, ReLU
```

**2 个全连接层**：

```
FC1: flatten -> 512 units, ReLU
FC2: 512 -> K units (K = number of actions, 4 to 18)
```

**关键设计选择**：输出层每个 unit 对应一个动作的 Q(s, a) 值，**不是**「输入
(s, a) 输出一个数」。这样一次前向传播就拿到所有动作的 Q 值，避免每个动作各
跑一次网络（K=18 倍速度差距）。

![Figure 1 DQN Architecture](/papers/dqn/01-architecture.webp)

## Section 3.2: Experience Replay 的实现细节

**Buffer**：

- 容量 N = 1,000,000 transitions
- 数据结构是一个固定大小的 ring buffer
- 每条记录：(s, a, r, s', done)
- 用 uint8 存图像帧，省 4 倍内存

**Warm-up**：

- 在开始训练之前，先用**随机策略**跑 50,000 步填充 buffer
- 这一步是为了让 Q 函数还没学好之前 buffer 里就有多样性数据
- 否则刚开始 buffer 里全是「reset 后的开局」状态，会有严重 bias

**采样**：

- 每跑 4 帧才训练一次（不是每帧）——加速训练，因为采集比训练便宜
- 训练时 uniformly random 从 buffer 选 32 条
- 32 这个 batch size 在论文实验里表现最好

> 怀疑：这里的 hyperparameter 选择很多都是「经验上试出来」的，论文没解释为
> 什么是 50000 而不是 100000、为什么是 4 帧训练一次而不是 1 次。这种 hyper
> 敏感性是 DQN 一直被人吐槽的痛点——后来 Henderson 2017 在「Deep Reinforcement
> Learning that Matters」里就专门做实验验证：DQN 的随机种子方差比监督学习大
> 一个量级。换言之，DQN 的「人类水平」结果有一部分是 hyperparameter cherry
> picking + lucky seed。

## Section 3.3: Target Network

Target network 是 Nature 2015 版本相对 NIPS 2013 workshop 版本的一个新增
（这也是为什么 49 游戏 stable training 需要它）。

**做法**：

- 维护两份 Q 网络的参数：online 网络 θ 和 target 网络 θ^-
- online 网络每步都更新（SGD）
- target 网络只在每 C 步（C = 10000）才把 online 的参数复制过来：θ^- ← θ
- 计算 TD target 时**只用 target 网络**：

```
y_t = r_t + γ max_a' Q(s_{t+1}, a' ; θ^-)
```

- 训练 loss 用 online 网络：

```
L(θ) = E_{(s,a,r,s') ~ D} [ ( y_t - Q(s, a ; θ) )^2 ]
```

**为什么有用**：

回到「失败二：目标值在动」。如果不分两个网络，每次 SGD 更新 θ 都让目标 y_t 也
变了。target 网络冻结 θ^- 在 10000 步内不变，让 Q 学习有一个**稳定的目标**——
就像射移动靶难，但如果靶子每 10000 步才动一次，就好打多了。

代价：

- 训练前期慢（要等 target 网络更新了才能学到新东西）
- 多一份参数复制的开销（但 10000 步才一次，可以忽略）

> 怀疑：target network 的 C = 10000 是个「没什么好理论」的数字。太小（C=100）
> 等于没冻结，太大（C=100000）等于 target 永远落后。Nature 论文给了 C=10000
> 但没做 ablation 说明对这个数字有多敏感。后来 Soft Update（DDPG 那一套）改
> 成 θ^- = τθ + (1-τ)θ^-，τ = 0.001 这样平滑过渡，效果好得多。所以 hard
> update 这套设计后来基本被淘汰，但当时它是最简单可行的方案。

## Section 3.4: Training Loss 与优化

完整的 DQN training loss：

```
L(θ) = E_{(s, a, r, s') ~ D} [
    ( r + γ max_a' Q(s', a' ; θ^-) - Q(s, a ; θ) )^2
]
```

实际实现中还要处理 terminal state（done=True 时没有下一状态，target 就只是 r）：

```
y =
    r              if done
    r + γ max_a' Q(s', a' ; θ^-)   otherwise
```

**优化器**：

- NIPS 2013 版本用 RMSProp（lr = 0.00025, momentum 0.95）
- Nature 2015 版本仍用 RMSProp
- 现代实现常改用 Adam，效果差不多

**梯度截断**：

- TD error 被裁剪到 [-1, 1]（这等价于用 Huber loss 而不是 MSE）
- 没有这个裁剪，偶尔遇到大 reward（Atari 有些游戏一次给 +1000）会让梯度爆炸

**Reward 裁剪**：

- 所有 reward 也裁到 {-1, 0, +1}
- 这让不同游戏的 reward 尺度统一，可以用同一套 hyperparameter
- 代价：失去了「这次拿了 1000 分比那次拿 10 分重要」这种区分度

**ε-greedy 探索**：

- 行为策略：以 ε 概率随机选动作，以 1-ε 概率选 argmax_a Q(s, a)
- ε 从 1.0 退火到 0.1（前 1M 步）
- 测试时固定 ε = 0.05（保持少量随机以避免确定性循环）

> 怀疑：Reward clipping 到 {-1, 0, +1} 本质上是把所有 Atari 游戏强行变成
> 「平的奖励信号」。这让 DQN 在 Pong、Breakout 这种「频繁小奖励」的游戏好
> 用，但在 Montezuma's Revenge 这种「找钥匙才得 +100，其他都是 0」的游戏
> 失败——因为 clip 后大奖励也变成 +1，跟其他随机奖励没区别。所以 reward
> clipping 是 Montezuma 失败的部分原因，不是全部，但贡献不小。

## Section 4: 训练算法（Algorithm 1）

下面是 Nature 论文 Methods 给出的完整算法（伪代码）：

```
Algorithm 1  Deep Q-learning with experience replay

Initialize replay memory D to capacity N
Initialize action-value function Q with random weights θ
Initialize target action-value function Q_target with weights θ^- = θ

For episode = 1, M:
    Initialize sequence s_1 = {x_1} and preprocessed state φ_1 = φ(s_1)
    For t = 1, T:
        With probability ε select a random action a_t
        otherwise select a_t = argmax_a Q(φ(s_t), a; θ)
        Execute action a_t in emulator and observe reward r_t and image x_{t+1}
        Set s_{t+1} = s_t, a_t, x_{t+1} and preprocess φ_{t+1} = φ(s_{t+1})
        Store transition (φ_t, a_t, r_t, φ_{t+1}) in D
        Sample random minibatch of transitions (φ_j, a_j, r_j, φ_{j+1}) from D
        Set
            y_j = r_j                                  if episode terminates at j+1
                = r_j + γ max_a' Q_target(φ_{j+1}, a'; θ^-)  otherwise
        Perform gradient descent step on (y_j - Q(φ_j, a_j; θ))^2 w.r.t. θ
        Every C steps reset Q_target = Q  (i.e. θ^- ← θ)
```

**翻译成 Python 风格的 pseudo code**（更易读）：

```python
D = ReplayBuffer(capacity=1_000_000)
Q = QNetwork()              # online
Q_target = QNetwork()       # target, copy of Q
Q_target.load(Q)

env = AtariEnv("Breakout")
state = preprocess(env.reset())

for step in range(50_000_000):  # 50M frames per game
    # 1. Choose action (epsilon-greedy)
    eps = anneal(step)
    if random() < eps:
        action = env.action_space.sample()
    else:
        action = argmax(Q(state))

    # 2. Step env
    next_state, reward, done = env.step(action)
    next_state = preprocess(next_state)
    reward = clip(reward, -1, 1)

    # 3. Store transition
    D.add(state, action, reward, next_state, done)

    # 4. Train every 4 steps
    if step % 4 == 0 and len(D) >= 50_000:
        batch = D.sample(32)
        s, a, r, s2, d = batch

        with no_grad():
            target = r + (1 - d) * gamma * Q_target(s2).max(axis=1)

        loss = mse(Q(s)[range(32), a], target)
        loss.backward()
        optimizer.step()

    # 5. Sync target every 10k steps
    if step % 10_000 == 0:
        Q_target.load(Q)

    # 6. Reset on episode end
    if done:
        state = preprocess(env.reset())
    else:
        state = next_state
```

注意几个**容易写错的点**（这些是 Atari DQN 实现里反复踩的坑）：

1. `target = r + (1 - d) * gamma * Q_target(s2).max(...)`——`(1-d)` 这个 mask
   不能漏，否则 terminal state 后的「未来奖励」会被错误计入
2. `Q(s)[range(32), a]`——必须 gather 选中的 a 那一列，不能直接 max，因为
   行为策略是 ε-greedy，不一定选 max
3. target 算梯度要 `no_grad()`——target 网络只是查表，不能反向传播过它
4. preprocess 必须把 4 帧叠起来传给 Q，单帧 (84,84) 输入会让网络看不到运动
   方向，Pong 这种「球在哪」就完全学不出来

## Section 5: 实验

Nature 2015 论文核心实验是 **49 个 Atari 2600 游戏，同一架构 + 同一套超参，
跑 50M frames 每个游戏**。

### 5.1 评估方式

- 训练后用学到的 Q 函数，在每个游戏跑 30 个 episodes
- 每个 episode 用 ε = 0.05 的 ε-greedy（保持微弱探索避免死循环）
- 算平均得分
- 用 **normalized score** 报告：

```
normalized = (DQN - random) / (human - random) * 100%
```

这个公式让 100% = 人类水平，0% = 随机水平。负值表示比随机还差（DQN 几乎没出现）。

### 5.2 主要结果

49 个游戏中：

- **29 个游戏 DQN 超过人类水平**（normalized > 100%）
- **23 个游戏 DQN 超过 75% 人类水平**（实用意义上接近人类）
- **极端 super-human**：Video Pinball 2539%, Boxing 1707%, Breakout 1327%
- **极端失败**：Montezuma's Revenge 0%, Private Eye 1.7%

![Figure 2 Atari Results](/papers/dqn/02-atari-results.webp)

### 5.3 跟 baseline 的对比

论文比了 4 个 baseline：

- **Random**：完全随机策略
- **Linear function approximator**：Bellemare 2013 的 best linear baseline
- **Contingency**（Bellemare 2012）：用「玩家可控制的像素」当特征
- **Human**：DeepMind 招了一位职业玩家，玩 2 小时学会规则后玩 20 episodes

DQN 在 43/49 个游戏击败 best linear，在 29/49 个游戏击败人类。线性方法之前是
Atari 上的 SOTA，DQN 把它干得片甲不留。

### 5.4 ablation 实验

论文做了一个**关键的 4 路 ablation**（验证 replay 和 target net 各自的作用）：

|  | with Replay | without Replay |
|---|---|---|
| with Target Net | 316.81  (full DQN) | 10.16  (no replay) |
| without Target Net | 240.65  (no target) | 3.17  (neither) |

数字是 5 个游戏的中位数得分。结论：

- **既无 replay 又无 target**：3.17，几乎等于随机
- **只有 target，没 replay**：10.16，基本没救
- **只有 replay，没 target**：240.65，能玩，但不稳定
- **两个都用**：316.81，full DQN

也就是说**replay 的贡献远大于 target net**——单 replay 能把性能从 3 提到 240，
target net 锦上添花再提到 316。

> 怀疑：这个 ablation 做得很「cherry-picked」——只挑了 5 个 DQN 表现好的游戏。
> 如果在 Montezuma 这种 DQN 0% 的游戏做 ablation，replay 和 target net 加不加
> 都是 0%，因为 reward 太稀疏 ε-greedy 根本走不到正反馈状态。所以这个表说的
> 是「在 DQN 能学会的游戏上，replay 和 target net 各自的贡献」，不是「DQN 算
> 法的本质性贡献」。

### 5.5 训练资源

- 单游戏训 50M frames（约 38 天 wall-clock 的 Atari 游戏时间）
- 单 GPU（Nvidia GTX Titan）大约 7-10 天训完一个游戏
- 49 个游戏 × 10 天 = ~1.3 GPU-year

这个训练成本在 2015 年是相当昂贵的，也是 RL 一直被诟病 sample efficiency 差
的来源——人类玩 Atari 几小时就能玩好，DQN 要 38 天等价游戏时间。

## Section 6: 后续与衍生

DQN 之后强化学习「DQN 家族」的演化（每条都各成一篇论文）：

### 6.1 Double DQN (van Hasselt 2016)

发现：Q-learning 有 **overestimation bias**——max 操作系统性地高估了 Q 值。

修复：把 target 拆成两步：

```
y = r + γ Q_target(s', argmax_a' Q_online(s', a'))
```

用 online 网络挑动作，用 target 网络估值。在很多 Atari 游戏上提了 20-30%。

### 6.2 Dueling DQN (Wang 2016)

发现：Q(s, a) 在很多状态下，「a 选什么」其实不重要（比如 Atari 的中间过场画面
任何动作都行），但 Q 网络在这些状态浪费了大量参数学不同 a 的微小差异。

修复：把 Q 拆成两个 head：

```
Q(s, a) = V(s) + A(s, a) - mean_a A(s, a)
```

V(s) 估计「当前状态值」，A(s, a) 估计「动作 a 比平均好多少」。让网络可以专门学
价值函数和优势函数。

### 6.3 Prioritized Experience Replay (Schaul 2016)

发现：不是所有 transition 一样重要，TD error 大的（让网络「惊讶」的）样本应该
多采样。

修复：sampling probability ∝ |TD error|^α。需要 importance sampling 修正。
通常带来 +20% 性能。

### 6.4 Rainbow (Hessel 2018)

把 DQN 上的 6 个改进整合：

- Double DQN
- Dueling
- Prioritized Replay
- Multi-step learning（用 n-step return 而不是 1-step）
- Distributional RL（C51，预测奖励分布而不是期望）
- Noisy Networks（用参数化噪声替代 ε-greedy）

合在一起把 DQN 的 Atari median normalized score 从 ~120% 提到 ~230%。

### 6.5 Policy Gradient 路线（A3C / PPO / SAC）

DQN 是 value-based 方法（学 Q，从 Q 推策略）。另一条线是 policy-based：

- **A3C** (2016) / **A2C**：异步 actor-critic，多个环境并行
- **TRPO** (2015)：trust region 限制 policy 更新步长
- **PPO** (2017)：clip ratio 简化版 TRPO，**当前 RL 主流**
- **SAC** (2018)：连续动作空间 + maximum entropy 框架
- **DDPG** (2016)：Deep DPG，连续动作的 DQN 近亲

PPO 之后基本上「discrete action 用 PPO，continuous action 用 SAC」成了默认选
择，DQN 反而退居其次。

### 6.6 围棋 / 棋类 / 完美信息博弈

- **AlphaGo** (2016)：DQN 思想 + MCTS + 监督学习人类棋谱
- **AlphaGo Zero** (2017)：扔掉人类棋谱，纯 self-play
- **AlphaZero** (2017)：通用棋类（围棋 / 将棋 / 国际象棋）
- **MuZero** (2019)：不要环境模型，自己学 latent dynamics

### 6.7 现代 RLHF（LLM 微调阶段）

- **InstructGPT** (2022)：用人类反馈训 reward model，PPO 微调 GPT-3
- **ChatGPT / Claude / Gemini**：底层 RL 范式都源自 DQN 这条线
- **DPO** (2023)：直接策略优化，绕过 reward model 和 PPO
- **GRPO** (2024)：DeepSeek-R1 用，简化版 PPO

LLM RLHF 用的不是 DQN（PPO 更稳定），但「value/policy/reward」三件套的范式
是 DQN 时代奠定的。

## Section 7: 限制与后续问题

### 7.1 训练不稳定（即使加了 replay + target）

DQN 仍然对 hyperparameter 敏感：

- learning rate 调高 2 倍可能发散
- target sync 频率敏感
- random seed 之间结果方差大（Henderson 2017）

后来的工作（Soft Update / Layer Norm / Spectral Normalization 等）都是在补这块。

### 7.2 探索严重不足

DQN 用 ε-greedy 探索，本质是「随机抽奖」。在密集奖励游戏（Pong）够用，在稀疏
奖励游戏（Montezuma）完全失败——agent 永远走不到给奖励的状态。

后续工作：

- **Curiosity-driven exploration**（Pathak 2017）：把「预测错误」当内在奖励
- **RND**（Burda 2018）：random network distillation
- **Go-Explore**（Ecoffet 2019）：先探索再学习，专门攻 Montezuma

### 7.3 仅支持离散动作

argmax_a Q(s, a) 在动作空间小（Atari 4-18 个）时好算，但连续动作空间（机器人
关节角度）就没法 argmax。这是 DDPG / SAC / TD3 一系列 continuous control 算
法存在的原因。

### 7.4 Sample efficiency 极差

50M frames per game ≈ 38 天 Atari 时间。人类大概几小时就玩好了。原因是 RL 没
有像 supervised learning 那样的密集梯度信号——每个 transition 只有一个标量
reward 反馈，信息量极低。

后续工作：

- **Model-based RL**（Dreamer / MuZero）：自己学环境模型，sample 复用
- **Imitation learning** + RL：用人类演示作 warm-start

### 7.5 Atari 是不是过拟合的 benchmark

DQN 在 49 Atari 游戏调通后，整个 RL 圈花了 5 年时间在 Atari 上比谁高几个百分
点。但 Atari 是 1980 年代的低分辨率离散动作游戏，跟 real robot 控制差距巨大。

后续 benchmark：

- **DeepMind Control Suite**（2018）：连续控制
- **MuJoCo**（已成 RL 标配）
- **Procgen**（2019）：测泛化（每次随机生成关卡）
- **Crafter**（2022）：long-horizon + 探索

> 怀疑：Atari benchmark 让 RL 圈陷入了「优化已知问题」的局部最优 5-10 年。
> 真正的进步（探索、长期规划、迁移学习）需要的环境是 Atari 给不了的。这
> 跟监督学习圈深陷 ImageNet 5 年的情况类似——benchmark 能加速短期进展，
> 但也会限制视野。

## Section 8: 实现参考

DeepMind 的官方 Lua / Torch 实现，作为 paper 配套发布：

- 论文官方 Lua 代码（Torch7 实现）：链接示意
  `https://github.com/deepmind/dqn/blob/52d80244c4a6dc706e76eda3c44017b1c1cc4f29/dqn/NeuralQLearner.lua`
  这个文件就是上面 Algorithm 1 的逐字翻译，带完整的 replay buffer / target
  net / RMSProp 优化器实现

DeepMind 后续 JAX 重写版（更现代的实现）：

- acme RL 框架的 DQN agent：链接示意
  `https://github.com/deepmind/acme/blob/4525ade7015c46f33556e18d76a8d542b916f264/acme/agents/jax/dqn/learning.py`
  这版用 Haiku + Optax + Reverb（专门的 replay buffer 服务），把 2015 论文
  那一套生产化了

OpenAI 的 baselines 实现（TF1，社区广泛使用）：

- baselines deepq build_graph：链接示意
  `https://github.com/openai/baselines/blob/ea25b9e8b234e6ee1bca43083f8f3cf974143998/baselines/deepq/build_graph.py`
  这版的命名空间设计很清楚，TD target / loss / Q network 各是独立 graph
  function，对学算法的人易读

PyTorch 现代实现可以看 stable-baselines3 / cleanrl，代码量都在 200-400 行内。
跟 1970 年代写一个矩阵库一样，DQN 现在算「可以一个下午写完的入门项目」，但当
年这个 paper 改变了整个领域。

## 学到什么

1. **「让神经网络稳定训练」往往是工程问题，不是理论问题**。Boyan & Moore 1995
   理论上证明致命三联体可能发散，DQN 没解决理论，但用 replay + target net 这
   两个工程改造让它在实践中稳定下来——经验工程有时比理论突破更能推动领域。
2. **数据复用比新数据更重要**（在 RL 这种数据贵的场景下）。replay buffer 让
   每条 transition 平均被采 8 次，等于免费多了 8 倍数据。这条经验后来在 LLM
   预训练时代以「epoch repeat」的形式重现——重复使用高质量数据比一次性扫海
   量低质量数据更值。
3. **「同一套架构跑所有任务」是工程上极其有价值的指标**。DQN 49 个游戏不调
   超参的设定，后来直接启发了 GPT-3 的 zero-shot / few-shot benchmark 思路：
   「一个模型不微调直接跨任务」是一个可以衡量「通用性」的硬指标。
4. **失败案例（Montezuma 0 分）比成功案例更有信息量**。DQN 在 29 个游戏超
   人类很impressive，但真正推动后续 5 年研究的是它在 Montezuma 失败这件事。
   失败暴露了「探索」这个根本问题，催生了 curiosity / RND / Go-Explore 一
   整支文献。
5. **算法的「单步操作太简单」反而能稳定**。DQN 比起当时的 LSTM-based RL 简单
   得多，没有 recurrent state，没有复杂 credit assignment，但正是这个简单让
   它能稳定训练。这跟 Transformer 比 LSTM 简单（但 attention 更直接）的故事
   有相似之处——领域的进步不一定是「往复杂走」。
6. **同一份伪代码 vs 不同实现差距巨大**。DQN 的 Algorithm 1 看着简单，但
   Henderson 2017 等论文反复证明：不同 codebase 实现的 DQN 性能能差 2-3
   倍。reward clipping、frame stacking、ε 退火曲线、loss huber vs MSE、
   gradient clipping 任何一项写错都会让性能崩盘。这给了我一个深刻教训：
   **看 paper 学算法只是入门，真正读懂 = 能跑通参考实现 + 自己复现到匹配
   论文数字**。

## 关联阅读

- [[attention]]：Transformer 的 self-attention 是另一种「让网络自己学怎么处
  理序列」的范式，跟 DQN 的「让网络自己学价值函数」精神类似——都是把人手设
  计的归纳偏置（n-gram / hand-crafted feature）替换成端到端学习
- [[bert]]：BERT 的 MLM 用了大规模预训练 + 下游微调的范式，DQN 是「one model
  for many games」，BERT 是「one model for many NLP tasks」——通用性是两个
  时代的共同主题
- [[gpt-3]]：GPT-3 的 zero-shot 结果思想上和 DQN 的「同一架构 49 游戏不调超
  参」类似，都是衡量「真正泛化能力」的硬指标
- [[t5]]：T5 把所有 NLP 任务统一成 text-to-text，跟 DQN 把所有 Atari 游戏统
  一成「pixels-in, Q-out」是同种 unification 思路
- [[mamba]]：Mamba 在长序列建模上挑战 Transformer，类似 DQN 之后的 PPO 挑
  战 DQN——领域内不是只有一条路，关键是哪条路在哪个 regime 更适配
- [[scaling-laws]]：DQN 的 sample efficiency 困境后来被「scaling」部分缓解
  （更大模型 + 更大 batch + 更多数据），这跟语言模型的 scaling laws 是一脉
  相承的——只是 RL 还没找到自己的「干净 scaling 曲线」
