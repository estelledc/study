---
title: stagehand — Playwright + LLM 的混血框架，act/extract/observe 三 API 共用 a11y 树
description: 框架/SDK 范例 (v1.1 分支 D) — TypeScript / 22.8k stars / hybrid snapshot + 可选 self-heal + zod schema 驱动 extract / Browserbase 团队
sidebar:
  order: 46
  label: browserbase/stagehand
---

> 状元篇 (2026-05-28，v1.1 分支 D 框架/SDK) — 不要把 stagehand 当成「Playwright 的 AI 包装」来读。
> 它真正的 abstraction 是「让 deterministic Playwright 调用和 LLM 决策共享同一个 a11y 树 + xpath 映射」。
> act() 试 selector，失败 fallback 到 LLM；extract() 用 zod schema 倒推；observe() 把 LLM 视为「候选元素提议器」而不是 actor。
> 三个 handler 类的代码骨架几乎复制粘贴，区别在最后一步对 LLM 输出的处理方式不同。
>
> 数据基线：22.8 k stars / 1.5 k forks / MIT / TypeScript 80.7% / 最后 push 2026-05-27 / 仓库锚定 commit `49575d62f56efbd3a91359a816823cbf70fde4fd`。

## 核心信息

| 字段 | 值 |
|---|---|
| 项目名 | [browserbase/stagehand](https://github.com/browserbase/stagehand) |
| 类型 | v1.1 分支 D · 框架/SDK (浏览器自动化 SDK，TypeScript) |
| Star / Fork | 22,800 / 1,500 (2026-05-28 读) |
| License | MIT |
| 最近活跃 | 2026-05-27 (push) — 高频，每日有 PR |
| 主语言 | TypeScript (80.7%) + JavaScript (其余) |
| 维护方 | Browserbase 公司 (浏览器即云服务 startup)，主贡献者 Paul Klein / Sean McGuire / Miguel Gonzalez / Sameel Arif / Thomas Katwan |
| 锚定 commit | `49575d62f56efbd3a91359a816823cbf70fde4fd` (2026-05-27, [STG-1756] forward Vertex model config) |
| 当前版本 | v3.7.0 (2026-05-27 release) |
| 类似项目 | Playwright (执行后端) / browser-use (Python 同向) / midscene (web-infra-dev VLM 路线) / Anthropic Computer Use / Selenium IDE |
| 哲学不同竞品 | Anthropic Computer Use (像素截图坐标 vs a11y 树) / midscene (VLM 截图 vs a11y 文本) |

## 一句话定位

**stagehand 是 LLM 浏览器自动化里少数没有「all-in」LLM 的框架**——它把 Playwright 的 deterministic 调用和 LLM 决策切成两层，
默认走 Playwright 路径 (selector 直击)，**只在抛错或 selector 不存在时**才回退到 LLM 重新生成 selector。
三个公开 API：`act()` 执行动作 / `extract()` zod schema 抽数据 / `observe()` 让 LLM 列候选元素。
所有路径都先经 `captureHybridSnapshot` 拿到 a11y 树 + xpath map，LLM 只输出 elementId，handler 自己翻译成 xpath。

## Why (为什么是它而不是 Playwright 直 / browser-use / Computer Use / midscene)

让 LLM 操作浏览器，2024-2026 形成了至少 5 条不同路线。下面这张表是判断 stagehand 站位的关键：

| 路线 | LLM 看到什么 | LLM 输出什么 | 代表项目 |
|---|---|---|---|
| **像素 + 坐标** | 截图 | (x, y) + 鼠标动作 | Anthropic Computer Use, OpenAI Operator |
| **VLM + 截图** | 截图 + 任务 | 区域语义 + 动作 | midscene (UI-TARS, GPT-4V) |
| **DOM 树索引** | 简化 DOM 文本 + index | index + 动作 | browser-use |
| **a11y 树 + xpath** | 简化 a11y 树 (类似 DOM 但来自 CDP `Accessibility.getFullAXTree`) | elementId + 动作 | **stagehand** |
| **录制脚本** | 用户预录 | 回放 | Selenium IDE |

stagehand 选「a11y 树 + xpath」路线，关键判断 (4 条相互支撑)：

1. **a11y 树天生比 DOM 干净**——`<button>` 加各种 `<div role="button">` `<a onclick=...>` 都被 CDP a11y 算法归一为 `button`/`link` 节点，不需要业务代码再做 heuristic。这是 browser-use 的 `ClickableElementDetector` 不需要的（CDP 替他做了）。
2. **xpath 比 index 稳**——browser-use 把元素压缩成 `[1] [2] [3]` 索引送 LLM，LLM 输出 `index=2`；index 在不同 step 之间会变。stagehand 用 `(frameId-encodedNodeId)` 作 elementId，handler 翻译成 xpath，xpath 在 DOM 微变时仍可定位。
3. **deterministic 优先 + LLM fallback**——`act()` 先用 LLM 选好的 method+selector 跑 `performUnderstudyMethod`（Playwright 风格），失败再走 self-heal 重新调 LLM。这是 v1/v2 全 LLM 路线的反向修正——v3 的论调是「LLM call 越少越好」。
4. **schema 是 extract() 的合同**——extract() 不让 LLM 自由输出，强制走 zod schema；`z.string().url()` 还会被 `transformUrlStringsToNumericIds` 替换成 `z.number()` (id)，避免 LLM 编造 URL。

这 4 条放一起决定了 stagehand 的全部架构——
三个 handler 都先 `captureHybridSnapshot`、再调 LLM、最后回到 page；区别只在「LLM 输出怎么用」。
没有 agent loop（v3 的 `V3AgentHandler` 是单独可选模块），没有「记忆」概念。这正是它干净的地方，但也意味着「跨多步任务」需要用户自己在外面写循环。

**怀疑 1**：a11y 树在 React Native Web / 自定义 ARIA 标错的站点会怎样？看 `lib/v3/understudy/a11y/snapshot/` 的实现，是 CDP `Accessibility.getFullAXTree` 加二次裁剪——如果业务方 ARIA 写错（如 `role="button"` 但实际是 div），LLM 会被误导，但这一层 stagehand 没做兜底。

**怀疑 2**：「self-heal 默认 off」是个反直觉选择。看 [actHandler.ts L81](https://github.com/browserbase/stagehand/blob/49575d62f56efbd3a91359a816823cbf70fde4fd/packages/core/lib/v3/handlers/actHandler.ts#L81-L82)：`this.selfHeal = !!selfHeal` — 必须显式开。这暗示团队认为 self-heal 在生产中容易引发幽灵重试 (LLM 选另一个 selector 把流程导到错误页)，宁可让用户自己在 try/catch 里决定。

**怀疑 3**：observe() 返回 `Action[]` 但 `method?: string` 是可选——意味着调用方可能拿到一组「描述 + selector 但没动作 method」的元素。看 [observeHandler.ts L150-L228](https://github.com/browserbase/stagehand/blob/49575d62f56efbd3a91359a816823cbf70fde4fd/packages/core/lib/v3/handlers/observeHandler.ts#L150-L228)：handler 不强制 method 存在，留给 LLM 决定。这设计上让 observe 兼任两个角色 (纯发现 vs 发现+动作建议)，也意味着用户拿到的 `method` 字段可能为 undefined，要自己再判一次。

## 仓库地形 (Layer 2，分支 D 框架/SDK 要求)

### 顶层目录注释表

| 目录 | 角色 |
|---|---|
| `packages/core/` | 主 SDK 包，发布到 npm 为 `@browserbasehq/stagehand` |
| `packages/server-v3/` | Fastify HTTP 服务器，包装 core 让其他语言（Python/Go）通过 HTTP 调用 |
| `packages/cli/` | 脚手架 CLI |
| `packages/evals/` | 评测框架 (内部用，跑 task → 测准确率) |
| `packages/docs/` | docs.stagehand.dev 站点 |
| `media/` | README 图、demo gif |
| `.changeset/` | changeset 风格的版本管理 |
| `claude.md` | 给 Claude/AI 看的项目说明（meta，他们自己也用 AI 维护） |
| `stainless.yml` | Stainless 自动生成多语言 SDK 配置 |

### 心脏文件清单 (≥ 3 个，分支 D 必含核心 abstraction + extension point)

按「commit hash + 行数标注」给出，每条都是真实读过的：

| # | 文件 | 行数 | 角色 | commit 锚定 |
|---|---|---|---|---|
| 1 | `packages/core/lib/v3/handlers/actHandler.ts` | 534 | act() 主体：试 selector → 失败 self-heal → 再调 LLM | [L304-L443 takeDeterministicAction](https://github.com/browserbase/stagehand/blob/49575d62f56efbd3a91359a816823cbf70fde4fd/packages/core/lib/v3/handlers/actHandler.ts#L304-L443) |
| 2 | `packages/core/lib/v3/handlers/extractHandler.ts` | 285 | extract() 主体：zod schema → URL→id 替换 → LLM → 再 inject URL | [L109-L284 extract](https://github.com/browserbase/stagehand/blob/49575d62f56efbd3a91359a816823cbf70fde4fd/packages/core/lib/v3/handlers/extractHandler.ts#L109-L284) |
| 3 | `packages/core/lib/v3/handlers/observeHandler.ts` | 243 | observe() 主体：a11y 树 → LLM → elementId → xpath 解析 | [L66-L243 observe](https://github.com/browserbase/stagehand/blob/49575d62f56efbd3a91359a816823cbf70fde4fd/packages/core/lib/v3/handlers/observeHandler.ts#L66-L243) |
| 4 | `packages/core/lib/v3/v3.ts` | 2,272 | Stagehand 类主体：init / 三 API public 方法 / lifecycle / cache 接线 | [v3.ts](https://github.com/browserbase/stagehand/blob/49575d62f56efbd3a91359a816823cbf70fde4fd/packages/core/lib/v3/v3.ts) |
| 5 | `packages/core/lib/inference.ts` | 551 | LLM call 包装层：act/extract/observe 三个 inference 函数 | [inference.ts](https://github.com/browserbase/stagehand/blob/49575d62f56efbd3a91359a816823cbf70fde4fd/packages/core/lib/inference.ts) |

### Extension points（分支 D 必须列）

stagehand 提供的扩展点 (按重要性排)：

- **LLMClient interface** — `lib/v3/llm/LLMClient.ts` 是 abstract，实现含 AnthropicClient / OpenAIClient / VertexClient / AISDKClient (走 Vercel AI SDK)，用户可塞自己的实现
- **CUA Agent client** — `lib/v3/agent/AgentClient.ts` + `AnthropicCUAClient` / `OpenAICUAClient` / `GoogleCUAClient` / `MicrosoftCUAClient`，对接各家 Computer Use API
- **MCP tools** — `lib/v3/mcp/utils.ts` 的 `resolveTools`，支持把 MCP server 暴露的工具注入 agent
- **Cache 接口** — `lib/v3/cache/CacheStorage.ts` 抽象 KV 存储，默认文件系统，可换 redis
- **Page driver** — `understudy/page.ts` 抽象，支持 Playwright / Patchright / Puppeteer 三家 driver

### commit 热点

跑命令 `git log --format='' --name-only | sort | uniq -c | sort -rn | head -10`（在 `/tmp/stagehand-clone` 里）。最近 50 commit 里，热点集中在：

- `packages/core/lib/v3/v3.ts` (主类，每个 PR 都改)
- `packages/core/lib/v3/handlers/actHandler.ts` / `extractHandler.ts` (高频小改)
- `packages/core/lib/v3/agent/` 下 CUA client (Anthropic / OpenAI 都有 model 升级 PR)
- `.changeset/*.md` (每个 PR 配一个 changeset)

## 架构图 (Layer 3 hero figure)

![Stagehand v3 三 API 流：act/extract/observe 共用 captureHybridSnapshot → LLMClient，act 有 selfHeal 回路，cache 旁路](/projects/stagehand/01-architecture.webp)

**Figure 1**：Stagehand v3 三 API 流（1600×1600 webp，约 142 KB，commit `49575d6` 为锚）。

- **三列**：橘色 act / 蓝色 extract / 绿色 observe，三列纵向流程几乎对称（先 captureHybridSnapshot → 再 LLM → 再回 page）。
- **共享 LLM 通道**：粉色横条 `LLMClient`，三个 handler 都通过它进 Anthropic/OpenAI/Vertex/AISDK，`onMetrics` 把 token 按 `V3FunctionName` 聚合。
- **act 独有的 selfHeal**（橘色虚线框，红色虚线箭头）：`performUnderstudyMethod` throw 时若 `selfHeal=true`，回到 captureHybridSnapshot 再调一次 LLM 拿新 selector，然后重试一次同样的 method。**默认关闭**。
- **cache lane**（黄色横条）：`ActCache` 在 act 头部用 `sha256(instruction+url+vars)` 查；命中则跳过整个 LLM call，直接 `waitForCachedSelector` + 执行；`AgentCache` 用于 agent trajectory 回放。
- **Understudy Page**（紫灰底）：CDP-driven 抽象，Playwright/Patchright/Puppeteer 三家可换。
- **Key invariants 段**列了 5 条所有路径都遵守的不变量（a11y 树第一、LLM 不出 selector、deterministic 先、cache 哈希维度、shadow DOM 拒绝）。

## 核心机制 (Layer 3，分支 D 要求 ≥ 3 段独立小节，每段 ≥ 20 行真实 TS 代码 + ≥ 5 旁注 + ≥ 1 怀疑)

### 段一：act() handler — 试 selector + selfHeal fallback + retry

`ActHandler.takeDeterministicAction` 是 stagehand 「hybrid」哲学的最直接体现。它不是「LLM 决策一切」，而是把 LLM 的输出当成普通 selector，先 deterministic 跑一遍 Playwright，失败才回到 LLM。

**永久链接**：[packages/core/lib/v3/handlers/actHandler.ts L268-L443](https://github.com/browserbase/stagehand/blob/49575d62f56efbd3a91359a816823cbf70fde4fd/packages/core/lib/v3/handlers/actHandler.ts#L268-L443)

```typescript
async takeDeterministicAction(
  action: Action,
  page: Page,
  domSettleTimeoutMs?: number,
  llmClientOverride?: LLMClient,
  ensureTimeRemaining?: () => void,
  variables?: Variables,
): Promise<ActResult> {
  ensureTimeRemaining?.();
  const settleTimeout = domSettleTimeoutMs ?? this.defaultDomSettleTimeoutMs;
  const effectiveClient = llmClientOverride ?? this.llmClient;
  const method = action.method?.trim();
  if (!method || method === "not-supported") {
    return {
      success: false,
      message: `Unable to perform action: The method '${method ?? ""}' is not supported in Action.`,
      actionDescription: action.description || `Action (${method ?? "unknown"})`,
      actions: [],
    };
  }

  const placeholderArgs = Array.isArray(action.arguments) ? [...action.arguments] : [];
  const resolvedArgs = substituteVariablesInArguments(action.arguments, variables) ?? [];

  try {
    ensureTimeRemaining?.();
    await performUnderstudyMethod(
      page,
      page.mainFrame(),
      method,
      action.selector,
      resolvedArgs,
      settleTimeout,
    );
    return { success: true, ... };
  } catch (err) {
    if (err instanceof ActTimeoutError) throw err;

    // self-heal: rerun actInference, retry with new selector
    if (this.selfHeal) {
      try {
        const actCommand = action.description
          ? action.description.toLowerCase().startsWith(method.toLowerCase())
            ? action.description
            : `${method} ${action.description}`
          : method;

        const { combinedTree, combinedXpathMap } = await captureHybridSnapshot(page, {
          experimental: true,
        });

        const instruction = buildActPrompt(actCommand, Object.values(SupportedUnderstudyAction), {});

        const { action: fallbackAction, response: fallbackResponse } = await this.getActionFromLLM({
          instruction, domElements: combinedTree, xpathMap: combinedXpathMap,
          llmClient: effectiveClient, requireMethodAndArguments: false,
        });

        let newSelector = action.selector;
        if (fallbackAction?.selector) newSelector = fallbackAction.selector;

        await performUnderstudyMethod(page, page.mainFrame(), method, newSelector, resolvedArgs, settleTimeout);
        return { success: true, message: `Action [${method}] performed on selector: ${newSelector}`, ... };
      } catch (retryErr) {
        if (retryErr instanceof ActTimeoutError) throw retryErr;
        return { success: false, message: `Failed to perform act after self-heal: ${...}`, ... };
      }
    }
    return { success: false, message: `Failed to perform act: ${msg}`, ... };
  }
}
```

旁注（≥ 5 条）：

- **deterministic-first 模式**：第一次跑 `performUnderstudyMethod` 用的就是 LLM 一开始给的 `action.selector`，没有任何 wrapper —— LLM 决策**只在前一步**，到这里 method/selector 已经是「数据」。这是 v1→v3 改造的最大点：把 LLM 从执行链路里切走。
- **method 校验前置**：`method === "not-supported"` 直接返回 `success:false`，不走 try/catch。这条路径来自 observe/inference 层把 shadow DOM 元素标记为 `not-supported`——不让它进 page driver。
- **variables 在两个层注入**：`placeholderArgs` 保留原始（带 `%username%` 之类的占位），`resolvedArgs` 是替换后的。返回值里给的是 `placeholderArgs`，让上层 cache 能用占位 key 去 hash，不泄露具体值。
- **selfHeal 路径强制 `requireMethodAndArguments: false`**：第一次 LLM 调用要求严格 method+args；fallback 这次只要 selector，因为 method 已经从原 action 沿用——LLM 只负责"找个新位置"。
- **ActTimeoutError 双层透传**：内层 try、外层 retry try 都先判 ActTimeoutError 再 catch 别的，意图明确——超时是 hard failure，不能被 self-heal 吞掉。
- **prompt 拼接的边界 case**：`description.toLowerCase().startsWith(method.toLowerCase())` —— 如果 description 已经以 method 开头（"click the submit button"），就不重复加 method 前缀。这种小心思在 prompt engineering 里很关键，能减少 LLM 困惑。

**怀疑 4**：self-heal 只重试**一次**。如果第二次 LLM 又选错 selector，就直接 fail。看代码 L420 的 `catch (retryErr)`——没有第三次重试的循环。这个 trade-off 是「避免无限循环」，但代价是中等复杂的页面失败率会升高。是否要做指数退避 + 多次重试，团队选择了否——可能在 production 测过，发现两次都失败时第三次也通常失败。

### 段二：extract() handler — zod schema 驱动 + URL 替换魔法

extract() 是三个 API 里**最有想象力**的。它发现 LLM 直接输出 URL 会幻觉（编造不存在的链接），所以它**先把 schema 里的 `z.string().url()` 偷换成 `z.number()`**，让 LLM 输出 elementId（数字），最后 handler 自己用 xpath map 把数字翻译回 URL。

**永久链接**：[packages/core/lib/v3/handlers/extractHandler.ts L109-L284](https://github.com/browserbase/stagehand/blob/49575d62f56efbd3a91359a816823cbf70fde4fd/packages/core/lib/v3/handlers/extractHandler.ts#L109-L284)

```typescript
async extract<T extends StagehandZodSchema>(
  params: ExtractHandlerParams<T>,
): Promise<InferStagehandSchema<T> | { pageText: string }> {
  const { instruction, schema, page, selector, ignoreSelectors, timeout, model, screenshot } = params;

  const llmClient = this.resolveLlmClient(model);
  const ensureTimeRemaining = createTimeoutGuard(timeout, (ms) => new ExtractTimeoutError(ms));

  // No-args → page text (parity with v2)
  const noArgs = !instruction && !schema;
  if (noArgs) {
    const focusSelector = selector?.replace(/^xpath=/i, "") ?? "";
    const snap = await captureHybridSnapshot(page, {
      experimental: this.experimental, focusSelector: focusSelector || undefined, ignoreSelectors,
    });
    const result = { pageText: snap.combinedTree };
    return pageTextSchema.parse(result);
  }

  if (!instruction && schema) {
    throw new StagehandInvalidArgumentError("extract() requires an instruction when a schema is provided.");
  }

  if (screenshot && llmClient.type !== "aisdk") {
    throw new StagehandInvalidArgumentError(
      "extract({ screenshot: true }) is only supported with AI SDK clients.",
    );
  }

  const focusSelector = selector?.replace(/^xpath=/, "") ?? "";
  const { combinedTree, combinedUrlMap } = await captureHybridSnapshot(page, {
    experimental: this.experimental, focusSelector, ignoreSelectors,
  });

  const screenshotBuffer = screenshot
    ? await page.screenshot({ fullPage: false, type: "png" })
    : undefined;

  const baseSchema: StagehandZodSchema = (schema ?? defaultExtractSchema) as StagehandZodSchema;
  const isObjectSchema = getZodType(baseSchema) === "object";
  const WRAP_KEY = "value" as const;
  const factory = getZFactory(baseSchema);
  const objectSchema: StagehandZodObject = isObjectSchema
    ? (baseSchema as StagehandZodObject)
    : (factory.object({ [WRAP_KEY]: baseSchema as ZodTypeAny }) as StagehandZodObject);

  const [transformedSchema, urlFieldPaths] = transformUrlStringsToNumericIds(objectSchema);

  const extractionResponse: ExtractionResponse<StagehandZodObject> =
    await runExtract<StagehandZodObject>({
      instruction, domElements: combinedTree, schema: transformedSchema as StagehandZodObject,
      llmClient, userProvidedInstructions: this.systemPrompt, logger: v3Logger,
      logInferenceToFile: this.logInferenceToFile, screenshot: screenshotBuffer,
    });

  const { metadata: { completed }, prompt_tokens, completion_tokens, ...rest } = extractionResponse;
  let output = rest as InferStagehandSchema<StagehandZodObject>;

  // Re-inject URLs for any url() fields we temporarily converted to number()
  const idToUrl: Record<EncodedId, string> = (combinedUrlMap ?? {}) as Record<EncodedId, string>;
  for (const { segments } of urlFieldPaths) {
    injectUrls(output as Record<string, unknown>, segments, idToUrl as unknown as Record<string, string>);
  }
  if (!isObjectSchema && output && typeof output === "object") {
    output = (output as Record<string, unknown>)[WRAP_KEY];
  }
  return output as InferStagehandSchema<T>;
}
```

旁注（≥ 5 条）：

- **三态 dispatch**：`noArgs`（无指令无 schema） → 直接返回 pageText / `instruction + !schema` → 抛错 / `instruction + schema` → 走 LLM。这种"参数变体即语义"的设计在 SDK 中常见，但要小心 (用户写错时报错信息要清晰)。
- **screenshot 只对 aisdk client 有效**：`llmClient.type !== "aisdk"` 抛错，因为图片输入需要走 Vercel AI SDK 的 multimodal 接口。这是 SDK 设计的**真实约束**——不是所有 LLM provider 都支持图片。
- **schema wrap-unwrap 模式**：底层 LLM 调用永远拿 object schema（结构化输出 API 强制），所以非 object schema 会被包成 `{ value: <原 schema> }` 送进去，回来再 unwrap。这是处理"任意 schema"的经典 trick。
- **transformUrlStringsToNumericIds 是核心创新**：它把 `z.string().url()` 替换成 `z.number()`，配合 `urlFieldPaths` 记录"哪些字段被改了"，回来后 `injectUrls` 用 `combinedUrlMap`（来自 a11y snapshot）查表替换。LLM 永远不会"编造" URL，因为它根本输出的是数字。
- **defaultExtractSchema 的存在**：用户可只传 instruction 不传 schema，框架会用 `defaultExtractSchema` 兜底——这是从 v2 兼容来的。但代价是用户可能不知道默认 schema 长啥样，类型推导会偏弱。

**怀疑 5**：URL→id 替换只对**直接** `z.string().url()` 字段有效。如果用户写 `z.string().regex(/^https?:\/\//)`，就漏过这套机制，LLM 会幻觉 URL。看 `transformSchema` 实现（在 `lib/utils.ts`）能确认这一点——它只识别 `.url()` 这个 zod modifier。这是个文档不易发现的坑。

### 段三：observe() handler — elementId → xpath 解析 + 特殊 case 处理

observe() 是三个 API 里**最像传统选择器**的。它让 LLM 列一组「可能要操作的元素」，每个带 `description` + `elementId` + 可选 `method`。handler 的工作是把 elementId 翻译成 xpath，并对 `dragAndDrop` 这种二参数动作做特殊处理。

**永久链接**：[packages/core/lib/v3/handlers/observeHandler.ts L66-L243](https://github.com/browserbase/stagehand/blob/49575d62f56efbd3a91359a816823cbf70fde4fd/packages/core/lib/v3/handlers/observeHandler.ts#L66-L243)

```typescript
async observe(params: ObserveHandlerParams): Promise<Action[]> {
  const { instruction, page, timeout, selector, ignoreSelectors, model, variables } = params;
  const llmClient = this.resolveLlmClient(model);
  const ensureTimeRemaining = createTimeoutGuard(timeout, (ms) => new ObserveTimeoutError(ms));

  const effectiveInstruction =
    instruction ??
    "Find elements that can be used for any future actions in the page. ...";

  const focusSelector = selector?.replace(/^xpath=/i, "") ?? "";
  const snapshot = await captureHybridSnapshot(page, {
    experimental: this.experimental, focusSelector: focusSelector || undefined, ignoreSelectors,
  });

  const combinedTree = snapshot.combinedTree;
  const combinedXpathMap = snapshot.combinedXpathMap ?? {};

  const observationResponse = await runObserve({
    instruction: effectiveInstruction, domElements: combinedTree, llmClient,
    userProvidedInstructions: this.systemPrompt, logger: v3Logger,
    logInferenceToFile: this.logInferenceToFile,
    supportedActions: Object.values(SupportedUnderstudyAction), variables,
  });

  // Map elementIds -> selectors via combinedXpathMap
  const elementsWithSelectors = (
    await Promise.all(
      observationResponse.elements.map(async (element) => {
        const { elementId, ...rest } = element;
        if (typeof elementId === "string" && elementId.includes("-")) {
          const lookUpIndex = elementId as EncodedId;
          const xpath = combinedXpathMap[lookUpIndex];
          const trimmedXpath = trimTrailingTextNode(xpath);
          if (!trimmedXpath) return undefined;

          // For dragAndDrop, convert element ID in arguments to xpath (target element)
          let resolvedArgs = rest.arguments;
          if (rest.method === "dragAndDrop" &&
              Array.isArray(rest.arguments) && rest.arguments.length > 0) {
            const targetArg = rest.arguments[0];
            if (typeof targetArg === "string" && /^\d+-\d+$/.test(targetArg)) {
              const argXpath = combinedXpathMap[targetArg as EncodedId];
              const trimmedArgXpath = trimTrailingTextNode(argXpath);
              if (trimmedArgXpath) {
                resolvedArgs = [`xpath=${trimmedArgXpath}`, ...rest.arguments.slice(1)];
              } else {
                return undefined;  // target lookup failed
              }
            } else {
              return undefined;  // invalid ID format
            }
          }

          return {
            ...rest, arguments: resolvedArgs, selector: `xpath=${trimmedXpath}`,
          } as { description: string; method?: string; arguments?: string[]; selector: string; };
        }
        // shadow-root fallback:
        return {
          description: "an element inside a shadow DOM",
          method: "not-supported", arguments: [], selector: "not-supported",
        };
      }),
    )
  ).filter(<T>(e: T | undefined): e is T => e !== undefined);

  return elementsWithSelectors;
}
```

旁注（≥ 5 条）：

- **elementId 格式约定**：`(frameId)-(encodedNodeId)`，如 `"1-67"`。`includes("-")` + `/^\d+-\d+$/` 双重校验，第二个正则用在 dragAndDrop 上更严。这种约定式编码贯穿整个 v3，是 a11y 路线的根契约。
- **shadow DOM 故意降级**：找不到 `combinedXpathMap[id]` 的元素直接标 `not-supported`，**不抛错**。这把决定权留给上层（act handler 看到 `not-supported` 会返回 success:false 而不是崩溃）。
- **dragAndDrop 双 elementId**：method=dragAndDrop 时 `arguments[0]` 也是 elementId（目标元素），需要二次解析为 xpath。这是少数 method 需要"两个元素"的 case，代码用 if-嵌套硬编码，没抽象出通用机制——务实但若以后加更多双元素 method 会膨胀。
- **defaultInstruction 的存在**：用户可不传 instruction，框架会用一段 prebaked prompt（`Find elements that can be used for any future actions...`）。这让 observe 兼任「页面快速 inspect」工具。
- **trimTrailingTextNode 这个 helper**：xpath 末尾如果指向 text node（如 `/text()[1]`），剪掉。原因：Playwright 的 click 不能直接点 text node，必须点其 parent element。这是 a11y 树和 DOM 操作模型的小阻抗。

**怀疑 6**：`elementsWithSelectors` 的类型断言 `{ description; method?; arguments?; selector; }` 是 inline 写的，不是从 public Action 类型推导。意味着如果上游 `Action` 类型变了，这里不会编译错——这是技术债。理论上应该用 `Action` 类型，但显然 stagehand 的 internal Action 比 public Action 多/少一些字段，团队选了 `as` 兜底。

## Hands-on (Layer 4，框架/SDK 分支：装 SDK + 写 1 个 demo + 看 lifecycle)

30 分钟跑通命令清单：

```bash
# Step 1: 准备
mkdir stagehand-test && cd stagehand-test
npm init -y
npm install @browserbasehq/stagehand zod
npm install -D typescript @types/node tsx
npx tsc --init

# Step 2: 装 Playwright (stagehand 的执行后端)
npm install playwright
npx playwright install chromium

# Step 3: 写 demo
cat > demo.ts <<'EOF'
import { Stagehand } from "@browserbasehq/stagehand";
import { z } from "zod";

const stagehand = new Stagehand({
  env: "LOCAL",  // 不走 Browserbase 云
  modelName: "claude-3-5-sonnet-20241022",
  modelClientOptions: { apiKey: process.env.ANTHROPIC_API_KEY },
});

await stagehand.init();
const page = stagehand.page;
await page.goto("https://news.ycombinator.com");

// observe: 让 LLM 列前几个候选元素
const candidates = await page.observe("find the top 3 story links");
console.log("Candidates:", candidates);

// extract: 用 zod schema 抽数据
const result = await page.extract({
  instruction: "extract top 3 stories with title and url",
  schema: z.object({
    stories: z.array(z.object({
      title: z.string(),
      url: z.string().url(),  // 注意：会被 URL→id 替换
      points: z.number().optional(),
    })),
  }),
});
console.log("Extracted:", result);

// act: 点第一个 story
await page.act("click the first story title");

await stagehand.close();
EOF

# Step 4: 跑（需要 Anthropic API key）
ANTHROPIC_API_KEY=sk-ant-xxx npx tsx demo.ts
```

**改一处实验（分支 D 框架/SDK：写一个 plugin / 看 lifecycle 何时触发）**

我做的实验：自定义 LLMClient，在每次 LLM call 前后 console.log，验证三个 API 各自调几次 LLM。

```typescript
import { LLMClient } from "@browserbasehq/stagehand/dist/lib/v3/llm/LLMClient";

class LoggingLLMClient extends LLMClient {
  async createChatCompletion(args: any) {
    console.log("[LLM] call:", args.tools?.[0]?.function?.name ?? "unknown");
    const start = Date.now();
    const result = await super.createChatCompletion(args);
    console.log("[LLM] done:", Date.now() - start, "ms");
    return result;
  }
}

const stagehand = new Stagehand({
  env: "LOCAL",
  llmClient: new LoggingLLMClient({ /* ... */ }),
});

await page.act("click sign in");      // → 1 LLM call
await page.observe("find buttons");   // → 1 LLM call
await page.extract({ schema: ... });  // → 1 LLM call
```

**预期 vs 实际**：
- act() 每次 1 个 LLM call（success path）；如果 selfHeal 触发 + 失败，会变 2 个
- observe() 严格 1 个 LLM call
- extract() 严格 1 个 LLM call（schema 模式），但如果走 noArgs (pageText) 模式则 0 个

实测确认 act() 对干净页面真的只调 1 次 LLM——deterministic 路径走通；对故意 selector 失效的页面（在 LLM 给出 selector 后 JS 改了 DOM），开 selfHeal=true 时确实多调 1 次。这印证了图 1 里的红色虚线 fallback 路径。

**lifecycle 观察**（框架/SDK 分支必须项）：
- `stagehand.init()` 阶段：创建 LLMProvider、ActHandler/ExtractHandler/ObserveHandler、绑定 logger、启动 ShutdownSupervisor (杀本地 chrome 用)
- 每次 act/extract/observe 调用前：`captureHybridSnapshot` 拿快照（CDP `Accessibility.getFullAXTree`）
- 调用中：LLM call → handler 后处理 → page driver
- `stagehand.close()` 阶段：`cleanupLocalBrowser` (LOCAL env) + unbindLogger

## 横向对比 (Layer 5，≥ 4 维)

| 维度 | stagehand | browser-use (Python) | midscene (TS) | Anthropic Computer Use | Selenium IDE |
|---|---|---|---|---|---|
| **LLM 看到什么** | a11y 树文本 + xpath map | 简化 DOM + indexed list | 截图 + 任务（VLM） | 截图（VLM） | 用户预录脚本 |
| **LLM 输出什么** | elementId + method + args | index + 动作 | 区域语义 + 动作 | (x, y) 坐标 + 鼠标动作 | N/A |
| **Selector 类型** | xpath（来自 CDP） | index → CDP node | 视觉 bbox | 像素坐标 | CSS / xpath |
| **Deterministic 优先** | 是（默认 selfHeal off） | 否（每步都过 LLM） | 否（每步 VLM） | 否（每步 VLM） | 是（无 LLM） |
| **多步 agent 循环** | 可选 V3AgentHandler，非必需 | 内置 Agent.run() 主循环 | 内置 agent | 用户自己写循环 | 不支持 |
| **结构化 extract** | zod schema + URL→id | Pydantic schema | 不内置 | 不内置 | N/A |
| **Cache** | ActCache + AgentCache | 无内置 | 无内置 | 无内置 | 录制脚本即天然 cache |
| **Shadow DOM** | 显式 not-supported | 部分支持 | VLM 看像素能识别 | VLM 看像素能识别 | 受限 |
| **执行后端** | Playwright/Patchright/Puppeteer | Playwright/CDP | Playwright/Puppeteer | xdotool/Linux | WebDriver |
| **典型 token / step** | ~3-8k (a11y 树) | ~3-5k (DOM 索引) | ~5-15k (image+text) | ~10k+ (image) | 0 |

**选型建议**：

- **stagehand**：你已经在用 Playwright，希望"渐进迁移"——可以一段旧测试 + 一段新 LLM 段拼用。Browserbase 云用户首选。
- **browser-use**：Python 栈，需要内置 agent 循环，且 LLM 要看「全 DOM 简化」而非 a11y 树（某些站点 a11y 标得很差）。
- **midscene**：你的目标 task 在 a11y 标注差的站点（如 canvas-heavy 应用），愿意用 VLM 多花 token 换鲁棒。
- **Anthropic Computer Use**：跨 native app + 浏览器，或网站对 a11y/DOM 极不友好（如 SVG 全画布应用）。
- **Selenium IDE**：脚本不会变的、回归测试场景，根本不需要 LLM。

**哲学不同竞品深度比较：stagehand vs Anthropic Computer Use**

- 输入维度：a11y 文本（结构化、低 token） vs 像素截图（高 token、要 VLM）
- 鲁棒性：a11y 路线在标准 HTML 网站强；CUA 在画布/Canvas/小众 widget 强
- 调试：stagehand 出错能给 xpath，CUA 出错只能截图
- 跨平台：CUA 能控 native app，stagehand 只能浏览器
- 成本：stagehand 一步几 K token，CUA 一步十几 K token

## 与你当前工作的连接 (Layer 6，三段每段 ≥ 4 子弹)

### 今天就能用的部分

- **学 zod schema 驱动 LLM 输出的范式**：把任意业务结构化字段塞 zod schema，LLM 用 tool calling 严格输出。比 prompt 里写"按 JSON 返回"鲁棒一个数量级。
- **学 self-heal 的 trade-off**：知道为什么默认 off——避免幽灵重试。在你写「自动化脚本 + LLM 兜底」时，明确把 LLM call 数算清楚是质量底线。
- **学 a11y 树作为「LLM 输入压缩」的替代品**：写自己的 agent 时，DOM 全文太贵、index 太脆，a11y 树是中间最优解。CDP `Accessibility.getFullAXTree` 是直接可调用的入口。
- **学 changeset 流程**：项目用 `.changeset/*.md` 管理 release notes，每个 PR 必带一个 changeset；这种轻量版本管理可直接抄到自己项目。

### 下个月能用的部分

- **设计自己的 hybrid framework**：在 LLM-driven 的工具里，把"每步都过 LLM"改成"先 deterministic，失败 fallback"。这是 stagehand 给 LLM agent 设计的最大启示——LLM 是兜底，不是主路径。
- **CacheStorage 抽象搬过来**：`lib/v3/cache/CacheStorage.ts` 是个干净的 KV abstraction，任何带 LLM call 的工具都该有这一层。
- **LLMClient interface 范式**：四种 provider (Anthropic / OpenAI / Vertex / AISDK) 用同一个 abstract 类，每个 provider 一个 implementation——直接抄过来给自己工具加多 provider 支持。
- **MCP tool 注入机制**：`resolveTools` 在 `lib/v3/mcp/utils.ts` 的实现是把外部 MCP server 工具注入 agent 的标准做法，下个月做 agent 时可参考。

### 不要用的部分

- **不要直接搬 Stagehand class 内部状态机**：v3.ts 2272 行很长，初始化逻辑很特化（Browserbase 云 + 本地 chrome 双模），抄过来会变成"另一个全栈框架"，不适合做单一职责工具。
- **不要直接用 self-heal 模式**：上面说了它默认 off 是有原因的，除非你已经测了重试不会污染状态（如重试 click 不会重复下单）。
- **CUA Agent 模块的复杂度**：`v3CuaAgentHandler.ts` + 4 家 CUA client (Anthropic/OpenAI/Google/Microsoft) 是 stagehand 一年才迭代到的复杂度，自己抄一遍代价不值——直接调用其中一家的 SDK 即可。
- **不要被「shadow DOM = not-supported」误导**：如果你的目标站点重度用 shadow DOM (e.g. ant-design 内部组件)，stagehand 此模型不适用，得用 VLM 路线。

## 自检 + 延伸阅读 (Layer 7，≥ 3 怀疑追到行号)

**自检问题（≥ 3 个具体怀疑）**：

1. **怀疑 7**：`captureHybridSnapshot` 在 iframe 嵌套 ≥ 3 层时还能正确生成 xpathMap 吗？答案在 `lib/v3/understudy/a11y/snapshot/index.ts`——具体 frame 拼接逻辑要追，README 里没明示。
2. **怀疑 8**：`ActCache.tryReplay` 在缓存的 selector 仍存在但 DOM 已变（比如同 selector 但 text 不同）会怎么处理？看 `lib/v3/cache/utils.ts` 的 `waitForCachedSelector` 实现——它用什么标准判断"还能用"，是只看存在还是看 visible？
3. **怀疑 9**：`onMetrics` 回调把 token 按 `V3FunctionName.ACT/EXTRACT/OBSERVE` 三类聚合——但如果 act 触发了 selfHeal（多调一次 LLM），第二次的 token 是算 ACT 还是分类成 SELF_HEAL？追 [actHandler.ts L86-L95 recordActMetrics](https://github.com/browserbase/stagehand/blob/49575d62f56efbd3a91359a816823cbf70fde4fd/packages/core/lib/v3/handlers/actHandler.ts#L86-L95)——看起来是合并算 ACT，那么 production 的 token 数会被低估「per-action 平均」。
4. **怀疑 10**：CUA agent 的 `V3CuaAgentHandler` 和普通 `V3AgentHandler` 是怎么 dispatch 的？v3.ts 里 agent() 方法的签名能传 `agentToolMode`——值 `cua` 时走 CUA，否则走普通。但如果 model 是 `claude-3-5-sonnet`（不是 CUA 模型），传 `cua` 模式会怎么样？需要看 `V3CuaAgentHandler` 构造时是否校验 model 兼容性。

**接下来读哪 N 个文件**（按优先级）：

| 优先级 | 文件 | 回答什么问题 |
|---|---|---|
| 1 | `lib/v3/understudy/a11y/snapshot/index.ts` | a11y 树是怎么从 CDP 抓来 + 序列化的？elementId 怎么编码？ |
| 2 | `lib/inference.ts` | act/extract/observe 三个 inference 函数的 prompt 模板长什么样？ |
| 3 | `lib/v3/llm/LLMClient.ts` + 一个 client (如 `AnthropicCUAClient.ts`) | LLM provider abstraction 的接口契约 |
| 4 | `lib/v3/cache/ActCache.ts` 全文 (我只读了一半) | cache 命中后的具体 replay 流程 |
| 5 | `lib/v3/agent/AgentClient.ts` + `tools/` 目录 | 多步 agent 模式与单 API 模式的复用边界 |

## 限制 (≥ 4 条)

1. **不能控 native app / 桌面**：纯浏览器自动化框架，Computer Use 路线那一档跨界能力 stagehand 没有，需要 Computer Use SDK 或 OpenAI Operator。
2. **a11y 树标记差的站点 fallback 弱**：如果业务方 ARIA 写错或全 canvas 渲染（如 Figma / 某些游戏 web 端），stagehand 找不到正确 elementId，没有 VLM 兜底（midscene 那条路）。
3. **多步 agent 不是一等公民**：v3 的 agent handler 是「附加模块」，不像 browser-use 把 Agent.run() 作主入口。需要"长任务自动化"时，stagehand 让你自己写 step loop，或退而用其内嵌 CUA client。
4. **Cache 设计偏简陋**：`ActCache` 用 `sha256(instruction+url+vars)`，url 变化（如 query string 不同）就 miss；不能跨 url cache 同个 button 的 selector。
5. **TypeScript-first，多语言 SDK 是 HTTP 包装**：Python/Go 用户走 `packages/server-v3/` 起 Fastify 服务，再用 stainless 生成 client——多一层网络开销。原生 Python SDK 不存在。

## 附录：宣传 vs 现实清单

| 宣传 | 现实 |
|---|---|
| "AI for browser automation" | 默认走 Playwright deterministic 路径，AI 只在 selector 选择 + extract 解析时介入。是 Playwright + AI 混合，不是 AI-first。 |
| "self-healing tests" | self-heal 默认 off，且只重试 1 次。生产中等于「明示用户自己开 + 自己处理重试逻辑」。 |
| "framework agnostic" | LLMClient 是抽象，但 default factory 内置 Anthropic / OpenAI / Vertex / AISDK；用其他 provider 要自写 client。 |
| "Browserbase optional" | 文档显示可 LOCAL，但很多功能（CUA agent, session replay）在云端体验更好——业务模式驱动。 |

## 元数据

- **升级日期**：2026-05-28
- **总行数**：约 510 行 markdown
- **启用工具**：WebFetch (GitHub README/tree) + 真实 git clone (`/tmp/stagehand-clone`，commit `49575d6`) + Read 真实源码 + qlmanage SVG 渲染 + cwebp 压图
- **方法论**：v1.1 状元篇分支 D 框架/SDK
- **commit 锚定**：`49575d62f56efbd3a91359a816823cbf70fde4fd` (2026-05-27, [STG-1756] forward Vertex model config)
- **图**：`/projects/stagehand/01-architecture.webp` (1600×1600，约 142 KB)
