---
title: Shadowsocks-libev — 嵌入式设备上的轻量 SOCKS5 加密代理
来源: 'https://github.com/shadowsocks/shadowsocks-libev'
日期: 2026-07-08
分类: embedded
难度: 中级
---

## 是什么

Shadowsocks-libev 是一个用 C 写的轻量级 SOCKS5 加密代理，常见角色是：远端服务器跑 `ss-server`，本机或路由器跑 `ss-local` / `ss-redir`，中间的流量被加密成一条隧道。

日常类比：它像给普通快递加了一个上锁的中转袋。应用把包裹交给本地 SOCKS5 入口，本地入口把包裹锁起来送到远端，远端再拆袋投递到真正目的地。

最小例子是本机开一个 SOCKS5 入口：

```bash
ss-local -s server.example.com -p 8388 -l 1080 \
  -k "$SS_PASSWORD" -m chacha20-ietf-poly1305
```

浏览器或 `curl` 只要指向 `127.0.0.1:1080`，它就不用关心后面怎么加密、怎么转发。项目 README 把它定位为面向嵌入式设备和低端盒子的轻量安全 SOCKS5 代理，仓库约 16k stars；仓库描述也说明它现在主要维护 bug fix，新发展转向 shadowsocks-rust。

## 为什么重要

不理解 Shadowsocks-libev，下面这些事就解释不了：

- 为什么 OpenWrt 路由器这种小机器也能跑加密代理，而不一定需要完整 VPN 客户端
- 为什么 SOCKS5 代理只接管应用交给它的流量，默认不会像 VPN 那样接管整台机器的所有包
- 为什么 `ss-local`、`ss-redir`、`ss-tunnel` 看起来都是客户端，但分别服务于应用代理、透明代理、端口转发三种场景
- 为什么同一个密码和加密方法必须在客户端、服务端严格一致，否则连接建立了也解不开数据

## 核心要点

1. **五个小工具分工**：`ss-server` 像远端收发站，负责解密后访问目标网站；`ss-local` 像本机窗口，给浏览器提供 SOCKS5 入口；`ss-redir` 像路由器暗门，让不懂代理的设备也被转发。`ss-tunnel` 做固定端口转发，`ss-manager` 管多端口和流量统计。

2. **C + libev 的轻量路线**：它不是把一整套虚拟网卡搬上设备，而是用事件循环同时处理很多 socket。类比小餐馆只有一个熟练前台，靠排队和回调招呼客人，而不是给每桌配一个服务员，所以低端盒子也扛得住。

3. **配置核心是同一组字段**：远端地址 `-s`、远端端口 `-p`、本地端口 `-l`、密码 `-k`、加密方法 `-m`，这些字段在命令行和 JSON 配置里来回映射。类比两把钥匙：密码和 cipher 必须配套，缺一个就打不开锁。

## 实践案例

### 案例 1：远端服务器 + 本地 SOCKS5 入口

```bash
# 远端机器：提供加密隧道服务
ss-server -s 0.0.0.0 -p 8388 \
  -k "$SS_PASSWORD" -m chacha20-ietf-poly1305 -u

# 本地机器：开一个 1080 端口给浏览器或命令行用
ss-local -s server.example.com -p 8388 -l 1080 \
  -k "$SS_PASSWORD" -m chacha20-ietf-poly1305

curl --socks5-hostname 127.0.0.1:1080 https://example.com
```

逐部分解释：

- `ss-server` 监听 `8388`，收到客户端数据后解密，再替客户端访问真正目标
- `ss-local` 监听本地 `1080`，对外表现为一个标准 SOCKS5 代理
- `-u` 打开 UDP relay，适合 DNS、游戏、语音这类不只走 TCP 的流量
- `--socks5-hostname` 让域名也交给代理处理，避免本机先解析 DNS 带来泄漏

### 案例 2：路由器 / Linux 网关做透明代理

```bash
# 先启动透明代理客户端
ss-redir -s server.example.com -p 8388 -l 1080 \
  -k "$SS_PASSWORD" -m chacha20-ietf-poly1305 -u

# 再让 iptables 把流量导进 ss-redir
sudo ss-nat -s SERVER_IP -l 1080 -u -o

# 出问题时清理规则
sudo ss-nat -f
```

逐部分解释：

- `ss-redir` 不给浏览器暴露 SOCKS5，而是在本机接收被内核重定向过来的流量
- `ss-nat` 是项目附带脚本，帮你生成 iptables NAT / TPROXY 规则
- `-o` 把本机 OUTPUT 链也纳入转发，适合让这台网关自己也走代理
- OpenWrt 场景常用这个模式，因为家里手机、电视、游戏机不一定都支持手动填 SOCKS5

### 案例 3：只转发 DNS 这一个固定端口

```bash
# 把本地 UDP 5353 转到远端看到的 8.8.8.8:53
ss-tunnel -s server.example.com -p 8388 -l 5353 \
  -k "$SS_PASSWORD" -m chacha20-ietf-poly1305 \
  -L 8.8.8.8:53 -u

dig @127.0.0.1 -p 5353 www.example.com
```

逐部分解释：

- `ss-tunnel` 不提供通用 SOCKS5，而是把一个本地端口固定转到一个远端地址
- `-L 8.8.8.8:53` 是真正目的地，表示远端服务器替你访问这个 DNS 服务
- `-u` 必须有，因为 DNS 默认走 UDP；没有它，命令看似启动了，查询却可能不通
- 这个案例适合理解"隧道"这个词：不是所有车都走地下通道，只给某条路线开一条洞

## 踩过的坑

1. **把它当 VPN**：SOCKS5 只代理主动配置的应用；想让全 LAN 透明接入，需要 `ss-redir`、`ss-nat` 或系统级转发规则。

2. **密码和 cipher 对不上**：客户端服务端只要 `-k` 或 `-m` 有一个不一致，表现就像网络坏了；根因是双方拿了不同钥匙。

3. **忘记排除服务器 IP**：透明代理规则如果不 `RETURN` 远端服务器地址，连接会被自己再次导进代理，形成绕圈。

4. **UDP relay 以为自动可用**：`-u` 只是 Shadowsocks 侧打开 UDP；redir 模式还需要 TPROXY、root 权限和内核规则配合。

## 适用 vs 不适用场景

**适用**：

- OpenWrt / 低端 Linux 盒子，需要轻量加密代理
- 某些应用只需要 SOCKS5 入口，不想接管整台机器网络
- 路由器透明转发，让不懂代理设置的设备也能走统一出口
- 需要一个小而清楚的 C 网络项目，学习事件循环、socket、配置解析

**不适用**：

- 需要完整三层 VPN、虚拟网卡、站点到站点组网，优先看 [[wireguard-2017]]
- 需要匿名网络和多跳路径，应该学习 [[tor-2004]] 的威胁模型
- 需要服务网格、HTTP 路由、熔断、观测，Shadowsocks-libev 不是 [[envoy]]
- 需要长期新增协议特性，仓库已经偏维护模式，应关注后续实现

## 历史小故事（可跳过）

- 原版 Shadowsocks 由 clowwindy 创建，目标是做一个比传统 VPN 更轻、更贴近 SOCKS5 心智的加密代理。
- Shadowsocks-libev 是这个协议的 C / libev 实现，README 写明由 madeye 和 linusyang 维护，重点是低资源占用。
- 项目后来积累了 Linux、FreeBSD、macOS、Windows、Docker、OpenWrt 等多平台安装路径，说明它的主战场不是单一桌面系统。
- README 当前版本显示为 3.3.6，仓库说明也标出 bug-fix-only，社区新特性更多转向 Rust 实现。
- 从学习角度看，它像一块网络工程切片：SOCKS5、加密、事件循环、iptables、嵌入式约束，全都能在一个项目里碰到。

## 学到什么

1. **代理和 VPN 是两种心智**：代理像应用主动走某个窗口，VPN 像整栋楼的出入口都改了。
2. **轻量不是功能少，而是边界清楚**：`ss-local`、`ss-redir`、`ss-tunnel` 分开做事，比一个大二进制塞满模式更容易理解。
3. **网络工具的坑常在系统边界**：程序本身能跑，不代表 DNS、UDP、iptables、路由表都已经对齐。
4. **嵌入式项目优先考虑资源和依赖**：C、libev、可选功能、JSON 配置，都是为了让小设备能长期稳定运行。

## 延伸阅读

- 官方仓库：[shadowsocks/shadowsocks-libev](https://github.com/shadowsocks/shadowsocks-libev)（README 含安装、Docker、参数总览）
- 官方文档目录：[doc/*.asciidoc](https://github.com/shadowsocks/shadowsocks-libev/tree/master/doc)（`ss-local` / `ss-server` / `ss-redir` / `ss-tunnel` manpage）
- 官方站点：[Shadowsocks Getting Started](https://shadowsocks.org/doc/getting-started.html)（理解生态和客户端选择）
- [[openwrt]] —— Shadowsocks-libev 常见部署环境，适合把代理放到路由器层
- [[mbedtls]] —— 项目依赖的 TLS / 加密库之一，能补上嵌入式加密基础
- [[tor-2004]] —— 对比"代理加密"和"匿名多跳网络"的边界

## 关联

- [[openwrt]] —— OpenWrt 是 Shadowsocks-libev 最常见的嵌入式落地环境之一
- [[wireguard-2017]] —— 同样解决安全隧道问题，但 WireGuard 是三层 VPN，心智不同
- [[tor-2004]] —— Tor 关注匿名和多跳，Shadowsocks-libev 更像轻量加密代理
- [[mbedtls]] —— Shadowsocks-libev 构建依赖里包含 mbedtls，涉及 cipher 与密钥处理
- [[lwip]] —— 同属嵌入式网络学习材料，一个偏协议栈，一个偏代理应用
- [[haproxy]] —— 都是 C 写的高性能网络代理，但 HAProxy 面向负载均衡和反向代理
- [[envoy]] —— 现代 L7 代理的复杂形态，对照能看出 Shadowsocks-libev 的小而专

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
