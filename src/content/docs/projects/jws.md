---
title: JWS — 只管 compact 签名、不解释声明的 JSON Web Signature
description: 介绍 node-jws 4.0.1 如何把 header.payload 编成 JWS，以及 verify 为何必须外传算法。
来源: https://github.com/auth0/node-jws
日期: 2026-08-27
分类: 认证
难度: 入门
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/auth0/node-jws
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 34c45b2c04434f925b638de6a061de9339c0ea2e
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 4.0.1
---

## 是什么

`jws` 是 Node 上的 **JSON Web Signature** 实现：它只负责把「头 + 载荷」编成 `header.payload.signature` 三段，再交给 `jwa` 做 HMAC / RSA / ECDSA / PSS。日常类比：快递封条——盒子里写什么它不管，只保证封条对得上。

你写：

```js
const jws = require('jws');

const token = jws.sign({
  header: { alg: 'HS256' },
  payload: { sub: 'ada' },
  secret: 'shhh',
});

jws.verify(token, 'HS256', 'shhh');
```

仓库现挂在 `auth0/node-jws`（从 `brianloveswords/node-jws` 迁过来）。固定 4.0.1 只有 compact 序列化，没有 JSON Serialization，也没有 `exp` / `aud` 这类 JWT 声明检查。

## 为什么重要

不把 JWS 和 JWT 拆开，后面几件事会对不上：

- 为什么 `verify` 必须自己传入算法，而不能信信封上的 `alg`
- 为什么 `decode` 能读出明文，却完全不能当验收
- 为什么空字符串 secret 仍能过 `createSign`，但 `null` / `undefined` 会立刻抛错
- 为什么会话框架会在这层外面再包声明、加密或 cookie

## 核心要点

固定 4.0.1 的主链可以拆成五步：

1. **入口很薄**：`index.js` 导出 `sign` / `verify` / `decode` / `isValid` / `createSign` / `createVerify`。`ALGORITHMS` 只列 HS/RS/PS/ES 十二种，**不含** `none`。
2. **签名先拼 secured input**：`jwsSecuredInput` 把头按 `binary`、载荷按默认 `utf8` 做 base64url，再交给 `jwa(header.alg).sign`。对象载荷走 `JSON.stringify`。
3. **校验不读信封算法**：`jws.verify(sig, algorithm, key)` 缺算法就抛 `MISSING_ALGORITHM`。真正验证用调用方传入的 `algorithm`，忽略 header 里的 `alg`。这是 v3.0.0 起对算法混淆的修复。
4. **解码只拆三段**：`isValid` 用 `header.payload.signature` 正则，再尝试把 header 当 JSON。`typ === 'JWT'` 或 `opts.json` 时才 `JSON.parse` 载荷，失败会抛，而不是返回 `null`。
5. **流式 API 只是缓冲**：`DataStream` 把字符串、Buffer、对象密钥或可读流收成一块，两边都 `close` 后再 `sign` / `verify`。HMAC 路径只在 `createSign` / `createVerify` 拒绝 `null` / `undefined` secret。

## 实践示例

### 案例 1：同步签名后必须外传算法再验

```js
const compact = jws.sign({
  header: { alg: 'HS256', typ: 'JWT' },
  payload: { name: 'Ada' },
  secret: 'shhh',
});

jws.verify(compact, 'HS256', 'shhh'); // true
jws.verify(compact, 'HS256', 'nope'); // false
```

`typ: 'JWT'` 只影响 `decode` 要不要把载荷当 JSON。它不会让 `verify` 去检查 `exp`。

### 案例 2：decode 在未验证时也能读出载荷

```js
const parts = jws.decode(compact);
// { header: { alg: 'HS256', typ: 'JWT' }, payload: { name: 'Ada' }, signature: '...' }
jws.isValid('not-a-jws'); // false
```

`isValid` 只证明「看起来像三段且 header 能解析」，不证明签名对。

### 案例 3：HMAC 流式入口拒绝缺失 secret，不拒绝空串

```js
jws.createSign({ header: { alg: 'HS256' }, secret: null });
// TypeError: secret must be a string or buffer or a KeyObject

jws.createSign({ header: { alg: 'HS256' }, secret: '' });
// 能建流；测试里空串 / 空 Buffer 仍可签可验
```

CHANGELOG 把 GHSA-869p-cjfg-cm3x 写成「非空 secret」。固定源码只挡住 `== null`，同步 `jws.sign` 这条检查都没有。

## 踩过的坑

1. **把 JWS 当成 JWT 库**：这里没有 `exp` / `nbf` / `aud`。要声明合同应看会话层，例如 [[auth-js]]，或改看把声明写进协议的 [[paseto]]。
2. **相信 header.alg**：`verify` 从 v3.0.0 起忽略它。调用方漏传算法会直接抛，而不是「按信封算法验」。
3. **把 README 的 `none` 当成导出表**：测试和 `jwa` 仍能签验 `alg: 'none'`，但 `exports.ALGORITHMS` 没有这一项。未签名 token 只要你主动传 `'none'` 就会被当成通过。
4. **把 npm `gitHead` 当成 4.0.1 提交**：`package.json` 里写着 `c0f6b27bcea5a2ad2e304d91c2e842e4076a6b03`，那是 2013-01-15 的起始提交。本页绑定可达 tag `v4.0.1` 的 `34c45b2c04434f925b638de6a061de9339c0ea2e`。
5. **空 HMAC secret 不等于已修死**：流式入口拒的是缺失，不是空值。

## 适用 vs 不适用场景

**适用**：

- 只要 compact JWS，算法由调用方显式选定
- 需要同步 API，或把 payload / 密钥当流送进 `createSign` / `createVerify`
- 上层已经自己做声明校验、密钥轮换和 `none` 禁用

**不适用**：

- 需要 `exp` / `aud` / `iss` 这些声明——本库不做
- 需要加密（JWE）而不是签名——应看会话框架，而不是再往 JWS 上加字段
- 希望 token 自己带版本和用途、消灭 `alg` 头——看 [[paseto]]
- 不能接受 Node 专用、`jwa` 做实际密码学、以及仓库已迁到 Auth0 的 provenance

## 固定版本边界

- 本文绑定 `auth0/node-jws@34c45b2c04434f925b638de6a061de9339c0ea2e`，轻量 tag `v4.0.1`，`package.json` 的 `version` 为 `4.0.1`。
- 4.0.1 相对 4.0.0 的可见变化：HMAC 流式入口拒绝缺失 secret；`jwa` 升到 `^2.0.1`（changelog 写明照顾 Node >= 25）。
- 源码仓 `repository` 仍写 `brianloveswords/node-jws`；GitHub 现指向 `auth0/node-jws`。
- 本文未安装依赖、运行上游测试或测量性能，状态保持 `UNVERIFIED`。

## 学到什么

1. **JWS 是封条，不是会话协议**——三段编码和算法表在这里，声明检查不在这里。
2. **校验算法必须外传**——信封上的 `alg` 从 v3.0.0 起就被忽略。
3. **decode / isValid 都不是验收**——它们只拆格式。
4. **发布元数据可能比 tag 更旧**——先核可达提交，再读 `gitHead`。

## 应用型自测

1. `jws.verify(token, secret)` 少传算法时，会按 header.alg 验吗？
2. `jws.decode(token)` 成功是否表示签名有效？
3. `jws.createSign({ header: { alg: 'HS256' }, secret: '' })` 会不会因 GHSA 修复立刻抛错？

检查点：

1. 不会。缺算法抛 `MISSING_ALGORITHM`；有算法也只用传入值。
2. 不会。decode 只拆 header / payload / signature。
3. 不会。空串能建流；抛错的是 `null` / `undefined`。

## 延伸阅读

- 文档：[auth0/node-jws README](https://github.com/auth0/node-jws)
- 固定源码：[auth0/node-jws](https://github.com/auth0/node-jws) —— 本文绑定提交 `34c45b2c04434f925b638de6a061de9339c0ea2e`
- [[paseto]] —— 对照：版本和用途写进 token，没有 `alg` 头
- [[auth-js]] —— 在签名层之外做会话 / JWE
- [[lucia]] —— 不透明 session token 的另一条路

## 关联

- [[paseto]] —— 同一层「令牌编码」，但协议自己锁定算法
- [[auth-js]] —— 用 JWE cookie 而不是裸 JWS
- [[lucia]] —— 弃用后的不透明会话配方
- [[better-auth]] —— 应用层认证，不替代 JWS 原语
- [[clerk]] —— 托管认证；Edge 上也不走这套 Node `jwa` 路径

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
