---
title: iron-webcrypto — 用 Web Crypto 把对象封成可核验字符串
description: 固定 v2 用全局 Web Crypto 做 AES-CBC 加 HMAC，输出 Fe26 密封串
来源: https://github.com/brc-dd/iron-webcrypto
日期: 2026-08-27
分类: 认证
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/brc-dd/iron-webcrypto
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 214ba8a0287005971d5b5c12c236dbbbd5f83e00
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 2.0.0
---

## 是什么

iron-webcrypto 是一份 **Web Crypto 实现的 Iron 协议库**：把 JSON 兼容对象对称加密，再挂上 HMAC，收成一段 URL-safe 字符串；之后用同一份口令拆开。日常类比：它给你一个可随身带走的蜡封信封——内容对旁人不可读，拆封时能看出蜡是否被撕过。

```ts
import * as Iron from "iron-webcrypto"

const password = "a_long_random_secret_please_change_me"
const sealed = await Iron.seal({ userId: 123 }, password, Iron.defaults)
const raw = await Iron.unseal(sealed, password, Iron.defaults)
```

固定 `2.0.0` 直接使用全局 `crypto`，不再把 WebCrypto 对象当作第一参数。仓库是 Deno-first：源码身份写在 `deno.json`，不提供仓内 npm `package.json`。

## 为什么重要

不看固定入口，容易把 v1 教程、`@hapi/iron` 和“随便塞个对象就能封”混成一句话：

- 为什么网上 `Iron.seal(crypto, payload, password, defaults)` 在 2.0 会对不上参数
- 为什么默认编码器会拒绝 `Date`、循环引用和数组里的 `undefined`
- 为什么口令最短 32 个字符，而 `Uint8Array` 口令按密钥长度另算
- 为什么它和 [[uncrypto]] 是互补层：那边提供可 import 的 `subtle`，这边假定全局 `crypto` 已经在

## 核心要点

固定 2.0.0 的主链可以拆成五步：

1. **规范化口令**：字符串或 `Uint8Array` 同时当加密/完整性密钥；`{ secret }` 或 `{ encryption, integrity }` 可拆开；带 `id` 时 id 必须匹配 `/^\w+$/`。
2. **派生密钥**：字符串走 PBKDF2（hash `SHA-1`，默认 `iterations: 1`）；缓冲区按算法 `keyBits` 直接 `importKey`。加密默认 AES-256-CBC，完整性是 HMAC-SHA-256。
3. **编码再加密**：默认 `losslessJsonStringify` 先确认能无损往返，再 `subtle.encrypt`。可用 `encode` 换成 MessagePack 等。
4. **拼密封串**：`Fe26.2*id*encSalt*iv*encrypted*expiration*hmacSalt*hmac`，共 8 段，HMAC 覆盖前 6 段。
5. **拆封**：段数、前缀、过期（允许 `timestampSkewSec`，默认 60 秒）和 HMAC 都过了，才解密并 `decode`。

`defaults` 把 `saltBits` 设为 256、`ttl` 设为 0（永不过期，除非你改）。口令最短字段名是源码里的 `minPasswordlength`。

## 实践示例

### 案例 1：默认密封与按 id 拆封

```ts
import * as Iron from "iron-webcrypto"

const password = "a_long_random_secret_please_change_me"
const sealed = await Iron.seal({ userId: 123 }, { id: "1", secret: password }, Iron.defaults)
const raw = await Iron.unseal(sealed, { "1": password }, Iron.defaults)
```

**逐部分解释**：`seal` 把 `id` 写进第二段；`unseal` 在 hash map 里用这段 id 找口令，找不到就抛 `Cannot find password`。空 id 时查找键是 `default`。

### 案例 2：TTL 与时钟偏移

```ts
const options = Iron.clone(Iron.defaults)
options.ttl = 60_000
const sealed = await Iron.seal({ n: 1 }, password, options)
```

`ttl` 是毫秒。拆封时若过期时间 ≤ `now - timestampSkewSec * 1000` 就抛 `Expired seal`。`clone` 会浅拷贝外层，并各自复制 `encryption` / `integrity`，避免改默认冻结对象。

### 案例 3：缓冲区口令与无损 JSON 边界

```ts
const key = Iron.randomBits(256)
await Iron.seal({ a: 1 }, key, Iron.defaults)
await Iron.seal({ when: new Date() }, password, Iron.defaults) // throw
```

`randomBits(256)` 生成 32 字节。AES-256 的缓冲区口令短于 32 字节会抛 `Key buffer (password) too small`。`Date` 不是 plain object，默认编码器抛 `Data is not JSON serializable`；要旧行为需显式 `encode: JSON.stringify`。

## 踩过的坑

1. **把 v1 的第一参数 `crypto` 抄进 v2**：固定版本 `seal(object, password, options)` 只有三参，依赖全局 `crypto.subtle`。
2. **把默认 `iterations: 1` 当成口令哈希强度**：这是密钥派生参数，不是登录口令存储；README 要求高熵口令。
3. **以为任意 JS 值都能封**：循环、`Map` / `Set` / `Date`、`NaN`、数组空位都会被默认编码器拒绝。
4. **在浏览器里保存加密密钥**：README 写明不推荐把密钥暴露给客户端；本页不审查浏览器会话方案。
5. **把 npm 下载量或“兼容 @hapi/iron”写成互操作保证**：API 接近，错误信息和编码器已经分叉；未做跨库向量测试。

## 适用 vs 不适用场景

**适用**：

- 需要把小型 JSON 对象变成可放 cookie / KV 的密封串，并且运行时已有 `crypto.subtle`
- 要用 password id + TTL 做有限期轮换，而不是长期保存所有历史口令
- 能接受默认 AES-CBC + 分离 HMAC，而不是 AEAD

**不适用**：

- 还在用 v1 四参数签名，或必须走 CJS `require`
- 要把 `Date` / `Map` 原样封进去，却不肯换 `encode` / `decode`
- 需要本页证明与 `@hapi/iron`、iron-session、h3 的字节级兼容

## 固定版本边界

- 本文绑定 `brc-dd/iron-webcrypto@214ba8a0...`，npm `iron-webcrypto@2.0.0`；tag `v2.0.0` 与 npm `gitHead` 一致。
- 仓内身份在 `deno.json`；构建脚本走外部 `hado` raw URL，本轮未执行 `deno task build`。
- 依赖 `uint8array-extras`；原生 Base64url / hex API 可用时优先走它们。
- 未安装依赖、未调用 SubtleCrypto、未跑 `deno task test`，状态保持 `UNVERIFIED`。

## 学到什么

1. **v2 的运行时合同是全局 `crypto`**，不再注入实现。
2. **密封串是固定 8 段协议**，前缀 `Fe26.2` 对不上就整段拒绝。
3. **默认编码器保护往返**，代价是比 `JSON.stringify` 更严。
4. **口令形状和 id 查找是轮换的全部机制**；库不帮你发 cookie，也不管 CSRF。

## 应用型自测

1. `Iron.seal(crypto, payload, password, Iron.defaults)` 在固定 2.0.0 还成立吗？
2. 默认封一个 `{ t: new Date() }` 会成功吗？
3. 密封串里写了 `id=1`，拆封时只传 `{ "2": password }` 会怎样？

检查点：

1. 不成立。v2 是 `seal(object, password, options)`，`crypto` 来自全局。
2. 不会。默认 `losslessJsonStringify` 拒绝非 plain object。
3. 抛 `Cannot find password: 1`。

## 延伸阅读

- 固定源码：[brc-dd/iron-webcrypto](https://github.com/brc-dd/iron-webcrypto) —— 本文绑定提交 `214ba8a0287005971d5b5c12c236dbbbd5f83e00`
- 背景协议：[@hapi/iron](https://hapi.dev/module/iron/)（对照实现，不是本页绑定对象）
- [[uncrypto]] —— 跨运行时导出 `subtle` / `randomUUID` / `getRandomValues`
- [[lucia]] —— 另一条“不透明会话 token”路线，不走 Iron 密封串
- [[auth-js]] —— 会话框架对照；本页只提供密封原语

## 关联

- [[uncrypto]] —— 可 import 的 Web Crypto 表面，补全局 `crypto` 缺失的运行时
- [[lucia]] —— 服务端会话配方，id 与 secret 分离
- [[auth-js]] —— Request/Response 认证框架
- [[better-auth]] —— 插件式自托管认证
- [[bun]] / [[deno]] —— README 声明可工作的运行时，本轮未实测
