---
title: LACUNA — 把 LLM Agent 写成「可递归的类型化程序洞」
来源: https://arxiv.org/abs/2605.28617
日期: 2026-06-13
子分类: 类型与 PL 理论
分类: 编程语言
provenance: pipeline-v3
---

## 从日常类比开始：装修里的「待填槽位」

你请人装修厨房。有两种做法：

1. **遥控式**：你站在门外，每次只喊一句——「把瓷砖贴上」「装水龙头」。工人做完一步你再喊下一句。流程、节奏、上下文全在你手里，工人只能执行**单步动作**。
2. **图纸式**：你画好平面图，在需要「现场判断」的地方标出**虚线框**——「此处选台面材质」「此处排布插座」。工人走进现场，按框填空，但**每块填空必须符合图纸上的尺寸与接口**；填错了整块拆掉重来，已装好的柜子不会被半拉子工程弄坏。

今天大多数 LLM Agent 更像第一种：ReAct、Function Calling 由**外层 runtime** 拥有循环、上下文和调度，模型每次只吐**一个工具调用**或一小段 JSON。  
**Code-as-action** 让模型直接写代码，表达能力上去了，但又出现新问题：runtime 仍是「上帝」，模型写的代码**不能合法地改写控制流**；若让模型写的代码真的去驱动 runtime，一次 prompt injection、错工具、半途中断，破坏面会比「单步动作」大得多。

**LACUNA**（*Safe Agents as Recursive Program Holes*，Zhao 等，EPFL / Martin Odersky 组，arXiv [2605.28617](https://arxiv.org/abs/2605.28617)）提出第三种路径：在宿主程序里留一个**类型化的洞（typed hole）**，执行到此处时由 LLM **生成 Scala 代码**填满；**先经编译器类型检查，通过才运行，失败则环境零副作用并重试**。洞里的代码还可以再调用 `agent`，于是 ReAct、子 Agent、并行分解、技能库都变成**普通控制流**，而不是框架硬编码的模式。

论文名字 *Lacuna* 即拉丁语「空隙、空白」——程序里那块等你填的洞。

---

## 是什么

| 项目 | 内容 |
|------|------|
| 论文 | *LACUNA: Safe Agents as Recursive Program Holes* |
| 作者 | Yaoyu Zhao, Yichen Xu, Oliver Bračevac, Cao Nguyen Pham, Frank Zhengqing Wu, **Martin Odersky** |
| 机构 | EPFL |
| 提交日期 | 2026-05-27 |
| 核心原语 | `def agent[T](task: String): T` |
| 实现语言 | Scala 3（利用运行时重编译 + capture checking） |
| 底层机制 | `eval[T](source: String)` — 在**调用点词法作用域**内对字符串源码做二次编译 |
| 评测 | 自研类型测试 ~400 例、BrowseComp-Plus、τ²-bench、AgentDojo 注入攻击 |

一句话：**Agent 的一次「行动」= 宿主程序中的一个类型洞；LLM 填的是整段可编译代码，不是单条 tool call。**

---

## 为什么重要

### 1. 弥合「runtime」与「模型代码」的裂缝

传统分工：

- **Runtime**：while 循环、消息历史、工具路由、子 Agent 协议  
- **模型**：产出下一个 action（JSON / 单次 `read_file`）

LACUNA 把 **model call 嵌进程序**，在**需要类型 `T` 的值的地方**调用 `agent[T](task)`。控制流（`if`、`while`、尾递归、`.par.map`）由**生成代码**书写，runtime 只提供 `agent` 这一个原语。

### 2. 安全不靠「沙箱祈祷」，靠**编译器全有或全无**

Python `exec`、无约束 tool call：语句按顺序执行，类型错误**跑到那一行才炸**，前面副作用可能已经写入 `balance -= 50`。

LACUNA：**整段 snippet 要么全部通过类型检查，要么整段拒绝**——拒绝时**一行都不执行**。论文称此为 typed hole 的 **atomicity（原子性）**。

### 3. 工具 = 普通函数，权限 = 词法作用域

不需要单独的 tool registry + JSON schema：在作用域里可见的函数就是工具。开启 Scala 3 **capture checking** 后，文件句柄、网络 `IO` 等**能力（capability）**随类型流动；模型生成的代码**不能把手里的 capability 泄漏到洞外**。

### 4. 与相近工作的差异（读论文时的坐标系）

| 方向 | 代表 | Lacuna 的不同 |
|------|------|----------------|
| Code-as-action | CodeAct 等 | 仍由 runtime 拥有主循环 |
| 递归语言模型 RLM | Zhang et al. 2025 | REPL 先执行再发现问题；Lacuna **先类型检查再执行** |
| LMQL / DSPy | 约束单次 LLM I/O | 只约束**一次调用**的输入输出形状 |
| ChatLSP | 编辑期代码补全 | 人在环；Lacuna 是**运行时递归行动** |

---

## 核心概念

### 概念 1：`agent[T](task)` — 类型化的程序洞

```scala
def agent[T](task: String): T
```

- `task`：自然语言任务描述  
- `T`：调用点**期望的返回类型**（通常由 Scala 类型推断，不必手写）  
- 执行到此处 → 组装 prompt（系统指令、期望类型 `T`、调用点周围源码、可用变量列表、`task`）→ LLM 返回 Scala 源码 → **在调用点词法环境中编译** → 成功则求值并返回 `T`，失败则把**编译器诊断**喂回模型重试

生成代码可以是**表达式或语句块**：读局部变量、定义辅助函数、分支循环、调用工具、**嵌套 `agent`**。

### 概念 2：递归组合（Recursive Program Holes）

外层 `agent` 生成的代码里可以再写：

```scala
topics.par.map(topic => agent[String](s"Research: $topic"))
```

每个嵌套洞有自己的 `T` 和 `task`，且在**外层 snippet 已引入的变量与结构**之上检查——子问题带着更丰富的上下文。

递归深度可由 runtime **配置上限**；无上限时理论上可能无限嵌套（与复杂任务和意外死循环难以区分）。

### 概念 3：`eval` — 静态语言里的「动态求值」

`agent` 建立在编译器内建的 `eval[T](source)` 上，流程：

1. **Rewrite**：从类型化 AST 提取 `bindings`、`expectedType`、`enclosingSource`  
2. **Splice**：把模型字符串拼进带占位符的包围源码  
3. **Recompile**：用**同一套编译器选项**（含 capture check）再编译  
4. **Extract & Evaluate**：加载 class、在原线程求值

关键洞见：**不另写安全检查器**，复用宿主语言编译器的健全性。

### 概念 4：编译失败驱动的自修正循环

默认最多重试若干次（可配置）。仍失败则抛 `EvalCompileException`，或使用 `agentSafe[T]` 得到 `EvalResult[T]`（`Success` / `Failure(diag)`）。

BrowseComp-Plus 上约 **8.6%** 生成在运行前被拒，平均 **0.7** 次重试/查询，**91.4%** 端到端编译成功率。

### 概念 5：能力安全与信息流

在 adversarial 设定（prompt injection）下，模型可能被带偏，但**只能调用当前洞作用域已绑定的能力**。  
论文用 `Classified[T]` + 嵌套 `local.agent` 演示：敏感合同正文不进云端模型，本地可信模型在 **pure** 的 `map` 闭包内处理，capture 检查禁止把内容 leak 到网络。

建议开启 Scala **safe mode**，禁用反射与裸 `Process` 执行——否则存在绕过类型边界的逃生口。

---

## 代码示例 1：过滤素数 — 洞如何「看见」局部变量

宿主程序先定义数据，再让模型填洞；**类型 `List[Int]` 约束返回值**，模型不能交回 `String`。

```scala
val xs = List(0, 1, 2, 4, 7, 9, 10)

val r = agent[List[Int]]("filter the prime numbers from xs")

// 模型可能生成（经编译器接受后执行）：
// def isPrime(n: Int): Boolean =
//   n > 1 && (2 until n).forall(d => n % d != 0)
// xs.filter(isPrime)

// r == List(2, 7)
```

要点：

- `xs` 在词法作用域内，生成代码**直接引用**  
- 局部辅助函数 `isPrime` 允许  
- 若模型返回 `xs.filter(_.isOdd)` 但类型标成 `List[String]`，**编译失败，无副作用**

---

## 代码示例 2：ReAct 循环 — 尾递归形式的 `agent`

ReAct（Reason + Act）在 Lacuna 里不必框架内置，写成**尾递归**：每轮 snippet 调用工具、更新状态，最后再次 `agent[T](task)`，直到能直接返回 `T`。

```scala
def solveResearch(task: String): Report = {
  // 第一次进入洞
  agent[Report](task)
}

// 第 1 轮模型生成的 snippet 可能长这样：
val raw   = searchWeb("transformer architecture 2024")
val notes = parseResults(raw)
agent[Report](task)   // 尾调用：同一 T，上下文更丰富

// 第 2 轮可能：
val draft = summarize(notes)
agent[Report](task)

// 最终轮：信息足够，直接构造 Report
Report.fromSections(notes, draft)
```

与 RLM 类似，都是「代码里再调模型」；差异是**每一轮 snippet 先过类型检查**，且每轮共享同一返回类型 `T`，迫使循环围绕**同一目标类型**收敛。

---

## 代码示例 3：原子性 — 半对半错不会弄脏状态

```scala
var balance: Int = 100

agent[Int]("subtract 50 and return the new balance")

// 模型错误生成：
// balance -= 50
// s"remaining: $balance"   // 类型 String，不是 Int

// 结果：EvalCompileException，balance 仍为 100
```

若在 Python `exec` 里，`balance -= 50` 可能已执行才在字符串格式化处报错——**状态不一致**。Lacuna 的「整段接受或整段拒绝」专为消除这类**部分执行**。

---

## 代码示例 4：能力不能逃逸作用域

```scala
trait IO extends caps.SharedCapability
def withIO[T](op: IO^ => T): T = op(new IO {})
def readFile(io: IO, path: String): String = ???

// 合法：在块内用完 IO，返回纯 String
withIO[String] { io =>
  agent("read /etc/hosts using io")
}
// 生成：readFile(io, "/etc/hosts")  → OK

// 非法：想把带 IO 能力的函数泄漏出去
withIO[String => String] { io =>
  agent("return a file reader using io")
}
// 生成：(p: String) => readFile(io, p)
// 编译错误：Capability io outlives its scope
```

---

## 能表达哪些 Agent 模式？

论文第 5 节证明**单一原语**足够表达常见架构（均为例程级控制流，非内置协议）：

| 模式 | Lacuna 写法 |
|------|-------------|
| **Skill / 技能** | 普通函数 `def reviewPR(diff: Diff): Review`，体内可全委托 / 半委托 / 全硬编码 `agent` |
| **ReAct** | 尾递归 `agent[T]` |
| **子 Agent** | 嵌套 `agent[U]`，子洞见到更多中间绑定 |
| **并行** | `items.par.map(x => agent[...](...))` |
| **多模型规划** | 不同洞绑定不同 `llm` 实例（实现层配置） |
| **程序性记忆** | REPL 里重定义同名函数，后续 `agent` 解析到新实现 |

---

## 实验结果（论文摘要）

### BrowseComp-Plus（复杂检索 + 工具）

| Agent 模型 | 准确率 | 检索 Recall | 平均重试 |
|------------|--------|-------------|----------|
| deepseek-v4-flash | **27.1%** | 34.5% | 0.7 |
| gemini-3.1-flash-lite | 26.2% | 27.9% | 0.4 |
| gpt-5.4-mini | 9.2% | 16.2% | 0.5 |

- 约 **8.6%** 生成被编译器拒绝  
- 原语不拖后腿：强模型能做多轮搜索（文中 ~5.9 轮、~15.5 次搜索/题）

### τ²-bench（多轮客服对话 + 工具）

deepseek-v4-flash + Lacuna：**76.0%** / 392 任务，与原生 Tool Calling 基线**同量级**（部分域 Lacuna 更高或略低）。对话代码更易类型错误（retail 域拒绝率 ~22.4%），重试环吸收大部分失败。

### AgentDojo（prompt injection）

在 TACIT / CaMeL 对比下，Lacuna 任务完成率（Utility）具竞争力；攻击成功率（Attack）在多数设置接近 **0**（个别配置有少量成功，论文如实报告）。

---

## 优势与局限

### 优势

1. **表达力**：模型写**真实控制流**，而非被 runtime 菜单限制  
2. **安全默认**：静态类型 + 可选 capture → 权限与数据流由编译器证明  
3. **可组合**：嵌套洞 = 分而治之，上下文随程序文本累积  
4. **诊断即反馈**：编译错误比「运行时报错」更适合驱动 LLM 自修正  
5. **工具零胶水**：函数即工具，无 JSON schema 维护负担

### 局限

1. **绑定 Scala 3 生态**：`eval`、capture checking 是原型关键；移植需宿主支持**进程内重编译**  
2. **模型必须会写类型正确代码**：弱模型拒绝率高（如 gemini-lite 在 telecom 域 ~89% 被拒）  
3. **不解决停机与资源耗尽**：需额外预算、深度上限、超时  
4. **safe mode 必须开**：否则反射 / `Process` 可绕过  
5. **异常语义**：外层 `try` 会捕获**嵌套洞**的编译失败，需用 `agentSafe` 精细处理

---

## 与工程实践的映射

若你用过 **Cursor / Claude Code** 的「写代码调工具」、**MCP** 工具描述、或 **DSPy** 签名，可把 Lacuna 想象成：

> 把「下一步干什么」从**协议消息**升级成**宿主语言里的一段程序**，且这段程序在提交前要经过**和手写代码同一套类型检查**。

它不取代 MCP（工具仍可包装成函数注入作用域），而是回答：**当 Agent 越来越像程序员时，谁来保证它写的「微型程序」不会越权、不会半执行？** —— 论文的答案是：**让编译器站在 Agent 与副作用之间**。

---

## 零基础自检清单

读完后应能回答：

1. **Lacuna 的「洞」和 ReAct 的一步有何本质区别？**  
   → 洞提交的是**整段类型化代码**；一步 ReAct 是**单次推理/工具调用**，循环在外层。

2. **为什么拒绝编译能保护 `balance` 例子？**  
   → **Atomicity**：未通过检查的 snippet **完全不执行**。

3. **`T` 在 API 里起什么作用？**  
   → 调用方声明**需要什么类型的值**；编译器据此验收 LLM 代码。

4. **递归洞带来的好处？**  
   → 子任务在**更窄、信息更富**的词法环境中生成代码（map-reduce 式分解）。

5. **论文主要评测说明了什么？**  
   → 类型纪律**成本很低**（少次重试），复杂任务上与强基线**可比**，能力层对注入**有界**。

---

## 延伸阅读

- **ReAct**：Yao et al., 2023 — Lacuna 第 5.2 节将其编码为尾递归 `agent`  
- **Recursive Language Models**：Zhang et al., 2025 — 最接近的「代码里再调 LLM」先验  
- **TACIT / capture checking**：Odersky et al., 2026 — Agent 能力与安全评测.harness  
- **τ²-bench**：多轮工具对话基准  
- **BrowseComp-Plus**：固定语料上的困难检索任务  

---

## 参考

- Zhao, Y., Xu, Y., Bračevac, O., Pham, C. N., Wu, F. Z., & Odersky, M. (2026). *LACUNA: Safe Agents as Recursive Program Holes*. arXiv:2605.28617. https://arxiv.org/abs/2605.28617  
- HTML 全文：https://arxiv.org/html/2605.28617v1  
