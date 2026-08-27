---
title: ci-info — 用 vendor 常数回答“这是哪家 CI”
description: 固定 4.4.0 在 require 时扫 vendors.json；CI=false 会关掉全部厂商断言
来源: https://github.com/watson/ci-info
日期: 2026-08-27
分类: 基础设施
难度: 初级
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/watson/ci-info
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: c4e1d0565552fb20ea3c133db2e056a574e78e6b
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 4.4.0
---

## 是什么

ci-info 是一个只回答“现在是不是 CI、是哪一家、是不是 PR”的探测库。日常类比：它不像去读工牌上的公司全名，而是给每家 CI 发一块固定工号牌——`ci.GITHUB_ACTIONS`、`ci.TRAVIS`——工号比门口招牌稳定。

你写：

```js
const ci = require("ci-info");

if (ci.isCI) {
  console.log(ci.name, ci.id, ci.isPR);
}
```

固定 4.4.0 是 CommonJS：`main` 为 `index.js`，类型来自生成的 `index.d.ts`，`engines.node >= 8`。厂商清单在 `vendors.json`（53 条），`require` 时扫一遍。

## 为什么重要

不看固定入口，容易把它和 [[std-env]] 的 `isCI` / `provider` 当成同一个开关：

- 为什么 `CI=false`（字符串）会让所有 vendor 常数变 false
- 为什么只设置了 `CI=true`、对不上任何厂商时，`isCI` 仍为 true，但 `name` 是 `null`
- 为什么 Jenkins 要同时有 `JENKINS_URL` 和 `BUILD_ID`
- 为什么 README 不让你写 `ci.name === 'Travis CI'`

一句话：ci-info 的合同是 **vendor 常数 + 可旁路的 isCI**，不是运行时/agent 探测。

## 核心要点

固定 4.4.0 的主链可以拆成五步：

1. **旁路**：`process.env.CI === 'false'` 时不进入 vendor 循环，所有 `ci.TRAVIS` 这类常数保持 false，`name` / `id` / `isPR` 保持 `null`。
2. **匹配**：每条 vendor 的 `env` 可以是字符串、数组（**全部**满足）、`{ any: [...] }`、`{ env, includes }` 或精确键值。
3. **覆盖**：循环是 `forEach`。多个厂商同时命中时，**后面的条目覆盖** `name`、`isPR`、`id`。
4. **isCI**：在未被 `CI=false` 旁路时，中性变量（`CI`、`BUILD_ID`、`BUILD_NUMBER`、`CONTINUOUS_INTEGRATION`、`RUN_ID` 等）或已经写出的 `exports.name` 任一为真即可。
5. **isPR**：按 vendor 的 `pr` 字段解释；该厂商没声明 PR 检测时值为 `null`，不是 `false`。

`_vendors` 是测试用的 constant 名数组，用 `Object.defineProperty` 挂上，不算公开合同。

## 实践示例

### 案例 1：用常数，不用 `name` 字符串

```js
const ci = require("ci-info");

if (ci.GITHUB_ACTIONS) {
  // GitHub Actions。PR 时 GITHUB_EVENT_NAME === "pull_request"
}
if (ci.TRAVIS) {
  // 不要写 ci.name === "Travis CI"
}
```

README 写明：`name` 展示字符串以后可能改。分支应对 `ci.TRAVIS` / `ci.GITHUB_ACTIONS`。

### 案例 2：`CI=false` 是总闸

```bash
CI=false node -e "console.log(require('ci-info').isCI)"
```

即使进程里还有 `GITHUB_ACTIONS=true`，只要 `CI` 正好是字符串 `'false'`，vendor 循环不会跑，`isCI` 为 false。这和 [[std-env]] 把任意真值 `CI`（包括 `"false"`）当成 `!!env.CI` 不同。

### 案例 3：匿名 CI 与 AND 条件

```js
// 只知道自己在 CI，厂商不在表里
process.env.CI = "true";
const ci = require("ci-info");
// ci.isCI === true, ci.name === null, ci.isPR === null

// Jenkins 要两块牌子齐全
process.env.JENKINS_URL = "http://jenkins.local";
process.env.BUILD_ID = "42";
```

Heroku 不是看某个 CI 变量，而是 `NODE` 的值是否 **包含** `"/app/.heroku/node/bin/node"`。Vercel 用 `NOW_BUILDER` **或** `VERCEL`。Woodpecker 要求 `CI` 精确等于 `"woodpecker"`。

## 踩过的坑

1. **用 `ci.name` 做稳定分支**：展示名会变；要用 vendor 常数。
2. **以为 `isPR === false` 表示“支持检测但不是 PR”**：没声明 `pr` 的厂商是 `null`。
3. **只设 `JENKINS_URL` 就当 Jenkins**：数组 env 是 AND，还缺 `BUILD_ID`。
4. **`require` 一次后改 env**：模块已经求过值。测试用 `clear-module` 再 `require`，生产代码不要指望热更新。
5. **把它当成 runtime / agent 探测**：没有 Bun/Deno/Workers，也没有 coding agent。那是 [[std-env]] 的范围。
6. **数 README 表格当厂商总数**：合同以 `vendors.json` 的 53 条为准；表格和 `index.d.ts` 可能少列后补项。

## 适用 vs 不适用场景

**适用**：

- 测试报告、发布脚本要按 Travis / GitHub Actions / GitLab 走不同路径
- 需要 PR 检测，并接受部分厂商返回 `null`
- 本地或特殊环境要用 `CI=false` 强制“我不是 CI”

**不适用**：

- 还要识别 Bun / Deno / Workers / coding agent → 看 [[std-env]]
- 必须 ESM-only、零 CJS：固定包是 `require('ci-info')`
- 要把 `name` 字符串写进稳定配置或协议

## 固定版本边界

- 本文绑定 `watson/ci-info@c4e1d056...`，annotated tag `v4.4.0` peel 到该提交。
- npm `ci-info@4.4.0` 的 `gitHead` 与该 revision 一致。
- `engines.node >= 8`；许可 MIT；发布文件含 `index.js`、`index.d.ts`、`vendors.json`。
- 本文未跑 `node test.js`，也未在真实 CI 上对照 env，状态保持 `UNVERIFIED`。

## 学到什么

1. **工号比招牌稳**——`ci.TRAVIS` 才是分支键，`name` 只是展示
2. **`CI=false` 是显式旁路**——不是“没设 CI 变量”
3. **匿名 CI 仍然是 CI**——中性变量可以只点亮 `isCI`
4. **匹配规则因厂商而异**——AND 数组、`includes`、精确值和 `any` 不是同一套

## 应用型自测

1. `CI=false` 且 `GITHUB_ACTIONS=true` 时，`ci.GITHUB_ACTIONS` 和 `ci.isCI` 分别是什么？
2. 只设置 `CI=true`、没有厂商变量时，`ci.name` 是什么？
3. 某个厂商没有 `pr` 字段，`ci.isPR` 是 `false` 还是 `null`？

检查点：

1. 都是 false。字符串 `'false'` 跳过整个 vendor 循环。
2. `null`。`isCI` 仍可为 true（匿名 CI）。
3. `null`。只有声明了 PR 检测的厂商才会给出 true/false。

## 延伸阅读

- 仓库 README：[watson/ci-info](https://github.com/watson/ci-info)
- 固定源码：[watson/ci-info](https://github.com/watson/ci-info) —— 本文绑定提交 `c4e1d0565552fb20ea3c133db2e056a574e78e6b`
- [[std-env]] —— 运行时 + provider + agent；`isCI` 语义不同
- 语言移植（未核验源码）：README 列出 Go / Rust / Kotlin ports

## 关联

- [[std-env]] —— 更宽的环境快照；provider 表曾参考 ci-info 旧版
- [[ofetch]] —— 请求库；CI 重试/日志策略常读 `isCI`
- [[hono]] —— 适配器按运行时选，不按 CI vendor 选

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[std-env]] —— std-env — 一次 import 读出运行时、CI 与 agent

- [[std-env]] —— std-env — 一次 import 读出运行时、CI 与 agent
