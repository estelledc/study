---
title: lerna — 在 workspace 上做拓扑 version / publish
来源: https://github.com/lerna/lerna
日期: 2026-05-30
分类: 前端工程
难度: 中级
trust:
  version: study-v2
  source_kind: project
  note_type: tool
  canonical_source: https://github.com/lerna/lerna
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 35d15a1567932be97759f512d8b8033dad72b411
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 10.0.1
---

## 是什么

lerna 是给 **已经存在的 JS/TS workspace** 做版本 bump 和按依赖序发布的工具。日常类比：快递站不再自己进货、自己码货架——货架归 npm / pnpm / yarn；lerna 只负责看哪些包裹改了、该贴几号、谁必须先寄出去。

固定 `lerna@10.0.1` 是 ESM 包，入口 `dist/cli.js`。它依赖 `nx` / `@nx/devkit` `>=23.1.0 < 24.0.0`，启动时关掉 Nx 插件隔离和 TUI。`lerna run` 默认走 Nx 的 `runMany` / `runOne`；`version` / `publish` 仍是 lerna 自己的命令。

```bash
npx lerna@version publish --yes
```

这一句会先决定版本（或沿用已有 bump），再按项目图拓扑顺序 `npm publish`。本轮没有真的发过包。

## 为什么重要

不理解固定 10.0.1 的边界，下面这些印象会对不上源码：

- 为什么 `lerna bootstrap` / `add` / `link` 不再是“升级后还能装回来的旧命令”——v9 起它们是立刻 `exit 1` 的壳
- 为什么空仓库 `lerna init` 不再只写两行 `lerna.json`，而要先有 package manager workspaces
- 为什么发版顺序和 `lerna run` 不是同一条执行器——前者拓扑排序，后者默认交给 [[nx]]
- 为什么 `--reject-cycles` 不是默认打开——环只警告，还会被放进同一批

## 核心要点

固定版本的主链可以拆成四层：

1. **先找包，再画图**：`Project` 读 `lerna.json`。有 `packages` 就用这份 glob；否则 `npmClient=pnpm` 时读 `pnpm-workspace.yaml`，其余读根 `package.json` 的 `workspaces`。`useWorkspaces` 字段直接报错。图本身仍由 Nx / 包管理器 workspace 构成。

2. **两种版本合同**：`version === "independent"` 是每包各号；其它字符串（包括 `10.0.1`）是 fixed，全仓共用一个号。本仓自己的 `lerna.json` 就是 fixed `10.0.1`。

3. **publish 默认拓扑**：`sort !== false` 时按本地依赖把“被依赖的”排到前面，再 `runProjectsTopologically`。`--reject-cycles` 没开时，环会警告 `ECYCLE` 并整环一批处理。

4. **run 默认是 Nx**：`useNx !== false` 时调用 Nx；只有显式 `useNx: false` 才退回 lerna 自己的并行 / 拓扑 / 字典序执行。多 script 并发也不支持这条旧路径。

## 实践示例

### 案例 1：空目录初始化

```bash
mkdir my-mono && cd my-mono
npx lerna@10.0.1 init
```

没有 `package.json` 时，init 会写：

- `lerna.json`：`$schema` + `version: "0.0.0"`（`--independent` 则写成 `"independent"`）
- 根 `package.json`：`private: true`，npm/yarn 还会加 `workspaces: ["packages/*"]`；检测到 pnpm 则写 `pnpm-workspace.yaml`
- 把 `lerna` 加进 devDependency，并默认跑一次包管理器 install

已有仓库但既没有 workspaces、也没传 `--packages`，init 会失败，不会偷偷假设 `packages/*`。

### 案例 2：fixed 与 independent

```json
{ "version": "10.0.1" }
{ "version": "independent" }
```

**怎么选**：像 React 那样必须对齐的套件用 fixed；各包独立演化用 independent。fixed 改一个包也会让其它包换号——这是合同，不是 bug。

### 案例 3：拓扑发布与环

`@demo/cli` 依赖 `@demo/core`，`core` 依赖 `@demo/util` 时，默认顺序是 util → core → cli。两个包互相依赖且没加 `--reject-cycles` 时，源码只警告并把它们放进同一批，而不是默认失败。

## 踩过的坑

1. **把 `lerna bootstrap` 当成 v10 还能用的命令**：源码为 `add` / `bootstrap` / `link` 注册的是说明 v9 已删除的 handler，然后 `process.exit(1)`。应改用包管理器的 `install`。
2. **以为 `lerna.json` 的 `packages` 可以省略、lerna 会自己猜**：没有显式 glob 时必须能从 npm/yarn workspaces 或 pnpm workspace 文件读到列表。
3. **把 `lerna run` 理解成自己的旧拓扑执行器**：默认已经交给 Nx；`--npm-client` 和现代 runner 不能叠用。
4. **以为环会默认被拒绝**：`--reject-cycles` 只是可选 boolean，默认是警告 + 破环同批。

## 适用 vs 不适用场景

**适用**：

- 已经有 package manager workspaces，只缺统一 version / publish
- 存量 lerna 仓升级到 10.x，并接受 Node `^22.13 || ^24 || ^26`
- 需要把 `lerna run` 接到现成的 Nx 图和缓存

**不适用**：

- 新仓还想靠 lerna 做 install / link → 那是已删除的包管理职责
- 需要自己实现远程 cache / DTE → 那是 [[nx]] / [[turborepo]] 的范围，不是这篇 version+publish 页
- 不能把 lerna 升到依赖 Nx 23 的运行时

## 固定版本边界

- 本文绑定 `lerna/lerna@35d15a15...`，npm `lerna@10.0.1`，与 tag `v10.0.1` 的 `gitHead` 一致。
- 运行时依赖 `nx@>=23.1.0 <24.0.0`。本仓开发依赖钉在 `nx@23.1.0`。
- 只做源码/文档静态审查，没有跑 CLI、发版或 Nx 缓存，状态保持 `UNVERIFIED`。

## 学到什么

1. **workspace 安装和 monorepo 发版是两层合同**——包管理器管链接，lerna 管版本与发布顺序
2. **默认执行器会换底座**——`run` 默认 Nx，不代表 `publish` 也变成 Nx Cloud
3. **图上的环处理必须读默认值**——警告和抛错是两种政策
4. **删除的命令用壳留下明确失败**，比默默 no-op 更安全

## 应用型自测

1. 在 lerna 10.0.1 里跑 `lerna bootstrap`，会安装依赖还是立刻退出？
2. 已有 `package.json` 但没有 workspaces、也没传 `--packages`。`lerna init` 会生成 `packages/*` 吗？
3. 两个包循环依赖，没有 `--reject-cycles`。`lerna publish` 会默认失败吗？

检查点：

1. 立刻退出。handler 说明这些命令在 v9 已删除。
2. 不会。init 要求先有 workspaces 或显式 `--packages`。
3. 不会默认失败。源码警告 `ECYCLE` 并把环放进同一批。

## 延伸阅读

- 官方文档：[lerna.js.org](https://lerna.js.org)
- 固定源码：[github.com/lerna/lerna](https://github.com/lerna/lerna) —— 本文绑定 `35d15a1567932be97759f512d8b8033dad72b411`
- 审查记录：仓库内 `docs/lerna-pnpm-source-review-20260827-dy.md`
- [[pnpm]] —— 同批次对照：lerna 读它的 `pnpm-workspace.yaml`
- [[nx]] —— `lerna run` 默认执行器
- [[changesets]] —— 另一条“在 PR 里先声明 bump”的版本合同

## 关联

- [[pnpm]] —— workspace 文件与严格依赖边界
- [[nx]] —— run 默认底座与项目图
- [[turborepo]] —— 任务图 / 缓存对照，不是 version+publish
- [[changesets]] —— intent-based 版本声明
- [[node-js]] —— 引擎下限 `^22.13.0 || ^24 || ^26`

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[changesets]] —— changesets — 让每个 PR 自带版本号 bump 声明
- [[framer-motion]] —— Framer Motion — React 声明式动画
- [[jest]] —— Jest — 一个包就能跑 JS 测试的全家桶
- [[nx]] —— Nx — 一个仓库装几十个项目时帮你少跑活的工具
- [[pnpm]] —— pnpm — 用内容寻址 store 做严格 workspace 安装
- [[turborepo]] —— Turborepo — 让 monorepo 学会"哪些活已经干过了不要再干"
