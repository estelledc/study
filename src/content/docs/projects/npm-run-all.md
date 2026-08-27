---
title: npm-run-all — 按脚本名 glob 串行或并行跑 npm scripts
description: 读取 package.json 脚本名，用 minimatch 匹配后交给 npm run，支持 run-s / run-p 与混合组
来源: https://github.com/mysticatea/npm-run-all
日期: 2026-08-27
分类: CLI / 命令行工具
难度: 入门
difficulty: 入门
trust:
  version: study-v2
  source_kind: project
  note_type: tool
  canonical_source: https://github.com/mysticatea/npm-run-all
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: df1511851a2b5e8a406e4a2622829b360f671afc
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 4.1.5
---

## 是什么

npm-run-all 是一个**只调度 `package.json` 里的 npm-scripts** 的 CLI。日常类比：你不是直接对操作系统喊“同时做饭”，而是把菜单上已经写好的菜名（`lint`、`test:unit`、`build`）按通配符点餐；后厨仍由 `npm run` 掌勺。

固定 4.1.5 是 CommonJS，engines 写 `node >= 4`。它提供三个入口：

```bash
npx npm-run-all lint test build          # 默认串行
npx run-s lint test build                # 同上，single-mode 串行
npx run-p "test:*"                       # single-mode 并行
```

`run-s` / `run-p` 只是预置了串行或并行的单组模式；`npm-run-all` 可以在同一条命令里用 `--parallel` / `--sequential` 切开多组。

## 为什么重要

不读匹配器和 spawn 路径，下面这些事都没法解释：

- 为什么 `test:*` 能匹配 `test:unit`，却匹配不到任意 shell 命令
- 为什么默认不是并行，`--race` 离开 `--parallel` 会直接报错
- 为什么它调用的是 `npm run <script>`，而不是脚本字符串本身
- 为什么 2026 年还要先核 4.1.5，再单独看维护叉 `npm-run-all2`

## 核心要点

固定版本的执行链可以拆成五步：

1. **解析 CLI 组**：`parse-cli-args` 遇到 `--parallel` / `--sequential` 就新开一组。组与组之间永远串行；组内才谈并行。`run-p` 以 `{ parallel: true }` 起步，且 `singleMode` 禁止再切组。

2. **替换占位符**：模式里的 `{1}`、`{@}`、`{*}`、`{1:=default}`、`{1:-default}` 会先用 `--` 后面的参数填上，再进入匹配。`{!1}` 直接抛 `Invalid Placeholder`。

3. **按脚本名匹配**：读取当前 `package.json` 的 `scripts` 键。minimatch 之前会把 `:` 和 `/` 对调，所以 `test:*` 能对准 npm 风格的冒号命名。找不到的名字抛 `Task not found`；内置例外只有 `restart` 和 `env`。

4. **交给 npm run**：`run-task` 用 `npm_execpath`（否则字面量 `npm`）拼 `run` + 脚本名。若 npm 路径是 `.js` / `.mjs`，则改成 `process.execPath` 去跑那个文件。Yarn 路径下，前缀选项只再转发 `--silent`。

5. **队列与中止**：`run-tasks` 按 `maxParallel`（串行时恒为 1，并行默认不限制）取任务。第一个非 0 退出会 `abort()` 其余，除非 `--continue-on-error`。`--race` 则在**第一条成功**时中止其余。POSIX 的 `kill` 用 `pidtree` 打整棵子进程树。

## 实践示例

### 案例 1：先串行质量门，再并行构建

```json
{
  "scripts": {
    "lint": "eslint .",
    "test:unit": "node --test test/unit",
    "test:int": "node --test test/int",
    "build:js": "node scripts/build-js.mjs",
    "build:css": "node scripts/build-css.mjs",
    "ci": "npm-run-all --sequential lint --parallel test:* --sequential --parallel build:*"
  }
}
```

`ci` 会先跑完 `lint`，再并行匹配 `test:*`，再进入下一组并行 `build:*`。组边界由 `--sequential` / `--parallel` 切开，不是“整条命令一种模式”。

### 案例 2：并行跑测试，谁先成功就收工

```bash
npx run-p --race --print-label "test:unit" "test:int"
```

`--race` 只能配并行。某一条以 0 退出后，其余会被 abort。`--print-label` 给每一行加上左对齐的任务名前缀；默认关闭。

### 案例 3：把 CLI 参数填进脚本名

```json
{
  "scripts": {
    "echo": "node -e \"console.log(process.argv.slice(1).join(' '))\"",
    "say": "npm-run-all echo -- {1} {@}"
  }
}
```

`npm run say -- hello world` 会把 `{1}` 换成 `hello`，`{@}` 换成引用过的全部参数。缺省位且没有 `:=` / `:-` 时替换成空字符串。

## 踩过的坑

1. **把它当成任意命令并行器**：匹配对象是脚本名。要并行 `tsc -w` 和 `node server.js` 这种裸命令，应看 [[concurrently]]。

2. **默认以为是并行**：库默认 `parallel=false`。只写 `npm-run-all lint test` 是先 lint 再 test。

3. **串行组里开 `--race` / `--aggregate-output` / `--max-parallel`**：解析器会直接抛 `Invalid Option`。这三项都要求当前存在并行组。

4. **以为 abort 只杀 npm 这一层**：POSIX spawn 把 `child.kill` 换成 `pidtree` 全树信号；Windows 走另一份 spawn。本轮未实测信号传递。

5. **把 4.1.5 当成仍在演进的主干**：tag / npm `gitHead` 一致，指向 2018 年的 4.1.5。维护叉是 `bcomnes/npm-run-all2`（本稿不绑定）。新项目若要跟当前 Node 走，需要另开一页核 fork。

## 适用 vs 不适用场景

**适用**：

- `package.json` 里已经用 `lint`、`test:*`、`build:*` 分好组，只想少写几行 `&&` / `&`
- 需要同一条命令里“先串行门禁，再并行构建”
- 团队统一通过 `npm run`，想保留 npm 的 config / silent / lifecycle 语义

**不适用**：

- 命令不是 npm script，或要给任意进程加彩色前缀、按退出时间定义成功 → [[concurrently]]
- 需要任务图、远程缓存、跨包依赖 → [[turborepo]] / [[nx]]
- 必须跟进 2018 年之后的修复与现代 Node 引擎——应评估 `npm-run-all2`，不要假装 4.1.5 仍在发版
- 要把本文写成已运行的并行正确性证明——状态保持 `UNVERIFIED`

## 固定版本边界

- 本文绑定 `mysticatea/npm-run-all@df151185...`，tag 与 npm `gitHead` 均为 `4.1.5`。
- 三个 bin 与 `lib/index.js` 都在这个提交里；没有 ESM exports。
- 依赖包含 `minimatch@^3.0.4`、`cross-spawn@^6.0.5`、`pidtree@^0.3.0`、`chalk@^2.4.1`。
- 维护叉 `npm-run-all2@9.0.3`（`15b60808...`）只作为对照披露，不进入本页 revision。
- 本文未安装依赖、未跑 Mocha、未 spawn `npm run`，状态保持 `UNVERIFIED`。

## 学到什么

1. **对象决定工具**——concurrently 调度命令字符串，npm-run-all 调度脚本名。两者都能“并行”，合同完全不同。
2. **组是一等概念**——混合 `--parallel` / `--sequential` 时，组间串行、组内并行；不要把整条 CLI 理解成一个开关。
3. **匹配先改分隔符**——冒号脚本名能被 minimatch 吃掉，是因为源码先对调 `:` 与 `/`。
4. **停更不等于不可核验**——4.1.5 的 tag 与 npm `gitHead` 对得上；要的是诚实披露 fork，而不是把旧包写成当前默认。

## 应用型自测

1. `npx npm-run-all lint test` 会并行跑吗？
2. `npx run-s --race lint test` 合法吗？
3. 模式 `build:*` 会匹配到名为 `build-js` 的脚本吗？

检查点：

1. 不会。默认串行，先 lint 再 test。
2. 不合法。`--race` 要求存在并行组；`run-s` 是串行 single-mode。
3. 不会。minimatch 的 `*` 过的是对调后的脚本名，`build:*` 对准 `build:js` 这种冒号名，不是 `build-js`。

## 延伸阅读

- 固定源码：[mysticatea/npm-run-all](https://github.com/mysticatea/npm-run-all) —— 本文绑定提交 `df1511851a2b5e8a406e4a2622829b360f671afc`
- 维护叉（未绑定）：[bcomnes/npm-run-all2](https://github.com/bcomnes/npm-run-all2)
- [[concurrently]] —— 任意命令并行、前缀和成功条件更完整
- [[just]] —— 不依赖 npm scripts 的项目命令入口

## 关联

- [[concurrently]] —— 对照：任意 shell + 退出时间成功条件 + tree-kill
- [[just]] —— 对照：justfile recipe，不读 `package.json`
- [[task]] —— YAML 清单，跨语言，不走 `npm run`
- [[pnpm]] —— 包管理器本身也能 `pnpm run -r`，职责不同

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
