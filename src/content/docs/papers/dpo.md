---
title: DPO Direct Preference Optimization
来源: 'Rafailov et al., "Direct Preference Optimization: Your Language Model is Secretly a Reward Model", NeurIPS 2023 / arXiv 2305.18290'
---

# DPO — 把 RLHF 的三阶段拍成两阶段

## 一句话总结

DPO（Direct Preference Optimization）是 Rafael Rafailov、Archit Sharma、Eric Mitchell、Stefano Ermon、
Christopher D. Manning、Chelsea Finn 等斯坦福团队 2023 年 5 月放上 arXiv（2305.18290）、年底拿下
NeurIPS 2023 Outstanding Paper Runner-Up 的工作。它做的事情看起来很小：把 RLHF（Reinforcement
Learning from Human Feedback）经典的三阶段流水线（**SFT --> 训 reward model --> 用 PPO 跑 RL**）
直接拍扁成两阶段（**SFT --> DPO**）。但这个"小改造"的影响几乎立刻把整个 LLM 对齐生态的训练
basis 翻了一遍。论文标题里那句 "Your Language Model is Secretly a Reward Model" 也成了 2023
年最广为流传的 ML 论文金句之一。

历史定位：从 2017 年 Christiano 等人的 *Deep RL from Human Preferences*（首次把人类对成对样本的
偏好作为信号训 RL）到 2020 年 OpenAI summarization preference paper（首次把 RLHF + LLM 拼起来
做摘要）到 2022 年 InstructGPT（让 ChatGPT 雏形浮出水面），中间这条路线一直依赖 PPO 这个非常
难调的 actor-critic 算法。**PPO 难调**指的是：你需要同时维护四个模型（actor / critic / reference /
reward model），一旦 advantage estimation、clip ratio、KL coefficient、value function loss weight
任何一个数错，训练就崩；崩了的特征是 reward 一路飙升但 generation 质量肉眼可见变差，也就是经典
的 reward hacking。DPO 出现之前，社区里"想做 RLHF 但调不动 PPO"的小团队基本只能用 RM-only filter
（拿 RM 打分挑数据再 SFT，best-of-N rejection sampling）凑合。DPO 之后，**只要你会做 SFT 你就能
做"对齐"**——这是开源 LLM 生态（Llama-2 finetune / Mistral / Zephyr / Tulu / Nous-Hermes 等等）
能在 2023 下半年至 2024 大爆发的关键工程前置条件之一。

设计动机：作者们注意到一个被忽视的数学事实——**KL 约束的 reward maximization 有 closed-form 解**。
也就是说当你最大化 `E[r(x,y)] - beta * KL[pi || pi_ref]` 时，最优 policy 的形式是 *固定的*：
`pi*(y|x) ∝ pi_ref(y|x) * exp(r(x,y)/beta)`。这意味着 **reward 和 policy 之间存在双射**——
给定一个 reward function，你可以唯一确定 optimal policy；反过来，给定一个 optimal policy，你也
可以唯一反解出对应的 reward function。RLHF 的传统做法是先学 reward model 再用 RL 找 optimal
policy；DPO 的做法是直接跳过中间这一步——既然 policy 和 reward 一一对应，那干嘛不直接对 policy
做 maximum likelihood？这就是为什么标题说 "your language model is secretly a reward model"：
任何一个 LLM `pi_theta` 和它的 SFT reference `pi_ref` 拼在一起 `r(x,y) = beta * log[pi_theta(y|x)
/ pi_ref(y|x)]`，自动就是一个合法的 reward function。

为什么 LLM 后训练领域几乎在一夜之间从 PPO 切到 DPO？回答几乎完全是工程层面的：(1) 训练成本
减半（不需要训 reward model 也不需要跑 RL）；(2) 显存占用减半（PPO 需要同时载 actor / critic /
ref / RM 四个模型，DPO 只需要 policy + ref 两个，且 ref 可以 freeze + offline cache）；(3) 训练
稳定性高一个数量级（binary cross-entropy 永远不会发散，PPO 经常发散）；(4) 唯一的核心 hp 是
`beta`，比 PPO 的 5+ 个 hp 调参负担小得多。代价是 **DPO 是 offline 的**——它在固定的 paired
preference dataset 上训，没有 PPO 那种 policy 不断 rollout 探索新分布的能力。这个代价直到 2024
年才真正被社区充分理解（参见 Section 5 的 SimPO / RPO / online DPO 等衍生）。

---

## Section 1: 动机 — 为什么 RLHF 的三阶段流水线值得被简化

### Section 1.1: RLHF 经典三阶段是什么

回顾 InstructGPT (Ouyang et al. 2022) 的训练流水线：

1. **Stage 1: SFT** — 在人写的 demonstrations `(x, y_demo)` 上做 supervised fine-tuning。这一步
   主要让 base model（pre-trained LLM）学会 *follow instruction* 的格式。比如 GPT-3 在 SFT 之前
   被 prompt "How to make a cake?" 时可能补全成 "How to make a cake? How to make a pie?"——它没
   有 instruction following 的概念。SFT 之后它学会回答而不是续写。

2. **Stage 2: Reward Model** — 收集成对偏好数据 `(x, y_w, y_l)`（同一个 prompt 下两个回答，标注员
   选 y_w 比 y_l 好），用 Bradley-Terry preference model 拟合一个 reward function `r_phi(x, y)`：
   `P(y_w > y_l | x) = sigma( r_phi(x, y_w) - r_phi(x, y_l) )`。这个 RM 的输出是一个 scalar，
   语义上代表"人有多喜欢这个 (x, y) pair"。

3. **Stage 3: PPO** — 把 SFT model 当 policy `pi_theta`，把 RM 当 reward signal，用 PPO 算法
   做 policy gradient：`max E[r_phi(x, y)] - beta * KL[pi_theta || pi_ref]`。这里的 KL term
   是为了防止 policy "崩坏"——离 SFT reference 太远会导致 generation 质量灾难性下降（reward
   hacking 的典型前兆）。

### Section 1.2: 三阶段的代价

PPO 这一步是整个流水线最痛的：

- **四模型同时载入**：actor (pi_theta，trainable)、critic (value head，trainable)、reference
  (pi_ref，frozen)、reward model (r_phi，frozen)。一个 7B 模型每份 ~14GB，四份 ~56GB，且需要
  额外的 optimizer state / gradient。在没有 ZeRO / FSDP 的小团队那里几乎跑不动。
- **on-policy data**：每次 update 都要重新 rollout，吞吐量被 generation latency 死死锁住。
- **超参数地狱**：PPO clip ratio epsilon、KL coefficient beta、value function loss weight、
  generalized advantage estimation lambda、reference batch size、entropy bonus 等十几个 hp，
  调差一个就崩。
- **reward hacking**：一旦 RM 不够准，policy 会找到"骗过 RM"的奇怪 generation 模式（典型
  case：填充大量 disclaimer / 大量重复短语让 RM 给高分但人类觉得糟糕）。

### Section 1.3: DPO 的简化目标

DPO 想做的事情非常具体：**保留三阶段流水线在数学上的等价性，但把 Stage 2 + Stage 3 合并成
一步直接对 pi_theta 训的 binary cross-entropy**。如果做到了，所有上面这些痛点就被一次性消除：

- 训练只需要 actor + frozen reference，两个模型，可以再压一压（reference 的 logp 可以离线
  precompute 一遍存起来，训练时不用前向）。
- offline 训练，没有 rollout，吞吐量是普通 SFT 级别的。
- 主要 hp 只有一个 `beta`。
- 没有 RM，所以没有 RM 不准导致的 reward hacking（但代价是 paired preference data 本身的偏差
  会直接传到 policy，参见 Section 9 的限制）。

> 怀疑：DPO 数学上等价于 RLHF（在某些假设下），但实际 LLM 训练效果有时差异。Tunstall et al.
> 2023 (Zephyr-7B) 和 Hugging Face TRL 团队的 ablation 都报告：在某些 setup 下 DPO 比 PPO 略差，
> 在另一些 setup 下相反。这到底是 implementation 细节差异、还是 distribution shift 问题（PPO
> 用 on-policy data 而 DPO 只能用 offline pair）？我目前更倾向是后者——offline preference data
> 永远是 stale 的，policy 训着训着就漂移到 reference distribution 之外，DPO loss 在那块区域
> 完全没有 supervision。这也是 2024 一堆 online DPO 变种出现的原因。

### Section 1.4: 与同期路线（RM-as-classifier、SLiC、RRHF）的关系

DPO 不是 2023 年第一个想跳过 PPO 的工作。同期还有：

- **SLiC-HF** (Zhao et al. 2023, Google)：用 sequence-level rank loss + ref policy regularization
  做对齐，是 DPO 的近亲。SLiC 的损失是 hinge loss + KL，DPO 的损失是 sigmoid CE + 隐式 KL（在
  beta * log ratio 那一项里）。两者经验性能接近。
- **RRHF** (Yuan et al. 2023, Alibaba)：用 ranking loss 直接把多个 candidate 的 logp 排序拟合
  reward。是更早的尝试，但没有 DPO 的那个漂亮的"reward 隐式藏在 log ratio 里"的理论结论。
- **Best-of-N + SFT**：用 RM 打分选出 top-k candidate 再 SFT。简单直接，但 reward signal 被
  argmax 量化了。

DPO 在这群里之所以胜出是因为它最早把数学结论说清楚（KL-constrained RL 的 closed-form 解 + BT
代换 = BCE），且 PyTorch 实现极短（~30 行）。

---

## Section 2: 关键定义

### Definition 1: Paired preference data

DPO 的训练数据是 triplet 形式：`D = { (x_i, y_w_i, y_l_i) }_{i=1..N}`，其中

- `x_i`：prompt（也叫 query / context）
- `y_w_i`：chosen response（标注员认为更好的那个）
- `y_l_i`：rejected response（标注员认为更差的那个）

w / l 分别表示 winner / loser。注意两个 response **必须是同一个 x 下的**，跨 x 比较没有意义。
真实数据集（Anthropic HH、UltraFeedback、Nectar）通常每个 x 配 1-N 对偏好。

### Definition 2: Bradley-Terry preference model

经典统计学模型，用一个 scalar reward `r(x, y)` 解释偏好分布：

```
P(y_w > y_l | x) = sigma( r(x, y_w) - r(x, y_l) )
                 = exp(r(x, y_w)) / [ exp(r(x, y_w)) + exp(r(x, y_l)) ]
```

这等价于"两个 response 的 reward 差异越大，winner 被选中的概率越接近 1"。Bradley-Terry 是
RLHF 里 reward model 训练的标准目标，也是 DPO 推导的起点。

注意 BT 假设 reward 是 deterministic + transitive 的——这是个理想化假设，真实人类偏好经常
inconsistent（同一个标注员在不同时间会选不同 winner）也经常 non-transitive（A > B, B > C, C > A
的循环）。Section 9 会回到这个问题。

### Definition 3: DPO 损失函数

最终形式：

```
L_DPO(pi_theta; pi_ref) = - E_{(x, y_w, y_l) ~ D} [
    log sigma(
        beta * log[pi_theta(y_w | x) / pi_ref(y_w | x)]
      - beta * log[pi_theta(y_l | x) / pi_ref(y_l | x)]
    )
]
```

拆解每一项：

- `pi_theta(y | x)` — 当前训练的 policy 在 (x, y) 上的概率（实际是 sequence logp，所有 token
  的 logp 加起来）
- `pi_ref(y | x)` — frozen reference policy 的概率（一般是 SFT checkpoint）
- `beta` — 温度 / KL 强度。典型范围 0.01 - 0.5。beta 越大 = KL 约束越紧 = pi_theta 不能离 pi_ref
  太远 = 训练 signal 越保守
- `sigma` — sigmoid，把"winner 比 loser 高多少"压到 (0, 1) 概率
- 整体形式 = binary cross-entropy with the label "winner is preferred"

### Definition 4: 隐式 reward（implicit reward）

DPO 论文证明：训练好的 pi_theta 等价于在 reward function

```
r_theta(x, y) = beta * log[pi_theta(y | x) / pi_ref(y | x)] + beta * log Z(x)
```

下做 KL-constrained RL 的最优 policy。其中 Z(x) 是 partition function（与 y 无关），所以在
preference comparison 里抵消。结论：**任意一个 (pi_theta, pi_ref) 对都隐含一个 reward function**，
反过来任意 reward function 加上 pi_ref 都唯一确定 pi*。这是标题 "secretly a reward model" 的
数学含义。

### Definition 5: KL-constrained reward maximization objective

RLHF Stage 3 优化的目标：

```
J(pi) = E_{x ~ D, y ~ pi(.|x)} [r(x, y)] - beta * E_x KL[pi(.|x) || pi_ref(.|x)]
```

DPO 的全部数学骨架都建立在"这个目标有 closed-form 解"这个事实之上。Section 3 会详细推导。

---

## Section 3: 数学推导 — 为什么这一切是等价的

### Section 3.1: RLHF 的目标函数

复述 Definition 5：

```
max_pi   E_{x, y ~ pi} [r(x, y)]   -   beta * KL[pi || pi_ref]
```

把 KL 展开：`KL[pi || pi_ref] = E_{y ~ pi}[log pi(y|x) - log pi_ref(y|x)]`，整体写成单个期望：

```
max_pi  E_{x, y ~ pi} [ r(x, y) - beta * (log pi(y|x) - log pi_ref(y|x)) ]
```

这是个变分问题：在所有合法分布 pi 中找最大化这个量的那个。

### Section 3.2: closed-form 解

用 Lagrangian 或者直接对 pi 求 functional derivative（细节见 DPO 论文 Appendix A.1，也可以参考
Peters & Schaal 2007 的 REPS 推导，本质是同一个工具）。结论：

```
pi*(y | x) = (1 / Z(x)) * pi_ref(y | x) * exp( r(x, y) / beta )
```

其中

```
Z(x) = sum_y pi_ref(y | x) * exp( r(x, y) / beta )
```

是归一化常数（partition function）。这个解的直觉是：**最优 policy 是 reference 的指数 reweight
版本**——reward 高的 y 被 exp 放大，reward 低的被压低，beta 控制 reweight 的激进程度。

> 怀疑：closed-form 解的存在并不意味着 closed-form 解可以高效计算——`Z(x)` 是对所有可能 y 求和，
> 在 LLM 场景下 `y` 是任意长度的 token sequence，求和空间是 vocab^seq_len 量级，本质上不可计算。
> 这就是为什么 RLHF 即使知道 closed-form 也还是需要 RL 来近似。DPO 的精妙之处恰恰是 **在 BT
> preference 框架下 Z(x) 自动抵消**——下面 Section 3.3 会看到。

### Section 3.3: 反解 reward + 代入 Bradley-Terry

把 Section 3.2 的式子取对数 + 整理：

```
r(x, y) = beta * log[ pi*(y|x) / pi_ref(y|x) ] + beta * log Z(x)
```

注意第二项 `beta * log Z(x)` 只跟 x 有关，跟 y 无关。代入 Bradley-Terry preference 公式：

```
P(y_w > y_l | x) = sigma( r(x, y_w) - r(x, y_l) )
```

两个 reward 相减：

```
r(x, y_w) - r(x, y_l)
= beta * (log[pi*(y_w|x)/pi_ref(y_w|x)] - log[pi*(y_l|x)/pi_ref(y_l|x)])
+ beta * (log Z(x) - log Z(x))
= beta * log[pi*(y_w|x)/pi_ref(y_w|x)] - beta * log[pi*(y_l|x)/pi_ref(y_l|x)]
```

**Z(x) 抵消了！** 这是 DPO 数学的关键时刻。partition function 这个最难算的东西在 BT 公式的
减法里自动消失，剩下的全是可以从 LLM 直接前向得到的 logp。

### Section 3.4: 最大似然 --> DPO loss

把 pi* 替换成可训练的 pi_theta，在 paired preference data 上做 maximum likelihood：

```
L = - E_{(x, y_w, y_l) ~ D} log P(y_w > y_l | x)
  = - E log sigma(beta * log[pi_theta(y_w|x)/pi_ref(y_w|x)]
                - beta * log[pi_theta(y_l|x)/pi_ref(y_l|x)])
```

这就是 Definition 3 的 DPO loss，结束。整套推导骨架是：

```
RLHF objective (KL-constrained reward max)
   --> closed-form pi* via variational calc
   --> 反解 r in terms of pi*, pi_ref, Z
   --> 代入 BT preference, Z 抵消
   --> MLE on preferences = BCE on log-ratios
```

> 怀疑：这个推导有个隐藏的"reward 实现假设"——它假设 *存在某个* ground truth reward function
> r* 满足 BT preference。如果 human preference 不能被 BT 模型解释（例如 non-transitive、
> stochastic、context-dependent），这个 reward function 根本不存在，那整套推导建立在一个不存在
> 的对象上。Munos et al. 2024 (Nash Learning from Human Feedback) 就是从这个角度批评 BT 假设
> 并提出 game-theoretic 替代。

### Section 3.5: gradient 长什么样

对 pi_theta 求导（细节略）：

```
grad L_DPO = - beta * E [
    sigma( hat_r_theta(x, y_l) - hat_r_theta(x, y_w) )
    * ( grad log pi_theta(y_w | x) - grad log pi_theta(y_l | x) )
]
```

其中 `hat_r_theta(x, y) = beta * log[pi_theta(y|x)/pi_ref(y|x)]` 是 implicit reward。

直觉解读：

- 推高 winner 的 logp（增加 `grad log pi_theta(y_w | x)` 这一项的权重）
- 压低 loser 的 logp（减去 `grad log pi_theta(y_l | x)` 这一项）
- 前面的 sigmoid 系数是 *adaptive weighting*：当模型已经把 winner 拉高 / loser 压低（implicit
  reward gap 很大），sigmoid 趋近 0，gradient 变小，自动停止 update —— 这是 DPO 训练稳定性
  的关键性质，相当于自带 confidence-based curriculum。

---

## Section 4: Algorithm 1 — DPO 训练循环

```
Algorithm 1: DPO Training (offline, paired preference)

Input:
  D = { (x_i, y_w_i, y_l_i) }_{i=1..N}        # paired preference dataset
  pi_ref                                       # frozen reference policy (SFT ckpt)
  pi_theta                                     # trainable policy (init from pi_ref)
  beta                                         # KL strength, typical 0.01 - 0.5
  optimizer (AdamW), lr, n_epochs, batch_size

Output:
  pi_theta_final

Pre-compute (optional but standard):
  for each (x, y_w, y_l) in D:
    log_pi_ref_w = sum over tokens of pi_ref.logp(y_w | x)     # forward pass on frozen ref
    log_pi_ref_l = sum over tokens of pi_ref.logp(y_l | x)
    cache (log_pi_ref_w, log_pi_ref_l) to disk
  # 这一步让训练时可以扔掉 pi_ref，省一份 GPU memory

Training loop:
  for epoch in 1..n_epochs:
    for batch in shuffle(D, batch_size):
      # 1. forward on pi_theta
      log_pi_theta_w = sum_tokens( pi_theta.logp(y_w | x) )    # shape [B]
      log_pi_theta_l = sum_tokens( pi_theta.logp(y_l | x) )

      # 2. load cached pi_ref logp
      log_pi_ref_w = cache[batch].w
      log_pi_ref_l = cache[batch].l

      # 3. implicit rewards
      r_hat_w = beta * (log_pi_theta_w - log_pi_ref_w)
      r_hat_l = beta * (log_pi_theta_l - log_pi_ref_l)

      # 4. DPO loss = -log sigma( r_hat_w - r_hat_l )
      logits = r_hat_w - r_hat_l                               # shape [B]
      loss = - F.logsigmoid(logits).mean()

      # 5. backward + step
      loss.backward()
      optimizer.step()
      optimizer.zero_grad()

      # 6. (optional) log diagnostics
      reward_acc = (logits > 0).float().mean()                 # winner 比 loser 隐式 reward 高的比例
      reward_margin = logits.mean()
      kl_estimate = ((log_pi_theta_w - log_pi_ref_w).abs()
                   + (log_pi_theta_l - log_pi_ref_l).abs()).mean()
      log(reward_acc, reward_margin, kl_estimate, loss)

  return pi_theta
```

### Section 4.1: 关键工程点

- **logp 是 sum-over-tokens**，不是 mean。论文用 sum，TRL 默认也是 sum。如果用 mean 会改变 beta
  的有效尺度（长序列梯度被压扁），需要相应调 beta。
- **`pi_ref` 可以离线 cache**：训练前对整个 dataset 跑一遍 ref forward 把 logp 存下来，训练时
  只需要 pi_theta 一份模型在 GPU。这是 7B+ DPO 能跑在单卡的关键。Hugging Face TRL 默认开启
  这个 trick。
- **gradient checkpointing 必开**：DPO 每个 batch 要前向两次（y_w 和 y_l），显存压力大。
- **prompt 部分的 logp 不算**：只对 response token 计 sum，避免 prompt 主导梯度（prompt token
  数往往远多于 response token）。
- **bf16 / fp16**：sigmoid 在数值边界容易 NaN，TRL 默认对 logits clamp 到 [-100, 100] 一刀。

链接示意（permalink，commit hash 实际版本以仓库为准，下面是 40-char hex 形式样例）：

[eric-mitchell/direct-preference-optimization trainers.py](https://github.com/eric-mitchell/direct-preference-optimization/blob/f8b8c0f519f7a3a2b4e1c5d27a8f9e3b6c1d2a8e/trainers.py)

[huggingface/trl trl/trainer/dpo_trainer.py](https://github.com/huggingface/trl/blob/9b1e5a3c0fd8f1c2e7a9b6d5a4c3b2e1f0d9c8b7/trl/trainer/dpo_trainer.py)

[axolotl-ai-cloud/axolotl src/axolotl/utils/trainer.py](https://github.com/axolotl-ai-cloud/axolotl/blob/3a2e1d8c4b6f5e9c0d7a2b4e6f8c1a3d5e7b9c0f/src/axolotl/utils/trainer.py)

### Section 4.2: 三个 diagnostic 指标

DPO 训练时最有用的不是 loss 本身（loss 一般会单调下降但不告诉你模型真的学到什么），而是这三个：

- `reward_accuracy`：implicit reward gap 为正的比例，衡量"模型多大程度上认同标注"。健康的训练
  会从初始的 ~50%（random）升到 70-95%。如果训到 99% 几乎肯定 overfit。
- `reward_margin`：reward gap 的平均值，越大表示 winner 和 loser 越能被区分。
- `kl_estimate`：pi_theta 和 pi_ref 之间的 KL 散度估计。过大说明 policy 漂移太远，可能崩坏；
  过小说明完全没学到东西。典型 healthy 区间 0.5 - 5（依任务）。

> 怀疑：reward accuracy 和实际下游表现的相关性其实并不强——很多 paper 报告 reward acc 卡在
> 70% 但 GPT-4 win rate 已经远超 baseline，反过来也有 reward acc 很高但 generation 看起来
> 没什么变化的 case。这可能是因为 BCE 在 paired setting 里只 enforce 相对顺序，不直接优化
> generation 质量。

---

## Section 5: 图解

![DPO 跳过 RM 和 PPO，直接对 pi_theta 训 BCE](/papers/dpo/01-rlhf-vs-dpo.webp)

上图把 RLHF 三阶段（蓝-橙-红：SFT --> RM --> PPO）和 DPO 两阶段（蓝-绿：SFT --> DPO）放到一起。
RLHF 的 RM + PPO 在 DPO 里被一个浅灰色的 "(no RM, no PPO)" 块替代——reward 信息隐式藏在
`pi_theta / pi_ref` 的 log ratio 里。底部那行小字是 DPO 的核心原理：KL-constrained RL 的
closed-form 解让 reward 可以从 policy 反解出来，代入 BT preference 之后 partition function
Z(x) 自动抵消，剩下的就是个 binary cross-entropy。

注意 RLHF 三块下面用红色字写了 PPO 的工程痛点（不稳定 / 调 hp / reward hacking / 显存压力大），
DPO 两块下面用绿色字写了 DPO 的工程优点（无 PPO / 无 RM / 只 ref + policy / 单 BCE / 主要 hp
是 beta）。这两组对比是工程团队当年从 PPO 切到 DPO 的几乎全部理由。

![DPO 损失函数四步推导](/papers/dpo/02-loss-derivation.webp)

下图是 Section 3 推导过程的可视化：

- Step 1（红框）：RLHF 的 KL-constrained reward maximization objective
- Step 2（黄框）：closed-form 解 `pi*(y|x) ∝ pi_ref(y|x) * exp(r(x,y)/beta)`，反解出 reward 等于
  beta 倍 log ratio + 一个 partition function 常数项
- Step 3（蓝框）：代入 Bradley-Terry preference，partition function `log Z(x)` 在 winner / loser
  减法里抵消（关键时刻！）
- Step 4（绿框）：最大化 likelihood --> DPO loss = `-log sigma(beta * (log_ratio_w - log_ratio_l))`

右下角的注释拆开了 winner / loser 两项的方向：winner 项在推高 chosen 的 likelihood，loser 项在
压低 rejected 的 likelihood，beta 控制信号强度。

> 怀疑：图 2 把推导画得很 clean，但实际上 Step 1 --> Step 2 用的变分法在 LLM 这种 sequence
> distribution 上严格性是有 caveat 的——sequence distribution 不是 finite-dimensional simplex，
> 一些极小测度集合的论证需要更小心。论文 Appendix 给出了基于 finite vocab 的论证，但实际场景
> 是 vocab^seq_len 这个组合空间。我目前没看到完整的严格证明，但社区也没人特别质疑过这一点
> （因为最终的 loss 形式经验上 work）。

---

## Section 6: 实验结果（论文）

### Section 6.1: Controlled sentiment generation

任务：在 IMDb 上 finetune 一个 GPT-2 让它生成 positive sentiment。Reward 由一个独立的 sentiment
classifier 给。比较 PPO / DPO / Preferred-FT / SFT 等方法。

结论：

- DPO 在 reward / KL 边界上同时 dominate 其他方法（同样 KL 下 reward 更高，反之亦然）。
- 不需要 reference reward model（直接用 ground truth sentiment classifier），可控性高。
- DPO 的 reward 提升曲线比 PPO 更单调，方差更小。

### Section 6.2: Summarization (TL;DR Reddit)

任务：Reddit TL;DR 摘要。Preference data 来自 Stiennon et al. 2020 收集的人类标注。GPT-4 作为
裁判（让 GPT-4 在 DPO output 和 PPO output 之间选 winner）。

结论（论文 Table 1 核心数字）：

- DPO win rate vs PPO（GPT-4 judge）：~58% (sampling temperature 0.0)
- DPO 在不同 sampling temperature 下都 robust，PPO 在低 temperature 容易崩坏

### Section 6.3: Single-turn dialog (Anthropic HH)

任务：Anthropic HH (Helpful + Harmless) 数据集，单轮对话偏好。

结论：

- DPO 显著优于 Preferred-FT（直接对 chosen response SFT）和 best-of-128 baseline
- DPO 与训得最好的 PPO 接近或略优
- DPO 训练时间约为 PPO 的 1/4

### Section 6.4: 训练曲线 / KL trade-off

DPO 的核心实验论点：在同一个 KL budget 下，DPO 能拿到比 PPO 更高的 reward；或者反过来，达到
同样 reward 时 DPO 的 KL 更小。这是个 Pareto-frontier 论证，意味着 DPO 不是简单 "比 PPO 强"，
而是 "在 reward-KL 这个 trade-off 上严格 dominate"。

> 怀疑：论文用 GPT-4 当 judge 是 2023 年的标准做法，但 GPT-4 自己是 RLHF 训出来的，对 RLHF
> 风格 output 可能有偏好（known LLM-as-judge bias）。这意味着"DPO win rate 58%" 这个数字的
> 严格 generalizability 是有问题的。后续工作（Tunstall 2023 / Ivison 2024）用人类盲测重新做
> 了一遍，DPO vs PPO 的差距比论文报告的要小。

---

## Section 7: 后续衍生 — DPO 家族

DPO 之后，社区在 2023 下半年到 2024 上半年涌现了一大批变种。每一个都声称"比 DPO 好"，但
经常互相打架：

### IPO (Identity Preference Optimization, Azar et al. 2023, DeepMind)

观察：DPO 在 deterministic preference (BT 假设) 下会 *过度自信*——只要 winner 比 loser 高一点，
loss 就一直推到 +inf。IPO 把损失从 logsigmoid 换成了 squared-error 形式，避免无穷推动，对
overconfident preferences 更鲁棒。

```
L_IPO = E[ (log_ratio_w - log_ratio_l - 1/(2*tau))^2 ]
```

经验：IPO 在 noisy preference data 上比 DPO 稳，clean data 上和 DPO 差不多。

### KTO (Kahneman-Tversky Optimization, Ethayarajh et al. 2024)

观察：DPO 要求 paired preference，但很多场景只有 *单边* 标签（thumb-up / thumb-down）。KTO 借
Kahneman-Tversky prospect theory 设计了一个 unpaired binary loss，利用 reference 的 expected
log ratio 当 anchor。

意义：KTO 让"只有点赞数据"的产品（推荐系统、客服系统）也能做对齐。

### RPO (Reward-augmented Preference Optimization, Pang et al. 2024)

加一个 reward signal 到 DPO loss 里（混合 SFT loss on chosen + DPO BCE）。在 dense reward 可
得的场景（math reasoning）效果好。

### SimPO (Simple Preference Optimization, Meng et al. 2024)

去掉 pi_ref！只在 pi_theta 上做 length-normalized log probability 对比，加一个固定 margin。
意外地在很多 benchmark 上比 DPO 强。说明 pi_ref 其实可能不是必需的——某些场景下它甚至成为约束
负担。

```
L_SimPO = - E log sigma(
    beta/|y_w| * log pi_theta(y_w|x) - beta/|y_l| * log pi_theta(y_l|x) - gamma
)
```

### ORPO (Odds Ratio Preference Optimization, Hong et al. 2024)

把 SFT 和 preference optimization 合并到 *单阶段*：直接在 base model 上同时优化 SFT loss 和
log odds ratio preference。不需要先 SFT 再 DPO。

### Online DPO / Iterative DPO

观察：DPO 是 offline 的，policy 漂移到 ref 之外时无 supervision。解决方案：每隔几个 epoch 用
新 policy 重新生成 candidate + 让 RM（或 GPT-4 / 人类）打偏好 + 再训一轮 DPO。Llama-3 的
post-training 用了类似 pipeline。

> 怀疑：这些衍生层出不穷，每个都报告 "我比 DPO 强 X%"，但社区独立复现经常打架。这是 RLHF 后
> 时代研究碎片化的征兆——loss 形式本身的优化空间已经很小，真正大的 gain 来自 *数据质量* 而不
> 是 *loss 公式*。Allen-AI Tulu-3 的 ablation 表明：换 loss 从 DPO 到 SimPO 收益 1-2%，但换
> preference data 从 UltraFeedback 到自生成 + GPT-4 重标注收益 5-10%。

---

## Section 8: 工程实践

### Section 8.1: 数据准备

- **dataset 格式**：JSONL，每行 `{"prompt": ..., "chosen": ..., "rejected": ...}`
- **常用数据集**：Anthropic HH（51k 对，helpful + harmless）、UltraFeedback（64k，多模型生成 +
  GPT-4 打分）、Nectar、Capybara DPO、Argilla DPO Mix
- **去噪**：把 chosen / rejected 长度差异极大的对扔掉（避免模型学到"长 = 好"），把 chosen 完全
  contain rejected 的扔掉

### Section 8.2: 超参数典型值

- `beta`: 0.1（Tulu / Zephyr 默认），范围 0.01 - 0.5
- `learning_rate`: 5e-7 ~ 1e-6（比 SFT 小 10-100x，因为 implicit reward gradient 已经放大了
  beta 倍）
- `n_epochs`: 1-3（多了过拟合）
- `batch_size`: 32-128（看显存）
- `max_length`: 1024-2048

### Section 8.3: 与 LoRA / QLoRA 结合

DPO 完全兼容 PEFT。一个常见 setup：

- pi_ref = base model + SFT LoRA（merged or kept）
- pi_theta = pi_ref + DPO LoRA（trainable）
- 训练时只更新 DPO LoRA，ref logp 用 base + SFT 算

显存可以压到单 4090 跑 7B。这是开源社区跑 DPO 的主流配置。

### Section 8.4: 调试 checklist

- 训练发散 → beta 太大，调小到 0.01
- reward acc 不动 → lr 太小，或数据噪声太大
- KL 爆炸 → policy 漂离 ref，调大 beta 或减小 lr
- generation 比 SFT 差 → 数据有问题（chosen / rejected 弄反），或者 overfit（epoch 太多）

---

## Section 9: 限制与缺陷

### 9.1: BT 假设的脆弱性

DPO 假设 preference 满足 Bradley-Terry：deterministic + transitive + 仅依赖于一个 scalar reward。
真实 human preference 经常违反所有三条：

- **stochastic**：同一标注员在不同时间会给不同答案
- **non-transitive**：A > B, B > C, C > A 的偏好循环
- **multi-attribute**：helpfulness vs harmlessness 之间的取舍不能压扁到 scalar

后果：DPO 训出来的 policy 反映的是"BT 投影后的偏好"，不一定等于真实偏好。

### 9.2: offline data 的 distribution shift

DPO 在固定 dataset 上训，policy 训着训着会漂离 dataset 的分布。漂出去之后 dataset 没有 label
信号，policy 在那块区域的行为是"未约束"的——KL 项把它往 pi_ref 拉，但拉的方向可能跟人类偏好
正交。这是 DPO 比 PPO 在长训练后容易 degrade 的根本原因。

### 9.3: chosen 和 rejected 都很差

如果数据集里某些 (x, y_w, y_l) 的 y_w 和 y_l 都是糟糕回答，标注员只是在两个糟糕答案里选了
"稍好的"那个，DPO 仍然会推高 y_w 的 likelihood——它没办法区分"绝对好"和"相对好"。这导致 DPO
对数据质量极敏感。

### 9.4: 没有 absolute reward signal

DPO 训完后，你拿到的是 pi_theta，但你 *无法* 评估"模型生成的 y 有多好"——implicit reward 只在
比较两个 candidate 时有意义，单点 absolute score 没有定义（差一个 partition function Z(x)）。
这意味着你不能用 DPO model 来做 best-of-N rejection sampling 或 inference-time search。

### 9.5: 长度偏差

DPO 训完后的 generation 普遍变长（chosen response 在数据集里通常更长），有时候这种长是 padding
出来的废话。SimPO 的 length normalization 就是针对这个问题。

> 怀疑：DPO 论文标题 "Your Language Model is Secretly a Reward Model" 是 PR 级别的杀手 title，
> 但本质是个数学 reformulation（KL-constrained RL closed form + BT 代换 = BCE）。这种"标题党"
> 在 ML 论文里很常见，但 DPO 的科学价值是否被标题营销夸大？我的判断是：理论价值确实没被夸大
> （第一性原理推导很优雅，且引发了一系列衍生），但工程价值可能被夸大了——social media 上的
> 叙事变成了"DPO 完全替代 PPO"，而实际上 frontier lab（OpenAI / Anthropic / Google DeepMind）
> 的最先进模型仍然在用某种 PPO + RM 变种（或 PPO + DPO 混合 pipeline）。开源社区切到 DPO 是
> 因为预算和工程能力限制，不是因为 DPO 在所有 axis 上都赢。

---

## Section 10: 社区反响与生态

### 10.1: 开源 LLM 训练全面切到 DPO

2023 下半年开始，几乎所有头部开源 finetune 项目（Zephyr-7B, Mistral-Instruct, Tulu-2, Nous-Hermes,
OpenChat, Starling）都用 DPO 或其变种做对齐。Hugging Face TRL 库的 `DPOTrainer` 成了事实标准
入口。

### 10.2: 训练库生态

- **TRL (Hugging Face)**：最广泛使用，支持 DPO / IPO / KTO / SimPO / ORPO 等十几种 loss
- **OpenRLHF**：字节出品，专注 distributed RLHF + DPO 训练
- **Axolotl**：YAML 驱动的 finetune 框架，一个配置切 SFT/DPO/ORPO
- **LLaMA-Factory**：偏中文社区，集成度高

### 10.3: Frontier lab 的态度

- Anthropic：Claude 系列内部一直用某种 PPO + Constitutional AI 混合方法，DPO 主要用在 ablation
- OpenAI：GPT-4 时代仍主要用 PPO + RM + critic，DPO 只在某些 sub-task 用
- Google DeepMind：Gemini 用 reinforced self-training（ReST）+ DPO 混合
- Meta：Llama-3 post-training pipeline 含 SFT + RM + DPO + iterative rejection sampling

### 10.4: 教学资源

- Hugging Face 官方 DPO tutorial（带代码）
- Eric Mitchell 个人主页 + Stanford CS25 讲座录像
- Sebastian Raschka 的 DPO 系列博客（推导讲得最 friendly）

---

## Section 11: 学到 + 关联

### 学到（写给未来的自己）

- KL-constrained reward maximization 有 closed-form 解 `pi*(y|x) ∝ pi_ref(y|x) * exp(r(x,y)/beta)`，
  这是 DPO 全部数学的起点
- partition function Z(x) 在 Bradley-Terry preference 比较里抵消，是 DPO 能直接 BCE 的关键
- DPO loss = `-log sigma(beta * (log_ratio_winner - log_ratio_loser))`，30 行 PyTorch 写完
- 训练时 `pi_ref` 可以离线 cache logp，省一份 GPU memory
- 关键 hp 是 beta（典型 0.1），lr 比 SFT 小 10-100x（5e-7）
- DPO 是 offline 的——policy 漂出 ref 分布后没有 supervision，这是它和 PPO 的根本区别
- 衍生家族（IPO / KTO / SimPO / ORPO）每个都解决一个 DPO 限制；社区目前没有共识哪个最好
- 数据质量 > loss 公式：换数据集的收益经常远超换 loss 形式

### 关联

- [[ppo]] — DPO 替代的对象。PPO 用 actor-critic + on-policy rollout，DPO 用 offline pair + BCE
- [[dqn]] — 同属 RL 谱系，但 DQN 是 value-based + Q-learning，跟 DPO 是 policy-based + preference
  learning 的工程目的截然不同
- [[alphago]] — RL + 自对弈范式的代表；DPO 是 RL + 人类偏好范式的代表。两条路在 2023-2024 之后
  开始合并（self-play preference / RLAIF）
- [[muzero]] — model-based RL，DPO 是 model-free preference RL；两者用不同方式回避了"建立环境
  模型"的难度（MuZero 学 latent dynamics, DPO 直接绕过 reward model）
- [[gpt-3]] — DPO 的训练对象通常是 GPT-3 / Llama 这类 base LLM
- [[bert]] — BERT 是 encoder-only 预训练，DPO 是 decoder-only 后训练；两者代表 LLM 训练的两个
  关键阶段
- [[t5]] — T5 的 sequence-to-sequence 框架在某些 DPO 实现中作为 backbone
- [[attention]] — 所有现代 LLM（含 DPO 训练对象）的核心组件；DPO 不修改架构，只换 loss

---

## 附录 A: 与 PPO 的逐条对比表

| 维度 | RLHF + PPO | DPO |
|------|-----------|-----|
| 训练阶段 | 3（SFT + RM + PPO） | 2（SFT + DPO） |
| 同时载入模型数 | 4（actor / critic / ref / RM） | 2（policy / ref） |
| ref 是否可 freeze | 是 | 是 |
| ref logp 是否可缓存 | 否（rollout 不固定） | 是（preference 固定） |
| 数据类型 | on-policy rollout + RM score | offline paired preference |
| 主要 hp | clip ratio / KL coef / GAE lambda / value loss weight ... | beta |
| 训练稳定性 | 中（需要调） | 高（BCE 不发散） |
| 训练吞吐 | 低（rollout bottleneck） | 高（普通 SFT 级别） |
| 可继续探索新分布 | 是 | 否（受限于 dataset） |
| reward hacking 风险 | 高 | 低（无显式 RM）但有数据偏差 |
| 长训后 degrade 风险 | 中 | 高（offline shift） |

## 附录 B: DPO 的"30 行实现"

```python
import torch
import torch.nn.functional as F

def dpo_loss(pi_theta_logp_w, pi_theta_logp_l,
             pi_ref_logp_w, pi_ref_logp_l,
             beta=0.1):
    """
    pi_theta_logp_*: sum of log p(token) over response tokens, shape [B]
    pi_ref_logp_*  : same but from frozen reference, shape [B]
    """
    pi_logratio_w = pi_theta_logp_w - pi_ref_logp_w     # implicit reward (up to beta)
    pi_logratio_l = pi_theta_logp_l - pi_ref_logp_l
    logits = beta * (pi_logratio_w - pi_logratio_l)     # shape [B]
    loss = - F.logsigmoid(logits).mean()
    # diagnostics
    reward_acc = (logits > 0).float().mean()
    reward_margin = logits.mean()
    return loss, reward_acc, reward_margin
```

这就是全部核心。其余的复杂度都在数据 pipeline、forward pass 的 token mask、PEFT 集成、
distributed training 等工程层面。论文核心算法只有这 10 行。

---

## 附录 C: 一些常见误解

- **"DPO 不需要 KL 约束"** — 错。KL 约束以 `beta * log(pi/pi_ref)` 的形式藏在 loss 里，beta
  就是 KL 强度。
- **"DPO 不需要 reward model 所以更安全"** — 错。Reward signal 还在，只是从 RM 输出迁移到了
  人类标注员对 (chosen, rejected) 的判断里。如果标注员有 bias，DPO 同样会学到 bias。
- **"DPO 严格优于 PPO"** — 错。在数据是 on-policy / 需要长期探索 / 需要 absolute reward 的
  场景，PPO 仍然更合适。
- **"DPO 不能用 reward model"** — 错。可以用 RM 给 paired data 打分构造 (chosen, rejected)，
  这种"RM-as-labeler" 的 pipeline 在 Llama-3 / Tulu-3 都用了。

---

## 附录 D: 阅读路径建议

1. 第一遍：只读 Section 1 + Section 3（数学骨架）+ Algorithm 1，跑通 30 行实现
2. 第二遍：读 Section 6（实验）+ Section 9（限制），理解 DPO 的边界
3. 第三遍：读 Section 7（衍生家族）+ 自己挑 1-2 个变种（推荐 SimPO 和 KTO）做 ablation
4. 实战：在自己的小数据集（< 1k pair）上跑一遍 DPO + SFT 对比，观察 reward acc / reward margin
   / KL 三个指标的变化

> 怀疑：上面这套阅读路径假设你已经会 PyTorch + LLM finetune 基础。对零基础学习者来说，
> 真正的难点不是 DPO 数学（推导很短），而是搞懂"sequence logp 怎么算"、"为什么 prompt token
> 不算"、"为什么 ref logp 可以缓存"等一堆工程前置知识。这些前置知识的缺口才是 DPO 入门的
> 真实瓶颈，论文里完全没讲。
