---
title: "SDPO: Segment-Level Direct Preference Optimization for Social Agents"
来源: https://arxiv.org/abs/2501.01821
日期: 2026-06-13
分类_原始: AI/ML
分类: 其他
子分类: 对齐
provenance: pipeline-v3
---

# SDPO 零基础学习笔记

## 一句话概括

SDPO 是一种训练 AI 社交代理的新方法，让它像人类一样在**多轮对话中做出更好的社交决策**——比如谈判、合作、竞争。它找出了对话中"犯错的片段"，用正面对照来修正模型。

## 日常类比：学车教练

想象你在学开车。教练坐在副驾驶观察你的每一脚油门、每一次打方向盘。

- **Turn-level DPO（逐轮）**：教练只盯着你压到路边石的那一次打方向，然后说"那次打错了"。但开车是一连串操作，只纠正一次打方向，你下次可能还是不会。
- **Session-level DPO（整场）**：教练看完你一整场练习，说"你整场开得不好"，然后从头让你重来一整遍。问题是，可能中间有七八次操作是对的，教练全当成"错"的来处理了——这就是**噪声**。
- **SDPO（片段级）**：教练找到你第一次失误的那个片段（比如"倒车入库"这段连续的三四个操作），再让你看一遍"正确做法是怎么倒的"。只对比这两个片段。不多不少，刚刚好。

SDPO 的核心思想就是"精准定位错误片段，只做片段级的对比学习"。

## 背景知识：为什么需要 DPO？

先理解 DPO（Direct Preference Optimization）。它是从 RLHF（Reinforcement Learning from Human Feedback）简化来的。

> RLHF 需要训练一个"奖励模型"，再拿强化学习去优化——步骤繁琐、训练不稳定。
> DPO 发现：其实可以直接从"偏好数据"（人类更喜欢 A 回复还是 B 回复）训练模型，不需要显式训练奖励模型。

标准 DPO 处理的是**单次回复**——你问我"今天天气怎样"，模型生成两个不同的回答，DPO 让它更喜欢更好的那个。

但社交对话不一样。你在跟人谈判"借一笔钱"，第一句说"你好"、第二句说"我最近遇到点困难"、第三句说"能不能借我五百块"——这三句话是一个整体。单看哪一句都无所谓好坏，**合在一起**才能判断是成功还是失败。这就是标准 DPO 不够用的原因。

## 三种粒度对比

| 方法 | 粒度 | 优点 | 缺点 |
|------|------|------|------|
| DPO（turn-level） | 单轮对话 | 简单直接 | 看不到全局，孤立地看每一轮 |
| ETO / DMPO（session-level） | 整场对话 | 全局视角 | 包含大量"对的轮次"也被当作噪声 |
| **SDPO（segment-level）** | **关键片段** | 精准、灵活 | 需要找到正确的片段 |

**关键洞察**：DPO 是 SDPO 的特例（片段长度=1），ETO 也是 SDPO 的特例（片段长度=整场对话）。SDPO 是**通用框架**。

## SDPO 怎么工作？三步走

### 第一步：行为克隆（Behavioral Cloning）

先用 GPT-4-turbo 在 SOTOPIA 模拟环境中自动生成"专家级对话"（让两个 GPT 互相聊），然后用这些数据微调一个开源模型（如 Llama-3.1-8B）。这个微调后的模型就是初始社交代理。

### 第二步：构建偏好数据

这是 SDPO 最核心的部分，分三个子步骤：

**1. 错误定位（Error Location）**
- 对每一场得分低的对话（goal 维度 < 7），用 GPT-4o 找出"是哪一轮导致失败的"
- 判断标准：这一轮是关键决策，但仍然可以做得更好

**2. 正面对话采样（Positive Session Sampling）**
- 从出错的那一轮**之前**的对话历史出发，让模型重新生成 5 次完整对话
- 选出得分最高的那一场作为"正面对照"

**3. 片段选择（Segment Selection）**
- 把正面对话和原始失败对话都给 GPT-4o
- 让它指出："正面对话中，是哪一段话让结果变好的？"
- 从失败对话中截取**相同长度**的对应片段

这样我们就得到了一对片段：正面对话中的"好片段"和失败对话中的"坏片段"。

### 第三步：SDPO 损失函数

SDPO 的数学公式看起来复杂，但它的结构跟标准 DPO 很像：

```
L_SDPO = - E [ log( sigma( sum_t β * log(π_θ(y_t^w|h_t^w) / π_ref(y_t^w|h_t^w))
                              - sum_t β * log(π_θ(y_t^l|h_t^l) / π_ref(y_t^l|h_t^l)) ) ) ]
```

别被公式吓到。对比一下标准 DPO 你就明白了：

**标准 DPO（单次回复）：**
```
L_DPO = - log( sigma( β * log(π_θ(y_w|x) / π_ref(y_w|x))
                     - β * log(π_θ(y_l|x) / π_ref(y_l|x)) ) )
```

**SDPO（多轮片段，e 到 e+k 轮）：**
```
L_SDPO = - log( sigma( Σ_{t=e}^{e+k} β * [ log(π_θ(y_t^w|h_t^w) / π_ref(y_t^w|h_t^w))
                                          - log(π_θ(y_t^l|h_t^l) / π_ref(y_t^l|h_t^l)) ] ) )
```

区别在哪？

- DPO 只比较**一个** y_w 和 y_l（一轮的两个回复）
- SDPO 在**一段连续的轮次**上累加差异（从 e 到 e+k，共 k+1 轮）
- 因为正负片段的**长度相同**，之前 DMPO 需要的"长度归一化"在这里不需要了——公式更简洁

## 代码示例

### 示例 1：SDPO 数据构造流程

假设一场"向朋友借钱"的对话（简化版）：

```python
# 模拟一场失败的对话（negative session）
negative_session = [
    {"role": "agent",    "content": "嗨，小明！"},                      # 第1轮：闲聊，没问题
    {"role": "other",    "content": "嗨！最近怎么样？"},
    {"role": "agent",    "content": "还行。对了，我最近手头紧。"},       # 第3轮：开始切入主题
    {"role": "other",    "content": "啊，怎么了？"},
    {"role": "agent",    "content": "能借我五千块吗？我下周还。"},       # 第5轮：❌ 太直接，没铺垫
    {"role": "other",    "content": "呃...不太方便呢。"},
    {"role": "agent",    "content": "好吧。"},                           # 第7轮：放弃，失败
]

# SDPO 的处理流程：
# Step 1: 错误定位 → 第5轮"能借我五千块吗？我下周还"太突兀

# Step 2: 从第5轮之前重新开始采样正面对话
positive_session = [
    {"role": "agent",    "content": "嗨，小明！"},
    {"role": "other",    "content": "嗨！最近怎么样？"},
    {"role": "agent",    "content": "还行。对了，我最近遇到点困难。"},
    {"role": "other",    "content": "啊，怎么了？"},
    # ---- 从这里开始对比（segment） ----
    {"role": "agent",    "content": "最近投资亏了钱，能借我五千块吗？"},  # ✅ 解释了原因，更礼貌
    {"role": "other",    "content": "哎呀，抱歉听到这个。好，我转你。"},
    # ---- 到这里结束（segment） ----
    {"role": "agent",    "content": "太感谢了！下周五一定还你！"},
]

# Step 3: 提取片段进行对比学习
positive_segment = positive_session[4:6]   # 第5-6轮
negative_segment = negative_session[4:6]   # 对应第5-6轮

# 模型学到：在同样的上下文中，positive_segment 的表达方式更好
```

### 示例 2：伪代码 —— SDPO 训练循环

```python
import torch
import torch.nn as nn
import torch.nn.functional as F

def sdpo_loss(policy_model, reference_model, positive_segment,
              negative_segment, temperature=0.1):
    """
    计算 SDPO 损失函数。
    
    参数:
        policy_model:         正在训练的模型 π_θ（want 更好）
        reference_model:      参考模型 π_ref（初始化的基线模型）
        positive_segment:     正面对话片段 [y_e^w, y_{e+1}^w, ..., y_{e+k}^w]
        negative_segment:     负面对话片段 [y_e^l, y_{e+1}^l, ..., y_{e+k}^l]
        temperature:          温度参数，相当于论文中的 β 的倒数
    
    返回:
        标量损失值
    """
    beta = 1.0 / temperature
    
    log_ratio_w = []  # 正面对话中每轮的 log 比率
    log_ratio_l = []  # 负面对话中每轮的 log 比率
    
    for t, (y_w, y_l) in enumerate(zip(positive_segment, negative_segment)):
        # 计算该轮对话的历史 h_t（之前所有轮次的对话）
        h_t_w = build_history(positive_segment[:t])
        h_t_l = build_history(negative_segment[:t])
        
        # log(π_θ(y|h) / π_ref(y|h)) —— 训练模型相对于参考模型的"偏好变化"
        log_ratio_w_t = (policy_model.log_prob(y_w, h_t_w)
                        - reference_model.log_prob(y_w, h_t_w))
        log_ratio_l_t = (policy_model.log_prob(y_l, h_t_l)
                        - reference_model.log_prob(y_l, h_t_l))
        
        log_ratio_w.append(log_ratio_w_t)
        log_ratio_l.append(log_ratio_l_t)
    
    # 在片段的所有轮次上累加
    total_log_ratio_w = sum(log_ratio_w)
    total_log_ratio_l = sum(log_ratio_l)
    
    # SDPO 损失 = -log(sigmoid(beta * (总正向比率 - 总负向比率)))
    # 目标是让总正向比率 > 总负向比率
    loss = -F.logsigmoid(beta * (total_log_ratio_w - total_log_ratio_l))
    
    return loss
```

## 实验结果：SDPO 真的有效吗？

在 SOTOPIA 基准测试中，SDPO 微调后的 Llama-3.1-8B 模型，**在所有对比方式下都超过了 GPT-4o 原始版本**。

| 模型 | 自评目标分 | 与 GPT-4o 交互目标分 | 与 GPT-4o-mini 交互目标分 | 平均 |
|------|-----------|---------------------|-------------------------|------|
| Llama-8B + BC | 7.81 | 7.53 | 7.18 | 5.16 |
| Llama-8B + BC + DPO | 7.95 | 7.80 | 7.32 | — |
| Llama-8B + BC + **SDPO** | **8.15** | **7.98** | **7.65** | **5.69** |
| GPT-4o | 7.90 | 7.90 | 7.47 | 5.17 |

SDPO 不仅超过了 DPO，还超过了 GPT-4o。而且只用 8B 参数量的开源模型。

## SDPO 的两个核心优势

1. **减少噪声**：只在出错的那段对话上做对比学习，不会把"本来就对的那些轮次"也算成错误。
2. **缩小搜索空间**：从出错轮次之前的历史出发重新采样，对话对手的行为空间更小，更容易找到真正的"正向样本"，避免高分数是对方配合导致的假象。

## 更广泛的含义

SDPO 不只能用在社交对话上。任何**多轮交互**场景都可以用——比如多轮代码调试、多轮医疗问诊、多轮教学辅导。只要你需要在一段连续的对话中做出决策，SDPO 就是一个灵活的训练框架。

> 片段长度 = 1 → 退化为标准 DPO
> 片段长度 = 整场 → 退化为 ETO / DMPO
> 片段长度 = 可调 → 根据数据自动选择最优粒度

## 思考题

这篇文章提出了一个"粒度可调整"的方法。你觉得在什么样的场景下，片段长度应该设得短一些（接近1轮）？什么样的场景应该设得长一些（多轮甚至整场）？欢迎思考后和我讨论。
