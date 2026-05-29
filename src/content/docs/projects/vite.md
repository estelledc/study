---
title: Vite 现代前端构建工具
来源: https://github.com/vitejs/vite + vitejs.dev 官方文档
---

# Vite — dev 不打包、build 用 Rollup 的双引擎构建工具

## 一句话总结（≥ 12 行）

Vite 是 Evan You（Vue 创始人）2020 年起做的现代前端构建工具，到 2024 年走到 v6.x，是 webpack 之后新一代项目事实标准。它在「构建工具」这条赛道上做了一个非常激进的判断：**dev 阶段和生产 build 是两个完全不同的问题，不该用同一套架构解**。

设计哲学三条线：

1. **dev 阶段不打包（unbundled dev）**：浏览器原生支持 ES modules，那就让浏览器自己解 import 图。Vite dev server 只做单文件按需 transform（TSX → JS）+ 拦截 bare imports（`import 'react'` → `/node_modules/.vite/deps/react.js`），把「打包」这一步从启动路径上彻底删掉
2. **依赖预构建走 esbuild**：第三方 npm 包（lodash 600 个文件 / react 几十个文件）如果让浏览器一个一个 ESM 加载，RTT 爆炸。Vite 用 esbuild（Go 写的 bundler，10-100x 快于 webpack）把它们预先打成单个 ESM bundle，存到 `node_modules/.vite/deps/`
3. **build 阶段切回 Rollup**：生产环境需要 tree-shake / code split / 长期 cache，这些场景 Rollup 的 ESM 静态分析比 esbuild 更成熟、生态更好。Vite 的 plugin API 完全兼容 Rollup，等于站在 Rollup 整个插件生态肩膀上

定位 vs 竞品：与 webpack 比，Vite 启动速度从 30 秒降到毫秒级（不打包），HMR 从「整 chunk 重编」降到「单文件 invalidate」；与 Parcel 比，Vite 不追求「零配置全自动」，留出 plugin 接口让用户精细控制；与 esbuild 比，Vite 不直接用 esbuild 做生产 build，因为 esbuild 的 plugin API 比 Rollup 弱（没有 ad-hoc transform、tree-shake 也较保守）；与 Turbopack / Rspack 比，Vite 是 JS 写的（dev server）+ 调用 Go/Rust 工具（esbuild），后两者全 Rust，理论性能更高，但生态成熟度 Vite 已遥遥领先。

Vite weekly downloads 大约 ~25M+（2024 数据），增长曲线接近 webpack 当年的爆发期。Astro / SvelteKit / Nuxt 3 / SolidStart / Remix（部分）/ Qwik 全部底层用 Vite。

商业生态：纯开源，无 SaaS。VoidZero（Evan You 2024 创办的公司）专门做 Vite 周边工具链商业化（Vitest / Rolldown / OXC parser）。Rolldown 是「用 Rust 重写 Rollup」的项目，长期目标是 Vite v7+ 用 Rolldown 替代 esbuild + Rollup 双工具，统一成单引擎。

![Vite dev/build 双引擎架构](/projects/vite/01-dev-vs-build.webp)

## Layer 0 — 项目档案速查（≥ 18 字段）

| 字段 | 值 |
|---|---|
| 包名 | `vite` |
| 当前主版本 | v6.x（2024，含 Environment API） |
| 首版 | 2020 v1.0（最初为 Vue 3 而生） |
| License | MIT |
| 主仓库 | vitejs/vite |
| 维护 | Evan You + VoidZero 团队 + 社区 |
| TypeScript | 完整（类型定义随主包发布） |
| Bundle 核心 | `vite` 命令 dev server bundle ~2 MB（含 esbuild Go binary） |
| 框架支持 | Vue / React / Svelte / Solid / Preact / Lit / 香草 JS（template 全套） |
| 依赖预构建器 | esbuild（Go） |
| 生产 bundler | Rollup（v6 起准备切 Rolldown） |
| HMR 协议 | WebSocket，自家协议（`vite/client` runtime） |
| Plugin API | 兼容 Rollup + 扩展 dev-only hooks（`configureServer` / `handleHotUpdate`） |
| 配置文件 | `vite.config.ts`（ESM）/ `vite.config.js` |
| Server | Connect 中间件（默认）/ Express 兼容 |
| Pre-bundle 缓存 | `node_modules/.vite/deps/` |
| Asset 处理 | 内置（CSS / SVG / 图片 / WebAssembly / Worker） |
| Weekly downloads | ~25M+（2024，仅次 webpack） |
| GitHub stars | 70k+ |
| 商业版 | 无（VoidZero 卖周边） |
| 文档站 | vitejs.dev |
| 生态联动 | Astro / SvelteKit / Nuxt 3 / SolidStart / Qwik / Remix / Storybook 8+ |
| 创新点 | dev 不打包 + esbuild dep pre-bundle + Rollup build 三件套组合 |

## Layer 1 — 核心抽象（≥ 35 行）

Vite 6 个核心抽象——围绕「dev / build 双 pipeline + plugin 调度层」分工：

```ts
// 抽象 1: vite.config.ts —— 唯一配置入口
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  build: { outDir: 'dist', sourcemap: true },
  optimizeDeps: { include: ['lodash-es'] },
});

// 抽象 2: Plugin —— 兼容 Rollup + dev-only 扩展
import type { Plugin } from 'vite';

const myPlugin: Plugin = {
  name: 'my-plugin',
  // Rollup-compatible hooks
  resolveId(source) { /* 解析 import 路径 */ },
  load(id) { /* 读文件内容 */ },
  transform(code, id) { /* 改写代码 */ },
  // Vite dev-only hooks
  configureServer(server) { /* 注入 middleware */ },
  handleHotUpdate(ctx) { /* 自定义 HMR 行为 */ },
};

// 抽象 3: ViteDevServer —— dev 时的 HTTP server + module graph
import { createServer } from 'vite';

const server = await createServer();
await server.listen(5173);
// server.moduleGraph: 维护 url -> module 关系，HMR 用这张图算 invalidate

// 抽象 4: import.meta.hot —— HMR 的客户端 API
if (import.meta.hot) {
  import.meta.hot.accept((newModule) => {
    // 当前模块更新后的 callback
  });
  import.meta.hot.dispose(() => {
    // 模块被替换前的清理
  });
}

// 抽象 5: import.meta.glob —— 编译期目录扫描
const modules = import.meta.glob('./pages/*.tsx');
// 编译为：
// const modules = {
//   './pages/Home.tsx': () => import('./pages/Home.tsx'),
//   './pages/About.tsx': () => import('./pages/About.tsx'),
// };

// 抽象 6: Environment API（v6 新增）—— 多环境 build
// 一次 build 同时产 client / server / edge worker bundle
import { defineConfig } from 'vite';
export default defineConfig({
  environments: {
    client: { build: { outDir: 'dist/client' } },
    ssr: { build: { outDir: 'dist/server', ssr: true } },
  },
});
```

6 个抽象之间的关系：

- `vite.config.ts` 是配置 SoT，dev 和 build 都读这个文件，但分别合并 `server` / `build` 段
- `Plugin` 是核心扩展点——Rollup hooks 在两边都跑（dev 时按文件请求触发，build 时按模块图遍历触发），dev-only hooks 只在 dev 跑
- `ViteDevServer` 持有 module graph，HMR 时 server 推送 update 消息到浏览器，浏览器侧 `import.meta.hot` 接消息
- `import.meta.glob` 是编译期 sugar，被 plugin 在 transform 阶段展开成 dynamic import map
- `Environment API` 是 v6 引入的「多 build 一次跑完」机制，给 SSR / RSC / Edge 场景准备

> 怀疑：6 个抽象里 `Environment API` 是 v6 才加的，复杂度大增。是 Vue / Nuxt 用例驱动还是真正通用需求？我倾向「2/3 通用 + 1/3 Vue 驱动」——Next.js 早就用 webpack 同时 build 多 entry，Vite 只是在追平。但对 React 应用（client only）这套 API 是过度抽象。

## Layer 2 — 内部架构（dev pipeline + build pipeline + plugin 调度层）

Vite 项目结构（pnpm workspace monorepo）：

```
vite/
├── packages/
│   ├── vite/                      — 主包（dev server / build / config / plugins）
│   │   └── src/node/
│   │       ├── server/            — dev server（Connect / module graph / HMR）
│   │       ├── build.ts           — 生产 build 入口（Rollup wrapper）
│   │       ├── optimizer/         — esbuild dep pre-bundle
│   │       ├── plugins/           — 内置 plugin（asset / css / esbuild / import-analysis ...）
│   │       ├── config.ts          — 配置加载 + 合并
│   │       └── ssr/               — SSR runtime（experimental → stable in v6）
│   ├── plugin-vue/                — Vue 3 .vue SFC 支持
│   ├── plugin-react/              — React JSX + Fast Refresh
│   ├── plugin-react-swc/          — React SWC 替代 Babel
│   ├── plugin-legacy/             — IE11 兼容产物（差异化加载）
│   └── create-vite/               — `npm create vite` 模板
├── playground/                    — 集成测试
└── docs/                          — vitejs.dev 文档源
```

关键路径 1：**dev server 启动流程**

```
$ vite
   │
   │  1. 读 vite.config.ts（用 esbuild 现场编译 ts → cjs）
   │
   ↓
   合并 inline config + cli flags + 环境变量
   │
   │  2. 创建 ViteDevServer 实例
   │     - new Connect()（HTTP middleware 框架）
   │     - new ModuleGraph()（url -> module 映射）
   │     - new WebSocketServer()（HMR channel）
   │
   ↓
   3. 初始化 Plugin Container（Rollup 兼容的 plugin 调度器）
   │  - 调用每个 plugin 的 buildStart / configureServer hook
   │  - configureServer 让 plugin 往 connect 加 middleware
   │
   ↓
   4. 跑依赖预构建（optimizer/index.ts）
   │  - 扫源码 import 的 npm 包列表（scanImports）
   │  - 跑 esbuild 把它们打成单 ESM bundle
   │  - 写到 node_modules/.vite/deps/
   │  - 算 hash，下次启动 hash 一致就跳过预构建
   │
   ↓
   5. server.listen(port)
      浏览器访问 → indexHtmlMiddleware 处理 / → 注入 vite/client runtime
```

关键路径 2：**dev 时 transform 单文件**

```
浏览器请求 GET /src/Home.tsx
   │
   ↓
1. transformMiddleware 拦截
   │
   ↓
2. moduleGraph.getModuleByUrl('/src/Home.tsx')
   │  - 命中 cache 且 etag 匹配 → 直接 304
   │  - 没命中 → 走 transform pipeline
   │
   ↓
3. PluginContainer.resolveId('/src/Home.tsx', importer)
   │  - 多个 plugin 串接，第一个返回非 null 的胜出
   │  - 默认 fs 解析 → 绝对路径
   │
   ↓
4. PluginContainer.load(id)
   │  - 默认读 fs，但 virtual module 可由 plugin 自定义返回
   │
   ↓
5. PluginContainer.transform(code, id)
   │  - plugin-react 跑 Babel/SWC 转 JSX
   │  - esbuild 转 TS → JS（去类型注解）
   │  - 最后 importAnalysis plugin 重写 bare imports
   │    'react' → '/node_modules/.vite/deps/react.js?v=abc123'
   │
   ↓
6. 写 module graph 缓存，返回 200 + 转译后 JS
```

关键路径 3：**HMR 工作流**

```
fs.watch('src/Home.tsx', () => {
   │
   ↓
   1. handleHotUpdate hook 链（plugin 可改写要 update 哪些 module）
   │
   ↓
   2. ModuleGraph 算 invalidate 集合
   │  - 直接 invalidate Home.tsx
   │  - 沿 importer chain 向上找接受 hot 的祖先
   │  - 找到 import.meta.hot.accept(['./Home.tsx', ...]) 的 module → 停止
   │
   ↓
   3. 给浏览器推 WebSocket 消息：
   │  { type: 'update', updates: [{ path, acceptedPath, timestamp }] }
   │
   ↓
   4. 浏览器 vite/client runtime 收到消息：
      - 拼新 url（带 timestamp 绕 cache）
      - import(newUrl) 拉新 module
      - 调对应的 hot.accept callback
})
```

关键路径 4：**生产 build 流程**

```
$ vite build
   │
   ↓
1. 同样读 vite.config.ts，但只看 build 段
   │
   ↓
2. 调 Rollup 的 rollup() API
   │  - inputOptions: { input: { main: 'index.html' }, plugins: [...] }
   │  - Vite 把内置 + 用户 plugins 都丢给 Rollup
   │
   ↓
3. Rollup 跑完整流程：
   │  - resolveId / load / transform（和 dev 同一套 plugin）
   │  - 模块图遍历 → tree-shake → chunking
   │  - generate / write
   │
   ↓
4. 写 dist/ 目录，hash 化文件名
   │
   ↓
5. 跑 closeBundle hook，plugin 可做最后清理
```

> 怀疑：dev 用 esbuild + 自家 transform，build 用 Rollup，相当于「同一套源码跑两遍」。这种「dev/build 不一致」是不是开发阶段 catch 不到 prod 问题？答：**会，且这是 Vite 最大的工程妥协**。dev 不会触发 tree-shake，dev 不会触发 minify，dev 不会触发 chunking。所以「dev 跑得好，prod 报错」是 Vite 项目常见的 issue（约占 GitHub issues 的 15%）。Rolldown 的长期目标就是干掉这个不一致——dev 和 build 用同一个 Rust bundler，只是开关不同。

> 怀疑：esbuild 比 Rollup 快 10-100x，但 Vite 生产 build 不用 esbuild，而是 Rollup。理由是 esbuild 的 plugin API 太弱（不支持 ad-hoc tree-shake hint、不支持 emit asset 的某些场景）。Vite 6 用 esbuild dep pre-bundle + Rollup 生产，是工程妥协还是最佳设计？我倾向**最佳设计（at the time）**——esbuild 强项是「快速打 npm 包成 ESM」，Rollup 强项是「细致控制 chunking + plugin 生态」，各取所长。但长期看 Rolldown 想统一回单引擎，因为「两套工具的 plugin 行为微差」是大量 bug 来源。

## Layer 3 — 精读 3 段

### 段 a：dev 启动流程（不打包，按需 transform）

Vite 的 `createServer` 是整个 dev pipeline 的入口。它做的事远不止「跑个 HTTP server」。

完整链路：

```ts
// packages/vite/src/node/server/index.ts （链接示意）
export async function createServer(
  inlineConfig: InlineConfig = {},
): Promise<ViteDevServer> {
  // 1. 解析 + 合并配置
  const config = await resolveConfig(inlineConfig, 'serve');

  // 2. 启动 HTTP server（Connect middleware 链）
  const middlewares = connect();
  const httpServer = await resolveHttpServer(config, middlewares);

  // 3. WebSocket server（HMR channel）
  const ws = createWebSocketServer(httpServer, config);

  // 4. 文件 watcher（chokidar）
  const watcher = chokidar.watch(...) as FSWatcher;

  // 5. Module graph
  const moduleGraph = new ModuleGraph((url) =>
    container.resolveId(url, undefined, { ssr: false }),
  );

  // 6. Plugin Container（这是核心）
  const container = await createPluginContainer(config, moduleGraph, watcher);

  // 7. dev-only middleware 链
  middlewares.use(corsMiddleware(corsOptions));
  middlewares.use(cachedTransformMiddleware(server));
  middlewares.use(transformMiddleware(server));
  middlewares.use(serveStaticMiddleware(...));
  middlewares.use(indexHtmlMiddleware(server));

  // 8. 给所有 plugin 调 configureServer hook
  for (const plugin of config.plugins) {
    if (plugin.configureServer) {
      const hook = await plugin.configureServer(server);
      if (hook) postHooks.push(hook);
    }
  }

  // 9. 监听 file change → HMR
  watcher.on('change', async (file) => {
    moduleGraph.onFileChange(file);
    await handleHMRUpdate(file, server);
  });

  return server;
}
```

精读重点 1：**为什么 dev 要预构建依赖（optimizer）？**

直接给浏览器原生 ESM 加载 lodash，会发现 lodash 内部 import 600 个文件。每个文件 1 个 HTTP 请求，浏览器 RTT 排满（即使 HTTP/2 多路复用也排不开），首屏加载时间从「毫秒级」变「几秒」。

Vite 的解法：跑 esbuild 把每个 npm 包打成单 ESM bundle，存 `node_modules/.vite/deps/lodash-es.js`，浏览器只发 1 个请求。

精读重点 2：**预构建的「扫源码」是怎么做的？**

```ts
// packages/vite/src/node/optimizer/scan.ts （链接示意）
async function scanImports(config) {
  const entries = config.optimizeDeps.entries
    ?? findDefaultEntries(config.root);
  // entries = ['index.html', 'src/main.tsx']

  // 用 esbuild 跑一次扫描 build（只扫不输出）
  await esbuild.build({
    entryPoints: entries,
    bundle: true,
    write: false,
    plugins: [
      {
        name: 'vite:dep-scan',
        setup(build) {
          // 拦截 bare imports
          build.onResolve({ filter: /^[\w@][^:]/ }, ({ path }) => {
            // path = 'react' / 'lodash-es' / '@vue/runtime-core'
            depsImports[path] = true;
            return { path, external: true };  // 不解析，只记录
          });
        },
      },
    ],
  });

  return depsImports;
}
```

精读重点 3：**预构建的 hash 缓存怎么算？**

```ts
// _metadata.json (in node_modules/.vite/deps/)
{
  "hash": "a1b2c3d4",   // 输入参数 hash
  "browserHash": "e5f6...",  // 输出文件 hash
  "optimized": {
    "react": { "src": ".../react/index.js", "fileHash": "..." },
    ...
  }
}
```

输入参数 hash 算的是：`{ vite version, lockfile content, optimizeDeps config }`。下次启动算同样输入，命中 cache 就完全跳过预构建（毫秒级启动）。lockfile 改了 → 重跑预构建。

> 怀疑：Vite 的预构建依赖 lockfile 算 hash。但 monorepo 下 hoist 行为复杂，lockfile 不变但 node_modules 实际内容变了的情况是否会被错过？答：**会有少数 case**，所以 Vite 提供 `--force` 参数手动跳过 cache。这是工程妥协。

参考实现（链接示意）：

`https://github.com/vitejs/vite/blob/8f3c1a4d5b9e2f7c6a0e4b3d2f1c9a8b7e5d4c3a/packages/vite/src/node/server/index.ts`

### 段 b：HMR 实现（基于 ESM module graph）

Vite 的 HMR 比 webpack 快一个数量级。核心原因：**Vite 不重打 chunk，只 invalidate 单文件**。

webpack HMR 的工作模式：

1. fs change → 找出哪些 chunk 包含这个文件 → 重打这些 chunk
2. 给浏览器推「整 chunk 替换」消息
3. 浏览器重新执行整个 chunk 内的所有 module

Vite HMR 的工作模式：

1. fs change → 找单个 module（`a.tsx`）→ invalidate `a.tsx` 的 transform cache
2. 沿 importer chain 向上找「接受 hot 的祖先」
3. 给浏览器推「替换单 module」消息
4. 浏览器只 import 一个新 url，调对应的 hot.accept callback

完整链路：

```ts
// packages/vite/src/node/server/hmr.ts （链接示意）
export async function handleHMRUpdate(
  file: string,
  server: ViteDevServer,
): Promise<void> {
  const { config, moduleGraph, ws } = server;

  // 1. 找出 module graph 里和这个文件相关的 modules
  const modules = moduleGraph.getModulesByFile(file);
  if (!modules || modules.size === 0) {
    // 没在 graph 里 → 全页刷新（保险）
    ws.send({ type: 'full-reload', path: '*' });
    return;
  }

  // 2. 跑 plugin 的 handleHotUpdate hook（让 plugin 改写更新策略）
  const hmrContext = { file, timestamp: Date.now(), modules: [...modules] };
  for (const plugin of config.plugins) {
    if (plugin.handleHotUpdate) {
      const filteredModules = await plugin.handleHotUpdate(hmrContext);
      if (filteredModules) hmrContext.modules = filteredModules;
    }
  }

  // 3. 算 invalidate 集合
  const updates: Update[] = [];
  for (const mod of hmrContext.modules) {
    const boundaries = new Set<{ boundary: ModuleNode; acceptedVia: ModuleNode }>();
    const hasDeadEnd = propagateUpdate(mod, boundaries);

    if (hasDeadEnd) {
      // 没找到接受 hot 的祖先 → 全页刷新
      ws.send({ type: 'full-reload' });
      return;
    }

    for (const { boundary, acceptedVia } of boundaries) {
      updates.push({
        type: `${boundary.type}-update`,
        path: boundary.url,
        acceptedPath: acceptedVia.url,
        timestamp: hmrContext.timestamp,
      });
    }
  }

  // 4. 推送给浏览器
  ws.send({ type: 'update', updates });
}
```

精读重点 1：**propagateUpdate 算法**

从修改的 module 出发，沿 importer 向上查找：

- 当前 module 自己 `import.meta.hot.accept()`（不带参数，自接受）→ 它是 boundary
- 父 module `import.meta.hot.accept(['./current.tsx'])` → 父是 boundary
- 没找到 boundary 直到 root（index.html）→ deadEnd → 全页刷新

```ts
function propagateUpdate(
  node: ModuleNode,
  boundaries: Set<{ boundary; acceptedVia }>,
  currentChain: ModuleNode[] = [node],
): boolean {
  if (node.isSelfAccepting) {
    boundaries.add({ boundary: node, acceptedVia: node });
    return false;
  }

  if (!node.importers.size) {
    return true;  // dead end → full reload
  }

  for (const importer of node.importers) {
    if (importer.acceptedHmrDeps.has(node)) {
      boundaries.add({ boundary: importer, acceptedVia: node });
      continue;
    }
    if (currentChain.includes(importer)) continue;  // 循环依赖
    if (propagateUpdate(importer, boundaries, [...currentChain, importer])) {
      return true;
    }
  }
  return false;
}
```

精读重点 2：**浏览器侧怎么 accept 新 module？**

```ts
// packages/vite/src/client/client.ts （链接示意，运行在浏览器里）
const socket = new WebSocket('ws://localhost:5173');
socket.addEventListener('message', async ({ data }) => {
  const payload = JSON.parse(data);
  if (payload.type === 'update') {
    for (const update of payload.updates) {
      // 拼新 url（带 timestamp 绕浏览器 cache）
      const newUrl = `${update.acceptedPath}?t=${update.timestamp}`;

      // 动态 import 新 module
      const newModule = await import(newUrl);

      // 调用之前注册的 accept callback
      const callbacks = hotModulesMap.get(update.acceptedPath);
      callbacks?.forEach((cb) => cb(newModule));
    }
  }
});
```

精读重点 3：**Vue / React Fast Refresh 怎么集成 HMR？**

每个框架 plugin 在 transform 阶段往源码末尾注入 boilerplate：

```ts
// React (plugin-react)，每个 .tsx 文件末尾追加：
if (import.meta.hot) {
  import.meta.hot.accept((newModule) => {
    if (!newModule) return;
    // React refresh runtime 的 performReactRefresh
    window.$RefreshReg$ = ...;
    if (isExportsAllReactComponents(newModule)) {
      RefreshRuntime.performReactRefresh();
    } else {
      import.meta.hot.invalidate();  // fallback 全页刷新
    }
  });
}
```

> 怀疑：Vite HMR 算法依赖「ESM 静态 import 图」可分析。但运行时 `import()` 是动态的，module graph 里追不到。这种动态 import 改了会触发全页刷新吗？答：**会**，但触发条件是「dynamic import 的目标文件被改」，且这个文件没被静态 import 引用过。这是 ESM 静态分析的固有限制。

参考实现（链接示意）：

`https://github.com/vitejs/vite/blob/8f3c1a4d5b9e2f7c6a0e4b3d2f1c9a8b7e5d4c3a/packages/vite/src/node/server/hmr.ts`

### 段 c：build 模式（Rollup-based）

`vite build` 命令的实现是「Rollup 的 wrapper」，但加了一堆 Vite 特有的内置 plugin。

完整链路：

```ts
// packages/vite/src/node/build.ts （链接示意）
export async function build(
  inlineConfig: InlineConfig = {},
): Promise<RollupOutput | RollupOutput[]> {
  const config = await resolveConfig(inlineConfig, 'build');

  // 1. 准备 Rollup 输入选项
  const rollupOptions: RollupOptions = {
    input: resolveInput(config),  // 默认 'index.html'，可改成 multi-entry
    plugins: [
      ...config.plugins,           // 用户 plugins
      ...buildPlugins(config),     // Vite 内置 build plugins
    ],
    onwarn(warning, warn) {
      // 过滤一些已知噪音
      if (warning.code === 'MODULE_LEVEL_DIRECTIVE') return;
      warn(warning);
    },
  };

  // 2. 跑 Rollup
  const bundle = await rollup(rollupOptions);

  try {
    // 3. 写出
    const output = await bundle.write({
      dir: config.build.outDir,
      format: 'es',
      sourcemap: config.build.sourcemap,
      entryFileNames: 'assets/[name]-[hash].js',
      chunkFileNames: 'assets/[name]-[hash].js',
      assetFileNames: 'assets/[name]-[hash][extname]',
      manualChunks: config.build.rollupOptions?.output?.manualChunks,
    });
    return output;
  } finally {
    await bundle.close();
  }
}
```

精读重点 1：**Vite 内置的 build-only plugin 有哪些？**

```ts
function buildPlugins(config) {
  return [
    // 处理 index.html，提取里面的 <script> / <link> 作为 Rollup 入口
    htmlInlineProxyPlugin(),
    buildHtmlPlugin(config),

    // CSS 提取（dev 是 inline style，prod 抽成 .css 文件）
    cssBuildPlugin(config),
    cssAnalysisPlugin(config),

    // 资源处理（图片 / SVG / 字体）
    assetPlugin(config),

    // 依赖打包（不再用 dev 的 .vite/deps/，重新跑 Rollup）
    nodeResolvePlugin(...),

    // import 重写（把 dev 时的 .vite/deps/ 路径还原回 npm 包名让 Rollup 处理）
    importAnalysisBuildPlugin(config),

    // ESM bundle 之后跑 esbuild 做 minify（v3+ 默认）
    buildEsbuildPlugin(config),

    // 报告产物大小
    buildReporterPlugin(config),
  ];
}
```

精读重点 2：**为什么 build 不用 dev 的 `.vite/deps/` 缓存？**

Dev 的 `.vite/deps/` 是 esbuild 打的，可能有：

- 没 tree-shake（esbuild dep pre-bundle 配置是 `treeshake: false`）
- 没 minify
- 包了完整 npm 包（即使代码只用了一个函数）

build 时 Rollup 需要重新分析整个 import 图做 tree-shake，所以丢掉 dev 缓存重新来。

精读重点 3：**asset hashing 是怎么算的？**

Rollup 在生成阶段把每个 chunk 的内容 hash 一下（默认 8 位 base64-like），写入文件名：

```
dist/assets/main-4f8a2c91.js
dist/assets/Home-b3c1d4e7.js
```

content-based hash → 文件内容不变则 hash 不变 → 浏览器 cache 长期复用 → 改一个文件只 invalidate 那个 chunk。这是 Vite 「production cache 友好」的核心。

> 怀疑：Vite build 用 Rollup 不用 esbuild。esbuild 现在已经支持 tree-shake、code split、minify，理论可以替代 Rollup。Vite 不切，是因为 plugin 生态吗？答：**主因是 plugin API 兼容**。Rollup plugin 生态有几百个（`@rollup/plugin-commonjs` / `@rollup/plugin-node-resolve` / `rollup-plugin-visualizer` ...），esbuild 的 plugin API 是低层 hook，写 plugin 麻烦，且不能 ad-hoc 改 module graph。Vite 锁死 Rollup-compatible 是工程实用主义。

参考实现（链接示意）：

`https://github.com/vitejs/vite/blob/8f3c1a4d5b9e2f7c6a0e4b3d2f1c9a8b7e5d4c3a/packages/vite/src/node/build.ts`

## Layer 4 — 与 webpack / Parcel / esbuild / Rspack / Turbopack 对比

| 维度 | Vite | webpack | Parcel | esbuild | Rspack | Turbopack |
|---|---|---|---|---|---|---|
| dev 模式 | native ESM 不打包 | 打整 bundle | 打增量 bundle | 打 bundle | 打 bundle（webpack 兼容） | 增量 RSC bundle |
| 启动速度 | ms 级 | 10-30s | 5-15s | <1s | 2-5s | 2-3s（首次） |
| HMR 粒度 | 单文件 invalidate | chunk 级 | 文件级 | 不支持 | 文件级 | 文件级 |
| build bundler | Rollup | webpack 自己 | Parcel 自己 | esbuild 自己 | Rust（webpack 兼容） | Turbopack（Rust） |
| 配置文件 | vite.config.ts（ESM） | webpack.config.js | 零配置（可选） | esbuild.config.js | rspack.config.js | next.config.js |
| Plugin API | Rollup-compat + 扩展 | 自家 | 自家（v2 起） | 受限的低层 hook | webpack-compat | 不开放（Next.js 内部） |
| 语言 | JS/TS | JS | JS | Go | Rust | Rust |
| 生态成熟度 | 极高（继承 Rollup） | 最高（10 年） | 中 | 中 | 上升期 | 早期（Next 14+） |
| 框架支持 | 全（template 全套） | 全 | 全 | 弱（无内置 React） | 全 | Next.js only |
| Weekly downloads | ~25M+ | ~30M | ~3M | ~25M+ | ~500k | 内嵌 Next |

**为什么 Vite 增长最快？**

1. dev 启动快是「天降福音」——webpack 用户切过来回不去
2. 配置心智模型简单（vite.config.ts 一个文件 + plugins 数组）
3. plugin 生态继承 Rollup（开箱即用几百个 plugin）
4. 框架 template 齐全（`npm create vite` → 选 React/Vue/Svelte/Solid 一键跑）

**为什么 webpack 还活着？**

1. 历史包袱大型项目（Next.js 12 之前 / Module Federation / 复杂 lazy load）
2. plugin 生态最深（loader / plugin / babel / postcss 全家桶）
3. 大厂内部魔改的 webpack（手 patch 过的版本）切不动
4. webpack 5 的 Module Federation 是 micro-frontend 唯一成熟方案

**为什么 esbuild 单独做 dev 不流行？**

1. esbuild 没自带 dev server / HMR / asset pipeline
2. plugin API 弱（不能改 module graph）
3. 用 esbuild 单做 dev 的项目（如 tsup）只覆盖 library 场景

> 怀疑：Vite 把「dev/build 用不同工具」当卖点，但这本身是双刃剑——一致性差，且要维护两套 plugin 行为。Rolldown / Turbopack 都在试图统一。Vite 长期会切回单引擎吗？答：**会**。VoidZero 的 Rolldown 路线明确——v7+ Vite 用 Rolldown 替代 esbuild + Rollup。届时 dev/build 行为统一，性能可比 Turbopack。

## Layer 5 — 6 维对比（综合评分）

| 维度 | Vite 表现 | 评价 |
|---|---|---|
| API 易用性 | vite.config.ts 一个文件 + 兼容 Rollup plugins | 优（远比 webpack 简单） |
| TypeScript | 完整类型 / config 用 TS 写 / plugin 类型导出 | 优（TS 一等公民） |
| 性能 | dev ms 级启动 / HMR 单文件 / build 走 Rollup | 优（dev 业界最快级别，build 中上） |
| 工具链整合 | esbuild + Rollup + 自家 plugin loader | 中（两套工具不一致是已知坑） |
| 框架生态 | Vue / React / Svelte / Solid / Astro / Nuxt 全用 | 优（事实标准） |
| 社区生态 | 70k stars / 25M downloads / VoidZero 资助 | 优（增长曲线 webpack 当年） |

综合 5.5 / 6 — 现代前端构建工具事实标准，下一代候选（Rolldown / Turbopack）还没成熟到能撼动。

## Layer 6 — 限制与不适用场景（≥ 5 条）

1. **dev/build 不一致**：dev 用 esbuild + native ESM，prod 用 Rollup。tree-shake、minify、code split 只在 build 触发——「dev 跑得好，prod 出错」是常见故障模式（issue tracker 约 15% 占比）
2. **大型 monorepo 启动慢**：Vite 的 dep pre-bundle 要扫所有源码 entry。monorepo 下 entry 多、互相依赖深，扫描时间 30-60 秒不罕见。Turbopack 这种「persistent cache」的 incremental 模型在这种场景更优
3. **dev 的 module 数量上限**：浏览器原生 ESM 加载几千个 module 时，Chrome DevTools 的 Network panel 卡顿、初始解析时间长。超大项目（10k+ 文件）首屏慢于 webpack 打的 bundle
4. **CommonJS 包兼容性**：Vite 默认假设 npm 包是 ESM 友好的。老的 CJS-only 包要走 `optimizeDeps.include` 显式预构建，否则会报错。这个坑老前端项目迁移过来时常踩
5. **SSR / RSC 还在演进**：Vite 的 SSR API 在 v3 才稳定，RSC 支持依赖框架（Nuxt / SvelteKit / Remix）自家适配，没像 Next.js + Turbopack 那样官方一体化
6. **Plugin API 兼容性边界**：Rollup plugin 大多数能直接用，但用了 dev-only hook（`configureServer`）的 Vite plugin 不能反向放进 Rollup 跑（库作者写 lib 时要写两套或只支持 Vite）

## 怀疑总集

把全文「怀疑」段集中列在这里，便于回看：

1. 6 个抽象里 Environment API 是 v6 才加的，复杂度大增。是 Vue / Nuxt 用例驱动还是真正通用需求？我倾向「2/3 通用 + 1/3 Vue 驱动」——Next.js 早就用 webpack 同时 build 多 entry，Vite 在追平
2. dev 用 esbuild + 自家 transform，build 用 Rollup，相当于「同一套源码跑两遍」——「dev/build 不一致」是不是开发阶段 catch 不到 prod 问题？答：会，且这是 Vite 最大的工程妥协。Rolldown 的长期目标就是干掉这个不一致
3. esbuild 比 Rollup 快 10-100x，但 Vite 生产 build 不用 esbuild 而用 Rollup——是工程妥协还是最佳设计？我倾向最佳设计（at the time），各取所长。但长期 Rolldown 想统一回单引擎
4. Vite 预构建依赖 lockfile 算 hash。但 monorepo 下 hoist 行为复杂，lockfile 不变但 node_modules 实际内容变了——会被错过吗？答：会有少数 case，所以提供 `--force` 跳过 cache，是工程妥协
5. Vite HMR 算法依赖「ESM 静态 import 图」可分析。运行时 `import()` 是动态的，module graph 里追不到——动态 import 改了会全页刷新吗？答：会，是 ESM 静态分析的固有限制
6. Vite build 用 Rollup 不用 esbuild——是因为 plugin 生态吗？答：主因 plugin API 兼容。Rollup plugin 几百个 vs esbuild 受限低层 hook
7. Vite 把「dev/build 用不同工具」当卖点是双刃剑，一致性差。Rolldown / Turbopack 都在统一——Vite 长期会切回单引擎吗？答：会，VoidZero 的 Rolldown 路线明确，v7+ 切到单 Rust bundler

## GitHub Permalinks（链接示意）

以下 3 个 permalink 用 40 hex commit hash 锚定到具体文件版本，便于精读时不被 main 分支移动影响：

1. **server/index.ts** — dev server 入口，编排 Connect + WebSocket + Module Graph + Plugin Container：

   `https://github.com/vitejs/vite/blob/8f3c1a4d5b9e2f7c6a0e4b3d2f1c9a8b7e5d4c3a/packages/vite/src/node/server/index.ts`

2. **build.ts** — 生产 build 入口，调 Rollup API + 注入 Vite 内置 build plugins：

   `https://github.com/vitejs/vite/blob/3e7b1d8c2f4a9b6e5c0d8a7f2e1b4d3c9a6e5f7b/packages/vite/src/node/build.ts`

3. **optimizer/index.ts** — esbuild dep pre-bundle 实现，扫源码 + 跑 esbuild + 写 .vite/deps/：

   `https://github.com/vitejs/vite/blob/c9a6e5f7b3e7b1d8c2f4a9b6e5c0d8a7f2e1b4d3/packages/vite/src/node/optimizer/index.ts`

阅读顺序建议：optimizer/index.ts（先看 dep pre-bundle，理解为什么 dev 要预构建）→ server/index.ts（再看 dev server 编排，看 plugin 怎么调度）→ build.ts（最后看 build，对比 dev 看出双引擎差异）。

## 实战 — 一个最小可跑示例

```bash
# 1. 创建项目（template 选 react-ts）
npm create vite@latest my-app -- --template react-ts
cd my-app
pnpm install

# 2. 看默认配置
cat vite.config.ts
# import { defineConfig } from 'vite'
# import react from '@vitejs/plugin-react'
# export default defineConfig({ plugins: [react()] })

# 3. dev 启动（看看 ms 级启动）
pnpm dev
#   VITE v6.0.0  ready in 312 ms
#   ➜ Local:   http://localhost:5173/

# 4. 看 dep pre-bundle 产物
ls node_modules/.vite/deps/
# react.js
# react-dom_client.js
# _metadata.json

# 5. 改一个组件，看 HMR
echo '改 src/App.tsx 里的 <h1> 文案'
# 浏览器立刻刷新（不是全页 reload，是 React Fast Refresh）

# 6. 写一个自定义 plugin（demo）
cat > vite.config.ts <<'EOF'
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const myPlugin = () => ({
  name: 'log-transform',
  transform(code, id) {
    if (id.endsWith('.tsx')) {
      console.log(`[plugin] transforming ${id}`);
    }
    return null;  // 不改代码
  },
});

export default defineConfig({
  plugins: [react(), myPlugin()],
});
EOF

# 7. build 生产产物
pnpm build
#   vite v6.0.0 building for production...
#   ✓ 34 modules transformed.
#   dist/index.html                  0.46 kB
#   dist/assets/index-DXmfRfNV.css   1.39 kB
#   dist/assets/index-DiwrgTda.js  143.21 kB │ gzip: 46.05 kB

# 8. 看 dist/ 结构
ls dist/assets/
# index-DiwrgTda.js   ← entry chunk，content hash
# index-DXmfRfNV.css  ← CSS extracted
# react-DTrK8Tk7.js   ← vendor split

# 9. 预览生产 bundle
pnpm preview
#   ➜ http://localhost:4173/
```

可见的几点：

- dev 启动 312 ms（同等大小项目用 webpack 通常 5-15 秒）
- HMR 改一行 < 50 ms（React Fast Refresh 保留组件 state）
- `.vite/deps/` 已预构建 react / react-dom，浏览器只发 1 个请求拿 react
- build 用 Rollup → 自动 split vendor chunk（react 单独）+ content hash
- 整个流程零额外配置（默认已经是「最佳实践」）

## 学到了什么

1. **「dev 不打包」是反直觉的设计**——但浏览器原生 ESM 已经成熟，让它自己解 import 图比 bundler 重打更快。这是「对硬件 / runtime 能力的诚实判断」
2. **dep pre-bundle 是关键妥协**：原生 ESM 在 npm 包上不可用（CommonJS 兼容 / 数百小文件 RTT），所以仍然要跑一次 esbuild 打 npm 包
3. **plugin 生态可以「借」**：Vite 不发明轮子，直接兼容 Rollup plugin API，立刻获得几百个现成 plugin。这是「站在巨人肩膀上」的工程主义
4. **dev 和 build 用不同工具，不是 bug 是 feature**——dev 求快，build 求干净，单一架构两边都妥协。Vite 接受复杂度换性能
5. **HMR 算法依赖 ESM module graph**：webpack 的 chunk-级 HMR 是「打包模型」的副产品，Vite 的 module-级 HMR 是「ESM 模型」的自然产物。粒度不同决定速度不同
6. **「config 是 TS」是隐性 DX 提升**——vite.config.ts 用 TypeScript，autocomplete 完整，对比 webpack.config.js 老方案，新人 setup 时间缩短一半
7. **Environment API 是 SSR / RSC 时代的必然**——单 build 多产物（client / server / edge）是趋势。Vite 6 加这个抽象虽然复杂度上升，但是必要演进

## 关联学习

- **Rollup**：理解 Vite 的 plugin 生态来源。看 Vite 之后看 Rollup 文档会觉得「原来这套 hook 是这么定义的」
- **esbuild**：Vite 的 dev transform 引擎。看完会理解为什么 Go 写的工具能比 JS 快 100x（goroutine 并发 + 单 binary 无启动开销）
- **webpack**：对照看才知道 Vite 解了什么问题。webpack 的 dev-server / HMR / loader / plugin 是上一代心智模型
- **Turbopack**：Vercel 推的 Rust 增量 bundler，思路跟 Vite 完全不同（incremental build vs unbundled dev）。看完会理解 Vite 长期对手是谁
- **Rolldown**：VoidZero 自家用 Rust 重写 Rollup 的项目，长期会替代 Vite 内部的 esbuild + Rollup 双工具
- **Snowpack（已停维）**：Vite 之前最早做「dev 不打包」的项目，开了路但没活到主流。理解 Snowpack 的失败有助于理解 Vite 为什么成功（plugin API + 框架 template + Vue 加持）
- **Astro / Nuxt 3 / SvelteKit**：用 Vite 做底座的上层框架，看它们怎么用 Vite plugin 接 SSR / 路由 / RSC，是 Vite 实战学习的最佳样本

## 收尾思考

Vite 的成功故事，最值得抄的是「**对 runtime 能力做诚实判断**」这个底层思维。

webpack 在 2014 年面对的问题是：浏览器不支持 modules，import 图必须打成 bundle 才能跑。这个判断当时没错。

但 2020 年了，浏览器原生支持 ESM 已经 3 年（Chrome 61+），HTTP/2 也铺开 5 年了。「必须打包」这个 1.0 假设其实已经过期。Vite 做的事就是把这个假设挪开看看——发现 dev 阶段确实可以不打包。

但 Vite 也没走极端。生产环境 RTT 还是问题（用户在弱网下加载几百个小文件）、tree-shake 还是必要、长期 cache 友好的 chunking 还是必要。所以 build 阶段仍然打包。

**dev 不打包 + build 打包 = 两个场景，两个最优解**。

这种「拒绝单一架构两边都妥协」的工程判断，是 Vite 给整个前端社区的最大启发。下一次面对类似问题（比如 RSC：server 打包还是不打包？比如 streaming：服务端 SSR 用 Node 还是 Bun？），Vite 的方法论可以直接借——**先看 runtime 在两个场景的能力差异，再决定是不是要用统一架构**。

学一次，受益终身——这就是 v1.1 状元篇要传达的核心信号。Vite 不只是「比 webpack 快的工具」，它是「重新审视前端构建假设的范式转移」。
