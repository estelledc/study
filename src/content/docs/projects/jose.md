---
title: jose — 用 Web Crypto 覆盖 JWS/JWE/JWT/JWKS 的零依赖实现
description: 介绍 jose 6.2.10 如何用 Web Crypto 签发、验签、加密 JWT，以及远程 JWKS 与 alg=none 的边界。
来源: https://github.com/panva/jose
日期: 2026-08-27
分类: 工具库
难度: 入门
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/panva/jose
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 3eab1524782fab3f6421b98380f44c99da210a6b
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 6.2.10
---

## 是什么

jose 是一个覆盖 JWA / JWS / JWE / JWT / JWK / JWKS 的 JavaScript 模块。日常类比：同一套印章和保险柜——既能在票面签字（JWS/JWT），也能把内容锁进箱子（JWE），钥匙可以是本地密钥或网上公布的钥匙串（JWKS）。

你写：

```js
import { SignJWT, jwtVerify } from 'jose';

const secret = new TextEncoder().encode('dev-only-32-byte-secret-key!!!!');
const jwt = await new SignJWT({ sub: 'user-1' })
  .setProtectedHeader({ alg: 'HS256' })
  .setIssuedAt()
  .setExpirationTime('15m')
  .sign(secret);

const { payload } = await jwtVerify(jwt, secret);
```

`SignJWT` 必须先写 `alg` 再 `sign`。`jwtVerify` 先验 Compact JWS 签名，再校验 Claims Set。固定 6.2.10 是 ESM-only、零运行时依赖，入口编译到 `dist/webapi/index.js`。

## 为什么重要

不理解 jose 的“Web Crypto 一条构建”和“验签与声明校验分层”，就解释不了下面几件事：

- 为什么同一套 API 能进 Node、浏览器和 Cloudflare Workers，而不靠 Node `crypto`
- 为什么 `jwtVerify` 过了签名，还可能因为缺 `iss` / `aud` 或过期抛错
- 为什么 `alg: none` 不能塞进 `jwtVerify`，要另走 `UnsecuredJWT`
- 为什么远程 JWKS 不是每次请求都打网络

## 核心要点

固定 6.2.10 的主链可以拆成五步：

1. **只走 Web Crypto**：`cryptoRuntime` 固定为 `"WebCryptoAPI"`。条件 exports 全部指向 `dist/webapi/*`，不再按运行时换 Node 专用构建。

2. **签发是建造者**：`new SignJWT(payload)` 先 `structuredClone` 声明；`setIssuer` / `setAudience` / `setExpirationTime` 写 claims；`setProtectedHeader({ alg })` 没有默认算法。

3. **验签再验声明**：`jwtVerify` 调 Compact JWS 验证，再 `validateClaimsSet`。`exp` / `nbf` 只要出现就会检查；`issuer` / `audience` / `subject` 只有传入 option 才变成必填。

4. **JWKS 是 getKey 函数**：`createRemoteJWKSet(url)` 返回给 `jwtVerify` 的第二参。默认超时 5 秒、成功后冷却 30 秒、缓存最多 10 分钟。

5. **加密与无签名是旁路**：`EncryptJWT` / `jwtDecrypt` 走 Compact JWE；`UnsecuredJWT` 专门编码 `{ alg: "none" }`。`decodeJwt` 只解 payload，不验签。

## 实践示例

### 案例 1：对称密钥签发后立刻验签

```js
const secret = new TextEncoder().encode('dev-only-32-byte-secret-key!!!!');
const jwt = await new SignJWT({ role: 'reader' })
  .setProtectedHeader({ alg: 'HS256' })
  .setIssuer('urn:example:issuer')
  .setAudience('urn:example:api')
  .setExpirationTime('2h')
  .sign(secret);

const { payload, protectedHeader } = await jwtVerify(jwt, secret, {
  issuer: 'urn:example:issuer',
  audience: 'urn:example:api',
  algorithms: ['HS256'],
});
```

不写 `algorithms` 时，实现表里已支持的算法都能过签名关；写了就是 allowlist。`setExpirationTime('2h')` 用库内 `secs()`，不是 `ms` 包。

### 案例 2：远程 JWKS 当动态公钥

```js
const JWKS = createRemoteJWKSet(new URL('https://example.com/.well-known/jwks.json'));
const { payload } = await jwtVerify(token, JWKS, {
  issuer: 'https://example.com',
  audience: 'my-api',
});
```

匹配不到 `kid` 且冷却已过，才会再拉一次 JWKS。本轮未发网络请求，URL 只说明调用形状。

### 案例 3：`decodeJwt` 不解签名

```js
const claims = decodeJwt(jwt);
```

它只接受三段 Compact JWS；五段 JWE 会抛 `JWTInvalid`。要验签用 `jwtVerify`，要解密用 `jwtDecrypt`。

## 踩过的坑

1. **以为有默认 `alg`**：`SignJWT.sign` 读的是 `setProtectedHeader` 里的算法。漏写 header 会在签名阶段失败，不会悄悄变成 HS256。

2. **把 `jwtVerify` 当成只验签**：传入 `issuer` / `audience` 后，缺 claim 会报 `missing required`；过期走 `JWTExpired`。

3. **用 `jwtVerify` 接 `alg: none`**：无签名 token 属于 `UnsecuredJWT.decode`。`jwtVerify` 还禁止 unencoded payload。

4. **把 npm `gitHead` 当成本 revision**：`jose@6.2.10` 没有发布 `gitHead`。本页绑定的是 GitHub tag `v6.2.10` 剥皮提交。

5. **把 README 的跨运行时清单写成实测**：源码声明支持 Node / 浏览器 / Workers / Deno / Bun；本轮未在这些运行时执行。

## 适用 vs 不适用场景

**适用**：

- 需要同一套 Web Crypto API 覆盖签名 JWT、加密 JWT 和 JWKS
- 打包器能消费 `sideEffects: false` 的 ESM 子路径
- 要明确区分 `jwtVerify`、`jwtDecrypt`、`UnsecuredJWT` 和 `decodeJwt`

**不适用**：

- 只要 Node 回调式 `jwt.sign` / `jwt.verify`——先看 [[jsonwebtoken]]
- 需要完整登录会话、OAuth 回调和 cookie 策略——那是 [[auth-js]] / [[lucia]] 的层
- 不能接受必须手写 `alg`、以及 RSA 下限 2048 bits
- 要把静态阅读写成已在 Edge 上跑通

## 固定版本边界

- 本文绑定 `panva/jose@3eab1524782fab3f6421b98380f44c99da210a6b`，源码 tag `v6.2.10`，`package.json` 版本同为 `6.2.10`。
- npm `jose@6.2.10` 未带 `gitHead`；未猜测或伪造 npm 发布树提交。
- JWS 算法表含 HS256/384/512、RS/PS/ES 系列、EdDSA/Ed25519 与 `ML-DSA-44/65/87`。
- `createRemoteJWKSet` 默认超时 5000ms、冷却 30000ms、缓存 600000ms。
- 本文未安装依赖、运行上游测试或实际签发，状态保持 `UNVERIFIED`。

## 学到什么

1. **算法必须由调用方写出**——jose 不替你选 HS256。
2. **验签和声明校验是两段**——签名对了，过期或 audience 错仍会失败。
3. **JOSE 比 JWT 大**——JWS、JWE、JWKS 和 `alg: none` 各有入口。
4. **发布元数据可以缺 `gitHead`**——只绑定可达的 GitHub tag。

## 应用型自测

1. `new SignJWT({ sub: '1' }).sign(secret)` 不调用 `setProtectedHeader`，会不会按 HS256 签发？
2. `jwtVerify(token, secret)` 在 token 已过 `exp` 时，会不会只因签名正确而通过？
3. `decodeJwt` 能不能验证五段 Compact JWE？

检查点：

1. 不会。必须先 `setProtectedHeader({ alg })`。
2. 不会。出现 `exp` 就会做时间检查，过期抛 `JWTExpired`。
3. 不能。五段 token 会抛 `JWTInvalid`；解密要走 `jwtDecrypt`。

## 延伸阅读

- 文档：[github.com/panva/jose](https://github.com/panva/jose)
- 固定源码：[panva/jose](https://github.com/panva/jose) —— 本文绑定提交 `3eab1524782fab3f6421b98380f44c99da210a6b`
- [[jsonwebtoken]] —— Node `crypto` + 默认 HS256 的对照
- [[jwt-rfc-7519]] —— JWT 三段式与注册 claims

## 关联

- [[jsonwebtoken]] —— 同一 JWT 问题的 Node 经典实现
- [[jwt-rfc-7519]] —— 声明名与“只签不加密”的标准背景
- [[auth-js]] —— 会话层会用 JOSE/JWE，但不等于本库
- [[clerk]] —— Edge 上用手写 Web Crypto 验签的对照

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
