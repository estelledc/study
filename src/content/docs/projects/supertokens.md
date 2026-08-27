---
title: SuperTokens — 自托管认证核心：用 HTTP recipe 拆开登录与会话
来源: https://github.com/supertokens/supertokens-core
日期: 2026-08-27
分类: projects / 认证
难度: 中级
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/supertokens/supertokens-core
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 3547e8550580fcc78dceb6641dc735fbfae3ecf8
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 12.1.1
---

## 是什么

SuperTokens Core 是一个**用 Java 写成的自托管认证 HTTP 服务**。日常类比：银行金库——前台（各语言 SDK）负责说话和发邮件，金库只记账、发卡、验卡。你的应用不直接实现 session 轮换，而是打 Core 的 recipe API。

README 把整套拆成三块：Frontend SDK、Backend SDK、Core。**本文只绑定 Core** `v12.1.1`，不把 Node / React SDK 的 `SuperTokens.init` 当成这份源码。

Gradle 写明 `version = "12.1.1"`，Java toolchain 21，嵌入 Tomcat。默认 host `localhost`、port `3567`。

## 为什么重要

不理解固定 12.1.1，下面这些事会对不上：

- 为什么同一套登录能给 Node、Go、Python 用——Core 只暴露 HTTP，语言细节在 SDK 仓
- 为什么 curl `POST /recipe/signin` 就能验邮箱密码，而不必在 Core 里找 SMTP
- 为什么 refresh token 被重放会变成 `TokenTheftDetectedException`，而不只是“再发一张”
- 为什么 `ee/` 和仓库其余部分不是同一份许可

## 核心要点

固定 12.1.1 可以拆成四层：

1. **Webserver + recipe API**：`Webserver` 挂上一组 `WebserverAPI`。每个 API 构造时写入 `rid`；请求头字段是 `rId`。EmailPassword 登录是 `POST /recipe/signin`。兼容版本走 `cdi-version` 头。

2. **Core 不做投递**：`EmailPassword.signUp` 哈希密码并入库；`generatePasswordResetToken` 只返回 token。本 revision 的 Core 源码不见 SMTP / SMS 发送——发信是 SDK 或调用方的事。

3. **Session 哈希链**：`AccessToken.createNewAccessToken` 把 `refreshTokenHash1` 和 `parentRefreshTokenHash1` 放进 access token。refresh 时：当前 token 的双重 SHA-256 对上 DB 的 `refreshTokenHash2` 就发子代；parent 对上就 promote；否则抛 `TokenTheftDetectedException`。

4. **CDI >= 5.6 的 reuse 分类**：出现 `RECENT_PREV` / `ORPHANED_BRANCH` / `STALE_LINEAGE`。`recent_token_reuse_behaviour` 可把近期重用报成 `UNAUTHORISED`，注释写明 **session 仍会撤销**。默认 grace 30 秒。

默认 access token 3600 秒，refresh token 144000 分钟。`ee/` 是 Enterprise license，其余 Apache 2.0。

## 实践示例

### 案例 1：探活 `/hello`

```bash
curl http://localhost:3567/hello
# 期望正文包含 Hello
```

`HelloAPI.getPath()` 是 `/hello`，不要求 API key，也不要求 `cdi-version`。它会按 app 取 storage 并读一个测试 key。限流器阈值写在源码里；生产路径被限流时仍回 `Hello`，测试才可能看到 `RateLimitedHello`。这只能证明进程和 storage 还活着，不能证明登录配方已配置。

### 案例 2：Core 上的邮箱密码登录

```bash
curl -X POST http://localhost:3567/recipe/signin \
  -H "cdi-version: 5.3" \
  -H "rId: emailpassword" \
  -H "Content-Type: application/json" \
  -d '{"email":"a@b.com","password":"secret"}'
```

`SignInAPI` 的 `rid` 是 `RECIPE_ID.EMAIL_PASSWORD`，路径 `/recipe/signin`。它规范化 email，再调 `EmailPassword` 验哈希。成功只说明 Core 认这组凭据；发 session cookie、CORS、`rid` 自动注入都在 SDK 仓，不在这份 revision。

### 案例 3：refresh 时的哈希链

```java
// AccessToken.AccessTokenInfo.toJSONObject
res.addProperty("refreshTokenHash1", this.refreshTokenHash1);
res.addProperty("parentRefreshTokenHash1", this.parentRefreshTokenHash1);
```

新 access token 带着“当前 refresh 的 hash”和“上一代 hash”。`Session.refreshSessionHelper` 在事务里对比 DB 的 `refreshTokenHash2`：对上当前值就签发子代；对上 parent 就 promote 并重入 helper；对不上就 `TokenTheftDetectedException`。CDI >= 5.6 还会区分刚轮换掉的 token 和真正的 stale lineage。调用方看到 theft 响应时，服务端已经按版本决定是否 revoke。

## 踩过的坑

1. **把 SDK `recipeList` 写进 Core 页**：`SuperTokens.init({ recipeList: [...] })` 属于 Backend SDK。Core 只按路径和 `rId` 分发 HTTP API。

2. **以为 `/hello` 限流会 429**：生产路径仍回 200 `Hello`。用它做“就绪探针”可以，用它当容量信号不行。

3. **漏 `cdi-version` 去打 recipe API**：`/hello` 不需要版本头；多数 recipe API 要。版本不够时行为会回到 legacy 分支，不能拿 5.6 的 reuse subtype 去解释老客户端。

4. **把 `recent_token_reuse_behaviour=UNAUTHORISED` 当成“不撤 session”**：源码注释写明只改报告，不改撤销。

5. **把 `ee/` 当 Apache 2.0**：`LICENSE.md` 把 `ee/` 单独划走。多租户 / 企业能力要以该目录的许可证为准。

## 适用 vs 不适用场景

**适用**：

- 需要自托管、用户数据在自己的库，并且不止一种后端语言
- 要把登录配方和 session 轮换做成独立服务，而不是嵌入式 library
- 关心 refresh token 重放能否在服务端被判定为 theft

**不适用**：

- 只要 TypeScript 里一行 `betterAuth()`——那是 [[better-auth]]
- 完全不想运维 Java 进程——看 [[clerk]] 或托管 Core
- 把本文的 curl 示例当成已验证的生产接入——未启动 Core，也未跑测试
- 需要完整 SSO / LDAP 套件时，先核对本 revision 实际暴露的 API，不要外推成 Keycloak 替代

## 固定版本边界

- 本文绑定 `supertokens/supertokens-core@3547e855...`，Gradle 版本 `12.1.1`。
- 只覆盖 Core；Frontend / Backend SDK 是相邻仓库，不在本 receipt 里。
- 默认 port `3567`，access token 3600 秒，refresh token 144000 分钟，grace 30 秒。
- `ee/` Enterprise，其余 Apache 2.0。
- 本文未编译 Java、未启动 Tomcat、未打真实登录，状态保持 `UNVERIFIED`。

## 学到什么

1. **产品型认证常把“算法核心”和“IO / UI”拆开**——Core 发卡，SDK 送信。
2. **recipe 在 Core 里是 HTTP 面，不是 JS 模块数组**——路径 + `rId` + CDI 版本才是合同。
3. **refresh rotation 的可用性来自哈希链，不是 blocklist**——对不上就 theft。
4. **open-core 的墙写在目录和许可证上**——`ee/` 不能按 Apache 2.0 默认条款使用。

## 应用型自测

1. 对生产 Core 打爆 `/hello` 限流，响应是 429 还是仍可能是 `Hello`？
2. `EmailPassword.generatePasswordResetToken` 会不会直接发重置邮件？
3. CDI >= 5.6 且 `recent_token_reuse_behaviour=UNAUTHORISED` 时，重放刚轮换掉的 refresh token，session 还会被撤吗？

检查点：

1. 生产路径仍回 `Hello`；测试才可能看到 `RateLimitedHello`。
2. 不会。Core 只生成 token，投递不在本仓。
3. 会。该配置只改异常类型，注释写明仍 revoke。

## 延伸阅读

- 架构说明：[README · Architecture](https://github.com/supertokens/supertokens-core#architecture)
- 固定源码：[supertokens/supertokens-core](https://github.com/supertokens/supertokens-core) —— 本文绑定提交 `3547e8550580fcc78dceb6641dc735fbfae3ecf8`
- OAuth 2.0 安全 BCP：[RFC 9700](https://datatracker.ietf.org/doc/html/rfc9700)
- [[better-auth]] —— 嵌入式 TS library，对比独立 Core
- [[auth-js]] —— 进程内 library，没有这层 HTTP 服务

## 关联

- [[better-auth]] —— 同一主题的嵌入式方案；没有独立 Java 进程
- [[auth-js]] —— Next.js 进程内 Auth；session 默认值随 adapter 变
- [[clerk]] —— 托管用户表，对标 README 里的 Auth0 / Cognito 位置
- [[lucia]] —— 学习资源，不再提供可安装框架
- [[express]] —— Node SDK 常见宿主；不在本 Core revision 内

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[better-auth]] —— better-auth — 用 plugin 注册表把登录能力接到同一条 Request 上
