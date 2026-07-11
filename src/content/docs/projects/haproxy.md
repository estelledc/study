---
title: HAProxy — 高性能 LB，TCP/HTTP 双层负载均衡
来源: 'https://github.com/haproxy/haproxy'
日期: 2026-05-30
分类: backend-api
难度: 中级
---

## 是什么

HAProxy 是一台**专门做"分流和守门"的代理服务器**，前面接外网请求，后面接一排服务器，它决定每个请求该走哪台。日常类比：像大厅里的迎宾——客人进门，他扫一眼今天哪个柜台空，把你指过去；同时盯着每个柜台还活着没，挂了就跳过。

技术上它是用 C 写的、单进程事件驱动（epoll/kqueue），同时支持两种模式：**TCP 代理（L4，转字节流）** 和 **HTTP 代理（L7，能看懂请求头和路径）**。一台普通服务器跑 HAProxy 就能扛 10 万+ QPS。

它和 nginx / caddy 都属于"接入层"，但定位偏：HAProxy 把"负载均衡 + 健康检查 + 高可用"做到极致，nginx 偏静态 + 反代，caddy 偏自动 HTTPS + 易用。

## 为什么重要

不理解它，下面这些事都没法解释：

- 为什么大公司前端入口几乎人手一台 HAProxy / 类似物，而不是直接把请求丢给应用服务器
- 为什么"某台机器挂了用户毫无感觉"——是谁在 5 秒内把它从池子里踢掉的
- 为什么云厂商的 LB 服务（AWS ALB / 阿里 SLB）账单上写的是"连接数 / 流量"——它们提供的是同一类接入层能力（分流、健康检查、高可用），只是做成了托管分布式系统
- 为什么后端面试爱问 keep-alive / sticky session / health check——这些概念几乎都从 LB 来

## 核心要点

HAProxy 干活可以拆成 **三件事**：

1. **分流（load balancing）**：来一个请求，按规则选一个后端。规则有"轮流"（roundrobin）、"挑最闲的"（leastconn）、"按客户端 IP 永远去同一台"（source hash）。类比：餐厅领班按"哪桌服务员最闲"分桌。

2. **健康检查（health check）**：每隔几秒戳一下每台后端，连不上 / HTTP 不返回 200 就把它从池子里摘掉，恢复了再放回来。类比：带巡逻员，发现哪间柜台关灯了就贴"暂停服务"牌。

3. **流量整形（ACL + 路由）**：L7 模式下能读 HTTP 请求头 / 路径，写一句 `path_beg /api` 就能把 `/api/*` 路由到一组机器，把 `/static/*` 路由到另一组。类比：大堂里看你拿什么票，分到不同窗口。

三件加起来叫"**反向代理 + 负载均衡器**"——前端只看到 HAProxy 一个 IP，后端可以是几十上百台。

## 实践案例

### 案例 1：最小 HTTP 负载均衡（轮询 3 台 web）

```cfg
frontend http_in
    bind *:80
    default_backend webs

backend webs
    balance roundrobin
    server web1 10.0.0.1:8080 check
    server web2 10.0.0.2:8080 check
    server web3 10.0.0.3:8080 check
```

**逐部分**：

- `frontend` 块：监听 80 端口接所有进来的请求
- `backend` 块：定义后端池，`balance roundrobin` 是轮流分配
- `check` 关键字：让 HAProxy 自动每 2 秒探一次这台是否活着
- 三台机器任意挂一台，HAProxy 在几秒内把它跳过

### 案例 2：按 URL 路径路由到不同微服务

```cfg
frontend http_in
    bind *:80
    acl is_api path_beg /api
    acl is_static path_beg /static
    use_backend api_backend if is_api
    use_backend static_backend if is_static
    default_backend www_backend
```

`acl` 是"给条件起名字"，`path_beg` 意思是"路径以...开头"。这就是 L7 路由——前端一个域名后面可以挂任意多个微服务。

### 案例 3：TCP 模式给 PostgreSQL 做高可用

```cfg
frontend pg_in
    bind *:5432
    mode tcp
    default_backend pg_pool

backend pg_pool
    mode tcp
    option tcp-check
    server pg_primary 10.0.0.10:5432 check
    server pg_standby 10.0.0.11:5432 check backup
```

`mode tcp` 表示不解析协议、直接转字节流。`backup` 关键字是"平时不用、主挂了才上"。这就是数据库的故障切换入口。

## 踩过的坑

1. **timeout 三件套漏配一个就出诡异断连**——`timeout client / server / connect` 必须都设，新人最常只配 client 然后被服务器侧 5s 默认超时坑
2. **reload 对短连接通常 hitless，对长连接会拖后腿**——新进程接新连接，但老进程要等既有连接结束才退；WebSocket / 长轮询场景容易堆多个老进程吃内存
3. **maxconn 没调高时受 ulimit 卡住**——日志里只看到 `cannot accept` 但没明显报错，要同时改 `global maxconn` 和系统 `nofile`
4. **health check 默认只测 TCP 连得上**——应用层假死不会被发现；要配 `option httpchk GET /health` 才探到真实健康状态

## 适用 vs 不适用场景

**适用**：
- 接入层流量分发（南北向流量）：网站入口、API 网关前置
- 数据库 / Redis / Kafka 等 TCP 服务的故障切换
- 蓝绿发布 / 灰度发布的流量切换层
- 中等到大规模站点的 L7 路由（按 path / header / cookie 分流）

**不适用**：
- service mesh 内部 sidecar（用 Envoy / Linkerd）
- 需要复杂插件 / Lua 灵活扩展（nginx + OpenResty 更合适）
- 自动 HTTPS 证书申请管理（Caddy 内置 ACME，HAProxy 要自己拼）
- 极简静态站点反代（nginx / Caddy 配置更短）

## 历史小故事（可跳过）

- **2001 年**：Willy Tarreau 在某个 Apache 配置脚本基础上改出 HAProxy 1.0，最早就是为了解决他自己运维的小站点 Apache 扛不住的问题
- **2006 年**：1.3 版引入 keep-alive、ACL、L7 检查，从"穷人 LB"升级成认真的工业级 LB
- **2014 年**：1.5 加 SSL/TLS 终结，从此可以替代 stunnel / nginx 做 HTTPS 入口
- **2018+**：2.x 引入 nbthread 多线程，单进程内多线程跑事件循环，TLS CPU 瓶颈缓解
- 至今 Tarreau 仍是核心维护者，HAProxy 在 GitHub / Stack Overflow / Reddit 等大型站点都有部署

## 学到什么

1. **接入层是必需的隔离层**——不要让用户直接打到应用进程，中间留一层做重试 / 切换 / 限流，应用代码会简单一个量级
2. **L4 vs L7 的取舍**：L4 快但不懂业务，L7 慢但能按 URL 智能路由；多数场景 L7 值得那点开销
3. **健康检查是高可用的灵魂**——不是"接通就算活"，要探到应用层 `/health`
4. **配置文件即合同**：HAProxy.cfg 一份文件涵盖 frontend / backend / 超时 / 检查，可读性强、可版本管理
5. **事件驱动的极致**：单线程跑事件循环，靠 epoll/kqueue 把上万连接挂在一个 fd 上轮询，CPU cache 友好，是高并发的经典范式

## 延伸阅读

- 官方文档：[HAProxy Configuration Manual](http://docs.haproxy.org/)（必读 chapter 4 和 5）
- 入门教程：[DigitalOcean — HAProxy as Load Balancer](https://www.digitalocean.com/community/tutorials/an-introduction-to-haproxy-and-load-balancing-concepts)
- 视频：[YouTube — HAProxy 入门 1 小时](https://www.youtube.com/results?search_query=haproxy+tutorial)
- 性能调优：[HAProxy Performance Tuning](https://www.haproxy.com/blog/haproxy-performance-tuning)
- 进阶：[HAProxy Mastery（书）](https://www.michaelwlucas.com/networking/haproxy)（系统讲 ACL / 监控 / 故障切换）
- 与 Kubernetes：[HAProxy Kubernetes Ingress Controller](https://www.haproxy.com/documentation/kubernetes/latest/)

## 关联

- [[nginx]] —— 同接入层另一霸主，nginx 偏静态 + 反代 + 模块生态，HAProxy 偏 LB + 健康检查
- [[caddy]] —— 现代 Go 写的反代，强项自动 HTTPS，体量比 HAProxy 小但易用
- [[traefik]] —— 容器原生 LB，自动从 Docker / K8s 发现服务，配置随容器走
- [[kubernetes]] —— 集群入口常常 HAProxy 在前 + Ingress Controller 在后
- [[redis]] —— TCP 模式下常用 HAProxy 给 Redis 主从做故障切换前端
- [[tcp]] —— L4 模式直接转发 TCP 字节流，理解 TCP 三次握手 / keep-alive 才能调好 HAProxy
- [[http-2]] —— L7 模式下 HAProxy 2.x 已支持 HTTP/2 终结，需注意 stream 复用对超时配置的影响

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[dendrite]] —— Dendrite — Go 写的第二代 Matrix homeserver，组件可拆可合
- [[dovecot]] —— Dovecot — 主流 IMAP/POP3 服务器
- [[envoy]] —— Envoy — 把网络通信从业务代码里抠出来的代理进程
- [[kamailio]] —— Kamailio — 把电信级 SIP 流量塞进一台 Linux 服务器
- [[kong]] —— Kong — 基于 nginx + Lua 的云原生 API 网关
- [[krakend]] —— KrakenD — 把多个后端聚合成一次响应的高性能 API 网关
- [[nginx]] —— nginx — 高性能 Web 服务器
- [[postfix]] —— Postfix — 把 sendmail 拆成一群最小权限的小工
- [[shadowsocks-libev]] —— Shadowsocks-libev — 嵌入式设备上的轻量 SOCKS5 加密代理
- [[synapse]] —— Synapse — Matrix 协议的参考 homeserver，让聊天像电邮一样能跨服务器互通
- [[tyk]] —— tyk — Go 实现的开源 API 网关，自带门户和多协议转换
