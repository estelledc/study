---
title: DSPy — 把 prompt 写成签名，让编译器替你调
来源: Khattab et al., "DSPy: Compiling Declarative Language Model Calls into Self-Improving Pipelines", arXiv:2310.03714, 2023
日期: 2026-05-31
分类: 编程语言
难度: 中级
---

## 是什么

DSPy 是 Stanford NLP 出的一套**把"写 prompt"换成"写程序"**的框架。名字是 Declarative Self-improving Python 的缩写。

日常类比：手写 prompt 像手写汇编——你直接告诉 CPU 执行什么。DSPy 是编译器——你写高层声明（"输入是问题，输出是答案"），它替你生成具体 prompt 和示例。

你写：

```python
class QA(dspy.Signature):
    question = dspy.InputField()
    answer = dspy.OutputField()

qa = dspy.ChainOfThought(QA)
```

你**没写一句 prompt**。DSPy 编译器读完这段，自动生成"请一步步思考……"这种具体提示词，并附上几条它自己挑的示范。

这套思路是 LangChain / Guidance / Outlines 这类"prompt 工程库"之外的另一条路：**别再调字符串，去调编译器**。

## 为什么重要

不理解 DSPy，下面这些事都没法解释：

- 为什么 prompt 改到第 17 版还在退化——没有客观 metric，全凭"我感觉好点了"
- 为什么换个模型（GPT-4 换 Claude 换本地 70B）整套 prompt 要重写
- 为什么 RAG / 多跳 QA / Agent 链一长，调试就成噩梦
- 为什么 Stanford 那篇维基生成 STORM、能写出长文，背后跑的是 DSPy 优化器

把 prompt 当字符串调，永远是"贴膏药"。把它当编译目标调，才有累积。

## 核心要点

DSPy 把 LM 应用拆成 **三个抽象**：

1. **Signature（签名）**：声明任务的"输入 → 输出"，像函数类型签名。比如 `"question -> answer"` 或一个 `dspy.Signature` 子类。**不写具体 prompt 字符串**。

2. **Module（模块）**：实现签名的"算法"。`dspy.Predict` 直接出答案；`dspy.ChainOfThought` 先生成推理再出答案；`dspy.ReAct` 边想边调工具。换 Module **不动业务代码**。

3. **Optimizer / Teleprompter（优化器）**：吃一批训练样本 + 一个 metric 函数，**自动**搜索最优的 few-shot 示例和指令。常用的有 `BootstrapFewShot`、`MIPROv2`、`COPRO`。

三层加起来等于**把 prompt 调优变成可重复的编译过程**。

## 实践案例

### 案例 1：从签名到能跑的程序

```python
import dspy
dspy.configure(lm=dspy.LM("openai/gpt-4o-mini"))

class GenerateAnswer(dspy.Signature):
    """根据上下文回答问题。"""
    context = dspy.InputField()
    question = dspy.InputField()
    answer = dspy.OutputField(desc="不超过 30 个字")

rag = dspy.ChainOfThought(GenerateAnswer)
result = rag(context="北京是中国首都。", question="中国首都是哪里？")
print(result.answer)
```

整个程序**没有一行 prompt 字符串**。DSPy 把签名 + Module 翻译成具体提示词、解析输出、检查格式。

### 案例 2：编译器自动找最佳示范

```python
trainset = [dspy.Example(question="...", answer="...").with_inputs("question") for ...]

def metric(example, pred, trace=None):
    return example.answer.lower() in pred.answer.lower()

optimizer = dspy.BootstrapFewShot(metric=metric, max_bootstrapped_demos=4)
compiled_rag = optimizer.compile(rag, trainset=trainset)
```

`compile` 这一步发生了什么：DSPy 拿你的程序在训练集上**跑一遍**，记录所有中间步骤（推理 + 答案），按 metric 筛出"被通过的轨迹"，把它们当 few-shot 示范贴进 prompt。下一次推理就带着这些自动选出的示范跑。

你**没写一条示范**。优化器替你挖出来。

### 案例 3：换模型只改一行

```python
dspy.configure(lm=dspy.LM("anthropic/claude-sonnet-4-5"))
```

业务代码（签名、模块、metric）**完全不动**。只要重新 compile，DSPy 会针对新模型重新挑示范、重写指令。这就是"声明 + 编译"相对"手写字符串"的最大差异。

## 踩过的坑

1. **没有 metric 就没有 DSPy**：很多人想直接享受"自动调 prompt"，但优化器需要一个**可计算**的指标。生成式任务（写文章 / 翻译）的 metric 设计本身就是难题。

2. **编译消耗不便宜**：`BootstrapFewShot` 要在训练集上跑你的整个程序，一次编译可能花掉几百到上万次 LM 调用。debug 阶段先用小样本和便宜模型。

3. **签名写得太宽 = 优化器抓瞎**：`question -> answer` 太泛，编译器搜出来的示范常常对不上你真正的子任务。多用 docstring 和 `desc=` 给 OutputField 加约束。

4. **不是所有任务都该 DSPy**：极简单的单轮问答用裸 prompt 就够；极低延迟的链路，编译开销和运行时开销都可能超出预算。

## 适用 vs 不适用场景

**适用**：
- 多步骤 LM 程序（RAG / 多跳 QA / Agent 链 / 信息抽取流水线）
- 有标注样本 + 能写 metric 的任务
- 需要在多个模型之间切换的项目
- 想把 prompt 工程从"玄学"变成"可回归测试"的团队

**不适用**：
- 一次性的单轮 chat 问答 → 裸 prompt 更快
- 完全没有评价信号 → 没 metric 优化器跑不起来
- 极致延迟敏感的在线推理 → 编译产物虽固定，但调用结构比手写复杂
- 受限解码 / 强格式输出 → 用 [[outlines]] / Guidance 更直接

## 历史小故事（可跳过）

- **2022 年**：Omar Khattab 在 Stanford NLP 做 ColBERT 检索时，发现 prompt 调优毫无系统性，先做了 Demonstrate-Search-Predict（DSP）。
- **2023 年 10 月**：DSP 进化成 DSPy，论文发到 arXiv，配套库开源。核心思想：**把 LM pipeline 看成 text transformation graph，把 prompt 当编译产物**。
- **2024 年**：MIPROv2 / BootstrapFinetune 等更强优化器登场；STORM（自动写维基长文）和 ColBERT-RAG 把 DSPy 推到生产场景。
- **2025 年**：社区把 DSPy 接进 LiteLLM，几乎所有主流模型都能直接当 backend。

## 学到什么

1. **prompt 不该是字符串，该是程序的副产品**——这是过去两年 LM 应用层最重要的洞见之一
2. **Signature + Module + Optimizer** 是 DSPy 的三板斧；类比 [[hindley-milner]] 的"占位符 + 解方程 + 泛化"，都是把人工调优交给系统
3. **metric-driven 才是工程**：没有客观指标的"调优"永远是经验主义
4. **抽象 → 编译器 → 工程**：从"写 prompt"到"声明任务"，再到"自动搜索最优实现"，思路和编程语言史一模一样
5. **优化器是关键差异**：LangChain 给你模板和链，DSPy 给你"会自我提升"的程序——区别在于有没有把训练样本和 metric 当一等公民

## 延伸阅读

- 论文 PDF：[arXiv:2310.03714](https://arxiv.org/abs/2310.03714)（28 页，Stanford NLP 出品）
- 官方文档：[dspy.ai](https://dspy.ai/)（教程从 RAG 一路到多跳 QA）
- 仓库：[stanfordnlp/dspy](https://github.com/stanfordnlp/dspy)（star 18k+，例子齐全）
- 视频导读：[Goodbye Prompting, Hello Programming](https://www.youtube.com/results?search_query=DSPy+goodbye+prompting)（社区讲座，1 小时讲清三层抽象）
- 后续工作：MIPROv2 论文（Multi-prompt Instruction Proposal Optimizer）和 BootstrapFinetune（把示范蒸馏回模型权重）
- 实战项目：[STORM](https://github.com/stanford-oval/storm)（用 DSPy 自动写维基长文，是看 DSPy 怎么搭多 Agent 系统的活教材）
- [[hindley-milner]] —— 同样是"声明 + 自动推导"思路的祖先
- [[langchain]] —— 走"模板 + 链"的另一条路，理解差异更能看清 DSPy 的取舍

## 关联

- [[hindley-milner]] —— 都是把"人工标注"换成"系统推导"，DSPy 之于 prompt 等于 HM 之于类型注解
- [[lambda-calculus]] —— DSPy 的 Module 组合本质是函数组合，签名就是函数类型
- [[partial-evaluation-jones]] —— 编译器在训练样本上"特化"程序的思路，和 DSPy 编译的 bootstrap 同构
- [[turchin-supercompilation]] —— 把程序整段重写优化的思路，DSPy 优化器是 LM 时代的对应物
