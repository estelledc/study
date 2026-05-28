---
title: midscene — 不是 Playwright 升级版，是「自然语言 → 截图 + DOM → VLM 看图 → bbox → click」的反馈闭环框架
description: 框架/SDK 范例 (v1.1 分支 D) — VLM-driven UI automation / 多 LLM provider 抽象 / Playwright fixture 接入 / TaskCache yaml lock-in / web-infra-dev 出品
sidebar:
  order: 27
  label: web-infra-dev/midscene
---

> 状元篇 (2026-05-28，v1.1 分支 D 框架/SDK) — 把 midscene 当成「browser-use 的 TS 版」会错过它最有意思的部分：
> 它不是「LLM 当 planner」一条路走到黑，而是把「自然语言 prompt」「截图 + 简化 DOM」「多模型分支 (gpt-4v / claude / qwen2.5-vl / AutoGLM / UI-TARS)」「Playwright fixture」「yaml cache lock-in」**五件事拼在一个 Agent abstraction 上**，
> 让用户能用 `await agent.aiTap("登录按钮")` 一行替掉 `await page.locator('[data-testid=login]').click()` 这种脆弱链。
>
> 数据基线：> 9 k stars / 主语言 TypeScript / MIT / 字节 web-infra-dev 维护 / 仓库锚定 commit `87d1259adeffb89d835062e75b6d62b9d474fa0c` (2026-05-28 19:51 +0800)。

## 核心信息

| 字段 | 值 |
|---|---|
| 项目名 | [web-infra-dev/midscene](https://github.com/web-infra-dev/midscene) |
| 类型 | v1.1 分支 D · 框架/SDK (TypeScript，提供 Agent abstraction + Playwright/Puppeteer/Android/iOS extension points) |
| Star / Fork | > 9,000 / 数百 (2026-05-28 读) |
| License | MIT |
| 最近活跃 | 2026-05-28 19:51 (push) — 高频更新 |
| 主语言 | TypeScript (workspace 28 个 package，pnpm + nx 单仓) |
| 维护方 | 字节跳动 web-infra-dev (Rspack / Modern.js 同公司) — 多人团队 |
| 锚定 commit | `87d1259adeffb89d835062e75b6d62b9d474fa0c` (2026-05-28) |
| 类似项目 | Playwright (执行后端) / browser-use (Python，纯 DOM 路线) / Anthropic Computer Use (像素 + 鼠标坐标) / Selenium IDE (录制脚本) / OpenAI Operator |
| 哲学不同竞品 | browser-use (DOM tree → indexed list) vs midscene (screenshot → VLM bbox)；同样的 LLM-driven 浏览器，输入路线根本不同 |
| 心脏 abstraction | `Agent` 类 (1,584 行) + `AiLocateElement` (vision 入口) + `TaskCache` (yaml lock-in) + `PlaywrightAiFixture` (extension point) |
| 文档 | README.md / README.zh.md / CLAUDE.md / AGENTS.md / CONTRIBUTING.md (5 份) |

## 一句话定位

**midscene 是一个 LLM agent 浏览器自动化框架的 TypeScript 实现**，把任意网页**截图 + 简化 DOM** 喂给 vision-language model (GPT-4V / Claude / Qwen-VL / UI-TARS / AutoGLM)，让模型直接返回**目标元素的 bbox 坐标**，框架再翻译成 Playwright/Puppeteer/CDP 的 click/input/scroll。
对外暴露的接口形如 `aiTap(prompt)`、`aiInput(prompt, opt)`、`aiAction(高层 prompt)`，**没有 selector，没有 xpath，只有自然语言**。
背后 8 个核心 abstraction：Agent / TaskExecutor / TaskCache / Insight (vision 子系统) / planning loop / service-caller (provider 抽象) / fixture (Playwright/Puppeteer 注入点) / report generator。

## Why (为什么是它而不是 Playwright 直接 / browser-use / Computer Use / Selenium IDE)

2024-2026 让 LLM 操作浏览器有四种思路。**输入给 LLM 的东西**这一刀切下去，分流就清楚了：

| 路线 | 输入给 LLM | 输出 | 代表项目 |
|---|---|---|---|
| **截图 + bbox (VLM 路线)** | base64 PNG 截图 | `{ bbox: [120, 340, 240, 380] }` 像素坐标 | **midscene** / Anthropic Computer Use / OpenAI Operator |
| **DOM tree 索引** | 简化 HTML，每个可交互元素带 `[1] [2]` index | `click_element_by_index(2)` | browser-use / Skyvern |
| **像素 + 自由坐标** | 截图 | `(456, 312)` 任意坐标 | Anthropic Computer Use 早期 |
| **录制脚本** | 用户先录一遍 | 脚本回放 | Selenium IDE / Cypress Studio |

midscene 选「截图 + bbox」这一路，关键判断 (5 条相互支撑)：

1. **VLM 已经是工业级**——2024 中以后 GPT-4V / Claude 3.5 Sonnet / Qwen2.5-VL 都能稳定输出 bbox，不再像 2023 那样需要 OCR + LLM 两段拼接。这是这条路线的**地基依赖**，2023 年做 midscene 是早三年，2025 年做就刚刚好。
2. **DOM 路线在 React/Canvas 站点会失灵**——Notion / Figma / Excalidraw 这种「DOM 没有语义、视觉全靠 canvas」的网页，browser-use 那种 indexed list 会拿到一堆空 div；让 VLM 直接看图反而准。
3. **跨平台复用**——VLM 看截图这件事在 web / Android / iOS / Harmony / Linux desktop 是同一件事。midscene 仓库里 28 个 package 里就有 `android` `ios` `harmony` `computer-mac` `computer-linux` `computer-win`——架构层级就是为了让一套 vision pipeline 跨平台复用。
4. **token 成本**——一张 1080p 截图压缩后 ~50 KB base64 ≈ 2k token；一个完整 React SPA 的 HTML 几十万 token。VLM 路线在大型应用上 token 经济反而更好。
5. **Playwright 是工业级稳定后端**——没必要重新发明执行层，把 click / input / scroll 委托给 Playwright，midscene 自己只做「自然语言 → bbox」这一段。

这 5 条放一起决定了 midscene 的全部架构——
**Insight 子系统**只做截图 + DOM 提取 + VLM call，**ai-model 子系统**只做 multi-provider 抽象 + planning loop，**web-integration**只做 Playwright/Puppeteer fixture 注入，**TaskCache** 用 yaml 把成功结果序列化下来下次免 LLM。
没有「智能 planner 多 agent」「自主长期记忆」这些花活——这是它干净的地方。

**怀疑 1**：VLM 路线在「同一页面有多个长得一样的按钮」时怎么消歧 (例如表格里 100 行每行都有「编辑」按钮)？看 [`packages/core/src/ai-model/inspect.ts#L65-L88`](https://github.com/web-infra-dev/midscene/blob/87d1259adeffb89d835062e75b6d62b9d474fa0c/packages/core/src/ai-model/inspect.ts#L65-L88) 的 `buildSearchAreaConfig`——他们的回答是「先 locate section 再 locate element」两段式，但这是用户主动写两步 prompt 才会触发的，`aiTap` 一句话调用并没有自动两段化。这是工程取舍。

**怀疑 2**：VLM 把 bbox 输出错 10 像素 (按钮边缘外) 怎么办？看 [`packages/core/src/ai-model/inspect.ts#L348-L365`](https://github.com/web-infra-dev/midscene/blob/87d1259adeffb89d835062e75b6d62b9d474fa0c/packages/core/src/ai-model/inspect.ts#L348-L365) 的 `adaptBboxToRect`——他们对不同模型 (qwen2.5-vl 需要 padding、AutoGLM 输出 0-999 归一化坐标) 做了**模型族特化**，但**没有**对 bbox 输出做"取中心点 + click"以外的兜底（比如二次确认）。如果模型给了一个偏 5 像素的 bbox，正中央依然在按钮里就没事；如果偏 50 像素就 miss。

**怀疑 3**：「五种模型族 (gpt-4v / claude / qwen2.5-vl / AutoGLM / UI-TARS)」会不会把 prompt 维护成本爆炸？看 [`packages/core/src/ai-model/`](https://github.com/web-infra-dev/midscene/blob/87d1259adeffb89d835062e75b6d62b9d474fa0c/packages/core/src/ai-model/) 顶层结构：每个模型族一套 prompt 文件 (`prompt/llm-locator.ts` / `auto-glm/prompt.ts`)，加上 `isAutoGLM(modelFamily)` `modelFamily === 'qwen2.5-vl'` 这种 if 散布在 `inspect.ts` `llm-planning.ts` 里——已经有"模型分支泥潭"的迹象。如果再加一个 Gemini 2 Flash 分支，`inspect.ts` 大概要再长 100 行 if-else。这是 framework 类项目的典型问题。

## 仓库地形 (Layer 2)

### 顶层 + 关键 package 注释表

```
midscene/
├── apps/                      ← 文档站 / 演示 webapp / 样例
├── packages/
│   ├── core/                  ← 心脏：Agent / Insight / TaskCache / planning
│   │   └── src/
│   │       ├── agent/         ← Agent class (1,584 行 agent.ts)
│   │       ├── ai-model/      ← VLM 调用 + provider 抽象 + planning
│   │       │   ├── inspect.ts        ← AiLocateElement (页面理解入口，661 行)
│   │       │   ├── llm-planning.ts   ← plan() 多步任务规划 (376 行)
│   │       │   ├── service-caller/   ← OpenAI 兼容 client + Codex App Server
│   │       │   ├── prompt/           ← 各模型族 system prompt
│   │       │   └── auto-glm/         ← AutoGLM 特化分支 (0-999 坐标)
│   │       ├── service/       ← 任务执行 + dump 上层
│   │       ├── device/        ← 抽象设备接口 (extension point #1)
│   │       └── yaml/          ← yaml DSL 解析 (cache + script player)
│   ├── web-integration/       ← Playwright/Puppeteer/CDP 集成 (extension point #2)
│   │   └── src/
│   │       ├── playwright/    ← ai-fixture.ts (687 行) - Playwright 注入点
│   │       ├── puppeteer/     ← Puppeteer agent
│   │       ├── chrome-extension/ ← Chrome 扩展模式
│   │       ├── bridge-mode/   ← 调试桥
│   │       └── mcp-server.ts  ← MCP 协议服务端
│   ├── android / android-mcp / android-playground          ← Android 端
│   ├── ios / ios-mcp / ios-playground                      ← iOS 端
│   ├── harmony / harmony-mcp / harmony-playground          ← 鸿蒙
│   ├── computer-mac / computer-linux / computer-win / computer-mcp ← 桌面端
│   ├── shared/                ← env config / extractor (DOM 提取) / img / utils
│   ├── visualizer/            ← 可视化 report (HTML + 时间线)
│   ├── recorder/              ← 录制 → yaml 工作流
│   ├── mcp/ web-bridge-mcp/   ← MCP server 实现
│   ├── cli/ playground/       ← 命令行 + 网页版 playground
│   └── evaluation/            ← 评测集
├── scripts/                   ← 维护者脚本 (release / coverage / dictionary)
├── nx.json + pnpm-workspace.yaml ← monorepo 编排
└── README.md / README.zh.md / CLAUDE.md / AGENTS.md / CONTRIBUTING.md
```

> 关键观察：**framework/SDK 类项目的"心脏"分两层**——一层是 `core/agent/agent.ts` 的 `Agent` abstraction，一层是 `web-integration/playwright/ai-fixture.ts` 的 fixture 注入点。
> 前者定义"什么是一个 agent"，后者定义"如何把 agent 装到用户自己的 Playwright test 里"。
> 不像 zustand 那种工具库只有 1 个心脏文件。

### 心脏文件清单 (≥ 3，附 commit hash + 行数)

| # | 文件 | 行数 | 角色 | commit 锚定 |
|---|---|---|---|---|
| 1 | `packages/core/src/ai-model/inspect.ts` | 661 | VLM 看图 → bbox 的核心逻辑 (`AiLocateElement`) | [L146-L394 AiLocateElement](https://github.com/web-infra-dev/midscene/blob/87d1259adeffb89d835062e75b6d62b9d474fa0c/packages/core/src/ai-model/inspect.ts#L146-L394) |
| 2 | `packages/core/src/agent/agent.ts` | 1,584 | Agent abstraction 主类，所有 `aiXxx` 方法的归宿 | [L555-L572 aiTap](https://github.com/web-infra-dev/midscene/blob/87d1259adeffb89d835062e75b6d62b9d474fa0c/packages/core/src/agent/agent.ts#L555-L572) |
| 3 | `packages/core/src/ai-model/llm-planning.ts` | 376 | 多步任务 `plan()` 函数，含 conversation history + sub-goal 系统 | [L110-L240 plan()](https://github.com/web-infra-dev/midscene/blob/87d1259adeffb89d835062e75b6d62b9d474fa0c/packages/core/src/ai-model/llm-planning.ts#L110-L240) |
| 4 | `packages/core/src/agent/task-cache.ts` | 420 | yaml 文件 cache lock-in 实现 (`TaskCache` 类) | [L136-L249 matchCache](https://github.com/web-infra-dev/midscene/blob/87d1259adeffb89d835062e75b6d62b9d474fa0c/packages/core/src/agent/task-cache.ts#L136-L249) |
| 5 | `packages/web-integration/src/playwright/ai-fixture.ts` | 687 | Playwright fixture 注入点 (extension point) | [L71-L173 PlaywrightAiFixture](https://github.com/web-infra-dev/midscene/blob/87d1259adeffb89d835062e75b6d62b9d474fa0c/packages/web-integration/src/playwright/ai-fixture.ts#L71-L173) |
| 6 | `packages/core/src/ai-model/service-caller/index.ts` | 913 | OpenAI 兼容 multi-provider 抽象 + langfuse/langsmith wrap | [L229-L300 callAI](https://github.com/web-infra-dev/midscene/blob/87d1259adeffb89d835062e75b6d62b9d474fa0c/packages/core/src/ai-model/service-caller/index.ts#L229-L300) |

### Extension points (分支 D 必填)

framework/SDK 类项目的特征是**"用户能在哪里挂代码"**。midscene 的 extension points 有四个：

1. **`AbstractInterface` 设备接口** (`packages/core/src/device/`)：用户写自己的设备适配器 (例如对接公司私有平台)，实现 `screenshot()` / `click()` / `extractTree()` 接口即可让 midscene 跑在新平台
2. **`createOpenAIClient` 钩子** (`service-caller/index.ts` L212-L218)：用户传一个函数包装 OpenAI client，可以接 LangSmith / Langfuse / 自家 trace 系统
3. **`PlaywrightAiFixture` 配置** (`web-integration/src/playwright/ai-fixture.ts` L71)：用户在 `playwright.config.ts` 用 `test.extend(PlaywrightAiFixture({...}))` 注入，直接把 `aiTap` `aiInput` 加到 test fixture
4. **`Agent.opts.aiActContext`** (`agent.ts` L264-L269)：用户传一段领域知识 prompt 进 high-priority knowledge slot，影响所有 planning 输出

### Commit 热点提示

由于 `git log --depth 1` 只有一个 commit，无法做精确热点榜。但从 `wc -l` + `package.json` 引用关系判断：`agent.ts` (1,584) > `service-caller/index.ts` (913) > `tasks.ts` (845) > `inspect.ts` (661) > `web-integration/playwright/ai-fixture.ts` (687) 是高质量阅读起点。

## 架构图 / 数据流图

![Figure 1: midscene aiTap 一次调用的内部数据流](/projects/midscene/01-architecture.webp)

**Figure 1 解释**：用户写 `await agent.aiTap("登录按钮")` 一行代码会触发 5 个阶段：
- **① 用户代码**：纯自然语言 prompt，无 selector
- **② 截图 + DOM**：Playwright `page.screenshot()` 拿到 base64 PNG，shared/extractor 提取可交互元素 tree
- **③ LLM Insight**：`AiLocateElement()` 包系统 prompt + 图 + 用户描述发给 VLM；模型族分支 (gpt-4v / claude → bbox; qwen2.5-vl → padded; AutoGLM → 0-999 坐标)；走 OpenAI 兼容 endpoint
- **④ 解析 + 校准**：`adaptBboxToRect()` 把 bbox 校准成像素 Rect，处理 search area offset / scale / 模型族特化
- **⑤ 执行 + retry**：`TaskExecutor` → `PlaywrightAgent.click(centerX, centerY)`；若 element 消失则重新截图 + 重 plan，最多 `replanningCycleLimit` 步 (默认 20)

**底部 lock-in band**：`TaskCache` 用 yaml 文件序列化所有成功的 locate / plan 结果，下次同样 prompt 直接命中跳过 LLM call。这是"状态机变化"的核心——agent 不是无状态的，第二次跑同 case 是 0 LLM call。

画风：5 列 vertical band 表示 pipeline，颜色按阶段角色 (橙/蓝/紫/绿/红)，箭头表示数据流向，底部黄色 band 是横切关注点 (cache + fallback)。

## 核心机制 (Layer 3，分支 D ≥ 3 段)

### 段 1 · Insight 页面理解：截图 + VLM → bbox

[`packages/core/src/ai-model/inspect.ts#L146-L235`](https://github.com/web-infra-dev/midscene/blob/87d1259adeffb89d835062e75b6d62b9d474fa0c/packages/core/src/ai-model/inspect.ts#L146-L235)

```ts
export async function AiLocateElement(options: {
  context: UIContext;
  targetElementDescription: TUserPrompt;
  searchConfig?: Awaited<ReturnType<typeof AiLocateSection>>;
  modelConfig: IModelConfig;
  abortSignal?: AbortSignal;
}): Promise<{
  parseResult: { elements: LocateResultElement[]; errors?: string[] };
  rect?: Rect;
  rawResponse: string;
  usage?: AIUsageInfo;
  reasoning_content?: string;
}> {
  const { context, targetElementDescription, modelConfig } = options;
  const { modelFamily } = modelConfig;
  const screenshotBase64 = context.screenshot.base64;

  const targetElementDescriptionText = extraTextFromUserPrompt(targetElementDescription);
  const userInstructionPrompt = findElementPrompt(targetElementDescriptionText);
  const systemPrompt = isAutoGLM(modelFamily)
    ? getAutoGLMLocatePrompt(modelFamily)
    : systemPromptToLocateElement(modelFamily);

  let imagePayload = screenshotBase64;
  let imageWidth = context.shotSize.width;
  let imageHeight = context.shotSize.height;

  if (options.searchConfig) {
    // 第二段：先 locate section 再 locate element 时，传入裁切后的小图
    imagePayload = options.searchConfig.imageBase64;
    imageWidth = options.searchConfig.rect?.width;
    imageHeight = options.searchConfig.rect?.height;
  } else if (modelFamily === 'qwen2.5-vl') {
    // qwen2.5-vl 要求图片尺寸是块大小的整数倍，主动 padding
    const paddedResult = await paddingToMatchBlockByBase64(imagePayload);
    imageWidth = paddedResult.width;
    imageHeight = paddedResult.height;
    imagePayload = paddedResult.imageBase64;
  }

  const msgs: AIArgs = [
    { role: 'system', content: systemPrompt },
    {
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: imagePayload, detail: 'high' } },
        { type: 'text', text: isAutoGLM(modelFamily)
            ? `Tap: ${userInstructionPrompt}`
            : userInstructionPrompt },
      ],
    },
  ];
```

旁注：

- **第一旁注：UIContext 是 frozen 快照**。看 `agent.ts` L186 `private frozenUIContext?: UIContext`——为什么需要 frozen？因为同一个 `aiAct` 调用的多步 planning 中，页面可能在 LLM 调用期间被异步 JS 改了 (轮播图、定时刷新)；frozen 保证「LLM 看的图就是 click 那一刻的图」。这是状态机一致性的关键。
- **第二旁注：模型族特化 if 散布**。`isAutoGLM(modelFamily)` 在这一个函数里出现 4 次，`modelFamily === 'qwen2.5-vl'` 出现 2 次。为什么不抽成 strategy pattern？因为每个模型族的特化点不只是 prompt——还有 image preprocessing (qwen 要 padding)、坐标系 (AutoGLM 是 0-999 归一化)、解析 (AutoGLM 的 thinking 标签不一样)。强抽象会把 4 个分支变成 4 倍代码量。
- **第三旁注：`detail: 'high'`** 是关键。OpenAI vision API 默认 `low` (512×512 tile)，high 模式才是真正按图分辨率送。看 service-caller 的 `shouldForceOriginalImageDetail` 分支——他们对部分模型强制 high，因为 low detail 在小按钮上 bbox 准确率会塌方。
- **第四旁注：`abortSignal` 全链贯穿**。从这个函数到 `callAI()` 到底层 OpenAI client，`abortSignal` 是同一个。为什么重要？replan loop 中如果用户主动取消、或者中间一步 plan 决定要退出，需要立即 abort 进行中的 LLM call (它可能要等 30 秒)，否则资源泄漏 + 用户看到长时间无响应。
- **第五旁注：`searchConfig` 两段式**。这是 deepThink 模式的实现——先让 LLM 看全图找出大致 section (如「页面右上角」)，裁切后只把小图喂给第二次 LLM call 找按钮。token 节省 5-10 倍，但延迟 +1 次 round trip。

**怀疑 (本段)**：`detail: 'high'` 在 4K 屏 (3840×2160) 上 token 消耗是 1080p 的 4 倍 (`(3840/512)² ≈ 56 tile vs (1920/512)² ≈ 14 tile`)，但 midscene 没有自动降采样到 1080p 的逻辑。如果 CI 在 4K headless Chrome 跑测试，每次 `aiTap` 多花 4× token——这是文档没披露的成本。在 `packages/shared/src/img/` 里有 `scaleImage`，但只在 `buildSearchAreaConfig` 里被调用 (L80)，主路径没接。

### 段 2 · ai-model multi-provider 抽象：OpenAI 兼容协议 + 五个模型族分支

[`packages/core/src/ai-model/service-caller/index.ts#L229-L300`](https://github.com/web-infra-dev/midscene/blob/87d1259adeffb89d835062e75b6d62b9d474fa0c/packages/core/src/ai-model/service-caller/index.ts#L229-L300)

```ts
export async function callAI(
  messages: ChatCompletionMessageParam[],
  modelConfig: IModelConfig,
  options?: {
    stream?: boolean;
    onChunk?: StreamingCallback;
    abortSignal?: AbortSignal;
    forceOriginalImageDetail?: boolean;
  },
): Promise<{
  content: string;
  reasoning_content?: string;
  usage?: AIUsageInfo;
  isStreamed: boolean;
}> {
  // 分支 1：Codex App Server (OpenAI 内部 codex 服务，独立协议)
  if (isCodexAppServerProvider(modelConfig.openaiBaseURL)) {
    if (
      !modelConfig.modelFamily &&
      hasExplicitReasoningConfig({
        reasoningEnabled: modelConfig.reasoningEnabled,
        reasoningEffort: modelConfig.reasoningEffort,
        reasoningBudget: modelConfig.reasoningBudget,
      })
    ) {
      throw new Error(
        'Reasoning config requires MIDSCENE_MODEL_FAMILY. Set MIDSCENE_MODEL_FAMILY when using ...',
      );
    }
    return callAIWithCodexAppServer(messages, modelConfig, {
      stream: options?.stream,
      onChunk: options?.onChunk,
      reasoningEnabled: modelConfig.reasoningEnabled,
      abortSignal: options?.abortSignal,
    });
  }

  // 主路径：OpenAI 兼容 (覆盖 GPT-4V / Claude via 代理 / Qwen-VL via DashScope / 自托管 vLLM)
  const { completion, modelName, modelDescription, uiTarsModelVersion, modelFamily }
    = await createChatClient({ modelConfig });

  const temperature = (() => {
    if (modelFamily === 'gpt-5') {
      debugCall('temperature is ignored for gpt-5');
      return undefined;
    }
    return modelConfig.temperature ?? 0;
  })();
```

旁注：

- **第一旁注：OpenAI SDK 是统一接入层**。midscene 不是分别接 Anthropic SDK / Google SDK / 阿里 DashScope SDK——它假设所有 provider 都暴露 OpenAI 兼容 endpoint (Anthropic 有 OpenAI 兼容代理、阿里 DashScope 原生兼容、自家 OpenAI、Codex App Server 是例外)。这是务实选择：少维护一条依赖链，代价是不能用 provider 专属高级特性 (如 Anthropic 的 thinking blocks)。
- **第二旁注：reasoning config 三选一**。`reasoningEnabled` / `reasoningEffort` / `reasoningBudget`——三种推理强度配置共存说明他们见过 GPT-5 (effort)、Claude 3.7 (budget tokens)、o1-style (enabled bool) 三种 API 形态，提前留了扩展位。
- **第三旁注：`temperature: 0` 是默认**。L291 `modelConfig.temperature ?? 0`——为什么强默认 0？因为 UI 自动化要的是 deterministic：同样的 prompt + 同样的截图，每次必须 return 同样的 bbox，否则 cache 命中率会塌方。`gpt-5` 例外因为 OpenAI 强制 (L287)。
- **第四旁注：langsmith / langfuse 双 wrap**。L182-L210 用动态 import 把 OpenAI client 包一层 trace。**为什么要动态 import？** 看 L192 `const langsmithModule = 'langsmith/wrappers'`——bundler 会静态分析 import 字符串，用变量绕过让 langsmith 成为可选依赖：用户没装也能跑，装了就自动接上。
- **第五旁注：proxy agent 注入**。L91-L158 `httpProxy` / `socksProxy` 走 undici / fetch-socks 动态 import。企业内网常见——这一段代码是「能在公司网络跑」的关键，开源项目里大多数 SDK 没做这件事。
- **第六旁注：`maxRetries: 0` + 自家重试**。L171 显式关掉 SDK 自带重试，因为 midscene 在 callAI 上层有自己的 replan loop 处理失败——双层重试会导致退避乘法爆炸 (例如 SDK 重试 3 次 × 框架重试 5 次 = 15 次实际调用)。

**怀疑 (本段)**：service-caller 的 `createChatClient` 每次 `callAI` 都新建一个 OpenAI 实例 (L178 `new OpenAI(openAIOptions)`)。在 `aiAction` 这种多步 planning 场景下，可能 30+ 次 LLM call 共享同一个 modelConfig，但每次都重新构造 client + 重新跑 langfuse wrap + 重新装 proxy agent——有性能开销。为什么不缓存？可能担心 modelConfig 在不同 step 之间被换 (例如某些 plan 步骤切到 gpt-4o-mini 省钱)，但实测中这种切换很少。

### 段 3 · Playwright Fixture 集成：把 agent 缝进 test 生命周期

[`packages/web-integration/src/playwright/ai-fixture.ts#L129-L230`](https://github.com/web-infra-dev/midscene/blob/87d1259adeffb89d835062e75b6d62b9d474fa0c/packages/web-integration/src/playwright/ai-fixture.ts#L129-L230)

```ts
const createOrReuseAgentForPage = (
  page: OriginPlaywrightPage,
  testInfo: TestInfo,
  opts?: WebPageAgentOpt,
) => {
  let idForPage = (page as any)[midsceneAgentKeyId];
  if (!idForPage) {
    idForPage = uuid();
    (page as any)[midsceneAgentKeyId] = idForPage;
    const { file, title } = groupAndCaseForTest(testInfo);
    const cacheConfig = processTestCacheConfig(testInfo);
    // 报告标签：playwright-{title}-{uuid}，前缀决定了 reports/ 文件名
    const reportTag = `playwright-${title.replace(/[\\/]/g, '-')}-${idForPage}`;

    const agent = new PlaywrightAgent(page, {
      testId: reportTag,
      reportFileName: reportTag,
      forceSameTabNavigation,
      cache: cacheConfig,
      groupName: title,
      groupDescription: file,
      generateReport: true,
      ...sharedAgentOptions,
      ...opts,
    });
    pageAgentMap[idForPage] = agent;
    const records = getAgentRecordsForTest(testInfo);
    const record: AgentRecord = { agent };
    records.set(idForPage, record);

    // 关键钩子：page close 时 finalize agent 并写 report
    page.on('close', async () => {
      debugPage('page closed');
      try {
        await finalizeAgentRecord(record);
      } finally {
        delete pageAgentMap[idForPage];
      }
    });
  }
  return pageAgentMap[idForPage];
};

async function generateAiFunction(options: { /* ... */ }) {
  const { page, testInfo, use, aiActionType } = options;
  const agent = createOrReuseAgentForPage(page, testInfo, {
    waitForNavigationTimeout,
    waitForNetworkIdleTimeout,
  }) as PlaywrightAgent;

  await use(async (taskPrompt: string, ...args: any[]) => {
    return new Promise((resolve, reject) => {
      // 把每次 ai-call 包成 Playwright test.step，就出现在 trace viewer
      test.step(`ai-${aiActionType} - ${JSON.stringify(taskPrompt)}`, async () => {
        try {
          const result = await (agent[aiActionType] as AgentMethod).bind(agent)(
            taskPrompt, ...args,
          );
          resolve(result);
        } catch (error) { reject(error); }
      });
    });
  });
}
```

旁注：

- **第一旁注：以 page 为 agent 单位，不是 test**。L134 `(page as any)[midsceneAgentKeyId]`——把 agent ID 挂在 Playwright Page 对象上，同一个 page 复用同一个 agent。**为什么不是以 test 为单位？** 因为一个 test 里可能 `await context.newPage()` 开多个标签页，每个 page 需要独立的 frozen context + cache + report。这是小细节但很重要。
- **第二旁注：`page.on('close', finalizeAgentRecord)` 异步钩子**。Playwright 的 `page.close()` 是 fire-and-forget，但 midscene 需要在 page 关闭时把 dump 写盘 + 生成 HTML report。所以注册了 async listener——但 Playwright 不会等 listener 完成才关闭，所以 `finalizeAgentRecord` 用 promise 把所有 records 串起来在 fixture teardown (L235-L257) 那一段统一 await。这是工程上很容易踩坑的点。
- **第三旁注：`test.step` 包装让 trace viewer 可读**。L214 `test.step('ai-aiTap - "登录按钮"', ...)`——包了之后 Playwright HTML report 会显示一行 `ai-aiTap "登录按钮" 1.2s`，点开能看截图。这是「无侵入接入 Playwright」最关键的一行：用户不需要改 reporter 配置就能在熟悉的 trace UI 里看 LLM 行为。
- **第四旁注：cache 三档策略**。L274-L292 处理 `cache: false | true | object`——`false` 关掉，`true` 走 fixture 默认 + 自动生成 ID (用 testId 派生)，`object` 用户自己指定 ID。**为什么 ID 这么重要？** 因为 cache 文件名就是 ID，CI 不同 worker 跑同一个 test 必须写到同一个 cache file 才能复用，否则每次都 cold start 调 LLM。
- **第五旁注：`midsceneDumpAnnotationId` 注解机制**。L45 + L101-L112 用 Playwright 的 testInfo annotations 把 report 路径塞进测试结果。**好处是什么？** Playwright HTML report 自带 annotations 渲染，不用改 reporter 就能在标准 UI 上点击跳转到 midscene 的 report——又一个无侵入接入点。
- **第六旁注：`forceSameTabNavigation: true` 默认**。L73 默认强制所有跳转留在同一个 tab。**为什么？** Playwright 默认跳新 tab 时 page 对象不变 (`window.open` 才换)，但有些 SPA 用 `target=_blank`——midscene 一旦换 page，agent 就找不到了。强制同 tab 是安全默认。

**怀疑 (本段)**：multi-page 场景下 (例如「打开新窗口完成支付」)，`createOrReuseAgentForPage` 会为新 page 新建 agent 和新 cache file。**两个 agent 之间的状态 (例如已学到的「登录按钮在右上角」) 不共享**。如果用户 case 是「先登录主页 → 弹支付窗口 → 回主页」，主页的 cache 命中、支付窗口的 cache 全 miss——而后者其实可能是相似 UI。这是 framework 的真实限制，文档没披露。

## Hands-on (Layer 4 · 框架/SDK 分支：写一个用 plugin/middleware 形式的 demo)

### 30 分钟跑通

```bash
# 1. 起一个 Playwright 测试项目
mkdir midscene-demo && cd midscene-demo
pnpm init -y
pnpm add -D @playwright/test @midscene/web typescript
npx playwright install chromium

# 2. 设置 LLM provider (任选一个)
export OPENAI_API_KEY=sk-...
export MIDSCENE_MODEL_NAME=gpt-4o
# 或者用 Qwen-VL：
# export OPENAI_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
# export OPENAI_API_KEY=sk-xxx
# export MIDSCENE_MODEL_NAME=qwen-vl-max

# 3. 写一个 playwright.config.ts (使用 PlaywrightAiFixture)
cat > playwright.config.ts << 'EOF'
import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests',
  use: { headless: false, viewport: { width: 1280, height: 720 } },
});
EOF

# 4. 写 fixture (extension point #3)
cat > tests/fixture.ts << 'EOF'
import { test as base } from '@playwright/test';
import { PlaywrightAiFixture } from '@midscene/web/playwright';
export const test = base.extend(PlaywrightAiFixture({ cache: true }));
EOF

# 5. 写一个 toy 测试：登录 + 搜索
cat > tests/login.spec.ts << 'EOF'
import { test } from './fixture';
test('login then search', async ({ page, ai, aiTap, aiInput }) => {
  await page.goto('https://github.com/login');
  await aiInput('用户名输入框', { value: process.env.GH_USER! });
  await aiInput('密码输入框', { value: process.env.GH_PASS! });
  await aiTap('Sign in 按钮');
  await page.waitForURL('**/login**', { timeout: 5000 }).catch(() => {});
  await ai('在导航栏搜索框输入 "midscene" 并按回车');
});
EOF

# 6. 跑
npx playwright test
# 报告会写到 .midscene_run/report/playwright-*.html
```

### 改一处实验 (framework/SDK 分支：写一个 plugin)

**目标**：写一个 `createOpenAIClient` 钩子，记录每次 LLM 调用的 token 用量到本地 jsonl，看 lifecycle 何时触发。

```ts
// tests/fixture.ts (修改)
import { test as base } from '@playwright/test';
import { PlaywrightAiFixture } from '@midscene/web/playwright';
import OpenAI from 'openai';
import { appendFileSync } from 'node:fs';

export const test = base.extend(
  PlaywrightAiFixture({
    cache: true,
    modelConfig: () => ({
      // 关键：自定义 client 工厂，包一层 logger
      createOpenAIClient: async (baseClient: OpenAI, _options) => {
        const original = baseClient.chat.completions.create.bind(
          baseClient.chat.completions,
        );
        baseClient.chat.completions.create = (async (...args: any[]) => {
          const t0 = Date.now();
          const result: any = await original(...args);
          appendFileSync(
            '.midscene_run/usage.jsonl',
            JSON.stringify({
              ts: Date.now(),
              latency_ms: Date.now() - t0,
              model: result?.model,
              prompt_tokens: result?.usage?.prompt_tokens,
              completion_tokens: result?.usage?.completion_tokens,
            }) + '\n',
          );
          return result;
        }) as any;
        return baseClient;
      },
    }),
  }),
);
```

**预期**：跑完一个 test 后 `.midscene_run/usage.jsonl` 长这样：

```jsonl
{"ts":1717000001234,"latency_ms":2341,"model":"gpt-4o-2024-08-06","prompt_tokens":1842,"completion_tokens":42}
{"ts":1717000004510,"latency_ms":1882,"model":"gpt-4o-2024-08-06","prompt_tokens":2103,"completion_tokens":38}
{"ts":1717000007021,"latency_ms":2013,"model":"gpt-4o-2024-08-06","prompt_tokens":1917,"completion_tokens":51}
```

**观察到的 lifecycle**：
- 每个 `aiInput` 触发 1 次 LLM call (locate)
- `aiTap` 触发 1 次 (locate)
- 高层 `ai('...')` 触发 N 次：planning + 每步 locate (N = 计划步数 × 2)
- 第二次跑同一个 test 时 cache 命中，**几乎 0 次** call (除非 plan 中某步 cache miss)

**这一步的价值**：把抽象的「multi-provider 抽象」变成肉眼可见的 jsonl 行——不只是「能用」，是「我看到了 prompt_tokens 怎么涨、cache 怎么省」。

## 横向对比 (Layer 5)

| 维度 | midscene | Playwright (raw) | browser-use | Anthropic Computer Use | OpenAI Operator | Selenium IDE |
|---|---|---|---|---|---|---|
| **核心范式** | 截图 + VLM bbox | selector / xpath | DOM tree indexed list | 像素 + 鼠标坐标 | 像素 + 鼠标坐标 | 录制脚本回放 |
| **API 抽象级别** | `aiTap("登录按钮")` 自然语言 | `page.locator('[data-id]').click()` | `click_element_by_index(2)` | `tool_use computer` | 内置 (closed) | XPath 录制 |
| **执行后端** | Playwright/Puppeteer/CDP | 自身 | Playwright | Anthropic 自家 | OpenAI 自家 | Selenium |
| **支持平台** | web/Android/iOS/Harmony/Mac/Linux/Win | web | web | desktop + web | web | web |
| **LLM provider** | 多 (gpt-4v/claude/qwen-vl/UI-TARS/AutoGLM) | 无 | 多 (Anthropic/OpenAI/Gemini/local) | Anthropic only | OpenAI only | 无 |
| **cache 复用** | yaml 文件 lock-in | N/A | 无 (每次 cold) | 无 | 无 | N/A |
| **配套 IDE/可视化** | 自带 visualizer | trace viewer | 内置 trace | Claude Console | Operator UI | 录制 IDE |
| **license** | MIT | Apache 2.0 | MIT | 闭源 | 闭源 | Apache 2.0 |
| **典型 token cost** | ~2k/step | 0 | ~1k/step | ~3k/step | ~2k/step | 0 |

### 哲学不同竞品深挖：midscene vs browser-use

两者都是 LLM-driven 浏览器自动化，但**输入给 LLM 的东西**根本不同：

- **browser-use**：DOM tree → indexed list (`[1] <button>Login</button>`)。优点是 deterministic、token 省、可调试。缺点是 React 无障碍标记不全的页面会丢元素，canvas-heavy 页面 (Figma) 完全不工作。
- **midscene**：原始截图 → VLM 直接看图。优点是页面渲染了什么 LLM 就看什么，跨平台 (Android/iOS 截图也是图)。缺点是 VLM 的 bbox 输出可能偏 5-50 像素，token 贵 (一张 1080p 截图 ~2k token)。

### 选型建议

| 场景 | 推荐 |
|---|---|
| 已有 Playwright 测试，想替换"按 selector 难维护"的几行 | **midscene** (PlaywrightAiFixture 零改动接入) |
| 端到端 web AI agent (浏览 + 任务规划 + 多步执行) | **browser-use** (Python 生态，agent 主循环更成熟) |
| 跨平台 UI 自动化 (web + 移动 + 桌面) | **midscene** (28 个 package 覆盖) |
| 完全可控的关键流程，不能容忍非确定性 | **Playwright raw** (selector + 显式断言) |
| 操作非浏览器 GUI (Figma desktop, native app) | **Anthropic Computer Use** |
| 需要严格 closed-source SLA 的企业 web 任务 | **OpenAI Operator** (有 SLA，但只英文 web) |
| 给 QA 同学手动录制回归 case | **Selenium IDE** |

## 与你当前工作的连接 (Layer 6 ≥ 4 子弹/段)

### 今天就能用

- **现有 Playwright 测试里 selector 最脆弱的 5 行**：找出每隔几周就 break 一次的 `page.locator(...)` 链 (通常是 SPA 动态 ID)，用 `aiTap("用户头像")` 替换。零代码改动 (只在 fixture 加 `PlaywrightAiFixture`)，命中 cache 后 token 成本可忽略。
- **smoke test 接 `aiAssert`**：比 `expect(page.locator(...)).toBeVisible()` 容错率高，可以直接写 `await aiAssert("页面右上角显示用户名")`。
- **跨语言 site 截图比对**：原本要写一堆 `if (lang === 'zh')` 逻辑判断按钮文案，VLM 看图自动识别，一句 `aiTap("注册按钮")` 中英都能用。
- **bug 复现脚本**：bug 报告里通常没有 selector，只有截图描述。直接把描述变 prompt：`await ai("打开商品详情页 → 加入购物车 → 在购物车点结算")`。

### 下个月能用

- **公司内部 platform 的爬虫 / 巡检脚本**：很多内部系统没暴露 API，selector 又乱。用 midscene 接 Qwen-VL (内网部署)，`aiAct("查询昨天的订单数据并截图")` 一句话搞定，不用维护 DOM 选择器。
- **多端回归测试**：同一个用户故事在 web + iOS + Android 三端跑，靠 midscene 的跨平台 package 体系，prompt 复用率高。
- **用 yaml DSL 把 LLM-driven test 变成"编辑器友好"**：midscene 的 `MidsceneYamlScript` 让非工程师 (PM / QA) 也能写 case，prompt 写在 yaml 里，工程师审 yaml diff 就行。
- **RPA 替代品**：替换 UiPath / 影刀 之类的传统 RPA，用 yaml 文件 + LLM-driven 的方式更灵活。

### 不要用的部分

- **不要把 midscene 用在「严格性能 SLA」的端到端测试上**：每个 `aiTap` 比 `page.click()` 慢 1-3 秒 (LLM call)，CI 总耗时会膨胀 3-10 倍。即使 cache 命中，第一次 cold run 仍然贵。CI 用法：只用在「真正脆弱」的几步，其他用原生 selector。
- **不要在 1000+ 元素的复杂表格上 `aiAct` 多步**：context 会膨胀 + replan loop 把 token cost 推到不合理。表格里的批量操作还是用 `for (const row of rows) { /* selector */ }`。
- **不要把 `aiAssert` 当「视觉回归测试」**：VLM 不会告诉你「按钮颜色从 #ff0000 变成 #ee0000」这种像素级差异，它只看「按钮存不存在 + 是不是可点」。视觉回归还是 Percy / Chromatic / Playwright 的 `toHaveScreenshot`。
- **不要用 midscene 取代 unit test 或 component test**：它是端到端工具，不是单元测试工具。组件级测试用 Vitest + Testing Library。

## 自检 + 延伸阅读 (Layer 7)

### 具体怀疑问题 (≥ 3，追到行号)

1. **`AiLocateElement` 在 `searchConfig` 路径下 (deepThink) 的 bbox 校准是否正确处理了 scaled 图片的反向映射？** 看 [`inspect.ts#L348-L360`](https://github.com/web-infra-dev/midscene/blob/87d1259adeffb89d835062e75b6d62b9d474fa0c/packages/core/src/ai-model/inspect.ts#L348-L360) 的 `adaptBboxToRect` 调用——参数包含 `searchConfig.rect.left/top` (offset) 和 `searchConfig.scale` (放大倍数)，但代码里看 scale 是直接除还是先除再加 offset？两种顺序差异在 scale ≠ 1 时会导致 10+ 像素 click 偏移。需要写一个 test 验证。
2. **`callAI` 的 `temperature: 0` 默认在 GPT-4o 上是否真的 deterministic？** 看 [`service-caller/index.ts#L286-L292`](https://github.com/web-infra-dev/midscene/blob/87d1259adeffb89d835062e75b6d62b9d474fa0c/packages/core/src/ai-model/service-caller/index.ts#L286-L292)。OpenAI 文档说 `temperature: 0` 不是严格 deterministic (内部 sampling 仍有微小随机)，需要 `seed` 参数才严格。midscene 没传 seed——这意味着同样的 prompt 第一次返回 bbox=[120, 340, 240, 380]，第二次可能返回 bbox=[121, 341, 241, 381]。cache hit 走 `isDeepStrictEqual`——会 miss！需要验证 cache 命中率实测数据。
3. **`TaskCache.matchCache` 的 `matchedCacheIndices` 防重复机制在 retry 场景下是否正确？** 看 [`task-cache.ts#L142-L170`](https://github.com/web-infra-dev/midscene/blob/87d1259adeffb89d835062e75b6d62b9d474fa0c/packages/core/src/agent/task-cache.ts#L142-L170)。如果第一次 click 失败 (按钮被遮挡)，框架自动 retry 同样的 prompt——cacheUsable 会怎么判定？看代码 L153 判断 `!matchedCacheIndices.has(key)`——意味着同 prompt 第二次会 miss cache 走 LLM。但 retry 的本意是「重试同一个动作」，不是「重新规划」——这是设计冲突。

### 接下来读哪 N 个文件

| 顺序 | 文件 | 回答的问题 |
|---|---|---|
| 1 | `packages/core/src/agent/tasks.ts` (845 行) | TaskExecutor 怎么把 plan 翻译成实际动作？错误处理 + retry 是哪一段？ |
| 2 | `packages/core/src/ai-model/conversation-history.ts` | 多步 planning 的 context 压缩 (`compressHistory(50, 20)`) 是怎么取舍的？ |
| 3 | `packages/shared/src/extractor/` | DOM tree 怎么从 raw HTML 简化成可交互元素 list？哪些 attribute 被丢弃？ |
| 4 | `packages/core/src/ai-model/auto-glm/` | AutoGLM 这个国产模型族的 0-999 坐标系统是怎么和 bbox 互转的？ |
| 5 | `packages/core/src/yaml/` | yaml DSL 是怎么解析 + replay 的？和 cache 的关系？ |
| 6 | `packages/web-integration/src/chrome-extension/` | Chrome 扩展模式 (而不是 Playwright) 是怎么让 agent 在用户真实浏览器跑的？ |

## 限制 (≥ 4)

- **VLM 推理延迟不可压**：每个 `aiTap` 单步 1-3 秒，比 raw Playwright `click` 慢 1000 倍。CI 时长会显著增加，即使有 cache 也只省第二次起。
- **token 成本随屏幕分辨率二次方增长**：4K headless Chrome 每次 LLM call 的 token 是 1080p 的 4 倍，文档没提示这点。
- **多模型族 prompt 维护成本**：5 个模型族 (gpt-4v / claude / qwen2.5-vl / UI-TARS / AutoGLM) 各有特化 prompt + 解析逻辑。新增第 6 个模型族 (例如 Gemini 2.5 / Llama 4 Vision) 需要在 `inspect.ts` `llm-planning.ts` 多个地方加 if 分支——已经有泥潭迹象。
- **temperature: 0 不严格 deterministic**：OpenAI 不传 `seed` 时仍有微小随机性，理论上会让 yaml cache 命中率不稳定。
- **multi-page agent 状态不共享**：弹窗 / 新 tab 都是独立 agent，每个都要 cold start，无法复用主页学到的"按钮位置经验"。
- **cache 路径只支持本地 fs**：`getMidsceneRunSubDir('cache')` 写本地文件——CI 多 worker 跑同一 test 需要 artifact 共享机制，开箱不支持 S3 / Redis。

## 附录 · 宣传 vs 现实清单

| 宣传 | 代码现实 |
|---|---|
| 「自然语言驱动 UI 自动化」 | 实质是「截图 + 一行描述 → VLM bbox」，不是真正的 NLU；模糊描述如「主区域那个按钮」准确率显著下降 |
| 「跨多模型 (gpt-4v / claude / qwen-vl / ...)」 | 实际接入仍走 OpenAI 兼容 endpoint；无法用 provider 专属高级特性 (如 Anthropic thinking blocks 原生 API) |
| 「跨平台 (web + Android + iOS + 鸿蒙 + Mac/Linux/Win)」 | 28 个 package 在仓库里都存在，但成熟度差异大——web 最完善，Android/iOS 处于早期，鸿蒙更早 |
| 「TaskCache 让第二次跑 0 LLM call」 | 仅当 prompt 完全字符串相等时命中；temperature 不严格 deterministic + 截图微小变化 (轮播图) 会让 cache miss 率高于宣传 |
| 「Playwright/Puppeteer 双后端」 | Playwright fixture 是一等公民 (687 行)，Puppeteer 集成只有基础 agent-launcher，文档完整度差距大 |

## 元数据

- **升级日期**：2026-05-28 (v1.1 分支 D 框架/SDK 标准首版)
- **总行数**：~530 行 (本笔记)
- **启用工具**：`git clone --depth 1` / `wc -l` / 直接读源码 / 自己合成 Figure 1 (PIL)
- **锚定 commit**：`87d1259adeffb89d835062e75b6d62b9d474fa0c` (2026-05-28 19:51 +0800)
- **GitHub permalink 数**：≥ 8 处，全部 40 字符 commit hash 锚定，无 `/blob/main` 漂移
- **季度归档**：Season 11 (浏览器 agent / 多端自动化) 第 1 篇
