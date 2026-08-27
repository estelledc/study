# fast-glob + globby source review (writer EK)

> 用途：记录 `fast-glob` 与 `globby` 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。后缀 `-ek` 标记 2026-08-27 平行 writer EK，避免与同日其他审查文档撞名。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL writer EK
- evidence：GitHub metadata、npm package metadata、固定提交静态源码与类型声明阅读
- evidence type：STATIC_REVIEW / `STATIC_ANALYSIS`；验证状态保持 `UNVERIFIED`
- not executed：未安装两仓依赖，未运行上游 test / e2e / bench，未遍历真实目录，未测 bundle 或性能
- worktrees：本机 `research-worktrees/fast-glob` 与 `research-worktrees/globby`，不进入 Git
- slugs：新建 `fast-glob` 与 `globby`；仓库里原先没有这两页

## fast-glob

- canonical source：`https://github.com/mrmlnc/fast-glob`
- tag：`3.3.3`（lightweight tag，直接指向该提交）
- revision：`48687898dd26d4e935a0e5ecf6720e7c5aeac15d`
- package：`fast-glob@3.3.3`（MIT）；npm `gitHead` 与 tag 一致
- engines：`node >=8.6.0`；入口是 CommonJS `out/index.js`（源码 `export = FastGlob`）
- inspected：
  - `package.json`
  - `README.md`
  - `src/index.ts`
  - `src/settings.ts`
  - `src/managers/tasks.ts`
  - `src/providers/provider.ts`
  - `src/providers/async.ts`
  - `src/providers/sync.ts`
  - `src/providers/stream.ts`
  - `src/providers/filters/entry.ts`
  - `src/providers/filters/deep.ts`
  - `src/providers/filters/error.ts`
  - `src/providers/transformers/entry.ts`
  - `src/readers/reader.ts`
  - `src/readers/async.ts`
  - `src/utils/pattern.ts`
- observed：
  - 默认导出是异步 `FastGlob`；命名空间同时挂 `glob` / `async` / `sync` / `stream` / `generateTasks` / `isDynamicPattern` / `escapePath` / `convertPathToPattern` 以及 `posix` / `win32` 路径转义；
  - 主链是 `assertPatternsInput` → `Settings` → `taskManager.generate` → `Provider.read`；空字符串或非字符串会抛 `TypeError`；
  - 默认 `onlyFiles=true`、`unique=true`、`followSymbolicLinks=true`、`braceExpansion=true`、`extglob=true`、`globstar=true`、`caseSensitiveMatch=true`、`dot=false`、`deep=Infinity`、`concurrency=max(os.cpus().length,1)`、`suppressErrors=false`；`onlyDirectories` 会关掉 `onlyFiles`，`stats` 会打开 `objectMode`；
  - 任务按 `glob-parent` 的 base 分组；当前目录里只要有一条 pattern 的 base 是 `.`，就合并成一条全局任务；
  - 动态 pattern 走 `@nodelib/fs.walk`；静态 pattern 走 stream reader 再收集；匹配用 `micromatch.makeRe`；
  - 否定 pattern 是 `startsWith('!') && pattern[1] !== '('`，所以 `!(a|b)` 仍是 extglob，不是 ignore；
  - 默认只吞 `ENOENT`；`suppressErrors` 才吞其余错误；
  - stream 无论任务数都用 `merge2` 多路复用，源码注释写明这是为了 async iterator、大约多 25% 成本；
  - README 写结果顺序任意；本文未跑 benchmark，不把“最快”写成证据。
- provenance：
  - Git tag `3.3.3` 与 npm `fast-glob@3.3.3` `gitHead` 都指向 `48687898...`。

## globby

- canonical source：`https://github.com/sindresorhus/globby`
- tag：annotated `v16.2.4` 解引用到该提交
- revision：`46cf13ff8bf5f0e0db96c4985faf83a59d194777`
- package：`globby@16.2.4`（MIT）；npm `gitHead` 与 peel 后的 tag 一致
- engines：`node >=20`；ESM，`exports.default` 指向 `index.js`
- runtime dependency：`fast-glob@^3.3.3`（与本页绑定的 fast-glob 主版本一致）
- inspected：
  - `package.json`
  - `readme.md`
  - `index.js`
  - `index.d.ts`
  - `ignore.js`
  - `utilities.js`
- observed：
  - 命名导出 `globby` / `globbySync` / `globbyStream` / `generateGlobTasks` / `isDynamicPattern` / `convertPathToPattern`（后者直接再导出 fast-glob）以及 `isGitIgnored` / `isIgnoredByIgnoreFiles` 两对 sync/async；
  - 先 `toPatternsArray`（去重）和 `normalizeOptions`（`expandDirectories` 默认 true，`cwd` 经 `unicorn-magic/node` 的 `toPath`），再读 ignore 文件、生成 task、交给 fast-glob；
  - `gitignore` 默认 false；打开后搜 `**/.gitignore`，若发现 `.git` 还会向上读到仓库根；`ignoreFiles` 是更泛的同类语法；
  - ignore 的权威过滤器是 predicate；只有“否定规则救不回来”的目录才会被译成 fast-glob `ignore` 做 prune；
  - 全是否定 pattern 时，默认预置 `**/*`（`expandNegationOnlyPatterns` 默认 true）；设 false 则返回空任务；
  - utilities 的 `isNegativePattern` 只看首字符 `!`，因此 `!(a|b)` 在 globby 任务切分里会当否定，和 fast-glob 自己的 extglob 判定不同；
  - 目录展开：真实目录变成 `dir/**`；`**/dirname` 且 dirname 无通配、无扩展名时也会展开，不必先 stat；
  - `globalGitignore` 只读用户级 Git config（`GIT_CONFIG_GLOBAL` / XDG / `~/.gitconfig`），不读仓库 `.git/config` 或系统 config；
  - stream 返回 Node `Readable`，注释写明尚未切 Web Stream；
  - Windows 反斜杠 pattern 会静默空匹配，文档要求 `path.posix.join` 或 `convertPathToPattern`。
- provenance：
  - annotated tag `v16.2.4` 的 peel 与 npm `globby@16.2.4` `gitHead` 都指向 `46cf13ff...`。
