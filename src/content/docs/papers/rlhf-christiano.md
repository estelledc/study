---
title: RLHF Christiano 2017 — 人类偏好做奖励
来源: 'Christiano et al., "Deep Reinforcement Learning from Human Preferences", NeurIPS 2017'
日期: 2026-05-29
分类: 强化学习 / AI 安全
难度: 中级
---

## 是什么

RLHF（Reinforcement Learning from Human Preferences）是 OpenAI 与 DeepMind 在 2017 年提出的训练方法——**不告诉 agent 什么算"对"，让人在 agent 的两段录像里选哪个更好，agent 自己琢磨出"看起来不错"的样子**。

日常类比：教狗"坐"。你不会写一行公式定义"坐 = 屁股贴地 + 前腿伸直"，你只会给狗看两段它自己的录像——这一段它坐下来了，那一段它跑了——你伸手指那段你喜欢的。狗看你选了哪个，调整自己下次的姿势。重复几百次，狗"坐"得你点头满意。

这套思路用两个神经网络实现：一个看视频学"哪个看着更好"（reward model，奖励模型），另一个根据打分练动作（policy，策略）。两边异步跑，人在中间偶尔投票。偏好→奖励模型→策略这条骨架从 Atari 一路传到 ChatGPT；中间换过优化器（2017 用 A2C/TRPO，后来工业界常用 PPO），但成对比较这一核没变。

革命点在于：以前的 RL 必须有一个能写出来的 reward function（"接到球 +1 分""撞墙 -1 分"）。RLHF 之后，**任何能被人比较的目标都可以学**——"看起来酷"、"回答有帮助"、"别说有害的话"——都可以被压进网络。

## 为什么重要

不理解 RLHF，下面这些都解释不通：

- 为什么 ChatGPT / Claude 拒绝有害请求时那么"自然"——它不是写死规则，而是从数万条人类偏好里学出来的
- 为什么 [[instructgpt]]、[[constitutional-ai]]、[[dpo]] 都继承了「成对偏好 + Bradley-Terry 损失」这条线（InstructGPT 再叠上 PPO + KL 锚定）
- 为什么 reward function 这道"怎么定义好"的难题，2017 年突然就解开了——把它转给人类成对比较
- 为什么一作 Christiano 后来创办 ARC、二作 Leike 现在在 Anthropic——这条线本身就是 AI 安全史的一条主轴
- 为什么"对齐"会突然成为一个产业——RLHF 把"听话"这个抽象目标变成了可监督的训练目标

## 核心要点

RLHF 的全部核心可以拆成 **三件事**：

1. **两个网络分工**：一个 reward model 学"人喜欢哪个"，一个 policy 学"怎么做出 reward model 喜欢的动作"。两边异步并行——人标注跟不上策略更新，所以两边各自持续学。2017 原文 Atari 用 A2C、机器人用 TRPO；后来 LM 工业化才普遍换成 PPO。

2. **成对比较代替绝对打分**：人不打"这段 7.3 分那段 8.1 分"，只回答"A 段好还是 B 段好"。比较比评分稳得多。数学上叫 Bradley-Terry 模型——把两段轨迹的 reward 之差过 sigmoid 当胜率。

3. **主动挑题给人评**：训三个 reward model（同样数据、不同初始化），让它们在备选 pair 上打分。三个分歧大的 pair 才送给人——论文称这把人类监督降到约 1% 量级交互。

合起来：Atari 约 ~700 次人类比较，可匹配约 5000 万步原生 reward 的效果，让"找几个标注员训出复杂行为"在工程上第一次成立。

（比较次数论文里常写成 bits of feedback；一次二选一大约对应 1 bit。）

## 实践案例

### 案例 1：Atari 游戏

不告诉 agent "Pong 的目标是用拍子接到球"，按四步走：

1. **随机探索**：agent 先乱动，录下许多 1–2 秒短片段
2. **挑 pair**：系统选出两段录像并排给人看
3. **人点选**：看见拍子接到球的那段就点它；偏好写入数据集
4. **RM → policy**：reward model 更新打分，A2C 策略跟着学接球

论文在 9 个 Atari 上跑，约 6 个匹配或超过用原 score 训的 agent。**关键是没动一行游戏代码定义"目标"**。

### 案例 2：MuJoCo 机器人 backflip（侧空翻）

模拟机器人原本只会摔倒，**没人能写出"侧空翻 = ?"的公式**。按同一四步走：

1. **随机扭动**：机器人在仿真里乱试动作，录短片段
2. **挑 pair**：并排两段录像给标注员
3. **人点选**：选"更像空翻 / 更好看"的那段
4. **RM → policy**：reward model 更新后，用 TRPO 更新策略

约 900 次比较后，流畅侧空翻从"哪段看着更像"里浮现——审美可以被训练。该演示长期是 RLHF 最直观的反直觉证据。

### 案例 3：今天的 ChatGPT

ChatGPT 的 RLHF 阶段是 2017 骨架的文本版，再叠上 InstructGPT 的工程件：

- "trajectory pair"换成"两段 LLM 回答"
- 标注员选"哪个回答更有帮助"
- 同样的 Bradley-Terry 损失把偏好压进 reward model
- **PPO + KL 锚定**（相对 SFT 参考模型）让 policy 不飘太远——这是 2022 工业化标配，不是 2017 原文算法

从机器人侧空翻到对话礼貌：同一条「偏好→RM→策略」流水线，换了壳和优化器。你看到的"礼貌拒绝有害请求"，多半来自这条线的子代，而不是写死 if-else。

## 踩过的坑

1. **Reward hacking**：policy 学会"刷 reward model 但不解决任务"。论文 Atari 多款游戏出现过——agent 钻 RM 盲区拿高分。LM 上对应"凑字数"：回答越长分越高，被拉到 max_tokens。RM 容量有限时几乎必然发生。
2. **KL 系数没法理论选**（InstructGPT 起常见）：代理奖励上加 `β · KL(policy || reference)` 防飘，但 β 全靠 sweep——太小飘到分布外（OOD，训练分布之外）刷分，太大不动。工业常见 0.05–0.2。
3. **标注员之间不一致**：Bradley-Terry 假设人有一致 ranking；"helpful 但稍冒犯"vs"礼貌但跑题"会选崩。后续 HH-RLHF 用 helpful/harmless 分桶缓解。
4. **小数据 + 大模型 = reward 漂移**：RM 不稳时 PPO 跟着飘。工程上先 SFT 锚定，或改用 [[dpo]] 砍掉独立 RM。真实流水线还要采样器挑不相似 pair、金标准质控、majority vote——人力才是最大瓶颈，才催生 RLAIF（用 AI 代替人标注）。

## 适用 vs 不适用场景

**适用**：

- 目标"写不出公式"的 RL 任务（机器人姿态 / 文本风格 / 对话礼貌）
- 标注预算够（数百到数万 pair）
- 有相对成熟的预训练 / SFT 模型当起点
- 需要在线探索的 RL（agent 持续生成新轨迹给人比较）

**不适用**：

- 多步推理任务（数学、代码）→ 用 process reward / 可验证奖励（[[deepseek-r1]] 路线）
- 标注预算 < 1000 pair → 直接 [[dpo]]，避免 PPO 在不稳定 reward 上发散
- 完全冷启动（policy 没预训练）→ 多 RM 分歧（ensemble disagreement，几个打分器意见不合）多半是噪声，不是可靠不确定性
- "1-100 分"绝对评分场景 → 人在绝对分数上 noise 太大，应改用成对比较

## 历史小故事（可跳过）

- **2017.06**：Christiano、Leike、Brown、Amodei 等投稿 NeurIPS；Atari + MuJoCo，主打 backflip。一作在 OpenAI、二作在 DeepMind——两家合作产物。
- **2019**：Ziegler 等把偏好学习搬到 GPT-2（`openai/lm-human-preferences`），LM RLHF 从此长出来。
- **2020**：Stiennon 等用 RLHF 做摘要，证明比纯 SFT 更受人喜欢。
- **2022.03 / 11**：[[instructgpt]] 把 SFT + RM + PPO 工业化；ChatGPT 产品化让全世界看见 RLHF。
- **2023.05**：[[dpo]] 证明可砍独立 RM，BT 损失直接训 policy。
- **2021 / 2024**：Christiano 2021 初离开 OpenAI 并创办 ARC；其后任 US AI Safety Institute 安全负责人。Leike 后从 OpenAI 加入 Anthropic。
- **2025**：[[deepseek-r1]] 用 GRPO + 可验证奖励做 reasoning，但「奖励信号 → 更新策略」仍承自这条线。

吊诡在于：论文主打的视频姿态应用几乎无后续；真正奠基的是当时没写的应用——文本里挑回答。2017 年约 9 页论文 + 有限算力实验，意外打开了"对齐"产业的大门。

## 学到什么

1. **Reward 不必是公式，可以是网络**——写得出公式的目标能学；写不出的也能学，只要能比较。
2. **比较 > 评分**：人在相对判断上稳、绝对打分上噪；评测尽量用 pairwise。
3. **偏好→RM→策略**是骨架；优化器可换（A2C/TRPO→PPO），BT 损失几乎没改。有限容量 RM 一定能被 hack——要预设失败模式。
4. **看似不可学的目标，往往只是没找到合适的 supervision**——下次遇到"没法定义"，先问能不能 pairwise。

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

- [[a3c-2016]] —— A3C — 多个 CPU 同时跑游戏，让 RL 不再吃 GPU
- [[ccopd-distillation]] —— CCOPD — 让多轮对话别被自己的旧话带偏
- [[chatbot-arena-2024]] —— Chatbot Arena — 让真人盲投，给 LLM 排出公允座次
- [[debate-2018]] —— AI safety via debate — 让两个 AI 互辩，人类只当评委
- [[decision-transformer-2021]] —— Decision Transformer — 把强化学习当成"文字接龙"
- [[flan-2021]] —— FLAN — 用自然语言指令教模型学会"听话"
- [[mesa-optimization-2019]] —— Mesa-Optimization 2019 — 训出来的模型自己也是个优化器
- [[reasoning-with-sampling]] —— Reasoning with Sampling — 在关键决策点重采样推理过程
- [[reward-hacking]] —— Concrete Problems in AI Safety — 把 AI 安全风险拆成工程问题
- [[self-trained-verification]] —— Self-Trained Verification — 让模型先看标准答案学会挑错
