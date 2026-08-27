---
title: Mage — 把导出的 Go 函数编译成一次运行的 target
description: 固定版本先解析 magefile，再生成 main 并编译到缓存；Deps 在进程内并行且只跑一次
来源: https://github.com/magefile/mage
日期: 2026-08-27
分类: 构建工具
难度: 入门
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: tool
  canonical_source: https://github.com/magefile/mage
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 0953947c1673fd745a51c032aadeb3c63f9f3368
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 1.17.2
---

## 是什么

Mage v1.17.2 是一个 **用 Go 函数当 target 的构建工具**。日常类比：不写一本要记 tab 的菜谱，而是用你本来就会的语言写几个导出函数，Mage 把它们编成一份临时菜单再执行。

```go
//go:build mage

package main

import "github.com/magefile/mage/sh"

func Build() error {
    return sh.Run("go", "build", "-o", "bin/app", "./cmd/app")
}
```

```bash
mage build
mage -l
```

入口是 `mage.Main()` → `ParseAndRun` → `Invoke`。真正跑 target 前，它会解析 magefile、生成 `mage_output_file.go`、编译到缓存目录。`go.mod` 声明 `go 1.18`。

## 为什么重要

不读固定 v1.17.2，旧笔记会把三件事写错：

- `mage -h <target>` / `mage -l` 也必须先编译（1.17.2 在 parse 之后、compile 之前就能出列表和单 target 帮助）
- 只有 `func()` / `func() error` / `func(context.Context) error` 三种签名（还可以无 error、以及 `string` / `int` / `float64` / `bool` / `time.Duration` 参数）
- 默认 target 是第一个导出函数（实际是包级 `var Default = Build`）

它和 [[just]] 的对照是：**just 每次把文本交给 shell；Mage 先把 Go 编成二进制，再在一次进程里按函数跑。**

## 核心要点

主链可以拆成五步：

1. **找文件**：若存在 `magefiles/` 目录，默认进该目录。根目录同时还有带 `mage` tag 的文件时打 WARNING，当前仍回退用根目录。
2. **筛选**：当前目录只收带 `mage` build tag 的 `.go`；`magefiles/` 按普通 Go tag 规则收全部 `.go`。
3. **解析**：`parse.PrimaryPackage` 抽出导出函数、`Default`、`Aliases`、`mg.Namespace` 方法。CLI 名一律小写，namespace 写成 `build:server`。
4. **列表/帮助可停在这里**：`mage -l` 与 `mage -h target` 走 `mageListOutput` / `mageHelpOutput`，不编译。
5. **要执行才编译**：生成 `mage_output_file.go`，编到 `MAGEFILE_CACHE` 或 `~/.magefile`（Windows 为 `%HOMEDRIVE%%HOMEPATH%\magefile`）。若本机 `GOCACHE` 非空，默认忽略旧二进制、重新 `go build`，除非 `MAGEFILE_HASHFAST`。

`mg.Deps` 在各自 goroutine 里跑，并用 `sync.Once` 保证同一 `Name+ID` 一次 Mage 进程只执行一次。`SerialDeps` 改为串行。`target.Path` 只比较路径自身的 modtime，不递归目录。

## 实践示例

### 案例 1：Deps 并行且去重

```go
func CI() {
    mg.Deps(Lint, Test, Build)
}

func Lint() error  { return sh.Run("golangci-lint", "run") }
func Test() error  { return sh.Run("go", "test", "./...") }
func Build() error { return sh.Run("go", "build", "./...") }
```

`mage ci` 三个依赖并发。若 `Test` 内部再 `mg.Deps(Build)`，`Build` 仍只跑一次。失败会 `panic(mg.Fatal(...))`，退出码取依赖里的非零值。

### 案例 2：Default、Namespace 与可选参数

```go
var Default = Build

type Build mg.Namespace

func (Build) Server() error { return sh.Run("go", "build", "./cmd/server") }

func Release(version string) error {
    return sh.Run("git", "tag", version)
}
```

`mage` 无参跑 `Default`。`mage build:server` 对应 namespace 方法。`mage release v1.2.3` 把位置参数绑到 `string`；可选参数会生成 `-name=value`。

### 案例 3：时间戳增量要自己写

```go
func Build() error {
    newer, err := target.Path("bin/app", "main.go", "go.sum")
    if err != nil { return err }
    if !newer { return nil }
    return sh.Run("go", "build", "-o", "bin/app")
}
```

`target.Path` 在目标不存在时返回 `true`；源不存在则报错。它**不**进入目录比最新文件。目录要用 `target.Dir`。这不是 Mage 运行时的默认行为。

## 踩过的坑

1. **根目录 magefile 忘了 `//go:build mage`**：会被 `go build ./...` 编进主包，也可能根本不被 Mage 收进去。`magefiles/` 目录可以不写该 tag。
2. **把 `mage -l` 的冷启动当成“每次都编译”**：v1.17.2 列表和 `-h` 已停在 parse。真正 `mage build` 仍要编译。
3. **`mg.Deps(Build)` 写成字符串 `"build"`**：`checkFns` 要求函数值 / `mg.Fn`，非函数会 panic。
4. **以为 `target.Path("out", "src")` 会扫整个 `src/`**：只 stat 你传入的那一项。
5. **把 GitHub star 或“比 Make 快半秒”写成当前事实**：本文未安装 Go、未跑 `mage` 自己的测试。

## 适用 vs 不适用场景

**适用**：

- 项目已经用 Go，希望 build 脚本能补全、单测、code review
- 需要 `mg.Deps` 这种进程内并行和去重
- 同一份 magefile 要在 Unix / Windows 上调 `os/exec`，而不是一份 bash

**不适用**：

- 非 Go 仓库，只为写四行脚本去学一套编译缓存
- 只要文本别名、换解释器——[[just]] 更轻
- 要声明式、可缓存的任务图——[[task]] / [[earthly]] / [[turborepo]]
- 不能接受“执行前先 `go build` magefile”

## 固定版本边界

- 本文绑定 `magefile/mage@0953947c1673fd745a51c032aadeb3c63f9f3368`，tag `v1.17.2`。该提交说明 `-h` 不再要求编译。
- 模块路径 `github.com/magefile/mage`，`go 1.18`。二进制版本来自 `debug.ReadBuildInfo()`，不是 `go.mod` 里的常量。
- 缓存目录：`MAGEFILE_CACHE`，否则 Unix `~/.magefile`，Windows `HOMEDRIVE+HOMEPATH/magefile`。
- 本文未执行 `mage`、未跑上游测试，状态保持 `UNVERIFIED`。

## 学到什么

1. **Mage 的产品是“编译后的函数表”**，不是再实现一种 Makefile DSL。
2. **列表/帮助和执行的成本不同**——v1.17.2 把前者从编译路径拆出来。
3. **去重发生在一次进程里**——`sync.Once` 不管文件时间戳。
4. **增量是库，不是运行时默认**——`target` 要你自己调用。

## 应用型自测

1. `mage -l` 在 v1.17.2 会不会生成并编译 `mage_output_file.go`？
2. 没有 `var Default` 时，无参 `mage` 会跑第一个导出函数吗？
3. `target.Path("bin/app", "cmd")` 在 `cmd` 是目录时，会不会比较目录里最新文件？

检查点：

1. 不会。`-l` 在 parse 后直接 `mageListOutput` 返回。
2. 不会。没有 Default 就没有默认 target。
3. 不会。`Path` 只 stat `cmd` 本身；目录内容要 `target.Dir`。

## 延伸阅读

- 文档：[magefile.org](https://magefile.org/)
- 固定源码：[magefile/mage](https://github.com/magefile/mage) —— 本文绑定提交 `0953947c1673fd745a51c032aadeb3c63f9f3368`
- [[just]] —— 文本 recipe，默认不编译、不看时间戳
- [[task]] —— YAML 清单
- [[earthly]] —— 容器化构建图

## 关联

- [[just]] —— 命令编排对照：shell 文本 vs Go 函数
- [[task]] —— 跨语言 YAML runner
- [[earthly]] —— 需要隔离构建时的另一侧
- [[turborepo]] —— JS monorepo 任务缓存
- [[nix]] —— 声明式可重复环境

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
