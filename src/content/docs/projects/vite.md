---
title: "Vite — dev/build 不对称的现代解"
description: dev 用 native ESM 让浏览器自己解依赖；build 用 Rollup 求干净——两套工具吃两边好处
sidebar:
  order: 20
  label: "vitejs/vite"
---

> vitejs/vite v8.0.14（2026-05），MIT。
>
> Vite 不是另一个 webpack。它的核心设计判断是：
> **dev 和 build 是两个完全不同的问题，不该用同一套架构解**。
>
> dev 的诉求是"启动快 + 改一行就 hot reload"。
> build 的诉求是"产出干净 + tree-shake 彻底 + 体积最小"。
>
> 大多数 bundler（webpack）想用一套架构两边都做，
> 结果两边都妥协。Vite 的回答：**两边各用最合适的工具**。
>
> Season 3 第二篇。

## 一句话定位

**Vite = dev 用 native ESM + esbuild 预构建依赖 + 按需转译 + HMR；build 用 Rollup。**
两套不同工具，统一在同一套 plugin API 下——用户感知是一个工具。

## Why（为什么是它而不是 webpack / Parcel / Next）

webpack 的 dev server 工作模式：

```
启动 → 把所有源码 + 所有依赖 → 编译成一个大 bundle → 加载到浏览器
```

100 个文件、500 个 npm 包——**每次启动都要全量打包**。
项目大了之后 30 秒起步是常态。

Vite 的 dev server 工作模式：

```
启动 → 只预构建 npm 依赖（esbuild，秒级）
浏览器请求 /src/main.tsx
   ↓
Vite 拦截：转译 TSX → JS（按文件）
   ↓
浏览器 import './App.tsx'
   ↓
Vite 拦截：转译 → JS
   ↓
... 浏览器一边请求一边加载，不预先打包整个应用
```

**关键判断**：现代浏览器原生支持 `<script type="module">`，可以自己处理 `import`。
**那为什么我们还要在 dev 模式下打包？**

答案：以前不能（旧浏览器、TS / JSX 浏览器看不懂）。现在能了——
Vite 利用了这一点。

| 工具 | dev | build | 启动时间 | HMR |
|---|---|---|---|---|
| **webpack** | webpack | webpack | 10-30 秒 | 1-3 秒 |
| **Parcel** | Parcel | Parcel | 5-15 秒 | < 1 秒 |
| **Next.js** | webpack/Turbopack | webpack | 5-20 秒 | 1-2 秒 |
| **Vite** | **native ESM** | **Rollup** | **< 1 秒** | **即时** |

**为什么不是 webpack**：webpack 用一套架构兼容旧浏览器是有历史包袱的。
Vite 是 2020 年生的，可以**假设浏览器原生支持 ESM**——这是设计前提的差异。

**为什么不是 Parcel**：Parcel 想"零配置"，理念好，但 dev 仍然在做打包。
Vite 直接放弃 dev 时打包这件事。

**为什么不是 Next.js Turbopack**：Turbopack 是 Vercel 的"webpack 替代品"野心，
仍然是 dev/build 同栈。Vite + Rollup 的组合更轻、更模块化。

**Vite 的取舍代价**：
- **生产构建用 Rollup** → build 时间不会比 webpack 快特别多
- **不支持 IE 11** → 你的目标用户必须用现代浏览器
- **依赖必须能预构建** → 某些 CommonJS 包要靠 esbuild 转 ESM，偶尔出错

## 仓库地形

```
vite/
└── packages/
    ├── vite/                                    ← ★ 主包
    │   └── src/
    │       └── node/                            ← node 端代码
    │           ├── server/                      ← ★★ dev server
    │           │   ├── index.ts                 ← 1384 行：createServer
    │           │   ├── moduleGraph.ts           ← 489 行：模块依赖图
    │           │   ├── transformRequest.ts      ← 565 行：核心拦截逻辑
    │           │   ├── pluginContainer.ts       ← 1326 行：plugin 调度
    │           │   ├── hmr.ts                   ← 1160 行：★ HMR 状态机
    │           │   ├── ws.ts                    ← 467 行：WebSocket
    │           │   ├── middlewares/             ← Connect 中间件
    │           │   └── environments/            ← 环境抽象（client / ssr / worker）
    │           ├── build.ts                     ← 1940 行：调用 Rollup
    │           ├── config.ts                    ← 2728 行：配置解析
    │           ├── optimizer/                   ← esbuild 依赖预构建
    │           ├── plugins/                     ← 内置 plugin
    │           └── ssr/                         ← SSR runtime
    ├── plugin-react/
    ├── plugin-vue/
    ├── plugin-legacy/                           ← 给老浏览器降级（用 webpack 思路）
    └── create-vite/                             ← npm create vite 脚手架
```

**心脏文件**：

1. `src/node/server/index.ts:470-520`——`createServer`，整个 dev server 入口
2. `src/node/server/transformRequest.ts:78-200`——按需转译的核心
3. `src/node/server/hmr.ts`——HMR 协议实现
4. `src/node/optimizer/`——esbuild 依赖预构建（Vite 用 esbuild 但不在 dev path）

build.ts 1940 行**主要在调 Rollup**，不是核心创新。

## 核心机制 · Layer 3 精读

### 机制 1 · 浏览器原生 ESM 是前提

打开 vite dev server 后用 DevTools 看 Network，会发现：

```
GET /src/main.tsx                     200 (1.2KB)
GET /src/App.tsx                      200 (3.4KB)
GET /node_modules/.vite/deps/react.js 200 (135KB)   ← 预构建依赖
GET /src/components/Button.tsx        200 (0.8KB)
```

每个文件**单独请求、单独转译、单独缓存**。

浏览器拿到 `/src/main.tsx` 的内容（实际是转译后的 JS），看到里面的 `import './App.tsx'`
就发起新请求。Vite 在拦截层把 TSX 转译成 JS。

→ **关键**：这是把"模块化"这件事**外包给浏览器**。Vite 只做"按需转译"。

### 机制 2 · createServer — dev 启动流程

`packages/vite/src/node/server/index.ts:470-475`：

```typescript
export function createServer(
  inlineConfig: InlineConfig | ResolvedConfig = {},
): Promise<ViteDevServer> {
  return _createServer(inlineConfig, { listen: true })
}
```

`_createServer` 内部主要做几件事（精简）：

1. resolve config
2. 启动 HTTP server（http.ts）
3. 创建 WebSocket server（用于 HMR 通信）
4. 初始化 `pluginContainer`（rollup-compatible plugin 调度器）
5. 初始化 `moduleGraph`（模块依赖图）
6. 启动 esbuild 依赖预构建（optimizer/）
7. 注册中间件链：处理 `/path → 转译 → 返回`

→ **没有"打包"这个步骤**。这是 vite 和 webpack 的根本差异。

### 机制 3 · transformRequest — 按需转译核心

`packages/vite/src/node/server/transformRequest.ts:78-130`（节选）：

```typescript
export function transformRequest(
  environment: DevEnvironment,
  url: string,
  options: TransformOptionsInternal = {},
): Promise<TransformResult | null> {
  // ... pending request dedupe
  const pendingRequest = environment._pendingRequests.get(url)
  if (pendingRequest && /* 还在处理 */) {
    return pendingRequest.request
  }

  const request = doTransform(environment, url, options, timestamp)

  // 缓存进行中的请求
  environment._pendingRequests.set(url, { request, timestamp, abort: clearCache })

  return request.finally(clearCache)
}
```

`doTransform` 的核心步骤（transformRequest.ts:148+）：

1. **resolve**：plugin 链解析 `url` 到真实 `id`（文件路径）
2. **load**：plugin 链加载文件内容（默认从磁盘）
3. **transform**：plugin 链转译（react plugin 转 JSX、ts plugin 转 TS、postcss 转 CSS）
4. **cache**：结果存到 moduleGraph

**注意 in-flight 去重**：
和 [SWR 的 FETCH map](/study/projects/swr/) 是同一个思路——**多个请求同 URL 时复用 promise**。
浏览器并发请求多个 import 时，如果两个请求都触发了对同一文件的转译，
只跑一次。

### 机制 4 · pluginContainer — Rollup 兼容协议

Vite 的 plugin 系统**直接抄 Rollup 的 hooks**：

```typescript
const plugin = {
  name: 'my-plugin',
  resolveId(id, importer) { /* ... */ },
  load(id) { /* ... */ },
  transform(code, id) { /* ... */ },
}
```

`pluginContainer.ts` 1326 行实现的是：**在 dev 时模拟 Rollup 的 plugin 调用环境**，
让 Rollup plugin 在 dev / build 都能跑。

→ 这个判断的好处：**生态复用**。Rollup 几年积累的 plugin 直接可用，不用重写。
代价是 plugin 容器逻辑很重（1326 行）。

### 机制 5 · 依赖预构建 —— 唯一在 dev 用 esbuild 打包的地方

如果 dev 不打包，`node_modules` 里的依赖怎么处理？

考虑一个场景：你 `import { Button } from 'antd'`。antd 内部有 1000+ 个文件互相 import，
每个都要请求一次——浏览器会**卡死**。

Vite 的回答：**对 npm 依赖做预构建**。

`packages/vite/src/node/optimizer/` 实现：

1. 启动时扫描源码 import 路径
2. 收集所有从 `node_modules` 引入的包
3. **用 esbuild** 把它们打包成单个文件，放到 `node_modules/.vite/deps/`
4. 浏览器请求 `import 'antd'` 时，Vite 重写成 `/node_modules/.vite/deps/antd.js`

→ 这是 Vite 的"判断分水岭"：**应用代码按需转译，依赖代码预构建**。
两者用不同策略。esbuild 在这里发挥极致——预构建几百个包只要几秒。

### 机制 6 · HMR 协议

`packages/vite/src/node/server/hmr.ts`（1160 行）实现热更新：

1. **文件变化** → chokidar watcher 触发
2. **moduleGraph 查找受影响的模块** → 标记 dirty
3. **沿依赖反向传播** → 找到能"接受"更新的边界（accept）
4. **WebSocket 推送** → 浏览器收到 `update` 消息
5. **客户端 runtime** → re-import 这些模块、执行 accept callback

代码作者最关心的是**"模块边界处理"**——什么样的 import 链算是 HMR 边界？

```typescript
// 这种是边界（React 组件）
export default function Button() { ... }
if (import.meta.hot) {
  import.meta.hot.accept()   // ← 我自己处理我的更新
}

// 这种不是（普通 utility）
export function formatDate(...) { ... }
// 没有 hot.accept → 沿依赖向上找直到有 accept 的祖先
```

如果改了 `formatDate.ts`，但没有任何祖先 accept——HMR 就降级到 full reload。

→ **HMR 不是"魔法"**，是一个 dirty 传播 + accept boundary 的图算法。
Vite + plugin-react / plugin-vue 把"组件作为 HMR 边界"做成默认。

### 机制 7 · build 用 Rollup —— 不重新发明轮子

`packages/vite/src/node/build.ts`（1940 行）的核心是：

```typescript
import { rollup } from 'rollup'
// 配置好 input / output / plugins
const bundle = await rollup({ input, plugins })
await bundle.write({ format: 'es', dir: 'dist' })
```

Vite **没自己写 bundler**。它把 Rollup 当库用，加上自己的 plugins
（处理 HTML、CSS、asset 等），输出生产 bundle。

→ 这是**判断力的体现**：知道哪些事不该自己做。
Rollup 在 tree-shaking、scope hoisting、ES module 输出上是金标准——
Vite 不重做，直接用。

## 横向对比

### vs webpack — 完全不同的架构假设

webpack：dev 和 build 同栈，dev 也要把所有东西打包。
Vite：dev 和 build 不同栈，dev 用 native ESM，build 用 Rollup。

如果你的项目还要兼容 IE 11——只能 webpack。
否则 Vite 是 2026 年的合理默认。

### vs Parcel — 同代但路线不同

Parcel 也想做"零配置"，但坚持 dev 也打包。
Vite 通过"放弃 IE / 利用 ESM"获得了更激进的性能。

### vs Next.js — 框架 vs 工具

Next 是框架，Vite 是工具。Next 给你"路由 + 数据获取 + 优化策略"，
Vite 只给你"开发服务器 + 构建工具"。

如果做 SSR / SEO / RSC——选 Next。
如果做 SPA / 内部工具 / 想自由组合 React Router / TanStack Router——选 Vite。

### vs Turbopack — Vercel 的自家答案

Turbopack 是 Next 团队的"自研 webpack 替代"，Rust 写的，意图取代 webpack 在 Next 里的位置。
但它和 Vite 是不同哲学：Turbopack 仍然在 dev 打包（更智能、更增量），Vite 不打包。

性能上 Turbopack 接近 Vite，但**架构创新性 Vite 更高**——
Vite 是"做减法"的胜利。

## Hands-on（5 分钟内能跑）

```bash
npm create vite@latest my-app -- --template react-ts
cd my-app
npm install
npm run dev
```

打开浏览器 DevTools，**Network 面板观察请求模式**：

1. 启动 < 1 秒——已经能 import 了
2. 改一个组件——HMR 不刷新页面，瞬间反映
3. 看 `/node_modules/.vite/deps/` 下的预构建依赖

### 改一处的实验（必做）

打开 DevTools → Network → Filter 里输入 `tsx`：

修改一个 `.tsx` 文件，会看到一个新的 `transformRequest`。
记下 vite 怎么决定**哪些祖先模块需要重新加载**。

第二个实验：在 `vite.config.ts` 加 plugin 打印 transform：

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'log-transform',
      transform(code, id) {
        if (id.endsWith('.tsx')) {
          console.log('[transform]', id)
        }
        return null   // ← 不修改
      }
    }
  ]
})
```

打开浏览器，**在 dev server 终端看到每个文件的 transform log**。
这就是 Vite 的"按需转译"——只有被访问的文件被处理。

第三个实验：`npm run build` 后看 `dist/`，对比同样代码用 webpack 输出。
你会发现 Vite + Rollup 的产物**更小、更干净**。

## 与你工作的连接

**能立刻迁移**：

- 任何新 React / Vue / Svelte / Solid 项目用 Vite，**不要再选 webpack**
- 写 npm 包：用 [tsup](https://tsup.egoist.dev)（基于 esbuild）或 Vite library mode
- 内部工具的 dev server：用 Vite，启动快是高生产力

**下个月可能用到**：

- 给 Claude / MCP 写在线工具时，Vite 是事实标准
- SSR 应用：用 Vite + 自己集成 SSR runtime（Vite 提供 `vite/dist/node` 子模块）

**不要用 Vite 的部分**：

- **生产 SSR 应用 + SEO 极致敏感**——选 Next.js（更成熟）
- **必须支持 IE 11**——webpack 仍是答案
- **大型 monorepo + 复杂 plugin 链**——webpack / Turbopack 更有经验

## 读完你能做之前做不了的事

- **判断**：看到一个项目用 webpack 4 / 5，能立刻识别"为什么 dev 这么慢"和"迁移到 Vite 的成本"
- **设计**：写自己的 dev tool 时，问"哪些事可以外包给浏览器/标准而不是自己做"
- **解释**：被问"Vite 为什么快"时，能用"native ESM + 预构建依赖 + 按需转译" 三段论
- **下钻**：看懂 Bun / Deno 的 dev server 设计——它们和 Vite 同源思路
- **对照**：识别"我这个工具在 dev 阶段做的事是不是必要"——很多 dev 流程其实是 build 思维的污染

## 自检 · 5 个问题

1. Vite dev 不打包，为什么 `node_modules` 还要预构建？
   不预构建直接让浏览器 `import 'react'` 会怎样？
2. `transformRequest.ts` 里有 `_pendingRequests` 去重——和 [SWR 的 FETCH map](/study/projects/swr/) 同思路。
   如果不做去重，浏览器并发请求 100 个文件会发生什么？
3. Vite 的 plugin 用 Rollup 兼容 API。如果不兼容，自己设计一套 plugin API 有什么优劣？
4. HMR 的 accept boundary 机制。一个 `utils.ts` 改了，最坏情况是 full reload。
   如果 utils.ts 被 50 个组件引用，要怎么避免 full reload？
5. Vite 的 build 用 Rollup，dev 用 native ESM——这种"双栈"会在哪些场景产生 dev/build 不一致的 bug？

## 延伸阅读

读完 transformRequest.ts 后下一步：

1. `packages/vite/src/node/server/index.ts:470-700`——`_createServer` 完整实现
2. `packages/vite/src/node/server/hmr.ts`——HMR 协议算法
3. `packages/vite/src/node/optimizer/`——esbuild 依赖预构建
4. **Rollup** 设计文档（[github](https://github.com/rollup/rollup)）——理解为什么 Vite 选它做 build
5. **Bun** 的 dev server——Bun 是另一种"全栈 runtime"思路，对比 Vite 的"工具组合"哲学

---

**笔记完成**：2026-05-27（v8.0.14）
**研究方法**：本地克隆 + 自查 createServer / transformRequest / pluginContainer 关键路径
**心脏文件**：`packages/vite/src/node/server/transformRequest.ts:78-200`
