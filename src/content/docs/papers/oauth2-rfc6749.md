---
title: OAuth 2.0 Authorization Framework (RFC 6749) — 不用把密码交给第三方，也能授权访问
来源: https://datatracker.ietf.org/doc/html/rfc6749
日期: 2026-06-13
子分类: 安全与隐私
分类: 安全与隐私
难度: 中级
provenance: pipeline-v3
---

## 是什么

OAuth 2.0 是一套**授权框架**：让第三方应用在**不拿到你的账号密码**的前提下，获得对你某部分资源的**有限、可撤销、有时效**的访问权。日常类比：酒店前台给你一张**只能开 1208 房、只能到明天中午**的房卡——你并没有把身份证和密码交给保洁公司，保洁凭房卡进房间，房卡到期或你挂失就失效。

RFC 6749（2012 年 10 月发布，Hardt 编辑）定义了这套框架的**角色、端点、四种标准授权类型（grant type）和 token 交换规则**。它刻意是「框架」而非完整产品：很多细节（token 格式、用户登录 UI、权限粒度）留给实现方和后续扩展规范（如 OpenID Connect、PKCE、Bearer Token Usage）。

**OAuth 解决的是授权（Authorization），不是认证（Authentication）。** 「这个用户是谁」通常要叠 OpenID Connect 的 `id_token` 或自建 session；「这个应用能不能读我的相册」才是 OAuth 的本职。

## 为什么重要

不理解 RFC 6749，现代 Web 登录会全是黑盒：

- 为什么「用 Google / GitHub 登录」页面会跳转到 `accounts.google.com`，而不是在你自己的站点输密码
- 为什么后端 API 验的是 `Authorization: Bearer eyJ...` 而不是用户名密码
- 为什么 SPA 和移动 App 不能照搬服务端「机密客户端 + client_secret」同一套做法
- 为什么 `access_token` 泄露和 `refresh_token` 泄露后果不同——前者通常短效，后者能续命
- 为什么安全审计会问「你们有没有用 Implicit、Password Grant」——RFC 6749 里合法，但现代最佳实践已淘汰或限用

OAuth 2.0 是**事实上的互联网授权标准**：GitHub、Google、Microsoft、Slack、Notion 的第三方集成，底层都是这套四角色 + token 模型。

## 四个角色

RFC 6749 把参与方固定成四个角色（记住这张图，后面所有 flow 都是它们的组合）：

| 角色 | 英文 | 日常类比 |
|------|------|----------|
| 资源所有者 | Resource Owner (RO) | 你——能决定是否授权的人 |
| 客户端 | Client | 第三方 App（打印服务、CI 工具、手机 App） |
| 授权服务器 | Authorization Server (AS) | 酒店前台——验你是谁、发房卡 |
| 资源服务器 | Resource Server (RS) | 1208 房间门锁——只认房卡，不管你怎么拿到的 |

协议主流程（RFC 6749 Section 1.2 的 ASCII 图）可以概括为六步：

```
(A) Client → RO：发起授权请求（通常经浏览器跳转）
(B) RO → Client：同意则带回 Authorization Grant（授权凭证）
(C) Client → AS：用 Grant 换 Access Token
(D) AS → Client：签发 Access Token（可选 Refresh Token）
(E) Client → RS：带 Access Token 访问受保护资源
(F) RS → Client：返回资源或拒绝
```

**关键设计**：Client 访问资源时用的是 **Access Token**，不是 RO 的长期凭证（密码）。Token 带 **scope**（权限范围）和 **lifetime**（有效期），RO 可在 AS 侧撤销。

## 两个核心端点

实现 OAuth 提供方时，至少要暴露两类 HTTP 端点：

1. **Authorization Endpoint**（授权端点）：面向**用户浏览器**，RO 在这里登录并点「同意授权」。成功则 **redirect** 回 Client 注册的 `redirect_uri`，带上 `code` 或（Implicit 下）`access_token`。
2. **Token Endpoint**（令牌端点）：面向 **Client 后端**（或受控环境），用 grant + 客户端凭证换 token。必须走 **POST**，且 AS 应要求 Client 认证（对机密客户端）。

Client 注册时 AS 会分配：

- `client_id`：公开标识，可出现在 URL 里
- `client_secret`：仅**机密客户端**持有，绝不能进浏览器或移动 App 安装包

Client 分两类（Section 2.1）：

- **Confidential**：能保密凭证——传统 Web 服务端、后台 job
- **Public**：无法保密——SPA、原生 App、CLI 装在别人机器上

## 四种标准 Grant Type

RFC 6749 Section 4 定义四种 grant，现代选型大致如下：

| Grant | 典型场景 | RFC 6749 地位 | 现代建议 |
|-------|----------|---------------|----------|
| Authorization Code | Web / 移动 App 代用户访问 | 首选通用 flow | 仍首选；配合 PKCE（RFC 7636，6749 之后） |
| Implicit | 纯浏览器 JS，token 经 redirect fragment 返回 | 曾用于 SPA | OAuth 2.1 已废弃；改用 Code + PKCE |
| Resource Owner Password | 高度信任的一方 App 直接用用户名密码换 token | 存在 | 仅限遗留/第一方；新系统避免 |
| Client Credentials | 机器对机器，无 RO | 存在 | Cron、微服务间调用仍常用 |

下面重点展开**最常用**的 Authorization Code 和 **Client Credentials**。

### Authorization Code Flow

适合：第三方 Web 应用要读你的 GitHub 仓库、Google 日历等。

时序：

1. Client 把用户浏览器重定向到 AS：
   `GET /authorize?response_type=code&client_id=...&redirect_uri=...&scope=read&state=xyz`
2. RO 在 AS 登录并同意 scope
3. AS 302 到 `redirect_uri?code=AUTH_CODE&state=xyz`
4. Client **后端**用 code 换 token（`grant_type=authorization_code`），带上 `client_secret`（机密客户端）
5. AS 返回 JSON：`access_token`、`token_type`（通常是 Bearer）、`expires_in`、可选 `refresh_token`

**为什么多一步 code？** Code 只走浏览器 redirect，**Access Token 只在 Client 与 AS 的服务端通道出现**，避免 token 泄露给浏览器历史、Referer 或恶意 JS。这是 6749 相对旧 Implicit 的核心安全改进。

`state` 参数：Client 生成的随机串，AS 原样带回，用于防 **CSRF**——确保回调确实对应当初那次授权请求。

### Client Credentials Flow

适合：定时任务拉取内部 API、两个微服务之间调用，**没有终端用户**。

Client 用自己的 `client_id` + `client_secret` 直接向 Token Endpoint 要 token，`scope` 表示它能做什么。RO 不参与。

## Scope、Token 与 Refresh

- **Scope**：空格分隔的权限字符串（如 `read:photos write:albums`）。AS 在同意页展示；RS 根据 token 内 scope 决定放行哪些 API。6749 **不规定** scope 语义——各 AS/RS 自行约定。
- **Access Token**：opaque 字符串或 JWT 均可，6749 不限格式；RS 验 token 有效性与 scope。
- **Refresh Token**：可选的长效凭证，用来在 Access Token 过期后静默续期，不必再打扰 RO 点同意。Refresh Token 必须**更安全地存储**（仅服务端、Keychain 等）。

Bearer Token 的 HTTP 用法在 **RFC 6750**（OAuth 2.0 Bearer Token Usage）里规定，6749 只负责「怎么签发」。

## 实践案例

### 案例 1：Authorization Code — 浏览器跳转 + 后端换 token

**Step 1 — 构造授权 URL（Client 服务端或模板渲染）：**

```python
from urllib.parse import urlencode
import secrets

state = secrets.token_urlsafe(16)
# 存入 session，回调时比对

params = urlencode({
    "response_type": "code",
    "client_id": "my-web-app",
    "redirect_uri": "https://app.example.com/oauth/callback",
    "scope": "repo:read user:email",
    "state": state,
})
auth_url = f"https://github.com/login/oauth/authorize?{params}"
# 302 用户到 auth_url
```

**Step 2 — 回调处理，用 code 换 token（必须在服务端，带 secret）：**

```python
import httpx

async def exchange_code(code: str) -> dict:
    resp = await httpx.AsyncClient().post(
        "https://github.com/login/oauth/access_token",
        headers={"Accept": "application/json"},
        data={
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": "https://app.example.com/oauth/callback",
            "client_id": "my-web-app",
            "client_secret": os.environ["OAUTH_CLIENT_SECRET"],
        },
    )
    resp.raise_for_status()
    return resp.json()
    # {"access_token": "...", "token_type": "bearer", "scope": "repo,read:user"}
```

**Step 3 — 用 Access Token 调资源 API：**

```python
headers = {"Authorization": f"Bearer {tokens['access_token']}"}
user = await httpx.AsyncClient().get(
    "https://api.github.com/user", headers=headers
)
```

整条链：**密码从未离开 GitHub；你的 App 只拿到有限 scope 的 token；用户可在 GitHub 设置里撤销授权。**

### 案例 2：Client Credentials — 机器对机器

夜间 ETL 任务要从内部 `metrics-api` 拉数据，没有用户点击「同意」：

```bash
curl -s -X POST https://auth.example.com/oauth/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials" \
  -d "client_id=etl-nightly" \
  -d "client_secret=${ETL_SECRET}" \
  -d "scope=metrics:read"
```

典型响应：

```json
{
  "access_token": "eyJhbGciOiJSUzI1NiIs...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "scope": "metrics:read"
}
```

Job 在 `expires_in` 秒内向 RS 发请求：

```bash
curl -s https://metrics-api.example.com/v1/daily \
  -H "Authorization: Bearer eyJhbGciOiJSUzI1NiIs..."
```

无 `refresh_token`——过期后重新用 client 凭证换即可。

### 案例 3：Public Client（SPA）在 6749 时代的 Implicit（了解即可）

RFC 6749 Section 4.2 规定 Implicit：`response_type=token`，token 出现在 redirect **fragment**（`#access_token=...`），不经过 Client 后端。

```
https://app.example.com/callback#access_token=TOKEN&token_type=Bearer&expires_in=3600
```

浏览器 JS 读 `location.hash` 取 token。**问题**：token 暴露在浏览器、Referer、前端日志；无法做 confidential 认证。因此 **OAuth 2.1 / 当前最佳实践** 要求 SPA 改用 **Authorization Code + PKCE**，不再新建 Implicit 集成。读 6749 时要知道 Implicit **在标准里存在**，但新项目不应选它。

## 安全要点（RFC 6749 Section 10 摘要）

1. **HTTPS  everywhere**：授权端点、token 端点、redirect_uri 必须 TLS（本地 loopback 除外需格外小心）。
2. **精确匹配 redirect_uri**：AS 必须白名单校验，防 open redirect 偷 code。
3. **勿把 client_secret 放进前端**：Public Client 用 PKCE 代替（7636）。
4. **state 防 CSRF**；Authorization Code 应**一次性、短有效期**。
5. **最小 scope**：只申请业务必需权限。
6. **Refresh Token 比 Access Token 更敏感**：泄露等于长期后门。

6749 原文 Security Considerations 仍是实现与审计的必读章节。

## 与周边规范的关系

RFC 6749 是「树干」，常见「树枝」：

| 规范 | 作用 |
|------|------|
| RFC 6750 | Bearer Token 在 HTTP 里怎么带 |
| RFC 7636 (PKCE) | Public Client 防 code 拦截 |
| OpenID Connect | 在 OAuth 之上标准化「认证」与 `id_token` |
| JWT (RFC 7519) | 常作为 Access Token 的自包含格式（非 6749 要求） |
| OAuth 2.1 草案 | 收敛最佳实践：废 Implicit/Password，默认 PKCE |

学 6749 是读这些扩展的**前提**——角色、grant、端点名词在各文档里保持一致。

## 踩过的坑

1. **把 OAuth 当登录协议**：只拿 `access_token` 无法可靠知道「用户是谁」；要 OIDC 的 `openid` scope + `id_token`，或自己用 token 调 `/userinfo` 再建 session。
2. **SPA 照搬服务端 Code Flow 却不做 PKCE**：`client_secret` 无法保密时，code 被截获即可换 token。
3. **redirect_uri 少写一个 trailing slash**：注册 `https://app/callback` 回调却是 `https://app/callback/` → AS 直接拒绝。
4. **Implicit 的 token 进服务器日志**：nginx access log 可能记 full URL fragment 前的 path；更糟的是把 token 写进 `localStorage` 被 XSS 一锅端。
5. **不校验 `state`**：攻击者把自己的 code 绑到你的 session，造成 **会话固定 / CSRF**。
6. **Password Grant 图省事**：把用户密码 POST 给第三方 Client，违背 OAuth 初衷；仅遗留第一方场景可接受。

## 自测题

1. 四个角色分别是什么？Client 和 Authorization Server 能不能是同一套软件（同一公司）？
2. Authorization Code 为什么比 Implicit 更适合机密 Web 应用？
3. `scope`、`access_token`、`refresh_token` 各解决什么问题？
4. Client Credentials 适用什么场景？为什么没有 refresh token 也常见？
5. 若只做「Social Login」，6749  alone 够吗？还需要什么？

## 进一步阅读

- [RFC 6749 原文](https://datatracker.ietf.org/doc/html/rfc6749) — 框架定义与 Security Considerations
- [RFC 6750 Bearer Token Usage](https://datatracker.ietf.org/doc/html/rfc6750)
- [RFC 7636 PKCE](https://datatracker.ietf.org/doc/html/rfc7636)
- [OAuth 2.0 Simplified](https://www.oauth.com/oauth2-servers/) — 实现导向的教程站
- [OAuth 2.1 Draft](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-v2-1-11) — 现代 profile 收敛
