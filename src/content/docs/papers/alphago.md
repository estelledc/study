---
title: AlphaGo — 击败围棋世界冠军
来源: 'Silver et al., "Mastering the Game of Go with Deep Neural Networks and Tree Search", Nature 2016'
日期: 2026-05-29
分类: 强化学习 / AI
难度: 中级
---

## 是什么

AlphaGo 是 **DeepMind 2016 年用神经网络 + 蒙特卡洛树搜索（MCTS）训出的围棋程序**，在首尔 4:1 击败世界冠军李世石。

日常类比：

- 以前的下棋程序像**死记棋谱 + 暴力穷举**——把每一步未来 20 步都算一遍，靠算力压死对手。这一招在国际象棋有用（Deep Blue 1997），在围棋失效，因为围棋分支太多，宇宙的原子都不够数。
- AlphaGo 像**会"感觉"哪步好的高手 + 在脑子里小规模沙盘推演**：先扫一眼局面"觉得"哪几步值得算，再针对那几步往后推几十步看胜率，最后挑数据上最稳的那一步。

"感觉" + "推演" 这两件事各对应一个神经网络 + 一套搜索算法。整套合体，是第一个在 19×19 标准围棋打败 9 段职业棋手的 AI。

## 为什么重要

不理解 AlphaGo，下面这些事都讲不清：

- 为什么围棋长期被认为"AI 至少还要 10 年才能赢人类"，2016 年一夜之间预测全错
- 为什么后来的 [[muzero]] / OpenAI Five / [[deepseek-r1]] 都在沿用"神经网络 + 搜索"的混合套路
- 为什么"Move 37"（vs 李世石第二局第 37 手）成了 AI 圈的标志事件——一手人类觉得"业余错误"的棋，AlphaGo 算出胜率最高，最后真的赢了
- 为什么 DeepMind 估值能从 4 亿涨到 80 亿——AlphaGo 是 Google 那笔 2014 年 5 亿美元收购的"决策正确性证明"

简单说：AlphaGo **改变了人类对"AI 能不能在创造性领域超过人类"的判断**。

## 核心要点

整个系统由 **三个角色** 组成，可以想成一个团队：

1. **策略网络（Policy Network）— 直觉派**
   看一眼棋盘，立刻给 19×19 每个位置打一个"该下这里的概率"。类比：老棋手扫一眼盘面，"这几个点能下，那一片不用看"。

2. **价值网络（Value Network）— 评估派**
   看一眼棋盘，输出一个数字："黑方现在赢的概率是 0.62"。类比：观战者不算具体下法，只判断"这盘谁占优势"。

3. **MCTS（蒙特卡洛树搜索）— 沙盘推演**
   用策略网络挑出"值得算的几步"，往下推几十步，每个分支用价值网络估胜率，最后选**被推演次数最多的那一步**作为真正落子。

为什么是"次数最多"而不是"胜率最高"？因为搜索预算被花在好分支上，访问次数高的分支已经被反复验证；只看一次就胜率高的分支可能只是运气。

## 实践案例

### 训练流程：先模仿、再自我对弈、最后学评估

AlphaGo 不是一步训出来的，而是 **三阶段课程表**：

1. **监督学习**：用 KGS 围棋服务器上 3000 万盘业余高手对局，训练策略网络模仿"人类高手会怎么下"。准确率约 57%（top-1 命中专家落子）。
2. **强化学习**：让策略网络的当前版本和**过去版本**自我对弈（不让两个一样的版本对，避免陷入"猜拳"循环）。赢了正向更新，输了负向更新。
3. **训价值网络**：用强化后的策略再自我对弈 3000 万盘，每盘随机抽一个局面 + 终局胜负，让价值网络学"看局面就估胜率"。

这个三阶段范式后来被 RLHF（[[rlhf-2017]] / ChatGPT 的训练流程）几乎原封不动复用：**SFT（模仿）→ RM（评估）→ PPO（强化）**。

### Move 37：人类看不懂、AI 算赢的一手

vs 李世石第二局第 37 手，AlphaGo 在五线（远离中央）下了一颗子。

- 人类解说现场判断："这是业余棋手才会犯的错误"
- AlphaGo 内部算出：这一手让胜率最高
- 几十手之后，那颗五线的子开始与全局联动，李世石认输

这一手震撼了围棋界，因为它**不在人类几千年总结的定式里**，但事后复盘是好棋。这是第一次大众层面感受到"AI 可能有人类没想到的创造力"。

### AlphaGo Zero：扔掉人类棋谱、从零自学

2017 年 DeepMind 发表 AlphaGo Zero：

- **不用任何人类棋谱**——从随机权重开始纯自我对弈
- **不用手工特征**——只看 3 通道原始棋盘（黑/白/空）
- **40 天后**反超 2016 击败李世石的版本，强 1500 ELO（差距相当于业余 1 段对职业 9 段）

启示：**人类知识不是越多越好**，有时候反而把模型限制在"人类风格"里。AlphaGo Zero 的开局经常不像人类（比如开局直接脱先三连星），却更强。

## 踩过的坑

1. **价值网络容易过拟合自我对弈数据**：自我对弈生成的局面分布有偏（只走 AI 自己偏好的下法）。AlphaGo Lee Sedol 版用了"价值网络估值 + 快速走子模拟胜负"的混合（λ = 0.5）做正则化。AlphaGo Zero 训得更好后，把模拟那部分扔了。

2. **MCTS 的先验用监督策略反而比强化策略好**：强化策略本身更强，但作"先验"时太自信，让搜索卡在自己偏好的几个分支。监督策略熵更高、给探索留余地，反而更适合做先验。这个反直觉发现说明 MCTS 需要的不是"最强 player"，而是"最 informative 的分布"。

3. **训练成本天文数字**：AlphaGo Lee Sedol 版用了 50 GPU × 几个月，比赛时用 1920 CPU + 280 GPU 分布式搜索。AlphaGo Zero 用 64 TPU × 40 天。这种 compute 门槛把同级别研究锁定在 DeepMind / OpenAI / Google 等少数机构。

## 适用 vs 不适用场景

**适用**：

- 完美信息棋类（围棋 / 国际象棋 / 将棋）—— AlphaZero 已经把这条路走到极致
- 离散动作空间（每步可选项有限且能枚举）
- 有明确胜负或回报信号

**不适用**：

- 不完全信息（扑克 / 麻将）—— SOTA 是 CFR 和 DeepStack，不是 MCTS
- 连续动作（机器人控制 / 自动驾驶）—— 用 PPO / SAC 这类策略梯度方法
- 实时多智能体（StarCraft / Dota）—— AlphaStar / OpenAI Five 用的是 PPO + self-play league，不是 AlphaZero 风格 MCTS

## 历史小故事（可跳过）

- **1997**：IBM Deep Blue 用暴力剪枝击败国际象棋冠军 Kasparov。围棋因为分支太多，这条路不通。
- **2006**：Rémi Coulom 把蒙特卡洛树搜索（MCTS）引入围棋，让 AI 从业余初学者跳到业余 5-6 段，但卡在那个水平 8 年。
- **2014**：DeepMind 开始研究围棋。
- **2015-10**：闭门赛 5:0 击败欧洲冠军樊麾（首次 AI 在 19×19 不让子击败职业棋手）。结果保密 5 个月。
- **2016-01**：Nature 论文发表 + 樊麾对局公开。
- **2016-03**：首尔 4:1 击败李世石。Move 37 成为传奇。
- **2017**：AlphaGo Master 60:0 横扫顶级职业；3:0 击败柯洁；AlphaGo Zero 从零自学反超所有版本；AlphaZero 把同一套算法迁到国际象棋 / 将棋。
- **2019**：[[muzero]] 连游戏规则都不需要知道。

## 学到什么

1. **神经网络 + 经典搜索 > 单独用任何一个**：AlphaGo 没有扔掉 MCTS，而是用神经网络给它装上"直觉"和"评估"。这种"老算法 + 新组件"的思路在 [[gpt-3]] / [[t5]] 也成立——不是从零设计架构，而是把已有方法 scale 到极致。
2. **三阶段训练（模仿 → 强化 → 评估）是可迁移范式**：RLHF 直接复用了这套 curriculum。
3. **自我对弈是 RL 的核心解锁**：有了 self-play，不需要外部 reward signal，player vs player 自然定义胜负。这套范式在 AlphaStar / OpenAI Five / Pluribus 都成功。
4. **领域知识注入是工程妥协，不是终极方案**：AlphaGo 用了 48 个手工特征通道、快速走子策略、人类棋谱启动；AlphaGo Zero 全部扔掉，反而更强。
5. **算法和算力永远在博弈**：很多"训练 trick" 在 scale 增大后会逐渐失效。AlphaGo Lee Sedol 版的工程巧思，本质是 2015 年 compute 限制下的妥协。
6. **Move 37 是评估模型 vs 策略模型分歧的产物**：策略网络给的概率很低，评估网络说"如果走它，最终胜率反而更高"——这种"统计直觉"突破人类几千年棋谱共识，是 ML 价值最戏剧性的展示
7. **AlphaGo Zero 的反向启示**：把人类棋谱、手工特征、快速走子全部扔掉，反而更强——领域知识的注入是工程妥协，scale 够了之后是负收益。今天 LLM "data + compute > inductive bias" 的潜规则，AlphaGo Zero 是教材级先例。
8. **三位一体可迁移**：神经网络 + 蒙特卡洛搜索 + 自我对弈是一套通用模板，从围棋迁到国际象棋、将棋、Atari、蛋白质折叠都成立——AlphaGo / AlphaZero / MuZero / AlphaFold 共享同一个骨架。
9. **保密的力量**：DeepMind 把樊麾对局保密 5 个月才公开，让"AI 击败围棋职业棋手" 变成一记重锤新闻——同样的成果如果分散在几个月里碎片公布，影响力会差几个数量级。
10. **MCTS 不是被替代是被装电**：搜索算法 1948 年就有，AlphaGo 的贡献不是发明新搜索，而是给老 MCTS 装上策略网络当"直觉"——很多领域的下一步突破不在新算法，在给经典框架配新引擎。

## 延伸阅读

- 纪录片：《AlphaGo》（2017，Netflix / YouTube 免费版本）—— 拍了李世石比赛全过程，能看到棋手 / DeepMind 团队 / Demis Hassabis 在现场的反应
- 论文 PDF：[Mastering the game of Go with deep neural networks and tree search](https://www.nature.com/articles/nature16961)（Nature 2016）
- 开源复现：[Leela Zero](https://github.com/leela-zero/leela-zero)（社区训的 AlphaGo Zero 复现）/ [Minigo](https://github.com/tensorflow/minigo)（TensorFlow 官方教学版）

## 关联

- [[dqn]] —— DeepMind 之前的 deep RL 起点；AlphaGo 继承了 CNN 处理棋盘的思路，但加了 self-play
- [[ppo]] —— 后来更轻量的 RL 算法；StarCraft / Dota 这类不完全信息环境用 PPO 而不是 AlphaZero 风格 MCTS
- [[muzero]] —— AlphaGo 家族的下一步：连游戏规则都不需要知道
- [[attention]] —— Transformer 起点；AlphaGo 用 CNN，AlphaStar / MuZero 后续逐步换成 Transformer
- [[rlhf-2017]] —— ChatGPT 那条路线的源头；三阶段训练范式与 AlphaGo 一脉相承

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[a3c-2016]] —— A3C — 多个 CPU 同时跑游戏，让 RL 不再吃 GPU
- [[attention]] —— Attention Is All You Need
- [[bert]] —— BERT — 双向 Transformer 预训练
- [[chatbot-arena-2024]] —— Chatbot Arena — 让真人盲投，给 LLM 排出公允座次
- [[chinchilla]] —— Chinchilla — 训练大模型的数据/参数最优比
- [[debate-2018]] —— AI safety via debate — 让两个 AI 互辩，人类只当评委
- [[decision-transformer-2021]] —— Decision Transformer — 把强化学习当成"文字接龙"
- [[deepseek-r1]] —— DeepSeek R1 — 强化学习推理模型
- [[dqn]] —— DQN — Deep Q-Network
- [[gpt-3]] —— GPT-3 — Language Models are Few-Shot Learners
- [[muzero]] —— MuZero — 不用规则也能下棋
- [[ntk-2018]] —— NTK — 把无限宽的神经网络变成一个可解的核方法
- [[ppo]] —— PPO — Proximal Policy Optimization
- [[quantum-supremacy-2019]] —— Quantum Supremacy 2019 — 量子机用 200 秒做完超算 1 万年的事
- [[sac-2018]] —— Soft Actor-Critic — 让强化学习既会拿分又愿意多试
- [[t5]] —— T5 — Text-to-Text Transfer Transformer

