---
title: Vercel AI SDK — 多 LLM Provider 统一 SDK
来源: https://github.com/vercel/ai
日期: 2026-05-29
分类: AI
难度: 中级
---

## 是什么

Vercel AI SDK 是 Vercel 2023 年开源的 **TypeScript SDK**，用一套 API 调任何 LLM Provider。日常类比：以前每家 LLM 客户端写法不同——OpenAI 一种、Anthropic 一种、Mistral 一种；Vercel AI SDK 让你写一份代码，**切换 Provider 像换 npm 包**。

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
// model: anthropic('claude-opus-4-7')
```

业务侧调用形态不变——这是 SDK 的核心承诺（厂商专属能力走 `providerOptions`）。

## 为什么重要

不理解 Vercel AI SDK，下面这些事都没法解释：

- 为什么 Next.js / React 项目集成 LLM 默认选这个 SDK
- 为什么"流式输出"在前端这么丝滑——`useChat` / `useCompletion` 把 streaming 当一等公民
- 为什么 Tool calling（让模型点名调用你写的函数）跨 Provider 还能写一份代码——SDK 吸收各家 schema 差异
- 与 [[langchain]] 的差别在哪——AI SDK 偏 frontend / 流式 UI，LangChain 偏 backend pipeline / agent 编排

## 核心要点

Vercel AI SDK 的核心抽象可以拆成 **三块**：

1. **4 个核心函数**：`generateText` / `streamText` / `generateObject` / `streamObject`。类比：同一把"遥控器"，按一下拿整段、按住拿流式、再加 zod 校验拿结构化对象。

2. **Provider 适配器**：每家厂商一个独立 npm 包（`@ai-sdk/openai` / `@ai-sdk/anthropic` / `@ai-sdk/google` / 本地 [[ollama]]），都实现同一接口。类比：统一电源插座，换品牌只换插头。

3. **React hook 一等公民**：`useChat`、`useCompletion` 把 streaming 接到 React state。类比：水管接到水龙头——后端吐流，前端直接渲染，不必手写 buffer。

## 实践案例

### 案例 1：一行换 Provider

```ts
import { openai } from '@ai-sdk/openai'
import { anthropic } from '@ai-sdk/anthropic'
import { generateText } from 'ai'

const { text } = await generateText({ model: openai('gpt-4o'), prompt })
// 换厂商：只改 model 工厂
const { text: t2 } = await generateText({ model: anthropic('claude-opus-4-7'), prompt })
```

步骤：① 选 provider 包 → ② `generateText` 传 `model` → ③ 换厂商只换工厂函数，prompt / 业务逻辑不动。

### 案例 2：跨 Provider 统一 Tool calling

```ts
import { anthropic } from '@ai-sdk/anthropic'
import { generateText, tool } from 'ai'
import { z } from 'zod'

const result = await generateText({
  model: anthropic('claude-opus-4-7'),
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

### 案例 3：前端 streaming chat UI（AI SDK 5+）

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
3. **厂商专属能力**：归一化后特殊行为（如 Anthropic prompt caching）要走 `providerOptions`（厂商私有开关）这条逃生通道。
4. **Edge Runtime**：在 Vercel Edge / Cloudflare Workers 上流式时，注意 Web Streams API（浏览器式流）兼容；Node 18 前易出现"卡 buffer 不 flush"。

## 适用 vs 不适用场景

**适用**：

- Next.js / React 集成 LLM —— 默认选择
- 需要 streaming UI（`useChat` / `useCompletion`）
- 跨 Provider 切换（A/B、降级、成本优化）
- structured output（zod 直接喂 `generateObject`）

**不适用**：

- 重型 agent 编排（多 agent、复杂 memory、graph）→ LangGraph / Mastra
- RAG-heavy（向量检索 + chunk + retriever）→ LlamaIndex
- 非 React / 非 TypeScript —— 价值明显下降
- 极简单 one-shot —— 直接原生 SDK 更直接

## 历史小故事（可跳过）

- **2023-06**：AI SDK v1，主打流式 React hook；当时各家 SDK 写法各异
- **2024**：v3 确立四函数体系；v4 拆出 provider 包，跨 Provider tool calling 可用
- **2025-07**：v5 发布——UIMessage 协议、`inputSchema`、`useChat` transport 重构
- **2025-12 / 2026-06**：v6、v7 相继正式发布（agent / 多模态能力扩展）

## 学到什么

1. **薄抽象赢过厚框架**——只统一最小集（4 函数 + provider 接口），不发明 Chain / Memory
2. **TypeScript 类型贯穿**——zod 流过 `generateObject`、tool input 流过 `execute`
3. **Streaming 是产品体验**——底层 Web Streams + 上层 React hook，两端都做才好用
4. **窄腰设计**——核心约定（`doGenerate` / `doStream`）做窄；差异走 `providerOptions`

## 延伸阅读

- 官方文档：[ai-sdk.dev](https://ai-sdk.dev)
- 仓库：[vercel/ai](https://github.com/vercel/ai)
- v5 迁移：[Migrate AI SDK 4.x to 5.0](https://ai-sdk.dev/docs/migration-guides/migration-guide-5-0)
- [[langchain]] —— 厚框架 vs 薄抽象的另一极
- [[zod]] —— `generateObject` / tool schema 的事实标准

## 关联

- [[langchain]] —— 厚 vs 薄两条路；多数聊天/流式 UI 场景薄抽象更省事
- [[ollama]] —— Vercel AI SDK 的本地模型 Provider 之一
- [[zod]] —— `generateObject` / tool schema 的事实标准
- [[react]] —— `useChat` / `useCompletion` 的载体
- [[next-js]] —— 官方模板与 Edge 流式部署的常见宿主
- [[llamaindex]] —— RAG-heavy 场景的另一条路，和薄 SDK 互补

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[browser-use]] —— browser-use — 让 LLM 用「DOM 索引清单」操作浏览器的 Python agent 框架
