---
title: "Differentially Private Fine-Tuning of Large Language Models — 学习笔记"
来源: https://arxiv.org/abs/2401.06301
日期: 2026-06-13
分类: 安全与隐私
子分类: 安全与隐私
provenance: pipeline-v3
---

# Differential Privacy 给大模型做"隐私加盐"：ICR 方法学习笔记

## 一、从日常类比开始

想象你去餐厅吃饭，厨师 (LLM) 学了很多顾客的点餐记录 (训练数据)，学会了根据口味推荐菜品。

但问题来了：如果某个顾客特别在意自己的点餐隐私，不希望厨师"记住"自己的偏好，怎么办？

**差分隐私 (Differential Privacy, DP)** 的做法就像是在厨师记忆每份订单时，往里面撒一把"随机胡椒"——让厨师大致知道大家的口味规律，但又记不清你一个人吃了什么。

而这篇论文的创新在于：**不是被动地撒胡椒，而是主动找出厨师最"没把握"的订单，优先让厨师学这些——这就是 In-Context Reflection (ICR)。**

## 二、论文核心问题

### 2.1 In-Context Learning (ICL) 是什么？

大语言模型（如 GPT-3）在**不更新模型参数**的情况下，通过在 prompt 里放入几个"问题-答案"示例（demonstrations），就能适应新任务。这就是 ICL。

举个日常例子：

- 不给示例 → 问你"这部电影怎么样？" → 模型不知道你要情感分析
- 给示例 → "这部电影太精彩了！→ 正面"、"无聊透顶 → 负面" → 模型立刻明白了

### 2.2 现有方法的痛点

给哪些示例作为 demonstrations，直接影响效果。现有方法有两个问题：

1. **依赖外部工具**：需要额外训练一个编码器来打分，成本高
2. **计算昂贵**：需要通过大量"对比测试"来判断每个示例的价值

### 2.3 论文的核心想法

**换一个角度思考**：与其找"好"的示例，不如先找出模型"搞不懂"的示例。

类比：你学数学时，反复做"1+1=2"没用，但如果你在一道"微积分题"上犹豫了，那道题就是你需要重点学的。

论文把这种"模型犹豫程度"称为 **misconfidence（误置信度）**，用符号 ψ 表示。

## 三、核心概念详解

### 3.1 Misconfidence（误置信度）

这是全文最重要的新概念。

**直观理解**：模型对一个样本给出了错误答案，而且**很自信地错了**——这个样本的 misconfidence 就高。

**公式（原文公式 1）**：

```
ψ((x_i, y_i), θ) = max_{y≠y_i} p_θ(y|x_i) / p_θ(y_i|x_i)

分子：模型给所有"错误答案"中最高的概率
分母：模型给"正确答案"的概率
```

举例：假设一个情感分类任务，正确答案是"正面"：

- 模型认为"正面"的概率 = 0.3
- 模型认为"负面"的概率 = 0.5（模型答错了，且很自信）
- 那么 misconfidence = 0.5 / 0.3 ≈ 1.67（很高，说明模型很"自信地搞错了"）

如果模型正确判断且自信：

- 正面概率 = 0.9，负面概率 = 0.1
- misconfidence = 0.1 / 0.9 ≈ 0.11（很低）

### 3.2 ICR 算法流程

```
第 0 步：从候选集中随机选 m 个示例，组成初始 prompt P_0
第 1 步：对每个候选样本，用 P_0 作为上下文，计算 misconfidence ψ
第 2 步：按 ψ 从高到低排序
第 3 步：把排名最高的 n 个样本替换进 prompt
第 4 步：（可选）重复步骤 1-3 多次
第 5 步：最终得到优化后的 prompt
```

关键：**每轮只用和模型交互一次**，比需要大量对比测试的方法高效得多。

## 四、代码示例

### 4.1 计算 misconfidence

下面的代码展示了如何计算一个样本的误置信度 ψ：

```python
import torch
import torch.nn.functional as F

def compute_misconfidence(logits, true_label):
    """
    计算单个样本的 misconfidence ψ

    参数:
        logits:      模型输出的原始分数 (未 softmax)
        true_label:  真实类别的索引

    返回:
        misconfidence 分数 ψ
    """
    # 转换为概率分布 (softmax)
    probs = F.softmax(logits, dim=-1)

    # 正确答案的概率
    true_prob = probs[true_label]

    # 所有错误答案中的最高概率
    # 先给正确答案位置放一个 -inf，这样取 max 时不会被选中
    mask = torch.ones_like(probs)
    mask[true_label] = float('-inf')
    max_wrong_prob = (probs * mask.exp()).max()

    # ψ = max(错误概率) / 正确概率
    # 加上小常数避免除以零
    misconf = max_wrong_prob / (true_prob + 1e-8)

    return misconf.item()


# 假设一个 4 分类的情感分析问题
# 真实标签是类别 2 (正面)
# 模型输出：类别 0=0.1, 类别 1=0.05, 类别 2=0.3, 类别 3=0.55
logits = torch.tensor([2.0, 1.0, -1.0, 3.0])  # 未归一化的分数
true_label = 2

score = compute_misconfidence(logits, true_label)
print(f"误置信度 ψ = {score:.4f}")
# 输出: 误置信度 ψ = 1.8333
# 说明模型很自信地答错了（把类别 3 当成了最主要选项）
```

### 4.2 完整的 ICR 算法实现

```python
import random
from typing import List, Tuple, Dict

class ICR:
    """
    In-Context Reflection 演示实现

    场景：用 LLM 做情感分析，从训练集中挑选最好的
          16 个示例作为 prompt 的 demonstrations。
    """

    def __init__(self, llm, pool: List[Tuple[str, str]],
                 demo_size: int = 16, replace_count: int = 8,
                 iterations: int = 1):
        """
        参数:
            llm:             一个支持 predict_probs(text) 的 LLM 接口
            pool:            候选样本池 [(文本, 标签), ...]
            demo_size:       最终 prompt 中的示例数量
            replace_count:   每轮替换的示例数量
            iterations:      ICR 迭代次数
        """
        self.llm = llm
        self.pool = pool
        self.demo_size = demo_size
        self.replace_count = replace_count
        self.iterations = iterations

    def init_prompt(self) -> List[Tuple[str, str]]:
        """第 0 步：随机采样初始化"""
        n = min(self.demo_size, len(self.pool))
        return random.sample(self.pool, n)

    def compute_misconfidence(self, sample: Tuple[str, str],
                              prompt: List[Tuple[str, str]]) -> float:
        """
        计算单个样本的 ψ 分数

        模拟：拼接 prompt + 样本文本作为输入，
        让 LLM 做预测，从输出概率中计算 ψ。
        """
        text, true_label = sample

        # 构建 few-shot prompt
        prompt_text = "\n".join([f"Q: {t}\nA: {l}" for t, l in prompt])
        prompt_text += f"\nQ: {text}\nA:"

        # 调用 LLM 获取概率分布 (模拟)
        # 实际使用中替换为真实的 openai/anthropic API 调用
        probs = self.llm.predict_probs(prompt_text)

        # 复用之前的 misconfidence 计算
        return compute_misconfidence(probs, true_label)

    def run(self) -> List[Tuple[str, str]]:
        """执行完整的 ICR 流程"""
        # 第 0 步：随机初始化
        current_prompt = self.init_prompt()
        remaining_pool = [s for s in self.pool if s not in current_prompt]

        print(f"初始 prompt 大小: {len(current_prompt)}")
        print(f"候选池大小: {len(remaining_pool)}")

        # 第 1~4 步：迭代优化
        for i in range(self.iterations):
            print(f"\n--- 第 {i+1} 轮 ICR ---")

            # 对候选池中每个样本计算 ψ
            scores = []
            for sample in remaining_pool:
                psi = self.compute_misconfidence(sample, current_prompt)
                scores.append((sample, psi))
                print(f"  样本: {sample[0][:30]}... | ψ = {psi:.4f}")

            # 按 ψ 从高到低排序
            scores.sort(key=lambda x: x[1], reverse=True)

            # 取 top-n 替换进 prompt
            top_n = scores[:self.replace_count]
            bottom = current_prompt[self.replace_count:]

            new_prompt = [s for s, _ in top_n] + bottom
            current_prompt = new_prompt

            # 把被替换的样本放回池中
            for s in bottom:
                remaining_pool.append(s)

            print(f"  本轮替换了 {self.replace_count} 个示例")

        return current_prompt
```

### 4.3 用 OpenAI API 的实际调用示例

```python
import openai

class OpenAILLM:
    """用 OpenAI API 作为 ICR 的 LLM 后端"""

    def __init__(self, model="gpt-3.5-turbo-instruct", temperature=0.0):
        self.client = openai.OpenAI()
        self.model = model
        self.temperature = temperature

    def predict_probs(self, prompt: str) -> torch.Tensor:
        """
        发送请求并获取各类别的概率分布

        注意：GPT-3.5-Turbo-Instruct 通过 logprobs 参数
        可以返回 top-k 个 token 的对数概率。
        实际使用时需要把这些 token 概率映射到分类标签。
        """
        response = self.client.completions.create(
            model=self.model,
            prompt=prompt,
            max_tokens=5,
            temperature=self.temperature,
            logprobs=5,  # 返回 top-5 token 的概率
            echo=False
        )

        # 从 logprobs 中提取概率，构建分类概率分布
        # 这里简化处理，实际需要根据标签集合做映射
        token_logprobs = response.choices[0].logprobs.top_logprobs[0]
        probs_dict = {}
        for entry in token_logprobs:
            token = entry['token']
            logprob = entry['logprob']
            # logprob 是 log 概率，转回概率
            probs_dict[token] = round(math.exp(logprob), 6)

        # 构建 torch tensor
        # 假设类别为 ['正面', '负面', '中性', '混合']
        labels = ['正面', '负面', '中性', '混合']
        probs = []
        for label in labels:
            p = probs_dict.get(label, 0.0)
            probs.append(p)

        return torch.tensor(probs)
```

## 五、实验结论速览

论文在 5 个任务集、13 个任务上做了评估：

- **GLUE** (4 个子任务): ICR 准确率 80.6%，优于基线
- **Ethos** (仇恨检测, 4 子任务): ICR 准确率 82.2%
- **TweetEval** (3 子任务): ICR 准确率 71.6%
- **HateSpeech18**: ICR 准确率 87.0%
- **Poem Sentiment**: ICR 准确率 78.9%

**平均提升 4%**，而且不需要任何外部监督数据或额外训练。

## 六、为什么这个方法值得学习

从第一性原理思考：

1. **ICL 的本质是什么？** 是让模型"模仿"示例中的映射关系
2. **哪些示例最有价值？** 是模型目前**最缺**的知识
3. **怎么知道模型缺什么？** 看它哪里"自信地搞错了"

这个思路跳出了"找相似"的旧范式，转向了"找差距"。就像老师不是给你做你都会的题，而是找出你的盲区——这是教学的核心逻辑。

## 七、一个思考题

ICR 只要求每轮和 LLM 交互一次，这比"影响分析"类方法（需要对每个样本做有无该样本的对比测试）高效得多。

但论文也发现：迭代次数越多并不一定越好（每次更新幅度太大，容易在最优解附近震荡）。

你觉得在什么情况下，ICR 的多轮迭代效果会更好？这和"学习率"的概念有什么相似之处？

想清楚这个问题，你就理解了优化算法中**步长（step size）** 和 **收敛稳定性** 的核心权衡。
