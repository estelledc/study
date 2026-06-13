---
title: mattpocock/skills — 零基础学习笔记
来源: https://github.com/mattpocock/skills
日期: 2026-06-13
分类: CLI
子分类: 编辑器与 IDE
provenance: pipeline-v3
---

# mattpocock/skills — 零基础学习笔记

## 一、它是什么：从"大厨做饭"开始理解

想象你在厨房做菜。

普通 AI 编程工具就像一个"瞎炒"的厨师——你告诉他"做一道菜"，他直接往锅里倒一堆调料，端出来你可能不喜欢。

mattpocock/skills 做的事情很简单：给 AI 厨师准备一本"菜谱小册子"，每张小卡片对应一种固定做法。你告诉厨师"用 /tdd 卡片"，他就按这套标准流程做菜。

这些卡片（skill）不是绑定某个特定 AI 工具的，它们只是纯文本说明文件，告诉 AI "遇到这种情况该怎么做"。任何能读文件的 AI 编码助手（Claude Code、Codex 等）都能用。

关键理念：**小、可组合、可改造**。不强制你按某个大框架干活，而是给你可自由拼凑的小工具。

## 二、安装：三步搞定

```bash
# 第 1 步：运行安装脚本
npx skills@latest add mattpocock/skills

# 第 2 步：在 AI 编辑器里选择想要的 skill，
#         并勾选 /setup-matt-pocock-skills

# 第 3 步：运行 /setup-matt-pocock-skills 初始化配置
#         它会问你：用什么 issue 追踪器？标签叫什么？文档存哪？
```

安装后，你的 `.claude/skills/` 目录下会出现一系列子文件夹，每个文件夹里有一个 `SKILL.md` 文件。

## 三、一个 skill 文件长什么样

每个 skill 就是一个 `.md` 文件。以下是一个简化后的 `grill-me` skill 的内容：

```markdown
---
name: grill-me
description: Interview the user relentlessly about a plan or design until
  reaching shared understanding. Use when user wants stress-test a plan.
---

Interview me relentlessly about every aspect of this plan until we reach
a shared understanding. Walk down each branch of the design tree,
resolving dependencies between decisions one-by-one.

Ask the questions one at a time, waiting for feedback on each question
before continuing.
```

三个部分：

- `name`：skill 的名字，对应你输入的 `/grill-me`
- `description`：AI 什么时候该用这个 skill（触发条件）
- 正文：具体的执行指令，告诉 AI 该按什么步骤操作

## 四、核心概念 1：Grill（审问）—— 动手前先对齐

最大的编程问题不是"不会写代码"，而是"没搞清楚要做什么"。

`/grill-me` 和 `/grill-with-docs` 就是解决这个问题的。它让你和 AI 之间做一次"深度对话"，把每个决策点都问清楚。

**实际用法示例**：你想做一个用户注册功能。

正常做法：直接让 AI "写一个用户注册 API"。AI 可能用你项目中不存在的数据库连接方式，或者忽略了你已有的认证流程。

grill 做法：

```
你: /grill-with-docs
AI: 你想做什么？
你: 做一个用户注册 API
AI: 注册后需要发邮件确认吗？
你: 需要
AI: 邮箱格式校验用项目已有的 validator 还是新建？
你: 用已有的
AI: 那我用现有的 validator 模块...
```

每一轮只问一个问题，等你回答后再继续。最后还会自动把确定的术语写进 `CONTEXT.md`，以后 AI 就不会用错词了。

## 五、核心概念 2：TDD（测试驱动开发）—— 先写失败，再写通过

`/tdd` skill 实现的是经典的 Red-Green-Refactor 循环：

```
RED   → 写一个会失败的测试
GREEN → 写最少的代码让测试通过
REFACTOR → 清理代码，不改变行为
```

但它强调了一个重要的反模式——**不要一次性写完所有测试再写代码**（这叫"横向切片"），而是要**一个测试对应一个功能，逐步推进**（这叫"垂直切片"）：

```
错误做法（横向）：
  RED:   测试1, 测试2, 测试3, 测试4, 测试5
  GREEN: 代码1, 代码2, 代码3, 代码4, 代码5

正确做法（垂直）：
  RED→GREEN: 测试1 → 代码1
  RED→GREEN: 测试2 → 代码2
  RED→GREEN: 测试3 → 代码3
```

**代码示例**：用 TDD 写一个简单的"购物车加商品"功能。

第一步，RED——先写一个失败的测试：

```typescript
// tests/cart.test.ts
import { describe, it, expect } from 'vitest';
import { Cart } from '../src/cart';

describe('Cart', () => {
  it('should add an item and update the total', () => {
    const cart = new Cart();
    cart.addItem({ id: 'apple', price: 3.5, quantity: 2 });

    expect(cart.total()).toBe(7);
    expect(cart.itemCount()).toBe(2);
  });
});
```

运行测试 → 失败（因为 Cart 类还不存在）。

第二步，GREEN——写最少代码让它通过：

```typescript
// src/cart.ts
export class Cart {
  private items: { price: number; quantity: number }[] = [];

  addItem(item: { price: number; quantity: number }) {
    this.items.push(item);
  }

  total(): number {
    return this.items.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0
    );
  }

  itemCount(): number {
    return this.items.reduce((sum, item) => sum + item.quantity, 0);
  }
}
```

运行测试 → 通过。

第三步，REFACTOR——代码已经够简洁了，跳过。

第四步，继续下一个功能，回到 RED → GREEN。

## 六、核心概念 3：Diagnose（诊断）—— 系统化修 bug

`/diagnose` 把修 bug 拆成 6 个阶段，不能跳过：

```
Phase 1  → 建立反馈回路（让 bug 能被复现）
Phase 2  → 确认复现（bug 确实出现了）
Phase 3  → 提出假设（3-5 个可能原因，按可能性排序）
Phase 4  → 验证假设（每次只改一个变量）
Phase 5  → 修复 + 回归测试
Phase 6  → 清理 + 写总结
```

其中最关键的是 Phase 1。作者说："**这才是真正的技巧**。其他都是机械的——只要能快速确定 bug 是否复现，你基本已经修好了 90%。"

建立反馈回路的 10 种方式（按优先级）：

1. 写一个失败的测试用例
2. 对运行中的服务器发 curl 请求
3. 命令行调用 + 对比输出
4. 用 Playwright/Puppeteer 驱动浏览器
5. 回放捕获的日志或网络请求
6. 写一个最小的测试脚本
7. 随机输入跑 1000 次找规律
8. 自动 git bisect
9. 新旧版本输出对比
10. 写个脚本让人配合点击（最后手段）

## 七、核心概念 4：共享语言（CONTEXT.md）

每次和 AI 对话时，术语不一致是效率杀手。比如你说的"用户"可能指的是"登录的人"，AI 理解的"用户"可能是"所有注册过的人"。

`/grill-with-docs` 会自动维护一个 `CONTEXT.md` 文件，把项目中每个术语的确切含义记录下来：

```markdown
# CONTEXT.md

## 术语表

- **Cancellation** — 指订单在支付前的取消。支付后的取消叫"退款"。
- **Materialization** — 指将一个"待处理"的订单转为"实际"订单并落盘的过程。
- **Cart** — 用户结账前的临时购物车。结账后即变为 Order。
```

以后 AI 看到这些定义，就不会再用错术语了。

## 八、全部 skill 一览

### 工程类（和代码直接相关）

| 命令 | 作用 | 一句话理解 |
|------|------|------------|
| `/diagnose` | 系统化调试 | 别瞎猜，按步骤来 |
| `/grill-with-docs` | 审问式设计 + 文档 | 动手前先对齐术语 |
| `/tdd` | 测试驱动开发 | 一个测试一个功能 |
| `/triage` | 问题分类 | 给 bug 打标签排队 |
| `/zoom-out` | 拉远视角 | 这段代码在全局里什么位置？ |
| `/to-prd` | 写产品需求文档 | 把讨论变成文档 |
| `/to-issues` | 拆成任务 | 一个大需求拆成独立小任务 |
| `/improve-codebase-architecture` | 重构架构 | 代码变乱了？来清理一下 |
| `/prototype` | 快速原型 | 不确定怎么做？先做一个看看 |

### 效率类（通用工作流）

| 命令 | 作用 | 一句话理解 |
|------|------|------------|
| `/grill-me` | 审问式设计 | 别急着写代码 |
| `/caveman` | 极简沟通 | 省 token，只说重点 |
| `/handoff` | 交接文档 | 换人继续干 |
| `/teach` | 教学 | 分多次课学一个概念 |
| `/write-a-skill` | 写新 skill | 自定义你的工具 |

### 杂项

| 命令 | 作用 |
|------|------|
| `/setup-matt-pocock-skills` | 初始化配置（必须首先运行） |
| `/git-guardrails-claude-code` | 防止误操作 git 的危险命令 |
| `/setup-pre-commit` | 设置提交前自动检查 |

## 九、设计理念：为什么这些 skill 有效

作者总结了他观察到的 AI 编码工具的四大失败模式，以及每个 skill 对应的解法：

**失败模式 1：AI 做的事不是你要的**
→ 用 `/grill-me` 或 `/grill-with-docs` 做"对齐审问"

**失败模式 2：AI 废话太多**
→ 用 `CONTEXT.md` 建立共享语言，减少解释成本

**失败模式 3：写的代码跑不起来**
→ 用 `/tdd` 和 `/diagnose` 建立快速反馈循环

**失败模式 4：代码库越来越乱**
→ 用 `/zoom-out` 和 `/improve-codebase-architecture` 持续关心设计

## 十、给你的第一条建议

先跑 `/setup-matt-pocock-skills` 初始化，然后每个新功能都用一次 `/grill-with-docs`。

这花不了多少时间，但能避免 80% 的"你做的不是我要的"这类问题。

剩下的，用 `/tdd` 一个一个功能推进。遇到 bug 时跑 `/diagnose`，别跳步骤。

慢慢来，这些 skill 的价值会在你用了十几二十个功能后自然显现。

## 十一、延伸思考：skill 本身的本质

回到最初的问题：skill 到底是什么？

它就是**把优秀工程师的习惯写成了可重复执行的指令**。

你见过好工程师怎么做吗？

- 他接到需求先问清楚细节 → `/grill-me`
- 他写代码前会先写测试 → `/tdd`
- 他修 bug 不会乱试，而是系统排查 → `/diagnose`
- 他会在代码变乱时主动清理 → `/improve-codebase-architecture`

mattpocock/skills 只是把这些"好习惯"从个人经验变成了可分享、可组合的文本文件。你不需要成为好工程师才能用好它们——只要照着说明书做就行。

这大概就是"给真正的工程师用的 skill"这句话的含义：不是什么花哨的框架，就是几十年软件工程实践中总结出来的那些朴素的、被反复验证过的好习惯。
