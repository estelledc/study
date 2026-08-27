---
title: PASETO — 把版本和用途写进 token、不设 alg 头的安全令牌
description: 介绍 paseto 3.1.4 如何用 version.purpose 分段、PAE 签名/加密，以及为何没有 v2/v4 local。
来源: https://github.com/panva/paseto
日期: 2026-08-27
分类: 认证
难度: 入门
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/panva/paseto
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 04d57493b0bd1d26b72432bde4124dede06552db
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 3.1.4
---

## 是什么

`paseto` 是 Filip Skokan 写的 **PASETO**（Platform-Agnostic SEcurity TOkens）Node 实现：零运行时依赖，token 长成 `version.purpose.payload[.footer]`。日常类比：信封左上角已经印好「v4 / 公钥签名」，收件人不必再猜用哪把锁。

你写：

```js
const { V4 } = require('paseto');

const key = await V4.generateKey('public');
const token = await V4.sign({ sub: 'ada' }, key);
const payload = await V4.verify(token, key);
```

固定 3.1.4 实现：v1/v3 的 local + public，以及 v2/v4 的 **public only**。仓库在 3.1.4 之后已 archived，npm `latest` 仍停在这一版。

## 为什么重要

把它只当成「另一种 JWT」会漏掉协议真正改的地方：

- 为什么 token 里没有 `alg`，于是也不存在「改成 none / HS256」这类算法混淆
- 为什么 `decode` 对 local 令牌根本拿不到明文
- 为什么对象载荷默认会多一个 ISO8601 的 `iat`
- 为什么 `V4.encrypt` 不存在，却不是文档写漏了

## 核心要点

固定 3.1.4 的主链可以拆成五步：

1. **按版本选入口**：`lib/index.js` 导出 `{ decode, V1, V2, V3, V4, errors }`。V4 / V2 只有 `sign` / `verify` / `generateKey`；V1 / V3 另外有 `encrypt` / `decrypt`。
2. **先规范化载荷**：对象会 `JSON.parse(JSON.stringify(...))` 深拷贝，再按 `expiresIn` / `notBefore` / `audience` 等写入声明。`Date` 经 `JSON.stringify` 变成 ISO8601 字符串。`iat` 默认 `true`。Buffer 载荷禁止再带声明选项。
3. **用 PAE 绑住上下文**：签名/加密前把 header、payload、footer、implicit assertion（以及 v3 public 的压缩公钥）按 little-endian 长度编码拼在一起。footer 明文挂在最后一段，不保密。
4. **local 与 public 分路**：v1/v3 local 用 HMAC-SHA384 算认证标签，AES-CTR 加密；标签校验失败才解密。v2/v4 public 是 Ed25519；v3 public 是 P-384 + SHA-384，IEEE-P1363 编码。
5. **验完再谈声明**：`verify` / `decrypt` 先过密码学，再 `assert_payload` 检查 `iss` / `sub` / `aud` / `iat` / `nbf` / `exp` / `maxTokenAge`。`decode` 不走这条链。

## 实践示例

### 案例 1：v4.public 默认写入 iat

```js
const { V4 } = require('paseto');

const privateKey = await V4.generateKey('public');
const token = await V4.sign({ sub: 'ada' }, privateKey, { expiresIn: '2h' });
const payload = await V4.verify(token, privateKey);
// payload.iat / payload.exp 是 ISO8601 字符串，不是 Unix 秒
```

`generateKey('public')` 默认返回 KeyObject；`{ format: 'paserk' }` 才给出 `k4.secret.` / `k4.public.` 字符串。

### 案例 2：decode 不是验收

```js
const { decode, V3 } = require('paseto');

decode(publicToken);
// { version, purpose, payload, footer } —— payload 已按 JSON 解析，但未验签

decode(localToken);
// purpose === 'local' 时 payload 为 undefined，密文不会被解开
```

`complete: true` 出现在 `verify` / `decrypt`，返回 `{ payload, footer, version, purpose }`。`buffer: true` 则跳过声明检查，直接给原始字节。

### 案例 3：v3.local 带 implicit assertion

```js
const { V3 } = require('paseto');

const key = await V3.generateKey('local');
const token = await V3.encrypt({ role: 'reader' }, key, {
  footer: { kid: 'desk-1' },
  assertion: 'store=42',
});
await V3.decrypt(token, key, { assertion: 'store=42' });
```

assertion 不进 token。加解密双方必须给同一份，否则 PAE 对不上，解密失败。

## 踩过的坑

1. **以为 v4 也能 encrypt**：README 表格写明 v2/v4 local ❌。`V4.generateKey('local')` 抛 `PasetoNotSupported`。本库只做 Node `crypto` 当时能直接提供的算法。
2. **把 decode 当 verify**：public 令牌会被剥掉尾部签名再 `JSON.parse`；local 令牌连明文都没有。
3. **按 JWT 数字时间戳读 `iat`**：签发侧写入 `Date`，序列化后是字符串；校验侧也要求字符串，否则 `PasetoClaimInvalid`。
4. **footer 当保密通道**：它只是可见的第四段。密钥或角色不要放进去。
5. **忽略归档状态**：绑定 3.1.4 不等于项目仍在演进。本轮未评估替代实现。

## 适用 vs 不适用场景

**适用**：

- Node >= 16，只要 local 或 public 令牌，并接受版本写在字符串里
- 需要 `exp` / `aud` / `iss` 这类声明，又不想自己再包一层
- 想用 footer 或 implicit assertion 绑额外上下文

**不适用**：

- 浏览器 / Edge 运行时——README 写明只服务 Node
- 需要 v2/v4 local（XChaCha20-Poly1305）——本 revision 没实现
- 只要「三段签名、声明自己管」——更贴 [[jws]]
- 要完整登录框架、OAuth、cookie 会话——看 [[auth-js]] / [[lucia]]，不是这个原语库

## 固定版本边界

- 本文绑定 `panva/paseto@04d57493b0bd1d26b72432bde4124dede06552db`，注释 tag `v3.1.4` 剥皮后与 npm `paseto@3.1.4` 的 `gitHead` 相同。
- `engines.node` 为 `>=16.0.0`；`package.json` 无 runtime `dependencies`。
- 仓库在本 revision 之后 archived。3.1.4 相对 3.1.3 只动了 TypeScript `Record<string, unknown>` 类型。
- 本文未安装依赖、运行官方向量测试或测量性能，状态保持 `UNVERIFIED`。

## 学到什么

1. **算法由 version.purpose 锁定**——没有 header.alg 可以改写。
2. **PAE 把看不见的上下文也绑进签名/标签**——footer、assertion、v3 压缩公钥都算。
3. **声明是签发/校验选项，不是另一套库**——但时间字段是 ISO8601 字符串。
4. **decode 永远不够**——local 看不见，public 未验签。

## 应用型自测

1. `decode(v4PublicToken)` 会验 Ed25519 签名吗？
2. `V4.encrypt` 在 3.1.4 里存在吗？
3. 默认签发的 `iat` 是 Unix 秒还是 ISO8601 字符串？

检查点：

1. 不会。它只按版本剥掉 64 字节签名再解析 JSON。
2. 不存在。V4 入口没有 encrypt/decrypt。
3. ISO8601 字符串。`Date` 经 `JSON.stringify` 转出来。

## 延伸阅读

- 文档：[panva/paseto docs](https://github.com/panva/paseto/blob/main/docs/README.md)
- 协议：[paseto.io](https://paseto.io)
- 固定源码：[panva/paseto](https://github.com/panva/paseto) —— 本文绑定提交 `04d57493b0bd1d26b72432bde4124dede06552db`
- [[jws]] —— compact JWS 对照：算法外传、无声明
- [[auth-js]] —— 应用层会话，默认走 JWE 而不是 PASETO

## 关联

- [[jws]] —— 同一层编码原语；JWS 把算法放进 header
- [[auth-js]] —— 需要 OAuth / cookie 会话时的上一层
- [[lucia]] —— 不透明数据库 session，不是自包含 token
- [[better-auth]] —— 应用认证框架，不实现 PASETO 协议
- [[supertokens]] —— 自托管认证；令牌格式与本库不同

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
