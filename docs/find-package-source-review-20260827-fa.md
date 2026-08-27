# find-up / pkg-dir source review (writer FA)

> 用途：记录 `find-up` 与 `pkg-dir` 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。后缀 `-fa` 标记 2026-08-27 平行 writer FA。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL writer FA
- evidence：GitHub metadata、npm package metadata、固定提交静态源码与测试阅读
- evidence type：STATIC_REVIEW / `STATIC_ANALYSIS`；验证状态保持 `UNVERIFIED`
- not executed：未安装两仓依赖，未运行上游 test、xo、tsd、bundle 或性能 benchmark
- worktrees：本机 `research-worktrees/find-up` 与 `research-worktrees/pkg-dir`，不进入 Git
- excluded slugs：未改 `volta`、`pnpm`、`lerna`、`bun`，也未新增 `find-up-simple` 或 `package-directory` 页面

## find-up

- canonical source：`https://github.com/sindresorhus/find-up`
- revision：`5a009c227a484e503b78566412b1c0fd3dab3c27`
- git tag：annotated `v8.0.0` 解引用到本提交
- package：`find-up@8.0.0`
- inspected：
  - `package.json`
  - `index.js`
  - `index.d.ts`
  - `readme.md`
  - `test/findup.js`
- observed：
  - npm `gitHead` 与 tag 解引用提交相同；
  - `"type": "module"`，引擎 `node >= 20`，依赖 `locate-path@^8.0.0`、`unicorn-magic@^0.3.0`；
  - `findUp` / `findUpSync` 调用 `findUpMultiple*` 并强制 `limit: 1`，返回 `matches[0]`；
  - 每层用 `locate-path`；函数 matcher 返回字符串后仍再走 `locatePath`；
  - `findUpStop` 是 Symbol，matcher 返回它立即结束；
  - `stopAt` 默认文件系统 root；`type` 默认 `'file'`；
  - `findDown` / `findDownSync` 在此提交进入 `index.js`，默认 `depth: 1`、`strategy: 'breadth'`，无 matcher 重载；
  - v7.0.0 的 `index.js` 不含 `findDown`。
- provenance：GitHub annotated tag `v8.0.0` 与 npm `find-up@8.0.0` `gitHead` 一致。

## pkg-dir

- canonical source：`https://github.com/sindresorhus/pkg-dir`
- revision：`fe0b0fbe45a2b3bd92961cbc586d8fde90e58e01`
- git tag：`v8.0.0`
- package：仓内与 npm `pkg-dir@8.0.0` 均为 `8.0.0`
- inspected：
  - `package.json`
  - `index.js`
  - `index.d.ts`
  - `readme.md`
  - `test.js`
  - `v5.0.0:index.js`、`v7.0.0:index.js`（对照导出与依赖）
  - npm tarball `pkg-dir@8.0.0` 与 `pkg-dir@9.0.0`
  - 后继提交 `516b394cc157c5c23d72ca287d9f3498dd9dd1df` 的包名（不绑定）
- observed：
  - 导出只有 `packageDirectory` / `packageDirectorySync`；实现是 `find-up-simple` 找 `package.json` 再 `path.dirname`；
  - 依赖是 `find-up-simple@^1.0.0`，不是 `find-up`；v7.0.0 才依赖 `find-up@^6.3.0`；
  - v5.0.0 仍是 CJS 默认导出 `pkgDir`；
  - 选项只有 `cwd`；测试覆盖 fixture 回到仓库根、disjoint 目录返回 `undefined`；
  - npm `pkg-dir@9.0.0` 的 `gitHead` 仍是本提交；两个 tarball 除 `package.json` 的 `version` 外 SHA 相同；
  - GitHub 最新 tag `v8.2.0` 把包名改成 `package-directory`，并加入 `ignoreTypeOnlyPackageJson`；npm 无 `pkg-dir@8.2.0`。
- provenance：
  - 绑定可达 tag `v8.0.0` / 本 SHA，与仓内版本字段一致；
  - 不把 npm latest `9.0.0` 写成另一份独立源码；
  - 不绑定改名后的 `package-directory@8.2.0`。
