---
title: Authentik — 自托管开源 IdP，把 SSO/OAuth/SAML 做成可编排的登录中枢
来源: https://github.com/goauthentik/authentik
日期: 2026-06-13
子分类: security
分类: 安全与隐私
难度: 中级
provenance: pipeline-v3
---

## 是什么

Authentik（常写作 **authentik**）是一个**开源、可自托管的身份提供商（Identity Provider, IdP）**，专门做现代单点登录（SSO）。日常类比：

> 公司里有一二十个系统：GitLab、Grafana、内部 Wiki、VPN 门户……每个都要账号密码，员工离职还要逐个删。
> 你可以想象 Authentik 是**大楼前台**：员工只在前台刷一次工牌（登录一次），前台根据权限发不同楼层的临时通行证（OAuth token / SAML assertion），各楼层门禁只认这张证，不再各自维护一份员工名册。

和「在应用里手写登录页」不同，Authentik 站在**应用外侧**：应用变成 OAuth Client 或 SAML Service Provider，把「谁已登录、属于哪个组」这件事交给 IdP 裁决。GitHub 上 stars 超过 2 万，常被拿来与 Keycloak、Okta、Auth0、Entra ID 对比——区别是 Authentik 强调**自托管 + 可视化 Flow 编排 + Blueprint 基础设施即代码**。

## 为什么重要

如果你在做 homelab、中小企业内网、或需要合规自管身份数据，不理解 Authentik 会卡在这些问题上：

- **为什么 Grafana / Nextcloud / GitLab 可以「Sign in with XXX」**：背后是 OIDC Authorization Code Flow，IdP 发 `id_token` + `access_token`，应用只验证签名和 audience
- **为什么企业采购 Okta 很贵，homelab 却用 Authentik**：同一套协议（SAML 2.0、OAuth2/OIDC、LDAP、RADIUS、SCIM），Authentik 社区版 MIT 开源，数据留在自己 Postgres 里
- **为什么改 MFA、密码策略、社交登录不用改业务代码**：Authentik 把登录 UI 和策略抽成 **Flow + Stage + Policy**，在管理后台拖拽或 YAML Blueprint 声明
- **为什么反向代理后面的老应用也能 SSO**：**Proxy Provider + Outpost** 在应用前面做认证网关，应用本身甚至不知道 OAuth 存在

## 核心要点

Authentik 的世界观可以拆成 **六块积木**：

### 1. Application（应用）与 Provider（协议适配器）

每个要接入 SSO 的系统在 Authentik 里先建 **Application**（给人看的名字、图标、启动 URL），再绑一个 **Provider**（真正跑协议的实体）：

| Provider 类型 | 典型场景 |
|---------------|----------|
| OAuth2 / OpenID Connect | Grafana、Next.js、现代 SaaS |
| SAML | 传统企业软件、部分云厂商控制台 |
| LDAP | 需要目录协议的老系统、NAS |
| Proxy | 没有原生 SSO、只有 HTTP Basic 的遗留应用 |
| RADIUS | Wi‑Fi / VPN 拨号 |

官方推荐用 **Create with provider** 一次性创建应用 + 提供商，避免 Client ID / Redirect URI 配错一半。

### 2. Flow（流程）与 Stage（阶段）

登录、注册、找回密码、MFA 都不是硬编码页面，而是 **Flow** 串联多个 **Stage**：

- `Identification Stage`：收集用户名/邮箱
- `Password Stage`：验密码
- `Authenticator Validate Stage`：TOTP / WebAuthn
- `User Login Stage`：写 session、发 cookie

类比：**Flow 是剧本，Stage 是场景**；改 MFA 策略 = 在剧本里插入一个场景，不用 fork 整个登录代码。

### 3. Policy（策略）与 Group（组）

Policy 决定「谁能过这个 Stage / 谁能访问这个 Application」——可按组、属性、时间、表达式绑定。Group 映射到下游应用的 **角色**（例如 Grafana Admin / Editor）。

### 4. Source（身份来源）——双向联邦

- **作为 IdP**：你的应用信任 Authentik 签发的 token（最常见）
- **作为 SP（SAML Source）**：用户从公司现有 IdP（如 Azure AD）登录，Authentik 再给内部应用发 session——适合渐进迁移

### 5. Outpost（前哨）

Proxy / LDAP 等 Provider 的逻辑跑在 **Outpost** 容器里（靠近应用或反向代理），通过 WebSocket 从 Core 拉配置。好处：低延迟、可进隔离网段、Core 不必暴露给所有子网。

### 6. Blueprint（配置即代码）

Blueprints 是 YAML 文件，描述 Flow、Provider、Application 等对象；可挂载到 worker 的 `/blueprints` 目录，约每 60 分钟自动 reconcile，也可从 OCI 仓库 `oci://ghcr.io/...` 拉取——适合 GitOps / Terraform 旁路管理。

## 实践案例

### 案例 1：Docker Compose 最小安装

官方推荐测试与小规模生产用 Compose（至少 2 CPU / 2 GB RAM）：

```bash
# 下载官方 compose 模板
wget https://docs.goauthentik.io/compose.yml

# 生成数据库密码与实例密钥（写入 .env）
echo "PG_PASS=$(openssl rand -base64 36 | tr -d '\n')" >> .env
echo "AUTHENTIK_SECRET_KEY=$(openssl rand -base64 60 | tr -d '\n')" >> .env

# 可选：改对外端口
echo "COMPOSE_PORT_HTTP=9000" >> .env
echo "COMPOSE_PORT_HTTPS=9443" >> .env

docker compose pull
docker compose up -d
```

**逐行说明**：

- `server` 容器跑 Web UI + API（默认 9000/9443）；`worker` 跑异步任务、Blueprint、Outpost 编排
- `PG_PASS` 喂给内嵌 PostgreSQL；`AUTHENTIK_SECRET_KEY` 用于加密 session、签名 cookie——**丢了就要按文档轮换，旧 session 全失效**
- 默认 worker 挂载 `/var/run/docker.sock` 以便自动起 Outpost；生产环境可改用 Docker Socket Proxy 或手动部署 Outpost 降低风险
- 容器内时间请保持 **UTC**，不要挂宿主 `/etc/timezone`，否则 OAuth/SAML 的 `exp` 校验会莫名其妙失败

首次访问 `https://<host>:9443/if/flow/initial-setup/` 创建管理员，然后在 **Applications → Create with provider** 向导里接入第一个应用。

### 案例 2：Grafana 走 OIDC（应用侧配置）

在 Authentik 里创建 **OAuth2/OpenID Provider**，记下 Client ID、Client Secret、Application slug。Grafana `docker-compose` 环境变量示例（来自官方文档）：

```yaml
environment:
  GF_AUTH_GENERIC_OAUTH_ENABLED: "true"
  GF_AUTH_GENERIC_OAUTH_NAME: "authentik"
  GF_AUTH_GENERIC_OAUTH_CLIENT_ID: "<Client ID from authentik>"
  GF_AUTH_GENERIC_OAUTH_CLIENT_SECRET: "<Client Secret from authentik>"
  GF_AUTH_GENERIC_OAUTH_SCOPES: "openid profile email"
  GF_AUTH_GENERIC_OAUTH_AUTH_URL: "https://authentik.company/application/o/authorize/"
  GF_AUTH_GENERIC_OAUTH_TOKEN_URL: "https://authentik.company/application/o/token/"
  GF_AUTH_GENERIC_OAUTH_API_URL: "https://authentik.company/application/o/userinfo/"
  GF_AUTH_SIGNOUT_REDIRECT_URL: "https://authentik.company/application/o/<slug>/end-session/"
  GF_AUTH_OAUTH_AUTO_LOGIN: "true"
  GF_AUTH_GENERIC_OAUTH_ROLE_ATTRIBUTE_PATH: "contains(groups[*], 'Grafana Admins') && 'Admin' || contains(groups[*], 'Grafana Editors') && 'Editor' || 'Viewer'"
  GF_SERVER_ROOT_URL: "https://grafana.company"
```

**关键点**：

- Authentik 里必须把 Redirect URI 设成 **Strict** 模式下的 `https://grafana.company/login/generic_oauth`，多一个斜杠都会 `redirect_uri_mismatch`
- `ROLE_ATTRIBUTE_PATH` 用 OIDC userinfo 里的 `groups` 声明映射 Grafana 角色——组名要在 Authentik 里先建好并绑定用户
- 登出要走 `end-session` URL，否则只清了 Grafana session、IdP 仍登录，点「用 Authentik 登录」会静默成功（有时这是期望，有时是安全隐患）

### 案例 3：用 Blueprint 声明一个 OIDC 应用（基础设施即代码）

把下面 YAML 放到 worker 可读的 `/blueprints/my-grafana.yaml`，或通过 Admin → Blueprints → Create instance 导入：

```yaml
# yaml-language-server: $schema=https://goauthentik.io/blueprints/schema.json
version: 1
metadata:
  name: grafana-oidc
  labels:
    blueprints.goauthentik.io/instantiate: "true"
entries:
  - model: authentik_providers_oauth2.oauth2provider
    id: grafana-provider
    attrs:
      name: Grafana OIDC
      client_type: confidential
      redirect_uris:
        - matching_mode: strict
          url: https://grafana.company/login/generic_oauth
      signing_key: !Find [authentik_crypto.certificatekeypair, [], ["name", "authentik Self-signed Certificate"]]
  - model: authentik_core.application
    id: grafana-app
    attrs:
      name: Grafana
      slug: grafana
      provider: !KeyOf grafana-provider
      meta_launch_url: https://grafana.company
      meta_icon: https://grafana.com/static/assets/img/grafana_icon.svg
```

**说明**：

- `!Find` / `!KeyOf` 是 Authentik Blueprint 的自定义 YAML 标签，用来引用已有对象或同文件内条目
- `labels` 里 `instantiate: "true"` 表示 worker 自动实例化；改文件后约 60 分钟内 reconcile
- 生产环境应把 Client Secret 交给 Sealed Secret / 外部 vault，Blueprint 只引用，不要明文进 Git

### 案例 4：用 API 列出用户（自动化运维）

每个实例自带 OpenAPI 3 浏览器：`https://authentik.company/api/v3/`。用 **API Token**（Admin → Directory → Tokens）调用：

```bash
export AUTHENTIK_URL="https://authentik.company"
export AUTHENTIK_TOKEN="your-api-token"

curl -s -H "Authorization: Bearer ${AUTHENTIK_TOKEN}" \
  "${AUTHENTIK_URL}/api/v3/core/users/?page_size=5" | jq '.results[] | {username, name, email, is_active}'
```

适合写离职脚本：先 `is_active=false`，再吊销各应用 refresh token，比手工点 UI 可审计。

## OIDC 登录时序（脑内模型）

```text
用户浏览器          Grafana (RP)              Authentik (IdP)
    |                    |                          |
    |-- 访问 / ---------->|                          |
    |<-- 302 /login -----|                          |
    |-- 点 OAuth 登录 --->|                          |
    |<-- 302 authorize --|------------------------->|
    |<-- 登录 Flow UI ------------------------------|
    |-- 提交凭据 ---------------------------------->|
    |<-- 302 redirect?code=xxx ----------------------|
    |------------------ code ----------------------->|
    |                    |--- POST /token --------->|
    |                    |<-- access_token + id_token
    |<-- Set-Cookie -----|                          |
```

记住三个 URL：`/authorize/`（用户.redirect）、`/token/`（后端换票）、`/userinfo/`（拿 groups/email）。

## 踩过的坑

1. **Redirect URI 大小写与尾斜杠**：OIDC Strict 模式下 `https://app/callback` 和 `https://app/callback/` 是两个 URI；从应用文档复制时最容易踩坑。

2. **时钟漂移**：容器时区乱改会导致 `iat`/`exp` 校验失败，表现是「登录成功立刻掉线」。保持 UTC，用 NTP 同步宿主。

3. **忘记 Outpost**：Proxy Provider 建了却没人访问，因为 Outpost 没部署或没绑 Application；看 **Applications → Outposts** 健康状态。

4. **Blueprint 与 UI 双写冲突**：同一对象既在 UI 手改又在 Blueprint 声明，reconcile 会以 Blueprint 为准覆盖——团队要约定「谁是 source of truth」。

5. **PostgreSQL 密码长度**：官方文档提醒 PG 密码不要超过 99 字符，否则 PostgreSQL 自身限制会装不上。

6. **把 Authentik 当应用数据库**：它是 IdP，不是用户业务数据的 ORM；应用仍应维护自己的 `user_id` 映射表（用 `sub` 或 email 做外键）。

## 适用 vs 不适用

**适用**：

- 自托管 homelab / 中小企业，要统一登录 Grafana、GitLab、Vaultwarden、Nextcloud 等
- 需要 SAML + OIDC + LDAP 多种协议混搭，不想为每个协议单独部署组件
- 想用可视化 Flow 快速上 MFA、社交登录，同时保留 Blueprint/GitOps
- 空气隔离网、离线环境——Outpost 可在内网独立运行

**不适用**：

- 只有单个 Next.js 应用、用户量 < 1k——直接 [[better-auth]] 或 [[auth-js]] 嵌在应用里更轻
- 团队零运维意愿、宁可按月付费——Clerk / Auth0 / WorkOS 省心力
- 已深度绑定 Keycloak 生态且团队熟悉——迁移成本要单独评估
- 需要全球多区域主动高可用 SLA——自建 IdP 的运维责任在你

## 与 Keycloak / 云 IdP 的粗略对比

| 维度 | Authentik | Keycloak | Auth0 / Okta |
|------|-----------|----------|----------------|
| 许可 | MIT（社区版） | Apache 2.0 | 商业订阅 |
| 上手曲线 | Flow UI 友好 | 概念多、配置繁 | 托管省心 |
| 协议 | OIDC/SAML/LDAP/RADIUS/SCIM | 同类齐全 | 同类 + 生态集成 |
| 配置即代码 | Blueprint YAML | Realm export JSON | Terraform 提供商 |
| 资源占用 | 中等（PG+Redis） | 偏重（JVM） | 无自管 |

## 历史小故事（可跳过）

- **2019 年底**：项目以 `goauthentik/authentik` 开源，定位「安全优先、协议灵活的 IdP」
- **2021–2023**：Blueprint、Outpost、Proxy Provider 逐渐成熟，homelab 社区快速扩散
- **2024–2026**：GitHub stars 突破 2 万，企业版对标 Okta/Entra 迁移场景；版本号改为日历式（如 `2025.2.x`）

## 学到什么

1. **SSO 的核心是信任链**：IdP 私钥签名 → RP 公钥验证 → `sub`/`groups` 映射本地权限；应用不应再信任自报的 `role` 字段
2. **Flow 抽象把「登录 UX」从业务代码里剥离**：改 MFA 是改配置，不是发版
3. **Outpost 是「边缘执行、中心治理」模式**：和 Istio sidecar、Cloudflare Workers 的思路同构——策略在控制面，执行在数据面
4. **Blueprint 让 IdP 配置可版本化**：终于能把「谁有 Grafana Admin」写进 PR review

## 延伸阅读

- 官方文档：[docs.goauthentik.io](https://docs.goauthentik.io/)（First steps、Provider、Flow、Outpost）
- 仓库：[goauthentik/authentik](https://github.com/goauthentik/authentik)
- API：[API Overview](https://docs.goauthentik.io/developer-docs/api/)
- Blueprints：[Blueprints](https://docs.goauthentik.io/customize/blueprints/)

## 关联

- [[better-auth]] —— 应用内嵌认证框架；Authentik 是组织级外置 IdP，二者可并存（应用仍用 better-auth，社交登录接 Authentik OIDC）
- [[auth-js]] —— 若只需单应用 OAuth Client，Auth.js 够用；多应用统一身份才需要 Authentik
- [[nginx]] —— 常与 Proxy Outpost 配合，在反向代理层做 `auth_request` 式 SSO
- [[kubernetes]] —— 生产推荐 Helm 部署 Authentik 与 Outpost
- [[postgresql]] —— Authentik 默认依赖 PostgreSQL 存配置与用户
- [[redis]] —— 缓存与任务队列，Compose 安装标配
- [[oauth2-rfc6749]] —— 理解 Authorization Code Flow 的 RFC 基础
- [[tls-1-3-rfc8446]] —— 生产环境 HTTPS 与证书轮换

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
