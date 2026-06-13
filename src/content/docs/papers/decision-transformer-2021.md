---
title: Decision Transformer — 把强化学习当成"文字接龙"
来源: 'Chen et al., "Decision Transformer: Reinforcement Learning via Sequence Modeling", NeurIPS 2021'
日期: 2026-06-01
子分类: reinforcement-learning
分类: 机器学习
难度: 中级
provenance: pipeline-v3
---

## 是什么

Decision Transformer（**DT**）是 2021 年 Lili Chen 等人提出的一种**把强化学习当成 GPT 那种文字接龙来做**的方法。

日常类比：

- 传统强化学习像一个**胆小的探索家**——每走一步都问"这步未来能赚多少分？"，靠不断试错调整。一旦数据是别人留下的（离线 RL），他就容易自欺欺人，把没见过的动作估得过高。
- Decision Transformer 像一个**会读历史的小说续写者**——你给他看几万局别人的轨迹，再丢一句"我希望最终拿 90 分"作为开头，他就接着把动作一个一个写出来。

具体地说，DT 把每条轨迹拆成 `(R̂_t, s_t, a_t)` 三元组——剩余目标分数、当前状态、动作——然后串成 token 序列喂给一个 GPT-2 风格的因果 Transformer，监督式训练 next-token 预测。推理时把"目标 return"当 prompt 写在序列开头，模型自回归生成动作。整个过程**没有 Q 函数、没有 TD 误差、没有 policy gradient**。

换句话说，DT 把"学一个最优策略"这个优化问题，重写成了"补全一段已经实现高分的轨迹"这个生成问题。这一步思路转换是 2021 年 RL 领域最重要的范式革新之一。

## 为什么重要

不理解 DT，下面这些事都讲不清：

- 为什么 2022 年 DeepMind Gato（一个 600+ 任务的通用 agent）能用单一 Transformer 架构横扫文字、图像、Atari、机器人——它的范式根就是 DT
- 为什么后来 RT-1 / RT-2 这些机器人大模型敢直接用 [[gpt-3]] 那一套接龙做控制，不再搞 actor-critic
- 为什么离线 RL 圈在 2021 年集体转向"序列建模"——CQL 那种保守 Q 学习突然显得复杂笨重
- 为什么"prompt 工程"开始渗透到决策领域——你给 DT 不同的 desired return，它就生成不同水平的策略
- 为什么 2023 年后所有"基础模型 + 决策"的系统几乎都先尝试 DT 风格的接口，再考虑用 RL 微调

一句话：DT 把 RL 从"控制论分支"拉进了"大模型范式"，让两个原本割裂的 community 共用一套工具链。

## 核心要点

DT 的精髓拆成 **三步**：

1. **轨迹 token 化**：一条轨迹 `(s_0, a_0, r_0, s_1, a_1, r_1, ...)` 重排成 `(R̂_0, s_0, a_0, R̂_1, s_1, a_1, ...)`，其中 `R̂_t = sum(r_t...r_T)` 是"从这步往后还能拿多少分"。类比：把 GPS 路线改写成"距离终点 X 公里 → 当前位置 → 这一步该转方向"。

2. **监督式训练**：用普通 cross-entropy 让 Transformer 预测每个时刻的 `a_t`，输入是过去 K 步的 token。**没有 Bellman 方程、没有 bootstrapping、没有 target network**——和训练 GPT 一模一样的 next-token 预测。损失函数对动作 token 求 MSE（连续）或交叉熵（离散）。

3. **conditioning on return**：推理时你写一个目标分数 `R̂_0 = 90`，模型就**模仿**训练数据里"最终拿 90 分的那些轨迹"接续动作。类比：让一个看过 100 万局棋谱的人"假装自己是顶级棋手"下棋。这步本质是 Bayes 后验：`P(a | s, target_return)`。

三步合起来一句话：**RL = 序列建模 + 后验条件**。这是把 Transformer 大模型时代的方法论硬拗进决策领域的关键转译。

## 实践案例

### 案例 1：D4RL Hopper 上的目标分数玩法

```python
# 训练完后，给不同的 target return
for target in [3600, 1800, 600]:
    obs = env.reset()
    rtg = target          # return-to-go：希望最终拿到多少分
    states, actions = [obs], []
    for t in range(1000):
        a = dt.predict(rtg, states[-K:], actions[-K:])
        obs, r, done, _ = env.step(a)
        states.append(obs)
        actions.append(a)
        rtg -= r          # 关键：剩余目标随实际拿到的分递减
```

**逐部分解释**：

- `rtg` 是 return-to-go，类比"我还剩多少作业要做"，每完成一点就减一点
- 模型每步只看最近 K 步（论文用 `K=20`）的 token 历史，超出就忘
- 同一份权重，目标设 3600 跳得比训练集平均高，设 600 慢慢挪——**一个网络拟合多种水平的策略**

### 案例 2：Atari Breakout 上少数据反超 CQL

```text
数据: 1% DQN replay buffer (~50 万 transitions)
DT  Breakout 得分: 76.9
CQL Breakout 得分: 49.0
```

为什么？序列建模天然能用 trajectory-level 信息——它看到"哪些完整轨迹拿了高分"，直接模仿；Q-learning 必须从单步 reward 一格格反向传播，少数据下方差大。

### 案例 3：Key-to-Door 长程信用分配

任务设定：进房间 → 拿钥匙 → 走很远 → 开门拿 reward。**reward 只在最后一步给**。

- Q-learning 必须把最后一步的奖励"反向传播"到拿钥匙那一步，路径越长信号衰减越严重
- DT 直接看整条轨迹的 return-to-go，**像看小说一样把因果连起来**——序列里"拿钥匙"和"开门得分"自然挨着 attention
- 实验：30 步窗口内 DT 成功率显著高于 CQL，证明 RL 的"长程信用分配"难题可以被序列建模绕过

## 踩过的坑

1. **目标 return 不是越高越好**：设到训练集最大值之外，模型进入 OOD 区域生成乱动作；通常扫一段 return 找甜区（论文附录有 sweep 曲线），新人常以为"设个超大数让模型尽力跑"，结果反而更差。
2. **不会自我改进**：纯监督学习，离线数据的天花板就是策略的天花板。想 online finetune 得换 Online DT（Zheng et al., 2022）等后续工作；指望 DT "训着训着自己变强"是误区。
3. **长上下文不等于长信用分配**：context window 之外的奖励仍传不到，Key-to-Door 长度超过 K 时一样崩。"换更长 attention 就行了" 是天真想法——计算量是平方的。
4. **随机环境下 conditioning 有偏**：在 stochastic env 里"以高 return 为条件"会偏向运气好的轨迹（survivorship bias），ESPER（2022）和 Q-Transformer（2023）专门修这个数学缺陷。

## 适用 vs 不适用场景

**适用**：

- 离线 RL（D4RL、Atari replay、医疗记录、推荐系统日志）——只要你有大批轨迹数据
- 多任务 / 多 return 水平共享一个模型（不需要为每个目标重训）
- 需要和大模型基础设施（attention、KV cache、扩展上下文、Flash Attention）集成的决策场景
- 想用大模型预训练 + 决策 finetune 的统一栈（RT-2 路线）

**不适用**：

- 在线探索（DT 不知道怎么探索新动作）——配 epsilon-greedy 或换 Online DT
- 高度随机的环境（return-conditioning 数学不严格，会偏向幸存者）
- 数据极少（<1 万 transitions）——Transformer 没东西拟合，老老实实用 BC 或 [[ppo]]
- 需要严格安全保证的控制（自动驾驶、医疗）——监督式没有约束机制，必须配 shield 层

## 历史小故事（可跳过）

- **2021 年 6 月**：UC Berkeley + Facebook AI Research 的 Lili Chen, Kevin Lu, Aravind Rajeswaran 等放出 arXiv（2106.01345）。同月 Michael Janner 等的 Trajectory Transformer 走类似路线，两篇被并称为"序列建模 RL 的双璧"。
- **2021 年 12 月**：NeurIPS 2021 Spotlight，引发离线 RL 社区集体转向序列建模。
- **2022 年 5 月**：DeepMind Gato 把 DT 范式推到 604 个任务，单一权重，Transformer 决策走入"通才 agent"时代。
- **2022-2023**：Online DT、Multi-Game DT、ESPER 等扩展工作把"在线 finetune"、"多任务"、"随机环境"三个原版痛点逐一打补丁。
- **2023-2024**：RT-1 / RT-2 / Octo 把这套架构带进真实机器人，"prompt 一段目标，机器人接续动作"成了主流接口。
- **背景**：这条路线的精神先驱可追溯到 1990 年代 inverse RL 和 2018 年 Upside-Down RL（Schmidhuber），但都没等到 Transformer 这个合适的载体。

## 学到什么

1. **跨范式迁移的力量**：把 NLP 的 next-token 训练原样搬到 RL，竟然不输专门方法——说明 Transformer 是真正通用的序列建模器，"问题表述"比"算法精巧"更重要。
2. **后验条件 vs 优化**：传统 RL 在"找最大化 return 的策略"；DT 在"模仿那些恰好拿到该 return 的策略"。两种数学路径，结果相近，工程上后者简单 10 倍——没有 critic、没有 replay buffer、没有 target network。
3. **离线 RL 的简化革命**：CQL / IQL / BCQ 那套保守值估计在很多场景被一个 GPT-2 取代——少即是多，尤其是数据量大时。
4. **大模型时代的 agent 雏形**：DT 是从 [[gpt-3]] 到 generalist agent（Gato / RT-2）的关键中间一步，让"决策"和"语言"共用一套 infra。

## 延伸阅读

- 论文 PDF：[Decision Transformer arXiv](https://arxiv.org/abs/2106.01345)（核心 9 页 + 附录，读 §3-§5 即可）
- 视频讲解：[Yannic Kilcher — Decision Transformer 论文精读](https://www.youtube.com/watch?v=-buULmf7dec)（45 分钟把直觉讲透，强推）
- 官方代码：[kzl/decision-transformer (GitHub)](https://github.com/kzl/decision-transformer)（Atari 和 Gym 各一份独立实现，约 800 行 PyTorch）
- 平行工作：[Trajectory Transformer (Janner 2021)](https://arxiv.org/abs/2106.02039)，把状态、动作、reward 全 token 化做 beam search
- 后续扩展：Online DT (Zheng 2022) / Multi-Game DT (Lee 2022) / Gato (Reed 2022) / Q-Transformer (Chebotar 2023)
- 精神先驱：[Schmidhuber, Upside-Down RL (2019)](https://arxiv.org/abs/1912.02875)，DT 把这思路真正做成了 SOTA

## 关联

- [[gpt-3]] —— DT 借用了完全相同的 Transformer 架构和 next-token 训练目标，把 NLP 工具链原样搬到决策
- [[attention]] —— 因果注意力让 DT 能看历史轨迹做决策，每个 token 关注过去的 state-action-return 序列
- [[ppo]] —— 传统 policy gradient 代表，DT 是它的"无梯度"替代路线，工程复杂度差一个数量级
- [[alphago]] —— 同样是把 RL 推进到新高度的工作，但走的是 MCTS+value 的传统路；DT 是另一条对照线
- [[rlhf-christiano]] —— 也用 reward 信号训策略，但仍依赖 RL 优化；DT 提示了"监督式替代"的可能
- [[instructgpt]] —— 用 RLHF 微调大模型；DT 暗示也许可以全程监督学习达到类似效果
- [[transformer-xl-2019]] —— 长上下文 Transformer，DT 在长程任务上也受益于此类技术（K=20 → K=200）

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[alphago]] —— AlphaGo — 击败围棋世界冠军
- [[attention]] —— Attention Is All You Need
- [[gpt-3]] —— GPT-3 — Language Models are Few-Shot Learners
- [[instructgpt]] —— InstructGPT — RLHF 让 LLM 听话
- [[ppo]] —— PPO — Proximal Policy Optimization
- [[rlhf-christiano]] —— RLHF Christiano 2017 — 人类偏好做奖励
- [[transformer-xl-2019]] —— Transformer-XL — 让 Transformer 像 RNN 那样把上下文滚动传下去

