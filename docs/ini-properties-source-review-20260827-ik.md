# INI / properties source review (writer IK)

> 用途：记录 PARALLEL writer IK 在 2026-08-27 对 `ini`、`properties` 两页做 STATIC_REVIEW 所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL writer IK
- evidence：GitHub metadata、npm package metadata、固定提交静态源码阅读
- not executed：未安装两仓依赖，未运行上游 test、bundle 或性能 benchmark
- worktrees：本机 `research-worktrees/`，不进入 Git
- not chosen：`toml` / `smol-toml`（开放 PR #277）；未使用 `marked`、`markdown-it`、`knex`、`ioredis`、`redis`、`BullMQ`

## ini

- canonical source：`https://github.com/npm/ini`
- revision：`847941ced4fb8465f0ccb383fd8b15c7e5aa09fc`
- package：`ini@7.0.0`
- inspected：
  - `package.json`
  - `README.md`
  - `CHANGELOG.md`（7.0.0 / 6.0.0 / 5.0.0 的 engines 破坏变更）
  - `lib/ini.js`（`encode`、`decode`、`splitSections`、`safe`、`unsafe`、`__proto__` 丢弃）
  - `test/proto.js`
  - `test/duplicate-properties.js`
- observed：
  - lightweight tag `v7.0.0` 与 npm `ini@7.0.0` 的 `gitHead` 指向同一提交；
  - 单文件 CJS：`main=lib/ini.js`，无 `type: module`、无 `exports`；公开符号是 `parse`/`decode`、`stringify`/`encode`、`safe`/`unsafe`；
  - `engines.node` 为 `^22.22.2 || ^24.15.0 || >=26.0.0`，7.0.0 的破坏变更只收紧 Node 范围；
  - `decode` 产出 `Object.create(null)`；行正则是 `^\[([^\]]*)\]\s*$|^([^=]+)(=(.*))?$`；`;` / `#` 行与空行跳过；
  - 没有 `=` 的 key 变成 `true`；字面量 `true` / `false` / `null` 走 `JSON.parse`，数字仍是字符串；
  - 默认 `bracketedArray=true`，`key[]` 聚成数组；关掉后靠重复 key 计数；
  - 名为 `__proto__` 的 section 会继续解析但不挂到结果上；名为 `__proto__` 的 key 直接跳过；
  - 带点的 section 名经 `splitSections` 嵌套，转义 `\.` 保留字面点；
  - `encode` 把对象当子 section、数组按项写出，默认补 `[]`。
- provenance：tag / package version / npm `gitHead` 一致。

## properties

- canonical source：`https://github.com/gagle/node-properties`
- revision：`bb04b570d2216d75ca5631eb1d095f443b5f6a40`
- package：`properties@1.2.1`
- inspected：
  - `package.json`
  - `README.md`
  - `lib/index.js`
  - `lib/parse.js`
  - `lib/read.js`（`cast`、`expand`、`namespaceKey`、`include`、`build`）
  - `lib/write.js`
  - `lib/stringify.js`
  - `lib/stringifier.js`
  - `lib/escape.js`
- observed：
  - 仓库没有 tag；`bb04b57` 是 `v1.2.1` 版本提交，`package.json` version 为 `1.2.1`；
  - npm `properties@1.2.1` 没有 `gitHead`；master 在该提交后还有 `caa17aa` / `684477e` 两笔文档与 `lib/read.js` 注释改动，本页不绑定它们；
  - `parse` 实际指向 `lib/read.js`，`stringify` 指向 `lib/write.js`；另有 `createStringifier`；
  - 默认注释 token 是 `#` / `!`，默认分隔符是 `=` / `:`，空白也可当分隔；`strict` 才只认 options 里的 token；
  - `cast` 把 `null` / `undefined` / `true` / `false` 和能过 `Number` 的值转成对应 JS 类型；
  - `sections` / `namespaces` / `variables` / `include` / `path` 都是可选开关；`path` 与 `include` 强制要 callback；
  - `${key}` / `${section|key}` 在 cast 前做字符替换；`include` 不能出现在 section 内，目录会找 `index.properties`；
  - 对普通对象 `stringify` 时嵌套对象变成 `[object Object]`，数组走 `value + ""`；要保留 section / comment 必须用 `Stringifier`；
  - 没有 `__proto__` 防护；`engines.node` 声明 `>=0.10`。
- provenance split：无 tag、npm 无 `gitHead`，只绑定可达的版本提交。
