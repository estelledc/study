---
title: FORT-Searcher
来源: https://arxiv.org/abs/2606.12087
日期: 2026-06-13
分类: 机器学习
子分类: 搜索智能体
provenance: pipeline-v3
---

# FORT-Searcher: Synthesizing Shortcut-Resistant Search Tasks for Training Deep Search Agents

## 一句话概括

这篇论文说：现有的深度搜索训练数据看起来很难，但其实模型可以走"近道"快速找到答案，所以训练效果不好。FORT 提出了一套方法，专门制造那些"没有近道可走"的题目，用来训练更强的搜索智能体。

## 日常类比：寻宝游戏

想象你在组织一个寻宝游戏。你设计了 5 条线索，每条线索指向下一个地点，最终到达宝藏。但问题是——有聪明的玩家根本不按顺序找，他们直接问主持人："宝藏在哪？"或者在第一条线索还没看完时就猜到了答案。

这样的寻宝游戏看起来复杂（5 条线索嘛），但实际上玩家不需要走完整个流程就能赢。

FORT 做的事情就是：重新设计寻宝游戏，确保玩家**必须**按照完整的线索链走，没法跳步、没法猜、没法靠"我知道答案"来作弊。

## 背景：什么是深度搜索智能体？

传统的问答系统是这样的：你问一个问题，系统去数据库里找答案，给你。比如你问"张三的老师是谁？"，系统查一下关系表就告诉你。

深度搜索智能体（Deep Search Agent）不一样。它面对的是一个开放世界的问题，比如：

> "哪位植物学家描述的蕨类物种，其种加词来源于一条山脉名称，且他的博士导师还指导过一位以发现某种兰花闻名的植物学家？"

这种问题，你没法用一个简单的数据库查询回答。智能体需要：

1. 理解问题中的多个约束条件
2. 在互联网上反复搜索，逐步收集证据
3. 把分散在不同来源的信息拼在一起
4. 最后给出答案

这就是"深度搜索"——需要多轮、多步骤的证据收集。

## 核心问题：结构复杂 ≠ 真的难

现有的训练数据合成方法，通常通过增加"结构复杂度"来提升题目难度，比如：

- 增加搜索的"跳跃次数"（hop count）
- 构建更复杂的知识图谱
- 增加证据的分散程度

但论文指出：**结构上的复杂，不等于实际搜索时的困难。**

原因很简单：即使题目设计了 10 条线索，如果其中某一条线索本身就足够锁定答案，或者几条线索出现在同一个网页上，模型就可以走"近道"，不需要走完所有步骤。

论文把这种"近道"称为 **Shortcut（捷径）**。

## 四大捷径模式

这是论文最核心的贡献之一。作者形式化地识别了四种捷径：

### 1. 单一线索选择性 (Single-clue Selectivity)

一条线索就把候选答案缩小到只剩一两个。

**例子：**

> 问题：「哪部电影由导演 A 执导，主演是演员 B，在 2020 年上映，票房超过 10 亿美元？」

如果"由导演 A 执导"这一条就已经能唯一确定电影了，那后面三条线索就形同虚设。模型搜一次就知道答案。

### 2. 证据共覆盖 (Evidence Co-coverage)

多条线索的答案出现在同一个网页上。

**例子：**

> 你构造了一道题，需要验证"某人出生于某城市"和"某人在某公司工作"两条线索。结果维基百科一页就同时说了这两件事。模型只需要搜一次 Wikipedia，两条线索都验证了。

### 3. 暴露常数 (Exposed Constants)

题目中直接给出了本该通过搜索才能发现的精确信息。

**例子：**

> 问题：「已知某人的身份证号前六位是 110101，他毕业于哪所大学？」

身份证号前六位根本不该出现在题目里——这应该是模型需要通过搜索才能发现的中间信息。直接暴露它，后面的搜索步骤就被跳过了。

### 4. 先验知识绑定 (Prior-knowledge Binding)

模型凭借预训练时学到的知识，在搜索之前就猜出了答案。

**例子：**

> 问题：「2024 年诺贝尔物理学奖得主是谁？」

如果模型在训练数据中见过这个问题，它可能根本不需要搜索就直接回答。这对训练"搜索能力"毫无帮助。

## FORT 框架：如何制造"没有近道"的题目

FORT（Framework of Shortcut-Resistant Training-Data Synthesis）针对上述四种捷径，在每个环节做了控制：

### 实体选择阶段

- 选冷门（long-tail）实体作为问题的核心，降低模型"恰好知道答案"的概率
- 避免选那些在训练数据中高频出现的知名人物/事件

### 证据图构建阶段

- 从多种异构来源收集事实，降低"共覆盖"风险
- 构建衍生事实（derived facts），而不是直接从原文抄
- 选择单独看很弱、但组合起来才有辨识度的事实

### 问题表述阶段

- 隐藏中间实体的精确名称，不让模型直接拿来搜索
- 将精确数值模糊化为真实范围或类别描述

### 对抗性优化阶段

- 用一个强大的搜索智能体去"攻击"每道草稿题目
- 如果模型能走捷径或题目有歧义，就修复或删除

## 代码示例

### 示例一：衡量一个问题的"捷径程度"

下面是一个简化的伪代码，展示如何检测四种捷径：

```python
def detect_shortcuts(question, constraints, retrieval_results):
    """
    检测一道题目是否存在四种捷径模式。

    Args:
        question: 问题的文本
        constraints: 问题中包含的约束条件列表，如 ["出生于北京", "毕业于清华"]
        retrieval_results: 搜索结果，每个元素包含 {query, snippets, urls}

    Returns:
        shortcuts: 检测到的捷径类型列表
    """
    shortcuts = []

    # 1. 检测单一线索选择性
    # 逐个移除约束，看剩下的约束是否仍能唯一确定答案
    for i, constraint in enumerate(constraints):
        remaining = [c for j, c in enumerate(constraints) if j != i]
        candidate_pool = filter_candidates(remaining)
        if len(candidate_pool) <= 2:
            shortcuts.append({
                "type": "single_clue_selectivity",
                "clue": constraint,
                "remaining_candidates": len(candidate_pool)
            })

    # 2. 检测证据共覆盖
    # 检查是否有单个搜索结果同时覆盖了多条线索
    for url, results in group_by_url(retrieval_results):
        covered_constraints = check_covered_constraints(results)
        if len(covered_constraints) >= 2:
            shortcuts.append({
                "type": "evidence_co_coverage",
                "url": url,
                "covered_constraints": covered_constraints
            })

    # 3. 检测暴露常数
    # 检查题目中是否包含可直接用于搜索的精确信息
    exposed = extract_constants_from_question(question)
    if exposed:
        shortcuts.append({
            "type": "exposed_constants",
            "constants": exposed
        })

    # 4. 检测先验知识绑定
    # 检查模型是否在获取证据之前就提到了答案
    if model_answer_time < first_evidence_time:
        shortcuts.append({
            "type": "prior_knowledge_binding"
        })

    return shortcuts
```

### 示例二：FORT 的数据合成流程

```python
class FORTDataSynthesizer:
    """
    FORT 数据合成器的主流程。

    核心思路：
    1. 选一个冷门实体作为答案
    2. 构建证据图，确保线索分散
    3. 生成问题，模糊化精确值
    4. 用对抗性搜索验证没有捷径
    """

    def __init__(self, retriever, llm):
        self.retriever = retriever
        self.llm = llm

    def synthesize(self, seed_entity):
        # Step 1: 实体选择 - 选冷门的
        entity = self.select_long_tail_entity(seed_entity)

        # Step 2: 构建证据图
        graph = self.build_evidence_graph(entity)

        # 从异构来源收集事实，降低共覆盖
        facts = []
        for source in ["wikipedia", "academic_paper", "news", "government_record"]:
            source_facts = self.collect_facts(entity, source)
            facts.extend(source_facts)

        # 构建衍生事实（不直接从原文复制）
        derived_facts = self.construct_derived_facts(facts)

        # Step 3: 生成问题
        question = self.formulate_question(
            constraints=derived_facts,
            fuzz_constants=True  # 将精确值模糊化
        )

        # Step 4: 对抗性验证
        shortcuts = self.adversarial_check(question, entity)
        if shortcuts:
            # 有捷径，修复或丢弃
            return self.refine_or_discard(question, entity, shortcuts)

        # 生成完整的搜索轨迹
        trajectory = self.generate_trajectory(question, entity)

        return {
            "question": question,
            "answer": entity,
            "trajectory": trajectory,
            "constraints": derived_facts
        }

    def select_long_tail_entity(self, seed):
        """选择长尾实体，降低先验知识绑定的概率"""
        candidates = self.find_related_entities(seed)
        # 按训练数据中出现频率排序，选最冷门的
        scored = [(e, self.count_training_frequency(e)) for e in candidates]
        scored.sort(key=lambda x: x[1])
        return scored[0][0]  # 选出现频率最低的

    def construct_derived_facts(self, raw_facts):
        """
        构建衍生事实。
        原始事实可能直接出现在某个网页上，
        衍生事实需要模型综合多个来源才能得出。
        """
        derived = []
        for fact in raw_facts:
            # 变换表达方式，避免精确匹配
            paraphrased = self.paraphrase(fact)
            # 或者从多个事实中推理出新事实
            combined = self.combine_facts(fact, random.choice(raw_facts))
            derived.append(combined or paraphrased)
        return derived

    def formulate_question(self, constraints, fuzz_constants=False):
        """
        将约束条件转化为自然语言问题。
        fuzz_constants=True 时，会将精确数值替换为范围描述。
        """
        question_parts = []
        for c in constraints:
            if fuzz_constants and is_numeric(c):
                # 把"出生于1985年"变成"出生于1980年代中期"
                c = self.fuzz_to_range(c)
            question_parts.append(c)

        question = self.llm.generate(
            prompt=f"请用自然语言描述以下约束条件，使它们构成一个有挑战性的问题：{'; '.join(question_parts)}"
        )
        return question

    def adversarial_check(self, question, answer):
        """
        用一个强搜索智能体去尝试解题，
        如果它走了捷径（搜索次数太少），就标记为有问题。
        """
        trajectory = self.run_search_agent(question, max_turns=50)
        shortcuts = detect_shortcuts(question, trajectory.constraints, trajectory.results)

        # 额外检查：答案是否在搜索早期就出现了？
        answer_hit_time = self.get_answer_hit_time(trajectory)
        total_cost = len(trajectory.queries)
        if answer_hit_time < total_cost * 0.2:
            shortcuts.append({
                "type": "early_exposure",
                "hit_ratio": answer_hit_time / total_cost
            })

        return shortcuts
```

## 关键指标：怎么判断一道题真的难？

论文提出了三个可观测的指标，用来衡量训练数据的真实难度：

| 指标 | 符号 | 含义 | 好的数据集应该 |
|------|------|------|----------------|
| 求解成本 | Ω̂ | 模型平均需要多少次搜索 | 越高越好 |
| 答案命中时间 | T̄_hit | 答案最早在第几步被找到 | 越晚越好 |
| 先验捷径率 | p̂_prior | 模型在搜索前就猜出答案的比例 | 越低越好 |

如果一个数据集的求解成本很高（搜了很多次），但答案命中时间很早（答案早就出现了），说明模型大部分时间在做无用功——验证已经知道的东西。这不是好的训练信号。

好的训练数据应该让模型**不得不**搜索很久才能看到答案。

## 实验结果

FORT-Searcher 只在 BrowseComp、BrowseComp-ZH 等基准上做了实验。关键结果：

- 只用监督微调（SFT），不做强化的 FORT-Searcher 在同等规模的开源搜索智能体中表现最好
- FORT 生成的数据确实诱导了更长的"答案出现前的搜索"
- 相比现有开源数据集，FORT 数据中的四种捷径模式都显著减少

## 总结

这篇论文的核心洞察可以用一句话概括：

> **题目看起来难，不代表搜索过程真的难。**

现有方法只管"结构设计"，不管"实际搜索路径"。FORT 的价值在于引入了"捷径感知"的视角，系统地识别并封堵了四条近道。这就像是在设计考试时，不仅要看知识点覆盖广不广，还要检查学生能不能靠猜题、靠背原题、靠老师漏出的答案来拿高分。

对于正在学习搜索智能体的同学来说，这篇论文提醒我们：训练数据的质量不在于题目的数量或结构的复杂度，而在于它能否真正迫使模型执行预期的搜索过程。

## 延伸思考

1. FORT 的方法是否可以迁移到其他领域？比如代码生成、数学推理？这些领域同样存在"捷径"问题。
2. 对抗性验证阶段需要一个"强搜索智能体"，如果这个智能体本身不够强，会不会漏掉一些隐蔽的捷径？
3. FORT 只用了 SFT，没有用强化学习。结合 RL 会不会有更好的效果？论文提到这是未来工作方向。
