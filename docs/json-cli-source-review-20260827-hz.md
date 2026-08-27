# JSON-CLI source review (writer HZ)

> 用途：记录 jq、fx 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：HZ
- evidence：GitHub metadata、npm package metadata、固定提交静态源码阅读
- not executed：未安装两仓依赖，未编译上游二进制，未运行上游 test、bundle 或性能 benchmark
- worktrees：本机 `research-worktrees/`，不进入 Git

## jq

- canonical source：`https://github.com/jqlang/jq`
- revision：`34f7186b86743a083a589741b6cea95293524108`
- package：官方发布标签 `jq-1.8.2`（轻量 tag 与剥皮提交相同）
- inspected：
  - `NEWS.md`（1.8.2 / 1.8.1 / 1.8.0）
  - `README.md`
  - `src/main.c`（usage、option 解析、`process`、输入循环）
  - `src/jq.h`
  - `src/jv.h`
  - `src/jv.c`（`jv` refcnt、`jvp_array_write` 写时拷贝、`jv_number_with_literal` / `USE_DECNUM`）
  - `src/jv_parse.c`（`JV_PARSE_STREAMING`）
  - `src/execute.c`（`jq_compile_args`、`jq_start`、`jq_next`）
  - `src/builtin.jq`（`select`、`map`、`_assign` / `_modify`）
- observed：
  - `jq_compile_args` 走 `load_program` → `builtins_bind` → `block_compile` → peephole `optimize`；
  - 每个输入值调用 `jq_start`，再循环 `jq_next` 直到 invalid；`select` 定义为 `if f then . else empty`；
  - `jvp_array_write` 仅在 `jvp_refcnt_unshared` 时原地写，否则分配新数组；
  - usage 列出 `--stream` / `--seq` / `--argjson` / `--rawfile`，**没有** `--decimal`；
  - 数字字面量走 `jv_number_with_literal` + vendor `decNumber`；计算路径仍可落到 `jv_number(double)`；
  - tag 提交说明是 `build(deps): bump actions/checkout`；`NEWS.md` 仍把该提交记为 1.8.2 安全/缺陷补丁发布。
- provenance split：
  - 本页绑定 GitHub 发布 tag `jq-1.8.2` 的可达提交，不是 `sanack/node-jq`；
  - 未核验发行二进制的 `USE_DECNUM` 编译开关。

## fx

- canonical source：`https://github.com/antonmedv/fx`
- revision：`c8fd8cf394083141ab912f604d332e1cfde830cb`
- package：`fx@39.2.0`（tag `39.2.0`、`version.go`、npm `gitHead` 同指此提交）
- inspected：
  - `version.go`
  - `go.mod`
  - `main.go`（flag、TTY 分流、TUI vs `engine.Start`）
  - `help.go`
  - `keymap.go`
  - `utils.go`（`open` 扩展名、`parseYAML`）
  - `internal/engine/engine.go`
  - `internal/engine/transpile.go`
  - `internal/engine/vm.go`
  - `internal/engine/stdlib.js`
  - `internal/engine/fxrc.go`
  - `npm/package.json`
  - `npm/index.js` 入口与 `transform` / `transpile`
- observed：
  - stdin 是 TTY 且无参数时打印 usage；stdin 是 TTY 时第一个参数当文件；否则读 stdin；
  - 有 filter 参数或 `--slurp` 时走 `engine.Start`（goja）；否则启动 bubbletea TUI，输出接到 stderr；
  - `.` / `this` / `x` 是 pretty-print 快路径；其余参数经 `transpile` 后塞进 `__main__`；
  - TUI：`.` dig、`/` 正则搜索、`e`/`E` 全开全关、空格翻页、`q` 退出；
  - `--yaml` / `.ya?ml` 与 `--toml` / `.toml` 先转 JSON 再解析；
  - `.fxrc.js` 从 cwd、`$HOME`、XDG 目录拼接进 `Stdlib`；
  - 同提交 `npm/index.js` 是另一套 Node 变换 CLI，入口看不到 TUI。
- provenance split：
  - npm `fx@39.2.0` 的 `gitHead` 与源码 tag 一致，但发布物是 `npm/index.js`，不是 Go TUI 二进制。
