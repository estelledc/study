# Task runner source review

> 用途：记录 concurrently、npm-run-all 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- evidence：GitHub metadata、npm package metadata、固定提交静态源码与测试阅读
- not executed：未安装两仓依赖，未运行上游 test、真实并行进程、bundle 或性能 benchmark
- worktrees：本机 `/tmp/study-upstream/`，不进入 Git

## concurrently

- canonical source：`https://github.com/open-cli-tools/concurrently`
- revision：`1b8cbeba87497e0c2a29097c828276919935a217`
- package：`concurrently@10.0.5`
- inspected：
  - `package.json`
  - `lib/index.ts`
  - `lib/concurrently.ts`
  - `lib/defaults.ts`
  - `lib/completion-listener.ts`
  - `lib/command.ts`
  - `lib/spawn.ts`
  - `lib/command-parser/expand-shortcut.ts`
  - `lib/command-parser/expand-wildcard.ts`
  - `lib/flow-control/kill-others.ts`
  - `lib/flow-control/restart-process.ts`
  - `bin/index.ts`
  - `bin/normalize-cli-command.ts`
  - `docs/cli/success.md`
- observed：
  - published package is ESM-only, engines `node >= 22`, CLI bins `concurrently` / `conc`, programmatic export from `dist/lib/index.js`;
  - core `concurrently()` parses shortcuts and wildcards, wraps each command in RxJS subjects, then applies a fixed flow-controller chain;
  - default success condition is `all`; `first` / `last` are evaluated after close events are sorted by `endDate`, not declaration order;
  - `--kill-others` maps to `['success', 'failure']`, `--kill-others-on-fail` maps to `['failure']`; kill uses `tree-kill` and optional timeout SIGKILL;
  - restart defaults to zero tries; a negative try count becomes `Infinity`, and `restart-after=exponential` waits `2 ** index * 1000` ms;
  - wildcard expansion only rewrites `npm|yarn|pnpm|bun run`, `node --run` and `deno task` globs against local `package.json` / Deno task files;
  - shell resolution is explicit `--shell`, then `npm_config_script_shell`, then `cmd.exe` / `/bin/sh`;
  - GitHub tag `v10.0.5` matches this revision and `package.json` version `10.0.5`; npm latest `10.0.5` omits `gitHead`.

## npm-run-all

- canonical source：`https://github.com/mysticatea/npm-run-all`
- revision：`df1511851a2b5e8a406e4a2622829b360f671afc`
- package：`npm-run-all@4.1.5`
- inspected：
  - `package.json`
  - `lib/index.js`
  - `lib/match-tasks.js`
  - `lib/run-tasks.js`
  - `lib/run-task.js`
  - `lib/spawn.js`
  - `lib/spawn-posix.js`
  - `bin/common/parse-cli-args.js`
  - `bin/npm-run-all/main.js`
  - `bin/run-p/main.js`
  - `bin/run-s/main.js`
- observed：
  - CJS package, engines `node >= 4`, bins `npm-run-all`, `run-s` and `run-p`;
  - the library default is sequential (`parallel=false`, `maxParallel=1`); `run-p` starts a single parallel group, `run-s` a single sequential group;
  - `npm-run-all` may mix `--parallel` / `--sequential` groups, but groups themselves always run one after another;
  - patterns match `package.json` script names via minimatch after swapping `:` and `/`; unknown names throw, except built-in `restart` and `env`;
  - each matched name is spawned as `npm run <script>` (or `node <npm_execpath> run` when the npm path is a JS file); Yarn only forwards `--silent` from prefix options;
  - first non-zero exit aborts remaining tasks unless `--continue-on-error`; `--race` and `--aggregate-output` are rejected unless parallel;
  - POSIX `kill()` uses `pidtree` to signal the process tree; `abort()` on the task promise calls that `kill`;
  - GitHub tag `v4.1.5` and npm `gitHead` both identify this revision;
  - upstream last tagged release remains 4.1.5; the living maintenance fork is `bcomnes/npm-run-all2` / `npm-run-all2@9.0.3`, which this note does not bind.
