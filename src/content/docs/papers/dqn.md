---
title: DQN — Deep Q-Network
来源: 'Mnih et al., "Human-level Control through Deep Reinforcement Learning", Nature 2015'
日期: 2026-05-29
分类: 强化学习
难度: 中级
---

## 是什么

DQN（**Deep Q-Network**）是 DeepMind 2013 年 arXiv 预印本 + 2015 年 Nature 完整版的**核心算法**——让一个 AI 只看屏幕像素，就能在 49 个 Atari 老游戏上玩出人类水平。

日常类比：以前强化学习玩棋类问题，靠一张巨大的「价值表」——每个棋面对应每个动作能拿多少分。问题是 Atari 一帧画面 = 84×84 像素，可能的画面数比宇宙原子还多，根本写不下表。**DQN 的关键就是用神经网络当这张表**——网络看到任何画面，都能输出每个按键的分数。

```
输入：4 帧灰度画面 (84 × 84 × 4)
        ↓ CNN（卷积神经网络）
输出：每个按键的预期得分（比如 18 个 Atari 按键，就 18 个数）
```

它做对的两件事让神经网络第一次能稳定学好 Q 函数。这是从「玩具问题」走向「能感知像素」的转折点。

## 为什么重要

不理解 DQN，下面这些事都没法解释：

- 为什么 [[alphago]] 能 4-1 击败李世石——它的「价值网络」本质是 DQN 的近亲
- 为什么 ChatGPT 微调用 RLHF（强化学习 + 人类反馈）能跑——深度 RL 被 DQN 带火后，RLHF 常用的 PPO 等策略梯度方法才进入主流（PPO 与 DQN 是并列路线，不是后者后代）
- 为什么 RL 圈在 2013 之前几乎没人关注，2015 之后突然变成 AI 最热的方向之一
- 为什么后续 [[muzero]] / [[ppo]] / Rainbow / SAC / DDPG 全在 DQN 思路上演化

**核心地位**：DQN 是「**第一次让神经网络当 Q 函数能稳定收敛**」的论文。在它之前，1995 年 Boyan & Moore 就证明过这种做法理论上会发散。DQN 没解决理论问题，但用两个工程改造让实践能跑——这是经验工程胜过理论的经典案例。

## 核心要点

DQN 的训练循环可以拆成 **三步**：

1. **Q 函数（每个按键值多少分）**：神经网络读画面，输出每个按键的「未来累计得分」估计。学好 Q 函数 = 学到最优策略——只要在每个画面选 Q 值最高的按键就好。

2. **Experience Replay（经验池 + 随机采样）**：把每一步操作存进一个百万容量的「经验池」，训练时不是用最新的经验，而是**从池子里随机抽 32 条**来训。类比：学英语不是死磕今天上的课，而是把过去半年的笔记打散来回滚。这一步打破了相邻画面太像的相关性，让 SGD 能正常工作。

3. **Target Network（不动的目标）**：训练时需要一个「应该接近的目标值」。如果目标和参数同时变，就像追自己的影子永远追不上。DQN 复制一份**冻结的 Q 网络**专门算目标，每 10000 步才同步一次——目标几乎不动，学习就稳了。

三步加起来叫 **Algorithm 1**，是 Nature 论文的核心伪代码。

## 实践案例

### 案例 1：Pong（最简单的 Atari 游戏）

输入是连续 4 帧的 84×84 灰度画面（必须 4 帧，单帧看不出球往哪飞）。CNN 处理后输出 6 个数字（Pong 有 6 个动作：上、下、不动、开火等）。训练几小时后，AI 学会了「球往下飞我就把拍子往下移」这种策略。

### 案例 2：Breakout（打砖块）

更有意思的例子。前几百万步分数提升缓慢，AI 在「随机乱按」和「学会接球」之间挣扎。

突然在 5M 步左右，AI **学会了一个高级策略**：故意把砖块挖出一条隧道，让球钻到顶层来回弹，自动消砖。这个策略人类玩家也常用，但 DQN 是从零自学出来的——没有任何人教。

### 案例 3：Atari 49 个游戏一套架构跑

最让人震撼的是**通用性**：同一个 CNN 架构、同一套超参数，跑 49 个完全不同的游戏，没有针对单个游戏调整。结果：

- 29 个游戏超过人类水平（Boxing 17 倍人类、Breakout 13 倍）
- Montezuma's Revenge 拿 0 分（探索失败的反例，后来催生整支研究）

这个「一套架构跑所有任务」的设定，思想上和后来 GPT-3 的 zero-shot 一脉相承。

## 踩过的坑

1. **致命三联体**：函数近似（用神经网络）+ bootstrapping（用估计去估计）+ off-policy（用旧数据训新策略），三者一起用理论上会发散。DQN 没解决这问题，只是工程上让它在 Atari 上不发散——换个环境照样可能炸。

2. **Reward Clipping 的副作用**：DQN 把所有奖励截到 {-1, 0, +1}，让超参数能跨游戏通用。代价：在 Montezuma's Revenge 这种「找钥匙才得 +100，平时全是 0」的稀疏奖励游戏上，截断后大奖励变 +1，跟噪声没区别——AI 永远学不会。

3. **Sample Efficiency 极差**：单游戏要训 5000 万帧 ≈ 38 天 Atari 游戏时间。人类玩家几小时就玩好了。RL 的根本问题：每条经验只有一个标量奖励反馈，信息密度比 supervised learning 低几个量级。

4. **超参数敏感 + 随机种子方差大**：Henderson 2017「Deep RL that Matters」论文专门验证：同一份代码不同种子跑出的分数差距能有 2-3 倍。学习率调高 2 倍可能直接发散。

5. **Hard Update 已被淘汰**：每 10000 步硬复制一次 target 网络是个很糙的设计，太小（比如 100）等于没冻结，太大（100000）等于 target 永远落后。后来 DDPG 的 Soft Update（θ⁻ = 0.001·θ + 0.999·θ⁻）平滑过渡效果好得多。

## 适用 vs 不适用场景

**适用**：
- 离散动作空间（Atari 的 4-18 个按键、棋盘游戏的合法落子）
- 有明确奖励信号（每帧 / 每回合都能拿到一个分数）
- 状态相对稳定（同一画面多次出现概率不太低）

**不适用**：
- 连续动作（机器人关节角度）→ argmax 算不出来，要换 DDPG / SAC
- 极稀疏奖励（Montezuma 那种）→ ε-greedy 探索根本走不到正反馈状态
- 部分可观测（POMDP）→ 单纯 4 帧叠加不够，要加 LSTM 或 Transformer
- 现代 LLM 微调 → PPO / DPO 更稳定，DQN 已退居二线

## 历史小故事（可跳过）

- **1989 年**：Watkins 博士论文提出 Q-learning，证明表格情况下能收敛。但只能解决井字棋这种小问题。
- **1992 年**：Tesauro 用浅层神经网络 + TD 学习做出 TD-Gammon，双陆棋达到大师水平。当时被认为是「特例」（双陆棋有掷骰子的随机性自带探索）。
- **1995 年**：Boyan & Moore 警告「神经网络当 Q 函数会发散」，劝退一票后续工作。
- **2012 年**：AlexNet 在 ImageNet 上把 CNN 从冷门变成标配。DeepMind 团队（Mnih, Silver, Kavukcuoglu）开始想：**直接用 CNN 当 Q 函数？**
- **2013 年 12 月**：NIPS workshop 论文「Playing Atari with Deep RL」面世，7 个游戏。
- **2014 年**：Google 用 5 亿美元收购 DeepMind，DQN 团队拿到资源把游戏数扩到 49 个。
- **2015 年 2 月**：Nature 论文出版，封面文章。RL 一夜变成显学。
- **2016 年**：[[alphago]] 用 DQN 思想 + MCTS 打败李世石。
- **2017 年**：[[ppo]] 出来后逐步取代 DQN 成 RL 主流，但「value/policy/reward」三件套范式是 DQN 时代奠定的。

## 案例补充：Rainbow 的"叠加技"教训

DeepMind 2017 发表 Rainbow——把 DQN 之后 5 项改进（Double DQN / Dueling / Prioritized Replay / Multi-step / Distributional / Noisy Net）全叠在一起，跑 57 个 Atari 平均得分提升 200%。

但消融实验显示：**Prioritized Replay 和 Multi-step 贡献最大**，Dueling 在很多游戏上几乎没用。这给后续 RL 研究的教训是——堆模块很容易，但拆出每个模块的边际贡献才是真功夫。Rainbow 也是 RL 工程化的分水岭：之后的研究开始更注重消融而非"再多叠一层"。

## 学到什么

1. **工程改造能解决理论上的不可能**——replay + target net 没改 Q-learning 一个字，只加了两个外挂，就把「理论上发散」变成「实践上稳定」
2. **数据复用 > 新数据**——replay buffer 让每条经验被采 8 次，等于免费多了 8 倍训练数据。这条经验后来在 LLM 预训练时代以「epoch repeat」的形式重现
3. **失败案例比成功案例信息量更大**——Breakout 13 倍人类很 impressive，但真正推动后续 5 年研究的是 Montezuma 拿 0 分这件事
4. **同一架构跑所有任务**是衡量通用性的硬指标——DQN 49 游戏不调超参，启发了后来 GPT-3 的 zero-shot benchmark 思路
5. **看 paper 学算法只是入门**——同一份伪代码不同实现性能能差 2-3 倍，真正读懂 = 能复现到匹配论文数字
6. **bootstrapping 的双刃剑**：用估计去更新估计能极大提速学习，但也是发散的根源；理解为什么"去 bootstrapping"（Monte Carlo）稳但慢，"用 bootstrapping"（TD）快但不稳，是 RL 入门必修
7. **生物学启发不是必要条件**：Experience Replay 灵感来自人脑海马体的"经验回放"，但论文真正成功靠的是工程稳定性，不是生物似然性。算法工程领域许多"灵感故事"是叙事工具而非因果链
8. **复现成本是论文的隐藏成本**：Atari 5000 万帧训练在当时要 1-2 周 GPU 时间，复现门槛被低估。RL 比 supervised learning 工程预算大 5-10 倍

## 延伸阅读

- 视频教程：[DeepMind — David Silver RL Course Lec 6](https://www.youtube.com/watch?v=UoPei5o4fps)（强化学习课，Silver 是 DQN 二作）
- 自己写实现：[CleanRL — DQN](https://github.com/vwxyzjn/cleanrl/blob/master/cleanrl/dqn_atari.py)（200 行单文件 PyTorch 实现，跟论文 Algorithm 1 一一对应）
- 论文 PDF：[Mnih et al. 2015 Nature](https://www.nature.com/articles/nature14236)（核心算法在 Methods 部分，正文偏综述）
- [[ppo]] —— 现代 RL 主流，DQN 在 policy gradient 路线上的接班人
- [[alphago]] —— DQN 思想 + MCTS 在围棋的延伸
- [[muzero]] —— 不要环境模型，自己学 latent dynamics，DQN 家族最远的孩子
- 改进综述：Rainbow 论文（Hessel et al. 2017）做的 6 项叠加 + 消融
- Sutton & Barto《Reinforcement Learning: An Introduction》第二版，章节 Tabular Q-learning → DQN 是教科书级路径

## 关联

- [[ppo]] —— 简单稳定的 policy gradient，2017 后逐步替代 DQN 成主流
- [[alphago]] —— DQN 价值网络 + MCTS 在完美信息博弈的应用
- [[muzero]] —— DQN → AlphaZero → MuZero 演化链的终点
- [[attention]] —— Transformer 让网络自己学怎么处理序列，跟 DQN 让网络自己学价值函数同种「端到端学习」精神
- [[scaling-laws]] —— DQN 的 sample efficiency 困境后来部分被 scaling 缓解，跟语言模型的 scaling laws 一脉相承

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[a3c-2016]] —— A3C — 多个 CPU 同时跑游戏，让 RL 不再吃 GPU
- [[alphago]] —— AlphaGo — 击败围棋世界冠军
- [[attention]] —— Attention Is All You Need
- [[bert]] —— BERT — 双向 Transformer 预训练
- [[fsrs-spaced-repetition]] —— FSRS — 让 Anki 知道每张卡什么时候快被你忘掉
- [[gpt-3]] —— GPT-3 — Language Models are Few-Shot Learners
- [[mamba]] —— Mamba — 选择性状态空间模型
- [[muzero]] —— MuZero — 不用规则也能下棋
- [[ppo]] —— PPO — Proximal Policy Optimization
- [[scaling-laws]] —— Scaling Laws — 神经语言模型的缩放规律
- [[t5]] —— T5 — Text-to-Text Transfer Transformer
- [[td3-2018]] —— TD3 — 给 DDPG 装两副刹车，连续控制终于稳了

