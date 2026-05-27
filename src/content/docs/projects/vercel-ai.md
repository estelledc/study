---
title: "Vercel AI SDK — 把 LLM 调用产品化"
description: stream / structured output / tool use / multimodal 全统一在一组类型安全 API
sidebar:
  order: 25
  label: "vercel/ai"
---

> vercel/ai v7.0.0-canary.154（2026-05），Apache 2.0。
>
> Vercel AI SDK 解决的是"OpenAI / Anthropic / Google / xAI 的 API 各家不一致"的痛。
> 它做了一层抽象——你写 `generateText()` 不关心底层是哪家——
> 但**这层抽象不是 LangChain 那种"全套框架"**，而是
> **轻量适配 + 类型安全 + Stream 一等公民**。
>
> Season 4 第三篇。

## 一句话定位

**Vercel AI SDK = 一组 LLM 通用 API（generateText / streamText / generateObject / streamObject）+ 各家 provider 适配器。**
你的代码不变换厂商。配套的 React hooks（useChat / useCompletion）让前端集成丝滑。

## Why（为什么是它而不是 LangChain / 直接调 API）

LLM 应用工程师的现实：

```
- OpenAI SDK：openai.chat.completions.create({...})
- Anthropic SDK：anthropic.messages.create({...})
- Google SDK：generativeAI.getGenerativeModel(...).generateContent(...)
- 各家 streaming 协议不一样
- tool calling schema 不一样
- structured output 各家做法不同
```

**自己写个 abstract layer**——3 个月后发现自己在做 mini LangChain。

LangChain 解决了这个痛但**矫枉过正**：1000+ 概念（Chain / Agent / Memory / Retriever / VectorStore），
学习曲线陡，runtime 重，类型推导差。

Vercel AI SDK 的判断：

1. **薄抽象**——只统一最核心的几个 API，不发明 Chain / Memory 等概念
2. **TypeScript 优先**——类型推导贯穿（schema → tool input / output 类型流过 streamText 调用）
3. **Stream 一等公民**——`streamText / streamObject` 是和 `generateText` 平级的 API
4. **React 集成**——`useChat` / `useCompletion` 是 React 第一公民
5. **Server Component 友好**——`createAI` 等 RSC 专用 API

| 方案 | 抽象层级 | 跨厂商 | TS 友好 | Stream | 框架绑定 |
|---|---|---|---|---|---|
| **OpenAI SDK** | 单厂商 | ✗ | 中 | ✓ | 无 |
| **LangChain** | 厚框架（Chain/Agent） | ✓ | 弱 | 部分 | 多 |
| **LlamaIndex** | RAG 优先 | ✓ | 中 | 部分 | 无 |
| **Vercel AI SDK** | **薄适配** | **✓** | **强** | **核心** | **React/Next 友好** |
| **Mastra / Effect AI** | TS-first 框架 | ✓ | 强 | ✓ | 有 |

**为什么不是 LangChain**：LangChain 是 2023 年的产物，**那时候不知道 LLM 应用最终长什么样**。
它把所有可能的抽象都先做了。结果：抽象太厚，业务代码被框架包住。

Vercel AI SDK 是 2024 年后的回答：**只抽象那部分被验证有用的**——
generateText、streamText、tool calling、structured output。其他你自己写。

**为什么不是直接调 SDK**：可以——但你会重复实现"换厂商接口"和"流式聚合"。
Vercel AI SDK 把这两件最痛的事处理掉，**剩下的不强加抽象**。

**Vercel AI SDK 的代价**：
- 还在快速迭代（v7 alpha），可能 breaking changes
- React 偏向重——非 React 用户感觉某些 API 多余
- 某些厂商特殊功能（如 Anthropic prompt caching）要走专门 API

## 仓库地形

```
vercel/ai/
└── packages/
    ├── ai/                              ← ★ 主包
    │   └── src/
    │       ├── generate-text/           ← ★★★ generateText / streamText
    │       │   ├── generate-text.ts     ← 1639 行
    │       │   ├── stream-text.ts       ← 2817 行
    │       │   └── execute-tool-call.ts ← tool 执行
    │       ├── generate-object/         ← generateObject / streamObject
    │       ├── generate-image/
    │       ├── generate-video/
    │       ├── generate-speech/
    │       ├── transcribe/
    │       ├── embed/
    │       ├── ui/                      ← React hooks（useChat, useCompletion）
    │       ├── ui-message-stream/       ← UIMessage 协议（stream 友好）
    │       ├── agent/                   ← agent loop API
    │       ├── middleware/              ← 通用中间件（缓存、重试、telemetry）
    │       ├── prompt/                  ← prompt 处理工具
    │       ├── tool-approval-...        ← tool 审批流程（HITL）
    │       └── registry/                ← provider registry
    ├── @ai-sdk/openai/                  ← OpenAI provider
    ├── @ai-sdk/anthropic/               ← Anthropic provider
    ├── @ai-sdk/google/                  ← Google provider
    ├── @ai-sdk/xai/                     ← xAI provider
    ├── @ai-sdk/...
    └── react/                           ← React hooks 单独包
```

**心脏文件**：

1. `packages/ai/src/generate-text/generate-text.ts`（1639 行）——`generateText()` 的实现
2. `packages/ai/src/generate-text/stream-text.ts`（2817 行）——`streamText()` 的实现
3. `packages/ai/src/ui-message-stream/`——UIMessage 协议（前后端 stream 协作）

## 核心机制 · Layer 3 精读

### 机制 1 · `generateText` 的统一签名

```typescript
const result = await generateText({
  model: anthropic('claude-opus-4-7'),    // ← provider 适配
  prompt: 'Hello',
  // 或：messages: [{ role: 'user', content: 'Hello' }]
})

console.log(result.text)
console.log(result.usage)        // { promptTokens, completionTokens }
console.log(result.finishReason) // 'stop' | 'length' | 'tool-calls' | ...
```

无论你换 `anthropic('claude-opus-4-7')` / `openai('gpt-4o')` / `google('gemini-2.0-flash')`，
**调用代码不变**。

→ 这就是核心价值。**OpenAI 涨价 / Anthropic 出新模型 / Google 推 cheaper**——
你切一行代码就能换厂商。**没被锁死**。

### 机制 2 · `streamText` 的细粒度事件流

```typescript
const result = streamText({
  model: anthropic('claude-opus-4-7'),
  prompt: 'Tell me a story...'
})

for await (const part of result.fullStream) {
  if (part.type === 'text-delta') console.log(part.textDelta)
  if (part.type === 'tool-call') console.log('Tool call:', part.toolName)
  if (part.type === 'tool-result') console.log('Result:', part.result)
  if (part.type === 'finish') console.log('Done:', part.usage)
}
```

不是简单的 string stream——是**结构化事件流**：

- `text-delta` —— 文本增量
- `tool-call` —— 模型决定调用 tool
- `tool-call-delta` —— tool 参数流式（参数还没完整时）
- `tool-result` —— tool 执行结果
- `reasoning` —— 思考链（Claude / Gemini 支持）
- `finish` —— 结束 + token 用量
- `error` —— 错误

→ **这种结构化事件流让前端 UI 可以做 fine-grained 渲染**——
不只是逐字打字效果，还能"思考中..." / "调用 tool ..." / "tool 完成"等阶段化反馈。

### 机制 3 · `generateObject` —— Schema-driven structured output

```typescript
const { object } = await generateObject({
  model: openai('gpt-4o'),
  schema: z.object({
    title: z.string(),
    tags: z.array(z.string()),
    sentiment: z.enum(['positive', 'neutral', 'negative'])
  }),
  prompt: '分析这条评论：...'
})

// object 类型自动是 { title: string, tags: string[], sentiment: 'positive' | 'neutral' | 'negative' }
console.log(object.sentiment)
```

**SDK 内部干了什么**：

1. 把 zod schema 转成 JSON Schema
2. 用厂商的 structured output 能力（OpenAI tools / Anthropic prefill / Gemini schema）
3. 解析 LLM 输出
4. **用 zod 严格校验**——不通过就 retry / 抛错
5. 类型推导：`object` 的类型从 schema 流过来

→ 把 [zod 笔记](/study/projects/zod/) 的"schema 即类型即校验"的思想用到 LLM 输出。
**LLM 给的 JSON 不可信，必须验证**——这是把不靠谱变可靠的关键 idiom。

### 机制 4 · Tool calling 的统一抽象

```typescript
const result = await generateText({
  model: anthropic('claude-opus-4-7'),
  tools: {
    weather: tool({
      description: 'Get the current weather',
      parameters: z.object({ location: z.string() }),
      execute: async ({ location }) => {
        return await fetch(`https://api/${location}`).then(r => r.json())
      }
    })
  },
  prompt: 'What is the weather in Beijing?'
})
```

**SDK 内部做的事**：

1. zod schema 转成 JSON schema
2. 把 tools 列表给 LLM
3. LLM 决定调用 → 返回 tool_use
4. SDK 拦截，**自己执行 `execute` 函数**
5. 把结果再喂回去 LLM
6. LLM 用 result 生成最终回复
7. 整个 multi-turn 循环对你透明

→ 这就是**agent loop 的产品化**。你写定义，SDK 跑循环。
和 [Claude Code 笔记](/study/projects/claude-code/) 的内部 loop 是同一个心智，
但 Vercel AI SDK 把它做成了**外部库**。

### 机制 5 · UIMessage 协议 —— 前后端 stream 友好

`packages/ai/src/ui-message-stream/` 实现一种 stream 协议，给 SSE 用：

```typescript
// 后端
import { streamText } from 'ai'

export async function POST(req: Request) {
  const { messages } = await req.json()
  const result = streamText({ model: anthropic('claude-opus-4-7'), messages })
  return result.toUIMessageStreamResponse()  // ← 自动转成 SSE Response
}

// 前端 (React)
import { useChat } from '@ai-sdk/react'

function Chat() {
  const { messages, input, handleInputChange, handleSubmit } = useChat()
  return ...  // 自动渲染 streaming text + tool calls
}
```

**前后端共用一种数据模型**——`UIMessage`。后端 stream 出 UIMessage，前端 `useChat` hook 解析消费。

→ 这是**全栈 SDK 的体感**。Next.js 用户写一个 `route.ts` + 一个 React 组件就有完整 chat。

### 机制 6 · Middleware 系统

```typescript
import { customProvider, wrapLanguageModel } from 'ai'
import { extractReasoningMiddleware } from 'ai'

const customAnthropic = wrapLanguageModel({
  model: anthropic('claude-opus-4-7'),
  middleware: [
    extractReasoningMiddleware({ tagName: 'thinking' }),    // ← 提取 thinking
    customCacheMiddleware,                                  // ← 自定义 cache
    telemetryMiddleware                                     // ← 自定义 telemetry
  ]
})
```

→ Middleware 是**通用 LLM 行为修改**点：缓存、重试、telemetry、内容过滤、成本统计。
和 [tRPC 笔记](/study/projects/trpc/) 的 links 系统同源思路。

## 横向对比

### vs LangChain — 厚 vs 薄

LangChain：1000+ class，Chain / Agent / Memory / Retriever / VectorStore / Tool / OutputParser ...
Vercel AI SDK：generateText / streamText / generateObject / streamObject / embed —— 5 个核心 API。

LangChain 像 Spring Framework——给你完整框架。
Vercel AI SDK 像 Express——给你最薄的中间件。

**90% 应用场景，薄的反而胜**。

### vs Mastra — 同代但理念不同

[mastra-ai/mastra](https://mastra.ai/) 是 TS 原生 agent 框架，比 Vercel AI SDK 更**framework-y**——
内置 Workflow、Memory、Eval、Agent 等概念。

如果你做"agent 工程"重应用——Mastra 更合适。
如果你做"chat / Q&A / 简单 agent"——Vercel AI SDK 更轻。

### vs Effect AI / Effect Schema — FP 流派

[Effect-TS/effect](/study/projects/effect/)（队列里 Season 5 在等）有 AI 集成。
代码风格非常 FP——错误用 Effect 类型、stream 用 Effect Stream。

适合 FP 信仰者；不适合大多数前端工程师。

### vs 直接调 OpenAI/Anthropic SDK — 何时不用 SDK

**你需要真正深度的特性**：
- Anthropic prompt caching（v1 beta）
- OpenAI 的 logit_bias
- Anthropic Computer Use
- Google Gemini 的 grounding

这些 Vercel AI SDK 还在追，直接调原生 SDK 更直接。

但**主流 chat / structured output / tool use 场景**——Vercel AI SDK 是更好的选择。

## Hands-on（10 分钟内能跑）

```bash
mkdir ai-demo && cd ai-demo
npm init -y
npm install ai @ai-sdk/anthropic zod
echo "ANTHROPIC_API_KEY=sk-..." > .env
```

写 `index.ts`：

```typescript
import 'dotenv/config'
import { generateText, streamText, generateObject } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { z } from 'zod'

// 1. 同步生成
const { text } = await generateText({
  model: anthropic('claude-opus-4-7'),
  prompt: 'Hello in 5 words'
})
console.log('Text:', text)

// 2. 流式生成
const stream = streamText({
  model: anthropic('claude-opus-4-7'),
  prompt: 'Tell me a 3-sentence story'
})
for await (const chunk of stream.textStream) {
  process.stdout.write(chunk)
}
console.log('\n---')

// 3. Structured output
const { object } = await generateObject({
  model: anthropic('claude-opus-4-7'),
  schema: z.object({
    sentiment: z.enum(['positive', 'neutral', 'negative']),
    confidence: z.number().min(0).max(1)
  }),
  prompt: 'Analyze: "I love this product!"'
})
console.log('Sentiment:', object)
```

```bash
npx tsx index.ts
```

### 改一处的实验（必做）

把 `anthropic('claude-opus-4-7')` 改成 `openai('gpt-4o-mini')`（先 `npm install @ai-sdk/openai` + 加 OPENAI_API_KEY）。
**代码其他都不变**。

观察输出——质量略不同，但你的代码完全没变化。**这就是抽象的价值**。

第二个实验：加 tool calling：

```typescript
import { tool } from 'ai'

const result = await generateText({
  model: anthropic('claude-opus-4-7'),
  tools: {
    getTime: tool({
      description: '获取当前时间',
      parameters: z.object({ timezone: z.string() }),
      execute: async ({ timezone }) => new Date().toLocaleString('en-US', { timeZone: timezone })
    })
  },
  prompt: 'What time is it in Tokyo?'
})
console.log(result.text)
console.log('Tools called:', result.toolCalls)
```

观察 LLM 的整个调用循环：你只要写 `execute`，SDK 跑 multi-turn。

## 与你工作的连接

**能立刻迁移**：

- 任何 LLM 应用（前端 / 全栈）用 Vercel AI SDK 起步——比直接调 SDK 体感好很多
- structured output 场景必用 `generateObject` —— [zod](/study/projects/zod/) 直接复用
- React 应用的 chat UI 用 `useChat` —— 30 行代码搞定流式

**下个月可能用到**：

- 给项目加 RAG：用 `embed` 生成向量 + 自己写检索 + 喂给 generateText
- agent 场景：用 SDK 的 agent API（不要写自己的循环）
- 多模态：generateImage / generateVideo / transcribe 都在 SDK 里

**不要用 Vercel AI SDK 的部分**：

- **极简单的 one-shot**——直接调原生 SDK 更直接（少一层依赖）
- **重型 agent 工程**（多 agent 协调、复杂 memory、eval）——Mastra / LangGraph 更合适
- **不用 React / Next**—— 你失去 50% 价值（hooks 用不上）

## 读完你能做之前做不了的事

- **判断**：选 LLM 集成方案时，能区分"薄抽象 vs 厚框架"哪个适合自己
- **设计**：写 LLM 应用时，**第一选择是 Vercel AI SDK + 自己业务逻辑**，而不是从零造
- **解释**：被问"streamText 和 OpenAI SSE 有什么区别"时，能用 UIMessage 协议解释
- **下钻**：看懂 Vercel 的 RSC + AI 整合模式（`useUIState` / `createAI`）
- **对照**：识别"我应该用 LangChain 还是 Vercel AI SDK"——这是个常见判断题

## 自检 · 5 个问题

1. Vercel AI SDK 故意选"薄抽象"。如果在 v7 这一代厚化（加入 Chain / Memory 等概念）会失去什么？
2. `streamText.fullStream` 和 `streamText.textStream` 是两个不同接口——前者是结构化事件，后者是纯字符串。
   什么场景用哪个？
3. `generateObject` 用 zod schema 让 LLM 输出 JSON。模型不听话输出错误格式时，SDK 应该 retry 多少次？怎么权衡？
4. UIMessage 协议是 Vercel 自定义的。如果用 OpenAPI 标准的 SSE 替代，会失去什么 features？
5. 直接调 OpenAI SDK vs Vercel AI SDK——什么场景前者反而更好？写一个判断框架。

## 延伸阅读

读完这篇笔记后下一步：

1. `packages/ai/src/generate-text/generate-text.ts:1-200`——generateText 入口实现
2. `packages/ai/src/generate-text/stream-text.ts:1-200`——streamText 主循环
3. **官方文档**（[ai-sdk.dev](https://ai-sdk.dev)）—— RSC integration / agent / middleware 的官方 use case
4. **mastra-ai/mastra** 源码——对比"agent framework" 的另一种取舍
5. **LangChain JS** 源码——对比"什么叫太抽象"

---

**笔记完成**：2026-05-27（v7.0.0-canary.154）
**研究方法**：本地克隆 + 阅读 generate-text 入口 + 设计判断分析
**心脏文件**：`packages/ai/src/generate-text/{generate-text,stream-text}.ts`
