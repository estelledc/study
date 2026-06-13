---
title: Vercel AI SDK — 多 LLM Provider 统一 SDK
来源: https://github.com/vercel/ai
日期: 2026-05-29
子分类: frontend-web
分类: 机器学习
难度: 中级
provenance: pipeline-v3
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

调用代码一字不改——这是 SDK 的核心承诺。

## 为什么重要

不理解 Vercel AI SDK，下面这些事都没法解释：

- 为什么 Next.js / React 项目集成 LLM 默认选这个 SDK
- 为什么"流式输出"在前端这么丝滑——`useChat` / `useCompletion` 把 streaming 当一等公民
- 为什么 Tool calling 跨 Provider 还能写一份代码——SDK 把各家 schema 差异吸收掉了
- 与 [[langchain]] 的差别在哪——AI SDK 偏 frontend / 流式 UI，LangChain 偏 backend pipeline / agent 编排

## 核心要点

Vercel AI SDK 的核心抽象可以拆成 **三块**：

1. **4 个核心函数**：
   - `generateText` —— 同步生成文本
   - `streamText` —— 流式生成文本
   - `generateObject` —— 同步生成结构化对象（带 zod schema 校验）
   - `streamObject` —— 流式生成结构化对象（progressive JSON）

2. **Provider 适配器**：每家厂商一个独立 npm 包（`@ai-sdk/openai` / `@ai-sdk/anthropic` / `@ai-sdk/google` / `@ai-sdk/mistral` / 本地 [[ollama]]），都实现同一个接口。换厂商只换一行 import。

3. **React hook 一等公民**：`useChat`、`useCompletion` 直接把 streaming 接到 React state，前端写 30 行代码就能拿到完整 chat UI。

## 实践案例

### 案例 1：一行换 Provider

```ts
// 旧：用 OpenAI
import { openai } from '@ai-sdk/openai'
const { text } = await generateText({ model: openai('gpt-4o'), prompt })

// 新：换 Anthropic（只改 import）
import { anthropic } from '@ai-sdk/anthropic'
const { text } = await generateText({ model: anthropic('claude-opus-4-7'), prompt })
```

业务代码 0 行改动。

### 案例 2：跨 Provider 统一 Tool calling

```ts
import { generateText, tool } from 'ai'
import { z } from 'zod'

const result = await generateText({
  model: anthropic('claude-opus-4-7'),
  tools: {
    weather: tool({
      description: 'Get the current weather',
      parameters: z.object({ location: z.string() }),
      execute: async ({ location }) =>
        await fetch(`/api/weather/${location}`).then(r => r.json())
    })
  },
  prompt: 'What is the weather in Beijing?'
})
```

SDK 帮你做的事：把 zod schema 翻译成各家 tool 协议、拦截 LLM 的 tool_use、跑你写的 `execute` 函数、把 result 喂回 LLM、跑 multi-turn 循环。换成 OpenAI / Google 同样代码——SDK 帮你吸收差异。

### 案例 3：前端 30 行 streaming chat UI

```tsx
import { useChat } from '@ai-sdk/react'

function Chat() {
  const { messages, input, handleInputChange, handleSubmit } = useChat()
  return (
    <form onSubmit={handleSubmit}>
      {messages.map(m => <div key={m.id}>{m.role}: {m.content}</div>)}
      <input value={input} onChange={handleInputChange} />
    </form>
  )
}
```

后端返回 `result.toUIMessageStreamResponse()`——SDK 自动把 streaming 协议两端对接起来。

## 踩过的坑

1. **v3 → v4 的大改动**：Provider 包从主仓库整合状态被拆出独立包（`@ai-sdk/openai` 等），import 路径全变。升级 v3 老应用要改一圈。

2. **Tool calling 各家表现略不同**：Claude 早期版本的 tool stream 顺序和 OpenAI 不一致——SDK 做了归一化，但**特殊行为**（如 Anthropic prompt caching）要走专门的 `providerOptions`。这条"逃生通道"得记得。

3. **Edge Runtime 兼容陷阱**：在 Vercel Edge / Cloudflare Workers 跑流式时，要注意 `Web Streams API` 的兼容版本。Node.js 18 之前的 stream 行为不一致，会出现"卡 buffer 不 flush"的现象。

4. **比直接用 OpenAI SDK 多了一层**：调试 prompt 行为时，多一层抽象意味着多读一层源码。极简单的 one-shot 直接调原生 SDK 更直接——SDK 价值在**切 Provider / 想要流式 UI / 用 React** 时才显现。

## 适用 vs 不适用场景

**适用**：

- Next.js / React 项目集成 LLM —— 默认选择
- 需要 streaming UI、`useChat` / `useCompletion`
- 需要跨 Provider 切换（A/B 测、降级、成本优化）
- structured output 场景（zod schema 直接喂进 `generateObject`）

**不适用**：

- 重型 agent 编排（多 agent 协调、复杂 memory、graph workflow）→ LangGraph / Mastra
- RAG-heavy 应用（向量检索 + chunk 管理 + retriever）→ LlamaIndex
- 非 React / 非 TypeScript 项目 —— 价值打对折
- 极简单的 one-shot 调用 —— 直接原生 SDK 更直接

## 历史小故事

- **2023-06**：Vercel AI SDK v1 发布，主打"流式 React hook"；当时 LLM 应用还在野蛮生长，每家 SDK 写法各异
- **2024-Q1**：v3 发布，确立 `generateText` / `streamText` / `generateObject` / `streamObject` 4 函数体系
- **2024-Q4**：v4 重构——provider 包独立、`LanguageModelV2` 接口成熟，跨 Provider tool calling 真正可用
- **2025**：v5+ 加入 Provider Registry、middleware 系统、UIMessage 协议；后续 v7 alpha 进入快速迭代

## 学到什么

1. **薄抽象赢过厚框架**——Vercel AI SDK 故意只统一最小集（4 个函数 + provider 接口），不发明 Chain / Memory 概念。这是 2024 年后 LLM 应用工程的"实证答案"
2. **TypeScript 类型推导贯穿全 API**——zod schema 流过 `generateObject`、tool input 类型流过 `execute`，写起来"少猜一次"
3. **Streaming 是产品体验关键**——Vercel 早早把 streaming 当一等公民。底层 Web Streams API + 上层 React hook，两端都做才好用
4. **Provider 抽象的"窄腰"设计**——核心约定（`doGenerate` / `doStream`）做窄做对，差异部分（`providerOptions`）做开放

## 延伸阅读

- 官方文档：[ai-sdk.dev](https://ai-sdk.dev) —— 含 RSC integration / agent / middleware 的 use case
- 仓库：[vercel/ai](https://github.com/vercel/ai) —— 心脏文件 `packages/ai/src/generate-text/{generate-text,stream-text}.ts`
- 协议文档：[Anthropic Messages API](https://docs.claude.com/en/api/messages) —— SDK 内部翻译目标之一
- [[langchain]] —— 厚框架 vs 薄抽象的另一极

## 关联

- [[langchain]] —— 厚 vs 薄两条路；薄者赢 90% 场景
- [[ollama]] —— Vercel AI SDK 的本地模型 Provider 之一
- [[zod]] —— `generateObject` / tool schema 的事实标准
- [[react]] —— `useChat` / `useCompletion` 的载体

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[browser-use]] —— browser-use — 用自然语言让 AI Agent 操控浏览器
- [[react]] —— React UI 组件库
- [[zod]] —— Zod — TypeScript-first schema 验证

