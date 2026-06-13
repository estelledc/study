---
title: ReasoningLM: Enabling Structural Subgraph Reasoning in Pre-trained Language Models for Question Answering over Knowledge Graph
来源: https://arxiv.org/abs/2401.00158
日期: 2026-06-13
分类: 其他
子分类: 知识图谱
provenance: pipeline-v3
---

# ReasoningLM：让语言模型直接"看懂"知识图谱的推理路径

## 一、从日常场景说起：图书馆找书

假设你在一个巨大的图书馆（这就是知识图谱）里找一本书。图书馆没有分类目录系统，但每个书架上都贴着标签，告诉你"这本书讲了什么"、"作者是谁"、"引用了哪些其他书"。

传统做法是请两个人合作：

- **语言专家**（语言模型 PLM）负责读懂你的问题："我想找讲量子计算的书"
- **地图专家**（图神经网络 GNN）负责在图书馆里走，沿着标签路径找到相关的书

两个人各自厉害，但沟通效率很低——语言专家看不懂地图专家的笔记格式，地图专家也听不懂语言专家的口头描述。这就是现有 KGQA（知识图谱问答）系统的问题：PLM 和 GNN 两个模块架构不同，知识共享困难。

ReasoningLM 的思路很直接：**为什么不培养一个既能读懂问题、又能直接在图书馆里走路径的全能型人才？**

这就是 ReasoningLM 要做的事——让一个预训练语言模型自己学会知识图谱的子图推理。

## 二、核心概念：知识图谱问答（KGQA）

知识图谱长这样：一堆"实体-关系-实体"的三元组，像这样：

```
(周杰伦, 毕业于, 台大音乐系)
(台大音乐系, 隶属于, 台湾大学)
(台湾大学, 位于, 台北)
```

KGQA 就是：给你一个自然语言问题，从图谱中找到正确答案。

比如问题："周杰伦毕业于哪所大学？"

推理路径是：
```
周杰伦 -> 毕业于 -> 台大音乐系 -> 隶属于 -> 台湾大学（答案）
```

这是一条 2 跳（2-hop）的推理路径。问题越复杂，路径越长，从 3 跳到 4 跳都很常见。

## 三、ReasoningLM 的三个核心创新

### 3.1 子图感知自注意力机制（Subgraph-aware Self-attention）

这是整个论文最核心的想法。

标准的 Transformer 自注意力机制中，每个 token 可以和序列中**任何**其他 token 交互。但在知识图谱推理中，只有图谱中有连接关系的实体/关系才应该互相影响。

ReasoningLM 的做法：给自注意力加一个"结构掩码"。

```python
def subgraph_masked_attention(Q, K, V, subgraph_edges):
    """
    Q, K, V: 标准自注意力的查询、键、值矩阵，形状 (seq_len, d_model)
    subgraph_edges: 子图中实际存在的边集合，比如 {(0,1), (1,2), (2,3)}
    
    返回: 加了结构约束的注意力输出
    """
    seq_len = Q.shape[0]
    
    # 步骤1：计算标准注意力分数
    attention_scores = torch.matmul(Q, K.transpose(-2, -1)) / (d_model ** 0.5)
    
    # 步骤2：构建结构掩码矩阵
    mask = torch.full((seq_len, seq_len), float('-inf'))
    
    for i in range(seq_len):
        for j in range(seq_len):
            # 如果两个 token 在子图中是同一条边上的邻居，允许注意力
            # 如果两个 token 都在问题文本中（都是 question tokens），允许注意力
            if (i, j) in subgraph_edges or (j, i) in subgraph_edges:
                mask[i, j] = 0.0  # 正常注意力分数
            elif is_question_token(i) and is_question_token(j):
                mask[i, j] = 0.0  # 问题内部的 token 可以自由交互
            # 其他情况保持 -inf，softmax 后变成 0
    
    # 步骤3：加掩码后做 softmax
    masked_scores = attention_scores + mask  # -inf 的位置变成 -inf
    attention_weights = torch.softmax(masked_scores, dim=-1)
    
    # 步骤4：加权求和
    output = torch.matmul(attention_weights, V)
    
    return output
```

**类比**：这就像在图书馆里，你只能"看到"和你当前位置有标签路径相连的那些书架，其他书架对你来说是完全"透明"不存在的。

数学上，原始注意力矩阵 A 加上掩码矩阵 M：

```
Attn(Q, K, V) = softmax(A + M) · V
```

M 中，不允许交互的位置是 -inf，softmax 后对应权重变为 0。

### 3.2 输入格式设计

ReasoningLM 把问题和子图拼成一条统一的序列：

```
[CLS] [问题文本] [SEP] [实体1] [关系1] [实体2] [关系2] [实体3] ... [SEP] [候选答案实体列表]
```

比如：

```
[CLS] 周杰伦毕业于哪所大学 [SEP] 周杰伦 毕业于 台大音乐系 隶属于 台湾大学 [SEP] 台湾大学 台大 台大医学院 ...
```

这样，语言模型既能理解问题语义，又能在一个序列里看到完整的子图结构。

### 3.3 适配微调（Adaptation Tuning）

光有结构还不够，模型需要"学习"怎么用这种输入格式。ReasoningLM 用了两阶段训练：

**第一阶段：适配微调**——用 20,000 个自动合成的数据让模型适应子图推理格式

数据来源是 Wikidata，具体做法：

1. 从热门实体出发，在图谱上随机游走，走不超过 4 跳，终点就是答案
2. 以起点实体为中心，抽取包含这条推理路径的子图
3. 用两种方法生成问题：规则模板 + ChatGPT 合成（约 15 美元，获得 20,000 条多样化问题）

```python
import random

def generate_training_data(wikidata_kg, num_samples=20000):
    """
    模拟 ReasoningLM 的训练数据生成流程
    
    wikidata_kg: 知识图谱，结构为 dict: {实体: [(关系, 相邻实体), ...]}
    """
    training_data = []
    
    # 1. 选择热门实体作为起点（主题实体）
    topic_entities = get_popular_entities(wikidata_kg)
    
    for _ in range(num_samples):
        # 2. 随机选一个起点
        start_entity = random.choice(topic_entities)
        
        # 3. 从起点随机游走，最多 4 跳
        reasoning_path = [start_entity]
        current = start_entity
        for hop in range(random.randint(1, 4)):
            neighbors = wikidata_kg.get(current, [])
            if not neighbors:
                break
            relation, next_entity = random.choice(neighbors)
            reasoning_path.append(next_entity)
            current = next_entity
        
        # 4. 终点就是答案
        answer_entity = reasoning_path[-1]
        
        # 5. 围绕起点抽取子图，确保推理路径上的节点和关系都被包含
        subgraph = extract_subgraph(wikidata_kg, start_entity, include_path=reasoning_path)
        
        # 6. 用规则或 ChatGPT 生成问题
        question = synthesize_question(start_entity, reasoning_path)
        
        # 7. 组装训练样本
        training_data.append({
            "question": question,          # "周杰伦毕业于哪所大学？"
            "subgraph": subgraph,          # 子图三元组列表
            "topic_entity": start_entity,  # "周杰伦"
            "reasoning_path": reasoning_path,
            "answer_entity": answer_entity, # "台湾大学"
        })
    
    return training_data
```

**第二阶段：参数高效微调（PET）**——在下游任务上，只微调 Adapter 参数，冻结其他参数

- **子图检索子任务**：让模型学会判断问题和哪些关系相关，逐步扩展子图
- **答案推理子任务**：在已检索的子图上，预测哪个实体是答案

答案预测的-loss 用 KL 散度：

```
L_at = D_KL(s || s*)
```

其中 s 是模型对每个实体的得分概率分布，s* 是真实答案的 one-hot 分布。只计算实体的 loss，关系和问题词不算。

## 四、完整示例：从问题到答案

下面是一个完整的推理流程模拟：

```python
class ReasoningLM:
    """
    ReasoningLM 简化实现
    
    核心思想：把知识图谱的子图和问题合并成一条序列，
    用结构感知的自注意力让模型在理解问题的同时进行图谱推理。
    """
    
    def __init__(self, plm_model, max_seq_len=512):
        self.plm = plm_model
        self.max_seq_len = max_seq_len
        self.adapter = Adapter()  # 轻量级 Adapter，下游微调时用
    
    def build_input_sequence(self, question, subgraph, candidate_entities):
        """
        构建统一输入序列
        
        Args:
            question: 自然语言问题，如 "周杰伦毕业于哪所大学？"
            subgraph: 子图三元组列表，如 [("周杰伦", "毕业于", "台大音乐系"), ...]
            candidate_entities: 候选答案实体列表
        
        Returns:
            构建好的输入序列字符串
        """
        parts = ["[CLS]"]
        
        # 添加问题
        parts.append(question)
        parts.append("[SEP]")
        
        # 添加子图三元组，按顺序拼接
        for head, relation, tail in subgraph:
            parts.append(head)
            parts.append(relation)
            parts.append(tail)
        parts.append("[SEP]")
        
        # 添加候选答案实体
        for entity in candidate_entities:
            parts.append(entity)
        
        return " ".join(parts)
    
    def subgraph_masked_attention(self, hidden_states, subgraph_edges, question_mask):
        """
        子图感知自注意力
        
        Args:
            hidden_states: 输入嵌入，形状 (seq_len, d_model)
            subgraph_edges: 子图中的边集合，如 {0,1}, {1,2}, ...
            question_mask: 问题部分 token 的布尔掩码
        
        Returns:
            结构约束后的隐藏状态
        """
        seq_len = hidden_states.shape[0]
        d_model = hidden_states.shape[-1]
        
        # 计算注意力分数
        Q = hidden_states @ self.W_Q
        K = hidden_states @ self.W_K
        V = hidden_states @ self.W_V
        
        scores = torch.matmul(Q, K.transpose(-2, -1)) / (d_model ** 0.5)
        
        # 构建掩码：只有子图中有边的位置 + 问题内部可以交互
        mask = torch.full((seq_len, seq_len), float('-inf'))
        
        for i in range(seq_len):
            for j in range(seq_len):
                # 子图中的边
                if (i, j) in subgraph_edges or (j, i) in subgraph_edges:
                    mask[i, j] = 0.0
                # 问题内部的 token 可以互相注意力
                elif question_mask[i] and question_mask[j]:
                    mask[i, j] = 0.0
        
        # 加掩码并 softmax
        masked_scores = scores + mask
        attn_weights = torch.softmax(masked_scores, dim=-1)
        
        return torch.matmul(attn_weights, V)
    
    def predict_answer(self, question, subgraph, candidate_entities):
        """
        端到端答案预测
        
        Args:
            question: 自然语言问题
            subgraph: 子图三元组列表
            candidate_entities: 候选答案实体列表
        
        Returns:
            每个候选实体的答案得分概率
        """
        # 第1步：构建输入序列
        input_seq = self.build_input_sequence(question, subgraph, candidate_entities)
        
        # 第2步：通过 PLM + 自适应注意力
        # (实际实现中会调用 PLM 的 forward，并在每一层插入 masked attention)
        hidden_states = self.plm(input_seq)  # (seq_len, d_model)
        
        # 第3步：取 [CLS] 位置的隐藏状态，通过线性层 + softmax 得到答案概率
        cls_state = hidden_states[0]  # [CLS] token 的表示
        logits = self.prediction_head(cls_state)
        scores = torch.softmax(logits, dim=-1)
        
        return scores
```

## 五、为什么这个方法有效？

用第一性原理来想：

1. **问题本质**：KGQA 需要同时做两件事——理解自然语言语义 + 在图谱上做多跳推理。现有方法用两个模块各做一半，但模块间的信息传递是有损的。

2. **直觉**：如果让同一个模型同时做这两件事，用结构化的注意力机制"引导"模型只看图谱中有意义的连接，模型就能在同一个表征空间里把语义和结构信息深度融合。

3. **结果**：实验显示 ReasoningLM 在多个基准测试（WebQSP、CWQ、MQA）上超越了当时的 SOTA，而且用的参数量更少、训练数据更少。

## 六、关键数字

- 适配微调数据：**20,000** 个子图 + 合成问题
- 合成成本：约 **15 美元**（用 ChatGPT）
- 推理路径长度：最多 **4 跳**
- 发表会议：**EMNLP 2023 Main**
- 代码开源：https://github.com/RUCAIBox/ReasoningLM

## 七、总结

ReasoningLM 的核心贡献可以浓缩成一句话：**用结构感知的自注意力机制，让一个预训练语言模型直接学会知识图谱的子图推理，不再需要外挂 GNN 模块。**

它解决的根本问题是：当我们需要模型同时理解语义和结构时，分开建模往往不如统一建模效果好。这个思路也影响了后来很多工作。
