# Config-format source review (writer JA)

> 用途：记录 hjson、CSON 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：JA
- evidence：GitHub metadata、npm package metadata、固定提交静态源码阅读
- not executed：未安装两仓依赖，未运行上游 test、bundle 或性能 benchmark
- worktrees：本机 `research-worktrees/`，不进入 Git
- reserved lanes：HM–ID 未使用；本轮只用 JA
- excluded slugs：未选取 ini、properties、toml、yaml、json5，也未选取 marked、markdown-it、knex、ioredis、redis、BullMQ、postgres.js

## hjson

- canonical source：`https://github.com/hjson/hjson-js`
- revision：`be47262264c76e3658f0c6242be33ad2b8a4444c`
- package：`hjson@3.2.2`
- inspected：
  - `package.json`
  - `README.md`
  - `history.md`
  - `lib/hjson.js`
  - `lib/hjson-version.js`
  - `lib/hjson-parse.js`
  - `lib/hjson-stringify.js`
  - `lib/hjson-common.js`
  - `lib/hjson-comments.js`
  - `lib/hjson-dsf.js`
  - `lib/require-config.js`
  - `bin/hjson`
- observed：
  - 仓库没有 Git tag / GitHub Release；npm `hjson@3.2.2` 的 `gitHead` 即上述可达提交；
  - `package.json` 版本是 `3.2.2`，`lib/hjson-version.js` 与 `lib/hjson.js` 文件头仍写 `3.2.1`；3.2.2 提交说明是更新 npm 链接；
  - `master` 只比该提交超前 2 个 README 提交（`sortProps` 文档笔误），`package.json` 仍报 `3.2.2`；
  - 零生产依赖；`main` 为 `lib/hjson.js`；CLI 入口 `bin/hjson`；
  - `legacyRoot` 默认 true，根对象可省略大括号；`keepWsc` 把空白/注释挂到不可枚举的 `__COMMENTS__`；
  - 无引号字符串吃到换行、逗号、`}` / `]` 或注释；重复键覆盖；
  - `Hjson.rt` 只是给 parse/stringify 强制 `keepWsc=true`；
  - DSF（math/hex/date）默认关闭，接口标 experimental；
  - `require-config` 用 `require.extensions['.hjson']` 同步 `Hjson.parse`；
  - stringify 默认不输出逗号，`emitRootBraces` 已过时并总是输出根括号；`sortProps` 只排序没有 comment 记录的新键。
- provenance split：
  - 无同名 git tag 可对账；本页绑定 npm `gitHead`，不绑定后续 README-only `master`。

## CSON

- canonical source：`https://github.com/bevry/cson`
- revision：`379264c2ac0b97044b8ec4d95d965bda9f823898`
- package：`cson@8.4.0`
- tag：`v8.4.0`（annotated tag 剥皮提交与 npm `gitHead` 同指上述 commit）
- inspected：
  - `package.json`
  - `README.md`
  - `SECURITY.md`
  - `.gitignore`
  - `source/index.coffee`
  - `source/bin.coffee`
  - `bin.cjs`
- observed：
  - `main` 是 `edition-esnext/index.js`；`bin.cjs` 只转去 `edition-esnext/bin.js`；
  - `.gitignore` 排除 `edition*/`，git 树只有 CoffeeScript 源码与 shim，编译产物在 npm 包里；
  - `module.exports = new CSON()` 导出单例；`stringify` / `parse` / `load` 分别转到 `createCSONString` / `parseCSONString` / `parseCSONFile`；
  - 默认 `cson=true`、`json=true`，`javascript=false`、`coffeescript=false`；
  - CSON 字符串的 parse/stringify 直接 `require('cson-parser')`；JSON 走内建 `JSON`；
  - 打开 JS 模式才 `vm.runInNewContext`；打开 CoffeeScript 模式才 `coffeescript.eval` 或 `coffeescript/register` + `requirefresh`；
  - `requireCSONFile` 实际只 `parseCSONFile`，不走 Node `require`；
  - 无 callback 时错误作为返回值，不抛；CLI 在拿到 `Error` 后才会 `throw`；
  - `ensureErrorType` 在非 `Error` 时递归调用自身；
  - CSON 默认缩进是 tab，JSON 默认两空格；`createCSString` / `createJSString` 直接返回未支持错误；
  - CLI 三个名字 `cson` / `cson2json` / `json2cson` 共用 `bin.cjs`；扩展名无法判断时要求显式开关；stdin 1 秒无数据则退出；
  - `engines.node` 为 `>=6`，edition 列表写到 Node 21；依赖声明 `cson-parser@^4.0.9`。
- provenance split：
  - tag / package / npm `gitHead` 一致；编译目录不在 git 树，本页阅读的是 `source/*.coffee` 与 `bin.cjs`；
  - npm 上 `cson-parser@4.0.9` 的 `gitHead` 指向 `groupon/cson-parser`，该远程当前不可读，未打开其源码。
