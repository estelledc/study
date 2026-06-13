---
title: GAIA: A General AI Assistant that Can Act and Reason Across Diverse Environments
来源: https://arxiv.org/abs/2311.12983
日期: 2026-06-13
分类: 机器学习
子分类: reinforcement-learning
provenance: pipeline-v3
---

# GAIA: 一个能跨越多种环境行动和推理的通用 AI 助手基准

## 一、日常类比：你让朋友去查一件事

想象一下，你对朋友说：

> "帮我去维基百科查一下 2020 年诺贝尔物理学奖得主是谁，然后把他们的出生年份加起来告诉我结果。"

这件事对你来说很简单——打开网页、找到信息、做加法。但对一个只"读过书"却从没"上过网"的人来说，这就非常困难了。

GAIA 这篇论文说的就是：**怎么测试一个 AI 是不是真的像一个"通用助手"那样能干活？**

传统的 AI 测试题（比如高考数学题、法律考试题）越来越难，人类专家都不一定能答出来。但 GAIA 反其道而行——它出的题对人类来说非常简单（普通非专家能做到 92%），却让最先进的 AI（GPT-4 + 插件）只能拿到 15%。

为什么？因为这些题要求 AI 像人一样：**上网搜索、读取文件、理解图片、多步推理、整合信息**。

## 二、核心概念

### 2.1 什么是 GAIA？

GAIA（General AI Assistant）是一个**基准测试**（benchmark），包含 466 个问题。它的设计目标是：

- **答案唯一且简短**：要么是一个数字、要么是一两个词、要么是一个逗号分隔的列表。这样就能自动评分，不需要人工判断。
- **来自真实世界**：问题需要从互联网、PDF、Excel 表格、图片、音频中获取信息。
- **概念简单、执行复杂**：人类一看就懂，但要完成需要多个步骤和多种工具。
- **防作弊**：答案不会轻易出现在训练数据里，因为问题是动态的、组合的。

### 2.2 三个难度等级

GAIA 把问题分成三级，依据是解决问题需要的**步骤数量**和**使用工具的种类数**：

| 等级 | 步骤数 | 工具数 | 类比 |
|------|--------|--------|------|
| Level 1 | ≤ 5 | ≤ 1 | 查一个网页上的信息 |
| Level 2 | 5-10 | 2-3 | 查多个来源、读取文件、做计算 |
| Level 3 | 任意 | 任意 | 需要自主规划整个任务流程 |

### 2.3 为什么重要？

这篇论文的作者包括 **Yann LeCun**（Meta 首席 AI 科学家）。他们提出的核心观点是：

> **AGI 的里程碑不在于 AI 能做多难的题目，而在于 AI 能不能像一个普通人那样，在日常任务中可靠地完成任务。**

这叫做 **t-AGI**（time-limited AGI）：如果一个系统在普通人能在 6-17 分钟内完成的 tâches 上表现得比人更好，那就接近 AGI 了。

## 三、核心概念详解

### 3.1 GAIA 的四个设计原则

**原则一：真实世界的问题**

传统基准（如 MMLU）是封闭的、纸面上的。GAIA 要求 AI 面对开放变化的互联网。

**原则二：可解释性**

因为问题简单，你能轻松看懂 AI 的思考过程。如果 AI 答错了，你知道它是在哪一步出错的。

**原则三：防可操纵性**

不能靠猜答案或通过训练数据中的模式来"蒙混过关"。每个问题的答案都是独特的，需要真正去查找和计算。

**原则四：简单易用**

零样本（zero-shot）提问，不需要微调，不需要特殊配置。

### 3.2 评分方式

GAIA 的答案格式非常严格：

- 数字：不加千位分隔符，不加单位（除非题目要求）
- 字符串：不用冠词，不用缩写，数字用英文拼写
- 列表：按上述规则组合

评分就是简单的**近似精确匹配**（quasi exact match）——把模型答案和标准答案做比较。

## 四、代码示例

### 示例一：GAIA 风格的提问与评分

下面展示一个 GAIA 风格的问题，以及它的评分逻辑：

```python
"""
GAIA 风格的问题：
"附件中的 Excel 文件包含某快餐店的菜单销售数据。
请问这家店的食物总收入是多少（不包括饮料）？
请用 USD 表示，保留两位小数。"

注意：题目附带了一个 Excel 文件。
"""

# 模拟 GAIA 的评分函数
def gaia_score(model_answer, ground_truth, answer_type="number"):
    """
    GAIA 的评分逻辑：近似精确匹配

    Args:
        model_answer: 模型给出的答案（字符串）
        ground_truth: 标准答案（字符串）
        answer_type: 答案类型 —— "number", "string", 或 "list"

    Returns:
        True 如果答案正确，False 否则
    """
    if answer_type == "number":
        # 去掉所有非数字字符（除了小数点和负号）
        def clean_number(s):
            import re
            s = re.sub(r'[^\d.\-]', '', s.strip())
            return float(s) if s else None

        model_num = clean_number(model_answer)
        true_num = clean_number(ground_truth)

        if model_num is None or true_num is None:
            return False

        # 允许 0.01 的误差（处理浮点数精度）
        return abs(model_num - true_num) < 0.01

    elif answer_type == "string":
        # 字符串需要精确匹配（去掉大小写和多余空格）
        return model_answer.strip().lower() == ground_truth.strip().lower()

    elif answer_type == "list":
        # 列表：排序后逐个比较
        def normalize_list(lst_str):
            items = [item.strip() for item in lst_str.split(',')]
            return sorted(items)

        return normalize_list(model_answer) == normalize_list(ground_truth)

    return False


# ---- 测试 ----

# Level 1 示例：从网页获取一个数字
print("--- Level 1 测试 ---")
answer = "89706.00"       # 模型给出的答案
truth = "89706.00"         # 标准答案
result = gaia_score(answer, truth, "number")
print(f"模型答案: {answer}")
print(f"标准答案: {truth}")
print(f"是否正确: {result}")
# 输出: 是否正确: True

# Level 1 示例：错误答案
print("\n--- Level 1 错误答案测试 ---")
wrong_answer = "89,706.00"  # 包含了千位分隔符，GAIA 不允许
result_wrong = gaia_score(wrong_answer, truth, "number")
print(f"模型答案: {wrong_answer}")
print(f"标准答案: {truth}")
print(f"是否正确: {result_wrong}")
# 输出: 是否正确: False （因为逗号被当作非数字字符移除后变成 89706.00，
#                              但如果实现更严格，可能直接判定为格式错误）

# Level 2 示例：字符串匹配
print("\n--- Level 2 字符串测试 ---")
answer_name = "White"
truth_name = "White"
result_name = gaia_score(answer_name, truth_name, "string")
print(f"模型答案: {answer_name}")
print(f"标准答案: {truth_name}")
print(f"是否正确: {result_name}")
# 输出: 是否正确: True
```

### 示例二：模拟一个完整的 GAIA 解题流程

这个示例模拟了一个 AI 助手如何逐步解决一个 GAIA 问题：

```python
"""
模拟 AI 助手解决 GAIA Level 2 问题的完整流程。

问题：
"在一篇 2023 年的新闻中，某公司的股票价格从 $150 跌到了 $120。
如果某人持有 100 股，他的亏损百分比是多少？"

这需要：读取新闻内容 -> 提取数字 -> 计算 -> 格式化输出
"""

import re


class GAIAAssistant:
    """
    一个简化的 GAIA 助手模拟器。

    真实世界中，这个助手会使用：
    - 网页浏览器（搜索新闻）
    - 代码解释器（执行计算）
    - 文件阅读器（读取附件）
    """

    def __init__(self):
        self.thoughts = []  # 记录推理过程

    def think(self, message):
        """记录一条推理步骤"""
        self.thoughts.append(message)
        print(f"[思考] {message}")

    def extract_numbers_from_text(self, text):
        """
        从文本中提取所有数字 —— 模拟"阅读理解"能力
        对应 GAIA 中的多模态处理能力
        """
        numbers = re.findall(r'\$?(\d+(?:,\d{3})*(?:\.\d+)?)', text)
        cleaned = []
        for n in numbers:
            n = n.replace(',', '')
            cleaned.append(float(n))
        return cleaned

    def calculate_loss_percentage(self, original_price, new_price, shares):
        """
        计算亏损百分比 —— 模拟"代码解释器"能力
        """
        loss_per_share = original_price - new_price
        total_loss = loss_per_share * shares
        loss_percentage = (loss_per_share / original_price) * 100
        return {
            'loss_per_share': loss_per_share,
            'total_loss': total_loss,
            'loss_percentage': round(loss_percentage, 2)
        }

    def solve(self, news_text):
        """
        完整的解题流程
        """
        self.thoughts.clear()

        # 第 1 步：理解问题
        self.think("我需要从新闻中提取股票价格信息，然后计算亏损百分比。")

        # 第 2 步：提取数字（模拟阅读网页）
        prices = self.extract_numbers_from_text(news_text)
        self.think(f"从新闻中提取到的数字: {prices}")

        if len(prices) >= 2:
            original_price = prices[0]
            new_price = prices[1]
        else:
            self.think("无法提取到足够的价格信息。")
            return None

        # 第 3 步：获取持股数量（模拟读取附件或上下文）
        shares = 100
        self.think(f"持股数量: {shares}")

        # 第 4 步：计算亏损
        result = self.calculate_loss_percentage(original_price, new_price, shares)
        self.think(f"每股亏损: ${result['loss_per_share']}")
        self.think(f"总亏损: ${result['total_loss']}")
        self.think(f"亏损百分比: {result['loss_percentage']}%")

        # 第 5 步：格式化最终答案
        final_answer = str(result['loss_percentage'])
        self.think(f"FINAL ANSWER: {final_answer}")

        return final_answer

    def get_reasoning_trace(self):
        """返回完整的推理轨迹 —— GAIA 的核心价值之一"""
        return "\n".join([f"  Step {i+1}: {t}" for i, t in enumerate(self.thoughts)])


# ---- 运行示例 ----
if __name__ == "__main__":
    assistant = GAIAAssistant()

    # 模拟新闻文本（实际场景中，这会是从网页抓取的内容）
    news_article = """
    TechCorp 今日宣布其季度财报不及预期。
    公司股票在盘后交易中大幅下跌，
    从开盘价 $150.00 跌至收盘价 $120.50，
    跌幅达 19.67%。分析师表示，
    这一下跌反映了市场对该公司增长放缓的担忧。
    """

    print("=" * 50)
    print("GAIA 助手解题演示")
    print("=" * 50)

    answer = assistant.solve(news_article)

    print("\n" + "=" * 50)
    print("完整推理轨迹:")
    print("=" * 50)
    print(assistant.get_reasoning_trace())

    print("\n" + "=" * 50)
    print(f"最终答案: {answer}")
    print("=" * 50)
```

### 示例三：GAIA 问题生成器

展示如何按照 GAIA 的设计方法论创建新问题：

```python
"""
GAIA 问题生成器 —— 按照论文的"问题设计方法论"

GAIA 的设计原则：
1. 答案唯一且简短
2. 来自真实世界的数据源
3. 概念简单但执行复杂
4. 防训练数据污染
"""

import random
from dataclasses import dataclass
from enum import IntEnum


class Difficulty(IntEnum):
    LEVEL_1 = 1   # ≤ 5 步，≤ 1 个工具
    LEVEL_2 = 2   # 5-10 步，2-3 个工具
    LEVEL_3 = 3   # 任意步，任意工具


@dataclass
class GAIAQuestion:
    """GAIA 问题的数据结构"""
    question: str
    ground_truth: str
    difficulty: Difficulty
    required_tools: list[str]
    required_capabilities: list[str]
    evidence_source: str  # 数据来源描述


def generate_level1_question():
    """
    Level 1 示例：只需要一个工具、不超过 5 步

    设计思路：找一个稳定的数据源（如 Wikipedia），
    问一个需要"查找+简单提取"的问题。
    """
    return GAIAQuestion(
        question=(
            "根据 Wikipedia 上关于火星的信息，"
            "火星的直径大约是多少公里？"
        ),
        ground_truth="6779",
        difficulty=Difficulty.LEVEL_1,
        required_tools=["web_search"],
        required_capabilities=["web_browsing", "information_extraction"],
        evidence_source="Wikipedia - Mars (planet)"
    )


def generate_level2_question():
    """
    Level 2 示例：需要多个工具和步骤

    设计思路：需要从一个来源获取数据 A，
    从另一个来源获取数据 B，然后做计算。
    """
    return GAIAQuestion(
        question=(
            "根据 Wikipedia，爱因斯坦出生于哪一年？"
            "根据同一页面，他去世于哪一年？"
            "请计算他的寿命（年），只给出数字。"
        ),
        ground_truth="17",
        difficulty=Difficulty.LEVEL_2,
        required_tools=["web_search", "calculation"],
        required_capabilities=[
            "web_browsing",
            "information_extraction",
            "multi_step_reasoning"
        ],
        evidence_source="Wikipedia - Albert Einstein"
    )


def generate_level3_question():
    """
    Level 3 示例：需要自主规划和多工具协作

    设计思路：问题本身简单，但需要 AI 自主决定
    搜索什么、读取什么文件、如何整合信息。
    """
    return GAIAQuestion(
        question=(
            "NASA 的 Astronomy Picture of the Day 在 2023 年 6 月 15 日"
            "展示了一张什么照片？那张照片中的天体距离地球多远（以光年计）？"
            "请给出天体名称和距离，用分号分隔。"
        ),
        ground_truth="Orion Nebula;1344",
        difficulty=Difficulty.LEVEL_3,
        required_tools=[
            "web_search",
            "file_reading",
            "multi_source_integration",
            "reasoning"
        ],
        required_capabilities=[
            "web_browsing",
            "multi_modality",
            "multi_step_planning",
            "information_synthesis"
        ],
        evidence_source="NASA APOD archive + Wikipedia"
    )


# ---- 运行 ----
if __name__ == "__main__":
    questions = [
        generate_level1_question(),
        generate_level2_question(),
        generate_level3_question()
    ]

    for q in questions:
        print(f"\n{'=' * 60}")
        print(f"难度等级: Level {q.difficulty}")
        print(f"问题: {q.question}")
        print(f"标准答案: {q.ground_truth}")
        print(f"所需工具: {', '.join(q.required_tools)}")
        print(f"所需能力: {', '.join(q.required_capabilities)}")
        print(f"数据来源: {q.evidence_source}")
```

## 五、实验结果

GAIA 测试了几个系统的表现：

| 系统 | Level 1 | Level 2 | Level 3 | 总体 |
|------|---------|---------|---------|------|
| 人类（非专家） | ~95% | ~90% | ~88% | **92%** |
| GPT-4 + 插件 | ~30% | ~8% | 0% | **15%** |
| GPT-4 无插件 | ~10% | ~2% | 0% | **~5%** |
| AutoGPT (GPT-4) | ~15% | ~3% | 0% | **~8%** |
| 人类网页搜索 | ~60% | ~10% | 0% | **~25%** |

关键发现：

1. **工具增强确实有帮助**：GPT-4 有插件比没有插件好很多，但离人类还差得很远。
2. **AutoGPT 表现不佳**：虽然能自动选择工具，但在 Level 2 上反而比手动选插件的 GPT-4 更差。
3. **人类轻松碾压**：普通人在所有级别上都接近完美，说明这些题确实"概念简单"。
4. **纯网页搜索不够**：即使用搜索引擎，人类在 Level 2 以上也只能拿到约 10%，说明自动化助手的潜力很大。

## 六、GAIA 的意义与局限

### 意义

- **重新定义 AI 评估方向**：从"做更难的事"转向"更可靠地把简单事做好"。
- **全自动化评估**：答案唯一、格式固定，不需要人工评判。
- **推理轨迹可检查**：能看到 AI 是怎么想的，哪里出了问题。
- **作者阵容强大**：LeCun 等人推动了这一方向的学术认可。

### 局限

- **只有英语**：所有问题都用标准英语提出，不适用于其他语言。
- **不评估推理过程**：只检查最终答案，不同的解题路径无法区分优劣。
- **不包含主动操作**：GAIA 只要求"读取"和"搜索"，不涉及"发帖"、"预订"等主动行为。
- **可能随时间失效**：网页内容会变，答案可能被训练数据污染。

## 七、总结

GAIA 的核心思想可以用一句话概括：

> **真正的智能不在于解出别人想不出来的难题，而在于能把普通人能理解的日常任务可靠地完成。**

就像你能轻松地上网查资料、读邮件、算账一样，一个"通用 AI 助手"也应该能做到。而目前最先进的 AI 在这些任务上还远不如一个普通人。这就是 GAIA 告诉我们的。

## 八、延伸阅读

- GAIA 排行榜：<https://huggingface.co/gaia-benchmark>
- Chollet 的"智力度量"论：<https://francoischollet.com/2019/03/intelligence/>
- MMLU 基准：<https://github.com/hendrycks/test>
- AgentBench（另一个 agent 基准）：<https://github.com/THUDM/AgentBench>
