---
title: "打破链式依赖：Lookahead Decoding (Jacobi) 零基础学习笔记"
来源: https://arxiv.org/abs/2402.02057
日期: 2026-06-13
分类_原始: 大语言模型
分类: 机器学习
子分类: ML 系统
provenance: pipeline-v3
---

# 打破链式依赖：Lookahead Decoding (Jacobi) 零基础学习笔记

## 1 一个日常类比：两个人抄课文

假设老师让你抄一段 100 个字的课文。

**传统方式（自回归解码）**：你先抄第 1 个字，抄完才能抄第 2 个字，再抄第 3 个字……一个字一个字来。即使你的右手（GPU 的并行计算单元）闲着，你也只能一个字一个字抄，因为你不确认第 2 个字写什么之前，第 3 个字根本不知道是什么。

**Lookahead Decoding 的方式**：现在来了一个帮手。你抄完第 1 个字后，帮手说："我猜接下来 5 个字是 ABCDE，你一边验证我猜的对不对，我一边接着猜下一组 5 个字。"

- 如果帮手猜对了 4 个，你直接把这 4 个抄上去，省了 4 步
- 如果猜错了第 3 个，你只抄前 2 个，第 3 个你自己重新写

关键：**帮手猜字的过程是并行的**——他不用等你确认第 1 个字对不对才猜第 2 个字。他同时猜 ABCDE 五个字，你用一个"验证步骤"全部验完。

## 2 要解决的问题：LLM 推理为什么慢

大语言模型（比如 GPT）生成文本时，是一步一步来的：

1. 输入提示词，模型输出第 1 个词
2. 把第 1 个词加回去，再输入模型，输出第 2 个词
3. 继续……

这叫 **自回归解码（autoregressive decoding）**。问题在于：

- 每次只生成 **1 个词**，但现代 GPU 能并行算 **成千上万个词**
- GPU 的大量并行计算单元在等待——这就像买了一辆法拉利，却只用来在小区里以 5km/h 的速度开车
- 瓶颈是 **显存带宽（memory bandwidth）**：读一次模型权重很慢，但你每次只产出一个词，效率极低

## 3 核心概念拆解

### 3.1 自回归解码 vs Jacobi 解码

在数值计算中，有两个经典方法解方程：

- **Gauss-Seidel**：算出一个值就用它去算下一个（ sequential，一步一步来）
- **Jacobi**：用上一轮的所有值同时算这一轮的所有值（parallel，大家一起算）

类比到 LLM 生成：

| | Gauss-Seidel（自回归）| Jacobi |
|---|---|---|
| 生成方式 | 一个一个来 | 一批一批来 |
| 并行性 | 低 | 高 |
| 准确性 | 100% | 原始 Jacobi 不保证 |

**Jacobi 解码** 的思路：用上一轮生成的所有 token 同时预测下一轮的所有 token。但它有一个致命问题——输出的概率分布和原模型不一致。

**Lookahead Decoding** 的创新：在 Jacobi 的基础上加了 **验证机制**，既保留了并行加速，又保证输出和原模型完全一致。

### 3.2 两个核心组件

Lookahead Decoding 有两个分支：

**1. 前瞻分支（Lookahead Branch）** — "猜字的人"

- 维护一个固定的 2D 窗口：时间轴（过去几步）+ 序列轴（未来几个位置）
- 参数 W = 前瞻窗口大小（一次猜多少个 token）
- 参数 N = 回看步数（利用过去几步的历史信息）
- 从这个窗口中提取多个 **n-gram**（连续 token 序列）
- 这些 n-gram 是 **互不重叠的**，可以并行验证

**2. 验证分支（Verification Branch）** — "检查答案的人"

- 从 n-gram 池中找出以当前最后一个 token 开头的候选 n-gram
- 用目标模型一次性验证所有这些 n-gram
- 验证通过的 n-gram 直接加入输出序列
- 验证不通过的，只保留匹配的部分，剩余的继续自回归生成

### 3.3 关键参数速查

| 参数 | 含义 | 典型值 |
|---|---|---|
| W | 前瞻窗口（lookahead window） | 5 |
| N | 回看步数（lookback steps） | 4 |
| G | 每个步骤的 n-gram 候选数 | = W |
| n | 每个 n-gram 的长度 | N |
| S | 压缩比（compression ratio） | 1.5 - 4.0 |

## 4 代码示例

### 示例 1：n-gram 提取过程

假设我们有以下历史生成记录（不同颜色代表不同时间步生成）：

```
时间步 t-3:  [猫, 喜欢, 晒太阳]
时间步 t-2:  [喜欢, 晒太阳, 很]
时间步 t-1:  [晒太阳, 很, 舒服]
时间步 t:    [?]
```

设 N = 4（回看 3 步 + 当前步），W = 5（前瞻 5 个位置）。

```python
def extract_ngrams(history_window, current_step, n=4):
    """
    从 2D 窗口中提取互不重叠的 n-gram
    
    history_window: 二维列表，每一行代表一个时间步生成的 tokens
    current_step:   当前时间步的输入 tokens
    n:              n-gram 的长度
    
    返回: 一组互不重叠的 n-gram 候选
    """
    ngrams = []
    
    # 从历史轨迹中提取 n-gram
    # 例如：用 t-3 的第 2 个 token + t-2 的第 3 个 token
    #           + t-1 的第 4 个 token + t 的新预测 token
    # 组成一个长度为 4 的 n-gram
    
    for i in range(len(history_window) - (n - 1)):
        ngram = []
        for j in range(n):
            row = i + j  # 沿着时间轴滑动
            col = j      # 沿着序列轴偏移
            if row < len(history_window):
                if col < len(history_window[row]):
                    ngram.append(history_window[row][col])
            else:
                # 当前步的 token 还未生成
                pass
        if len(ngram) >= 2:  # 至少需要 2 个已知的 token
            ngrams.append(ngram)
    
    return ngrams

# 模拟数据
history = [
    ["猫", "喜欢", "晒太阳"],   # t-3
    ["喜欢", "晒太阳", "很"],   # t-2
    ["晒太阳", "很", "舒服"],    # t-1
]

ngrams = extract_ngrams(history, current_step=[], n=4)
# 提取出的 n-gram 候选（部分）：
# ["猫", "喜欢", "晒太阳", ???]
# ["喜欢", "晒太阳", "很", ???]
# ["晒太阳", "很", "舒服", ???]
```

### 示例 2：完整解码循环（简化版）

```python
def lookahead_decode(model, prompt, W=5, N=4, max_steps=100):
    """
    Lookahead Decoding 的简化实现
    
    model:      目标 LLM
    prompt:     输入提示词
    W:          前瞻窗口大小
    N:          回看步数
    """
    output = list(prompt)        # 逐步积累的输出序列
    window = []                  # 2D 窗口：[时间步][序列位置]
    ngram_pool = []              # n-gram 池
    
    for step in range(max_steps):
        # ---- 第 1 步：前瞻分支（并行预测）----
        # 用当前窗口 + 历史轨迹，并行预测 W 个未来位置的 token
        new_tokens = model.parallel_predict(window, output[-N:])
        
        # 将新 token 加入窗口
        window.append(new_tokens)
        
        # 从窗口中提取 n-gram 候选
        candidate_ngrams = extract_ngrams(window, new_tokens, n=N)
        ngram_pool.extend(candidate_ngrams)
        
        # 限制窗口大小：移除最旧的 token
        if len(window) > N:
            window.pop(0)
        
        # ---- 第 2 步：验证分支（并行验证）----
        # 从池中找出以当前最后一个 token 开头的 n-gram
        last_token = output[-1]
        valid_candidates = [
            ng for ng in ngram_pool
            if ng and ng[0] == last_token
        ]
        
        if valid_candidates:
            # 一次性并行验证所有候选 n-gram
            accepted = model.verify_ngrams(valid_candidates, output)
            
            # 将验证通过的 n-gram 加入输出
            if accepted:
                output.extend(accepted)
                # 从池中移除已使用的 n-gram
                ngram_pool = [ng for ng in ngram_pool if ng not in accepted]
                continue
        
        # 如果没有可接受的 n-gram，退回一步式自回归生成
        next_token = model.generate(output)
        output.append(next_token)
    
    return output
```

### 示例 3：验证过程的数学直觉

```python
def verify_single_ngram(ngram, model, output):
    """
    验证单个 n-gram 是否正确
    
    原理：类比 speculative decoding 的验证方法
    把整个 n-gram 送给模型，一次性得到每个 token 的概率分布，
    然后检查模型输出的最大值是否等于我们"猜"的那个 token。
    
    例如 n-gram = ["很", "舒服", "的"]
    输入: [..., last_token, 很, 舒服, 的]
    模型输出: p(token|context) 对于 "很"、"舒服"、"的" 各一个分布
    
    如果每个分布的最大值 token 等于我们猜的 token → 接受
    否则，找到第一个不匹配的位置，拒绝后续的 token
    """
    # 构造完整的输入序列
    input_seq = output + ngram
    
    # 模型一次性输出每个位置的概率分布
    logprobs = model.forward_logprobs(input_seq)
    
    # 渐进式验证（progressive verification）
    accepted_len = 0
    for i in range(len(ngram)):
        predicted_token = logprobs[i + len(output)].argmax()  # 最可能的 token
        expected_token = ngram[i]
        
        if predicted_token == expected_token:
            accepted_len += 1
        else:
            # 第一个不匹配，停止验证
            break
    
    # 返回验证通过的 token 数
    return accepted_len


# 举例：
# output = ["猫", "喜欢"]
# ngram = ["晒太阳", "很", "舒服"]
#
# 模型验证后返回 accepted_len = 2
# 意味着前 2 个猜对了，第 3 个不对
# 输出变为: ["猫", "喜欢", "晒太阳", "很"]
# 第 3 个 token 需要模型重新生成
```

## 5 加速原理：为什么能提速

Lookahead Decoding 的核心思想是 **用每步更多的 FLOPs 换取更少的解码步数**。

```
传统自回归：  生成 100 个 token = 100 步 = 100 次模型前向传播
Lookahead：   生成 100 个 token = 约 30 步 = 30 次模型前向传播
              但每步的输入是 5 个 token 而不是 1 个
              每步计算量增加了 ~5 倍
              总计算量：30 x 5 = 150 步的计算量
```

**关键点**：虽然总计算量多了 1.5 倍，但瓶颈不是计算（FLOPs），而是显存带宽。GPU 每次读取模型权重到显存的开销是固定的，无论你一次处理 1 个 token 还是 5 个 token。所以：

- 100 次前向传播：100 次读取模型权重的开销
- 30 次前向传播：30 次读取模型权重的开销 → 省了 70% 的带宽开销
- **最终加速比 ≈ 1.5x - 4x**（取决于任务和模型大小）

论文实验数据：
- MT-Bench 对话任务：最高 1.8x 加速
- 代码补全任务：最高 4x 加速（代码中重复 token 多，n-gram 更容易匹配）
- 配合 FlashAttention：额外 20% 加速
- 多 GPU 强扩展：4x 加速

## 6 与 Speculative Decoding 的对比

| | Speculative Decoding | Lookahead Decoding |
|---|---|---|
| 需要草稿模型 | 是（需要训练一个小模型） | 否 |
| 草稿来源 | 草稿模型的输出 | 历史轨迹中的 n-gram |
| 并行性 | 有限（一条草稿链） | 高（多个互不重叠的 n-gram） |
| 通用性 | 受草稿模型限制 | 通用，无需额外模型 |
| 验证方式 | 逐个验证草稿 token | 批量验证多个 n-gram |

## 7 关键洞察：缩放定律

论文第 4 节提出了一个重要的缩放定律：

> **解码步数可以随着每步 log(FLOPs) 线性减少**

换句话说：如果你把每步的处理量（batch size W）从 1 增加到 10，解码步数大约会减少 log(10) ≈ 2.3 倍，而不是 10 倍。这是因为 n-gram 的接受率会随长度增加而下降，但 **你不需要担心遇到瓶颈上限**——这与 speculative decoding 不同，后者在草稿模型质量有限时会遇到加速天花板。

## 8 总结

Lookahead Decoding 的核心贡献只有三句话：

1. 利用 Jacobi 迭代的思想，用历史生成的轨迹提取多个互不重叠的 n-gram，并行预测未来的 token
2. 用一个验证分支一次性验证所有候选 n-gram，保证输出分布与原模型完全一致
3. 不需要任何额外的草稿模型或数据存储器，是一个即插即用的加速方法

它本质上做了一个权衡：**用更多的每步计算量换取更少的总步数**，恰好击中了 LLM 推理的瓶颈——显存带宽，而不是计算能力。

## 9 延伸阅读

- 论文代码：https://github.com/hao-ai-lab/LookaheadDecoding
- 相关方法：Speculative Decoding（LEAD 论文）、Jacobi Decoding（2023）
- FlashAttention：加速注意力计算的重要基础设施
