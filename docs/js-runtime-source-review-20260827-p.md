# JS runtime source review (writer P)

> 用途：记录 Bun、Deno 项目页迁移所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL writer P
- evidence：GitHub release/tag metadata、固定提交静态源码与上游文档阅读
- not executed：未安装 `bun`/`deno` 二进制，未运行上游 test、HTTP server、package install、bundle 或性能 benchmark
- worktrees：本机未做完整 clone（`oven-sh/bun` GitHub size ≈ 937MB）；按 tag SHA 用 GitHub Contents / raw 读取固定路径
- excluded slugs：`react-hook-form`、`tanstack-form`、`mcp-ts-sdk`、`ollama`、`aichat`、`shell-gpt`、`haystack`、`langfuse`、`zustand`、`jotai`、`tanstack-query`、`swr`、`biome`、`oxlint`、`prisma`、`kysely`、`radix`、`shadcn`、`drizzle-orm`、`inngest`、`sentry-javascript`、`pino`、`web-vitals`、`prom-client`、`postgres.js`、`duckdb-wasm`、`xstate`、`redux`、`zod`、`valtio`、`hono`、`elysia`、`vitest`、`playwright`、`browser-use`、`oxc`、`rolldown`

## Bun

- canonical source：`https://github.com/oven-sh/bun`
- revision：`34cbb9a40b4bd1bd767d134a7065e66c2432a676`
- package / tag：`bun@1.4.0` / lightweight tag `bun-v1.4.0`（`git ls-remote` 与 GitHub latest release `target_commitish` 同指此提交）
- inspected：
  - `package.json`
  - `LICENSE.md`
  - `README.md`
  - `src/CLAUDE.md`
  - `src/bun_bin/lib.rs`
  - `src/bun.js.rs`
  - `src/runtime/cli/mod.rs`
  - `src/runtime/server/ServerConfig.rs`
  - `src/install/ConfigVersion.rs`
  - `src/install/PackageInstall.rs`
  - `src/install/hoisted_install.rs`
  - `src/install/isolated_install.rs`
  - `src/runtime/test_runner/mod.rs`
  - `docs/runtime/index.mdx`
  - `docs/runtime/http/server.mdx`
  - `docs/pm/cli/install.mdx`
  - `docs/test/index.mdx`
- observed：
  - `src/` 是 Cargo workspace；`bun_bin` 编成 `libbun_rust.a`，进程入口 `main` 经 crash handler / mimalloc / argv 后调用 `cli::Cli::start()`；
  - 固定树 **0 个 `.zig` 文件**；语言计数以 `.js` / `.ts` / `.rs` / `.cpp` 为主。旧笔记把实现语言写成 Zig，与 1.4.0 不符；
  - JS 引擎仍是 JavaScriptCore（`bun_jsc`、`LICENSE.md` 的 LGPL-2 静态链接说明）；运行时 crate 是 `bun_runtime`（server / fetch / node compat / crypto）；
  - CLI 分发用 `RootCommandMatcher`：`run`、`test`、`install`/`i`、`build`、`x`、`repl`、`exec`、`add`、`remove`、`pm` 等；`bun <file>` 走 Auto/Run 热路径；
  - `Bun.serve` 的 `ServerConfig::from_js` 先把 TCP port 写成 `3000`，再按 `BUN_PORT` → `PORT` → `NODE_PORT` → transpiler `--port` 覆盖；`idle_timeout` 默认 `10`（秒，`u8`，文档写最大 255、`0` 关闭）；
  - `from_js` 默认 `development`，`NODE_ENV=production` 或 production transform 则切到 `Production`；存在 `NODE_UNIQUE_ID` 时默认 `reuse_port`；
  - 服务端同时支持 `routes` 对象（静态 / `:id` / 按 method / 通配）和 `fetch` 回退；`http3` 默认 false；
  - 安装后端枚举 `clonefile` / `clonefile_each_dir` / `hardlink`，失败再回退拷贝；`ConfigVersion` 当前为 `V1`；`hoisted_install.rs` 与 `isolated_install.rs` 并存，不能再把布局说成「永远扁平 hardlink」；
  - `bun:test` 在 `test_runner` 里标明 Jest-compatible runner + `expect` + snapshot + fake timers；
  - LICENSE：Bun 本体 MIT，静态链接的 JavaScriptCore / WebKit 为 LGPL-2。
- provenance：
  - GitHub latest release 名为 `Bun v1.4`，tag `bun-v1.4.0`，`package.json` version `1.4.0`，三方一致；
  - 无独立 npm `gitHead` 可交叉验证（发行物是二进制，不是普通 JS 包）；本审查绑定可达 GitHub tag commit。

## Deno

- canonical source：`https://github.com/denoland/deno`
- revision：`17fadf33a8df3af9488b9f42efd1f2290d6dc7a3`
- package / tag：`deno@2.9.5` / lightweight tag `v2.9.5`（`cli/Cargo.toml` version 一致）
- inspected：
  - `Cargo.toml`
  - `cli/Cargo.toml`
  - `cli/main.rs`
  - `cli/lib.rs`
  - `cli/args/mod.rs`
  - `cli/args/flags.rs`
  - `runtime/lib.rs`
  - `runtime/permissions.rs`
  - `runtime/permissions/lib.rs`
  - `runtime/worker.rs`
  - `ext/http/lib.rs`
  - `ext/http/00_serve.ts`
  - `rust-toolchain.toml`
  - `README.md`
- observed：
  - `cli/main.rs` 只转调 `deno::main()`；`cli/lib.rs` 的 `run_subcommand` 覆盖 `Run` / `Serve` / `Task` / `Install` / `Add` / `Test` / `Lint` / `Fmt` / `Compile` / `Bundle`（实验）/ `Deploy` 等；
  - 默认引擎 feature 是 `v8`（`deno_v8` facade）；另有 `quickjs` feature，不是默认构建；
  - `Permissions` 八个 unary 域：`read` / `write` / `net` / `env` / `sys` / `run` / `ffi` / `import`；`PermissionState` 默认 `Prompt`；
  - CLI 权限旗标含 `--allow-all`/`-A`、`--allow-read`/`-R`、`--allow-write`/`-W`、`--allow-net`/`-N`、`--allow-env`/`-E`、`--allow-sys`/`-S`、`--allow-run`、`--allow-ffi`、`--allow-import`/`-I`，以及对应 `--deny-*` 与 `--no-prompt`；
  - `--allow-import` 帮助文本给出默认主机列表：`deno.land:443,jsr.io:443,esm.sh:443,raw.esm.sh:443,cdn.jsdelivr.net:443,raw.githubusercontent.com:443,gist.githubusercontent.com:443`；
  - `Deno.serve` 在 `ext/http/00_serve.ts`：handler 可以是第一参或 `options.handler`；未覆盖时 `hostname` 默认 `"0.0.0.0"`、`port` 默认 `8000`；`DENO_SERVE_ADDRESS` 可改 TCP/unix/vsock/tunnel；
  - `deno serve` 子命令默认 `port=8000`、`host=0.0.0.0`，注释写明 implies `--allow-net=host:port`；另有 `--parallel` / `--open` / `--tunnel`；
  - `op_http_serve_default_compression` 只在 `DENO_SERVE_AUTOMATIC_COMPRESSION` 为真时开启，缺省 false；
  - npm / JSR：`deno add` 无前缀时补 `npm:`；lockfile 经 `deno_resolver::lockfile`；`NodeModulesDirMode` 可由 flag 或 workspace 配置决定；
  - `deno bundle` 在 `run_subcommand` 打印 experimental 警告；
  - 工具链钉在 `rust-toolchain.toml` channel `1.95.0`。
- provenance：
  - GitHub latest release `v2.9.5` 与 `cli/Cargo.toml` version 一致；
  - tag 为 lightweight，直接指向上述 commit。
