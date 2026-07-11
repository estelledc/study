---
title: MuZero — 不用规则也能下棋
来源: 'Schrittwieser et al., "Mastering Atari, Go, Chess and Shogi by Planning with a Learned Model", Nature 2020'
日期: 2026-05-29
分类: 强化学习
难度: 中级
---

## 是什么

MuZero 是 DeepMind 在 **arXiv 2019 / Nature 2020** 发表的 "AlphaZero 进化版"——它**不需要给它围棋规则、象棋规则、Atari 物理引擎**，自己从经验里学一个 "环境模型"，然后用这个模型来 plan（规划下一步）。

日常类比：[[alphago]] 像一个**知道扑克牌规则**的玩家——发牌、出牌、谁赢谁输都按手册来；MuZero 是一个**没看过规则书**的玩家，只通过观察别人怎么出牌、谁赢了，**自己脑补出一套规则**，然后用脑补的规则来想"下一步出什么"。

它在围棋、国际象棋、将棋、Atari 57 款游戏上都达到当时 SOTA——**用同一份代码、同一组超参数**。关键不是"更会下棋"，而是**把规则引擎从依赖列表里删掉了**。

如果你只会用"有完美模拟器才能搜索"的 AlphaZero 心智模型，会很难理解为什么后来很多真实世界 RL 项目敢先学一个 latent model 再规划。

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

整个流程串起来可以记成四拍：观察 → 编码 → 脑内搜索 → 只在真实世界走一步。训练时再用真实轨迹对 `g` 做 K 步展开（论文常用 K=5），逼它和真实 reward / 后续价值对齐。

## 实践案例

### 案例 1：一次决策的伪代码（可跟读）

```text
obs = env.reset()
s0 = h(obs)                    # 1. 像素/棋盘 → hidden state
for i in 1..N:                 # 2. MCTS：Atari≈50，棋类≈800
  leaf = puct_select(s0)       #    用 PUCT 选一条路径到叶子
  s', r = g(leaf.s, leaf.a)    #    dynamics 脑内推一步
  p, v = f(s')                 #    prediction 给策略与价值
  backup(path, v, r)           #    沿路径回传
action = argmax_visits(s0)     # 3. 访问次数最多的子节点
obs, reward = env.step(action) # 4. 只在真实环境走这一步
```

**逐部分解释**：

- ① `h` 只编码当前观察，不调用规则引擎
- ② 搜索全在脑子里，循环内不调真实 `env`
- ③ 真正交互只有最后一步 `env.step`
- ④ 训练阶段另对真实轨迹做 K 步 unroll，更新 h/g/f

### 案例 2：Atari——不告诉物理引擎，只看像素

Atari 输入是 **96×96 像素帧**——没人告诉它 "球碰到墙会反弹"、"打砖块得分"。

**逐部分解释**：

- ① `h` 只吃像素，不吃规则表
- ② `g` 在 latent 里学"按右键后下一状态 + reward"
- ③ MCTS 用这份自学物理做短程规划
- ④ 论文报告 57 款游戏 mean human-normalized score 接近 5000%，超过 DQN（~250%）、Rainbow（~874%）、R2D2（~3596%）

### 案例 3：围棋与 YouTube 压缩

围棋规则在 AlphaZero 里是**人写代码**；MuZero 删掉规则代码，ELO 仍略高于 AlphaZero——论文解释是 learned model 在 latent 空间更"光滑"，战略等价但棋形不同的局面会被映射到近邻点，MCTS 隐式做了 generalization。

DeepMind 后续把同类思路用到 YouTube VP9 的 RD 决策：每帧压缩参数 = action，画质+比特率 = reward，报告约 **节省 4% 比特率**。按平台流量规模，这是 model-based RL 规模化部署的代表叙事（工程细节在后续应用报告，不在 2020 主文 Methods 里）。

## 踩过的坑

1. **hidden state 完全黑盒**——你不能问 "这个状态表示棋盘哪里有子"。debug 不收敛时，分不清是 h 错还是 g 错。
2. **K=5 步 unroll 限制**——训练只验证 5 步；棋类 MCTS 树深可达 30，最深处的 g 输出可能不可靠。论文靠 PUCT 把访问集中在浅层缓解，但没根治。
3. **训练成本爆炸**——Atari 单游戏约 1000 TPU-cores × 12 小时量级；EfficientZero 降成本约 30 倍仍远超普通实验室预算。
4. **observation 噪声敏感**——Atari 像素近似确定性；真实摄像头噪声下，MuZero 路线不如 Dreamer 的 stochastic latent + KL 正则稳。

## 适用 vs 不适用场景

**适用**：

- 离散动作 + 清晰 reward（棋类、Atari、组合优化）
- 有大量 self-play 算力（DeepMind 级 TPU）
- 环境 deterministic 或弱 stochastic（强随机扑克要 Stochastic MuZero）

**不适用**：

- LLM 推理——动作空间是整个 vocabulary（约 10^5 token），MCTS 的 PUCT 跑不动
- 连续动作（机器人扭矩）——原版要枚举 action，需 Sampled MuZero
- observation 高噪声 → 优先 Dreamer 系列
- 需要可解释决策（自动驾驶、医疗）→ hidden state 不可 audit

## 历史小故事（可跳过）

- **2016 年**：[[alphago]] 击败李世石——需要人类棋谱 + 围棋规则代码。
- **2017–2018 年**：AlphaGo Zero / AlphaZero——扔掉棋谱、统一多棋种，**仍要规则代码**。
- **2018 年**：Ha & Schmidhuber World Models——latent dynamics 开山，但用 model-free（CMA-ES），没真做 MCTS plan。
- **2019 年 11 月**：MuZero 上 arXiv；**2020 年** Nature 正式发表。
- **2021 年**：EfficientZero——加 self-supervised consistency，Atari sample efficiency 大幅提升。
- **2023–2024 年**：DreamerV3 平行路线；芯片 floorplan 等工程应用沿用 MuZero 思路。

## 学到什么

1. **plan 不需要真实 simulator**——只需能预测 reward / policy / value 的模型。这是 RL 历史上一次重要的"减法"。
2. **三网络分解**（h / g / f）成了 model-based RL 的标准骨架——后来 Dreamer / IRIS / TWM 都沿用变体。
3. **K 步 unroll** 逼 dynamics 学 long-horizon 一致性，单步 dynamics 不够。
4. **不重建 observation 的 MuZero** 与 **重建的 Dreamer** 两条路线并存，没有绝对赢家。

## 延伸阅读

- 论文 PDF：[Schrittwieser et al. 2020 Nature](https://arxiv.org/abs/1911.08265)（先看 Figure 1 + Methods）
- 视频：[Yannic Kilcher — MuZero](https://www.youtube.com/watch?v=We20YSAJZSE)（约一小时讲透核心）
- 开源：[werner-duvaud/muzero-general](https://github.com/werner-duvaud/muzero-general)（PyTorch，cartpole / lunar lander 能跑）
- 官方 MCTS：[google-deepmind/mctx](https://github.com/google-deepmind/mctx)（含 Gumbel / Stochastic MuZero）
- 续作：[EfficientZero (Ye et al. 2021)](https://arxiv.org/abs/2111.00210)——sample efficiency 大跃进
- 对照阅读：DreamerV3 论文（重建 observation 的平行路线）

## 关联

- [[alphago]] —— 直接前作：perfect simulator + MCTS；MuZero 把 simulator 也学出来
- [[dqn]] —— Atari 上被替代的 model-free 代表，DQN 用 Q-learning + replay
- [[ppo]] —— model-free policy gradient；RLHF 选 PPO 是因为 LLM 难做 MCTS
- [[attention]] —— 后来 Stochastic MuZero / IRIS 用 transformer 做 dynamics
- [[gpt-3]] —— LLM + RLHF 是另一条主线，推理太慢没法在 token 空间跑 MCTS

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

