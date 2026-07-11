---
title: Vitest — Vite 原生测试框架
来源: https://github.com/vitest-dev/vitest
日期: 2026-05-29
分类: 测试
难度: 中级
---

## 是什么

Vitest 是一个**与 [[vite]] 共用编译流水线、Jest API 兼容**的测试框架。日常类比：

> [[jest]] 像每次开车要先暖车 30 秒——它有自己一套独立的 babel-jest 转译器，跑测试前要把 TS / JSX / 静态资源全部重新处理一遍。
>
> Vitest 是直接打火即走——开发用的 Vite dev server 已经把代码编译好了，跑测试就是再问一次同样的代码而已。

最简上手：

```js
import { test, expect } from 'vitest'

test('add', () => {
  expect(1 + 1).toBe(2)
})
```

```bash
npx vitest          # watch 模式（默认）
npx vitest run      # 一次跑完退出
```

没有 `babel.config.js`、没有 `jest.config.ts`——你的 `vite.config.ts` 就是测试配置。

## 为什么重要

不理解 Vitest，下面这些事都没法解释：

- 为什么 Vue / Svelte / Solid / Astro 这类 Vite 项目 2024 年后**默认推荐 Vitest**——配置零成本
- 为什么 React 项目从 [[jest]] 大量迁出——启动比 Jest 快 5-10 倍，watch 模式只重跑改动的测试
- 为什么 `describe / it / expect` 写法看起来和 Jest 一模一样——Vitest 故意保持 API 兼容，迁移成本极低
- 为什么"前端工具栈收敛"是 2020 后的趋势——Vitest 的哲学就是"测试是 Vite dev server 的一个 consumer"，而不是"独立王国"

一句话：Vitest 证明了**前端工具不必各自维护一套 transpiler——共享上游能拿到所有红利**。

## 核心要点

Vitest 的心智模型只有 **三件事**：

1. **共享 Vite config**：`resolve.alias` / `define` / `plugins` / 环境变量在测试时全部生效。类比：开发和测试是同一辆车的两个挡位，不是两辆车。

2. **浏览器模式（已 stable）**：传统测试用 `jsdom` 模拟浏览器（慢、不全），Vitest browser mode 直接驱动 Playwright / WebDriver 在**真浏览器**里跑。组件单测的真实度跃升一个量级。

3. **Snapshot / mock / coverage 内置**：不用配 `babel-jest`、不用装 `@types/jest`、不用拼 `nyc`。`expect(x).toMatchSnapshot()` / `vi.mock('./api')` / `vitest run --coverage` 开箱即用。

三件事加起来 ≈ 一个 `vite.config.ts` 加一行 `test: {}`。

## 实践案例

### 案例 1：最简单元测试

```js
// src/sum.test.ts
import { test, expect } from 'vitest'
import { sum } from './sum'

test('1 + 2 = 3', () => {
  expect(sum(1, 2)).toBe(3)
})
```

```bash
npx vitest run
```

**逐部分解释**：

- `import { test, expect } from 'vitest'`：显式 import，IDE 跳转 / type-check / tree-shaking 都更友好
- `expect(...).toBe(...)`：API 与 Jest 完全一致，迁移时 sed 改 import 即可
- 没有 `vitest.config.ts`——空配置直接跑

### 案例 2：Mock 一个 module

假设 `greet(id)` 内部调用 `fetchUser(id)` 再拼 `"Hello, " + name`：

```js
import { test, expect, vi } from 'vitest'
import { fetchUser } from './api'
import { greet } from './greet'

vi.mock('./api', () => ({
  fetchUser: vi.fn(() => Promise.resolve({ name: 'Jason' })),
}))

test('greet uses mocked fetchUser', async () => {
  const msg = await greet(1)
  expect(msg).toBe('Hello, Jason')
  expect(fetchUser).toHaveBeenCalledWith(1)
})
```

**逐部分解释**：

- `vi.mock('./api', factory)`：把 `./api` 换成假实现，**必须写在文件顶部**（esbuild 会提升到所有 import 之前）
- `vi.fn(...)`：带 spy 的假函数，后面才能 `toHaveBeenCalledWith`
- 真网络不会被打到——测的是 `greet` 怎么用返回值，不是 API 本身

### 案例 3：Coverage 一行命令

```bash
npx vitest run --coverage
```

**逐部分解释**：

- 默认用 **v8** provider，跑完在 `coverage/` 生成 HTML；`open coverage/index.html` 看每行命中
- 要换 Istanbul：在 `vite.config.ts` 里加 `test: { coverage: { provider: 'istanbul' } }`
- 首次可能提示装 `@vitest/coverage-v8`——按提示装即可

## 踩过的坑

1. **默认不是 jsdom**：Vitest 默认 `environment: 'node'`。测 DOM 组件要显式设 `jsdom`（兼容高、偏慢）或 `happy-dom`（快 2-3 倍、API 略少）。组件库常先 happy-dom，CI 关键路径再切 jsdom。

2. **Mock hoisting 陷阱**：`vi.mock(path, factory)` 会被 esbuild 提升到 import 之前。如果 factory 内部引用了**还没 import 的变量**，会报 `Cannot access before initialization`。解决：用 `vi.hoisted(() => ...)` 显式提升变量。

3. **React Testing Library 配合**：`@testing-library/react` 要设 `environment: 'jsdom'` 并装 `@testing-library/jest-dom`。canvas / WebGL 还要 `vitest-canvas-mock` 兜底。

4. **`globals: true` 选项**：开了之后 `describe / it / expect` 全局可用（兼容 Jest）。方便但失去 import 显式性，IDE 跳转更弱。**新项目直接 `import { describe } from 'vitest'`**，不要开 globals。

## 适用 vs 不适用场景

**适用**：

- 任何已经在用 [[vite]] 的项目（Vue / Svelte / Solid / Astro / Vite + React）—— 配置零成本
- 从 [[jest]] 迁出的中大型项目——API 95% 兼容，sed 改 import 即可
- 需要在真浏览器跑组件单测——browser mode 比 jsdom 真实，比 e2e 轻
- TypeScript 项目——不用配 `ts-jest` / `babel-jest`，esbuild 自动转译

**不适用**：

- 不用 [[vite]] 的项目（[[webpack]] 5 stack）—— 引入 Vitest 等于多装一份 vite，得不偿失
- Node 库纯零依赖测试 —— 用 Node 22+ 内建 `node:test`，启动 ~30ms（Vitest 是 ~300ms）
- 端到端浏览器测试 —— 用 [[playwright]] test，单元测试不是它的赛道
- Bun 全栈项目 —— 用 `bun:test`，启动 ~50ms（绑死 bun runtime 但更快）

## 历史小故事（可跳过）

- **2021 年**：Anthony Fu（antfu）启动 Vitest，目标是"让 Vite 项目跑测试不用切 Jest"。
- **2023 年 12 月**：Vitest 1.0 发布；维护重心逐步交给 sheremet-va 等全职贡献者。
- **2024 年**：Stack Overflow 调查显示 Vitest 在前端测试框架中**用户量逼近 Jest**；Vue / Svelte / Solid / Astro 默认推荐。
- **2024 年末**：Vitest 3.0 发布，浏览器模式从 experimental 走向 stable。

约 3 年从"小众替代品"到"事实标准"。

## 学到什么

1. **测试是开发工具栈的一个 consumer，不是独立王国**——这是 Vitest 比 [[jest]] 哲学更先进的核心。共享上游 = 共享所有红利。
2. **API 兼容是最廉价的迁移利器**——Vitest 故意复刻 Jest 的 `describe / it / expect / mock` 命名，让用户"无脑迁移"。这是工程胜于创新的典范。
3. **Watch 模式的本质是"判定哪些 spec 受影响 → 重跑"**，不是"原 worker 内 HMR 替换模块"。前者是 Vitest 的，后者是 Vite dev server 的——两件事别混。
4. **隔离粒度可调**：`forks`（默认，进程隔离）/ `threads`（worker_threads，快但脆）/ `vmForks` / `vmThreads`（每 spec 新 vm.Context，最强隔离最慢）。多数项目默认就够，不要无脑提升强度。

## 延伸阅读

- 官方 docs：[vitest.dev](https://vitest.dev/)（30 分钟读完核心 API）
- 视频教程：[Anthony Fu — Vitest 1.0 release talk](https://www.youtube.com/results?search_query=vitest+1.0+anthony+fu)（作者亲自讲设计哲学）
- 自己写实现：照着 `packages/vitest/src/node/core.ts` 读 Vitest 启动流程，再对照 `pools/workers/forksWorker.ts` 看 worker fork 实现——能讲清楚 Vitest 内核就懂了大半测试框架设计
- [[vite]] —— Vitest 的上游，理解 Vite dev server 才能理解 Vitest watch
- [[jest]] —— 前一代标准，Vitest 的对比基准
- [[playwright]] —— 端到端测试标配，Vitest browser mode 的后端选择之一

## 关联

- [[vite]] —— Vitest 直接复用 Vite 的 transpile / ModuleRunner / watcher，理解 Vite 是理解 Vitest 的前提
- [[jest]] —— Vitest API 兼容的目标，迁移时一对照就懂
- [[playwright]] —— Vitest browser mode 默认后端；纯 e2e 仍用 Playwright Test
- [[esbuild]] —— Vite 内部的转译器，Vitest 间接复用——这是它跑得快的根因
- [[bun]] —— `bun:test` 是 Vitest 的新挑战者（绑死 bun runtime 换更快启动）

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[jest]] —— Jest — 一个包就能跑 JS 测试的全家桶
- [[midscene]] —— midscene — 用自然语言代替 selector 的浏览器自动化框架
- [[msw]] —— MSW — 让 mock 不改业务代码，在网络层透明拦截
- [[node-js]] —— Node.js — 服务端 JS 运行时之父
- [[storybook]] —— Storybook — 给 UI 组件的独立工作台
- [[testing-library]] —— Testing Library — 像用户一样测前端，重构不再挂测试
- [[vue]] —— Vue.js — 渐进式 UI 框架
