---
title: Tailscale 零基础入门笔记
来源: https://github.com/tailscale/tailscale
日期: 2026-06-13
分类: 网络协议
子分类: security-tools
provenance: pipeline-v3
---

# Tailscale 零基础入门笔记

## 一、日常类比：什么是 Tailscale？

想象一下，你有三台设备：家里的 Mac、公司的 PC、还有旅行时的手机。它们分别连在不同的网络上——家里的 WiFi、公司的内网、咖啡厅的公共 WiFi。

在没有 Tailscale 之前，你想从咖啡厅的手机访问家里 Mac 上的文件，基本是不可能的。因为：

- 两台设备不在同一个局域网
- 公司防火墙会阻止外部连接
- 即使你知道家里电脑的 IP，NAT 也会拦住你

传统的做法是搭建一个 VPN 服务器，需要在路由器上做端口转发、配置 NAT、处理公网 IP 问题……对初学者来说门槛很高。

**Tailscale 做的事情很简单：它在你所有设备之间建一条"秘密隧道"。** 不管你的设备在哪里、用什么网络，只要都装了 Tailscale，它们就能像在同一间屋子里的局域网一样互相访问。

核心原理是：Tailscale 底层使用 WireGuard 加密协议，通过它的中继服务器（Tailnode）帮你穿透 NAT 和防火墙，建立端到端的加密连接。你不需要任何网络知识，也不需要公网 IP。

## 二、核心概念

### 2.1 Tailnet（尾网）

Tailnet 就是由所有安装了 Tailscale 的设备组成的私有网络。你可以把它理解为你专属的、全球分布的局域网。每个加入 tailnet 的设备会自动获得一个 `100.x.y.z` 格式的 IP 地址。

### 2.2 MagicDNS

MagicDNS 是 Tailscale 内置的 DNS 服务。它让你可以用设备名（比如 `my-mac`）代替 IP 地址来访问其他设备。开启后，你在终端里直接 `ping my-mac` 就能连通，非常方便。

### 2.3 Node（节点）

每台安装了 Tailscale 并登录的设备就是一个节点。节点可以是电脑、服务器、树莓派、手机，甚至 Apple TV。

### 2.4 Exit Node（出口节点）

你可以指定某台设备作为"出口节点"，让你的所有上网流量（不只是 tailnet 内部的）都经过这台设备。比如在咖啡厅用家里电脑做出口节点，你的上网流量就会走家里的网络，更安全。

### 2.5 Subnet Router（子网路由器）

让 tailnet 能够访问你本地网络中那些无法安装 Tailscale 的设备，比如打印机、NAS、智能家居设备等。

### 2.6 Tailscale Serve / Funnel

- **Serve**：把你本地的服务（比如一个跑在本地的网页应用）安全地分享给 tailnet 内的其他人访问
- **Funnel**：把本地服务暴露到整个互联网，任何人都能访问

## 三、安装与快速上手

### 3.1 安装

以 Linux 为例：

```bash
# 添加官方软件源并安装
curl -fsSL https://tailscale.com/install.sh | sh

# 启动并登录（会打开浏览器让你选择登录方式）
sudo tailscale up
```

macOS 可以直接从 [tailscale.com/download](https://tailscale.com/download) 下载安装包。Windows 同理。

### 3.2 两台设备互相访问

假设你有两台设备：

```bash
# 设备 A（Mac）上执行
tailscale up
# 浏览器打开登录页面，用 Google/GitHub 账号登录
# 登录后会显示一个 IP，比如 100.101.102.103

# 设备 B（Linux 服务器）上执行
tailscale up
# 同样登录同一个账号
# 登录后会显示另一个 IP，比如 100.101.102.104
```

现在两台设备已经互相连通了！在设备 B 上直接 ping 设备 A：

```bash
# 用 IP 访问
ping 100.101.102.103

# 如果用 MagicDNS，直接用设备名
ping my-mac.local
```

### 3.3 常用 CLI 命令

```bash
# 查看当前节点状态和 IP 地址
tailscale status

# 查看网络中的其他节点
tailscale list

# 查看本机 IP
tailscale ip

# 关闭 Tailscale 连接
tailscale down

# 重新登录
tailscale up
```

## 四、代码示例

### 示例 1：用 Tailscale Serve 分享本地 Web 服务

假设你在本地跑了一个开发服务器（比如 `localhost:3000`），想让 tailnet 内的其他设备也能访问：

```bash
# 把本地的 3000 端口分享到 tailnet 内
tailscale serve --https=443 localhost:3000
```

执行后，tailnet 内的其他设备就可以通过以下方式访问你的服务：

```
https://你的设备名.ts.net
```

Tailscale 会自动为你生成和续期 TLS 证书，不需要自己配置 HTTPS。

如果想让服务对互联网公开（任何人都能访问），用 Funnel：

```bash
# 先开启 serve
tailscale serve --https=443 localhost:3000

# 再用 funnel 暴露到互联网
tailscale funnel --https=443
```

### 示例 2：配置 ACL 访问控制策略

Tailscale 默认允许 tailnet 内所有设备互相访问。但你可以通过 ACL（访问控制列表）来限制哪些设备可以访问哪些资源。

在 Tailscale 管理后台（https://login.tailscale.com/admin/acls）编辑策略文件，示例如下：

```json
{
  "acls": [
    {
      "action": "accept",
      "src": ["*"],
      "dst": ["*:*"]
    },
    {
      "action": "accept",
      "src": ["group:devs"],
      "dst": ["server-*:22"]
    },
    {
      "action": "accept",
      "src": ["group:devs"],
      "dst": ["server-*:8080"]
    },
    {
      "action": "accept",
      "src": ["group:interns"],
      "dst": ["*:*"]
    }
  ],
  "groups": {
    "group:devs": ["alice@example.com", "bob@example.com"],
    "group:interns": ["charlie@example.com"]
  },
  "ssh": [
    {
      "action": "accept",
      "src": ["*"],
      "dst": ["*"],
      "users": ["root", "autocreate"]
    }
  ]
}
```

这个策略的含义：

- 所有人可以互相访问所有端口（默认规则）
- `devs` 组的成员只能 SSH 和访问 8080 端口连接到以 `server-` 开头的设备
- `interns` 组的 interns 可以访问所有设备的所有端口
- SSH 连接允许任何人以 root 或自动创建的用户身份登录

### 示例 3：设置出口节点（Exit Node）

在家里的一台 Linux 服务器上设置为出口节点：

```bash
# 在家庭服务器上，允许它作为出口节点
sudo tailscale up --advertise-exit-node

# 在管理后台（Machines 页面）启用该设备的"Use as exit node"选项
```

然后在旅行时的笔记本上使用它：

```bash
# 通过 CLI 指定使用哪台设备作为出口节点
# 先查看可用的出口节点
tailscale status

# 设置出口节点（用家庭服务器的 IP 或名称）
tailscale set --exit-node=100.101.102.100

# 验证：此时你的公网 IP 应该变成你家里的 IP
curl ifconfig.me
```

## 五、典型应用场景

| 场景 | 说明 |
|------|------|
| 远程开发 | 在公司直接 SSH 到家里的开发机，像本地一样工作 |
| 家庭实验室（Homelab） | 在外网安全访问家里的 NAS、HomeAssistant 等服务 |
| 公共 WiFi 安全 | 通过出口节点加密所有流量，保护咖啡厅上网安全 |
| 团队协作 | 团队成员组成一个 tailnet，互相访问各自的开发环境 |
| 跨云互联 | 不同云厂商（AWS、GCP、Azure）的服务器组成私有网络 |

## 六、安全机制

- **端到端加密**：所有流量使用 WireGuard 加密，Tailscale 无法读取你的数据
- **零信任模型**：默认拒绝一切，只有明确授权的设备才能通信
- **设备认证**：每台设备都有独立的密钥，新设备加入需要管理员批准
- **Tailnet Lock**：可选功能，锁定所有设备间的通信密钥，防止中间人攻击

## 七、总结

Tailscale 的核心价值就一句话：**让任何设备在任何网络环境下都能安全地组网互通，而且几乎不需要配置。**

对于初学者来说，它最大的好处是不需要理解 NAT、端口转发、公网 IP、DNS 这些概念，装好客户端、登录账号，就能用了。
