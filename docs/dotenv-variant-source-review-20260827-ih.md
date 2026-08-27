# Dotenv-variant source review (writer IH)

> 用途：记录 dotenv-flow、dotenv-safe 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：IH
- evidence：GitHub metadata、npm package metadata、固定提交静态源码阅读
- not executed：未安装两仓依赖，未运行上游 test、bundle 或性能 benchmark
- worktrees：本机 `research-worktrees/`，不进入 Git
- not used：`dotenv` 本体、`dotenv-expand`、`rc9`（另有车道或开放 PR）；未写 marked / markdown-it / knex / ioredis / redis / BullMQ

## dotenv-flow

- canonical source：`https://github.com/kerimdzhanov/dotenv-flow`
- revision：`7f07cf32cc28277f04e801982cc2fbddb6b220fa`
- package：`dotenv-flow@4.1.0`
- inspected：
  - `package.json`
  - `README.md`
  - `lib/dotenv-flow.js`
  - `lib/dotenv-flow.d.ts`
  - `lib/env-options.js`
  - `lib/cli-options.js`
  - `config.js`
- observed：
  - GitHub tag `v4.1.0` 与源码仓 `package.json` version 同指该提交；npm `dotenv-flow@4.1.0` 未暴露 `gitHead`；
  - 运行时依赖 `dotenv@^16.0.0`，`engines.node >= 12`，主入口 `lib/dotenv-flow.js`，预加载入口 `dotenv-flow/config`；
  - 默认 pattern `.env[.node_env][.local]` 的 cascade（parse 合并时后写覆盖先写）为 `.env.defaults`（仅默认 pattern）→ `.env` → `.env.local`（`node_env === 'test'` 时跳过）→ `.env.${node_env}` → `.env.${node_env}.local`；
  - `load` 只给 `process.env` 里还不存在的键赋值，shell / 已有环境优先；
  - `getEffectiveNodeEnv` 顺序是 `options.node_env` → `process.env.NODE_ENV` → `options.default_node_env` → `undefined`（无环境模式）；
  - `options.files`（4.1.0）给出显式文件名列表，忽略 `node_env` / `pattern`，缺文件跳过，全部缺失时返回空 `parsed` 而不走 “no .env* files” 错误；
  - `purge_dotenv` 只 unload 工作目录下的 `.env`，且仅当 `process.env` 现值仍等于该文件解析值时才删除；
  - 预加载把 `env_options()` 与 `cli_options()` 展开，后者覆盖前者。
- provenance split：
  - 本页绑定可达源码 tag `v4.1.0` 剥皮提交，不伪造 npm `gitHead`。

## dotenv-safe

- canonical source：`https://github.com/rolodato/dotenv-safe`
- revision：`6c314f973e2213122bfa2eb3a5f0e386390281ff`
- package：`dotenv-safe@9.1.0`
- inspected：
  - `package.json`
  - `README.markdown`
  - `CHANGELOG.markdown`
  - `index.js`
  - `config.js`
  - `MissingEnvVarsError.js`
- observed：
  - 远端没有 `v9.1.0` / `9.1.0` tag；npm `dotenv-safe@9.1.0` 的 `gitHead` 与提交说明 `9.1.0` 同指该提交；
  - `master` 在此提交之后还有 dependabot `braces` 合并，未纳入本页绑定；
  - 自 9.0.0 起 `dotenv` 是 `peerDependencies: >= 8.2.0`，本页不绑定具体 peer 版本；
  - `config` 先 `dotenv.config(options)`，再读 `example`（默认 `.env.example`，别名 `sample`），用 example 键集合对照 `process.env`；
  - 默认 `allowEmptyValues === false` 时先 `compact(process.env)`，空字符串键视为缺失；
  - 缺键抛 `MissingEnvVarsError`，不校验值的格式或真伪；`.env` 里多出来的键不报错；
  - 预加载 `dotenv-safe/config` 在 `DOTENV_CONFIG_ALLOW_EMPTY_VALUES !== 'false'` 时把 `allowEmptyValues` 设为 `true`，与编程默认相反；`DOTENV_CONFIG_EXAMPLE` 可改 example 路径；argv 认 `dotenv_config_*=`。
- provenance split：
  - 本页绑定 npm `gitHead` 可达提交，不绑定无 tag 的 `master` 头，也不绑定 `dotenv` 本体。
