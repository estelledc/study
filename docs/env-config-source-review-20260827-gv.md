# Env-config source review GV

> 用途：记录 rc9、dotenv-expand 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL writer GV
- evidence：GitHub metadata、npm package metadata、固定提交静态源码与测试阅读
- evidence type：STATIC_REVIEW / `STATIC_ANALYSIS`；验证状态保持 `UNVERIFIED`
- not executed：未安装两仓依赖，未运行上游 test、CLI、command substitution、解密或性能 benchmark
- worktrees：本机 `research-worktrees/`，不进入 Git
- excluded slugs：未改 `yargs`、`sops`、`vault`、`mise`、`volta`，也未新增 `dotenv` 或 `c12` 页面

## rc9

- canonical source：`https://github.com/unjs/rc9`
- revision：`3df7dc63d21034f739fb13066546d4a6c44950c7`
- package：`rc9@3.0.1`
- tag：`v3.0.1`（annotated tag 剥皮后即此提交）
- provenance：GitHub tag、npm `gitHead` 与 `package.json` 版本三方一致
- inspected：
  - `package.json`
  - `src/index.ts`
  - `test/index.test.ts`
  - `README.md`
  - `CHANGELOG.md`
- observed：
  - 默认 `name` 是 `.conf`，`dir` 是 `process.cwd()`，`flat` 为 false；`options` 可以是字符串文件名；
  - `parse` 按行匹配 `key=value`，用 `destr` 转本地类型，`key[]` 向数组 push；`__proto__` / `constructor` 直接跳过；
  - 默认会 `unflatten`，点号 key 变成嵌套对象；`flat: true` 时保持扁平；
  - 缺文件时 `parseFile` / `read` 返回 `{}`，不抛错；
  - `serialize` 先 `flatten` 再 `JSON.stringify` 每个值；
  - `update` 先按需 unflatten 入参，再 `defu(config, read())` 后写回，新值覆盖文件旧值；
  - `readUser` / `writeUser` / `updateUser` 已弃用，目录是 `$XDG_CONFIG_HOME` 或 `homedir()`；
  - `readUserConfig` / `writeUserConfig` / `updateUserConfig` 目录是 `$XDG_CONFIG_HOME` 或 `~/.config`；
  - 3.0.0 起 ESM-only；运行时依赖是 `defu` 与 `destr`，`flat` 只出现在 devDependencies，由构建打进 dist。

## dotenv-expand

- canonical source：`https://github.com/dotenvx/dotenv-expand`
- revision：`0d8c9260deaa14bdff175c5da13ac6cc197c4ac2`
- package：`dotenv-expand@1000.0.0`
- tag：`v1000.0.0`（annotated tag 剥皮后即此提交）
- provenance：GitHub tag、npm `gitHead` 与 `package.json` 版本三方一致；canonical remote 已从 `motdotla/dotenv-expand` 迁到 `dotenvx/dotenv-expand`
- inspected：
  - `package.json`
  - `lib/main.js`
  - `lib/main.d.ts`
  - `config.js`
  - `tests/main.js`
  - `tests/.env.test`
  - `README.md`
  - `CHANGELOG.md`
- observed：
  - `expand()` 不读磁盘；它吃 dotenv 的 `{ parsed, processEnv? }`，再把结果写回 `parsed` 与目标 env 对象；
  - 目标 env 默认 `process.env`；传入 `processEnv` 时只写那个对象；
  - 若目标 env 里已有同名且与文件字面值不同的值，直接采用，不再 expand / evaluate / decrypt；
  - 否则先按 `DOTENV_PRIVATE_KEY` 与 `encrypted()` 决定是否 `decrypt`，再 `expand`，再 `evaluate`，最后把 `\$` 还原成 `$`；
  - 展开、命令替换和解密实现来自 devDependency `@dotenvx/primitives@2.1.1`，发布时 esbuild bundle，本轮未打开该包源码；
  - 测试合同覆盖 `${VAR}` / `$VAR`、`${VAR:-default}` / `${VAR-default}`、`${VAR:+alt}` / `${VAR+alt}`、自引用、`$(command)` 与 `encrypted:`；
  - 反向依赖会得到空串：`BACKEND=...${HOST}` 写在 `HOST` / `PORT` 之前时，测试期望 `HOST` 变成 `http://localhost:`；
  - `dotenv-expand/config` 预加载入口在源码里 `require('dotenv')`；发布产物把 dotenv 打进 `dist/config.js`，README 写明不必再单独装 dotenv；
  - `engines.node` 为 `>=16`；许可证在 1000.0.0 改为 BSD-3-Clause。
