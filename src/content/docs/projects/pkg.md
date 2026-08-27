---
title: pkg — 把 Node 项目打进可执行文件
description: 介绍 @yao-pkg/pkg 6.22.0 如何用 walker、补丁 Node 与 SEA 两条管线生成跨平台可执行文件。
来源: https://github.com/yao-pkg/pkg
日期: 2026-08-27
分类: 构建工具
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: tool
  canonical_source: https://github.com/yao-pkg/pkg
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 8d3d7af9fe9cbb02ec60c78c4c71de343e259c0a
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 6.22.0
---

## 是什么

pkg（`@yao-pkg/pkg`）是一个把 Node.js 项目收成单个可执行文件的打包器。日常类比：不是再让对方机器先装 Node，而是把“解释器 + 你的代码 + 一张虚拟磁盘”焊进一个二进制。

你写：

```bash
npx @yao-pkg/pkg .
```

不给 `--targets` 且输出名自动推导时，`resolveTargetList` 会按宿主 `node<major>` 展开 `linux` / `macos` / `win`。这是 archived [`vercel/pkg`](https://github.com/vercel/pkg) 的维护分叉；npm 包名是 `@yao-pkg/pkg`，`engines.node` 为 `>= 22.0.0`。

## 为什么重要

不理解 pkg 的“先 walk 再注入”和传统模式 / SEA 分叉，就解释不了下面几件事：

- 为什么 `pkg index.js` 往往一次吐出三个平台的文件
- 为什么运行时 `fs.readFile` 还能读到并不在磁盘上的脚本
- 为什么 `--sea` 对单文件和带 `package.json` 的项目不是同一条路
- 为什么旧 npm 名 `pkg@5.8.1` 和现在的 `@yao-pkg/pkg@6.22.0` 不是同一棵树

## 核心要点

固定 6.22.0 的主链可以拆成五步：

1. **先理解用户要什么**：`exec()` 把 argv / 配置收成一份 `ResolvedConfig`。`runPreBuild` 在 walk、下载 Node、SEA 之前只跑一次。

2. **默认三条主机三元组**：缺 targets 且自动命名输出时，假设 `linux` / `macos` / `win`，Node 版本跟当前进程走。写了 `-o` 但没写 targets 则退回 `host`。

3. **传统模式改的是补丁 Node**：`@yao-pkg/pkg-fetch` 取带占位符的 Node 底包；walker 用 Babel 收集 `require` / `import`；refiner 压缩路径；packer 把 prelude 和 stripe 序列化；producer 写入 `PAYLOAD_*` / `PRELUDE_*` / `BAKERY`。

4. **`--sea` 分简单和增强**：没有 `package.json` 时走简单 SEA——单文件、无 walker、禁止 `--compress`。有配置则走增强 SEA：walker（`seaMode`）+ `@roberts_lando/vfs` + `postject` 注入 `NODE_SEA_BLOB`。增强模式要求目标 Node >= 22，并拒绝 `useSnapshot`。

5. **运行时靠虚拟文件系统**：传统模式的 `prelude/bootstrap.js` 拦截 `fs` / `Module` / `child_process` / `process.dlopen`，从可执行文件自身读 payload。路径落在 `/snapshot/` 里才走 VFS。

## 实践示例

### 案例 1：从 `package.json` 的 `bin` 出发

```bash
pkg . -t node22-linux,node22-macos,node22-win -C GZip
```

`.` 会读当前包的 `bin`。`-C GZip` 走 `CompressType.GZip`。`Zstd` 需要宿主 `zlib.zstdCompressSync`，也就是 Node >= 22.15；否则源码抛统一错误，让你改 Brotli / GZip。

### 案例 2：程序调用与 CLI 共用 `exec`

```js
const { exec } = require('@yao-pkg/pkg');

await exec({
  input: 'src/cli.js',
  targets: ['node22-linux-x64'],
  output: 'dist/cli',
  compress: 'Brotli'
});
```

`exec` 有 argv 数组和 options 对象两种重载。`log.debugMode` 每次无条件重写，避免上一次 `debug:true` 漏到下一次调用。

### 案例 3：简单 SEA 不能带压缩

```bash
pkg app.js --sea
# 下一行会在固定源码里被拒绝：
# pkg app.js --sea --compress GZip
```

`index.ts` 写明：简单 SEA 没有 per-file archive，因此没有可压缩对象。要压缩，得给项目一个带 `pkg` / `bin` 的 `package.json`，进入增强 SEA。

## 踩过的坑

1. **继续安装 npm 名 `pkg`**：`pkg@5.8.1` 对应 archived `vercel/pkg` 的 `5dc987b9...`。当前维护线是 `@yao-pkg/pkg`。本页绑定后者的 tag 剥皮提交。

2. **把 `--sea` 当成“传统模式加一个开关”**：简单 SEA 不走 walker，也不做 ESM→CJS。增强 SEA 不生成 `STORE_BLOB` 字节码，源码按原样进 VFS。

3. **在增强 SEA 里开 `useSnapshot`**：`seaEnhanced` 会直接拒绝。快照要求构建期跑主脚本，而 VFS 资源那时还不存在。

4. **以为默认只打当前平台**：自动输出名时默认三个 OS。只想要本机，需要显式 `-t host` 或自己写 `-o` 且不给多目标。

5. **把 README 的体积、启动时间当成本轮测量**：文档和 `docs-site` 写过对比，本轮未下载 base binary、未执行打包。

## 适用 vs 不适用场景

**适用**：

- 目标机器不能或不想先装 Node，需要 Linux / macOS / Windows 可执行文件
- 能接受静态 walk 的依赖闭包，并愿意为 native addon、资源路径配置 `pkg.assets` / `pkg.scripts`
- 传统模式需要源码保护时，用字节码（`STORE_BLOB`）；能接受 SEA 官方注入时再开 `--sea`

**不适用**：

- 只要把 Node 项目收成单文件 JS，仍用系统 Node 跑——先看 [[ncc]]
- 动态加载无法被 walker 看见，又没有配置补进快照
- 构建主机低于 Node 22，或增强 SEA 目标低于 22
- 需要浏览器 bundle——看 [[esbuild]] / [[vite]] / [[webpack]]

## 固定版本边界

- 本文绑定 `yao-pkg/pkg@8d3d7af9fe9cbb02ec60c78c4c71de343e259c0a`，即 annotated tag `v6.22.0` 的剥皮提交（`Release 6.22.0`）。
- npm `@yao-pkg/pkg@6.22.0` 的 `gitHead` 是父提交 `c1e10f542a00843d758325027ae81b69b5bcf51f`。本页跟 tag，不跟 npm `gitHead`。
- 运行时依赖包含 `@yao-pkg/pkg-fetch@3.6.5`、`esbuild`、`postject`、`@roberts_lando/vfs`。`package.json` 要求 Node `>=22.0.0`。
- 旧线 `vercel/pkg` / npm `pkg@5.8.1` 停在 `5dc987b90ffd191263eb0202833dc382cea0d47d`，本页不把它当现行实现。
- 本文未安装依赖、未调用 `pkg-fetch`、未生成可执行文件。状态保持 `UNVERIFIED`。

## 学到什么

1. **可执行文件 = Node 底包 + 一份快照**——传统模式改补丁二进制；SEA 改官方 blob 注入。
2. **`--sea` 不是一种模式**——简单和增强在 walker、压缩、ESM 上合同不同。
3. **默认三平台来自自动输出名**——不是“永远打三个”，而是 `autoOutput` 时的历史默认。
4. **发布树可以和 tag 差一个 Release 提交**——读 npm `gitHead` 前先剥 annotated tag。

## 应用型自测

1. `pkg index.js --sea --compress GZip` 在固定 6.22.0 会成功吗？
2. 不写 `--targets`、也不写 `-o` 时，默认会不会只打当前 OS？
3. 本页绑定的 SHA 等于 npm `@yao-pkg/pkg@6.22.0` 的 `gitHead` 吗？

检查点：

1. 不会。简单 SEA（无 package.json）明确拒绝 `--compress`。
2. 不会。自动输出名时假设 `linux` / `macos` / `win`。
3. 不相等。绑定的是 tag 剥皮提交 `8d3d7af9...`；npm `gitHead` 是它的父提交。

## 延伸阅读

- 文档：[yao-pkg.github.io/pkg](https://yao-pkg.github.io/pkg/)
- 架构：[docs/ARCHITECTURE.md](https://github.com/yao-pkg/pkg/blob/main/docs/ARCHITECTURE.md)
- 固定源码：[yao-pkg/pkg](https://github.com/yao-pkg/pkg) —— 本文绑定提交 `8d3d7af9fe9cbb02ec60c78c4c71de343e259c0a`
- [[ncc]] —— 停在单文件 JS 的对照组
- 旧仓：[vercel/pkg](https://github.com/vercel/pkg) —— 已归档

## 关联

- [[ncc]] —— 同一目标的另一层：单文件 JS，不焊 Node
- [[esbuild]] —— pkg 的构建依赖之一；本身不做可执行文件注入
- [[webpack]] —— ncc 的内核；pkg 传统模式不走 webpack
- [[bun]] —— 另一条“直接跑/可执行”运行时，不是这套 VFS 注入
- [[deno]] —— 自带 compile；合同与 pkg 的 Node 底包不同

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
