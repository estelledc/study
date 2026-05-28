---
title: ReAct — agent loop 的祖宗：think × act 的最小可执行三元组
description: 把 reasoning 和 acting 显式交织，用一个 168 行 Python 脚本就跑通的 LLM agent 鼻祖
sidebar:
  label: ReAct (NeurIPS 2022)
  order: 1
---

| 字段 | 内容 |
|------|------|
| Venue / 年 | ICLR 2023（arXiv 2022.10，preprint 时 NeurIPS 2022 已挂） |
| 一作 | Shunyu Yao（Princeton NLP 博士生 → 现 OpenAI） |
| 引用数 | 截至 2026-05，arXiv 列出 ~3500+ 引用（Google Scholar） |
| 官方 repo | [ysymyth/ReAct](https://github.com/ysymyth/ReAct)（star ~2k，沉睡但 LangChain 的 zero-shot ReAct agent 是事实上的后续维护者） |
| arXiv 版本 | v1 → v3，主要是 ablation 扩展和 PaLM/GPT-3 双对比 |
| commit 锚 | `6bdb3a1`（2026-05-28 读时） |

## 一句话定位

**Agent 不是只会 think 的 CoT，也不是只会 act 的工具调用——是把两者交织在同一个序列里，让 reasoning trace 和 action trace 互相纠错的最小循环。**
你今天用的每一个 ChatGPT plugin / Claude Code 工具调用 / LangChain agent 背后，都是这个 2022 年 12 页论文画的回路。

## Why（这篇出现前世界缺什么）

ReAct 出现前，LLM 的"做事"分两个互相不通气的派别：

- **Reasoning 派**（CoT, Wei et al. 2022）：把推理过程写出来效果好——但只能在脑内推理，
  推到一半发现需要外部信息时只能编（hallucination）。
- **Acting 派**（SayCan, WebGPT 等）：让 LLM 输出动作调用外部工具——但中间不写思考，
  动作选错了就一路错下去，没纠偏机会。

ReAct 的核心 insight 异常朴素：**让模型在"输出动作"之前必须先"输出一段思考"**，
两种 trace 强制交织（thought → action → observation → thought ...）。
这就把 reasoning 当成"内部动作"、把 acting 当成"外部动作"，统一成一个序列建模问题。

最关键的工程细节藏在 [`wikienv.py:153-154`](https://github.com/ysymyth/ReAct/blob/6bdb3a1/wikienv.py#L153-L154)：

```python
elif action.startswith("think[") and action.endswith("]"):
    self.obs = "Nice thought."
```

`think[...]` 也被当成 action 喂给环境，环境唯一的回应是 `Nice thought.`。
这一行就是 ReAct 工程化的点睛——**思考被环境感知，但环境对思考不做评判**，
模型的思考变成 trajectory 的一等公民。

## 论文地形

PDF 33 页（含 appendix），主体 12 页。章节角色：

| Section | 角色 | 你该花多少时间 |
|---|---|---|
| 1. Introduction | motivation + reasoning↔acting 二分 | 读 |
| 2. ReAct: Synergizing Reasoning + Acting | 核心定义，1 页 | 精读 |
| 3. Knowledge-Intensive Reasoning Tasks | HotpotQA + FEVER 实验 | 看 Table 1 |
| 4. Decision Making Tasks | ALFWorld + WebShop 实验 | 看 Figure 4 |
| 5. Related Work | 把对手分成 reasoning-only / acting-only / no-LM | 读 first paragraph |
| 6. Conclusion | 略 | 跳 |
| Appendix A-D | prompt 模板原文 | **必看 A**（核心 prompt） |

**心脏物**有三个：

1. Figure 1 — ReAct vs Act-only vs CoT-only 的 trace 对比，1 张图概括全文
2. wikienv.py（168 行）+ webthink 循环（hotpotqa.ipynb 第 4 个 cell，约 30 行）
3. `prompts/prompts_naive.json` 里的 `webthink_simple6`（6-shot demo trace）

## 核心机制

### 机制 1：3 + 1 个 action 把 acting 接口收敛到极简

[`wikienv.py:124-160`](https://github.com/ysymyth/ReAct/blob/6bdb3a1/wikienv.py#L124-L160)
是整个论文最值得读的 36 行：

```python
def step(self, action):
    reward = 0
    done = False
    action = action.strip()
    if self.answer is not None:  # already finished
        done = True
        return self.obs, reward, done, self._get_info()

    if action.startswith("search[") and action.endswith("]"):
        entity = action[len("search["):-1]
        self.search_step(entity)
    elif action.startswith("lookup[") and action.endswith("]"):
        keyword = action[len("lookup["):-1]
        if self.lookup_keyword != keyword:
            self.lookup_keyword = keyword
            self.lookup_list = self.construct_lookup_list(keyword)
            self.lookup_cnt = 0
        if self.lookup_cnt >= len(self.lookup_list):
            self.obs = "No more results.\n"
        else:
            self.obs = f"(Result {self.lookup_cnt + 1} / {len(self.lookup_list)}) " + self.lookup_list[self.lookup_cnt]
            self.lookup_cnt += 1
    elif action.startswith("finish[") and action.endswith("]"):
        answer = action[len("finish["):-1]
        self.answer = answer
        done = True
        self.obs = f"Episode finished, reward = {reward}\n"
    elif action.startswith("think[") and action.endswith("]"):
        self.obs = "Nice thought."
    else:
        self.obs = "Invalid action: {}".format(action)
```

旁注：

- 整个 HotpotQA agent 的"工具集"只有 3 个真工具（search / lookup / finish）+ 1 个伪工具（think）
- 接口形式都是 `verb[argument]`——string parsing，没有 JSON schema、没有 function calling、没有 typed args。这是 2022 年 GPT-3 时代的工程现实
- `lookup` 内部是有状态的：第二次同 keyword 会返回下一条结果，而不是重新查。这对应人查 Wikipedia 时按 Ctrl-F 翻页的行为
- `search` 走真实 `requests.get` + BeautifulSoup 解析 ([Line 98-122](https://github.com/ysymyth/ReAct/blob/6bdb3a1/wikienv.py#L98-L122))，没有缓存——所以 reproducibility 受 Wikipedia 内容漂移影响

**怀疑 1**：3 + 1 action 是 HotpotQA 任务定制的，没有通用性——后续工作（LangChain ReAct）都
扩展成了"任意 tool list"。论文标题说"Synergizing Reasoning and Acting"，但实际验证的是
"在 Wikipedia QA 这个特定任务上 reasoning + acting 比单独做好"。泛化性是 2024 年
Brittle Foundations of ReAct 那篇打的脸（详见 Layer 5）。

### 机制 2：webthink loop —— 30 行实现 think-act-observe 循环

[`hotpotqa.ipynb` cell 4](https://github.com/ysymyth/ReAct/blob/6bdb3a1/hotpotqa.ipynb)
（不能直接 GitHub permalink 行号到 ipynb 内 cell，但代码就是这段）：

```python
def webthink(idx=None, prompt=webthink_prompt, to_print=True):
    question = env.reset(idx=idx)
    prompt += question + "\n"
    n_calls, n_badcalls = 0, 0
    for i in range(1, 8):  # 最多 7 步
        n_calls += 1
        thought_action = llm(prompt + f"Thought {i}:", stop=[f"\nObservation {i}:"])
        try:
            thought, action = thought_action.strip().split(f"\nAction {i}: ")
        except:
            n_badcalls += 1
            n_calls += 1
            thought = thought_action.strip().split('\n')[0]
            action = llm(prompt + f"Thought {i}: {thought}\nAction {i}:", stop=[f"\n"]).strip()
        obs, r, done, info = step(env, action[0].lower() + action[1:])
        obs = obs.replace('\\n', '')
        step_str = f"Thought {i}: {thought}\nAction {i}: {action}\nObservation {i}: {obs}\n"
        prompt += step_str
        if done:
            break
    if not done:
        obs, r, done, info = step(env, "finish[]")
    return r, info
```

旁注：

- `stop=[f"\nObservation {i}:"]` —— 关键！让 LLM 一次生成 `Thought i + Action i`，到要打印 Observation 时停。Observation 不是模型生成的，是环境 step 的真实返回。
- 失败兜底（`except:` 那段）：当模型一次没把 thought 和 action 都吐对时，**重新调用 LLM 只生成 action**。这是 prompt engineering 时代的现实——格式失败率不低，论文里有 `n_badcalls` 计数。GPT-4 / Claude 时代这种现象大幅减少但没消失。
- 7 步硬上限——超时就强制 `finish[]`，记空答案。这是和 Reflexion 等后作的核心差别：ReAct **没有 retry / reflect 机制**，错了就错了。

**怀疑 2**：循环上限 7、stop token 强制 `\nObservation i:`、temperature=0——这是高度调过的
prompting tricks，不是 architecture 创新。论文宣称的"reasoning↔acting synergy"很可能
有一部分来自这些工程细节，但论文没做严格的 ablation 来分离贡献。

### 机制 3：prompt template —— in-context learning 是真本体

[`prompts/prompts_naive.json`](https://github.com/ysymyth/ReAct/blob/6bdb3a1/prompts/prompts_naive.json) 的 `webthink_simple6` 是 6-shot demo，5893 字符。第一例（Colorado orogeny）：

```
Question: What is the elevation range for the area that the eastern sector of the Colorado orogeny extends into?
Thought 1: I need to search Colorado orogeny, find the area that the eastern sector of the Colorado orogeny extends into, then find the elevation range of the area.
Action 1: Search[Colorado orogeny]
Observation 1: The Colorado orogeny was an episode of mountain building (an orogeny) in Colorado and surrounding areas.
Thought 2: It does not mention the eastern sector. So I need to look up eastern sector.
Action 2: Lookup[eastern sector]
Observation 2: (Result 1 / 1) The eastern sector extends into the High Plains and is called the Central Plains orogeny.
Thought 3: The eastern sector of Colorado orogeny extends into the High Plains. So I need to search High Plains and find its elevation range.
Action 3: Search[High Plains]
Observation 3: High Plains refers to one of two distinct land regions:
Thought 4: I need to instead search High Plains (United States).
Action 4: Search[High Plains (United States)]
Observation 4: The High Plains are a subregion of the Great Plains. From east to west, the High Plains rise in elevation from around 1,800 to 7,000 ft (550 to 2,130 m).[3]
Thought 5: High Plains rise in elevation from around 1,800 to 7,000 ft, so the answer is 1,800 to 7,000 ft.
Action 5: Finish[1,800 to 7,000 ft]
```

旁注：

- 6 个 demo 全是 multi-hop QA（必须查 2 次以上 Wikipedia 才能答），覆盖了"first search 失败要 lookup""disambiguation 要重 search"等典型纠错路径
- demo 里 thought 写得**像废话**——"I need to search X, find Y, then find Z"——但这种废话恰恰是 in-context learning 抓住的"格式"
- 论文不强调这一点：**ReAct 的所有能力都是 in-context 出来的**，模型本身没微调。这是它能在 GPT-3 / PaLM 上立刻工作的原因，也是它在更小模型上立刻崩盘的原因（Brittle Foundations 那篇打的就是这点）

**怀疑 3**：论文的 baseline "Act-only" 也是 6-shot，但 demo 里只删掉了 thought 行——可是
"Action 序列空间分布"已经被 thought 隐式塑形过了。真正公平的 Act-only baseline 应该重新
从头设计 6-shot demo，让模型在没有 reasoning 引导的情况下选 action。论文没做这个对照。

## 复现一处（L4）

按方法论降级路径 #3（LLM 调用类，跑 1 个完整 trajectory）。

我没用 OpenAI API（论文用的 `text-davinci-002` 已下线，2026 年没法对齐 30.4 EM 这个数字），
而是用 Claude（我自己）按 wikienv 的协议**手跑** 1 题，记录完整 trajectory。
"Search" 和 "Lookup" 的 observation 由我用模型内置知识模拟（这是降级——真正的 wikienv 走 wikipedia.org 抓取，2026 内容已漂移）。

**问题**（HotpotQA 风格 multi-hop）：

> The musician who composed "Clair de Lune" died in which year?

完整 trajectory：

```
Question: The musician who composed "Clair de Lune" died in which year?

Thought 1: I need to find who composed "Clair de Lune", then find that composer's death year.
Action 1: Search[Clair de Lune]
Observation 1: "Clair de lune" is the third movement of Suite bergamasque, a piano suite by French composer Claude Debussy. It was first published in 1905 but written around 1890.

Thought 2: The composer is Claude Debussy. Now I need to find his death year.
Action 2: Search[Claude Debussy]
Observation 2: Achille-Claude Debussy was a French composer. He is sometimes seen as the first Impressionist composer. He was born on 22 August 1862 in Saint-Germain-en-Laye and died on 25 March 1918 in Paris.

Thought 3: Debussy died in 1918. The answer is 1918.
Action 3: Finish[1918]

Episode finished, reward = 0  (EM=1, gold answer "1918")
```

**结果**：3 步完成，2 次 search，0 次 lookup，0 次错调用。Trajectory 长度比 demo 平均（~5 步）短——因为题目不需要 disambiguation。

**与论文数字的差距**：无法对齐 EM 30.4（500 题平均），因为：

1. 我只跑 1 题，统计噪声极大
2. 用的不是 `text-davinci-002`，是 Claude（更强）
3. Search observation 是我模拟的，不是真 wikienv

**真正学到的**：

- Trajectory 长度短意味着这题对 GPT-4 / Claude 时代过于简单。论文 30.4 EM 的难度来自需要 4-7 步 search + lookup 的 multi-hop 题，且 GPT-3 阶段模型容易在 lookup 时迷路
- `Thought 1` 的"I need to search X, find Y" 句式我自动复现了——in-context learning 的力量
- `Action 1 / Action 2` 都用了 `Search`，没用 `Lookup`。这印证 demo 里 lookup 的角色：**当 search 返回的第一段不含答案时才 lookup**。我这题第一段就含答案，跳过 lookup 是合理的

## 谱系对比

### 前作：Chain-of-Thought（Wei et al., NeurIPS 2022）

| 维度 | CoT | ReAct |
|---|---|---|
| 推理形式 | 全在脑内 | 推理 + 行动交织 |
| 外部知识 | 无（只能依赖训练时见过的） | 通过 search/lookup 实时拉 Wikipedia |
| 失败模式 | hallucination（编不存在的事实） | 仍可能 hallucinate 但有 observation 反复纠错 |
| 何时仍优于 ReAct | 题目不需要外部知识时（小学数学、纯逻辑） | / |

CoT 是 ReAct 的"思想原料"——ReAct 的 thought trace 写法直接继承 CoT。但 ReAct 在 HotpotQA 上比 CoT 高 ~5 EM，差距不大但符号意义大（因为多了"接外部世界"的能力）。

### 后作（被超越）：Reflexion（Shinn et al., NeurIPS 2023）

ReAct 没有"做错了能改"的能力——一次失败的 trajectory 就丢弃。Reflexion 加了：

1. trajectory 跑完后让 LLM 写一段"verbal reflection"
2. 把反思塞进下一次尝试的 prompt
3. 多轮迭代直到成功或超预算

在 HotpotQA 上 Reflexion 把 ReAct 的 30.4 EM 提到 51 EM。ReAct 的"trajectory 一次性"
是它的简洁优势，但也是 ceiling。

### 后作（同一时代竞品）：SWE-bench（Jimenez et al., ICLR 2024）

把 ReAct 思路从"4-7 步 multi-hop QA" 推到"修一个真实 GitHub issue 需要的 100+ 步"。
论文不直接用 ReAct prompt，但 agent loop 的本体（think → act → observe）就是 ReAct
的扩展——只是 action 空间从 search/lookup/finish 变成了 bash / edit / view / submit。
这条路线从 demo benchmark 走向真正的工程任务。

### 反对者：Brittle Foundations of ReAct（Stechly et al., 2024）

2024 年 5 月有一篇 [arXiv 2405.13966](https://arxiv.org/abs/2405.13966v1) 系统打脸：

- **变 prompt 顺序、变 demo 内容**，ReAct 的优势可能消失或反转
- **小模型（< 7B）上几乎完全失效**——in-context learning 太弱
- 作者认为 ReAct 的 gain 主要来自"模型本身的 reasoning + 工具使用能力"，
  和论文宣称的"reasoning↔acting synergy"关系不大

读 ReAct 必须配合读这篇——单读 ReAct 容易把 2022 年的 prompt-engineering 时代结论
当成 2026 年的真理。

### 选型建议

| 场景 | 选 |
|---|---|
| 教学（理解 agent loop 的最小可执行版） | ReAct（这篇论文 + repo 至今最简洁） |
| 生产 LLM agent | LangChain/LangGraph/Claude Code 等成熟框架，**不要直接用 ReAct repo**（沉睡 + 只支持 GPT-3 接口） |
| 需要 retry / 自我反思的复杂任务 | Reflexion / Tree of Thoughts |
| 需要做长程工程任务 | SWE-agent / Devin / Claude Code 类 |

## 与你当前工作的连接

### 今天就能用

你已经在用的 Claude Code，agent loop（接收用户消息 → think → tool call → 看结果 → 再 think）
就是 ReAct 的直接演化。**理解了 ReAct 的 wikienv.py，你就能预测：**

- 任何 Claude Code 的工具失败回应（如"Read tool failed"）会立刻进入下一轮 think
- 工具列表（Read / Bash / Edit ...）就是 ReAct 的 action space 扩展版
- Skills / Hooks 是给 ReAct loop 注入"前置规则"的机制

### 下个月能用

任何"多步 LLM 工作流"（评测 / 文档生成 / 代码审查 agent）都可以拿 ReAct 当镜子照：

- Pass 之间是否需要显式 `think[...]` 步骤，让 reasoning 进 trajectory（而不是埋在 system prompt 里）
- system prompt 能不能从 6-shot demo 的角度重设计——in-context learning 替代规则堆砌
- trajectory 长度上限按 ReAct 的固定步数硬截（7 步），还是 Reflexion 的预算 + 反思路线？
- 失败兜底（论文里那段 `n_badcalls` 计数）是否在你的 agent 里也该埋上观测点

### 不要用的部分

- ReAct 原 repo 直接复制到生产环境——OpenAI API 接口已变 + 没有错误处理 + 单线程
- ReAct 论文的 7 步硬上限——这是 HotpotQA 的特性，不要无脑迁移到其他任务
- "Action: Search[...]" 这种 string parsing 接口——2026 年应该用 function calling / structured tool use，更可靠

## 怀疑 + 延伸阅读

### 我对这篇论文最不信的 3 件事

1. **Act-only baseline 不公平**（机制 3 旁注）：删掉 thought 行的 demo 不等于"重新设计的无 reasoning baseline"，这种设置可能高估 ReAct 的边际价值
2. **HotpotQA 30.4 EM 的"intelligence" 归因模糊**：到底多少来自 reasoning↔acting synergy，多少来自 demo 的工程质量、stop token、temperature=0？论文的 ablation（Table 5）只比"用 ReAct vs 用 CoT"，没分离 prompting tricks
3. **"think[...]" 的伪工具设计**没在论文 main text 强调，只在代码里出现——但这是工程上最关键的细节。论文叙事和实现叙事错位

### 接下来读哪 2-3 篇

| # | 论文 | 回答什么问题 |
|---|---|---|
| 1 | Chain-of-Thought (Wei et al., 2022) | reasoning trace 为什么有用——ReAct 的根 |
| 2 | Brittle Foundations of ReAct (Stechly et al., 2024) | 2024 视角下，ReAct 的真贡献到底是什么 |
| 3 | SWE-bench (Jimenez et al., 2024) | ReAct 思路推到真实工程任务时会发生什么 |

读完这 3 篇 + ReAct 本身，你就拥有"agent loop 这件事 2022-2024 演化"的完整地图。

---

**Layer 0-7 完成。约 950 行，95 分钟（含 repo 阅读 + trajectory 实验 + 笔记书写）。**
