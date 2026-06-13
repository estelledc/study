---
title: ZAYA1-8B Technical Report
来源: https://arxiv.org/abs/2605.05365
日期: 2026-06-13
分类: 其他
子分类: llm
provenance: pipeline-v3
---

# ZAYA1-8B Technical Report — 零基础学习笔记

## 一、这是什么模型？

ZAYA1-8B 是 Zyphra 公司（总部位于旧金山）在 2026 年 5 月发布的一个推理专用大语言模型。它的名字含义是 "ZAYA1"（架构名）+"8B"（总参数量约 80 亿）。

核心数据一目了然：

| 指标 | 数值 |
|---|---|
| 总参数量 | 8.4B |
| 每次推理激活的参数 | 0.76B（不到 10 亿） |
| Transformer 层数 | 40 |
| 隐藏层维度 | 2048 |
| 每个 MoE 层的专家数 | 16 |
| 每次推理选择的专家数 | Top-1（只选 1 个） |
| 上下文长度 | 最长 131K tokens |
| Tokenizer | Gemma3，词表 262,272 |
| 训练硬件 | AMD MI300X GPU + Pollara 网络 |

### 什么叫 "总参数 8B，激活参数 0.7B"？

用一个日常类比来理解：

想象一家拥有 16 个医生的诊所（16 个专家）。诊所总共有 80 个医生座位（8B 总参数）。但每次来一个病人（一个 token），只有一位医生负责诊断（激活参数约 0.7B）。其余 15 位医生的资源在当下完全不被消耗。

这就是 **MoE（Mixture of Experts，混合专家）** 的核心思想：模型"知道"很多东西，但每次只"调用"其中一小部分来工作，从而用更少的计算量处理任务。

## 二、三大架构创新

ZAYA1-8B 在标准 Transformer MoE 基础上做了三个关键改动。

### 2.1 Compressed Convolutional Attention（CCA，压缩卷积注意力）

**类比**：传统注意力机制像是读一本 1000 页的书时，每读一页都要翻回全书所有页做比较（O(n²) 复杂度）。CCA 则像是先把全书压缩成一本 100 页的摘要，然后在摘要上做事后比较。

**做了什么**：
- 在压缩的潜空间中进行序列混合操作
- KV 缓存压缩了 8 倍，query 压缩了 2 倍
- 大幅减少预填充（prefill）的 FLOPs 和显存占用
- 对长上下文推理特别有利

### 2.2 ZAYA1 Router（智能路由）

传统 MoE 用一个简单的线性函数来决定每个 token 分配给哪个专家。ZAYA1 换成了一个更聪明的 **三层 MLP 路由**，并引入了 **EDA（指数深度平均）** 机制——把当前层的路由表示与上一层的路由表示混合，让路由决策更稳定。

**类比**：传统路由像是一个只看一个维度的裁判（"身高超过 180 就选 A 队"），ZAYA1 路由像是一个综合评估多个维度的教练（"身高、速度、经验加权打分"），分配更合理。

路由的数学公式如下：

```
r_l = W_down · x_l          # 降投影到 256 维
r_l = r_l + γ · r_{l-1}     # EDA：与上一层路由混合
s_l = softmax(MLP(RMSnorm(r_l)))  # 三层 MLP 输出专家权重
e_idx = top-1(s_l + b_l)    # 选得分最高的专家
```

其中 `b_l` 是负载均衡偏置项，使用 PID 控制器思想动态调整，防止某些专家被过度使用。

### 2.3 Residual Scaling（残差缩放）

在每个 Transformer 层前后加上可学习的缩放系数和偏置：

```
Res-scale(x) = α · x + β
x_{l+1} = Res-scale_res(x_l) + Res-scale_out(Layer(RMSnorm(x_l)))
```

**类比**：就像水管里的调压阀——控制每一层传递多少"信号能量"，防止信号在深层网络中要么越来越弱（梯度消失），要么越来越强（爆炸）。

这个改动只增加了极少的参数（4 × L × D），但显著控制了残差范数在深度方向上的增长。

## 三、训练流程：从零到推理专家

ZAYA1-8B 的训练分为三个阶段：预训练、中期训练、SFT + RL 后训练。

### 3.1 三阶段预训练

| 阶段 | 上下文长度 | Token 量 | 重点 |
|---|---|---|---|
| Base 预训练 Phase 1 | 4K | 8T | 通用网页、代码、数学、多语言 |
| Base 预训练 Phase 2 | 4K | 4T | 更多代码、数学、推理、指令数据 |
| 32K 中期训练 | 32K | 1.2T | 长 CoT 推理占 86.1% |
| SFT | 131K | 660B | 对话模板 + 推理 + 代码 |

### 3.2 关键创新：Answer-Preserving Trimming（答案保留裁剪）

**问题**：强模型生成的推理链（CoT）动辄超过 10K tokens，而预训练时上下文只有 4K。怎么办？

传统做法是直接从中间截断，但这会"砍掉"推理的结论部分，让模型学了一堆"没有结局的推理"。

ZAYA1 的做法是从推理链的**尾部**截断，保留开头（问题分析、策略探索）和结尾（最终答案），就像剪掉一个故事的冗长收尾，但保留开头和结局：

1. 如果完整样本能塞进上下文 → 保留
2. 如果不能 → 从最后一个推理块的尾部截断，保留开头和最终答案
3. 如果多轮对话还放不下 → 删掉前几轮的推理块，只保留答案
4. 如果光答案就放不下 → 丢弃这个样本

### 3.3 四阶段 RL 级联

SFT 之后是四个连续阶段的强化学习：

```
推理热身 (232 steps) → RLVE-Gym 课程 (400 steps) → 数学+代码+TTC 阶段1 (384) → 阶段2 (464) → 行为 RL (384)
```

每个阶段重点不同：
- **推理热身**：数学题和逻辑谜题，建立基础推理能力
- **RLVE-Gym**：400 个自适应难度的可验证环境，像"健身房的渐进增重"
- **数学+代码+TTC**：大量数学和代码 RL，使用测试时计算（TTC）轨迹
- **行为 RL**：最后才调教对话风格、指令遵循等"社交技能"

**关键设计**：推理 RL 被**前置**了——大部分 RL 算力花在可验证的数学、代码上，最后才用偏好reward调风格。这和很多先用 RLHF 调风格再练推理的做法相反。

## 四、Markovian RSA：推理时的"集体智慧"

这是 ZAYA1-8B 最有趣的技术贡献之一。

**RSA**（Recursive Self-Aggregation）的思想：让模型自己生成多个推理路径，然后聚合它们选出最好的。

**Markovian RSA** 的创新在于：不保留完整的推理历史，而是每一轮只携带一个固定长度的"推理尾巴"（4K tokens）进入下一轮。

**类比**：
- 传统 RSA：像辩论赛，每一轮都要回顾前面所有发言记录（越来越长）
- Markovian RSA：像接力赛，每棒选手只需要知道上一棒留下的"接力信息"（固定长度），不用回顾全场

```python
# Markovian RSA 推理流程伪代码

def markovian_rsa_inference(prompt, N=16, beta=512, C=4096, rounds=2):
    """
    N  = 每轮生成的候选推理路径数
    beta = 每轮解码的最大 token 数（推理尾巴长度）
    C  = 聚合阶段使用的上下文窗口大小
    rounds = 聚合轮数
    """
    # 第 1 轮：从零生成 N 条候选推理
    tails = []
    for i in range(N):
        tail = model.generate(prompt, max_new_tokens=beta)
        tails.append(tail)

    current_tail = ""
    for round in range(rounds):
        # 聚合：用当前推理尾巴 + 问题，生成改进后的答案
        aggregation_input = f"{prompt}\nReasoning: {current_tail}"
        improved = model.generate(
            aggregation_input,
            max_new_tokens=beta
        )
        current_tail = improved[-C:]  # 只保留最后 C tokens

    return current_tail
```

**效果**：在 AIME'25 数学竞赛上，单条推理 ZAYA1-8B 大约 60-70%，使用 Markovian RSA 后飙升到 91.9%。而且只携带 4K 的推理尾巴，效率极高。

## 五、强化学习核心技术细节

### 5.1 PipelineRL（异步流水线 RL）

rollout 生成和梯度更新在**不同的 GPU 池上异步运行**，互不等待：

```python
# 流水线 RL 的异步结构示意

GPU池A (Rollout):  采样 → 验证 → 收集奖励 → 放入缓冲区
GPU池B (Trainer):  从缓冲区取数据 → 计算梯度 → 更新模型

# 两个池子独立运行， Trainer 每 2 次迭代同步一次策略权重
```

### 5.2 损失聚合：Dr-GRPO SMTSN

标准 GRPO 在 token 级别平均损失，这会隐含地偏好长回答（因为答案正确时，长回答的 token 越多，平均损失越低）。SMTSN 改为：先把每个 rollout 的 token 损失求和，再在所有 rollout 之间平均。

```python
# 标准 GRPO 的损失（有长度偏差）
loss_std = sum(token_losses) / num_tokens  # token 平均 → 偏好长回答

# Dr-GRPO SMTSN 的损失（无长度偏差）
loss_smtsn = sum(token_losses) / num_rollouts  # rollout 平均 → 无偏差
```

### 5.3 MaxRL 优势估计

```
Â_i = (r_i - r̄) / r̄
```

其中 `r_i` 是第 i 条 rollout 的奖励（0 或 1），`r̄` 是这一组 rollout 的平均奖励。用均值归一化而非标准差，对困难题目产生更强的梯度信号。

## 六、关键实验结果

### 6.1 与 DeepSeek-R1 对比（不到 1B 激活参数 vs 更大模型）

| 数据集 | ZAYA1-8B | DeepSeek-R1-0528 |
|---|---|---|
| AIME'25 | 匹配或超越 | 基准 |
| HMMT'25 | 匹配或超越 | 基准 |
| LCB-v6 | 匹配或超越 | 基准 |

### 6.2 Markovian RSA 加持后的成绩

在 TTC（测试时计算）评估中，使用 40K/4K 配置的 Markovian RSA：

| 数据集 | ZAYA1-8B + Markovian RSA |
|---|---|
| AIME'25 | **91.9%** |
| HMMT'25 | **89.6%** |

这个成绩已经接近 Gemini-2.5 Pro、DeepSeek-V3.2、GPT-5-High 等大得多的模型。

## 七、一句话总结

ZAYA1-8B 证明了：**用不到 10 亿激活参数，配合精心设计的 MoE 架构、推理感知的全阶段训练、四阶段 RL 级联、以及 Markovian RSA 推理时聚合，数学推理能力可以匹敌甚至超越大得多的开源推理模型**。

关键启示不是"模型越大越好"，而是"架构、训练、RL、推理时计算这四个组件需要协同设计"。

## 八、延伸思考

1. **为什么推理数据要从预训练阶段就开始加入？** 论文引用了 "Front-Loading Reasoning" 的研究，表明推理数据如果在 SFT 之后才加入，有些能力是后训练无法恢复的。
2. **为什么 RL 中不用 KL 正则化？** 论文在行为底线部分提到，PipelineRL 下 KL 惩罚在 reward 中会导致长度偏差。
3. **Top-1 路由 vs Top-2 路由：** 论文发现 ZAYA1 路由器的表达力已经足够强，不需要 top-k 选择多个专家，top-1 反而更稳定。
