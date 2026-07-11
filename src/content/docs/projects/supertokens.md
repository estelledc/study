---
title: SuperTokens — 自托管认证框架，把登录方式做成可拼装的 Recipe
来源: 'https://github.com/supertokens/supertokens-core'
日期: 2026-05-30
分类: projects / 认证
难度: 中级
---

## 是什么

SuperTokens 是一个**开源、跑在你自己机器上的认证产品**。日常类比：像装一台自家用的指纹锁——不用月租云服务，钥匙是你的，门也是你的，但出厂自带门、锁、电池和换钥匙的工具，你不用自己拼。

它由两层组成：

- **Core service**（Java 写的 HTTP 服务）：真正的认证逻辑——发 token、验密码、轮换 session
- **SDK**（Node / Python / Go / Java）：跑在你的应用里，把 core 的 HTTP API 包装成开发者顺手用的方法

每种登录方式（密码、魔法链接、Google OAuth、MFA）做成独立模块，叫 **Recipe**——你需要哪个就开哪个，不需要的不会拖累。

## 为什么重要

不理解 SuperTokens 的位置，下面这些问题会持续困惑你：

- 为什么 Auth.js / NextAuth 这种 library 写小项目够，规模一大就难受
- 为什么 Clerk 试用爽快，但企业评估时 legal 和财务会拦下
- 为什么 Keycloak 每个 SaaS 公司都听过，但很少人选它做 to-C 应用
- 为什么"自托管 + 完整产品 + 多语言 SDK"这一档之前是空的

## 核心要点

SuperTokens 的设计靠 **三招**：

1. **Recipe 模式**：每种登录方式（EmailPassword / Passwordless / ThirdParty / MFA / Session）是独立模块，自己有业务逻辑、HTTP 路由、storage 接口，互不直接 import。类比：插座面板——每个 recipe 是一个插孔，按需插上即可。

2. **Core 不做 I/O**：Core 只生成 token、code、hash，不发邮件、不发短信。发送是 SDK 那一层的事。这让 core 容易测（不用 mock SMTP）也容易换语言（核心算法都在 core）。

3. **Token rotation 检测重放**：access token 里塞了 refresh token 的 hash。下次刷新时如果 hash 对不上数据库最新值，说明 refresh token 被偷过，整个 session 立刻撤销。

三招拼起来，让 core 既能装企业版的 multi-tenancy / SCIM，也能轻量到给个人项目用。

## 实践案例

### 案例 1：Docker 起一个最小 core

```bash
docker run -p 3567:3567 \
    -d registry.supertokens.io/supertokens/supertokens-postgresql:latest
curl http://localhost:3567/hello
# 期望返回 "Hello"
```

`/hello` 是 core 的健康检查端点。能返回字符串就说明 Java 服务起来了，可以接 SDK。这是排查"卡在哪"的第一站。

随后用 SDK 接入 Next.js：

```ts
// 后端 init（每个 recipe 独立 init，互不干涉）
SuperTokens.init({
  supertokens: { connectionURI: "http://localhost:3567" },
  appInfo: { appName: "demo", apiDomain: "...", websiteDomain: "..." },
  recipeList: [EmailPassword.init(), Session.init()],
});
```

`recipeList` 是 Recipe 模式的体现——你想要哪个就 push 进数组，core 在路由时按 `rid` header 分发。

### 案例 2：Recipe 模式怎么让模块互不打架

类比：各科室不互相打电话，只往前台登记本写一条规则；前台验票时按本子逐条查。

```ts
// supertokens-auth-react: emailverification recipe init
SessionClaimValidatorStore.addClaimValidatorFromOtherRecipe(
    EmailVerificationClaim.validators.isVerified(10)
);
```

EmailVerification recipe 把自己的「邮箱已验证」检查规则登记进 Session 的中央 store（前台本）。Session 校验时遍历 store——recipe 之间**不直接调对方**，靠登记本间接联通。`10` 是缓存秒数，避免每次请求都打 core。

### 案例 3：access token 里的 refresh hash 链

```java
// supertokens-core: AccessToken.createNewAccessToken
payload.addProperty("refreshTokenHash1", refreshTokenHash1);
payload.addProperty("parentRefreshTokenHash1", parentRefreshTokenHash1);
```

每张 access token 携带"当前 refresh token 的 hash + 上一代的 hash"，组成一条 hash 链。如果同一个 refresh token 被两个客户端同时用，server 一对比就发现链断裂——立刻判定 session 被劫持，撤销所有 token。这是 OAuth 2.0 Security BCP（RFC 9700）推荐的 refresh token rotation 做法。

逐部分解释：

- `refreshTokenHash1`：当前这条 refresh token 的 SHA256 hash，进 DB 也进 access token
- `parentRefreshTokenHash1`：上一代 refresh token 的 hash，让 server 判断这是不是合法续期
- 攻击者偷到 access token 也偷不到原始 refresh（DB 里只存 hash，token 也只塞 hash）
- 双链断裂检测让"refresh token 被偷"从无法识别变成立即可识别

## 踩过的坑

1. **CORS 忘了开 allow-credentials**：浏览器会静默丢 cookie，前端永远登不上，控制台一句报错都没有。
2. **Docker 网络写错**：core 在 docker-compose 里要用 service name 而不是 `localhost`，否则 SDK 连不上。
3. **rid header 缺了**：core 用它判断请求路由到哪个 recipe，SDK 自动加，但你直接 curl 测试时要手动加。
4. **多 recipe 顺序敏感**：claim validator 同 id 重复注册会被静默丢弃（兼容 React 18 strict mode），配错时也不会报错。

## 适用 vs 不适用场景

**适用**：
- 中型产品需要自托管 + 完整认证（密码 / 魔法链接 / OAuth / MFA 同时存在）
- 有合规要求"用户数据必须在自己 DB 里"
- 团队不止 JS，还有 Python / Go 后端要共享 session

**不适用**：
- 个人项目只要 Google 登录 + session → 直接 Auth.js / better-auth
- 完全不想运维 → Clerk / Auth0
- 企业 SSO + LDAP + SAML + 复杂 ACL → Keycloak（OIDC 全套）
- 极度定制 / 想自己写一切 → Lucia 这种纯 library

## 历史小故事（可跳过）

- **2020**：团队判断 Auth0 数据锁定 + Keycloak 老派笨重之间缺"自托管 + 完整产品"这一档
- **2021**：Java core 开源，先支持 Node SDK 和 EmailPassword recipe
- **2022-2023**：陆续补齐 Passwordless / ThirdParty / MFA / dashboard，Python / Go SDK 跟上
- **2024**：multi-tenancy / SCIM / 高级 dashboard 走企业版，OSS 保留单租户主功能（典型 open-core）
- 之后路线：把 Recipe 模式延伸到 audit log / consent / device management
- 与 Lucia / better-auth 这类纯 library 阵营形成对照：一边是"自托管 service + 多语言"，一边是"嵌入式 + JS-only"
- 与 Auth0 / Clerk 形成对照：开放 schema + 数据落本地 DB，迁出成本只是 CSV 导出加一个 SQL 脚本

## 学到什么

1. **Recipe 模式是正交化设计的工程化**——每个登录方式独立到目录、storage、HTTP 路由层面，可迁移到任何"功能多变、组合维度高"的领域（评论审核、推送渠道、payment 方式）
2. **Core 不做 I/O 是降低耦合的关键**——把发邮件 / 发短信推到 SDK 层，core 只输出"应该发的内容"
3. **Refresh token hash 链是检测被偷凭证最便宜的办法**——不需要 token blocklist，不需要分布式状态，只要一条 hash 链
4. **open-core 商业化在代码里能看到清楚的"功能墙"**——OSS 保留单实例主功能，企业版加 multi-tenancy / SCIM / 高级 dashboard

## 延伸阅读

- 官网与文档：[supertokens.com/docs](https://supertokens.com/docs)（架构图与 recipe 配置全在这里）
- 源码精读：[supertokens-core](https://github.com/supertokens/supertokens-core) 重点看 `session/` 和 `passwordless/` 两个目录
- OAuth2 refresh rotation 规范：[RFC 9700（OAuth 2.0 Security BCP）](https://datatracker.ietf.org/doc/html/rfc9700)
- [[auth-js]] —— 对比 library 形态的认证方案
- [[clerk]] —— 对比 SaaS 形态的认证产品

## 关联

- [[auth-js]] —— Auth.js（NextAuth）是 library，跑在 API route 里，没有独立 service
- [[better-auth]] —— Lucia 后继者，TypeScript-first，比 SuperTokens 轻但功能少
- [[clerk]] —— SaaS 认证，开箱即用 UI，但用户数据锁在 Clerk 数据库
- [[lucia]] —— 纯 library，思路漂亮但密码重置 / OAuth callback 都得自己写
- [[express]] —— SuperTokens Node SDK 最常见的宿主之一，中间件形态接入

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[auth-js]] —— Auth.js — 让 OAuth 登录和会话存储变成两个抽象
- [[better-auth]] —— better-auth — 把登录/OAuth/2FA/Passkey 拼成一行配置的 TS 认证框架
- [[clerk]] —— Clerk — 把登录注册组织 MFA 整套外包给云的 SaaS 认证 SDK
- [[express]] —— Express — Node.js 最经典的 Web 框架
- [[lucia]] —— Lucia — 主动把自己降级为"学习资源"的 TS 认证库

