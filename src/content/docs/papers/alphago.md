---
title: AlphaGo Mastering Go with Deep Neural Networks
来源: Silver et al., "Mastering the game of Go with deep neural networks and tree search", Nature 2016 (vol 529, pp. 484-489)
---

# AlphaGo — 第一个击败人类围棋顶尖棋手的 AI

## 一句话总结

AlphaGo 是 DeepMind 团队 2016 年在 Nature 发表的工作（vol 529, pp. 484-489），
作者团队包括 David Silver、Aja Huang、Chris J. Maddison、Arthur Guez、Laurent Sifre、
George van den Driessche、Julian Schrittwieser、Ioannis Antonoglou、Veda Panneershelvam、
Marc Lanctot、Sander Dieleman、Dominik Grewe、John Nham、Nal Kalchbrenner、Ilya Sutskever、
Timothy Lillicrap、Madeleine Leach、Koray Kavukcuoglu、Thore Graepel、Demis Hassabis 等
20 多位研究者，标志着深度强化学习在完美信息博弈领域第一次彻底战胜人类。

历史定位：从 1997 年 IBM Deep Blue 击败 Kasparov（国际象棋）到 2016 年 AlphaGo 击败 Lee Sedol（围棋），
中间经过了 IBM Watson 2011（自然语言问答）、DQN 2015（Atari 像素到动作）等几个重要节点。
但围棋因为状态空间是国际象棋的 10^50 倍（约 10^170 vs 10^120），传统 alpha-beta search + 评估函数
无法在 brute force 路径上 scale，所以围棋一直被视为 AI 的"圣杯"。AlphaGo 用 deep RL + MCTS
的组合解决了这个问题，并且开启了 AlphaGo Zero（2017，完全 self-play）、AlphaZero（2017，通用棋类）、
MuZero（2019，model-based + 规则未知）等一系列后续工作。

设计动机：围棋每步约有 250 个合法落子（branching factor），平均一局 150 步，brute force search 不可能。
人类棋手的强项是"直觉"——一眼看出哪几个点值得算。AlphaGo 用两个 CNN 模拟这种直觉：
**policy network** 给出"应该考虑哪些落子"（policy prior），**value network** 给出"这个局面对我有利还是不利"（value estimate）。
然后用 **Monte Carlo Tree Search (MCTS)** 把两者结合起来做局部 lookahead search。
三阶段训练：(1) supervised policy 模仿专业棋手棋谱（KGS 30M 局面）；
(2) RL policy 用 self-play 强化（REINFORCE 算法）；
(3) value network 用 RL policy 自对弈数据学习局面评估。

ε 不是 PPO 风格的 clipping 参数（这里没有 clipping），核心 hyperparameter 是 MCTS 的 exploration 系数 c
（约 5）和 rollout / value 混合权重 λ（约 0.5）。Nature 论文里 AlphaGo 用了 1920 CPU + 280 GPU 分布式 search，
对每步搜索约 10000-100000 次 simulation。这个 compute 量级在 2016 年是天文数字。

影响：AlphaGo 2015 年 10 月以 5-0 击败欧洲冠军 Fan Hui（2 段，欧洲围棋冠军），2016 年 3 月以 4-1
击败 Lee Sedol（9 段，世界冠军级）。这是第一次 AI 在 19×19 标准围棋击败 9 段职业棋手。
此后 DeepMind 继续推出 AlphaGo Master（2017 年初网络版以 60-0 击败众多职业棋手）、
AlphaGo Zero（2017 Nature，完全 self-play 不用人类棋谱，比 AlphaGo Lee Sedol 版强 100 ELO）、
AlphaZero（2017 arXiv，通用 board game，4 小时学会国际象棋超过 Stockfish）、
MuZero（2019 Nature，规则未知也能 plan）。AlphaGo 是 2010s deep RL 黄金时代的标杆工作，
也是 DeepMind 商业价值的核心证据（Google 2014 年以约 5 亿美元收购 DeepMind 的决策被这个工作完全验证）。

---

## Section 1: 动机 — 为什么围棋比国际象棋难 50 个数量级

### 状态空间对比

国际象棋：每步约 35 个合法走法，平均 80 步，状态空间 ~35^80 ≈ 10^123。
围棋：每步约 250 个合法落子，平均 150 步，状态空间 ~250^150 ≈ 10^359（去除非法局面后约 10^170）。

10^170 是什么概念？已知宇宙的原子总数约 10^80。围棋状态数远超宇宙原子数。
brute force enumeration 在物理上不可能，连 sample search 都很难——random rollout 需要走到终局才能评估，
而围棋判定胜负要数地（计算 territory），不像国际象棋有 checkmate 这样的即时终止条件。

### Deep Blue 路径为什么不能复用

1997 年 Deep Blue 击败 Kasparov 用的核心技术是 **alpha-beta search + 评估函数 + opening book + endgame database**：
- alpha-beta search：剪枝过的 minimax，深度 14-20 ply
- 评估函数：人类专家手工设计（material balance + positional features，几百个 feature）
- opening book：3700 多种开局变化
- endgame database：6 子残局完美解（precomputed table）

这套方法在国际象棋成功是因为：
1. branching factor 35 × 深度 20 = 35^20 ≈ 10^31，剪枝后能 search 完
2. 评估函数有结构（material 是主要信号，可以人工设计）
3. 残局可以 tabulate（state space 在残局有限）

围棋这三条都不成立：
1. branching factor 250 × 深度 150 = 250^150 ≈ 10^359，剪枝再狠也搜不动
2. 评估函数没有 material（所有棋子等价），人工 feature 失败——2000s-2010s 几乎所有工程化围棋评估函数都比 amateur 弱
3. 围棋没有清晰残局——19×19 满盘都是棋

所以围棋 AI 在 1997-2006 年完全停滞，最强的 GnuGo / Many Faces of Go 只有 10 kyu（业余初学者）水平。

### 2006 转折点：MCTS 进入围棋

2006 年 Bruno Bouzy 和 Rémi Coulom 把 Monte Carlo Tree Search 从一般 game tree search 引入围棋。
MCTS 不需要评估函数——直接 rollout 到终局，用胜负作为 backup signal。
2006-2010 间 MoGo / Crazy Stone / Zen 等 MCTS-based 引擎把围棋 AI 拉到业余 5-6 段水平。

但 MCTS 本身有瓶颈：
- rollout policy 是 random / uniform / 弱启发式，模拟很多局面不准
- 没有局面 prior，每个分支都要 explore 很多次才收敛
- 无法处理 long-term strategic 局面（rollout 长度 150 步太长，noise 太大）

到 2014-2015 年 MCTS 围棋 AI 卡在业余 6 段（Crazy Stone / Zen 都到不了职业水平）。
人类职业 9 段对它们让 4 子还能赢。

### AlphaGo 的关键洞察

AlphaGo 的策略：**用深度学习给 MCTS 装上"直觉"**。
- 用 SL/RL policy network 替代 random rollout 的 prior（让 search 在更可能的分支上集中）
- 用 value network 替代 random rollout 的 backup（让评估更准确，不用走到终局）
- MCTS 还在，但每个组件都升级了

这个设计的灵感来自 DeepMind 之前的 DQN（Mnih 2015 Nature）——用 CNN 直接从像素学 Q-value。
但围棋不是直接 RL（没有连续 reward），而是用 supervised + self-play 组合。

> 怀疑：AlphaGo 的设计哲学是"用神经网络增强经典 search 算法"，而不是"用神经网络替代 search"。
> 这个判断后来被 AlphaGo Zero / AlphaZero 进一步推广（更强的 NN + 更纯的 MCTS），
> 但 MuZero（2019）开始让 NN 学 transition model（不再依赖游戏规则），方向开始转向更纯的 model-based RL。
> 那么 AlphaGo 路线（NN + MCTS）的天花板在哪？imperfect info（扑克、Dota）就完全用不上 MCTS 了——
> 那里 CFR / DeepStack 才是 SOTA。所以 NN + MCTS 这条路线本质是受限于"完美信息 + 离散动作 + 可枚举"的环境，
> 离 general intelligence 还差很远。

---

## Section 2: 三个核心定义

### Definition 1: Policy Network p(a | s)

给定棋盘局面 s（19×19 + 7 步历史 + 一些辅助 plane，总共 48 个 channel），
policy network 输出一个 19×19 的概率分布 p(a | s)，每个位置代表"下一步落在这里的概率"。

具体架构：
- 输入：48 × 19 × 19 tensor（48 个 binary feature plane）
- 第 1 层：5×5 conv，192 filter，ReLU
- 第 2-12 层：3×3 conv，192 filter，ReLU（共 11 层）
- 第 13 层：1×1 conv，1 filter，输出 19×19 logits
- 最后：softmax 得到 19×19 概率

总参数约 2.5M。

48 个 input feature plane 包括：
- 当前石子（自己 / 对手 / 空，3 plane）
- 历史 7 步（每步 3 plane，共 21 plane）
- ladder feature（梯子相关，2 plane）
- "气" 数量（liberty count，binned 到 8 个 plane）
- 一些 zone 信息

为什么用 48 plane 而不是 raw board？因为围棋有大量"局部模式"（眼、气、征子等），
直接用 raw 3-channel board 让 CNN 自己学这些模式需要更多数据 / 更深网络。
DeepMind 选择把领域知识编码到 input feature（这是个工程妥协，AlphaGo Zero 后来去掉了）。

> 怀疑：48 个 handcrafted feature plane 是 AlphaGo 的"领域 knowledge 注入"。AlphaGo Zero 完全去掉，
> 只用 raw 3-plane board（黑 / 白 / 空），证明 CNN 能从零学出这些模式。
> 那 AlphaGo Lee Sedol 版的 48-plane 设计是不是 over-engineering？
> 答案是：在 2014-2015 那个 compute 和数据条件下，48-plane 是必要的——给 CNN 一个"暖启动"，
> 减少 sample complexity。但这也说明，"end-to-end deep learning" 在 2016 年还没完全成熟，
> hand-crafted feature 还是工程上的常用补丁。

### Definition 2: Value Network v(s)

给定局面 s，value network 输出一个 scalar v ∈ [-1, +1]，代表"当前玩家在这个局面下的预期胜负"。
+1 = 当前玩家必胜，-1 = 当前玩家必败，0 = 五五开。

架构和 policy network 几乎一样（也是 13 层 CNN），唯一区别是：
- 最后一层不再是 19×19 logits，而是一个 fully-connected 层 + tanh，输出 1 个 scalar
- 输入除了 48 plane，还多一个 "current player color" plane（49 plane 总输入）

训练数据：30M self-play 局面 + 终局胜负 label（z ∈ {-1, +1}）。
loss：MSE = (v(s) - z)^2。

为什么 value network 必要？因为 MCTS rollout 太慢（一次 rollout 要走 150 步到终局），
而且 rollout policy 不准（rollout 用的是快速线性 policy，模拟出来的胜率 noise 大）。
value network 一次前向就能给出局面评估，不用 rollout 到终局。

实际 MCTS 中 leaf 评估用：
$$V_{leaf} = (1 - \lambda) \cdot v_\theta(s_{leaf}) + \lambda \cdot z_{rollout}$$

λ = 0.5（论文 default）。混合两个信号：value network 提供准确但可能 biased 的评估，
rollout 提供 noisy 但 unbiased 的 ground truth。

> 怀疑：λ = 0.5 是经验值。为什么不是 0.8 或 0.2？论文里说 λ = 0.5 表现最好，但没有理论分析。
> 我猜是因为 value network 在 self-play 数据上训练时存在 overfitting（self-play 局面分布有偏），
> 用 rollout 做"正则化"防止过分相信 value network。AlphaGo Zero 后来 λ = 0（完全去掉 rollout）
> 同时性能更强，说明只要 value network 训得好（更多数据 + 更强网络），rollout 就不需要了。

### Definition 3: Monte Carlo Tree Search (MCTS)

MCTS 是一种 game tree search 算法，核心思想是"用 Monte Carlo simulation 估计每个分支的胜率，
然后把搜索预算集中在更有希望的分支"。

每个 MCTS 节点存储：
- N(s, a)：从状态 s 走 action a 的访问次数
- W(s, a)：累积 value（所有经过这条边的 simulation 的 value 之和）
- Q(s, a) = W(s, a) / N(s, a)：mean action value
- P(s, a)：来自 SL policy 的 prior probability

每次 simulation 4 步：
1. **Selection**：从 root 沿 a* = argmax(Q(s,a) + u(s,a)) 走到 leaf
2. **Expansion**：在 leaf 用 SL policy 计算 19×19 prior，把所有合法子节点加到 tree
3. **Simulation**：从 leaf 用 rollout policy 模拟到终局，得到 z；同时查 value network 得到 v
4. **Backup**：沿 path 更新 N, W, Q（用 V = (1-λ)v + λz）

selection 公式里的 u(s, a) = c · P(s, a) · √N_total / (1 + N(s, a))
这个公式叫 PUCT（Predictor + UCT），结合了 prior P 和 visit count，让 search 既"听话"（用 SL 的建议）
又"探索"（不太确定的分支也要试）。c 是 exploration 系数，AlphaGo 取约 5。

每步走子：在 root 跑 ~10000 simulation，最后选 a* = argmax_a N(s_root, a)（visit count 最高的）。
为什么不选 Q(s, a) 最高的？因为 visit count 更稳定——MCTS 把大量预算花在好分支上，
N 高的分支已经被深度验证；而 Q 高但 N 低的分支可能是 lucky rollout。

---

## Section 3: 训练流程 — 三阶段

![三网络协作](/papers/alphago/01-three-networks.webp)

### Section 3.1: Policy Network 训练

**阶段 1: SL policy（supervised learning）**

数据：KGS Go server 上的 30M 业余高手对局（6-9 段棋手），每个局面是一个 (s, a) pair（棋盘 + 专家落子）。
loss：cross-entropy，p_θ(a | s) 拟合人类专家 a*。
训练：50 epoch，3 周（50 GPU）。
结果：accuracy = 57%（top-1 预测专家落子）。

参考开源实现 leela-zero 的 SL 训练代码（用类似 cross-entropy loss）：
[leela-zero/leela-zero src/Network.cpp（链接示意）](https://github.com/leela-zero/leela-zero/blob/0e9c3920c9cf6c3b3bba5ea0c10d9e2c9a8e7f3b1c4d5e6f7a8b9c0d1e2f3a4b/src/Network.cpp)
（40-char hex SHA：`0e9c3920c9cf6c3b3bba5ea0c10d9e2c9a8e7f3b1c4d5e6f7a8b9c0d1e2f3a4b`）

为什么不用 RL 直接训？因为 RL 从随机初始化开始 sample efficiency 太低——random policy 下，
self-play 几乎全是垃圾棋，需要海量 episode 才能学到东西。SL 给一个"差不多懂围棋"的起点，
后续 RL 只需要 fine-tune。

**阶段 2: RL policy（reinforcement learning）**

初始化：用 SL policy 作起点。
训练方式：self-play—— current policy 和 past policy（随机选一个历史版本）对弈，
用 REINFORCE 算法更新 current policy。

目标函数（REINFORCE）：
$$\nabla_\theta J(\theta) = E_{\tau \sim p_\theta}[\sum_t \nabla_\theta \log p_\theta(a_t | s_t) \cdot z_t]$$

z_t 是这局对弈的最终胜负（+1 赢 / -1 输）。

为什么用 past policy 作对手而不是 current policy？防止 overfitting—— current vs current 容易陷入"猜拳模式"
（policy 学着克制特定 strategy 而不是一般地变强）。和 past version 对弈相当于 league-style training。

训练：1 天，50 GPU（已经有 SL 起点，迭代很快）。
结果：RL policy 对 SL policy 胜率约 80%，对当时最强开源引擎 Pachi（业余 3 段）胜率约 85%。

**阶段 3: Rollout policy**

为什么需要 rollout policy？SL/RL policy CNN 太慢——每次前向 ~3ms，
MCTS 每秒要做几千次 simulation，每个 simulation 要 100+ 步 rollout，CNN 跟不上。

设计：线性 softmax + 手工 feature。约 100K 个 binary feature（小局部 pattern matching），
每次前向 ~2μs（比 CNN 快约 1500x）。
训练：用 8M 人类棋谱拟合 cross-entropy。
结果：accuracy 24%（比 SL 的 57% 弱很多，但快 1500x）。

> 怀疑：rollout policy 是个明显的"工程妥协"。理想中应该一个网络通吃——但 CNN 在 2016 年的硬件上太慢。
> AlphaGo Zero（2017）完全去掉了 rollout（V_leaf = v(s) only），只可能因为：
> (a) 有了更强的 value network；(b) 整体 simulation 数减少（不再依赖 rollout 走到终局）；
> (c) GPU 算力进步让 CNN inference 更快。所以 rollout policy 是 "compute-constrained 时代"的产物，
> 现代 model 几乎都不用了（MuZero / AlphaZero / EfficientZero 都没有）。

### Section 3.2: Value Network 训练

数据生成：用 RL policy 自对弈 30M 局，每局随机 sample 一个局面 s_t，记录 (s_t, z) pair（z 是终局胜负）。
为什么是随机 sample 而不是用全部局面？因为同一局对弈的局面高度相关（连续 150 步几乎一样），
全用会导致 overfitting；每局只用一个 random sample 强制 diversity。

loss：MSE = (v_θ(s) - z)^2
架构：和 policy network 几乎一样的 CNN，最后改成 scalar 输出 + tanh。
训练：1 周，50 GPU。

结果：value network 在 hold-out 局面上预测胜负的 MSE = 0.226（满分 0，random = 0.5），
比 rollout（MSE = 0.246）和 fast rollout（MSE = 0.279）都更准。

参考 Google 开源的 minigo 项目（mini AlphaGo Zero 复现）的 value network 训练代码：
[tensorflow/minigo dual_net.py（链接示意）](https://github.com/tensorflow/minigo/blob/1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b/dual_net.py)
（40-char hex SHA：`1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b`）

minigo 论文里报告：用 64 GPU × 1 周可以复现 AlphaGo Zero 9-day 段水平的 model（虽然没到 AlphaGo 全力版）。
这说明 value network 训练对 compute 极敏感——在工业实验室外很难复现 AlphaGo 全规模。

> 怀疑：30M self-play 局面，每局只 sample 1 个 state，用了 30M state。这是不是浪费？
> AlphaGo Zero 后来改成"每局所有 state 都用"+ 数据增强（8 种 board symmetry rotation/reflection），
> sample efficiency 大幅提高。所以 AlphaGo 30M state 设计也是个 compute-bound 妥协。

### Section 3.3: MCTS 整合

整合公式（leaf evaluation）：
$$V(s_L) = (1 - \lambda) v_\theta(s_L) + \lambda z$$

其中 z 来自 rollout policy 走到终局的胜负。

selection 用 PUCT：
$$a^* = \arg\max_a \left[ Q(s, a) + c \cdot P(s, a) \cdot \frac{\sqrt{N_{total}}}{1 + N(s, a)} \right]$$

P(s, a) 来自 SL policy（不是 RL policy！为什么？论文实验发现 SL policy 作 prior 比 RL policy 好——
SL policy 的 entropy 更高，给 exploration 更多余地；RL policy 太"自信"，容易让 MCTS 卡在自己偏好的分支）。

这是个有趣的反直觉发现：RL policy 自己玩比 SL 强，但作 prior 没 SL 好。
说明 MCTS 需要的不是"最强的 player"，而是"最 informative 的 prior 分布"。

---

## Section 4: Algorithm 1 — MCTS 主循环

下面是 AlphaGo MCTS 的完整 pseudocode：

```
Algorithm 1: AlphaGo MCTS Search

Input:  current board state s_root
        SL policy p_SL, RL policy p_RL, value network v_theta
        rollout policy p_rollout
        N_simulations (e.g. 10000)
        c (exploration constant, e.g. 5.0)
        lambda (rollout/value mix, e.g. 0.5)

Output: best move a*

Initialize tree with root s_root, no children
Run p_SL on s_root, store priors P(s_root, a) for all legal a
Add child nodes for each legal a, set N=0, W=0, Q=0

For sim = 1 to N_simulations:
    # 1. Selection: walk down tree
    s = s_root
    path = []
    while s has children (not a leaf):
        N_total = sum(N(s, a) for a in children)
        a = argmax over actions a of [
            Q(s, a) + c * P(s, a) * sqrt(N_total) / (1 + N(s, a))
        ]
        path.append((s, a))
        s = transition(s, a)

    # 2. Expansion: leaf reached
    if s is not terminal and N(s) > T_expand:  # only expand visited-enough leaves
        run p_SL on s to get priors P(s, a)
        add child nodes for each legal a

    # 3. Simulation: rollout to terminal
    z = rollout(s, p_rollout)  # walk to end of game using fast policy
    v = v_theta(s)             # query value network
    V = (1 - lambda) * v + lambda * z

    # 4. Backup: update along path
    for (s_p, a_p) in path:
        N(s_p, a_p) += 1
        W(s_p, a_p) += V
        Q(s_p, a_p) = W(s_p, a_p) / N(s_p, a_p)
        # flip sign for opponent (alternating players)
        V = -V

# Final move selection
a* = argmax over a in children of root: N(s_root, a)
return a*
```

关键细节：
1. **expansion threshold T_expand**：只有 leaf 被访问超过 T_expand 次（论文用 40）才 expand。
   防止把搜索预算浪费在冷门分支上。
2. **virtual loss**：分布式 MCTS 用 virtual loss 让多个 worker 不会同时走同一条 path
   （在选了 a 后立即把 N 和 W 减去 virtual loss，防止其他 worker 选同一个 a；rollout 完成后还回去）。
3. **transposition table**：相同棋形（不同顺序到达）共享 statistics，节省 search 预算。
4. **killer move heuristic**：上次 search 选过的 move 在新一步 search 时给 prior bonus。

---

## Section 5: MCTS 流程图

![MCTS 4 步](/papers/alphago/02-mcts.webp)

四步循环：Selection → Expansion → Simulation → Backup。

每秒约 10000-100000 simulation（取决于 hardware）。AlphaGo Lee Sedol 版用了：
- **single-machine 版**：48 CPU + 8 GPU，每步 ~5 秒，~10000 sim/step
- **distributed 版**：1920 CPU + 280 GPU，每步 ~5 秒，~100000 sim/step

distributed 版比 single-machine 强 100 ELO。Lee Sedol 比赛用的是 distributed 版。

为什么 simulation 数从 10K 增加到 100K 还能继续涨棋力？
答：MCTS 是 "anytime algorithm"——每多一次 simulation 都能进一步降低 estimate variance，
直到所有 promising branch 都被深搜过。围棋分支太多，10K 远远不够把 promising branch 探到底。

---

## Section 6: 实验结果

### vs 开源引擎（业余水平）

| Opponent | Result | AlphaGo handicap |
|----------|--------|------------------|
| Pachi    | 99% win | none |
| Crazy Stone | 100% win | none |
| Zen      | 100% win | none |
| Fuego    | 100% win | none |

AlphaGo 让对手 4 子还能赢——这是从业余 6 段直接跳到职业级的飞跃。

### vs Fan Hui（欧洲冠军，2 段职业）

2015 年 10 月闭门赛 5 局，AlphaGo 5-0 全胜。
这是第一次 AI 在 19×19 标准围棋（不让子）正式比赛击败职业棋手。
比赛结果保密 5 个月（直到 2016 年 1 月 Nature 论文发表）。

### vs Lee Sedol（世界冠军级，9 段职业）

2016 年 3 月公开赛 5 局，奖金 100 万美元。AlphaGo 4-1 胜。
- 第 1 局：AlphaGo 胜（Lee 投降）
- 第 2 局：AlphaGo 胜（"第 37 手"惊人妙手成为传奇）
- 第 3 局：AlphaGo 胜
- 第 4 局：Lee 胜（"第 78 手"神之一手让 AlphaGo 进入混乱）
- 第 5 局：AlphaGo 胜

第 4 局 Lee 的胜利暴露了 AlphaGo 的弱点：在罕见局面下 value network 评估失准，
MCTS 没有足够 simulation 修正。这个问题在 AlphaGo Master 和 AlphaGo Zero 后续修复（更强的 value network + more sim）。

### vs 顶级职业棋手（Master 版）

2017 年 1 月，AlphaGo Master 版以网络匿名身份在野狐 / 腾讯围棋以 60-0 击败众多顶级职业棋手
（包括柯洁、朴廷桓、井山裕太等当时世界排名前 10 的棋手）。
然后 2017 年 5 月乌镇围棋峰会，AlphaGo Master 3-0 击败柯洁（当时世界第一）。

ELO 估计（来自 AlphaGo Zero 论文 Figure 6）：
- Crazy Stone：~1900
- Fan Hui：~3144
- AlphaGo (Fan Hui 版)：~3500
- Lee Sedol：~3700
- AlphaGo Lee Sedol 版：~3700
- AlphaGo Master：~4500
- AlphaGo Zero：~5200

每代提升约 500-1000 ELO。AlphaGo Zero 比 Master 还强约 700 ELO。

---

## Section 7: 后续工作 — AlphaGo 家族进化

### AlphaGo Zero（Silver 2017 Nature）

关键改变：**完全去掉人类棋谱**。从 random initialization 开始，纯 self-play。
- 单网络架构（policy 和 value 共享 trunk，两个 head）
- 输入只用 raw 3-plane board（黑 / 白 / 空 + history）
- 去掉 rollout policy（V_leaf = v(s) only）
- ResNet 架构（39 层 / 256 filter，比 AlphaGo Lee Sedol 版强很多）
- 训练 3 天就超过 AlphaGo Lee Sedol 版，21 天超过 AlphaGo Master

启示：人类知识（KGS 棋谱、48-plane handcrafted feature、rollout policy）不是必要的，
甚至可能是约束——AlphaGo Zero 的下法包含很多"不像人类"的招（比如开局就脱先三连星），
说明人类棋谱让 AlphaGo Lee Sedol 版被人类风格"束缚"了。

### AlphaZero（Silver 2017 arXiv）

AlphaGo Zero 的方法泛化到围棋之外：国际象棋、Shogi（日本将棋）、Go 都用同一套算法。
- 4 小时学会国际象棋，超过 Stockfish（之前 SOTA 国际象棋引擎）
- 8 小时学会 Shogi，超过 Elmo（之前 SOTA Shogi 引擎）
- 34 小时学会围棋，超过 AlphaGo Lee Sedol 版

LeelaChessZero（lc0）是 AlphaZero 的开源国际象棋复现，至今仍是顶级引擎之一：
[LeelaChessZero/lc0 src/network.cc（链接示意）](https://github.com/LeelaChessZero/lc0/blob/2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d/src/network.cc)
（40-char hex SHA：`2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d`）

### MuZero（Schrittwieser 2019 Nature）

进一步泛化：连游戏规则都不需要知道。MuZero 学一个 latent dynamics model：
- representation network h：s → z（编码 state 到 latent）
- dynamics network g：(z_t, a_t) → z_{t+1}, r_t（学 transition）
- prediction network f：z → p, v（policy + value）

MuZero 在 Atari、围棋、国际象棋、Shogi 都达到 SOTA，且不需要环境的 simulator——
全部从 observation 学 model。这是 "model-based RL" 的标杆工作，和 AlphaGo 形成对照。

### AlphaStar（Vinyals 2019 Nature）

应用到 StarCraft II（real-time strategy 游戏）。
StarCraft II 与围棋的关键不同：
- imperfect information（fog of war）
- continuous time（不是回合制）
- huge action space（约 10^26 / step）
- multi-agent（己方多单位 + 对手）

AlphaStar 用 multi-agent training（"AlphaStar League"，类似 AlphaGo 的 self-play 但更复杂）+ 
LSTM 处理时序 + transformer 处理单位 attention。最终达到 Grandmaster 水平（top 0.2% 玩家）。

### AlphaFold（Jumper 2021 Nature）

完全不同的领域：蛋白质折叠（从 amino acid sequence 预测 3D 结构）。
AlphaFold 2 在 CASP14（2020）以 ~92% accuracy 远超第二名（~75%），基本"解决"了蛋白质折叠预测问题。
虽然方法已经和 AlphaGo 没什么共同点（Transformer + equivariant attention 而不是 MCTS），
但 DeepMind 把"用 deep learning 解决科学难题"的方法论从 AlphaGo 延续了下来。

---

## Section 8: 限制与缺陷

### 限制 1: 训练成本巨大

AlphaGo Lee Sedol 版训练用了：
- 50 GPU × 3 周（SL policy）
- 50 GPU × 1 天（RL policy）
- 50 GPU × 1 周（value network）
- 加上数据生成和 self-play 总计约 4 个月 × 数十 GPU

加上人类棋谱（KGS 30M moves）的获取和清洗。
2016 年估计成本几百万美元（GPU 加电费加工程师工资）。
AlphaGo Zero 更夸张：4 周 × 64 TPU。
这种 compute 门槛把 AGI-scale RL 研究锁定在 DeepMind / OpenAI / Google 等少数机构。

### 限制 2: 完美信息游戏假设

AlphaGo / AlphaZero / MuZero 都假设：
- 完美信息（你看到的就是对手看到的，只是棋子位置不同）
- 离散动作空间（19×19 = 361 个可能落子，国际象棋约 4096 个动作）
- 游戏规则可枚举（即使 MuZero 也只是不需要 rules，但仍假设 deterministic transition）

真实世界：imperfect info（扑克）、continuous action（机器人控制）、stochastic（多智能体环境）。
这些场景 MCTS 几乎用不上：
- 扑克：CFR (Counterfactual Regret Minimization) 才是 SOTA（Pluribus 2019, 6-player no-limit Hold'em）
- 机器人：PPO / SAC（continuous control）
- 多智能体：MADDPG / QMIX / population-based training

### 限制 3: rollout policy 是手工 feature

AlphaGo 的 rollout policy 用线性 softmax + ~100K binary 局部 pattern feature。
这是个明显的"未学习"组件。AlphaGo Zero 完全去掉，证明在足够 compute 下不需要。
但 AlphaGo Lee Sedol 版的论文暗示：在 2014-2015 compute 限制下，必须有 fast rollout。
说明 AlphaGo 论文的设计部分是 compute-bound 的工程妥协，不是纯算法选择。

### 限制 4: 仍需人类棋谱启动

AlphaGo Lee Sedol 版用了 KGS 30M 业余高手棋谱做 SL initialization。
这意味着：
- 算法上限受人类棋谱质量限制（KGS 是业余 6-9 段棋谱，不是职业 9 段）
- 人类棋谱可能有 systematic bias（某些定式 / 风格被过度学习）
- 不能 transfer 到没有人类数据的任务（比如全新游戏）

AlphaGo Zero 完全去掉这个依赖，证明从 random initialization 可以达到更强水平。
这是 AlphaGo Zero 比 AlphaGo Lee Sedol 版强 1500 ELO 的根本原因之一。

### 限制 5: Action space 必须可枚举

围棋 19×19 = 361 个 action，国际象棋约 4096 个 action（from-to pairs），都可枚举。
MCTS 的 selection 公式 a* = argmax(Q + u) 假设 action 是有限集合。
对 continuous action（robot joint torque）不直接适用——需要 progressive widening 或者
sample-based search（PILCO / iLQR），效果远不如离散 MCTS。

### 限制 6: 缺乏 long-horizon credit assignment 的解释

AlphaGo 用 self-play 做 credit assignment：每局 150+ 步只有最后一个胜负 signal，
通过 REINFORCE / TD 把 signal 传播回中间 step。这个过程 noisy 且 sample-inefficient。
强化学习理论里 long-horizon credit assignment 仍是 open problem（参考 reward shaping / hierarchical RL / option framework）。
AlphaGo 在围棋上 work 是因为 game length 相对固定 + outcome 是 deterministic function of state，
对 real world long-horizon task（比如训练一个 90 天的机器人 policy）这套不直接 work。

> 怀疑：AlphaGo 的成功多大程度是"算法巧妙"，多大程度是"compute brute force"？
> AlphaGo Zero 证明可以用更纯的算法 + 更多 compute 击败 AlphaGo Lee Sedol 版——
> 暗示 AlphaGo Lee Sedol 版的"工程巧妙"（48-plane feature, rollout policy, SL initialization, 
> dual SL+RL policy）很大程度是 compute-bound 的妥协。
> 这个观察对当下大模型训练也适用：很多"训练 trick"（学习率 warmup, LayerNorm 位置, gradient accumulation）
> 在 scale 增大后会逐渐失效或不必要。算法和 compute 永远在博弈。

---

## Section 9: 学到什么 + 关联

### 学到什么

1. **deep learning 增强经典 search 算法 > 替代经典 search 算法**：
   AlphaGo 没有 throw away MCTS，而是用 NN 给 MCTS 装 prior 和 value。这个组合比单纯 RL（DQN）或单纯 search（Crazy Stone）都强。
   类似启示：[[gpt-3]] 和 [[t5]] 也不是从零设计 architecture，而是 scale 已有的 Transformer + 预训练范式。

2. **三阶段训练：模仿 → 强化 → 评估**：
   先 SL（模仿人类）建立基础能力，再 RL self-play 突破人类上限，最后 value network 学评估。
   这个分阶段 curriculum 在后续 RLHF（[[ppo]]）的 SFT → RM → PPO 三阶段训练里有完全一致的影子。

3. **self-play 是 RL 的核心 unlock**：
   有了 self-play（current vs past version），RL 不需要外部 reward signal——player vs player 自然定义胜负。
   这个范式后来在 AlphaStar、Dota 2（OpenAI Five）、扑克（Pluribus）都成功复用。
   对比 [[dqn]] 单 agent vs 环境，self-play 是 multi-agent extension，效率高很多。

4. **MCTS 的"anytime" 性质让它工业化友好**：
   每多 1ms 就多 1 次 simulation，更接近 ground truth。可以根据 deployment 预算调整搜索深度。
   PPO（[[ppo]]）作为 policy gradient 没有 search 阶段，只有 inference forward pass，
   所以 deployment 时不能 trade compute for performance。这是 MCTS-based 方法的优势。

5. **领域知识注入是工程妥协，不是终极方案**：
   AlphaGo 的 48-plane feature / rollout policy / SL initialization 都是领域知识，AlphaGo Zero 全部去掉。
   类似教训：[[bert]] 用 masked LM + NSP 双任务，BERT-large 后续工作（RoBERTa）证明 NSP 不必要。
   总趋势：领域知识 → end-to-end → scale 替代一切。

### 关联其他论文

- [[dqn]] (Mnih 2015 Nature)：DeepMind 的 deep RL 起点。AlphaGo 直接继承了 CNN 处理 grid input 的思路，
  但围棋不是直接 RL，而是 SL + RL hybrid。DQN 是 single-agent vs env，AlphaGo 是 multi-agent self-play。

- [[ppo]] (Schulman 2017)：OpenAI 的 RL 算法，更轻量级（无 search）。
  PPO 在 RLHF 是工业默认，但游戏领域（StarCraft / Dota）AlphaStar / OpenAI Five 都用 PPO 而不是 AlphaZero 风格 MCTS——
  因为 imperfect info / continuous action 让 MCTS 不适用。

- [[attention]] (Vaswani 2017)：Transformer 的起点。AlphaGo 用 CNN，但 AlphaStar / MuZero 后续工作里 Transformer 部分替代了 CNN。
  在围棋这种 spatial structure 强的任务，CNN 仍然有优势；但需要 long-range dependency 时（StarCraft 单位关系）Transformer 更合适。

- [[gpt-3]] (Brown 2020)：scale 的极致代表。AlphaGo 总参数 ~5M（policy + value），
  GPT-3 是 175B（35000x）。但 AlphaGo Zero 训练 compute (~5000 PetaFLOPS-day) 和 GPT-3 (~3640 PetaFLOPS-day) 同数量级——
  说明 AlphaGo 大量 compute 花在 self-play data generation 上，不在 model 大小。

- [[t5]] (Raffel 2019)：NLP 里的 "everything is text-to-text" 框架。
  AlphaGo 是 "everything is policy + value + MCTS" 框架。
  T5 / GPT-3 后来证明 NLP 不需要 search（只需 next token prediction）；
  AlphaGo 路线证明游戏需要 search。两条路线在不同领域分别 work。

- [[chinchilla]] (Hoffmann 2022)：scale law 的精确化。
  AlphaGo / AlphaZero 没有类似 scaling law 分析（围棋训练成本太高，无法做大规模 sweep）。
  最近 EfficientZero（Ye 2021）开始研究 model-based RL 的 scaling law，但还很初步。

### 学习 takeaway

- AlphaGo 是 deep learning 第一次真正"解决"一个被认为 AI 难题的工作（围棋之前）。
  ImageNet 2012 / DQN 2015 都是"显著进步"，AlphaGo 是"问题被认为永远解决"。
- 三阶段训练（模仿 → 强化 → 评估）是个 transferable 范式，RLHF 直接复用。
- compute、algorithm、data 永远在 trade-off。AlphaGo Lee Sedol 版的工程 trick 是 compute-bound 妥协，
  AlphaGo Zero 用更多 compute + 更纯算法击败它，说明不要把当前 best practice 当 final answer。
- 完美信息 + 离散 action + 可 simulate 是 MCTS 路线的前提。其他场景（imperfect info / continuous / model-free real world）
  需要其他算法（CFR / PPO / SAC / TD-learning）。
- DeepMind 的 long-term play：AlphaGo（2016）→ AlphaGo Zero（2017）→ AlphaZero（2017）→ MuZero（2019）→ AlphaFold（2021）。
  每一代去除一个"领域 assumption"（人类棋谱 → 多游戏 → 规则未知 → 完全跨领域）。
  这是个范例性的研究 roadmap：每个工作都明确指向下一个限制要打破。
