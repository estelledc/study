# Web Crypto pair source review (writer GM)

> 用途：记录 `iron-webcrypto` 与 `uncrypto` 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。后缀 `-gm` 标记 2026-08-27 平行 writer GM，避免与同日其他审查文档撞名。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL writer GM
- evidence：GitHub metadata、npm package metadata、固定提交静态源码与测试阅读
- not executed：未安装两仓依赖，未调用 `crypto.subtle`，未 seal/unseal 真实对象，未运行上游 test / deno task / vitest，未测 bundle 或性能
- worktrees：本机 `research-worktrees/iron-webcrypto` 与 `research-worktrees/uncrypto`（gitignored），不进入 Git
- slugs：本轮新增页面 `iron-webcrypto` 与 `uncrypto`；仓库原先没有这两篇笔记

## iron-webcrypto

- canonical source：`https://github.com/brc-dd/iron-webcrypto`
- tag：`v2.0.0`（lightweight tag）
- revision：`214ba8a0287005971d5b5c12c236dbbbd5f83e00`
- package：npm `iron-webcrypto@2.0.0`；`gitHead` 与 tag 同指此提交
- license：MIT
- repo identity：Deno-first，仓内是 `deno.json` 而不是 npm `package.json`；`version` 与 `exports` 写在 `deno.json`
- inspected：
  - `deno.json`
  - `README.md`
  - `CHANGELOG.md`
  - `src/index.ts`
  - `src/types.ts`
  - `src/utils.ts`
  - `tests/index.test.ts`
- observed：
  - v2 直接使用全局 `crypto`，不再把 WebCrypto 当作 `seal` / `unseal` 的第一参数；
  - `defaults` 冻结为 AES-256-CBC + HMAC-SHA-256，`saltBits=256`，`iterations=1`，`minPasswordlength=32`，`ttl=0`，`timestampSkewSec=60`；
  - 字符串口令走 PBKDF2（hash `SHA-1`）；`Uint8Array` 口令按算法 `keyBits` 直接 `importKey`；
  - sealed 串前缀 `Fe26.2`，必须拆成 8 段；HMAC 校验失败或过期会抛错；
  - 默认 `encode` 是 `losslessJsonStringify`，拒绝循环、非 plain object、`NaN` / `Infinity`、数组里的 `undefined`；
  - 原生 `Uint8Array.fromBase64` / `toBase64` / `toHex` 可用时走它们，否则回退 `uint8array-extras`。
- provenance：
  - Git tag `v2.0.0` 与 npm `iron-webcrypto@2.0.0` `gitHead` 一致且可达；
  - 未绑定 v1 API（第一参数注入 crypto）或 JSR `@brc-dd/iron` 的独立审查。

## uncrypto

- canonical source：`https://github.com/unjs/uncrypto`
- bound revision：`a0cd466151b2b728a54b085c931c7173fdecc26b`（`chore(release): v0.1.3`）
- package：`uncrypto@0.1.3`；npm `gitHead` 与此提交一致
- git tag conflict：annotated/lightweight tag `v0.1.3` 指向祖先 `90a308f015b17705bbe2cd1862bf16399894a3b8`，该提交 `package.json` 仍写 `0.1.2`；tag 是 npm revision 的祖先，不是同一 SHA
- license：MIT
- inspected：
  - `package.json`
  - `README.md`
  - `CHANGELOG.md`
  - `src/crypto.node.ts`
  - `src/crypto.web.ts`
  - `src/utils.ts`
  - `test/index.test.ts`
  - `test/polyfill.ts`
- observed：
  - 条件导出把 `node` 指到 `crypto.node`，把 `browser` / `bun` / `deno` / `workerd` 等 runtime key 指到 `crypto.web`；
  - Node 入口：`randomUUID` 调 `node:crypto.randomUUID()`，`getRandomValues` 调 `nodeCrypto.webcrypto.getRandomValues`，`subtle` 取 `nodeCrypto.webcrypto?.subtle || {}`；
  - Web 入口：三者都转给 `globalThis.crypto`；
  - README 写明 Node.js ≥ 15，不为更老版本提供 polyfill；
  - 测试只检查 UUID 形态、`getRandomValues` 非零，以及 `Object.keys(subtle)` 为空数组；没有跑 encrypt / sign；
  - `src/utils.ts` 只有 `import crypto from "uncrypto"`，不是导出面。
- provenance：
  - 绑定 npm 可达 `gitHead`，并披露 tag `v0.1.3` 与发布提交分裂；
  - 未把 `main` 后续 chore commit（最新观察到 `a99f620...`，2024-03-06）绑进本页。
