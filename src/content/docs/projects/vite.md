---
title: "Vite — dev/build 不对称的现代解"
description: dev 用 native ESM 让浏览器自己解依赖；build 用 Rollup 兼容 bundler 求干净——两套工具吃两边好处
sidebar:
  order: 20
  label: "vitejs/vite"
---

> vitejs/vite v7.1.12（2026-05），MIT，TypeScript。
>
> Vite 不是另一个 webpack。它的核心设计判断是：
> **dev 和 build 是两个完全不同的问题，不该用同一套架构解**。
>
> dev 的诉求是「启动快 + 改一行就 hot reload」。
> build 的诉求是「产出干净 + tree-shake 彻底 + 体积最小」。
>
> 大多数 bundler（webpack）想用一套架构两边都做，
> 结果两边都妥协。Vite 的回答：**两边各用最合适的工具**。
>
> v1.1 项目类型 · 分支 C（编译器/运行时） · 状元篇升级。
> Season 3 第二篇。

## 一句话定位

**Vite = dev 用 native ESM + esbuild 预构建依赖 + 按需转译 + HMR；build 用 Rollup 兼容 bundler（v7 已切到 rolldown，仍兼容 Rollup 插件 API）。**
两套不同工具，统一在同一套 plugin API 下——用户感知是一个工具。

> 对于 v1.1 分支 C 的「pipeline」抽象：vite 不是单条 lex→parse→codegen 流水线，
> 而是**两条并行 pipeline**（dev / build）共享一个 plugin 调度层。
> 这是它跟 biome / esbuild 这种「单 pipeline 编译器」最大的形态差异。

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
| **Vite** | **native ESM** | **Rollup-compat** | **< 1 秒** | **即时** |

**为什么不是 webpack**：webpack 用一套架构兼容旧浏览器是有历史包袱的。
Vite 是 2020 年生的，可以**假设浏览器原生支持 ESM**——这是设计前提的差异。

**为什么不是 Parcel**：Parcel 想「零配置」，理念好，但 dev 仍然在做打包。
Vite 直接放弃 dev 时打包这件事。

**为什么不是 Next.js Turbopack**：Turbopack 是 Vercel 的「webpack 替代品」野心，
仍然是 dev/build 同栈。Vite + Rollup-compat 的组合更轻、更模块化。

**Vite 的取舍代价**：
- **生产构建仍需要 bundler** → build 时间不会比 webpack 快特别多（v7 切 rolldown 后接近 esbuild）
- **不支持 IE 11** → 你的目标用户必须用现代浏览器
- **依赖必须能预构建** → 某些 CommonJS 包要靠 esbuild 转 ESM，偶尔出错
- **dev 和 build 行为可能不一致** → 经典的「dev 跑得好，build 后白屏」class（见限制段）

## Pipeline 全景图（v1.1 分支 C 必填 P0）

![双轨 pipeline：dev 走 native ESM 按需转译，build 走 Rollup 兼容 bundler，pluginContainer 把 Rollup hooks 桥接到两边](/projects/vite/01-pipeline.webp)

> 看图要点：
> 1. **左侧 split**：同一份源码进入两条独立路径，没有共享 bundling 阶段
> 2. **dev 4 phase**：optimizer（启动一次）→ server（每请求一次）→ transformRequest（每模块一次）→ hmr（文件变化时）
> 3. **build 4 phase**：config → build.ts 调用 rolldown → plugins 内置处理 css/asset/html → 输出 dist
> 4. **共享层 pluginContainer**：让同一个 Rollup plugin 在两条 pipeline 都能跑——这是 Vite 「生态复用」战略的关键

## 仓库地形（按 phase 重画）

```
vite/
└── packages/
    ├── vite/                                    ← ★ 主包
    │   └── src/
    │       └── node/                            ← Node 端代码
    │           │
    │           │  ─── Phase 1 · 配置解析 ───
    │           ├── config.ts                    ← 2728 行：resolveConfig + 默认值仓库
    │           ├── constants.ts                 ← target / 文件类型正则等常量
    │           │
    │           │  ─── Phase 2 · 依赖预构建 (启动一次) ───
    │           ├── optimizer/
    │           │   ├── index.ts                 ← 1476 行：optimizeDeps 主流程
    │           │   ├── scan.ts                  ← 786 行：扫源码找裸 import
    │           │   ├── resolve.ts               ← 解析 npm 包入口
    │           │   └── rolldownDepPlugin.ts     ← v7 改用 rolldown 做预构建（替换部分 esbuild）
    │           │
    │           │  ─── Phase 3 · Dev server (每请求) ───
    │           ├── server/
    │           │   ├── index.ts                 ← 1384 行：★ createServer / _createServer
    │           │   ├── moduleGraph.ts           ← 489 行：模块依赖图
    │           │   ├── transformRequest.ts      ← 565 行：★ 按需转译核心 + in-flight dedupe
    │           │   ├── pluginContainer.ts       ← 1326 行：★★ Rollup hooks 兼容调度器
    │           │   ├── hmr.ts                   ← 1160 行：★ HMR 状态机 / propagateUpdate
    │           │   ├── ws.ts                    ← 467 行：WebSocket 推送
    │           │   ├── warmup.ts                ← 100 行：dev.warmup 预热实现
    │           │   ├── middlewares/             ← Connect 中间件链
    │           │   ├── environments/            ← 环境抽象（client / ssr / worker）
    │           │   └── mixedModuleGraph.ts      ← 多 environment 模块图合并
    │           │
    │           │  ─── Phase 4 · Build (Rollup 兼容) ───
    │           ├── build.ts                     ← 1940 行：★ 调用 rolldown / 配置默认值
    │           │
    │           │  ─── Phase 5 · 横切 ───
    │           ├── plugins/                     ← 内置 plugin（css/asset/html/import-analysis）
    │           ├── ssr/                         ← SSR runtime（dev 用 ssrTransform，build 用 rolldown）
    │           └── shared/                      ← node 与 client runtime 共享 utils
    ├── plugin-react/                            ← React 官方 plugin（含 React Fast Refresh）
    ├── plugin-vue/                              ← Vue 官方 plugin（SFC 编译）
    ├── plugin-legacy/                           ← 给老浏览器降级（用 webpack 思路）
    └── create-vite/                             ← npm create vite 脚手架
```

**心脏文件清单（v1.1 分支 C：每个 phase 1 个代表实现）**

| Phase | 心脏文件 | 关键函数 / 行号 | 我的怀疑 |
|---|---|---|---|
| 配置解析 | [`config.ts:781`](https://github.com/vitejs/vite/blob/23de98e/packages/vite/src/node/config.ts#L781) | `warmup: []` 默认值 | 默认空数组——是不是有更激进的预热策略可选？ |
| 依赖预构建 | [`optimizer/index.ts:1`](https://github.com/vitejs/vite/blob/23de98e/packages/vite/src/node/optimizer/index.ts) | `optimizeDeps` 主流程 1476 行 | 1476 行的体量暗示这里的 edge case 极多（CJS / 动态 import / 嵌套依赖） |
| Dev server | [`server/index.ts:476`](https://github.com/vitejs/vite/blob/23de98e/packages/vite/src/node/server/index.ts#L476) | `_createServer` 入口 | 创建 server 这件事居然要 1384 行——为什么不能更薄？ |
| 按需转译 | [`server/transformRequest.ts:78`](https://github.com/vitejs/vite/blob/23de98e/packages/vite/src/node/server/transformRequest.ts#L78) | `transformRequest` + `doTransform` | 565 行核心，注释比代码多——边界情况密集 |
| HMR 状态机 | [`server/hmr.ts:768`](https://github.com/vitejs/vite/blob/23de98e/packages/vite/src/node/server/hmr.ts#L768) | `propagateUpdate` | dirty 传播是个图算法，有循环引用要处理 |
| Build 编排 | [`build.ts:378`](https://github.com/vitejs/vite/blob/23de98e/packages/vite/src/node/build.ts#L378) | `_buildEnvironmentOptionsDefaults` | 默认值集中在这里——是改一处实验的入口 |

> **怀疑 1**：`build.ts` 行数 1940，比 `transformRequest.ts` 565 大 3.4 倍。
> 但「调 Rollup」这件事概念上很简单——所以 1940 行里大部分应该是默认值 + 兼容性 + 多 environment 适配。
> 验证：见 Layer 4 改 default option 的实验。

> **怀疑 2**：`pluginContainer.ts` 1326 行，几乎追平 `server/index.ts` 1384。
> 一个「兼容层」竟然这么重——是不是 Rollup hooks 的契约比想象中复杂？
> 实际：dev 时要模拟 Rollup 的 `this` 上下文（PluginContext），所有 utility（emitFile / resolve / warn）都要桥接。

## 核心机制 · Layer 3 精读（按 phase 切，3 段）

### 机制 1 · Phase 2 依赖预构建 — 唯一在 dev 仍需「打包」的地方

#### 1.1 为什么必须预构建

如果 dev 不打包，`node_modules` 里的依赖怎么处理？

考虑一个场景：你 `import { Button } from 'antd'`。antd 内部有 1000+ 个文件互相 import，
每个都要请求一次——浏览器会**卡死**（HTTP/1.1 默认 6 并发，HTTP/2 也有上限）。

更隐蔽的问题：**很多 npm 包还是 CommonJS**。
浏览器 ESM 规范不认 `module.exports`，必须有人把 `require` 转成 `import`。

Vite 的回答：**对 npm 依赖做预构建**。

#### 1.2 实现细节

`packages/vite/src/node/optimizer/scan.ts` (786 行) + `optimizer/index.ts` (1476 行)：

1. **scan**：扫源码，找出所有从 `node_modules` 引入的裸 import（`from 'react'` 这种）
2. **optimize**：用 esbuild（v7 部分切到 rolldown）把它们打包成单文件
3. **cache**：放到 `node_modules/.vite/deps/`，下次启动检查依赖版本，没变就直接复用
4. **rewrite**：浏览器请求 `import 'react'` 时，import-analysis plugin 把它重写成 `/node_modules/.vite/deps/react.js?v=<hash>`

→ 这是 Vite 的「判断分水岭」：**应用代码按需转译，依赖代码预构建**。
两者用不同策略。esbuild 在这里发挥极致——预构建几百个包只要几秒。

#### 1.3 为什么默认 target 是 baseline-widely-available（怀疑 + 锚点）

[`constants.ts:90`](https://github.com/vitejs/vite/blob/23de98e/packages/vite/src/node/constants.ts#L90) 定义了 baseline target：

```typescript
export const ESBUILD_BASELINE_WIDELY_AVAILABLE_TARGET: string[] = [
  'chrome111',     // 2023-03
  'edge111',       // 2023-03
  'firefox114',    // 2023-06
  'safari16.4',    // 2023-03
  'ios16.4',       // 2023-03
]
```

**怀疑 3**：为什么不是「最新版本浏览器」？因为 web platform 的 baseline 概念——
被三大浏览器实现且**所有用户都升级到这个版本之上**（约两年半窗口）的特性集合。
Vite 把 dev 和 build 的默认 target 都指向这个集合，是赌「你的用户已经升过这个 baseline」。

#### 1.4 衍生效应：dev / build 的 target 一致

依赖预构建用的也是同一个 baseline（[`optimizer/index.ts:839`](https://github.com/vitejs/vite/blob/23de98e/packages/vite/src/node/optimizer/index.ts#L839)）。

```typescript
target: ESBUILD_BASELINE_WIDELY_AVAILABLE_TARGET,
```

→ 这意味着 dev 时 esbuild 转出来的 deps 包不会用更新的语法，
和 build 后 rolldown 输出的产物在「能不能跑」这件事上对齐。
**这是双轨架构最容易踩雷的地方**——target 必须强一致，否则 dev 没问题、build 后白屏。

### 机制 2 · Phase 3 dev server 按需转译 — transformRequest 全链路

![dev 一次 import 的全链路：browser → server → cache → plugin chain → moduleGraph，含 in-flight dedupe](/projects/vite/02-transform-request.webp)

#### 2.1 入口：transformRequest

`packages/vite/src/node/server/transformRequest.ts:78-148`：

```typescript
export function transformRequest(
  environment: DevEnvironment,
  url: string,
  options: TransformOptionsInternal,
): Promise<TransformResult | null> {
  if (environment._closing && environment.config.dev.recoverable)
    throwClosedServerError()

  const timestamp = monotonicDateNow()
  url = removeTimestampQuery(url)

  const pending = environment._pendingRequests.get(url)
  if (pending) {
    return environment.moduleGraph.getModuleByUrl(url).then((module) => {
      if (!module || pending.timestamp > module.lastInvalidationTimestamp) {
        return pending.request          // ← 复用 in-flight promise
      } else {
        pending.abort()                  // ← 模块已被 invalidate，作废
        return transformRequest(environment, url, options)  // 重新跑
      }
    })
  }

  const request = doTransform(environment, url, options, timestamp)
  // ... 缓存进行中的请求
  environment._pendingRequests.set(url, { request, timestamp, abort: clearCache })
  return request.finally(clearCache)
}
```

[GitHub 锚点](https://github.com/vitejs/vite/blob/23de98e/packages/vite/src/node/server/transformRequest.ts#L78)

#### 2.2 三层 cache（自下而上）

| 层 | 实现 | 作用 |
|---|---|---|
| **in-flight dedupe** | `_pendingRequests` Map | 并发请求同 URL 时复用 promise |
| **moduleGraph url cache** | `getModuleByUrl(url)` 后查 `transformResult` | 同 URL 第二次直接返回 |
| **moduleGraph id cache** | resolve 出真实 id 后，按 id 再查一次 | 不同 query/timestamp 但同 id 时复用 |

[`transformRequest.ts:150-207`](https://github.com/vitejs/vite/blob/23de98e/packages/vite/src/node/server/transformRequest.ts#L150) 的 `doTransform` 严格按这个顺序：

```typescript
async function doTransform(...) {
  let module = await environment.moduleGraph.getModuleByUrl(url)
  if (module) {
    const cached = await getCachedTransformResult(...)
    if (cached) return cached            // 第二层 hit
  }

  const resolved = module
    ? undefined
    : (await pluginContainer.resolveId(url, undefined)) ?? undefined

  const id = module?.id ?? resolved?.id ?? url
  module ??= environment.moduleGraph.getModuleById(id)
  if (module) {
    await environment.moduleGraph._ensureEntryFromUrl(url, undefined, resolved)
    const cached = await getCachedTransformResult(...)
    if (cached) return cached            // 第三层 hit
  }

  const result = loadAndTransform(...)   // miss → 跑 plugin chain
  // ...
  return result
}
```

#### 2.3 in-flight dedupe 的实战意义

**怀疑 4**：和 [SWR 的 FETCH map](/study/projects/swr/) 是同一个思路——多个调用方等同一个 promise。
但 Vite 的语义比 SWR 更微妙：还要看 `pending.timestamp > module.lastInvalidationTimestamp`。

为什么？因为模块可能在 transform 进行中被 invalidate（如 HMR / 用户改代码 / 依赖预构建发现新 dep 触发 reload）。
这种情况下 in-flight 的 promise 是 stale 的，必须 abort 重跑。

→ 这种 «进行中 + 时间戳 + invalidation» 的三元组才是真正的 dedupe 语义，
不是简单的 «promise.race» 或 «单 flight»。

#### 2.4 plugin chain（resolveId / load / transform）

cache miss 后，`loadAndTransform` 调三个 hook：

1. **resolveId**：`./App.tsx` → `/abs/path/App.tsx`（含路径别名 / extension 补全）
2. **load**：从磁盘读文件（plugin 也可以返回虚拟模块）
3. **transform**：转译 — `@vitejs/plugin-react` 把 JSX 变 JS、`vite:css` 把 CSS 变 ES module

这三个 hook **完全照搬 Rollup 的 plugin contract**。`pluginContainer.ts` 1326 行的工作，
就是在 dev 时构造一个**和 Rollup build 时同形态的 plugin context**——
让同一个 Rollup plugin 不改一行代码，dev 和 build 都能跑。

> **怀疑 5**：「兼容 Rollup」是不是过度承诺？
> 不是。这是 Vite 拿到生态最快的钥匙——Rollup 多年积累的 plugin（`@rollup/plugin-commonjs` / `@rollup/plugin-node-resolve` / 各种 framework 适配）直接可用。
> 代价：1326 行的兼容层 + 一些 Rollup hook 在 dev 语义上微妙不同（如 `emitFile`）。

### 机制 3 · Phase 3 HMR — dirty 传播 + accept boundary 的图算法

#### 3.1 触发链路

`packages/vite/src/node/server/hmr.ts`（1160 行）：

```
chokidar 看到文件变化
   ↓
handleHMRUpdate (hmr.ts:380)
   ↓
查 moduleGraph 找到受影响的 ModuleNode
   ↓
updateModules (hmr.ts:642)
   ↓
对每个 dirty 模块跑 propagateUpdate (hmr.ts:768)
   ↓
WebSocket 推 update payload 到浏览器
   ↓
client runtime 执行 hot.accept callback / re-import 模块
```

#### 3.2 propagateUpdate 算法（核心，含怀疑）

[`hmr.ts:768-849`](https://github.com/vitejs/vite/blob/23de98e/packages/vite/src/node/server/hmr.ts#L768) 是 HMR 的灵魂。
读懂这一段就读懂了 HMR：

```typescript
function propagateUpdate(
  node: EnvironmentModuleNode,
  traversedModules: Set<EnvironmentModuleNode>,
  boundaries: PropagationBoundary[],
  currentChain: EnvironmentModuleNode[] = [node],
): HasDeadEnd {
  if (traversedModules.has(node)) return false   // 防循环
  traversedModules.add(node)

  if (node.id && node.isSelfAccepting === undefined) {
    // 模块还没被浏览器加载过 → 不需要 propagate
    return false
  }

  if (node.isSelfAccepting) {
    // import.meta.hot.accept() 自接受 → 这就是边界
    boundaries.push({ boundary: node, acceptedVia: node, ... })
    return false
  }

  if (node.acceptedHmrExports) {
    // 部分接受（accept 特定 export）
    boundaries.push({ ... })
  } else {
    if (!node.importers.size) return true        // 没人 import 我 → dead end → full reload
  }

  for (const importer of node.importers) {
    if (importer.acceptedHmrDeps.has(node)) {
      boundaries.push({ ... })                    // 上游接受我 → 边界在上游
      continue
    }
    // 否则继续往上递归
    if (!currentChain.includes(importer) &&
        propagateUpdate(importer, traversedModules, boundaries, ...)) {
      // 递归发现 dead end → 这条路要 full reload
    }
  }
}
```

#### 3.3 三种结局

| 结局 | 条件 | 视觉效果 |
|---|---|---|
| **HMR 成功** | 沿 importers 反向找到 self-accepting 或 deps-accepting 边界 | 页面不刷新，组件 in-place 替换 |
| **partial accept** | 找到 `acceptedHmrExports` 边界 | 仅特定 export 替换，其他保持 |
| **full reload** | 任意一条 import 链走到 dead end（无 importer 且未 accept） | 浏览器整页刷新 |

#### 3.4 React / Vue 的「天然边界」

`@vitejs/plugin-react` 给每个 `.tsx` 自动注入：

```typescript
if (import.meta.hot) {
  import.meta.hot.accept((newModule) => {
    // React Fast Refresh runtime 处理
  })
}
```

这就是为什么改一个 React 组件**永远不 full reload**——
plugin-react 已经把每个组件文件都标成了 self-accepting 边界。

> **怀疑 6**：那 `utils/format.ts` 这种纯函数文件改了会怎样？
> plugin-react 不会给它注入 accept（它不是组件）。propagateUpdate 沿 importers 往上爬，
> 第一个组件文件被找到时就是边界——重新加载这个组件 + 它的所有 transitive imports（含改过的 utils）。
> 结果：组件 re-render，但 React state 会被 React Fast Refresh 保留下来。

## 改一处 · Hands-on（v1.1 分支 C 必填 — 改 default option，看 byte-level diff）

### 跑通 5 分钟

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

### 改一处实验：把 build.target 从 `baseline-widely-available` 改到 `es2015`

这是 v1.1 分支 C 要求的「改 default option，跑 toy 文件 before/after 字节级对比」。

#### 实验设置

`/tmp/vite-experiment/main.js`（toy 输入，故意用了几个现代语法）：

```javascript
class A { #priv = 1; get x() { return this.#priv; } }   // 私有字段
const f = async () => {                                  // async + 箭头
  const arr = [1, 2, 3];
  const [a, ...rest] = arr;                              // 解构 + rest
  const obj = { a };
  return obj?.a ?? 0;                                    // optional chain + nullish coalescing
};
f().then((result) => {
  const a = new A();
  document.body.innerText = result + ' ' + a.x;
});
```

两个 config 只差 `build.target`：

```javascript
// vite.config.modern.js
export default { build: { target: 'baseline-widely-available', minify: false } }

// vite.config.legacy.js
export default { build: { target: 'es2015', minify: false } }
```

#### 跑两次 build

```bash
npx vite build --config vite.config.modern.js   # → dist-modern/
npx vite build --config vite.config.legacy.js   # → dist-legacy/
```

输出：

```
dist-modern/main.js    1.48 kB │ gzip: 0.65 kB
dist-legacy/main.js    3.19 kB │ gzip: 1.21 kB
```

**字节差异：1476 → 3190，体积 +116%；gzip 后 0.65 → 1.21 kB，+86%**。

#### Before / After 字节对比

**modern**（target=baseline-widely-available）保留所有现代语法：

```javascript
class A {
  #priv = 1;                      // 私有字段直接保留
  get x() { return this.#priv; }
}
const f = async () => {           // async 直接保留
  const arr = [1, 2, 3];
  const [a, ...rest] = arr;       // 解构直接保留
  const obj = { a };
  return obj?.a ?? 0;             // optional chain 直接保留
};
```

**legacy**（target=es2015）插入大量 polyfill helper：

```javascript
var __privateGet = (obj, member, getter) =>
  (__accessCheck(obj, member, "read from private field"),
   getter ? getter.call(obj) : member.get(obj));
var __privateAdd = (obj, member, value) =>
  member.has(obj) ? __typeError(...) :
  member instanceof WeakSet ? member.add(obj) : member.set(obj, value);
var __async = (__this, __arguments, generator) => {
  return new Promise((resolve, reject) => {
    var fulfilled = (value) => { try { step(generator.next(value)); } ... };
    var rejected = (value) => { ... };
    var step = (x) => x.done ? resolve(x.value) : Promise.resolve(x.value).then(fulfilled, rejected);
    step((generator = generator.apply(__this, __arguments)).next());
  });
};
// ...
class A {
  constructor() { __privateAdd(this, _priv, 1); }    // 私有字段 → WeakMap
  get x() { return __privateGet(this, _priv); }
}
_priv = new WeakMap();
const f = () => __async(null, null, function* () {   // async/await → generator + Promise
  // ...
  return (_a = obj == null ? void 0 : obj.a) != null ? _a : 0;   // optional chain 展开
});
```

#### 字节级解读（v1.1 分支 C 必填）

| 现代语法 | modern 字节 | legacy 后字节 | 增量来源 |
|---|---|---|---|
| `#priv` 私有字段 | 直接写 | 7 行 helper（`__accessCheck` / `__privateAdd` / `__privateGet`）+ WeakMap 包装 | ~+450 字节 |
| `async () => {}` | 直接写 | `__async` 17 行 helper + generator 改写 | ~+520 字节 |
| `obj?.a ?? 0` | 直接写 | `obj == null ? void 0 : obj.a` + `(_a = ...) != null ? _a : 0` | ~+50 字节 |
| `[a, ...rest]` | 直接写 | rolldown 内部还能保留（spread 在 ES2015 已有） | ~0 |

> **怀疑 7**：实测 +1714 字节里，**70% 来自 async + 私有字段两个 helper**。
> 这两个特性是 ES2017 / ES2022 才标准化的——target=es2015 必须 polyfill。
> 反过来如果你的 target 设成 es2020，increment 会大幅缩小（私有字段保留，仅 async 转）。
>
> **怀疑 8**：default 选 baseline-widely-available 而不是 esnext，是在「兼容性」和「体积」之间找平衡——
> 不为了几个还在升级窗口的浏览器付出体积代价。

### 第二个实验：在真实项目里跑 dev 看 transform log

在 `vite.config.ts` 加 plugin 打印 transform：

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
这就是 Vite 的「按需转译」——只有被访问的文件被处理。

→ 把这条 log 关掉、改一个文件，**只看到这一个文件被 transform**。
对比 webpack 的「改一行重打整个 chunk」——直观差异。

### 第三个实验：跑 npm run build 看产物结构

```bash
npm run build
ls -la dist/
```

观察：

- `dist/assets/index-<hash>.js` — 主入口
- `dist/assets/index-<hash>.css` — 抽出来的 CSS
- `dist/index.html` — 引用上面两个的 HTML

对比 webpack 同样代码——Vite + Rollup 兼容 bundler 的产物**更小、更干净**（tree-shaking 更彻底）。

## 横向对比

### vs webpack — 完全不同的架构假设

webpack：dev 和 build 同栈，dev 也要把所有东西打包。
Vite：dev 和 build 不同栈，dev 用 native ESM，build 用 Rollup 兼容。

如果你的项目还要兼容 IE 11——只能 webpack。
否则 Vite 是 2026 年的合理默认。

### vs Parcel — 同代但路线不同

Parcel 也想做「零配置」，但坚持 dev 也打包。
Vite 通过「放弃 IE / 利用 ESM」获得了更激进的性能。

### vs Next.js — 框架 vs 工具

Next 是框架，Vite 是工具。Next 给你「路由 + 数据获取 + 优化策略」，
Vite 只给你「开发服务器 + 构建工具」。

如果做 SSR / SEO / RSC——选 Next。
如果做 SPA / 内部工具 / 想自由组合 React Router / TanStack Router——选 Vite。

### vs Turbopack — Vercel 的自家答案

Turbopack 是 Next 团队的「自研 webpack 替代」，Rust 写的，意图取代 webpack 在 Next 里的位置。
但它和 Vite 是不同哲学：Turbopack 仍然在 dev 打包（更智能、更增量），Vite 不打包。

性能上 Turbopack 接近 Vite，但**架构创新性 Vite 更高**——
Vite 是「做减法」的胜利。

### vs Rolldown — 同体系换核

Rolldown 是 Rollup 用 Rust 重写的版本（VoidZero 主导），意图保持 plugin API 兼容。
Vite v7 已经把 build 默认 bundler 切到了 rolldown（[`build.ts:25`](https://github.com/vitejs/vite/blob/23de98e/packages/vite/src/node/build.ts#L25) `from 'rolldown'`），
对用户是无感的——同一个 plugin、同一个 config，build 速度 5-10x。

→ 这是 Vite 「双轨」策略的胜利：dev 不依赖 Rollup（早就解耦），build 切 bundler 是局部替换，不动 dev 一行。

### 维度对比表

| 维度 | webpack | Parcel | Next.js | Vite | Turbopack |
|---|---|---|---|---|---|
| dev 启动 | 10-30 秒 | 5-15 秒 | 5-20 秒 | < 1 秒 | < 1 秒 |
| dev 是否打包 | 是 | 是 | 是 | 否 | 是（增量） |
| HMR 速度 | 1-3 秒 | < 1 秒 | 1-2 秒 | 即时 | 即时 |
| build bundler | webpack | Parcel | webpack | Rollup/rolldown | Turbopack |
| plugin 生态 | webpack 自有 | Parcel 自有 | webpack 复用 | Rollup 复用 | Turbopack 自建 |
| IE 11 支持 | ✅ | ✅ | ✅ | ❌（plugin-legacy） | ❌ |
| 推荐场景 | legacy 项目 | 学习用 | SSR/SEO 应用 | SPA / 工具 | Next 应用 |

## 与你工作的连接

### 今天就能用

- 任何新 React / Vue / Svelte / Solid 项目用 Vite，**不要再选 webpack**
- 写 npm 包：用 [tsup](https://tsup.egoist.dev)（基于 esbuild）或 Vite library mode
- 内部工具的 dev server：用 Vite，启动快是高生产力

### 下个月可能用到

- 写在线工具时，Vite 是事实标准
- SSR 应用：用 Vite + 自己集成 SSR runtime（Vite 提供 `vite/dist/node` 子模块）
- 配置 `server.warmup` 预加载关键文件，避免首次访问慢

### 不要用 Vite 的部分

- **生产 SSR 应用 + SEO 极致敏感**——选 Next.js（更成熟）
- **必须支持 IE 11**——webpack 仍是答案
- **大型 monorepo + 复杂 plugin 链**——webpack / Turbopack 更有经验
- **改 build.target 跨度太大**——见上面字节对比，target=es2015 体积可能 +100%

## 读完你能做之前做不了的事

- **判断**：看到一个项目用 webpack 4 / 5，能立刻识别「为什么 dev 这么慢」和「迁移到 Vite 的成本」
- **设计**：写自己的 dev tool 时，问「哪些事可以外包给浏览器/标准而不是自己做」
- **解释**：被问「Vite 为什么快」时，能用「native ESM + 预构建依赖 + 按需转译」三段论
- **下钻**：看懂 Bun / Deno 的 dev server 设计——它们和 Vite 同源思路
- **对照**：识别「我这个工具在 dev 阶段做的事是不是必要」——很多 dev 流程其实是 build 思维的污染
- **取舍**：调 build.target 时知道 modern → legacy 大概会增加多少字节（有量化基线，不是手感）

## 自检 · 5 个具体到行号的问题

1. **Vite dev 不打包，为什么 `node_modules` 还要预构建？**
   不预构建直接让浏览器 `import 'react'` 会怎样？
   提示：[`optimizer/scan.ts`](https://github.com/vitejs/vite/blob/23de98e/packages/vite/src/node/optimizer/scan.ts) 786 行的存在意义是什么？

2. **`transformRequest.ts:110-127` 的 `_pendingRequests` 去重逻辑**——
   和 [SWR 的 FETCH map](/study/projects/swr/) 同思路。
   如果不做去重，浏览器并发请求 100 个文件会发生什么？
   为什么 `pending.timestamp > module.lastInvalidationTimestamp` 这个检查不能省？

3. **Vite 的 plugin 用 Rollup 兼容 API**（[`pluginContainer.ts`](https://github.com/vitejs/vite/blob/23de98e/packages/vite/src/node/server/pluginContainer.ts) 1326 行）。
   如果不兼容，自己设计一套 plugin API 有什么优劣？
   为什么这个「兼容层」要 1326 行——具体在桥接什么？

4. **HMR 的 accept boundary 机制**（[`hmr.ts:768`](https://github.com/vitejs/vite/blob/23de98e/packages/vite/src/node/server/hmr.ts#L768) `propagateUpdate`）。
   一个 `utils.ts` 改了，最坏情况是 full reload。
   如果 utils.ts 被 50 个组件引用，要怎么避免 full reload？
   `node.isSelfAccepting === undefined` 这条 early return 解决的是什么 race？

5. **Vite 的 build 用 rolldown，dev 用 native ESM——这种「双栈」会在哪些场景产生 dev/build 不一致的 bug？**
   特别考虑 [`build.ts:378`](https://github.com/vitejs/vite/blob/23de98e/packages/vite/src/node/build.ts#L378) 默认 target 和 dev 的 target 是否一致。

## 限制（诚实段）

**没读 / 没跑 / 不确定的地方**：

- ❌ 没读 SSR runtime（`packages/vite/src/node/ssr/`）的细节——只知道 dev 用 ssrTransform，build 用 rolldown 走另一条 input
- ❌ 没读 `pluginContainer.ts` 1326 行的完整实现，只确认了它是「Rollup hooks 兼容层」这个判断
- ❌ 没跑过 plugin-legacy 的实际产出——它是给老浏览器降级用的，会同时输出 modern + legacy 两套 bundle
- ❌ 没研究 `mixedModuleGraph.ts`——这是 v6 引入的多 environment 模块图合并，含义还没完全吃透
- ❌ rolldown 的内部实现没读——它是 Rust 的，本笔记把它当 「Rollup-API 兼容的更快替代」处理
- ❌ HMR client runtime（`packages/vite/src/client/`）只看了一眼，没追完 `import.meta.hot` 的浏览器侧实现
- ✅ Layer 4 改一处实验**真跑了**——`/tmp/vite-experiment` 双 config + npm run build × 2，字节数字是实测

## 附录 · 宣传 vs 代码现实

**「Vite dev 不打包」**：✅ 应用代码不打包；❌ npm 依赖必须预构建（esbuild/rolldown 打包到 `.vite/deps/`）。
两种叙述都对，看你说哪一层。

**「Vite 用 Rollup」**：⚠️ 准确说 v7 之前用 Rollup，v7 切到 rolldown（Rust 实现的 Rollup-API 兼容版）。
对用户无感，对 plugin 作者也无感（API 完全一样）。

**「Vite 是 2020 年生的所以没历史包袱」**：✅ 大方向对。但 v6 / v7 的 environment API、rolldown 切换、SSR 改造都是为了**长期演进**做的——
不是一开始就完美，是不断在「保持 dev 哲学」前提下往上长能力。

**「< 1 秒启动」**：✅ 但只看的是 dev server **HTTP listen 的时刻**，不是「页面完全加载」。
真实首次访问页面还要等 optimizer 完成预构建（如果是冷启动）。
v6 的 [`server.warmup`](https://github.com/vitejs/vite/blob/23de98e/packages/vite/src/node/config.ts#L194) 就是为了缓解这个：
让 server 主动预 transform 关键文件，不等浏览器请求。

## 延伸阅读

读完 transformRequest.ts 后下一步：

1. [`packages/vite/src/node/server/index.ts:476-720`](https://github.com/vitejs/vite/blob/23de98e/packages/vite/src/node/server/index.ts#L476)——`_createServer` 完整实现
2. [`packages/vite/src/node/server/hmr.ts:380-660`](https://github.com/vitejs/vite/blob/23de98e/packages/vite/src/node/server/hmr.ts#L380)——HMR 协议算法（含 file→module→update payload 全链路）
3. [`packages/vite/src/node/optimizer/index.ts:1-200`](https://github.com/vitejs/vite/blob/23de98e/packages/vite/src/node/optimizer/index.ts)——esbuild/rolldown 依赖预构建总入口
4. [`packages/vite/src/node/server/pluginContainer.ts`](https://github.com/vitejs/vite/blob/23de98e/packages/vite/src/node/server/pluginContainer.ts)——Rollup hooks 桥接的 1326 行苦工
5. **Rollup** 设计文档（[github](https://github.com/rollup/rollup)）——理解为什么 Vite 选它做 build
6. **Rolldown** 文档（[github](https://github.com/rolldown/rolldown)）——Rust 实现的 Rollup-API 兼容 bundler，v7 默认
7. **Bun** 的 dev server——Bun 是另一种「全栈 runtime」思路，对比 Vite 的「工具组合」哲学

---

**笔记完成**：2026-05-28（v7.1.12 / commit 23de98e1424294a96c5ebe9cdf5d199d287272aa）
**研究方法**：本地克隆 + 自查 createServer / transformRequest / pluginContainer / hmr propagateUpdate / build.ts 关键路径
**心脏文件**：[`packages/vite/src/node/server/transformRequest.ts:78-207`](https://github.com/vitejs/vite/blob/23de98e/packages/vite/src/node/server/transformRequest.ts#L78)
**升级模板**：v1.1 项目类型分支 C（编译器/运行时） · 双 figure / 显式 8 处怀疑 / 改 default option byte-level 实测
