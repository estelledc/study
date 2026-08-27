# Env-config source review (writer BU)

> 用途：记录 dotenv、envalid 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL BU
- evidence：固定提交静态源码与测试阅读
- not executed：未安装两仓依赖，未运行上游 test、bundle、decrypt 或生产环境注入
- worktrees：本机 `research-worktrees/`，不进入 Git

## dotenv

- canonical source：`https://github.com/motdotla/dotenv`
- revision：`f116f70310abab44fbfddbaeb833698b5bf84a9b`
- package：`dotenv@17.4.2`
- tag object：annotated `v17.4.2` → commit above
- inspected：
  - `package.json`
  - `lib/main.js`
  - `lib/main.d.ts`
  - `lib/env-options.js`
  - `lib/cli-options.js`
  - `config.js`
  - `tests/test-parse.js`
  - `tests/test-populate.js`
  - `CHANGELOG.md`
- observed：
  - public API is `parse` / `populate` / `config` / `configDotenv` / `decrypt`;
  - `config()` chooses vault decrypt only when a non-empty `DOTENV_KEY` and a reachable `.env.vault` exist, otherwise it falls back to plaintext `.env`;
  - `populate()` writes missing keys by default and overwrites only when `override: true`;
  - parse expands `\n` / `\r` only inside double quotes;
  - v17 programmatic `config()` logs an injected-key count unless `quiet` is true;
  - preload `dotenv/config` reads `DOTENV_CONFIG_*` env and `dotenv_config_*` argv, and CLI matching defaults `quiet` to `'true'`;
  - `engines.node` is `>=12`; vault decrypt uses `aes-256-gcm`.

## envalid

- canonical source：`https://github.com/af/envalid`
- revision：`784385fcf209ed6f9afde068689afc90773636a3`
- package：`envalid@8.2.0`
- tag object：annotated `v8.2.0` → commit above
- inspected：
  - `package.json`
  - `src/index.ts`
  - `src/envalid.ts`
  - `src/core.ts`
  - `src/validators.ts`
  - `src/makers.ts`
  - `src/middleware.ts`
  - `src/reporter.ts`
  - `src/types.ts`
  - `src/errors.ts`
  - `tests/basics.test.ts`
  - `tests/requiredWhen.test.ts`
- observed：
  - `cleanEnv` sanitizes only declared specs, then freezes default middleware output;
  - missing values use `testDefault` / `devDefault` / `default` without passing the fallback through `_parse`;
  - `devDefault` applies only when `NODE_ENV` is set and is not `'production'`;
  - `requiredWhen` runs after the first pass and can add `EnvMissingError`;
  - default reporter calls `process.exit(1)` in Node; `reporter: null` rethrows immediately;
  - default middleware adds `isDev` / `isProd` / `isTest` accessors and a proxy that rejects unknown access and mutation;
  - unset `NODE_ENV` makes `isProduction` true;
  - `engines.node` is `>=18` with `engineStrict: true`; the package does not load `.env` files.
