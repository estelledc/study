# argv parser source review (writer FI)

> 用途：记录 `cac` 与 `citty` 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。后缀 `-fi` 标记 2026-08-27 平行 writer FI，避免与同日其他审查文档撞名。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL writer FI
- target：`cac`、`citty`（仓库原无这两页，本轮新建 study-v2；未改 `commander` / `yargs` 正文）
- evidence：GitHub metadata、npm package metadata、固定提交静态源码与测试阅读
- evidence type：STATIC_REVIEW / `STATIC_ANALYSIS`；验证状态保持 `UNVERIFIED`
- not executed：未安装两仓依赖，未运行上游 test、CLI、bundle 或性能 benchmark
- worktrees：本机 `research-worktrees/`（gitignored），不进入 Git

## cac

- canonical source：`https://github.com/cacjs/cac`
- tag：`v7.0.0`（lightweight tag）
- revision：`77f602fcb2d1e75d24f5ecd94d5bf667acaa857a`
- package：`cac@7.0.0`（MIT，ESM，`engines.node >= 20.19.0`）
- npm：`cac@7.0.0` latest，无 `gitHead`；身份以 Git tag + package 版本为准
- also observed：JSR `@cac/cac`；源码 `import mri from 'mri'`，但 published `package.json` 无 production dependency（`mri` 列在 devDependencies，预期由 tsdown 打进 `dist`）
- inspected：
  - `package.json`
  - `README.md`
  - `src/index.ts`
  - `src/cac.ts`
  - `src/command.ts`
  - `src/option.ts`
  - `src/runtime.ts`
  - `src/utils.ts`
  - `examples/basic-usage.ts`
  - `examples/default-command.ts`
  - `examples/sub-command.ts`
- observed：
  - `cac(name)` 返回 `new CAC(name)`；`CAC` 继承 `EventTarget`，不是 EventEmitter；
  - `parse(argv?)` 默认取 `process.argv`，从 index 2 切开；无 argv 且无 runtime process 则抛错；
  - 匹配顺序：具名/别名子命令 → 默认命令（`name === ''` 或 alias `'!'`）→ 只解析全局；
  - 选项经 `mri` 后 camelCase；`.` 分段走 `setDotProp`；`--` 之后进入 `options['--']`；
  - `--no-foo` 在构造期把 `config` 默认设为 `true`（当 default 为 nullish）；
  - `runMatchedCommand` 才做 unknown / required option / required args / unused args 校验；无 action 则不校验；
  - `--help` 在 `showHelpOnExit` 时打印并 `unsetMatchedCommand`；`--version` 仅当 `matchedCommandName == null`；
  - 事件是 `CustomEvent`：`command:${name}`、`command:!`、`command:*`。

## citty

- canonical source：`https://github.com/unjs/citty`
- tag：`v0.2.2`
- revision：`9cb0edcc55c133ea04d3cbb350284a9a3548946e`
- package：`citty@0.2.2`（MIT，ESM，`sideEffects: false`）
- npm：`citty@0.2.2` latest，`gitHead` 与 tag 一致
- also observed：源码使用 `scule` 与 `node:util.parseArgs`；published `package.json` 无 production dependency
- inspected：
  - `package.json`
  - `README.md`
  - `src/index.ts`
  - `src/types.ts`
  - `src/command.ts`
  - `src/main.ts`
  - `src/args.ts`
  - `src/_parser.ts`
  - `src/plugin.ts`
  - `src/usage.ts`
  - `src/_utils.ts`
  - `playground/cli.ts`
  - `test/main.test.ts`
  - `test/plugin.test.ts`
- observed：
  - `defineCommand` 是类型助手，原样返回定义对象；
  - `meta` / `args` / `subCommands` / `plugins` / `default` 均为 `Resolvable`（值、Promise 或 thunk）；
  - `runCommand` 顺序：plugin setup → `cmd.setup` → 子命令分发或 `cmd.run` → `cmd.cleanup` → plugin cleanup（逆序）；cleanup 在 run 抛错后仍执行；
  - 父命令的 setup/plugin 会在子命令之前运行；同一命令不能同时有 `run` 与 `default`；
  - 无显式子命令时，`default` 把**整份** `rawArgs` 交给默认子命令（因此 `--verbose` 可落到默认命令）；
  - 解析走自研 `_parser` 包一层 `node:util.parseArgs`；`--no-` 预处理为 false；位置参数按声明顺序从 `_` 取出；
  - 返回的 parsed args 是 Proxy，camelCase / kebab-case 互访；
  - `runMain` 默认 `process.argv.slice(2)`；`--help`/`-h`、`--version`/`-v` 可被用户同名 arg/alias 挤掉；version 只在 `rawArgs.length === 1` 时触发；
  - `CLIError` 先打印 usage 再 `process.exit(1)`；其它错误只 `console.error`。
