# Desktop runtime source review (writer X)

> 用途：记录 Electron、Tauri 项目页迁移所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。Writer slug：`x`。未占用 A–W 或其他开放 PR 的项目 slug。

## 范围与边界

- review date：2026-08-27
- evidence：GitHub metadata、npm / crates.io 包元数据、固定提交静态源码与官方教程阅读
- not executed：未安装两仓依赖，未运行上游 test、打包、签名、桌面窗口、bundle 或性能 benchmark
- worktrees：本机 `/tmp/review-electron` 与 `/tmp/review-tauri` 的按文件抓取，不进入 Git

## Electron

- canonical source：`https://github.com/electron/electron`
- revision：`bf0c4e67e9a834479ee171e61057f7516a381d25`
- package：`electron@44.0.0`
- inspected：
  - `package.json`（仓库根为 `@electron-ci/dev-root` / `0.0.0-development`）
  - `npm/package.json`
  - `docs/tutorial/process-model.md`
  - `docs/tutorial/security.md`
  - `docs/tutorial/sandbox.md`
  - `docs/tutorial/context-isolation.md`
  - `docs/tutorial/ipc.md`
  - `docs/tutorial/esm.md`
  - `docs/tutorial/fuses.md`
  - `lib/browser/ipc-main-impl.ts`
  - `lib/browser/ipc-dispatch.ts`
  - `lib/browser/rpc-server.ts`
  - `lib/renderer/security-warnings.ts`
  - `lib/preload_realm/init.ts`
- observed：
  - 应用入口是单个 main process（Node 环境），每个 `BrowserWindow` / web embed 再开独立 renderer；preload 在页面加载前运行，但默认 `contextIsolation` 下与页面不共享同一个 `window` 对象；
  - `UtilityProcess` 从 main fork 出额外 Node 进程，并可与 renderer 建 `MessagePort`；文档把它标成比 `child_process.fork` 更优先的桌面侧工作进程；
  - `contextIsolation` 自 Electron 12 起默认开启；renderer sandbox 自 Electron 20 起默认开启；`nodeIntegration: true` 会关掉该 renderer 的 sandbox；
  - 安全清单共 20 条，包括禁止远程内容开 Node、校验 IPC `sender`、优先自定义协议而非 `file://`、以及检查 packaging fuses；
  - `ipcMain.handle` 把 handler 存在 `_invokeHandlers` Map，同一 channel 二次注册会抛错；`ipc-dispatch` 的 `-ipc-invoke` 按 frame / service-worker / internal 查找 handler，成功回 `{ result }`，异常回 `{ error: error.toString() }`，文档同时写明 renderer 只拿到序列化后的 `message`；
  - 推荐的双向 IPC 是 `ipcRenderer.invoke` + `ipcMain.handle`（Electron 7 引入）；preload 经 `contextBridge.exposeInMainWorld` 只暴露单个方法，而不是整个 `ipcRenderer`；
  - ESM 自 `electron@28.0.0` 起：main 用 Node loader；sandboxed preload 不能 ESM import；unsandboxed ESM preload 必须 `.mjs`；
  - fuse 是打包期二进制开关：`runAsNode` 默认 Enabled，`cookieEncryption` 默认 Disabled；翻转发生在签名前。
- provenance note：
  - GitHub latest release `v44.0.0`（2026-08-25）是 annotated tag `c6203066...`，peel 后指向 `bf0c4e67e9a834479ee171e61057f7516a381d25`；
  - npm `electron@44.0.0` 无 `gitHead`；仓库 `npm/package.json` 声明 `engines.node >= 22.12.0`，与 registry 一致，版本号在发布流程注入；
  - 本文绑定 tag peel 后的 commit，不绑定 nightly / 其他 38.x LTS 线。

## Tauri

- canonical source：`https://github.com/tauri-apps/tauri`
- revision：`7cd71369c00978a3783b6ae3e9972358abbe4ae6`
- packages：`tauri@2.11.5`（crates.io）、`@tauri-apps/api@2.11.1`（npm）
- inspected：
  - `ARCHITECTURE.md`
  - `Cargo.toml`
  - `crates/tauri/Cargo.toml`
  - `crates/tauri/src/lib.rs`
  - `crates/tauri/src/ipc/mod.rs`
  - `crates/tauri/src/ipc/command.rs`
  - `crates/tauri/src/ipc/authority.rs`
  - `crates/tauri-utils/src/acl/mod.rs`
  - `crates/tauri-utils/src/acl/capability.rs`
  - `crates/tauri-runtime-wry/Cargo.toml`
  - `packages/api/package.json`
  - `packages/api/src/core.ts`
- observed：
  - 桌面窗口由 TAO 创建，WebView 由 WRY 选择系统内核（Windows WebView2、macOS WKWebView、Linux WebKitGTK）；`tauri` crate 默认 feature 含 `wry`、`compression`、`dynamic-acl`、`x11`、`dbus`；
  - workspace `rust-version = "1.77.2"`；`tauri` 2.11.5 依赖 `tauri-runtime 2.11.3`、`tauri-runtime-wry 2.11.4`、`tauri-utils 2.9.3`；
  - 前端 `@tauri-apps/api` 的 `invoke(cmd, args, options)` 只是转调 `window.__TAURI_INTERNALS__.invoke`；可选 `Channel` 用带 index 的回调保序；Android 上 `InvokeBody::Raw` 不受支持；
  - `#[tauri::command]` + `generate_handler!` 把 Rust 函数登记为 IPC 命令；`CommandItem` 从 JSON payload 按参数名取值，缺 key 或对 Raw body 反序列化具名参数都会失败；
  - capability 按 window / webview 名或 glob 分组权限；源码写明「webview 或其 window 不匹配任何 capability 则完全没有 IPC」；
  - `RuntimeAuthority::resolve_access` 先查 `denied_commands`，命中即拒绝，再按 origin + window/webview glob 过滤 `allowed_commands`；单元测试 `denied_command_takes_precendence` 与 `remote_context_denied` 固定了 deny 优先和默认 Local origin；
  - `isolation` 与 `tray-icon` 是可选 feature，不是默认桌面路径的前提；同一 crate 含 Android / iOS `cfg`，但移动端工具链与桌面前提不同。
- provenance note：
  - GitHub tag `tauri-v2.11.5` 直接指向 commit `7cd71369c00978a3783b6ae3e9972358abbe4ae6`；crates.io `tauri` 最新稳定版同为 `2.11.5`（2026-07-01）；
  - 同一提交里 `packages/api/package.json` 报 `@tauri-apps/api@2.11.1`，与 npm latest `2.11.1` 一致；crate 与 JS API 版本号不同，这是 monorepo 分开发布，不是冲突；
  - npm 包无 `gitHead`；本文绑定 `tauri-v2.11.5` 对应 commit，并同时记录同树 JS API 版本。
