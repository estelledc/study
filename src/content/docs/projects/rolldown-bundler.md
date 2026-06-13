---
title: Rolldown — 用 Rust 重写的下一代 JS 打包器
来源: https://github.com/rolldown/rolldown
日期: 2026-06-13
分类: 后端 API
子分类: 前端框架
provenance: pipeline-v3
---

## 什么是打包器？先来个日常类比

想象你要做一顿大餐：厨房里有 20 个小菜（每个小菜是一个 `.js` 文件），每个小菜都用不同的调料（`import` / `export`）。如果把 20 个小菜直接端上桌，客人（浏览器）得跑 20 趟厨房拿东西，又慢又乱。

**打包器（Bundler）** 的作用，就是厨师长——他把所有小菜合并成一桌完整的大餐，统一调味，去掉没人点的菜，最后装在一个大盘子里端出去。这样浏览器只需要请求一次，就能拿到全部代码。

市面上有好几位"厨师长"：Webpack 是老资历，Rollup 擅长做库，esbuild 以速度著称。而 **Rolldown** 是一位用 Rust 语言重新发明的新手，却想同时接住 Rollup 的生态和 esbuild 的速度。

## 一句话定义

Rolldown 是一个用 Rust 编写的 JavaScript / TypeScript 打包器，由 VoidZero 公司开发。它提供与 Rollup 兼容的 API 和插件接口，同时在功能范围上更接近 esbuild——也就是说，它想成为两者的结合体。

它的最终目标：替换掉 Vite 内部同时使用的 Rollup 和 esbuild，用一个打包器搞定一切。

## 核心概念

### 1. Entry（入口）

打包器不是把所有文件糊在一起，而是从你指定的"入口文件"开始，顺着 `import` 语句一路追踪依赖，形成一张依赖图。这张图就是打包的基础。

就像你看地图，从一个起点出发，沿着路走到所有能到的地方。

### 2. Output / Chunk（输出块）

依赖图画好后，打包器会把相关代码打包成一个或多个"块"（chunk），写到磁盘上。你可以指定输出格式（ESM、CJS、IIFE 等）。

### 3. Plugin Hook（插件钩子）

Rollup 的插件系统通过"钩子"让开发者介入打包流程的每个阶段——比如文件读取、代码转换、输出生成等。Rolldown 完全兼容这套钩子系统，所以现有的 Rollup / Vite 插件可以直接复用。

### 4. Platform（平台）

类似于 esbuild 的 `platform` 配置，Rolldown 可以指定打包目标是 `browser`、`node` 还是 `neutral`。这会影响模块解析规则和 `process.env.NODE_ENV` 的处理方式。

### 5. Transform（内置转换）

Rolldown 内置了 TypeScript 编译、JSX 转换、语法降级等功能， powered by Oxc 项目。不需要额外安装插件——这是它比 Rollup 更"开箱即用"的地方。

### 6. Module Types（模块类型）

类似 esbuild 的 `loader` 概念，可以指定不同文件扩展名对应什么解析方式。默认支持 JS、TS、JSON 等常见类型。

## 代码示例

### 示例一：CLI 一键打包

最简单的用法——不需要配置文件，命令行直接跑：

```bash
# 把 src/main.js 打包成 bundle.js
rolldown src/main.js --file bundle.js
```

`src/main.js` 依赖了 `src/hello.js`，Rolldown 会沿着 import 链把所有代码合并到一个文件里。

### 示例二：用配置文件做精细控制

当选项变多时，写配置文件更灵活：

```js
// rolldown.config.js
import { defineConfig } from 'rolldown';

export default defineConfig({
  input: 'src/main.js',
  output: {
    file: 'dist/bundle.js',
    format: 'esm',          // 输出 ESM 格式
  },
  platform: 'browser',      // 目标平台：浏览器
  transform: {
    define: {
      'process.env.NODE_ENV': '"production"',  // 全局替换
    },
  },
});
```

### 示例三：用 JavaScript API 做编程式打包

如果你需要在代码中动态控制打包流程：

```js
import { rolldown } from 'rolldown';

const bundle = await rolldown({
  input: 'src/main.js',
  platform: 'node',
});

// 同一个 bundle，可以生成不同格式的输出
await bundle.generate({ format: 'esm' });   // ESM 版本
await bundle.generate({ format: 'cjs' });   // CommonJS 版本

// 或者直接写到磁盘
await bundle.write({ file: 'dist/bundle.js' });
```

### 示例四：多配置并行构建

一次打包多种输出，Rolldown 会自动并行执行：

```js
// rolldown.config.js
import { defineConfig } from 'rolldown';

export default defineConfig([
  {
    input: 'src/main.js',
    output: { format: 'esm' },     // 给现代浏览器用的 ESM
  },
  {
    input: 'src/worker.js',
    output: { format: 'iife', dir: 'dist/workers' },  // 给旧浏览器用的 IIFE
  },
]);
```

## 为什么是 Rust？

esbuild 用 Go 写的，速度已经很快了。但 Go 编译成 WASM 时性能会打折。Rust 编译出来的二进制文件更小、更快，而且 WASM 版本同样高效。

简单说：同样的打包任务，Rolldown 比 Rollup 快 10-30 倍，和 esbuild 在同一个速度级别。

## 关键特性一览

| 特性 | Rolldown | Rollup | esbuild |
|------|----------|--------|---------|
| 语言 | Rust | Rust | Go |
| TypeScript 内置 | 支持 | 需插件 | 支持 |
| JSX 内置 | 支持 | 需插件 | 支持 |
| CJS/ESM 混排 | 内置支持 | 需 commonjs 插件 | 内置支持 |
| 插件 API | 兼容 Rollup | 原生 | 无 |
| Tree-shaking | 支持 | 支持 | 有限 |
| 手动代码分割 | 支持 | 有限 | 不支持 |

## 学习路线建议

1. 先跑通 `rolldown src/main.js --file bundle.js`，感受打包的效果
2. 再尝试写 `rolldown.config.js`，理解配置项的含义
3. 了解 Rollup 插件如何直接用在 Rolldown 上
4. 深入看 `notable-features` 页面，理解内置转换、平台预设等概念
5. 如果想参与开发，它基于 oxc（另一个 Rust 项目）做底层解析

## 总结

Rolldown 的核心使命可以概括成一句话：**让 Vite 只用一个打包器搞定所有构建**。它借鉴了 Rollup 的插件生态和 esbuild 的速度理念，用 Rust 重新实现。对于初学者来说，它的使用方式和 Rollup 非常接近——如果你懂一点打包器的概念，上手 Rolldown 几乎没有门槛。
