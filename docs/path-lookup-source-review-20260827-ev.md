# PATH lookup source review (writer EV)

> 用途：记录 `which` 与 `lookpath` 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。后缀 `-ev` 标记 2026-08-27 平行 writer EV，避免与同日其他审查文档撞名。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL writer EV
- evidence：GitHub metadata、npm package metadata、固定提交静态源码与测试阅读
- not executed：未安装两仓依赖，未运行 tap / jest / tsc，未在 Windows 上复现 PATHEXT，未测查找耗时
- worktrees：本机 `research-worktrees/which` 与 `research-worktrees/lookpath`（gitignored），不进入 Git
- slugs：`which`、`lookpath`；仓库原先没有这两页，本轮新建

## which

- canonical source：`https://github.com/npm/node-which`
- tag：`v7.0.0`（lightweight tag）
- revision：`297db11d58eebe01551ae0875a127a89ee63d2cb`
- package：`which@7.0.0`
- npm gitHead：与 revision / tag 一致
- license：ISC
- engines：`node ^22.22.2 || ^24.15.0 || >=26.0.0`
- dependency：`isexe@^4.0.0`（未作为本页 revision 打开）
- inspected：
  - `package.json`
  - `README.md`
  - `CHANGELOG.md`
  - `lib/index.js`
  - `bin/which.js`
  - `test/index.js`
  - `test/bin.js`
- observed：
  - 默认导出 async `which`，`.sync` 挂在同一函数上；
  - 命令含 posix `/` 或当前 `path.sep` 时不再拆 PATH，只检查该路径；
  - Windows 把 `process.cwd()` 插到 PATH 之前；默认 PATHEXT 为 `.EXE;.CMD;.BAT;.COM`，并复制小写；命令名含 `.` 时把空扩展名插到最前；
  - PATH 段若被双引号包裹则剥掉；空目录 + `./cmd` 会补回 `./` 前缀；
  - 可执行判断委托 `isexe` / `isexeSync`，并传 `ignoreErrors: true`；
  - `all` 返回数组；`nothrow` 返回 `null`；默认抛 `ENOENT` `not found: ${cmd}`；
  - CLI 二进制名是 `node-which`，短选项 `-a` / `-s`；找不到只设 `exitCode = 1`，不写 stderr。
- provenance：
  - GitHub tag `v7.0.0`、仓内 `package.json#version` 与 npm `gitHead` 指向同一可达提交。

## lookpath

- canonical source：`https://github.com/otiai10/lookpath`
- tag：`v1.2.2`（lightweight tag）
- revision：`3885a0e45459b2d6bf466223a67055c3374d979d`
- package：`lookpath@1.2.2`
- npm gitHead：与 revision / tag 一致
- license：MIT
- engines：只声明 `npm >= 6.13.4`
- inspected：
  - `package.json`
  - `README.md`
  - `src/index.ts`
  - `bin/lookpath.js`
  - `tests/lookpath.spec.ts`
- observed：
  - 唯一库入口是 async `lookpath()`，找不到 resolve `undefined`，不抛；
  - 含 `path.sep` 的参数走 `path.resolve` + `X_OK`，不再拆 PATH；
  - Windows 读 `env.Path`，其他平台读 `env.PATH`；`opt.env` 整表替换 `process.env`；
  - `include` 追加在 PATH 后面，`exclude` 过滤；
  - `PATHEXT` 切开后再 `concat('')`；未设置时会出现两个空扩展名；
  - 对各目录 `Promise.all`，再用 `find` 取第一个真值，名单顺序保留；
  - CLI `require('../lib')`；tag 工作树只有 TypeScript 源，没有检入 `lib/`。
- provenance：
  - 绑定可复查的 `v1.2.2` / npm `lookpath@1.2.2`；
  - npm latest `lookpath@1.2.3` 的 `gitHead` `6b80a53df35ededcebe93c888aa7ad5a49d46e98` 在 canonical remote 不可达，公开 tag 只到 `v1.2.2`；未猜测或伪造 1.2.3 revision。
