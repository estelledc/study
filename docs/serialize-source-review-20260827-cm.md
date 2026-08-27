# Serialize pair source review

> 用途：记录 superjson 与 devalue 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：CM
- evidence：GitHub metadata、npm 只读查询、固定提交静态源码与测试阅读
- not executed：未安装两仓依赖，未运行上游 test、benchmark、bundler 或性能测量
- worktrees：本机 `research-worktrees/`，不进入 Git

## superjson

- canonical source：`https://github.com/ravionhq/superjson`
- also observed：`blitz-js/superjson` 与 `flightcontrolhq/superjson` 均重定向到 `ravionhq/superjson`
- revision：`4e708c11b8ae510008c42fbc445ff0e0e683417e`
- package：`superjson@2.2.5`
- provenance：GitHub lightweight tag `v2.2.5` 与提交 SHA 一致；固定 `package.json` 版本为 `2.2.5`，`repository.url` 仍写 `blitz-js/superjson`，`engines.node` 为 `>=16`，同时导出 ESM `dist/index.js` 与 CJS `dist-cjs/index.cjs`
- npm conflict：registry 最新为 `superjson@2.2.6`，其 `gitHead` 为 `931dccad2ccbb923d8cde95eed59ca41fbd860e1`；该提交在 `ravionhq/superjson` 不可达，远端也没有 `v2.2.6` tag。未猜测或伪造 2.2.6 revision
- inspected：
  - `package.json`
  - `src/index.ts`
  - `src/plainer.ts`
  - `src/transformer.ts`
  - `src/types.ts`
  - `src/class-registry.ts`
  - `src/registry.ts`
  - `src/custom-transformer-registry.ts`
  - `src/is.ts`
  - `src/pathstringifier.ts`
  - `src/accessDeep.ts`
  - `src/index.test.ts`
  - `README.md`
- observed：
  - `serialize()` 用 `walker` 产出 `{ json, meta?: { values, referentialEqualities, v } }`；成功写出 `meta` 时把 `meta.v` 设为 `1`；
  - `stringify` 是 `JSON.stringify(serialize())`；`parse` 先 `JSON.parse` 再 `deserialize(..., { inPlace: true })`，因此会改写解析后的对象；
  - `deserialize` 默认用 `copy-anything` 拷贝 `json`，`inPlace: true` 才原地改；
  - 内置转换覆盖 `undefined`、`bigint`、`Date`、`Error`、`RegExp`、`Set`、`Map`、`NaN`/`Infinity`/`-Infinity`/`-0`、`URL` 与 typed array；`DataView` / `ArrayBuffer` 不在内置规则里；
  - `Error` 默认只写出 `name`/`message`/`cause`，额外字段必须先 `allowErrorProps`；反序列化用 `new Error` + `Object` 赋值，不保留未允许的 `stack`；
  - 注册 class 反序列化是 `Object.assign(Object.create(prototype), props)`，不调用构造函数；未注册 class/symbol/custom 会抛错；
  - walker 遇到 `__proto__` / `constructor` / `prototype` 键会抛 prototype pollution 错误；循环引用写成 `null`；`dedupe: true` 时后续相同引用也写成 `null`；
  - 静态 `serialize`/`registerClass` 等方法绑定默认单例，实例注册不会进入这组静态入口。

## devalue

- canonical source：`https://github.com/sveltejs/devalue`
- also observed：`Rich-Harris/devalue` 重定向到 `sveltejs/devalue`
- revision：`3e01a6c749e215e16c94f5c132f46f7840dfa5e0`
- package：`devalue@5.9.1`
- provenance：GitHub annotated tag `v5.9.1` 剥皮提交与 HEAD 一致；固定 `package.json` 版本为 `5.9.1`，`type` 为 `module`，`exports` 只有 ESM `index.js`，声明 `sideEffects: false`，没有 `engines` 字段
- inspected：
  - `package.json`
  - `index.js`
  - `src/stringify.js`
  - `src/parse.js`
  - `src/uneval.js`
  - `src/operations.js`
  - `src/constants.js`
  - `src/utils.js`
  - `src/base64.js`
  - `src/types.d.ts`
  - `test/index.test.js`
  - `README.md`
- observed：
  - 三条入口职责不同：`stringify`/`parse` 走可 JSON 传输的扁平数组；`stringifyAsync` 才允许 thenable；`uneval` 产出可 `eval` 的 JS 源码；
  - 特殊值用负数哨兵：`undefined=-1`、`HOLE=-2`、`NaN=-3`、`Infinity=-4`、`-Infinity=-5`、`-0=-6`、`SPARSE=-7`；
  - `stringify` 默认拒绝 function、symbol 原始值、任意非 POJO、带 enumerable symbol key 的对象，以及 `__proto__` 键；
  - 稀疏数组在第一次遇到 hole 时比较 HOLE 与 SPARSE 编码成本，避免对 `arr[1e6]=1` 这类输入按长度线性展开；
  - typed array / `DataView` 通过共享 `ArrayBuffer`（base64）还原，并保留 subarray 的 `byteOffset`/`length`；
  - `reducers` 在函数返回真值时生效；`operations` 可覆盖 `typeOf`/`identify`/`tagOf` 等检查与构造，默认实现被 `Object.freeze`；
  - `uneval` 对重复对象生成 IIFE；占位参数超过 65534 时改成 `arguments[0]` 解构，以避开引擎参数上限；
  - `parse`/`unflatten` 拒绝 `__proto__`、未知 type tag、自定义 reviver 的未缓存循环，以及 typed array 不以 `ArrayBuffer` 为 payload 的输入。
