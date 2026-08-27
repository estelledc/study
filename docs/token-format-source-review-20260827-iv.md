# Token-format source review (writer IV)

> 用途：记录 jws、paseto 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL IV
- evidence：GitHub metadata、npm package metadata、固定提交静态源码与测试阅读
- not executed：未安装两仓依赖，未运行上游 test、签名/加解密、向量或性能 benchmark
- worktrees：本机 `research-worktrees/`，不进入 Git
- reserved lanes：未使用 HM–ID

## jws

- canonical source：`https://github.com/auth0/node-jws`
- revision：`34c45b2c04434f925b638de6a061de9339c0ea2e`
- package：`jws@4.0.1`（轻量 tag `v4.0.1`）
- inspected：
  - `package.json`
  - `readme.md`
  - `CHANGELOG.md`
  - `index.js`
  - `lib/sign-stream.js`
  - `lib/verify-stream.js`
  - `lib/data-stream.js`
  - `lib/tostring.js`
  - `test/jws.test.js`
- observed：
  - GitHub 现仓为 `auth0/node-jws`；`package.json.repository` 仍写 `brianloveswords/node-jws`；
  - 提交的 `gitHead` / npm `gitHead` 都是 `c0f6b27bcea5a2ad2e304d91c2e842e4076a6b03`（2013-01-15 `Starting.`），在现仓可达但不是 4.0.1 工作树；
  - `exports.ALGORITHMS` 为 12 个 HS/RS/PS/ES 值，不含 `none`；测试与 `jwa` 仍能签验 `alg: 'none'`；
  - `jws.sign` 用 `header.alg` 选 `jwa`；`jws.verify` 必须外传 `algorithm`，缺则 `MISSING_ALGORITHM`，忽略 header.alg；
  - `decode` / `isValid` 只拆 compact 三段；`typ === 'JWT'` 或 `opts.json` 时 `JSON.parse` 载荷；
  - `createSign` / `createVerify` 对 HMAC 只拒绝 `secret == null`；空串 / 空 Buffer 仍可签验；同步 `sign` 无此检查；
  - 4.0.1 同时把 `jwa` 升到 `^2.0.1`。
- provenance split：
  - 本审查绑定可达源码 tag `v4.0.1` 剥皮提交，不把起始提交 `gitHead` 写成 4.0.1 revision。

## paseto

- canonical source：`https://github.com/panva/paseto`
- revision：`04d57493b0bd1d26b72432bde4124dede06552db`
- package：`paseto@3.1.4`
- inspected：
  - `package.json`
  - `README.md`
  - `CHANGELOG.md`
  - `lib/index.js`
  - `lib/errors.js`
  - `lib/general/decode.js`
  - `lib/help/apply_options.js`
  - `lib/help/assert_payload.js`
  - `lib/help/check_payload.js`
  - `lib/help/check_footer.js`
  - `lib/help/check_assertion.js`
  - `lib/help/consume.js`
  - `lib/help/pack.js`
  - `lib/help/pae.js`
  - `lib/help/sign.js`
  - `lib/help/verify.js`
  - `lib/help/crypto_worker.js`
  - `lib/help/symmetric_key_check.js`
  - `lib/v1/index.js`
  - `lib/v2/key.js`
  - `lib/v3/index.js`
  - `lib/v3/encrypt.js`
  - `lib/v3/decrypt.js`
  - `lib/v3/sign.js`
  - `lib/v3/key.js`
  - `lib/v4/index.js`
  - `lib/v4/sign.js`
  - `lib/v4/verify.js`
  - `lib/v4/key.js`
- observed：
  - 注释 tag `v3.1.4^{}`、package version 与 npm `gitHead` 同指 `04d57493...`；
  - 实现表：v1/v3 local+public，v2/v4 仅 public；无运行时依赖，`engines.node >= 16`；
  - 对象载荷默认写 `iat`；`exp` / `nbf` 由 duration 字符串生成；序列化后为 ISO8601 字符串；
  - `decode` 对 local 不解密（payload 为 undefined），对 public 只剥签名再 JSON.parse；
  - v3/v4 把 implicit assertion 纳入 PAE；v3 public 额外纳入压缩公钥；
  - v1/v3 local 先 timing-safe 比 HMAC-SHA384 标签再 AES-CTR 解密；
  - 仓库在本 revision 之后 archived；3.1.4 相对 3.1.3 只改 TypeScript 类型。
