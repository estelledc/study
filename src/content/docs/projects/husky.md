---
title: Husky — 用 core.hooksPath 接上本地 Git 钩子
description: 介绍 husky 如何把 core.hooksPath 指到 .husky/_，并转发用户脚本的退出码。
来源: https://github.com/typicode/husky
日期: 2026-08-27
分类: 前端工程化
难度: 入门
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: tool
  canonical_source: https://github.com/typicode/husky
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 799e84b716d0e03db80db5d5b0dcdd15b9d555fc
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 9.1.7
---

## 是什么

Husky 是一个把本地 Git hook 接到仓库脚本的小安装器。日常类比：它不负责检查代码，只负责把仓库门口的门铃改接到你们自己写的门铃脚本。

固定 `9.1.7` 的安装动作是：把 `core.hooksPath` 指到 `.husky/_`，再在那里放 14 个客户端 hook 入口。真正要跑的内容写在外面的 `.husky/pre-commit` 这类用户文件里。

```bash
npx husky init
# package.json 出现 "prepare": "husky"
# .husky/pre-commit 默认写成 "<包管理器> test"
```

`init` 用 `npm_config_user_agent` 的第一段（没有则用 `npm`）拼出 `npm test` / `pnpm test` 这类默认 hook。之后你可以改成 [[lint-staged]] 或任意 POSIX 脚本。

## 为什么重要

不读固定版本的安装与 shim，下面这些事会被旧教程带偏：

- 为什么 v9 不再让你 `husky add` / `husky set` 去生成 hook 文件
- 为什么 hook 入口在 `.husky/_/`，用户脚本却在 `.husky/`
- 为什么旧的 `husky.sh` 两行还能 commit 成功，却被标成 v10 会失败
- 为什么 `HUSKY=0` 既能跳过安装，也能在已安装后放行 Git

一句话：husky 是 hook 宿主，不是 linter。它保证 Git 能找到脚本，不保证脚本检查了什么。

## 核心要点

固定 9.1.7 可以拆成四步：

1. **安装只改 Git 配置**：默认导出检查 `HUSKY=0`、路径里不能有 `..`、当前目录必须看得到 `.git`，然后 `git config core.hooksPath .husky/_`。`git` 不在 PATH 时返回 `git command not found`。

2. **入口文件是薄壳**：安装器把发行包里的 `husky` shim 复制成 `.husky/_/h`，再为 14 个客户端 hook 各写一行 `#!/usr/bin/env sh` + source `h`。用户脚本路径是 `dirname(dirname($0))/$hook-name`，也就是 `.husky/pre-commit`。

3. **找不到用户脚本就放行**：shim 发现目标文件不存在时 `exit 0`。Git 不会因为“这个 hook 还没写”而失败。

4. **运行时补 PATH 并用 `sh -e`**：shim 先尝试 `~/.config/husky/init.sh`（`~/.huskyrc` 只警告弃用），再把 `node_modules/.bin` 插到 `PATH` 前面，最后 `sh -e` 跑用户脚本。非 0 会打印 `script failed`；退出码 127 再提示 command not found。

14 个入口是：`pre-commit`、`pre-merge-commit`、`prepare-commit-msg`、`commit-msg`、`post-commit`、`applypatch-msg`、`pre-applypatch`、`post-applypatch`、`pre-rebase`、`post-rewrite`、`post-checkout`、`post-merge`、`pre-push`、`pre-auto-gc`。服务端 hook 不在这份名单里。

## 实践示例

### 案例 1：推荐的 init

```bash
npm install --save-dev husky
npx husky init
```

**逐部分解释**：

1. `bin.js` 读 `package.json`，补上 `scripts.prepare = 'husky'`，缩进跟原文件走 tab 或两空格
2. 调用默认安装，把 `core.hooksPath` 指到 `.husky/_`
3. 创建 `.husky/pre-commit`，默认内容是当前包管理器加 ` test`

之后每次 `npm install` 都会因 `prepare` 再跑一次安装。这是给新 clone 补 hook 的路径，不是“每次 install 都重新设计钩子”。

### 案例 2：自己写 pre-commit

```sh
# .husky/pre-commit
npx lint-staged
```

shim 会带着 `node_modules/.bin` 去跑这行。`lint-staged` 负责选暂存文件；husky 只保证 Git 在 `git commit` 时调用到这里。

### 案例 3：临时关掉钩子

```bash
HUSKY=0 git commit -m "wip"
```

安装阶段遇到 `HUSKY=0` 直接返回 `HUSKY=0 skip install`；运行阶段 shim 在 source 完 init 脚本后看到 `HUSKY=0` 也 `exit 0`。固定测试还覆盖了用 `XDG_CONFIG_HOME/.../husky/init.sh` 导出 `HUSKY=0` 的全局关闭。

## 踩过的坑

1. **继续用 `husky add` / `set` / `uninstall`**：固定 CLI 对这三个子命令打印 DEPRECATED 并 `exit 1`。`install` 只警告，仍执行默认安装。

2. **把用户脚本写成 v4 的两行 source**：`.husky/pre-commit` 里如果只剩 `#!/usr/bin/env sh` 和 `. "$(dirname -- "$0")/_/husky.sh"`，固定版本会打印“v10.0.0 将失败”的警告，测试里 commit 仍然成功。这不是新合同，是过渡期兼容。

3. **以为所有 Git hook 都被接管**：只有上面 14 个客户端名字会被写成入口。`pre-receive` 这类服务端 hook，以及未列入的客户端 hook，都不会自动出现。

4. **在含 `..` 的目录名上安装**：默认导出直接返回 `.. not allowed`，不会去改 `core.hooksPath`。

5. **把 lint 失败当成 husky 失败**：shim 只转发用户脚本退出码。格式化、类型检查或 [[lint-staged]] 的 stash/恢复逻辑都不在 husky 里。

## 适用 vs 不适用场景

**适用**：

- 需要在 Node 仓库里用 `.husky/pre-commit` 这样的普通脚本接 Git
- 希望新 clone 靠 `prepare` 脚本自动设置 `core.hooksPath`
- 检查逻辑已经交给 [[lint-staged]]、测试或自己的 POSIX 脚本

**不适用**：

- 还在执行 `husky add .husky/pre-commit "..."` 的旧文档流程
- 需要服务端 hook 或 14 个名字以外的客户端 hook
- 当前目录看不到 `.git`，或要把 hooks 目录设到带 `..` 的路径
- 想把“谁在跑检查、失败怎么恢复工作区”也交给 husky

## 固定版本边界

- 本文绑定 `typicode/husky@799e84b716d0e03db80db5d5b0dcdd15b9d555fc`，annotated tag `v9.1.7` peel 到同一提交，npm `husky@9.1.7` 的 `gitHead` 一致。
- `origin/main` 在 2026-03 仍自报 `9.1.7`；pin 之后是文档、赞助与 CI 矩阵，安装器与 shim 未改。
- 发行包要求 `node >= 18`。`HUSKY=2` 只打开 shim 的 `set -x`。
- 本文未安装依赖、未跑上游 `test.sh`、未真正执行 hook，状态保持 `UNVERIFIED`。

## 学到什么

1. **宿主和检查器要分开**——husky 只改 `core.hooksPath` 并转发退出码；暂存文件选择、自动 `git add`、失败回滚属于 [[lint-staged]]。
2. **用户脚本不在 hooksPath 目录里**——入口在 `.husky/_/`，正文在 `.husky/`。旧教程把两者写成同一个文件，就会撞上弃用的 `husky.sh`。
3. **缺文件默认放行**——没写的 hook 不会挡住 Git；要强制检查必须真的放一份用户脚本。
4. **关闭开关是环境变量，不是卸载**——`HUSKY=0` 同时覆盖安装与运行；CI 或紧急提交可以临时关掉，不必改仓库。

## 应用型自测

1. `husky add .husky/pre-commit "npm test"` 在固定 9.1.7 会成功写入文件吗？
2. `.husky/pre-push` 不存在时，`git push` 会因为 husky 失败吗？
3. 用户脚本退出 127，shim 除了转发退出码还会怎样？

检查点：

1. 不会。`add` 已弃用，CLI `exit 1`。
2. 不会。shim 找不到用户脚本时 `exit 0`。
3. 会再打印 `command not found in PATH=...`，然后带着 127 退出。

## 延伸阅读

- 固定源码：[typicode/husky](https://github.com/typicode/husky) —— 本文绑定提交 `799e84b716d0e03db80db5d5b0dcdd15b9d555fc`
- 安装器：[index.js](https://github.com/typicode/husky/blob/799e84b716d0e03db80db5d5b0dcdd15b9d555fc/index.js)
- 上游入门：[docs/get-started.md](https://github.com/typicode/husky/blob/799e84b716d0e03db80db5d5b0dcdd15b9d555fc/docs/get-started.md)
- [[lint-staged]] —— 常见的 pre-commit 搭档，负责暂存文件与任务恢复
- [[biome]] —— 可被 hook 调用的检查器，不是 hook 宿主

## 关联

- [[lint-staged]] —— 选暂存文件并跑任务；通常由 husky 的 `pre-commit` 启动
- [[biome]] —— 一体化 linter/formatter，常作为 hook 里的具体命令
- [[shellcheck]] —— 审查 husky 自己的 POSIX shim 时可用
- [[vite]] —— 典型前端仓库会同时装 husky，但构建工具不负责 Git hook

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[lint-staged]] —— lint-staged — 只对暂存文件跑检查任务
- [[shellcheck]] —— ShellCheck — shell 脚本的静态体检医生

- [[lint-staged]] —— lint-staged — 只对暂存文件跑检查任务
- [[projects/shellcheck]] —— ShellCheck — shell 脚本的静态体检医生
