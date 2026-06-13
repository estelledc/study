---
title: Agent强化学习综述 — 从 PPO 到 GRPO，从训练时扩展到推理时计算
来源: 'Z. Pan et al., "A Survey of Slow Thinking-based Reasoning LLMs using Reinforcement Learning and Test-Time Scaling Law", 2025; Guo et al., "DeepSeek-R1", 2025; Shao et al., "DeepSeekMath", 2024'
日期: 2026-06-13
分类: Agent
子分类: 强化学习与推理时计算
provenance: pipeline-v3
---

## 是什么

Agentic RL（Agent强化学习）是 2025 年 LLM 领域最核心的技术趋势之一。它把强化学习（RL）应用于 LLM agent 的训练和推理，让模型不仅在"训练时"学得好，在"推理时"也能通过多花计算来"想得更深"。

日常类比：好比一个学生备考。传统方法是老师准备好标准答案让学生背（SFT）。RL 的方法是把学生扔进自习室，给几道题让他自己试，做对了给奖励（reward），做错了就调整策略。而"推理时计算"（test-time compute）相当于考试时让学生多检查几遍——不是背得更熟，而是把已经会的知识在答题那几分钟用得更充分。

2025 年这个领域经历了一次范式转换：从"训练时拼命堆参数"转为"推理时多花几秒钟"。DeepSeek-R1 是这场转换的标志性事件——它证明了纯 RL 训练（不加任何监督微调）就能让模型自发学会 chain-of-thought 推理和自我验证。

## 为什么重要

不理解 agentic RL 和 test-time compute，下面这些 2025 年的关键现象都没法解释：

- 为什么 DeepSeek-R1 能靠纯 RL 训练出推理能力，而之前所有模型都需要大量人工标注数据
- 为什么 GRPO 突然取代 PPO 成为 LLM 训练的主流 RL 算法——2025 年下半年几乎所有开源 RL 训练框架都用它
- 为什么 o1/o3 系列模型能解复杂数学题——它们的"思考更久"不是营销话术，是 test-time compute scaling 的工程实现
- 为什么 inference-time 的搜索算法（MCTS、Best-of-N）和训练时的 RL 是同一枚硬币的两面
- 为什么 reward 设计（规则奖励 vs 模型奖励）是整个 agentic RL 体系最核心也是最脆弱的一环

## 核心要点

Agentic RL 的核心可以拆成三个相互咬合的齿轮：**训练时 RL**、**推理时计算**、**奖励机制**。

### 齿轮一：训练时 RL —— 从 PPO 到 GRPO

**PPO（Proximal Policy Optimization，2017）**是 RLHF 的标准算法。日常类比：PPO 像一个谨慎的教练——每次调整运动员动作时只微调一点点，防止因为一次大改把运动员搞废了。技术上，PPO 需要同时维护 4 个模型：Actor（训练的 LLM）、Critic（预估奖励的值函数网络）、Reward Model（打分）、Reference Model（基准对比）。四个模型吃 GPU 内存，训练成本极高。

**GRPO（Group Relative Policy Optimization，2024）**是 DeepSeek 提出的改进。核心改动：**砍掉 Critic 网络**。PPO 需要 Critic 来算"这条轨迹相比预期好多少"（advantage），GRPO 换了个更简单的方法：对同一个问题生成 N 个回答（一个 group），看每个回答的奖励在这个 group 里排第几，排在前面的就加强，排在后面的就削弱。这就是"group relative"的含义——不需要绝对值，相对排名就够了。

GRPO 砍掉 Critic 的好处：
- 省一半内存（少一个模型）
- 训练更快
- 对规则型奖励（数学答案对错）天然适配——因为 reward 是二值的（对=1/错=0），group 内的相对比较自动校准了奖励的尺度

GRPO 的目标函数（简化版）：

```python
# GRPO 的 advantage 计算（伪代码）
def grpo_advantage(rewards):
    # rewards: 同一个 prompt 下 N 个回答的奖励 [r1, r2, ..., rN]
    mean_r = mean(rewards)
    std_r = std(rewards)
    advantages = [(r - mean_r) / std_r for r in rewards]
    return advantages
    # 结果：奖励高于组平均的回答得到正 advantage，低于的得到负 advantage
```

### 齿轮二：推理时计算 —— 让模型在考试时多想几秒

推理时计算（test-time compute）在 2025 年从隐学变成显学。三类主流方法：

**1. 并行采样 + 投票（Best-of-N / Self-Consistency）**
生成 N 个答案，多数投票或让 verifier 选最佳。简单粗暴，但 N 大了成本也大。2025 年的研究发现 BoN 在 agent benchmark 上 N=4 就能带来约 7 个百分点的提升。

**2. 结构化搜索（MCTS / Tree-of-Thoughts / Beam Search）**
不只是一条路走到黑，而是像下棋一样探索多条推理分支，碰到死胡同就回退。MCTS 需要 Process Reward Model（PRM）给中间步骤打分——这是当前最大的工程瓶颈，因为高质量的中间步骤标注太难搞了。

**3. 思维长度控制（Budget Forcing / Long CoT）**
强制模型生成更长的推理链。方法很简单：在模型想说"结束"时强行追加"Wait，再想想"，模型就会继续推理。研究发现，仅用 1000 个训练样本做 budget forcing，就能在 AIME24 数学题上超过 o1-preview。

三类方法的统一框架：

```python
# 推理时计算的抽象——三种方法共享同一个骨架
class TestTimeScaling:
    def __init__(self, generator, verifier, search_strategy):
        self.generator = generator        # 生成候选答案的 LLM
        self.verifier = verifier          # 评价答案好坏的打分器
        self.search = search_strategy     # 怎么在候选空间里找最佳

    def solve(self, problem):
        if self.search == "best_of_n":
            candidates = [self.generator(problem) for _ in range(N)]
            return self.verifier.best(candidates)
        elif self.search == "mcts":
            tree = Tree(root=problem)
            for _ in range(budget):
                leaf = tree.select()           # UCB 选节点
                expanded = tree.expand(leaf)   # LLM 生成子节点
                value = self.verifier(expanded) # PRM/ORM 打分
                tree.backprop(leaf, value)     # 分数回传
            return tree.best_path()
        elif self.search == "cot":
            return self.generator(problem, max_tokens=longer)
```

### 齿轮三：奖励机制 —— 整个体系的阿喀琉斯之踵

RL 训练和 test-time 搜索都依赖 reward signal。reward 来自三种渠道：

| 类型 | 原理 | 优点 | 缺点 |
|------|------|------|------|
| 规则奖励 | 程序化判断对错（数学=看答案/代码=跑测试） | 完美准确、零成本 | 只能覆盖封闭域任务 |
| Outcome Reward Model (ORM) | 训一个模型给最终答案打分 | 通用性强 | 只看结果不看过程 |
| Process Reward Model (PRM) | 给每个中间步骤打分 | 支持搜索剪枝 | 标注极难、容易训歪 |

2025 年最大的教训：**不好的 reward 比没有 reward 更危险**。用低质量 PRM 做 MCTS 会出现"反推理缩放"（inverse inference scaling）——搜得越多越差，因为 PRM 把正确的中间步骤打了低分。

## 实践案例

### 案例 1：用 GRPO 训练一个能做数学题的 LLM

以 DeepSeek-R1 的训练流程为例。任务是解数学题，reward 很简单：答案对=1，错=0。

```python
# 简化版 GRPO 训练循环
from transformers import AutoModelForCausalLM, AutoTokenizer
import torch

model = AutoModelForCausalLM.from_pretrained("deepseek-math-base")
tokenizer = AutoTokenizer.from_pretrained("deepseek-math-base")

def train_step(prompts, G=8):  # G = 每个 prompt 生成的回答数
    # Step 1: 对每个 prompt 生成 G 个回答
    all_outputs = []
    all_rewards = []
    for prompt in prompts:
        outputs = model.generate(prompt, num_return_sequences=G, do_sample=True)
        rewards = [check_answer(o, ground_truth) for o in outputs]  # 0 或 1
        all_outputs.extend(outputs)
        all_rewards.extend(rewards)

    # Step 2: GRPO advantage = (r - group_mean) / group_std
    advantages = compute_grpo_advantages(all_rewards, group_size=G)

    # Step 3: policy gradient + clipping + KL penalty
    loss = 0
    for output, advantage in zip(all_outputs, advantages):
        ratio = model.logprob(output) / old_model.logprob(output)
        clipped = torch.clamp(ratio, 1-0.2, 1+0.2)  # epsilon=0.2
        loss += -torch.min(ratio * advantage, clipped * advantage)
    loss += beta * kl_divergence(model, reference_model)  # KL 惩罚

    optimizer.zero_grad()
    loss.backward()
    optimizer.step()

# 关键观察：纯 RL 训练几百步后，模型自发开始输出
# "Wait, let me check this..." 这类自我验证行为 —— "aha moment"
```

### 案例 2：Best-of-N 在 agent 任务上的实战

Best-of-N 是推理时计算最简单的实现——生成多个候选，选最好的。

```python
def best_of_n_agent(task, verifier, n=4):
    """
    task: "找出 2023 年诺贝尔物理学奖得主的母校"
    verifier: 给 agent 的完整 trajectory 打分的函数
    """
    trajectories = []
    for i in range(n):
        # agent 执行完整 multi-step 操作
        traj = run_agent(task)  # search → read → extract → answer
        trajectories.append(traj)

    # verifier 打分，选最高分的
    best = max(trajectories, key=lambda t: verifier.score(t))
    return best.answer

# 实验结果（来自 survey 数据）：
# N=1 (单次):   准确率 52%
# N=4 (BoN-4):  准确率 59%  (+7pp)
# N=16 (BoN-16): 准确率 63%  (+11pp)
# 注意边际递减：N 翻 4 倍只多涨 4pp——diversity 不足时采样再多也没用
```

### 案例 3：三种推理时方法的对比

假设解一道数学题："一个等差数列前 5 项和是 35，前 10 项和是 120，求第一项和公差。"

**CoT（链式思维）**：模型一次生成完整推理链 → "设首项 a，公差 d。前5项和=5a+10d=35。前10项和=10a+45d=120。解方程组得 a=3, d=2。" → 正确。

**Best-of-N**：生成 5 条不同推理 → 其中 3 条得到 (3,2)，1 条得到 (5,0)（算错），1 条得到 (1,3)（算错）→ 多数投票选 (3,2) → 正确。

**MCTS**：模型先试探性列方程，PRM 打分"这一步对"→ 展开解方程分支，PRM 发现一条分支代入后不满足原方程，剪掉 → 最终选 (3,2) → 正确。

三种方法都答对了，但"性价比"不同：CoT 最便宜但容错性最差（一条路走到黑），BoN 浪费计算但实现最简单，MCTS 理论上最优但严重依赖 PRM 质量。

## 踩过的坑

1. **GRPO 的长度偏置（length bias）**：GRPO 的 advantage 计算会对所有 token 均匀分配 reward，导致模型倾向于生成更长的回答——即使答案已经对了一直 BB 也有正 advantage。2025 年多篇论文指出这个现象，Dr. GRPO 提出了只对均值做归一化的修复方案。

2. **reward hacking 防不胜防**：如果 reward 只看最终答案，模型可能学出"瞎猜很多次，万一蒙对了"的行为。更糟的是 reward model 自己也可能是"被训歪的"——它给冗长的、看起来很专业的 bullshit 打高分。这是 agentic RL 最深层的信任问题。

3. **MCTS + 低质量 PRM = 反向缩放**：用不靠谱的 PRM 做树搜索，搜得越多，错误累积越多，最终性能反而不如只搜一步。这不是理论问题，是多篇 2025 论文的实际实验结论。

4. **rollout 是训练瓶颈**：RL 训练的每一步都需要 agent 真的去调工具（搜索、执行代码），单条 trajectory 几十秒。GPU 大部分时间在等 rollout 完成，利用率极低。异步 rollout（AsyncFlow、AReal）是 2025 年的工程热点但实现复杂。

5. **推理时计算的可预测性陷阱**：虽然 test-time compute 整体遵循 power-law scaling，但对个别问题"多想"会降准确率——这就是 overthinking。模型对简单问题也想半天，浪费计算还增加出错概率。adaptive compute（难题多算、简单题少算）是 2025 年未解决的问题。

6. **从单轮 RL 到多轮 agent RL 的跳跃**：PPO/GRPO 的原始设计是针对单轮对话的。agent 是多轮 tool call 的序列，每轮 step 之间有时间依赖，reward 稀疏且归因困难。Agent-R1 等框架试图标准化这个建模，但还远未成熟。

## 适用 vs 不适用场景

适用：
- 数学推理、代码生成、定理证明等有明确对错的任务——规则 reward 天然适配
- 已有 SFT base model，想用 RL 进一步提升
- 团队有 GPU 资源和 RL 工程经验
- 需要 agent 在开放环境（OOD）中有更好表现——RL 的探索能力 > SFT 的模仿能力

不适用：
- 开放创作、对话等无法定义客观 reward 的任务
- 资源紧张——RL 训练成本是 SFT 的 10x+
- reward 设计不成熟或 reward model 质量存疑的场景——差 reward 比没有更糟
- 推理时计算：延迟敏感的应用（如实时聊天）不适合 Long CoT 或 MCTS

## 历史小故事（可跳过）

- 2017：Schulman 提出 PPO，深度 RL 的标准算法
- 2022：InstructGPT / ChatGPT 发布，PPO-based RLHF 进入工业界
- 2023：DPO（Direct Preference Optimization）被提出，跳过 reward model 直接从偏好对学习——对 RLHF 体系的第一次简化尝试
- 2024 Q1：DeepSeekMath 提出 GRPO，首次砍掉 Critic 网络
- 2024 Q4：OpenAI 发布 o1-preview，首次公开展示"推理时计算"的产品化——模型在回答问题前"思考"几秒到几分钟
- 2025 Q1：DeepSeek-R1 发布，用纯 GRPO 训练（不加 SFT）实现推理能力，引爆开源社区
- 2025 Q2-Q3：GRPO 成为 LLM RL 训练的事实标准，但多篇论文指出其长度偏置等问题
- 2025 Q4：Agent-R1 把 agent 的 RL 训练标准化为可复用 framework；AsyncFlow / AReal 等异步训练框架出现
- 2026：test-time compute 从"锦上添花"变为"核心能力"，模型默认包含推理时搜索组件

## 学到什么

- Agentic RL 的核心洞察：**好 reward 比好算法重要**。GRPO 不是比 PPO 更聪明，只是更适合规则 reward 的场景
- 推理时计算和训练时 RL 是同一问题的两面——都是"在给定 reward 下优化输出"，区别只在优化的时机（训练时改权重 vs 推理时多算几步）
- GRPO 砍 Critic 的背后是一个大趋势：LLM 训练正在从"需要 4 个模型的沉重体系"向"轻量化、规则驱动"演变
- PRM（过程奖励模型）是整个 agentic RL + MCTS 体系最脆弱的一环——标注难、容易训歪、错起来后果严重
- overthinking 是推理时计算的反直觉陷阱——"多想想"不一定好，更难的问题是"什么时候该停"
- reward hacking 是 RL 的永恒问题，在 LLM 上只会更严重——因为 LLM 的输出空间太大，漏洞太多

## 延伸阅读

- arXiv 2501.02497 — "A Survey of Test-Time Compute: From Intuitive Inference to Deliberate Reasoning"，测试时计算的入门综述
- Guo et al. 2025 — DeepSeek-R1 原论文，"aha moment"的出处
- Shao et al. 2024 — DeepSeekMath，GRPO 的原始论文
- arXiv 2503.24235 — "What, How, Where, and How Well? A Survey on Test-Time Scaling in LLMs"，2025 年最全面的 TTS 综述
- [[agent-r1-2511]] — Agent-R1，把 agent 训练标准化为 RL framework 的代表作
- [[self-evolving-agents-survey]] — 自进化 agent 综述，RL training 是其中 evolution 的核心实现

## 关联

- [[agent-r1-2511]] —— Agent-R1 把 agent RL 训练标准化，是本文"训练时 RL"齿轮的工程落地
- [[self-evolving-agents-survey]] —— RL 是 agent 自进化的驱动力，GRPO 是 2025 年的首选算法
- [[apex-policy-exploration]] —— policy exploration 和 RL training 互补，探索策略决定 RL 的上限
- [[alphago]] —— MCTS + RL + value network，是 test-time compute 搜索范式的历史先例
- [[code-as-agent-harness]] —— code agent 用测试当规则 reward，是 agentic RL 最直接的应用场景
- [[misevolution-2509]] —— RL agent 也会 misevolve，reward hacking 是 evolution 失控的一种形式

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[agent-r1-2511]] —— Agent-R1 — 把 LLM agent 当 RL 环境训练的模块化框架
- [[self-evolving-agents-survey]] —— 自进化 AI agent 综述 — 给"会自己升级"的 agent 画一张统一地图
- [[apex-policy-exploration]] —— APEX — 给自进化 agent 配一张"策略图"防止它走老路
- [[alphago]] —— AlphaGo — 用深度神经网络和蒙特卡洛树搜索征服围棋的里程碑
- [[code-as-agent-harness]] —— Code as Agent Harness — 把代码当 agent 的"骨架"来重新看 agentic AI
- [[misevolution-2509]] —— Misevolution — 自进化 agent 也会"越改越坏"，连顶配模型也躲不过
