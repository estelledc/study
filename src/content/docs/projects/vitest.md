---
title: Vitest — 复用 Vite 流水线的测试运行器
来源: 'https://github.com/vitest-dev/vitest'
日期: 2026-05-30
分类: 测试
难度: 中级
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/vitest-dev/vitest
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 9bd8d464e6328c567c2dbcd8fdd977d57a9425c2
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 4.1.11
---

## 是什么

Vitest 是一个**把 Vite 开发服务器当成测试运行时**的测试框架。日常类比：开发和测试共用同一条编译流水线——别再为测试单独养一套 Babel / ts-jest。

你写：

```ts
import { test, expect } from "vitest";
test("add", () => { expect(1 + 1).toBe(2); });
```

固定 4.1.11 启动时先找配置文件，再创建 Vite server，并把 Vitest 自己挂成插件。测试代码走 Vite 的模块图与 `ServerModuleRunner`，不是另起一套转译器。

## 为什么重要

不理解 Vitest 的运行时边界，下面这些事都解释不通：

- 为什么 `resolve.alias` / `define` / Vite plugin 在测试里通常直接生效
- 为什么默认不是 jsdom，测 DOM 必须显式换 environment
- 为什么 `vi.mock` 写在 import 后面仍然先于模块加载执行
- 为什么 browser mode 不是“开一个开关就有 Playwright”，而要另装 provider 包

## 核心要点

固定源码的主链可以拆成四步：

1. **找配置并启动 Vite**：`createVitest()` 按 `vitest.config.*` 再 `vite.config.*` 的顺序搜索；找到后 `mergeConfig` 并注入 `VitestPlugin`，再 `createViteServer()`。

2. **解析测试默认值**：未写 `pool` 时落到 `'forks'`；`environment` 默认 `'node'`；`isolate` 默认 `true`；`fileParallelism` 默认 `true`；`globals` 默认 `false`。`watch` 仅在非 CI、stdin 是 TTY、且不是 agent 时默认打开。

3. **worker 跑 spec**：默认 forks 池起子进程。每个文件在隔离环境里加载；模块执行默认走 Vite 的 `ServerModuleRunner`，除非把 `experimental.viteModuleRunner` 设成 `false`。

4. **watch 重跑的是受影响 spec**：`VitestWatcher` 挂在 `vite.watcher` 的 change/unlink/add 上，把要重跑的测试文件记进 `changedTests`。这是“判定哪些 spec 受影响再重跑”，不是 worker 内 HMR 热替换。

## 实践示例

### 案例 1：显式 import 跑一条测试

```ts
import { test, expect } from "vitest";
import { sum } from "./sum";

test("1 + 2 = 3", () => {
  expect(sum(1, 2)).toBe(3);
});
```

`npx vitest run` 一次跑完退出。没有配置文件时，仍用上面的默认 pool / environment。新项目不要开 `globals: true`——固定版本默认就是关的，显式 import 才能跳转和 tree-shake。

### 案例 2：mock 会被提升到文件顶

```ts
import { test, expect, vi } from "vitest";
import { fetchUser } from "./api";
import { greet } from "./greet";

vi.mock("./api", () => ({
  fetchUser: vi.fn(() => Promise.resolve({ name: "Jason" })),
}));

test("greet uses mocked fetchUser", async () => {
  expect(await greet(1)).toBe("Hello, Jason");
  expect(fetchUser).toHaveBeenCalledWith(1);
});
```

`@vitest/mocker` 的 `hoistMocksPlugin` 会把 `vi.mock` / `vi.unmock` / `vi.hoisted` 挪到文件顶部。factory 里引用“看起来写在前面、实际还没初始化”的变量会报 TDZ。要用 `vi.hoisted(() => ...)` 显式提升。

### 案例 3：coverage 默认关着

```bash
npx vitest run --coverage
```

配置默认 `coverage.provider` 是 `'v8'`，但 `enabled` 是 `false`。打开后报告目录默认 `./coverage`。Istanbul 是另一条 provider，且与 `experimental.viteModuleRunner: false` 不兼容。

## 踩过的坑

1. **默认 environment 是 node**：测 DOM 要显式 `environment: 'jsdom'` 或 `'happy-dom'`。`--dom` 会强制 `happy-dom`，并覆盖配置里的其他 environment。

2. **browser mode 要另装 provider**：`browser.provider` 必须传入 `@vitest/browser-playwright` / `@vitest/browser-webdriverio` / `@vitest/browser-preview` 的工厂函数。只写字符串 `'playwright'` 不够；没指定 provider 会直接抛错。

3. **Vitest 4 删掉了 `test.poolOptions`**：旧的 per-pool 嵌套选项已提升成顶层字段。照着 3.x 文档抄 `poolOptions` 会被 deprecate 警告拦住。

4. **watch 默认值看环境**：CI、非 TTY 或 agent 环境下默认不 watch。把“本地默认 watch”当成所有调用约定会在 CI 里踩空。

## 适用 vs 不适用场景

**适用**：

- 已经在用 [[vite]] 的项目——配置搜索会复用 `vite.config.*`
- 需要 Jest 风格 `describe` / `expect` / `vi.mock`，但转译想跟 Vite 共用
- Node `^20 || ^22 || >=24`，Vite `^6 || ^7 || ^8`

**不适用**：

- 纯 Webpack 栈、又不想引入 Vite——等于多装一条编译链
- 端到端真浏览器用户流——那是 [[playwright]] Test 的赛道；Vitest browser mode 测的是组件/单元，还要另装 provider
- 需要把静态阅读写成“比 Jest 快 N 倍”——本轮未跑对比 benchmark

## 固定版本边界

- 本文绑定 `vitest-dev/vitest@9bd8d464...`，即 lightweight tag `v4.1.11`，`packages/vitest` 版本 `4.1.11`。
- npm `vitest@4.1.11` 未暴露 `gitHead`；以 GitHub tag 提交为溯源锚点。上游另有 `v5.0.0-rc.*`，本文不绑定预发布线。
- 默认：`pool: 'forks'`、`environment: 'node'`、`isolate: true`、`fileParallelism: true`、`globals: false`；coverage provider `v8` 但默认关闭。
- 引擎：Node `^20.0.0 || ^22.0.0 || >=24.0.0`；peer Vite `^6.0.0 || ^7.0.0 || ^8.0.0`。
- 本文未安装依赖、未运行上游测试、未测启动耗时或覆盖率开销，状态保持 `UNVERIFIED`。

## 学到什么

1. **测试运行器可以是 bundler 的 consumer**——Vitest 把 Vite server 当宿主，而不是再养一套转译器
2. **默认值必须按大版本重读**：Vitest 4 默认 forks，且删掉了 `poolOptions`
3. **hoist 是变换，不是书写位置**：`vi.mock` 看起来写在后面，运行时仍在 import 之前
4. **browser mode 是可选 provider 插件**，不是核心 runner 的默认池

## 应用型自测

1. 不写 `pool` 时，固定 4.1.11 默认用 `threads` 还是 `forks`？
2. `vi.mock` 写在 `import` 后面，factory 里用到的顶层 `const` 一定已经初始化了吗？
3. `browser: { enabled: true }` 但不传 `provider`，能启动 browser mode 吗？

检查点：

1. `forks`。`resolveConfig` 在缺省时写 `resolved.pool ??= 'forks'`。
2. 不一定。mock 会被提升到文件顶，factory 里的外部变量可能仍处在 TDZ，要用 `vi.hoisted`。
3. 不能。未指定 provider 会要求从 `@vitest/browser-playwright` 等包传入工厂函数。

## 延伸阅读

- 官方文档：[vitest.dev](https://vitest.dev/)
- 固定源码：[vitest-dev/vitest](https://github.com/vitest-dev/vitest) —— 本文绑定提交 `9bd8d464e6328c567c2dbcd8fdd977d57a9425c2`
- [[vite]] —— Vitest 的宿主编译流水线
- [[jest]] —— API 兼容的对照基准
- [[playwright]] —— 端到端测试；也是 Vitest browser provider 之一

## 关联

- [[vite]] —— 理解 Vite server / ModuleRunner 才能理解 Vitest 为什么能复用 alias 和 plugin
- [[jest]] —— `describe` / `expect` / mock 命名的兼容目标
- [[playwright]] —— 真浏览器 e2e；Vitest browser mode 的 Playwright provider 与它不是同一条测试赛道
- [[esbuild]] —— Vite 依赖的转译器之一；不能单独解释 Vitest 4 的 runner
- [[bun]] —— `bun:test` 是另一条绑死 runtime 的测试入口

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[jest]] —— Jest — 一个包就能跑 JS 测试的全家桶
- [[midscene]] —— midscene — 用自然语言代替 selector 的浏览器自动化框架
- [[msw]] —— MSW — 让 mock 不改业务代码，在网络层透明拦截
- [[node-js]] —— Node.js — 服务端 JS 运行时之父
- [[storybook]] —— Storybook — 给 UI 组件的独立工作台
- [[testing-library]] —— Testing Library — 像用户一样测前端，重构不再挂测试
- [[vue]] —— Vue.js — 渐进式 UI 框架
