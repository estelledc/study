---
title: Compound Engineering Plugin 学习笔记
来源: https://github.com/EveryInc/compound-engineering-plugin
日期: 2026-06-13
分类: CLI
子分类: 编辑器与 IDE
provenance: pipeline-v3
---

## Compound Engineering Plugin 学习笔记

### 一、它是什么：用"复利"的思路做开发

想象你在种一棵树。传统开发方式是：每长一根新枝条，你就得重新认识这棵树的结构——哪边阳光好、哪边土壤硬、哪根枝不能剪。每次修剪都可能剪错地方，每次观察都从零开始。

Compound Engineering（简称 CE）的思路是：每次修剪时，把"这根枝往哪边长最好"的经验记下来。下一次再长出新枝时，经验可以直接复用——新枝长得更快、更少犯错。这就是"复利工程"的核心：**每一次工程工作，都应该让下一次变得更容易。**

这个插件就是实现这个理念的工具集，由 EveryInc 维护，目前是 Claude Code、Codex、Cursor、GitHub Copilot 等 AI 编程工具的一个插件。

### 二、核心概念

#### 1. Skill（技能）和 Agent（代理）

一个 Skill 是一个你可以通过斜杠命令（如 `/ce-brainstorm`）直接调用的能力。它像一个项目主管——知道做什么，但具体干活会派给 Agent。

Agent 是 Skill 派出去的专职工人。你直接跟 Skill 说话，Skill 再根据需要派 Agent 干活。Agent 不跟你对话，只干活、交结果。

这个关系就像：你是老板，Skill 是部门经理，Agent 是基层员工。

#### 2. Pipeline（流水线）

CE 把开发工作串成一条流水线，每个阶段产出"耐用物品"（durable artifact），传给下一阶段：

```
ce-strategy → ce-ideate → ce-brainstorm → ce-plan → ce-work → ce-code-review → ce-compound
```

每个阶段产出的文档会被后面阶段读取。比如 `ce-strategy` 产出的 `STRATEGY.md`，后面的 brainstorm 和 plan 都会参考它，不需要每次都重新理解产品方向。

#### 3. Compound（知识累积）

`ce-compound` 是这个系统的"记忆"。它把解决过的 bug、定下的约定、发现的工作模式记录下来，变成可复用的"学习文档"。下一次遇到类似问题，Agent 能直接查到过去的经验，不用重新踩坑。

### 三、一个完整工作循环

假设你要加一个新功能，典型流程是这样的：

```
/ce-strategy "我们的目标是降低用户注册流失率"
/ce-brainstorm "让用户通过微信一键注册"
/ce-plan docs/brainstorms/wechat-registration-requirements.md
/ce-work
/ce-code-review
/ce-compound
```

每一步都在为下一步铺路：

- `ce-strategy` 写下产品目标和关键指标
- `ce-brainstorm` 通过交互问答，把模糊想法变成清晰的需求文档
- `ce-plan` 根据需求文档，生成详细实现计划
- `ce-work` 按计划执行，管理任务进度
- `ce-code-review` 多角度代码审查（安全、正确性、性能等）
- `ce-compound` 把学到的东西记下来，供下次使用

### 四、代码示例

#### 示例 1：从零开始一个功能

第一步，设定策略方向。运行 `/ce-strategy` 后，项目根目录会产生 `STRATEGY.md`：

```
# STRATEGY.md (由 /ce-strategy 自动生成)

## Target Problem
用户注册流程太复杂，导致 60% 的访客在注册页就流失了。

## Approach
减少注册步骤，支持微信一键授权登录。

## Key Metric
注册转化率从 40% 提升到 65%。
```

第二步，通过 brainstorm 细化想法：

```
/ce-brainstorm "用户通过微信一键注册，需要处理微信授权回调、用户信息同步、本地账户创建"
```

这会生成一个需求文档，包含交互流程、边界情况和验收标准。

第三步，根据需求文档生成计划：

```
/ce-plan docs/brainstorms/wechat-registration-requirements.md
```

计划文档会列出具体任务、依赖关系、测试策略。

#### 示例 2：系统性修 bug

遇到一个间歇性 bug 时，用 `ce-debug` 系统性地排查：

```
/ce-debug "支付回调有时创建重复订单"
```

ce-debug 会做三件事：
1. 复现失败场景，定位触发条件
2. 追踪因果链，找到根本原因
3. 先写测试，再写修复代码

修完之后同样走 review 和 compound：

```
/ce-code-review
/ce-compound
```

`ce-code-review` 会派多个"角色代理"并行审查——安全审查员看漏洞，正确性审查员看逻辑，性能审查员看效率。每个代理从不同角度看问题，最后综合出审查结论。

### 五、为什么叫"Compound"（复利）

名字来自复利的概念。每一轮工作循环结束时的 `ce-compound` 步骤，把经验固化成文档。下一个循环启动时，`ce-brainstorm` 和 `ce-plan` 会读取这些文档：

```
第一次做微信支付：踩了 3 个坑，花了 2 天，记入了 compund 文档
第二次做支付宝支付：读了 compound 文档，只踩了 1 个坑，花了 0.8 天
```

这不是简单的"写文档"，而是让 Agent 在每次启动时**自动加载历史经验**。经验越多，后续工作越快、越稳。

### 六、安装与使用

安装方式因 AI 工具而异。以 Claude Code 为例：

```
/plugin marketplace add EveryInc/compound-engineering-plugin
/plugin install compound-engineering
```

安装后运行 `/ce-setup` 会自动检测环境、安装缺失工具、初始化项目配置。

目前这个插件包含 38 个以上技能和 50 个以上 Agent，覆盖策略制定、头脑风暴、计划、执行、审查、调试、知识管理全流程。

### 七、关键设计思考

从第一性原理看，CE 解决的是 AI 编程时代的根本问题：**AI 的记忆是短期的**。每次新对话、新文件改动，过去的上下文可能就被丢弃了。CE 的 pipeline 设计把每个阶段的产出写为文件，让知识"沉淀"下来，不依赖 AI 的短期记忆。

同时，它把 80% 的精力放在规划和审查上——计划越扎实，执行时 Agent 偏离目标的可能性就越小。这不是增加仪式，而是增加杠杆。
