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

**心脏文件**（按抽象厚度从薄到厚）：

1. `packages/provider/src/language-model/v4/language-model-v4.ts`（**61 行**）——所有 provider 必须实现的接口。整个 SDK 的物理基石。
2. `packages/ai/src/generate-text/generate-text.ts`（1639 行）——`generateText()` 实现，含 agent loop。
3. `packages/ai/src/generate-text/stream-text.ts`（2830 行）——`streamText()` 实现，Web Streams API 流水线。

> 怀疑 0：心脏排序为什么不是 generate-text 第一？因为 61 行的 `LanguageModelV4` 才是真正的"约定"——
> 它说"任何 provider 只要实现 `doGenerate` + `doStream` 两个方法就行"。SDK 上层 4500 行代码全是消费这两个方法的不同 surface。
> 这是典型的"窄腰" (waist) 设计：上下都厚，中间一根线把它们连起来。

![Vercel AI SDK 架构全景](/projects/vercel-ai/01-architecture.webp)

> 三层视图：上层是 5+ 个 provider adapter（每家厂商写一个 class implements `LanguageModelV4`），
> 中层是 generate-text / stream-text / generate-object 三组核心 API，下层是 5 种消费 surface（result.text / fullStream / textStream / SSE / useChat）。
> 抽象的"窄腰"在中层接口（61 行）。

## 核心机制 · Layer 3 精读

### 段 1 · Provider 抽象层 —— 61 行接口扛住 5 家厂商

打开 [`packages/provider/src/language-model/v4/language-model-v4.ts`](https://github.com/vercel/ai/blob/9b96132/packages/provider/src/language-model/v4/language-model-v4.ts)（commit `9b96132`，整 61 行）：

```typescript
import type { LanguageModelV4CallOptions } from './language-model-v4-call-options';
import type { LanguageModelV4GenerateResult } from './language-model-v4-generate-result';
import type { LanguageModelV4StreamResult } from './language-model-v4-stream-result';

/**
 * Specification for a language model that implements the language model interface version 4.
 */
export type LanguageModelV4 = {
  readonly specificationVersion: 'v4';
  readonly provider: string;
  readonly modelId: string;

  // 哪些 URL 让 provider 直接吃，哪些 SDK 自己下载（multimodal 用）
  supportedUrls:
    | PromiseLike<Record<string, RegExp[]>>
    | Record<string, RegExp[]>;

  /**
   * Generates a language model output (non-streaming).
   * Naming: "do" prefix to prevent accidental direct usage of the method
   * by the user.
   */
  doGenerate(
    options: LanguageModelV4CallOptions,
  ): PromiseLike<LanguageModelV4GenerateResult>;

  /**
   * Generates a language model output (streaming).
   * @return A stream of higher-level language model output parts.
   */
  doStream(
    options: LanguageModelV4CallOptions,
  ): PromiseLike<LanguageModelV4StreamResult>;
};
```

旁注：

- **specificationVersion = 'v4'** 是可见的版本号——provider 和上层 SDK 用这个字段做版本兼容；
  v3 模型可以和 v4 SDK 共存，因为 [`resolve-model.ts`](https://github.com/vercel/ai/blob/9b96132/packages/ai/src/model/resolve-model.ts) 里有 dispatch
- **provider + modelId** 两个 string，仅作 telemetry / 错误信息用——SDK 不靠这两个字段做行为分支，只靠 `doGenerate` / `doStream`
- **`do` 前缀**——这个命名是故意的（注释明说："prevent accidental direct usage"）。
  用户应该调 `generateText({ model })` 而不是 `model.doGenerate()`——前者带超时、retry、tool loop，后者裸调
- **supportedUrls** 解决 multimodal 难题——OpenAI 自己能下 `https://...png`，但 Anthropic 要 base64 inline。
  SDK 看 regex 决定要不要先 download 再 inline
- **PromiseLike 而不是 Promise**——为了允许 provider 用同步常量返回（多数 provider 这里返回纯对象，不真做 await）
- 整个 interface 只有 **2 个方法**——一个同步、一个流式。少到不能再少

具体实现，看 [`packages/anthropic/src/anthropic-language-model.ts:152`](https://github.com/vercel/ai/blob/9b96132/packages/anthropic/src/anthropic-language-model.ts#L152)：

```typescript
export class AnthropicLanguageModel implements LanguageModelV4 {
  readonly specificationVersion = 'v4';
  readonly modelId: AnthropicModelId;

  private readonly config: AnthropicLanguageModelConfig;
  private readonly generateId: () => string;

  constructor(modelId: AnthropicModelId, config: AnthropicLanguageModelConfig) {
    this.modelId = modelId;
    this.config = config;
    this.generateId = config.generateId ?? generateId;
  }

  get provider(): string {
    return this.config.provider;
  }

  // 实际 doGenerate 在 line 864、doStream 在 line 1433
  // 主体职责：把 v4 的 prompt 转成 Anthropic Messages API 格式 → fetch → 把响应 normalize 回 v4 类型
}
```

> 怀疑 1：61 行真能扛住 5 家厂商的差异？
> 答：不能。差异下沉到了 `LanguageModelV4CallOptions`（option bag）和 `language-model-v4-stream-part.ts`（输出 part 类型）。
> Anthropic 的 prompt caching、Google 的 grounding、OpenAI 的 logit_bias 都靠 `providerOptions: { anthropic: {...}, openai: {...} }` 这种**逃生通道**塞进去。
> SDK 不约束这部分——provider 自己解析自己的命名空间。代价：跨 provider 切换时，特殊功能要手动迁移。

→ **设计哲学**：把"通用部分"做窄做对（`doGenerate / doStream`），把"差异部分"做开放（`providerOptions`）。
这是**抽象设计的二象性**——核心约定要硬、扩展点要软。

### 段 2 · `generateText` 的 Agent Loop

打开 [`packages/ai/src/generate-text/generate-text.ts:211`](https://github.com/vercel/ai/blob/9b96132/packages/ai/src/generate-text/generate-text.ts#L211)。函数签名 110 行起手——但真正的灵魂是中段那个 do/while。看 [`generate-text.ts:1100-1180`](https://github.com/vercel/ai/blob/9b96132/packages/ai/src/generate-text/generate-text.ts#L1100-L1180)：

```typescript
// 简化版（保留骨架，删掉 telemetry / cloneMessages 等噪音）
do {
  // 1. 调底层 doGenerate（这是和 provider 唯一接触点）
  const currentModelResponse = await stepModel.doGenerate(callOptions);

  // 2. 抽 content（text / tool-call / reasoning 等 part）
  const stepContent = currentModelResponse.content;
  const clientToolCalls = stepContent.filter(p => p.type === 'tool-call');

  // 3. 用 stepResult 包装本步元数据（usage / finishReason / messages）
  const currentStepResult: StepResult<TOOLS, RUNTIME_CONTEXT> =
    new DefaultStepResult({
      callId,
      stepNumber,
      provider: stepModel.provider,
      modelId: stepModel.modelId,
      content: stepContent,
      finishReason: currentModelResponse.finishReason.unified,
      usage: stepUsage,
      // ...
    });

  steps.push(currentStepResult);
  messagesForNextStep = [...stepMessages, ...stepResponseMessages];

  // 4. 通知 onStepFinish 回调
  await notify({ event: currentStepResult, callbacks: [onStepFinish, ...] });
} while (
  // 继续条件 1：还有 client tool 调用待执行
  ((clientToolCalls.length > 0 &&
    clientToolOutputs.length + deniedToolApprovalResponses.length === clientToolCalls.length) ||
    pendingDeferredToolCalls.size > 0) &&
  // 继续条件 2：没满足 stop condition（默认 stepCount=1）
  !(await isStopConditionMet({ stopConditions, steps }))
);
```

旁注：

- **do/while 而不是 while**——保证至少跑一次（即使没 tool 也要调一次模型）
- **退出条件是布尔合成**——既要"有 tool 待执行"又要"没满足 stop"，两者**与**关系
- **`stopWhen = isStepCount(1)` 是默认值**（[L228](https://github.com/vercel/ai/blob/9b96132/packages/ai/src/generate-text/generate-text.ts#L228)）——
  这是个**关键设计选择**：默认只跑 1 步，**避免无限 tool loop 烧钱**。用户必须显式传 `stopWhen: stepCountIs(5)` 才允许多步
- **每一步推 `currentStepResult` 进 steps 数组**——最终结果可以拿到完整执行轨迹（debug / replay 都靠这个）
- **`messagesForNextStep`** 拼接上一轮 `stepResponseMessages`（包括 tool result）——
  这是把 multi-turn 上下文喂回模型的关键。Vercel AI SDK 帮你自动做 message accumulation
- 真正执行 tool 在 [`generate-text.ts:1313`](https://github.com/vercel/ai/blob/9b96132/packages/ai/src/generate-text/generate-text.ts#L1313) 的 `await executeToolCall(...)`——
  和 [`execute-tool-call.ts:41`](https://github.com/vercel/ai/blob/9b96132/packages/ai/src/generate-text/execute-tool-call.ts#L41) 配套
- **abortSignal 一路传到底**——`mergeAbortSignals(abortSignal, toolTimeoutMs)` 让 user-cancel + per-tool-timeout 复合
- 对比的话：自己写一个 OpenAI agent loop，**至少要 200 行**才能稳——message accumulation / tool dispatch / abort / per-step usage / deferred tools

> 怀疑 2：默认 `stopWhen = isStepCount(1)` 等于"默认禁用 multi-step"。
> 这是 footgun 还是 feature？我倾向于 **feature**——
> 多数初学者写 `generateText({ tools })` 时**根本不知道 LLM 会无限调 tool**。强制 opt-in 多步是合理的安全默认。
> 但代价是：90% 的 agent demo 第一次跑都"为什么 tool 调了但没拿到最终回复"——这是**设计 vs 易用**的取舍。
> 我会写在 [agent loop 笔记](/study/projects/claude-code/) 的反面对照里。

→ Claude Code 内部 agent loop 是**裸写**的（直接 `while` + `messages.create`），Vercel AI SDK 做成了**通用库**。
两者心智一致，但工程关注点不同：前者要榨极致控制权，后者要提供安全默认。

### 段 3 · `streamText` 的 Web Streams 流水线

[`stream-text.ts`](https://github.com/vercel/ai/blob/9b96132/packages/ai/src/generate-text/stream-text.ts) 整整 2830 行，但骨架就是 **5 段 pipe**。看 [`stream-text.ts:1300-1390`](https://github.com/vercel/ai/blob/9b96132/packages/ai/src/generate-text/stream-text.ts#L1300-L1390)：

```typescript
// 简化版骨架
const stitchableStream = createStitchableStream<TextStreamPart<TOOLS>>();
this.addStream = stitchableStream.addStream;
this.closeStream = stitchableStream.close;

// 1. 弹性 ReadableStream（处理 abort / 错误）
const reader = stitchableStream.stream.getReader();
let stream = new ReadableStream<TextStreamPart<TOOLS>>({
  async start(controller) {
    controller.enqueue({ type: 'start' });
  },
  async pull(controller) {
    try {
      const { done, value } = await reader.read();
      if (done) { controller.close(); return; }
      if (abortSignal?.aborted) { await abort(); return; }
      controller.enqueue(value);
    } catch (error) {
      if (isAbortError(error) && abortSignal?.aborted) await abort();
      else controller.error(error);
    }
  },
  cancel(reason) { return stitchableStream.stream.cancel(reason); },
});

// 2. 闸门：transform 调 stopStream() 后阻断剩余 token
let isRunning = true;
stream = stream.pipeThrough(
  new TransformStream({
    async transform(chunk, controller) {
      if (isRunning) controller.enqueue(chunk);
    },
  }),
);

// 3. 用户传入的 transforms（中间件）依次 pipeThrough
for (const transform of transforms) {
  stream = stream.pipeThrough(
    transform({
      tools: tools as TOOLS,
      stopStream() {
        stitchableStream.terminate();
        isRunning = false;
      },
    }),
  );
}

// 4. output 解析（如 generateObject 的 partial JSON parser）
// 5. eventProcessor（聚合 step、计 usage、触发 onFinish）
this.baseStream = stream
  .pipeThrough(createOutputTransformStream(output ?? text()))
  .pipeThrough(eventProcessor);
```

旁注：

- **stitchableStream** 是个自定义工具——允许往一条 stream 里**动态拼接子 stream**。
  multi-step agent loop 时，每一 step 是一个新的 doStream() 调用，结果**拼接进同一条 fullStream**。
  用户感知是一条连续流，内部其实是拼起来的
- **闸门 (gate) 模式**：用户中间件可以调 `stopStream()` 提前终止——
  闸门 transform 把 `isRunning = false`，后续 chunk 全丢。**为什么不直接 cancel 上游？**
  因为要让 stop 之后的"finalize"事件（如 `finish-step`）依然能走完
- **`pipeThrough` 链是单向数据流**——每一段 TransformStream 输入输出都是 `TextStreamPart`，类型在整条流里**不变**。
  这是 Web Streams API 的核心好处：组合性强，每一段独立可测
- **transforms 是 user-pluggable**——这是中间件机制的实现点（参考 [机制 6 Middleware](#机制-6--middleware-系统)）。
  用户传 `experimental_transform: [smoothStream(), customLoggingTransform]`，被插进流水线的固定位置
- **createOutputTransformStream** ([L675-755](https://github.com/vercel/ai/blob/9b96132/packages/ai/src/generate-text/stream-text.ts#L675-L755)) 是 `streamObject` 的核心——
  它把 `text-delta` 累成完整 text，**实时调 partial JSON parser** 产出 `partialOutput`。
  让前端能拿到"半成品 JSON"做 progressive UI
- **abortSignal 在 pull() 里检查**——每读一个 chunk 都校验 abort，保证 cancel 响应延迟 ≤ 1 chunk
- 真正的 multi-step 循环在 [stream-text.ts:1463](https://github.com/vercel/ai/blob/9b96132/packages/ai/src/generate-text/stream-text.ts#L1463) 的 `toolExecutionStepStream`——
  generateText 用 do/while，streamText 用嵌套 ReadableStream。**心智一致，载体不同**

> 怀疑 3：5 段 pipe 看起来很优雅，但**实际调试 stream-text bug 时简直地狱**——
> 错误从哪一段产生很难追。我看 [`stream-text.test.ts`](https://github.com/vercel/ai/blob/9b96132/packages/ai/src/generate-text/stream-text.test.ts)
> 测试代码量是实现的 2 倍以上（snapshot 文件夹 `__snapshots__` 几百个 case）。
> 这告诉我：**Web Streams API 写起来流畅、调试起来痛苦**。tradeoff 不是"组合性 vs 难度"，而是"组合性 + 高 test 覆盖成本"。
> 没有 snapshot test 就别用这个范式。

→ 这是 [bun 笔记](/study/projects/bun/) 里"async pipeline 调试性"问题在 SDK 域的版本——
任何 stream pipeline 都需要配套**全场景 snapshot 测试**才能维持。

## Hands-on 之外的核心 API（接续 Layer 3）

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

### vs LangChain.js — 厚 vs 薄（用同一个 use case 对照）

**Use case**：用户问天气，模型调 tool 拿数据，返回中文回答。

**LangChain.js 写法**（约 60 行，简化）：

```typescript
import { ChatAnthropic } from '@langchain/anthropic'
import { DynamicTool } from '@langchain/core/tools'
import { AgentExecutor, createToolCallingAgent } from 'langchain/agents'
import { ChatPromptTemplate } from '@langchain/core/prompts'

const model = new ChatAnthropic({ model: 'claude-opus-4-7' })

const weatherTool = new DynamicTool({
  name: 'weather',
  description: 'Get weather',
  func: async (location: string) =>
    JSON.stringify(await fetch(`/api/${location}`).then(r => r.json())),
})

const prompt = ChatPromptTemplate.fromMessages([
  ['system', 'You are a helpful assistant'],
  ['placeholder', '{chat_history}'],
  ['human', '{input}'],
  ['placeholder', '{agent_scratchpad}'],
])

const agent = await createToolCallingAgent({ llm: model, tools: [weatherTool], prompt })
const executor = new AgentExecutor({ agent, tools: [weatherTool] })

const result = await executor.invoke({ input: 'Beijing weather?' })
console.log(result.output)
```

**Vercel AI SDK 写法**（约 15 行）：

```typescript
import { generateText, tool, stepCountIs } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { z } from 'zod'

const result = await generateText({
  model: anthropic('claude-opus-4-7'),
  tools: {
    weather: tool({
      description: 'Get weather',
      parameters: z.object({ location: z.string() }),
      execute: async ({ location }) => fetch(`/api/${location}`).then(r => r.json()),
    }),
  },
  stopWhen: stepCountIs(5),
  prompt: 'Beijing weather?',
})
console.log(result.text)
```

差异不在行数，而在**心智负担**：

| 维度 | LangChain.js | Vercel AI SDK |
|---|---|---|
| 概念数 | Agent / Executor / Prompt / Scratchpad / Memory / Chain | tool / stopWhen |
| 类型安全 | tool input/output 是 string（手动 parse） | tool input 由 zod 推导成 typed object |
| Stream | 默认非 stream，要切 `streamEvents()` | `streamText` 是平级 API |
| Bundle 大小 | ~2 MB（含 hub 依赖） | ~150 KB |
| 学习曲线 | 高（每个抽象都要懂） | 低（只懂 generateText 就够 90%） |

**90% 应用场景，薄的胜**——因为概念越少，团队 onboard 越快、bug 越少、bundle 越小。

**但 10% 场景厚框架反而胜**：复杂多 agent 编排（LangGraph）、RAG 流水线（LlamaIndex）、企业 eval（LangSmith）——
这些 Vercel AI SDK 不做，也不打算做。

> 怀疑 5：用 LangChain.js 的人**多数没真用满它的概念**——他们只用 `model.invoke()` + `RunnableSequence`，
> 95% 的 Chain / Memory / Retriever 都用不上。这种用户**应该迁到 Vercel AI SDK**。
> 但已经写了 1 年的 LangChain 应用迁移成本极高——这就是**抽象厚度的固化效应**。
> 选 LLM 框架像选数据库 schema：第一选错，后面改不动。

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

### Layer 4 实验 · 写一个 custom provider（10 行代码骗过整个 SDK）

参考 [`language-model-v4.ts:8`](https://github.com/vercel/ai/blob/9b96132/packages/provider/src/language-model/v4/language-model-v4.ts#L8) 的接口，
写一个**返回固定文本**的假 provider，看上层 SDK 怎么消费它：

```typescript
// fake-provider.ts —— 完整 LanguageModelV4 实现，约 40 行
import type { LanguageModelV4 } from '@ai-sdk/provider'
import { generateText } from 'ai'

class EchoLanguageModel implements LanguageModelV4 {
  readonly specificationVersion = 'v4' as const
  readonly provider = 'echo'
  readonly modelId = 'echo-1'
  readonly supportedUrls = {}

  async doGenerate(options: any) {
    // 把用户最后一条 user message 原样回放
    const lastUser = options.prompt
      .filter((m: any) => m.role === 'user')
      .pop()
    const echoText = `ECHO: ${lastUser?.content[0]?.text ?? ''}`

    return {
      content: [{ type: 'text' as const, text: echoText }],
      finishReason: { unified: 'stop' as const, raw: 'stop' },
      usage: { inputTokens: 10, outputTokens: 10, totalTokens: 20 },
      warnings: [],
      request: {},
      response: { id: 'echo-1', timestamp: new Date(), modelId: 'echo-1' },
    }
  }

  async doStream(options: any) {
    // 偷懒：把 doGenerate 结果切成 word-by-word stream
    const result = await this.doGenerate(options)
    const text = result.content[0].type === 'text' ? result.content[0].text : ''
    const words = text.split(' ')

    return {
      stream: new ReadableStream({
        start(controller) {
          controller.enqueue({ type: 'text-start', id: '1' })
          for (const word of words) {
            controller.enqueue({ type: 'text-delta', id: '1', delta: word + ' ' })
          }
          controller.enqueue({ type: 'text-end', id: '1' })
          controller.enqueue({ type: 'finish', usage: result.usage, finishReason: 'stop' })
          controller.close()
        }
      }),
      request: {},
      response: result.response,
    }
  }
}

const result = await generateText({
  model: new EchoLanguageModel(),
  prompt: 'Hello world',
})
console.log(result.text)  // → "ECHO: Hello world"
```

关键观察：

- `generateText` **完全不知道**你不是真的 LLM——它只调 `doGenerate()`、消费返回的 content 数组
- 返回类型必须严格匹配 `LanguageModelV4GenerateResult`——少一个字段（如 `warnings`）TypeScript 立刻报错
- 这意味着**测试 LLM 应用的逻辑**不需要 mock HTTP——直接传一个 fake `LanguageModel` 就行
- 实际生产里 [`@ai-sdk/test`](https://github.com/vercel/ai/blob/9b96132/packages/ai/src/test) 内部就用这个模式
- **这才是 61 行接口的真正价值**：测试边界清晰，单元测试不依赖网络

> 怀疑 4：写 fake provider 时我 hit 一个坑——`finishReason` 必须是 `{ unified, raw }` 双字段对象，不是单个 string。
> 这是 v3 → v4 的 breaking change（v3 是单 string）。文档没说清，必须看 [`language-model-v4-finish-reason.ts`](https://github.com/vercel/ai/blob/9b96132/packages/provider/src/language-model/v4/language-model-v4-finish-reason.ts)。
> **provider 接口的 minor 改动会传染整个 ecosystem**——这是抽象稳定性的代价。
> v7 SDK 当前版本仍在 canary，breaking changes 仍在发生。生产应用要锁版本。

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
