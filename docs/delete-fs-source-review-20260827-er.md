# rimraf + del source review (writer ER)

> 用途：记录 `rimraf` 与 `del` 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。后缀 `-er` 标记 2026-08-27 平行 writer ER，避免与同日其他审查文档撞名。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL writer ER
- evidence：GitHub metadata、npm provenance 与固定提交静态源码 / 测试阅读
- not executed：未安装两仓依赖，未调用 `rimraf` / `del` 删除真实文件，未运行 tap / ava / tsd，未测 bundle 或吞吐
- worktrees：本机 `research-worktrees/rimraf` 与 `research-worktrees/del`（gitignored），不进入 Git
- slugs：`rimraf` 与 `del`；`del-cli` 是独立包，不是本页

## rimraf

- canonical source：`https://github.com/isaacs/rimraf`
- tag：`v6.1.3`（与 npm `rimraf@6.1.3` `gitHead` 同指）
- revision：`f738c781d14fa7bc06f8e39e062d78f701fde3f1`
- license：BlueOak-1.0.0
- engines：`node: "20 || >=22"`
- dependencies：`glob@^13.0.3`、`package-json-from-dist@^1.0.1`
- inspected：
  - `package.json`
  - `README.md`
  - `src/index.ts`
  - `src/bin.mts`
  - `src/opt-arg.ts`
  - `src/path-arg.ts`
  - `src/use-native.ts`
  - `src/rimraf-native.ts`
  - `src/rimraf-manual.ts`
  - `src/rimraf-posix.ts`
  - `src/rimraf-windows.ts`
  - `src/rimraf-move-remove.ts`
  - `src/retry-busy.ts`
  - `src/default-tmp.ts`
  - `src/ignore-enoent.ts`
  - `src/fix-eperm.ts`
- observed：
  - 无 default export；主入口是 named `rimraf` / `rimrafSync`，并挂 `native` / `manual` / `posix` / `windows` / `moveRemove`；
  - `useNative` 在 Node `<14.14`、`win32`、或传入 `signal` / `filter` 时为 false，否则走 `fs.rm({force, recursive})`；
  - `pathArg` 会 `resolve`，拒绝 `\0`，默认拒绝删根（`ERR_PRESERVE_ROOT`）；
  - glob 默认关闭；打开后强制 `absolute: true`；
  - POSIX 实现先 `lstat`，目录并行递归后再 `rmdir`，文件 `unlink`，忽略 ENOENT；
  - Windows 先删非目录、再扫目录，`ENOTEMPTY` 回退 move-remove；`EBUSY`/`EMFILE`/`ENFILE` 指数退避（默认 backoff 1.2、maxBackoff 200ms、maxRetries 10）；
  - CLI 默认 `--preserve-root`、`--no-glob`；`-rf`/`-fr` 是空操作；`--impl=native` 与 `-v`/`-i` 互斥。

## del

- canonical source：`https://github.com/sindresorhus/del`
- tag：`v8.0.1`（与 npm `del@8.0.1` `gitHead` 同指）
- revision：`f9412a3d60895a3ce3d5d62ba323112cec291838`
- license：MIT
- engines：`node: ">=18"`
- dependencies：`globby`、`is-glob`、`is-path-cwd`、`is-path-inside`、`p-map`、`presentable-error`、`slash`；**不依赖 rimraf**
- inspected：
  - `package.json`
  - `readme.md`
  - `index.js`
  - `index.d.ts`
  - `test.js`
- observed：
  - ESM named export：`deleteAsync` / `deleteSync`，无 default export，无 bin；
  - 先 `globby` 再删；默认覆盖 globby 的 `expandDirectories` / `onlyFiles` / `followSymbolicLinks` 为 false；
  - 删除前按 `b.localeCompare(a)` 倒序，返回前再正序；
  - 未设 `force` 时，`is-path-cwd` 拒绝删当前工作目录，`is-path-inside` 拒绝删 cwd 外路径，错误类型是 `PresentableError`；
  - 实际删除走 `fsPromises.rm` / `fs.rmSync`，选项 `{recursive: true, force: true}`；
  - `dryRun` 只返回将删路径；`onProgress` 只在 async 路径；
  - Windows 上非 glob 路径会先 `slash()`；显式 `.` 段能匹配点文件，否则默认不匹配。
