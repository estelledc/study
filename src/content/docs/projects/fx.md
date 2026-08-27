---
title: fx — 终端里先看 JSON 树，再用 JS 做变换
description: 用 bubbletea 看 JSON 树，或把参数交给 goja，并披露 npm 包是另一套无 TUI 的 Node CLI
来源: https://github.com/antonmedv/fx
日期: 2026-08-27
分类: CLI / 命令行工具
难度: 入门
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: tool
  canonical_source: https://github.com/antonmedv/fx
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: c8fd8cf394083141ab912f604d332e1cfde830cb
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 39.2.0
---

## 是什么

fx 是 Anton Medvedev 的终端 JSON 工具。日常类比：[[jq]] 像把信件拆开按格子分拣；fx 默认先把整封信摊成可折叠的树，看清路径后再决定要不要写一段 JavaScript。

```bash
fx data.json
curl -s https://api.github.com/repos/antonmedv/fx | fx
```

固定 39.2.0 的 `version.go` 写死 `39.2.0`。无 filter 参数时走 bubbletea TUI；有参数或 `--slurp` 时走 `internal/engine` 里的 goja 管道。

## 为什么重要

不看这个提交，旧笔记会把分流说反：

- 以为“没有 TTY 就退化成 `jq .`”。源码按**有没有 filter 参数**决定 TUI 还是 `engine.Start`，不是看 stdout 是不是 TTY
- 以为 npm 的 `fx` 就是 Go TUI。同提交 `npm/index.js` 是另一套 Node 变换 CLI，入口没有 TUI
- 以为 dig 是“按 `.` 打开 jq REPL”。`.` 只跳 JSON 路径；真正变换写的是 JS，或 `.field` / `@` / `?` 这类转写

它和 [[jq]] 仍是搭档：fx 看树，jq 跑稳定批处理。

## 核心要点

固定 39.2.0 的主链可以拆成四步：

1. **看 stdin 是不是 TTY**：TTY 且无参数就打印 usage；TTY 时第一个参数当文件，并按 `.ya?ml` / `.toml` 自动打开对应解析；否则读 stdin。
2. **选解析器**：默认 `NewJsonParser`；`--yaml` 用 `goccy/go-yaml` 转 JSON；`--toml` 用 `internal/toml`；`--raw` 按行当字符串。
3. **有 args 或 `--slurp` → JS 管道**：`engine.Start` 把参数 `transpile` 后拼进 `__main__`，用 goja 跑。`.` / `this` / `x` 走 pretty-print 快路径，不进 VM。
4. **否则 → TUI**：bubbletea 全屏，输出接到 **stderr**。`.` dig、`/` 正则搜索、`e`/`E` 全开全关、空格/`f`/`pgdown` 翻页、`q` 退出。`FX_COLLAPSED` 可默认折叠。

`transpile` 把 `.foo` 写成 `x.foo`，`@` 写成 `map`，`?` 写成 `filter`。`stdlib.js` 还提供 `skip`、`walk`、`save`、`YAML`。启动时会把 cwd、`$HOME`、XDG 下的 `.fxrc.js` 拼进 `Stdlib`。

## 实践示例

### 案例 1：先看树，不写表达式

```bash
gh api repos/antonmedv/fx | fx
```

方向键或 `j`/`k` 移动，`l`/`enter` 展开，`h` 折叠。空格是翻页，不是折叠。

### 案例 2：dig 对齐路径，再交给 jq 批处理

```bash
kubectl get pods -o json | fx
# TUI 里按 . 跳到 .items[0].status.phase
kubectl get pods -o json | jq '.items[] | {name: .metadata.name, status: .status.phase}'
```

dig 只负责确认路径；稳定脚本仍写 jq。

### 案例 3：CLI 里用 JS，不是 jq DSL

```bash
fx users.json 'x.users.map(u => u.email)'
fx users.json '.users' '@.email'
```

第一条是原样 JS。第二条 `.users` 被转成 `x.users`，`@` 再 map。需要 YAML 时加 `--yaml`，或直接打开 `.yaml` 文件。

## 踩过的坑

1. **把“没 TTY”理解成自动 pretty-print**：无参数时即使用户把 stdout 重定向，Go 版仍会起 TUI（画面写到 stderr）。要非交互输出，需要带 filter，例如 `fx .`。
2. **认错 npm 包合同**：`fx@39.2.0` 的 `gitHead` 就是本提交，但发布物是 `npm/index.js`。它会做 JS 变换和 YAML，入口看不到 bubbletea，也没有 `--toml`。
3. **同名工具**：认准 `antonmedv/fx`。Homebrew / GitHub release 是 Go 二进制；`npx fx` 走 Node 入口。
4. **`.fxrc.js` 会进 VM**：cwd 和用户配置目录里的文件被拼进 `Stdlib`。处理不可信输入时，不要把“只是看 JSON”理解成“没有用户代码”。
5. **整份输入先解析再渲染**：TUI 按 `parser.Parse()` 一块块收节点，但没有“只映射磁盘上的一段”的流式打开。本轮未测超大文件行为。

## 适用 vs 不适用场景

**适用**：

- 探索陌生 API / kubectl / 配置 JSON 的结构
- 确认路径后再写 [[jq]] 或 JS 管道
- 把 YAML / TOML 先转成 JSON 再看（Go 版）

**不适用**：

- CI 里抽字段——用 [[jq]]，避免 TUI 和 JS 运行时
- 需要 jq 的 `empty` / `reduce` 合同，而不是 JS 数组方法
- 把 npm 包当成“同一个 TUI”
- 把未测量的启动时间或 star 数写进结论

## 固定版本边界

- 本文绑定 `antonmedv/fx@c8fd8cf394083141ab912f604d332e1cfde830cb`，tag / `version.go` / npm `fx@39.2.0` `gitHead` 一致。
- Go 模块要求 `go 1.23.0`，TUI 依赖 `charmbracelet/bubbletea`，JS 引擎是 `dop251/goja`。
- npm 发布物与 Go TUI 同 tag、不同入口；本页以 Go 源码为准，并披露 Node CLI。
- 本文未安装 Go/Node 依赖、未跑 TUI、未测体积，状态保持 `UNVERIFIED`。

## 学到什么

1. **同一仓库可以有两套 CLI 合同**——Go TUI 和 npm JS 不能互相代称。
2. **交互还是管道，看的是参数，不是“像不像 less”**——`fx .` 才是明确的非交互 pretty-print。
3. **dig 对齐路径，JS/jq 负责变换**——先看树再写过滤器。
4. **用户配置会进解释器**——`.fxrc.js` 让“只读查看”不再只读。

## 应用型自测

1. `cat data.json | fx` 在 39.2.0 的 Go 入口会不会因为 stdout 不是 TTY 就改成 `jq .`？
2. `fx data.json '.users'` 走 TUI 还是 goja？
3. `npx fx@39.2.0` 默认打开 bubbletea 树吗？

检查点：

1. 不会。无参数时仍启动 TUI，画面写到 stderr。
2. 走 `engine.Start`。有 filter 就不进 TUI。
3. 不会。npm 入口是 `npm/index.js` 的 Node 变换 CLI。

## 延伸阅读

- 文档：[fx.wtf](https://fx.wtf)
- 固定源码：[antonmedv/fx](https://github.com/antonmedv/fx) —— 本文绑定提交 `c8fd8cf394083141ab912f604d332e1cfde830cb`
- [[jq]] —— 过滤器语言与批处理对照

## 关联

- [[jq]] —— 稳定批处理和 `empty` 语义
- [[yq]] —— `yq -o=json | fx` 看深 YAML
- [[ripgrep]] —— `rg --json` 可再交给 fx 逐条看
- [[fzf]] —— 交互选择，不是 JSON 树
- [[btop]] —— 同属“给旧 CLI 加 TUI”，合同不同

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[curlie]] —— curlie — curl 的能力 + HTTPie 的语法
- [[dasel]] —— dasel — 一把刀同时切 JSON / YAML / TOML / XML / CSV
- [[gron]] —— gron — 把 JSON 拍平成 grep 能吃的赋值行
- [[httpie]] —— HTTPie — curl 的人话版本
- [[jc]] —— jc — 把 100+ Unix 命令的输出一键 JSON 化
