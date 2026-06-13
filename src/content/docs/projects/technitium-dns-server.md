---
title: Technitium DNS Server — 自托管权威/递归 DNS 与网络过滤
来源: https://github.com/TechnitiumSoftware/DnsServer
日期:2026-06-13
子分类: 网络协议
分类: 网络协议
provenance:pipeline-v3
---

## 是什么

**Technitium DNS Server** 是一款开源、跨平台的 **权威 + 递归 DNS 服务器**，带 Web 管理台和完整 HTTP API。你可以把它装在家里的小主机、树莓派或 VPS 上，让整个局域网（或单台电脑）的域名解析都经过自己控制的节点，而不是直接问运营商或公共 DNS。

日常类比：

- **公共 DNS（8.8.8.8、1.1.1.1）**：像城市里统一的**电话查号台**——谁打来问「某某公司电话多少」，查号台按公开黄页回答；查号台也知道你问了什么（隐私取决于对方政策）。
- **Technitium DNS Server**：像在你家或公司里设了一个**自己的前台总机**——员工/设备先问总机；总机可以查内部通讯录（权威区）、再去外面查号（递归/转发）、把常见号码记在便签上（缓存）、还能直接拒接骚扰电话（广告/恶意域名拦截）。

默认装好就能用：监听 `53` 端口做 DNS 解析，Web 控制台在 `http://<主机>:5380/`。首次登录默认账号 `admin` / `admin`，**务必立刻改密码**。

官方站点：[technitium.com/dns](https://technitium.com/dns)  
源码：[TechnitiumSoftware/DnsServer](https://github.com/TechnitiumSoftware/DnsServer)

## 为什么重要

不理解 Technitium，下面几件事很难在一个系统里同时做到：

- **局域网级广告/恶意软件拦截**：订阅 block list URL，服务器每 24 小时自动更新，对匹配域名返回 `0.0.0.0` / `::`（可配 Allowed Zone 白名单例外）
- **DoT / DoH / DoQ**：在 UDP/TCP 53 之外提供加密 DNS，弥补多数操作系统和应用仍不原生支持加密解析的缺口
- **开发/测试用权威区**：本地建 `dev.example.com` 等 zone，不必改 hosts 就能模拟生产域名
- **条件转发（Conditional Forwarder）**：内网 AD DNS、公司 intranet 域名走专用上游，其余走 Cloudflare/Google 或自递归
- **自动化**：Web 控制台调用的 REST API 与脚本、CI、Ansible 等同源——控制台能点的，API 都能做（见 [APIDOCS.md](https://github.com/TechnitiumSoftware/DnsServer/blob/master/APIDOCS.md)）

同类方案还有 Pi-hole（更偏「拦截 + 统计」）、AdGuard Home、dnsmasq + 手工配置。Technitium 的特点是把 **权威、递归、DHCP、集群、DNS Apps** 收进一个带 GUI 和 API 的二进制里，适合想「一台服务管全网 DNS」的场景。

## 核心概念

### 1. 权威 vs 递归 vs 转发

| 模式 | 做什么 | 典型用途 |
|------|--------|----------|
| **权威（Authoritative）** | 你托管的 zone 由本机「说了算」 | `home.lan`、`staging.myapp.local` |
| **递归（Recursive）** | 从根服务器一路问到真实答案 | 家里设备查 `github.com` |
| **转发（Forwarder）** | 不自己递归，把查询转给上游（可配 DoH URL） | 统一走 `https://cloudflare-dns.com/dns-query` |

Zone 类型还包括 **Secondary**（从主区同步）、**Stub**（跟踪 NS）、**Conditional Forwarder**（按域名选不同上游）。

### 2. 缓存与「热数据」

Technitium 会按记录 TTL 缓存答案，并支持：

- **Serve Stale**：上游暂时不可达时，最多约 3 天内仍返回过期缓存（「陈面包总比没面包好」）
- **Prefetch / Auto Prefetch**：热门记录在 TTL 将尽前后台刷新，降低延迟尖刺
- **Negative Caching**：NXDOMAIN 也会缓存，避免对不存在域名反复打上游

Dashboard 上的 **Cached** 比例越高，说明越多查询没离开本机。

### 3. Blocked Zone / Block List / Allowed Zone

- **Blocked Zone**：手工拉黑域名
- **Block List Zone**：从一个或多个 URL 拉取列表（如 StevenBlack hosts），每日更新
- **Allowed Zone**：在黑名单里的例外（例如拦截全网广告但放行 `ads.example.com`）

拦截 A 记录时默认解析到 `0.0.0.0`；统计里的 **Blocked** 计数即此类响应。

### 4. 监听端点与安全协议

默认 **DNS Local End Points**：`0.0.0.0:53` 与 `[::]:53`（全网卡）。若只想服务某一网段，可改成该网卡 IP。

常见端口（安装后需在防火墙放行）：

| 端口 | 用途 |
|------|------|
| 53 udp/tcp | 标准 DNS |
| 5380 tcp | Web 控制台 HTTP |
| 53443 tcp | Web 控制台 HTTPS |
| 853 tcp/udp | DNS-over-TLS / DoQ |
| 443 tcp/udp | DNS-over-HTTPS |
| 67 udp | 内置 DHCP（可选） |

自 v15 起，需登录的 HTTP API 要在 `Authorization: Bearer <token>` 里带会话或 API Token。

### 5. DNS Apps 与集群

- **DNS Apps**：类似「跑在 DNS 服务器上的插件」，通过 zone 里的 `APP` 记录把查询交给指定 App 处理（商店里含高级正则拦截等）
- **Clustering**：多实例从一个 Web 控制台管理，适合冗余与分担读负载（升级时先升 secondary 再升 primary）

### 6. 内置 DHCP

与 DNS 集成：给 scope 配域名选项后，可为客户端自动写正向/反向记录——小网络「一台树莓派管 DHCP + DNS」即可落地。

## 实践案例

### 案例 1：Ubuntu 一键安装并让全网使用

官方安装脚本（会装 .NET 运行时与 systemd 服务）：

```bash
# 安装或升级
curl -sSL https://download.technitium.com/dns/install.sh | sudo bash

# 防火墙示例（按发行版调整）
sudo ufw allow 53/tcp
sudo ufw allow 53/udp
sudo ufw allow 5380/tcp
```

安装后浏览器打开 `http://<服务器IP>:5380/`，改密码，在 **Settings → DNS Settings** 里可配置 **Forwarders**，例如：

```text
https://cloudflare-dns.com/dns-query (1.1.1.1)
```

或传统 `1.1.1.1:53`。然后在路由器 DHCP 里把 **DNS 服务器** 指到这台机器的局域网 IP。

**常见坑**：Ubuntu 上 `systemd-resolved` 或 `dnsmasq` 已占用 53 端口。日志会出现 `Address already in use`。需停用 stub resolver 或改 Technitium 只监听非 53 端口（不推荐家用场景）。

### 案例 2：Docker Compose 部署

官方镜像 `technitium/dns-server` 适合已有容器编排习惯的环境：

```yaml
# docker-compose.yml 精简示例
services:
  technitium-dns:
    image: technitium/dns-server:latest
    container_name: technitium-dns
    restart: unless-stopped
    ports:
      - "53:53/udp"
      - "53:53/tcp"
      - "5380:5380/tcp"
    volumes:
      - ./config:/etc/dns
    environment:
      - DNS_SERVER_DOMAIN=dns.home
```

```bash
docker compose up -d
```

宿主机 53 端口不能被其他服务占用。配置与 zone 文件持久化在挂载的 `config` 目录。

### 案例 3：用 HTTP API 创建权威区并添加 A 记录

先登录拿 token（v15+ 后续请求带 Bearer）：

```bash
# 登录（生产环境请改用 HTTPS 与强密码）
TOKEN=$(curl -s "http://127.0.0.1:5380/api/user/login?user=admin&pass=YOUR_PASSWORD" \
  | jq -r '.token')

# 创建 Primary zone
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://127.0.0.1:5380/api/zones/create?zone=dev.home&type=Primary"

# 添加 A 记录：nas.dev.home -> 192.168.1.50
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://127.0.0.1:5380/api/zones/records/add?domain=dev.home&name=nas&type=A&ttl=3600&ipAddress=192.168.1.50"
```

局域网设备把 DNS 指到 Technitium 后，即可解析 `nas.dev.home`，无需每台机器改 `/etc/hosts`。

### 案例 4：Python 拉取统计并配置 Block List

适合接入监控或 GitOps：

```python
import requests

BASE = "http://192.168.1.10:5380"
TOKEN = "your-api-token"  # 在 Web 控制台为用户创建 API Token
headers = {"Authorization": f"Bearer {TOKEN}"}

# 仪表盘 Top 统计
stats = requests.get(f"{BASE}/api/dashboard/stats/get", headers=headers, timeout=10)
stats.raise_for_status()
print("total queries:", stats.json().get("totalQueries"))

# 设置全局 block list URL（会合并进 Block List Zone，每日更新）
payload = {
    "blockListUrls": (
        "https://raw.githubusercontent.com/StevenBlack/hosts/master/hosts"
    ),
}
r = requests.post(
    f"{BASE}/api/settings/set",
    headers=headers,
    data=payload,
    timeout=30,
)
r.raise_for_status()
print(r.json().get("status"))  # 期望 "ok"
```

API 与 Web 控制台行为一致；自动化账号建议单独建低权限用户再发 API Token。

### 案例 5：条件转发内网 Active Directory DNS

公司有 `corp.internal` 由 `10.0.0.5` 上的 Windows DNS 托管时：

1. Web 控制台 **Add Zone** → 类型选 **Conditional Forwarder**
2. Zone 名 `corp.internal`，转发器填 `10.0.0.5` 或 `10.0.0.5:53`
3. 其余公网域名仍走 Settings 里的公共 Forwarder 或本机递归

这样笔记本连 VPN 后只需一个 DNS 地址，公网与内网解析路径自动分流。

## Dashboard 指标怎么读

家用或小办公排障时，优先看：

- **Server Failure** 突然升高：上游不可达、转发器超时（默认约 2s）、或本机无外网
- **NX Domain** 某客户端异常高：可能恶意软件 DGA 域名探测，查该 IP 对应设备
- **Blocked** 上升：拦截规则生效；若误杀，往 **Allowed Zone** 加例外
- **Refused**：常因开启了「仅允许私网递归」却从公网收到递归请求

## 与 Pi-hole / AdGuard Home 怎么选

| 维度 | Technitium DNS Server | Pi-hole / AdGuard Home |
|------|----------------------|------------------------|
| 定位 | 全功能 DNS 服务器 + API | 偏 DNS 过滤与统计 |
| 权威区 / 区传送 | 原生支持多种 zone 类型 | 较弱或需额外工具 |
| DHCP | 内置 | 通常需外部 DHCP |
| DoH/DoT 作为**服务器** | 支持 | AdGuard 支持；Pi-hole 依赖上游 |
| 学习曲线 | 功能多，选项多 | 拦截场景上手更快 |

若你主要想要「全家去广告」，三者都能胜任；若还要 **托管内网域名、条件转发、API 全自动**，Technitium 更对口。

## 安全与运维建议

1. **改默认密码**，Web 控制台尽量走 HTTPS（53443）或反代 + TLS
2. **限制 5380 管理口** 仅管理网段可达；公网暴露 DNS 53 时要防放大攻击滥用（合理 ACL + `Allow Recursion Only For Private Networks`）
3. **备份 `config` 目录**：zone 与设置都在其中；Docker 部署务必挂卷
4. **集群升级顺序**：先 secondary，后 primary（官方文档强调）
5. v13.4+ 依赖系统 **ICU 库**（`libicu`）；精简 Linux 发行版需手动安装

## 延伸阅读

- [官方 Help Topics](https://technitium.com/dns/help.html) — Dashboard、建区、条件转发、本地端点
- [Ubuntu/Linux 安装博文](https://blog.technitium.com/2017/11/running-dns-server-on-ubuntu-linux.html) — 安装脚本、与 systemd-resolved 冲突处理
- [HTTP API 文档 APIDOCS.md](https://github.com/TechnitiumSoftware/DnsServer/blob/master/APIDOCS.md) — 自动化全集
- [Clustering 说明（2025）](https://blog.technitium.com/2025/11/understanding-clustering-and-how-to-configure-it.html)
- 相关笔记：[[kubernetes]]（集群内常配 CoreDNS 作递归上游）、[[nginx]]（反代 Web 控制台）、[[docker]]（容器部署）

## 小结

Technitium DNS Server 把 **递归解析、权威托管、过滤、加密 DNS、DHCP、API** 集成到单一服务里。零基础路径可以是：树莓派或旧 PC 装脚本 → 路由器 DHCP 指向它 → Web 控制台加 block list → 需要开发域名时加 Primary zone。理解「权威 / 递归 / 转发 / 缓存 / 拦截」五层后，Dashboard 数字和 API 文档都会变得直观。
