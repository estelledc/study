---
title: ReAct — Reasoning and Acting
来源: 'Yao et al., "ReAct: Synergizing Reasoning and Acting in Language Models", ICLR 2023'
日期: 2026-05-29
子分类: 智能体与 LLM
分类: 机器学习
难度: 中级
provenance: pipeline-v3
---

## 是什么

ReAct 是一种**让 LLM 在解决任务时反复"想一下 → 做一件事 → 看到反馈 → 再想一下"**的提示方法。日常类比：像侦探破案——先想想（"嫌疑人可能去过现场"）→ 去现场调监控（**行动**）→ 看到 X 出现在画面里（**观察**）→ 再想想（"那 X 是不是同伙？"）→ 继续。

具体来说，模型每一步都输出三类内容轮换：

- **Thought**：自由文本的推理（"我得先查 Tom 的生日"）
- **Action**：结构化指令调用工具（`search("Tom birthday")`）
- **Observation**：工具返回的内容（"Tom 生于 1990 年"）

三者循环，直到模型输出 `Finish[答案]` 为止。

这个名字 ReAct 是 **Reason + Act** 的合写。它不是新模型，是一种 **prompt 写法** —— 给 LLM 几个手写示例，它就学会照这个格式输出。

## 为什么重要

ReAct 是今天每一个"AI 会用工具"的产品的祖先：

- **ChatGPT Plugins / Claude Tool Use / OpenAI function calling** 整套范式都是从 ReAct 来的——把"模型说话"和"模型调工具"放在同一条轨迹里
- **Claude Code / Cursor / Devin** 这些 coding agent 的主循环就是 ReAct loop——读代码（grep）→ 改文件（edit）→ 跑测试（bash）→ 看错误 → 调整
- 比纯 [[cot]] 强一个量级：CoT 只能在脑内想，想到一半需要外部信息时只能编（hallucination）。ReAct 可以真去搜、真去查计算器、真去读数据库
- 在 HotpotQA（多跳问答）/ FEVER（事实核查）/ ALFWorld（家务模拟）/ WebShop（网购模拟）四类任务上把当时的 LLM 推到 SOTA

不理解 ReAct，下面这些事都讲不清：

- 为什么 Claude Code 的工具调用失败后会自动进入下一轮思考重试
- 为什么 LangChain 早期 agent 写法看起来都长一个样
- 为什么 [[toolformer]] / [[swe-agent]] 这些工作都说"我们扩展了 ReAct"

## 核心要点

ReAct 的循环结构可以拆成 **3 + 1** 个步骤：

1. **Thought（思考）**：模型用自由文本写"我接下来要干什么、为什么"。这一步不调工具，只是 reasoning。
2. **Action（行动）**：模型按 `verb[argument]` 格式输出一条指令，比如 `Search[Claude Debussy]`。这是结构化的，外部代码要能解析。
3. **Observation（观察）**：外部代码执行 Action，把结果（搜索摘要 / 计算结果 / 错误信息）拼回 prompt 末尾。

**+1 是关键的工程细节**：`think[...]` 也被注册成一个合法 action，环境对它返回固定字符串 "Nice thought."。这让"思考"也变成轨迹里有形的一步——可以被日志抓、被人类审、被后续步骤引用。

加起来就是：

```
Thought 1 → Action 1 → Observation 1
Thought 2 → Action 2 → Observation 2
...
Thought N → Action N: Finish[答案]
```

整个过程不微调模型，全靠 **6 个手写示例**（few-shot demo）让 LLM 学会这个格式。

## 实践案例

### 案例 1：简单 multi-hop QA

问题："谁更年长，Tom 还是 Jerry？"

```
Thought 1: 我需要先查 Tom 的生日。
Action 1: Search[Tom birthday]
Observation 1: Tom 生于 1990 年。
Thought 2: 现在查 Jerry 的生日。
Action 2: Search[Jerry birthday]
Observation 2: Jerry 生于 1988 年。
Thought 3: 1988 < 1990，Jerry 更年长。
Action 3: Finish[Jerry]
```

模型每一轮都把 Observation 拼回 prompt，所以下一轮 Thought 能看见前面的所有证据。

### 案例 2：Coding agent 的 ReAct loop

Claude Code 的工作循环就是 ReAct：

```
Thought: 用户要我修这个 bug，先看相关文件
Action: Read[src/auth/login.ts]
Observation: <文件内容...>
Thought: 第 42 行的 await 漏了，加上
Action: Edit[src/auth/login.ts, line 42, 加 await]
Observation: 编辑成功
Thought: 跑测试验证
Action: Bash[npm test]
Observation: 1 个测试失败...
Thought: 这个失败是因为...
```

把 `Search` / `Lookup` 换成 `Read` / `Edit` / `Bash`，循环骨架完全一样。

### 案例 3：和 [[cot]] / [[reflexion]] 对比

| 方法 | 思考 | 行动 | 反思 |
|---|---|---|---|
| [[cot]] | 有（脑内推理） | 无 | 无 |
| ReAct | 有 | 有（调工具） | 无 |
| [[reflexion]] | 有 | 有 | 有（trajectory 失败后写一段反思，下次重试） |

ReAct 比 CoT 多了"接外部世界"，比 Reflexion 少了"做错了能改"。它是中间那一档——简洁、能跑、覆盖大部分任务。

## 踩过的坑

1. **Action 格式错 → 工具不执行**：模型偶尔输出 `search [Tom]`（多空格、首字母大小写错、JSON 不合法）。外部解析失败就拿不到 Observation。早年 GPT-3 时代格式失败率不低，论文里专门有 `n_badcalls` 计数。GPT-4 / Claude 时代大幅减少但没消失——还是要写兜底的 retry。

2. **Observation 太长 → 上下文爆**：`grep` 一搜返回 1000 行，全拼进 prompt 就把窗口占完了。实战要做截断或摘要。原论文的 `Lookup` 是有状态的——同一个 keyword 第二次调用返回下一条结果，相当于 Ctrl-F 翻页，也是为了控制单次 Observation 长度。

3. **死循环：一直 plan 不 finish**：模型陷入"再查一个就能答了"的执念，一步步消耗预算。原论文用 **7 步硬上限**，超过强制 `Finish[]`。任何生产 agent 都要配 max iterations。

4. **工具描述写不清 → 模型不会调**：6-shot demo 里如果没演示某个工具的典型用法，模型在新问题上几乎不会主动用它。**demo 的覆盖度比工具的数量更重要**。

5. **stop token 没设对 → 模型自己幻觉 Observation**：如果不告诉模型"生成到 `Observation:` 就停"，它会自己编一段假的 observation 接着写。原论文用 `stop=["\nObservation i:"]` 强制停笔，让 Observation 必须由真实工具返回。

## 历史小故事（可跳过）

- **2022 年初**：[[cot]]（Wei et al.）出来，证明"让模型把思考过程写出来"能大幅提升数学和推理任务的准确率。但 CoT 全在脑内，遇到需要外部信息时只能编。
- **2022 年 10 月**：Princeton 的博士生 Shunyu Yao 和 Google Brain 团队把 CoT 加上 **acting**——让模型在思考之间穿插调用 Wikipedia API，论文挂上 arXiv。
- **2023 年 5 月**：ICLR 2023 录用。同期 Reflexion / Tree of Thoughts / Toolformer 一批工作把 ReAct 思路朝不同方向扩展。
- **2023 年 6 月**：OpenAI 发布 function calling API，把 ReAct 的 `verb[argument]` 字符串协议升级成 JSON schema，工程上更可靠。
- **2024 年**：Claude Tool Use / MCP（Model Context Protocol）把"工具接入 LLM"标准化。**底层循环还是 ReAct**——只是换了更结构化的接口。

## 学到什么

1. **Reasoning + Acting 的协同**比单独做 reasoning 或单独做 acting 都强——这是过去 4 年 LLM agent 范式的奠基洞见
2. **Few-shot demo 就能教会复杂协议**：不微调模型，6 个手写例子 + 严格的 stop token 控制，就能让 LLM 学会一套结构化交互
3. **思考也是 trajectory 的一等公民**：把 `think[...]` 注册成伪 action，让"内部推理"变成可观测、可审计的轨迹节点。这个细节论文不强调，但所有现代 agent 框架都继承了
4. **工程细节决定上限**：stop token / temperature=0 / 7 步上限 / few-shot demo 写法——这些"小事"加起来才是 ReAct 真正能跑出 SOTA 的原因

## 延伸阅读

- 原论文 12 页 PDF：[ReAct (arXiv 2210.03629)](https://arxiv.org/abs/2210.03629)（核心机制就讲完了，第 3 节最值得读）
- 官方代码：[ysymyth/ReAct](https://github.com/ysymyth/ReAct)（`wikienv.py` 168 行 + `hotpotqa.ipynb` 30 行就是全部 agent）
- 反思视角：[Brittle Foundations of ReAct (Stechly et al., 2024)](https://arxiv.org/abs/2405.13966)（2024 年回头看 ReAct 的真贡献到底是什么）
- [[cot]] —— ReAct 的思想原料，先读这篇再读 ReAct
- [[reflexion]] —— 给 ReAct 加"反思"的后续工作
- [[swe-agent]] —— 把 ReAct 思路推到真实 GitHub 工程任务

## 关联

- [[cot]] —— Chain-of-Thought，ReAct 的前作；CoT 只思考，ReAct 思考+行动
- [[reflexion]] —— ReAct 的后作，加了"做错了能改"的反思层
- [[toolformer]] —— 把工具调用能力训练进模型本体；和 ReAct 是不同路线（训练 vs prompt）
- [[swe-agent]] —— 把 ReAct 循环用在真实软件工程任务上
- [[instructgpt]] —— ReAct 原论文用的 backend 模型（text-davinci-002）
- [[gpt-3]] —— ReAct 验证的另一个 backend
