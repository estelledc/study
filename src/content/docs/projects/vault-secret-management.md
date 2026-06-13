---
title: "HashiCorp Vault: Secrets and Encryption Management"
来源: https://github.com/hashicorp/vault
date: 2026-06-13
分类: 基础设施
子分类: 密钥管理
provenance: pipeline-v3

---

# HashiCorp Vault: 密钥与加密管理

## 什么是 Vault？

先问一个问题：你的程序里，数据库密码存在哪？

如果答案是"写在配置文件里"或者"硬编码在代码中"，那这就是一个安全隐患。任何能读到这个文件的人，都能拿到密码。

Vault 做的事情很简单：它像一个超级保险柜，专门用来存放和管理所有需要严格控制的敏感数据——API 密钥、数据库密码、证书等等。

日常类比：想象你有一把万能钥匙，能打开公司所有房间。你把这把钥匙放在一个有指纹锁的铁盒子里。只有经过授权的人，才能通过验证身份来临时借用这把钥匙，而且借用是有时间限制的，到期自动收回。Vault 就是这个铁盒子。

## 核心概念

### 1. Secret（密钥）

Secret 就是任何你需要控制访问权限的敏感数据。比如：

- 数据库的登录凭证
- AWS 的 API 密钥
- SSL/TLS 证书
- 第三方服务的 Token

Vault 的核心价值在于：数据在写入 Vault 之前就会被加密，即使有人直接访问了 Vault 的底层存储，拿到的也是密文。

### 2. Secrets Engine（密钥引擎）

Secrets Engine 是 Vault 的核心组件，负责存储、生成或加密数据。你可以把它理解成保险柜里的不同"抽屉"，每个抽屉有不同的功能：

- **Key/Value (KV)**：最简单的存储方式，类似加密的键值对数据库
- **Database**：动态生成数据库凭据
- **PKI**：生成和管理证书
- **Transit**：提供加密即服务（数据不存储在 Vault 中，只做加解密计算）
- **AWS**：动态生成 AWS 访问密钥

每个 Secrets Engine 挂载在一个路径上，比如 `secret/`、`database/`、`pki/`。Vault 像一个虚拟文件系统，每个引擎定义自己的路径和操作。

### 3. Policy（策略）

Vault 默认拒绝所有访问（deny by default）。要获得权限，管理员必须编写策略。

策略用 HCL（HashiCorp Configuration Language）编写，通过路径匹配来控制谁可以做什么：

```hcl
# 允许读取 secret/foo 路径的数据
path "secret/foo" {
  capabilities = ["read"]
}

# 允许对所有 secret/* 路径进行读写操作
path "secret/*" {
  capabilities = ["create", "read", "update", "delete"]
}

# 显式拒绝访问某个敏感路径（优先级最高）
path "secret/admin-password" {
  capabilities = ["deny"]
}
```

常见的权限能力（capabilities）包括：

- `create`：创建数据
- `read`：读取数据
- `update`：更新数据
- `delete`：删除数据
- `list`：列出路径下的所有键
- `sudo`：访问受保护的路径

### 4. Lease（租约）

Vault 中的每个密钥都有一个租约（lease），相当于借用期限。租约到期后，Vault 会自动回收（revoke）这个密钥。这确保了：

- 密钥不会永久有效
- 泄露的密钥有时间窗口限制
- 应用可以在租约到期前续期（renew）

### 5. Token（令牌）

Token 是你访问 Vault 的身份凭证。每次认证成功都会获得一个新的 Token，Token 上绑定了对应的策略，决定了你能访问哪些路径。

### 6. Seal / Unseal（封禁/解封）

Vault 启动后默认处于"封禁"状态，无法使用。需要通过分片密钥（Shamir's Secret Sharing）由多名管理员共同解封。这是为了防止任何人单独访问 Vault 中的数据。

## 实际使用示例

### 示例一：使用 Key/Value 引擎存储和读取密钥

这是最基础的用法。先启用 KV 引擎，然后存数据、取数据。

```bash
# 1. 启动 Vault 开发模式服务器（仅限本地开发使用）
vault server -dev -dev-root-token-id="myroot"

# 2. 设置环境变量指向本地 Vault
export VAULT_ADDR='http://127.0.0.1:8200'
export VAULT_TOKEN='myroot'

# 3. 启用 KV v2 版本引擎（v2 支持版本历史）
vault secrets enable -path=secret kv-v2

# 4. 写入一个密钥（用户名和密码）
vault kv put secret/database \
    username="app_user" \
    password="s3cur3_p@ssw0rd!" \
    host="db.example.com" \
    port="5432"

# 5. 读取刚才存入的密钥
vault kv get secret/database

# 输出类似：
# ====== Metadata ======
# Key              Value
# ---              -----
# created_time     2026-06-13T10:00:00.000000+08:00
# deletion_time    unset
# destroyed        false
# version          1
#
# ===== Data =====
# Key       Value
# ---       -----
# username  app_user
# password  s3cur3_p@ssw0rd!
# host      db.example.com
# port      5432
```

注意：KV v2 和 v1 的区别在于 v2 保留了数据的历史版本，并且删除操作实际上是标记删除（软删除），可以通过版本恢复。

### 示例二：动态生成数据库凭据

这是 Vault 最强大的功能之一。传统方式是你在数据库里创建一个固定的账户，所有应用共用同一个密码。Vault 可以做到：每次应用请求数据库连接时，Vault 自动在数据库中创建一个临时的、有权限限制的账户，用完就自动销毁。

```bash
# 1. 启用数据库密钥引擎
vault secrets enable database

# 2. 配置 PostgreSQL 的连接信息
vault write database/config/my-postgres \
    plugin_name=postgresql-database-plugin \
    allowed_roles="readonly" \
    connection_url="postgresql://{{username}}:{{password}}@db.example.com:5432/mydb" \
    username="vault_admin" \
    password="admin_password_here"

# 3. 定义角色：这个角色的应用能获得什么权限
vault write database/roles/readonly \
    db_name=my-postgres \
    creation_statements="CREATE ROLE \"{{name}}\" WITH LOGIN PASSWORD '{{password}}' VALID UNTIL '{{expiration}}'; GRANT SELECT ON ALL TABLES IN SCHEMA public TO \"{{name}}\";" \
    default_ttl="1h" \
    max_ttl="24h"

# 4. 申请一个动态凭据（Vault 会自动在数据库中创建用户）
vault read database/creds/readonly

# 输出类似：
# Key                Value
# ---                -----
# rotation_statements []
# username           v0-readonly-1234567890
# password           hvs.CAESIJ...（动态生成的密码）
# lease_id           database/creds/readonly/abc123
# lease_duration     1h
# lease_renewable    true
```

这个流程的关键点：

- 每次 `vault read database/creds/readonly` 都会生成全新的用户名和密码
- 这些凭据只能在 1 小时内有效（默认 TTL）
- 应用用完数据库后，Vault 会自动清理这个临时账户
- 应用可以在租约到期前调用续期 API 延长使用时间

### 示例三：使用策略限制访问权限

假设你有两个团队：前端团队和后端团队，他们只能访问各自需要的密钥。

```hcl
# 文件：frontend-policy.hcl
# 前端团队只能读取 frontend/ 下的密钥
path "secret/data/frontend/*" {
  capabilities = ["create", "read", "update", "delete", "list"]
}

# 后端团队只能读取 backend/ 下的密钥
path "secret/data/backend/*" {
  capabilities = ["create", "read", "update", "delete", "list"]
}

# 两个团队都不能访问 admin/ 下的密钥
path "secret/data/admin/*" {
  capabilities = ["deny"]
}
```

上传策略并绑定到用户：

```bash
# 1. 上传策略文件
vault policy write frontend-policy frontend-policy.hcl
vault policy write backend-policy backend-policy.hcl

# 2. 创建用户并绑定策略
vault write auth/userpass/users/frontend_team \
    password="frontend_pass" \
    policies="frontend-policy"

vault write auth/userpass/users/backend_team \
    password="backend_pass" \
    policies="backend-policy"

# 3. 前端团队登录后只能访问自己的密钥
vault login -method=userpass username=frontend_team password=frontend_pass

# 尝试访问后端的密钥会被拒绝
vault kv get secret/data/backend/api-key
# Error: permission denied

# 但可以访问自己的密钥
vault kv get secret/data/frontend/api-key
```

### 示例四：Transit 引擎——加密即服务

Transit 引擎不存储任何数据，它只负责加解密计算。数据存在你自己的数据库里，Vault 只提供加密和解密服务。这样即使你的数据库被入侵，攻击者看到的也只是密文。

```bash
# 1. 启用 Transit 引擎
vault secrets enable transit

# 2. 创建一个加密密钥（名字自定义）
vault write -f transit/keys/my-app-data

# 3. 加密一段明文
vault write transit/encrypt/my-app-data \
    plaintext=$(echo -n "my-secret-credit-card-number" | base64)

# 输出类似：
# Key       Value
# ---       -----
# ciphertext vault:v1:...（加密后的密文）

# 4. 把密文存到你的数据库（而不是明文！）

# 5. 需要解密时，把密文发给 Vault
vault write transit/decrypt/my-app-data \
    ciphertext="vault:v1:..."

# 输出：
# Key      Value
# ---      -----
# plaintext bXktc2VjcmV0LWNyZWRpdC1jYXJkLW51bWJlcg==
# （base64 解码后就是原始明文）
```

## 总结要点

| 概念 | 一句话理解 |
|------|-----------|
| Secret | 需要保护的敏感数据 |
| Secrets Engine | 处理数据的"抽屉"，每种类型功能不同 |
| Policy | 访问控制规则，默认拒绝一切 |
| Lease | 密钥的借用期限，到期自动回收 |
| Token | 访问 Vault 的身份凭证 |
| Seal/Unseal | 启动时需要多人共同解封 |
| Transit | 不存储数据，只做加解密的加密服务 |

Vault 的设计哲学是：最小权限原则 + 自动化生命周期管理。它不只是一个密码管理器，而是一套完整的密钥治理框架。

## 后续学习方向

- Vault 的认证方法（Auth Methods）：LDAP、Kubernetes、OIDC 等
- Vault Agent：让应用自动获取和刷新 Token
- Vault 的高可用部署（Raft 存储集群）
- Vault Enterprise 的高级功能（命名空间、DR 复制等）
- HashiCorp Certified: Vault Associate 认证考试
