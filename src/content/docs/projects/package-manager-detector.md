---
title: package-manager-detector — 按策略探测包管理器并拼出命令
description: 默认先扫 lockfile，只返回命令模板，不 spawn
来源: https://github.com/antfu-collective/package-manager-detector
日期: 2026-08-27
分类: 包管理
难度: 初级
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/antfu-collective/package-manager-detector
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 1042cf8c004c450b642c9ed3df6a098b5838c050
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 1.8.0
---

## 是什么

package-manager-detector 是一份 **零依赖的探测 + 命令拼装库**。日常类比：它只告诉你这间办公室该找哪位库管、口头指令怎么说，自己不走进库房。

```js
import { detect } from "package-manager-detector/detect"
const pm = await detect()
```

固定 `1.8.0` 返回 `{ name, agent, version? }`。`name` 是短名；`agent` 才带 `yarn@berry` / `pnpm@6` / `pnpm-rush` 这种修饰。

## 为什么重要

它常被当成 [[nypm]] 的内部实现，或被写成“看见 lockfile 就定案”：

- 为什么默认策略是 lockfile 优先，字段在后
- 为什么 `rush.json` 会抢在普通 pnpm lock 前面
- 为什么 yarn 主版本 > 1 时 `version` 被改写成 `'berry'`
- 为什么 `resolveCommand` 对某些 agent 返回 `null`

一句话：它是 **可配置探测 + argv 模板**，不是执行器。

## 核心要点

固定 1.8.0 可以拆成四层：

1. **名单**：`AGENTS` 含 npm / yarn / yarn@berry / pnpm / pnpm@6 / pnpm-rush / bun / deno / nub / aube。`LOCKS` 把 `aube-lock.yaml`、`nub.lock`、`pnpm-workspace.yaml`、`npm-shrinkwrap.json` 都算进去。
2. **探测循环**：从 `cwd` 向上走，每层按 `strategies` 顺序试。默认是 `lockfile` → `packageManager-field` → `devEngines-field`。`install-metadata`（`.pnpm/`、`.pnp.cjs`、`.yarn_integrity` 等）必须显式打开。
3. **字段解析**：`packageManager` 去掉前导 `^` 再按 `@` 切开；yarn 主版本 > 1 → `agent: 'yarn@berry'`；pnpm 主版本 < 7 → `agent: 'pnpm@6'`。未知名字走 `onUnknown`，否则 `null`。
4. **命令表**：`resolveCommand(agent, command, args)` 把表里的数字 `0` 换成用户 args。`null` 项（npm 的 `upgrade-interactive`，yarn classic / bun / deno 的 `dedupe`）整段返回 `null`。

`lookup()` 在文件系统 root **之前**停下，不会检查 root 目录本身。`getUserAgent()` 只读 `npm_config_user_agent` 的第一段。

## 实践示例

### 案例 1：默认探测

```js
import { detect } from "package-manager-detector/detect"

const pm = await detect({ cwd: process.cwd() })
// 例如 { name: 'pnpm', agent: 'pnpm', version: '11.15.1' }
```

当前目录有 lockfile 就先认 lock；同层 `package.json` 若带 `packageManager`，字段结果会覆盖 lock 的短名。

### 案例 2：拼一条全局安装命令

```js
import { resolveCommand } from "package-manager-detector/commands"

const resolved = resolveCommand("pnpm", "global", ["@antfu/ni"])
// { command: "pnpm", args: ["add", "-g", "@antfu/ni"] }
```

yarn berry 的 `global` 会变成 `npm i -g`，因为 berry 去掉了 global。

### 案例 3：改策略，先看安装痕迹

```js
import { detect } from "package-manager-detector/detect"

await detect({
  strategies: ["install-metadata", "lockfile", "packageManager-field"],
})
```

默认探测看不到 `node_modules/.pnpm/`。`stopDir` 可以是绝对路径或函数；测试里停在中间层会得到 `null`。

## 踩过的坑

1. **当成 [[nypm]] 的依赖**：两边固定版本互不 import。nypm 会 spawn；本库只返回字符串数组。
2. **默认策略不含 install-metadata**：README 举例要自己改 `strategies`。
3. **deno 的 execute**：命令表是 `deno x`，不是 nypm 的 `deno run -A`。
4. **yarn classic frozen**：这里是 `--frozen-lockfile`；nypm 对所有 yarn 都写 `--immutable`。
5. **以为会检查磁盘根目录**：`lookup` 在 `directory === root` 时结束，root 本身不参与。

## 适用 vs 不适用场景

**适用**：

- CLI / 脚手架只要知道该喊谁，自己控制 child_process
- 需要 `yarn@berry`、`pnpm@6`、`pnpm-rush` 这种 agent 分流
- 要可替换的探测顺序和 `packageJsonParser`

**不适用**：

- 需要库直接跑 `install` / `add`——用 [[nypm]]
- 需要从 `argv[1]` 猜 dlx 调用方——那是 nypm 的第三后备
- 要把“探测很快”或下载量写成结论

## 固定版本边界

- 本文绑定 `antfu-collective/package-manager-detector@1042cf8c...`，即 annotated tag `v1.8.0` 的解引用提交；仓内与 npm latest 都是 `1.8.0`。npm 未暴露 `gitHead`。
- 零运行时依赖；导出 `./`、`./detect`、`./commands`、`./constants`。
- 本文未安装依赖、未跑 vitest / eslint、未读真实用户仓库，状态保持 `UNVERIFIED`。

## 学到什么

1. **`name` 和 `agent` 不是同一个键**——修饰版只活在 `agent`
2. **默认先 lockfile**——和 nypm 的字段优先相反
3. **命令表可以拒绝**——`null` 表示这家没有这条动词
4. **探测不等于执行**——`resolveCommand` 只拼 argv

## 应用型自测

1. 默认 `detect()` 会不会看 `node_modules/.pnpm/`？
2. yarn `packageManager` 写成 `yarn@4.0.0` 时，`version` 字段是什么？
3. `resolveCommand('yarn', 'dedupe', [])` 在 classic agent 上返回什么？

检查点：

1. 不会。`install-metadata` 不在默认 `strategies`。
2. `'berry'`。主版本 > 1 时实现改写 version。
3. `null`。classic 的 `dedupe` 是空位。

## 延伸阅读

- 固定源码：[antfu-collective/package-manager-detector](https://github.com/antfu-collective/package-manager-detector) —— 本文绑定提交 `1042cf8c004c450b642c9ed3df6a098b5838c050`
- [[nypm]] —— 探测之后会真正 spawn
- [[pnpm]] —— lockfile 与 `packageManager` 字段的常见来源

## 关联

- [[nypm]] —— 执行层，自带另一份探测
- [[pnpm]] —— `pnpm@6` / `pnpm-rush` 分流的对照对象
- [[volta]] —— 工具链版本写在 `package.json`，不是本库的策略

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[nypm]] —— nypm — 探测当前包管理器并代跑装包命令
