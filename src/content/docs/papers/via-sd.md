---
title: VIA-SD: Verification via Intra-Model Routing for Speculative Decoding
来源: https://arxiv.org/abs/2606.12243
日期: 2026-06-13
分类: 机器学习
子分类: 推理加速
provenance: pipeline-v3
---

# VIA-SD：用"内部路由"让推测解码少出错

## 一、从日常类比开始

想象你在校对一篇长文章。传统的做法是这样的：

1. 一个实习生（草稿模型）快速写出整段文字
2. 你（大模型验证者）逐字检查，发现一个错字就**全部推倒重来**

但 VIA-SD 说：等一下。实习生写的错字里，有些只是"稍微不对"——比如同义词替换，并不是完全错误。如果让一个**经验丰富但速度适中的副手**（瘦验证者）来处理这些中等难度的问题，你就能省下不少力气，不用每次都亲自上阵。

VIA-SD 的核心思想就是：**不是所有拒绝的 token 都该被一刀切地全量重算**。它把验证过程分成了三层，像医院的分诊台一样，根据每个 token 的"严重程度"分配到不同层级的"医生"去处理。

## 二、背景：什么是推测解码（Speculative Decoding）

要理解 VIA-SD，先理解它要解决的问题。

大语言模型（LLM）生成文本时是一个字一个字"串行"输出的——第 N 个字必须等第 N-1 个字生成完才能开始。这让推理速度很慢。

推测解码的思路是：用一个**小模型（drafter）**先快速写出多个候选词，然后用**大模型（verifier）**并行验证这些词是否正确。正确的直接采纳，错误的才重新计算。这就像"小快跑，大把关"。

但传统方法只有两种结果：**全部接受**或**全部拒绝**。VIA-SD 发现，很多被"全部拒绝"的 token 其实并不差——它们只需要稍微调整，大模型的全量计算根本不需要。

## 三、核心概念：三层分级验证

VIA-SD 把每个候选 token 根据"置信度"分到三个层级：

| 层级 | 处理对象 | 谁来验证 | 效果 |
|------|---------|---------|------|
| L1：直接接受 | 高置信度 token | 不做任何验证 | 最快，跳过验证 |
| L2：瘦验证者再生成 | 中等置信度 token | 从大模型中提取的"瘦子模型"（slim-verifier） | 省资源，避免大模型全量计算 |
| L3：大模型验证 | 低置信度 / 不确定 token | 完整大模型 | 最可靠，但只在必要时使用 |

这里的"内部路由"（Intra-Model Routing）指的是：**瘦验证者不是另一个独立的模型，而是从大模型本身通过内部路由技术"切出来"的子模型**。它共享大模型的大部分参数，但在推理时走不同的计算路径，因此资源开销小得多。

## 四、代码示例：三层路由的工作流程

### 示例 1：概念性伪代码

下面用一个简化的伪代码展示 VIA-SD 的核心逻辑。注意它不是真实可用的代码，而是帮助理解架构：

```python
def via_sd_decoding(large_model, slim_verifier, draft_model, prompt, max_tokens=50):
    """VIA-SD 解码流程：三层分级验证"""
    output = []
    context = prompt

    for step in range(max_tokens):
        # 第一步：草稿模型生成 K 个候选 token
        candidates = draft_model.generate(context, k=8)

        # 第二步：对每个候选 token 评估置信度
        tiers = {"high": [], "medium": [], "low": []}
        for token, confidence in candidates:
            if confidence > 0.95:
                tiers["high"].append(token)          # L1：直接接受
            elif confidence > 0.60:
                tiers["medium"].append(token)        # L2：走瘦验证者
            else:
                tiers["low"].append(token)           # L3：走大模型

        # 第三步：分层处理
        accepted_tokens = []

        # L1 直接追加
        accepted_tokens.extend(tiers["high"])

        # L2 用瘦验证者检查并再生成
        for token in tiers["medium"]:
            regenerated = slim_verifier.regenerate(token, context)
            accepted_tokens.append(regenerated)

        # L3 用大模型全量验证
        for token in tiers["low"]:
            verified = large_model.verify(token, context)
            if verified.is_correct:
                accepted_tokens.append(token)
            else:
                full_output = large_model.generate_from(context)
                accepted_tokens.append(full_output)

        # 第四步：拼接结果，进入下一轮
        context = context + " ".join(accepted_tokens)
        output.extend(accepted_tokens)

    return " ".join(output)
```

### 示例 2：内部路由的具体实现思路

"内部路由"是这个方法的灵魂。想象一个 Transformer 模型，它的每个注意力头（attention head）对不同类型的内容有不同的专长。VIA-SD 通过路由机制，让某些 token 走"短路径"：

```python
class RoutedSlimVerifier:
    """
    从大模型中提取的瘦验证者
    通过路由表决定每个 token 走全路径还是短路径
    """

    def __init__(self, full_model, routing_threshold=0.8):
        self.full_model = full_model
        self.routing_threshold = routing_threshold
        # 路由表：记录哪些层的哪些子模块可以"短路"
        self.routing_table = self._build_routing_table()

    def _build_routing_table(self):
        """
        分析大模型各层的激活模式，
        找出哪些层在验证中等置信度 token 时
        可以安全地跳过，而不影响准确率。
        """
        table = {}
        for layer_name, layer in self.full_model.layers.items():
            # 通过少量样本测试：跳过该层 vs 完整前向传播
            # 的误差是否在可接受范围内
            skip_impact = self._measure_skip_impact(layer)
            table[layer_name] = {
                "can_skip": skip_impact < self.routing_threshold,
                "skip_ratio": skip_impact,
            }
        return table

    def regenerate(self, token, context):
        """
        对中等置信度 token 进行"轻量再生成"：
        根据路由表，跳过可跳过的层，
        只计算关键层的输出。
        """
        hidden_states = self._embed(context)

        for layer_name, layer in self.full_model.layers.items():
            route_info = self.routing_table[layer_name]

            if route_info["can_skip"]:
                # 走短路径：用预计算的近似值
                hidden_states = self._apply_skip_connection(
                    hidden_states, layer_name
                )
            else:
                # 走全路径：正常计算
                hidden_states = layer(hidden_states)

        # 从最后的隐藏状态中解码输出 token
        output_distribution = self.full_model.head(hidden_states)
        return self._decode_token(output_distribution)
```

## 五、关键数据：效果有多好？

论文在四个代表性任务和多个模型系列上做了实验，结果如下：

- **拒绝率降低 0.10-0.22**：相比传统 SD，需要"完全重算"的 token 大幅减少
- **推理速度提升 10-20%**：相比已有的强 SD 基线方法
- **相比不采用推测解码的基线，加速 2.5-3 倍**
- **不需要修改训练流程**：VIA-SD 兼容任何现有 SD 框架

## 六、为什么这个方法重要？

从第一性原理来看，VIA-SD 触及了一个被长期忽视的事实：

> **"错误"是有梯度的。** 拒绝一个 token 不应该是二元的（accept/reject），而是一个连续的过程。

传统的推测解码像是在过安检——要么放行要么退回。VIA-SD 引入了"整改区"：轻微问题的 token 可以在内部修复，只有严重问题才需要退回重做。这种"分级处理"的思想，在很多领域都有类似应用，比如：

- 内容审核：直接通过 / 人工复审 / 完全拒绝
- 推荐系统：直接推荐 / 人工审查 / 不予推荐
- 医疗诊断：直接确诊 / 做进一步检查 / 转专科

VIA-SD 把这种"分级思维"引入了 LLM 推理加速，是一个思路上的突破。而且它**不需要重新训练模型**，可以直接套用在现有的推测解码系统上，实用价值很高。

这篇论文已被 **ICML 2026**（第 43 届国际机器学习会议）接收。

## 七、延伸思考

如果你要把 VIA-SD 的想法推广到更多场景，可以问自己几个问题：

1. 路由的阈值（比如 0.95、0.60）应该是固定的，还是根据输入动态调整？
2. 瘦验证者的"瘦身程度"和准确率之间有没有一个最优平衡点？
3. 如果把这个思路用到 RAG（检索增强生成）的验证环节中，会怎样？

这些都是值得继续探索的方向。
