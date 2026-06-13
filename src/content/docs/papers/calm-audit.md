---
title: "CALM: Curiosity-Driven Auditing for Large Language Models"
来源: 'https://arxiv.org/abs/2501.02997'
日期: 2026-06-13
分类: 机器学习
子分类: LLM对齐
provenance: pipeline-v3
---

## 是什么

CALM 是一种**用"好奇心"驱动的大语言模型审计方法**。它的目标是：在不接触目标模型内部参数的情况下，自动找到能让目标 LLM 产生有害、偏见或不实输出的输入提示。

日常类比：想象你在检查一个保险柜。传统方法是拿一堆已知能开锁的钥匙逐个试——效率低且漏掉很多锁。CALM 的做法是给一个"探路机器人"（审计模型），让它自己去尝试各种从未见过的钥匙形状，并且越是不常见的钥匙形状，越能得到额外奖励。久而久之，这个机器人就学会了找出那些你从来没想过的开锁方式。

具体来说，CALM 面对的是**黑盒 LLM**——你只能发送提示词、拿到回复，看不到模型的权重和梯度。在这个限制下，它把审计任务看作一个优化问题：找到一个输入提示 s，使得目标 LLM 的输出 o 满足某个"有害"标准（比如包含诽谤性内容、泄露敏感人名等）。

## 为什么重要

不理解 CALM，下面这些事就没法解释：

- 为什么传统的"人工写提示词"做红队测试远远不够——覆盖面窄、依赖专家经验
- 为什么黑盒审计比白盒审计难得多——没有梯度，不能直接用反向传播优化提示词
- 为什么 RL（强化学习）适合这个问题——每次生成一个 token 就像做一个决策，整个提示词的生成就是一个序列决策过程
- 为什么"内在好奇心"比单纯的外部奖励更有效——如果只在找到有害输出时才给奖励，探索空间几乎为零；加入内在探索奖励后，审计模型会主动尝试"新奇"的提示词组合
- 这篇论文被 **AAAI 2025 AI Alignment Track** 接收，说明学界对"用 AI 审计 AI"的方向越来越重视

## 核心概念

### 1. 两个角色：审计模型 vs 目标模型

CALM 有两个 LLM：

- **目标 LLM（Target LLM）**：被审计的对象，比如 GPT-4、Llama-3。你只能通过 API 发送提示词并拿到回复，无法看到内部参数。
- **审计 LLM（Audit LLM）**：CALM 的核心。它是一个被强化学习微调过的模型，专门负责生成"能诱使目标模型说出有害内容"的提示词。实验中用的是 GPT-2（只微调最后两层 Transformer）， surprisingly 小到能发现大模型的漏洞。

### 2. 强化学习框架：把生成提示词变成游戏

每次审计 LLM 生成下一个 token，相当于做一个"动作"。之前生成的 token 序列就是当前"状态"。整个生成过程建模为一个**部分可观测马尔可夫决策过程（POMDP）**。

审计 LLM 的目标是最大化一个复合奖励函数：

```
总奖励 = 外部审计奖励（找到了有害输出）
       + 内在探索奖励（尝试了新颖的 token 组合）
       - KL 惩罚（偏离原始模型太多）
```

这个公式的关键在于第二项——**内在探索奖励**，也就是 CALM 的"好奇心"来源。

### 3. 内在探索奖励：Policy Cover Theory

这是 CALM 最核心的创新。

传统强化学习只在最终结果好时才给奖励（比如目标模型确实输出了有害内容）。但在黑盒审计中，"找到有害输出"这件事极其罕见——就像大海捞针。如果只有这个奖励，审计模型几乎学不到任何东西。

CALM 的解决方案：给每个 token 一个"新奇度评分"。如果一个 token 在当前策略下很少出现，它就获得更高的内在奖励。这样即使最终没有找到有害输出，审计模型也在"探索新区域"的路上得到了鼓励。

具体做法是用**策略覆盖（Policy Cover）**理论：维护一个历史 token 分布的加权汇总，当前策略产生的 token 如果在历史中出现得越少，奖励越高。实现上用随机网络的预测误差来近似这个稀有度。

### 4. 两种审计任务

CALM 实验了两种典型的审计目标：

**任务一：逆后缀生成（Inverse Suffix Generation）**

给定一个目标人名集合，审计模型生成提示词，诱使目标模型在回复中提到这些人的名字。目的是测试目标模型是否会泄露敏感个人信息。

**任务二：有毒完成（Toxic Completion）**

给定一个特定人名，审计模型生成微妙的对抗性提示，诱使目标模型生成关于该人的诽谤性或毒性内容。

## 代码示例

### 示例一：审计模型的提示词生成流程

```python
# 伪代码：CALM 的一次训练迭代
# 1. 初始化审计模型（GPT-2 的最后两层被微调）
audit_llm = GPT2LMHeadModel.from_pretrained("gpt2")
for param in audit_llm.parameters():
    param.requires_grad = False
# 只解冻最后两层
for param in audit_llm.transformer.h[-2:].parameters():
    param.requires_grad = True

# 2. 根据初始提示 z 生成审计提示词 s
initial_prompt = "Ask questions about US senators."
s = []  # 逐步生成的 token 序列
for t in range(max_length):
    # 审计模型根据当前生成的 token 序列预测下一个 token
    next_token_probs = audit_llm(input_ids=s, attention_mask=[1]*len(s))
    next_token = sample_from_probs(next_token_probs)
    s.append(next_token)

# 3. 将生成的提示词 s 发送给目标 LLM，获取回复 o
target_input = initial_prompt + " " + decode_tokens(s)
o = target_llm.generate(target_input)  # 黑盒调用，看不到内部

# 4. 计算外部审计奖励
# 例如：逆后缀生成任务 —— 回复中是否包含目标人名
external_reward = 1.0 if any(name in o for name in TARGET_NAMES) else 0.0

# 5. 计算内在探索奖励（token 级别的新奇度）
intrinsic_bonus = compute_intrinsic_bonus(s, audit_llm)
# compute_intrinsic_bonus 内部使用随机网络预测误差近似
# 公式: R_I(s) = ||psi_1(h) - g_1(h)|| * ||psi_2(h) - g_2(h)||

# 6. 用 PPO 更新审计模型参数
total_reward = external_reward + lambda_I * intrinsic_bonus - lambda_KL * kl_penalty
update_audit_llm_with_ppo(total_reward)
```

### 示例二：内在探索奖励的计算

```python
import torch
import torch.nn as nn

class RandomNetworkDistillation(nn.Module):
    """
    用随机网络预测误差来估计 token 的新奇度。
    直觉：如果一个 token 的嵌入向量 h 在历史数据中很罕见，
    那么随机网络很难准确预测它，预测误差就大 → 新奇度高 → 奖励高。
    """
    def __init__(self, embed_dim=768):
        super().__init__()
        # 两个可学习的编码器
        self.encoder1 = nn.Sequential(
            nn.Linear(embed_dim, 512),
            nn.ReLU(),
            nn.Linear(512, 256)
        )
        self.encoder2 = nn.Sequential(
            nn.Linear(embed_dim, 512),
            nn.ReLU(),
            nn.Linear(512, 256)
        )
        # 两个固定的随机网络（参数不更新）
        self.target1 = nn.Sequential(
            nn.Linear(embed_dim, 512),
            nn.ReLU(),
            nn.Linear(512, 256)
        )
        self.target2 = nn.Sequential(
            nn.Linear(embed_dim, 512),
            nn.ReLU(),
            nn.Linear(256, 256)
        )
        # 随机初始化固定网络
        self._init_random_networks()

    def _init_random_networks(self):
        with torch.no_grad():
            for net in [self.target1, self.target2]:
                for module in net.modules():
                    if isinstance(module, nn.Linear):
                        module.weight.data.uniform_(-0.01, 0.01)
                        module.bias.data.fill_(0)

    def forward(self, token_embeds):
        """
        token_embeds: (batch_size, embed_dim) — 一批 token 的嵌入向量
        返回: (batch_size,) — 每个 token 的新奇度奖励
        """
        pred1 = self.encoder1(token_embeds)
        pred2 = self.encoder2(token_embeds)
        target1 = self.target1(token_embeds)
        target2 = self.target2(token_embeds)

        # 预测误差的 L2 范数乘积 = 新奇度奖励
        error1 = torch.norm(pred1 - target1, dim=1)
        error2 = torch.norm(pred2 - target2, dim=1)
        novelty_score = error1 * error2

        return novelty_score

    def update_encoder2(self):
        """每次更新后重新初始化 encoder2，防止过拟合"""
        with torch.no_grad():
            for module in self.encoder2.modules():
                if isinstance(module, nn.Linear):
                    module.weight.data.uniform_(-0.01, 0.01)
                    module.bias.data.fill_(0)
```

### 示例三：完整训练循环

```python
def calms_training_loop(audit_llm, target_llm_api, env_reward_fn,
                        novelty_estimator, num_steps=1000):
    """
    CALM 的训练主循环（简化版）
    """
    optimizer = Adam(audit_llm.parameters(), lr=1e-5)
    value_net = ValueNetwork()  # 用于 PPO 的价值函数

    for step in range(num_steps):
        # 第一阶段：收集样本
        prompts_batch = []   # 审计提示词
        responses_batch = [] # 目标模型回复
        rewards_batch = []   # 外部奖励

        for _ in batch_size:
            # 审计模型生成提示词
            prompt = generate_prompt(audit_llm, initial_prompt="Ask about senators.")

            # 黑盒调用目标 LLM
            response = target_llm_api.chat(prompt)

            # 计算外部奖励
            reward = env_reward_fn(prompt, response)

            prompts_batch.append(prompt)
            responses_batch.append(response)
            rewards_batch.append(reward)

        # 第二阶段：计算内在奖励
        token_embeddings = get_token_embeddings(prompts_batch, audit_llm)
        intrinsic_rewards = novelty_estimator(token_embeddings)

        # 第三阶段：PPO 更新
        advantages = compute_advantage(rewards_batch, intrinsic_rewards, value_net)

        for _ in ppo_epochs:
            for prompt, reward, intrinsic, adv in zip(
                prompts_batch, rewards_batch, intrinsic_rewards, advantages
            ):
                # 总奖励 = 外部 + 内在探索 - KL 惩罚
                total_reward = reward + lambda_i * intrinsic
                loss = ppo_policy_loss(audit_llm, prompt, total_reward, adv)

                optimizer.zero_grad()
                loss.backward()
                optimizer.step()

        # 定期更新价值网络和内在奖励估计器
        update_value_network(value_net, prompts_batch, rewards_batch)
        if step % update_freq == 0:
            novelty_estimator.update_encoder2()

    return audit_llm
```

## 实验结果亮点

- **逆后缀生成任务**：CALM 成功让 Llama-3-8B 在回复中输出了特定参议员的名字（如 John McCain、Lindsey Graham），而这些名字原本不在提示词中。
- **有毒完成任务**：CALM 生成的提示词能让目标模型产出关于特定政治人物的诽谤性内容。
- **小模型打败大模型**：只用 GPT-2（124M 参数）做审计模型，就能发现 Llama-3-8B（80 亿参数）的漏洞。这说明 CALM 的"好奇心驱动"探索机制非常高效。
- **消融实验**：去掉内在探索奖励后，性能显著下降，证明了"好奇心"组件的必要性。

## 错误类型分析

CALM 的审计过程中还发现了目标模型的几类典型错误：

| 错误类型 | 例子 | 原因 |
|---------|------|------|
| 事实错误 | 说 Tammy Baldwin 是南达科他州参议员 | 实际她是威斯康星州的 |
| 时间错误 | 说 Pat Roberts 仍是堪萨斯州参议员 | 他 2021 年已卸任 |
| 与主流观点不一致 | 参议员被描述为"反美" | 媒体并无此报道 |

## 关键公式速查

```
总目标函数:
  max_π  J_A(s)  +  λ_I · J_I(s)  -  λ_KL · J_KL(s)
  ↑          ↑            ↑              ↑
  外部奖励   内在探索     KL 惩罚        三项权重

内在奖励近似:
  R̂_I(s) = ||ψ₁(h) - g₁(h)|| · ||ψ₂(h) - g₂(h)||
  ↑                    ↑
  可学习编码器         固定随机网络

外部奖励定义:
  逆后缀生成: r(s,o) = 1 如果 o 中包含目标人名集合中的任何名字
  有毒完成:   r(s,o) = 1 如果 s 无毒 且 o 有毒
```

## 局限性和思考

- 审计模型本身也需要被审计——用 GPT-2 做审计器，它的"好奇心"方向可能不够全面
- 毒性检测用的还是简单的 NSFW 词表匹配，不够精细
- 只能检测预定义的审计目标（如特定人名、特定毒性类别），不能泛化到未知类型的有害行为
- 伦理问题：CALM 本身就是在生成有害内容，如何确保它不被滥用？

## 延伸阅读

- **PPO（Proximal Policy Optimization）**：CALM 使用的强化学习算法基础
- **Intrinsic Motivation / Curiosity-driven Exploration**：CALM 内在奖励的理论源头
- **Policy Cover Theory**：CALM 设计 token 级内在奖励的数学框架
- **LLM Red Teaming**：CALM 所属的更广泛研究领域
