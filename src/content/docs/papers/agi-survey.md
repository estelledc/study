---
title: Large language models for artificial general intelligence (AGI): A survey
来源: 'https://arxiv.org/abs/2501.03151'
日期: 2026-06-13
分类: 其他
子分类: AGI
provenance: pipeline-v3
---

## 是什么

这篇论文是一篇**综述**——它回答一个根本问题：当前的大语言模型（LLM）缺了哪些"地基"，才能变成真正通用的人工智能（AGI）？

日常类比：现在的 LLM 像一个读了全世界图书馆的书、能背下每句话的学生，但当你让他去厨房倒杯水——他不知道"杯"是什么触感，不知道"水"会流，不知道"倒"需要手腕发力。论文说，这就是因为他缺少四个地基：**具身（embodiment）、符号接地（symbol grounding）、因果（causality）、记忆（memory）**。把这四个建好，LLM 才可能从"嘴强王者"变成"真正的智能体"。

论文不提出某个新算法，而是**系统性梳理**这四个概念的定义、在生物学中的角色、在 AI 中的已有实现方法，以及它们如何相互协作形成一个完整的 AGI 认知架构。

## 为什么重要

不理解这篇论文，下面这些趋势都找不到共同主线：

- 为什么 2024-2025 年 VLA（视觉-语言-动作）模型突然火了？——这是具身化的实践
- 为什么 RAG（检索增强生成）被广泛采用？——这是"记忆"原则的工程化
- 为什么"符号 grounding"这个 1990 年代的老话题又回潮了？——因为纯数据驱动的 LLM 碰到了语义天花板
- 为什么因果推理成为 LLM 研究的新热点？——因为相关性 ≠ 因果性，LLM 在 OOD 场景下频繁翻车

## 核心概念

### 一、具身化（Embodiment）

**概念**：智能不能脱离身体和环境独立存在。就像你没法通过读《游泳教程》学会游泳——你必须下水，感受水的浮力，调整身体姿态。人的大脑、身体、环境是一个统一系统，三者共同塑造智能。

**为什么 LLM 缺这个**：LLM 没有身体，没有传感器，没有物理动作能力。它看到十亿句"杯子是硬的"，但它从不知道"硬"的真实触感。这种缺失导致 LLM 的物理直觉（intuitive physics）几乎为零。

**已有实现路径**：

1. **VLA 模型**（如 RT-1 / RT-2）：把语言模型输出直接映射为机器人动作
2. **模拟环境交互**：在 Minecraft / SIMPA 等虚拟世界中让 agent 通过语言指令行动并接收反馈
3. **多模态融合**：视觉 + 语言联合训练，让模型学会将视觉感知与语言表征对齐

```python
# 类比：具身化在 VLA 中的体现
# 当前 LLM 输出文本，VLA 把文本映射到关节空间
import torch

class VLA_ConditionalPolicy:
    """简化的 VLA 策略网络：语言条件 → 机器人动作"""

    def __init__(self, lang_dim=4096, action_dim=7):
        # lang_encoder: 把"拿起桌上的红色杯子"变成向量
        self.lang_encoder = TransformerEncoder(lang_dim)
        # vision_encoder: 把场景图像变成向量
        self.vision_encoder = CNNVisionEncoder(lang_dim)
        # 动作解码器
        self.action_decoder = MLP(lang_dim * 2, action_dim)

    def forward(self, instruction, observation):
        # 具身化的核心：语言 + 视觉感知联合决定动作
        lang_vec = self.lang_encoder(instruction)
        vis_vec = self.vision_encoder(observation)
        combined = torch.cat([lang_vec, vis_vec], dim=-1)
        action = self.action_decoder(combined)  # [7] = (x, y, z, roll, pitch, yaw, gripper)
        return action

# 没有具身化的 LLM 对比：同样的指令只生成文本描述
# "他伸手拿起杯子" —— 没有动作向量，没有物理反馈
```

### 二、符号接地（Symbol Grounding）

**概念**：词"苹果"对你意味着什么？如果你只知道"苹果是一种水果，红色的，甜的"——这些定义本身也是用词组成的。你从未真正"接地"过"苹果"这个符号。人类的符号接地来自**直接感知经验**：你尝过苹果的味道，看过它的形状，摸过它的表皮。

**核心问题**：Harnad 在 1990 年提出的"符号接地问题"——如果 AI 系统中的所有符号都只通过其他符号定义，那整个系统就像一本字典：每个词的解释都引用另一个词，永远到不了真实世界。

**LLM 的本质困境**：LLM 本质上就是一本超级字典。它的"知识"全部来自词与词之间的统计共现，没有物理世界的直接接地。

**已有实现路径**：

1. **知识图谱接地**：把 LLM 的输出映射到结构化知识图谱（如 Wikidata），让符号指向真实实体
2. **本体驱动提示**：用本体（ontology）约束 prompt，让模型输出对齐到预定义的概念框架
3. **端到端 embedding 接地**：在训练中将文本 embedding 与图像/语音/力觉等多模态向量联合优化
4. **主动探索交互**：让 agent 在环境中主动探索，建立"动作-感知"闭环

```python
# 符号接地的两种实现思路对比

# 方法 1：知识图谱接地 —— 让符号指向结构化实体
class KG_GroundedLLM:
    """通过知识图谱给 LLM 的文本输出"接地"到真实实体"""

    def __init__(self, kg_client):
        self.kg = kg_client  # 如 Wikidata / DBpedia

    def ground(self, text):
        # 从文本中提取实体，并在 KG 中找到对应节点
        entities = self.extract_entities(text)
        grounded = {}
        for ent in entities:
            # 接地结果：符号 → 真实世界的结构化描述
            grounded[ent] = self.kg.lookup(ent)
            # 例: "苹果" → {
            #   "wikidata_id": "Q893",
            #   "instance_of": "fruit",
            #   "color": ["red", "green"],
            #   "taste": "sweet",
            #   "edible": true,
            #   "nutritional_info": {...}
            # }
        return grounded

    def extract_entities(self, text):
        # 简化的实体抽取，实际可用 spaCy / Stanford NER
        return text.split()


# 方法 2：端到端多模态接地 —— 文本 embedding 与视觉 embedding 对齐
class Multimodal_GroundedLLM:
    """用 CLIP 式的对比学习让文本和视觉共享同一 embedding 空间"""

    def __init__(self, text_encoder, image_encoder):
        self.text_enc = text_encoder
        self.img_enc = image_encoder

    def ground(self, text, image):
        # 文本和图像映射到同一空间，相似度 = 接地程度
        text_emb = self.text_enc(text)    # [512]
        img_emb = self.img_enc(image)     # [512]
        similarity = torch.cosine_similarity(text_emb, img_emb)
        # similarity 高 → 文本描述与图像内容"接地"一致
        return {
            "text_embedding": text_emb,
            "image_embedding": img_emb,
            "grounding_score": similarity.item()
        }

# 当前 LLM 的 grounding_score ≈ 0.7-0.85（基于多模态 benchmark）
# 人类对同一词语的 grounding_score ≈ 0.99（因为直接感知经验）
```

### 三、因果推理（Causality）

**概念**：相关性是"两个东西一起出现"，因果性是"一个东西导致了另一个东西"。LLM 本质上是统计相关性机器——它见过"打雷→下雨"被一起描述了一百万次，但它不知道"打雷导致下雨"。当遇到"打雷→不下雨"的情况，LLM 可能依然给出与训练数据一致的错误推断。

**Pearl 的因果阶梯**：

1. **关联（Association）**：看到 X，预测 Y（LLM 目前最高只到这一层）
2. **干预（Intervention）**：如果我做 A，会发生什么？（"如果我往墙上扔石头，墙会碎吗？"）
3. **反事实（Counterfactual）**：如果当时我做了 A，结果会不会不同？（"如果我刚才没踩香蕉皮，我会摔跤吗？"）

**已有实现路径**：

1. **深度学习方法**：在损失函数中加入因果约束（如 do-calculus）
2. **神经符号方法**：把 LLM 的输出接入符号推理引擎（如逻辑推理器）做因果校验
3. **物理 informed world model**：用物理规律作为归纳偏置，约束模型的推理空间

```python
# 因果推理示例：LLM 的局限 vs 因果模型的改进

# 场景：观测数据 "冰淇淋销量 ↑ → 溺水事故 ↑"
# LLM 基于统计相关性：可能推断"吃冰淇淋导致溺水"
# 因果模型识别：两者都由第三个变量"夏季高温"引起（混杂因子 confounder）

import numpy as np

class CausalReasoner:
    """简化的因果推理框架"""

    def __init__(self):
        # 因果图：ice_cream ← summer_heat → drownings
        # 如果不控制混杂因子 heat，相关性 ≠ 因果性
        pass

    def observational_inference(self):
        """LLM 式的相关性推理——只看数据分布"""
        # P(drowning | ice_cream_high) ≈ 高（因为数据中两者共现）
        return {
            "method": "observational",
            "prediction": "high_drowning_risk",
            "flaw": "confounded_by_summer_heat"
        }

    def interventional_inference(self, do_action="reduce_ice_cream"):
        """do-calculus 干预推理——主动改变变量"""
        # P(drowning | do(ice_cream=low)) = P(drowning | heat=high) ≈ 仍高
        # 因为真正导致溺水的是 heat，不是 ice_cream
        return {
            "method": "interventional",
            "prediction": "drowning_risk_unchanged",
            "explanation": "ice_cream is a spurious correlation,\n"
                          "not a causal factor. Reducing ice_cream\n"
                          "does not change drowning probability."
        }

    def counterfactual_inference(self, observed="fell_on_banana_skin"):
        """反事实推理——"如果当时没做 X 会怎样""""
        return {
            "method": "counterfactual",
            "question": "If he hadn't stepped on the banana peel, would he have fallen?",
            "answer": "No — the banana peel was the cause.\n"
                      "Counterfactual world: clean floor → no fall."
        }

# 对比输出：
# LLM（相关性）: "吃冰淇淋的人更容易溺水，应该禁止冰淇淋销售"
# 因果推理: "冰淇淋和溺水的关联是夏季高温导致的虚假相关"
```

### 四、记忆（Memory）

**概念**：人的记忆分三层（和认知科学一致）：

1. **感觉记忆（Sensory）**：持续 < 1 秒。你眨眼时视网膜上残留的画面——LLM 的"attention window"就是这种机制的数字化
2. **工作记忆（Working）**：持续秒到分钟。你心算 17 × 23 时暂存在脑子里的数字
3. **长期记忆（Long-term）**：持续终生。你的童年、专业技能、人生经历

LLM 的记忆问题：它的"长期记忆"就是训练参数——**固化且不可变**。你不能在对话中"学会新东西"然后永远记住它。RAG 是外部记忆的一种折中方案，但它不等于真正的记忆。

**已有实现路径**：

1. **参数化记忆**：通过持续预训练 / 微调让知识融入模型权重（但有灾难性遗忘问题）
2. **注意力机制**：Transformer 的 self-attention 本身就是工作记忆的近似
3. **显式记忆模块**：在模型架构中加入可读写的外部记忆存储（如 Neural Turing Machine）
4. **RAG 外部记忆**：检索 + 生成，工程上最成熟但缺乏真正的"回忆"能力

```python
# LLM 记忆架构对比：从单一窗口到分层记忆

class HierarchicalMemory:
    """分层记忆架构：感觉记忆 + 工作记忆 + 长期记忆"""

    def __init__(self, model, vector_db, episodic_buffer):
        self.model = model
        self.vector_db = vector_db      # 长期记忆：向量数据库（RAG 后端）
        self.episodic_buffer = episodic_buffer  # 工作记忆：对话轮次缓冲区

    def sensory_memory(self, raw_input):
        """感觉记忆：raw input → token embedding（瞬时，≈ attention window）"""
        return self.model.tokenizer.encode(raw_input)

    def working_memory(self, conversation_history):
        """工作记忆：维护当前对话的上下文"""
        self.episodic_buffer.append(conversation_history[-1])
        # 限制大小，超出则压缩摘要
        if len(self.episodic_buffer) > 20:
            self.episodic_buffer = self._summarize(self.episodic_buffer[:-5])
        return self.episodic_buffer

    def long_term_memory(self, query):
        """长期记忆：语义检索 + 生成"""
        # 1. 在向量库中检索最相关的知识片段
        relevant_docs = self.vector_db.similarity_search(query, top_k=5)
        # 2. 把检索结果注入 prompt 让模型生成
        augmented_prompt = self._build_prompt(query, relevant_docs)
        response = self.model.generate(augmented_prompt)
        # 3. （可选）把新学到的知识写回长期记忆
        self.vector_db.add(key=query, value=response)
        return response

    def learn(self, experience):
        """真正的"学习"：把重要经验固化到长期记忆"""
        # 简化：提取 key facts 存入向量库
        facts = self._extract_facts(experience)
        self.vector_db.add_batch(facts)
        # 注意：参数化记忆需要 finetune，成本很高
        # 所以工程上优先用 RAG 而非持续训练
        return facts

    def _summarize(self, history):
        # 用模型自身做对话压缩
        summary_prompt = f"Summarize the following conversation:\n{''.join(history)}"
        return [self.model.generate(summary_prompt)]


# RAG 的局限性：
# RAG = 查字典，不是真正"记住"
# 查字典快但浅，记忆慢但深
# AGI 需要两者的有机组合
```

## 四大原则的协作关系

论文的核心贡献之一是提出这四个原则**不是孤立的**，而是相互依存形成一个完整认知循环：

```
环境感知 → 具身化（通过身体感知世界）
     ↓
符号接地（把感知到的东西命名、分类、关联）
     ↓
因果推理（理解"为什么"和"如果...会怎样"）
     ↓
记忆（把经验存入，供未来调用）
     ↓
回到环境感知（用记忆指导下一次感知和行动）
```

**具身化是入口**——没有身体感知，符号就是无源之水。
**符号接地是桥梁**——把感官信号变成可操作的抽象概念。
**因果推理是引擎**——让系统不只是模式匹配，而是理解规律。
**记忆是积累器**——让每一次经验都不白费，持续增长能力。

## 踩过的坑

1. **LLM 的"幻觉"本质是 grounding 缺失**：模型在统计模式上给出合理但不真实的回答——因为它不知道"真实"是什么触感
2. **RAG 不是真正的记忆**：它是外部检索，模型本身没有"记住"任何东西；检索失败 = 知识丢失
3. **因果推理在 LLM 中极难**：因为 LLM 的训练目标是 next-token prediction（相关性最大化），与因果推断的目标函数根本不同
4. **具身化的数据瓶颈**：VLA 模型受限于真实的机器人交互数据，远少于文本数据——这是当前最大的工程障碍

## 适用 vs 不适用场景

这篇综述本身是理论性的，它指导的方向适用于：

适用：
- 开发真正的自主 agent（不是简单聊天机器人）
- 构建机器人 + 语言的联合系统
- 需要 OOD 泛化能力的场景
- 医疗 / 法律等需要因果推理的高可靠领域

不适用：
- 纯文本生成任务（翻译、摘要、创作）——当前 LLM 已经够用
- 快速原型 / MVP 开发——四大原则的工程化成本高
- 资源极度受限的场景

## 学到什么

- LLM ≠ AGI：LLM 是通往 AGI 的路径之一，但不是终点
- 四大原则（具身、接地、因果、记忆）是论文提炼的 AGI 地基，每一条都有丰富的已有工作可以跟进
- 类比很重要：把生物学认知原理映射到 AI 架构时，类比是理解的第一步——但不要止步于类比，要看具体实现技术
- 当前的工程实践（RAG、VLA、multi-modal）已经是四大原则的"初代实现"，但它们还很粗糙
- 最深刻的洞察：**相关性可以模仿智能的表象，但只有因果性才能真正产生理解**

## 历史小故事（可跳过）

- 1990：Harnad 提出"符号接地问题"——那时连互联网都没普及
- 2009：Neural Turing Machine 首次提出"可读写外部记忆"——想法超前了整整十年
- 2017：Transformer 论文诞生——但最初没人想到它能做 LLM
- 2020：GPT-3 展示零样本学习能力——全世界以为 LLM 就是 AGI
- 2022-2023：幻觉、推理失败等问题暴露——学界开始冷静反思
- 2024：RT-2 把 Vision-Language-Action 三模态融合——具身化的重要里程碑
- 2025：这篇综述系统梳理了四大原则，把分散的研究方向统一到 AGI 框架下

## 延伸阅读

- [[cot]] — 思维链（Chain-of-Thought），是因果推理在 LLM 中的近似实现
- [[rag-lewis-2020]] — RAG 原始论文，"记忆"原则的工程化先驱
- [[deepseek-r1]] — DeepSeek-R1，用纯 RL 训练推理能力，与因果推理方向互补
- [[self-rag-2023]] — Self-RAG，让模型自己判断检索结果是否可靠——接地的一种软方式
- [[grounded-videollm-2024]] — Grounded VideoLLM，视觉 grounding 的实例
