# JS git library source review (writer GG)

> 用途：记录 `isomorphic-git` 与 `simple-git` 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。后缀 `-gg` 标记 2026-08-27 平行 writer GG，避免与同日其他审查文档撞名。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL writer GG
- evidence：GitHub metadata、npm provenance 与固定提交静态源码阅读
- not executed：未安装两仓依赖，未 spawn 系统 git，未连接远程，未跑上游 Jest / browser CI，未测 bundle / CORS / 性能
- worktrees：本机 `research-worktrees/isomorphic-git` 与 `research-worktrees/git-js`（gitignored），不进入 Git
- slugs：新建 `isomorphic-git` 与 `simple-git`；仓库里原先没有这两页。`simple-git` 的 GitHub 仓名是 `steveukx/git-js`，不是新页面 slug

## isomorphic-git

- canonical source：`https://github.com/isomorphic-git/isomorphic-git`
- tag：`v1.41.9`（lightweight tag）
- revision：`89d641a761b56a492270933608df78edd7c9ee33`
- package：`isomorphic-git@1.41.9`（MIT）
- npm gitHead：与 revision 一致
- also observed：仓内 `package.json` 与 `src/utils/pkg.js` 仍为 `0.0.0-development`；README 支持表仍列 Node 10，`engines.node` 为 `>=14.17`
- inspected：
  - `package.json`
  - `README.md`
  - `src/index.js`
  - `src/api/clone.js`
  - `src/api/version.js`
  - `src/api/statusMatrix.js`
  - `src/commands/clone.js`
  - `src/commands/commit.js`
  - `src/commands/fetch.js`
  - `src/commands/pull.js`
  - `src/commands/merge.js`
  - `src/commands/checkout.js`
  - `src/models/FileSystem.js`
  - `src/managers/GitRemoteManager.js`
  - `src/managers/GitRemoteHTTP.js`
  - `src/http/node/index.js`
  - `src/http/web/index.js`
  - `src/utils/pkg.js`
- observed：
  - 公开 API 是具名函数；调用方必须注入 `fs` 与（远程操作时）`http`；
  - `FileSystem` 优先绑可枚举 `fs.promises`，否则 `pify` 回调 API；
  - `clone` = `_init` + `_addRemote` + 可选 `http.corsProxy` + `_fetch` + `_checkout`；失败 `rmdir(gitdir)`；
  - `_fetch` 发现阶段写死 `protocolVersion: 1`；`listServerRefs` 默认协议 2；
  - remote helper 只有 `http` / `https`；scp / ssh 抛 `UnknownTransportError`；
  - `corsProxify`：代理以 `?` 结尾则拼完整 URL，否则剥 scheme 接路径；
  - Web HTTP `collect(body)`，无浏览器流式上传；Node HTTP 用 `simple-get`；
  - `commit` 从 index 建 tree，空树 `4b825dc642cb6eb9...`；`merge` 要求唯一 merge base，否则 `MergeNotSupportedError`。

## simple-git

- canonical source：`https://github.com/steveukx/git-js`
- tag：`simple-git@3.36.0`
- revision：`01bb7ceae698831e9abd9310f7d61484970ab53c`
- package：`simple-git@3.36.0`（MIT），仓内目录 `simple-git/`
- npm gitHead：与 revision 一致
- companion workspace：同提交 `@simple-git/argv-parser@1.1.0`；GitHub 另有较新 release `@simple-git/argv-parser@1.1.1`，未绑定
- inspected：
  - `simple-git/package.json`
  - `simple-git/readme.md`
  - `simple-git/src/index.js`
  - `simple-git/src/git.js`
  - `simple-git/src/lib/git-factory.ts`
  - `simple-git/src/lib/simple-git-api.ts`
  - `simple-git/src/lib/utils/simple-git-options.ts`
  - `simple-git/src/lib/types/index.ts`
  - `simple-git/src/lib/runners/git-executor.ts`
  - `simple-git/src/lib/runners/git-executor-chain.ts`
  - `simple-git/src/lib/runners/scheduler.ts`
  - `simple-git/src/lib/tasks/commit.ts`
  - `simple-git/src/lib/plugins/block-unsafe-operations-plugin.ts`
  - `simple-git/src/lib/plugins/completion-detection.plugin.ts`
  - `simple-git/src/lib/plugins/timout-plugin.ts`
  - `simple-git/src/lib/plugins/abort-plugin.ts`
  - `simple-git/src/lib/plugins/custom-binary.plugin.ts`
  - `packages/argv-parser/src/vulnerabilities/vulnerability.types.ts`
- observed：
  - 工厂在 `baseDir` 不存在时立刻 `GitConstructError`；
  - 默认 `maxConcurrentProcesses` 是 `5`，不是 README 示例里的 `6`；
  - `_runTask` 返回带 `then`/`catch` 的代理，链式调用共享 `GitExecutorChain`；
  - 跨调用并发由 `Scheduler` 限制；chain fatal 后重置为 `Promise.resolve()`；
  - `commit` 固定前缀 `-c core.abbrev=40`；
  - 默认插件拦截 `--upload-pack` / `ext::` / 自定义 sshCommand、hooksPath 等；
  - completion 默认 `onClose=true`、`onExit=50`；timeout 是 stdio 空闲超时；
  - `binary` 可为 `['wsl','git']`，字符集受限除非 `allowUnsafeCustomBinary`；
  - `silent()` 只入队 deprecation 任务。
