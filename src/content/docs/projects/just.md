---
title: just — 只编排命令，默认不跟踪文件时间戳
description: 固定版本把 justfile 编成 recipe 并默认交给 sh -cu，增量与缓存都是显式选择而不是默认合同
来源: https://github.com/casey/just
日期: 2026-08-27
分类: 命令行工具
难度: 入门
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: tool
  canonical_source: https://github.com/casey/just
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 7f4ef81bd6a93faa2b28430912c8e9ab0e3dd29a
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 1.58.0
---

## 是什么

just 1.58.0 是一个 **Rust 写的命令编排器**：把日常要敲的长命令写进 `justfile`，以后用 `just test` / `just dev` 按名执行。日常类比：冰箱门上的晚饭便签只写“今晚做什么”，不负责判断食材变没变。

```just
test:
    pytest -v --cov

dev:
    pnpm dev
```

```bash
just test
just --list
```

固定源码把自己标成 *Just a command runner*。`Cargo.toml` 版本 `1.58.0`，`rust-version` 为 `1.89.0`，许可 `CC0-1.0`。默认解释器是 `sh -cu`，不是 make 那种“源文件比产物新才跑”的构建图。

## 为什么重要

不读固定 1.58.0，旧教程会把三件事说错：

- 无参 `just` 一定跑名叫 `default` 的 recipe（实际是 `[default]` 属性，否则取根 justfile **行号最小** 的那条）
- just 完全没有缓存（`[cache]` 会写 `.justcache`，用 blake3 做 key，但标成 unstable）
- Windows 会自动切 PowerShell（默认仍是 `sh`；要 `set windows-shell` 或 `set windows-powershell`）

它和 make 的分水岭不是语法像不像，而是 **默认不看文件时间戳**。

## 核心要点

从敲下 `just` 到跑出一条命令，主链可以拆成五步：

1. **找 justfile 并解析**：`just::run` 解析 CLI，再交给 subcommand。无参默认是 `Run`。
2. **选定 recipe**：命令行参数经 `InvocationParser` 拆成 recipe + 参数。空参数走 `Justfile.default`。
3. **先跑先验依赖**：`priors` 在 recipe 前执行；`subsequents` 在其后。带 `[parallel]` 时先验依赖用线程并行，否则按声明顺序。
4. **插值后再交给解释器**：`{{...}}` 在执行前由 Evaluator 展开。普通行走 `settings.shell_command`（默认 `sh -cu`）；shebang / `[script]` 走 `Executor`，把正文写成临时脚本。
5. **可选缓存**：只有带 `[cache]` 且未传 `--no-cache` 的 script recipe 才查 `.justcache`。未标注的 recipe 每次都跑。

脚本解释器默认是 `sh -eu`，和行命令的 `sh -cu` 不是同一组参数。

## 实践示例

### 案例 1：默认 recipe 不是靠名字

```just
[default]
list:
    @just --list

deploy env="staging":
    echo "deploying to {{env}}"
```

`just` 无参会跑带 `[default]` 的 `list`。若删掉属性，则跑行号最小的那条。`{{env}}` 是 just 插值；shell 自己的变量仍写 `$VAR` 或 `$$`。

### 案例 2：依赖总是再跑一遍，除非自己加判断

```just
build:
    cargo build --release

test: build
    cargo test
```

`just test` 会先跑 `build` 再跑 `test`。没有“`Cargo.toml` 没变就跳过”。`[parallel]` 只改变先验依赖的并发，不引入时间戳图。

### 案例 3：shebang 换解释器，Windows 要显式改壳

```just
analyze:
    #!/usr/bin/env python3
    print("ok")

set windows-powershell
```

shebang 必须写在 recipe 正文第一行。`set windows-powershell` 在 Windows 上把行命令换成 `powershell.exe -NoLogo -Command`；自定义列表用 `set windows-shell := ["pwsh.exe", "-Command"]`。没设这两项时，Windows 也还是 `sh`。

## 踩过的坑

1. **把 just 当 C/C++ 增量构建**：默认每次全跑。`[cache]` 还是 unstable，不能当成 make / ninja 的替代合同。
2. **以为 recipe 名叫 `default` 就会自动当入口**：入口是 `[default]` 或第一条 recipe。也可以 `set default-list`，让无参 `just` 只列表。
3. **混用 `{{var}}` 和 `${var}`**：前者在进 shell 前展开，后者是 shell 运行时。
4. **在没装 sh 的 Windows 上直接跑**：默认 `sh -cu`。没有 Git Bash / WSL 时要改 `windows-shell` 或 `windows-powershell`。
5. **把 crates.io / 文档里的体积或 star 当成本轮测量**：本页未装 Rust、未跑集成测试、未测启动时间。

## 适用 vs 不适用场景

**适用**：

- 多语言仓库要把 README 里的“先跑这个再跑那个”收成一份 justfile
- 需要同一文件里混 bash / Python / Node，用 shebang 或 `[script]` 换解释器
- 接受“每次都跑”来换简单心智模型

**不适用**：

- 要按源文件时间戳跳过编译——make / ninja / [[earthly]]
- 要 Go 函数、并发 `mg.Deps` 和进程内去重——[[mage]]
- 只要 YAML 清单并带有限增量——[[task]]
- 不能接受 `rust-version 1.89.0` 的工具链下限

## 固定版本边界

- 本文绑定 `casey/just@7f4ef81bd6a93faa2b28430912c8e9ab0e3dd29a`，tag / `Cargo.toml` 均为 `1.58.0`。
- 默认行命令：`sh` + `["-cu"]`。默认脚本解释器：`sh` + `["-eu"]`。
- `[cache]` 属于 unstable feature `CachedRecipes`；缓存目录名是 `.justcache`，key 用 blake3。
- 许可为 `CC0-1.0`。本文未编译 `just`、未跑 `tests/`，状态保持 `UNVERIFIED`。

## 学到什么

1. **编排和增量构建不是同一份合同**——just 把后者从默认路径拿掉。
2. **默认 recipe 是属性或源码顺序，不是名字魔法**。
3. **插值发生在 shell 之前**——`{{}}` 和 `$` 分属两层。
4. **跨平台壳是设置，不是自动探测**——Windows 默认仍是 `sh`。

## 应用型自测

1. 不写 `[default]`、第一条 recipe 叫 `build` 时，无参 `just` 跑谁？
2. 未标 `[cache]` 的 `test` 在源文件没变时会不会跳过？
3. 没设 `windows-shell` 时，Windows 上行命令的默认二进制是什么？

检查点：

1. `build`（行号最小的根 recipe）。
2. 不会跳过；每次进入 `run_shell` / `run_script`。
3. `sh`，参数 `-cu`。

## 延伸阅读

- 手册：[just.systems/man/en](https://just.systems/man/en/)
- 固定源码：[casey/just](https://github.com/casey/just) —— 本文绑定提交 `7f4ef81bd6a93faa2b28430912c8e9ab0e3dd29a`
- [[mage]] —— 用 Go 函数当 target，进程内去重
- [[task]] —— YAML 清单，带有限增量
- [[earthly]] —— 容器化构建图，不是命令别名

## 关联

- [[mage]] —— 同主题对照：编译 Go 函数 vs 解析 justfile
- [[task]] —— YAML 命令清单
- [[earthly]] —— 需要可重复构建图时的另一侧
- [[biome]] —— 同样是 Rust 单二进制 CLI，但合同是 lint/format
- [[nix]] —— 把可重复性做到声明式环境
- [[turborepo]] —— monorepo 任务图带缓存

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
