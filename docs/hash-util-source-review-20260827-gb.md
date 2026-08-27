# Hash utility source review (writer GB)

> 用途：记录 `ohash` 与 `murmurhash` 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。后缀 `-gb` 标记 2026-08-27 平行 writer GB，避免与同日其他审查文档撞名。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL writer GB
- evidence：GitHub metadata、npm package metadata、固定提交静态源码与测试阅读
- evidence type：STATIC_REVIEW / `STATIC_ANALYSIS`；验证状态保持 `UNVERIFIED`
- not executed：未安装两仓依赖，未运行上游 test、bundle、SHA-256 / MurmurHash 向量或性能 benchmark
- worktrees：本机 `research-worktrees/ohash` 与 `research-worktrees/murmurhash`，不进入 Git
- fallback：未使用。两仓均可达且体量可控，未改选其他 hash-util 对。

## ohash

- canonical source：`https://github.com/unjs/ohash`
- revision：`764b0a3203308956ef07597612af5ad59f36c791`
- git tag：annotated `v2.0.12`，tag 对象 `03c9ffcddea4439940364315ad7bcc113598c457`，解引用到本提交
- package：仓内 `ohash@2.0.12`；npm `ohash@2.0.12` latest，无 `gitHead`
- license：MIT
- inspected：
  - `package.json`
  - `README.md`
  - `CHANGELOG.md`（v2.0.12 条目）
  - `src/index.ts`
  - `src/hash.ts`
  - `src/serialize.ts`
  - `src/crypto/js/index.ts`
  - `src/crypto/node/index.ts`
  - `src/utils/is-equal.ts`
  - `src/utils/diff.ts`
  - `src/utils/index.ts`
  - `test/hash.test.ts`
  - `test/serialize.test.ts`
  - `test/crypto.test.ts`
  - `test/utils.test.ts`
- observed：
  - `"type": "module"`，无 `engines` 字段；主入口导出 `serialize` / `hash` / `digest` / `isEqual`，`diff` 在 `ohash/utils`；
  - `hash(input)` 是 `digest(serialize(input))`，不是 v1 那种 murmur 风格稳定串；
  - `serialize` 注释写明源自 `puleos/object-hash` v3.0.0（MIT）；字符串直接包单引号，其余走 `Serializer`；
  - 对象 key 用环境无关的 `compareStrings`（可打印 ASCII 权重表，大写只作平局），不再调用 `localeCompare`；
  - 循环引用用 `#context` Map：首次写入 `#N`，写完再换成内容；再遇到返回占位；
  - `toJSON` 存在则先调用；`Object.keys` 不含 Symbol，因此 Symbol key 不进入序列化；
  - `digest` 走条件导出 `ohash/crypto`：Node 优先 `process.getBuiltinModule("crypto").hash`（注释写 Node v20.12+ / v21.7+），否则 `createHash("sha256")`，编码 `base64url`；默认/浏览器入口是基于 crypto-js 4.1.1 的纯 JS SHA-256；
  - `isEqual` 先 `===`，再比较 `serialize` 字符串；
  - `diff` 跳过 `__proto__`，`for..in` 快照可枚举项，引用相等子树直接跳过；叶子 vs 非空容器不发 changed；
  - 仓内测试断言 `hash({ foo: "bar" })` 为 `g82Nh7Lh3CURFX9zCBhc5xgU0K7L0V1qkoHyRsKNqA4`，`digest("Hello World")` 为 `pZGm1Av0IEBKARczz7exkNYsZb8LzaMrV7J32a2fFG4`；本轮未复跑。
- provenance：绑定 annotated tag 解引用提交；npm 无 `gitHead`，身份靠 tag + 仓内 `version` + SHA。

## murmurhash

- canonical source：`https://github.com/perezd/node-murmurhash`
- revision：`0359fb98cd2e11dc79dbc0ae08ad9d5f8e7a66f7`
- git tag：lightweight `2.0.1` 直接指向本提交；与 `origin/master` 同指
- package：仓内与 npm `murmurhash@2.0.1` 均为 `2.0.1`，MIT
- inspected：
  - `package.json`
  - `README.md`
  - `murmurhash.js`
  - `murmurhash.d.ts`
  - `test.js`
- observed：
  - CJS 单文件：默认导出是 `MurmurHashV3`，另挂 `v2` / `v3`；浏览器全局 `murmur` 带 `noConflict`；
  - 字符串先 `TextEncoder().encode`，再按字节做 32 位 MurmurHash2 / MurmurHash3 r136（2011-05-20）；
  - 注释与 `.d.ts` 仍写 “ASCII only”，实现已是 UTF-8 字节；`test.js` 断言 `"abc"` / `Buffer.from("abc")` / `Uint8Array([97,98,99])` 的 v3 结果同为 `3017643002`；
  - seed 在 JSDoc / 类型里是可选正整数；`undefined` 经位运算落到 0。README 用字符串当 seed 的示例与类型不符；
  - 返回值一律 `>>> 0`，即无符号 32 位整数，不是 digest 字符串；
  - 无 `engines`、无运行时依赖。
- provenance：
  - 绑定可达 lightweight tag `2.0.1` / 本 SHA；
  - npm `murmurhash@2.0.1` 的 `gitHead` 为 `e6aec85b6030ed164ae15fc4b90f01d2a71b9f5f`，在 canonical remote 不可达；未猜测或伪造该提交。
