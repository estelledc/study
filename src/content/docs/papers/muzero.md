---
title: MuZero — 不用规则也能下棋
来源: 'Schrittwieser et al., "Mastering Atari, Go, Chess and Shogi by Planning with a Learned Model", Nature 2020'
日期: 2026-05-29
子分类: 强化学习
分类: 机器学习
难度: 中级
schema_version: legacy-short
provenance: legacy-migrated
---

## 是什么

MuZero 是 DeepMind 2019 年的 "AlphaZero 进化版"——它**不需要给它围棋规则、象棋规则、Atari 物理引擎**，自己从经验里学一个 "环境模型"，然后用这个模型来 plan（规划下一步）。

日常类比：[[alphago]] 像一个**知道扑克牌规则**的玩家——发牌、出牌、谁赢谁输都按手册来；MuZero 是一个**没看过规则书**的玩家，只通过观察别人怎么出牌、谁赢了，**自己脑补出一套规则**，然后用脑补的规则来想"下一步出什么"。

它在围棋、国际象棋、将棋、Atari 57 款游戏上都达到 SOTA——**用同一份代码、同一组超参数**。

## 为什么重要

不理解 MuZero，下面这些事都没法解释：

- 为什么 RL（强化学习）从 2020 年开始大规模脱离 "必须有 simulator" 的约束——MuZero 把 simulator 从需求里删了
- 为什么后来的 World Models / Dreamer / DayDreamer / DreamerV3 都长得像 MuZero——它们都在学环境模型再 plan
- 为什么 RL 真实世界落地（YouTube 视频压缩、芯片布线）2020 年后突然加速——之前卡在 "怎么写 simulator"
- 为什么 RL 这一脉跟 LLM 走的不是一条路——LLM 用的是 PPO（model-free），MuZero 是 model-based 的代表

## 核心要点

MuZero 的脑子里有 **三个网络**，配合一个 MCTS（蒙特卡洛树搜索）：

1. **Representation 网络 h**——把"看到的东西"压缩成"内部状态"
   - 输入：observation（棋盘 / Atari 像素）
   - 输出：hidden state（一坨数字，人看不懂）
   - 类比：你看到一张围棋盘，脑子里转化成"形势好坏"的抽象感觉

2. **Dynamics 网络 g**——预测"在这个内部状态下走一步会怎样"
   - 输入：hidden state + action
   - 输出：下一个 hidden state + 这一步的 reward
   - 类比：脑子里推演"如果我下这里，对方大概会反应什么、我得多少分"

3. **Prediction 网络 f**——从内部状态读出"该走哪、形势多好"
   - 输入：hidden state
   - 输出：policy（每个动作的概率）+ value（当前局面值多少分）
   - 类比：直觉判断"这个局面我赢面 70%、最该走的是这步"

**MCTS 跑在 hidden state 空间里**——不是真实棋盘，是脑子里的抽象状态。MuZero 的关键创新就是这一点：**plan 不需要真实环境，只需要一个能预测 reward / policy / value 的内部模型**。

整个流程串起来：
- 拿到 observation → h 编码 → 得到 root hidden state
- MCTS 跑 N 次（Atari 50 次、棋类 800 次）：每次从 root 用 PUCT 选一条路径下到 leaf，在 leaf 调用 g 推一步、调用 f 给估值，然后把估值沿路径回传
- 看哪个 root 的子节点访问次数最多 → 输出该 action
- 真实环境执行该 action → 拿到下一个 observation → 继续

## 实践案例

### 案例 1：Atari 不告诉物理引擎，只看像素

Atari 游戏里 MuZero 拿到的输入是 **96×96 的像素帧**——没人告诉它 "球碰到墙会反弹"、"打砖块得分"、"角色掉下去会死"。

它的 representation 网络 h 把像素压成 hidden state，dynamics 网络 g 学会"在这个 hidden state 下按右键，下一帧大概是什么样"——**完全自学的物理引擎**。

结果：57 款 Atari 游戏的 mean human-normalized score 接近 5000%，全面超过 DQN（~250%）、Rainbow（~874%）、R2D2（~3596%）。

### 案例 2：围棋——和 AlphaZero 同水平，但不需要规则

围棋的规则（落子、提子、判定违法）在 [[alphago]] / AlphaZero 里是**人写代码**实现的。MuZero 把这部分删了。

奇怪的是：MuZero 在围棋上的 ELO **略高于** AlphaZero。论文给的解释是——learned model 在 hidden state 空间里更"光滑"，两个战略等价但棋形不同的局面会被映射到接近的点，让 MCTS 隐式做了 generalization。

### 案例 3：YouTube 视频压缩

DeepMind 2022 报告，把 MuZero 用在 YouTube 视频编码器（VP9）的 RD（rate-distortion）决策上：每一帧选什么压缩参数 = action，画质 + 比特率 = reward。

结果：**节省 4% 比特率**——按 YouTube 的流量规模，这是每年节省几千万美元带宽。这是 model-based RL 在真实世界规模化部署的代表作。

## 踩过的坑

1. **hidden state 完全黑盒**——你不能问 "这个 hidden state 表示棋盘哪里有子"。它只是一坨 ResNet feature map。debug 训练不收敛时，你不知道是 h 错了还是 g 错了。

2. **K=5 步 unroll 限制**——dynamics 网络 g 只在 5 步展开里被验证。但 MCTS 在棋类里树深度可达 30 步，最深处的 g 输出实际**没训练过**，可能完全不可靠。论文用 PUCT 的 visit count 集中在浅层来缓解，但没根治。

3. **训练成本爆炸**——Atari 一个游戏要 1000 TPU-cores × 12 小时。学术界几乎没人独立完整复现过。EfficientZero 把成本降了 30 倍但还是远超普通实验室预算。

4. **observation 噪声敏感**——Atari 的像素是 deterministic 的（没噪声）。真实世界（机器人摄像头）有噪声，h 没有显式的去噪机制。后来 Dreamer 用 stochastic latent + KL 正则化处理这个问题，MuZero 路线一直没补这一块。

## 适用 vs 不适用场景

**适用**：
- 离散动作空间 + 清晰 reward 信号（棋类、Atari、组合优化）
- 有大量 self-play 算力（DeepMind 级别 TPU）
- 环境 deterministic 或弱 stochastic（扑克这种强随机要 Stochastic MuZero）

**不适用**：
- LLM 推理——动作空间是整个 vocabulary（10^5 token），MCTS 的 PUCT 公式跑不动
- 连续动作（机器人扭矩）——原版需要枚举 action，要 Sampled MuZero 变种
- observation 高噪声场景 → 用 Dreamer 系列
- 需要可解释的决策（自动驾驶、医疗）→ hidden state 不可 audit

## 历史小故事（可跳过）

- **2016 年**：[[alphago]] 击败李世石。但它**需要人类棋谱**预训练 + 围棋规则代码。
- **2017 年**：AlphaGo Zero——扔掉人类棋谱，纯 self-play 从零学起。但**还是要规则**。
- **2018 年**：AlphaZero——同一份代码玩围棋 / 国际象棋 / 将棋。**还是要规则**（每个游戏的规则代码）。
- **2018 年**：Ha & Schmidhuber 的 World Models——latent 空间学 dynamics 的开山作，但用 model-free RL（CMA-ES），**没真做 plan**。
- **2019 年 11 月**：MuZero 论文上 arXiv。第一次在 learned latent model 上做 MCTS plan，**全面超过** model-free。
- **2021 年**：EfficientZero——把 Atari sample efficiency 提升 ~30 倍，加了 self-supervised consistency loss。
- **2023 年**：DreamerV3——平行路线（重建 observation + actor-critic）的集大成，跟 MuZero 各擅胜场。
- **2024 年**：AlphaChip（Google Nature）——MuZero 思路用于芯片 floorplan 设计，部署在 TPU v4/v5。

## 学到什么

1. **plan 不需要真实 simulator**——只需要一个能预测 reward / policy / value 的模型。这是 RL 历史上最重要的一次"减法"。
2. **三网络分解**（representation / dynamics / prediction）成了 model-based RL 的标准架构——后来 Dreamer / IRIS / TWM 都沿用。
3. **K 步 unroll 让 dynamics 学到 long-horizon 一致性**，单步 dynamics 不够。这是端到端联合训练的精髓。
4. **理论 → 算法 → 工程**，每一步都有反例。MuZero 不重建 observation，Dreamer 重建——两条路线 2024 年还都活着，没有绝对赢家。

## 延伸阅读

- 论文 PDF：[Schrittwieser et al. 2020 Nature](https://arxiv.org/abs/1911.08265)（密度高，先看 Figure 1 + Methods）
- 视频讲解：[Yannic Kilcher — MuZero](https://www.youtube.com/watch?v=We20YSAJZSE)（一小时把核心思想讲透）
- 开源实现：[werner-duvaud/muzero-general](https://github.com/werner-duvaud/muzero-general)（PyTorch，cartpole / lunar lander 能跑）
- 官方 MCTS：[google-deepmind/mctx](https://github.com/google-deepmind/mctx)（DeepMind JAX 实现，含 Gumbel / Stochastic MuZero）
- 续作：[EfficientZero (Ye et al. 2021)](https://arxiv.org/abs/2111.00210)——sample efficiency 大跃进

## 关联

- [[alphago]] —— MuZero 的直接前作，AlphaGo / AlphaZero 是 perfect simulator + MCTS，MuZero 把 simulator 也学出来了
- [[dqn]] —— MuZero 在 Atari 上替代的 model-free 路线代表，DQN 用 Q-learning + replay
- [[ppo]] —— model-free policy gradient，跟 MuZero 是两条路线；RLHF 选 PPO 是因为 LLM 没法 plan
- [[attention]] —— MuZero 的 ResNet 后来被 transformer 替代（Stochastic MuZero / IRIS 都用 transformer 做 dynamics）
- [[gpt-3]] —— 大语言模型 + RL 的组合（RLHF）是 MuZero 之后 RL 的另一条主线，但 LLM 推理太慢没法 MCTS

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[alphago]] —— AlphaGo — 击败围棋世界冠军
- [[attention]] —— Attention Is All You Need
- [[dqn]] —— DQN — Deep Q-Network
- [[fsrs-spaced-repetition]] —— FSRS — 让 Anki 知道每张卡什么时候快被你忘掉
- [[gpt-3]] —— GPT-3 — Language Models are Few-Shot Learners
- [[ppo]] —— PPO — Proximal Policy Optimization
- [[world-model-robot-learning-2026]] —— 机器人世界模型综述 — 预测未来再动手

