---
title: std-env — 一次 import 读出运行时、CI 与 agent
description: 固定 4.2.0 在模块初始化时探测 runtime / provider / agent，不依赖 ci-info 包
来源: https://github.com/unjs/std-env
日期: 2026-08-27
分类: 基础设施
难度: 初级
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/unjs/std-env
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: ddd5e9e076c9677328bb2ca92edbce64757b744d
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 4.2.0
---

## 是什么

std-env 是一个零运行时依赖的环境探测库。日常类比：它不像去问门卫“你是谁”，而是看门口挂了哪几块牌子——`globalThis` 上有没有 `Bun` / `Deno`，`process.env` 里有没有 `GITHUB_ACTIONS`，再一次性写成布尔值和名字。

你写：

```ts
import { runtime, isCI, provider, isAgent, agent } from "std-env";

console.log({ runtime, isCI, provider, isAgent, agent });
```

固定 4.2.0 只发布 ESM：`exports["."]` 指向 `dist/index.mjs`。`env` 读的是 `globalThis.process?.env`，没有 `process` 时退成 `Object.create(null)`，避免在边缘运行时访问空对象报错。

## 为什么重要

不看固定源码，容易把 std-env 说成“包了一层 `process.env.CI`”或“运行时版 [[ci-info]]”：

- 为什么 `isNode === true` 还可能是 Bun / Deno 的 Node 兼容模式
- 为什么 `isCI` 不是 `Boolean(process.env.CI)`，已识别的 provider 也能把它拉真
- 为什么 `provider` / `agent` / `runtime` 在 import 时就定了，后面改 env 不会自动刷新
- 为什么 provider 表注释写着 ci-info，包本身却没有这个依赖

一句话：std-env 的合同是 **一次初始化、三张探测表**，不是 CI vendor 常数目录。

## 核心要点

固定 4.2.0 可以把主链拆成五步：

1. **垫片**：`src/env.ts` 给出跨运行时的 `env` / `process` / `nodeENV`。没有 `globalThis.process` 时，`process` 只保留 `{ env }`。
2. **Runtime**：`src/runtimes.ts` 按 netlify → edge-light → workerd → fastly → deno → bun → node 找第一个为真的检查。`isNode` 只看 `process.versions?.node`。
3. **Provider**：`src/providers.ts` 按表顺序匹配 env 名；命中后带上可选 `{ ci }`。都不中再看 StackBlitz：`SHELL === "/bin/jsh"` 且存在 `process.versions.webcontainer`。
4. **Flags**：`isCI = !!env.CI || providerInfo.ci !== false`。未显式 `ci: false` 的已识别 provider（例如只设了 `GITHUB_ACTIONS`）也会让 `isCI` 为 true。
5. **Agent**：`AI_AGENT` 优先；否则按表检查。`kiro` 额外要求 `stdout` 非 TTY，避免有人在 Kiro IDE 终端里被误判成 agent。

`providerInfo`、`runtimeInfo`、`agentInfo` 都在模块求值时算一次。要按**当前** env 重测，必须自己调用 `detectProvider()` / `detectAgent()`。

## 实践示例

### 案例 1：严格区分 Node 和兼容模式

```ts
import { isNode, isBun, runtime } from "std-env";

if (runtime === "node") {
  // 只有探测链最后落到 node，且前面的 Bun/Deno/边缘检查都失败
}
if (isNode && isBun) {
  // Bun 开了 Node 兼容：versions.node 存在，同时 globalThis 有 Bun
}
```

`isNode` 的注释写明：Bun / Deno 兼容模式里它也是 true。需要“就是 Node”时看 `runtime === "node"`，不要只看 `isNode`。

### 案例 2：CI 不是只看 `CI=`

```ts
import { isCI, provider, providerInfo } from "std-env";

// GitHub Actions 默认会设 GITHUB_ACTIONS
// 即使没写 CI=1，provider 命中且未标 ci:false → isCI === true
console.log({ isCI, provider, ci: providerInfo.ci });
```

Vercel / Netlify 本地、CodeSandbox、StackBlitz 在表里标了 `ci: false`。这些环境能认出 `provider`，但不会单靠 provider 把 `isCI` 拉真；若同时存在任意真值 `CI`，`!!env.CI` 仍为 true。

### 案例 3：agent 覆盖与重测

```ts
import { detectAgent, agent, isAgent } from "std-env";

// import 时的快照
console.log({ agent, isAgent });

// 之后才 export AI_AGENT=codex 的话，必须重跑
console.log(detectAgent()); // { name: "codex" }
```

Cursor 这一项只检查 `CURSOR_AGENT`。注释里提到的 `CURSOR_TRACE_ID` / `CURSOR_SANDBOX` **没有**写进 `agents` 表。

## 踩过的坑

1. **把 `isNode` 当成互斥旗标**：兼容模式里它可以和 `isBun` / `isDeno` 同时为 true。
2. **以为改 env 会更新 `isCI` / `provider`**：顶层常量只算一次。测试里要重测就调用 `detect*`，或按 vitest 方式重载模块。
3. **把 `CI=false` 当成关闭开关**：`!!"false"` 为 true。要关 CI 语义，[[ci-info]] 认字符串 `'false'`；std-env 这条不认。
4. **以为它运行时依赖 [[ci-info]]**：`providers.ts` 只是参考旧版 `vendors.json` 的静态表，4.2.0 的 `package.json` 没有这个依赖。
5. **把下载量、bundle 或“比 ci-info 更全”写进结论**：本轮没有测体积，也没有逐项对照两张 vendor 表。

## 适用 vs 不适用场景

**适用**：

- 一份 ESM 代码要同时跑在 Node / Bun / Deno / Workers，需要运行时名字而不是 `typeof process`
- 构建工具、脚手架要按 CI / 无 TTY 收紧日志（`isMinimal`、`isColorSupported`）
- 想识别 coding agent，并接受 `AI_AGENT` 覆盖

**不适用**：

- 必须区分 50+ CI 厂商常数、PR 检测或 `CI=false` 旁路 → 看 [[ci-info]]
- 需要 CJS `require`：固定包只导出 `dist/index.mjs`
- 要把 import 之后才写入的 env 当成已经生效的快照

## 固定版本边界

- 本文绑定 `unjs/std-env@ddd5e9e0...`，annotated tag `v4.2.0` peel 到该提交；仓内 version 为 `4.2.0`。
- npm `std-env@4.2.0` 未发布 `gitHead`；身份依据 tag + 仓内 version，不是 npm gitHead。
- 许可 MIT；无 `engines` 字段；零 runtime 依赖。
- 本文未安装依赖、未跑 vitest，也未在真实 CI / 边缘运行时探测，状态保持 `UNVERIFIED`。

## 学到什么

1. **兼容模式会同时点亮多面旗标**——`isNode` 描述的是 Node API 面，不是互斥身份
2. **CI 旗标是 env 真值或 provider 默认值**——不是单一 `process.env.CI`
3. **探测结果是模块级快照**——`detectProvider` / `detectAgent` 才是重入入口
4. **参考来源不是运行时依赖**——注释里的 ci-info 不会在 `node_modules` 里出现

## 应用型自测

1. 在 Bun 且 `process.versions.node` 存在时，`isNode` 和 `runtime === "node"` 哪个为真？
2. 只设置 `GITHUB_ACTIONS=1`、不设置 `CI` 时，`isCI` 是什么？
3. import 之后才设置 `AI_AGENT=claude`，顶层 `agent` 会变成 `"claude"` 吗？

检查点：

1. `isNode` 为 true；`runtime` 会先命中 bun，不是 `"node"`。
2. 为 true。GitHub Actions 未标 `ci: false`，`providerInfo.ci !== false` 成立。
3. 不会。必须再调用 `detectAgent()`，或重新加载模块。

## 延伸阅读

- 仓库 README：[unjs/std-env](https://github.com/unjs/std-env)
- 固定源码：[unjs/std-env](https://github.com/unjs/std-env) —— 本文绑定提交 `ddd5e9e076c9677328bb2ca92edbce64757b744d`
- WinterCG runtime keys：[runtime-keys.proposal.wintercg.org](https://runtime-keys.proposal.wintercg.org/)
- [[ci-info]] —— CI vendor 常数、`isPR` 与 `CI=false` 旁路
- [[ofetch]] —— 同一 unjs 工具带里、按运行时切入口的 HTTP 包装

## 关联

- [[ci-info]] —— CI 专用探测；std-env 的 provider 表只参考过它的旧快照
- [[ofetch]] —— 同样要在 Node / worker 之间选实现
- [[bun]] —— `isBun` / `isNode` 同时为真的典型现场
- [[deno]] —— 探测链里排在 bun 前面的兼容运行时
- [[hono]] —— 按 Fetch 合同跨运行时，而不是靠 std-env 选 adapter

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[ci-info]] —— ci-info — 用 vendor 常数回答“这是哪家 CI”

- [[ci-info]] —— ci-info — 用 vendor 常数回答“这是哪家 CI”
