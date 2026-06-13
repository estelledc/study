---
title: Codex — 让 GPT 学会写 Python，并造一把尺子量它
来源: Chen et al., "Evaluating Large Language Models Trained on Code", arXiv 2107.03374, 2021
日期: 2026-06-01
子分类: natural-language-processing
分类: 机器学习
难度: 中级
provenance: pipeline-v3
---

## 是什么

**Codex** 是 OpenAI 把 GPT 模型放到 GitHub 公开代码上"再读一遍书"的产物，**专门写 Python**。日常类比：原版 GPT 是个读了全网新闻、小说、论坛的通才；Codex 是同一个人又去图书馆把所有 Python 教材和开源项目刷了一遍，从此一开口就是代码。

GitHub 上你按 Tab 让 Copilot 帮你补一行函数体——背后跑的就是 Codex 的生产版本。

这篇论文同时干了三件事：

1. 训出 Codex 这个模型（**实物**）
2. 发布 **HumanEval**：164 道手写 Python 题，每题给函数签名 + 文档字符串 + 单元测试（**尺子**）
3. 提出 **pass@k** 评测口径：采样 k 次只要有一次过测就算赢（**度量方法**）

## 为什么重要

代码生成在 2021 年之前是个"看起来能做，实际没法量"的领域——大家都说自己模型写代码很强，但没有公认的考卷。这篇论文一次把考卷、考生、评分规则全交付了：

- **奠基地位**：之后所有代码 LLM（StarCoder / DeepSeek-Coder / Code Llama / Qwen-Coder）都拿 HumanEval 报分数，到 2026 年还在被引用
- **改变了 IDE 交互**：Copilot 让"边写边补"成为日常，键盘里多了一个隐形 reviewer
- **打开了 pass@k 范式**：后续 MBPP、APPS、SWE-bench 评测都继承了"采样多次只要有一次对就赢"的思路
- **首次正面讨论代码 AI 的副作用**：误用风险、过度依赖、对就业的影响——为后续政策讨论提供了原始素材

## 核心要点

### 1. Codex 怎么来的

- 起点：原版 **GPT** 模型（论文用了 12M 到 12B 多个尺寸做对比）
- 数据：从 GitHub 抓 **159 GB** Python 代码（去重、过滤自动生成的、过滤过长的）
- 训练：在原 GPT 基础上**继续训练**（fine-tune），不是从零训
- 关键发现：从 GPT 开始训比从零开始训**收敛更快**，最终精度差不多——说明自然语言预训练对学代码也有用

### 2. HumanEval 长什么样

每道题三件套：

```python
def incr_list(l: list):
    """Return list with elements incremented by 1.
    >>> incr_list([1, 2, 3])
    [2, 3, 4]
    """
    # 模型要补这里

# 隐藏的单元测试（评测时跑）
assert incr_list([1, 2, 3]) == [2, 3, 4]
```

**164 道**全是手写——不是从 LeetCode 爬的，避免训练集污染。难度从"加 1"到"动态规划"都有。

### 3. pass@k 怎么算

- 给一道题，让模型采样 **n 次**（论文用 n=200）
- 数出有多少次通过所有单元测试，记为 c
- pass@k 是"从 n 次里随机抽 k 次，至少 1 次对"的概率，有闭式公式

为什么不直接用 pass@1？因为模型有随机性，单次采样不稳定；而且实际用 Copilot 时你也是看几个候选选一个。

### 4. 关键数字

| 模型 | pass@1 | pass@100 |
|---|---|---|
| GPT-3（原版，没学代码） | **0%** | 0% |
| GPT-J（开源 6B） | 11.4% | 27.7% |
| Codex 12B | 28.8% | **70.2%** |

**重复采样是免费午餐**：同一个模型，单次只能解 28.8%，采 100 次有 70.2% 的题至少能解一次。这是论文最反直觉的发现之一。

## 实践案例

### 案例 1：pass@1 vs pass@100 的差距说明了什么

模型其实"知道"答案分布，但每次采样像扔骰子——大多数情况骰到错的，少数情况骰到对的。**采样次数 = 给骰子更多机会**。这启发了后续工作：

- **self-consistency**：采样多次 + 多数投票
- **ranker / verifier**：再训一个模型从候选里挑对的
- **test-time compute**：与其训更大模型，不如让小模型多采几次

### 案例 2：Codex 翻车的两种典型情况

论文做了细致的失败分析，归纳出两类硬骨头：

**长链操作**：
> "把列表里所有偶数取出来，乘 2 之后求和，再除以列表长度"

模型经常少做一步或顺序搞错。

**变量绑定**：
> "用变量 x 存 a 的最大值，y 存 a 的最小值，返回 x - y"

模型容易把 x 和 y 用反，或忘了哪个变量代表什么。

这两类问题暴露了"自回归生成"的弱点：模型边写边忘，没有显式的变量表。

### 案例 3：Codex 在 IDE 里的形态

```python
# 你写：
def fibonacci(n):
    """Return the n-th Fibonacci number."""
    # ← Copilot 在这里补：

# 模型补：
    if n <= 1:
        return n
    return fibonacci(n-1) + fibonacci(n-2)
```

注意几个细节：

- **触发点是 docstring 写完那一刻**——和 HumanEval 的训练形态完全一致
- **多候选**：Copilot 会准备 3-5 个候选，按 Tab 切换
- **上下文窗口有限**：早期 Codex 只看你当前文件附近几千 token，跨文件理解弱

## 踩过的坑

1. **HumanEval 太小（164 题）**：作为基准容易被刷爆，模型可能过拟合特定风格。后续 EvalPlus、HumanEval+ 把每题的单元测试扩了 80 倍，发现很多模型分数虚高。

2. **pass@k 闭式公式有数值陷阱**：直接算组合数会溢出。论文给了数值稳定的实现，自己复现要抄那段代码不能想当然。

3. **采样温度的取舍**：温度低（贪心）pass@1 高、pass@100 低；温度高反过来。论文的最优温度对每个 k 不一样——读分数前先看清楚温度。

4. **训练集污染风险**：HumanEval 题目网上传播后，新模型可能直接背过答案。复现要做 contamination check。

5. **只评 Python**：HumanEval 全是 Python，不能拿它的分数预测模型在 Rust / Go / SQL 上的表现。MultiPL-E 后来把题目翻成 18 种语言修了这个问题。

## 适用 vs 不适用场景

**适用**：

- 评估代码生成模型的"短函数"能力（< 50 行、单文件）
- 作为"模型能不能写 Python"的入门考——过不了 HumanEval 的别提别的
- 教学：解释 LLM 写代码的能力上限和典型失败模式

**不适用**：

- 评估"工程级"能力（多文件改 bug、读 issue 提 PR）→ 用 SWE-bench
- 评估非 Python 语言 → 用 MultiPL-E
- 评估真实业务代码（带框架、带配置、带历史包袱）→ 没有公开基准，只能内部评

## 历史小故事（可跳过）

- **2020 年 6 月**：GPT-3 发布。有人发现它能写一点点代码但不稳定。
- **2020 年底**：OpenAI 内部把 GPT-3 拿去 fine-tune GitHub 代码，雏形出来。
- **2021 年 6 月**：GitHub Copilot 技术预览上线，用的就是 Codex。震动开发者社区。
- **2021 年 7 月**：本论文发布，把模型、基准、评测范式一次性公开。
- **2022 年 6 月**：Copilot 商用，10 美元/月。
- **2023-2025 年**：HumanEval 几乎被刷穿（GPT-4、Claude、DeepSeek-Coder 都到 90%+），社区转向 SWE-bench / LiveCodeBench 等更难的基准。

## 学到什么

1. **同时交付模型 + 基准 + 度量**比只发模型影响力大得多——尺子比尺子下面的物件活得久
2. **重复采样**是"用算力换效果"的简单杠杆，但要配合好的 verifier 才能落地
3. **失败分析比 SOTA 数字重要**——论文花大篇幅讲模型在哪类题上栽跟头，反而成了后续改进的路标
4. **评测会被刷穿**：好基准的寿命一般 2-3 年，要持续造新尺子
5. **写代码 ≠ 工程能力**：HumanEval 高分不代表能干活，"短函数 → 工程项目"中间还隔着 SWE-bench 那种考卷

## 延伸阅读

- 论文 PDF：[Chen et al. 2021](https://arxiv.org/abs/2107.03374)（35 页正文 + 大量附录）
- HumanEval 数据集：[github.com/openai/human-eval](https://github.com/openai/human-eval)（带评测脚本）
- 后续基准：[EvalPlus / HumanEval+](https://github.com/evalplus/evalplus)（修了"测试太弱"的问题）
- 跨语言版本：[MultiPL-E](https://nuprl.github.io/MultiPL-E/)（翻成 18 种语言）
- [[gpt-3]] —— Codex 的起点
- [[copilot-rct]] —— Copilot 真实生产力的随机对照实验
- [[instructgpt]] —— 同期 OpenAI 工作，用 RLHF 把 GPT 调成更好用的形态

## 关联

- [[gpt-3]] —— Codex 把 GPT-3 在代码上继续训练得来；理解 GPT-3 的架构是理解 Codex 的前提
- [[instructgpt]] —— 同期 OpenAI 思路：把通用 LLM 用领域数据/反馈调专才
- [[copilot-rct]] —— Codex 落地为 Copilot 后，社区做的真实生产力实验
- [[attention]] —— Codex 仍然是 Transformer，注意力机制是它的底层引擎
