---
title: Caddy — 自动 HTTPS Web 服务器
来源: https://github.com/caddyserver/caddy
日期: 2026-05-29
分类: DevOps / 网络
难度: 中级
---

## 是什么

Caddy 是 **Matt Holt 2014 年用 Go 写的 Web 服务器**，最大卖点是"配置一行域名 → 自动签 Let's Encrypt 证书 + 自动续期"。

日常类比：[[nginx]] 像专业咖啡机——功能强，但每个旋钮都要自己调；Caddy 像胶囊咖啡机——按一下就出咖啡，HTTPS 自动来。

你写一个最简单的 Caddyfile：

```caddyfile
example.com {
  reverse_proxy localhost:3000
}
```

执行 `caddy run`。Caddy 自动：

1. 联系 Let's Encrypt 证书机构
2. 完成域名所有权验证（HTTP-01 challenge）
3. 拿到证书 → 自动配置 HTTPS
4. 把 `https://example.com` 的请求转发到本地 3000 端口
5. 60 天后自动续期，永远不掉

整个过程**不用 certbot、不用 cron、不用 openssl 命令**。

## 为什么重要

不用 Caddy 的痛苦：

- **配 nginx + certbot**：先装 nginx → 写配置 → 装 certbot → 跑命令签证书 → 改 nginx 引用证书 → 设 cron 续期 → 续期失败时还要 debug
- **手动续期**：忘记续 = 用户访问报"证书过期"红屏，公司丢人
- **多站点**：每个域名都来一遍上面流程

Caddy 把这些**全部省掉**。这就是为什么：

- 个人博客 / 小型服务首选 Caddy
- 边缘设备（树莓派、家用 NAS）几乎只用 Caddy
- Docker 镜像 `caddy:latest` 是最常被 pull 的 Web 服务器之一
- Tailscale / Pi-hole / Home Assistant 这类自托管服务都推荐 Caddy 当反代

## 核心要点

Caddy 的能力可以拆成 **三块**：

1. **Caddyfile**：声明式配置语言。每行一个 directive（指令），看一眼就懂。比 nginx 的 `location /` 嵌套块直观很多。

2. **Auto-TLS（自动 HTTPS）**：启动时检测到配置里有公网域名，自动从 [[lets-encrypt]] 或 ZeroSSL 申请证书，存进本地 storage，到期前自动续期。这是 Caddy 的灵魂功能，业界首创（2015）。

3. **模块化插件系统**：Caddy 2.x 用 Go 的 plugin 机制，常见插件：
   - `caddy-l4`：4 层 TCP/UDP 代理
   - `caddy-docker-proxy`：从 Docker labels 自动生成配置
   - `caddy-dns/cloudflare`：DNS-01 challenge 申请通配符证书

## 实践案例

### 案例 1：最简反代

```caddyfile
example.com {
  reverse_proxy localhost:3000
}
```

`caddy run` 启动后：

- `https://example.com` 自动有 HTTPS
- HTTP 自动跳 HTTPS（默认行为）
- 请求转发到本地 Node.js 服务

**比 nginx 写法少 10 行**——nginx 要写 listen 80 / listen 443 / ssl_certificate / ssl_certificate_key / location / proxy_pass。

### 案例 2：静态文件服务

```caddyfile
example.com {
  root * /var/www
  file_server
}
```

`/var/www` 下的文件直接被 HTTPS 服务出去。三行搞定一个静态站。

### 案例 3：Docker 一键起

```bash
docker run -d \
  -v $PWD/Caddyfile:/etc/caddy/Caddyfile \
  -v caddy_data:/data \
  -p 80:80 -p 443:443 \
  caddy
```

**关键点**：`caddy_data` 这个 volume 必须挂——里面存证书和私钥。容器删了重建，证书还在，不用重新签发（Let's Encrypt 有速率限制，频繁重签会被封）。

### 案例 4：通配符证书（DNS-01 challenge）

签 `*.example.com` 这种通配符证书，HTTP-01 不行（验证不了通配符域名所有权），必须用 DNS-01——往 DNS 加一条 TXT 记录证明你拥有域名。

```caddyfile
*.example.com {
  tls {
    dns cloudflare {env.CLOUDFLARE_API_TOKEN}
  }
  reverse_proxy localhost:3000
}
```

需要装 `caddy-dns/cloudflare` 插件 + 配置环境变量。

## 踩过的坑

1. **防火墙没开 80/443 → 自动 HTTPS 卡住**。Let's Encrypt 的 HTTP-01 challenge 需要从公网访问 80 端口；TLS-ALPN challenge 需要 443。云服务器忘了开端口，Caddy 启动时一直在等回调，看起来"卡住"。日志里会写 `connection refused`。

2. **通配符证书必须 DNS-01**。HTTP-01 只能验证具体域名（`a.example.com`），验证不了 `*.example.com`。要装对应 DNS provider 的插件，不能用 stock Caddy。

3. **配置 reload 不是发信号**。nginx 是 `nginx -s reload` 发 `SIGHUP`；Caddy 2.x 是 `caddy reload --config Caddyfile`，走 admin API（默认 `localhost:2019`）。习惯 nginx 的人容易卡住。

4. **Caddyfile 与 JSON API 双轨**。Caddy 2.x 内部其实是 JSON 配置，Caddyfile 只是语法糖。生产环境推荐：写 Caddyfile + 用 admin API 调试。直接写 JSON 太啰嗦。

5. **storage 路径要稳**。证书存在 `~/.local/share/caddy`（Linux）或 `$XDG_DATA_HOME/caddy`。容器跑的时候必须挂出来，否则容器一删证书全没。

6. **早期 Caddy 1.x 商业授权坑**。1.x 时代默认二进制商用要付费（开源版自己编译），社区很反感。2.x（2020）改成 Apache 2.0 + 完全免费，才真正起飞。看老资料要注意版本。

## 适用 vs 不适用场景

**适用**：

- 个人 / 小团队网站，要 HTTPS 但不想折腾证书
- 自托管服务的反向代理（Tailscale、Pi-hole、Plex）
- Docker 部署 + 自动 TLS
- 中小型 SaaS 的边缘节点
- 开发环境快速 mock HTTPS

**不适用**：

- 超大流量（每秒 10w+ QPS）→ 选 nginx + OpenResty 或 Envoy，性能更优
- 需要细粒度的 7 层 WAF / Bot 防护 → 选 nginx + ModSecurity 或 Cloudflare
- 需要复杂的 lua 脚本扩展 → nginx + OpenResty 生态更成熟
- 已经有 LB（ALB / GCLB） → 直接用云的 LB 自带证书更省心

## 历史小故事

- **2014 年**：Matt Holt（21 岁博士生）开源 Caddy 0.x，那时只是一个普通 Go 写的 HTTP 服务器
- **2015 年**：加入"自动 HTTPS" → **业界首创**。同年 Let's Encrypt 正式上线，Caddy 是第一个集成它的 Web 服务器
- **2020 年**：Caddy 2.0 完全重写——内部改成 JSON 配置 + 模块化插件系统 + admin API。商业授权问题解决，改成 Apache 2.0
- **2023 年**：ZeroSSL 加入默认 CA 列表（Let's Encrypt 之外多一个备选），抗单点故障
- **2024 年**：Caddy 2.8 加入 HTTP/3 默认开启，进一步领先

## 学到什么

1. **"默认就对"是产品力**——HTTPS 不是 feature，是默认。Caddy 把配置门槛拉到 0，让"忘记续证书"这个错误不可能发生
2. **声明式 > 命令式**——Caddyfile 描述"我要什么"，Caddy 自己想"怎么做"。比 nginx 的"显式配每个监听端口和证书路径"更适合 2024 年
3. **模块化是长寿基因**——Caddy 2.x 的插件系统让社区能扩展任何协议（L4 / DNS / Auth），核心保持精简
4. **第一性原理 vs 沿袭**——Matt Holt 没沿袭 Apache / nginx 的"配置文件 + reload 信号"老路，重新设计了 admin API + 声明式 Caddyfile，结果更简单

## 延伸阅读

- 官方文档：[caddyserver.com/docs](https://caddyserver.com/docs/)（Caddyfile 语法 + JSON 配置 + 插件全列表）
- 源码：[github.com/caddyserver/caddy](https://github.com/caddyserver/caddy)（Go 写的，结构清晰，适合学习 Go 服务器实现）
- [[lets-encrypt]] —— Caddy Auto-TLS 默认 CA
- [[nginx]] —— Caddy 的对照组，老牌 Web 服务器

## 关联

- [[lets-encrypt]] —— Caddy 自动 HTTPS 的证书来源
- [[nginx]] —— 同类对照：功能更强但配置更繁
- [[docker]] —— Caddy 最常见的部署方式（`caddy:latest` 镜像）
- [[traefik]] —— 同样主打"自动 HTTPS"的竞品，更偏 Kubernetes 生态

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[code-server]] —— code-server — 浏览器里的 VS Code
- [[envoy]] —— Envoy — 把网络通信从业务代码里抠出来的代理进程
- [[fiber]] —— Fiber — 把 Express 写法搬到 Go 上的高性能 web 框架
- [[flask]] —— Flask — 用装饰器把 URL 接到函数上的 Python 微框架
- [[freemodbus]] —— FreeModbus：嵌入式设备的 Modbus 从站协议栈
- [[gin]] —— Gin — Go 写 web API 的事实标准框架
- [[haproxy]] —— HAProxy — 高性能 LB，TCP/HTTP 双层负载均衡
- [[kong]] —— Kong — 基于 nginx + Lua 的云原生 API 网关
- [[krakend]] —— KrakenD — 把多个后端聚合成一次响应的高性能 API 网关
- [[meilisearch]] —— MeiliSearch — 开发者友好的搜索引擎
- [[minio]] —— MinIO — S3 兼容对象存储
- [[openvscode-server]] —— OpenVSCode Server：把上游 VS Code 跑进浏览器
- [[postal]] —— Postal — 自托管的 Mailgun / SendGrid 替代
- [[prometheus]] —— Prometheus — 时序监控系统
- [[traefik]] —— Traefik — 现代云原生反向代理
- [[tyk]] —— tyk — Go 实现的开源 API 网关，自带门户和多协议转换
- [[zincsearch]] —— ZincSearch — 单二进制 Go 写的 ES 替代
