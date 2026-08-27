---
title: ncc — 用 webpack 把 Node 项目收成单文件
description: 介绍 @vercel/ncc 0.45.0 如何用 webpack、资产重定位和 ESM/CJS 判定把 Node 入口收成一个文件。
来源: https://github.com/vercel/ncc
日期: 2026-08-27
分类: 构建工具
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: tool
  canonical_source: https://github.com/vercel/ncc
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: cb1f1f058bfa7de4cb63f2411e14a724e714e260
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 0.45.0
---

## 是什么

ncc（`@vercel/ncc`）是一个把 Node.js 入口连同依赖收成单个文件的编译器。日常类比：不是再配一套打包工厂，而是像 `gcc` 那样对着一个入口按下去——默认零配置，输出一个能直接 `node dist/index.js` 的文件。

你写：

```bash
npx @vercel/ncc build src/cli.js -o dist
```

固定 0.45.0 的 `ncc()` 会起一个 webpack 5.94.0 编译器，产物写进 MemoryFS，再由 CLI 落到 `--out` 目录。源码仓 `package.json` 版本是 `0.0.0-development`；对外身份是 npm `@vercel/ncc@0.45.0` 与 tag `0.45.0`。

## 为什么重要

不理解 ncc 的“webpack 外壳 + 资产重定位 + 模块形态判定”，就解释不了下面几件事：

- 为什么它宣传零配置，却仍能处理 TypeScript、native addon 和动态 `require`
- 为什么 `.mjs`、`.cjs` 和 `"type": "module"` 会改输出扩展名，而不是只改语法
- 为什么缺模块常常变成运行时报错，而不是编译失败
- 为什么它能把自己打进 `dist/ncc/`，却不是再写一套第二编译器

## 核心要点

固定 0.45.0 的主链可以拆成五步：

1. **入口形态先定性**：`.mjs` 走 ESM；`.cjs` 走 CJS；其余沿父目录找 `package.json` 的 `"type": "module"`。CLI 用同一规则决定写出 `index.js` / `index.mjs` / `index.cjs`。

2. **webpack 只服务 Node**：`target` 默认 `node14`；自定义 `--target` 必须以 `es` 开头，否则直接抛错。`node: false` 关掉 webpack 的 Node polyfill；`mainFields` 收成 `['main']`。

3. **解析失败改成运行时错误**：解析插件把找不到的请求指到 `@@notfound.js`，`notfound-loader` 再把占位符换成模块名。构建可以过，运行才炸。

4. **资产靠 relocator，不是靠手写 copy**：`relocate-loader.js` 只是 `require('@vercel/webpack-asset-relocator-loader')`。native addon、JSON、被静态求值到的资源会进 `assets`。`empty-loader` 会把 `uglify-js` / `uglify-es` 变成空模块。

5. **收尾发生在 webpack 之后**：可选 terser（`compress: false`，保留 class/function 名）、可选 V8 compile cache（ESM 强制关闭）、可选递归 `assetBuilds`。CJS 构建用 `DefinePlugin` 把 `import.meta.url` 换成 `require("url").pathToFileURL(__filename).href`。

## 实践示例

### 案例 1：CLI 一条命令，输出目录先清再写

```bash
ncc build ./src/server.js -o dist -m -s
```

`build` 会删掉 `dist/**/*.(js|cjs)`，再写 `index.<ext>`、sourcemap 和 assets。`-m` 不走 webpack minimize，而是 `finalizeHandler` 里那次 terser。`-s` 才会带 source map；`ncc run` 会强制打开 source map，方便临时执行。

### 案例 2：程序调用拿到 code / map / assets

```js
const ncc = require('@vercel/ncc');

const { code, map, assets } = await ncc('/abs/path/to/input.js', {
  minify: false,
  sourceMap: false,
  externals: ['sharp'],
  target: 'es2015'
});
```

`externals` 数组按原名留下 `require`；对象形式可用 `/regex/` 键，替换串支持 `$1`。`watch: true` 时返回值不是 Promise，而是 `{ handler, rebuild, close }`。

### 案例 3：TypeScript 先找用户本地的编译器

```js
// src/typescript.js 先按入口目录解析 typescript，失败再用内置副本
```

`ncc()` 会把入口绝对路径写进 `process.env.__NCC_OPTS`。`typescript.js` 用 `Module._nodeModulePaths` 去找用户项目里的 `typescript`；找不到才 `require('typescript')`。README 写：`devDependencies` 里有 TypeScript 就用那一版。

## 踩过的坑

1. **把 ncc 当成“另一个 Rollup/Vite”**：它只收 Node 程序。浏览器目标、CSS、HTML 入口不在设计目标里。需要前端打包应看 [[webpack]] / [[vite]] / [[esbuild]]。

2. **以为找不到模块会让 build 失败**：解析插件故意把 miss 变成 `@@notfound.js`。CI 绿了仍可能在启动时 `Cannot find module`。

3. **把 `--target es2015` 理解成 Node 版本**：webpack `target` 变成 `["node14", "es2015"]`。它约束语法降级，不换运行时，也不换 `engines`。

4. **在 ESM 输出上开 `--v8-cache`**：`esm` 为真时源码直接 `v8cache = false`。缓存文件不会出现。

5. **把源码仓版本字段当成 0.45.0**：`package.json` 写的是 `0.0.0-development`。本页绑定的是 tag `0.45.0` / `cb1f1f05...`，与 npm `gitHead` 一致。

## 适用 vs 不适用场景

**适用**：

- 要把 CLI、serverless handler 或 npm 包收成一个 JS 文件，并接受 webpack 的静态分析边界
- 需要内置 TS、shebang 保留、native addon 重定位，但不想手写 webpack 配置
- 输出仍由 Node 执行，而不是再包成系统可执行文件——那是 [[pkg]] 的合同

**不适用**：

- 需要浏览器 bundle、HMR、CSS 管线——看 [[vite]] / [[webpack]]
- 动态 `require` 无法被静态求值，又不能 `--external`
- 不能接受“编译通过、运行才发现缺模块”
- 想要单文件原生可执行文件，而不是单文件 JS

## 固定版本边界

- 本文绑定 `vercel/ncc@cb1f1f058bfa7de4cb63f2411e14a724e714e260`，lightweight tag `0.45.0` 与 npm `@vercel/ncc@0.45.0` 的 `gitHead` 指向同一提交。
- 源码 `version` 为 `0.0.0-development`；发布物只含 `dist/`。`scripts/build.js` 用 ncc 自己编译 `cli` / `index` / 各 loader。
- 默认文件系统缓存在 `$XDG_CACHE_HOME/ncc/<sha1(cwd)>`，实现用的是 `crypto.hash("sha1", process.cwd())`。
- 资产重定位依赖 `@vercel/webpack-asset-relocator-loader@1.10.3`。本轮未安装依赖、未跑测试、未测体积。
- 状态保持 `UNVERIFIED`。

## 学到什么

1. **零配置不等于无编译器**——ncc 把 webpack 5 的旋钮收成 Node 专用默认值。
2. **模块形态是文件系统合同**——扩展名和最近的 `"type"` 决定输出，不是口号里的“自动 ESM”。
3. **失败可以延后到运行时**——`@@notfound` 让静态图不完整时仍出包。
4. **单文件 JS 和单文件可执行文件是两层**——ncc 停在 Node 还能跑的那一层；[[pkg]] 继续往下钉进 Node 二进制。

## 应用型自测

1. `ncc build app.mjs` 默认会不会生成 V8 compile cache 文件？
2. 自定义 `--target node18` 会成功吗？
3. 源码仓 `package.json` 的 `version` 字段是 `0.45.0` 吗？

检查点：

1. 不会。ESM 路径会把 `v8cache` 强制关掉。
2. 不会。`target` 必须以 `es` 开头，例如 `es2015`。
3. 不是。源码写的是 `0.0.0-development`；`0.45.0` 是 tag / npm 身份。

## 延伸阅读

- 文档：[vercel/ncc README](https://github.com/vercel/ncc)
- 固定源码：[vercel/ncc](https://github.com/vercel/ncc) —— 本文绑定提交 `cb1f1f058bfa7de4cb63f2411e14a724e714e260`
- [[pkg]] —— 同一“收成一件东西”目标，但产物是可执行文件
- [[webpack]] —— ncc 内部真正跑的打包器

## 关联

- [[pkg]] —— 单文件 JS 对照：继续包进 Node 二进制
- [[webpack]] —— ncc 的编译内核与 `node: false` 默认
- [[esbuild]] —— 另一条更快、更少 Node 特例的打包路线
- [[vite]] —— 前端 dev/build，不是 ncc 的使用场景
- [[rollup]] —— 库打包对照组；ncc 面向应用入口

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
