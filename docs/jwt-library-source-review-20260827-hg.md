# JWT library source review (writer HG)

> 用途：记录 jose、jsonwebtoken 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：HG
- evidence：GitHub metadata、npm package metadata、固定提交静态源码阅读
- not executed：未安装两仓依赖，未运行上游 test、bundle、签名/验签运行或性能 benchmark
- worktrees：本机 `research-worktrees/`，不进入 Git
- excluded：未选用 `iron-webcrypto` / `uncrypto`，也未改 marked、markdown-it、knex、ioredis、redis 或 BullMQ

## jose

- canonical source：`https://github.com/panva/jose`
- revision：`3eab1524782fab3f6421b98380f44c99da210a6b`
- package：`jose@6.2.10`（源码 tag `v6.2.10`）
- inspected：
  - `package.json`
  - `README.md`
  - `src/index.ts`
  - `src/jwt/sign.ts`
  - `src/jwt/verify.ts`
  - `src/jwt/encrypt.ts`
  - `src/jwt/unsecured.ts`
  - `src/util/decode_jwt.ts`
  - `src/lib/jwt_claims_set.ts`
  - `src/lib/jws_verify.ts`
  - `src/lib/jws_algorithms.ts`
  - `src/jwks/remote.ts`
  - `src/jwks/local.ts`
  - `src/key/generate_key_pair.ts`
- observed：
  - `type: module`、`sideEffects: false`、运行时依赖为空；`exports["."]` 指向 `dist/webapi/index.js`；
  - `cryptoRuntime` 固定为 `"WebCryptoAPI"`，注释写明旧 Node 专用构建已去掉；
  - `SignJWT` 必须 `setProtectedHeader({ alg })`，没有默认算法；payload 经 `structuredClone`；
  - `jwtVerify` 走 Compact JWS 验签再 `validateClaimsSet`；未给 `algorithms` 时不限制已实现算法；
  - JWT 禁止 unencoded payload；`alg: none` 走独立 `UnsecuredJWT`，不是 `jwtVerify`；
  - `createRemoteJWKSet` 默认 `timeoutDuration=5000`、`cooldownDuration=30000`、`cacheMaxAge=600000`；
  - JWS 表含 HS/RS/PS/ES/EdDSA/Ed25519 与 `ML-DSA-*`，RSA 下限 2048 bits。
- provenance split：
  - GitHub tag `v6.2.10` 剥皮提交即本 revision；
  - npm `jose@6.2.10` 未发布 `gitHead`，本轮只绑定可达源码 tag，不伪造 npm 提交。

## jsonwebtoken

- canonical source：`https://github.com/auth0/node-jsonwebtoken`
- revision：`ed59e76ea37a80f54b833668c02a5271984dcba3`
- package：`jsonwebtoken@9.0.3`
- inspected：
  - `package.json`
  - `README.md`
  - `CHANGELOG.md`
  - `index.js`
  - `sign.js`
  - `verify.js`
  - `decode.js`
  - `lib/timespan.js`
  - `lib/validateAsymmetricKey.js`
- observed：
  - tag `v9.0.3^{}`、`package.json` 版本与 npm `gitHead` 指向同一提交；
  - CommonJS 入口导出 `sign` / `verify` / `decode` 与三类错误构造器；`engines.node >= 12`；
  - 运行时依赖是 `jws@^4.0.1`、若干 `lodash.*`、`ms`、`semver`；
  - `sign` 默认 `alg=HS256`；对象 payload 默认浅拷贝，除非 `mutatePayload`；
  - `expiresIn` / `notBefore` / `maxAge` 经 `ms` 转秒；已有 `exp`/`nbf` 时再传对应 option 会抛错；
  - `verify` 未给 `algorithms` 时按密钥类型推断 HS / RSA|PS / EC；无签名 token 必须显式 `algorithms: ['none']`；
  - RSA/PS 默认拒绝小于 2048 bits 的密钥；密钥类型必须匹配算法，除非 `allowInvalidAsymmetricKeyTypes`。
