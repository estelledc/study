---
title: Dexter — 自主金融研究 AI Agent
来源: https://github.com/virattt/dexter
日期: 2026-06-13
分类: 机器学习
子分类: 数据科学与 AI
provenance: pipeline-v3
---

## 一句话介绍

Dexter 是一个自主运行的金融研究助手。你只需要用自然语言问一个问题，它就能自己规划研究步骤、调取实时市场数据、检查结果对不对，最后给你一份有据可查的研究结论。

GitHub 上 27k star，2026 年 6 月还在频繁更新。

## 一个日常类比：你的私人金融分析师

想象一下，你雇了一位金融分析师。你告诉他："帮我分析一下苹果公司的财务状况。"

传统方式：他需要自己一步步来——打开财报网站查收入、看资产负债表、算增长率、对比历年数据，最后写报告。每一步都要你盯着或者等很久。

Dexter 的方式：它像一个带着完整工具箱的分析师。你一句话后，它会：

1. **拆解任务**：把"分析苹果"分解为查收入、看利润、分析现金流等子步骤
2. **并行执行**：同时去做多个不需要互相依赖的查询
3. **自我检查**：拿到数据后自己判断"够了吗？对不对？"
4. **调整策略**：如果数据不够好，换个方向继续查
5. **交付报告**：整理成一份结构清晰的研究报告

它和 Claude Code 类似，但 Claude Code 是通用代码助手，而 Dexter 只专注于金融研究。

## 核心技术概念

### 1. Agent Loop（智能体循环）

这是 Dexter 的大脑核心。每次你提问，Dexter 会进入一个循环：

```
提问 → 让 AI 思考 → 调用工具获取数据 → 把数据返回给 AI → AI 判断是否需要更多数据 → 循环或给出结论
```

这个循环最多运行 10 次（可配置），防止 AI 陷入死循环。

### 2. Tool（工具系统）

Dexter 不凭空回答问题。它有一系列"工具"可以调用：

| 工具 | 作用 |
|------|------|
| `get_income_statements` | 获取利润表（收入、成本、利润） |
| `get_balance_sheet` | 获取资产负债表（资产、负债、权益） |
| `get_cash_flow` | 获取现金流量表 |
| `get_market_data` | 获取实时股票价格和市场数据 |
| `stock_screener` | 筛选符合条件的股票 |
| `web_search` | 通过 Exa/Tavily 搜索网页信息 |
| `memory_search` | 搜索 Dexter 之前学到的知识 |

### 3. Scratchpad（scratchpad 草稿本）

Dexter 每做一步都会在 `.dexter/scratchpad/` 下记录日志。你可以把它理解为分析师的工作笔记——每一步查了什么数据、用了什么理由、得到了什么结果，全部用 JSON 格式记录下来。

```
.dexter/scratchpad/
  2026-01-30-111400_9a8f10723f79.jsonl
```

每条记录包含：
- `init`：原始问题
- `tool_result`：工具调用和返回结果
- `thinking`：AI 的思考过程

### 4. 上下文管理（Context Management）

当对话太长、超出 AI 的记忆容量时，Dexter 会自动处理：

- **Microcompact**：每轮开始前，精简 AI 之前的思考内容，只保留最近 2 轮
- **Compaction**：超过令牌阈值时，用 AI 把旧对话总结成摘要
- **Fallback truncate**：实在处理不了时，删掉最老的几轮对话

### 5. 流式输出（Streaming）

Dexter 回答时会实时显示进展。你会看到：

- `thinking`：AI 正在想什么
- `tool-input`：准备调用哪个工具
- `tool-use`：工具正在运行
- `responding`：正在生成回答

## 安装和运行

### 前置要求

- Bun 运行时（v1.0+）：`curl -fsSL https://bun.com/install | bash`
- OpenAI API Key
- Financial Datasets API Key
- Exa API Key（可选，用于网页搜索）

### 安装步骤

```bash
git clone https://github.com/virattt/dexter.git
cd dexter
bun install
cp env.example .env
```

然后编辑 `.env` 文件，填入你的 API Key：

```bash
OPENAI_API_KEY=sk-xxxxx
FINANCIAL_DATASETS_API_KEY=your-key
EXASEARCH_API_KEY=your-key
```

### 运行

```bash
# 交互模式
bun start

# 开发模式（文件变更自动重启）
bun dev
```

## 代码示例

### 示例 1：Agent 主循环的核心逻辑

这是 Dexter 最核心的部分——让 AI 自动思考和执行的循环。你可以看到它是如何一步步推进的：

```typescript
// Agent 主循环 (src/agent/agent.ts)
async *run(query: string, inMemoryHistory?: InMemoryChatHistory): AsyncGenerator<AgentEvent> {
  // 构建初始消息数组：系统提示 + 历史对话 + 用户问题
  const historyMessages = inMemoryHistory?.getRecentTurnsAsMessages() ?? [];
  let messages: BaseMessage[] = [
    new SystemMessage(this.systemPrompt),    // 系统提示
    ...historyMessages,                       // 之前的对话
    new HumanMessage(query),                  // 用户的问题
  ];

  // 主循环：最多运行 maxIterations 次
  while (ctx.iteration < this.maxIterations) {
    ctx.iteration++;

    // 1. 微调消息：精简过旧的思考过程
    const mcResult = microcompactMessages(messages);
    if (mcResult.trigger) {
      messages = mcResult.messages;
    }

    // 2. 调用 AI 模型（先尝试流式，失败后回退到阻塞）
    const result = yield* this.callModelWithStreaming(messages);
    const response = result.response;

    // 3. 如果 AI 没有调用工具 → 直接给出答案，循环结束
    if (!hasToolCalls(response)) {
      yield* this.handleDirectResponse(extractTextContent(response), ctx);
      return;
    }

    // 4. 把 AI 的回答加入历史
    messages.push(response);

    // 5. 并发执行所有工具调用
    let { toolMessages } = yield* this.executeToolsAndCollectMessages(response, ctx);

    // 6. 把工具结果加入对话历史，AI 继续下一轮思考
    messages.push(...toolMessages);

    // 7. 管理上下文大小，防止超出令牌限制
    yield* this.manageContextThreshold(ctx, query, messageState);
  }

  // 超出最大迭代次数
  yield {
    type: 'done',
    answer: `已达最大迭代次数 (${this.maxIterations})，无法完成研究。`,
  };
}
```

**逐行解读：**

1. 先把系统提示（告诉 AI 它的身份和规则）、之前的对话、以及你的问题装进一个 `messages` 数组
2. 每轮开始前调用 `microcompactMessages`——如果 AI 之前想太多了，就把过久的思考精简掉，只留最近的
3. 把整个消息数组发给 AI 模型（如 GPT-5.5），AI 会返回两种内容：要么是文字回答，要么是工具调用指令
4. 如果 AI 没有调用任何工具，说明它认为自己已经够了，直接输出最终答案
5. 如果调用了工具（比如 `get_income_statements`），就并发执行这些工具，把所有结果收集回来
6. 把工具的结果也放进 `messages`，AI 拿到数据后进入下一轮思考
7. 每轮都检查上下文大小，太长了就自动压缩，防止超出 token 限制
8. 最多循环 10 次，到次数就停

### 示例 2：工具执行器——并发调度和结果收集

Dexter 可以同时执行多个工具。这个示例展示了它是如何安全、有序地调度工具的：

```typescript
// 工具执行和消息收集 (src/agent/agent.ts)
private async *executeToolsAndCollectMessages(response: AIMessage, ctx: RunContext) {
  const toolMessageMap = new Map<string, ToolMessage>();
  let denied = false;
  const toolCalls = response.tool_calls!;

  // 遍历每一个工具调用事件
  for await (const event of this.toolExecutor.executeAll(response, ctx)) {
    yield event;  // 把进展事件发出去（让用户实时看到进度）

    if (event.type === 'tool_end' && event.toolCallId) {
      // 工具执行成功 → 创建 ToolMessage 记录结果
      toolMessageMap.set(event.toolCallId, new ToolMessage({
        content: event.result,
        tool_call_id: event.toolCallId,
        name: event.tool,
      }));
    } else if (event.type === 'tool_error' && event.toolCallId) {
      // 工具执行出错 → 记录错误信息
      toolMessageMap.set(event.toolCallId, new ToolMessage({
        content: `Error: ${event.error}`,
        tool_call_id: event.toolCallId,
        name: event.tool,
      }));
    } else if (event.type === 'tool_denied' && event.toolCallId) {
      // 用户拒绝了这个工具调用
      toolMessageMap.set(event.toolCallId, new ToolMessage({
        content: 'Tool execution denied by user.',
        tool_call_id: event.toolCallId,
        name: event.tool,
      }));
      denied = true;
    }
  }

  // 按照工具调用原始顺序排列结果
  // 这样 AI 拿到消息时，顺序和它调用时一致
  const toolMessages: ToolMessage[] = toolCalls.map(tc =>
    toolMessageMap.get(tc.id!) ?? new ToolMessage({
      content: 'Skipped (already executed).',
      tool_call_id: tc.id!,
      name: tc.name,
    }),
  );

  return { toolMessages, denied };
}
```

**关键点：**

- `tool_call_id` 是每个工具调用的唯一 ID，像快递单号一样，确保返回结果时能找到对应的工具
- 工具执行是**并发**的——多个工具同时跑，哪个先完成哪个先返回
- 但最终 `toolMessages` 按照**原始调用顺序**排列，因为 AI 对顺序很敏感
- 如果用户中途按 ESC 中断，或者主动拒绝某个工具，`denied` 会被设为 true，循环终止

### 示例 3：实际使用时的对话流程

以下是你启动 Dexter 后可能的实际对话过程：

```
$ bun start

Dexter > 分析一下英伟达的财务状况

[thinking] 我需要查看 NVDA 最近的财报数据，包括收入、利润和现金流...
[tool_start: get_income_statements, ticker: "NVDA", period: "annual", limit: 5]
[tool_start: get_balance_sheet, ticker: "NVDA", period: "annual", limit: 5]
[tool_start: get_market_data, ticker: "NVDA"]
[tool_end: get_market_data ✓ 0.8s]  → 获取了 NVDA 当前股价 $137.71
[tool_end: get_income_statements ✓ 1.2s]  → 获取了 5 年收入数据
[tool_end: get_balance_sheet ✓ 1.1s]  → 获取了 5 年资产数据
[thinking] 收入增长强劲，从 2021 年的 $16.7B 增长到 2025 年的 $130.5B...
[tool_start: get_cash_flow, ticker: "NVDA", period: "annual", limit: 5]
[tool_end: get_cash_flow ✓ 0.9s]
[done] 以下是英伟达的财务分析报告：
...
```

整个过程中，每个步骤都写入了 `.dexter/scratchpad/` 下的日志文件，可以事后审计。

## 支持的 AI 模型和提供商

Dexter 不锁死在某一个 AI 模型上。你可以在 `.env` 里配置多个提供商：

| 提供商 | 环境变量 | 说明 |
|--------|---------|------|
| OpenAI | `OPENAI_API_KEY` | 默认，使用 gpt-5.5 |
| Anthropic | `ANTHROPIC_API_KEY` | 可选 |
| Google | `GOOGLE_API_KEY` | 可选 |
| XAI | `XAI_API_KEY` | 可选 |
| OpenRouter | `OPENROUTER_API_KEY` | 可选，支持多种模型 |
| Ollama | `OLLAMA_BASE_URL` | 本地运行，无需 API Key |

运行时输入 `/model` 命令可以切换模型和提供商。

## 调试：查看 Dexter 的工作过程

每个查询都会在 `.dexter/scratchpad/` 生成一个 JSONL 文件：

```json
{"type":"init","query":"分析一下苹果公司的财务状况"}
{"type":"tool_result","toolName":"get_income_statements","args":{"ticker":"AAPL","period":"annual"},"result":{"revenue":[...]},"llmSummary":"获取了苹果 5 年收入数据"}
{"type":"thinking","message":"收入从 2021 年的 3658 亿美元增长到 2025 年的 3943 亿美元..."}
{"type":"done","answer":"苹果公司的财务分析如下..."}
```

这个文件就像侦探的案发现场记录——你可以精确还原 Dexter 每一步做了什么、看到了什么、想了什么。

## 总结

| 维度 | 说明 |
|------|------|
| 核心能力 | 自动拆解金融问题 → 调数据 → 自校验 → 出报告 |
| 技术栈 | TypeScript + LangChain + Bun |
| 最大特点 | 自主规划 + 自我反思 + 实时数据 |
| 适用场景 | 学习金融分析流程、做投资研究参考、理解 AI Agent 如何工作 |
| 不适合 | 直接交易决策（官方明确声明不提供投资建议） |

对零基础学习者来说，Dexter 是一个理解"AI Agent 如何工作"的优秀范例——它把复杂的金融研究过程变成了一个可观察、可审计、可学习的黑盒。
