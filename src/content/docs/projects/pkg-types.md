---
title: pkg-types — 给 package.json 和 tsconfig 一套可读可写的类型与查找
description: 介绍 pkg-types 如何查找、解析和写回 package.json / tsconfig，以及 workspace 根的探测顺序。
来源: https://github.com/unjs/pkg-types
日期: 2026-08-27
分类: 前端工程化
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/unjs/pkg-types
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 6dc514b530123f2e4147727019dba6d128a0754f
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 2.3.1
---

## 是什么

pkg-types 是一套给 `package.json`、`tsconfig.json` 和 `.git/config` 用的 TypeScript 类型加查找/读写函数。日常类比：它不是包管理器，而是仓库里的档案柜钥匙——告诉你最近的清单在哪、怎么读（含注释）、怎么按约定排好再写回去。

```ts
import { readPackageJSON, findWorkspaceDir } from "pkg-types"

const pkg = await readPackageJSON()
const root = await findWorkspaceDir()
```

固定 `2.3.1` **只有 ESM 入口**（`exports["."] = ./dist/index.mjs`）。解析器来自 `confbox`，非绝对路径的起点解析走 `exsolve`。

## 为什么重要

不读固定 2.3.1，下面这些边界会对不上：

- 为什么 `readPackage` 能读 json5/yaml，`readPackageJSON` 却只认 `package.json`
- 为什么从 `node_modules` 里面往上找会直接失败
- 为什么 `findWorkspaceDir` 先找最远的 workspace 文件，却把 `.git/config` 当成最近
- 为什么默认不复用上次读到的对象，除非你打开 `cache`

## 核心要点

固定版本可以拆成四层：

1. **`findFile`**：从 `startingFrom` 的路径段向上（或 `reverse` 时向下）试文件名数组。默认 `test` 是 `statSync` 为文件。`rootPattern` 默认 `/^node_modules$/`，命中该段就不再越过。找不到抛 `Cannot find matching …`。

2. **读包**：`findPackage` / `readPackage` 的候选是 `package.json`、`package.json5`、`package.yaml`。`resolvePackageJSON` / `readPackageJSON` 只找 `package.json`；先 `parseJSON`，失败再 `parseJSONC`。`options.cache` 为真才读缓存；解析后仍写入模块级 `FileCache`。

3. **工作区**：`findWorkspaceDir` 默认测试顺序是 `workspaceFile` → `gitConfig` → `lockFile` → `packageJson`。除 `gitConfig` 默认 `closest` 外，其余默认 `furthest`。workspace 文件包括 `pnpm-workspace.yaml`、`lerna.json`、`turbo.json`、`rush.json`、`deno.json(c)`。lockfile 列表含 yarn / npm / pnpm / bun / deno。

4. **改写**：`updatePackage` 读出对象后套 Proxy，访问 `scripts`、各类 dependency map 等空字段时自动建成 `{}`，再按原扩展名写回。`sortPackage` 按固定顶层顺序重排并给 dependency/scripts 按 key 排序，不改输入。`normalizePackage` 在排序后再删掉不是普通对象的 dependency 字段。

## 实践示例

### 案例 1：readPackage 与 readPackageJSON 不是同一把钥匙

```ts
import { readPackage, readPackageJSON } from "pkg-types"

const anyFmt = await readPackage("/path/to/dir")     // json / json5 / yaml
const jsonOnly = await readPackageJSON("/path/to/dir") // 只找 package.json
```

目录里只有 `package.yaml` 时，前者能读到，后者会一直往上找下一个 `package.json`，或在撞到 `node_modules` 后抛错。带注释的 `package.json` 两条路都能走 JSONC 回退。

### 案例 2：查找停在 node_modules

```ts
await resolvePackageJSON("/app/node_modules/pkg/file.json")
// throw: Cannot find matching package.json
```

`findFile` 先定位路径里的 `node_modules` 段，再把搜索下界设在那里。测试明确覆盖了“不能穿过 node_modules 去拿外面的清单”。

### 案例 3：updatePackage 的空 map 与排序

```ts
import { updatePackage, sortPackage } from "pkg-types"

await updatePackage("./package", (pkg) => {
  pkg.version = "1.0.1"
  pkg.dependencies.lodash = "^4.17.21" // Proxy 会先建空 dependencies
})

const snapshot = sortPackage(pkg) // 新对象；输入不被原地重排
```

`writePackage` 按扩展名选 `stringifyJSON` / `JSON5` / `YAML`。`writeTSConfig` 走 `stringifyJSONC`，和 package JSON 的严格 stringify 不是同一条。

## 踩过的坑

1. **把 `readPackageJSON` 当成“读任何包清单”**：json5/yaml 只在 `readPackage` 家族。
2. **在依赖目录里找仓库根**：默认会停在 `node_modules`。
3. **以为读过一次就会缓存**：必须显式 `cache: true`（或自带 Map）才会命中。
4. **把 `findWorkspaceDir` 全当成 nearest**：workspace / lockfile / package 默认最远，只有 git config 默认最近。
5. **用 `require("pkg-types")`**：固定 2.3.1 没有 CJS export。[[mlly]] 1.8.2 依赖的仍是 1.x。

## 适用 vs 不适用场景

**适用**：

- CLI / 脚手架需要按约定找到最近或最远的清单、lockfile、tsconfig
- 要在 JS 文件里用 `definePackageJSON` / `defineTSConfig` 拿类型提示
- 与 [[mlly]] 分工：包元数据在这里，模块 URL / interop 在那边

**不适用**：

- 需要完整 TypeScript project reference 解析——这里只读最近的 `tsconfig.json`，不走 `tsconfck` 那套
- 要把未运行的 vitest / 体积数字写成选型结论
- 还在 CJS 工具链里 `require` 这个包

## 固定版本边界

- 本文绑定 `unjs/pkg-types@6dc514b530123f2e4147727019dba6d128a0754f`，tag / npm latest 均为 `2.3.1`。
- npm tarball 未提供 `gitHead`；身份按 tag + 包版本 + SHA。
- 运行时依赖 `confbox`、`exsolve`、`pathe`。
- 本文未安装依赖、运行测试或测量 bundle，状态保持 `UNVERIFIED`。

## 学到什么

1. **“读 package”有两套入口**——格式族和 `package.json` 专用必须分开记。
2. **搜索边界是一等合同**——`node_modules` 不是普通目录。
3. **workspace 根是一条优先级链**——方向（最近/最远）按测试项不同。
4. **缓存默认关闭**——模块级 Map 在，但读取要你打开。

## 应用型自测

1. 目录里只有 `package.yaml`，调用 `readPackageJSON(dir)` 一定读到它吗？
2. 从 `.../node_modules/foo/src` 调用 `resolvePackageJSON`，会不会拿到仓库根的清单？
3. 不传 `cache` 连续两次 `readPackageJSON` 同一路径，第二次会直接返回内存对象吗？

检查点：

1. 不一定。它只找 `package.json`。
2. 不会。默认在 `node_modules` 段停住并抛错。
3. 不会。只有 `options.cache` 为真才走缓存读取。

## 延伸阅读

- 文档：[github.com/unjs/pkg-types](https://github.com/unjs/pkg-types)
- 固定源码：[unjs/pkg-types](https://github.com/unjs/pkg-types) —— 本文绑定提交 `6dc514b530123f2e4147727019dba6d128a0754f`
- [[mlly]] —— 模块 resolve / interop；1.8.2 仍依赖 pkg-types 1.x
- [[pnpm]] —— workspace 文件是 `findWorkspaceDir` 的第一优先标记之一
- [[node-js]] —— `package.json` 的 `exports` / `type` 由运行时解释，本库只负责读文件

## 关联

- [[mlly]] —— ESM 模块身份，对照包元数据
- [[pnpm]] —— lockfile 与 workspace 探测的常见来源
- [[vite]] —— 消费 package exports，不负责这套查找 API
- [[node-js]] —— 运行时如何解释 `type` 与 `exports`
- [[unstorage]] —— 同生态的另一类“统一读取”，目标是 KV

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）
