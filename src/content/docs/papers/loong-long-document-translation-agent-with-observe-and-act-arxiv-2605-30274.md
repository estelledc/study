---
title: Loong: 类人长文档翻译 Agent — Observe-and-Act 自适应上下文选择
来源: https://arxiv.org/abs/2605-30274
日期: 2026-06-13
分类: 机器学习
子分类: 模型与训练
provenance: pipeline-v3
---

# Loong: 类人长文档翻译 Agent 学习笔记

## 一句话概括

Loong 是一个能像人一样翻译长文档的 AI Agent——它不是把整篇文档一股脑塞给模型，而是通过"观察—行动"(Observe-and-Act)的方式，主动回忆之前看过的信息，智能选择最有用的上下文来指导翻译。

## 从日常类比开始

想象你在翻译一本 300 页的小说。

**没有 Loong 的做法**：你把 300 页一次性交给翻译人员，但人的注意力有限——翻到第 280 页时，你早就忘了第 15 页里女主角的名字叫"艾琳"。

**Loong 的做法**：你每次只翻译 1-2 页，但手边有三个笔记本：

1. **精华本 (Essence)** — 之前每段的简要总结，类似目录提要
2. **例句本 (Exemplar)** — 之前遇到过的相似句对，帮你参考翻译风格
3. **人名地名本 (Entity)** — 记录所有专有名词的统一译名

当你翻译第 200 页时，不会翻遍所有笔记，而是先"观察"当前句子需要什么信息，再"行动"去对应的本子里找最相关的几页。这就是 **Observe-and-Act**。

## 核心问题：长文档翻译难在哪？

大语言模型翻译短文本效果很好，但长文档有两个致命问题：

1. **上下文窗口有限**：再大的模型也有"天花板"，300 页塞不进去
2. **信息冗余**：就算勉强塞进去，模型也会淹没在大量无关信息中，反而翻译得更差

传统的分块翻译 (Chunk-based Translation) 虽然解决了窗口限制，但各段之间容易脱节——同一个人被翻译成不同名字，前后语气不一致。

## Loong 的解决方案：3E 记忆模块

Loong 的核心创新在于 **3E Memory**，三个记忆维度各有分工：

| 维度 | 全称 | 作用 | 类比 |
|------|------|------|------|
| **E**ssence | 精华记忆 | 之前段落的摘要总结 | 读书时的读书笔记 |
| **E**xemplar | 例句记忆 | 历史上相似句子对的记录 | 翻译时的参考例句 |
| **E**ntity | 实体记忆 | 人名、地名、术语的统一翻译 | 术语表和译名对照表 |

这不是简单地"把所有历史信息堆在一起"。Loong 的关键在于：**它不会被动地让模型 attends 到所有历史，而是主动推理"现在到底需要什么"**。

## Observe-and-Act：核心机制

这是 Loong 最精华的部分。整个过程可以分成两个阶段：

### 阶段一：Observe（观察）

面对当前待翻译的句子，Agent 先问自己几个问题：

- 这个句子提到了哪些实体？人名？地名？专业术语？
- 之前的段落大概讲了什么？（查 Essence）
- 有没有之前翻译过的相似句子可以参考？（查 Exemplar）
- 这些实体之前是怎么翻译的？（查 Entity）

### 阶段二：Act（行动）

基于观察的结果，Agent 从三个记忆维度中**动态选择**最相关的信息，组装成一个精简的上下文，然后翻译。

这个过程不是一次性的。翻译完一句后，新的信息会被写入 3E 记忆，供后面使用。整个流程可以反复循环：

```
观察当前句 → 查询 3E 记忆 → 选择最相关的上下文 → 翻译 → 写入新信息 → 回到观察
```

### 用代码理解这个过程

下面的伪代码展示了 Loong Agent 的核心循环：

```python
class LoongAgent:
    def __init__(self):
        # 3E 记忆存储
        self.essence_memory = []   # 段落摘要列表
        self.exemplar_memory = []  # 相似句对列表
        self.entity_memory = {}    # 实体 → 翻译对照表

    def observe(self, source_sentence, index):
        """
        观察阶段：分析当前句子需要什么信息
        """
        # 提取句中的实体
        entities = extract_entities(source_sentence)

        # 查询三个记忆维度
        relevant_essence = search(self.essence_memory, top_k=2)
        relevant_exemplar = search(self.exemplar_memory, source_sentence, top_k=3)
        relevant_entity = {e: self.entity_memory.get(e, None) for e in entities}

        return {
            "entities": entities,
            "essence": relevant_essence,
            "exemplar": relevant_exemplar,
            "entity": relevant_entity,
        }

    def act(self, observation, source_sentence, llm):
        """
        行动阶段：基于观察构建上下文并翻译
        """
        context = build_context(observation)

        # 构建 prompt，只包含最相关的信息
        prompt = f"""
        翻译以下句子，参考上下文：

        【段落摘要】
        {context['essence']}

        【参考例句】
        {context['exemplar']}

        【实体对照】
        {context['entity']}

        源文本：{source_sentence}
        """

        translation = llm.complete(prompt)
        return translation

    def update_memory(self, source_sentence, translation, observation):
        """
        翻译后：将新信息写入 3E 记忆
        """
        # 更新实体记忆
        for entity in observation['entities']:
            if entity not in self.entity_memory:
                translated_entity = extract_entity_translation(entity, translation)
                self.entity_memory[entity] = translated_entity

        # 存入例句记忆
        self.exemplar_memory.append({
            "source": source_sentence,
            "target": translation
        })

    def translate_document(self, document, llm):
        """
        完整的翻译循环：逐句 Observe-and-Act
        """
        result = []
        essence_window = []

        for i, sentence in enumerate(document):
            # 观察
            observation = self.observe(sentence, i)

            # 行动：翻译
            translation = self.act(observation, sentence, llm)
            result.append(translation)

            # 更新记忆
            self.update_memory(sentence, translation, observation)

            # 定期更新精华记忆（段落摘要）
            essence_window.append(sentence + " | " + translation)
            if (i + 1) % 10 == 0:
                summary = generate_summary("".join(essence_window))
                self.essence_memory.append(summary)
                essence_window = []

        return result
```

## 强化学习：让 Agent 自己优化策略

Loong 的 Observe-and-Act 不是一成不变的。它通过 **强化学习 (Reinforcement Learning)** 自动优化"如何选择上下文"的策略。

具体做法是：Agent 自己生成多条"观察—行动"的推理轨迹 (trajectories)，然后从这些轨迹中构建偏好数据，训练自己做出更好的选择。

这个过程的关键是 **self-generated preference data**——Agent 不需要人工标注数据，它用自己的输出作为训练信号。

### RL 训练的简化示意

```python
# 生成多条 Observe-Act 轨迹
trajectories = []
for _ in range(num_samples):
    observation = agent.observe(sentence, index)
    context = build_context(observation)
    translation = llm.complete(prompt_with_context)
    score = evaluate_translation(translation)  # 用 BLEU/BERTScore 等评分
    trajectories.append({
        "observation": observation,
        "translation": translation,
        "score": score
    })

# 从高分为样本，低分为负样本，构建偏好对
pref_data = construct_preference_pairs(trajectories)

# 用偏好数据微调上下文选择策略
policy = train_policy_with_dpo(pref_data)  # DPO = Direct Preference Optimization
```

## 关键成果

论文中的实验结果很有说服力：

- **多方向翻译提升**：英↔中、德、法三个翻译方向平均提升 **13.0 分**（跨越三个评估指标）
- **领域泛化能力强**：在文学、技术、新闻等不同领域都有稳定提升
- **抗噪声鲁棒**：即使记忆中混入无关信息，Loong 也能正确忽略
- **超长文档稳定**：文档越长，传统方法越差，Loong 的表现越能保持

## 为什么这个思路值得学习

1. **Agent 范式的实用落地**：很多 AI Agent 研究停留在概念阶段，Loong 展示了一个完整的、可运行的 Agent 架构解决真实 NLP 问题
2. **主动记忆 vs 被动记忆**：传统 RAG 是"把所有相关内容都塞进去"，Loong 是"先想清楚需要什么，再去拿"——更贴近人类的认知方式
3. **Observe-and-Act 的通用性**：这个模式不仅适用于翻译，可以推广到代码生成、长文档摘要、多轮对话等任何需要上下文管理的任务

## 总结对照表

| 概念 | 解释 |
|------|------|
| Loong | 一个类人的长文档翻译 Agent |
| 3E Memory | 精华 (Essence) + 例句 (Exemplar) + 实体 (Entity) 三层记忆 |
| Observe | 分析当前翻译需求，查询记忆 |
| Act | 根据观察结果选择最相关上下文，执行翻译 |
| RL 优化 | Agent 用自己的推理轨迹生成偏好数据，优化选择策略 |
| 核心优势 | 不是"记住更多"，而是"知道何时回忆什么" |

## 延伸思考

如果你要用 Loong 的思路做一个自己的 Agent（比如代码审查 Agent），可以套用同样的框架：

- Essence 记忆 → 之前审查过的代码段摘要
- Exemplar 记忆 → 之前发现过的相似 bug 及其修复
- Entity 记忆 → 项目中的函数名、API 规范的统一理解
- Observe-and-Act → 审查某段代码前先想想"这段代码可能出什么问题"，再针对性检查

这种"**先想再查、按需回忆**"的认知模式，可能是 Agent 设计中最有价值的范式。
