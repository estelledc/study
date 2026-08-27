# Env-util source review (writer IZ)

> 用途：记录 env-var、envinfo 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：IZ
- evidence：GitHub metadata、npm package metadata、固定提交静态源码阅读
- not executed：未安装两仓依赖，未运行上游 test、CLI、bundle 或性能 benchmark
- worktrees：本机 `research-worktrees/`，不进入 Git
- reserved lanes：未使用 HM–ID

## env-var

- canonical source：`https://github.com/evanshortiss/env-var`
- revision：`56fe6cb47e1e79e0a4ec5474daab9dc3cae73947`
- package：`env-var@7.5.0`（源码 tag `7.5.0`）
- inspected：
  - `package.json`
  - `README.md`
  - `API.md`
  - `env-var.js`
  - `env-var.d.ts`
  - `lib/variable.js`
  - `lib/env-error.js`
  - `lib/logger.js`
  - `lib/accessors/index.js`
  - `lib/accessors/string.js`
  - `lib/accessors/int.js`
  - `lib/accessors/int-positive.js`
  - `lib/accessors/port.js`
  - `lib/accessors/bool.js`
  - `lib/accessors/bool-strict.js`
  - `lib/accessors/json.js`
  - `lib/accessors/enum.js`
  - `lib/accessors/array.js`
  - `lib/accessors/url-object.js`
  - `lib/accessors/url-string.js`
  - `lib/accessors/email-string.js`
- observed：
  - tag `7.5.0`、package version 与 npm `gitHead` 指向同一提交；
  - 生产依赖为空，`main=env-var.js`，`typings=env-var.d.ts`，`engines.node >= 10`；
  - 默认导出是 `from(getProcessEnv())`；`getProcessEnv` 读不到 `process.env` 时退成 `{}`；
  - `get()` 无参数返回容器；多参数自 6.0.0 起抛 `EnvVarError`；
  - `default()` 把 number / array / object 先序列化成字符串；`required()` 拒绝 trim 后为空；
  - `asInt` 要求 `parseInt(value,10).toString(10) === value`；`asPortNumber` 走 `asIntPositive` 且上限 65535；
  - `asBool` 接受 true/false/1/0；`asBoolStrict` 只接受 true/false；
  - `asUrlString` 经 `new URL(value).toString()`，可能补尾部 `/`；
  - 默认 logger 是 noop；内置 logger 在 `NODE_ENV` 匹配 `prod|production` 时不输出。
- provenance split：无。本页绑定的源码 tag 与 npm 发布 `gitHead` 一致。

## envinfo

- canonical source：`https://github.com/tabrindle/envinfo`
- revision：`a4894fb49deec8d467f07a30a02d0968b57f2e3e`
- package：`envinfo@7.21.0`
- inspected：
  - `package.json`
  - `README.md`
  - `webpack.config.js`
  - `src/cli.js`
  - `src/envinfo.js`
  - `src/presets.js`
  - `src/formatters.js`
  - `src/packages.js`
  - `src/utils.js`
  - `src/helpers/index.js`
  - `src/helpers/binaries.js`
  - `src/helpers/system.js`
- observed：
  - tag `v7.21.0^{}`、package version 与 npm `gitHead` 指向同一提交；
  - npm 只发布 `dist/`；webpack 入口为 `src/envinfo.js` 与 `src/cli.js`，`DefinePlugin` 写入 `global.__VERSION__`；
  - 源码 `dependencies` 为空，`minimist` / `which` / `os-name` / `glob` / `yamlify-object` 列在 devDependencies 并由 bundle 带上；
  - `cli.js` 用 minimist 且默认 `console=true`；无分类旗标时 `main()` 回退到 `presets.defaults`；
  - `--all` 打开 npm / pnpm 全局包；`--preset` 合并命名清单；`--clipboard` 只打印移除说明；
  - helper 用 `which` + 版本命令，`determineFound` 把空版本写成 `Not Found`；
  - `clean()` 默认丢掉 `Not Found` / `N/A` / 空对象；默认 formatter 是 YAML。
- provenance split：
  - GitHub 另有可达 tag `v7.22.0` → `a802f702bcb343e927e632fd315f8c57336bb820`；
  - npm registry 对 `envinfo@7.22.0` 返回 404，latest 仍是 `7.21.0`；
  - 本 review 绑定可发布且内部一致的 `v7.21.0`，不猜测未发布树。
