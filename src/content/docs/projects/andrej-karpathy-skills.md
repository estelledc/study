---
title: Karpathy 启发的 Claude Code 行为调优指南
来源: https://github.com/multica-ai/andrej-karpathy-skills
日期: 2026-06-13
分类: CLI
子分类: 开发者工具
provenance: pipeline-v3
---

# Karpathy 启发的 Claude Code 行为调优指南

## 一、这个项目是什么

Karpathy 启发的 Claude Code 行为调优指南（Karpathy-Inspired Claude Code Guidelines），是一个开源项目，目标很直接：**用一行 `CLAUDE.md` 文件，改善 Claude Code 写代码时的行为**。

项目由 Multica 团队维护，灵感来自 Andrej Karpathy 在 X 上的一条推文——他观察到 LLM 在编程时有几个反复出现的问题。这个项目就是把这些问题总结出来，变成四条可执行的规则，放进项目的 `CLAUDE.md` 文件里，让 Claude Code 每次工作前都读到这些规则。

简单说：**它不是一个新的工具，而是一份写给 AI 的"行为守则"**。

## 二、背景：LLM 写代码的四个常见毛病

Karpathy 的推文指出了 LLM 写代码时最常见的四个问题：

1. **替你做错误假设** — 模型会默默选一个解释，然后不问你直接开干，结果方向错了
2. **过度复杂化** — 明明 100 行能搞定，非要写成 1000 行，堆砌不必要的抽象
3. **乱碰不该碰的代码** — 改一个地方，顺手把相邻的注释、格式、甚至无关代码都改了
4. **不会管理自己的困惑** — 不明白的时候不问你，而是硬着头皮猜

打个日常类比：想象你在厨房教一个很热心但经验不足的帮手做饭。你让他"做个简单的炒蛋"，他可能：
- 自作主张加了五种你没要的调料（过度复杂）
- 把你案板上切好的肉也重新切了一遍（乱碰不该碰的）
- 以为你要的是煎蛋而不是炒蛋，直接按煎蛋的做法来了（错误假设）
- 其实不知道盐放多少，但不问你，凭感觉放了半罐（不管理困惑）

这个项目要做的，就是给这个帮手一份"厨房守则"，告诉他每次动手前先想清楚。

## 三、四个核心原则

项目提炼出四条原则，每一条都针对上面的一个毛病。

### 原则一：编码前思考（Think Before Coding）

**核心：不要假设，不要隐藏困惑，把权衡摆到台面上。**

动手写代码之前，先做这几件事：
- 明确列出你的假设。如果有不确定的地方，直接问，别猜
- 如果一个问题有多种理解方式，把它们都列出来，让提问者选
- 如果你觉得有更简单的做法，说出来
- 如果你困惑了，停下来，说出哪里不清楚，然后问

这条原则的本质是：**把"默默犯错"变成"先确认再做"**。

### 原则二：简洁优先（Simplicity First）

**核心：用最少的代码解决问题，不做任何推测性的扩展。**

具体做法：
- 不要添加需求里没有的功能
- 不要为一次性使用的代码创建抽象层
- 不要添加没人要求的"灵活性"或"可配置性"
- 不要为不可能发生的场景写错误处理
- 如果 200 行能写成 50 行，重写它

自我检验的标准很简单：**如果一个资深工程师看了觉得"这太复杂了"，那就简化。**

### 原则三：精准修改（Surgical Changes）

**核心：只碰必须碰的，只清理自己制造的混乱。**

编辑已有代码时：
- 不要顺手"改进"相邻的代码、注释或格式
- 不要重构没坏的东西
- 沿用现有风格，即使你不喜欢那种写法
- 如果发现无关的死代码，提一句就好，不要删

如果你的改动导致某些导入或变量变得没用，删掉它们——但只删你自己造成的，不要动别人留下的。

**检验标准：每一行被修改的代码，都应该能追溯到用户的原始请求。**

### 原则四：目标驱动执行（Goal-Driven Execution）

**核心：定义成功标准，循环验证直到达成。**

这是最有意思的一条。它的核心洞察来自 Karpathy 的另一句话：

> "LLM 非常擅长循环执行直到达成特定目标。不要告诉它该做什么，给它成功标准，然后看着它完成。"

意思是：与其说"去做 X"，不如说"做到 Y 就算完成"。

对比两种说法：

| 指令式（弱） | 目标式（强） |
|---|---|
| "添加输入验证" | "为无效输入写测试，然后让它们通过" |
| "修复这个 bug" | "写一个能重现这个 bug 的测试，然后让它通过" |
| "重构 X 模块" | "确保重构前后测试都能通过" |

对于多步骤任务，用一个简短的计划格式：

```
1. [步骤描述] → 验证: [检查方法]
2. [步骤描述] → 验证: [检查方法]
3. [步骤描述] → 验证: [检查方法]
```

成功的标准越清晰，AI 就越能独立工作，不需要你每一步都盯着。

## 四、代码示例

### 示例一：一个"好"的 CLAUDE.md 文件

下面是一个最小化的 `CLAUDE.md` 内容，可以直接放到项目根目录：

```markdown
# CLAUDE.md — Behavior Guidelines

**Tradeoff:** Bias toward caution over speed. Trivial tasks don't need full rigor.

## 1. Think Before Coding
- State assumptions explicitly. If uncertain, ask.
- Present multiple interpretations — don't pick silently.
- Push back if a simpler approach exists.
- Stop and name what's unclear. Ask.

## 2. Simplicity First
- No features beyond what was asked.
- No abstractions for single-use code.
- If 200 lines could be 50, rewrite it.

## 3. Surgical Changes
- Don't "improve" adjacent code, comments, or formatting.
- Match existing style, even if you'd do it differently.
- Remove only the imports/variables YOUR changes made unused.

## 4. Goal-Driven Execution
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- State a plan with verification checkpoints for multi-step tasks.
```

### 示例二：实际使用中的对话对比

**不使用指南时（常见问题）：**

用户说："给这个登录页面加个邮箱格式验证。"

AI 可能会：
1. 默默假设邮箱格式正则应该是某种特定写法（没确认）
2. 顺便把整个表单组件的重构了（过度改动）
3. 顺手改了按钮的颜色和间距（不该碰的也碰了）
4. 写了一个 80 行的验证函数，带五种错误类型和自定义 UI 组件（过度复杂）

**使用指南后（期望行为）：**

用户说同样的话，AI 会先回复：

> 我来加邮箱格式验证。先确认几点：
>
> 1. 邮箱格式的正则，用常见的 `^[^\s@]+@[^\s@]+\.[^\s@]+$` 可以吗？还是有特定要求？
> 2. 验证失败时，是直接显示错误文字，还是需要其他交互？
> 3. 我只改验证逻辑部分，不动其他样式和组件结构，可以吗？
>
> 计划：
> - 步骤1：写一个邮箱验证函数 → 验证：用正确和错误的邮箱地址测试
> - 步骤2：在提交按钮点击时调用验证 → 验证：错误时阻止提交并显示提示

你看，区别在于：**先确认、先计划、先问，然后再动手**。

## 五、安装和使用

项目提供了两种安装方式：

**方式 A：Claude Code 插件（推荐）**

在 Claude Code 里运行：

```
/plugin marketplace add forrestchang/andrej-karpathy-skills
/plugin install andrej-karpathy-skills@karpathy-skills
```

这样指南会变成插件，在所有项目中生效。

**方式 B：直接放到 CLAUDE.md（按项目）**

新项目：
```bash
curl -o CLAUDE.md https://raw.githubusercontent.com/forrestchang/andrej-karpathy-skills/main/CLAUDE.md
```

已有项目（追加到现有文件末尾）：
```bash
echo "" >> CLAUDE.md
curl https://raw.githubusercontent.com/forrestchang/andrej-karpathy-skills/main/CLAUDE.md >> CLAUDE.md
```

项目还提供了一个 Cursor 的规则文件（`.cursor/rules/karpathy-guidelines.mdc`），在 Cursor 编辑器中也能用。

## 六、怎么判断它在工作

项目列出了四个信号，说明这些指南正在起作用：

- diff 中不必要的改动变少了 — 只有你要求的那些改动出现
- 因为过度复杂而导致的重写变少了 — 代码第一次就写得简洁
- 澄清问题出现在实现之前 — 而不是犯错之后才来问
- PR 更干净精简 — 没有顺带的重构或"改进"

## 七、个人理解

这条指南最打动我的一点是：**它不试图改变 AI 的能力，而是改变 AI 的工作方式**。

LLM 本身已经很强了，但它有个习惯——太急于给出答案，而不愿意花时间确认自己真的理解了问题。这四条原则，本质上是在给 AI 踩刹车：

1. 编码前思考 = 踩刹车，确认方向
2. 简洁优先 = 踩油门但别超速，保持克制
3. 精准修改 = 别乱打方向盘，只转你需要的那一点
4. 目标驱动 = 看目的地而不是只看脚下的路

作为一个编程初学者，我觉得第四条特别有价值。以前我让 AI 帮忙写代码时，经常说"做个 XX 功能"，然后得到的结果要么太简单要么太复杂。如果我改成说"做一个 XX 功能，成功标准是 YY，验证方法是 ZZ"，结果会精确得多。

## 八、小结

| 要点 | 说明 |
|---|---|
| 项目本质 | 一份写给 Claude Code 的行为守则 |
| 来源灵感 | Andrej Karpathy 对 LLM 编程问题的观察 |
| 核心方法 | 四条原则放入 CLAUDE.md，每次对话自动加载 |
| 适用场景 | 任何使用 Claude Code 或 Cursor 的项目 |
| 核心心态 | 谨慎优于速度，确认优于猜测 |
