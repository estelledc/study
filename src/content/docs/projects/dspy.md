---
title: DSPy — 把 prompt 写成签名，让编译器替你调
来源: 'Stanford NLP / Khattab 等, "DSPy: Compiling Declarative Language Model Calls into Self-Improving Pipelines", arXiv:2310.03714, 2023'
日期: 2026-05-31
子分类: 数据科学与 AI
分类: 机器学习
难度: 中级
provenance: pipeline-v3
---

## 是什么

DSPy（Declarative Self-improving Python）把 **写 prompt 的活** 当成 **写代码 + 编译器优化** 来做。

日常类比：写汇编 vs 写 C。

- 手写 prompt 就像手写汇编：每个字、每个示例都得自己拼，换个模型可能全废
- DSPy 让你写"高级语言"：声明一个签名 `question -> answer`，再用模块组合，最后让编译器去搜出最佳 prompt 文本

代码片段对比：

```python
# 手写：把示例和指令塞进字符串
prompt = f"""你是一个百科助手。回答下面的问题。
示例 1：Q: ... A: ...
问题：{question}
答案："""

# DSPy：声明签名 + 用 Module 组合
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

2. **Module（模块）** = `nn.Linear` / `nn.ReLU`

   组合块，换实现不换业务代码：

   - `dspy.Predict`：直接问一次
   - `dspy.ChainOfThought`：先想再答
   - `dspy.ReAct`：边想边调工具
   - `dspy.ProgramOfThought`：让 LM 写代码再执行

3. **Optimizer / Teleprompter** = SGD / Adam

   拿训练集 + metric，**自动搜出 few-shot 示例和指令文本**：

   - `BootstrapFewShot`：跑一遍程序，拿对的样本当 few-shot
   - `MIPROv2`：联合搜指令 + 示例（当前主流）
   - `COPRO`：只优化指令文本

把三件事拼起来：`compiled = optimizer.compile(program, trainset=ds, metric=acc)`。`compiled` 就是一个**编译过、prompt 已经被自动调好**的程序。

## 实践案例

### 案例 1：最小可跑 RAG

```python
import dspy
dspy.configure(lm=dspy.LM("openai/gpt-4o-mini"))

class RAG(dspy.Module):
    def __init__(self):
        self.retrieve = dspy.Retrieve(k=3)
        self.gen = dspy.ChainOfThought("context, question -> answer")

    def forward(self, question):
        ctx = self.retrieve(question).passages
        return self.gen(context=ctx, question=question)
```

注意 `"context, question -> answer"` —— 这是 **行内签名**，不必单独建类。

### 案例 2：编译

```python
from dspy.teleprompt import BootstrapFewShot

def acc(example, pred, trace=None):
    return example.answer.lower() in pred.answer.lower()

optimizer = BootstrapFewShot(metric=acc, max_bootstrapped_demos=4)
compiled_rag = optimizer.compile(RAG(), trainset=trainset)
```

编译过程 DSPy 会：

1. 跑 `RAG()` 在训练集上，收集 **答对了的 trace**
2. 把 trace 里的样本作为 few-shot 注入回 prompt
3. 输出一个新程序 `compiled_rag`，prompt 已经自动加了示例

### 案例 3：换模型不改业务代码

```python
# 开发时用 GPT-4
dspy.configure(lm=dspy.LM("openai/gpt-4o"))
# 上线换 Claude，业务代码一字不改
dspy.configure(lm=dspy.LM("anthropic/claude-sonnet-4-7"))
```

签名是抽象层，prompt 由编译器现场生成。这是 **可替换性** 的核心收益。

## 踩过的坑

1. **没有训练集就没有 DSPy**：哪怕 20 条标注也比 0 条强；完全无标注只能退化成 zero-shot 的 ChainOfThought，优化器跑不动。

2. **metric 写得太松，编译没用**：如果 `acc` 永远返回 True，BootstrapFewShot 会把垃圾样本也当 demo 注入。先在小集合上手验 metric 再编译。

3. **编译很烧 token**：MIPROv2 一次 compile 可能跑几百到几千次 LM 调用；建议小数据先 `BootstrapFewShot`，跑通再上 MIPRO。

4. **对小模型不友好**：签名抽象需要模型能跟随结构化指令。7B 以下的本地模型经常不出 `answer:` 字段，DSPy 解析失败。

## 适用 vs 不适用场景

**适用**：

- 多步 LM pipeline（RAG / Agent / 多跳推理）需要**端到端调优**
- 同一份业务代码要在多个模型上跑
- 有客观可计算的 metric（精确匹配 / LLM judge / 任务成功率）

**不适用**：

- 一次性脚本，写 5 行 prompt 能搞定的事
- 完全无标注、metric 都说不清的探索性任务
- 对延迟极敏感的链路（编译过的 prompt 可能比手写更长）

## 与同类对比

- **LangChain / LlamaIndex**：把 prompt 当字符串模板 + 链。DSPy 把 prompt 当**可学习参数**。
- **Guidance / LMQL / Outlines**：约束解码格式。DSPy 不约束生成，只优化 prompt 内容。两者可叠用。
- **TextGrad**：用"文本梯度"反向传播优化 prompt。和 DSPy 思路同源，更偏研究。

## 学到什么

1. **prompt 是参数，不是代码** —— 一旦把它当 `nn.Parameter` 看，就能套用 SGD / 编译器那一套优化框架
2. **签名 + 模块 + 优化器** 是把"试 prompt"工业化的最小三件套，类似 PyTorch 的 `nn.Module + autograd + optim`
3. **抽象的代价是元数据**：你必须给签名写 docstring、给数据集写 metric。没有这些 DSPy 退化为普通 LangChain
4. **编译时贵 vs 推理时省**：MIPRO 一次烧的 token 摊到上线后大量推理上是值的；纯一次性任务别上

## 延伸阅读

- 论文：[DSPy 2023](https://arxiv.org/abs/2310.03714)（核心思想 + 实验，30 页）
- 官方教程：[dspy.ai](https://dspy.ai/)（按任务分的 cookbook）
- 关键应用：[STORM — Stanford 维基生成器](https://github.com/stanford-oval/storm)（多步 DSPy pipeline 的典范）
- MIPROv2 论文：[Optimizing Instructions and Demonstrations for Multi-Stage LM Programs](https://arxiv.org/abs/2406.11695)

## 关联

- [[hindley-milner]] —— 都是"声明意图，让算法去推具体细节"的思路
- [[pytorch]] —— DSPy 的 Module / 编译器抽象直接借自 PyTorch
- [[langchain]] —— 同领域更早的方案，prompt 模板化 vs 编译化的对比
- [[colbert]] —— DSPy 默认搭配的检索器，作者团队同源

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[circuitpython]] —— CircuitPython — 插上 USB 就能写 Python 的微控制器运行时
- [[hindley-milner]] —— Hindley-Milner — 编译器自己猜变量类型
- [[jupyterlab]] —— JupyterLab — 下一代 Jupyter IDE
- [[pytorch]] —— PyTorch — 深度学习主流框架
- [[replug-2023]] —— REPLUG — 不动 LLM 一根毛，只把检索器调到它的"口味"上
- [[self-refine-2023]] —— Self-Refine — 让同一个模型自己改自己写的东西

