---
title: shadowsocks-libev — 用 C 与 libev 实现的高性能 Shadowsocks 代理
来源: https://github.com/shadowsocks/shadowsocks-libev
日期: 2026-06-13
子分类: 嵌入式
分类: 操作系统
provenance: pipeline-v3
---

## 是什么

**shadowsocks-libev** 是经典代理协议 [Shadowsocks](https://shadowsocks.org/) 的 **C 语言实现**，基于 [libev](https://libev.schmorp.de/) 事件循环，目标是**低内存占用、高并发、跨平台**。它把本地应用发出的流量加密后，经 UDP/TCP 隧道送到远端 `ss-server`，再由服务器代你访问目标网站；对应用来说，本地只看到一个 **SOCKS5 代理**（`ss-local`）或透明劫持入口（`ss-redir`）。

日常类比：

- **普通 HTTP 代理**像酒店前台：你报房间号，前台帮你转电话，但通话内容前台听得一清二楚。
- **Shadowsocks**像你把信装进**带密码锁的合金信封**，交给一位只认暗号的快递员；快递员把信封送到境外分拣中心（`ss-server`），在那里拆封、代你寄出真正的明信片。沿途路人只能看到「有个合金盒子在跑」，不知道里面写了什么、寄给谁。
- **shadowsocks-libev** 则是这位快递员里**练长跑、饭量还小的那位**——同样活，占的 CPU/内存更少，路由器、小 VPS 上跑得动。

项目由 [shadowsocks/shadowsocks-libev](https://github.com/shadowsocks/shadowsocks-libev) 维护，是 clowwindy 原版 Python 实现之后社区最广泛部署的 **libev 分支**；与 shadowsocks-rust、go-shadowsocks2 等同属协议的不同实现，**客户端与服务端只要密码、加密方式、插件参数一致即可互通**。

## 为什么重要

Shadowsocks 解决的是「**在不可信链路上，让 TCP/UDP 流量看起来像随机噪声**」这一工程问题，常见于：

- 跨境访问被中间设备按 SNI/域名特征干扰的场景
- 嵌入式设备、OpenWrt 路由器上跑代理（内存只有几十 MB）
- 需要 **UDP 中继**（DNS、QUIC、部分游戏）而不仅是 TCP HTTP 代理

选 **libev 版**而不是 Python 原版的理由很实际：

| 维度 | shadowsocks-libev | 典型 Python 实现 |
|------|-------------------|------------------|
| 运行时 | 单进程 C + libev | 解释器 + 多线程/协程 |
| 内存 | 路由器上常见 < 10 MB | 往往数十 MB 起 |
| 组件 | server / local / redir / tunnel / manager 分工明确 | 功能相对集中 |
| 透明代理 | `ss-redir` + iptables 成熟文档 | 依赖额外工具 |

不理解五个二进制各自干什么，很容易配错模式——例如把 `ss-server` 的配置直接给 `ss-local` 用，或忘了在透明代理里 **排除 SS 服务器自身 IP** 造成流量环路。

## 核心概念

### 1. 五个可执行文件，五种角色

官方文档把 shadowsocks-libev 拆成五个程序：

| 程序 | 部署位置 | 作用 |
|------|----------|------|
| `ss-server` | 境外/公网 VPS | 监听端口，解密客户端流量并代为连接目标 |
| `ss-local` | 本机/局域网 | 开本地 SOCKS5（默认 `127.0.0.1:1080`），应用连它 |
| `ss-redir` | 网关/OpenWrt | **透明代理**：配合 iptables REDIRECT/TPROXY 劫持 TCP/UDP |
| `ss-tunnel` | 本机 | 把本地某端口转发到远端指定地址（类似 SSH `-L`） |
| `ss-manager` | 服务端 | 多用户/多端口管理，通过 Unix socket API 动态增删实例 |

数据路径（最常见 `ss-local` 模式）：

```
浏览器/App → SOCKS5 127.0.0.1:1080 → ss-local 加密
    → 互联网 → ss-server 解密 → 目标网站
    ← 原路返回 ←
```

### 2. Shadowsocks 协议在干什么

协议层（与实现语言无关）可以概括成三步：

1. **握手**：客户端用预共享密码派生密钥，协商加密方式（现代部署首选 AEAD）
2. **地址头**：加密载荷里带上目标地址类型（域名/IP）、端口
3. **载荷流**：之后每个 TCP 片段或 UDP 报文都带独立 nonce，AEAD 校验完整性

因此中间人看到的是「到 VPS 某端口的高熵字节流」，而不是明文 HTTP `Host:` 或 TLS SNI——**不等于 VPN**，没有虚拟网卡，也不路由整台机器的全部 IP 包（除非你用 `ss-redir` 做网关级劫持）。

### 3. 加密方式（cipher / method）

`ss-server` 与 `ss-local` 的 `-m` / JSON `method` **必须一致**。libev 版支持多种算法，**默认 `chacha20-ietf-poly1305`**（在缺少 AES 硬件加速的 ARM/MIPS 路由器上往往比 AES 更快）。

推荐优先级（2020 年代后的新部署）：

- **AEAD**：`chacha20-ietf-poly1305`、`aes-256-gcm`、`xchacha20-ietf-poly1305`
- **避免**：`aes-256-cfb`、`rc4-md5` 等老流 cipher（无完整性校验，易被主动篡改）

密码字段 `password` 是 UTF-8 字符串，双方相同即可；也可用 `--key` 传 URL-safe Base64 编码的原始密钥（管理场景更常见）。

### 4. JSON 配置与命令行映射

所有组件统一读 JSON 配置文件（`-c config.json`），命令行参数可覆盖文件。常见字段：

| JSON 字段 | 含义 |
|-----------|------|
| `server` / `server_port` | 远端地址与端口（客户端）或监听端口（服务端） |
| `local_address` / `local_port` | 本地 SOCKS5 绑定地址（仅客户端） |
| `password` / `method` | 预共享密钥与加密算法 |
| `timeout` | 空闲超时秒数，默认 60 |
| `mode` | `tcp_only` / `tcp_and_udp` / `udp_only` |
| `fast_open` / `reuse_port` | Linux TCP Fast Open、SO_REUSEPORT |
| `plugin` / `plugin_opts` | 外挂混淆插件（如 simple-obfs，已逐步被 TLS 类方案取代） |
| `port_password` | 仅 `ss-manager`：多端口多密码表 |

### 5. TCP 与 UDP 中继

- 默认只代理 **TCP**；加 `-u` 或 `"mode": "tcp_and_udp"` 才开 **UDP 中继**（DNS、QUIC 需要）
- `ss-redir` 下 UDP 要走 **TPROXY** + `ip rule`，配置难度明显高于 TCP REDIRECT
- 服务端 `-U` 可设为仅 UDP（少见）

### 6. ss-manager 与多用户

单机想给不同用户不同端口/密码，不必手写多个 systemd 单元：起 `ss-manager`，它按 API 动态 fork `ss-server` 子进程。控制协议是 **Unix domain socket 上的 UDP 报文**，例如：

```
add: {"server_port": 8001, "password":"7cd308cc059"}
remove: {"server_port": 8001}
ping
```

回复 `stat: {"8001":11370}` 可拉取各端口流量统计——适合面板或计费系统对接。

### 7. 与 VPN（WireGuard / OpenVPN）的边界

| | Shadowsocks | WireGuard 等 VPN |
|--|-------------|------------------|
| 工作层 | 代理（SOCKS5 / 透明代理） | 三层隧道，虚拟网卡 |
| 应用感知 | 要设代理或网关劫持 | 路由表全局生效 |
| 特征 | 单端口加密流 | UDP 握手 + 固定 peer 结构 |
| 典型场景 | 浏览器/指定 App 翻墙 | 整网段进隧道 |

二者常组合：路由器 `ss-redir` 做选择性代理，公司笔记本再叠 WireGuard 回内网——互不替代。

## 安装速览

**Debian / Ubuntu**（包名随发行版略有差异）：

```bash
sudo apt update
sudo apt install shadowsocks-libev
# 配置文件通常在 /etc/shadowsocks-libev/config.json
```

**从源码**（需 autotools、libev、libsodium 等依赖，见仓库 `README`）：

```bash
git clone https://github.com/shadowsocks/shadowsocks-libev.git
cd shadowsocks-libev
./autogen.sh && ./configure && make
sudo make install
```

OpenWrt 上常通过 `opkg install shadowsocks-libev-ss-local shadowsocks-libev-ss-redir` 只装需要的子包，节省 Flash。

## 实践示例

### 示例 1：服务端 `ss-server` + systemd

`/etc/shadowsocks-libev/config.json`（仅服务端字段）：

```json
{
  "server": ["::0", "0.0.0.0"],
  "server_port": 8388,
  "password": "请换成高强度随机口令",
  "timeout": 300,
  "method": "chacha20-ietf-poly1305",
  "mode": "tcp_and_udp",
  "fast_open": true,
  "reuse_port": true,
  "nameserver": "1.1.1.1"
}
```

说明：

- `server` 写成数组可同时监听 IPv4/IPv6
- `mode: tcp_and_udp` 让客户端能解析 UDP DNS
- `fast_open` / `reuse_port` 仅 Linux 有效，高并发时减轻握手延迟

Debian 系启用服务：

```bash
sudo systemctl enable shadowsocks-libev-server@config
sudo systemctl start shadowsocks-libev-server@config
sudo systemctl status shadowsocks-libev-server@config
```

防火墙只放行你实际用的端口（示例 8388/tcp+udp）：

```bash
sudo ufw allow 8388/tcp
sudo ufw allow 8388/udp
```

验证端口在听：

```bash
ss -tulnp | grep ss-server
```

### 示例 2：本机客户端 `ss-local` + 环境变量

客户端配置 `/etc/shadowsocks-libev/client.json`：

```json
{
  "server": "203.0.113.10",
  "server_port": 8388,
  "local_address": "127.0.0.1",
  "local_port": 1080,
  "password": "请换成高强度随机口令",
  "timeout": 300,
  "method": "chacha20-ietf-poly1305",
  "mode": "tcp_and_udp"
}
```

前台调试（看日志最直接）：

```bash
ss-local -c /etc/shadowsocks-libev/client.json -v
```

另开终端测试 SOCKS5 是否通：

```bash
curl -x socks5h://127.0.0.1:1080 https://example.com -I --max-time 15
```

让命令行走代理（仅当前 shell）：

```bash
export ALL_PROXY=socks5://127.0.0.1:1080
export NO_PROXY=localhost,127.0.0.0/8,10.0.0.0/8,192.168.0.0/16
git clone https://github.com/shadowsocks/shadowsocks-libev.git  # 测试 git over SOCKS
```

浏览器侧在 Firefox 网络设置选手动代理 SOCKS5 `127.0.0.1:1080`，并勾选「代理 DNS」以免 DNS 泄漏。

### 示例 3：网关透明代理 `ss-redir`（片段）

在 Linux 网关上用 `ss-redir` 把局域网 TCP 重定向到本地 12345（官方文档示例精简版）。**务必先把 SS 服务器 IP 加入 RETURN 规则**，否则流量会死循环。

```bash
# 假设 SS 服务器公网 IP 为 203.0.113.10，ss-redir 监听 12345
iptables -t nat -N SHADOWSOCKS
iptables -t nat -A SHADOWSOCKS -d 203.0.113.10 -j RETURN
iptables -t nat -A SHADOWSOCKS -d 192.168.0.0/16 -j RETURN
iptables -t nat -A SHADOWSOCKS -p tcp -j REDIRECT --to-ports 12345
iptables -t nat -A PREROUTING -p tcp -j SHADOWSOCKS

ss-redir -u -c /etc/shadowsocks-libev/client.json -l 12345 -f /var/run/ss-redir.pid
```

UDP DNS 还需 mangle 表 TPROXY 与 `ip rule` 配合，生产环境建议直接参考官方 `doc/shadowsocks-libev.asciidoc` 完整 iptables 块，或在 OpenWrt 使用现成 luci-app 降低手写成本。

## 运维与排错

**连不上时按顺序查：**

1. `method`、`password`、`server_port` 两端是否完全一致
2. 云厂商安全组 / `ufw` 是否放行端口（TCP+UDP 若开了 `tcp_and_udp`）
3. 客户端是否误用服务端配置（客户端必须有 `local_address` / `local_port`）
4. 透明代理是否忘记 RETURN 服务器 IP 和 RFC1918 私网段
5. 老 cipher 被中间设备干扰时，换成 `chacha20-ietf-poly1305` 再试

**日志：**

```bash
ss-local -c client.json -v    # 前台 verbose
journalctl -u shadowsocks-libev-server@config -f
```

**性能调优（Linux 服务端）：**

- 多核 VPS 可起多个 `ss-server` 实例并 `reuse_port`，由内核负载均衡
- `timeout` 过大占用连接表，过小则长连接频繁重连；300s 是常见折中
- 嵌入式设备优先 chacha 系 cipher，避免 AES-NI 缺席时的软实现开销

## 生态与演进

- **插件**：`simple-obfs` 等曾在运营商 QoS 严时流行，通过 `plugin` / `plugin_opts` 外挂；现在更常见的是换端口、套 TLS/WebSocket（由 v2ray/xray、sing-box 等方案承担，已超出 libev 本体）
- **替代实现**：[shadowsocks-rust](https://github.com/shadowsocks/shadowsocks-rust) 功能更全（ACL、多用户、outbound 链）；**协议兼容**前提下可混用 server/client
- **法律与合规**：Shadowsocks 是通用加密代理工具，部署前须遵守当地法规与服务商 ToS；本文只讨论技术机制

## 小结

| 要点 | 一句话 |
|------|--------|
| 定位 | C + libev 的 Shadowsocks 参考实现，轻量高性能 |
| 组件 | `ss-server` 远端、`ss-local` SOCKS5、`ss-redir` 透明网关、`ss-tunnel` 端口转发、`ss-manager` 多用户 |
| 配置 | JSON 单文件，命令行可覆盖 |
| 加密 | 默认 `chacha20-ietf-poly1305`，两端必须一致 |
| 模式 | 应用代理简单；全局透明要 iptables + 防环路 |
| 适用 | VPS、路由器、资源紧张环境需要可靠 SS 协议栈时 |

从零上手的最短路径：**境外起 `ss-server` → 本机 `ss-local` → `curl -x socks5h://127.0.0.1:1080` 验证**；确认无误后再考虑 `ss-redir`、systemd 开机自启与多用户 `ss-manager`。

## 延伸阅读

- 官方手册：[doc/shadowsocks-libev.asciidoc](https://github.com/shadowsocks/shadowsocks-libev/blob/master/doc/shadowsocks-libev.asciidoc)
- 各子命令 man 页：`ss-local(1)`、`ss-server(1)`、`ss-redir(1)`、`ss-manager(1)`
- Shadowsocks 协议说明：[shadowsocks.org](https://shadowsocks.org/)
- 同类笔记：[wireguard-go](/docs/projects/wireguard-go)（三层 VPN 对比）、[coturn](/docs/projects/coturn)（另一类 NAT 穿透问题）
