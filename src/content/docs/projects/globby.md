---
title: globby — 在 fast-glob 上面补目录展开和 ignore 文件
description: 固定版本先读 ignore、再切任务，最后把匹配交给 fast-glob
来源: https://github.com/sindresorhus/globby
日期: 2026-08-27
分类: 构建工具
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/sindresorhus/globby
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 46cf13ff8bf5f0e0db96c4985faf83a59d194777
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 16.2.4
---

## 是什么

globby 是一份“好用一点的 glob”。日常类比：[[fast-glob]] 是会走路的腿；globby 在出发前先看门口的 `.gitignore`、把目录名展开成 `dir/**`，再把切好的任务交给那条腿。

固定 `16.2.4` 是 ESM，命名导出，引擎 `node >=20`。运行时依赖 `fast-glob@^3.3.3`，和本站绑定的 fast-glob 主版本一致。

```js
import { globby } from "globby"

const paths = await globby(["*", "!cake"])
```

文档强调 pattern 只能用正斜杠。Windows 反斜杠会静默空匹配。

## 为什么重要

不看这层包装，会把 globby 和 fast-glob 说成同一个函数换了个名字：

- 为什么 `globby('src')` 能扫到目录里的文件，而关掉 `expandDirectories` 后默认看不到目录本身
- 为什么 `['!*.json']` 默认会匹配“除 json 以外的一切”
- 为什么没开 `gitignore: true` 时，`.gitignore` 完全不参与
- 为什么 `!(a|b)` 在 globby 任务切分里会被当成否定，和 fast-glob 自己的 extglob 判定不同

一句话：globby 的合同是 **展开 + ignore 文件 + 再调用 fast-glob**。

## 核心要点

固定版本可以把主链拆成五步：

1. **规范化参数**：`toPatternsArray` 去重；`cwd` 经 `toPath` 接受 `URL`；`expandDirectories` 默认 true。`cwd` 若存在且不是目录会抛错。
2. **读 ignore 文件**：`gitignore` 默认 false。打开后搜 `**/.gitignore`，发现 `.git` 还会读到仓库根。`ignoreFiles` 可指向 `.prettierignore` 这类同语法文件。
3. **权威过滤 vs prune**：`ignore` 包做出的 predicate 决定最终去留。只有“否定规则救不回来”的目录，才会被译成 fast-glob `ignore`，让 walker 跳过整棵树。
4. **切任务**：`!pattern` 把后续 pattern 拆成新任务，并把否定收进 `options.ignore`。全是否定时，默认预置 `**/*`；`expandNegationOnlyPatterns: false` 则得到空任务。
5. **交给 fast-glob**：async / sync / stream 分别调 `fastGlob` / `fastGlob.sync` / `fastGlob.stream`，再用自己的 filter 去重。

utilities 的 `isNegativePattern` 只看首字符 `!`。这和 fast-glob 对 `!(...)` 的 extglob 例外不同。

## 实践示例

### 案例 1：目录名会被展开

```js
import { globby } from "globby"

const files = await globby("src", { cwd: process.cwd() })
```

若 `src` 是真实目录，会被换成 `src/**`。`**/dirname` 且 dirname 无通配、无扩展名时，也会按目录展开，不必先 stat。关掉 `expandDirectories` 后，这条路不走。

### 案例 2：尊重 gitignore，但默认关着

```js
const tracked = await globby(["**/*"], { gitignore: true })
```

打开后会读 `.gitignore`，并在能证明“不会被否定救回”时把目录 prune 给 fast-glob。只想读根目录那一份，用 `ignoreFiles: '.gitignore'`，不要用递归 `**/.gitignore`。

### 案例 3：只有否定时的默认行为

```js
await globby(["!*.json"])
// 默认等价于先匹配 **/*，再去掉 json

await globby(["!*.json"], { expandNegationOnlyPatterns: false })
// => []
```

用户可控的 pattern 若可能全是否定，应显式关掉这项，避免扫到整棵树。

## 踩过的坑

1. **以为 globby 默认读 `.gitignore`**：`gitignore` 默认 false。要 Git 行为必须打开。
2. **Windows 用 `path.join` 拼 pattern**：反斜杠会静默失败。用 `path.posix.join` 或 `convertPathToPattern`。
3. **把 `!(a|b)` 交给 globby 当 extglob**：任务切分会把它当否定。需要 extglob 时应直接走 [[fast-glob]]，或改写成它能理解的 ignore。
4. **自定义 `fs` 开 `globalGitignore` 却没给 stat**：async / stream 要 `fs.promises.stat` 或 `fs.stat`；sync 要 `statSync`。
5. **把 stream 当成 Web Stream**：固定实现返回 Node `Readable`。

## 适用 vs 不适用场景

**适用**：

- 应用代码想写 `globby('src')` 而不是手写 `src/**`
- 需要 `.gitignore` / `.eslintignore` 一类文件，且能接受先读 ignore 再 glob
- ESM、Node 20+，并把匹配细节交给 fast-glob

**不适用**：

- 必须精确复用 fast-glob 对 `!(...)` 的 extglob 语义
- 运行时低于 Node 20，或必须 CommonJS 默认导出
- 要把未跑过的遍历耗时写成“gitignore 一定更快”

## 固定版本边界

- 本文绑定 `sindresorhus/globby@46cf13ff...`；annotated tag `v16.2.4` 的 peel 与 npm `gitHead` 一致。
- 依赖 `fast-glob@^3.3.3`、`ignore`、`micromatch`、`slash`、`unicorn-magic` 等。
- `globalGitignore` 只读用户级 Git config，不读仓库 `.git/config` 或系统 config。
- 未安装依赖、未跑 ava / tsd / bench，状态保持 `UNVERIFIED`。

## 学到什么

1. **包装层的默认值会改变语义**——目录展开和否定-only 都不是 fast-glob 原样
2. **gitignore 是显式开关**，不是“更友好”就默认打开
3. **predicate 才是权威过滤器**；交给 fast-glob 的 ignore 只是可证明的 prune
4. **两套 `!` 判定不能混用**

## 应用型自测

1. `await globby(['!*.md'])` 在默认选项下会得到空数组吗？
2. 不传 `gitignore` 时，仓库根的 `.gitignore` 会生效吗？
3. `globbyStream('*.tmp')` 返回的是 Web Stream 吗？

检查点：

1. 不会。默认预置 `**/*`，再去掉 markdown。
2. 不会。`gitignore` 默认 false。
3. 不是。固定实现返回 Node `Readable`。

## 延伸阅读

- 固定源码：[sindresorhus/globby](https://github.com/sindresorhus/globby) —— 本文绑定提交 `46cf13ff8bf5f0e0db96c4985faf83a59d194777`
- 审查记录：仓库内 `docs/glob-source-review-20260827-ek.md`
- [[fast-glob]] —— 真正走路的 walker 与 micromatch 合同
- [[vite]] —— 常见的 glob 消费者
- [[vitest]] —— 测试发现路径上的对照

## 关联

- [[fast-glob]] —— 被 globby 调用的匹配与遍历层
- [[vite]] —— 构建入口，通常不自己实现 glob
- [[webpack]] —— 打包器侧的文件图对照
- [[vitest]] —— 测试文件发现
- [[biome]] —— 另一条会读 ignore 文件的工具链，语法不是 gitignore 包装

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）
