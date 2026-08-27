---
title: Caddy — 自动 HTTPS Web 服务器
来源: https://github.com/caddyserver/caddy
日期: 2026-08-27
分类: DevOps / 网络
难度: 中级
trust:
  version: study-v2
  source_kind: project
  note_type: system
  canonical_source: https://github.com/caddyserver/caddy
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: e2eee6a7fce366321294c9c2a79f3146891dcbdf
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 2.11.4
---

## 是什么

Caddy 是用 Go 写的可扩展服务器平台：你写 Caddyfile 或原生 JSON，运行时先变成一份 `caddy.Config`，再按模块启动 HTTP / TLS / PKI。日常类比：它把「站点地址 + 处理指令」收成一张菜单，证书和重定向是默认配菜，不是你另外点的单。

```caddyfile
example.com {
  reverse_proxy localhost:3000
}
```

固定 `v2.11.4`（annotated tag 解引用 `e2eee6a7...`）的模块路径是 `github.com/caddyserver/caddy/v2`，Go 1.25.1，证书自动化走 `certmagic v0.25.3`。`caddy run` 不给 `--config` 时会尝试当前目录相邻的 `Caddyfile`。

## 为什么重要

不按固定提交读自动 HTTPS 和配置适配，下面这些印象会对不上：

- 为什么站点块里写公网主机名就会去申请证书，而 `localhost` 走 internal issuer
- 为什么没填 email 时默认 issuer 只有 Let's Encrypt，不是「永远 LE + ZeroSSL」
- 为什么 `caddy reload` 不是给进程发 `SIGHUP`
- 为什么 Docker 卷必须挂数据目录——证书在 `AppDataDir()`，不在 Caddyfile 旁边

## 核心架构与流程

固定 2.11.4 的主链可以拆成五步：

1. **Caddyfile 是 adapter**：`httpcaddyfile` 把 adapter 名注册为 `caddyfile`。文件名以 `Caddyfile` 开头或后缀 `.caddyfile`，且未指定别的 adapter 时，按 Caddyfile 适配成 JSON。

2. **Auto HTTPS 在 provisioning 扫 host**：`automaticHTTPSPhase1` 从路由 matcher 收集主机名。默认开证书管理和 HTTP→HTTPS 重定向；`disable` / `disable_redirects` / `disable_certificates` 可分别关掉。

3. **默认 issuer 不是双 CA 并列**：`DefaultIssuers(email)` 先放一个空 `ACMEIssuer`（CA 默认 `https://acme-v02.api.letsencrypt.org/directory`）。只有 email 非空才追加 ZeroSSL ACME issuer。失败重试用的 `TestCA` 默认是 Let's Encrypt staging。

4. **挑战与协议**：ACME HTTP-01 与 TLS-ALPN-01 默认启用。DNS-01 要配 DNS provider 模块；stock `modules/standard` 不含 `caddy-dns/cloudflare`。HTTP 服务器默认协议是 `[h1 h2 h3]`。

5. **热更新走 admin API**：Admin 默认听 `localhost:2019`（或环境变量 `CADDY_ADMIN`）。`caddy reload --config Caddyfile` 把适配后的 JSON `POST` 到 `/load`。若 `caddy run` 带着源文件启动，还会登记 last-config，供 SIGUSR1 从同一文件重载。

证书续期窗口是 automation policy 的 `RenewalWindowRatio`（注释写按证书总寿命，大约剩 1/3 时续）。这不是写死「签发后第 60 天」。Linux 数据目录是 `$XDG_DATA_HOME/caddy`，否则 `$HOME/.local/share/caddy`。

## 实践示例

### 案例 1：Caddyfile 反代

```caddyfile
example.com {
  reverse_proxy localhost:3000
}
```

`reverse_proxy` 在 `modules/caddyhttp/reverseproxy` 注册。公网主机名会进入 Auto HTTPS；HTTP 默认端口 80、HTTPS 443。本页未实际申请证书。

### 案例 2：静态文件

```caddyfile
example.com {
  root * /var/www
  file_server
}
```

`root` 是 Caddyfile 指令；`file_server` 注册为 HTTP handler。两者都在 stock 二进制里。

### 案例 3：重载与存储

```bash
caddy run
caddy reload --config Caddyfile
```

`reload` 需要能连上当前 admin 地址。容器里要把数据目录挂成 volume，否则重建后 `AppDataDir()` 里的证书丢失；ACME CA 有速率限制，频繁重签会被拒。

## 踩过的坑

1. **把 ZeroSSL 写成无条件默认 CA**：固定提交里，没 email 就只有默认 ACMEIssuer（Let's Encrypt production）。
2. **用 `SIGHUP` 当 reload**：CLI 走 admin `POST /load`。SIGUSR1 只服务「已登记源文件」那条路径。
3. **通配符只靠 HTTP-01**：`*.example.com` 需要 DNS 挑战和对应 DNS 模块；stock Caddy 没有 Cloudflare 插件。
4. **假设 80/443 一定通**：HTTP-01 要公网 80，TLS-ALPN-01 要 443。端口没开时申请会卡住，不是配置语法错。
5. **把未绑定的 QPS / 镜像拉取量当选型依据**：本页没有运行或对照基准。

## 适用 vs 不适用场景

**适用**：

- 希望公网站点默认 HTTPS，且能接受 Caddyfile → JSON → 模块这条链
- 自托管反代或静态站，证书存在本地 storage
- 需要 HTTP/1.1、HTTP/2、HTTP/3 同列默认协议

**不适用**：

- 必须用 DNS-01 / L4 / Docker label 自动配置，却只装 stock 二进制
- 要把未测吞吐写成「一定比 nginx 慢/快」
- 已经由云负载均衡终止 TLS，却仍假设 Caddy 会对外申请公网证书

## 固定版本边界

- 本文绑定 `caddyserver/caddy@e2eee6a7...`，annotated tag `v2.11.4` 解引用到该提交。
- 未安装 Go 工具链、未 `caddy run`、未联系任一 CA，状态保持 `UNVERIFIED`。
- `caddy-l4`、`caddy-docker-proxy`、各 DNS 插件是外部模块，不在本提交 `modules/standard`。

## 学到什么

1. **默认 HTTPS 是扫描主机名后的隐式政策**，不是 Caddyfile 里的一行魔法注释。
2. **Caddyfile 只是 adapter**——admin API 吃的是 JSON。
3. **issuer 集合取决于有没有 email**，不能把营销文案里的双 CA 当成无条件默认。
4. **证书寿命和续期比例属于 certmagic 政策**，不要把「60 天」写成 Caddy 常量。

## 应用型自测

1. 固定 2.11.4 在没填 email 时，`DefaultIssuers("")` 会不会同时加入 Let's Encrypt 和 ZeroSSL？
2. `caddy reload --config Caddyfile` 是给进程发 `SIGHUP` 吗？
3. 站点块只写 `localhost` 时，Auto HTTPS 会用默认公开 CA 申请公网证书吗？

检查点：

1. 不会。没 email 时只有默认 `ACMEIssuer`；ZeroSSL ACME 要 email 非空才追加。
2. 不是。它把适配后的 JSON `POST` 到 admin `/load`（默认 `localhost:2019`）。
3. 不会。`localhost` 等不合格公网名走 internal issuer。

## 延伸阅读

- 文档：[caddyserver.com/docs](https://caddyserver.com/docs/)
- 固定源码：[caddyserver/caddy](https://github.com/caddyserver/caddy) —— 本文绑定提交 `e2eee6a7fce366321294c9c2a79f3146891dcbdf`
- 审查记录：仓库内 `docs/caddy-centrifugo-source-review-20260827-fn.md`
- [[lets-encrypt]] —— 默认 ACMEIssuer 的 CA
- [[nginx]] —— 配置与证书流程不同的对照

## 关联

- [[lets-encrypt]] —— 默认公开 CA
- [[nginx]] —— 同类 Web 服务器
- [[docker]] —— 常见部署方式；数据目录必须持久化
- [[traefik]] —— 同样做自动证书，部署模型不同

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
