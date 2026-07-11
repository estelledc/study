---
title: midscene — 用自然语言代替 selector 的浏览器自动化框架
来源: 'https://github.com/web-infra-dev/midscene'
日期: 2026-05-30
分类: 前端 / UI 自动化
难度: 中级
---

## 是什么

midscene 是一个**让你用「点登录按钮」这样的自然语言代替 `page.locator('[data-testid=login]').click()` 的浏览器自动化框架**。

日常类比：以前写自动化测试像给机器人写菜谱——「先伸右手第三根手指，按下编号 47 的按钮」；菜谱里写错一个编号就全乱。midscene 的做法像给机器人**配一个会看屏幕的助手**：你说「点登录按钮」，助手看一眼屏幕，告诉机器人「按钮在 (240, 380) 这个像素位置」，机器人再去点。

底下的机制只有三步：

```ts
await agent.aiTap('登录按钮')
//   ↓ 截图发给 VLM (GPT-4V / Claude / Qwen-VL)
//   ↓ 模型返回 bbox: [120, 340, 240, 380]
//   ↓ Playwright 点击坐标中心 (180, 360)
```

执行后端用现成的 Playwright/Puppeteer，midscene 只负责「自然语言 → 像素坐标」这一段，再加上 yaml cache 让第二次跑同一个 prompt 不再调 LLM。MIT 协议，支持 web / Android / iOS / 鸿蒙 / 桌面端 (Mac/Linux/Win) 共 7 种平台共用同一套 API。

## 为什么重要

- **DOM 路线在 SPA 上越来越脆**：React / Vue 给元素的 ID 经常每次构建都换，selector 写一次后维护成本巨高；canvas-heavy 站点 (Figma / Excalidraw) 干脆没有可读 DOM
- **跨平台是真痛点**：同一个用户故事要在 web + iOS + Android 三端跑，传统做法每端写一套；VLM 看截图这件事在哪个平台都一样
- **多模态模型 2024 年起才工业级**：GPT-4V / Claude 3.5 / Qwen2.5-VL 都能稳定输出 bbox，2023 年做这件事还得 OCR + LLM 两段拼，现在第一次具备走通整条流水线的精度
- **生态卡位**：与 [[browser-use]] (Python，DOM tree 路线)、Anthropic Computer Use (像素 + 鼠标)、Selenium IDE (录制脚本) 形成 LLM 浏览器自动化的几条主流路线

## 核心要点

midscene 的心智模型只有 **三个角色**：

1. **Insight 看图模块**：负责「截图 → 喂给 VLM → 拿到 bbox」（定位以纯视觉为主；需要抽结构化数据时才可选附带 DOM）。每个模型族 (GPT-4V / Claude / Qwen-VL / UI-TARS / AutoGLM) 都有一套特化 prompt 和坐标解析逻辑——这是框架最厚的一层

2. **Agent 抽象**：所有 `aiXxx` 方法的入口。`aiTap('xx')` 找元素再点；`aiInput('xx', { value })` 找输入框再填；`aiAct('多步指令')` 让 LLM 自己规划步骤；`aiAssert('xx')` 看截图判断断言。底下都通到 Insight + Playwright

3. **TaskCache yaml 缓存**：第一次跑成功之后，把「prompt + 截图哈希 → bbox」写到本地 yaml 文件。第二次同样 prompt 命中直接复用，不再调 LLM——这是把高昂 LLM 成本降下来的关键

关键约束：cache 命中要求 prompt **字符串完全相等**，且 VLM 在 `temperature=0` 下也不严格 deterministic。所以 prompt 里多写一个空格、模型微小漂移、截图哈希因为轮播图变化都会让 cache miss——实际命中率往往低于官宣。

## 实践案例

### 案例 1：替换 Playwright 里最脆弱的几行

已有 Playwright 项目，CI 里隔几周就 break 一次的几行 selector：

```ts
// 之前
await page.locator('[data-testid=user-menu]').click()
await page.locator('input[name=search]').fill('midscene')

// 之后（fixture 里加 PlaywrightAiFixture，零项目改动）
await aiTap('右上角的用户头像')
await aiInput('搜索框', { value: 'midscene' })
```

接入只改一个 fixture 文件：

```ts
// fixture.ts
import { test as base } from '@playwright/test'
import { PlaywrightAiFixture } from '@midscene/web/playwright'
export const test = base.extend(PlaywrightAiFixture({ cache: true }))
```

`PlaywrightAiFixture` 把 agent 装到 Playwright `test.extend()` 里，跑出来的报告自动嵌进 trace viewer 同一个时间线。第一次跑会调 LLM，跑成功后 yaml cache 落盘，CI 第二次起几乎 0 LLM call。

### 案例 2：跨语言站点共用一套断言

英文版/法文版/中文版站点，按钮文案都不同，传统做法要写一堆 `if (lang === 'zh')` 分支：

```ts
// 传统：按文案分发
const btnText = lang === 'zh' ? '注册' : 'Sign up'
await page.getByRole('button', { name: btnText }).click()

// midscene：一句话覆盖所有语言
await aiTap('注册按钮')
await aiAssert('页面顶部显示登录后的用户名')
```

VLM 看截图自然识别「这个位置看起来像注册按钮」，不需要硬编码文案。代价是每次 1-3 秒 LLM 延迟。

### 案例 3：用 yaml DSL 让非工程师写测试

midscene 把 `aiTap` / `aiInput` / `aiAct` 序列化成一种 yaml DSL，PM 或 QA 同学也能写：

```yaml
target: { url: 'https://example.com/login' }
flow:
  - ai: 在用户名框输入 alice
  - ai: 在密码框输入 password123
  - aiTap: 登录按钮
  - aiAssert: 页面跳转到 dashboard
```

工程师审 yaml diff 就能 review 用例，不需要每个 case 都是 ts 代码。yaml 还能从录制工具反向生成。

## 踩过的坑

1. **CI 总时长会膨胀 3-10 倍**：每个 `aiTap` 一次 LLM call 要 1-3 秒，比 `page.click()` 慢上千倍。只该把它用在「真正脆弱」的那几行 selector 上，全量替换会让 CI 变得不可接受
2. **VLM bbox 可能偏 5-50 像素**：模型把按钮位置预测得偏一点，按钮中心还在框里就没事，偏太多直接 miss。动态 UI / 小按钮 / 4K 屏密集组件最容易踩
3. **yaml cache 命中率往往低于官宣**：命中要 prompt 字符串完全相等 + 截图哈希一致；`temperature: 0` 不严格 deterministic + 轮播图 / 时间戳让截图微变都会 miss。空格大小写也要小心
4. **多模型族 prompt 维护成本高**：5 个模型族各有特化 prompt 和坐标解析，新增 Gemini / Llama Vision 要在多个文件加 if 分支——已有泥潭迹象，框架长期维护是一笔账

## 适用 vs 不适用场景

**适用**：

- 已有 Playwright/Puppeteer 项目，想替换最脆弱那几行 selector（PlaywrightAiFixture 零侵入接入）
- 跨语言、跨平台 UI 测试（同一句自然语言中英法都能跑，web/iOS/Android 共用 prompt）
- canvas-heavy / 无障碍标记不全的页面（DOM 路线丢元素，VLM 看图反而准）
- 内部系统巡检脚本（很多老系统没暴露 API，selector 又乱，自然语言 prompt 比维护选择器轻松）

**不适用**：

- 严格性能 SLA 的 e2e 测试（每步 1-3 秒 LLM 延迟，CI 时长会爆）
- 表格 1000+ 元素批量操作（context 膨胀 + replan 把 token cost 推到不合理，应该用 selector 循环）
- 视觉回归测试（VLM 不会告诉你「按钮颜色从 #ff0000 变 #ee0000」，那是 Percy / Chromatic 的活）
- 单元 / 组件测试（midscene 是端到端工具，组件级用 [[vitest]] + Testing Library）

## 历史小故事（可跳过）

- **2023 年**：GPT-4V 第一次能输出 bbox，但精度差、延迟高，谁都不敢真上 CI
- **2024 年中**：Claude 3.5 Sonnet / GPT-4o / Qwen2.5-VL 多模态模型同时进入工业级精度，VLM 路线第一次成立
- **2024 年下半年**：midscene 开源（GitHub 仓库约 2024-07），选择「截图 + VLM bbox + Playwright 执行」；同期 Anthropic Computer Use、browser-use 也把三条主流路线摆上台面
- **2025 年**：陆续扩到 Android / iOS / 鸿蒙 / 桌面端，同一套自然语言 API 覆盖多端
- **2026 年**：仓库已上万 star，成为 LLM 浏览器自动化的常见选型之一

## 学到什么

- **VLM 路线 vs DOM 路线是两条根本不同的哲学**：输入给 LLM 的是图还是 HTML，决定了能不能跨平台、token 成本、可调试性，三件事一刀切完全分流
- **「自然语言抽象」不是 NLU 魔法**，而是「截图 + 一句描述 → bbox」三步流水线；模糊描述像「主区域那个按钮」准确率会显著下降
- **多 provider 抽象的代价是放弃 provider 专属高级特性**（如 Anthropic 的 thinking blocks），换来「能在公司任何 LLM 平台跑」的工程便利
- **缓存设计的关键是确定性**：cache 命中要求 prompt + 截图哈希 + 模型输出三位一体；只要任一环节有抖动，命中率就会塌方

## 延伸阅读

- 官网：[midscenejs.com](https://midscenejs.com)（含 playground 可在线试 prompt）
- 视频：[Vision-driven UI Automation 综述](https://www.youtube.com/results?search_query=midscene+ai+ui+automation)（社区已有几支介绍视频）
- 哲学对比文章：[browser-use vs midscene 的输入路线之争](https://docs.browser-use.com)（DOM tree vs screenshot 两条路线作者各自的辩护）
- [[playwright]] —— midscene 主推的执行后端
- [[browser-use]] —— 同样是 LLM 浏览器自动化，但走 DOM tree 索引路线
- [[anthropic-cookbook]] —— Anthropic Computer Use 早期像素坐标路线的官方示例

## 关联

- [[playwright]] —— midscene 当作执行后端，aiTap 最终翻译成 Playwright click
- [[browser-use]] —— 同问题不同路线 (DOM tree vs 截图)，对比能看清各自取舍
- [[claude-code]] —— 同样是 LLM agent 框架，但 Claude Code 是命令行 / 文件操作，midscene 是浏览器 UI
- [[langfuse]] —— midscene 内置 langfuse / langsmith 双 trace 接入点，可看每次 LLM call 的 prompt 和 token
- [[vitest]] —— midscene 不能取代单元测试；二者各管一段（端到端 vs 组件级）
- [[langchain]] —— LLM 工具链生态另一类抽象，但 langchain 偏 RAG / agent，不直接做 UI 自动化
- [[anthropic-cookbook]] —— Computer Use 路线的官方示例参考

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[browser-use]] —— browser-use — 让 LLM 用「DOM 索引清单」操作浏览器的 Python agent 框架
- [[claude-code]] —— Claude Code — Anthropic 终端编程助手
- [[langfuse]] —— Langfuse — LLM 应用可观测性
- [[nanobrowser]] —— nanobrowser — 把 Chrome 扩展本身当成 AI agent 的运行沙箱
- [[playwright]] —— Playwright — 跨浏览器自动化测试
- [[stagehand]] —— stagehand — Playwright 加 LLM 的混血框架
- [[steel-browser]] —— Steel Browser — 把 Chromium 包成 LLM agent 用的远端服务
- [[vitest]] —— Vitest — Vite 原生测试框架

