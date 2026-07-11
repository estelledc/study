---
title: OAuth 2.1 — 把十年 OAuth 实战经验收口成一份能直接用的规范
来源: IETF OAuth WG, "The OAuth 2.1 Authorization Framework", draft-ietf-oauth-v2-1
日期: 2026-05-31
分类: 后端
难度: 中级
---

## 是什么

OAuth 2.1 是**正在制定的 IETF 草案**，把 2012 年的 OAuth 2.0（RFC 6749）+ 十年里散落各处的"安全最佳实践"合并成**一份**规范。

日常类比：OAuth 2.0 像一本菜谱，里面写了 8 道菜的做法，但有 3 道做完会食物中毒；十年里厨师们贴了 6 张便签提醒"这道别做、那道得加这一步"。OAuth 2.1 把便签收回来，把菜谱重写：**能做的就 2 道，必须的步骤直接写进流程，吃错的菜删掉**。

具体收口的内容：

- 强制开 **PKCE**（Proof Key for Code Exchange）
- 禁掉 **Implicit Grant** 和 **Resource Owner Password Credentials**
- **Public client 的 Refresh Token**：必须 **sender-constrained**（绑定客户端）或 **一次性轮换**；confidential client 未一律强制轮换
- **redirect_uri 必须精确匹配**，不允许通配符

## 为什么重要

不理解 OAuth 2.1，下面这些事都做不对：

- **第三方登录**：GitHub / Google / 微信登录别人家应用 → 走的就是 Authorization Code + PKCE
- **后端 API 鉴权**：服务 A 调服务 B、机器对机器 → Client Credentials
- **AI agent 替用户操作**：MCP server 给 agent 颁发 scoped token → 必须按 2.1 来，否则 token 一泄露就全盘失守
- **SaaS 集成**：Stripe / Slack / Notion 的 OAuth 都已经按 2.1 收紧

读 RFC 6749 + 6 篇散落的 BCP/RFC（7636 PKCE、8252 Native、8628 Device、8707 Resource Indicators...）拼不出全貌；读 2.1 草案**一份就够**。

## 核心要点

OAuth 2.1 围绕**两个 grant type**展开。其他都被砍了。

### 1. Authorization Code + PKCE（用户参与的场景）

四方角色：

- **Resource Owner**（用户）
- **Client**（第三方应用，比如 "用 GitHub 登录某博客"）
- **Authorization Server**（GitHub 的鉴权服务）
- **Resource Server**（GitHub 的 API）

流程八步：

1. Client 生成随机 `code_verifier`，算 hash 得 `code_challenge`
2. Client 把用户重定向到 Authorization Server，带上 `code_challenge`
3. 用户登录 + 同意授权
4. Authorization Server 把用户重定向回 Client，带 `authorization_code`
5. Client **用 code + code_verifier**（不是 code_challenge）换 access token
6. Authorization Server 验证 hash 匹配，返回 `access_token` + `refresh_token`
7. Client 拿 access_token 调 Resource Server
8. token 过期时用 refresh_token 换新的（refresh_token 也会被换）

**PKCE 的关键**：`code_verifier` 只在 Client 内存里，从不上网。即使 `authorization_code` 在重定向里被截，攻击者也没法换 token。

### 2. Client Credentials（机器对机器，没有用户）

两步：

1. Client 用自己的 `client_id` + `client_secret` 直接请求 token
2. Authorization Server 验证后给 access_token

这是 **agent 鉴权的根**：MCP server 想让 AI agent 调用某个 API，agent 自己作为 Client 走这个 flow。

### 3. 被砍掉的 grant type

- **Implicit Grant**：直接把 access_token 写进 URL 片段——SPA 场景被滥用十年，2.1 删掉
- **Password Grant**：用户把账号密码交给 Client，Client 拿去换 token——违反 OAuth 初心，2.1 删掉

## 实践案例

### 案例 1：用 GitHub 登录第三方博客（Authorization Code + PKCE）

```text
用户点 "用 GitHub 登录"
  ↓
博客生成 code_verifier='dBjftJeZ4...'，hash 出 code_challenge='E9Melhoa2...'
  ↓
跳转 https://github.com/login/oauth/authorize?
        client_id=...&code_challenge=E9Melhoa2...&code_challenge_method=S256
  ↓
用户在 GitHub 登录、同意授权
  ↓
GitHub 跳回 https://blog.example.com/cb?code=AUTH_CODE_HERE
  ↓
博客后端 POST https://github.com/login/oauth/access_token
        { code: AUTH_CODE_HERE, code_verifier: 'dBjftJeZ4...' }
  ↓
GitHub 校验 SHA256(code_verifier) == 之前收到的 code_challenge
  ↓
返回 { access_token, refresh_token, expires_in: 3600 }
```

### 案例 2：MCP server 给 AI agent 颁发 token（Client Credentials）

```text
agent 启动时读取 client_id + client_secret（环境变量）
  ↓
POST /oauth/token
  Authorization: Basic base64(client_id:client_secret)
  body: grant_type=client_credentials&scope=read:files write:files
  ↓
返回 { access_token, expires_in: 900 }（15 分钟）
  ↓
agent 调 MCP server API 时带 Authorization: Bearer <access_token>
  ↓
快过期前重新换（client_credentials 通常不发 refresh_token）
```

### 案例 3：refresh token 轮换（防一次泄露永久控制）

```text
旧版（OAuth 2.0）：
  refresh_token=R1 → 换出 access_token + 仍然返回 R1
  攻击者偷到 R1 → 永远能换新 token

OAuth 2.1（尤其 public client）：
  方案 A：sender-constrained（mTLS/DPoP）——偷到 token 也用不了
  方案 B：轮换——R1 → 换出 access_token + 新 R2，R1 立即作废
  若 R1 已被合法 Client 用过再被重放 → 判定泄露，撤销整条链
```

## 踩过的坑

1. **以为 PKCE 只 SPA 需要**：2.1 要求**所有 Client**（含后端）都开 PKCE。后端也可能被中间人截 redirect。

2. **redirect_uri 写通配符**：OAuth 2.0 时代很多实现允许 `https://*.example.com/cb`，攻击者注册子域名就能截。2.1 强制精确字符串匹配，包括 query string。

3. **把 access_token 当身份令牌**：access_token 是"能调 API 的钥匙"，不代表"这是谁"。要拿身份信息得用 **OpenID Connect** 的 ID Token（JWT 格式，带用户信息）。混用是常见漏洞。

4. **client_secret 写进前端代码**：纯前端 SPA / 移动 App 是 **public client**，没办法藏 secret，**只能**走 Authorization Code + PKCE，不能用 Client Credentials。

5. **token 过期时间设成永久**：access_token 应短（15 分钟到 1 小时），refresh_token 应长但**轮换**。永不过期 = 一次泄露终身受害。

## 适用 vs 不适用场景

**适用**：

- 第三方登录（联邦身份）
- 跨服务 API 鉴权（B2B 集成）
- 移动 App / SPA / 后端服务对外开放 API
- AI agent 替用户访问受保护资源

**不适用**：

- 单一服务内部的 session 管理 → 普通 cookie / session 就够
- 加密通信本身 → 用 TLS，不是 OAuth
- 授权决策（这个用户能不能干这件事） → 那是 Authorization（如 RBAC / ABAC），OAuth 解决的是"这个 token 代表谁能干什么"

## 历史小故事（可跳过）

- **2007**：OAuth 1.0 发布，签名复杂得让人崩溃
- **2012**：RFC 6749 OAuth 2.0 发布，简化了流程，但留了太多可选项 → "OAuth 2.0 是个框架不是协议"
- **2015-2020**：6 篇 BCP/RFC 陆续补丁（PKCE、Native Apps、Device Flow、Resource Indicators...）
- **2020**：Aaron Parecki 起草 OAuth 2.1，把 must-have 收口成一份
- **2024+**：仍是 IETF Draft，但 Auth0 / Okta / Keycloak / GitHub / Google 都已按 2.1 出最佳实践

## 学到什么

1. **规范的演化是删功能不是加功能**——2.1 比 2.0 砍掉了一半 grant type
2. **可选项是协议设计的敌人**——OAuth 2.0 留了 4 种 flow + N 个可选参数，结果每个实现都不一样
3. **PKCE 是把"能藏 secret"变成"不需要藏 secret"**——一个数学小技巧解决一个工程大问题
4. **Authentication（你是谁）vs Authorization（你能干什么）要分清**：OAuth 2.1 是 Authorization，OIDC 才是 Authentication

## 延伸阅读

- 草案原文：[draft-ietf-oauth-v2-1](https://datatracker.ietf.org/doc/draft-ietf-oauth-v2-1/)
- Aaron Parecki 解读：[oauth.net/2.1](https://oauth.net/2.1/)（作者本人写的对照表）
- PKCE 详解：[RFC 7636](https://datatracker.ietf.org/doc/html/rfc7636)
- [[rest-fielding-2000]] —— OAuth 2.1 假设资源是 REST 风格

## 关联

- [[rest-fielding-2000]] —— OAuth 保护的资源默认是 REST API
- [[jwt-rfc-7519]] —— access_token 通常用 JWT 格式承载

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）

