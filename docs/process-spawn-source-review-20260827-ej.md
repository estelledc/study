# Process spawn source review (writer EJ)

> 用途：记录 `execa` 与 `cross-spawn` 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。后缀 `-ej` 标记 2026-08-27 平行 writer EJ，避免与同日其他审查文档撞名。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL writer EJ
- evidence：GitHub metadata、npm package metadata、固定提交静态源码与文档阅读
- evidence type：STATIC_REVIEW / `STATIC_ANALYSIS`；验证状态保持 `UNVERIFIED`
- not executed：未安装两仓依赖，未运行上游 test、未实际 spawn 子进程、未测 Windows、未测 bundle 或性能
- worktrees：本机 `research-worktrees/`（gitignored），不进入 Git
- slugs：本轮新增 `execa` 与 `cross-spawn` 两页；不是既有 legacy 正文改写
- pairing note：固定 `execa@10.0.1` 的 `package.json` 不依赖 `cross-spawn`。二者是互补的 process-spawn 层，不是当前依赖对。

## execa

- canonical source：`https://github.com/sindresorhus/execa`
- tag：`v10.0.1`
- revision：`8017b279e19347efaf2587711c2d57dbd4330740`
- package：`execa@10.0.1`（MIT，`type: module`，`engines.node >= 22`）
- provenance：GitHub tag `v10.0.1` 与 npm `gitHead` 同指此提交
- inspected：
  - `package.json`
  - `index.js`
  - `lib/methods/create.js`
  - `lib/methods/main-async.js`
  - `lib/methods/main-sync.js`
  - `lib/methods/script.js`
  - `lib/methods/node.js`
  - `lib/methods/template.js`
  - `lib/methods/command.js`
  - `lib/arguments/options.js`
  - `lib/arguments/command-file.js`
  - `lib/arguments/shell.js`
  - `lib/return/reject.js`
  - `lib/return/final-error.js`
  - `lib/terminate/kill.js`
  - `lib/terminate/cleanup.js`
  - `lib/pipe/setup.js`
- observed：
  - 公开入口由 `createExeca` 生成：`execa`、`execaSync`、`execaNode`、`$`；另导出 `parseCommandString`、`ExecaError` / `ExecaSyncError` 与 IPC helpers；
  - 异步主链是 `handleAsyncArguments` → `node:child_process.spawn` → 包成 thenable subprocess → `waitForSubprocessResult`；仓库内无 `cross-spawn` 引用；
  - 默认值包括 `preferLocal=false`、`reject=true`、`cleanup=true`、`windowsHide=true`、`encoding=utf8`、`killSignal=SIGTERM`、`forceKillAfterDelay=true`（5s 后 `SIGKILL`）、`killDescendants=false`；
  - `$` 的 deep option 把 `preferLocal` 设为 true；未指定 `input` / `inputFile` / `stdio` 时再补 `stdin: 'inherit'`；
  - `execaNode` / `{node: true}` 强制 `shell: false`，复用当前 `execPath`，并从 `execArgv` 滤掉 `--inspect*`，默认打开 `ipc`；
  - Windows 且非 shell 时，`parseCommandFile` 自己做 PATHEXT / shebang / `cmd.exe /d /s /c` 包装，并拒绝命令与参数中的 CR/LF；
  - `shell: true` 且仍有参数数组时，会先拼成单字符串再交给 Node，避免 Node 24 的 deprecation warning；
  - `reject: true` 时失败结果直接 throw；`signal` 选项已改名为 `cancelSignal`。

## cross-spawn

- canonical source：`https://github.com/moxystudio/node-cross-spawn`
- tag：`v7.0.6`
- revision：`77cd97f3ca7b62c904a63a698fc4a79bf41977d0`
- package：`cross-spawn@7.0.6`（MIT，CJS，`engines.node >= 8`）
- provenance：GitHub tag `v7.0.6` 与 npm `gitHead` 同指此提交
- inspected：
  - `package.json`
  - `index.js`
  - `lib/parse.js`
  - `lib/enoent.js`
  - `lib/util/escape.js`
  - `lib/util/resolveCommand.js`
  - `lib/util/readShebang.js`
  - `README.md`
  - `CHANGELOG.md`
- observed：
  - 公开 API 是 `spawn` / `spawn.sync`，签名对齐 `child_process.spawn` / `spawnSync`；
  - 主链是 `parse` → `cp.spawn` / `spawnSync` → Windows ENOENT 修补；
  - `options.shell` 为真时直接返回未增强的 parsed 对象，不解析 shebang、不改写命令行；
  - Windows 非 shell：用 `which` 解析 PATHEXT，读文件头 150 字节取 shebang，非 `.com`/`.exe` 则改走 `cmd.exe /d /s /c` 并设 `windowsVerbatimArguments`；
  - `node_modules/.bin/*.cmd` 会对元字符做二次 `^` 转义；
  - Windows 上若命令解析失败且退出码为 1，把 `exit` 改写成 `ENOENT` error，避免“命令不存在”表现为普通失败；
  - `escape.argument` 按 qntm.org/cmd 处理反斜杠与引号，并用非回溯正则避免特制输入挂起；7.0.4 关掉回溯，7.0.5 修回转义回归，7.0.6 只同步 lockfile；
  - `resolveCommand` 在自定义 `cwd` 时临时 `chdir`，因为 `which` 不接受 cwd；worker thread 若没有 `process.chdir` 则跳过。
