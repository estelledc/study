---
title: H2O — 让大模型写长文时显存不爆炸
来源: https://arxiv.org/abs/2306.14048
日期: 2026-06-13
分类: 机器学习
子分类: ML 系统
provenance: pipeline-v3
---

## 是什么

H2O（Heavy-Hitter Oracle）是 2023 年 UT Austin、Stanford、Meta 等 12 位作者合作提出的一种**KV Cache 淘汰策略**，目的是让大语言模型在生成长文本时，GPU 显存占用大幅下降，同时输出质量几乎不损失。

日常类比：想象你在读一本 1000 页的小说，每翻到新的一页都要回顾之前所有章节来理解上下文。你的大脑不可能把 1000 页内容全"存在工作记忆"里——但奇怪的是，你确实能理解并续讲故事。为什么？因为你记住的并不是"每一页都一样重要"，而是记住了几个**关键角色**（Heavy Hitter）和**最近几页**的内容。H2O 的核心发现就是：LLM 做注意力计算时，也是只"在乎"少数几个 token，其他 95% 以上的 token 对当前决策几乎没贡献。

## 为什么重要

不理解 H2O，下面这些事都没法解释：

- 为什么 OPT-30B 在长文本生成时显存会爆（一个 batch=128、seq_len=1024 就占 180GB KV Cache）
- 为什么简单地把 KV Cache 截断到很小会导致模型"忘记"前面内容
- 为什么后来 StreamingLLM、SnapKV、XPay 等方法都在回应 H2O 提出的同一个问题
- H2O 能在 batch 不变的情况下把吞吐提升 29 倍——这对任何部署 LLM 的人都是刚需

## 核心概念

### 1. KV Cache 是什么

Transformer 每次生成一个新 token 时，都要把之前所有 token 的 key 和 value 缓存起来，避免重复计算。这个缓存就是 KV Cache。它的大小 = 层数 × 隐藏维度 × 序列长度 × batch 大小。对于大模型，这部分可以比模型参数还大。

### 2. 注意力矩阵的稀疏性

论文的第一项观察：虽然 LLM 是密集训练的，但在推理时，**注意力矩阵超过 95% 的值接近零**。也就是说，生成下一个词时，模型真正"看到"的只是之前 5% 的 token。

这意味着：如果把 KV Cache 缩小到原来的 20%，理论上不会丢精度。

### 3. Heavy Hitter（H2）

这是论文最关键的概念。论文发现：所有 token 的累积注意力分数服从**幂律分布**——少数几个 token 占据了绝大部分注意力权重。这些 token 叫 Heavy Hitter。

怎么找 H2？很简单：对每个 token，把它在所有注意力头、所有层中的注意力分数加起来，分数最高的前 20% 就是 H2。

H2 的有趣性质：
- H2 和文本中**高频共现的词**高度相关（比如"the"、"of"、"and"这类词在长文本中反复出现）
- 如果把 H2 从 KV Cache 中完全移除，模型性能**断崖式下跌**
- 保留 H2 + 最近若干个 token（Local tokens），就能用很小的缓存维持高质量生成

### 4. 淘汰策略：H2O 怎么做

每个解码步骤，H2O 做一个简单的操作：

1. 计算当前所有在缓存中 token 的注意力分数
2. 把分数最高的前 20% 标记为 H2（必须保留）
3. 加上新来的 token
4. 从非 H2 的 token 中踢掉最旧的一个（LRU）
5. 缓存大小保持不变

这个策略被称为"贪婪算法"，因为每一步都只看当前局部信息，不做全局搜索。论文还证明了在注意力函数满足次模性（submodular）假设下，这个贪婪策略有理论保证。

## 代码示例

### 示例 1：H2O 淘汰策略的伪代码实现

```python
def h2_eviction_policy(Q, K, V, cache_S, k_budget, h2_ratio=0.2):
    """
    Q: 当前查询向量 [1, d]
    K: 缓存中的 key [m, d]，m 为缓存大小
    V: 缓存中的 value [m, d]
    cache_S: 缓存中 token 的索引列表
    k_budget: 最大缓存容量
    h2_ratio: Heavy Hitter 占比（论文中用 0.2）
    """

    # 第一步：计算当前 token 对所有缓存 token 的注意力分数
    # 形状: [1, m]
    attention_scores = Q @ K.T

    # 归一化（softmax）
    attention_scores = torch.softmax(attention_scores, dim=-1)

    # 第二步：找 Heavy Hitter——注意力分数最高的前 h2_ratio 个 token
    h2_count = int(k_budget * h2_ratio)
    _, h2_indices = torch.topk(attention_scores[0], k=h2_count)
    h2_set = set(h2_indices.tolist())

    # 第三步：加入新 token
    new_cache = cache_S + [len(cache_S)]  # 新 token 的索引

    # 第四步：如果超出预算，淘汰非 H2 中最旧的那个
    if len(new_cache) > k_budget:
        # 找到非 H2 集合中索引最小的（最旧的）
        non_h2 = [i for i in new_cache if i not in h2_set]
        evict_index = non_h2[0]
        # 从缓存中移除
        new_cache.remove(evict_index)

    return new_cache, h2_set
```

这段代码展示了 H2O 淘汰策略的完整流程。关键点在于：每一步都先算注意力分数，锁定"必须保留"的 H2，然后只允许淘汰非 H2 的旧 token。

### 示例 2：和全缓存策略的对比

```python
def full_attention(Q, K_full, V_full):
    """标准注意力：使用全部 KV Cache"""
    # Q: [1, d], K_full: [n, d], V_full: [n, d]
    scores = Q @ K_full.T                        # [1, n]
    weights = torch.softmax(scores, dim=-1)      # [1, n]
    output = weights @ V_full                     # [1, d]
    return output

def h2_attention(Q, K_cached, V_cached, h2_mask):
    """H2O 注意力：只使用缓存中的 H2 + Local token"""
    # K_cached: [m, d]，m << n，只包含 H2 和最近 token
    # h2_mask: [m]，标记哪些是 Heavy Hitter
    scores = Q @ K_cached.T                       # [1, m]
    weights = torch.softmax(scores, dim=-1)       # [1, m]
    output = weights @ V_cached                    # [1, d]
    return output

# 假设 seq_len = 10000，缓存只保留 20%
seq_len = 10000
cache_size = int(seq_len * 0.2)  # 2000

# 全缓存：计算 n 个 key-value 对的注意力
# 内存: O(n × d)，n=10000 时非常大

# H2O 缓存：只计算 cache_size 个 key-value 对的注意力
# 内存: O(cache_size × d)，减少 5 倍
# 注意力矩阵从 [1, 10000] 变成 [1, 2000]
```

对比展示了标准注意力计算和 H2O 注意力计算的差异。核心变化是 K 和 V 的维度从 `n`（全部 token）缩小到 `m`（缓存 token），从而节省显存。

### 示例 3：用 H2O 包装 FlexGen 推理

```python
from flexgen import FlexGen
from h2o_cache import H2OCacheManager

# 配置一个带 H2O 缓存的 FlexGen 推理引擎
engine = FlexGen(
    model_path="facebook/opt-6.7b",
    device="cuda",
    cache_policy="h2o",          # 启用 H2O 淘汰策略
    cache_budget_ratio=0.2,       # 保留 20% token 的 KV
    h2_ratio=0.2,                 # 其中 20% 是 Heavy Hitter
    overlap=True,
    sep_io=False,
)

# 推理时自动生成文本，KV Cache 会自动管理
result = engine.generate(
    prompt="Once upon a time,",
    max_new_tokens=512,
    do_sample=True,
    temperature=0.7,
)
print(result)
# 输出: "Once upon a time, there was a young programmer who..."
```

这是论文中 H2O 的实际系统集成方式——作为 FlexGen 推理引擎的一个插件式策略。用户只需设置 `cache_policy="h2o"` 和 `cache_budget_ratio`，框架自动处理淘汰逻辑。

## 为什么 H2 和共现词相关

论文做了一个有趣的现象级分析：统计语料中每个词的出现频率，再统计这些词在注意力中的累积分数，两者高度相关。直觉是：

- "the"、"is"、"the" 这种词在训练中反复出现，模型学会了它们的表示
- 当生成新 token 时，这些高频词依然是上下文的重要锚点
- 所以模型自然会"回头看"这些词，给它们更高的注意力分数

这解释了为什么 H2 不是随机的——它们是语言本身的结构特性决定的。

## 理论保证

论文把淘汰策略形式化为一个**动态次模最大化问题**（dynamic submodular maximization）。次模性（submodularity）的核心直觉是"边际收益递减"：第一个加入缓存的 token 贡献最大，第二个次之，第三个更小……这个性质让贪婪算法（每一步选当前最好的）在理论上是有保证的——能达到最优解的 (1 - 1/e) ≈ 63%。

## 性能数据

论文在 OPT-6.7B 和 OPT-30B 上的实验结果：

- 吞吐对比：比 DeepSpeed Zero-Inference 高 **29 倍**，比 Hugging Face Accelerate 高 **29 倍**，比 FlexGen 高 **3 倍**
- 延迟对比：同 batch 下延迟降低 **1.9 倍**
- 精度：在 lm-eval-harness 的多种任务上，使用 20% 缓存时性能几乎不掉

## 踩过的坑

1. **h2_ratio 不能太大也不能太小**：论文用 0.2（20%）效果最好。太小则丢失重要 token，太大则缓存不够紧凑。实际部署需要根据模型大小微调。

2. **Local + H2 缺一不可**：只保留 H2 或只保留最近 token 都会掉点。H2 处理"全局重要"，Local 处理"近期相关"，两者互补。

3. **不同模型的 H2 分布不同**：OPT 和 LLaMA 的 H2 高度重叠，但 GPT-NeoX 的分布略有不同。不是所有模型都用 20% 这个值最优。

4. **只在生成阶段生效**：H2O 优化的是 token generation phase 的 KV Cache，prompt 阶段仍然需要完整计算。所以加速比取决于 prompt 和生成文本的长度比例。

5. **和量化是正交的**：H2O 减少的是缓存大小，不是精度。可以和 SmoothQuant、AWQ 等量化方法叠加使用，进一步压缩。

## 历史小故事（可跳过）

- **2023.06**：H2O 论文首次发布到 arXiv（2306.14048）
- **2023.12**：v3 版本修订，补充了更多理论和实验
- **2023–2024**：后续工作如 StreamingLLM（2023）、SnapKV（2024）、XPay（2024）都在 H2O 的基础上做改进，分别解决了"位置编码漂移"、"动态选择 H2"、"用投影压缩"等问题
- H2O 是 KV Cache 压缩领域的奠基性工作之一——它证明了"不是所有 token 都重要"这个直觉可以变成有理论保证的算法

## 学到什么

1. **注意力本质是稀疏的**——即使模型是密集训练的，推理时的注意力分布天然集中，这是 H2O 的底层物理
2. **H2 不是人为设计的**——它是数据共现结构在模型权重中的自然涌现，所以跨模型有迁移性
3. **贪婪算法有时就够了**——在次模性假设下，局部最优每一步累积起来接近全局最优，不需要复杂的全局搜索
4. **缓存淘汰在 LLM 里有新玩法**——传统 LRU/LFU 只看访问频率，H2O 看注意力分数，这是质的区别
5. **理论 + 实验双轮驱动**——论文先做大量实验发现现象，再倒推次模性理论保证，这个流程值得学
6. **工程集成要轻量**——H2O 作为 FlexGen 的插件即可运行，不需要改模型架构或重新训练

## 延伸阅读

- 论文 PDF：[H2O arXiv 2306.14048](https://arxiv.org/abs/2306.14048)
- 官方实现：[FMInference/H2O](https://github.com/FMInference/H2O)
- [[streamingllm-2023]] —— 解决位置编码在 H2O 场景下的漂移问题
- [[snapkv-2024]] —— 用 KV 投影做 H2 选择，更高效的近似
- [[smoothquant-2023]] —— KV Cache 大小压缩 + 权重精度压缩，正交可叠加
- [[paged-attention]] —— vLLM 的显存管理方案，和 H2O 互补

## 关联

- [[streamingllm-2023]] —— 同一问题不同思路，关注长窗口生成
- [[megatron-lm]] —— 大模型训练框架，H2O 优化其推理阶段
- [[flexgen]] —— H2O 的实验基座系统
- [[paged-attention]] —— 另一种 KV Cache 管理方案，角度不同
