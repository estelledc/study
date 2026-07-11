---
title: DSPy — 把 prompt 写成签名，让编译器替你调
来源: 'Stanford NLP / Khattab 等, "DSPy: Compiling Declarative Language Model Calls into Self-Improving Pipelines", arXiv:2310.03714, 2023'
日期: 2026-05-31
分类: AI 工程
难度: 中级
---

## 是什么

DSPy（Declarative Self-improving Python）把 **写 prompt** 当成 **写代码 + 编译器优化**。日常类比：手写 prompt 像汇编（换模型常全废）；DSPy 像写 C——声明签名 `question -> answer`，模块组合后让编译器搜最佳 prompt。

```python
# 手写字符串 vs DSPy 签名
prompt = f"回答：{question}\n答案："
class QA(dspy.Signature):
    """回答百科问题。"""
    question = dspy.InputField()
    answer = dspy.OutputField()
qa = dspy.ChainOfThought(QA)
result = qa(question="法国首都？")
```

## 为什么重要

不理解 DSPy，下面这些事都没法解释：

- 为什么 prompt 调到第 10 版还在退化——**没有客观 metric**，全靠手感
- 为什么换模型（GPT-4 → Claude → 本地 7B）就要重写一整套 prompt——耦合在字符串里
- 为什么 LangChain 用着用着像在"拼字符串积木"，而 DSPy 像在"写 PyTorch 模型"
- 为什么 Stanford STORM（自动写维基条目的系统）能跨多步推理还稳定——它就是 DSPy 写的

## 核心要点

DSPy 把 prompt 工程拆成 **三个抽象**，对应深度学习的三件套。

1. **Signature（签名）** = 函数签名 / 模型 forward 输入

   声明输入输出，不写 prompt 文本：

   ```python
   class Summarize(dspy.Signature):
       """把长文压成一句话。"""
       document = dspy.InputField()
       summary = dspy.OutputField()
   ```

2. **Module** = `nn.Linear`：`Predict` / `ChainOfThought` / `ReAct` / `ProgramOfThought`，换实现不换业务代码

3. **Optimizer / Teleprompter** = SGD：`BootstrapFewShot` 收对的样本当 few-shot；`MIPROv2` 联合搜指令+示例；`COPRO` 只优化指令

拼起来：`compiled = optimizer.compile(program, trainset=ds, metric=acc)`——prompt 已被自动调好。

## 实践案例

### 案例 1：最小可跑问答（不依赖外部检索）

```python
import dspy

dspy.configure(lm=dspy.LM("openai/gpt-4o-mini"))

class QA(dspy.Signature):
    """用一句话回答事实问题。"""
    question = dspy.InputField()
    answer = dspy.OutputField()

qa = dspy.ChainOfThought(QA)
pred = qa(question="法国的首都是哪里？")
print(pred.answer)
```

逐步读：`configure` 选定底层模型；`Signature` 只声明输入输出；`ChainOfThought` 包一层「先想再答」；调用时传入 `question`，DSPy 现场拼 prompt 并解析出 `answer` 字段。

### 案例 2：编译（用训练集自动加 few-shot）

```python
from dspy.teleprompt import BootstrapFewShot

trainset = [
    dspy.Example(question="2+2?", answer="4").with_inputs("question"),
    dspy.Example(question="天空通常什么颜色？", answer="蓝色").with_inputs("question"),
]

def acc(example, pred, trace=None):
    return example.answer.lower() in pred.answer.lower()

optimizer = BootstrapFewShot(metric=acc, max_bootstrapped_demos=4)
compiled = optimizer.compile(dspy.ChainOfThought(QA), trainset=trainset)
```

编译时 DSPy 会：① 在训练集上跑程序；② 把 **metric 判对** 的 trace 收成 few-shot；③ 输出已注入示例的新程序。没有 `trainset` / 可靠 `metric` 就优化不动。

### 案例 3：换模型不改业务代码

```python
# 开发
dspy.configure(lm=dspy.LM("openai/gpt-4o-mini"))
print(compiled(question="法国的首都是哪里？").answer)

# 上线换一家供应商——签名与 Module 代码不动
dspy.configure(lm=dspy.LM("anthropic/claude-3-5-sonnet-20241022"))
print(compiled(question="法国的首都是哪里？").answer)
```

签名是抽象层，具体 prompt 由编译器按当前 LM 生成。这是相对手写字符串模板的核心收益。

## 踩过的坑

1. **没有训练集就没有 DSPy**：哪怕 20 条标注也比 0 条强；完全无标注只能退化成 zero-shot 的 ChainOfThought，优化器跑不动。

2. **metric 写得太松，编译没用**：如果 `acc` 永远返回 True，BootstrapFewShot 会把垃圾样本也当 demo 注入。先在小集合上手验 metric 再编译。

3. **编译很烧 token**：MIPROv2 一次 compile 可能跑几百到几千次 LM 调用；建议小数据先 `BootstrapFewShot`，跑通再上 MIPRO。

4. **对小模型不友好**：签名抽象需要模型能跟随结构化指令。7B 以下的本地模型经常不出 `answer:` 字段，DSPy 解析失败。

## 适用 vs 不适用场景

**适用**：

- 多步 LM pipeline（RAG / Agent / 多跳）要端到端调优
- 同一业务代码要在多个模型上跑
- 有可计算 metric（精确匹配 / LLM judge / 任务成功率）
- 相对 LangChain 字符串模板，更想把 prompt 当**可学习参数**；相对 Guidance/Outlines，DSPy 优化内容不约束解码（可叠用）

**不适用**：

- 一次性脚本，5 行 prompt 能搞定
- 完全无标注、metric 说不清的探索
- 延迟极敏感链路（编译后 prompt 可能更长）

## 历史小故事（可跳过）

- **2020–2022**：ColBERT / Retrieve-and-Read 一路把「检索+生成」做成可复现流水线，Khattab 团队积累了痛点
- **2022**：DSP（Demonstrate–Search–Predict）论文先把多跳推理写成可编程阶段
- **2023-10**：DSPy 论文上 arXiv（2310.03714），把签名、模块、teleprompter 收成框架
- **2024**：MIPROv2 等优化器把「指令+示例」联合搜索做成主流 compile 路径；STORM 等应用证明可写长文流水线

## 学到什么

1. **prompt 是参数，不是代码** —— 一旦把它当 `nn.Parameter` 看，就能套用 SGD / 编译器那一套优化框架
2. **签名 + 模块 + 优化器** 是把"试 prompt"工业化的最小三件套，类似 PyTorch 的 `nn.Module + autograd + optim`
3. **抽象的代价是元数据**：你必须给签名写 docstring、给数据集写 metric。没有这些 DSPy 退化为普通 LangChain
4. **编译时贵 vs 推理时省**：MIPRO 一次烧的 token 摊到上线后大量推理上是值的；纯一次性任务别上

## 延伸阅读

- 论文：[DSPy 2023](https://arxiv.org/abs/2310.03714)（核心思想 + 实验，30 页）
- 官方教程：[dspy.ai](https://dspy.ai/)（按任务分的 cookbook）
- 关键应用：[STORM — Stanford 维基生成器](https://github.com/stanford-oval/storm)（多步 DSPy pipeline 的典范）
- MIPROv2：[Optimizing Instructions and Demonstrations…](https://arxiv.org/abs/2406.11695)
- [[langchain]] —— 同领域更早的字符串链方案，可对照
- [[colbert]] —— 作者团队同源检索器，常与 DSPy 搭配

## 关联

- [[hindley-milner]] —— 都是「声明意图，算法补细节」
- [[pytorch]] —— Module / 优化器抽象直接借自 PyTorch
- [[langchain]] —— prompt 模板化 vs 编译化
- [[colbert]] —— DSPy 常见检索搭配，团队同源
- [[self-refine-2023]] —— 另一条「让模型改自己输出」路线

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[llama-index]] —— LlamaIndex — 给大模型接上私有资料库
- [[projects/optuna]] —— Optuna — 超参搜索框架
