---
title: stagehand — Playwright 加 LLM 的混血框架
来源: 'https://github.com/browserbase/stagehand'
日期: 2026-05-30
子分类: 浏览器自动化
分类: Agent
难度: 中级
provenance: pipeline-v3
---

## 是什么

stagehand 是一套**让 LLM 操作浏览器，但默认不用 LLM** 的 TypeScript 框架。日常类比：像一个有副驾驶的老司机——副驾驶（LLM）只在司机（Playwright selector）开错路时才插嘴指方向，平时一句话不说。

你写：

```ts
await page.act("click the sign in button")
```

stagehand 第一次会让 LLM 看一眼页面、给出一个 selector，然后**像普通 Playwright 一样直接点**。下一次同一个动作？走 cache，连 LLM 都不调。

这种 "deterministic 优先 + LLM fallback" 的设计，是 v3 版本和早期 LLM-driven 框架（每步都过 LLM）的最大区别。仓库 22.8k stars / MIT / Browserbase 公司维护。

## 为什么重要

不理解 stagehand 这套设计，下面这些事都没法解释：

- 为什么 2024 年的 LLM 浏览器框架（每步都 LLM）一年烧的 token 钱够买一台车，stagehand 却能跑生产
- 为什么 act() 默认 self-heal **关闭**——明明开着看起来更"智能"
- 为什么 extract() 让你写 zod schema 而不是"按 JSON 格式返回"——LLM 编 URL 这件事是真坑
- 为什么同样是 "AI 浏览器自动化"，stagehand / [[browser-use]] / [[midscene]] / Computer Use 走的是四条根本不同的路线

## 核心要点

stagehand 的设计可以拆成 **三件事**：

1. **共享视野**：所有 API 先调 `captureHybridSnapshot` 拿一张 a11y 树（来自 Chrome DevTools Protocol 的 `Accessibility.getFullAXTree`）+ xpath 映射。a11y 树比原始 DOM 干净——`<div role="button">` 和 `<button>` 都被归一为一个 `button` 节点。

2. **LLM 只输出 elementId，不输出 selector**：LLM 看到的是 a11y 树带编号（如 `1-67`），它输出 `1-67` 这种数字，handler 用 xpath map 翻译成 selector。这样 LLM 不用懂 xpath 语法，也不会编一个不存在的 selector。

3. **三 API 三种用法**：act() 执行动作（click/type/...）；extract() 用 zod schema 抽数据；observe() 让 LLM 列一组候选元素，调用方自己决定怎么用。

三个 handler 的代码骨架几乎复制粘贴，区别只在最后一步「LLM 输出怎么用」。

## 实践案例

### 案例 1：用 observe + extract 抓 Hacker News

```ts
import { Stagehand } from "@browserbasehq/stagehand"
import { z } from "zod"

const stagehand = new Stagehand({ env: "LOCAL" })
await stagehand.init()
const page = stagehand.page
await page.goto("https://news.ycombinator.com")

const stories = await page.extract({
  instruction: "extract top 3 stories with title and url",
  schema: z.object({
    items: z.array(z.object({
      title: z.string(),
      url: z.string().url(),
    })),
  }),
})
console.log(stories)
```

**发生了什么**：LLM 看到 a11y 树，但**没自己输出 url 字符串**——stagehand 偷偷把 `z.string().url()` 换成 `z.number()`，让 LLM 输出 elementId（数字），最后 handler 查 xpath map 把 url 写回去。

### 案例 2：自定义 LLMClient 看 act 调几次 LLM

```ts
class LoggingClient extends LLMClient {
  async createChatCompletion(args) {
    console.log("[LLM] call")
    return super.createChatCompletion(args)
  }
}

await page.act("click the first link")  // 控制台只打 1 次
```

干净页面：每次 act 严格 1 个 LLM call。如果开 `selfHeal: true` 且第一次 selector 失效，会变 2 次。

### 案例 3：observe 拿候选元素自己写循环

```ts
const candidates = await page.observe("find all buttons in the navbar")
// candidates: [{ description, selector, method, arguments }, ...]
for (const c of candidates) {
  if (c.description.includes("login")) await page.act(c)
}
```

observe 不强制 method 字段存在——这设计让 observe 兼任 "纯发现" 和 "发现+动作建议" 两个角色。

## 踩过的坑

1. **self-heal 默认关，开了也只重试 1 次**——必须显式 `selfHeal: true`，且要明白第二次 LLM 选错也会直接 fail。团队不做无限重试是为了避免幽灵重试（LLM 选另一个 selector 把流程导到错误页，比如点了"取消"而不是"提交"）。

2. **URL→id 替换只识别 `z.string().url()`**——如果你写 `z.string().regex(/^https/)`，stagehand 不知道这是 url 字段，LLM 会直接编一个 url，而且通常编得很像真的。这是一个文档不易发现的坑。

3. **shadow DOM 直接 `not-supported`**——找不到 xpath map 的元素被标记 not-supported，act handler 看到就返回失败。重度用 shadow DOM 的组件库（某些 web component 内部）不能用 stagehand。

4. **ActCache 用 `sha256(instruction + url + vars)`**——url 的 query string 微变就 cache miss，没法跨 url cache 同一个按钮的 selector。生产中要么固定测试 url，要么禁用 cache。

## 适用 vs 不适用场景

**适用**：
- 已经用 [[playwright]] 写测试，想渐进加 AI 段——一段旧 selector + 一段 act("...") 拼用
- 需要从 HTML 页面结构化抽数据（ZOD schema 加持），是爬虫的好替代
- 浏览器即云服务（Browserbase）用户首选

**不适用**：
- 重度 canvas / SVG 应用（如 Figma / 在线游戏）——a11y 树没东西，要走 [[midscene]] 那种 VLM 路线
- 跨浏览器 + native app 自动化——stagehand 只能浏览器，要 Anthropic Computer Use
- Python 栈—— 原生 Python SDK 不存在，要走 HTTP server，多一层网络

## 历史小故事（可跳过）

- **2024 年初**：Browserbase 公司推出"浏览器即云服务"，需要客户端 SDK。最初版（v1）是全 LLM 路线，每步都过 LLM。
- **2024 年底**：业界发现全 LLM 路线在生产里成本高、稳定性差。stagehand 团队启动 v3 重构，核心论调是"LLM call 越少越好"。
- **2025 年**：v3 三 API（act/extract/observe）成形，引入 a11y 树 + xpath map 路径，self-heal 改成可选。
- **2026 年**：v3.7.0（2026-05-27）发布，加 Vertex 模型支持 / Stainless 多语言 SDK 自动生成。仓库锚定 commit `49575d6`。

## 学到什么

1. **deterministic 优先 + LLM fallback** 是 LLM agent 设计的关键转向——LLM 是兜底而非主路径，能省 80%+ 调用成本
2. **zod schema 比 prompt-as-format 鲁棒一个数量级**——任何"让 LLM 返回结构化数据"的工具都该有这一层
3. **a11y 树是 DOM 全文 vs index 索引之间的中间最优解**——CDP `Accessibility.getFullAXTree` 是直接可调的入口
4. **设计扩展点比堆功能更重要**——stagehand 的 LLMClient / CacheStorage / Page driver 三层抽象让它能被改造和复用

## 延伸阅读

- 仓库：[browserbase/stagehand](https://github.com/browserbase/stagehand)（22.8k stars / MIT，README 十分钟可读）
- 文档站：[docs.stagehand.dev](https://docs.stagehand.dev)（含 cookbook 和 best practices）
- 视频教程：作者 Paul Klein 在 YouTube 有几个 demo 视频（搜 "Browserbase Stagehand demo"）
- [[playwright]] —— stagehand 的执行后端
- [[zod]] —— extract() 的 schema 引擎

## 关联

- [[playwright]] —— stagehand 把 Playwright 包成 deterministic 路径，LLM 只在抛错时 fallback
- [[patchright]] —— Playwright 反检测变体，stagehand 支持作为 page driver 替换
- [[browser-use]] —— Python 同方向，但走 DOM 索引而非 a11y 树，每步都过 LLM
- [[midscene]] —— TS 同方向，走 VLM + 截图路线，stagehand 的"哲学不同竞品"
- [[nanobrowser]] —— 把 stagehand 嵌成 Chrome 扩展的下游消费者
- [[zod]] —— extract() 的 schema 工具，URL→id 替换魔法的核心载体

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[browser-use]] —— browser-use — 用自然语言让 AI Agent 操控浏览器
- [[midscene]] —— midscene — 用自然语言代替 selector 的浏览器自动化框架
- [[nanobrowser]] —— nanobrowser — 把 Chrome 扩展本身当成 AI agent 的运行沙箱
- [[patchright]] —— patchright — 给 Playwright 打 patch 让浏览器自动化在反 bot 站点继续工作
- [[playwright]] —— Playwright — 跨浏览器自动化测试
- [[steel-browser]] —— Steel Browser — 把 Chromium 包成 LLM agent 用的远端服务
- [[zod]] —— Zod — TypeScript-first schema 验证

