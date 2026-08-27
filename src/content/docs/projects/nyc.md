---
title: nyc — 用 AST 插桩收集 Istanbul 覆盖率的 CLI
description: 默认 hook require 并改写源码，把 __coverage__ 写成 .nyc_output 的 Istanbul 命令行
来源: https://github.com/istanbuljs/nyc
日期: 2026-08-27
分类: 测试框架
难度: 初级
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/istanbuljs/nyc
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 3ce6d979a1c6753263165d31cb985523b5a81855
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 18.0.0
---

## 是什么

nyc 是 Istanbul 的命令行。日常类比：它是在试卷印刷阶段就印上答题痕迹的复写纸——`require` 到的源码先被改写成带计数器的版本，进程退出时再把 `global.__coverage__` 倒进 `.nyc_output`。

```js
// 子进程里看到的已不是原文件，而是 istanbul-lib-instrument 的产物
// npx nyc --reporter=text mocha
```

固定 `18.0.0` 仍是 CommonJS 包。默认**不**走 `spawn-wrap`：主进程把 `lib/register-env.js` 与 `lib/wrap.js` 推进 `node-preload`，靠 `process-on-spawn` 把 `NYC_CONFIG` 复制给后续子进程。`useSpawnWrap: true` 才退回旧的 shim 包装。

## 为什么重要

不理解 nyc 和 [[c8]] 的分工，就很难解释：

- 为什么老 Node 仓库是 `mocha + chai + nyc`，而不是 `c8 mocha`
- 为什么默认会改写 `require` 到的源码，并出现 `__coverage__`
- 为什么 `--all` 对 CJS 可能只留下 `function x () {}` 的假模块
- 为什么 `excludeAfterRemap` 默认是 `true`，和 c8 相反

## 核心要点

固定源码的主链可以拆成五步：

1. **读配置**：`@istanbuljs/load-nyc-config` 合并 CLI、`.nycrc*`、`nyc.config.js` 和 `package.json`。`cwd` 会向上找到最近的 `package.json`。schema 默认 reporter `['text']`、`temp-dir` `./.nyc_output`、`report-dir` `coverage`。

2. **选包装方式**：`useSpawnWrap` 默认 `false`。默认路径是 preload + 环境变量；旧路径才 `spawn-wrap([bin/wrap.js])`。

3. **hook 加载**：`NYC.wrap()` 默认 `hookRequire: true`，经 `istanbul-lib-hook` 包住 `require`。`hookRunInContext` / `hookRunInThisContext` 默认关。插桩器是 `istanbul-lib-instrument`，`coverageVariable: '__coverage__'`，`autoWrap` 与 `embedSource` 为 true。

4. **退出落盘**：`signal-exit` 在进程退出时把 coverage 写成 `.nyc_output/<uuid>.json`，并记下 processinfo。`cache` 默认 true，命中 `node_modules/.cache/nyc`。

5. **报告与门槛**：`report()` 先 merge JSON，再 `sourceMaps.remapCoverage`。`excludeAfterRemap` 默认 true。`--check-coverage` 默认关；阈值同样是 lines 90、其余 0。

## 实践示例

### 案例 1：最小 CJS 套件

```bash
mkdir nyc-toy && cd nyc-toy
npm init -y
npm i -D nyc@18.0.0 mocha@11.8.0
```

```bash
npx nyc --reporter=text mocha
```

主进程会 `require` preload 模块，再 `foregroundChild` 拉起 mocha。子进程里的 `require('./sum')` 经过 `_handleJs` → `instrumentSync`。退出后 `.nyc_output` 里是 Istanbul JSON，不是 V8 `result[]`。

### 案例 2：`--all` 对 CJS 和 ESM 不是同一条路

```bash
npx nyc --all --reporter=text mocha
```

`addAllFiles()` 先把 `fakeRequire` 设为 true。CJS 走 `addFile()`，变换函数直接返回 `'function x () {}'`，只为了拿到 `lastFileCoverage()`。`.mjs` 或 `package.json` 声明 `type: module` 的 `.js` 则读原文并 `instrumentSync`。不要把它理解成“把未测文件真实执行一遍”。

### 案例 3：关掉插桩，只读已有 coverage

```bash
npx nyc --instrument=false mocha
```

`bin/nyc.js` 会把 instrumenter 换成 `./lib/instrumenters/noop`。noop 用 `readInitialCoverage` 提取已经写在代码里的 coverage 数据，本身不再改写。这是给 `nyc instrument` 预插桩，或 `babel-plugin-istanbul` 这类外部插桩用的。

## 踩过的坑

1. **把默认包装写成 spawn-wrap**：schema 默认 `useSpawnWrap: false`。现在靠 `node-preload` + `process-on-spawn`。

2. **把 `--all` 当成执行未测文件**：CJS 路径返回空函数字符串；顶层副作用不会跑。

3. **以为 `excludeAfterRemap` 和 c8 一样默认 false**：nyc schema 默认 `true`，remap 之后才按 include/exclude 过滤。

4. **打开 Babel 缓存**：`babelCache` 默认 false，主进程会设 `BABEL_DISABLE_CACHE=1`。要缓存必须显式 `babel-cache=true`。

5. **extension 漏了 `.js`**：构造函数会把配置里的 extension **再 concat 一次 `.js`**。你写 `['.ts']` 不会丢掉 JS。

## 适用 vs 不适用场景

**适用**：

- 仍以 CJS `require` 为主、需要 AST 插桩的 Node 仓库
- 已经和 mocha / tap 以及 `.nycrc` 绑在一起的旧工具链
- 需要 `nyc instrument` 预插桩，或 `instrument: false` 读取外部 coverage
- 满足当前 engines：`20 || >=22`

**不适用**：

- 只想读 V8 原生覆盖率、拒绝改写源码——那是 [[c8]] 的范围
- 主要是 ESM 加载、几乎不走 `require` hook 的现代仓库
- 不能接受插桩对堆栈、source map 和启动时间的额外合同

## 固定版本边界

- 本文绑定 `istanbuljs/nyc@3ce6d979a1c6753263165d31cb985523b5a81855`，轻量 tag `nyc-v18.0.0` 与 npm `gitHead` 一致；仓库里没有 `v18.0.0` 这个旧式 tag 名。
- 默认 reporter `text`、临时目录 `./.nyc_output`、`clean=true`、`cache=true`、`hookRequire=true`。
- 子命令是 `check-coverage`、`report`、`instrument`、`merge`。
- `coverageData()` 仍在，注释写明计划在 nyc v16 移除，固定 18.0.0 还留着。
- 本文未安装依赖、运行上游 tap 或测量插桩开销，状态保持 `UNVERIFIED`。

## 学到什么

1. **Istanbul CLI 的核心是改写加载**——覆盖率对象是 `__coverage__`，不是 V8 JSON。
2. **默认包装已经换代**——preload 是主路径，spawn-wrap 是开关。
3. **`--all` 的 CJS 实现是假 require**——为了文件集合，不是为了执行。
4. **同名阈值不代表同名 remap 默认**——lines 90 两边一样，`excludeAfterRemap` 两边相反。

## 应用型自测

1. 不传 `--use-spawn-wrap` 时，nyc 默认用哪条包装路径？
2. `--all` 对普通 CJS 文件会执行原模块顶层代码吗？
3. `excludeAfterRemap` 的 schema 默认值是什么？

检查点：

1. `node-preload` + `process-on-spawn`，不是 spawn-wrap。
2. 不会。`fakeRequire` 让变换返回 `'function x () {}'`。
3. `true`。remap 之后再过滤。

## 延伸阅读

- 官方文档：[istanbul.js.org](https://istanbul.js.org/)
- 固定源码：[istanbuljs/nyc](https://github.com/istanbuljs/nyc) —— 本文绑定提交 `3ce6d979a1c6753263165d31cb985523b5a81855`
- 共享审查记录：`docs/coverage-source-review-20260827-cn.md`
- [[c8]] —— 同赛道对照：V8 JSON 而不是 AST 插桩
- [[jest]] —— 内置覆盖率，不经过 nyc 进程包装

## 关联

- [[c8]] —— 原生 V8 覆盖率 CLI，报告层仍用 Istanbul
- [[jest]] —— 测试全家桶，覆盖率走自己的 runtime
- [[vitest]] —— Vite 测试，覆盖率插件与 nyc 插桩链不同

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
