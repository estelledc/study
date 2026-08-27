---
title: changesets — 让每个 PR 自带版本号 bump 声明
description: 介绍 changesets 3.0.1 如何把 bump 声明写成磁盘文件，并由 assembleReleasePlan 按 range 计算 dependents。
来源: https://github.com/changesets/changesets
日期: 2026-05-29
分类: 工具库
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: tool
  canonical_source: https://github.com/changesets/changesets
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: bed458124f623463c581521ab56d040eba2a8b20
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 3.0.1
---

## 是什么

changesets 是一套**把版本决策写成磁盘文件、再由纯函数算出 bump 清单**的 monorepo 发版工具。日常类比：每个 PR 先贴一张面单，写明改了哪些包、是 major / minor / patch；仓库发货时只读面单，不读作者记忆，也不读 commit 标题。

固定 3.0.1 的入口是 `@changesets/cli`。开发者跑 `changeset add`（`cac` 把它标成默认命令），工具在 `.changeset/` 下生成一个 `human-id` 文件名的 markdown；`changeset version` 再调用 `assembleReleasePlan` 算新版本，`applyReleasePlan` 写 `package.json` / `CHANGELOG.md` 并删掉已消费的 changeset。

## 为什么重要

不读固定 3.0.1 的计划函数，下面这些印象很容易写错：

- 以为依赖包一改，所有 dependents 都会自动 patch——默认只在新版本**走出**已声明 range 时才 bump
- 以为 snapshot 会从当前 semver 往上加 canary——默认底数是 `0.0.0`
- 以为 CLI 还停留在旧 Node 12 时代——3.0.1 要求 `^22.11 || ^24 || >=26`
- 以为 commit message 推断和 changeset 声明是同一套 source of truth

## 核心要点

`assembleReleasePlan` 可以拆成五步：

1. **筛 changeset**：跳过被 ignore / private 策略排除的包；pre 模式还会丢掉 `pre/` 前缀的历史文件。

2. **flatten**：同一包出现多次时只保留最高 bump（`major > minor > patch > none`），CHANGELOG 仍能列出多段说明。

3. **dependents**：反向依赖图**包含** `devDependencies`，但 dev 依赖只拿 `none`——用来改 range，不涨自己的版本。`dependencies` / `optionalDependencies` / `peerDependencies` 默认按 range 是否仍满足决定要不要 patch。

4. **fixed / linked**：配置组会把几个包绑成同一次 bump，循环直到约束稳定。

5. **increment**：普通发版用 `semver.inc(old, type)`；`--snapshot` 默认写成 `0.0.0-<tag?>-<datetime>`，只有打开 `snapshot.useCalculatedVersion` 才用算出来的 semver。

## 实践案例

### 案例 1：一个 changeset 文件长什么样

```markdown
---
"@my-org/pkg-a": minor
"@my-org/pkg-b": patch
---

Add a public cat-juggling API.
```

`writeChangeset` 会给文件名生成 `human-id`（小写、短横线），frontmatter 里的包名必须带引号，因为 scoped name 含 `@`。3.0.1 也可以非交互：`changeset add --minor @my-org/pkg-a -m "Add a public cat-juggling API"`。

### 案例 2：range 仍满足时，dependent 不会跟着涨版本

```json
{ "name": "@test/pkg-b", "version": "0.1.0", "dependencies": { "@test/pkg-a": "^0.1.0" } }
```

若 `pkg-a` 从 `0.1.0` 升到 `0.2.0`，`^0.1.0` 仍然满足，`determineDependents` 不会给 `pkg-b` 一个 patch。旧印象里的“改了依赖就自动 bump 下游”只在 range 被打破，或打开实验开关 `updateInternalDependents: "always"` 时成立。

### 案例 3：version 之后磁盘上发生什么

`applyReleasePlan` 写入每个包的 `version` 和内部依赖 range，追加 `CHANGELOG.md`，然后：

- 普通模式：`fs.rm` 删掉已消费的 `.changeset/<id>.md`
- pre 模式：把文件挪到 `.changeset/pre/`，等 `pre exit` 再收口

默认 written config 是 `access: "restricted"`、`baseBranch: "main"`、`commit: false`、`format: "auto"`。`format: "auto"` 会探测仓库里的 formatter，但会排除 Biome（它不格式化 markdown）。

## 踩过的坑

1. **把 dependents 默认说成“永远 patch”**：3.0.1 默认是 out-of-range，不是 always。
2. **把 snapshot 想成 1.2.3-canary**：未开 `useCalculatedVersion` 时底数是 `0.0.0`，避免和正式 pre 线抢 `^` range。
3. **混写 ignore 包和未 ignore 包**：同一 changeset 里两边都出现会直接抛错。
4. **以为 CLI 会核对 git diff**：changeset 只记录声明，不验证你是否真的改了那个包。
5. **用旧 Node 跑 3.0.1**：engines 已经卡在 Node 22.11+ / 24 / 26。

## 适用 vs 不适用场景

**适用**：

- pnpm / yarn / npm workspace monorepo，希望 reviewer 在 PR 里看到 bump 档
- 需要 snapshot / pre 模式，并且接受“Version Packages”这一道人确认
- 团队愿意多写一个 markdown，换可 review 的版本决策

**不适用**：

- 单包、只用 `npm version` 就够的仓库
- 想从 conventional commit **无人值守**推断版本——那是 [[semantic-release]] 的合同
- 还在 Node 18/20 上发版的仓库；3.0.1 不会在这些运行时上自我证明
- 需要本轮审查没有读到的 `@changesets/action` 行为细节

## 固定版本边界

- 本文绑定 `changesets/changesets@bed45812...`，即 tag `@changesets/cli@3.0.1`。
- npm `@changesets/cli@3.0.1` 不暴露 `gitHead`；绑定依据是可达 tag 与包内 `package.json` 自报版本一致。
- CLI 是 ESM，bin 为 `changeset`；3.0.1 还带 `publish-plan`、`pack`、`git-tag`。
- 本文未安装依赖、未跑上游测试、未调用 publish，状态保持 `UNVERIFIED`。

## 学到什么

1. **声明在磁盘上**才能被 PR review；commit 标题和 release 经理的记忆都不是同一份 source of truth
2. **highest-wins flatten** 会丢掉“跳了几档”，只保留最高档，CHANGELOG 仍可分段
3. **依赖图传播默认看 range**，不是“改了就 bump”；devDependency 甚至只改数字不改版本
4. **snapshot 用 0.0.0 当底数**是为了不污染正式 pre 线的 semver range

## 应用型自测

1. `pkg-a` 从 `1.0.0` 升到 `1.1.0`，`pkg-b` 声明 `"pkg-a": "^1.0.0"`。默认会给 `pkg-b` patch 吗？
2. `--snapshot` 且未设置 `useCalculatedVersion` 时，新版本的数字前缀是当前 semver 还是 `0.0.0`？
3. 一个 changeset 同时写了 ignore 包和未 ignore 包，`assembleReleasePlan` 会怎么做？

检查点：

1. 不会。`^1.0.0` 仍满足 `1.1.0`，默认 out-of-range 策略不 bump。
2. `0.0.0`。只有打开 `snapshot.useCalculatedVersion` 才用算出来的 semver。
3. 直接抛错；混合 changeset 不被允许。

## 延伸阅读

- 固定源码：[changesets/changesets](https://github.com/changesets/changesets) —— 本文绑定提交 `bed458124f623463c581521ab56d040eba2a8b20`
- 设计说明：[Detailed explanation](https://github.com/changesets/changesets/blob/main/docs/detailed-explanation.md)
- [[semantic-release]] —— 对照：commit 推断 vs 磁盘声明
- [[lerna]] —— 上一代在 release 时刻选档的工具

## 关联

- [[semantic-release]] —— 同一发版问题的另一端：从 commit 推断、CI 里直接 tag
- [[lerna]] —— release-time 人工选档；changesets 把决策前置到 PR
- [[pnpm]] —— 最常见的 workspace 宿主；`workspace:` protocol 会在 dependents 计算时被展开

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[electron-builder]] —— electron-builder — Electron 打包发布事实标准
- [[lerna]] —— lerna — 一个仓库发几十个 npm 包的祖宗工具
