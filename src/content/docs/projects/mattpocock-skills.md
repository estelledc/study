---
title: Matt Pocock 的 Skills — 给真实工程师的 AI 协作技能集
来源: https://github.com/mattpocock/skills
日期: 2026-06-13
分类: CLI
子分类: 开发者工具
provenance: pipeline-v3
---

## 一、先打个比方：厨师与菜谱

你是一位厨师（程序员），厨房是你的 IDE。

以前你全靠自己切菜、掌勺，翻车了只能重来。现在来了一个帮厨（AI 编码助手），但他从没在你厨房干过——他不知道该用哪种刀，不知道你的盐在哪，甚至把你说的"少许盐"理解为"满满一汤勺"。

Matt Pocock 做的这套 Skills，就是一组**厨房里的标准操作流程（SOP）**。你告诉帮厨"先跟我聊聊你想做什么菜"（`/grill-me`），帮厨就不会闷头开火；你告诉他"这个 bug 我修不好"（`/diagnose`），帮厨就不会乱试，而是按步骤排查。

核心理念就一句：**用小而可拼凑的流程，替代大而僵化的方法论。**

---

## 二、项目全景

这个项目叫 **Skills For Real Engineers**。Matt Pocock 是知名的 TypeScript 作者，他长期用 Claude Code、Codex 等 AI 助手做真实项目，发现几个反复出现的翻车模式：

1. 帮厨做了你想要的东西——但你以为的他没做
2. 帮厨啰里啰嗦，一句话用二十个字说
3. 帮厨写出来的代码跑不通
4. 代码越写越乱，最后变成一团泥

他的解决方案不是换工具，而是给每个常见问题准备一个**可复用的技能卡片**。这些卡片小而灵活，可以随便组合，适配任何 AI 模型。

---

## 三、核心概念

### 概念 1：垂直切片 vs 水平切片

这是 Matt 反复强调的一个设计模式。

**水平切片**（错误做法）：先把所有测试写好（RED），再把所有代码写好（GREEN）。就像盖楼先把所有砖块叠好，再一次性盖起来——砖块可能根本对不上。

**垂直切片**（正确做法）：一个测试 → 对应的代码 → 通过 → 下一个。每走一步都是完整可运行的。

```
错误（水平）：          正确（垂直）：
RED:  测试1, 测试2     → 测试1 → 代码1 → 通过
      测试3, 测试4     → 测试2 → 代码2 → 通过
GREEN: 代码1-4         → 测试3 → 代码3 → 通过
```

### 概念 2：调试反馈循环是核心技能

Matt 说："Everything else is mechanical." 调试最关键的一步是**建立反馈循环**——你能快速判断 bug 修好了还是没有。

他有 10 种构建反馈循环的方法，按优先级排序：
写测试 → curl 请求 → CLI 脚本 → 浏览器自动化 → 回放录制 → 搭建最小测试环境 → 模糊测试 → 二分查找 → 差异对比 → 人力脚本

### 概念 3：共享语言减少啰嗦

帮厨之所以啰嗦，是因为他不了解你们团队的行话。Matt 提倡建立一个 `CONTEXT.md` 文件，记录项目的专属术语。

> 以前："课程中某个 lesson 被设为 'real'（即在文件系统中获得位置）时会出现问题"
> 现在："存在 materialization cascade 问题"

一句话，干净利落。

---

## 四、技能分类速览

Matt 的 Skills 分为三大类：

### Engineering（工程类）

在代码层面直接起作用：

| 技能 | 干什么 |
|------|--------|
| `/tdd` | 测试驱动开发，红-绿-重构循环 |
| `/diagnose` | 结构化调试：复现 → 最小化 → 假设 → 验证 → 修复 → 回归测试 |
| `/grill-with-docs` | 深度问答，帮你理清方案，同时更新 `CONTEXT.md` 和 ADR |
| `/grill-me` | 快速问答，对计划穷追猛打 |
| `/to-prd` | 把已有讨论转成 PRD 文档，直接发布为 Issue |
| `/to-issues` | 把 PRD 拆成独立可认领的 GitHub Issue |
| `/triage` | 通过状态机给问题分类处理 |
| `/zoom-out` | 让助手从更高视角解释一段陌生代码 |
| `/improve-codebase-architecture` | 拯救一团糟的代码库 |
| `/prototype` | 快速搭一个一次性原型来验证想法 |

### Productivity（生产力类）

不直接写代码，但提升协作效率：

| 技能 | 干什么 |
|------|--------|
| `/caveman` | 极致精简模式，减少约 75% 的 token 消耗 |
| `/handoff` | 把当前对话压缩为交接文档，给另一个 AI 继续干 |
| `/teach` | 跨多次会话教你一个新概念 |
| `/write-a-skill` | 教你自己写技能卡片 |

### Misc（杂项）

偶尔用用的工具：

| 技能 | 干什么 |
|------|--------|
| `/git-guardrails-claude-code` | 阻止危险的 git 操作（force push 等） |
| `/setup-pre-commit` | 配置 Husky 前置提交钩子 |
| `/scaffold-exercises` | 生成练习题目录结构 |

---

## 五、代码示例

### 示例 1：`/caveman` — 极简沟通模式

这个技能会把你的输出压缩到"原始人"风格，砍掉所有废话，节省大量 token。

```
# 正常模式
> "Sure! I'd be happy to help you with that. The issue you're experiencing is likely caused by a bug in the authentication middleware, where the token expiry check uses a less-than operator instead of less-than-or-equal-to. I'll fix it now."

# Caveman 模式
> "Bug in auth middleware. Token expiry check use '<' not '<='. Fix:"
```

实际使用的效果：

```
# 用户问：为什么 React 组件会重新渲染？

正常回答：
> "React 组件在以下情况下会重新渲染：当组件的 state 发生变化时，
> 或者父组件重新渲染且传入了新的 props。如果你在组件内部定义了一个
> 内联对象作为 prop，每次渲染都会创建新的引用，导致子组件不必要的重..."

Caveman 回答：
> "Inline obj prop -> new ref -> re-render. useMemo."
```

注意：技术术语完全保留，代码块完全不变，只是砍掉了修饰词和连接词。

### 示例 2：`/diagnose` — 结构化调试流程

这是 Matt 认为最有价值的工程技能之一。它强制助手按步骤走，不能跳到结论。

```
# 完整诊断流程（六阶段）

Phase 1: 建立反馈循环          ← 最重要的一步！
  写测试 / curl / 浏览器脚本
  目标：快速判断修好没有

Phase 2: 复现 bug              ← 确认不是你在瞎想
  跑多次确认一致
  捕获确切症状（错误信息 / 错误输出 / 慢速）

Phase 3: 提出假设              ← 至少 3-5 个，都要可证伪
  "如果 X 是原因，那么改 Y 应该消失"
  不能证伪的假设 = 瞎猜，扔掉

Phase 4: 验证假设              ← 一次只改一个变量

Phase 5: 修复

Phase 6: 回归测试             ← 确保 bug 不会复发
```

关键规则：
- 不能跳过任何阶段，除非明确说明理由
- 提假设时必须给出**可验证的预测**
- 必须先让**用户过目**假设列表，再动手验证
- 如果实在建不起反馈循环，**停下来说实话**，不要硬来

---

## 六、怎么开始用

安装很简单，三步搞定：

```bash
# 1. 运行安装器
npx skills@latest add mattpocock/skills

# 2. 选你想要的技能 + 选要装在哪种 AI 助手上
#    确保选了 /setup-matt-pocock-skills

# 3. 运行初始化
/setup-matt-pocock-skills

# 它会问三个问题：
# - 用什么 issue tracker？（GitHub / Linear / 本地文件）
# - 分类标签用什么词汇？
# - 文档存哪？
```

---

## 七、我的评价

**值得学的点：**
- 垂直切片思维（红-绿-重构）比任何框架都重要，这是结对编程几十年验证过的
- 调试反馈循环是 Matt 最核心的洞察——没有它，一切调试都是瞎猜
- Caveman 模式意外地实用，尤其是长对话中 token 快烧完的时候

**需要留意的点：**
- 这些技能是 Matt 个人经验的总结，不是银弹。每个团队的语言和问题不同，需要自己调整
- 高度依赖 AI 助手的执行质量。如果助手本身能力不足，流程再完美也没用
- 缺少对非 TypeScript 项目的指导（虽然项目本身是 model-agnostic 的）

---

## 八、小结

Matt Pocock 这套 Skills 的本质，是把几十年软件工程最佳实践——测试驱动、垂直切片、结构化调试、共享语言——翻译成 AI 助手能听懂的操作指令。它不试图控制全局流程，而是给每个常见问题一张"小卡片"。需要时抽一张，用完放回牌堆。

对于刚开始学编程的人，我建议从 `/caveman`（省钱）和 `/grill-me`（理清思路）开始试水，然后再慢慢接触 `/tdd` 和 `/diagnose` 这些更重的技能。
