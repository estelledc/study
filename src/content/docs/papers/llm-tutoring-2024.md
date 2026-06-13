---
title: "Large Language Models as Tutoring Systems"
来源: https://arxiv.org/abs/2401.00045
日期: 2026-06-13
分类: 机器学习
子分类: educational-tech
provenance: pipeline-v3
---

# Large Language Models as Tutoring Systems

## 一、什么是"辅导系统"？

想象一下传统课堂和一对一辅导的区别。

传统课堂里，一个老师面对几十个学生，只能讲同一个进度、同一套题。但一对一辅导完全不同——老师会观察你哪里错了，然后调整方法：如果你基础薄弱，就拆解步骤；如果你已经懂了，就给你更有挑战性的题目。这种**因材施教**的能力，就是辅导系统的核心。

传统的"智能辅导系统"（Intelligent Tutoring Systems, ITS）早在 1980 年代就开始研究了。它们用一套精心设计的规则来建模学生的知识状态，然后动态调整教学内容。比如著名的 **ALEKS** 数学辅导系统，能追踪你对每个知识点的掌握程度，决定下一步该教什么。

现在问题来了：LLM 的出现，能不能让这种"一对一辅导"的能力，以极低的成本普及到每个人身上？

这就是这篇论文探讨的核心问题。

---

## 二、核心概念

### 2.1 辅导智能（Instructional Intelligence）

辅导智能指的是系统做出有效教学决策的能力，包括：

- **诊断错误**：识别学生犯错的根本原因，而不是只看表面答案
- **搭建脚手架**（Scaffolding）：给学生刚好够用的提示，既不直接给答案，也不让他们完全卡住
- **动态调整难度**：根据学生当前水平实时调整
- **引导反思**：通过提问让学生自己发现问题，而不是被动接受

传统 ITS 把这些能力硬编码在系统里。LLM 则试图通过语言理解本身来"涌现"出这些能力。

### 2.2 适应性（Adaptivity）

适应性是衡量一个辅导系统是否"真的在因材施教"的关键指标。

一个简单的聊天机器人，不管你是初学者还是专家，给出的回答可能差不多。但一个有适应性的辅导系统，会根据你的知识水平调整回答的深度和方式。

论文通过一个实验来检验这一点：把真实辅导场景中学生的关键信息（比如他的错误、他掌握的知识点）从提示词中移除，看看 LLM 的输出是否还会变化。如果变了，说明它确实在利用这些信息做适应性调整。

### 2.3 教学合理性（Pedagogical Soundness）

光有适应性还不够，回答还得"教得对"。好的辅导应该：

- 引导学生自己思考，而不是直接给答案
- 用开放性问题探查学生的理解程度
- 在学生犯错时指出思路偏差，而不是只说"不对"

---

## 三、关键发现

论文对比了 Llama3-8B、Llama3-70B 和 GPT-4o 三个模型在真实辅导场景中的表现。主要结论：

1. **即使最好的模型，也只能勉强模仿 ITS 的适应性**。Llama3-70B 对学生错误的反应有统计学显著的差异，但差距不大。
2. **GPT-4o 倾向于直接给反馈**，而不是像好老师那样用提问引导学生。这在教学中反而是个问题——学生没有机会自己思考。
3. **LLM 缺乏多轮教学规划**。好老师心里有一个"教学剧本"，知道今天讲什么、明天复习什么。LLM 每次都是独立的对话，没有长期规划。
4. **当前 LLM 辅导不太可能达到传统 ITS 的学习效果**。这是一个重要的警示。

---

## 四、代码示例

### 示例 1：用 LLM 模拟一个"脚手架式"辅导对话

下面展示如何用 LLM 构建一个逐步引导式的辅导交互，而不是直接给答案：

```python
"""
脚手架式辅导提示词设计

关键技巧：要求 LLM 不直接给出答案，而是通过提问引导学生自己发现答案。
这模拟了好老师的教学方式。
"""

def scaffolded_tutor_prompt(student_answer, problem, hint_level):
    """
    生成一个"脚手架式"辅导回复。

    参数:
      student_answer: 学生提交的答案
      problem: 原始问题
      hint_level: 提示级别 (1=最间接, 3=最接近答案)

    返回:
      包含辅导策略的系统提示词
    """
    system_prompt = f"""
你是一个数学辅导老师。你的学生正在尝试解决这个问题：

{problem}

学生给出的答案是：{student_answer}

你的任务：
1. 不要直接告诉学生正确答案
2. 根据 hint_level 给出适当程度的引导（1-3级）
3. 用一个开放性问题结束，鼓励学生思考下一步

hint_level 的含义：
  1级：指出方向，但不涉及具体步骤
  2级：提示相关概念或公式
  3级：提示具体的解题步骤

请用简短、友好的语气回复。
"""
    return system_prompt


# 使用示例
problem = "一个长方形的长是 12cm，宽是 5cm。求它的周长。"
student_answer = "60"  # 学生算成了面积（12 × 5 = 60）

prompt = scaffolded_tutor_prompt(student_answer, problem, hint_level=2)
print("=== 系统提示词 ===")
print(prompt)
```

运行这个提示词后，LLM 可能会这样回复学生：

> "你算出了 60，这是长方形的**面积**哦。周长是围绕长方形一周的长度，想想看，周长和面积的计算公式有什么不同呢？"

这就是"搭建脚手架"——学生知道了自己混淆了概念，但需要自己回忆正确的公式。

### 示例 2：评估 LLM 辅导的"适应性"

下面展示如何测试一个 LLM 是否具有教学适应性。思路是：给同一个问题不同版本的提示词（有的包含学生信息，有的不包含），比较 LLM 的回答是否有显著差异：

```python
"""
适应性评估框架（简化版）

通过对比"全信息提示"和"缺信息提示"下 LLM 输出的差异，
来判断 LLM 是否在真正利用学生信息进行适应性调整。
"""

from typing import Dict, List
import json

# 一个真实的辅导场景
scenario = {
    "student_error": "学生在解方程时，把 -3x = 9 两边同时除以 -3 得到了 x = -27",
    "correct_solution": "x = 9 / (-3) = -3",
    "knowledge_component": "一元一次方程求解",
    "problem": "解方程：-3x = 9"
}

def full_context_prompt(scenario: dict) -> str:
    """包含完整学生信息的提示词"""
    return f"""
你是一个数学辅导老师。请帮助学生解决这个问题：

问题：{scenario['problem']}
正确答案：{scenario['correct_solution']}

学生犯的错误：{scenario['student_error']}
涉及的知识点：{scenario['knowledge_component']}

请给出针对性的辅导回复。
"""

def stripped_context_prompt(scenario: dict) -> str:
    """移除了学生错误和知识点的提示词"""
    return f"""
你是一个数学辅导老师。请帮助学生解决这个问题：

问题：{scenario['problem']}
正确答案：{scenario['correct_solution']}

请给出回复。
"""

# 调用 LLM 并比较（伪代码，实际需用 embedding + 统计检验）
full_response = call_llm(full_context_prompt(scenario))
stripped_response = call_llm(stripped_context_prompt(scenario))

print("=== 全信息提示下的回复 ===")
print(full_response)
print("\n=== 缺信息提示下的回复 ===")
print(stripped_response)

# 计算两个回复的相似度（如用余弦相似度）
# 如果相似度很高，说明 LLM 没有利用学生信息 → 缺乏适应性
# 如果相似度很低，说明 LLM 确实根据学生信息调整了回复 → 有适应性
def similarity_score(response_a: str, response_b: str) -> float:
    """
    简化版：用文本重叠率估算相似度
    实际研究中应使用 sentence embedding + t-test
    """
    words_a = set(response_a.lower().split())
    words_b = set(response_b.lower().split())
    intersection = words_a & words_b
    union = words_a | words_b
    return len(intersection) / len(union) if union else 0

similarity = similarity_score(full_response, stripped_response)
print(f"\n回复相似度: {similarity:.2%}")
if similarity > 0.8:
    print("⚠️  高相似度暗示 LLM 可能没有利用学生信息做适应性调整")
else:
    print("✓  低相似度暗示 LLM 确实在根据学生信息调整回复")
```

这个框架的核心思想很简单：**如果你拿走学生的信息，LLM 的回答还一样吗？** 如果一样，那它就没有在做真正的"因材施教"。

---

## 五、为什么这很重要？

### 5.1 教育公平的角度

传统上一对一辅导价格昂贵，只有少数家庭负担得起。如果 LLM 能提供接近真人导师的辅导质量，那将极大地缩小教育资源的差距。这也是为什么很多人对"AI 导师"充满期待。

### 5.2 但论文给出了冷静的提醒

研究发现，当前 LLM 在教学方面有几个根本性局限：

| 能力 | 传统 ITS | 当前 LLM |
|------|---------|---------|
| 学生知识建模 | ✅ 显式建模 | ❌ 无持久记忆 |
| 多轮教学规划 | ✅ 有教学策略 | ❌ 逐轮独立回复 |
| 错误根因分析 | ✅ 基于知识图谱 | ⚠️ 部分能力 |
| 适应性调整 | ✅ 精确控制 | ⚠️ 微弱信号 |
| 情感共情 | ❌ 有限 | ✅ 意外地好 |

论文特别指出，LLM 在**共情**方面甚至超过了人类导师——80% 的标注者更喜欢 LLM 的温柔和鼓励态度。这是一个有趣的发现：LLM 可能不是"更好的老师"，但可以是一个"更耐心的陪练"。

### 5.3 未来方向

论文提出了"教学引导"（Pedagogical Steering）的概念——与其指望 LLM 自己学会教学，不如用外部框架来引导它。比如：

- 用**过渡图**（transition graph）定义多轮教学的流程
- 用**少样本提示**（few-shot prompting）注入优秀教师的对话范例
- 结合传统 ITS 的知识图谱，弥补 LLM 缺乏结构化知识的短板

这种"LLM + 传统 ITS"的混合架构，可能是短期内最可行的路径。

---

## 六、学习小结

这篇论文的核心观点可以用一句话概括：

> **LLM 作为辅导系统有潜力，但目前还不够。**

它不像传统 ITS 那样精确可控，但在共情和自然语言交互上有独特优势。未来的方向不是"用 LLM 取代 ITS"，而是把两者的优势结合起来。

### 关键术语回顾

- **ITS（Intelligent Tutoring System）**：智能辅导系统，用规则建模学生知识的传统方法
- **适应性（Adaptivity）**：系统根据学生个体差异调整教学的能力
- **脚手架（Scaffolding）**：给学生刚好够用的帮助，引导其自主发现答案
- **教学引导（Pedagogical Steering）**：用外部框架引导 LLM 的教学行为
- **Productive Failure（生产性失败）**：一种教学方法，先让学生尝试解决难题，再讲解答案

---

## 七、思考题

1. 如果你要用 LLM 做一个数学辅导工具，你会如何设计"脚手架"提示词？
2. 论文说 LLM 缺乏多轮教学规划。你觉得有什么办法可以让 LLM "记住"之前教过什么？
3. 在什么学科或场景中，你认为 LLM 辅导最可能超越传统 ITS？为什么？

这些问题没有标准答案，留给你自己思考。
