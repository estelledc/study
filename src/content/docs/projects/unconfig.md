---
title: unconfig — 给工具作者的多源配置加载器
description: 用 source 列表搜索并加载 TS/ESM/JSON 配置，可选 defu 合并
来源: https://github.com/antfu-collective/unconfig
日期: 2026-08-27
分类: 配置发现
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/antfu-collective/unconfig
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 04fb7ab57d616db7a89e8a9c3b14d84b91cb74ea
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 7.5.0
---

## 是什么

unconfig 是给**工具作者**用的配置加载库：你列出一串 source（文件名、扩展名、怎么 parse、怎么改写），它从工作目录向上找文件，用 jiti 读 TS/ESM，或按 JSON 读，再决定取第一份还是合并。日常类比：它不是替用户发明 `.myapprc` 惯例，而是给你一张可拼的搜查令。

固定 7.5.0 是 monorepo：`unconfig` 负责 parse / rewrite / 合并，`unconfig-core` 负责 `findUp` 与 source 循环。公开入口是 `loadConfig` / `loadConfigSync`（同一套 `quansync` 实现）。

```ts
import { loadConfig } from "unconfig"

const { config, sources } = await loadConfig({
  sources: [{ files: "my.config" }],
})
```

## 为什么重要

不读固定源码，容易把 unconfig 写成“又一个 cosmiconfig”：

- 为什么默认**没有** `.myapprc` / `.config/` 搜索表，必须自己列 `files`
- 为什么 TS 配置能加载，却不是 Node 原生 `import`
- 为什么 `merge: true` 不是后写覆盖前写
- 为什么从 Vite 插件里抽配置要走 preset，而不是普通 `rewrite`

它和 [[lilconfig]] 的差别是合同，不是快慢：lilconfig 按名字套 cosmiconfig 惯例；unconfig 按 source 列表给工具生态拼入口。

## 核心要点

固定 7.5.0 的主链可以拆成四步：

1. **列 source**：每个 source 有 `files`、默认扩展 `mts/cts/ts/mjs/cjs/js/json/''`、`parser`（默认 `auto`）、可选 `rewrite` / `transform`。
2. **向上找文件**：`unconfig-core` 的 `findUp` 从 `cwd`（默认 `process.cwd()`）往父目录走，`stopAt` 默认盘符根，**不进入** `stopAt` 自己。符号链接默认按目标判断（`stat`）。
3. **加载**：`auto` 先 `JSON.parse`，失败再交给 jiti（关掉 fs/module cache）。`transform` 成功时在同目录写 `__unconfig_${basename}`，读完删除。
4. **取一份或合并**：`merge` 默认 false，只留第一条能产出结果的 source 的第一个文件。`true` 时用 `defu` 包一层 `{ config }` 合并，**先出现的 key 留下**，后面的 source 和 `defaults` 只补缺。

找不到任何结果时，`config` 等于 `defaults`，`sources` 是空数组。

## 实践示例

### 案例 1：专用文件 + package.json 字段

```ts
import { loadConfig } from "unconfig"
import { sourcePackageJsonFields } from "unconfig/presets"

const { config, sources } = await loadConfig({
  sources: [
    { files: "my.config" },
    sourcePackageJsonFields({ fields: "my" }),
  ],
})
```

**逐部分解释**：第一项会试 `my.config.ts`、`my.config.mjs`、`my.config.json` 等。第二项固定读 `package.json` 的 `my` 字段。默认不 merge 时，只要专用文件加载成功，就不会再看 `package.json`。

### 案例 2：同步加载

```ts
import { loadConfigSync } from "unconfig"

const { config } = loadConfigSync({
  sources: [{ files: "my.config" }],
  cwd: process.cwd(),
})
```

`loadConfig.sync` 与 `loadConfigSync` 是同一条 quansync 同步路径，不是另一套搜索规则。

### 案例 3：从插件工厂参数里抽配置

```ts
import { sourcePluginFactory } from "unconfig/presets"

const source = sourcePluginFactory({
  files: "vite.config",
  targetModule: "my-plugin",
  parameters: [{ command: "build" }],
})
```

preset 用正则抓住 `import x from "my-plugin"`，把该绑定换成 stub，再执行 `export default`。源码里找不到目标模块时，整份文件被改写成 `export default undefined;`。

## 踩过的坑

1. **把 README 的扩展名顺序当成源码默认**：源码默认是 `mts, cts, ts, mjs, cjs, js, json, ''`。
2. **以为 `merge: true` 是后文件覆盖**：`defu` 以先出现的对象为本体，后到的只填空洞。
3. **把“没找到插件 import”当成跳过该文件**：`sourcePluginFactory` 仍会留下一份 stub；`interopDefault` 在 `default` 为 nullish 时退回整个 module，结果可能是 `{ default: undefined }`。
4. **拿 lilconfig / cosmiconfig 的 `stopDir = homedir` 来推理**：这里默认停在文件系统根，而且不搜索 `stopAt` 目录本身。
5. **把 jiti 加载写成零依赖或原生 ESM import**：固定包依赖 `jiti`、`defu`、`quansync`、`unconfig-core`。本轮未跑 jiti。

## 适用 vs 不适用场景

**适用**：

- 工具要同时接受 `foo.config.ts`、`package.json` 字段、甚至宿主 `vite.config` 里的插件参数
- 需要同一套 API 的 sync / async
- 愿意自己声明 source，而不是套 rc 惯例

**不适用**：

- 只要 cosmiconfig 那张默认搜索表，零配置按名字找 `.footrc`——看 [[lilconfig]]
- 需要开箱 YAML / TOML / INI
- 要把加载耗时或“比 cosmiconfig 轻”写成结论（未测）

## 固定版本边界

- 本文绑定 `antfu-collective/unconfig@04fb7ab57d616db7a89e8a9c3b14d84b91cb74ea`，tag / 仓内包版本均为 `7.5.0`。
- npm `unconfig@7.5.0` latest 未暴露 `gitHead`；身份以 Git tag 与 `packages/*/package.json` 为准。
- 许可 MIT。历史 issue 链接仍可能写 `antfu/unconfig`；canonical remote 是 `antfu-collective/unconfig`。
- 本文未安装依赖、未跑 vitest / jiti，状态保持 `UNVERIFIED`。

## 学到什么

1. **搜索表是调用方合同**——unconfig 不替你发明 rc 文件名。
2. **TS 能加载 ≠ Node 原生 import**——中间是关掉 cache 的 jiti。
3. **merge 方向要按 defu 读**——先匹配到的 key 留下。
4. **preset 会改源码文本**——插件工厂提取依赖 transform，失败形态也是一份文件。

## 应用型自测

1. 只传 `{ files: "my.config" }`，会不会自动读 `package.json` 的 `my` 字段？
2. `merge: true` 时，后找到的 source 会覆盖先找到的同名 key 吗？
3. `findUp` 默认会搜索 `stopAt` 目录本身吗？

检查点：

1. 不会。`package.json` 必须自己列成一条 source（或用 `sourcePackageJsonFields`）。
2. 不会。`defu` 保留先出现的 key。
3. 不会。循环条件是 `current !== stopAt`。

## 延伸阅读

- 固定源码：[antfu-collective/unconfig](https://github.com/antfu-collective/unconfig) —— 本文绑定提交 `04fb7ab57d616db7a89e8a9c3b14d84b91cb74ea`
- [[lilconfig]] —— 零依赖、按名字套 cosmiconfig 搜索表的对照
- [[vite]] —— `sourceVitePluginConfig` / `sourcePluginFactory` 的常见宿主

## 关联

- [[lilconfig]] —— 惯例搜索 vs source 列表
- [[vite]] —— 从 `vite.config` 抽插件配置的宿主
- [[webpack]] —— README 里提到的另一类宿主配置，本页未审查 webpack 本身

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[lilconfig]] —— lilconfig — 零依赖的 cosmiconfig 子集
