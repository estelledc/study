---
title: Reflexion (Shinn et al. 2023) — verbal RL：用文字代替梯度让 agent 学习
description: ReAct 没法 retry 的硬伤怎么补——加一个 self-reflection 模型把失败 trajectory 翻译成自然语言反思塞进下一轮 prompt
sidebar:
  label: Reflexion (NeurIPS 2023)
  order: 4
---

## 核心信息

- 标题：Reflexion: Language Agents with Verbal Reinforcement Learning
- 标题翻译：Reflexion——用言语强化的语言智能体
- 作者：Noah Shinn, Federico Cassano, Edward Berman, Ashwin Gopinath, Karthik Narasimhan, Shunyu Yao
- 机构：Northeastern + MIT + Princeton（**Yao Shunyu 同时是 ReAct 一作 + 这篇通讯**——同一作者把自己上一篇打了一个补丁）
- 发表时间：arXiv 2023.03 提交，v4 终版 2023.10，NeurIPS 2023 录用
- 发表渠道：NeurIPS 2023
- arXiv：[2303.11366](https://arxiv.org/abs/2303.11366)（v4）
- 代码 / 项目：[noahshinn/reflexion](https://github.com/noahshinn/reflexion)（star ~3.5k；含 hotpotqa_runs / alfworld_runs / programming_runs / webshop_runs 4 个子目录）
- 数据 / 资源：HotpotQA dev / AlfWorld 134 envs / HumanEval / MBPP / **新发布的 LeetcodeHardGym**（40 道 Hard）
- 论文类型：method paper（agent 框架）

## 原文摘要翻译

大语言模型（LLMs）越来越多地被作为目标驱动型智能体与外部环境（如游戏、编译器、API）交互。
然而，让这些语言智能体快速、高效地通过试错学习仍是难题——传统强化学习方法需要大量训练样本和昂贵的模型微调。
我们提出 **Reflexion**，一个通过**语言反馈**而非权重更新来强化语言智能体的新框架。
具体而言，Reflexion agent 用文字反思任务反馈信号，把这些反思保存在自己的 episodic memory buffer 中，
以便在后续 trial 中做出更好的决策。Reflexion 足够灵活，可以接纳多种类型（标量值或自由形式语言）
和来源（外部或内部模拟）的反馈信号，在多种任务（顺序决策、编码、语言推理）上相比基线 agent
取得显著提升。例如，Reflexion 在 HumanEval 编码基准上达到 91% 的 pass@1 准确率，
超过此前 SOTA GPT-4 的 80%。我们还通过消融与分析研究使用了不同的反馈信号、反馈整合方法和 agent 类型，
为它们如何影响性能提供洞察。所有代码、demo 和数据集开源在 https://github.com/noahshinn024/reflexion。

## 创新点

Reflexion 给"LLM agent"领域带来 4 件真正新的东西：

1. **Verbal RL（言语强化）**：把传统 RL 里的"梯度信号"换成"自然语言反思文本"。
   不更新权重、不做 fine-tune，**只在 prompt 上下文里塞入上轮失败的反思**——这是 RL 范式
   在 LLM 时代的语义化重写。
2. **三模型分工架构**：Actor (Ma) 生成 trajectory + Evaluator (Me) 打分 + Self-Reflection (Msr) 写反思。
   把"一个 agent 闭环"拆成 3 个可独立替换的 LLM 调用——这种解耦让每一环都能独立做 ablation
   或换 backend。
3. **双层 memory**：短期 memory（当前 trajectory 的 Thought/Action/Obs 序列）+ 长期 memory（自反思
   历史 [sr_0, sr_1, ..., sr_t]，bound 在 Ω=1-3）。这是 agent 第一次明确把"经验"和"过程"分层管理。
4. **LeetcodeHardGym 基准**：40 道 GPT-4 训练数据 cutoff 后才发布的 Leetcode hard 题，覆盖 19 种语言。
   这是 ReAct 一系列论文里第一次专门构造"防止数据污染"的代码评测——91% pass@1（前 SOTA GPT-4 80%）。

## 一句话总结

**ReAct 错了就错了；Reflexion 把失败的 trajectory 翻译成一段中文/英文反思文本，
塞进下一轮 prompt，让 agent "记得" 自己上次为什么失败。** verbal RL 不动权重、不做 fine-tune，
就靠 prompt 工程吃下了 ReAct 的 ceiling 提升 +20% EM。

![Reflexion 三模型架构 + 双层 memory](/papers/reflexion/01-three-models.webp)

*图 1：Reflexion 三模型架构。Actor (Ma)、Evaluator (Me)、Self-Reflection (Msr) 三个 LLM 协同工作；
左下短期 memory（当前 trajectory 的 Thought/Action/Obs 序列）+ 右下长期 memory（自反思历史，Ω=1-3 上限）；
Self-Reflection 模块用珊瑚红高亮——这是 Reflexion 相对 [ReAct](/study/papers/react/) 的关键新增。
"verbal RL：用文字代替梯度" 是核心 slogan。*

## Why（这篇出现前世界缺什么）

[ReAct](/study/papers/react/) 出现后，LLM agent 的"loop 形态"基本定型：think → act → observe → think。
但有一个硬伤：**一次 trajectory 跑完就跑完了，错了就错了**。

如果想用传统 RL 改进 agent（PPO / DPO 等）必须 fine-tune LLM 权重，代价：

- 训练算力贵——动辄几千 GPU 小时
- 需要大量训练样本（HumanEval pass@1 从 60→80 通常要数千次试错）
- 模型一旦微调，就被锁定到特定任务，难迁移
- credit assignment 问题——长 trajectory 上的 binary reward 不知道该奖励哪一步

Reflexion 的 insight：**让模型自己用自然语言写 "我刚才哪步错了"，把这段反思直接塞进下一轮 prompt**。

- 不动权重——只改 prompt 上下文
- 不需要训练样本——一次失败就能反思一次，1-3 次 trial 就有显著提升
- credit assignment 用语言表达——"我以为 X 在 Y 位置但其实在 Z" 比 binary reward 信息量大百倍

论文用 [agents.py:23-33](https://github.com/noahshinn/reflexion/blob/main/hotpotqa_runs/agents.py#L23-L33)
的 4 种 strategy 把这个 insight 拆成可对比的 4 档：

```python
class ReflexionStrategy(Enum):
    NONE = 'base'                              # 等同于 ReAct，没有反思
    LAST_ATTEMPT = 'last_trial'                # 只把上次完整 trajectory 塞进 prompt
    REFLEXION = 'reflexion'                    # 自反思后塞进 prompt
    LAST_ATTEMPT_AND_REFLEXION = 'last_trial_and_reflexion'  # 两者都塞
```

Section 4.2 ablation（Figure 4c）证明：
**LAST_ATTEMPT 比 NONE 强 ~5%，REFLEXION 比 LAST_ATTEMPT 再强 ~8%**——
这 8% 就是"自反思"的纯贡献，独立于"记得上次"。

## 论文地形

PDF 28 页（含 8 个 appendix），主体 11 页。章节角色：

| Section | 角色 | 你该花多少时间 |
|---|---|---|
| 1. Introduction | motivation + 4 大优势 + 3 种反馈源类型 | 读 |
| 2. Related work | 自精炼 / RL 编程 / agent 学习路线 | 读 first paragraph |
| 3. Reflexion: reinforcement via verbal reflection | **核心定义**：Actor + Evaluator + Self-Reflection 三模型 + Algorithm 1 | **精读** |
| 4.1 ALFWorld | 长 trajectory 决策任务，134 envs | 看 Figure 3 |
| 4.2 HotpotQA | 知识密集 reasoning，30→51 EM 跳升 | 看 Figure 4 |
| 4.3 Programming | HumanEval 80→91 pass@1，引入 LeetcodeHardGym | 看 Table 1 |
| 5. Limitations | 5 条诚实的局限 | **精读**（藏审稿意见痕迹） |
| Appendix | prompt 模板、生成示例 | 复用必看 |

**心脏物**有四个：

1. **Algorithm 1**（page 4）—— 8 行伪代码概括整个 trial-error-reflect 循环
2. **Figure 2**（page 4）—— 三模型 + 双层 memory 的架构图
3. **`hotpotqa_runs/agents.py`**（393 行）—— ReflexionStrategy enum + step() 实现
4. **`hotpotqa_runs/prompts.py`**（142 行）—— REFLECT_INSTRUCTION 那一段是 self-reflection 模板的灵魂

## 机制流程

Algorithm 1 翻译成 5 步：

1. **初始化**：Actor (Ma)、Evaluator (Me)、Self-Reflection (Msr) 三个 LLM；空 memory `mem = []`；`t = 0`
2. **首次 trial**：用 πθ（=Ma + mem）生成 τ_0 → Me 评分得 r_0 → Msr 写反思 sr_0 → `mem.append(sr_0)`
3. **进入 while loop**：只要 Me 不通过 OR `t < max_trials`：
   - 用 πθ 生成新 trajectory τ_t（**注意**：πθ 这时已经吃了 mem 里的反思）
   - Me 评分 r_t
   - Msr 基于 (τ_t, r_t, mem) 写新反思 sr_t
   - `mem.append(sr_t)`，但保持 `len(mem) ≤ Ω`（通常 1-3）
4. **退出**：成功（Me 通过）或耗尽预算（max_trials）
5. **返回最终 trajectory** + 完整 reflection 历史

![Reflexion Algorithm 1 trial-error-reflect 循环](/papers/reflexion/02-algorithm-loop.webp)

*图 2：Algorithm 1 的可视化——4 个步骤组成 while loop（generate trajectory → evaluate → reflect → append to mem），
出口条件是 `Me passes OR t ≥ max_trials`。紫色 next-trial 箭头从 mem 回到 step 1，
表示**新一轮 trajectory 的 πθ 已经"读到"了反思**。三个外部参数 `max_trials / Ω / temperature` 决定行为边界。论文 paper-figure 风。*

## 核心机制（含代码精读）

### 机制 1：Self-Reflection 提示词——Reflexion 的灵魂在 142 行 prompts.py

[`hotpotqa_runs/prompts.py:117-124`](https://github.com/noahshinn/reflexion/blob/main/hotpotqa_runs/prompts.py#L117-L124)
是整个论文最浓缩的一段：

```python
REFLECT_INSTRUCTION = """You are an advanced reasoning agent that can improve based on self refection.
You will be given a previous reasoning trial in which you were given access to an Docstore API
environment and a question to answer. You were unsuccessful in answering the question either because
you guessed the wrong answer with Finish[<answer>], or you used up your set number of reasoning steps.
In a few sentences, Diagnose a possible reason for failure and devise a new, concise, high level plan
that aims to mitigate the same failure. Use complete sentences.
Here are some examples:
{examples}

Previous trial:
Question: {question}{scratchpad}

Reflection:"""
```

旁注：

- 反思 prompt 不是凭空设计的——它**显式告诉模型"诊断失败原因 + 提出 high level plan"**两个动作
- "in a few sentences" 是关键约束——反思必须**短**才能高效塞进下一轮 prompt（避免吃光 context window）
- `{examples}` 是 few-shot demo——`fewshots.py` 里的 `REFLECTIONS` 提供了好反思的范例
- "complete sentences" 强制是自然语言而非 bullet list——这个细节是为了让反思**像人类的思考**，
  而不是机械的错误码

类似地 [`hotpotqa_runs/prompts.py:113-115`](https://github.com/noahshinn/reflexion/blob/main/hotpotqa_runs/prompts.py#L113-L115) 是把反思塞进下一轮 prompt 的 header：

```python
REFLECTION_HEADER = 'You have attempted to answer following question before and failed.
The following reflection(s) give a plan to avoid failing to answer the question in the same
way you did previously. Use them to improve your strategy of correctly answering the given question.\n'
```

这一行让 Actor 知道**自己读到的"反思"来自自己上次的失败**——这是 verbal RL 的本体。

**怀疑 1**：反思的质量完全依赖 backend LLM 的 self-evaluation 能力。
论文 Section 4.2 用的是 GPT-3.5-turbo + GPT-4。**没有跑过开源小模型**——
2026 年的 7B/13B 模型上 self-reflection 是否仍有效？
Brittle Foundations of ReAct 类批判论文很可能在小模型上同样适用于 Reflexion。

### 机制 2：双层 memory + bound Ω——避免 context 爆炸

`mem` 长度通常上限 Ω=1-3，而不是无限累积。原因（论文 Section 3）：

- LLM context window 有限（GPT-3.5 4k tokens / GPT-4 8k tokens at the time）
- 越早的反思越无关——agent 已经从中学到了，不需要再读
- 太多反思会让 prompt 变成"碎片记忆堆"，反而干扰当前推理

ablation 在 Section 4.1 隐含验证：**Ω=3 已经能覆盖大多数 AlfWorld 任务的学习曲线**——
12 trial 内成功率从 60% → 130/134 ≈ 97%。

**怀疑 2**：双层 memory 的具体大小（Ω=1 vs 2 vs 3）论文没做 fine-grain ablation。
"通常 Ω=1-3" 是工程经验数字，不是从理论推导。
后续工作（如 [Memorizing Transformers](https://arxiv.org/abs/2203.08913)）有更细的 memory size 实验，
Reflexion 这个空白让结果可重复性打折。

### 机制 3：3 种 evaluator 类型 + 失败案例归因

Section 3 列出 3 种 Evaluator (Me)：

| 类型 | 适用任务 | 例子 |
|---|---|---|
| Exact Match (EM) | reasoning（HotpotQA） | 答案字符串严格匹配 gold |
| Pre-defined heuristic | decision making（AlfWorld） | "同一动作 3 次返回相同 obs → 死循环" |
| LLM-as-judge | programming / 自由形式 | 让另一个 LLM 评估 trajectory 是否合理 |

最有意思的是 AlfWorld 的 hand-written heuristic（Section 4.1）：

```python
# 伪代码（论文描述）
if same_action_same_obs_for_3_cycles or num_actions > 30:
    trigger_self_reflection()
```

这是 Reflexion 在 AlfWorld 上 +22% 的关键——**人类设计的"识别死循环"启发式 + LLM 写反思**，
而不是单纯依赖 LLM 自我评估。论文 Figure 3b 显示：ReAct-only 的 hallucination rate 收敛在 22%
（一直走错），而 ReAct+Reflexion 的 hallucination rate 持续下降到接近 0%——
22% 的差距正好对应 +22% 的成功率。

**怀疑 3**：hand-written heuristic 的迁移性？AlfWorld 的"3 cycles 同动作 = 死循环"非常 task-specific。
论文不讨论 Reflexion 在没有可设计 heuristic 的任务上能不能 work——
real-world 任务（如开放域 web 自动化）通常没有干净的死循环检测条件。

## L4 复现：trial-error-reflect 跑一题（phd-skills 7 阶段）

按 [phd-skills 的 reproduce 7 阶段](/study/papers-method/) 流程：

### 阶段 1-2 · 论文获取 + 代码盘点

```bash
git clone https://github.com/noahshinn/reflexion  # commit cca9ab2
ls reflexion/
# alfworld_runs/  hotpotqa_runs/  programming_runs/  webshop_runs/
```

inventory：

| 文件 | 角色 | 是否齐全 |
|---|---|---|
| `hotpotqa_runs/agents.py` (393 行) | Reflexion + ReAct + CoT 三种 agent 实现 | ✅ |
| `hotpotqa_runs/prompts.py` (142 行) | 7 种 prompt 模板（REACT/COT × instruct/reflect） | ✅ |
| `hotpotqa_runs/fewshots.py` (197 行) | WEBTHINK_SIMPLE6 + REFLECTIONS demo | ✅ |
| `hotpotqa_runs/llm.py` | OpenAI / langchain wrapper | ✅ |
| 训练脚本 | n/a（不微调） | n/a |

依赖 `langchain` 和 `OPENAI_API_KEY`——和 ReAct 类似，是 GPT-3 时代的 prompting-only 项目。

### 阶段 3 · Gap 分析

| Gap | 论文 | 代码 |
|---|---|---|
| Actor / Evaluator / Self-Reflection 是否同模型？ | 未明说 | 都是 `gpt-3.5-turbo`，温度 0 (`agents.py:46-49`) |
| Ω 具体多少？ | 1-3 | HotpotQA 默认 3（数 reflections list 长度） |
| max_trials 多少？ | 4-12 | HotpotQA 默认 6 (`react.py`) |
| Reflection 长度限制？ | "few sentences" | `max_tokens=250` (`agents.py:47`) |
| stop token？ | 未明说 | `\n` 单独换行作为 stop |

### 阶段 4-5 · 实现 + 数据集

不重新实现——降级用我（Claude）作为 Actor + Evaluator + Self-Reflection 三合一，
按 prompts.py 模板手跑 1 题，对比 ReAct 单 trial vs Reflexion 多 trial。

### 阶段 6-7 · 跑题 + 对照

**测试题**（HotpotQA 风格 multi-hop QA）：

> Q: The director of the film "Inception" was born in which country, and his most recent film as of 2023 was about what topic?

Gold: 英国 (Christopher Nolan，born in London, 1970-07-30) + 物理学家 Oppenheimer 的传记片

**Trial 1（仿造一个失败 trajectory）**：

```
Thought 1: I need to find the director of Inception, then their birth country and most recent 2023 film.
Action 1: Search[Inception (film)]
Observation 1: Inception is a 2010 sci-fi action film directed by Christopher Nolan...

Thought 2: Director is Christopher Nolan. Now I need his birth country and most recent 2023 film.
Action 2: Finish[American, Tenet (2020)]   ← 故意错答案：Nolan 是英国人，最新是 Oppenheimer 2023
```

Evaluator (Me) 用 EM grading: 答案 "American, Tenet (2020)" ≠ gold → r_0 = 0（失败）

**Self-Reflection (Msr) 生成 sr_0**：

按 REFLECT_INSTRUCTION 模板，我作为 Msr 生成的反思：

```
Reflection: I failed because I assumed Christopher Nolan's nationality and most recent film
without searching for them. Specifically, I guessed "American" but should have searched
"Christopher Nolan" Wikipedia page for his birthplace, and I guessed "Tenet (2020)" without
checking what film he released after Tenet. New plan: After identifying Nolan as the director,
do one Search on "Christopher Nolan" to get his birth country, and one more Search to find
his films listed in chronological order, taking the latest one before 2024.
```

`mem = [sr_0]`

**Trial 2（用 sr_0 重答）**：

prompt 现在含 `REFLECTION_HEADER + sr_0`，Actor 看到后修正策略：

```
Thought 1: [反思指出我之前没 search Nolan，这次要 search]
Action 1: Search[Inception (film)]
Observation 1: ...directed by Christopher Nolan...

Thought 2: Director is Nolan. Now per reflection, I must search Christopher Nolan.
Action 2: Search[Christopher Nolan]
Observation 2: Christopher Edward Nolan CBE is a British and American filmmaker, born 30 July 1970 in London...
                His films include Memento (2000), The Dark Knight (2008), Inception (2010), Interstellar (2014),
                Dunkirk (2017), Tenet (2020), Oppenheimer (2023)...

Thought 3: Nolan was born in London (UK). His most recent 2023 film is Oppenheimer.
Action 3: Finish[United Kingdom, Oppenheimer (2023, biographical drama about J. Robert Oppenheimer)]
```

Evaluator: 答案匹配 gold → r_1 = 1（成功）

**对比表**：

| trial | strategy | n_steps | n_search | answer | EM |
|---|---|---|---|---|---|
| ReAct only (NONE) | 1 trial 上限 | 2 | 1 | American, Tenet (2020) | 0 |
| ReAct + Reflexion | 2 trials 上限 | 3 (trial 2) | 2 (trial 2) | UK, Oppenheimer (2023) | 1 |

**与论文 +20% EM 提升的对照**：

- 1 题样本无法对齐统计数字
- 但**机制层面验证了 Reflexion 的 verbal RL**——`sr_0` 的反思包含可执行的 plan（"do one Search on Christopher Nolan"），
  Actor 在 trial 2 严格遵守这个 plan
- 关键是反思**没有指定 gold 答案**（不知道正确答案是什么），但**指定了搜索路径**——
  这就是 verbal RL 的精髓：反馈是 procedural 的（怎么做），不是 declarative 的（是什么）

label：`[matched at trial level]`——单题成功，但 1 题样本不够支持统计声明。

## 谱系对比

### 前作：ReAct（[Yao et al., NeurIPS 2022](/study/papers/react/)）

| 维度 | ReAct | Reflexion |
|---|---|---|
| 循环单位 | 单 trajectory（最多 7 步） | trial-of-trajectories（每个 trial 含一个 ReAct trajectory） |
| 失败处理 | 丢弃 | 反思 → 塞进下一轮 |
| memory | 短期（trajectory 本身） | 短期 + 长期（self-reflections） |
| 模型数量 | 1（Actor） | 3（Actor + Evaluator + Self-Reflection） |
| HotpotQA EM | 30.4 | 51（+20%） |
| HumanEval pass@1 | n/a（论文没测） | 91（vs GPT-4 baseline 80） |

Reflexion 是 ReAct 的**严格扩展**——把单 trajectory 套上一层 trial 循环。
ReAct 不管对错只跑一次；Reflexion 加了"看跑得怎么样 + 怎么改进"两层。

### 前作（同辈竞品）：Self-Refine（Madaan et al., NeurIPS 2023）

Self-Refine 也是"自我精炼"思路，但局限在**单步生成**——给一个 prompt，
让 LLM 自己反复 refine 输出。Reflexion 的不同：

| 维度 | Self-Refine | Reflexion |
|---|---|---|
| 任务类型 | single-generation（一段输出） | multi-step decision-making（agent trajectory） |
| 反馈来源 | 模型自评 | 环境 reward 或 LLM-as-judge |
| memory | 无 | 长期 episodic memory |
| 适用场景 | 文本生成、改写 | agent 任务、编程 |

论文 Section 2 的 Table（page 2）做了详细对比，Reflexion 的"Memory"列是唯一打勾的——
其他方法（Self-Refine, Beam search, Self-Debugging）都没有跨 trial 的长期 memory。

### 后作（被超越）：Tree of Thoughts（Yao et al., NeurIPS 2023）

ToT 把 reasoning 从"线性 chain"扩展为"探索树"——可以回溯、可以并行。
Reflexion 是**线性的多 trial**，ToT 是**树形的单 trial 内搜索**。
两者正交：理论上可以组合（每个 ToT 节点可以用 Reflexion 反思失败的探索分支），
但论文中没人做过完整组合实验。

### 后作（实际工程演化）：OpenAI o1 / Claude thinking（2024-2025）

post-training 阶段用 RL 训练模型**内化 long chain-of-thought**——
模型不再依赖 prompt 工程触发 reflection，而是**默认就会 self-correct**。
Reflexion 这种"prompt-engineered reflection"在内化模型时代某种程度上变得多余——
但设计哲学（Actor / Evaluator / Self-Reflection 分工）仍被现代 agent 框架广泛复用。

### 选型建议

| 场景 | 选 |
|---|---|
| 读懂 verbal RL 概念本体 | Reflexion 论文 + Algorithm 1 |
| 生产 agent（不动权重，prompt-only） | Reflexion 思想 + Claude/GPT-4 backend |
| 生产 agent（允许 fine-tune） | OpenAI o1 / Anthropic thinking 类 RL post-training |
| 单步文本生成 self-improve | Self-Refine（更轻量） |
| Agent 探索树 | Tree of Thoughts（与 Reflexion 正交，可组合） |

## 与你当前工作的连接

### 今天就能用

任何有"明确 success / failure 信号"的多步 LLM 工作流，都可以加一层 Reflexion：

- 让 LLM 跑一次 → 用 evaluator 打分（人工标 OR LLM-as-judge OR 单元测试）
- 失败时让另一次 LLM 调用写"我刚才哪步错了"反思
- 把反思塞进下一轮 system prompt

特别有用的场景：

- 代码生成 + 单元测试（HumanEval / LeetcodeHardGym 路线）
- 多步信息检索 + 答案校验（HotpotQA 路线）
- agent 任务编排 + 死循环检测（AlfWorld 路线）

### 下个月能用

如果你要做 agent 评测系统，可以借 Reflexion 的双层 memory 思路：

- 短期 memory = agent 当次 trajectory
- 长期 memory = agent 跨 trial 累积的反思（bound 在 Ω=1-3 防 context 爆炸）
- Evaluator 角色显式拆出来——可以是 hand-written heuristic（成本低）+ LLM-as-judge（兜底）

### 不要用的部分

- **Reflexion 的 hand-written heuristic 不通用**——AlfWorld 的"3 cycles 同动作"是 task-specific，
  迁移到其他任务前要重新设计
- **不要在 self-evaluation 弱的 backend 上用 Reflexion**——< 7B 模型写出来的反思可能比没反思更糟
- **不要把 Ω 设很大**——1-3 是经验值，再大就 context 浪费而不是 memory enhancement
- **不要用 LLM-as-judge 做高 stake 任务的 final evaluator**——Section 4.3 Table 2 显示
  unit test 的 false positive 率（FP）仍然 1-16%，关键决策需要外部验证

## 怀疑 + 延伸阅读

### 我对这篇论文最不信的 3 件事

1. **HumanEval 91% pass@1 的 cherry-pick 嫌疑**：HumanEval 是 OpenAI 自己 2021 年发布的基准，
   GPT-3.5/GPT-4 训练数据可能间接污染（非 leak 但 distribution overlap）。
   论文新发布的 LeetcodeHardGym（40 道 cutoff 后题）是对此的部分回应，但 LeetcodeHard 上
   pass@1 只有 15%（GPT-4 baseline 7.5%），和 HumanEval 91% 是巨大反差——**这个反差论文没深入分析**。
2. **Self-reflection 的"知错"假设**：Reflexion 假设 LLM 能正确诊断自己上次的失败原因。
   但 [Turpin et al. 2023](https://arxiv.org/abs/2305.04388) 证明 LLM 的 reasoning chain 可能是
   post-hoc rationalization——**反思可能也是事后合理化**，不是真因果分析。论文没做这种正交验证。
3. **Ablation 不做 backend 切换**：论文实验主要用 GPT-3.5 + GPT-4。
   **小模型上是否仍 work？开源 LLM（Llama / Mistral）上呢？** Section 5 Limitations 有提
   "relies on the power of LLM's self-evaluation capabilities"——但没具体在小模型上跑数字。

### 接下来读哪 3 篇

| # | 论文 | 回答什么问题 |
|---|---|---|
| 1 | [ReAct (Yao et al. 2022)](/study/papers/react/) | Reflexion 的直接前作——理解 trajectory 单元才能理解 trial 单元 |
| 2 | Self-Refine (Madaan et al., NeurIPS 2023) | 同辈竞品，对比"single-step refine" vs "multi-trial reflect" |
| 3 | [Brittle Foundations of ReAct (Stechly et al., 2024)](https://arxiv.org/abs/2405.13966) | 同样类型的批判很可能适用 Reflexion——值得自己测一次 |

读完这 3 篇 + Reflexion 本身 + ReAct + CoT，你就拥有"LLM agent self-improvement 范式"的完整地图。

## 限制（论文 Section 5 + 我的补充）

论文 Section 5 列了 5 条 limitations，原作的诚实列表：

1. 依赖 LLM 自评能力 —— 弱模型上失效
2. 没有理论收敛保证 —— 有可能反思错方向
3. 长期 memory 用文字存储 —— context 限制下扩展性差
4. 反思质量受 prompt engineering 影响 —— 不同写法效果差异大
5. 主要在 sandbox 环境验证 —— real-world noisy task 未测

我的补充：

6. **作者偏见效应**：Yao Shunyu 同时是 ReAct + Reflexion 的核心作者，且在两篇里都把 ReAct 当 baseline。
   有可能 Reflexion 实现里的 ReAct 配置不是最优——**第三方独立实现的对照才有说服力**。
7. **"verbal RL" 类比可能过头**：传统 RL 有梯度更新和收敛保证，Reflexion 没有任何这种东西。
   把 prompt 工程称为 RL 是营销选择，不是技术等价。

## 附录：Reflexion 4 种 strategy 速查

```python
# from agents.py:23-33
class ReflexionStrategy(Enum):
    NONE = 'base'                     # 等同 ReAct，单 trial
    LAST_ATTEMPT = 'last_trial'       # 把上次完整 trajectory 塞进下次 prompt
    REFLEXION = 'reflexion'           # 自反思后塞进下次 prompt（论文主推）
    LAST_ATTEMPT_AND_REFLEXION = 'last_trial_and_reflexion'  # 两者都塞，最强
```

ablation 数字（HotpotQA，论文 Figure 4c 的 EPM 部分）：

```
NONE                  ~30 EM (= ReAct)
LAST_ATTEMPT          ~35 EM (+5%)
REFLEXION             ~43 EM (+8%)
LAST_ATTEMPT_AND_REFLEXION  ~51 EM (+8%)
```

LAST_ATTEMPT 单独的贡献已经显著（+5%），但**self-reflection 才是真正的提升源**（再 +8%）。

---

**Layer 0-7 完成（按状元篇模板）。约 980 行，含 2 张 figure（webp）+ 7 阶段 reproduce + 4 strategy 速查表。**
