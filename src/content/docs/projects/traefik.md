---
title: Traefik — 现代云原生反向代理
来源: https://github.com/traefik/traefik
日期: 2026-05-29
子分类: cloud-native
分类: 后端 API
难度: 中级
provenance: pipeline-v3
---

## 是什么

Traefik 是 Containous 公司（现 Traefik Labs）2015 年用 Go 写的"自动发现服务的反向代理"。

日常类比：[[nginx]] 像手动配 100 行的酒店前台——每次新客人入住，前台都要在登记本上写一遍「房间号 → 客人名」。新客人来一次，配置改一次。

Traefik 像智能门禁系统——你的车（容器）一开进车库，门禁通过车牌（label）自动认出"这是 502 房间张先生的车"，自动放行、自动分配车位。新车来了不用改任何配置。

具体来说，Traefik 监听服务发现源（[[docker]] / [[kubernetes]] / Consul / Etcd），实时感知有哪些服务在跑、暴露在哪个端口、想要什么域名，然后自动生成路由规则。

## 为什么重要

- **天然适配容器化**：和 [[docker]] / [[kubernetes]] 深度集成，监听容器或 Service 自动建路由，不需要每次手动 reload
- **Auto-HTTPS 省心**：和 [[caddy]] 一样，开箱即用 Let's Encrypt 自动签证书 + 自动续期
- **中间件机制易扩展**：认证 / 限流 / 重写 headers 都做成可插拔中间件，链式组合
- **配置语法灵活**：YAML / TOML / Container Labels 三选一，labels 模式让"配置随容器走"

如果你在写云原生应用，部署链路里大概率会碰到 Traefik——它是 Kubernetes Ingress Controller 排名前三的选择之一。

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

启动 Traefik 容器，挂载 Docker socket：

```bash
docker run -d \
  -p 80:80 \
  -p 8080:8080 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  traefik:v3.0
```

`-v /var/run/docker.sock` 让 Traefik 能"看见"宿主机所有 Docker 容器的事件。

然后启动一个业务容器，加上 label：

```bash
docker run -d \
  --label "traefik.http.routers.web.rule=Host(\`example.com\`)" \
  --label "traefik.http.services.web.loadbalancer.server.port=3000" \
  my-app:latest
```

Traefik 看到这个新容器，**自动**生成路由：`example.com` → 这个容器的 3000 端口。
你不需要重启 Traefik，不需要改任何配置文件。

### 案例 2：Kubernetes IngressRoute

K8s 标准的 `Ingress` 资源能力有限，Traefik 提供了自家 CRD `IngressRoute`：

```yaml
apiVersion: traefik.io/v1alpha1
kind: IngressRoute
metadata:
  name: my-app
spec:
  entryPoints:
    - websecure
  routes:
    - match: Host(`example.com`) && PathPrefix(`/api`)
      kind: Rule
      services:
        - name: my-app-svc
          port: 80
      middlewares:
        - name: auth-middleware
```

`IngressRoute` 比标准 Ingress 多了原生中间件支持、TCP/UDP 路由、复杂规则匹配。

### 案例 3：中间件链

定义一个限流中间件：

```yaml
http:
  middlewares:
    rate-limit:
      rateLimit:
        average: 100
        burst: 50
```

挂到路由上后，每秒 100 请求平均、瞬时 50 突发——超了直接 429。

## 踩过的坑

1. **三种配置语法混用易乱**：YAML（静态文件） / TOML（老格式） / Labels（动态）三种语法可以同时存在。新人常在 YAML 里写规则，又在 Docker label 里写规则，最后排查到底哪条生效。建议**单一来源**：要么全 labels，要么全 file。

2. **中间件顺序敏感**：`auth → rate-limit` 和 `rate-limit → auth` 行为完全不同。前者先验身份再限流（匿名请求都拒），后者先限流再验身份（攻击者能消耗你的 quota）。写中间件链时**顺序就是逻辑**。

3. **ACME 证书重启丢失**：Let's Encrypt 自动签的证书默认存在容器内 `/acme.json`。容器重启后文件丢失，重新签会触发 Let's Encrypt 的 rate limit（每周 5 次）。**必须**挂载 volume 持久化 `acme.json`。

4. **默认日志不够调试**：Traefik 默认 INFO 级别，看不到路由匹配细节。调试时改成 DEBUG，能看到每个请求经过哪个 router、哪些 middleware、最终去了哪个 service。

## 适用 vs 不适用场景

**适用**：
- 容器化部署（Docker / Kubernetes）
- 频繁增减服务的场景——Traefik 自动跟上
- 需要 Auto-HTTPS 的小团队——省心
- 中等规模微服务——几十到几百个 service

**不适用**：
- 静态部署、服务列表几年不变——[[nginx]] 配一次能用很久，更稳
- 极致性能场景——[[nginx]] 单核 QPS 仍领先
- 需要复杂 L4 / L7 流量切分（金丝雀、蓝绿）——Istio / Envoy 更专业
- 对 4-7 层混合协议有重度需求——HAProxy 更成熟

## 历史小故事

- **2015**：法国工程师 Emile Vauge 在 Containous 公司创立 Traefik，第一个版本就主打"读 Docker socket 自动配路由"
- **2016**：v1.0 发布，社区开始接纳
- **2019**：Containous 改名 Traefik Labs，专注代理产品线
- **2020**：v2.0 大重构，把"frontend / backend"模型换成"router / service / middleware"三层
- **2024**：v3.0 加入 KEDA 自动伸缩集成、OpenTelemetry 原生支持

## 学到什么

1. **配置即代码**的反面是**配置即环境**——Traefik 的 label 模式让配置随容器走，迁移服务不用改 LB
2. **服务发现** 是云原生的核心抽象——Provider 模型让 Traefik 同时支持十几种发现源
3. **中间件链** 是 web 框架到代理服务器的通用模式——和 Express middleware、Koa middleware 同源
4. **三层模型**（Provider → Router → Middleware → Service）是现代代理软件的标准架构

## 关联

- [[nginx]] —— 老牌反向代理，性能极强但需手动配置
- [[caddy]] —— 同样主打 Auto-HTTPS，比 Traefik 更轻量但生态较小
- [[docker]] —— Traefik 最早的 Provider 来源
- [[kubernetes]] —— Traefik 作为 Ingress Controller 的主战场
