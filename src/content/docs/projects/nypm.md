---
title: nypm — 探测当前包管理器并代跑装包命令
description: 自带探测且不包装 package-manager-detector，yarn frozen 一律写成 --immutable
来源: https://github.com/unjs/nypm
日期: 2026-08-27
分类: 包管理
难度: 初级
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/unjs/nypm
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 98e209c05c53db85b7f990e4da9487fb3e45f200
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 0.6.9
---

## 是什么

nypm 是一份 **统一装包 API + CLI**。日常类比：前台不自己进库房，只看你桌上的工牌和门锁，再替你喊对应的库管——npm、yarn、pnpm、bun、deno，以及 0.6.9 新收的 aube / nub。

```js
import { addDependency } from "nypm"
await addDependency("defu")
```

固定 `0.6.9` 自己实现 `detectPackageManager`。运行时依赖是 `citty`、`pathe`、`tinyexec`，**没有** [[package-manager-detector]]。

## 为什么重要

名字容易让人以为它只是 ni 的薄壳，或直接复用 antfu 的探测库：

- 为什么探测顺序先看 `package.json` 字段，再看 lockfile
- 为什么 `includeParentDirs` 的 JSDoc 写 `@default false`，实现却默认往上走
- 为什么 `frozenLockFile: true` 对 yarn 永远编成 `--immutable`
- 为什么 yarn / pnpm 默认套 corepack，bun / deno / aube / nub 不套

一句话：它是 **探测 + 真正 spawn** 的执行层，不是命令模板表。

## 核心要点

固定 0.6.9 的主链可以拆成五步：

1. **名单**：`packageManagers` 顺序是 npm → aube → nub → pnpm → bun → yarn → deno。aube / nub 必须排在 pnpm 前面，避免 `pnpm-workspace.yaml` 抢走锁文件。
2. **探测**：`packageManager` 字段 → `devEngines.packageManager`（对象或数组首项，version 当 semver range，主版本取第一个数字）→ lockfile / 伴随文件 → `process.argv[1]` 路径里的 `/.npm` 这类 dlx 痕迹。
3. **解析选项**：`resolveOperationOptions` 找不到管理器就抛 `No package manager auto-detected.`；`corepack` 默认 `true`，`dry` 默认不执行。
4. **编命令再 spawn**：`install` / `add` / `remove` / `run` / `dlx` / `dedupe` 先拼 args，再交给 `tinyexec`。非 TTY 时 stdin 设成 `ignore`，避免 pnpm 的 `Proceed?` 挂死。
5. **CLI**：`nypm install|i|add`、`remove|rm|uninstall|un`、`detect`、`dedupe`、`run`。有位置参数时 `install` 走 `addDependency`。

`devEngines` 是 v0.6.9 才进主链的；nub 也是这一版才进名单。

## 实践示例

### 案例 1：按当前仓库装依赖

```js
import { installDependencies } from "nypm"

await installDependencies({
  cwd: process.cwd(),
  frozenLockFile: true,
})
```

npm 编成 `ci`；yarn 编成 `install --immutable`；pnpm / bun / aube / nub 用 `--frozen-lockfile`；deno 用 `--frozen`。

### 案例 2：deno 的 add 会补 `npm:`

```js
import { addDependency } from "nypm"
await addDependency("defu", { packageManager: "deno" })
```

名字若不是 `npm:` / `jsr:` / `file:` 开头，实现会改写成 `npm:defu`。yarn classic 的 global 才插 `global add`；berry 不走这条。

### 案例 3：只看探测、不执行

```js
import { detectPackageManager } from "nypm"
const pm = await detectPackageManager(".", { ignoreLockFile: true })
```

只读 `package.json` 字段。两个 ignore 开关可以分别关掉字段或锁文件。

## 踩过的坑

1. **当成 [[package-manager-detector]] 的包装**：本提交的 `dependencies` 没有那个包。探测顺序也相反——nypm 先字段，后 lockfile。
2. **相信 JSDoc 的 `includeParentDirs` 默认 false**：`detectPackageManager` 调用 `findup` 时写的是 `options.includeParentDirs ?? true`。
3. **yarn classic 的 frozen**：实现不看 `majorVersion`，一律 `--immutable`。classic 文档里的旗是 `--frozen-lockfile`。
4. **把 `dlx` 的 deno 写成 `deno x`**：nypm 的 `dlxCommand` 是 `deno run -A`。
5. ** bun / deno 上直接 `dedupe`**：默认会删 lockfile 再 `install`（`recreateLockfile` 默认 `!isSupported`）；不是各家自带的 dedupe 子命令。

## 适用 vs 不适用场景

**适用**：

- 工具要在用户仓库里真正跑 `install` / `add` / `run`
- 需要 CLI 一层（`npx nypm i`）而不是自己拼 argv
- 能接受 corepack 代理 yarn / pnpm

**不适用**：

- 只要探测结果和命令模板、自己去 spawn——那是 [[package-manager-detector]]
- 需要 `yarn@berry` / `pnpm@6` / `pnpm-rush` 这种 agent 修饰
- 要把未测的安装耗时或下载量写成选型结论

## 固定版本边界

- 本文绑定 `unjs/nypm@98e209c0...`，即 annotated tag `v0.6.9` 的解引用提交；仓内与 npm latest 都是 `0.6.9`。npm 未暴露 `gitHead`。
- 引擎 `node >= 18`，`"type": "module"`，许可证 MIT。
- 本文未安装依赖、未跑 vitest / oxlint、未调用真实包管理器，状态保持 `UNVERIFIED`。

## 学到什么

1. **统一 API 不等于共用探测库**——本页自己实现 `detectPackageManager`
2. **字段优先会压过 lockfile**——和 detector 默认策略相反
3. **frozen 旗不是各家原文照抄**——yarn 被收成 `--immutable`
4. **spawn 细节是合同**——corepack、stdin、dry 都会改行为

## 应用型自测

1. 固定 0.6.9 的运行时依赖里有 `package-manager-detector` 吗？
2. `installDependencies({ frozenLockFile: true })` 对 yarn classic 编什么参数？
3. `includeParentDirs` 不传时，探测会不会往父目录走？

检查点：

1. 没有。依赖是 `citty`、`pathe`、`tinyexec`。
2. `install --immutable`，不区分 classic。
3. 会。实现默认 `true`，与 JSDoc 相反。

## 延伸阅读

- 固定源码：[unjs/nypm](https://github.com/unjs/nypm) —— 本文绑定提交 `98e209c05c53db85b7f990e4da9487fb3e45f200`
- [[package-manager-detector]] —— 探测 + 命令模板，不 spawn
- [[pnpm]] —— nypm 探测名单里的一家，不是本库实现

## 关联

- [[package-manager-detector]] —— 只检测、不执行
- [[pnpm]] —— lockfile 与 workspace 协议的对照
- [[bun]] —— 运行时自带装包，nypm 只是代跑 `bun`

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[package-manager-detector]] —— package-manager-detector — 按策略探测包管理器并拼出命令
