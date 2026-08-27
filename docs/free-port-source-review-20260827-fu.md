# get-port + detect-port source review (writer FU)

> 用途：记录 `get-port` 与 `detect-port` 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。后缀 `-fu` 标记 2026-08-27 平行 writer FU。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL writer FU
- evidence：GitHub metadata、npm package metadata、固定提交静态源码与测试阅读
- not executed：未安装两仓依赖，未跑 xo / ava / tsd / egg-bin，未真正 bind 生产端口，未测跨进程竞争、bundle 或性能
- worktrees：本机 `research-worktrees/`（gitignored），不进入 Git
- slugs：`get-port`、`detect-port`

## get-port

- canonical source：`https://github.com/sindresorhus/get-port`
- tag：`v7.2.0`（annotated tag）
- revision：`efbebfb0a2904b55d5ce9ab0badb52b3fbab99fe`
- package：`get-port@7.2.0`（MIT），npm `gitHead` 与 tag 解引用提交一致
- engines：`node >= 16`；`"type": "module"`；零运行时依赖
- inspected：
  - `package.json`
  - `index.js`
  - `index.d.ts`
  - `readme.md`
  - `test.js`
  - `license`
- observed：
  - 默认导出函数在源码里叫 `getPorts`，公开 API 是 `getPort`；另导出 `portNumbers`、`clearLockedPorts`；
  - `portCheckSequence` 先交出首选列表，最后 `yield 0`，没有 `+1` 扫描；
  - 未指定 `host` 且端口不是 `0` 时，对 `os.networkInterfaces()` 全部地址再加 `undefined` / `0.0.0.0` 各听一次；`EADDRNOTAVAIL` / `EINVAL` 忽略；
  - 进程内锁分 `lockedPorts.young` / `old`（15 秒转盘，合计约 15–30 秒）和 `reservedPorts`（`reserve: true` 时终身，按端口号而不是 host）；
  - `portNumbers(from, to)` 只允许 `1024…65535` 且 `from <= to`；
  - `files` 只有 `index.js` / `index.d.ts`，没有 CLI。

## detect-port

- canonical source：`https://github.com/node-modules/detect-port`
- tag：`v2.1.0`（lightweight tag）
- revision：`a2cfe1daed83c8f93358aea8b281a91514c307c4`
- package：`detect-port@2.1.0`（MIT），npm `gitHead` 与 tag 提交一致
- companion dependency：`address@^2.0.1`（取 `ip()`）
- engines：`node >= 16`；`tshy` 同时发布 ESM / CJS；`bin` 为 `detect` 与 `detect-port`
- inspected：
  - `package.json`
  - `src/index.ts`
  - `src/detect-port.ts`
  - `src/wait-port.ts`
  - `src/bin/detect-port.ts`
  - `README.md`
  - `LICENSE`
  - `test/detect-port.test.ts`
  - `test/wait-port.test.ts`
  - `test/cli.test.ts`
- observed：
  - `detect` 是 `detectPort` 的别名，默认导出同一函数；另导出 `waitPort`、`IPAddressNotAvailableError`、`WaitPortRetryError`；
  - 窗口是 `maxPort = min(port + 10, 65535)`；用尽后把 port/maxPort 置 0 再听随机口；
  - 未指定 hostname 时依次听默认地址、`0.0.0.0`、`127.0.0.1`、`localhost`、`ip()`；`localhost` 的 `EADDRNOTAVAIL` 被吞掉，其余失败 `++port`；
  - 指定 hostname 时 `EADDRNOTAVAIL` 包成 `IPAddressNotAvailableError`；`ENOTFOUND` 在 `listen` 里被当成成功；
  - `waitPort` 在 `detectPort(port) === port`（空闲）时 sleep 再试，返回值变化才结束；默认无限重试、间隔 1000ms；
  - CLI 无参数时先抽 `9000 + random * (65535 - 9000)`，再交给 `detectPort`。
