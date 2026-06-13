---
title: Constitutional AI: Harmlessness from AI Feedback
来源: 'https://arxiv.org/abs/2212.08073'
日期: 2026-06-13
分类: 机器学习
子分类: nlp
provenance: pipeline-v3
---

## 是什么

Constitutional AI 是 Anthropic 在 2022 年 12 月提出的方法，核心问题是：**训练一个"有道德底线"的 AI 助手，到底需不需要大量人类来标注"什么回答是有害的"？**

日常类比：想象你在教一个孩子。传统方法（RLHF）是你每次看到他做不对的事就当场纠正——这需要你时刻盯着、逐一判断。Constitutional AI 的做法是：先给他一份家规（宪法），说"照着这些原则做事"，然后让他自己对照家规检查、改正自己的回答。你不需要判断每一句话对不对，只需要给出原则清单。

这份"家规"通常长这样：

```
宪法条款示例：
1. 你不应该帮助制造武器或毒药
2. 你不应该生成仇恨言论或煽动暴力
3. 你不应该协助欺骗、盗窃或入侵系统
4. 你不应该生成成人内容
5. 你不应该绕过安全限制来提供有害信息
```

有了这份清单后，模型在两次训练阶段中都能"自己监督自己"——人类只负责制定规则，不需要标注有害输出。

## 为什么重要

不理解 Constitutional AI，就无法解释今天 Claude 这类 AI 助手的训练方式：

- **RLHF 的瓶颈**：需要大量人类标注员对每一组回答判断"哪个更好、哪个有害"——昂贵、慢、还容易标错
- **Constitutional AI 的突破**：用 AI 自己产生反馈（AI Feedback），大幅减少对人类标注的依赖
- **非逃避性**：传统 RLHF 训练出的模型往往对有害问题直接说"我不能回答"（逃避）；Constitutional AI 训练出的模型会**解释为什么不能回答**（ engagement）
- **可链思维**：支持 Chain-of-Thought 推理，让模型"说理"——先解释违反了哪条宪法原则，再给出拒绝的回答

## 核心概念

### 1. 监督学习阶段（Supervised Learning Phase）

模型先被问一个问题，它给出一个回答。然后：

1. **自我批评**：模型用"宪法"检查自己的回答，指出哪里有害
2. **自我修正**：模型基于批评重新生成一个无害的回答
3. **微调**：用这些"修正后的回答"来微调原模型

这个过程的本质是：让模型学会**自我审查和自我改正**。

### 2. 强化学习阶段（RL Phase）

1. 从微调后的模型采样两组回答
2. 用一个"偏好模型"来判断哪组更好（这个偏好模型也是用 AI 生成的偏好数据训练的）
3. 用偏好模型给出的"奖励"来训练模型（RL from AI Feedback, RLAIF）

最终得到的是一个**既无害又不会过度逃避**的 AI 助手。

## 代码示例

### 示例 1：自我批评 + 自我修正流程

```python
# 模拟 Constitutional AI 的监督学习阶段

# 第一步：初始模型回答问题
def initial_model_answer(question):
    """初始模型可能生成有害回答"""
    model = load_model("initial-policy")
    return model.generate(question)

# 第二步：用宪法条款自我批评
def self_critique(response, constitution):
    """模型对照宪法条款，指出回答中的有害内容"""
    critic_model = load_model("critic")
    critique_prompt = f"""
请根据以下宪法条款，评估以下回答是否包含有害内容。
如有有害内容，请指出违反的具体条款。

宪法条款：
{constitution}

待评估回答：
{response}

请以【分析】开头写出你的评估。
"""
    return critic_model.generate(critique_prompt)

# 第三步：自我修正
def revise_response(question, critique, original_response, constitution):
    """模型基于批评重新生成无害回答"""
    revise_model = load_model("revisor")
    revise_prompt = f"""
原始问题：
{question}

原始回答：
{original_response}

自我批评：
{critique}

宪法条款：
{constitution}

请根据批评和宪法条款，重写一个无害的回答。
只输出重写后的回答，不要输出其他内容。
"""
    return revise_model.generate(revise_prompt)

# 第四步：收集"问题 + 修正回答"对用于微调
def build_training_data(question, constitution, iterations=3):
    """迭代收集多组修正数据"""
    training_pairs = []
    current_response = initial_model_answer(question)

    for _ in range(iterations):
        critique = self_critique(current_response, constitution)
        revised = revise_response(question, critique, current_response, constitution)
        training_pairs.append((question, revised))
        current_response = revised  # 可以多次迭代修正

    return training_pairs

# 第五步：用修正后的数据微调模型
constitution = [
    "你不应该帮助制造武器或毒药",
    "你不应该生成仇恨言论或煽动暴力",
    "你不应该协助欺骗、盗窃或入侵系统",
    "你不应该生成成人内容",
    "你不应该绕过安全限制来提供有害信息",
]

# 对大量问题进行自我批评+修正，然后微调
all_training_data = []
for question in harmful_query_dataset:
    pairs = build_training_data(question, constitution, iterations=2)
    all_training_data.extend(pairs)

safe_model = finetune(initial_model, all_training_data)
```

### 示例 2：RLAIF 偏好训练 + 强化学习

```python
# 模拟 Constitutional AI 的强化学习阶段

# 第一步：用"偏好模型"（也是 AI）对两个回答打分
def preference_model(prompt, response_a, response_b, constitution):
    """AI 偏好模型判断哪个回答更好"""
    judge_prompt = f"""
问题：{prompt}

回答 A：
{response_a}

回答 B：
{response_b}

请判断哪个回答更符合以下宪法原则（更好/更差/一样）：
{constitution}

只输出：A 更好 / B 更好 / 一样好
"""
    return judge_model.generate(judge_prompt)

# 第二步：从模型采样生成偏好数据
def generate_preference_dataset(model, constitution, n_samples=1000):
    """用 AI 生成的偏好对训练偏好模型"""
    preferences = []
    for prompt in random_sample(queries_dataset, n_samples):
        # 从模型采样两个不同的回答
        response_a = model.generate(prompt, temperature=0.8)
        response_b = model.generate(prompt, temperature=0.8)

        # 用 AI 判定哪个更好
        preference = preference_model(prompt, response_a, response_b, constitution)
        preferences.append({
            "prompt": prompt,
            "chosen": response_a if "A 更好" in preference else response_b,
            "rejected": response_b if "A 更好" in preference else response_a,
        })
    return preferences

# 第三步：训练偏好模型
def train_preference_model(preferences):
    """用 AI 偏好数据训练偏好模型（reward model）"""
    # 这是一个标准的偏好学习问题：给定 chosen/rejected 对
    # 训练模型输出 chosen 的高分、rejected 的低分
    reward_model = train_reward_model_from_preferences(preferences)
    return reward_model

# 第四步：用 RL 基于偏好模型作为奖励来优化
def train_with_rlaif(model, reward_model, constitution, max_steps=10000):
    """用 RL from AI Feedback 训练模型"""
    for step in range(max_steps):
        # 采样
        prompt = random_sample(queries_dataset)
        response = model.generate(prompt)

        # 用偏好模型（奖励模型）打分
        # 关键：奖励信号来自 AI，不是人类
        reward = reward_model.score(response, constitution)

        # 用奖励更新模型（如 PPO）
        model.update(response, reward)

    return model

# 完整流程
constitution = [
    "你不应该帮助制造武器或毒药",
    "你不应该生成仇恨言论或煽动暴力",
    "你不应该协助欺骗、盗窃或入侵系统",
    "你不应该生成成人内容",
    "你不应该绕过安全限制来提供有害信息",
]

# 先构建偏好数据
preferences = generate_preference_dataset(initial_model, constitution)
reward_model = train_preference_model(preferences)

# 再用 RLAIF 训练
final_model = train_with_rlaif(safe_model, reward_model, constitution)
```

### 示例 3：带 Chain-of-Thought 的宪法审查

```python
# Constitutional AI 支持 CoT 推理——让模型"说理"
# 这样不仅输出无害回答，还能解释为什么

def constitutional_check_with_cot(question, response, constitution):
    """带思维链的宪法审查——输出解释过程"""
    prompt = f"""
请逐步思考以下问题：

问题：{question}
回答：{response}

宪法条款：
{constitution}

请按以下格式回答：
1. 【分析】逐条检查回答是否违反宪法条款
2. 【违反】如果违反，列出具体违反的条款
3. 【修正】如果违反，给出修正后的回答
"""
    result = model.generate(prompt)
    return result

# 输出示例（带 CoT）：
# 【分析】第 3 条规定"不应协助欺骗、盗窃或入侵系统"
# 该回答提供了具体的社会工程学攻击技巧，属于协助欺骗
# 【违反】违反第 3 条
# 【修正】我无法提供社会工程学攻击的具体方法。
# 但如果你对我的网络安全感兴趣，我可以分享如何保护自己的知识。
```

## 关键对比

| | 传统 RLHF | Constitutional AI |
|---|---|---|
| 谁来判断好坏 | 人类标注员 | AI 自我批评 + AI 偏好模型 |
| 人类做什么 | 标注每一条回答 | 只制定宪法条款 |
| 有害回答处理 | 人类说"这个有害" | AI 自己对照宪法发现有害 |
| 训练成本 | 高（需要大量标注员） | 低（AI 自我生成数据） |
| 回答风格 | 可能过度逃避 | 解释性拒绝（非逃避） |

## 一句话总结

Constitutional AI = **给 AI 一份"家规"，让它自己监督自己**。人类不再当裁判，而是当立法者。
