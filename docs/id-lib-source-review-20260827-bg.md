# ID library source review

> 用途：记录 uuid 与 nanoid 项目页迁移所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：BG
- evidence：固定提交静态源码与测试阅读
- not executed：未安装两仓依赖，未运行上游 test、benchmark、bundler 或 size-limit
- worktrees：本机 `research-worktrees/`，不进入 Git

## uuid

- canonical source：`https://github.com/uuidjs/uuid`
- revision：`fd59f0277549d22cc7ec00a7b3b5c9bccb4d3c1d`
- package：`uuid@14.0.2`
- provenance：GitHub tag `v14.0.2`、提交 SHA 与 npm `gitHead` 一致
- inspected：
  - `package.json`
  - `src/index.ts`
  - `src/v4.ts`
  - `src/v7.ts`
  - `src/v1.ts`
  - `src/v35.ts`
  - `src/rng.ts`
  - `src/stringify.ts`
  - `src/parse.ts`
  - `src/validate.ts`
  - `src/regex.ts`
  - `src/types.ts`
  - `src/test/rng.test.ts`
  - `README.md`
- observed：
  - 包描述为 RFC9562 UUID；`uuid@12` 起不再支持 CommonJS，`exports` 按 node / default 分发 `dist-node` 与 `dist`；
  - `v4()` 在无 options、无 buffer 且存在 `crypto.randomUUID` 时直接返回原生结果，否则走 `_v4` 改 version/variant 位；
  - `rng()` 复用模块级 `Uint8Array(16)` 并调用 `crypto.getRandomValues`，下一次调用会覆盖同一缓冲；
  - 无 options 的 `v7()` 使用模块级 `_state` 保持毫秒时间戳与 32-bit seq 单调；seq 回绕时把 `msecs` 加一；
  - 传入 options 时 `v1`/`v7` 不读内部状态，这是 `uuid@11` 起的隔离合同；
  - `stringify` 会 `validate`，生成路径使用 `unsafeStringify`；`validate` 接受版本 1-8 以及 NIL/MAX。

## nanoid

- canonical source：`https://github.com/ai/nanoid`
- revision：`9247b6dbfe97854e6e136784ae5dde0c672d22c5`
- package：`nanoid@6.0.1`
- provenance：GitHub tag `6.0.1` 剥皮提交与 npm `gitHead` 一致
- inspected：
  - `package.json`
  - `index.js`
  - `index.browser.js`
  - `nanoid.js`
  - `index.d.ts`
  - `url-alphabet/index.js`
  - `non-secure/index.js`
  - `test/index.test.js`
  - `test/pool.test.js`
  - `README.md`
- observed：
  - `engines.node` 为 `^22 || ^24 || >=26`；`exports` 把 browser / react-native 指到 `index.browser.js`；
  - Node 入口的 `nanoid` 等于 `customAlphabet(urlAlphabet)`，用 latin1 字符串池和 `substring` 切片，而不是逐字符拼接；
  - 浏览器入口每次调用 `crypto.getRandomValues`，用 `urlAlphabet[byte & 63]` 映射，没有 Node 那套池；
  - `urlAlphabet` 是 64 个 `A-Za-z0-9_-` 符号，字符顺序为压缩字典优化，不是字母表顺序；
  - `customAlphabet` 对长度超过 256 或含非单字节字符回退到 `customRandom`；其余路径用 mask + 拒绝采样避免 modulo bias；
  - `size |= 0` 防止 `valueOf` 污染池偏移；负 size 抛 `RangeError('Wrong ID size')`；
  - `nanoid/non-secure` 使用 `Math.random()`；`118 B` 是 size-limit 对 `{ nanoid }` 的限制，不是整包体积。
