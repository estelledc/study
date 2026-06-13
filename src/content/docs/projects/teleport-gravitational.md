---
title: Teleport — 零信任基础设施访问平台
来源: https://github.com/gravitational/teleport
日期: 2026-06-13
分类: 安全与隐私
子分类: 安全与隐私
provenance: pipeline-v3
---

# Teleport — 零信任基础设施访问平台

## 一、日常类比：万能智能门禁卡

想象你在一栋巨大的写字楼里工作。这栋楼有几百间办公室（服务器）、几间机房（数据库）、几层楼的实验室（Kubernetes 集群），还有玻璃房（Windows 桌面）。

传统做法是：给每个房间配一把不同的钥匙。服务器用 SSH 密钥，数据库有用户名密码，Kubernetes 有 token。这些钥匙一旦丢了、被复制了，或者员工离职了没收回，就全是安全隐患。而且你口袋里揣着一大串钥匙，管理起来非常痛苦。

Teleport 做的事情就是：**把这一大串钥匙换成一张智能门禁卡**。这张卡有几个神奇特性：

1. 每次刷门，卡会自动生成一把只在这个小时内有效的临时钥匙
2. 进门时自动录像，谁在什么时间进了哪间房，清清楚楚
3. 公司有人事系统（SSO），你入职时 IT 就给你发卡，离职时一键作废
4. 不管你在楼外还是出差到外地，通过一个统一的入口就能到达任何房间

这就是 Teleport 的核心价值：用一个统一的身份层，替代散落在各处的密钥和密码。

## 二、核心概念

### 2.1 Teleport 集群（Cluster）

Teleport 的基本部署单元叫"集群"。一个最小集群包含两个服务：

| 组件 | 作用 | 类比 |
|------|------|------|
| **Auth Service（认证服务）** | 管理用户身份、签发证书、维护审计日志 | 大楼的安保中心 |
| **Proxy Service（代理服务）** | 接收外部连接请求，路由到内部资源 | 前台接待 + 电梯系统 |

这两个服务通常跑在同一台机器上。生产环境中可以拆开到多台机器实现高可用。

### 2.2 短寿命证书（Short-Lived Certificates）

这是 Teleport 最核心的安全机制。传统 SSH 用永久的密钥对做认证，而 Teleport 用：

- 用户登录后，Auth Service 签发一张限时证书（默认几小时）
- 证书到期后自动失效，不需要手动轮换
- 证书绑定用户身份和资源权限，无法转移给他人

类比：就像酒店的房卡，退房后就失效了，不能下次再用。

### 2.3 tsh 和 tctl 客户端

Teleport 提供两个命令行工具：

- **tsh**：普通用户使用，用来登录、连接服务器、管理会话
- **tctl**：管理员使用，用来配置角色、管理用户、操作集群资源

类比：tsh 像你的门禁刷卡器，tctl 像安保中心的后台管理系统。

### 2.4 RBAC 角色（Roles）

Teleport 使用基于角色的访问控制。角色定义了用户可以做什么，例如：

- 能连接到哪些服务器
- 能执行什么命令
- 能看到哪些 Kubernetes 命名空间
- 能否访问数据库

默认情况下，没有任何权限。必须显式授予角色。

### 2.5 受信任集群（Trusted Clusters）

多个 Teleport 集群可以建立信任关系。根集群（root）的用户可以跨集群访问叶子集群（leaf）的资源，就像一张卡可以在连锁酒店的所有分店通用。

## 三、支持的资源类型

Teleport 不是只能管 SSH 服务器。它统一支持多种资源：

- **SSH 服务器**：Linux/Unix 主机
- **Kubernetes 集群**：用身份替代 kubeconfig token
- **数据库**：PostgreSQL、MySQL、MongoDB、CockroachDB 等
- **Windows 桌面**：通过 RDP 协议
- **内部 Web 应用**：通过 Application Access
- **云控制台**：AWS、Azure、GCP 控制台
- **MCP 服务器**：面向 AI Agent 的安全接入

## 四、代码示例

### 4.1 安装并启动 Teleport

最简单的单机部署方式（社区版）：

```bash
# 下载 Teleport 二进制文件（以 Linux amd64 为例）
curl https://get.teleport.dev -sSfL | sh

# 创建数据目录
sudo mkdir -p -m0700 /var/lib/teleport
sudo chown $USER /var/lib/teleport

# 以单节点模式启动（包含 Auth + Proxy + SSH 服务）
teleport start --auth=token=<join-token> --proxy --ssh --ca-pin=sha256:xxxxxxxx
```

启动后，Teleport 会监听：
- 443 端口：Web UI 和代理入口
- 3023 端口：SSH 连接
- 3025 端口：客户端到代理的 gRPC 连接

### 4.2 使用 tsh 登录和连接服务器

```bash
# 1. 登录 Teleport 集群（会触发 MFA 验证）
tsh login --proxy=teleport.example.com --user=jason

# 2. 查看当前可用的服务器列表
tsh nodes

# 3. 连接到某台服务器（自动使用临时证书认证，无需 SSH 密钥）
tsh ssh jason@web-server-01

# 4. 查看活跃会话（多人可以同时连接到同一台服务器）
tsh sessions

# 5. 回放某个会话的录制内容
tsh sessions read <session-id>
```

整个过程不需要配置 SSH 密钥。你的身份由 Teleport 的证书系统管理，登录一次后获得短期证书，后续所有连接都用这个证书。

### 4.3 配置 RBAC 角色

使用 `tctl` 定义一个角色，限制用户只能访问特定服务器：

```yaml
# roles/dev-role.yaml
kind: role
version: v5
metadata:
  name: dev-role
spec:
  # 允许登录的用户名规则
  allow:
    logins:
      - ubuntu        # 只能以 ubuntu 用户登录
      - ec2-user      # 也可以以 ec2-user 登录
    node_labels:
      env: dev-*      # 只能访问标签为 dev- 开头的节点
    commands:
      - program: sudo
        # 允许执行 sudo，但限制具体命令
        args: ['tail', '-f', '*']
    roles:
      - access         # 赋予基本的访问角色
      - editor          # 赋予编辑器角色
```

应用这个角色：

```bash
# 创建角色资源
tctl create roles/dev-role.yaml

# 把这个角色分配给用户
tctl users update jason --roles=dev-role,access
```

### 4.4 连接 Kubernetes 集群

Teleport 可以替代 kubeconfig 来访问 K8s：

```bash
# 1. 登录 Teleport 集群
tsh login --proxy=teleport.example.com

# 2. 将 K8s 的 kubeconfig 导出到 Teleport 管理的证书
tsh kubelogin <cluster-name> --k8s=production

# 3. 现在 kubectl 命令自动使用 Teleport 签发的短期证书
kubectl get pods --namespace=default

# 4. 也可以直接用 tsh 执行 kubectl 命令
tsh kubectl get pods --namespace=default
```

好处：不需要分发和维护 kubeconfig 文件，也不需要定期轮换 token。所有 K8s 访问都通过 Teleport 的身份系统统一管理，并且有完整的审计记录。

## 五、与传统方案的对比

| 场景 | 传统做法 | Teleport 做法 |
|------|----------|---------------|
| SSH 登录 | 分发和管理 SSH 公钥 | 登录一次，自动签发短期证书 |
| K8s 访问 | kubeconfig + token，需要轮换 | Teleport 证书自动管理 |
| 数据库凭证 | 硬编码密码或使用 Vault | Teleport 自动注入短期凭据 |
| 堡垒机 | 单独搭建跳板机，网络暴露多 | Proxy 只需暴露 443，反向隧道穿透防火墙 |
| 审计 | 各系统各自记录，难以关联 | 统一审计日志，所有会话录制 |
| MFA | 各系统分别配置 | 统一 MFA，一次配置全局生效 |

## 六、为什么值得学

Teleport 解决的是现代基础设施中最根本的问题：**谁，在什么时候，以什么身份，访问了什么资源**。

随着云原生、混合云、远程办公的普及，传统的边界防护（防火墙、VPN）已经不够用了。零信任架构的理念是"从不信任，始终验证"——Teleport 恰好提供了落地这套理念的工具集。

对于初学者来说，理解 Teleport 有助于建立几个关键认知：

1. 证书比密钥更适合做身份认证（有期限、可撤销）
2. 统一身份层比分散的凭证管理更安全
3. 审计不是事后补救，而是安全架构的基石
4. 最小权限原则可以通过 RBAC 自动化落地

## 七、延伸阅读

- 官方文档：https://goteleport.com/docs/
- 架构参考：https://goteleport.com/docs/reference/architecture/
- RBAC 入门：https://goteleport.com/docs/zero-trust-access/rbac-get-started/
- GitHub 仓库：https://github.com/gravitational/teleport （20.5k Star）
