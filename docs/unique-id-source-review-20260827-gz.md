# Unique-id source review (writer GZ)

> 用途：记录 `cuid2` 与 `ulid` 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。后缀 `-gz` 标记 2026-08-27 平行 writer GZ，避免与同日其他审查文档撞名。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL writer GZ
- evidence：GitHub metadata、npm provenance 与固定提交静态源码 / 测试阅读
- not executed：未安装两仓依赖，未跑 riteway / vitest / collision-test / histogram / bench，未测 bundle / 吞吐 / 碰撞率
- worktrees：本机 `research-worktrees/cuid2` 与 `research-worktrees/ulid`（gitignored），不进入 Git
- slugs：`cuid2`、`ulid`。未使用 marked、markdown-it、knex、uuid、nanoid

## cuid2

- canonical source：`https://github.com/paralleldrive/cuid2`
- npm repository URL：`git+https://github.com/ericelliott/cuid2.git`（GitHub 将 `ericelliott/cuid2` 解析到同一仓）
- tag：`v3.3.0`（annotated tag `591e764f7648135e284ddaae0d11c1ca2efd7d25`）
- revision：`2275e80d1d36d36588a3b7a4929fb07b4b745fd0`
- package：`@paralleldrive/cuid2@3.3.0`（MIT，`"type": "module"`）
- npm gitHead：`3af6f1b172cf956780ed2ae252e8285e6f356b41`（父提交；信息为 `chore: update CHANGELOG for v3.2.1`）
- tree diff vs gitHead：仅 `package.json` / `package-lock.json` 的 version `3.2.0` → `3.3.0`
- inspected：
  - `package.json`
  - `index.js`
  - `index.d.ts`
  - `src/index.js`
  - `src/index-test.js`
  - `bin/cuid2.js`
  - `CHANGELOG.md`
  - `README.md`（只作边界对照，不采下载量 / 碰撞数字）
- observed：
  - 公开导出是 `createId` / `init` / `isCuid` / `getConstants`；`createId` 经 `lazy(init)` 首次调用才构造默认生成器；
  - `defaultLength=24`，`bigLength=32`；`init` 只在 `length > 32` 抛错，不检查下限；
  - 输出 = 随机小写字母 + SHA3-512（`@noble/hashes/sha3.js`）经 `bignumber.js` 转 base36 后再切；`hash()` 先丢掉首字符，`createId` 再 `substring(1, length)`；
  - 哈希输入是 `time + salt + count + fingerprint`；计数器默认从 `rand() * 476782367` 起增；
  - fingerprint 读 `global` 否则 `window` 的 `Object.keys`，空对象退回随机熵；
  - 默认 RNG 是 `crypto.getRandomValues` 的 `Uint32 / 2^32`，没有 Web Crypto 时退回 `Math.random`；
  - `isCuid` 要求 `/^[a-z][0-9a-z]+$/` 且长度 2–32；
  - `error-causes` 写在 dependencies，固定源码未 import；
  - CLI `--slug` 把 length 设为 5；`--install` 往 shell rc 追加 `alias cuid="npx @paralleldrive/cuid2"`。

## ulid

- canonical source：`https://github.com/ulid/javascript`
- tag：`v3.0.2`（annotated tag `773eaf9ad9c222845b7c9829204d9e00f5247fc4`）
- revision：`11c2067821ee19e4dc787ca4e0125a025485edc6`
- package：`ulid@3.0.2`（MIT，零 production 依赖）
- npm gitHead：与 revision 一致
- inspected：
  - `package.json`
  - `rollup.config.js`
  - `source/index.ts`
  - `source/ulid.ts`
  - `source/constants.ts`
  - `source/crockford.ts`
  - `source/uuid.ts`
  - `source/error.ts`
  - `source/utils.ts`
  - `source/cli.ts`
  - `source/stub.ts`
  - `test/node/ulid.spec.ts`
  - `test/node/uuid.spec.ts`
  - `README.md`
- observed：
  - 26 字符：10 位时间 + 16 位随机，Crockford Base32 `0123456789ABCDEFGHJKMNPQRSTVWXYZ`；`TIME_MAX = 2^48-1`，最大串 `7ZZZ…`；
  - `ulid(seedTime?, prng?)`：`!seedTime || isNaN(seedTime)` 时用 `Date.now()`，因此 `0` 不会被当成时间种子；
  - 默认 PRNG 走 `getRandomValues` 或 `randomBytes`；找不到可靠 PRNG 抛 `PRNG_DETECT`，没有 `Math.random` 回退；
  - 浏览器 / CLI bundle 把 `node:crypto` alias 到 `stub.js`（`export default undefined`）；
  - `monotonicFactory` 在 `seed <= lastTime` 时递增上一份随机段并保留 `lastTime`；随机段全 `Z` 时 `incrementBase32` 抛错；
  - `isValid` 只看长度 26 与字符集；`decodeTime` 另校验时间不超过 `TIME_MAX`；
  - `fixULIDBase32` 把 i/l → 1、o → 0 并去掉连字符；`ulidToUUID` / `uuidToULID` 经 crockford 编解码；
  - CLI 用 `monotonicFactory()`，只认 `--count`。
