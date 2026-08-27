---
title: lilconfig — 零依赖的 cosmiconfig 子集
description: 按工具名搜索 rc / package.json / config.js，默认不含 YAML
来源: https://github.com/antonk52/lilconfig
日期: 2026-08-27
分类: 配置发现
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/antonk52/lilconfig
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 77d7186c37a3838c85d03e126172f82a8a474ece
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 3.1.3
---

## 是什么

lilconfig 是给 Node 工具用的**配置搜索器**：你给一个名字，它按一张固定搜索表从当前目录往上找 `package.json` 字段、`.namerc.*`、`.config/namerc*`、`name.config.*`，找到第一份就停。日常类比：它像一张印好的寻物清单，不像 [[unconfig]] 那样让你自己写搜查令。

固定 3.1.3 是单文件 CJS（`src/index.js`），**零运行时依赖**，`engines.node >= 14`。作者把它定位成 cosmiconfig 的子集：API 尽量像，但不默认读 YAML。

```js
const { lilconfig } = require("lilconfig")

const result = await lilconfig("myapp").search()
// 找到：{ config, filepath }；找不到：transform(null)，默认即 null
```

## 为什么重要

工具作者常把“能发现配置”和 cosmiconfig 划等号。固定源码里有几条不能外推：

- 为什么 sync API **根本不会去找** `.mjs`
- 为什么空文件默认被跳过，而不是当成 `{}`
- 为什么默认爬到**用户家目录**就停，不是磁盘根
- 为什么加一个没 loader 的扩展名，会在**构造期**炸，而不是搜到再炸

一句话：lilconfig 的合同是 **searchPlaces + loader 表 + 第一次命中**。

## 核心要点

固定 3.1.3 可以拆成五层：

1. **工厂**：`lilconfig(name, options)` 与 `lilconfigSync(name, options)` 各做一次 `getOptions`，然后返回 `{ search, load, clearLoadCache, clearSearchCache, clearCaches }`。
2. **默认搜索表**（async）：`package.json` → `.${name}rc.json/.js/.cjs/.mjs` → `.config/${name}rc` 及其 `.json/.js/.cjs/.mjs` → `${name}.config.js/.cjs/.mjs`。sync 构造时**去掉全部 `.mjs` 项**。
3. **向上走**：从 `searchFrom`（默认 `process.cwd()`）开始；每层先扫完整张表。`stopDir` 默认 `os.homedir()`，这一层**会检查**，然后再停。`parentDir` 在 POSIX 根上补成 `path.sep`。
4. **怎么算命中**：`package.json` 必须用 `packageProp`（默认 `[name]`）取出非 null 值。其它文件读到空内容时，`ignoreEmptySearchPlaces`（默认 true）就继续找；关掉则 `isEmpty: true`、`config: undefined`。
5. **加载器**：async 的 `.js/.mjs/.cjs` 先 `import(fileURL)`，再回退 `require`，并认出 `ERR_REQUIRE_ESM`。sync 的 `.js/.json/.cjs` 走 `require`；无扩展名按 JSON 解析。没有默认 YAML / TS loader。

`cache` 默认打开：search 按目录记结果，load 按绝对路径记结果。未找到时调用 `transform(null)`。

## 实践示例

### 案例 1：按名字搜索

```js
const { lilconfig } = require("lilconfig")

const result = await lilconfig("myapp").search()
if (result) {
  console.log(result.filepath, result.config)
}
```

只传名字时，会用上面那张默认表，从 `cwd` 走到家目录。`package.json` 里没有 `myapp` 字段不算命中，会继续看 `.myapprc.json`。

### 案例 2：同步 API 与显式路径

```js
const { lilconfigSync } = require("lilconfig")

const explorer = lilconfigSync("myapp")
const fromSearch = explorer.search("/app/src")
const fromLoad = explorer.load("/app/myapp.config.cjs")
```

`search` 仍然按表找；`load` 直接读给定路径。sync explorer **没有**默认 `.mjs` 搜索位；要加载 `.mjs` 必须自己改 `searchPlaces` 并提供 loader，而且 README 写明 ESM 配置只保证走 async API。

### 案例 3：补一个 YAML loader

```js
const { lilconfig } = require("lilconfig")
const yaml = require("yaml")

const explorer = lilconfig("myapp", {
  searchPlaces: [".myapprc.yaml", ".myapprc.yml"],
  loaders: {
    ".yaml": (_filepath, content) => yaml.parse(content),
    ".yml": (_filepath, content) => yaml.parse(content),
  },
})
```

缺 loader 的扩展名会在 `lilconfig(...)` 当时抛 `Missing loader for extension`。`yaml` 不是 lilconfig 的依赖。

## 踩过的坑

1. **把“cosmiconfig 替代”写成 100% 兼容**：README 明确无开箱 YAML；无扩展名当 JSON，不当 YAML。
2. **用 sync 去加载项目里的 `.mjs` / `"type":"module"` 的 `.js`**：默认 searchPlaces 不含 `.mjs`；ESM 走 async。
3. **以为空配置文件等于 `{}`**：默认直接跳过，继续向上找。
4. **把 `stopDir` 想成磁盘根**：默认是 `os.homedir()`。家目录之外的项目，最后一层可能是空字符串被补成 `/` 的路径细节见源码 `parentDir` 注释。
5. **把体积或“比 cosmiconfig 快”写进结论**：本轮没有测 install size / 搜索耗时。

## 适用 vs 不适用场景

**适用**：

- 工具想要 cosmiconfig 风格的 rc / `package.json` / `*.config.js`，且能接受无 YAML
- 需要零运行时依赖、Node >= 14 的 CJS 入口
- 只要第一份命中，不要多文件 deep merge

**不适用**：

- 必须开箱读 YAML / TypeScript——要自己供 loader，或换别的加载器
- 要同时合并多份配置、从 Vite 插件参数里抽选项——看 [[unconfig]]
- 只能用 sync，又必须发现 `.mjs`

## 固定版本边界

- 本文绑定 `antonk52/lilconfig@77d7186c37a3838c85d03e126172f82a8a474ece`，npm / tag 均为 `3.1.3`，`gitHead` 一致。
- 运行时依赖为空；`cosmiconfig` 只出现在 devDependencies，用于对照测试。
- README 的版本对照：lilconfig v3 → cosmiconfig v8。本页不审查 cosmiconfig。
- 本文未安装依赖、未跑 jest，状态保持 `UNVERIFIED`。

## 学到什么

1. **“替代 cosmiconfig”首先砍的是 YAML 默认值**，不是换一套 API 名字。
2. **sync / async 的搜索表不一样**——`.mjs` 只出现在 async 默认表。
3. **package.json 命中看字段，不看文件在不在**。
4. **loader 表是构造期合同**——扩展名必须事先配好。

## 应用型自测

1. `lilconfigSync("myapp").search()` 默认会找 `.myapprc.mjs` 吗？
2. 目录里有空的 `.myapprc.json`，默认会把它当成配置吗？
3. 未找到任何文件时，`search()` 在默认 `transform` 下返回什么？

检查点：

1. 不会。sync 的默认 `searchPlaces` 不含 `.mjs`。
2. 不会。`ignoreEmptySearchPlaces` 默认 true，空文件被跳过。
3. `null`。未找到时对 `transform` 传入 `null`。

## 延伸阅读

- 固定源码：[antonk52/lilconfig](https://github.com/antonk52/lilconfig) —— 本文绑定提交 `77d7186c37a3838c85d03e126172f82a8a474ece`
- [[unconfig]] —— source 列表 + jiti + 可选合并的对照
- cosmiconfig 文档只作背景，不在本页绑定

## 关联

- [[unconfig]] —— 工具作者自己声明 source，而不是套 rc 表
- [[vite]] —— 常见宿主；本页不加载 vite.config
- [[biome]] —— 另一条“一个配置文件”的工具链路线，不是搜索库

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[unconfig]] —— unconfig — 给工具作者的多源配置加载器
