# User-path source review (writer FO)

> 用途：记录 `env-paths` 与 `xdg-basedir` 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。后缀 `-fo` 标记 2026-08-27 平行 writer FO。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL writer FO
- evidence：GitHub metadata、npm package metadata、固定提交静态源码与测试阅读
- evidence type：STATIC_REVIEW / `STATIC_ANALYSIS`；验证状态保持 `UNVERIFIED`
- not executed：未安装两仓依赖，未运行上游 test / tsd / xo，未创建目录，未测 Windows / macOS 实机路径
- worktrees：本机 `research-worktrees/`（gitignored），不进入 Git
- slugs：本轮新增 `env-paths` 与 `xdg-basedir`；未改其他用户路径或 CLI leftover 页

## env-paths

- canonical source：`https://github.com/sindresorhus/env-paths`
- tag：`v4.0.0`
- revision：`c3c0dd464c268a99a28feeaec54c54d0a12c4291`
- package：`env-paths@4.0.0`（MIT，ESM，`engines.node >= 20`）
- provenance：Git tag、npm `gitHead` 与 `package.json` 版本指向同一提交
- dependency observed, not bound：`is-safe-filename@^0.1.0`
- inspected：
  - `package.json`
  - `index.js`
  - `index.d.ts`
  - `index.test-d.ts`
  - `test.js`
  - `readme.md`
- observed：
  - 默认导出 `envPaths(name, {suffix = 'nodejs'} = {})`，只拼路径字符串，不 `mkdir`；
  - `assertSafeFilename(name)` 后拼接 suffix，再对拼接结果断言一次；空 suffix 关闭后缀；
  - `process.platform === 'darwin'` → macOS Library 约定；`win32` → APPDATA / LOCALAPPDATA；其余平台走 XDG 回退；
  - Windows 的 data/config/cache/log 子目录名是作者补的，源码注释写明 Windows 本身没有这套分工；
  - Linux `log` 用 `XDG_STATE_HOME` 或 `~/.local/state`，不是 `XDG_DATA_HOME`；
  - Linux `temp` 是 `os.tmpdir() / basename(homedir) / name`；
  - `os.homedir()` / `os.tmpdir()` 在模块加载时捕获；
  - 测试覆盖默认 suffix、自定义 suffix、空 suffix、非法 name/suffix，以及 Linux 下改写 `XDG_*`。

## xdg-basedir

- canonical source：`https://github.com/sindresorhus/xdg-basedir`
- tag：`v5.1.0`
- revision：`8cceade858e4da18cb971bf1844f086e9e213563`
- package：`xdg-basedir@5.1.0`（MIT，ESM，`engines.node >= 12`）
- provenance：Git tag、npm `gitHead` 与 `package.json` 版本指向同一提交
- inspected：
  - `package.json`
  - `index.js`
  - `index.d.ts`
  - `index.test-d.ts`
  - `test.js`
  - `readme.md`
- observed：
  - 命名导出在 import 时求值，不是按应用名调用的函数；不拼接 app 子目录；
  - `xdgData` / `xdgConfig` / `xdgState` / `xdgCache` 优先读对应环境变量，否则用 `os.homedir()` 拼默认；两边都没有则是 `undefined`；
  - `xdgRuntime` 只读 `XDG_RUNTIME_DIR`，没有 home 回退；
  - `xdgDataDirectories` 默认 `/usr/local/share/:/usr/share/`，再把 `xdgData` unshift 到前面；
  - `xdgConfigDirectories` 默认 `/etc/xdg`，再把 `xdgConfig` unshift 到前面；
  - 类型把单路径标成 `string | undefined`，搜索列表标成 `readonly string[]`；
  - `test.js` 因 `import-fresh` 不支持 ESM 被收成 `t.pass()` 占位，行为测试被注释；
  - README 写明面向 Linux，macOS / Windows 应走平台约定，并指向 `env-paths`。
