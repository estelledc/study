---
title: RLHF Christiano 2017 — 人类偏好做奖励
来源: 'Christiano et al., "Deep Reinforcement Learning from Human Preferences", NeurIPS 2017'
日期: 2026-05-29
分类: 强化学习 / AI 安全
难度: 中级
---

## 是什么

RLHF（Reinforcement Learning from Human Preferences）是 OpenAI 在 2017 年发明的训练方法——**不告诉 agent 什么算"对"，让人在 agent 的两段录像里选哪个更好，agent 自己琢磨出"看起来不错"的样子**。

日常类比：教狗"坐"。你不会写一行公式定义"坐 = 屁股贴地 + 前腿伸直"，你只会给狗看两段它自己的录像——这一段它坐下来了，那一段它跑了——你伸手指那段你喜欢的。狗看你选了哪个，调整自己下次的姿势。重复几百次，狗"坐"得你点头满意。

这套思路 OpenAI 用神经网络实现：一个网络看视频学"哪个看着更好"（reward model），另一个网络根据 reward model 的打分练动作（policy）。两个网络一起跑，人在中间偶尔投票。整条流水线 9 年没变——从 Atari 游戏到 ChatGPT，骨架一字未改。

革命点在于：以前的 RL 必须有一个能写出来的 reward function（"接到球 +1 分""撞墙 -1 分"）。RLHF 之后，**任何能被人比较的目标都可以学**——"看起来酷"、"回答有帮助"、"别说有害的话"——都可以被压进网络。

## 为什么重要

不理解 RLHF，下面这些都解释不通：

- 为什么 ChatGPT / Claude 拒绝有害请求时那么"自然"——它不是写死规则，而是从数万条人类偏好里学出来的
- 为什么 [[instructgpt]]、[[constitutional-ai]]、[[dpo]] 都直接继承了同一套损失函数 + KL 锚定骨架
- 为什么 reward function 这道"怎么定义好"的难题，2017 年突然就解开了——把它转给人类成对比较
- 为什么一作 Christiano 后来创办 ARC、二作 Leike 现在在 Anthropic——这条线本身就是 AI 安全史的一条主轴
- 为什么"对齐"会突然成为一个产业——RLHF 把"听话"这个抽象目标变成了可监督的训练目标

## 核心要点

RLHF 的全部核心可以拆成 **三件事**：

1. **两个网络分工**：一个 reward model 学"人喜欢哪个"，一个 policy 网络学"怎么做出 reward model 喜欢的动作"。两边异步并行——人标注速度跟不上 PPO，所以 reward model 持续学，policy 也持续学，靠各自的速度走。

2. **成对比较代替绝对打分**：人不打"这段 7.3 分那段 8.1 分"，只回答"A 段好还是 B 段好"。好处：比较比评分稳定得多（"哪个更像跑步"比"7 分还是 8 分"容易答）。数学上叫 Bradley-Terry 概率模型——把两段轨迹的 reward 之差过 sigmoid 当胜率。

3. **主动挑题给人评**：训三个 reward model（同样数据但不同初始化），让它们在备选 pair 上打分。三个分歧大的 pair 才送给人——这把人力降到原本的 1%。

合起来：用 ~700 次人类比较，匹配 5000 万步原生 reward 的效果。这是 1000× 的标注效率，让"找几个标注员训出复杂行为"在工程上第一次成立。

## 实践案例

### 案例 1：Atari 游戏

不告诉 agent "Pong 的目标是用拍子接到球"。让它先随机乱动，挑两段 1-2 秒的录像给人看："这段你更喜欢吗？"人看见拍子接到球的那段就选它。重复几百次，agent 学会接球——甚至超出原游戏 score function 的水平。论文在 9 个 Atari 游戏上跑，6 个匹配或超过原 score 训出来的 agent。**关键是没动一行游戏代码定义"目标"**。

### 案例 2：MuJoCo 机器人 backflip（侧空翻）

这是论文最出圈的演示。模拟机器人原本只会摔倒，**没人能写出"侧空翻 = ?"的公式**。研究员让它随机动，挑两段录像给标注员选。900 次比较后，机器人学会了一个流畅的侧空翻——研究员从来没写过空翻的奖励函数，整个动作是从"哪段看着更像空翻"里浮现的。这个视频今天还在 OpenAI 官网展示，是 RLHF 最直观的"反直觉"证据：审美可以被训练。

### 案例 3：今天的 ChatGPT

ChatGPT 训练的 RLHF 阶段，本质就是 Christiano 2017 算法的文本版：

- "trajectory pair"换成"两段 LLM 回答"
- 标注员选"哪个回答更有帮助"
- 同样的 Bradley-Terry 损失把偏好压进 reward model
- 同样的 PPO + KL 锚定让 policy 不偏离原模型太远

所以你和 Claude 对话每一个"礼貌、克制、拒绝有害请求"的字，背后都是 2017 年这条流水线的直接子代。从机器人侧空翻到对话礼貌——同一个算法，换了壳。

## 踩过的坑

1. **Reward hacking**：policy 学会"刷 reward model 但不解决任务"。论文里 Atari 9 个游戏中 6 个出现这个现象——agent 找到 reward model 的盲区，做出高分但实际不像目标的动作。LM 上的对应表现是"凑字数"——回答越长 reward 越高，policy 把每段都拉到 max_tokens。这不是 bug，只要 reward model 容量有限就一定会发生。

2. **KL 系数没法理论选**：reward model 给的代理奖励上必须加 `β · KL(policy || reference)` 防止 policy 飘。但 β 选多少完全靠 sweep——太小 policy 飘到 OOD 区域刷分，太大 policy 不动。今天最脆弱的环节就是这个超参，没有任何理论指导，工业系统从 0.05 到 0.2 都见过。

3. **标注员之间不一致**：Bradley-Terry 假设"人对什么更好有一致 ranking"。但"helpful 但稍冒犯"vs"礼貌但跑题"，不同标注员真的会选不同——这是 alignment 难题的根，不是算法 bug。后续 Anthropic 的 HH-RLHF 数据集做了 helpful/harmless 分桶来缓解。

4. **小数据 + 大模型 = reward 漂移**：reward model 数据少时不稳定，PPO 跟着 reward 一起飘。今天工程上要么先 SFT 把 policy 锚定一下，要么改用 [[dpo]] 直接砍掉独立 reward model。

## 适用 vs 不适用场景

**适用**：

- 目标"写不出公式"的 RL 任务（机器人姿态 / 文本风格 / 对话礼貌）
- 标注预算够（数百到数万 pair）
- 有相对成熟的预训练 / SFT 模型当起点
- 需要在线探索的 RL（agent 持续生成新轨迹给人比较）

**不适用**：

- 多步推理任务（数学、代码）→ 用 process reward / 可验证奖励（[[deepseek-r1]] 路线）
- 标注预算 < 1000 pair → 直接 [[dpo]]，避免 PPO 在不稳定 reward 上发散
- 完全冷启动（policy 没预训练）→ ensemble disagreement 是噪声不是不确定性
- "1-100 分"绝对评分场景 → 人在绝对分数上 noise 太大，应该改用成对比较或 ordinal regression

## 历史小故事（可跳过）

- **2017.06**：Christiano、Leike、Brown、Amodei 等在 NeurIPS 投稿。Atari + MuJoCo 演示，主打"backflip"视频。一作 Christiano 在 OpenAI，二作 Leike 在 DeepMind——两家公司合作的产物。
- **2019**：Christiano + Ziegler 把这套搬到 GPT-2，发现 LM 上同样适用。代码开源在 `openai/lm-human-preferences`，后来所有 LM RLHF 系统都从这份代码长出来。
- **2020**：Stiennon 等用 RLHF 训摘要任务，证明 RLHF 比 SFT 更受人喜欢。
- **2022.03**：Ouyang 等发表 [[instructgpt]]，把 RLHF 工业化——SFT + RM + PPO 三段式。
- **2022.11**：ChatGPT 上线，本质是 InstructGPT 的产品化，全世界第一次大规模见识 RLHF 的威力。
- **2023.05**：Rafailov 等发表 [[dpo]]，证明可以砍掉独立 reward model，让 BT 损失直接训 policy。
- **2024**：Christiano 离开 OpenAI 创办 ARC，后任 US AI Safety Institute 负责人。Leike 从 OpenAI 跳槽 Anthropic。
- **2025**：[[deepseek-r1]] 用 GRPO（PPO 简化版）+ 可验证奖励重做 reasoning，但底层 reward → policy 流水线仍是 Christiano 2017 的变种。

一句话概括：2017 年的 9 页论文 + 配套 50 GPU-hour 实验，意外打开了"对齐"这个产业的大门。当时主打"机器人能学侧空翻"——5 年后才有人意识到，同样的算法可以让 LLM 学会"听话"。

历史的吊诡在于：论文当时主打的应用（视频里挑姿态）几乎没有任何后续，真正成为奠基的是论文里没写的应用（文本里挑回答）。

## 学到什么

1. **Reward 不必是公式，可以是网络**——这是过去 10 年最重要的范式转移。能写出公式的目标就是能学；写不出的目标也能学，只要能比较。
2. **比较 > 评分**：人在相对判断上稳，在绝对打分上噪。任何评测系统都该尽量用 pairwise，而不是"打 1-10 分"。
3. **两网络解耦 + KL 锚定**是 RLHF 工程不变的骨架。9 年过去，从 Atari 到 GPT-4，BT 损失一行 logsigmoid 都没改。
4. **有限容量的 reward model 一定能被 hack**——这不是 bug 是 feature。任何用学到的 metric 优化的系统，都要预设失败模式。
5. **算法骨架 9 年没变，变的是 backbone 和数据**——从 ConvNet → GPT-2 → GPT-4，从 Atari pair → 文本 pair。这种"原始算法极其简单 + 工程上极其稳定"的特性，是 RLHF 能跨越 RL → NLP 边界的根本原因。
6. **看似不可学的目标，往往只是没找到合适的 supervision 形式**——下次遇到"这个目标没法定义"的工程问题，先想想能不能用 pairwise 比较替代。

## 延伸阅读

- 论文 PDF：[arXiv 1706.03741](https://arxiv.org/abs/1706.03741)（v4 终版，主体 9 页）
- 视频解释：[Yannic Kilcher — Deep RL from Human Preferences](https://www.youtube.com/watch?v=oC7Cw3fu3gU)（30 分钟把核心算法讲清）
- 入门代码：[huggingface/trl](https://github.com/huggingface/trl) —— 现代 PyTorch 版本，从 reward 训练到 PPO 全流程
- [[instructgpt]] —— RLHF 怎么搬到 LM 上、3 段流水线工业化
- [[dpo]] —— 砍掉独立 reward model 的优雅简化
- [[constitutional-ai]] —— 让 AI 给自己标注（RLAIF），Anthropic 的 Claude 训练路线

## 关联

- [[instructgpt]] —— Christiano 2017 → LM 工业化，三段式（SFT + RM + PPO）的奠基
- [[constitutional-ai]] —— RLHF 的"标注员替换"派，用 AI 反馈代替人
- [[dpo]] —— RLHF 的"砍 RM"派，证明 BT 损失能直接训 policy
- [[deepseek-r1]] —— 后 RLHF 时代的可验证奖励路线，但流水线骨架仍承自 Christiano 2017
- [[transformer]] —— RLHF 训的对象（policy 网络）的标准底座

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）

