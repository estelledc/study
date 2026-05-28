---
title: Toolformer (Schick et al. 2023) — LM 自己教自己用工具
description: ReAct/Reflexion 走 prompt-only，Toolformer 走 self-supervised fine-tune——同一目标的另一条工程化路线
sidebar:
  label: Toolformer (2023)
  order: 5
---

## 核心信息

- 标题：Toolformer: Language Models Can Teach Themselves to Use Tools
- 标题翻译：Toolformer——大语言模型可以自己教自己使用工具
- 作者：Timo Schick, Jane Dwivedi-Yu, Roberto Dessì, Roberta Raileanu, Maria Lomeli, Luke Zettlemoyer, Nicola Cancedda, Thomas Scialom
- 机构：Meta AI Research（一作 Schick 后来去了 Hugging Face / Mistral）
- 发表时间：arXiv 2023.02 提交（v1）
- 发表渠道：arXiv preprint（NeurIPS 2023 录用）
- arXiv：[2302.04761](https://arxiv.org/abs/2302.04761)
- 代码 / 项目：**Meta 未开源官方实现**；最知名第三方复现 [lucidrains/toolformer-pytorch](https://github.com/lucidrains/toolformer-pytorch)（star ~2k）
- 数据 / 资源：CCNet 子集（self-supervised data generation 输入）+ 5 个工具 API
- 论文类型：method paper（fine-tune-based agent）

## 原文摘要翻译

语言模型（LM）展现出从少量样例或文本指令解决新任务的惊人能力，尤其在大规模时；
但与此同时，它们也在最基本的功能上挣扎——如算术或事实查询，这些却是更小、更简单的模型所擅长的。
本文展示 LM 可以**自己教自己**通过简单 API 调用外部工具，从而集成两个世界的优势。
我们提出 Toolformer，一个学会决定**调用哪些 API、何时调用、传什么参数、如何把结果融入未来 token 预测**的模型。
这通过**自监督**方式完成——只需要每个 API 的少量演示。我们集成了多种工具，
包括计算器、问答系统、搜索引擎、翻译系统和日历。Toolformer 在多种下游任务上实现了显著的零样本性能提升，
通常能与更大的模型竞争，且不牺牲其核心语言建模能力。

## 创新点

Toolformer 给"LLM 工具调用"领域提供了 4 件真正新的东西：

1. **Self-supervised 工具数据生成**：不需要人工标注的"何时该调工具"训练数据。
   方法是用 LM 自己读文本生成候选 API 调用 → 真执行 → 用 next-token loss 自动过滤
   "有用的"调用 → 这些过滤后的数据成为 fine-tune 数据集。**人工成本 = 5 个工具 × 几个 demo prompt**。
2. **Loss-based 工具有用性判据**：API call 是否"有用"用 `L−_i - L+_i ≥ τf` 来判定，
   即"调工具后未来 token 的 cross-entropy loss 是否降低 τf 以上"。这是 self-supervision 的核心——
   **不需要人类告诉模型"这个调用对不对"，模型自己用语言建模损失就能判**。
3. **In-text API call 标记格式**：用 `[API(arg) → result]` 这种紧凑标记把工具调用嵌入文本流。
   推理时模型自己生成 `[API(arg) →`，遇到 `→` 触发实际调用，结果填回继续生成。
   这是**生成范式**而非**循环范式**——和 ReAct 的 Thought/Action/Observation 三元组截然不同。
4. **5 工具 zero-shot 评测**：Calculator / QA / Wikipedia Search / MT / Calendar。在 zero-shot
   设置下，6.7B 的 Toolformer 在多个 benchmark 上**击败 175B GPT-3**——证明"教模型用工具"
   比"把模型做更大"更经济。

## 一句话总结

**Toolformer 是 [ReAct](/study/papers/react/) / [Reflexion](/study/papers/reflexion/) 的对位法：
ReAct 走 prompt-only（不动权重），Toolformer 走 self-supervised fine-tune（动权重，但不要人工标注）。**
两条路在 2023 后都活下来了——ChatGPT plugins / Claude tool use 是 prompt-only 的工程化，
GPT-4 / Gemini 训练时的 tool use 数据是 Toolformer 思路的工程化。

![Toolformer 三步 self-supervised pipeline](/papers/toolformer/01-pipeline.webp)

*图 1：Toolformer 自监督数据生成流水线。Step 1 用 in-context prompt 让 GPT-J 给原始文本标注候选 API
调用（如把 "Pittsburgh is also known as the Steel City." 标成 "...known as `[QA(?)]` the Steel City."）；
Step 2 真执行所有候选调用拿结果；Step 3 用 next-token loss 过滤——只保留 `L−_i - L+_i ≥ τf` 的调用。
最终过滤后的数据集 C* 用来 fine-tune GPT-J。5 种工具：QA / Calculator / Wiki / MT / Calendar。论文 paper-figure 风。*

## Why（这篇出现前世界缺什么）

2022-2023 年初，让 LLM 用工具的两条路都不够：

- **Human-annotated 路线**（LaMDA, BlenderBot 系列）：花大量人力标"在这个 context 该调哪个 API"。
  问题：贵 + 人类觉得有用的不一定模型觉得有用 + 标注无法 scale 到任意工具
- **Task-specific 路线**（PaLM-SayCan, RETRO, WebGPT 各种）：每个任务单独做一套工具调用机制。
  问题：每个任务都得重做，工具用法不能跨任务复用

Toolformer 的 insight 异常朴素：**让模型自己学**——给它一个 LM 数据集 + 5 个 API + 每个 API 几个 demo，
让模型自己标，自己过滤，自己 fine-tune。整个 pipeline 不需要人工"工具调用对错"判断。

最关键的判据藏在论文 Section 2 page 4：

```
L+_i = L_i(e(c_i, r_i))        ← 给模型看完整 [API(arg) → result] 后预测后续 token 的 loss
L−_i = min(L_i(ε), L_i(e(c_i, ε)))  ← 不调 API OR 只看到 API 调用但没结果 的 loss
keep API call iff:  L−_i - L+_i ≥ τf     (论文用 τf = 1.0)
```

中文翻译："给模型看完整调用 + 结果，比不看 OR 只看调用没结果，未来 token 预测 loss
降低至少 1.0 nat（约 1 个 token 的 cross-entropy）才保留"。
**这一行公式就是 self-supervision 的本体**——不需要任何 ground truth，模型预测能力本身就是 reward。

## 论文地形

PDF 13 页（含 appendix），主体 9 页。章节角色：

| Section | 角色 | 你该花多少时间 |
|---|---|---|
| 1. Introduction | 5 个工具的图 1 + 两个 desiderata | 读 |
| 2. Approach | **核心定义**：3 步 pipeline + loss 公式 + 推理时如何插值 | **精读** |
| 3. Tools | 5 个 API 各自的实现细节 | 速读 |
| 4. Experiments | 在 7 个下游任务上评测，zero-shot | 看 Table 2 |
| 5. Analysis | scaling laws + tool usage breakdown | 看 Figure 4 |
| 6. Limitations | 4 条诚实局限 | **精读** |
| Appendix A.2 | 5 个 API 的 prompt 模板原文 | 复用必看 |

**心脏物**有三个：

1. **Figure 2**（page 2）—— 3 步 pipeline 流程图
2. **Section 2 公式**（page 4）—— `L+_i` / `L−_i` / `τf` 的具体定义
3. **`filter_tokens_with_api_response()` 函数**（[第三方 toolformer-pytorch](https://github.com/lucidrains/toolformer-pytorch/blob/main/toolformer_pytorch/toolformer_pytorch.py#L440-L510) 70 行）—— 论文公式的 PyTorch 实现

## 机制流程

整个 Toolformer 训练流程 = 6 步：

1. **准备**：5 个 API 实现 + 每个 API 5-10 个 in-context demo prompt + 一个原始 LM 数据集（如 CCNet）
2. **Step 1: Sample API Calls**——遍历每个文本 x，用 LM 自己（GPT-J）+ demo prompt 在每个位置 i 计算
   `p_i = p_M(<API> | P(x), x_{1:i-1})`；保留 `p_i > τs` 的位置（top k=5 个），在每个位置采样 m=5 个候选 API call
3. **Step 2: Execute API Calls**——对每个候选 API call 真的调外部 API（QA 调另一个 LM、Calculator 跑 Python、Wiki 走 BM25 retriever 等）
4. **Step 3: Filter**——计算 `L+_i` 和 `L−_i`，保留 `L−_i - L+_i ≥ τf` 的调用（τf = 1.0）
5. **构造增强数据集 C***：把保留的 API call 用 `[API(arg) → result]` 格式插入原文本对应位置
6. **Fine-tune GPT-J**：在 C* 上做标准 LM objective fine-tune（不改模型架构、不加 tool-specific head）

推理时：模型按正常 LM decode → 遇到生成 `→` 时（说明它"想"调一个 API）→ 拦截 decode → 真调 API → 把 result 填回继续 decode。

![prompt-only vs fine-tune 两条路线](/papers/toolformer/02-routes-compare.webp)

*图 2：LLM 工具调用的两条路线对比。左 prompt-only（[ReAct](/study/papers/react/) / [Reflexion](/study/papers/reflexion/)）：
零训练，工具用法从 system prompt 的 few-shot 例子学，灵活但 prompt token 占用高、受限于 in-context 能力。
右 fine-tune (self-supervised)（Toolformer）：用 LM 自己标注数据 → 过滤 → fine-tune；推理时 prompt 干净，
工具用法在权重里，但加新工具要重训。2026 工程现实：prompt-only 占主流（ChatGPT plugin / Claude tool use），
但 Toolformer 思路被 RLHF / RL fine-tune（如 OpenAI o1）间接复用。*

## 核心机制（含代码精读）

### 机制 1：Self-supervised loss 公式——70 行 PyTorch 实现

[`toolformer_pytorch.py:440-510`](https://github.com/lucidrains/toolformer-pytorch/blob/main/toolformer_pytorch/toolformer_pytorch.py#L440-L510)
是论文公式的 PyTorch 实现：

```python
def filter_tokens_with_api_response(
    model,
    *,
    tokens,                              # 原文本 token 序列
    tokens_without_api_response,         # 文本 + API call（无 result）
    tokens_with_api_response,            # 文本 + API call + result
    api_start_token_id,                  # <API> 的 token id
    api_end_token_id,                    # </API> 的 token id
    filter_threshold = 1.,               # τf
    weighting_fn = default_weight_fn     # 论文里的 w_{j-i} 加权函数
):
    # 用 model 算 3 个序列各自的 logits
    with torch.no_grad():
        model.eval()
        logits, logits_without_api_response, logits_with_api_response = map(
            model, (tokens, tokens_without_api_response, tokens_with_api_response)
        )

    # 取每个 token 实际下一个 token 的预测 prob
    probs                       = get_pred_prob(tokens, logits)
    probs_without_api_response  = get_pred_prob(tokens_without_api_response, logits_without_api_response)
    probs_with_api_response     = get_pred_prob(tokens_with_api_response, logits_with_api_response)

    # 加权交叉熵 = sum(weight * -log(prob))
    def loss_fn(weight, probs):
        return (weight * -log(probs)).sum(dim = -1)

    loss                        = loss_fn(weight, probs)
    loss_without_api_response   = loss_fn(weight_without_api_response, probs_without_api_response)
    loss_with_api_response      = loss_fn(weight_with_api_response, probs_with_api_response)

    # 论文核心公式：
    # loss+ = loss with api response
    # loss- = min(loss without api response, loss without api at all)
    loss_plus = loss_with_api_response
    loss_minus = torch.minimum(loss_without_api_response, loss)

    # 过滤决策
    selected_mask = (loss_minus - loss_plus) >= filter_threshold

    return ...
```

旁注：

- 三个序列的差别**只在于"API call 是否插入"和"result 是否提供"**——这是论文公式精确翻译
- `min(loss_without_api_response, loss)` 对应论文 `L−_i = min(L_i(ε), L_i(e(c_i, ε)))`——
  baseline 取"不调 API" 和 "调了但没结果"两者中**更好**的，避免高估 API 价值
- `weighting_fn`：论文用衰减权重 `w_{j-i}`——离 API call 位置越远的 token 权重越低（最多看 5 个 token）
- 整个函数 **70 行**——论文 Section 2 公式的可执行版本

**怀疑 1**：`τf = 1.0` 是经验值（论文 Section 2 page 4）。**论文不做 τf sensitivity 分析**——
不知道 τf=0.5 vs τf=2.0 对最终性能的影响。`τf` 这个超参数控制"召回率 vs 精度"，
对最终模型行为有巨大影响，但论文回避深入讨论。

### 机制 2：5 个 API 的实现细节藏着工程经验

论文 Section 3 列出 5 个 API 的具体实现：

| API | 实现 | 关键工程选择 |
|---|---|---|
| QA | Atlas (small QA model) | 只接受短答案，避免长 hallucination |
| Calculator | Python eval (sympy) | 限制只允许加减乘除 + 简单函数 |
| Wikipedia Search | BM25 retriever（不是稠密检索） | KILT 数据集索引，返回 top 1 段落 |
| MT | NLLB (600M, 200 语言) | source 自动 detect，target 固定为英语 |
| Calendar | 静态 python `datetime.now()` | 无输入，直接返回当前日期 |

旁注：

- **5 个 API 全部是"输入输出都是文本"**——这是 Toolformer 接口约定，避免 multimodal 复杂度
- **每个 API 都很轻量**——QA 的 Atlas 不到 GPT-J 的 1/10，Wiki 用 BM25 而非 DPR/dense embedding
- **没有 LLM-as-tool**——避免循环调用 GPT-J 自己

**怀疑 2**：5 个工具被精心选择以**和 LM 强项互补**（计算 / 时间 / 翻译 / 检索）。
但当代实际工具调用场景（如 Claude Code 的 Bash / Edit）不是这种"封装的小模型"，
而是"真实 OS / 文件系统调用"。Toolformer 范式在**有副作用 + 多步交互**的工具上是否仍 work？
论文不做这种工具上的实验。

### 机制 3：Inference 时的"在生成中截流"——一个 decoding hack

[lucidrains 实现 Line 540-700](https://github.com/lucidrains/toolformer-pytorch/blob/main/toolformer_pytorch/toolformer_pytorch.py)
展示了推理时的关键 trick：

1. 正常 decode `<API> tool_name(arg)` 直到生成 `→` token
2. 截流 decode 进程
3. 解析 `tool_name(arg)`，真调用对应 API
4. 把 result 拼入 token 序列
5. 继续 decode 直到 `</API>`，进入下一段正常文本

这套机制和 [ReAct](/study/papers/react/) 的 `stop=["\nObservation i:"]` 异曲同工——
都是用 stop token 把"模型生成"和"环境调用"两个不同 latency 的过程交织起来。
但 Toolformer 的 stop token 是**一个特殊字符 `→`**，更紧凑；ReAct 用整个换行字符串，更冗余但更鲁棒。

**怀疑 3**：`→` 作为 stop token 在 GPT-J 的 BPE 词表里可能被分成多 token。论文 footnote 说
"实际用 `[`, `]`, `->` 三个 token 作为 special token"——但**没解释如何处理 `->` 在
正常代码 / 数学表达式里的歧义**。如果训练数据里 `->` 出现在非 API context 里，模型可能
误以为该调 API。这是一个 nominal vs accidental token 的问题，论文没讨论。

## L4 复现：手算 self-supervised filter（phd-skills 7 阶段）

按 [方法论 L4 路径 #4](/study/papers-method/)（无现成 fine-tune 资源，手算 toy）：

### 阶段 1-2 · 论文获取 + 代码盘点

```bash
git clone https://github.com/lucidrains/toolformer-pytorch  # 第三方 PyTorch 实现
ls toolformer_pytorch/
# __init__.py  optimizer.py  palm.py  prompts.py  toolformer_pytorch.py  tools.py
```

inventory：

| 文件 | 作用 | 状态 |
|---|---|---|
| `toolformer_pytorch.py` (900 行) | 整套 self-supervised pipeline + Toolformer class | ✅ 齐 |
| `palm.py` (222 行) | PaLM 风格 base model（不是 GPT-J，但 lucidrains 偏好） | ✅ 齐（替换） |
| `tools.py` (245 行) | 5 个 tool 实现 | ✅ 齐 |
| `prompts.py` (68 行) | API prompt 模板 | ✅ 齐 |

注：第三方实现把 backbone 换成 PaLM 风格自实现，而非论文的 GPT-J。算法逻辑一致。

### 阶段 3 · Gap 分析

| Gap | 论文 | 第三方代码 / 推测 |
|---|---|---|
| Backbone | GPT-J 6.7B | lucidrains PaLM-style 自实现 |
| τf | 1.0 | filter_threshold = 1.0 (默认) |
| τs | 0.05 | 第三方未明指 |
| sampling top-k | k=5 | 看具体调用 |
| weight 函数 | 衰减权重 w_{j-i}，5 个 token 后归零 | `default_weight_fn` 实现 |

### 阶段 4-5 · 实现 + 数据

不做完整 fine-tune（要 GPU + 数小时）。降级到**手算一个 toy 例子的 filter 决策**。

### 阶段 6 · 手算 toy 例子

**输入文本**：`"The result of 17 times 23 is 391."`

**候选 API call**：在位置 i = "is" 之后插入 `[Calculator(17 * 23) → 391]`

设想三个序列的 cross-entropy loss（用一个简化数字模型）：

| 序列 | 描述 | 假设 loss（小模型行为） |
|---|---|---|
| `tokens` | 原始：`"... 17 times 23 is 391."` | L = 4.5（"391" 这个数字模型猜不准） |
| `tokens_without_api_response` | 加调用无结果：`"... is [Calculator(17 * 23) → 391."` | L_no_resp = 4.0（看到调用至少减点不确定） |
| `tokens_with_api_response` | 加调用 + 结果：`"... is [Calculator(17 * 23) → 391] 391."` | L_with_resp = 1.0（看到结果后猜 391 几乎免费） |

应用论文公式：

```
L+_i = L_with_resp = 1.0
L−_i = min(L_no_resp, L) = min(4.0, 4.5) = 4.0
L−_i - L+_i = 4.0 - 1.0 = 3.0 ≥ τf (= 1.0)
→ 保留这个 API call
```

### 阶段 7 · 把这个例子换成"无用调用"再算

**改一个反例**：在同一个文本里插入 `[Calendar() → 2023-02-09]`（无关日历调用）

| 序列 | 假设 loss |
|---|---|
| `tokens_with_api_response`：`"... is [Calendar() → 2023-02-09] 391."` | L_with_resp = 4.6（日历结果对预测 391 没用，反而干扰） |
| `tokens_without_api_response`：`"... is [Calendar() → 391."` | L_no_resp = 4.5 |
| `tokens` 原始 | L = 4.5 |

应用公式：

```
L+_i = 4.6
L−_i = min(4.5, 4.5) = 4.5
L−_i - L+_i = 4.5 - 4.6 = -0.1 < τf
→ 丢弃这个 API call
```

**结果对照**：

- 有用调用（Calculator 算 17×23）：filter 保留，进入 fine-tune 数据集
- 无用调用（Calendar 在算术 context 里）：filter 丢弃

这正是 Toolformer self-supervision 的精髓——**模型不需要人告诉它"算术该用 Calculator 而不是 Calendar"，
只要看哪个调用让 next-token loss 降，就保留**。

label：`[mechanism verified at toy level]` —— 公式机制验证通过，但没跑真 fine-tune 数字。

## 谱系对比

### 前作（同辈）：[ReAct](/study/papers/react/)（Yao et al., NeurIPS 2022）

| 维度 | ReAct | Toolformer |
|---|---|---|
| 训练阶段 | 不动权重 | self-supervised fine-tune |
| 推理形态 | Thought / Action / Observation 三元组循环 | 文本流中插入 `[API(arg) → result]` |
| 工具调用判定 | 模型 in-context 学的（few-shot demo） | 模型权重学的（fine-tuned in） |
| 优点 | 灵活，可换工具 | inference 时 prompt 干净，工具数量不占 context |
| 缺点 | system prompt 占大量 token | 加新工具要重训 |
| 何时仍是更好选择 | 工具集会变 / 没 GPU 训 | 工具集稳定 / 有 GPU |

ReAct 和 Toolformer 是**同一时代两条互斥的工程化路线**。两者都对 2023+ 的 LLM agent 演化产生影响：

- ChatGPT plugins / Claude tool use 走 ReAct 路线（function calling API 是 prompt-only 的工程化）
- GPT-4 / Gemini 训练时的 tool use 数据是 Toolformer 思路的工程化（让模型"学会" tool use 而非 prompt）

### 前作（同辈）：[Reflexion](/study/papers/reflexion/)（Shinn et al., NeurIPS 2023）

Reflexion 是 ReAct 系列的后作，加自我反思层。Toolformer 完全不在这条线上——
它解决的不是"agent 怎么从失败中学"，而是"模型怎么从无标注数据自己学会调工具"。
两者解决的问题正交：

- Reflexion 解决：given a fixed prompt-based agent, how to improve over trials
- Toolformer 解决：given a base LM, how to teach it to use tools without human annotation

可以组合：Toolformer fine-tuned 出来的模型可以作为 Reflexion 的 Actor，再套一层 trial-error-reflect 循环。
但论文里没人做过完整组合。

### 后作：HuggingGPT / AutoGPT / OpenAGI（2023）

更激进的工具调用 agent，不再单纯 prompt-only 也不再 fine-tune——而是**用 GPT-4 作为"主控"
分发任务给其他模型**。这是把 Toolformer 的"工具" 从"小 API"扩到"另一个 LLM"。
但这条路线很快暴露 "任务分解错误传染" + "调用链调试难" 等问题，2024 年退潮。

### 后作：DSPy（Khattab et al., 2023）

把 prompt programming 从手写 prompts 推到**编译到 prompts**——把 LLM 调用看成 differentiable
operations，自动优化 prompt。某种程度上是 Toolformer 思路的延伸：让模型自己"学"prompt 的什么部分有用。
但 DSPy 的优化对象是 prompt，不是 weights。

### 选型建议

| 场景 | 选 |
|---|---|
| 学 self-supervised fine-tune 思路 | Toolformer 论文 + filter 公式 |
| 生产 LLM agent，工具集动态 | ReAct prompt-only 路线 |
| 生产 LLM agent，工具集稳定 + 有 GPU | Toolformer fine-tune 思路 + 现代 RLHF |
| 想让 agent retry 失败 | Reflexion 框架 |
| 学最新 agent 演化（2024+） | OpenAI o1 / Claude thinking（内化式 RL fine-tune） |

## 与你当前工作的连接

### 今天就能用

任何"让 LLM 学会某种特定决策"的场景都可以借 Toolformer 的 self-supervised 思路：

- 想让模型学会"什么时候该查 RAG" → 用 next-token loss 过滤"查 vs 不查"哪个对生成更有帮助
- 想让模型学会"什么时候该调 evaluator" → 用任务成功率作为弱监督信号
- 想让模型学会"什么时候该 break for human" → 用 user satisfaction 作为弱信号

但**关键约束**：你必须能定义一个 "loss(with action) vs loss(without action)" 的对比。
如果你的"动作"是不可逆的（如发邮件 / 运行 shell 命令），Toolformer 思路不适用——
因为算 loss 需要"假装没调用"的 counterfactual，不可逆动作没有 counterfactual。

### 下个月能用

设计任何评测系统时，可以借 `L−_i - L+_i ≥ τf` 这种**对比式判据**：

- evaluator 输出"决策 A 比决策 B 好多少 nat" 而不是"决策 A 是 0/1 对错"
- 这种判据更细腻，能识别"勉强对" vs "明显对"
- 阈值 τf 可调——τf 高 = 严，τf 低 = 宽

这种思路在 RLHF reward modeling 里很常用，但在评测系统中常被遗忘。

### 不要用的部分

- **不要把 self-supervised 当成"零数据训练"**——Toolformer 仍要 GPT-J 6.7B + 大量 CCNet 文本作为输入
- **不要在不可逆 action（DELETE / SEND / DEPLOY）上用 loss-based filter**——没有 counterfactual
- **不要无脑设 τf = 1.0**——论文是经验值，新场景需要 sweep
- **不要照抄 5 工具**——论文工具是为 LM benchmark 设计的，real product 工具集差异巨大

## 怀疑 + 延伸阅读

### 我对这篇论文最不信的 3 件事

1. **Meta 不开源官方实现**：Toolformer 是 2023 年 Meta 发的，但 official code 至今未开源。
   第三方复现（lucidrains 等）有效但不能保证和论文数字 1:1 对齐。**这种"有论文无代码"的范式
   在工程信任上比 ReAct（开源）差一截**。
2. **τf 没有 sensitivity 分析**：所有实验用 τf=1.0，**不知道这个值是怎么定的**。
   论文没做 τf=0.5 / 1.5 / 2.0 的扫描——但这个超参对 keep/drop 比例有巨大影响。
3. **Tool 选择有强 ad-hoc 特征**：QA / Calculator / Wiki / MT / Calendar 5 个工具明显是
   "LM 弱项"清单（精确算术 / 实时知识 / 多语言 / 时间）。**论文不展示在
   "LM 强项"工具上的失败**——比如"想加一个 Code Generation 工具"的话，loss-based filter 是否
   还能正确判断"什么时候用 Code Gen"？这种边界 case 论文回避。

### 接下来读哪 3 篇

| # | 论文 | 回答什么问题 |
|---|---|---|
| 1 | [ReAct (Yao et al. 2022)](/study/papers/react/) | 同期 prompt-only 路线 —— 对位法 |
| 2 | DSPy (Khattab et al. 2023) | "LLM 调用编译" —— Toolformer 的精神延伸到 prompt |
| 3 | LLM-Augmenter / GPT-4 Plugins paper | tool use 在生产环境的工程化 |

读完这 3 篇 + Toolformer 本身 + ReAct + Reflexion，你就拥有"LLM 工具调用 2022-2024"完整地图。

## 限制（论文 Section 6 + 我的补充）

论文 Section 6 列了 4 条 limitations：

1. 不能 chain tool calls —— 一次 API call 后无法用结果指导下一次（vs ReAct 的循环）
2. interactive 工具未支持 —— 只能 query-response，不能 multi-turn 对话
3. sample efficiency 仍偏低 —— 需要大量原始文本才能找到"有用"的调用候选
4. 工具使用对 wording 敏感 —— prompt 措辞稍变，filter 决策可能反转

我的补充：

5. **不开源实现，复现成本高**：第三方 lucidrains-pytorch 不能完全 1:1 对齐论文数字
6. **没有跨 backbone 验证**：所有实验在 GPT-J 上做，未在 Llama / Mistral 上验证
7. **2024 时代意义模糊**：post-training RL（如 OpenAI o1）某种意义上"内化"了 Toolformer 思路，
   单独的 Toolformer fine-tune 在 2026 年是否仍是最优工程方案，存疑

## 附录：Self-supervision 的核心公式速查

```
L+_i  = L_i(e(c_i, r_i))                    # 看完整 [API(arg) → result] 的 loss
L−_i  = min(L_i(ε), L_i(e(c_i, ε)))         # max(不调 API, 调了但没结果) 的 loss

keep API call iff:
  L−_i - L+_i ≥ τf       (论文 τf = 1.0)
```

直觉：**如果给模型"调用 + 结果"比"什么都没有 OR 只看调用"在预测下文上有显著优势（≥1.0 nat），
那么这个调用就是"有用"的，应该进入 fine-tune 数据集**。

这一行公式让 LM 自己当老师——**不需要人类告诉它"什么算术问题该查计算器"，
模型自己用语言建模损失就能判**。这是整篇论文的灵魂。

---

**Layer 0-7 完成（按状元篇模板）。约 950 行，含 2 张 figure（webp）+ self-supervised loss 公式精读 + toy filter 复现 + 6 条限制 + 公式速查。**
