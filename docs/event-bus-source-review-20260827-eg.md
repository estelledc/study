# Event-bus pair source review

> 用途：记录 mitt 与 eventemitter3 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：EG
- evidence：GitHub metadata、npm 只读查询、固定提交静态源码与测试阅读
- not executed：未安装两仓依赖，未运行上游 test、benchmark、bundler 或性能测量
- worktrees：本机 `research-worktrees/`，不进入 Git
- pair：首选 `developit/mitt` 与 `primus/eventemitter3`；两仓 tag 与 npm `gitHead` 均可达且一致，未改用 nanoevents / tiny-emitter 等后备

## mitt

- canonical source：`https://github.com/developit/mitt`
- revision：`b240473b5707857ba2c6a8e6d707c28d1e39da49`
- package：`mitt@3.0.1`
- provenance：GitHub lightweight tag `3.0.1` 与 npm `gitHead` 同指该提交；固定 `package.json` 版本为 `3.0.1`，无 `engines`，同时导出 CJS `dist/mitt.js`、ESM `dist/mitt.mjs` 与 UMD `dist/mitt.umd.js`，类型入口为 `index.d.ts`
- inspected：
  - `package.json`
  - `src/index.ts`
  - `test/index_test.ts`
  - `test/test-types-compilation.ts`
  - `README.md`
- observed：
  - 默认导出是 factory，不是 class：`mitt(all?)` 返回 `{ all, on, off, emit }`，方法不依赖 `this`；
  - 处理表是 `Map`；未传入时新建，传入时复用调用方 Map，因此 `emitter.all.clear()` 能清空全部监听；
  - `on` 只做 append，同一 handler 可登记多次；事件名区分大小写，允许 `string` 与 `symbol`，`constructor` 也是合法 key；
  - `off(type, handler)` 用 `indexOf` 后 `>>> 0` 只删第一次匹配；找不到时 `>>> 0` 变成超大下标，`splice` 实际不删；
  - `off(type)` 不删 key，只把该 type 的数组改成 `[]`；
  - `emit` 先 `slice()` 再逐个调用，因此派发期间增删监听不影响本轮快照；
  - 同名 handler 之后再跑 `'*'` wildcard，wildcard 签名是 `(type, evt)`；注释写明不支持把 `'*'` 当普通事件手动连发；
  - 没有 `once`、没有 listener context、没有多参数 payload；`emit(type)` 可不传第二参，handler 收到 `undefined`；
  - README 的 “200b gzip” 与 IE9 声明未在本轮测量或兼容性验证，不写入性能或浏览器矩阵结论。

## eventemitter3

- canonical source：`https://github.com/primus/eventemitter3`
- revision：`b0144e940ace8add8f335a8adfbed9284eb419f3`
- package：`eventemitter3@5.0.4`
- provenance：GitHub lightweight tag `5.0.4` 与 npm `gitHead` 同指该提交；固定 `package.json` 版本为 `5.0.4`，无 `engines`，`exports` 提供 `require` → `index.js` 与 `import` → `index.mjs`，类型为 `index.d.ts`；`index.mjs` 只是再导出 CJS 实现
- inspected：
  - `package.json`
  - `index.js`
  - `index.mjs`
  - `index.d.ts`
  - `test/test.js`
  - `test/test.mjs`
  - `README.md`
- observed：
  - 构造函数创建 `_events = new Events()` 与 `_eventsCount`；`Events` 在支持时用 `Object.create(null)` 当原型，避免吃到 `Object.prototype`；
  - 若实例仍能读到 `__proto__`，则打开 `prefix='~'`，事件名写成 `'~' + event`；现代引擎测试期望 `EventEmitter.prefixed` 为 `false` 或 `'~'`；
  - 监听器不是裸函数：单个存 `EE { fn, context, once }`，第二个起改成数组；`addListener` 在 `fn` 不是 function 时抛 `TypeError`；
  - 默认 `context` 是 emitter 自身；`on` / `once` / `removeListener` 都接受显式 context，用来替代 `fn.bind`；
  - `once` 是 EE 上的布尔标记；`emit` 在调用前 `removeListener(..., true)`，避免嵌套 emit 再触发；
  - `emit` 返回是否存在监听器；0–5 个额外参数走 `fn.call`，更多参数才分配 `arguments` 数组再 `apply`；
  - `removeListener(event)` 不传 `fn` 会清掉该事件；传 `fn` 时删掉**所有**匹配项，不是只删第一个；可选 `context` / `once` 继续收窄；
  - `off` 是 `removeListener` 别名，`addListener` 是 `on` 别名；`EventEmitter.EventEmitter = EventEmitter` 方便 namespace import；
  - 没有 wildcard `*`，没有 `setMaxListeners` / `prependListener`，也不会在无人监听的 `error` 事件上抛错；`newListener` / `removeListener` 元事件已去掉；
  - README 的 “fastest EventEmitter” 与 benchmark 目录未运行，不写入吞吐或冷启动结论。
