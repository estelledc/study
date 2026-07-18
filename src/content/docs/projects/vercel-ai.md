---
title: Vercel AI SDK — 多 LLM Provider 统一 SDK
来源: Vercel AI SDK 官方文档 https://ai-sdk.dev/docs
日期: 2026-05-29
分类: AI
难度: 中级
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/vercel/ai
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-07-13'
  immutable_revision: b162ae48676fe9e7b3880b691cbd60b58ed179cb
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-07-13'
  review_after: '2026-10-13'
  applicable_version: 7.0.22
---

## 是什么

Vercel AI SDK 是 Vercel 2023 年开源的 **TypeScript SDK**，早期主打"一套 API 调任何 LLM Provider"，到 v7 已经扩展成面向生产 agent 的运行时。日常类比：以前它像"万能充电器"，让 OpenAI / Anthropic / Google 都能插同一个插座；现在它还加了电表、保险丝、工单系统和监控台，开始负责 agent 跑起来之后的审批、超时、遥测和持久化。

你写：

```ts
import { openai } from '@ai-sdk/openai'
import { generateText } from 'ai'

const { text } = await generateText({
  model: openai('gpt-4o'),
  prompt: 'Hello'
})
```

想换 Anthropic？只改一行 import：

```ts
import { anthropic } from '@ai-sdk/anthropic'
// model: anthropic('claude-sonnet-4-20250514')
```

业务侧调用形态不变——这是 SDK 的核心承诺（厂商专属能力走 `providerOptions`）。

本文按 2026-07-13 核验到的 `ai@7.0.22` 与 GitHub tag `ai@7.0.22` 写；对应 provider 包为 `@ai-sdk/openai@4.x`、`@ai-sdk/anthropic@4.x`、`@ai-sdk/react@4.x`。

## 为什么重要

不理解 Vercel AI SDK，下面这些事都没法解释：

- 为什么 Next.js / React 项目集成 LLM 默认选这个 SDK
- 为什么"流式输出"在前端这么丝滑——`useChat` / `useCompletion` 把 streaming 当一等公民
- 为什么 Tool calling（让模型点名调用你写的函数）跨 Provider 还能写一份代码——SDK 吸收各家 schema 差异
- 与 [[langchain]] 的差别在哪——AI SDK 偏 frontend / 流式 UI，LangChain 偏 backend pipeline / agent 编排

## 核心要点

Vercel AI SDK v7 的核心抽象可以拆成 **四块**：

1. **2 个核心生成函数 + Output**：主入口是 `generateText` / `streamText`；结构化输出不再优先讲 `generateObject` / `streamObject`，而是用 `Output.object()` 挂到 `generateText` / `streamText` 上。类比：遥控器还是两个按钮（一次性 / 流式），结构化输出是给按钮套一个模具。

2. **Provider 适配器**：每家厂商一个独立 npm 包（`@ai-sdk/openai` / `@ai-sdk/anthropic` / `@ai-sdk/google` / 本地 [[ollama]]），都实现同一接口。类比：统一电源插座，换品牌只换插头。

3. **React hook 一等公民**：`useChat`、`useCompletion` 把 streaming 接到 React state。类比：水管接到水龙头——后端吐流，前端直接渲染，不必手写 buffer。

4. **Agent 运行时**：`ToolLoopAgent` 封装多步 tool loop；`WorkflowAgent` 处理可恢复、可审批、可持久化的长任务；`runtimeContext` / `toolsContext` / `toolApproval` 把"生产 agent 需要的状态、密钥和人工批准"放进 SDK 层。

## 实践案例

### 案例 1：一行换 Provider

```ts
import { openai } from '@ai-sdk/openai'
import { anthropic } from '@ai-sdk/anthropic'
import { generateText } from 'ai'

const { text } = await generateText({ model: openai('gpt-4o'), prompt })
// 换厂商：只改 model 工厂
const { text: t2 } = await generateText({ model: anthropic('claude-sonnet-4-20250514'), prompt })
```

步骤：① 选 provider 包 → ② `generateText` 传 `model` → ③ 换厂商只换工厂函数，prompt / 业务逻辑不动。

### 案例 2：跨 Provider 统一 Tool calling

```ts
import { anthropic } from '@ai-sdk/anthropic'
import { generateText, tool } from 'ai'
import { z } from 'zod'

const result = await generateText({
  model: anthropic('claude-sonnet-4-20250514'),
  tools: {
    weather: tool({
      description: 'Get the current weather',
      inputSchema: z.object({ location: z.string() }),
      execute: async ({ location }) =>
        await fetch(`/api/weather/${location}`).then(r => r.json())
    })
  },
  prompt: 'What is the weather in Beijing?'
})
```

步骤：① 用 zod 声明工具入参 → ② SDK 译成各家 tool 协议 → ③ 拦截 tool_use、跑 `execute`、把结果喂回模型做多轮。换 OpenAI / Google 同一套代码。

### 案例 3：结构化输出（v7 主线）

```ts
import { generateText, Output } from 'ai'
import { z } from 'zod'

const { output } = await generateText({
  model: openai('gpt-4o'),
  output: Output.object({
    schema: z.object({
      summary: z.string(),
      nextActions: z.array(z.string())
    })
  }),
  prompt: '总结这段会议记录，并列出下一步'
})
```

步骤：① `generateText` 仍负责模型调用 → ② `Output.object()` 负责声明结构 → ③ 返回 `output` 而不是手动解析 JSON。旧的 `generateObject` / `streamObject` 还在包里，但 v7 源码已标 `@deprecated`，新代码优先用这个路径。

### 案例 4：前端 streaming chat UI（AI SDK 5+ / 7 仍成立）

```tsx
import { useState } from 'react'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'

function Chat() {
  const [input, setInput] = useState('')
  const { messages, sendMessage } = useChat({
    transport: new DefaultChatTransport({ api: '/api/chat' }),
  })
  return (
    <form onSubmit={e => {
      e.preventDefault()
      sendMessage({ text: input })
      setInput('')
    }}>
      {messages.map(m => <div key={m.id}>{m.role}</div>)}
      <input value={input} onChange={e => setInput(e.target.value)} />
    </form>
  )
}
```

步骤：① 自管 input state → ② `sendMessage` 发消息 → ③ 后端用 `toUIMessageStreamResponse()` 对接流式协议。v5 起不再内置 `handleSubmit`。

## 踩过的坑

1. **v3 → v4**：Provider 拆成独立包（`@ai-sdk/openai` 等），import 路径全变，升级要改一圈。
2. **v4 → v5**：`useChat` 去掉内置 input；`tool()` 的 `parameters` 改名 `inputSchema`——照旧示例会直接跑不通。
3. **v5 → v6**：`Experimental_Agent` 变成 `ToolLoopAgent`，`system` 改名 `instructions`，`generateObject` / `streamObject` 进入 deprecated 路线。
4. **v6 → v7**：最低 Node.js 变成 22，包是 ESM-only，CommonJS `require()` 不再支持；`system` / `onFinish` / `fullStream` 等旧名继续迁移到 `instructions` / `onEnd` / `stream`。
5. **厂商专属能力**：归一化后特殊行为（如 Anthropic reasoning / speed / data residency）要走 `providerOptions`（厂商私有开关）这条逃生通道。
6. **结构化输出别只背旧 API**：`generateObject` / `streamObject` 还能用，但 v7 主线是 `generateText` / `streamText` + `Output.object()`。

## 适用 vs 不适用场景

**适用**：

- Next.js / React 集成 LLM —— 默认选择
- 需要 streaming UI（`useChat` / `useCompletion`）
- 跨 Provider 切换（A/B、降级、成本优化）
- structured output（`Output.object()` + zod）
- 需要 tool approvals、timeouts、runtime/tool context 或轻量 agent loop

**不适用**：

- 重型图状编排（复杂分支、回滚、状态图）→ LangGraph / Mastra 仍更直接
- RAG-heavy（向量检索 + chunk + retriever）→ LlamaIndex
- 非 React / 非 TypeScript —— 价值明显下降
- 极简单 one-shot —— 直接原生 SDK 更直接

## 历史小故事（可跳过）

- **2023-06**：AI SDK v1，主打流式 React hook；当时各家 SDK 写法各异
- **2024**：v3 确立四函数体系；v4 拆出 provider 包，跨 Provider tool calling 可用
- **2025-07**：v5 发布——UIMessage 协议、`inputSchema`、`useChat` transport 重构
- **2025-12**：v6 发布——`ToolLoopAgent` 成为 agent 主入口，`generateObject` / `streamObject` 进入 deprecated 路线，结构化输出合并进 `generateText` / `streamText` 的 `Output`
- **2026-06-25**：v7 发布——Node.js 22+、ESM-only，并加入 reasoning、runtime/tool context、tool approvals、`WorkflowAgent`、harness integration、`@ai-sdk/otel` 等生产 agent 能力
- **2026-07-10**：`ai@7.0.22` 发布；v5/v6 仍有 `ai-v5`、`ai-v6` dist-tag 维护线

## 学到什么

1. **薄抽象开始长出运行时**——v5 以前像 provider 统一层，v7 开始管 approval、timeout、telemetry、durable workflow
2. **TypeScript 类型贯穿**——zod 流过 `Output.object()`、tool input 流过 `execute`，再流到 UI message parts
3. **Streaming 是产品体验**——底层 Web Streams + 上层 React hook，两端都做才好用
4. **窄腰设计仍在**——核心约定（`generateText` / `streamText` + provider 接口）做窄；差异走 `providerOptions`

## 应用型自测

1. 把 OpenAI 换成 Anthropic 后，业务代码完全不需要复查，这个判断为什么过强？
2. 一个工具需要人工批准，用户刷新页面后还要继续。只用一次 `generateText` 调用够吗？
3. `useChat` 页面能持续显示文本，是否已经证明后端 agent 的工具调用可恢复？

检查点：

1. 窄腰统一常用能力，但厂商专属 reasoning、数据驻留等仍走 `providerOptions`，模型名和行为也需要回归。
2. 不够。需要持久化运行状态和审批结果，使用 `WorkflowAgent` 或等价的 durable workflow 设计。
3. 没有。UI streaming 只证明消息传输和渲染链；工具结算、幂等和恢复必须单独验证。

## 延伸阅读

- 官方文档：[ai-sdk.dev](https://ai-sdk.dev)
- 仓库：[vercel/ai](https://github.com/vercel/ai)
- v5 迁移：[Migrate AI SDK 4.x to 5.0](https://ai-sdk.dev/docs/migration-guides/migration-guide-5-0)
- v6 迁移：[Migrate AI SDK 5.x to 6.0](https://ai-sdk.dev/docs/migration-guides/migration-guide-6-0)
- v7 迁移：[Migrate AI SDK 6.x to 7.0](https://ai-sdk.dev/docs/migration-guides/migration-guide-7-0)
- v7 发布：[AI SDK 7 is now available](https://vercel.com/changelog/ai-sdk-7)
- [[langchain]] —— 厚框架 vs 薄抽象的另一极
- [[zod]] —— `Output.object()` / tool schema 的事实标准

## 关联

- [[langchain]] —— 厚 vs 薄两条路；多数聊天/流式 UI 场景薄抽象更省事
- [[ollama]] —— Vercel AI SDK 的本地模型 Provider 之一
- [[zod]] —— `Output.object()` / tool schema 的事实标准
- [[react]] —— `useChat` / `useCompletion` 的载体
- [[next-js]] —— 官方模板与 Edge 流式部署的常见宿主
- [[llamaindex]] —— RAG-heavy 场景的另一条路，和薄 SDK 互补

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[browser-use]] —— browser-use — 让 LLM 用「DOM 索引清单」操作浏览器的 Python agent 框架
