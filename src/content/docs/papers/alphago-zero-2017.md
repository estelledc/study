---
title: "AlphaGo Zero — 从零自学围棋的强化学习革命"
来源: 'Silver et al., "Mastering the Game of Go without Human Knowledge", Nature 2017'
日期: 2026-06-13
分类: 其他
子分类: rl
provenance: pipeline-v3
---

## 是什么

AlphaGo Zero 是 DeepMind 在 2017 年发表的一个算法，它**完全从零开始（拉丁语 tabula rasa，意为"白板"），不借助任何人类围棋棋谱，仅通过自己跟自己下棋的强化学习，在三天内就击败了曾击败李世石的人类围棋冠军程序 AlphaGo**。

日常类比：想象一个从未学过画画的人，被关在一个房间里，只给他一支笔和一张白纸。他一开始随便乱涂——但每画一笔，系统告诉他"这一步好不好"。他不断跟另一个版本的自己比赛，越输越多，但也越学越快。三天后，他画出了达芬奇级别的画作。关键是：**没人教过他怎么画，他只靠规则和反馈自学成才。**

AlphaGo Zero 的核心创新在于三点：

1. **只用强化学习，零人类数据**——之前的 AlphaGo Fan/Lee 先用人类职业棋手的 3000 万手棋做监督学习（supervised learning），再用自我对弈微调；AlphaGo Zero 直接从随机走法开始
2. **单一神经网络**——之前有两个网络（策略网络预测下一步 + 价值网络评估局面），现在合为一个，同时输出"该走哪里"和"谁赢面大"
3. **更简洁的搜索**——不需要蒙特卡洛随机模拟（rollout），树搜索完全依赖这个单一网络

## 为什么重要

不理解 AlphaGo Zero，很多后续发展都无法解释：

- **Zero 系列（Chess、Shogi）的起点**——AlphaGo Zero 成功后，DeepMind 用同样的方法训练了 AlphaZero，在国际象棋和日本将棋上也达到了超人类水平
- **"自我博弈 + 树搜索"范式的确立**——MCTS 不再只是搜索工具，而是变成了训练循环的一部分：搜索结果反过来训练网络，网络变强后搜索更强，形成正反馈
- **监督学习的天花板被打破**——证明在复杂智力任务中，纯强化学习可以超越依赖人类专家数据的上限
- **残差网络（ResNet）在棋类中的首次大规模应用**——20 层/40 层残差块成为后续所有棋类 AI 的标准架构

## 核心概念

### 1. 单一神经网络：策略 + 价值合一

AlphaGo Zero 用一个深度卷积神经网络 `f_θ`，输入是棋盘状态 `s`，输出两个东西：

- **策略向量 p**：每个合法位置的走子概率分布（包括"停一手/pass"）
- **价值标量 v**：当前玩家从这个局面出发最终获胜的概率（范围 -1 到 +1）

```python
# 伪代码：AlphaGo Zero 的神经网络输出
class AlphaGoZeroNetwork:
    def __init__(self, num_residual_blocks=20):
        # 输入：31 层 19x19 棋盘
        # 第 0-7 层：黑棋历史（最近 8 步）
        # 第 8-15 层：白棋历史（最近 8 步）
        # 第 16 层：己方棋子
        # 第 17-19 层：敌方棋子
        # 第 20-30 层：特征开关（轮到谁走、是否重复局面等）
        self.conv_input = Conv2D(filters=256, kernel_size=3, padding='same')
        self.residual_blocks = [ResidualBlock(filters=256)
                                for _ in range(num_residual_blocks)]
        # 策略头：输出 361 个位置的概率
        self.policy_conv = Conv2D(filters=2, kernel_size=1)
        self.policy_fc = Dense(units=361)
        # 价值头：输出一个胜负概率标量
        self.value_conv = Conv2D(filters=1, kernel_size=1)
        self.value_fc1 = Dense(units=256)
        self.value_fc2 = Dense(units=1, activation='tanh')

    def forward(self, board_state):
        x = self.conv_input(board_state)
        for block in self.residual_blocks:
            x = x + block(x)  # 残差连接：跳过一层
        # 策略分支
        p_logits = self.policy_conv(x).reshape(-1, 361)
        policy = softmax(p_logits)
        # 价值分支
        v_features = self.value_conv(x).flatten()
        v = tanh(self.value_fc2(relu(self.value_fc1(v_features))))
        return policy, v
```

### 2. 蒙特卡洛树搜索（MCTS）：自我对弈的"思考引擎"

每次轮到自己走棋时，AlphaGo Zero 用 MCTS 在脑子里"想"很多步，然后选最好的走法。MCTS 的每一轮模拟分为四步：

1. **选择（Selection）**：从根节点往下，每一步都选"当前价值 Q + 探索分数 U"最大的子节点，直到到达叶子节点
2. **扩展（Expansion）**：对叶子节点调用神经网络，得到走子概率 P 和价值 V
3. **模拟（Simulation）**：AlphaGo Zero **不做随机模拟**（这是与旧版 AlphaGo 的关键区别），直接用神经网络的 V 作为评估
4. **回溯（Backup）**：沿路径回传，更新每条边的访问次数 N 和价值 Q

```python
# 伪代码：MCTS 的单轮模拟
def mcts_simulation(root_state, network, simulations=1600):
    """
    root_state: 当前棋盘局面
    network: 当前迭代的神经网络 f_θ
    simulations: 每步做 1600 次模拟
    返回: 每个位置的访问计数（用于决定走哪一步）
    """
    tree = SearchTree()  # 空的搜索树，只有一个根节点

    for _ in range(simulations):
        node = root_state

        # Step 1: 选择 —— 沿着树走，选 Q + U 最大的边
        while node.is_fully_expanded():
            # U(s,a) ∝ P(s,a) * sqrt(sum(N(s,b))) / (1 + N(s,a))
            # P 来自神经网络的前置概率，Q 是历史平均价值
            child = max(node.children, key=lambda c: c.Q + c.U)
            node = child

        # Step 2: 扩展 + Step 3: 评估（合并为一步）
        # 对叶子节点调用神经网络，一次性得到 P 和 V
        leaf_policy, leaf_value = network.forward(node.state)
        node.expand(leaf_policy, leaf_value)

        # Step 4: 回溯 —— 沿路径更新 Q 和 N
        while node is not None:
            node.N += 1
            # Q 是所有经过这条边的模拟价值的平均值
            node.Q = sum(v for v in node.visits) / node.N
            node = node.parent

    # 返回根节点每个子节点的访问计数
    # 访问次数越多的走法 = MCTS 认为越好的走法
    return {child.action: child.N for child in root_state.children}
```

### 3. 自我博弈训练循环：自己教自己

AlphaGo Zero 的训练是一个不断迭代的闭环：

1. 用当前神经网络 θ_i 和自己下棋（双方都用同一个网络）
2. 每步用 MCTS 生成更好的走子概率 π（而不是直接用网络的 p）
3. 记录游戏结果 z（赢 = +1，输 = -1）
4. 用这些数据 `(s, π, z)` 训练网络，让它输出的 `p` 更接近 MCTS 的 `π`，`v` 更接近 `z`
5. 用训练好的新网络 θ_{i+1} 进入下一轮自我对弈

```python
# 伪代码：AlphaGo Zero 的训练循环
def alpha_go_zero_training(iterations=100000):
    """
    从零开始训练，没有任何人类数据
    """
    # 初始化：随机权重的神经网络
    network = AlphaGoZeroNetwork(num_residual_blocks=20)

    # 经验回放缓冲区：存储自我对弈产生的数据
    experience_buffer = ReplayBuffer(capacity=5_000_000)

    for iteration in range(iterations):
        # === 阶段 1: 自我对弈 ===
        game_data = []
        state = initialize_board()  # 空棋盘

        while not is_game_over(state):
            # 用 MCTS 搜索，得到改进后的走子概率
            visit_counts = mcts_simulation(state, network, simulations=1600)

            # 从概率分布中采样走一步（温度参数 τ 控制探索性）
            action = sample_from_distribution(visit_counts, temperature=1.0)

            # 记录 (局面, MCTS概率, 最终结果)
            game_data.append({
                'state': state,
                'mcts_probability': visit_counts,
                'winner': None  # 暂时未知，等游戏结束才填
            })

            # 执行走子，切换到对手
            state = apply_move(state, action)

        # 游戏结束，填入胜负结果
        winner = score_game(state)  # 根据围棋规则判定胜负
        for entry in game_data:
            entry['winner'] = winner  # +1 或 -1

        # 把所有对局数据存入缓冲区
        experience_buffer.extend(game_data)

        # === 阶段 2: 训练神经网络 ===
        # 从缓冲区中随机抽样 mini-batch
        batch = experience_buffer.sample(batch_size=2048)

        total_loss = 0
        for data in batch:
            # 前向传播
            policy_pred, value_pred = network.forward(data['state'])

            # 损失函数 = 价值误差(MSE) + 策略误差(交叉熵) + L2正则化
            value_error = mean_squared_error(value_pred, data['winner'])
            policy_error = cross_entropy(policy_pred, data['mcts_probability'])

            loss = value_error + policy_error + c * l2_regularization(network)

            # 反向传播，更新权重
            network.backward(loss)
            total_loss += loss

        print(f"Iteration {iteration}: Loss = {total_loss / len(batch):.4f}")

        # === 阶段 3: 评估 ===
        # 每隔一段时间，用新网络跟旧网络对弈，看有没有进步
        if iteration % 100 == 0:
            win_rate = evaluate_against_previous(network, previous_network)
            print(f"Win rate vs previous: {win_rate:.2%}")
            previous_network = copy(network)  # 保存为"上一代"
```

损失函数的数学形式（论文公式 1）：

```
L(θ, z, π) = Σ (z_k - v_k)^2 - π_k^T log(p_k^θ) + c ||θ||^2
```

三项分别是：
- **价值损失**：预测的胜率 `v` 与实际胜负 `z` 的均方误差
- **策略损失**：预测的走子概率 `p` 与 MCTS 搜索概率 `π` 的交叉熵
- **L2 正则化**：防止过拟合，系数 `c` 控制强度

### 4. 温度参数 τ：探索与利用的平衡

MCTS 返回的访问计数需要用温度参数来转换为走子概率：

```python
def choose_action_with_temperature(visit_counts, temperature=tau):
    """
    温度越低 = 越倾向于选访问最多的（利用）
    温度越高 = 越随机（探索）
    """
    # 访问计数的 1/τ 次幂
    exponents = {a: n**(1.0/temperature) for a, n in visit_counts.items()}
    total = sum(exponents.values())
    probs = {a: e/total for a, e in exponents.items()}

    # 从概率分布中采样
    return sample(probs)

# 训练时：tau=1.0（充分探索）
# 开局阶段 tau=0.5（逐步收敛，减少早期随机性）
# 比赛时 tau=0.0（直接选访问最多的，确定性走法）
```

## 训练过程的关键发现

### 学习曲线：三天击败人类冠军

AlphaGo Zero 的训练持续约 3 天（小规模）和 40 天（大规模），产生了惊人的结果：

- **36 小时后**就超越了曾击败李世石的 AlphaGo Lee
- **72 小时后**以 100-0 完胜 AlphaGo Lee（后者用了 48 个 TPU 分布在多台机器上，前者只用 4 个 TPU 单机运行）
- **40 天大规模训练**后，Elo 评分达到 5185，远超 AlphaGo Master 的 4858

### 它学到的围棋知识

AlphaGo Zero 从零开始自学了几乎所有围棋核心概念：

| 学习时间 | 学到的概念 |
|---------|-----------|
| 3 小时 | 吃子（类似人类初学者） |
| 19 小时 | 死活、势力、地盘 |
| 70 小时 | 定式、劫争、半目胜的精细计算 |

有趣的是，它**后来才学会"征子"**（ladder，围棋中最基础的技巧之一），说明它的学习路径与人类完全不同——人类从征子开始学，它从整体战略中"涌现"出对征子的理解。

它还发现了**新的定式变体**，这些变体之前从未出现在人类棋谱中。

### 架构对比实验

论文做了一个精妙的消融实验，比较四种网络架构：

| 架构 | 策略网络 | 价值网络 | 卷积类型 | Elo 提升 |
|------|---------|---------|---------|---------|
| sep-conv | 分离 | 分离 | 普通卷积 | 基准（AlphaGo Lee） |
| dual-res | 合并 | 合并 | 残差网络 | +600 Elo |
| sep-res | 分离 | 分离 | 残差网络 | +600 Elo |
| **dual-res（最终）** | **合并** | **合并** | **残差网络** | **+1200 Elo** |

关键发现：**合并策略和价值不仅提高了效率，还起到了正则化作用**——因为网络要同时满足两个目标，被迫学到更通用的局面表示。

## 与旧版 AlphaGo 的本质区别

| 维度 | AlphaGo Fan/Lee | AlphaGo Zero |
|------|-----------------|--------------|
| 训练数据 | 人类职业棋谱 + 自我对弈 | 仅自我对弈，零人类数据 |
| 网络数量 | 两个（策略 + 价值） | 一个（合并） |
| 输入特征 | 手工设计的 49 层特征 | 原始棋盘黑白子位置（31 层） |
| 搜索方式 | MCTS + 快速随机模拟（rollout） | MCTS 仅靠神经网络评估，无 rollout |
| 训练时间 | 数月 | 3 天（小规模）/ 40 天（大规模） |

## 延伸思考

AlphaGo Zero 证明了在**规则明确、状态空间巨大、有精确胜负判定**的领域，纯强化学习完全可以超越依赖人类知识的混合方法。但这套方法也有局限性：

- **需要大量计算资源**：3 天 × 1600 模拟/步 × 数百万局对弈，消耗大量 TPU 算力
- **只适用于零和博弈**：目前主要成功于围棋、国际象棋、将棋等确定性零和游戏
- **学习路径可能低效**：人类小孩几天就能学会基本走法，AlphaGo Zero 需要 3 天和数百万局

这些局限正是后续研究（如 MuZero 学习环境模型、世界模型等）试图解决的问题。

## 一句话总结

**AlphaGo Zero 告诉世界：给定正确的规则和一个足够强的学习算法，AI 不需要老师的指导，也能从零自学到超越人类的水平。**
