---
title: Vault — HashiCorp 把"密码本"做成可编程基础设施
来源: https://developer.hashicorp.com/vault/docs
日期: 2026-06-01
分类: DevOps / 安全
难度: 中级
---

## 是什么

Vault 是 HashiCorp 2015 年发布的**密钥与凭据管理服务**——一句话：你所有的密码、API key、证书、加密密钥，集中放在它这里，应用要用时再向它申请。

日常类比：像银行的保险柜 + 临时取款机的合体。保险柜部分负责长期存放（数据库 root 密码、TLS 证书私钥），临时取款机部分更有意思——你不是来取永久密码，而是说"我要用一下数据库"，柜员现场给你开一个 1 小时有效的临时账号，到点自动作废。这就是 Vault 最有特色的"动态凭据"。

它和 1Password 那种"给人用的密码本"完全不同：Vault 是**给程序、CI、基础设施用的**——主路径是 HTTP API / CLI；虽有运维用的 Web UI（默认 `:8200/ui`），但不是给最终用户存个人密码的界面。

## 为什么重要

不了解 Vault，就只看到"把密码塞 .env 文件"或"丢 K8s Secret 里 base64"这种石器时代做法。Vault 代表的是**凭据生命周期管理**这条思路：

- **静态密码 → 动态凭据**：每次申请都是新账号，泄漏只影响 1 小时
- **集中审计**：谁在何时用了哪个 secret，全程记录
- **统一接口**：DB 密码、AWS key、SSH 登录、TLS 证书签发，全在一个 API 后面
- **加密即服务**：应用本身不持有密钥也能加解密敏感字段

DevOps / SRE 岗位的一道入门门槛。理解了 Vault 你才能看懂"零信任架构"里 secret 这一环到底怎么运转。

## 核心要点

Vault 的世界观由四层抽象组成：

1. **Auth Method（认证方法）**：你怎么向 Vault 证明"我是谁"。可以用 token / AppRole / AWS IAM / K8s ServiceAccount / OIDC 等十多种。
2. **Policy（策略）**：证明身份后，你能访问哪些路径。HCL 写的 ACL 规则。
3. **Secret Engine（密钥引擎）**：实际存放或生成 secret 的"插件"。最常用的几种：
   - **KV**：纯静态键值存储，最朴素的"密码本"
   - **Database**：动态生成数据库账号（PostgreSQL / MySQL / MongoDB 等）
   - **AWS**：动态签发 AWS access key
   - **PKI**：当 CA 用，按需签发 X.509 证书
   - **Transit**：加密即服务，应用送来明文，Vault 返回密文，密钥永远不出 Vault
4. **Token**：一次成功认证后拿到的临时凭证，所有后续 API 调用都带它。

启动后还有个独特机制叫 **Seal/Unseal（封存/解封）**：Vault 进程刚起来时所有 secret 都是加密状态，主密钥被 **Shamir 秘密分享**拆成 5 份，必须凑齐 3 份才能解封。这意味着没有任何单个管理员能独自打开 Vault。

底层存储：1.4 之前重度依赖 Consul，1.4 起内置 **Integrated Storage**（基于 Raft），单个二进制就能起 HA 集群。

## 实践案例

### 案例 1：本机 30 秒起一个 dev 模式

```bash
vault server -dev
# 输出会给出 root token 和 unseal key
export VAULT_ADDR='http://127.0.0.1:8200'
export VAULT_TOKEN='hvs.xxxxx'
vault kv put secret/myapp db_password=hunter2
vault kv get secret/myapp
```

dev 模式数据存内存，关掉就没了，专门用来学习。

### 案例 2：动态生成 PostgreSQL 临时账号

四步跟做（先有一台可达的 Postgres，以及一个能建用户的 admin 账号）：

```bash
# 1) 打开 database 引擎（不 enable 后面 write 会失败）
vault secrets enable database

# 2) 告诉 Vault 怎么连库
vault write database/config/mydb \
    plugin_name=postgresql-database-plugin \
    connection_url='postgresql://{{username}}:{{password}}@db:5432/app' \
    allowed_roles='readonly' \
    username=vault_admin password=xxx

# 3) 定义 role：每次申请就现场 CREATE 一个只读账号
vault write database/roles/readonly \
    db_name=mydb \
    creation_statements="CREATE ROLE \"{{name}}\" WITH LOGIN PASSWORD '{{password}}' VALID UNTIL '{{expiration}}'; GRANT SELECT ON ALL TABLES IN SCHEMA public TO \"{{name}}\";" \
    default_ttl='1h' max_ttl='24h'

# 4) 应用来取凭据
vault read database/creds/readonly
# 得到类似 v-readonly-abc123 / 随机密码；1 小时后 Vault 自动 DROP ROLE
```

这就是动态凭据的杀手锏：每个进程拿到的账号都不同，泄漏窗口被切碎。

### 案例 3：Transit 加密即服务

```bash
vault secrets enable transit
vault write -f transit/keys/orders          # 在 Vault 里生成一把密钥
echo -n "user@example.com" | base64 | \
    vault write transit/encrypt/orders plaintext=-
# 返回 vault:v1:abc... 这种密文；应用只存密文进 DB
# 需要明文时再调 transit/decrypt；密钥始终不出 Vault
```

跟读要点：应用是"加解密客户端"，不是"密钥所有者"；rotate 也只是 Vault 内部一条命令。

## 踩过的坑

1. **Unseal key 丢了 = 主密钥永远解不出**——5 份分散给不同人保管，离职流程要交接，否则 Vault 重启上不来。
2. **首次必须 init + unseal**——容器化部署常忘这步，结果 pod 起来了所有 API 都 503。生产用 auto-unseal（KMS / HSM）避免人肉介入。
3. **Token 默认 TTL 短**（dev 模式无限，生产模式 32 天到期）——长跑服务必须实现自动 renew，否则突然 403。
4. **Audit log 默认不开**——出事后查"谁动了这个 secret"会发现没数据。生产必须 `vault audit enable file path=/var/log/vault_audit.log`。
5. **动态 DB 凭据需要 admin 账号**——Vault 自己得有创建用户的权限，权限设计不当会被滥用，建议给一个**仅能 CREATE/DROP ROLE** 的最小账号。
6. **Transit 密文带版本号**：rotate 后老密文还能解，但新加密走新版本号。版本太多记得 trim 旧版本。
7. **Policy 路径写错没报错**：HCL ACL 大小写敏感，多一个 `/` 就匹配不上，结果 token 看着正常实际啥也读不到。

## 适用 vs 不适用场景

**适用**：

- 多服务共享 secrets，需集中管理 + 审计
- 想要"短期凭据"减少泄漏面
- 需要 PKI CA 自签证书（替代手动 OpenSSL）
- 加密敏感字段但不想让应用持有密钥（Transit）
- 大型团队、多团队隔离（namespace 企业版）

**不适用**：

- 个人密码管理 → 用 1Password / Bitwarden
- 完全无 ops 的纯前端项目 → 没必要
- 极小团队 + 不需要审计 → K8s Secret + sealed-secrets 也够
- 极端低延迟场景 → 每次 API 调用都要走网络

## 历史小故事（可跳过）

- **2015.04**：HashiConf 发布 Vault 0.1，与 Nomad / Terraform / Consul 一起成 HashiCorp 全家桶
- **2018–2020**：1.0 GA；1.4 引入 Integrated Storage，不再强依赖 Consul
- **2023.08**：产品协议从 MPL2 改成 BSL，社区震动
- **2023.12**：Linux Foundation 拉起 **OpenBao** fork（开源旁路）
- **2024–2025**：IBM 收购 HashiCorp；企业版走 HashiCorp/IBM，社区版看 OpenBao。对照：AWS Secrets Manager 是云内嵌，Vault 是跨云中立

## 学到什么

1. **凭据可以是动态资源**——不必是"长期固定密码"，把它当成"按需创建的临时资源"思路完全不同
2. **加密即服务**让应用从"密钥所有者"降为"加解密客户端"，安全责任收敛
3. **Shamir 秘密分享**不是黑魔法，是数学上把"知识"拆给多人保管的优雅做法
4. **统一抽象的力量**：把 DB 密码 / 云 key / 证书 / SSH OTP 全塞进同一个 secret engine 抽象，运维心智负担骤降
5. **协议变化是大事**：BSL 事件证明 OSS 协议风险得纳入选型考量；OpenBao 的存在让用户有退路

## 延伸阅读

- 官方教程：[Vault Get Started](https://developer.hashicorp.com/vault/tutorials/getting-started)（半小时跑通本机 demo）
- 动态凭据实战：[Vault Database Secrets Engine](https://developer.hashicorp.com/vault/tutorials/db-credentials)
- OpenBao 项目：[openbao.org](https://openbao.org/)（社区 fork，了解协议变化背景）
- [[nomad]] —— 同公司编排器，Nomad 1.6 之前重度依赖 Vault
- [[terraform]] —— 同 HCL 语法，IaC 流程里常用 Vault provider 注入凭据
- [[consul]] —— Vault 早期默认存储后端

## 关联

- [[nomad]] —— HashiCorp 编排器，与 Vault 自然搭配做 secrets 注入
- [[terraform]] —— 同公司 IaC 工具，HCL 同源
- [[consul]] —— Vault 早期存储后端，现在被 Integrated Storage 替代
- [[raft]] —— Integrated Storage 底层一致性算法
- [[kubernetes]] —— Vault Agent + CSI Driver 是 K8s secret 注入主流方案之一
- [[oidc]] —— Vault 主要 auth method 之一
