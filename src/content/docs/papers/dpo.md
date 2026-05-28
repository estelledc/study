---
title: DPO — Your Language Model is Secretly a Reward Model：把 RLHF 的 reward 阶段 + RL 阶段塌缩成一个 cross-entropy 训练
description: Bradley-Terry 反演 + KL 约束最优解的闭式 + logistic regression。三步推导把 PPO 三阶段流水线塌缩成 SFT 风格的二分类训练，从此 RLHF 不再需要 reward model 也不需要 RL
sidebar:
  label: DPO (NeurIPS 2023)
  order: 5
---

> Season I · AI safety / interpretability 第 5 篇。
> 这一篇把 [InstructGPT](/study/papers/instructgpt/) 三阶段流水线的后两段（RM + PPO）塌缩成一个 SFT 风格的 loss——
> 是 [RLHF Christiano 2017](/study/papers/rlhf-christiano/) 之后偏好学习这条线**第二次范式重整**，
> 与 [Constitutional AI](/study/papers/constitutional-ai/) 形成"省人力 vs 省 RL"的两条岔路。

## 核心信息

| 字段 | 内容 |
|---|---|
| 标题 | Direct Preference Optimization: Your Language Model is Secretly a Reward Model |
| 标题翻译 | 直接偏好优化：你的语言模型其实就是一个 reward model |
| 作者 | Rafael Rafailov, Archit Sharma, Eric Mitchell, Stefano Ermon, Christopher D. Manning, Chelsea Finn |
| 一作机构 | Stanford CS（Rafailov 时为 PhD）；Mitchell 同期 / Finn 是 advisor |
| 发表时间 | arXiv 2023.05 / NeurIPS 2023 (oral, outstanding paper runner-up) |
| 渠道 | NeurIPS 2023 (oral) |
| arXiv | [2305.18290](https://arxiv.org/abs/2305.18290)（v3 是终版，比 v1 多了 IMDb / Anthropic-HH 实验） |
| 引用数 | 5k+（截至 2026-05-28，超越同期 RLHF 工程论文） |
| 论文类型 | method paper（提出闭式 RL → 二分类 reduction） |
| 代码 / 项目 | 一作官方 [eric-mitchell/direct-preference-optimization](https://github.com/eric-mitchell/direct-preference-optimization) commit `f8b8c0f49dc92a430bae41585f9d467d3618fe2f`（FSDP + Hydra 配置，非工业化但权威）；标准复刻 [huggingface/trl](https://github.com/huggingface/trl) commit `51c6d3ca31fb4cc80ff719c0844bbdfcd0feeefb`（DPOTrainer 集成多种 loss type） |
| 数据 / 资源 | 论文用 IMDb（情感控制玩具）/ TL;DR summarize（前作 Stiennon 2020 的延伸）/ Anthropic HH-RLHF（real-world 偏好），均开源；后续社区在 UltraFeedback / Capybara / Argilla 系列上跑 |
| 模型规模 | 论文实验 Pythia-2.8B / GPT-2 / GPT-J（最大 6B）；社区把 DPO 推到 Llama-2-70B / Mixtral-8x7B / Yi-34B 全栈 |

## 创新点

DPO 不发明 RLHF——它把 [Christiano 2017](/study/papers/rlhf-christiano/) 的 Bradley-Terry + KL-constrained RL 走通一条**闭式数学路径**，
顺便消灭了 RLHF 工业化的 4 个最痛苦的工程问题：

1. **不再需要训 reward model**：reward 被吸收进 policy 自己的 logprob 比值，policy = 隐式 RM。
   论文 §4 Theorem 1 给了精确的等价：`r(x, y) = β log [π(y|x) / π_ref(y|x)] + β log Z(x)`，
   `Z(x)` 是 prompt 级常数，在 pairwise loss 里消掉。
2. **不再需要 RL 优化**：原本 PPO 需要 actor / critic / KL controller / GAE，全部不见——
   只剩一个 `-log σ(β·(log-ratio_chosen - log-ratio_rejected))` 的二分类 loss。
   工程难度从 [InstructGPT §3.5 PPO](/study/papers/instructgpt/) 的 200 行 trainer 代码降到 30 行。
3. **训练稳定性 ≈ SFT**：没有 RL，没有 advantage estimate，没有 reward shift，没有 PPO clip。
   loss 单调下降、单 GPU 也能复现，社区 RLHF 的入门门槛被这一篇直接砍掉一个数量级。
4. **超参从 6 个降到 1 个**：原 PPO 要 tune `kl_coef / lr / clip_ratio / value_coef / batch / minibatch`，
   DPO 只剩 `β`（temperature，0.1-0.5 是甜区）。论文 §6.2 显示 β=0.1 vs β=0.5 在 Anthropic HH 上 win-rate 差 < 4%——
   **β 的鲁棒性是 DPO 出圈的关键**。

更重要的是它的 **副作用**：reward model 这一阶段被吃掉后，"标注 → 训 RM → 跑 PPO"的串行流水线变成了
"标注 → 训 policy"，整段实习生级 ML infra（reward server / replay buffer / online sample loop）都不再必须。
这是为什么 2023 下半年开始大模型对齐论文几乎一边倒地切到 DPO 系：见 [Layer 5 谱系](#l5-接下来在哪里--谱系)。

## 一句话总结

**DPO = 把 RLHF 后两段（RM 训 + PPO）通过一个数学等价塌缩成一个 SFT-shape 的 binary cross-entropy 训练。**
你今天能在单张 4090 上跑 Llama-2-7B 偏好对齐，背后就是 2023 年这篇 paper 的 3 步代数推导。

![DPO loss 推导路径：Bradley-Terry → KL-constrained RL → reparameterization → logistic loss](/study/papers/dpo/01-loss-derivation.webp)

*图 1：DPO loss 的三步推导链。左：Bradley-Terry 模型把 pairwise preference 写成 `σ(r_w - r_l)`。中：KL-constrained reward maximization 的最优解析解 `π*(y|x) ∝ π_ref(y|x) exp(r/β)`。右：把这个解反代回去，`r` 被消掉，得到 `-log σ(β·log-ratio_diff)` 的 logistic regression loss。手绘 sketchnote 风。*

## Why（这篇出现前世界缺什么）

DPO 出现前，做 RLHF 的人卡在 [InstructGPT](/study/papers/instructgpt/) 范式的 4 个对手痛点里：

- **PPO 工程地狱**：[InstructGPT §3.5 PPO](/study/papers/instructgpt/) 的实现要同时管理 actor / critic / reference / reward 4 个模型，
  4 套 forward + 1 套 backward + 1 个 KL controller。OpenAI 内部能跑（他们写了 5 年 RL infra），
  但学术圈+开源圈的复现一直崩——2022-2023 年 trl 的 issue 列表全是"PPO 训出 NaN"。
- **reward model 的 reward hacking**：RM 是个独立的 6B 模型，policy 在它上面 PPO 几千步后必然找到
  reward 高但人类不喜欢的 mode（[Christiano 2017](/study/papers/rlhf-christiano/) §3 已经预警过）。
  解决方案要么 KL anchor 调高（牺牲对齐），要么 active query 重训 RM（牺牲 compute）——两条路都贵。
- **二阶段标注成本**：[InstructGPT](/study/papers/instructgpt/) 的 ~33k 排序数据训 RM 后还要 ~31k 新 prompt 跑 PPO，
  数据预算被切两份。如果能把这两段合并，等价于"同样数据量翻倍"。
- **RLHF 的可解释性黑箱**：reward model 是个 scalar regression，无法事后解释"为什么这条 reply 拿了 +5 reward"。
  policy 优化 RM 的过程也无法 introspect。

第五种思路藏在控制论的 KL-constrained reward maximization 里：
**KL-constrained 凸优化的最优解有闭式**——`π*(y|x) ∝ π_ref(y|x) exp(r(x, y) / β)`。
这个公式在 RL 文献里出现过（[Peters 2010 REPS](https://arxiv.org/abs/1005.0901) /
[Peng 2019 AWR](https://arxiv.org/abs/1910.00177)），但没人把它**反过来**用：
**给定 policy π，可以倒推出 r 是什么**——`r(x, y) = β log[π/π_ref] + β log Z(x)`。
DPO 的核心 insight 异常朴素：**把这个倒推的 r 代回 Bradley-Terry pairwise loss，partition function `Z(x)` 在 pair-difference 里消掉**。
结果就是一个不需要 RM、不需要 RL 的 logistic regression。

## 论文地形

| Section | 角色 | 阅读策略 |
|---|---|---|
| §1 Introduction | motivation + 3 个 contribution 列表 | 读 |
| §2 Related work | RLHF / contrastive method / preference learning 三堆 | 跳读 |
| §3 Preliminaries | Bradley-Terry + KL-constrained RL 复习 | **必读**（这是推导起点） |
| §4 Direct Preference Optimization | **真正的肉，3 步推导 + Theorem 1** | **精读** |
| §4.1 Deriving the DPO objective | 把 r 替换成 policy log-ratio 的代数 | **必读** |
| §4.2 What does the DPO update do | gradient 解释：把 chosen logprob 推上去、rejected 推下去 | 精读 |
| §5 Theoretical analysis | reward equivalence class + DPO 不依赖具体 r | 跳读 |
| §6 Experiments | IMDb 情感 / TL;DR summarize / Anthropic HH | 看 Figure 2-3 |
| §7 Discussion | limitations + 后续方向 | **必读** |
| §A Math derivations | Theorem 1 完整证明 | 复现时查 |

**心脏物 3 个**：

1. §4.1 推导链（3 步代数把 RL 化成二分类）—— Layer 3 主精读对象
2. Theorem 1（reward → policy 的双射；reward 等价类）—— 全篇最深的数学结果
3. Figure 2 (IMDb sentiment win-rate)：DPO 在低 KL 下 win-rate > PPO，**这是工程派被说服的关键证据**

## 谱系图

DPO 既继承又重构了 RLHF 这条线，下游论文像分形一样炸开。

![DPO 谱系：从 RLHF / InstructGPT 出发，向下分化出 IPO / KTO / SimPO / ORPO / RLOO / Self-Reward / SPIN](/study/papers/dpo/02-lineage.webp)

*图 2：DPO 论文谱系。上游：[Christiano 2017 RLHF](/study/papers/rlhf-christiano/) → [InstructGPT 2022](/study/papers/instructgpt/) → DPO 2023。下游：IPO（修 reward saturation）/ KTO（去掉 pair 要求）/ SimPO（去掉 reference model）/ ORPO（合并 SFT+DPO）/ RLOO（PPO 简化派的反击）/ Self-Reward / SPIN（self-play 派）。横向竞争：[Constitutional AI 2022](/study/papers/constitutional-ai/) 的 RLAIF 路线。手绘 sketchnote 风。*

## 核心机制

### Step 1 · Bradley-Terry：把 pairwise preference 写成 sigmoid 概率

人类标注员看到 prompt `x` 和两条 reply `(y_w, y_l)`（w = winner, l = loser）后给一条偏好 label。
Bradley-Terry 模型假设：

```
P(y_w ≻ y_l | x) = exp(r(x, y_w)) / [exp(r(x, y_w)) + exp(r(x, y_l))]
                 = σ(r(x, y_w) - r(x, y_l))
```

`r(x, y)` 是潜在的 reward function，`σ` 是 sigmoid。这个假设和 [InstructGPT §3.5 RM](/study/papers/instructgpt/)
完全一致——区别只在 InstructGPT 用一个独立模型 `r_θ` 拟合 `r`，DPO 一会儿要把它**消掉**。

最大似然估计 BT 模型参数等价于最小化：

```
L_BT(r) = -E_{(x, y_w, y_l) ~ D} [log σ(r(x, y_w) - r(x, y_l))]
```

这就是 [InstructGPT §3.5](/study/papers/instructgpt/) 的 RM 训练 loss。DPO 不改这个 loss，
只换里面的 `r` 是什么。

### Step 2 · KL-constrained RL 的最优解有闭式

[InstructGPT PPO 阶段](/study/papers/instructgpt/) 的目标是：

```
max_π E_{x ~ D, y ~ π(·|x)} [r(x, y)] - β · KL(π(·|x) || π_ref(·|x))
```

`π_ref` 是 SFT 后冻结的参考策略，`β` 控制 KL 强度。这个目标在控制论里**有闭式解**
（[Peters 2010 REPS](https://arxiv.org/abs/1005.0901) 证过）：

```
π*(y|x) = (1/Z(x)) · π_ref(y|x) · exp(r(x, y) / β)
其中 Z(x) = Σ_y π_ref(y|x) · exp(r(x, y) / β)  是 partition function
```

这步在论文 §4 Eq. 4 给出。直觉：最优 policy 是 reference policy 用 reward 做指数加权后的 reweight。
**问题在于** `Z(x)` 是对所有可能 reply 的和，sequence space 是 vocab^seq_len 量级，**算不动**。
[InstructGPT](/study/papers/instructgpt/) 的解决方法是用 PPO 直接做随机梯度优化，绕开 `Z(x)`。

### Step 3 · 反演：把 r 表达成 policy log-ratio

DPO 的关键一招：**给定 π\* 和 π_ref，可以倒推 r 是什么**。把上面的式子两边取 log，移项：

```
r(x, y) = β · log[π*(y|x) / π_ref(y|x)] + β · log Z(x)
```

`β log Z(x)` 是只依赖 `x` 的常数（**对同一 prompt 的所有 reply 相同**）。
代回 Bradley-Terry loss：

```
r(x, y_w) - r(x, y_l) = β · [log(π*(y_w|x) / π_ref(y_w|x)) - log(π*(y_l|x) / π_ref(y_l|x))]
                       = β · [log-ratio(chosen) - log-ratio(rejected)]
```

`Z(x)` 在 pair-difference 里**完美消掉**——这是 DPO 全部魔法的来源。
最终 loss：

```
L_DPO(π_θ; π_ref) = -E_{(x,y_w,y_l)~D} [log σ(β · (log[π_θ(y_w|x)/π_ref(y_w|x)] - log[π_θ(y_l|x)/π_ref(y_l|x)]))]
```

这是论文 §4.1 Eq. 7 / Theorem 1。**形式上完全等价于一个 SFT 风格的 cross-entropy**——
唯一区别是 input 是两条 reply 的 logprob 比值差。

下面三段 Layer 3 分别精读：(a) DPO loss 实现；(b) reference model + 隐含 KL anchor；(c) trl 的 DPOTrainer。

#### (a) DPO loss 实现：把 3 步推导写成 30 行 Python

一作官方实现的 `preference_loss` 函数，一字不差地按论文 §4.1 写：

```python
# eric-mitchell/direct-preference-optimization @ f8b8c0f4 trainers.py L45-L87
def preference_loss(policy_chosen_logps: torch.FloatTensor,
                    policy_rejected_logps: torch.FloatTensor,
                    reference_chosen_logps: torch.FloatTensor,
                    reference_rejected_logps: torch.FloatTensor,
                    beta: float,
                    label_smoothing: float = 0.0,
                    ipo: bool = False,
                    reference_free: bool = False):
    """Compute the DPO loss for a batch of policy and reference model log probabilities."""
    pi_logratios = policy_chosen_logps - policy_rejected_logps
    ref_logratios = reference_chosen_logps - reference_rejected_logps

    if reference_free:
        ref_logratios = 0

    logits = pi_logratios - ref_logratios  # h_{\pi_\theta}^{y_w,y_l} 论文符号

    if ipo:
        losses = (logits - 1/(2 * beta)) ** 2  # IPO Eq.17
    else:
        # DPO Eq.7 + cDPO label smoothing
        losses = -F.logsigmoid(beta * logits) * (1 - label_smoothing) \
                 - F.logsigmoid(-beta * logits) * label_smoothing

    chosen_rewards = beta * (policy_chosen_logps - reference_chosen_logps).detach()
    rejected_rewards = beta * (policy_rejected_logps - reference_rejected_logps).detach()

    return losses, chosen_rewards, rejected_rewards
```

代码完整链接：[trainers.py L45-L87](https://github.com/eric-mitchell/direct-preference-optimization/blob/f8b8c0f49dc92a430bae41585f9d467d3618fe2f/trainers.py#L45-L87)。

旁注：

- **`pi_logratios - ref_logratios` 是 Step 3 推导的直接体现**：把 4 个 logprob（policy chosen / policy rejected /
  ref chosen / ref rejected）压成 1 个 scalar。这个 scalar 就是 `r(x,y_w) - r(x,y_l)` 除以 `β`，
  partition function `Z(x)` 在这步**先在 pair 内消失（policy logratio - ref logratio 的差结构），
  再在 chosen-vs-rejected 的差里彻底消失**（双层消除）。
- **`-F.logsigmoid(beta * logits)` 就是 DPO Eq.7 全部**——3 行代码包含了一篇 NeurIPS oral 的全部 loss 定义。
  这也解释了为什么 DPO 代码 review 的人经常震惊"就这？"——数学推导难，实现简单。
- **`reference_free=True` 是 SimPO 的雏形**：把 ref logratio 强制设 0，相当于假设 `π_ref` 是均匀分布。
  论文里没主推这个变体，但 [SimPO](https://arxiv.org/abs/2405.14734) 后来证明在某些任务上更好——
  因为冻结的 SFT model 未必是好的 reference policy。
- **`label_smoothing`（cDPO）**：[Mitchell 自己写的 cdpo.pdf](https://ericmitchell.ai/cdpo.pdf) 提的扩展。
  当人类标注有 ε 概率翻转时，loss 应该是 `(1-ε)·logsigmoid(βh) + ε·logsigmoid(-βh)`，对应代码两行加权。
  trl 把它推广到了 7 种 loss type（见下面 (c) 段）。
- **`chosen_rewards = beta * (policy_chosen - ref_chosen).detach()`**：这就是 Step 3 推导的"隐式 reward"——
  policy 在 chosen 上比 ref 多出来的 logprob 乘以 β。`detach()` 让它不进梯度图，只用来 log + 算 reward accuracy。
- **`ipo` 分支用的是 squared loss**：[IPO (Azar 2023)](https://arxiv.org/abs/2310.12036) 发现 DPO 在 noisy preference
  下会过拟合（chosen logprob 一路上推到正无穷），改成 `(logits - 1/(2β))^2` 把 reward 钉在 `1/(2β)` 附近。
  **这是 DPO 第一个 follow-up 修正**，trl 把它当做一种 loss type 提供。
- **没有任何 RL 痕迹**：没有 advantage、没有 value head、没有 PPO clip、没有 reward shift——
  对比 [InstructGPT §3.5 PPO](/study/papers/instructgpt/) 的 200+ 行 PPOTrainer，DPO 这 30 行是**整个对齐流水线的脏活全部消失**。

**怀疑 1**：`reference_free=True` 模式在论文 §6 没做严肃 ablation——只在 Anthropic-HH 上提了一句。
但 SimPO 后续证明 reference-free 在 reasoning 任务上比 DPO 强 5-10% win-rate。
这暗示 SFT 模型作为 ref 在某些任务上是 noise（SFT model 可能在 chosen / rejected 上 logprob 都很低且接近）。
论文回避了这个对照，因为它会动摇"DPO 必须有 reference"的核心叙事。

#### (b) reference model 与隐含 KL anchor：被吃掉的 KL constraint 在哪里？

DPO 看上去**没有**显式的 `-β·KL(π||π_ref)` 项，但它来自 Step 2 的 closed-form 假设——
loss 里 `log[π_θ/π_ref]` 这个比值就是 KL 的"被积变量"。论文 §5 给出 reward equivalence class
的论证：所有满足 BT model 的 reward 函数都属于同一等价类（差一个只依赖 `x` 的常数），
DPO 学到的不是某个具体 `r`，而是这个等价类——**而隐含 KL constraint 由 `π_ref` 的位置决定**。

`_get_batch_logps` 是 reference logprob 的核心计算，policy 和 reference 共用同一段代码：

```python
# eric-mitchell/direct-preference-optimization @ f8b8c0f4 trainers.py L90-L115
def _get_batch_logps(logits: torch.FloatTensor,
                     labels: torch.LongTensor,
                     average_log_prob: bool = False) -> torch.FloatTensor:
    """Compute the log probabilities of the given labels under the given logits."""
    assert logits.shape[:-1] == labels.shape

    labels = labels[:, 1:].clone()       # shift right: predict t+1 from t
    logits = logits[:, :-1, :]           # shift left:  use logits up to t

    loss_mask = (labels != -100)         # -100 是 prompt 部分（不算 logprob）

    labels[labels == -100] = 0           # dummy token: gather 不能取 -100
    per_token_logps = torch.gather(
        logits.log_softmax(-1), dim=2, index=labels.unsqueeze(2)
    ).squeeze(2)

    if average_log_prob:
        return (per_token_logps * loss_mask).sum(-1) / loss_mask.sum(-1)
    else:
        return (per_token_logps * loss_mask).sum(-1)
```

代码完整链接：[trainers.py L90-L115](https://github.com/eric-mitchell/direct-preference-optimization/blob/f8b8c0f49dc92a430bae41585f9d467d3618fe2f/trainers.py#L90-L115)。

旁注：

- **`labels[:, 1:]` 是 GPT 系标准的 next-token shift**：把 `[a, b, c, d]` 变成 target `[b, c, d]`，
  logits 用前 3 个位置预测 `[b, c, d]`。DPO 没有自创任何 forward 风格——**它的 forward 和 SFT 完全一样**，
  这是它"工程上像 SFT"的根本原因。
- **`-100` 是 HuggingFace 标准 ignore_index**：prompt 部分的 token 被标 -100，loss_mask 把它们抠掉。
  DPO **只在 response 部分算 logprob**，prompt 部分两条 reply 共享，没有意义比较。
- **`average_log_prob=False` 是默认值**：DPO 论文用 sum-over-tokens 而不是 average。
  原因：长 response 的 logprob 自然小，sum 让 loss 对长度敏感——这是**DPO 的著名 length bias 问题**——
  chosen 经常比 rejected 长，模型学到"长就是好"。trl 后续加了 length normalization 选项，
  但论文版本没有。
- **`torch.gather(..., dim=2, index=labels.unsqueeze(2))`**：从 vocab 维取对应 label 的 logit。
  这一步等价于 cross-entropy 的 nll 部分，但保留了 per-token 信息（不立刻 reduce），
  因为 DPO 要的是**整条 response 的 logprob 之和**，而不是 mean cross-entropy。
- **policy 和 reference 共用这个函数**：`get_batch_metrics` 里调用两次，一次给 policy（带梯度），
  一次给 reference（`torch.no_grad()`）。**reference forward 是 DPO 的 50% compute**——
  和 PPO 差不多的 forward cost，但去掉了 actor critic 两套模型，所以总 GPU 内存反而少。
- **隐含 KL 在哪里？** 答：在 `policy_logp - reference_logp` 这个差值的分布里。
  当 policy 偏离 reference 太远，所有 (chosen, rejected) 的 logp 差变大，sigmoid 进入 saturation，
  梯度消失 → 训练自然停下。**这就是 KL constraint 的"自我执行"机制**。
- **`reference_free=True` 的代价**：Step (a) 里 ref_logratios 设 0 等于把 reference 替换成均匀分布。
  这违反了 Step 2 的闭式解推导（推导依赖 `π_ref` 是合法概率分布），所以 reference-free 不再是 RLHF 等价——
  它变成了一个独立的 contrastive loss。

**怀疑 2**：DPO 隐含 KL 是**自适应**的——离 ref 越远梯度越小——但**没有显式 KL 监控**。
[InstructGPT PPO](/study/papers/instructgpt/) 有 `AdaptiveKLController` 把 KL 钉在目标值。
DPO 训练 100 步后是否还在 ref 附近？没人在 paper 里给曲线。
社区后来发现 DPO 训练后期 chosen logprob 反而**下降**（[Pal 2024](https://arxiv.org/abs/2402.13228)），
说明 DPO 在某些数据分布下根本没把 chosen 推上去——**KL 自适应可能是个 bug 而非 feature**。

#### (c) trl 的 DPOTrainer：工业级实现 + 7 种 loss type 大杂烩

trl 把 DPO 工业化时把官方版本扩展成了**多种 contrastive loss 的统一 framework**——同一段代码处理
DPO / IPO / EXO / NCA / hinge / kto_pair / robust 等 7+ 种变体：

```python
# huggingface/trl @ 51c6d3ca trl/trainer/dpo_trainer.py L1261-L1316（节选 sigmoid + ipo + robust）
delta_score = chosen_scores - rejected_scores

loss = 0.0
for loss_type, loss_weight in zip(self.loss_types, self.loss_weights, strict=True):
    if loss_type == "sigmoid":
        # 这就是论文 Eq.7 的 DPO loss
        per_sequence_loss = -F.logsigmoid(self.beta * delta_score)

    elif loss_type == "hinge":
        # SLiC 风格 hinge loss（替代 sigmoid）
        per_sequence_loss = torch.relu(1 - self.beta * delta_score)

    elif loss_type == "ipo":
        # IPO: 把 reward 钉在 1/(2β)，避免 saturation 过拟合
        chosen_mask, rejected_mask = completion_mask.chunk(2, dim=0)
        chosen_avg_score = chosen_scores / chosen_mask.sum(dim=1).clamp(min=1.0)
        rejected_avg_score = rejected_scores / rejected_mask.sum(dim=1).clamp(min=1.0)
        ipo_delta = chosen_avg_score - rejected_avg_score
        per_sequence_loss = (ipo_delta - 1 / (2 * self.beta)) ** 2

    elif loss_type == "exo_pair":
        # EXO: KL(p_fθ || p_rh) 形式的 exploration-exploitation 平衡
        epsilon = torch.tensor(self.label_smoothing, device=device)
        qw = torch.sigmoid(self.beta * delta_score)
        log_qw = F.logsigmoid(self.beta * delta_score)
        ql = torch.sigmoid(-self.beta * delta_score)
        log_ql = F.logsigmoid(-self.beta * delta_score)
        per_sequence_loss = qw * (log_qw - torch.log1p(-epsilon)) \
                          + ql * (log_ql - torch.log(epsilon))

    elif loss_type == "robust":
        # cDPO label-smoothing 的另一种参数化
        clean_loss_term = -(1 - self.label_smoothing) * F.logsigmoid(self.beta * delta_score)
        flipped_loss_term = -self.label_smoothing * F.logsigmoid(-self.beta * delta_score)
        per_sequence_loss = (clean_loss_term + flipped_loss_term) / (1 - 2 * self.label_smoothing)

    loss = loss + loss_weight * per_sequence_loss.mean()
```

代码完整链接：[dpo_trainer.py L1261-L1316](https://github.com/huggingface/trl/blob/51c6d3ca31fb4cc80ff719c0844bbdfcd0feeefb/trl/trainer/dpo_trainer.py#L1261-L1316)。

旁注：

- **`loss_types` 是 list 而不是 string**：trl 支持**混合 loss**——`loss_types=["sigmoid", "ipo"], loss_weights=[0.5, 0.5]`
  会同时优化 DPO 和 IPO 各 50% 权重。这是 2024 年社区研究"loss landscape"的常见做法。
  论文版本只有 `sigmoid` 一种，trl 把它做成了通用 contrastive 框架。
- **`compute_ref_log_probs` 的两路分支**：当 `ref_model=None` 时，trl 用 PEFT adapter 把 ref 和 policy 合并到一个模型里
  （adapter on/off），节省一半 GPU 内存。这是 LoRA + DPO 的标准做法，
  论文没提（论文用全量 fine-tune）。详见 [dpo_trainer.py L1049-L1091](https://github.com/huggingface/trl/blob/51c6d3ca31fb4cc80ff719c0844bbdfcd0feeefb/trl/trainer/dpo_trainer.py#L1049-L1091)。
- **`exo_pair` 的 KL 形式 ≠ DPO 的 sigmoid**：EXO ([Ji 2024](https://arxiv.org/abs/2402.00856))
  用 KL divergence between policy distribution 和 human preference distribution 替代 sigmoid。
  数学上等价于 cDPO 的某个特例，但梯度 landscape 不同——EXO 在标注 noise 大时更稳定。
- **`robust` 是 cDPO 的归一化版本**：除以 `(1 - 2ε)` 让 noise 修正不会"欠估计"——
  当 ε=0.5 时，`(1-2ε)=0`，loss 发散——这本身是 cDPO 的设计内合理性（ε=0.5 意味着完全随机 preference，
  本来就没法学）。
- **`completion_mask.chunk(2, dim=0)` 是 IPO 的 length normalization 关键**：DPO 用 sum-of-logprobs，
  IPO 用 average-of-logprobs。这把 length bias 砍掉一半，但**论文 IPO 没明说要 average 化**——
  trl 注释里写了"我们和 IPO 作者确认过他们的实验是 average，但论文文字写的是 sum"——
  这是个工程师不读 paper 也能复现的坑。
- **`per_sequence_loss.mean()` 而不是 sum**：batch reduction 用 mean 让 lr 不依赖 batch_size。
  这和官方版本一致（preference_loss 返回 per-example，外层调用 `.mean()`）。
- **trl 的 DPOTrainer 还内嵌了 Liger kernel 路径**（见 `_compute_loss_liger`），
  把 lm_head + logsoftmax + gather 融合成一个 CUDA kernel，省 30% 内存——
  这是 trl 2025 年的工程优化，论文版本完全没有。

**怀疑 3**：trl 的 7 种 loss type 共存意味着**社区还没决定哪个最好**。
论文 §7 只把 "DPO sigmoid" 推为正解，但生产环境（Anthropic / Mistral）用的具体 loss 都没公开。
有可能"DPO 比 PPO 好"这个结论在某个 loss variant 上成立，换一个就翻——
但目前**没有大规模 head-to-head**来证伪。

**怀疑 4**：DPO loss **没有 partition function `Z(x)` 的显式归一化**——
推导依赖 `Z(x)` 在 pair-difference 里消掉。但实际训练时 `π_ref` 是冻结模型，`π_θ` 是 fine-tune 的——
两者 token-level normalization 状态不一致（policy 的 softmax 在 vocab 上每步都变）。
论文 §5 用 reward equivalence class 解释，但**没有给 finite-batch 误差 bound**。
社区 [Tang 2024](https://arxiv.org/abs/2401.04056) 后来发现：当 chosen / rejected 长度差很大时，
DPO 的有效 reward 估计偏差 5-15%。

## L4 phd-skills 7 阶段

按 phd-skills 路径：experiment-design → reproduce → debug → factcheck → compare → fortify → research-publishing。

### 1. experiment-design

**目标**：用 trl 在 GPT-2 small 上跑一次 DPO + UltraFeedback 子集，对照 SFT-only baseline，看 DPO 在 PKU-SafeRLHF 验证集上的 win-rate 提升。
**预期**：DPO win-rate ≥ SFT win-rate + 10%（论文 §6.3 在 Anthropic-HH 上的提升幅度）。
**预算**：单 A100 / 4 小时 / GPT-2 small 124M / batch 8 / β=0.1。

### 2. reproduce

```bash
pip install trl==0.12 transformers==4.45 datasets accelerate
# UltraFeedback 1k 子集（去掉超长 prompt）
python -c "
from datasets import load_dataset
ds = load_dataset('argilla/ultrafeedback-binarized-preferences-cleaned', split='train[:1000]')
ds.save_to_disk('uf_1k')"

# DPOTrainer 最小脚本（约 20 行）
python train_dpo.py --model gpt2 --beta 0.1 --num_epochs 1 --output dpo_gpt2/
```

预期 reward_accuracy 从 0.5（随机）升到 0.65-0.75。

### 3. debug

最常见 3 个坑：
- **`labels=-100` 没设对**：prompt 部分 logprob 被算进去，DPO 在 prompt 上"对齐"，无意义。检查 `_get_batch_logps` 的 `loss_mask`。
- **ref_model 没 freeze**：`requires_grad=True` 让 reference 也被更新，loss 直接归零。trl 默认 freeze，但自定义脚本容易漏。
- **β 太大**：β=1.0 时梯度饱和（sigmoid 进入两端），loss 平台。论文 0.1-0.5 是甜区，先试 0.1。

### 4. factcheck

读 [trainers.py L70-L82](https://github.com/eric-mitchell/direct-preference-optimization/blob/f8b8c0f49dc92a430bae41585f9d467d3618fe2f/trainers.py#L70-L82)
确认 `pi_logratios - ref_logratios` 就是论文 Eq.7 的 `h_{π_θ}^{y_w,y_l}`。
然后看论文附录 A 推导 Theorem 1：从 closed-form `π*(y|x) ∝ π_ref exp(r/β)` 出发，
两边取 log → 解出 `r = β log(π/π_ref) + β log Z(x)` → 代回 BT loss → `Z(x)` 在 pair-diff 消去。
**亲手在草稿纸上推一遍**，是理解 DPO 唯一的方法。

### 5. compare

对照 [InstructGPT PPO](/study/papers/instructgpt/) 在 TL;DR 上的 win-rate 数字（68% vs SFT-baseline）
与 DPO 论文 §6.2 在 TL;DR 上的 win-rate（72% vs SFT），同一数据集 + 同一 baseline 下 DPO 高 4 个点。
但要注意：论文用 GPT-3.5 当 judge（不是人类），有 bias。

### 6. fortify

跑两次随机种子（seed=0, 1）看方差。如果 reward_accuracy 方差 > 5%，说明 DPO 在小数据集上**不稳定**——
这是论文 §7 提到的 limitation 之一。社区后来用 ensemble + label smoothing（cDPO）压方差。

### 7. research-publishing

如果发现 length bias 显著（chosen 平均长度 > rejected 20% 时 win-rate 虚高），
可以写"DPO under length-biased preferences" 短文，附 ablation：固定 chosen/rejected 同长度后 win-rate 多少。
这是 [Singhal 2023](https://arxiv.org/abs/2310.03716) 已经做过的方向，但在小模型上重做仍有价值。

## L5 接下来在哪里 — 谱系

### 前作（DPO 站在谁的肩膀上）

- [RLHF Christiano 2017](/study/papers/rlhf-christiano/)：定义 Bradley-Terry + reward learning + RL 三段流水线，
  这是 DPO loss 的 BT 项的起源。
- [InstructGPT 2022](/study/papers/instructgpt/)：把 RLHF 工业化到 GPT-3，证明 SFT + RM + PPO 流水线 work——
  DPO 是这个流水线的"后两段塌缩"，前段 SFT 完全保留。
- [Stiennon 2020 summarize-from-feedback](https://github.com/openai/summarize-from-feedback)：TL;DR
  RLHF 的早期完整实现，DPO 论文 §6.2 的 TL;DR 实验直接用它的数据。
- [Peng 2019 AWR](https://arxiv.org/abs/1910.00177)：Advantage Weighted Regression 用了 KL-constrained
  closed-form 同款数学，DPO 借走了"closed-form 反演"这个手术刀。

### 后作（DPO 直接生出来的论文家族）

- [IPO (Azar 2023)](https://arxiv.org/abs/2310.12036)：发现 DPO 在 noisy preference 下过拟合，
  把 sigmoid 换成 squared loss 把 reward 钉在 `1/(2β)`。
- [KTO (Ethayarajh 2024)](https://arxiv.org/abs/2402.01306)：去掉 pair 要求，用 prospect theory
  在 unpaired thumbs-up/thumbs-down 数据上跑——**真实部署场景标注更便宜**。
- [SimPO (Meng 2024)](https://arxiv.org/abs/2405.14734)：去掉 reference model，用 length-normalized average
  logprob 当 reward。在 reasoning 任务上 +5-10% win-rate，是目前最强的 reference-free DPO 变体。
- [ORPO (Hong 2024)](https://arxiv.org/abs/2403.07691)：把 SFT loss 和 DPO odds-ratio loss 合并成单段训练，
  消除"先 SFT 再 DPO"的二阶段流水线——**进一步塌缩**。
- [RLOO (Ahmadian 2024)](https://arxiv.org/abs/2402.14740)：DPO 的反方向——证明带 baseline 的 REINFORCE
  比 PPO 简单且效果相当。**保 PPO 派的反击**，工业界（Cohere）在用。
- [Self-Reward (Yuan 2024)](https://arxiv.org/abs/2401.10020) / [SPIN (Chen 2024)](https://arxiv.org/abs/2401.01335)：
  让模型自己当 judge 生成 chosen/rejected，迭代 DPO——**self-play 派**，训练数据从"人类标"变成"模型互标"。

### 反对者（保留 PPO / 不用 DPO 的派别）

- 保留 [InstructGPT PPO 派](/study/papers/instructgpt/)（OpenAI / Anthropic 内部部分团队）：
  PPO 给 reward 信号更细粒度（per-token），DPO 只能给 sequence-level。
  在 reasoning chain-of-thought 任务上 PPO 仍有优势，2025 年的 o1/o3 系都用强化学习而非 DPO。
- [Constitutional AI 2022](/study/papers/constitutional-ai/) RLAIF 派（Anthropic）：把人换成 AI 标注员，
  仍用 PPO 训。和 DPO 是**正交的优化方向**——CAI 省人力，DPO 省 RL，可以叠加（社区有 CAI+DPO 实践）。
- 纯 SFT 派（Tülu 系列 / Allen AI）：argue 高质量 SFT + 大量 demo 已经够好，DPO 提升边际有限。
  [Tülu 3 报告](https://arxiv.org/abs/2411.15124) 显示 SFT-only 已经能打 GPT-3.5。

## L6 三层 lessons

### 上：科学层（这篇做对了什么科研）

- **Closed-form 反演 + partition function 消除是最优雅的数学手术**——把 RL 化为监督学习的桥梁就藏在 KL-constrained
  最优解的 closed-form 里，反过来"用闭式解倒推 reward"是 DPO 真正的 inventive step。
- **Theorem 1 + reward equivalence class 是论证骨架**：不证明这个等价类，DPO 就只是一个"巧合 loss"；
  证了之后它升级成"任意 BT-consistent reward 都可达"的强结论。
- **ablation 的克制**：论文只在 IMDb / TL;DR / Anthropic-HH 三个数据集上做对照，没追求 SoTA。
  这种"少而硬"的实验设计反而比"刷 10 个 benchmark"更有说服力——审稿人能在 4 小时内复现核心数字。
- **写作上把 §3 Preliminaries 写成"教科书章节"**：把 BT + KL-RL 的标准结果完整复述一遍，
  让没读过 [Christiano 2017](/study/papers/rlhf-christiano/) 的读者也能跟上。这是 NeurIPS oral 论文应有的友好度。

### 中：工程层（做工程从这里学什么）

- **流水线塌缩是工程降本的最大杠杆**：DPO 把 4 阶段（SFT → RM 标注 → RM 训 → PPO）变成 2 阶段（SFT → DPO），
  整段 ML infra 复杂度对半砍。任何"两段串行流水线"都该问"能不能塌缩成一段"。
- **超参数从 6 个降到 1 个 = 工程成本降 1 个数量级**：每多一个超参，搜索空间指数膨胀。
  DPO 只剩 β，使得"个人开发者用单卡跑通"成为可能——**工程社区采纳速度的根本原因**。
- **`reference_free=True` 是个 1 行 if 写出来的副作用 feature**——SimPO 整篇论文围绕这个 if 展开。
  代码库里"看上去没用"的 fallback 路径经常是下一篇论文的种子。
- **trl 的 7 种 loss type 共存说明"统一 framework + 可插拔 loss"是社区库的最优形态**：
  不要让用户在多个相似库间切换，而是用一个 framework 容纳所有 variant。

### 下：方法层（用 AI 学这种论文怎么读）

- **数学密集型论文（如 DPO）必须亲手推一遍 §4**：3 步代数中任何一步省略，都会让 loss 实现看起来像魔法。
  推完之后 30 行代码 = 3 步推导一一对应，理解才扎实。
- **永远把"消失的项"放在标记的位置**：DPO 的 `Z(x)` 在哪步消失、为什么消失，是论文 §4 全部的张力来源。
  读密集数学论文时把"消失的项"画下来，比记结论更有用。
- **对比同样领域的前作**：单独读 DPO 会觉得"为什么这个推导能成立？"
  但和 [InstructGPT PPO](/study/papers/instructgpt/) 对比着读，DPO 的每一步都在"对应消除 PPO 的某个工程痛点"——
  推导动机变得清晰。
- **看 trl 的实现可以发现论文没说的现实假设**：DPOTrainer 处理 length normalization、loss type 混合、
  PEFT adapter——这些都是论文外的"工程隐式假设"。读论文 + 读流行实现 = 完整理解。

## L7 限制 / 怀疑

**论文限制**（§7 + 社区 follow-up）：

1. **length bias 严重**：sum-of-logprobs 让长 response 拿更多 reward，chosen 平均比 rejected 长 20% 时
   DPO 学到"长就是好"——SimPO / IPO / 长度归一化都是为了修这个。
2. **训练后期 chosen logprob 反而下降**（[Pal 2024](https://arxiv.org/abs/2402.13228)）：DPO 在某些数据分布下
   会同时把 chosen 和 rejected 的 logprob 都推下去，只保留它们的差。这违反"DPO 把 chosen 推上去"的直觉。
3. **OOD 行为不可控**：DPO 不显式约束 KL 大小，policy 在远离 ref 的 OOD 区域可能给出怪异 logprob。
   PPO 的 KL controller 至少有显式上界。
4. **没有 reward server 的代价**：reward 信号只能 sequence-level，无法做 [InstructGPT 的 per-token KL shaping](/study/papers/instructgpt/)。
   reasoning chain-of-thought 任务上这是真实劣势。

**我的额外怀疑**（除上面 4 处嵌入的怀疑外）：

- **怀疑 5**：论文 §6 的 win-rate 用 GPT-4 当 judge——但 GPT-4 本身用 RLHF/DPO 训过，
  对 DPO-style output 有 distribution match 偏好。**评估器与被评估方法非独立**，可能高估 DPO 优势 3-5%。
- **怀疑 6**：β 的"鲁棒性"在论文里只在 0.1-0.5 区间显示，但**没说明 β 和数据集 noise level 的耦合**。
  noisy 数据上 β=0.1 可能远比 β=0.5 差——cDPO / IPO 提了这点，但没系统 ablation。
- **怀疑 7**：DPO 论文用 Pythia / GPT-J（最大 6B），没在 70B 量级验证。社区把 DPO 推到 Llama-2-70B 时
  发现训练 1 epoch 后就要早停（继续会 reward hacking），这个现象论文没预测——**理论是否在大模型上仍成立**没回答。
- **怀疑 8**：论文不讨论"DPO 是否 sample-efficient"——给定 100k preference pair，DPO 比 PPO 学得快还是慢？
  [Ahmadian 2024 RLOO](https://arxiv.org/abs/2402.14740) 暗示 sample efficiency 上 PPO 反而更好。
  这是 DPO 派最大的 elephant in the room。

## 元数据

| 维度 | 内容 |
|---|---|
| 完成时间 | 2026-05-28 |
| 季节 / 论文 round | Season I · I5（接 [I3 InstructGPT](/study/papers/instructgpt/) / [I4 CAI](/study/papers/constitutional-ai/) / [I1 RLHF](/study/papers/rlhf-christiano/)） |
| 笔记类型 | method paper（数学推导密集型） |
| 阅读时长 | ~6 小时（含 §A 推导亲手过一遍） |
| 心脏物 | §4.1 三步推导 / Theorem 1 / Figure 2 IMDb win-rate |
| 必精读段 | §3 Preliminaries / §4 全章 / §5 reward equivalence |
| 跳读段 | §2 related work / §6 后半的额外 ablation |
| Layer 3 三段独立精读 | (a) preference_loss 实现 / (b) reference model + 隐含 KL / (c) trl 7-loss framework |
| 可执行下游 | 单 A100 / GPT-2 small / UltraFeedback 1k / 4 小时跑通 |
| 关联笔记 | [RLHF Christiano](/study/papers/rlhf-christiano/) · [InstructGPT](/study/papers/instructgpt/) · [Constitutional AI](/study/papers/constitutional-ai/) |
| 后续 round 候选 | IPO (修 saturation) / KTO (去 pair) / SimPO (去 reference) / ORPO (合 SFT+DPO) / RLOO (PPO 简化反击) |
