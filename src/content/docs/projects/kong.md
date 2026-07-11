---
title: Kong — 基于 nginx + Lua 的云原生 API 网关
来源: 'https://github.com/Kong/kong'
日期: 2026-05-30
分类: backend-api
难度: 中级
---

## 是什么

Kong 是一台**站在所有后端服务前面的"门卫 + 调度员"**：每个 HTTP 请求都先到它这里，由它决定查不查身份证、限不限速、转发给后面哪台机器，最后再统计一笔账。日常类比：写字楼一楼大堂——客人进门先刷卡（鉴权）、人多了排队（限流）、保安记登记本（日志），通过后才能上对应楼层（后端服务）。

技术上，Kong 是 **nginx + Lua** 拼起来的——nginx 提供超高性能的事件循环外壳，OpenResty / LuaJIT 让你在请求生命周期的各个阶段插入一段 Lua 脚本，这些 Lua 脚本就是"plugin"。Kong 自带几十个官方 plugin（鉴权、限流、转换、CORS、Prometheus 监控等），你也能用 Lua / Go / Python 写自己的。

它的独特定位：**纯反向代理（nginx / HAProxy）只懂转发**，**Service Mesh sidecar（Envoy / Linkerd）偏微服务内部东西向流量**，Kong 卡在"南北向 API 入口 + 丰富业务 plugin"这块。

## 为什么重要

不理解 Kong 这类 API 网关，下面这些事都没法解释：

- 为什么互联网公司每个微服务**不需要自己写一遍鉴权 / 限流 / 监控**——这些横切关注点被抽到入口层
- 为什么 K8s 集群对外暴露一个域名，背后能挂上百个服务还能按路径精细路由
- 为什么"一个 token 全公司通用"成为可能——网关统一验签、统一签发，下游服务只看 header
- 为什么 LLM API 流量近两年要走"AI Gateway"——本质就是 Kong 这种网关加了 LLM 专属 plugin

## 核心要点

Kong 处理一个请求可以拆成 **三步**：

1. **匹配 route**：一个请求进来，按 host / path / method 找到对应的 **Route → Service** 配置。类比：大堂前台扫码看你今天约的是哪家公司、几楼。Route 决定"该转给谁"，Service 是后端地址。

2. **跑 plugin 链**：找到 route 后，触发挂在它上面的 plugin 列表，按优先级数字从大到小执行。每个 plugin 在 nginx 的 `access`、`header_filter`、`log` 等不同阶段插钩子。类比：保安按流程过——先验证件，再发访客牌，再登记。

3. **代理转发 + 收尾**：plugin 都通过后，nginx 把请求转给后端，拿回响应再走一遍 response 阶段的 plugin（改 header、记录 metrics），最后回给客户端。

整套用 LuaJIT 跑，单实例可扛 1 万+ QPS——和裸 nginx 同数量级。

## 实践案例

### 案例 1：30 秒给一个裸服务加鉴权

启动 Kong（DB-less 模式），用一份 YAML 描述路由 + plugin：

```yaml
# kong.yaml
_format_version: "3.0"
services:
  - name: my-api
    url: http://backend:3000
    routes:
      - name: api-route
        paths: [/api]
    plugins:
      - name: key-auth
consumers:
  - username: alice
    keyauth_credentials:
      - key: secret-key-123
```

`docker run kong/kong-gateway -e KONG_DATABASE=off -e KONG_DECLARATIVE_CONFIG=/kong.yaml` 启动后，请求 `/api` 必须带 header `apikey: secret-key-123` 才能通过。**整个过程后端代码不动一行**。

### 案例 2：Kubernetes Ingress + CRD 声明 plugin

```yaml
# 给一个 Service 挂 rate-limit plugin
apiVersion: configuration.konghq.com/v1
kind: KongPlugin
metadata:
  name: rate-limit
config:
  minute: 100
plugin: rate-limiting
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  annotations:
    konghq.com/plugins: rate-limit
spec:
  rules:
    - host: api.example.com
      http:
        paths:
          - path: /v1
            backend: { service: { name: my-svc, port: { number: 80 } } }
```

`konghq.com/plugins` 注解把 plugin 绑到 Ingress 上——和 K8s 原生资源用法一致，运维不用学新概念。

### 案例 3：decK + Git 做声明式 GitOps

```bash
deck dump --output-file kong.yaml          # 把当前线上配置导出
git add kong.yaml && git commit -m "..."   # 改完提交
deck sync --state kong.yaml                # CI 里推回 Kong
```

`decK` 是官方配置同步工具——配置变更走 PR review，回滚就是 `git revert`。比手 curl 改 Admin API 安全得多。

## 踩过的坑

1. **Admin API 默认 8001 端口无鉴权**——直接暴露公网等于把网关钥匙挂门上，必须用 firewall / mTLS / 反代锁住，仅限 ops 网络访问
2. **数据库模式下 PostgreSQL 是单点**——网关本身能水平扩展但配置层没扩，DB 抖动整个集群挂；生产推 DB-less + decK GitOps
3. **自写 Lua plugin 内存泄漏**——闭包持外部表 / 全局变量没释放，worker 越跑越胖；用 `ngx.timer.at` 调度时务必清引用，定期监控 worker 内存
4. **plugin 优先级搞反就灾难**——比如 rate-limiting 排在 key-auth 前，匿名请求也消耗配额；每个 plugin 有 priority 数字，必须照官方表排

## 适用 vs 不适用场景

**适用**：

- 微服务南北向流量统一入口（鉴权、限流、CORS、监控集中管理）
- Kubernetes Ingress 替代或补充（比 ingress-nginx 更易扩展 plugin）
- 多团队多服务的对外开放 API 平台（每个团队管自己的 Service / Route）
- LLM / AI 流量统一接入（Kong AI Gateway plugin 处理 token 计费、请求路由）

**不适用**：

- service mesh 内部东西向流量（用 Istio / Linkerd 的 sidecar 更合适）
- 极简反代场景（只是把 80 转 8080，nginx 一行 `proxy_pass` 就完，Kong 重了）
- 需要四层 TCP 复杂分流（用 [[haproxy]] 更直接，Kong 主要做 L7）
- 团队完全不会 Lua 又要大量自定义逻辑（学习曲线在这里）

## 历史小故事（可跳过）

- **2015 年**：Mashape（一个 API 市场公司）开源 Kong，想用它管自己平台后端的几千个 API；底层选了 OpenResty——nginx + LuaJIT 那套 Cloudflare 也在用
- **2018 年**：云原生大潮，Kong Ingress Controller 让它在 K8s 集群里成为常见入口选择
- **2020 年**：1.x 加 DB-less + 声明式配置，迎合 GitOps 工作流；混合模式（控制面 / 数据面分离）让大集群部署更安全
- **2023 年**：3.x 把核心写得更模块化，plugin 系统稳定；OSS 版仍活跃，企业版 Kong Konnect 上云
- **2024-至今**：押注 AI Gateway，给 LLM 流量提供统一接入层（OpenAI / Anthropic / Bedrock 互转）

## 学到什么

1. **横切关注点应该抽到入口层**——鉴权 / 限流 / 监控这些事每个服务都做一遍是巨大浪费，网关一次搞定
2. **plugin 体系是网关的灵魂**——不是核心代码强大，而是周边生态丰富；插件化让每个团队按需组合
3. **声明式配置 + GitOps 是现代运维标配**——手动改 Admin API 在小团队尚可，规模化后必须 YAML + 版本控制
4. **Lua / OpenResty 这层"半内核扩展"语言**很值钱——能在 nginx 进程内跑业务逻辑而不掉性能，Kong / Apisix / 阿里云 SLB 都用这套

## 延伸阅读

- 官方文档：[Kong Gateway Docs](https://docs.konghq.com/gateway/latest/)（架构 + plugin reference）
- 教程：[Getting Started with Kong](https://docs.konghq.com/gateway/latest/get-started/)（30 分钟跑通 DB-less 模式）
- 视频：[YouTube — Kong Gateway 入门](https://www.youtube.com/results?search_query=kong+gateway+tutorial)
- 写自己的 plugin：[Kong Plugin Development Kit](https://docs.konghq.com/gateway/latest/plugin-development/)（用 Lua 一步步写）
- 对比阅读：[[traefik]] / [[caddy]] —— 两种现代网关的不同侧重

## 关联

- [[nginx]] —— Kong 的底座，理解 nginx 的 phase 模型才看得懂 Kong plugin 在哪一刻插钩子
- [[haproxy]] —— 四层 / L7 LB 老牌选手，纯转发场景比 Kong 更轻；Kong 强项是 plugin 而不是分流
- [[caddy]] —— Go 写的现代反代，自动 HTTPS 是亮点；定位偏静态站，没 Kong 的 plugin 生态
- [[traefik]] —— 容器原生 LB，从 Docker / K8s 自动发现服务；和 Kong Ingress 同领域不同思路
- [[kubernetes]] —— Kong 的最大宿主之一，Ingress Controller 让 plugin 走 K8s CRD 声明
- [[redis]] —— Kong 的 rate-limiting / session plugin 常把状态外存到 Redis 做集群共享
- [[http-2]] —— Kong 上游和客户端两侧都需支持 HTTP/2，stream 复用对超时配置有微妙影响

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[envoy]] —— Envoy — 把网络通信从业务代码里抠出来的代理进程
- [[krakend]] —— KrakenD — 把多个后端聚合成一次响应的高性能 API 网关
- [[nginx]] —— nginx — 高性能 Web 服务器
- [[tyk]] —— tyk — Go 实现的开源 API 网关，自带门户和多协议转换
