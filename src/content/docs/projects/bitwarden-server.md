---
title: Bitwarden Server — 密码管理器后端
来源: https://github.com/bitwarden/server
日期: 2026-06-13
子分类: 安全与隐私
分类: 安全与隐私
provenance: pipeline-v3
---

## 是什么

Bitwarden Server 是开源密码管理器 **Bitwarden 的后端**：所有客户端（浏览器扩展、桌面、手机、CLI）同步密码、登录、组织共享时，背后连的都是这套 C# / ASP.NET Core 服务集群。

日常类比：

- **客户端（Bitwarden App）** = 你家里的**带锁保险箱**：真正开锁、读写密码本的动作只在你手上完成
- **Bitwarden Server** = 银行租给你的**保管库格子**：只存已经上锁的箱子，银行职员看不到里面是什么
- **Identity 服务** = 大堂的**门禁系统**：验你是不是账户本人，但不替你打开保险箱
- **API 服务** = **收发室**：帮你把上锁的箱子在不同设备之间搬运，从不拆封

这和「把密码明文存进自家数据库」完全不同：服务器存的是密文 blob，解密密钥永远不下发到服务端。

## 为什么重要

密码管理是零信任时代的基础设施。理解 Bitwarden Server，能解释一连串工程问题：

- 为什么官方强调 **zero-knowledge（零知识）**——服务端被拖库也拿不到主密码
- 为什么架构是 **9+ 个微服务** 而不是一个单体——认证、计费、通知、审计可以独立扩缩容
- 为什么自建（self-host）和云端共用同一套代码，只靠 `GlobalSettings.SelfHosted` 切换行为
- 为什么企业版额外有 **SSO / SCIM** 服务——把密码库接到公司 IdP 和 HR 系统

对后端开发者来说，它是学习 **OAuth 2.0 / OIDC、SignalR 实时推送、多数据库适配、Docker 编排** 的完整样本；对安全从业者，它是 **客户端加密 + 服务端盲存** 的教科书实现。

## 核心概念

### 1. 零知识架构（Zero-Knowledge）

加密 / 解密 **只在客户端** 发生。流程可以概括为：

```
主密码 + 邮箱(salt)
  └─> KDF (PBKDF2 / Argon2id) → Master Key
      └─> HKDF → 对称加密密钥 + MAC 密钥
          └─> 解密「受保护的用户密钥」→ User Key
              └─> 解密每条 Cipher（密码条目）
```

服务端只保存：

- 主密码的 **哈希**（用于登录验证，不可逆）
- **加密后的** User Key、Cipher 字段、附件元数据

主密码和明文 User Key **从不** 传到服务器。管理员重置账户也 **不能** 替你恢复 vault 内容——这是设计特性，不是 bug。

### 2. 微服务拆分

| 服务 | 职责 |
|------|------|
| **API** | 主 REST API：vault、组织、文件夹、Send、导入导出 |
| **Identity** | OAuth 2.0 / OpenID Connect（基于 Duende IdentityServer） |
| **Admin** | 自建实例管理门户 |
| **Notifications** | SignalR WebSocket，多设备实时同步 |
| **Events** / **EventsProcessor** | 审计日志与异步处理 |
| **Icons** | 为站点抓取 favicon（可选） |
| **Billing** | Stripe 订阅（云端） |
| **SSO** / **SCIM** | 企业 SAML/OIDC 与自动开户（Enterprise） |

所有服务共享 **`Core` 库**（业务逻辑、Repository 接口、邮件、特性开关），各自有独立的 `Startup.cs`，在 `ConfigureServices` 里按固定顺序注册依赖：

`AddGlobalSettingsServices` → `AddDatabaseRepositories` → `AddBaseServices` → `AddDefaultServices`。

### 3. GlobalSettings 与自建模式

`GlobalSettings` 从 `appsettings.json` + 环境变量加载，是整站的「总开关」：

- `SelfHosted = true`：路径路由（`/identity`、`/admin`）、关闭云端限流、简化外部依赖
- `DatabaseProvider`：SQL Server / PostgreSQL / MySQL
- `BaseServiceUri`：各微服务对外 URL（反向代理后面尤其重要）

自建 Docker 部署时，安装脚本 `bitwarden.sh` 会生成 `.env` 和 `docker-compose` 编排，镜像来自 `ghcr.io/bitwarden/*`。

### 4. 数据模型：Cipher

Vault 里每一条记录（登录、卡、身份、安全笔记）在数据库里是一个 **Cipher** 行。敏感字段（`name`、`login.password`、`notes` 等）各自是 **EncString**——客户端加密后的字符串。服务端 API 只做 CRUD 和同步冲突检测，不解密内容。

组织共享时，Cipher Key 用 **组织对称密钥** 加密；成员通过 RSA 密钥交换拿到 Org Key——仍然全程密文传输。

### 5. 技术栈一览

- **运行时**：.NET 8 / ASP.NET Core
- **数据库**：SQL Server（默认）、PostgreSQL、MySQL；EF Core + Dapper 双轨
- **认证**：Duende IdentityServer、JWT Bearer、2FA / WebAuthn
- **实时**：SignalR（Notifications 服务）
- **部署**：Docker Compose（自建）、Kubernetes（生产）、Nginx 反代
- **对象存储**：Azure Blob / S3 兼容（附件、Send 文件）

## 代码示例

### 示例 1：API 服务启动时的依赖注册（节选）

每个微服务的 `Startup.ConfigureServices` 都遵循同一模式。下面是 API 服务的典型片段（简化自 `src/Api/Startup.cs`）：

```csharp
public void ConfigureServices(IServiceCollection services)
{
    // 1. 全局配置（含 SelfHosted、数据库连接、服务 URI）
    var globalSettings = services.AddGlobalSettingsServices(Configuration, Environment);

    // 2. 数据访问层：40+ Repository（User、Cipher、Organization…）
    services.AddDatabaseRepositories(globalSettings);

    // 3. 基础设施：邮件、事件、特性开关
    services.AddBaseServices(globalSettings);
    services.AddDefaultServices(globalSettings);

    // 4. 身份认证：JWT + OAuth scope "api"
    services.AddCustomIdentityServices(globalSettings);
    services.AddIdentityAuthenticationServices(globalSettings, Environment, config =>
    {
        config.AddPolicy(Policies.Application, policy =>
        {
            policy.RequireAuthenticatedUser();
            policy.RequireClaim(JwtClaimTypes.Scope, ApiScopes.Api);
        });
    });

    // 5. 业务模块：计费、导入、Send 等
    services.AddBillingOperations();
    services.AddImportServices();
    services.AddSendServices();
}
```

读懂这段，就理解「为什么改 vault 逻辑往往动 `Core`，而 HTTP 路由在 `Api` 的 Controller」。

### 示例 2：Linux 上一键自建（官方脚本）

生产环境推荐用官方安装脚本，而不是手搓 compose：

```bash
# 下载安装器
curl -s -L -o bitwarden.sh \
  "https://func.bitwarden.com/api/dl/?app=self-host&platform=linux"
chmod +x bitwarden.sh

# 交互式安装：域名、SSL、数据库、Installation Id/Key
./bitwarden.sh install

# 启动全部容器（api、identity、nginx、mssql…）
./bitwarden.sh start

# 常用运维
./bitwarden.sh status
./bitwarden.sh updateself  # 拉取新镜像
./bitwarden.sh renewcert   # Let's Encrypt 续期
```

安装完成后，Nginx 把 `/api`、`/identity`、`/notifications` 等路径转发到对应容器。`config.yml` 里可改 `database` 为 `postgresql` 等。

### 示例 3：本地开发跑单个 API 项目

贡献者克隆仓库后，可只起 API 做接口调试（需先配数据库与 user secrets）：

```bash
git clone https://github.com/bitwarden/server.git
cd server

# 按 contributing 文档：Docker 起 MSSQL、跑 migrate.ps1、setup_secrets.ps1
cd src/Api
dotnet run
# 开发环境 Swagger：http://localhost:4000/docs
```

自建开发配置用 `Api-SelfHost` launch profile，端口通常比云端实例 **+1**（例如 API 在 4001），以便两套环境并行。

### 示例 4：用 curl 访问同步 API（概念演示）

客户端同步 Cipher 时调用 REST API。以下展示 **请求形态**（`Bearer` 令牌来自 Identity 的 OAuth 流程；body 里的字段已是客户端加密后的密文）：

```bash
# 获取 access token（密码式登录仅用于测试；生产应用用授权码 + PKCE）
TOKEN=$(curl -s -X POST "https://your-domain.com/identity/connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=password&username=user@example.com&password=***&scope=api offline_access" \
  | jq -r .access_token)

# 列出 vault 中的 cipher（返回 JSON，字段值为 EncString）
curl -s "https://your-domain.com/api/ciphers" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json"
```

服务端返回的 `login.password` 形如 `2.xxx|xxx`——类型前缀 + Base64 密文。没有 User Key 就无法还原明文。

## 请求链路（自建典型）

```text
浏览器 / 扩展
    │
    ▼
Nginx (443)  ──路径分发──┬── /identity  → Identity 容器（登录、发 token）
                         ├── /api       → API 容器（vault CRUD）
                         ├── /notifications → SignalR 推送
                         └── /admin     → 管理后台
    │
    ▼
SQL Server / PostgreSQL（vault 库：User、Cipher、Organization…）
```

登录时：客户端 → Identity 验证密码哈希 → 发 JWT。之后 API 请求带 JWT，API 服务 **不** 再验证主密码，只鉴权并读写密文记录。密码修改时，客户端本地重加密 User Key 和新 Cipher，再 PUT 回 API。

## 与 Vaultwarden 的区别

很多人自建时用的是 **Vaultwarden**（Rust 重写的兼容实现），不是官方 Server：

| 维度 | Bitwarden Server | Vaultwarden |
|------|------------------|-------------|
| 语言 | C# / .NET | Rust |
| 资源占用 | 多容器，内存较高 | 单容器，极轻量 |
| 协议 | 官方标准 | API 兼容 Bitwarden 客户端 |
| 企业功能 | SSO/SCIM/完整审计 | 部分缺失或简化 |
| 许可 | 源码可见，部署需关注许可条款 | GPL |

学 **官方架构、企业集成、加密协议演进**，应读 Bitwarden Server + `clients` 仓库；学 **树莓派上跑个轻量密码库**，Vaultwarden 更合适。

## 安全与运维要点

1. **HTTPS 必开**：安装脚本可自动申请 Let's Encrypt；自签证书需导入所有客户端
2. **备份数据库 + `bwdata` 目录**：丢库 = 丢密文；没有主密码仍无法解密
3. **Installation Id/Key**：自建实例向 Bitwarden 云注册（部分功能需要），开发环境要在云库 `Installation` 表插入对应记录
4. **及时 `updateself`**：安全补丁随 Docker 镜像发布，版本号如 `v2026.6.0`
5. **不要把 `adminToken` 暴露到公网**：Admin 门户能改实例级配置

## 源码阅读路线（零基础）

1. **README + `docker/`**：先搞清部署拓扑，别一头扎进 C#
2. **`src/Core`**：`Cipher`、`User` 实体，`ICipherRepository`，`UserService`——业务心脏
3. **`src/Api/Vault`**：`CiphersController`——REST 如何映射到 Service
4. **`src/Identity`**：OAuth 客户端、grant type、2FA 流程
5. **`bitwarden-server.mintlify.app`**：官方架构文档与 API 说明
6. **`clients` 仓库加密文档**：把「客户端干什么」和「服务端干什么」对齐

## 常见坑

- **混用云端与自建端口**：开发时 SelfHost profile 端口 +1，web 客户端要用 `build:oss:selfhost:watch` 指对 API
- **只备份文件不备份库**：附件在 blob/S3，元数据在 SQL，缺一不可
- **以为管理员能重置主密码并看到密码**：只能重置 **登录**；vault 内容仍不可恢复
- **PostgreSQL 大小写**：迁移脚本和连接串要与 `GlobalSettings` 一致

## 延伸阅读

- 官方仓库：https://github.com/bitwarden/server
- 架构文档：https://bitwarden-server.mintlify.app/introduction
- 加密实现：https://bitwarden-server.mintlify.app/operations/encryption
- 贡献者自建指南：https://contributing.bitwarden.com/getting-started/server/self-hosted/
- 客户端密码学：https://bitwarden-clients.mintlify.app/guide/cryptography
- 相关笔记：[[oauth2-rfc6749]]（Identity 协议基础）、[[tls-1-3-rfc8446]]（传输层）、[[postgresql]]（可选数据库后端）

## 小结

Bitwarden Server 不是「又一个 CRUD 后台」，而是 **在服务端不可信前提下** 设计的同步与协作系统：微服务负责认证、存储、审计、计费；**信任边界在客户端主密码**。从零学习时，先建立「保险箱 vs 保管库」的心智模型，再按 Docker 部署 → API/Identity 源码 → 加密白皮书 的顺序深入，比直接啃 Controller 省力得多。
