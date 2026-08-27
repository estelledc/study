---
title: depcheck — 对照 package.json 找未使用和缺失依赖
description: 固定版本用 parser / detector / special 三件套扫描单包依赖
来源: https://github.com/depcheck/depcheck
日期: 2026-08-27
分类: 依赖分析
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: tool
  canonical_source: https://github.com/depcheck/depcheck
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: b180e2ec82a7c1413bc29df260561076030b1734
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 1.4.7
---

## 是什么

depcheck 是一份 Node CLI / 库，用来对照当前目录的 `package.json`，看哪些依赖没被源码或配置用到，哪些又被用到却没写进清单。日常类比：它拿着购物清单在厨房里点货，不负责画出整栋楼的管线。

固定 npm 包是 `depcheck@1.4.7`。GitHub 仓库在审查日已经 archived。仓库里的 `package.json` 仍写 `0.0.1`；发布到 npm 的 `1.4.7` 用同一提交的 `gitHead`。

```bash
npx depcheck
```

`bin/depcheck.js` 先跑 `please-upgrade-node`，再把参数交给 `src/cli.js`。

## 为什么重要

不看固定实现，容易把它和 [[knip]] 说成同一类产品：

- 为什么结果里没有 unused files / unused exports
- 为什么子目录一旦自带 `package.json` 就会被跳过
- 为什么 TypeScript 支持取决于你有没有装 `typescript`
- 为什么 CLI 出错时退出码是 `-1`，而不是 Knip 的 `1` / `2`

一句话：depcheck 的合同是 **单根目录 + 可插拔 parser/detector/special + 差集**。

## 核心要点

固定 `1.4.7` 的主链可以拆成四步：

1. **读配置**：cosmiconfig 搜索；`.js` 配置 loader 被设成恒返回 `null`。必须存在 `package.json`。
2. **列依赖**：从 `dependencies` / `devDependencies` 取出名字，按 `ignoreMatches` 和可选的 `ignoreBinPackage` 过滤。
3. **扫文件**：`readdirp` 走目录；`directoryFilter` 遇到含 `package.json` 的子目录就停。parser 抽出 AST 或字符串列表，detector 认 import / require，special 认 eslint / webpack 这类配置。
4. **做差集**：`using` 里没有的 declared dep 记 unused；declared 里没有的 used 名字记 missing（除非 `skipMissing`）。

默认 ignore 包含 `node_modules` 和一批图片、字体、压缩包扩展名。未指定 `ignorePath` 时，先找 `.depcheckignore`，再找 `.gitignore`。

## 实践示例

### 案例 1：对当前包装一次

```bash
npx depcheck
```

**逐部分解释**：

1. 目录默认是 `.`，解析后必须看得到 `package.json`。
2. 没有 unused / missing 时打印 `No depcheck issue`（除非 `--quiet`）。
3. 有问题时 CLI 调用 `exit(-1)`。

### 案例 2：忽略二进制包和指定目录模式

```bash
npx depcheck --ignore-bin-package --ignore-patterns=dist,coverage
```

`ignoreBinPackage` 会查依赖自己的 `package.json` 是否带 `bin`。`ignoreDirs` 仍被接受，但实现已把它并进 `ignorePatterns` 的 glob 语法。

### 案例 3：TypeScript 只会在 `@types` 已声明时把它算 used

```ts
import lodash from "lodash"
```

typescript parser 若发现 `lodash`，且 `deps` 里已有 `@types/lodash`，才会把 `@types/lodash` 一并记进 used。没有声明 `@types/lodash` 时，不会凭空补上。

## 踩过的坑

1. **把嵌套 package 当成 monorepo workspace**：`isModule` 为真的子目录会被 `directoryFilter` 跳过。
2. **从源码树直接读版本号**：仓库 `version` 是 `0.0.1`，npm 发布是 `1.4.7`。
3. **指望 `.depcheckrc.js` 生效**：cosmiconfig 的 `.js` loader 被关掉。
4. **把 README 的 special 清单当成每次全开后的实测结果**：默认会装入全部 special 模块，但本轮没有跑它们。
5. **把 archived 仓库写成仍在发新版**：绑定的最新 tag 仍是 2023-10-17 的 `v1.4.7`。

## 适用 vs 不适用场景

**适用**：

- 单个 Node 包，主要想看 unused / missing 依赖
- 能接受 Node `>=10`，以及 Babel / `@vue/compiler-sfc` 这条解析栈
- 需要可编程 API：`depcheck(rootDir, options, callback)` 返回同一份结果对象

**不适用**：

- 要 unused files、unused exports、workspace hoist 或 `--strict` 生产面；那是 [[knip]]
- 子包各自有 `package.json` 的 monorepo，又期望一次扫完
- 需要把静态阅读写成仍在积极维护或已验证误报率

## 固定版本边界

- 本文绑定 `depcheck/depcheck@b180e2ec...`，tag `v1.4.7`，npm `depcheck@1.4.7`。
- npm `gitHead` 与 tag 一致；仓库 `package.json#version` 仍为 `0.0.1`。
- GitHub 仓库在 2026-08-27 为 archived。许可为 MIT。
- 本文只做源码静态审查，没有安装依赖或运行 CLI，状态保持 `UNVERIFIED`。

## 学到什么

1. **购物清单差集和模块图是两种合同**——depcheck 只做前者
2. **遇到子 package.json 就停**，所以它不是 workspace 工具
3. **special 用来补配置文件里的隐式依赖**，不是第二套语言 parser
4. **archived 不等于不能读固定版本**，但也不能外推后续发布

## 应用型自测

1. `packages/app/package.json` 存在时，根目录一次 `depcheck` 会进入 `packages/app` 吗？
2. 源码 `import 'foo'` 且未声明 `@types/foo`，typescript parser 会把 `@types/foo` 标成 used 吗？
3. 发现 unused 依赖时，CLI 的退出码是 `1` 吗？

检查点：

1. 不会。含 `package.json` 的子目录被 directoryFilter 跳过。
2. 不会。只有 `@types/foo` 已在 deps 里才会并记。
3. 不是。固定 CLI 调用 `exit(-1)`。

## 延伸阅读

- 固定源码：[depcheck/depcheck](https://github.com/depcheck/depcheck) —— 本文绑定提交 `b180e2ec82a7c1413bc29df260561076030b1734`
- 审查记录：仓库内 `docs/unused-dep-source-review-20260827-fx.md`
- [[knip]] —— 同赛道里带工作区图和导出分析的对照
- [Node.js subpath imports](https://nodejs.org/api/packages.html#subpath-imports) —— `#` imports map 的语言合同

## 关联

- [[knip]] —— workspace / 导出 / 文件图；depcheck 不做这些
- [[oxc]] —— Knip 的解析栈对照；depcheck 走 Babel
- [[webpack]] —— special 会认 loader
- [[biome]] —— 另一条 lint/format 工具链，不是依赖差集工具
- [[vite]] —— 不在固定 special 清单里，不能默认当成已支持

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[knip]] —— Knip — 按工作区图找未使用依赖、导出和文件
