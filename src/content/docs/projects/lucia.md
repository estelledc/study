---
title: Lucia — 弃用后留下的单文件会话教学样本
来源: https://github.com/lucia-auth/lucia
日期: 2026-08-27
分类: 工具库
难度: 中级
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/lucia-auth/lucia
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: e1ef2bc66a070f61813ed03d25c1ba8061c4d9f0
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: learning-resource
---

## 是什么

Lucia 现在不是一个该 `npm install` 的认证框架。日常类比：作者把店关了，门口贴一张“会话该怎么做”的配方，让你抄进自己的 `auth.ts`。

固定 `main` 提交的 README 写明：2025-03 弃用；完整替换物是单文件 `code/auth_session.ts`。站点 `lucia-auth.com` 在 2026-07 同步了同一句话，并指向 Auth Book。

```ts
const token = id + "." + secret.toBase64()
// cookie 里只放这份不透明 token；库不帮你发 cookie、也不帮你接 OAuth
```

`v3` 分支仍停在 `fc016ca8...`，那是旧 adapter 框架。本文绑定当前学习资源，不把 v3 的 `validateSession` / 5 方法 adapter 写成现行 API。

## 为什么重要

不理解这份样本，你会把“认证库”和“30–200 行会话代码”混成一件事：

- 为什么作者认为 database session 不该再做成框架——本 revision 只留配方，不留版本节奏
- 为什么不透明 token 要把 **id 和 secret 分开**：id 用来查行，secret 只存 SHA-256，比较必须 constant-time
- 为什么 cookie 会话一定要另做 CSRF——文件把 `Sec-Fetch-Site` 检查写成调用方责任
- 为什么它和 [[auth-js]] 不是同一层产品——那边是 Request/Response 框架，这里是可抄的会话原语

## 核心要点

`auth_session.ts` 的合同可以压成四条：

1. **不透明 token**：`id` 来自 16 字节随机数、32 字符可读字母表（约 80 bit）；`secret` 是 32 随机字节。入库的是 `SHA-256(secret)`，不是 secret 本身。

2. **过期看上次验证，不看创建时间**：`authSessionExpiresInSeconds = 10 天`。`now - tokenLastVerifiedAt >= 10d` 直接判无效。满 1 小时才写回 `tokenLastVerifiedAt`，把窗口往后推。

3. **比较必须防计时**：`constantTimeEqual` 对两个 `Uint8Array` 做逐字节 XOR。长度不同直接 `false`（长度先泄漏，这是文件里的明确实现，不是 timing-safe 长度隐藏）。

4. **框架能力全部外置**：发 cookie、查库、OAuth、CSRF 都不在文件里。`addAuthSessionToDatabase` 等三个函数只是占位注释，本文件不能当完整模块运行。

## 实践示例

### 案例 1：登录后签发 token

```ts
async function createAuthSession(userId: string) {
  const id = generateRandomId()
  const secret = new Uint8Array(32)
  crypto.getRandomValues(secret)
  const secretHash = new Uint8Array(await crypto.subtle.digest("SHA-256", secret))
  const authSessionToken = id + "." + secret.toBase64()
  await addAuthSessionToDatabase({
    id, userId, secretHash,
    tokenLastVerifiedAt: new Date(),
    createdAt: new Date(),
  })
  return { authSessionToken }
}
```

注释要求 cookie：`Path=/`、`Expires=10d`、HTTPS 下 `Secure`、`HttpOnly`、`SameSite=Lax`。`toBase64()` 被标成较新的 JS API（文件写 Node.js 25 / 新 Deno）。

### 案例 2：请求里校验 token

```ts
async function validateAuthSessionToken(token: string) {
  const [id, encoded] = token.split(".")
  if (!encoded) return null
  const secret = Uint8Array.fromBase64(encoded) // 失败则 null
  const row = await getAuthSessionFromDatabase(id)
  if (!row) return null
  if (Date.now() - row.tokenLastVerifiedAt.getTime() >= 10 * 86400 * 1000) return null
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", secret))
  if (!constantTimeEqual(hash, row.secretHash)) return null
  if (Date.now() - row.tokenLastVerifiedAt.getTime() >= 3600_000) {
    row.tokenLastVerifiedAt = new Date()
    await updateAuthSessionInDatabase(row)
  }
  return row
}
```

查不到行、过期、解码失败、hash 不对，全部返回 `null`，不区分原因。这是防账户枚举的写法，不是“错误信息友好”。

### 案例 3：cookie 会话必须自己挡 CSRF

```ts
if (request.method !== "GET" && request.method !== "HEAD") {
  const site = request.headers.get("Sec-Fetch-Site")
  if (site === null || site !== "same-origin") {
    return new Response(null, { status: 403 })
  }
}
```

文件写明：SvelteKit / Astro 默认带 CSRF；其他环境要自己做。只抄 `validateAuthSessionToken`、不抄这段，等于把 cookie 会话敞开口。

## 踩过的坑

1. **继续 `npm install lucia`**：npm `lucia@3.2.2` 已 deprecated，指向迁移页。本 revision 没有包入口。
2. **把 v3 adapter 五行接口当成现行 API**：那是 `v3` 分支，不在这个 `main` 快照里。
3. **以为文件能直接 import 运行**：三个数据库函数未实现；也没有 cookie 序列化。
4. **忽略 `toBase64` / `fromBase64` 运行时**：旧 Node 没有这些方法，抄代码前要核对自己的运行时或改用替代编码。
5. **把 arctic / oslo 算进本仓库**：本 revision 只有这一份 session 样本。OAuth 与 cookie helper 是作者的其他项目，不在此 pin。

## 适用 vs 不适用场景

**适用**：

- 学习 database session：不透明 token、hash 入库、滑动续期、CSRF 边界
- 个人项目愿意自己实现 3 个查询，并接受 10 天 / 1 小时这两条默认窗口
- 已经有框架级 CSRF，只缺一段会话原语

**不适用**：

- 要长期 semver 和安全补丁——作者明确改成学习资源
- 要 OAuth / 2FA / passkey / 组织——看 [[auth-js]] 或 [[better-auth]]
- 不能接受“抄完还要自己跟 Edge、数据库级联和编码 API”
- 需要企业审计“用了哪个认证框架版本号”

## 固定版本边界

- 本文绑定 `lucia-auth/lucia@e1ef2bc6...`（2026-08-08 `main`）。仓库无 release tag。
- 旧库身份在 `refs/heads/v3` = `fc016ca8...`，不在本页合同内。
- `code/auth_session.ts` 为 Zero-Clause BSD；仓库其余 MIT。
- 未执行该文件、未接数据库、未测 cookie。状态保持 `UNVERIFIED`。

## 学到什么

1. **弃用可以是设计结论**——当核心只剩会话原语，继续做框架会逼用户跟着版本走。
2. **id 与 secret 分离**比“整段 JWT 自描述”更适合可吊销的服务端会话。
3. **滑动续期要限制写频率**——本文件用 1 小时门槛，避免每次请求都 UPDATE。
4. **抄代码的成本在边界**：占位查询、CSRF、编码 API、cookie 属性都不会随文件自动正确。

## 应用型自测

1. 会话创建 9 天后从未再验证，第 10 天请求会成功吗？过期时钟看哪个字段？
2. 刚验证过 10 分钟的 token 再次出现，会写数据库吗？
3. 把 token 放进 cookie 后，只调用 `validateAuthSessionToken` 是否已经防 CSRF？

检查点：

1. 不会自动成功。过期比较的是 `tokenLastVerifiedAt`，不是 `createdAt`；超过 10 天返回 `null`。
2. 不会。写回条件是距上次验证 ≥ 1 小时。
3. 不会。文件把 CSRF 写成调用方责任；示例用 `Sec-Fetch-Site === "same-origin"`。

## 延伸阅读

- 弃用说明：[pilcrowonpaper.com/blog/18](https://pilcrowonpaper.com/blog/18)
- 固定源码：[lucia-auth/lucia](https://github.com/lucia-auth/lucia) —— 本文绑定 `e1ef2bc66a070f61813ed03d25c1ba8061c4d9f0`
- Auth Book：[auth.pilcrowonpaper.com](https://auth.pilcrowonpaper.com)（作者另写的教程，不是本仓库源码）
- [[auth-js]] —— 对照：仍然维护的 Request/Response 认证框架
- [[better-auth]] —— 对照：插件式自托管框架

## 关联

- [[auth-js]] —— framework 派对照；本页是抄文件，不是装包
- [[better-auth]] —— 需要 2FA / passkey 时的另一条路
- [[clerk]] —— 托管 SaaS 对照，功能完整但数据在对方
- [[astro]] —— 文件点名默认带 CSRF 的框架之一

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[auth-js]] —— Auth.js — 让 OAuth 登录和会话存储变成两个抽象
- [[clerk]] —— Clerk — 把登录注册组织 MFA 整套外包给云的 SaaS 认证 SDK
- [[supertokens]] —— SuperTokens — 自托管认证框架，把登录方式做成可拼装的 Recipe
