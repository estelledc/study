---
title: Traefik — 现代云原生反向代理
来源: https://github.com/traefik/traefik
日期: 2026-05-29
分类: DevOps / 网络
难度: 中级
---

## 是什么

Traefik 是法国工程师 Emile Vauge 2015 年用 Go 写的"自动发现服务的反向代理"；随后成立 Containous（2020 年改名 Traefik Labs）继续维护。

日常类比：[[nginx]] 像手动配 100 行的酒店前台——每次新客人入住，前台都要在登记本上写一遍「房间号 → 客人名」。新客人来一次，配置改一次。

Traefik 像智能门禁系统——你的车（容器）一开进车库，门禁通过车牌（label）自动认出"这是 502 房间张先生的车"，自动放行、自动分配车位。新车来了不用改任何配置。

具体来说，Traefik 监听服务发现源（[[docker]] / [[kubernetes]] / Consul / Etcd），实时感知有哪些服务在跑、暴露在哪个端口、想要什么域名，然后自动生成路由规则。

## 为什么重要

- **天然适配容器化**：和 [[docker]] / [[kubernetes]] 深度集成，监听容器或 Service 自动建路由，不需要每次手动 reload
- **Auto-HTTPS 省心**：和 [[caddy]] 一样，开箱即用 Let's Encrypt 自动签证书 + 自动续期
- **中间件机制易扩展**：认证 / 限流 / 重写 headers 都做成可插拔中间件，链式组合
- **配置语法灵活**：YAML / TOML / Container Labels 三选一，labels 模式让"配置随容器走"

如果你在写云原生应用，部署链路里大概率会碰到 Traefik——它是常见的 Kubernetes Ingress Controller 选择之一。

## 核心要点

Traefik 的工作模型可以拆成 **三层**：

1. **Provider（提供者）**：监听服务发现源。可以同时监听多个，比如同时监听 Docker socket 和 K8s API。
   - 类比：眼睛——看世界发生了什么变化

2. **Router（路由器）**：决定哪些请求路由到哪个 service。规则比如 `Host('example.com') && PathPrefix('/api')`。
   - 类比：交通指挥——根据车牌和目的地决定走哪条路

3. **Middleware（中间件）**：请求路由到 service 之前，链式经过若干中间件。比如先经过 auth 验身份，再经过 rate-limit 限流，最后才到 service。
   - 类比：安检通道——一道道关卡按顺序过

三层加起来构成 Traefik 的请求处理流水线。

## 实践案例

### 案例 1：Docker 模式自动发现

启动 Traefik，挂载 Docker socket（宿主机上 Docker 的"对讲机"文件，Traefik 靠它听容器启停），并显式打开 Docker Provider：

```bash
docker run -d -p 80:80 -p 8080:8080 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  traefik:v3.0 \
  --providers.docker=true --api.insecure=true
```

再给业务容器贴 label（车牌）：

```bash
docker run -d \
  --label "traefik.http.routers.web.rule=Host(\`example.com\`)" \
  --label "traefik.http.services.web.loadbalancer.server.port=3000" \
  my-app:latest
```

Traefik **自动**生成路由：`example.com` → 该容器 3000 端口；无需重启、无需改配置文件。

### 案例 2：Kubernetes IngressRoute

K8s 标准 `Ingress` 能力有限；Traefik 用自家 CRD（自定义资源类型，像给 K8s 加新表格）`IngressRoute`：

```yaml
apiVersion: traefik.io/v1alpha1
kind: IngressRoute
metadata:
  name: my-app
spec:
  entryPoints: [websecure]
  routes:
    - match: Host(`example.com`) && PathPrefix(`/api`)
      kind: Rule
      services: [{ name: my-app-svc, port: 80 }]
      middlewares: [{ name: auth-middleware }]
```

**逐步读**：`entryPoints` 是入口（如 HTTPS 的 websecure）；`match` 是匹配规则；`services` 是后端；`middlewares` 是过安检的名单。比标准 Ingress 多原生中间件、TCP/UDP、复杂规则。

### 案例 3：中间件链

先定义限流，再挂到路由（缺挂载则中间件不会生效）：

```yaml
http:
  middlewares:
    rate-limit:
      rateLimit: { average: 100, burst: 50 }
  routers:
    web:
      rule: Host(`example.com`)
      middlewares: [rate-limit]
      service: web-svc
```

平均每秒 100、突发 50；超了直接 429。

## 踩过的坑

1. **三种配置语法混用易乱**：YAML / TOML / Labels 可并存，新人常两边都写规则却不知哪条生效。建议**单一来源**。
2. **中间件顺序敏感**：`auth → rate-limit` 先验身份；反过来会让攻击者先消耗 quota。**顺序就是逻辑**。
3. **ACME 证书重启丢失**：ACME 是自动申请证书的协议；默认写在容器内 `/acme.json`，重启后丢失会撞 Let's Encrypt 周限额。**必须**挂 volume 持久化。
4. **默认日志不够调试**：默认 INFO 看不到匹配细节；调试改 DEBUG，能看到 router / middleware / service 路径。

## 适用 vs 不适用场景

**适用**：
- 容器化部署（Docker / Kubernetes），服务每周增减 ≥1 次
- 需要 Auto-HTTPS 的小团队（约 1–20 人运维）
- 中等规模微服务——大约几十到几百个 service

**不适用**：
- 静态部署、服务列表几年不变——[[nginx]] 配一次更稳
- 极致性能（单核极限 QPS）——[[nginx]] 仍领先
- 复杂金丝雀/蓝绿切分——Istio / Envoy 更专业
- 重度 4–7 层混合协议——HAProxy 更成熟

## 历史小故事（可跳过）

- **2015**：Emile Vauge 写出 Traefik，主打"读 Docker socket 自动配路由"
- **2016**：成立 Containous；同年前后社区迎来 v1.0
- **2019**：v2.0 发布，把 frontend/backend 换成 router / service / middleware
- **2020**：Containous 改名 Traefik Labs
- **2024**：v3.0 加入 KEDA 集成、OpenTelemetry 原生支持

## 学到什么

1. **配置即环境**：label 模式让配置随容器走，迁移服务不用改 LB
2. **服务发现**是云原生核心抽象——Provider 同时支持十几种发现源
3. **中间件链**与 Express / Koa middleware 同源
4. **三层模型**（Provider → Router → Middleware → Service）是现代代理的常见架构

## 延伸阅读

- 官方文档：[Traefik Proxy Docs](https://doc.traefik.io/traefik/)（Provider / Router / Middleware 权威说明）
- 入门视频：[Traefik 2 快速上手](https://www.youtube.com/watch?v=H6dyioean6M)
- GitHub：[traefik/traefik](https://github.com/traefik/traefik)
- [[nginx]] —— 手动配置的经典反向代理对照
- [[caddy]] —— 同样主打 Auto-HTTPS 的轻量选择
- [[kubernetes]] —— Ingress Controller 主战场

## 关联

- [[nginx]] —— 老牌反向代理，性能极强但需手动配置
- [[caddy]] —— 同样主打 Auto-HTTPS，比 Traefik 更轻量但生态较小
- [[docker]] —— Traefik 最早的 Provider 来源
- [[kubernetes]] —— Traefik 作为 Ingress Controller 的主战场
- [[envoy]] —— 更偏服务网格数据面的代理，适合复杂流量策略
- [[consul]] —— 常见服务发现后端，可作 Traefik Provider

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
