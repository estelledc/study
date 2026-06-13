---
title: "The MiniMax-M2 Series: Mini Activations Unleashing Max Intelligence"
来源: https://arxiv.org/abs/2605.26494
日期: 2026-06-13
分类: 其他
子分类: llm
provenance: pipeline-v3
---

# MiniMax-M2 系列学习笔记

## 一、一句话总结

MiniMax-M2 是一系列"混合专家（MoE）"语言模型，核心思想是：**用极少的激活参数，做出最前沿的智能表现**。旗舰模型 M2.7 总参 2299 亿，但每个 token 只激活约 98 亿——相当于一个 2000 人团队里，每次只叫 100 个人来干活，却能达到和更大模型相当的效果。

---

## 二、核心概念：什么是"混合专家"（MoE）？

### 2.1 日常类比：餐厅里的厨师团队

想象一家超大餐厅，有 256 位厨师（这就是 256 个"专家"），但每个菜上桌时，餐厅并不会让所有厨师同时炒菜——那太浪费了。

相反，餐厅有一个"调度员"（门控网络），每道菜只挑最合适的 8 位厨师来制作。比如一道川菜，调度员会叫川菜厨师；一道甜点，叫甜品厨师。

- **总人数**：256 位厨师 = 模型的 2299 亿总参数
- **每次出菜人数**：8 位厨师 = 每个 token 只激活 98 亿参数
- **调度员**：sigmoid 门控网络，决定叫哪 8 位

这样做的好处是：**模型可以非常大（知识量大），但推理成本很低（每次只算一部分）**。

### 2.2 与传统 Dense 模型的对比

| 特性 | Dense 模型（如 Llama 3 70B） | MoE 模型（如 M2） |
|------|---------------------------|-------------------|
| 总参数 | 700 亿 | 2299 亿 |
| 每次激活 | 700 亿 | 98 亿 |
| 推理速度 | 较慢 | 较快（因为只算 98 亿） |
| 知识容量 | 较小 | 更大（256 个专业领域） |

---

## 三、M2 的三个关键创新

### 3.1 创新一：智能体驱动的数据流水线

传统大模型训练数据主要来自网页、书籍等静态内容。M2 的不同之处在于：它的训练数据大部分来自**模型自己在真实环境中完成任务的过程记录**。

比如让模型去修一个 GitHub 上的 bug，跑在 Docker 容器里，测试通过了就算一条有效数据。这种"做过的事情"比"读过的文字"更有价值。

具体包括四个方向：

1. **智能体编码（Agentic Coding）**：从 GitHub 拉取真实的 bug 修复任务，自动生成 Docker 环境，让模型去修
2. **智能体协作（Agentic Cowork）**：让模型做深度搜索、操作 Excel、生成 PPT 等办公任务
3. **推理密集型任务**：数学题、科学问答
4. **通用对话与写作**：保持基础语言能力

### 3.2 创新二：Forge — 专为智能体设计的强化学习系统

强化学习（RL）是让模型通过"试错"来变聪明的方法。但传统 RL 是为简单游戏设计的，而智能体任务可能涉及成百上千步操作、耗时从几秒到几小时不等。

Forge 解决了三个矛盾：

- **吞吐量**：想处理得越快越好
- **稳定性**：想训练过程不崩溃
- **灵活性**：想支持各种各样的智能体架构

它通过三个解耦模块实现：

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Agent 端    │────▶│  中间件抽象层     │────▶│  训练/推理端     │
│ (产生轨迹)    │     │ (Gateway + 数据池) │     │ (CISPO 梯度更新)  │
└─────────────┘     └──────────────────┘     └─────────────────┘
```

### 3.3 创新三：自我进化（Self-Evolution）

最新的 M2.7 已经能**自己调试自己的训练过程**。当训练出现异常时，M2.7 会读取日志、定位问题、修改自己的配置文件，然后重新运行。在内部测试中，它能吸收每天 30%-50% 的人工迭代工作量。

---

## 四、关键技术细节（带代码示例）

### 4.1 MoE 的门控机制

M2 不使用传统的 softmax 门控（所有专家得分加起来必须等于 1），而是使用 **sigmoid 门控**——每个专家独立决定是否被激活。

```python
# 简化的 MoE 前向传播示意
import torch
import torch.nn as nn

class MiniMaxMoE(nn.Module):
    """
    MiniMax-M2 的 MoE 层简化示意
    
    总专家数: 256
    每次激活: top-8
    门控方式: sigmoid（非 softmax）
    """
    def __init__(self, d_model=3072, num_experts=256, top_k=8, hidden_dim=8192):
        super().__init__()
        self.num_experts = num_experts
        self.top_k = top_k
        
        # 门控网络：给每个专家一个独立的激活分数
        self.gate = nn.Linear(d_model, num_experts, bias=True)
        
        # 256 个专家，每个是一个 FFN
        self.experts = nn.ModuleList([
            nn.Sequential(
                nn.Linear(d_model, hidden_dim),
                nn.GELU(),
                nn.Linear(hidden_dim, d_model)
            )
            for _ in range(num_experts)
        ])
    
    def forward(self, x):
        """
        x: (batch, seq_len, d_model)
        """
        batch, seq_len, d_model = x.shape
        
        # Step 1: 计算每个专家的门控分数
        # gate_logits: (batch, seq_len, num_experts)
        gate_logits = self.gate(x)
        
        # Step 2: 加上专家特定的偏置（帮助负载均衡）
        expert_bias = nn.Parameter(torch.zeros(self.num_experts))
        gate_logits = gate_logits + expert_bias
        
        # Step 3: Sigmoid 激活（每个专家独立判断）
        gate_scores = torch.sigmoid(gate_logits)  # (batch, seq_len, num_experts)
        
        # Step 4: 选出得分最高的 top-k 个专家
        topk_scores, topk_indices = torch.topk(gate_scores, k=self.top_k, dim=-1)
        
        # Step 5: 加权聚合专家输出
        output = torch.zeros_like(x)
        for b in range(batch):
            for s in range(seq_len):
                for idx in range(self.top_k):
                    expert_id = topk_indices[b, s, idx].item()
                    weight = topk_scores[b, s, idx]
                    expert_out = self.experts[expert_id](x[b, s])
                    output[b, s] += weight * expert_out
        
        return output

# 使用示例
moe_layer = MiniMaxMoE(d_model=3072, num_experts=256, top_k=8)
dummy_input = torch.randn(2, 128, 3072)  # batch=2, seq=128
output = moe_layer(dummy_input)
print(f"输入形状: {dummy_input.shape}")
print(f"输出形状: {output.shape}")
# 输出形状: torch.Size([2, 128, 3072])
```

**关键点**：sigmoid 门控 vs softmax 门控的区别在于，sigmoid 不要求所有专家得分之和为 1。这意味着有可能多个专家同时高置信度地被激活，路由过程更平滑。

### 4.2 多 Token 预测（MTP）与推测解码

M2 不仅预测下一个 token，还同时预测接下来 K 个 token。这在推理时可以用于"推测解码"——主模型一次验证多个候选 token，大幅提升速度。

```python
# 简化的 MTP 推测解码示意
def speculative_decoding_main_model_draft(
    main_model,        # 主模型（2299 亿参数，256 个专家）
    draft_models,      # MTP 模块（3 个，通过权重复制初始化）
    prompt_tokens,     # 输入 token
    max_new_tokens=10,
    temperature=1.0
):
    """
    M2 的推测解码流程
    
    1. 3 个 MTP 模块并行生成草稿 token
    2. 主模型一次性验证所有草稿
    3. 接受通过的草稿，拒绝的从第一个失败处重新开始
    
    效果：吞吐量提升，输出质量不变
    """
    generated = list(prompt_tokens)
    
    for _ in range(max_new_tokens):
        # Step 1: MTP 模块生成 K=3 个草稿 token
        draft_tokens = []
        for k in range(3):
            draft = draft_models[k].generate(generated, max_new_tokens=1)
            draft_tokens.extend(draft)
        
        # Step 2: 主模型一次性验证所有草稿
        # 主模型做一次前向传播，对所有位置给出概率
        main_probs = main_model.forward(generated + draft_tokens)
        
        # Step 3: 逐个验证草稿
        accepted_count = 0
        for i, draft_token in enumerate(draft_tokens):
            # 检查主模型是否接受这个 token
            if is_accepted(main_probs, draft_token, temperature):
                generated.append(draft_token)
                accepted_count += 1
            else:
                # 遇到不接受的 token，停止，从主模型采样一个新 token
                fallback = sample_from(main_probs[i], temperature)
                generated.append(fallback)
                break
        
        # 如果全部接受，直接进入下一轮
        if accepted_count == len(draft_tokens):
            continue
    
    return generated

def is_accepted(main_probs, draft_token, temperature):
    """
    简单的接受判定：draft token 在主模型概率分布中
    实际实现会使用均匀随机数与接受率比较
    """
    accept_prob = main_probs[draft_token]
    return torch.rand(1) < accept_prob / temperature

# 使用示意
# prompt = [128, 256, 512]  # 输入 token IDs
# result = speculative_decoding_main_model_draft(
#     main_model=model_m2,
#     draft_models=[mtp_1, mtp_2, mtp_3],
#     prompt_tokens=prompt
# )
```

**为什么 MTP 能加速？** 正常自回归解码每次只能生成 1 个 token，需要 N 次前向传播。MTP 推测解码可以用 3 个轻量 MTP 模块快速生成草稿，然后主模型**一次前向传播**就能验证多个 token。

---

## 五、M2 的架构参数一览

| 参数 | 数值 |
|------|------|
| 总参数量 | 229.9B |
| 每 token 激活参数 | 9.8B |
| 层数 | 62 层 Decoder-only Transformer |
| 隐藏层维度 | 3,072 |
| 词汇表大小 | 200,064 |
| 预训练 Token 数 | 29.2T |
| 上下文窗口 | 192K token |
| 专家总数 | 256 |
| 每 token 激活专家数 | 8 |
| 注意力头数 | 48 query, 8 KV (GQA) |
| 位置编码 | RoPE |

---

## 六、M2.7 的性能表现

M2.7 在多个基准测试中与闭源前沿模型竞争：

**智能体编码**：
- SWE-bench Pro: 56.2（接近 GPT 5.4 的 57.7）
- SWE-bench 多语言: 76.5
- Multi-SWE-bench: 52.7（超过所有对比模型）
- Terminal-Bench 2.0: 57.0

**智能体协作**：
- BrowseComp: 77.8
- MM Claw: 62.7
- Toolathlon: 46.3

**推理与知识**：
- AIME 2026: 94.2
- GPQA-Diamond: 89.8

值得注意的是，M2.7 只激活约 100 亿参数，就达到了与激活量大一个数量级的模型相当的水平。

---

## 七、从 M2 到 M2.7 的演进

M2 系列的能力是逐步演进的：

- **M2**：基础版本，在编码任务上已有不错表现
- **M2.5**：引入更多智能体训练数据，搜索和工具使用能力提升
- **M2.7**：加入自我进化能力，能自主调试训练、修改自身 scaffold

从 M2 到 M2.7，在所有 11 个基准测试上都持续提升，其中深度搜索（BrowseComp +33.8）、工具使用（Toolathlon +27.5）和自主 ML 工程（MLE Bench Lite +26.6）的提升最为显著——这正是新数据管线重点投入的方向。

---

## 八、关键设计选择背后的思考

### 8.1 为什么坚持全注意力（Full Attention）而不是高效注意力？

MiniMax 之前尝试过混合注意力（部分层用滑动窗口注意力 SWA），但在大规模实验中发现了问题：

1. **评估困难**：标准基准测不出来差距，但在复杂多跳推理上暴露了缺陷
2. **基础设施不成熟**：线性注意力在低精度存储下敏感，不支持前缀缓存
3. **长上下文受损**：在超过 32K token 的任务上，SWA 明显不如全注意力

实验数据（预训练阶段）：

| 基准 | 全注意力 | 混合 SWA | 差距 |
|------|---------|---------|------|
| HELMET ICL | 75.8 | 72.7 | -3.1 |
| RULER 128K CWE | 90.0 | 72.0 | **-18.0** |
| MTOB 翻译 BLEURT | 60.0 | 45.0 | -15.0 |

长上下文检索能力的损失非常显著。

### 8.2 为什么用 Sigmoid 门控而非 Softmax？

Softmax 门控有一个"零和博弈"问题——某个专家得分高了，其他专家的得分必然降低。Sigmoid 让每个专家独立判断，路由更平滑，且配合专家偏置项（expert bias）可以大幅减少对辅助负载均衡损失的依赖。

---

## 九、学习要点总结

1. **MoE 的核心价值**：用稀疏激活实现"大模型容量 + 小模型成本"的兼得
2. **智能体数据 > 静态数据**：模型在真实环境中完成任务的记录，比单纯阅读文本更能提升实际能力
3. **训练-推理-智能体解耦**：Forge 系统的三大模块各自独立扩展，是处理异构智能体的关键架构决策
4. **Windowed FIFO 调度**：在严格 FIFO（保分布一致性）和完全贪婪（保吞吐）之间找到平衡点
5. **前缀树合并**：共享前缀只算一次，训练加速最高达 40 倍，且数学上等价于独立样本训练
6. **自我进化**：M2.7 已能自主调试训练、修改 scaffold，这是减少人工迭代瓶颈的重要一步

---

## 十、延伸思考

这篇论文最引人深思的地方是"mini activations"这个理念的彻底贯彻——不仅是模型架构层面少激活参数，还包括：

- 数据层面：用智能体自己产生的高质量轨迹，而非海量低质网页
- 训练层面：用解耦架构和高效调度，而非暴力堆算力
- 推理层面：用 MTP 推测解码，而非单纯增大模型

这种"处处做减法，处处换质量"的设计哲学，或许比具体的技术细节更值得学习。
