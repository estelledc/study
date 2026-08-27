# Capacitor + Boa Engine source review (writer FK)

> 用途：记录 `capacitor` 与 `boa-engine` 项目页迁移所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。后缀 `-fk` 标记 2026-08-27 平行 writer FK，避免与同日其他审查文档撞名。

## 范围与边界

- review date：2026-08-27
- evidence：GitHub / npm / crates.io 元数据与固定提交静态源码阅读
- not executed：未安装两仓依赖，未跑 iOS / Android / Xcode / Gradle，未执行 `cap sync`，未跑 Boa Test262 / `cargo test` / WASM playground，未测 bundle、帧率、吞吐或兼容率
- worktrees：本机 `research-worktrees/`（gitignored），blob-filtered + sparse checkout，不进入 Git
- slugs：仓库笔记 slug 仍为 `capacitor` 与 `boa-engine`；`@capacitor/core` / `boa_engine` 是包名，不是新页面

## Capacitor

- canonical source：`https://github.com/ionic-team/capacitor`
- tag：`8.5.0`（annotated tag `612d9cc7bb47879841e74b182871090a633b82cc`）
- revision：`3ab4139bd0b8863cadcb175180ea941f4c244f08`
- packages：`@capacitor/core@8.5.0`、`@capacitor/cli@8.5.0`、`@capacitor/ios@8.5.0`、`@capacitor/android@8.5.0`（均为 MIT）
- npm：`@capacitor/core@8.5.0` 与 `@capacitor/cli@8.5.0` 的 `gitHead` 均为 `3ab4139bd0b8863cadcb175180ea941f4c244f08`，与 annotated tag peel 一致
- cli engines：`node >= 22.0.0`
- inspected：
  - `package.json`、`core/package.json`、`cli/package.json`、`ios/package.json`、`android/package.json`
  - `core/src/index.ts`
  - `core/src/global.ts`
  - `core/src/runtime.ts`
  - `core/src/core-plugins.ts`
  - `core/src/web-plugin.ts`
  - `core/native-bridge.ts`
  - `cli/src/index.ts`
  - `cli/src/tasks/sync.ts`
  - `cli/src/tasks/copy.ts`
  - `cli/src/tasks/update.ts`
  - `cli/src/tasks/add.ts`
  - `cli/src/common.ts`
  - `cli/src/ios/common.ts`
  - `cli/src/android/common.ts`
  - `ios/Capacitor/Capacitor/JSExport.swift`
  - `android/capacitor/src/main/java/com/getcapacitor/JSExport.java`
- observed：
  - `registerPlugin` 用 `Proxy` 惰性分发：存在 `PluginHeaders` 且方法 `rtype === 'promise'` 时走 `cap.nativePromise`，否则走 `nativeCallback`；无 header 也无 JS impl 时抛 `Unimplemented`；
  - `nativePromise` 包一层 `new Promise`，再 `toNative`；
  - `@capacitor/core` 只注册四个核心插件：`WebView`、`CapacitorCookies`、`CapacitorHttp`、`SystemBars`（后者 `@since 8.0.0`）；相机等官方插件不在本仓；
  - Web 侧 `CapacitorHttpPluginWeb.request` 用 `window.fetch` + `buildRequestInit`；
  - `cap sync` 是 `copy` 再 `update`；`copy` 把 `webDir` 复制进原生工程并写出 `capacitor.config.json`；`update` 调 `updateIOS` / `updateAndroid`；
  - `cap add ios|android` 先 `checkCapacitorPlatform`，未安装 `@capacitor/ios` / `@capacitor/android` 会失败。

## Boa Engine

- canonical source：`https://github.com/boa-dev/boa`
- tag：`v0.21.1`（lightweight tag）
- revision：`bc36c3fac0969ea21ea0570b62e7846f97389b73`
- crate：workspace `version = "0.21.1"`，`boa_engine` 路径 `core/engine`，`rust-version = "1.88.0"`
- license：`Unlicense OR MIT`
- crates.io：`boa_engine@0.21.1` latest / max stable，发布时间与 tag 同一天
- inspected：
  - `Cargo.toml`、`README.md`、`core/engine/Cargo.toml`
  - `core/engine/src/lib.rs`
  - `core/engine/src/context/mod.rs`
  - `core/engine/src/script.rs`
  - `core/engine/src/native_function/mod.rs`
  - `core/engine/src/vm/runtime_limits.rs`
  - `core/runtime/src/lib.rs`
- observed：
  - `Context::eval` 是 `Script::parse` 再 `evaluate`；注释写明不会跑 scheduled promise jobs，需 `Context::run_jobs`；
  - 解析走 `boa_parser::Parser`，编译走 `ByteCompiler`，执行走 VM `context.run()`；
  - 同线程 Context 可共享对象（`Rc` / thread-local）；缺 lock-free `AtomicUsize` 会 `compile_error`；
  - 默认 `RuntimeLimits`：`loop_iteration = u64::MAX`（无上限）、`resursion = 512`、`backtrace_limit = 50`、`stack_size = 1024 * 10`；
  - `register_global_callable` 可 `new`；`register_global_builtin_callable` 不可构造；
  - `boa_runtime` 是独立 crate，Console / fetch 等 Web API 不会随 `Context::default()` 自动注册；
  - README 示例仍写 `boa_engine = "0.21.0"`，本页绑定 workspace `0.21.1`。
