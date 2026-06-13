---
title: nanobrowser — 把 Chrome 扩展本身当成 AI agent 的运行沙箱
来源: 'https://github.com/nanobrowser/nanobrowser'
日期: 2026-05-30
子分类: AI agent
分类: 机器学习
难度: 中级
provenance: pipeline-v3
---

## 是什么

nanobrowser 是一个**开源 Chrome 扩展**，让 LLM 能直接操作你当前浏览器里的网页——不开远端容器、不开云 Chrome、数据不离开本机。日常类比：像在你自己的家里请来一个能识字的助手帮你点鼠标，而不是把家里钥匙寄给一个云服务再让它代点。

你装上扩展，打开 side panel 输入"去 Google 搜一下今天的天气"。扩展里的 service worker 启动，借 `chrome.debugger` 通道接管当前 tab，让 LLM 看到 DOM、决定下一步动作（点哪个按钮、输入什么文字），然后真的执行。

这个"扩展即 sandbox"的形态，是它和 cloud Chrome 类项目（browser-use / Browserbase）最根本的差异：用户的 cookie 和登录 session 直接复用，**LLM API key 自己付费**，没有按分钟计费的云成本。

## 为什么重要

不理解 nanobrowser 的形态选择，下面这些事都没法解释：

- 为什么同样是 LLM 操作浏览器，有的项目跑在云端有的跑在扩展里——是工程口味还是不同 trade-off
- 为什么 manifest v3 的 service worker "30 秒空闲被 kill" 是这类扩展躲不开的硬伤
- 为什么 nanobrowser 文档说"三 agent"代码里却只有两个——产品话术和工程现实之间的差距
- 为什么"数据不出本机"是销售点，但严格意义上 LLM 调用本身还是把 prompt 发给了模型厂

## 核心要点

nanobrowser 的设计可以拆成 **三层**：

1. **物理形态：Chrome 扩展 manifest v3**。整个项目是一个用户装在浏览器里的扩展，不是 docker 容器、不是云后端。类比：你装一个翻译插件，nanobrowser 用同样的物理位置装了一个"会自动操作网页的 agent"。

2. **执行通道：puppeteer + ExtensionTransport**。扩展通过 `puppeteer-core` 的 `ExtensionTransport.connectTab(tabId)` 借自己的 `chrome.debugger` 权限讲 CDP（Chrome DevTools Protocol），从而拥有 puppeteer 的全部能力（点击 / 输入 / 截图 / 求值），但不需要外部 Chromium 进程。

3. **大脑：两段式 multi-agent (Planner + Navigator)**。Planner 每隔 N 步出一次 JSON（含 `done` / `next_steps`）做战略规划；Navigator 每步出 multi-action 列表做战术执行。两个 agent 在 service worker 里轮转，用 LangChain + Zod schema 约束 LLM 输出格式。

三层叠起来：**轻量装机 + 用户态权限 + 结构化输出**，是它能 13k stars 的关键组合。

## 实践案例

### 案例 1：装扩展跑一个最小任务

第一次接触 nanobrowser 最直接的玩法。从源码 build：

```bash
git clone https://github.com/nanobrowser/nanobrowser
cd nanobrowser
pnpm install
pnpm dev
```

打开 `chrome://extensions/` → 开启"开发者模式" → 加载 `dist/` 目录。点扩展图标打开 side panel，填一个 LLM provider key（OpenAI / Anthropic / Gemini / Ollama 都支持），输入任务："去 Google 搜一下 nanobrowser 仓库地址"。

观察 side panel 的事件流：你会看到 `PlannerAgent` 先出一个 plan、`NavigatorAgent` 一步步执行（点搜索框 / 输入文字 / 点回车），最后 Planner 出 `done: true` 收尾。

### 案例 2：把 planningInterval 从 1 调到 4

`planningInterval` 控制"每跑几步 Navigator 就回去问一次 Planner"。默认是 1（每步都问 Planner，最稳但最贵）。改成 4：

```typescript
// agent/types.ts 大致位置
const defaultPlannerOptions = {
  planningInterval: 4,
};
```

重启扩展跑同一个任务，对比 logger：

- Planner 调用次数从每步 1 次降到每 4 步 1 次（成本下降约 70%）
- 简单任务（< 10 步）成功率几乎不变
- 复杂任务 Navigator 偶尔会"跑偏"，多走 1-2 步纠错

这是个真正的成本/可靠性 trade-off knob，做内部工具可以调高（省钱），做面向客户的 demo 必须调低（求稳）。

### 案例 3：写一个 custom action

扩展点的能力测试。在 `agent/actions/builder.ts` 加一个新 action：

```typescript
registry.action({
  name: 'screenshot_and_describe',
  description: '截图当前页面并由 vision LLM 描述',
  parameters: z.object({ selector: z.string().optional() }),
  async handler({ selector }, ctx) {
    const screenshot = await ctx.browserContext.takeScreenshot(selector);
    return { success: true, data: { screenshot }, includeInMemory: true };
  },
});
```

跑一次任务确认 lifecycle：`registry.action` 注册 → `ActionBuilder.buildDefaultActions()` 收集 → `NavigatorActionRegistry` 持有 → Navigator 在 `doMultiAction` 里 lookup → 命中 handler 执行。这是框架/SDK 形态真正的 plugin 路径。

## 踩过的坑

1. **service worker 30 秒空闲被 kill**：长任务必经一次 SW 重启，history 持久化只在任务末尾写，中途断电状态丢失风险真实存在。
2. **Chrome 专属**：Firefox 的 manifest v3 实现不一致（debugger / sidePanel 行为有差），Safari 走完全不同的 webextension 体系，跨浏览器要重写。
3. **反检测只是基础款**：`evaluateOnNewDocument` 注入对 Cloudflare Turnstile / DataDome 这种现代反爬基本无效，商用项目仍要正面解决合规和授权。
4. **文档说三 agent 代码只有两个**：README 常说 "Planner / Navigator / Validator"，代码里 Validator 是 Planner 的 `done` 字段，二次开发不能引用不存在的 ValidatorAgent。

## 适用 vs 不适用场景

适用：

- 企业内部工具、合规要求高、用户已登录公司 SSO（"数据不出本机 + 复用现有 session" 在这一档没有对手）
- 个人自动化脚本（自动填表 / 自动整理收件箱），用自己的 LLM key，无云成本
- 学 manifest v3 + multi-agent + Zod schema 的工程范式样本

不适用：

- 要做 SaaS、需要并发 100 session 同时跑（扩展形态没法多 tab 互不干扰并跑）
- 用户用 Firefox / Safari（Chrome 专属）
- 目标网站做了重型 fingerprint 反爬（扩展注入痕迹会被 Cloudflare 抓）
- 要做长周期 24×7 服务化（service worker 寿命限制硬伤）

## 历史小故事（可跳过）

- 2023 起 LLM 操作浏览器的需求爆发，最先红的是 cloud Chrome 路线（browser-use / Browserbase）
- 2024 OpenAI Operator 推出，按月 200 刀的定价让"自己装一个"成为强需求
- 2024-2025 nanobrowser 走扩展形态切入开源市场，主打"零订阅 + 数据不出本机"
- 2025 年 GitHub stars 快速涨到 13k+，社区贡献多 LLM provider 支持（OpenAI / Anthropic / Gemini / Ollama / Groq / Cerebras）
- 2026 年仍在维护，但不日更，社区扩展 PR 节奏稳定

## 学到什么

- "形态决定灵魂"：同样是"让 LLM 操作浏览器"，cloud Chrome / 本地 Playwright / 扩展 / 截图坐标四条路各有不可调和的 trade-off，选错了形态再优化代码也补不回来
- 结构化输出（Zod schema）是 multi-agent 工程化的基石——不是为了好看，是为了 provider 容错和 IDE 自动补全两个免费收益
- "知识不出本机"是个有用但有限的承诺：页面字节是真的不出，但 LLM prompt 还是发给了模型厂，要做严格本地化得跑 Ollama
- manifest v3 service worker 短命问题逼着每个浏览器扩展项目都得显式做"任务可中断 + 状态可恢复"

## 延伸阅读

- [nanobrowser GitHub 仓库](https://github.com/nanobrowser/nanobrowser)
- [Chrome Extensions manifest v3 文档](https://developer.chrome.com/docs/extensions/mv3)
- [puppeteer-core ExtensionTransport API](https://pptr.dev/api/puppeteer.extensiontransport)
- [Anthropic Computer Use 介绍](https://www.anthropic.com/news/3-5-models-and-computer-use)
- [[browser-use]] 同方向但走 cloud Chrome 路线的对照项目
- [[playwright-mcp]] 本地 headless 路线的对照项目

## 关联

- [[browser-use]] —— 同样让 LLM 操作浏览器，但走 cloud Chrome 路线，nanobrowser 的最直接对手
- [[playwright-mcp]] —— 本地 headless 路线，看不到运行中的浏览器但容易 CI 化
- [[midscene]] —— extension + SDK 双形态，介于 nanobrowser 和 stagehand 之间
- [[stagehand]] —— TypeScript SDK 后端走 Browserbase 云 Chrome
- [[computer-use]] —— Anthropic 像素+坐标路线，操作任意 GUI 而不只是浏览器
- [[langchain]] —— nanobrowser 用它包 LLM provider 和 structured output
- [[zod]] —— Schema 库，做 agent 输入输出的合约层

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[browser-use]] —— browser-use — 用自然语言让 AI Agent 操控浏览器
- [[midscene]] —— midscene — 用自然语言代替 selector 的浏览器自动化框架
- [[patchright]] —— patchright — 给 Playwright 打 patch 让浏览器自动化在反 bot 站点继续工作
- [[stagehand]] —— stagehand — Playwright 加 LLM 的混血框架
- [[steel-browser]] —— Steel Browser — 把 Chromium 包成 LLM agent 用的远端服务
- [[zod]] —— Zod — TypeScript-first schema 验证

