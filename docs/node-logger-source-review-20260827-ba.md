# Node logger source review (writer BA)

> 用途：记录 Winston、Bunyan 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL writer BA
- evidence：GitHub release/tag metadata、npm `gitHead`、固定提交静态源码与测试阅读
- not executed：未安装两仓依赖，未运行上游 test、bundle 或性能 benchmark
- worktrees：本机 `research-worktrees/`，不进入 Git
- target pair：`winston`、`bunyan`
- excluded slugs：`pino`（开放 PR #60），以及 A–AH 已占用 slug

## Winston

- canonical source：`https://github.com/winstonjs/winston`
- revision：`ed45345f01b8ceb1d436e4791d95469c5213a0cf`
- package：`winston@3.19.0`
- tag：`v3.19.0`（annotated object 指向上述 commit；npm `gitHead` 一致）
- engines：`>= 12.0.0`
- inspected：
  - `package.json`
  - `lib/winston.js`
  - `lib/winston/create-logger.js`
  - `lib/winston/logger.js`
  - `lib/winston/config/index.js`
  - `lib/winston/exception-handler.js`
  - `lib/winston/transports/index.js`
  - `lib/winston/transports/console.js`
  - `lib/winston/transports/file.js`
- observed：
  - `createLogger()` 为每个实例生成 `DerivedLogger`，按 `opts.levels`（默认 `config.npm.levels`）在原型上挂 `info` / `isInfoEnabled` 等方法；
  - 顶层 `require('winston')` 再包一层无 transport 的 `defaultLogger`，方法透传到该实例；
  - `Logger` 是 objectMode `Transform`；`add()` 把 transport `pipe` 上去，`transports` getter 读 `_readableState.pipes`；
  - `_transform` 在 `silent` 时直接 callback；否则调用 `this.format.transform`，默认 format 是 `logform/json()`；
  - `defaultMeta` 在写入前 `Object.assign` 到 info 上，后写覆盖调用方字段；`child()` 用 `Object.create` 改 `write`，先铺 child 字段再铺本次 info；
  - `isLevelEnabled` 用 npm 数值：数字越小越严重，logger/transport 数值 `>=` 目标 level 才启用；
  - 内置 transport 只有 Console / File / Http / Stream；File 必须给 `filename` 或 `stream`，可选 `maxsize` / `tailable` / `lazy`；
  - `exitOnError` 默认 `true`，但没有 exception handler 时不会 `process.exit`；有 handler 时最多等 3000ms。
- provenance：
  - GitHub latest release `v3.19.0`、annotated tag 与 npm `winston@3.19.0` 的 `gitHead` 均为 `ed45345f01b8ceb1d436e4791d95469c5213a0cf`。

## Bunyan

- canonical source：`https://github.com/trentm/node-bunyan`
- revision：`0ff1ae29cc9e028c6c11cd6b60e3b90217b66a10`
- package：`bunyan@2.0.5`
- tag：`2.0.5`（annotated object 指向上述 commit；npm `gitHead` 一致）
- engines：`node >=0.10.0`
- inspected：
  - `package.json`
  - `lib/bunyan.js`
  - `test/ctor.test.js`
  - `test/log.test.js`
  - `test/child-behaviour.test.js`
  - `test/serializers.test.js`
  - `test/level.test.js`
- observed：
  - 根 logger 必须有 `options.name`；未给 `stream`/`streams` 时 Node 默认写 `process.stdout`，level 默认 INFO=30；
  - 记录固定带 `v=0`、`hostname`、`pid`、`time`、`name`、`msg`；level 是 10/20/30/40/50/60；
  - `log.info()` 无参数时返回 `this._level <= INFO`，不写记录；
  - `_emit` 对非 raw stream 先 `JSON.stringify`，循环失败再 `safeCycles`，再可选 `safe-json-stringify`；raw stream 直接写对象；
  - `child(options, simple)` 在 `simple===true` 时共享 parent streams/serializers，只拷 fields；普通 child 拷贝 streams 且 `closeOnExit=false`，可追加 stream 或改自己的 level；
  - child 不能改 `name`；`serializers` 按字段名调用，异常会写 stderr 并把该字段换成错误字符串；
  - `stdSerializers` 提供 `req` / `res` / `err`；`err` 会展开 `cause()` 长栈；
  - `rotating-file` 依赖可选包 `mv`；缺失时该 stream type 不可用。
- provenance：
  - GitHub tag `2.0.5` 与 npm `bunyan@2.0.5` 的 `gitHead` 均为 `0ff1ae29cc9e028c6c11cd6b60e3b90217b66a10`。
  - 该 tag 的 annotated message 写明 `version 2.0.5 (beta)`，提交日期为 2021-01-08；本文按最新可达 tag 绑定，不把 1.8.x 线写成当前默认。
