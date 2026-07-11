---
title: 'DPO — Direct Preference Optimization'
来源: 'Rafailov et al., "Direct Preference Optimization: Your Language Model is Secretly a Reward Model", NeurIPS 2023'
日期: 2026-05-29
分类: NLP
难度: 中级
---

## 是什么

DPO（**Direct Preference Optimization**，直接偏好优化）是把 [[instructgpt]] 那条 RLHF 流水线做"减法"——把"训 reward model + 用 PPO 跑强化学习"两步硬活，合并成"用人工偏好数据直接 fine-tune LM"一步。

日常类比：以前的 RLHF 像请家长（reward model）先给两个回答打分，再让小孩（policy）按家长反馈调整。DPO 让你跳过家长——**直接给小孩看"这一对里哪个好哪个坏"**，让他自己学。

数据形式：每条是 `{prompt, chosen, rejected}` 三元组——同一个 prompt 下两个回答，标注员选哪个更好。DPO 的目标就是让模型对 chosen 的概率上升、对 rejected 的概率下降。

## 为什么重要

不理解 DPO，下面这些事都没法解释：

- 为什么 2023 下半年起，开源后训练（Zephyr / Tülu / Llama 3）大量切到 DPO，而 Llama 2 Chat 仍走 RLHF/PPO
- 为什么"做对齐"的工程门槛从"需要 RL 专家"降到"会 fine-tune 就行"
- 为什么 Hugging Face TRL 的 `DPOTrainer` 30 行代码就能跑——同等任务用 PPO 实现要 300+ 行加一堆调参
- 为什么显存不够的小团队也能做对齐——PPO 要同时载 4 个模型，DPO 只要 2 个

DPO 出现之前，"想做 RLHF 但调不动 PPO"的小团队只能用 best-of-N rejection 凑合。DPO 之后，**只要会 SFT 就能做对齐**——这是开源对齐生态在 2023-2024 大爆发的关键工程前置。

## 核心要点

DPO 的全部魔法可以拆成 **三个洞察**：

1. **数学等价**：作者证明"先训 reward model 再用 RL 找最优 policy"和"直接对成对偏好做分类"在数学上是同一件事。前者那个最难调的 PPO 阶段，原来可以用一个 closed-form（闭式、不用迭代硬搜）解析式跳过。

2. **Loss 是一行 BCE**（binary cross-entropy，二分类交叉熵——把"chosen 更好"当成对/错标签来训）：

   ```
   L = -log σ( β·log[π(chosen|x)/π_ref(chosen|x)]
              - β·log[π(rejected|x)/π_ref(rejected|x)] )
   ```

   这里 `σ` 是 sigmoid（把任意实数压到 0–1，像"胜率"旋钮）；`π_ref` 是 SFT 后的 frozen 基准模型，`π` 是正在训的模型。括号里两项相减，就是"chosen 相对基准涨了多少"减去"rejected 相对基准涨了多少"。

3. **KL 约束自动成立**：PPO 需要显式加 `β·KL[π||π_ref]` 项防止 policy 漂移（跑太远 generation 崩）。DPO 把这个约束**藏在 log ratio 里**——`β·log(π/π_ref)` 天然约束 π 不能离 π_ref 太远，不必再加额外项。

> 一句话：DPO = "用偏好对做 BCE，π/π_ref 的 log ratio 是隐式 reward，β 是 KL 强度旋钮"。

## 实践案例

### 案例 1：数据长什么样

Anthropic HH 数据集里典型的一条：

```json
{
  "prompt": "How can I improve my sleep?",
  "chosen": "Try keeping a consistent bedtime, avoiding screens 1h before sleep...",
  "rejected": "Just take sleeping pills."
}
```

标注员看了两个回答，选 chosen。DPO 把整个数据集的 chosen 推高、rejected 压低，policy 自然学到"helpful + safe"的回答风格。

### 案例 2：30 行 PyTorch 写完

```python
import torch.nn.functional as F

def dpo_loss(logp_w, logp_l, ref_logp_w, ref_logp_l, beta=0.1):
    # implicit reward = β · log(π/π_ref)
    logits = beta * ((logp_w - ref_logp_w) - (logp_l - ref_logp_l))
    return -F.logsigmoid(logits).mean()
```

逐步读：

1. `logp_*` 是整段回答所有 token 的 log 概率求和（模型有多"喜欢"这句话）
2. `(logp_w - ref_logp_w)` 是 chosen 相对基准的涨幅；rejected 同理
3. 两涨幅相减再乘 `β`，送进 `logsigmoid`——等价于"押 chosen 赢"的 BCE

两次前向（chosen / rejected），算完 ratio 就更新，没有 reward model，也没有 PPO 的 rollout。

### 案例 3：Hugging Face TRL 一行调用

```python
from trl import DPOTrainer
trainer = DPOTrainer(model, ref_model, train_dataset=preference_data, beta=0.1)
trainer.train()
```

整个开源生态——Zephyr-7B / Tülu / Nous-Hermes 等——基本都是这条路径。Llama 3 的对话能力调优也用了 DPO（叠加 iterative rejection sampling）；Llama 2 Chat 当时仍以 RLHF/PPO 为主。

## 踩过的坑

1. **β 调错就崩**：β 太大，π 几乎不动；β 太小，π 漂离 π_ref 太远，generation 灾难性下降。典型值 0.1。

2. **数据质量 > loss 公式**：换数据集（从 UltraFeedback 到自生成 + GPT-4 重标注）收益可达 10%；换 loss 形式（DPO → SimPO）收益往往只有 1-2%。

3. **chosen 和 rejected 都很差时 DPO 会推高烂答案**：DPO 只看相对——它没办法区分"绝对好"和"相对好"。如果数据里 chosen 也是垃圾，policy 仍然学到这个垃圾的方向。

4. **长度偏差**：chosen 在数据集里通常更长，DPO 训完后 generation 普遍变长，有时是 padding 出来的废话。SimPO 的 length normalization 就是针对这个问题。

5. **offline 的天花板**：DPO 是 offline 的——policy 漂出 dataset 分布后没有 supervision。这是它和 PPO 的根本区别——PPO 可以一边训一边 rollout 探索，DPO 只能在固定 pair 上训。这也是 2024 一堆 online DPO 变种出现的原因。

## 适用 vs 不适用场景

**适用**：
- 开源 LLM 后训练（数据有限、显存紧、调参预算少）
- 已有成对偏好数据（Anthropic HH / UltraFeedback / 自家产品的对比标注）
- 单轮对话 / 摘要 / 简单 instruction following

**不适用**：
- 需要 absolute reward（best-of-N rejection sampling 时 DPO model 算不出绝对分数）
- 需要长期探索新分布（数学推理 / 代码 agent，这种场景 PPO + RM + iterative 仍然占优）
- 只有单边数据（点赞 / 点踩，没有成对）—— 改用 KTO

## 历史小故事（可跳过）

- **2017**：Christiano et al. 首次把人类成对偏好作为 RL 信号（*Deep RL from Human Preferences*）。
- **2020**：OpenAI summarization preference paper 把 RLHF + LLM 拼起来做摘要。
- **2022**：[[instructgpt]] (Ouyang et al.) 让 ChatGPT 雏形浮出水面，RLHF 三阶段（SFT + RM + PPO）成为标准。
- **2023-05**：Rafailov 等斯坦福团队挂出 DPO 论文，标题 "Your Language Model is Secretly a Reward Model" 一夜刷屏。
- **2023 年底**：Zephyr-7B、Tülu 用 DPO 把开源 LLM 对齐质量推到接近 GPT-3.5。
- **2024**：Llama 3、DeepSeek 系列采用 DPO 作为后训练核心，IPO / KTO / SimPO / ORPO 等变种涌现。

[[instructgpt]] 的 PPO 流水线像 RLHF 的"汇编语言"——能用但调不动；DPO 像"高级语言"——把同样的事用一行 BCE 写完。

## 学到什么

1. **能用一行 closed-form 跳过的事，就别用 RL 硬算**——DPO 的数学起点是"KL-constrained reward maximization 有解析解"
2. **隐式 reward 的思路**——`π/π_ref` 的 log ratio 自动是合法的 reward function，不必显式训 RM
3. **工程价值 > 理论新颖性**——DPO 的核心数学是 BT preference + 变分法的标准操作，但能把整个 RLHF 流水线砍半，这是真正的工程创新
4. **数据 > 算法**——loss 形式的优化空间已经很小，真正大的 gain 来自数据质量

## 延伸阅读

- 论文 PDF：[Rafailov et al. 2023 — Direct Preference Optimization](https://arxiv.org/abs/2305.18290)
- Sebastian Raschka 的 DPO 系列博客（推导讲得最 friendly）
- Hugging Face TRL 官方 DPO tutorial（带代码）
- [[instructgpt]] —— 被 DPO 简化的三阶段 RLHF 流水线
- [[ppo]] —— DPO 在工程上常替代的 on-policy RL 算法

## 关联

- [[instructgpt]] —— DPO 直接简化的对象；InstructGPT 的三阶段 RLHF 是 DPO 的前身
- [[ppo]] —— DPO 替代的 RL 算法；PPO 用 actor-critic + on-policy rollout，DPO 用 offline pair + BCE
- [[llama]] —— Llama 3 对话调优用了 DPO；Llama 2 Chat 仍以 RLHF/PPO 为主
- [[gpt-3]] —— DPO 的训练对象通常是 GPT-3 / Llama 这类 base LLM
- [[attention]] —— 所有现代 LLM 的核心组件；DPO 不修改架构，只换 loss

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
