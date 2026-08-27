---
title: jsonwebtoken — Node crypto 上的回调式 JWT 签发与验签
description: 介绍 jsonwebtoken 9.0.3 如何用 Node crypto 与 jws 签发验证 JWT，以及 v9 对 none 算法和密钥类型的限制。
来源: https://github.com/auth0/node-jsonwebtoken
日期: 2026-08-27
分类: 工具库
难度: 入门
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/auth0/node-jsonwebtoken
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: ed59e76ea37a80f54b833668c02a5271984dcba3
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 9.0.3
---

## 是什么

jsonwebtoken 是一个只做 JWT 签发与验签的 Node.js 库。日常类比：车站检票口——窗口盖章发票（`sign`），门口核对印章和有效期（`verify`），把票面读出来但不验章叫 `decode`。

你写：

```js
const jwt = require('jsonwebtoken');

const token = jwt.sign({ sub: 'user-1' }, 'dev-only-secret', { expiresIn: '15m' });
const payload = jwt.verify(token, 'dev-only-secret');
```

`sign` 默认 `alg=HS256`。`verify` 用 Node `crypto` 把密钥收成 `KeyObject`，再交给依赖 `jws` 验签。固定 9.0.3 是 CommonJS，要求 `node >= 12`。

## 为什么重要

不理解它的默认算法、密钥类型推断和 v9 对 unsigned token 的限制，就解释不了下面几件事：

- 为什么旧教程里 `jwt.verify(token, secret)` 不再接受空签名
- 为什么 RSA 公钥不能拿去验 HS256
- 为什么 `expiresIn` 和 payload 里已有的 `exp` 不能一起写
- 为什么它跑不了 Vercel Edge——底层是 Node `crypto`，不是 Web Crypto

## 核心要点

固定 9.0.3 的主链可以拆成五步：

1. **三个导出**：`index.js` 只挂 `sign` / `verify` / `decode`，外加 `JsonWebTokenError`、`NotBeforeError`、`TokenExpiredError`。

2. **签发默认对称签**：`sign` 的 header 默认 `alg: options.algorithm || 'HS256'`。对象 payload 默认 `Object.assign` 浅拷贝；`mutatePayload: true` 才改原对象。`expiresIn` 经 `ms` 加成 `exp`。

3. **验签先拆三段**：`verify` 要求字符串且恰好三段。没有签名时，必须显式 `algorithms: ['none']`；有签名但没给算法列表时，按密钥类型填 HS / RSA|PS / EC。

4. **密钥必须匹配算法**：HS* 要对称密钥，RS/PS/ES 要非对称密钥。RSA/PS 默认拒绝小于 2048 bits 的键，除非 `allowInsecureKeySizes`。

5. **decode 不验签**：`decode` 走 `jws.decode`，失败返回 `null`。`complete: true` 才带上 header 与 signature。

## 实践示例

### 案例 1：默认同步签发，再同步验签

```js
const token = jwt.sign(
  { sub: 'user-1', role: 'reader' },
  'dev-only-secret',
  { expiresIn: '15m', issuer: 'urn:example:issuer' },
);
const payload = jwt.verify(token, 'dev-only-secret', {
  issuer: 'urn:example:issuer',
  algorithms: ['HS256'],
});
```

不传 callback 时，`sign` 直接返回字符串，`verify` 失败就抛错。`expiresIn: '15m'` 用依赖 `ms` 换成秒，再写成 `exp`。

### 案例 2：未给 algorithms 时按密钥类型推断

```js
jwt.verify(token, 'dev-only-secret');
```

密钥被收成 `secret` 类型后，允许的算法变成 `HS256/384/512`。header 里若是 `RS256`，会报 `invalid algorithm`。这是 v9 修 CVE-2022-23540 后的形状：不再用一个全局默认算法去验任意 header。

### 案例 3：无签名 token 必须点名 `none`

```js
jwt.verify(unsigned, null, { algorithms: ['none'] });
```

第三段为空且未把 `none` 列入 `algorithms` 时，源码直接失败：`please specify "none" in "algorithms" to verify unsigned tokens`。`decode` 仍然可以读 payload，但不等于验证。

## 踩过的坑

1. **把 v8 的“空签名也能过”搬到 9.0.3**：CHANGELOG 写明 `verify()` 默认不再接受 unsigned token。这是 v9 破坏性变更，不是文档笔误。

2. **`expiresIn` 叠在已有 `exp` 上**：payload 已有 `exp` 再传 `options.expiresIn` 会抛 `Bad "options.expiresIn"`；`nbf` / `notBefore` 同样互斥。

3. **密钥回调却走同步 `verify`**：第二参若是函数，必须同时给 callback。否则报 `verify must be called asynchronous`。

4. **当成 JOSE 全家桶**：这里没有 JWE、没有 `createRemoteJWKSet`。远程 JWKS 要另接别的包；本仓未实现。

5. **把 9.0.3 理解成功能大改**：该 tag 的提交说明是把 `jws` 升到 4.0.1。安全合同来自 9.0.0，不是 9.0.3 新发明。

## 适用 vs 不适用场景

**适用**：

- Node 服务里只要签发/验签 JWT，并能接受 CommonJS 与 `jws` 依赖
- 需要 callback 或同步两种调用，并自己管理密钥
- 要对照 v9 对 `none`、RSA 长度和密钥类型的限制

**不适用**：

- 浏览器、Edge、Workers 等没有 Node `crypto` 的运行时——看 [[jose]] 或 [[clerk]] 的 Web Crypto 路线
- 需要加密 JWT（JWE）或内置远程 JWKS
- 不能接受默认 HS256，或不能把算法 allowlist 写清楚
- 完整登录产品——[[auth-js]] / [[better-auth]] 才覆盖 session 与 OAuth

## 固定版本边界

- 本文绑定 `auth0/node-jsonwebtoken@ed59e76ea37a80f54b833668c02a5271984dcba3`，tag `v9.0.3` 与 npm `jsonwebtoken@9.0.3` 的 `gitHead` 指向同一提交。
- `package.json` 声明 `node >= 12`、`npm >= 6`；运行时依赖含 `jws@^4.0.1`。
- `sign` 支持 `RS/PS/ES/HS` 与 `none`；`PS*` 是否出现取决于 `lib/psSupported`。
- 9.0.0 起：unsigned token 默认拒绝、RSA ≥ 2048 bits、密钥类型必须匹配算法。
- 本文未安装依赖、运行上游测试或实际签发，状态保持 `UNVERIFIED`。

## 学到什么

1. **默认算法只存在于签发侧**——`sign` 默认为 HS256；`verify` 按密钥类型收窄，不再盲信 header。
2. **v9 把 `none` 从隐式放行改成显式点名**——空签名不再是“没写算法就过”。
3. **时间字段由 `ms` 计算**——字符串 `15m` / `1d` 先变毫秒再变 Unix 秒。
4. **JWT 库不是认证框架**——它不管 cookie、OAuth 和用户表。

## 应用型自测

1. `jwt.sign({ sub: '1' }, secret)` 不传 `algorithm`，header 里的 `alg` 是什么？
2. 第三段为空的 token 调用 `jwt.verify(token, null)`，不写 `algorithms`，会通过吗？
3. payload 已有 `exp`，再传 `{ expiresIn: '1h' }`，会覆盖旧过期时间吗？

检查点：

1. `HS256`。`sign` 的默认 header 是 `options.algorithm || 'HS256'`。
2. 不会。必须显式把 `none` 放进 `algorithms`。
3. 不会覆盖，会抛 `Bad "options.expiresIn"`。

## 延伸阅读

- 文档：[github.com/auth0/node-jsonwebtoken](https://github.com/auth0/node-jsonwebtoken)
- 固定源码：[auth0/node-jsonwebtoken](https://github.com/auth0/node-jsonwebtoken) —— 本文绑定提交 `ed59e76ea37a80f54b833668c02a5271984dcba3`
- v8→v9 迁移：[Migration Notes](https://github.com/auth0/node-jsonwebtoken/wiki/Migration-Notes:-v8-to-v9)
- [[jose]] —— Web Crypto / JWE / JWKS 对照
- [[jwt-rfc-7519]] —— JWT 三段式与注册 claims

## 关联

- [[jose]] —— 同一标准的现代 Web Crypto 实现
- [[jwt-rfc-7519]] —— `iss` / `aud` / `exp` 的含义
- [[clerk]] —— 文档里对比过“老牌 jsonwebtoken 上不了 Edge”
- [[auth-js]] —— 会话层，不替代本库的 sign/verify

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
