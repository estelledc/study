---
title: esbuild — 用 Go 写的极速 JS bundler
来源: https://github.com/evanw/esbuild
日期: 2026-05-29
子分类: 构建工具
分类: 编译器
难度: 中级
provenance: pipeline-v3
---

## 是什么

esbuild 是一个用 **Go** 重写的 JS 打包工具——把 TypeScript / JSX / ESM 翻译成浏览器能跑的 JS，顺便压缩、做 sourcemap、合并依赖。日常类比：

> 同一份大蛋糕，A 师傅用一把小刀切（webpack 慢）；B 师傅同时用 8 把刀切（esbuild 快）。

切蛋糕的算法都一样，差别在于 **同时几把刀**（并行度）和 **每把刀多锋利**（每一步多干净）。esbuild 把这两件事都拉到极限：用 Go 拿到真并行（8 把刀），用单遍 AST 拿到极锋利（每刀切干净）。

跟同期工具比，esbuild 编译同样的项目快 10-100 倍——webpack 30 秒做完的事，esbuild 0.5 秒就好。

## 为什么重要

不理解 esbuild 解释不了下面这些：

- 为什么 TypeScript 编译从「等几秒」变成「几乎瞬间」——esbuild 在背后做 transform
- 为什么 Vite 启动 dev server 那么快——它底层用 esbuild **预打包** node_modules
- 为什么"前端构建慢"在 2020 年后逐渐成为历史话题——esbuild 把整个赛道速度拉了一档
- 为什么 Figma 联创 Evan Wallace 一个人花两年写一万行 Go，却撼动了 webpack/Babel 多年的统治

## 核心要点

esbuild 的快可以拆成 **三个工程决定**：

1. **换语言（Go > JS）**：以前的 JS 工具（webpack / Babel / Rollup）都用 JS 写——单线程、event loop、V8 GC 卡顿。esbuild 用 Go 写，能开多核 goroutine 真并行，省掉 JS runtime 的解释开销。光这一项就拿 5-10 倍

2. **单遍 AST 走完**：Babel 是「parse → 多个 plugin transform → 再 print」，AST 来回走 3-5 遍。esbuild 把 parse + bind + lower + minify 合成一遍 walk——一次扫完所有要做的事。少走几遍 AST，再省 2-5 倍

3. **直接输出 minified 结果**：传统工具是「先输出可读 JS，再跑 minifier 压一遍」（中间字符串生成 + 二次 parse）。esbuild 在 print 阶段直接输出压缩后的字符串，省掉中间产物

三件事叠加，拿到 30-100 倍速度。

## 实践案例

### 案例 1：CLI 一行编译

最常见的用法——把 TSX 编译打包成 production bundle：

```bash
esbuild app.tsx --bundle --minify --outfile=out.js
```

逐部分解释：

- `app.tsx` 是入口文件
- `--bundle` 表示「跟着 import 把所有依赖拉进来合成一个文件」
- `--minify` 表示压缩
- `--outfile` 是输出位置

复杂版加 target / sourcemap / 资源 loader：

```bash
esbuild src/main.tsx --bundle --minify --sourcemap \
  --target=es2017 --outfile=dist/bundle.js \
  --loader:.svg=dataurl --loader:.png=file
```

### 案例 2：JS API 程序化调用

写个 build 脚本，比 CLI 灵活：

```ts
import { build } from 'esbuild';

await build({
  entryPoints: ['src/main.tsx'],
  bundle: true,
  outdir: 'dist',
  format: 'esm',
  target: 'es2017',
  minify: true,
  sourcemap: true,
});
```

API 模式能根据环境动态算参数、加 plugin、串其他工具。CI / Vite 这类上层都走 API。

### 案例 3：写一个最小 plugin

esbuild 的 plugin 只有两个 hook：`onResolve`（决定 import 路径解析到哪）和 `onLoad`（决定文件内容怎么读）。30 行内拦截 `.svg` 让它 inline：

```ts
import { Plugin } from 'esbuild';
import { readFile } from 'node:fs/promises';

const svgInline: Plugin = {
  name: 'svg-inline',
  setup(build) {
    build.onResolve({ filter: /\.svg$/ }, (args) => ({
      path: args.path,
      namespace: 'svg',
    }));
    build.onLoad({ filter: /.*/, namespace: 'svg' }, async (args) => ({
      contents: `export default ${JSON.stringify(await readFile(args.path, 'utf8'))}`,
      loader: 'js',
    }));
  },
};
```

效果：`import logo from './logo.svg'` 把 SVG 文本直接 inline 到 JS 里，不再需要单独的 SVG HTTP 请求。

## 踩过的坑

1. **不做类型检查**：esbuild 编译 TS 时只 **剥掉类型注解**——不验证类型是否对。`const x: number = "hello"` 它照样编译过去。生产项目必须配 `tsc --noEmit` 双跑，IDE 也要开 TS 检查

2. **tree-shaking 比 Rollup 弱**：esbuild 用 ESM 静态分析做 dead code 删除，对「未导出函数被引用」这类边角识别不全。同样的代码 Rollup bundle 可能比 esbuild 小 5-10%。库作者发包仍多用 Rollup

3. **CSS 处理简陋**：内置 CSS parser 但 **不支持 PostCSS plugin / Sass / Less**。要 Tailwind / autoprefixer / CSS Modules 这些都得在 plugin 里手动桥接。Vite 的做法是「esbuild 做 JS，PostCSS 做 CSS」分工

4. **不支持 Vue SFC**：`.vue` 文件包含 `<template>` `<script>` `<style>` 三段，esbuild 单层 plugin 表达不出。需要 `esbuild-plugin-vue` 这类第三方在 plugin 里手动 parse SFC、拆段、虚拟模块桥接——能跑但不优雅

## 适用 vs 不适用场景

**适用**：
- TypeScript / JSX 单文件 transform——~10ms 级，IDE / test runner / dev server 的天然选型
- 中小型项目 production build——速度收益大、plugin 限制不卡到
- CLI 工具打包——`platform: 'node'` 一键单文件可执行
- 上层工具（Vite / tsup / Bun bundler）的 fast transform 引擎

**不适用**：
- 需要复杂 plugin 生态的大型应用（vue-sfc / mdx / 编译期魔法）→ 用 Vite + Rollup
- 需要精细 chunk splitting（vendor / lazy / shared 三层控制）→ 用 webpack / Rspack
- 库发包到 npm（要最优 tree-shake）→ 用 Rollup
- 需要 type check 的 TS 项目（必须额外配 tsc）

## 历史小故事（可跳过）

- **2019 年**：Evan Wallace（Figma 联合创始人 + 架构师）作为 side project 开始写 esbuild，用 Go——他想验证「JS 工具慢的瓶颈是语言本身，不是算法」
- **2020 年 1 月**：v0.1 公开发布，README + `docs/architecture.md` 一次性写完。基线测试显示比 webpack 快 60 倍，社区震惊
- **2020-2021**：Vite（Evan You 主导）把 esbuild 选作 dep pre-bundle 引擎，让 esbuild 嵌入到「下一代前端构建」的核心位
- **至今**：仍是 0.x（作者刻意不发 1.0，保留 breaking change 余地），周下载量 30M+，整个工具链（Vite / tsup / Bun / Rspack 部分）都在它之上

整个项目几乎一人写——一万行 Go、5000+ 测试、580 行架构文档。极致工程审美的标本。

## 学到什么

1. **「换语言」是终极性能优化**——算法能压的极限有限，runtime 本身的开销才是天花板。Go vs JS 这一步直接拿 5-10 倍
2. **passes 合并 vs 分离的取舍**——分离（Babel 风格）灵活但慢，合并（esbuild 风格）快但 plugin 表达力受限。生产工具链场景合并是对的
3. **plugin API 的克制**——只开 onResolve / onLoad 两个 hook 看起来「不够用」，实际上是把复杂度推到 plugin 作者，换来核心 fast path 干净。设计决策都是 trade-off
4. **「不发 1.0」是诚实**——比起强行发 1.0 然后频繁 bump major，0.x 反而更负责任
5. **bus factor vs 信任**——单作者维护 30M weekly downloads 的核心基建，社区敢依赖是因为代码质量 + 文档质量 + 长期 active 三者叠加

## 延伸阅读

- 官方文档（推荐入口）：[esbuild.github.io](https://esbuild.github.io/)
- 架构总览（580 行作者亲笔）：[docs/architecture.md](https://github.com/evanw/esbuild/blob/main/docs/architecture.md)
- API 参考：[esbuild.github.io/api](https://esbuild.github.io/api/)
- 性能哲学（README 顶部）：[github.com/evanw/esbuild#why](https://github.com/evanw/esbuild#why)
- [[vite]] —— Vite 把 esbuild 当 dep pre-bundler 和 dev TS transform
- [[rollup]] —— Rollup 是 library bundle 场景的对照组

## 关联

- [[vite]] —— Vite 双引擎之一，esbuild 负责 dev 路径
- [[rollup]] —— production build 场景的对手，更精细的 chunk 控制
- [[rspack]] —— Rust 重写 webpack 的路线，与 esbuild 同属「换语言提速 JS 工具」赛道
- [[bun]] —— Zig 写的 runtime + bundler，内部 link 部分 esbuild 代码

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[biome]] —— Biome — JS/TS 工具链一体化（Rust 写的 linter+formatter）
- [[bun]] —— Bun — JS 全能运行时
- [[hardhat]] —— Hardhat — Nomic Foundation 的 JS 合约框架
- [[jest]] —— Jest — 一个包就能跑 JS 测试的全家桶
- [[lightningcss]] —— lightningcss — 用 Rust 把 CSS 工具链一遍跑完的编译器
- [[oxc]] —— oxc — Rust 写一整套 JS/TS 工具链的勇气
- [[rolldown]] —— rolldown — 用 Rust 给 Vite 当统一引擎的打包器
- [[rollup]] —— Rollup — ESM 优先的打包器
- [[rspack]] —— rspack — 用 Rust 重写 webpack 的内核，但留下整个 plugin 生态
- [[swc]] —— SWC — Rust 写的 TS/JS 编译器
- [[turbopack]] —— Turbopack — 把 bundler 重做成增量计算应用
- [[vanilla-extract]] —— vanilla-extract — 把 CSS 写成 TypeScript，浏览器看到的却是零字节运行时
- [[vite]] —— Vite — 浏览器自己加载源码的构建工具
- [[vitest]] —— Vitest — Vite 原生测试框架
- [[webpack]] —— webpack 模块打包

