# CLI parser source review

> 用途：记录 commander、yargs 项目页迁移所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL AZ
- evidence：GitHub metadata、npm package metadata、固定提交静态源码与测试/示例阅读
- not executed：未安装两仓依赖，未运行上游 test、未执行示例 CLI、未测量 bundle 或启动耗时
- worktrees：本机 `research-worktrees/`，不进入 Git

## commander

- canonical source：`https://github.com/tj/commander.js`
- revision：`ba6d13ddb4243e5913367734f8c159089ffe7834`
- package：`commander@15.0.0`
- provenance：GitHub tag `v15.0.0` 与 npm `gitHead` 指向同一 commit
- inspected：
  - `package.json`
  - `index.js`
  - `lib/command.js`
  - `lib/option.js`
  - `lib/argument.js`
  - `lib/help.js`
  - `lib/error.js`
  - `docs/parsing-and-hooks.md`
  - `docs/options-in-depth.md`
  - `examples/hook.js`
  - `examples/options-env.js`
- observed：
  - package is ESM-only (`"type": "module"`) with Node `>=22.12.0` and no production dependencies;
  - `command()` returns the child `Command` for action-handler registration, or `this` when the second argument is an executable description;
  - `parse()` calls `_parseCommand` without awaiting; `parseAsync()` awaits the same path so async actions and hooks can reject;
  - each command parses recognised options, then env and implied values, before `preSubcommand` dispatch or leaf `preAction` / action / `postAction`;
  - short-flag groups such as `-abc` are consumed one flag at a time; a required or optional value option takes the remainder of the same token;
  - `Option.env()` and `exitOverride()` are first-class APIs; help is generated from the command tree, but completion, config-file loading and i18n are not built in.

## yargs

- canonical source：`https://github.com/yargs/yargs`
- revision：`8878a894111e3fe7c98d84af546c0f34fa017492`
- package：`yargs@18.1.0`
- provenance：GitHub tag `v18.1.0` 与 npm `gitHead` 指向同一 commit
- inspected：
  - `package.json`
  - `index.mjs`
  - `helpers/helpers.mjs`
  - `lib/yargs-factory.ts`
  - `lib/command.ts`
  - `lib/middleware.ts`
  - `lib/validation.ts`
  - `lib/usage.ts`
  - `lib/completion.ts`
  - `lib/utils/process-argv.ts`
  - `lib/utils/apply-extends.ts`
- observed：
  - package is ESM-only (`"type": "module"`) with Node `^20.19.0 || ^22.12.0 || >=23`;
  - runtime depends on `yargs-parser`, `cliui`, `y18n`, `escalade`, `get-caller-file` and `string-width`;
  - `YargsFactory` constructs an instance and immediately enables `.help()` and `.version()`;
  - `hideBin` slices after the binary index and treats bundled Electron apps differently from `process.argv.slice(2)`;
  - command dispatch resets local parser state, runs the builder, then parses again and applies middleware / validation / handler;
  - a sync builder mutates the reset instance and its return value is ignored; an async builder may replace `innerYargs` only when it resolves to a `YargsInstance`;
  - `parse-positional-numbers` defaults to on, so positional tokens may be coerced to numbers after the first parse;
  - config, env prefix, locale and Bash/Zsh completion are first-class, unlike commander 15.
