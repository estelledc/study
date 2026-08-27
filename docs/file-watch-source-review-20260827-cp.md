# File-watch source review (writer CP)

> 用途：记录 nodemon 与 chokidar 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL writer CP
- evidence：GitHub metadata、npm 元数据、固定提交静态源码阅读
- not executed：未安装两仓依赖，未运行上游 test，未实际监听文件系统，未测量 CPU / 句柄 / bundle
- worktrees：本机 `research-worktrees/`，不进入 Git

## nodemon

- canonical source：`https://github.com/remy/nodemon`
- revision：`cfebe2feb2054a13fa6b9c493c1cd826ffccf167`
- package：`nodemon@3.1.14`
- provenance：
  - npm `latest` / `gitHead` 均为 `cfebe2fe...`
  - GitHub lightweight tag `v3.1.14` 指向同一提交
  - 仓库 `package.json` 的 `version` 是 `0.0.0-development`（semantic-release）；对外版本以 npm / tag 为准
- inspected：
  - `package.json`
  - `bin/nodemon.js`
  - `lib/nodemon.js`
  - `lib/config/defaults.js`
  - `lib/config/load.js`
  - `lib/config/exec.js`
  - `lib/monitor/watch.js`
  - `lib/monitor/run.js`
  - `lib/monitor/match.js`
  - `lib/utils/merge.js`
  - `index.d.ts`
  - `doc/arch.md`
- observed：
  - CLI 入口解析 argv 后调用可编程 `nodemon(options)`；监听层固定依赖 `chokidar@^3.5.2`，不是本轮审查的 chokidar 5；
  - 配置顺序是 home `nodemon.json` → cwd `nodemon.json` → CLI；`merge(source, target)` 保留 source 已有键，只补缺失值，因此 CLI 覆盖文件；
  - 默认 `restartable` 是 `rs`，默认 `signal` 是 `SIGUSR2`，默认 `watch` 是 `['*.*']`，`stdin` 默认打开；
  - `chokidar.watch(dirs)` 监听 `change` / `unlink`，以及 ready 之后的 `add`；Windows 设 `disableGlobbing`，IBM i 强制 `usePolling`；
  - 满足 `executable === 'node'` 且无 `spawn` / `inspect` / node flag / `.bin` 包装时走 `fork`，否则 `sh -c` 或 Windows `cmd /d /s /c`；
  - 退出码 0 会等待下次变更；`exitCrash` 才会在 crash 时退出；启动 500ms 内的 code 2 会停掉 monitor。

## chokidar

- canonical source：`https://github.com/paulmillr/chokidar`
- revision：`c0c8d20e49d337491891078d1081bf91bd178de6`
- package：`chokidar@5.0.0`
- provenance：
  - npm `latest` / `gitHead` 均为 `c0c8d20e...`
  - GitHub annotated tag `5.0.0` 剥开后指向同一提交
- inspected：
  - `package.json`
  - `README.md`
  - `src/index.ts`
  - `src/handler.ts`
  - `src/index.test.ts`
- observed：
  - 固定 5.0.0 是 ESM-only，`engines.node` 为 `>= 20.19.0`，运行时依赖只有 `readdirp`；
  - `watch(paths, options)` 构造 `FSWatcher` 再 `add(paths)`；事件为 `add` / `addDir` / `change` / `unlink` / `unlinkDir` / `all` / `ready` / `raw` / `error`；
  - 默认 `fs.watch`；`usePolling` 或 IBM i 改走 `fs.watchFile`；`CHOKIDAR_USEPOLLING` / `CHOKIDAR_INTERVAL` 可覆盖；
  - `ignored` 的字符串匹配是精确相等，不是 glob；函数、RegExp 与 `{ path, recursive }` 另有合同；
  - `atomic` 在非 polling 时默认开启，unlink 延迟 100ms，窗口内再 add 会变成 `change`；
  - `awaitWriteFinish` 默认关闭；设为 true 时默认 `stabilityThreshold` 2000ms、`pollInterval` 100ms；
  - `close()` 返回 Promise；同一路径的 `fs.watch` / `fs.watchFile` 实例可跨 `FSWatcher` 共享。
