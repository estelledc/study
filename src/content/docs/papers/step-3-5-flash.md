---
title: "Step 3.5 Flash: 用 11B 活跃参数跑出门槛最低的"前沿智能"
来源: https://arxiv.org/abs/2602.10604
日期: 2026-06-13
分类: 其他
子分类: llm
provenance: pipeline-v3
---

# Step 3.5 Flash 零基础学习笔记

> **一句话总结**：StepFun 发布了一个 1960 亿总参数、但推理时只激活 110 亿参数的稀疏 MoE 模型，在数学、代码和 Agent 任务上达到了 GPT-5.2 xHigh 和 Gemini 3.0 Pro 同水平的性能，同时大幅降低推理成本。

---

## 一、日常类比：大饭店与快炒档

想象一家顶级餐厅（大型语言模型）：

- **传统 Dense 模型**（如 GPT-4）：每次来一位客人，厨师团队 100 人全体上阵，哪怕客人只点了一碗面。成本高、速度慢，但什么都做得出来。
- **Step 3.5 Flash 的 MoE 思路**：厨房里有 100 个专家厨师（196B 总参数），但每位客人只触发其中 10 个最相关的厨师（11B 活跃参数）。点面点面师，点菜点厨师。成本降了 18 倍，但因为是顶级厨师团队，做出来的味道丝毫不差。

这就是 Mixture-of-Experts（MoE）的核心思想：**让模型"知道很多"，但每次"只费很少"。**

---

## 二、核心概念拆解

### 2.1 MoE（Mixture of Experts）— 混合专家

**日常类比**：你去医院挂号，前台分诊台根据你的症状把你派到最对口的科室。你看牙去口腔科，不看全科。MoE 就是模型的"智能分诊台"。

**技术解释**：
- 模型包含多个并行的"专家"（Expert）神经网络
- 每次推理时，一个 Gate（门控）机制决定哪些专家被激活
- Step 3.5 Flash 共 196B 总参数，但每次推理只使用 11B

```python
# 伪代码：MoE 的前向传播
class MoELayer(nn.Module):
    def __init__(self, num_experts=128, top_k=2):
        super().__init__()
        self.experts = nn.ModuleList([
            ExpertFFN() for _ in range(num_experts)  # 128 个专家
        ])
        self.gate = nn.Linear(d_model, num_experts)  # 门控网络
        self.top_k = top_k  # 每次只选 2 个

    def forward(self, x):
        # 1. 门控：决定哪个专家来处理当前输入
        gate_scores = self.gate(x)  # shape: [batch, seq, 128]
        top_k_weights, top_k_indices = torch.topk(gate_scores, self.top_k, dim=-1)

        # 2. 只激活选中的专家（节省算力）
        output = torch.zeros_like(x)
        for k in range(self.top_k):
            expert_idx = top_k_indices[:, :, k]
            weights = top_k_weights[:, :, k]
            output += weights.unsqueeze(-1) * self.experts[expert_idx](x)

        return output
```

**关键点**：
- 总参数量 196B，活跃量 11B → 推理速度提升约 **18 倍**
- 门控网络学会"精准分诊"：不同任务自动路由到不同专家

### 2.2 MTP-3（Multi-Token Prediction）— 一次猜三步

**日常类比**：正常语言模型像一个人写作文，写一个字看一眼纸面再写下一个字。MTP 像有"直觉"的人——写完"今天天"之后，基本能猜到下一个字是"气"。它同时预测接下来 3 个 token，减少"回头检查"的次数。

**技术解释**：
- 在 Decoder 的训练过程中，额外增加预测未来 N 个 token 的辅助任务
- Step 3.5 Flash 使用 MTP-3，同时预测接下来的 3 个 token
- 推理时可以利用这个能力做 Speculative Decoding（猜测性解码），加速生成

```python
# 伪代码：MTP-3 的训练目标
def mtp_loss(hidden_states, labels, num_tokens=3):
    """
    hidden_states: 每一层的隐藏表示 [batch, seq, d_model]
    labels: 目标 token ID [batch, seq]
    """
    loss = 0.0
    # 主任务：预测下一个 token（标准语言模型损失）
    main_logits = lm_head(hidden_states[-1])  # 最后一层
    main_loss = cross_entropy(main_logits, labels)
    loss += main_loss

    # 辅助任务：从中间层同时预测未来 1/2/3 个 token
    for layer_idx in range(len(hidden_states) - 1):
        for offset in range(1, num_tokens + 1):
            aux_logits = lm_head(hidden_states[layer_idx])
            # labels 往前偏移 offset 位
            aux_labels = labels[:, offset:]
            aux_loss = cross_entropy(aux_logits, aux_labels)
            loss += 0.1 * aux_loss  # 辅助损失权重调低

    return loss / (1 + 2 * num_tokens)  # 归一化
```

**效果**：显著降低多轮 Agent 交互的延迟和成本。

### 2.3 混合注意力（Hybrid Attention）— 远近兼顾

**日常类比**：读一篇文章时，你既需要记住"开头说了什么"（全局注意力，计算量大），也需要快速扫到"上一句是什么"（滑动窗口注意力，速度快）。Step 3.5 Flash 用 3:1 的比例组合这两种方式。

**技术解释**：
- 3 层用 Sliding Window Attention（SWA）：只看附近窗口，O(n) 复杂度
- 1 层用 Full Attention：看全文，O(n²) 但信息完整
- 交替排列，兼顾长程依赖和推理效率

### 2.4 MIS-PO 强化学习 — 让模型自己越练越强

**日常类比**：传统 RLHF 像一个老师批改作业——"这样写好，那样写不好"。MIS-PO 更像自我纠错——模型先自己做题，做对了奖励，做错了分析原因，然后下次避开同类错误。关键创新在于"在大规模离线数据上也能稳定训练"。

**技术解释**：
- 可验证信号（代码执行结果、数学答案）+ 偏好反馈（人类或模型打分）
- MIS（Model Importance Sampling）过滤掉低质量样本，稳定 off-policy 训练
- 在数学、代码、工具使用三个领域实现持续自改进

---

## 三、性能数据一览

| 基准测试 | Step 3.5 Flash | 对比模型 |
|---|---|---|
| IMO-AnswerBench（数学竞赛） | **85.4%** | 接近 GPT-5.2 xHigh |
| LiveCodeBench-v6（编程） | **86.4%** | 接近 Gemini 3.0 Pro |
| tau2-Bench（Agent 综合） | **88.2%** | — |
| BrowseComp（网页浏览） | **69.0%** | — |
| Terminal-Bench 2.0（终端操作） | **51.0%** | — |

**重点**：以只有 11B 活跃参数，跑出了和千亿级 Dense 模型相当的成绩。

---

## 四、架构总结（第一性原理思考）

从第一性原理看，Step 3.5 Flash 解决了一个根本问题：

> **智能密度 ≠ 激活参数总量**

传统思路：模型越大越好。StepFun 的思路是：**把参数"存起来"，只在需要时"激活"。** 这就像人脑——你不需要同时调动所有神经元来回答"现在几点了"。

三个设计原则贯穿始终：
1. **推理时要快** → MoE 稀疏激活（196B → 11B）
2. **生成时要省** → MTP-3 减少解码步数
3. **智能时要强** → 混合注意力 + 自进化 RL

---

## 五、思考与局限

论文也坦诚了几个局限：
- **Token 效率**：MoE 在极短文本上可能不如 Dense 模型高效
- **全能性**：目前没有模型能在所有任务上都做到极致
- **开放世界 Agent**：RL 在受控环境有效，但真实世界中 Agent 面临不可预见的场景

---

## 六、延伸阅读建议

- Mixture-of-Experts 起源：[GShard (2020)](./mixture-of-experts.md)
- 多 Token 预测：[Eagle (2024)](./eagle.md)
- 强化学习对齐：[RLHF](./rlhf-christiano.md)、[DPO](./dpo.md)
