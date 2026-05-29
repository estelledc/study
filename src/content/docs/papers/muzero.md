---
title: MuZero Mastering Games by Planning with Learned Model
来源: Schrittwieser et al., "Mastering Atari, Go, Chess and Shogi by Planning with a Learned Model", Nature 2020 (vol 588, pp. 604-609) / arXiv 1911.08265
---

# MuZero — 不用规则也能 plan 的 model-based RL

## 一句话总结

MuZero 是 DeepMind 团队 2019 年提交、2020 年在 Nature 正式发表的工作（vol 588, pp. 604-609），
作者团队包括 Julian Schrittwieser、Ioannis Antonoglou、Thomas Hubert、Karen Simonyan、
Laurent Sifre、Simon Schmitt、Arthur Guez、Edward Lockhart、Demis Hassabis、Thore Graepel、
Timothy Lillicrap、David Silver 等 12 位研究者。它在 AlphaZero 基础上做了一个看似不大、
实际上影响深远的改造：**不再要求知道游戏规则**。AlphaGo 和 AlphaZero 都依赖一个完美的
环境模拟器（你给它一个状态和一个动作，它告诉你下一个状态是什么），所以只能用在像围棋、
国际象棋这种规则完全已知的封闭领域。MuZero 把"环境模拟器"也用神经网络学出来——
学的是 **latent space 的 dynamics**，而不是 raw observation 的 dynamics——然后把 MCTS
搬到这个 learned latent model 上跑。结果是：在 Atari 这种规则未知、observation 是像素、
reward 稀疏的领域，MuZero 也能达到 SOTA；同时在 Go / Chess / Shogi 上保持 AlphaZero 水准。

历史定位：从 2015 年 DQN（model-free，pixel-to-action，Atari 上首次超人）到 2017 年 AlphaZero
（model-based + perfect simulator + self-play，棋类全面超人），中间一直有一个 gap——
**没有规则的真实世界**怎么 plan？2018 年 Ha & Schmidhuber 的 "World Models" 第一次系统提出
"在 latent space 学 dynamics，再在 latent space 想象 rollout 来训 policy"，但只用 model-free RL
（CMA-ES）来用这个 model，没有真正 plan。MuZero 是第一次在 latent learned model 上做
**真 plan**（MCTS lookahead）并且全面超过 model-free 方法的工作。它把 RL 的两条路线（model-free
DQN/PPO 和 model-based AlphaZero）合并成一条：**learn a model + plan with it**。

设计动机：AlphaZero 的核心限制是 environment simulator —— 给它一个 (state, action)，必须有人手写
"这个状态执行这个动作后变成什么"。围棋有明确规则可以代码实现，Atari 也可以（emulator 就是
模拟器），但真实世界（机器人、推荐系统、广告竞价）没有这种 simulator。MuZero 的 trick 是：
**我不需要 simulator，我只需要一个能正确预测三件事的 model**——下一步的 reward、当前 state 的
policy prior、当前 state 的 value。只要这三个预测对了，MCTS 就能用这个 model 做 lookahead，
就能 plan。这个洞见把 model-based RL 从"必须重建真实环境"解放出来，变成"只需重建 RL 训练
所需的子集"。

关键超参数：MCTS 模拟次数 N（Atari 50, Go 800）、unroll 步数 K（5）、reanalysis 比例（80%）、
discount γ（0.997 Atari, 1.0 棋类）、Adam lr（0.05 棋类，0.0007 Atari）、batch size（1024）、
replay buffer（10^6 steps Atari）。模型规模：representation 网络是 ResNet-16（Atari）或 ResNet-20
（棋类），dynamics 和 prediction 网络也是 ResNet 块。整个系统在 Atari 上训练用了 ~1000 个 TPU
core 跑 12 小时（200K self-play games），在 Go 上 12 小时跑到 AlphaZero 水准。

影响：MuZero 标志着 model-based RL 在实用性上第一次彻底超过 model-free。后续的 EfficientZero
（2021 NeurIPS，把 Atari sample efficiency 提升 ~30 倍，达到人类玩 2 小时游戏的水平）、
ReZero、Sampled MuZero（连续动作）、MuZero Unplugged（offline RL）都在这条路线上展开。
真实世界应用包括：YouTube 视频压缩 codec 优化（DeepMind 2022 报告 4% bitrate 节省）、
Google 数据中心冷却（节省 ~40% 冷却电力）、芯片 floorplan 设计（AlphaChip 2024 Nature）。
MuZero 也是后来 Gemini / RT-2 / Genie 等"基础模型 + RL"路线的重要先验。

---

## Section 1: 动机 — AlphaZero 的盲点

### Section 1.1: AlphaZero 的依赖链

AlphaZero（Silver et al. 2017）的训练循环大致是这样：

```
loop:
    state = env.initial()
    while not env.terminal(state):
        action = MCTS(state, policy_net, value_net):
            for sim in range(800):
                # 关键：MCTS 内部要 simulator
                next_state = env.step(state, action)   # <-- 这里要规则
                ...
        state = env.step(state, action)               # <-- 这里也要规则
    train(policy_net, value_net, trajectory)
```

`env.step(state, action) -> next_state` 这个函数在围棋里是"在棋盘上落子 + 提子规则 + 判定违法
（自杀、劫）"，在国际象棋里是"按规则移动棋子"。这些都需要人写代码实现，并且必须 100% 正确——
MCTS 在 800 次 simulation 里任何一次状态转移错误都会让搜索质量崩溃。

### Section 1.2: 为什么真实世界没有这个 simulator

考虑一个场景：训练一个机器人手抓杯子。state 是相机像素 + 关节角度，action 是关节扭矩。
要实现 `env.step(state, action) -> next_state`：
- 你需要一个完整的物理引擎，模拟杯子的重力、摩擦、形变
- 模拟相机的光照、阴影、噪声
- 模拟关节电机的延迟、误差

PyBullet / MuJoCo / Isaac 这些物理引擎能做近似，但 sim-to-real gap 一直是 robotics 的核心难题。
推荐系统更糟：state 是用户历史 + 当前 context，action 是推什么内容，next_state 是用户看了内容
之后的反应——这个反应没法 simulate，只能实测。

### Section 1.3: MuZero 的简化目标

MuZero 的洞见是：**MCTS 不需要真实的下一个 state，它只需要能推导出 policy 和 value**。
更精确地说，MCTS 在每个节点上只用三个量：
1. 这个节点的 policy prior（用来选 action）
2. 这个节点的 value（leaf 的 backup 信号）
3. 边上的 reward（累积成 return）

如果有一个 model 能正确给出这三个量，**这个 model 内部 state 长什么样根本不重要**。它可以是
真实 state，也可以是任意 latent representation——只要预测对就行。

> 怀疑：这个洞见乍听很 clean，但实际上有个隐藏假设——latent state 必须保留足够的信息，让 dynamics
> 能多步 unroll 而不发散。如果 latent 维度太小或者训练信号太弱，5 步以后就完全失真了。论文里
> unroll 5 步是经过 hyperparameter search 的折中，不是理论保证。

### Section 1.4: vs 同期的 World Models 路线

Ha & Schmidhuber 2018 的 World Models 是 latent dynamics 的开山，但有两个关键区别：
- World Models 用 VAE 重建像素，强制 latent 包含视觉细节（很多对 RL 没用）
- World Models 用 model-free RL（CMA-ES）在 latent 里训 policy，不做 plan

MuZero 反过来：
- **不重建** observation（没有 decoder），latent 只保留对 reward/policy/value 有用的信息
- **真 plan**，MCTS 800 次 simulation 都在 latent 里跑

这个对比是 model-based RL 史上的关键分歧。MuZero 路线后来被证明在 sample efficiency 和最终
performance 上都更好。Ha & Schmidhuber 路线后来演化成 Dreamer 系列（DreamerV1/V2/V3），
保留重建但用 actor-critic，做出了 robotics 上的优秀工作。两条路线至今都活着。

> 怀疑：MuZero 不重建 observation 真的好吗？反方观点是：重建是一种 self-supervised 信号，
> 在 reward 稀疏时（Atari Montezuma's Revenge）能给 latent 提供更稠密的训练信号。EfficientZero
> 后来确实加回了 self-supervised consistency loss，承认了纯 reward/policy/value 信号不够稠密。

---

## Section 2: 三个核心定义

### Definition 1: Representation Function h(o) -> s

输入：observation o（Atari 是 96x96x32 frame stack；棋类是 19x19xN 的 board feature plane）
输出：latent state s（一个 8x8x256 的 ResNet feature map）

```
s_0 = h(o_t)
```

h 是一个 16-block 的 ResNet（Atari）或 20-block 的 ResNet（棋类）。它把 raw observation 编码
到 latent space，作为 MCTS root 节点的初始 latent state。

注意：**h 只在 root 调用一次**。MCTS 树内部所有非 root 节点的 latent state 都不是从 observation
重新编码出来的，而是通过 dynamics 函数 g 从 root unroll 出来的。这是 MuZero 跟典型 world model
的关键差异——后者每个时间步都重新 encode observation。

### Definition 2: Dynamics Function g(s, a) -> (s', r)

输入：当前 latent state s + action a（one-hot 或 embedding）
输出：下一个 latent state s' + 即时 reward r

```
(s_{k+1}, r_{k+1}) = g(s_k, a_{k+1})
```

g 同样是 ResNet。它取代了 AlphaZero 的 `env.step()`——把 latent state 和 action concat（或者 add
embedding）后过 ResNet，得到下一个 latent state 和一个标量 reward 预测。

### Definition 3: Prediction Function f(s) -> (p, v)

输入：当前 latent state s
输出：policy prior p（action 上的分布）+ value v（标量 expected return）

```
(p_k, v_k) = f(s_k)
```

f 是 AlphaZero 风格的 dual-head：共享 ResNet backbone，分出 policy head 和 value head。
policy head 输出 |A| 维 softmax，value head 输出标量。在棋类中 v 是 [-1, 1] 区间的 outcome
（输/赢/平），在 Atari 中 v 是 discounted return 的预测。

> 怀疑：三个网络共用 ResNet 风格的架构，但输入输出语义完全不同。论文没有详细讨论"为什么 g
> 也用 ResNet"——一个候选解释是 "ResNet 块带 skip connection，可以让 latent state 在多步 unroll
> 中保持稳定"。但这只是直觉，没有理论证明。后续工作（如 ReZero）就尝试了 transformer 风格的 g。

---

## Section 3: 训练目标 — 三个 loss 联合

### Section 3.1: 损失函数

MuZero 的总 loss 是 K+1 步上的累加（K=5 是 unroll 步数）：

```
L_total = sum_{k=0}^{K} [ L_p(p_k, pi_k) + L_v(v_k, z_k) + L_r(r_k, u_k) ] + c * ||theta||^2
```

其中：
- `L_p`：policy loss，cross-entropy 或 KL，让 prediction 的 p_k 拟合 MCTS 在第 k 步搜出来的 visit
  count 分布 pi_k
- `L_v`：value loss，scalar regression（categorical cross-entropy + transform，见 Section 4.3），
  让 v_k 拟合 n-step bootstrapped return z_k
- `L_r`：reward loss，同样是 categorical regression，让 r_k 拟合实际观测到的 reward u_k
- 最后是 L2 正则

### Section 3.2: 联合训练 vs 分阶段训练

AlphaGo 是 3 阶段训练（policy 监督 -> policy RL -> value RL），AlphaZero 是 2 head 联合训练
（policy + value 共享 backbone，单 loss）。MuZero 把这个 trend 推到极致：**3 个网络（h, g, f）
全部联合训练，单个 loss 反传梯度穿过所有 unroll 步**。

具体来说，每次 backprop：
- 从 replay 取一段 trajectory (o_t, a_{t+1}, u_{t+1}, ..., a_{t+K}, u_{t+K})
- 调用 s_0 = h(o_t)，然后递归 (s_{k+1}, r_{k+1}) = g(s_k, a_{t+k+1})，得到 s_0..s_K 和 r_1..r_K
- 对每个 s_k 调用 (p_k, v_k) = f(s_k)
- 把 p, v, r 都和 target 算 loss，求和，反传

梯度会穿过 g 的 K=5 层 unroll，所以 g 学到的不仅是单步 dynamics，而是"被 5 步未来的 reward/policy
/value 都验证过的"dynamics。这个端到端训练是 MuZero 工作的关键。

### Section 3.3: target 怎么来

- `pi_k`：MCTS 在 trajectory 第 t+k 步搜出的 root visit count（normalized）
- `z_k`：n-step bootstrapped return = sum_{i=0}^{n-1} gamma^i * u_{t+k+i+1} + gamma^n * v_{t+k+n}
  其中 v_{t+k+n} 是当时（产生 trajectory 时）MCTS 算出来的 root value
- `u_k`：实际从环境观测到的 reward（这是唯一不来自模型的"硬"信号）

> 怀疑：value target z_k 用的是"产生 trajectory 时的 MCTS value"，不是当前最新模型的预测。
> 这是 stale target——典型的 RL 稳定性 trick（DQN target network 也是这思路）。但这意味着如果
> 老模型的 MCTS 预测错了，error 会被当真值传到新模型。MuZero 的 reanalysis 机制（Section 6.2）
> 部分修复这个问题——用最新模型重跑 MCTS 算 fresh target。

### Section 3.4: 关于 reward 预测的 categorical regression

直接用 MSE 学 reward 在 reward scale 跨数量级时不稳定（Atari 不同游戏 reward 从 1 到 10000 不等）。
MuZero 用了一个叫 **categorical cross-entropy with two-hot encoding** 的技巧：把 reward 离散化
成 601 个 bin（-300 到 300），用 two-hot 表示连续值，loss 是 cross-entropy。inference 时再做
softmax + expected value 还原。这个技巧 borrowed from C51 distributional DQN（Bellemare et al. 2017）。

[google-deepmind/mctx mctx/_src/policies.py](https://github.com/google-deepmind/mctx/blob/4c1256754296e1f66577b05125daa2f16ac3d070/mctx/_src/policies.py)

这是 DeepMind 官方的 MCTS-in-JAX 实现，包含 MuZero / Gumbel MuZero / Stochastic MuZero
的 policy improvement 算子。

---

## Section 4: Algorithm 1 — MuZero MCTS 主循环

```
Algorithm 1: MuZero MCTS Search

Input:
  observation o_t                  # 当前 environment observation
  networks h, g, f                 # 三个学好的网络
  num_simulations N                # Atari 50, 棋类 800
  c_puct                           # PUCT exploration constant ~1.25

Initialize:
  s_0 = h(o_t)                     # 编码 observation 到 latent
  (p_0, v_0) = f(s_0)              # 给 root 算 policy prior 和 value
  root = Node(state=s_0, prior=p_0, value=v_0)
  root.add_dirichlet_noise()       # exploration noise on prior

for sim in range(N):
  # ============= Selection =============
  node = root
  path = [node]
  while node.is_expanded():
    a = argmax_a [
      Q(node, a) +
      c_puct * P(node, a) * sqrt(sum_a' N(node, a')) / (1 + N(node, a))
    ]
    node = node.children[a]
    path.append(node)

  # ============= Expansion =============
  parent = path[-2]
  a_to_leaf = parent.action_to(node)
  (s_new, r_new) = g(parent.state, a_to_leaf)    # latent dynamics step
  (p_new, v_new) = f(s_new)                       # leaf prediction
  node.state = s_new
  node.reward = r_new
  node.prior = p_new
  node.value = v_new
  node.expand()                                   # 加 |A| 个未访问 children

  # ============= Backup =============
  G = v_new                                       # bootstrap from leaf
  for n in reversed(path[:-1]):                   # 从 leaf 往上传
    n.cumulative_value += G
    n.visit_count += 1
    G = n.reward + gamma * G                      # discounted return

# ============= Action selection =============
visit_counts = [child.visit_count for child in root.children]
if temperature > 0:
  pi = softmax(log(visit_counts) / temperature)
  action = sample(pi)
else:
  action = argmax(visit_counts)

return action, pi, root.value
```

### Section 4.1: 关键特征

- **environment 永远不被调用**：这个 MCTS 整个跑在 latent space，所有 state transition 都是 g(s, a)
- **expansion 之后立刻 evaluate**：不像传统 MCTS 还要 rollout 到终局，MuZero 直接用 v_new 当估计
- **reward 沿路径累积**：传统 AlphaZero MCTS 没有 reward（围棋只有终局 outcome），MuZero 因为
  支持 Atari 这种密集 reward 场景，需要在 backup 时把 r_k 累加进 G

### Section 4.2: PUCT 公式中的 N(node) 处理

注意 selection 公式里的 `sqrt(sum_a' N(node, a'))`——这是父节点访问总数的平方根，作为 exploration
项的 scale。AlphaZero 论文里写的是 `sqrt(N(parent))`，MuZero 论文写的是 `sum_a N(s, a)`，两者
对内部节点等价（因为 visit count 是从 children 累加上来的）。

```python
def puct_score(parent, child, c_puct):
    pb_c = math.log((parent.visit_count + c_pb_base + 1) / c_pb_base) + c_puct
    pb_c *= math.sqrt(parent.visit_count) / (child.visit_count + 1)
    prior_score = pb_c * child.prior
    if child.visit_count > 0:
        value_score = child.reward + gamma * child.value
    else:
        value_score = 0
    return prior_score + value_score
```

实际工程实现里，c_puct 还会随 visit_count log 增长（`log((1 + N + base) / base) * c_init`），
这是为了防止 prior 在 N 很大时还主导选择。

[werner-duvaud/muzero-general models.py](https://github.com/werner-duvaud/muzero-general/blob/604fd785eefcf53ef26c329bde7c506bc248ee93/models.py)

这是开源社区影响最广的 MuZero PyTorch 实现，包含完整 MCTS / training loop / replay buffer。

### Section 4.3: scale invariant value transform

Atari reward 跨多个数量级（Pong ±21，Q*bert 25k+）。MuZero 用了一个 invertible transform：

```
h(x) = sign(x) * (sqrt(|x| + 1) - 1) + epsilon * x
h^-1(y) = sign(y) * ( ((sqrt(1 + 4*epsilon*(|y|+1+epsilon)) - 1) / (2*epsilon))^2 - 1 )
```

epsilon=0.001。训练时 value/reward target 经过 h(x) 压缩到 [-30, 30] 量级，方便用 categorical
regression；inference 时再用 h^-1 还原回真实 scale。

这个 trick 来自 Pohlen et al. 2018 "Observe and Look Further"。

> 怀疑：这种 reward transform 让训练稳定，但也意味着 MuZero 对 reward scale 不变性。如果你
> 把游戏 reward 全乘 1000，理论上学出的 policy 应该一样。但实际复现时，reward scale 改变会
> 影响 categorical regression 的 bin 分布，可能会让训练不稳定。这是隐含的 sensitivity。

---

## Section 5: 架构图解

![MuZero 三网络协作 h / g / f](/papers/muzero/01-architecture.webp)

上图展示了 MuZero 的三个网络如何协作：
- **representation h**（左中，红框）：把原始 observation o_t 编码成 latent state s_t（绿色）
- **dynamics g**（中右，蓝框）：吃 (latent state, action) 输出下一个 latent state + reward
- **prediction f**（下中，紫框）：吃 latent state，输出 policy 和 value

三个网络共同的关键约束：
1. h 只在 MCTS root 处被调用一次（图中左侧路径）
2. 树内部所有非 root 节点的 latent state 都由 g 从 root unroll 出来（图中右上路径）
3. 每个节点的 policy prior 和 value 由 f 提供（图中下方路径）
4. 没有 decoder——从 latent state 反推 observation 是不可能的，也不必要

![MuZero MCTS 在 latent space](/papers/muzero/02-mcts-latent.webp)

上图展示 MCTS 的四个阶段在 latent space 的执行：
- **selection**：从 root 沿 PUCT 最大的 action 一路下到 leaf（图中红色路径）
- **expansion**：在 leaf 调用 g 算下一个 latent state，调用 f 算 prior 和 value（图中红框）
- **simulation**：MuZero 没有传统 rollout，直接用 f 给的 value v 作为 leaf 估计
- **backup**：把 v 加上路径上累积的 reward 一路传回 root，更新每个节点的 Q(s,a) 和 N(s,a)

整个过程**完全发生在 latent space**，environment 在 MCTS 中永远不被查询——这是 MuZero 跟
AlphaZero 的本质区别。

---

## Section 6: 训练系统 — self-play + reanalysis

### Section 6.1: 分布式 self-play

```
Actor processes (1000+):
  loop forever:
    network = pull_latest_network()
    while game not over:
      action = MCTS(network, observation, num_sims=50 or 800)
      observation, reward = env.step(action)
    push_trajectory(replay_buffer)

Learner process:
  loop forever:
    batch = sample_from_replay(batch_size=1024)
    loss = compute_muzero_loss(network, batch)
    network.apply_gradient(loss)
    if step % save_interval == 0:
      publish_network()
```

actor 和 learner 完全异步：actor 用稍微旧的 network 做 self-play，trajectory 进 replay buffer，
learner 持续从 buffer 采 batch 训练。这种分离让 actor 数量可以独立 scale（更多 actor = 更快产生
trajectory），learner 不受 actor 速度限制。

### Section 6.2: Reanalysis — 关键 sample efficiency 技巧

直接用 actor 写入的 (o_t, a_t, pi_t, z_t) 作为训练数据有一个问题：pi_t 和 z_t 是 actor 当时用旧模型
搜出来的，模型已经更新很多次后这些 target 就过时了。

MuZero 的解决方案是 **reanalysis**：训练时有 80% 的 batch 不用原始 target，而是用最新模型
**重新跑 MCTS** 在原 trajectory 的 observation 上算新的 pi 和 v。这等于让训练数据"和模型一起进化"。

具体来说：
- 20% batch：用 actor 写入的原始 pi 和 v（fresh exploration data）
- 80% batch：取 trajectory 但用最新 network 重跑 MCTS 得到 pi'，用最新 v' 替换原始 v

reanalysis 让 MuZero 在 sample 数据较少（人类玩 ~200 hours 的等价数据）时仍能持续提升。
EfficientZero 后来把这个比例进一步推高，加上 self-supervised consistency loss，把 sample efficiency
提升 30 倍。

### Section 6.3: replay buffer 设计

- 大小：10^6 steps（Atari）/ 10^6 games（棋类）
- 采样：uniform 或 prioritized（PER）
- 每个 sample 包含：observation o_t（仅 root 需要）+ 后续 K=5 步的 (a, u)
- batch size：1024
- training steps：~1M（Atari）/ ~10M（棋类）

> 怀疑：replay buffer 设计里有个隐藏 trade-off——大 buffer 让数据多样但 stale，小 buffer 让数据
> fresh 但容易 overfit 当前策略。MuZero 选 10^6 是基于 Atari trajectory 长度（~10^4 step/game）
> 的 100 局窗口。换个领域（比如 long-horizon robotics）这个 size 可能完全不合适。

---

## Section 7: 实验结果

### Section 7.1: Atari 57 game suite

MuZero 在 Atari 57 game suite 上达到 mean human-normalized score = 4999%（中位数 731%），
全面超过：
- DQN（2015）：均值 ~250%
- IMPALA（2018）：均值 ~957%
- R2D2（2019）：均值 ~3596%
- Rainbow（2017）：均值 ~874%

这是 model-based RL 第一次在 Atari 全面超过 model-free SOTA。

### Section 7.2: Go / Chess / Shogi

在棋类上，MuZero 用同样的算法（不知道规则）达到了 AlphaZero（知道规则）相同甚至略好的水准：
- Go：超过 AlphaZero 的 ELO
- Chess：约等于 AlphaZero
- Shogi：超过 AlphaZero

这个结果非常 striking——明明 AlphaZero 有 oracle simulator，MuZero 还得自己学一个 model，
为什么不会更差？论文给的解释是：learned model 在 latent space 比真实 simulator 更"稠密"——
两个看似不同但战略等价的局面在 latent 里会被 map 到接近的点，让 MCTS 隐式做了 generalization。

### Section 7.3: ablation

论文里做了几个关键 ablation：
- 去掉 reanalysis：sample efficiency 大幅下降
- K=1（不 unroll）：performance 显著下降，证明多步 unroll 是必要的
- K=10：边际收益小，5 是 sweet spot
- value transform 去掉：reward scale 大的游戏完全不收敛

---

## Section 8: 后续工作 — MuZero 家族

### EfficientZero (Ye et al. 2021 NeurIPS)

把 Atari sample efficiency 提升 ~30 倍，达到人类等价 2 小时游戏数据上 191% mean score。
关键改动：
- self-supervised consistency loss（让 g 预测的下一个 latent 和 h 重新编码的 latent 接近）
- value prefix（用 LSTM 替代 MLP 预测 reward 累积）
- end-to-end environment value normalization

### Sampled MuZero (Hubert et al. 2021)

把 MuZero 推广到连续动作空间（关节扭矩这种）。原版 MuZero 在 expansion 时枚举所有 discrete
action 算 prior，连续空间不可能。Sampled MuZero 在 prior 上 sample K 个 action，只对这 K 个
expand。

### Stochastic MuZero (Antonoglou et al. 2022)

支持随机 dynamics（扑克、双陆棋）。把 g 改成 stochastic：g(s, a) -> distribution over (s', r)，
MCTS expansion 时把"chance node"（随机性来源）和 "decision node"分开处理。

### MuZero Unplugged (Schrittwieser et al. 2021)

完全 offline RL：只用预先收集好的 trajectory，不做 self-play。在 RL Unplugged benchmark 超过所有
baseline。关键改动是 100% reanalysis（既然没新数据，就用最新模型反复重新评估老 trajectory）。

[google/dopamine baselines/atari_lib.py](https://github.com/google/dopamine/blob/d3b6dbd55db8dfbe8c22b12c6d9d7ea649ec6998/baselines/atari/atari_lib.py)

Google 的 RL benchmark 框架，包含 DQN / Rainbow / IMPALA 的 reference 实现，可作为对比基线。

### AlphaTensor (Fawzi et al. 2022)

把 MuZero 用到数学发现领域：搜索新的矩阵乘法分解算法。在 4x5 * 5x5 矩阵乘法找到了比
Strassen 算法更少乘法次数的分解，2022 年 Nature 封面。证明了 MuZero 不只能玩游戏，能用于
组合优化和算法发现。

### 真实世界应用

- **YouTube codec**（DeepMind 2022）：MuZero 替代 VP9 的 RD 决策，节省 4% bitrate
- **Google data center cooling**：用 MuZero 类方法控制冷却阀门，节省 ~40% 冷却电力
- **AlphaChip**（Google 2024 Nature）：芯片 floorplan 设计，部署在 TPU v4/v5

---

## Section 9: 限制与缺陷

### Section 9.1: latent state 不可解释

最尖锐的批评：MuZero 学出来的 latent state 没有任何可解释性。你不能问"这个 latent 表示棋盘哪里
有子"或"这个 latent 表示 Atari 屏幕哪个区域"。它只是一堆 ResNet feature map。这意味着：
- debugging 很难——training 不收敛你不知道是 h 错了还是 g 错了
- transfer 很难——latent space 是任务专属的，迁移到新任务必须重训
- safety 很难——你没法 audit"这个 plan 在干什么"，只能看最终 action

> 怀疑：这是 model-based RL 在安全关键场景的根本障碍。AlphaFold（蛋白质结构预测）也是 black
> box 但人类有 wet lab 验证；MuZero 用在自动驾驶的话，"为什么这一步要刹车"这个问题永远没法
> 在 latent space 找到答案。

### Section 9.2: observation noise 敏感

Atari 是 deterministic emulator，observation 完全干净。真实世界（机器人摄像头、传感器）
observation 有噪声。MuZero 的 representation function h 没有显式的 noise robustness——它假设
o_t 干净到能直接映射到 latent state。robotics 里这往往不成立。

后续工作（如 Dreamer）通过 latent state 的 stochastic transition + KL regularization 来 model 噪声，
MuZero 路线对此一直缺位。

### Section 9.3: K=5 的 unroll 限制

dynamics 网络只在 5 步 unroll 上被验证。理论上 5 步以后 latent state 可能彻底偏离实际，但
MCTS 树深度可以远超 5（800 simulations 在棋类里树深度可达 ~30）。这意味着：在 MCTS 最深处
节点的 g 输出根本没有训练过，可能完全不可靠。论文用 PUCT 的 exploration 项让 visit count 集中
在浅层节点上来缓解这个问题，但本质上这是个 known limitation。

### Section 9.4: 训练成本

Atari 一个游戏要 1000 TPU-cores * 12 hours = 12000 TPU-hours。在 2019 年公开云价格下约 $50k+
（实际 DeepMind 内部成本更低，但仍然是个量级）。这意味着学术界很难复现，工业界只有 DeepMind
/ OpenAI / Anthropic 这种规模的机构能跑。EfficientZero 把成本降了 30 倍但还是远超 academic budget。

> 怀疑：这种"只有大公司能复现"的工作长远是 RL field 的健康问题。社区只能复现简化版（muzero-general
> 在 cartpole / lunar lander 上能跑），但完整 Atari setup 几乎没人独立复现过。这意味着论文的某些
> claim（特别是 ablation）实际上没有外部验证。

### Section 9.5: vs world model 路线的真实对比

MuZero 和 Dreamer 在 Atari 上的直接对比一直没有完整做过。两边各自报告自己的 SOTA，但
hyperparameter / data budget / network size 都不一样。直到 2023 年的 DreamerV3（Hafner et al.）
才在严格相同条件下做了对比，结果是 DreamerV3 在 sample efficiency 上略好，MuZero / EfficientZero
在 asymptotic performance 上略好。这个对比说明 latent dynamics 路线没有绝对赢家。

> 怀疑：MuZero 没有 reconstruction loss 这个设计决策，可能在复杂 visual observation（高分辨率
> 图像、多物体场景）下反而是个负担。Dreamer 的 reconstruction 提供了稠密 self-supervision，
> latent 自然学到 disentangled representation。MuZero 在这种场景可能需要 EfficientZero 的
> consistency loss 来弥补。

---

## Section 10: 学到什么 + 关联

### Section 10.1: 这篇论文的核心 insight

1. **plan 不需要真实 simulator**——只需要能预测 reward / policy / value 的 model
2. **latent dynamics 比 raw observation dynamics 更紧凑**——latent 只需保留 RL 训练所需的信息
3. **K 步 unroll 让 dynamics 学到 long-horizon consistency**，单步 dynamics 不够
4. **reanalysis 是 sample efficiency 的关键**——让老 trajectory 在新模型下复活
5. **三网络（h, g, f）联合训练**——梯度穿过 unroll，让三个网络互相约束

### Section 10.2: 设计模式

- **representation / dynamics / prediction 三分**：这个分解后来在 Dreamer / IRIS / TWM 等 world
  model 工作里都被复用，成为 model-based RL 的标准架构
- **plan in latent space**：所有后续 latent world model 工作的共同假设
- **reanalysis with latest network**：offline RL 的核心 trick，用在 MuZero Unplugged / CQL / IQL 等

### Section 10.3: 关联

- [[alphago]] — MuZero 的直接前作，AlphaGo / AlphaZero 是 perfect simulator + MCTS，MuZero
  把"perfect simulator"也学出来了
- [[dqn]] — MuZero 在 Atari 上替代的 model-free 路线，DQN 用 Q-learning + replay，MuZero 用
  policy iteration + MCTS + learned model
- [[ppo]] — model-free policy gradient 的代表，跟 MuZero 是两条路线；后来 RLHF 选 PPO
  是因为 LLM 没法 plan（动作空间是整个 vocabulary，MCTS 跑不起）
- [[attention]] — MuZero 的 ResNet 后来被 transformer 替代（Stochastic MuZero / IRIS 都用
  transformer 做 dynamics）
- [[gpt-3]] — 大语言模型 + RL 的组合（RLHF）是 MuZero 之后 RL 的另一条主线，但因为 LLM 推理
  太慢，没法用 MCTS，只能 model-free PPO；这是个开放问题

### Section 10.4: 关键 paper 链接（按时间）

- 2017 AlphaZero arXiv 1712.01815 — MuZero 的直接基线
- 2018 Ha & Schmidhuber "World Models" arXiv 1803.10122 — latent dynamics 路线开山
- 2019 MuZero arXiv 1911.08265 — 本文
- 2020 Dreamer arXiv 1912.01603 — 平行路线，latent dynamics + actor-critic
- 2021 EfficientZero arXiv 2111.00210 — sample efficiency 大跃进
- 2022 AlphaTensor Nature 610, 47-53 — MuZero 用于算法发现
- 2023 DreamerV3 arXiv 2301.04104 — world model 路线 SOTA
- 2024 AlphaChip Nature — MuZero 工业落地代表作

---

## Section 11: 第一性原理推导 — 假如重新设计

如果让我从零开始设计一个 model-based RL 系统，我会按这个顺序推导：

### Step 1: RL 的本质需要什么

RL 的目标是找到 policy 最大化 expected return。要做到这点，agent 需要：
- 知道当前状态有多好（value）
- 知道采取每个动作的相对收益（policy / advantage）
- 探索 vs 利用的平衡

### Step 2: 怎么估计 value

两条路：
- model-free：直接从 trajectory 学 V(s)（Monte Carlo / TD）
- model-based：学 model，用 model 推演未来 reward 累积

### Step 3: model-based 必须 model 什么

如果只 model `(s, a) -> r`（reward model），可以做单步规划但没法 lookahead。
如果只 model `(s, a) -> s'`（transition model），可以 lookahead 但需要还原 reward。
如果同时 model 两者，加一个 value model 当 leaf 估计，就能 plan。

### Step 4: 在哪个 space model

- raw observation space：维度高、有冗余、有噪声
- latent space：紧凑、可学、但没有 ground truth

权衡：latent space 训练信号必须够强（reward + value + policy + 可选 reconstruction）才不会 collapse。
MuZero 选了前三个，没要 reconstruction——赌的是这三个信号已经足够。

### Step 5: 怎么 plan

- 直接 rollout：deterministic policy 单条路径，没 exploration
- MCTS：用 PUCT 平衡 exploration / exploitation，policy prior 加速收敛
- gradient-based planning：可微 model 直接对 action 求梯度（CEM / SAC-like）

MuZero 选 MCTS——继承 AlphaZero 路线的成熟。Dreamer 选 actor-critic with imagined rollout。

### Step 6: 训练目标怎么定

- 单 loss 联合训练所有网络，让梯度互相约束
- target 用 fresh MCTS（reanalysis）防止 stale
- reward / value 用 categorical regression 处理 scale 跨度

这就是 MuZero 的完整推导链。每一步都是合理的设计选择，但每一步也都有反例（Dreamer 选了不同的
方案在不同 benchmark 上 SOTA）。

---

## Section 12: 一些 implementation gotchas

### Section 12.1: action embedding

dynamics 函数 g 接受 (s, a)。a 怎么喂进去？
- discrete action：one-hot embedding，concat 到 s 的 channel 维度（broadcast 到 spatial 维度）
- continuous action：MLP embed 到固定维度，再 concat
- 注意 broadcast 时要 spatial-aware，不能简单平铺（否则 ResNet 会忽略）

### Section 12.2: gradient scaling 在 unroll

unroll K=5 步时，靠近 root 的 s_0 会被 K+1 个 loss 反传梯度（每一步的 p, v 都对它求导），靠近
leaf 的 s_K 只被 1 个 loss 反传。这会让 root 学得太快、leaf 学得太慢。

MuZero 的解决方案是**梯度缩放**：每经过一次 g 的 unroll，梯度乘 0.5（论文里叫 "halve gradients
through dynamics"）。这是个看似 hacky 但 effective 的 trick。

### Section 12.3: replay buffer 的 trajectory 切片

存 trajectory 不是存 (s, a, r, s')，而是存整段 (o_0, a_1, r_1, ..., o_T)。训练时 sample 一个起点 t，
取 t 到 t+K 这段做 unroll。所以 replay 大小是按 game 算的，不是按 transition 算的。

### Section 12.4: target network

类似 DQN，MuZero 也用 target network 计算 bootstrapped value——但 MuZero 没有显式的 target
network，而是用 trajectory 写入时记录的 v_root。这等于一个 "frozen at write time" 的 target。

### Section 12.5: dirichlet noise 的强度

root prior 加 Dirichlet(alpha) noise 做 exploration。alpha 在 Atari 是 0.25，棋类是 0.3 (Go) /
0.15 (Chess) / 0.15 (Shogi)。alpha 越小越 sparse（鼓励试新 action），越大越 uniform（保持 prior
形状）。这个 hyperparameter 在新领域可能要重调。

---

## Section 13: 跟 LLM 的连接

2023-2024 一个热点是 "MuZero 思路用到 LLM"。OpenAI o1 / Anthropic Sonnet 3.5+ 的 chain-of-thought
推理被一些研究者解读为"在 latent thought space 做 plan"。但有几个本质障碍：

1. **action space 太大**：LLM 的 action 是 vocabulary（~10^5 token），MCTS 的 PUCT 公式分母
   `1 + N(s, a)` 在 visit count 不够时会让所有 action 看起来差不多
2. **reward 稀疏**：写完一个 token 没有立即 reward，只有完整答案对/错
3. **inference 太慢**：每次 expansion 要前向 LLM 一次，800 simulations * LLM forward = 太贵

[openai/lm-human-preferences src/policy.py](https://github.com/openai/lm-human-preferences/blob/78f0bb263116fc68dfe2cdce785386255f01febc/src/policy.py)

OpenAI 早期 RLHF 实现（PPO 路线，不是 MuZero），可作为 RL + LM 的对比 reference。

折中方案：
- **rStar / Quiet-STaR**：用 simplified MCTS（少 simulation、tree 浅）做 reasoning
- **Process reward models**：每步给 reward，让 plan 信号更稠密
- **Inference-time compute scaling**：o1 路线，类似 MCTS 但隐式

> 怀疑：MuZero 直接搬到 LLM 不会是终极方案。LLM 的 latent space 已经足够丰富，可能更好的方向
> 是"让 LLM 自己学会内部 plan"（这也是 o1 的设计哲学），而不是外挂 MCTS。MuZero 的真正继承
> 者可能是这种 implicit planner。

---

## 附录 A: 跟 AlphaZero 的逐项对比

| 维度 | AlphaZero | MuZero |
|------|-----------|--------|
| 是否需要 simulator | 是 | 否 |
| 网络数量 | 2（policy + value，共享 backbone） | 3（h, g, f） |
| 训练 loss | policy + value（cross-entropy + MSE） | policy + value + reward（全 categorical） |
| MCTS state | 真实 board state | latent state |
| Atari support | 否（需要规则） | 是 |
| Go ELO | 5185 | ~5200 |
| 训练成本（Go） | 5000 TPU-day | 12 TPU-day（论文 Table 4） |

注意训练成本一项：MuZero 反而比 AlphaZero 便宜很多——这是因为 latent state 比 board state 维度
更适合 ResNet（论文报告 inference 速度更快），而且 reanalysis 让数据复用率高。

## 附录 B: 一个最小 MuZero 伪代码

```python
class MuZero:
    def __init__(self):
        self.h = ResNet(in_channels=32, out_channels=256)   # representation
        self.g = ResNet(in_channels=256+|A|, out_channels=256+1)  # dynamics
        self.f = DualHead(in_channels=256, policy_dim=|A|, value_dim=1)

    def initial_inference(self, observation):
        s = self.h(observation)
        p, v = self.f(s)
        return s, p, v, 0.0   # initial reward = 0

    def recurrent_inference(self, s, a):
        s_new, r = self.g(concat(s, embed(a)))
        p, v = self.f(s_new)
        return s_new, p, v, r

    def loss(self, batch):
        L = 0
        for traj in batch:
            o_0, actions, rewards = traj
            s, p, v, _ = self.initial_inference(o_0)
            L += L_p(p, traj.pi[0]) + L_v(v, traj.z[0])
            for k in range(K):
                s, p, v, r = self.recurrent_inference(s, actions[k])
                L += L_p(p, traj.pi[k+1]) + L_v(v, traj.z[k+1]) + L_r(r, rewards[k+1])
        return L

    def mcts(self, observation, num_simulations):
        s, p, v, _ = self.initial_inference(observation)
        root = Node(state=s, prior=p, value=v)
        for _ in range(num_simulations):
            path = self.select(root)
            leaf = path[-1]
            parent = path[-2]
            a = parent.action_to(leaf)
            s_new, p_new, v_new, r = self.recurrent_inference(parent.state, a)
            leaf.expand(s_new, p_new, v_new, r)
            self.backup(path, v_new)
        return root.action_distribution(), root.value()
```

这是一个 ~30 行的 MuZero 核心，不含分布式训练 / replay / reanalysis 等系统部分。完整生产实现
（如 muzero-general）约 5000 行 Python。

## 附录 C: 为什么 MuZero 在围棋上不输给 AlphaZero？

直觉上 AlphaZero 有 oracle simulator 应该占便宜。但 MuZero 在 Go 上略好（论文 Figure 3）。
可能的解释：

1. **regularization 效应**：learned dynamics 不像 oracle 那样 deterministic，相当于在 MCTS 里
   引入了 implicit smoothing，让 PUCT 更鲁棒
2. **representation 自由度**：latent state 可以学到比 raw board 更紧凑的 task-relevant features
3. **梯度信号更稠密**：3 个网络联合训练让每个网络都受到全 K 步 unroll 的 gradient pressure，
   等价于一种 multi-task learning

这个观察在 follow-up 工作（AlphaTensor / AlphaDev）里被进一步验证：在算法发现这种"环境严格定义
但状态空间巨大"的领域，learned model 反而比 hardcoded simulator 表现好。

---

## 总结一句话回到开头

MuZero = AlphaZero - environment_simulator + learned_latent_dynamics。
表面上是减法，实际上是把 RL 从"必须知道世界规则"解放出来，向"只需要知道目标"靠近一步。
这是 model-based RL 历史上的关键里程碑，也是后来 Dreamer / EfficientZero / AlphaTensor 等
工作的共同前提。
