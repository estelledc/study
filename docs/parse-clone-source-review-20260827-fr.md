# Parse / clone source review (writer FR)

> 用途：记录 `destr` 与 `klona` 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。后缀 `-fr` 标记 2026-08-27 平行 writer FR，避免与同日其他审查文档撞名。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL writer FR
- evidence：GitHub annotated tag、npm registry `gitHead`、固定提交静态源码与测试阅读
- not executed：未安装两仓依赖，未运行上游 test / bench，未测 bundle 或吞吐
- worktrees：本机 `research-worktrees/destr`、`research-worktrees/klona`（gitignored），不进入 Git
- slugs：新建 `destr`、`klona`；目录中原先没有这两页，`ofetch` 已有未解析 `[[destr]]`
- excluded slugs：不改 `ofetch` 手写正文，不绑定 rfdc / structuredClone / 其他 clone 实现

## destr

- canonical source：`https://github.com/unjs/destr`
- tag：`v2.0.5`（annotated；tag object `b427d55641a7e6e1b22271dd0956a114cb388e2e`）
- revision：`7bb3c39ef5f8c84219be08ebc11b3c4f4a4c828f`
- package：`destr@2.0.5`（MIT；npm `gitHead` 与上述 revision 一致）
- inspected：
  - `package.json`
  - `src/index.ts`
  - `lib/index.cjs`
  - `deno.ts`
  - `test/index.test.ts`
  - `README.md`
- observed：
  - 零生产依赖；`sideEffects: false`；ESM 走 `dist/`，CJS 入口 `lib/index.cjs` 再转调构建产物 `dist/index.cjs`；
  - 非 string 原样返回；无反斜杠的整段引号字符串走 `slice` 快路径，不经 `JSON.parse`；
  - trim 后长度 ≤ 9 时大小写不敏感识别 `true` / `false` / `null` / `undefined` / `nan` / `infinity` / `-infinity`；
  - `JsonSigRx` 作用在未 trim 的原串：以 `"[{` 开头，或整串匹配最多 16 位整数的数字形态；
  - 命中 `__proto__` / `constructor` 键的探测正则后，默认用 reviver 丢掉危险键并 `console.warn`；`safeDestr` 改为抛 `Possible prototype pollution`；
  - 默认解析失败回传原串；`safeDestr` 强制 `strict: true`，失败抛错；非 string 在 strict 下仍原样返回；
  - `{ "constructor": "value" }` 会保留，只有 `constructor` 且值带 `prototype` 才被丢掉。

## klona

- canonical source：`https://github.com/lukeed/klona`
- tag：`v2.0.6`（annotated；tag object `db0244062ed8e1f85a703e831391c463366314ff`）
- revision：`6ad153073b7529769010ddbde1938372e1702f5b`
- package：`klona@2.0.6`（MIT；npm `gitHead` 与上述 revision 一致）
- engines：`node >= 8`
- inspected：
  - `package.json`
  - `index.d.ts`
  - `src/json.js`
  - `src/lite.js`
  - `src/index.js`
  - `src/full.js`
  - `test/suites/pollution.js`
  - `test/suites/class.js`
  - `readme.md`
- observed：
  - 四个入口：`klona/json`、`klona/lite`、`klona`、`klona/full`，类型声明是同一份 `klona<T>(input: T): T`；
  - `json` 只递归 Array 与 `[object Object]`，`Date` / `Map` / `Set` 原样返回同一引用；
  - `lite` 补自定义 class（`new x.constructor()`）、`Date(+x)`、`RegExp(source, flags)` 并复制 `lastIndex`；
  - 默认入口再补 `Set` / `Map`（key 与 value 都递归）、`DataView`、`ArrayBuffer.slice`、TypedArray `new x.constructor(x)`；
  - `full` 用 `Object.create(x.__proto__ || null)` 保原型，并复制 symbol 与 `getOwnPropertyNames` 描述符；不调用 class constructor；
  - `__proto__` 自有键用 `defineProperty` 写入，避免赋值路径污染；测试保留 JSON 形态而不是删除该键；
  - `Object.create(null)` 在 json/lite/default 会变成普通 `{}`；`full` 才保留 null prototype；
  - 四条实现都没有环检测。
