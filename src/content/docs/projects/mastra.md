---
title: Mastra 学习笔记
来源: https://github.com/mastra-ai/mastra
日期: 2026-06-13
分类_原始: AI / Agent Framework
分类: 机器学习
子分类: 数据科学与 AI
provenance: pipeline-v3
---

# Mastra 学习笔记

## 一、什么是 Mastra？

想象你要开一家餐厅。

你有一个厨师（大语言模型 LLM），他做菜很厉害，但有几个问题：

1. 他不知道外面今天天气如何（无法调用外部数据）
2. 他不记得昨天客人点了什么（没有记忆）
3. 如果他一个人既要炒菜又要算账又要招呼客人，效率很低（单一模型做所有事）

Mastra 就是这家餐厅的"管理系统"——它负责：

- 给厨师配备工具（查天气、翻菜单、记账）
- 帮厨师记住客人的偏好
- 把复杂的菜分成几步，交给不同的人配合完成
- 确保整个餐厅能稳定运营、出了问题能追踪

Mastra 是一个用 TypeScript 构建的 AI 应用框架，专门用来把 LLM 能力变成真正的产品。它支持 40+ 模型提供商，内置 Agent、Workflow、Memory、工具系统等一整套组件。

## 二、核心概念

### 2.1 Agent（智能体）

Agent 是"能自主决策的执行者"。你给它一个目标，它自己决定怎么做。

类比：你是一个餐厅经理，你告诉厨师"做一道客人喜欢的菜"，厨师自己决定用什么食材、怎么搭配、是否需要参考之前的订单。

关键特性：

- **Model Routing**：通过统一接口连接 40+ 模型提供商（OpenAI、Anthropic、Gemini 等）
- **Tools**：给 Agent 外挂能力，让它能查天气、访问数据库、调 API
- **Memory**：让 Agent 记住对话历史、用户偏好、语义信息
- **Multi-Agent**：多个 Agent 协作，一个当"主管"分配任务给"专员"

### 2.2 Workflow（工作流）

Workflow 是"按步骤执行的流程"。每一步做什么、数据怎么流转，全部预先定义好。

类比：餐厅的"套餐制作流程"——第一步备料，第二步煎牛排，第三步摆盘。每一步的输出是下一步的输入，顺序固定，不可跳步。

关键特性：

- **Step**：工作流的最小单元，有明确的输入和输出 Schema
- **控制流**：支持 `.then()`（串行）、`.branch()`（分支）、`.parallel()`（并行）
- **State**：步骤之间共享状态，不需要每步都传参
- **Suspend & Resume**：可以暂停等待人工审批，之后再恢复执行

### 2.3 何时用 Agent，何时用 Workflow？

| 场景 | 选择 |
|------|------|
| 任务目标明确，步骤不确定 | Agent |
| 步骤固定，需要精确控制执行顺序 | Workflow |
| 需要 Agent 自主决策 | Agent |
| 需要人工审批环节 | Workflow |
| 两者结合：Agent 调用 Workflow，Workflow 调用 Agent | 都可以 |

## 三、代码示例

### 示例 1：创建一个简单的 Weather Agent

这个例子展示如何用 Mastra 创建一个能查询天气的 Agent。

```typescript
import { Agent } from '@mastra/core/agent'
import { createTool } from '@mastra/core/tools'
import { z } from 'zod'

// 第一步：定义一个工具——查天气
const weatherTool = createTool({
  id: 'weather-tool',
  description: '根据城市名称获取当前天气',
  inputSchema: z.object({
    location: z.string().describe('城市名称，如 Beijing'),
  }),
  outputSchema: z.object({
    weather: z.string().describe('天气描述'),
  }),
  execute: async ({ inputData }) => {
    const { location } = inputData
    const response = await fetch(`https://wttr.in/${location}?format=3`)
    const weather = await response.text()
    return { weather }
  },
})

// 第二步：创建 Agent，给它配上一个工具
const weatherAgent = new Agent({
  id: 'weather-agent',
  name: 'Weather Assistant',
  instructions: `你是一个友好的天气助手。
    当用户询问天气时，使用 weatherTool 查询并回复。`,
  model: 'openai/gpt-5.5',
  tools: { weatherTool },
})
```

这里发生了什么：

1. `createTool` 定义了一个叫 `weather-tool` 的工具，它接收 `location` 参数，调用 wttr.in API 返回天气
2. `Agent` 配置中，`instructions` 是"系统提示词"，告诉 Agent 它的角色和行为准则
3. `tools` 属性把工具注册给 Agent，Agent 会根据用户请求自行决定是否调用

### 示例 2：创建一个数据处理 Workflow

这个例子展示如何用 Mastra 构建一个多步骤工作流。

```typescript
import { createWorkflow, createStep } from '@mastra/core/workflows'
import { z } from 'zod'

// 步骤 1：接收原始消息并转为大写
const toUpperCaseStep = createStep({
  id: 'to-upper',
  inputSchema: z.object({
    message: z.string(),
  }),
  outputSchema: z.object({
    upperMessage: z.string(),
  }),
  execute: async ({ inputData }) => {
    return {
      upperMessage: inputData.message.toUpperCase(),
    }
  },
})

// 步骤 2：在大写结果前后加上感叹号
const addExclamationStep = createStep({
  id: 'add-exclamation',
  inputSchema: z.object({
    upperMessage: z.string(),
  }),
  outputSchema: z.object({
    finalMessage: z.string(),
  }),
  execute: async ({ inputData }) => {
    return {
      finalMessage: `!!! ${inputData.upperMessage} !!!`,
    }
  },
})

// 组合成完整工作流
export const textTransformWorkflow = createWorkflow({
  id: 'text-transform',
  inputSchema: z.object({
    message: z.string(),
  }),
  outputSchema: z.object({
    finalMessage: z.string(),
  }),
})
  .then(toUpperCaseStep)       // 先转大写
  .then(addExclamationStep)    // 再加感叹号
  .commit()

// 运行工作流
const run = await textTransformWorkflow.createRun()
const result = await run.start({
  inputData: { message: 'hello world' },
})

console.log(result.result.finalMessage)
// 输出: !!! HELLO WORLD !!!
```

工作流程图：

```
输入: "hello world"
  │
  ▼
[to-upper] → { upperMessage: "HELLO WORLD" }
  │
  ▼
[add-exclamation] → { finalMessage: "!!! HELLO WORLD !!!" }
  │
  ▼
输出: "!!! HELLO WORLD !!!"
```

## 四、Mastra 的其他重要功能

### 4.1 Memory（记忆系统）

Mastra 的记忆系统分三层：

1. **Message History**：记录对话历史，类似聊天记录
2. **Working Memory**：存储结构化用户数据（名字、偏好、目标）
3. **Semantic Recall**：基于语义相似度检索过去的信息，不是关键词匹配

类比：你的短期记忆（刚才聊了什么）、日记本（用户资料）、搜索引擎（回忆相关经历）。

### 4.2 多 Agent 协作

一个 Agent 能力有限，Mastra 支持 Supervisor 模式：

```typescript
const writerAgent = new Agent({
  id: 'writer',
  name: 'Writer',
  description: '负责撰写和编辑内容',
  instructions: '你是一位专业作家。',
  model: 'openai/gpt-5.5',
})

const supervisor = new Agent({
  id: 'supervisor',
  name: 'Supervisor',
  instructions: '协调 Writer 完成内容创作。',
  model: 'openai/gpt-5.5',
  agents: { writer: writerAgent },
})
```

主管 Agent 会把任务分派给子 Agent，就像项目经理把任务分给团队成员。

### 4.3 MCP Server

Mastra 可以发布 Model Context Protocol 服务器，把自己的 Agent、工具和资源暴露出去，让其他支持 MCP 的系统也能调用。

### 4.4 生产级能力

- **Evals**：内置评估系统，持续衡量 Agent 表现
- **Observability**：追踪每个请求的完整链路，方便调试
- **Studio**：可视化测试面板，可以直接在浏览器里测试 Agent 和 Workflow

## 五、安装与起步

```bash
# 推荐方式：使用 CLI 脚手架
npm create mastra@latest

# 或手动安装核心包
npm install @mastra/core
```

创建 Mastra 实例（入口文件通常是 `src/mastra/index.ts`）：

```typescript
import { Mastra } from '@mastra/core'
import { weatherAgent } from './agents/weather-agent'
import { textTransformWorkflow } from './workflows/text-transform'

export const mastra = new Mastra({
  agents: { weatherAgent },
  workflows: { textTransformWorkflow },
})
```

## 六、学习要点总结

1. **Mastra 解决的核心问题**：LLM 本身不能直接用在产品里——它不会调用 API、没有记忆、不可控。Mastra 补齐了这些短板。

2. **Agent vs Workflow 的选择**：不确定步骤用 Agent，确定步骤用 Workflow。两者可以互相调用。

3. **一切都有 Schema**：工具的输入输出、Step 的输入输出、Workflow 的输入输出，都用 Zod 等库定义，提供完整的 TypeScript 类型推断。

4. **从原型到生产**：Mastra 的设计目标就是从 Demo 直接到 Production，不需要换框架。

5. **TypeScript First**：整个生态围绕 TS 构建，与 React、Next.js、Node.js 天然集成。

## 七、进一步学习的方向

- [Mastra 官方文档](https://mastra.ai/docs) — 最权威的参考资料
- [Mastra Course](https://mastra.ai/course) — 官方免费课程
- [Studio](https://mastra.ai/docs/studio/overview) — 可视化调试工具
- [Workflows 实战指南](https://mastra.ai/guides/guide/ai-recruiter) — 通过 AI 招聘官案例理解 Workflow
- [Multi-Agent 概念](https://mastra.ai/guides/concepts/multi-agent-systems) — 多 Agent 协作模式
