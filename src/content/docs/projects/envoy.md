---
title: Envoy — 把网络通信从业务代码里抠出来的代理进程
来源: 'https://github.com/envoyproxy/envoy'
日期: 2026-05-30
子分类: Web 后端
分类: 后端 API
难度: 中级
provenance: pipeline-v3
---

## 是什么

Envoy 是一个**专门替你做网络通信的独立进程**：你的业务代码只需要调本地（localhost），剩下的"找哪台机、超时重试、限流熔断、收集日志"全交给它。日常类比：像公司前台——员工不直接跟外面打电话，所有进出电话都先到前台，前台决定接给谁、要不要录音、要不要拒接。

它是 Lyft 2016 年开源的 L7 代理（C++ 实现），核心特点是**配置可以从外部动态推下来**（叫 xDS 协议，一种 gRPC streaming），不用重启进程就能换路由规则。今天 Istio、AWS App Mesh、GCP Traffic Director 这些 service mesh 默认数据面都是 Envoy。

最小例子：业务进程只调 `127.0.0.1:9001`，Envoy 监听这个端口，把请求转发到真正的 user-service 集群（自动负载均衡 + 重试）：

```yaml
listeners:
- address: { socket_address: { port_value: 9001 } }
  filter_chains:
  - filters:
    - name: envoy.filters.network.http_connection_manager
      typed_config:
        route_config:
          virtual_hosts:
          - domains: ["*"]
            routes:
            - match: { prefix: "/" }
              route: { cluster: user-service }
clusters:
- name: user-service
  load_assignment:
    endpoints: [...]  # 一堆 IP:port
```

## 为什么重要

不理解 Envoy，下面这些事都没法解释：

- 为什么 Istio 之类的 service mesh 不用改业务代码就能加重试、加灰度、加 tracing
- 为什么云厂商的 API Gateway 越来越多基于 xDS 协议而不是各家自研配置
- 为什么微服务团队从 [[nginx]] 迁到 Envoy 后改路由不用 reload 配置文件了
- 为什么 gRPC / HTTP/2 / [[http-2]] 流量治理基本都长在 Envoy 上而不是 [[haproxy]]

## 核心要点

1. **Sidecar 模式**：Envoy 不是一个集中网关，它跟你的业务进程**一比一同 pod 部署**。每个 pod 里有 1 个业务容器 + 1 个 envoy 容器。类比：每个员工配一个私人助理处理外部联络，而不是全公司共用一个总机。
2. **xDS 动态配置**：Envoy 启动后通过 gRPC 长连接订阅一个 control plane，control plane 推 LDS（监听器）/ RDS（路由）/ CDS（集群）/ EDS（端点）四种配置流。类比：餐厅服务员手上的菜单是后厨实时同步的，不是开门前打印的。
3. **Filter chain 链式处理**：流量进 listener 后过一串 filter（认证 → 限流 → header 改写 → router），每个 filter 像装配线工位，可以放 lua 或 wasm 写的自定义逻辑。决定了功能是"加一段"而不是"改源码"。

## 实践案例

### 案例 1：本地两个进程做最小代理

跑一个最小 envoy，把 `:9001` 转到 `httpbin.org`，验证"业务调本地、Envoy 跨网"这个 sidecar 心智模型：

```yaml
static_resources:
  listeners:
  - address: { socket_address: { port_value: 9001 } }
    filter_chains:
    - filters: [{ name: envoy.filters.network.http_connection_manager, ... }]
  clusters:
  - name: httpbin
    type: LOGICAL_DNS
    load_assignment:
      endpoints: [{ lb_endpoints: [{ endpoint: { address: { socket_address: { address: httpbin.org, port_value: 80 }}}}]}]
```

`curl localhost:9001/get` → 业务以为在调本地，Envoy 实际转给了远端。这是 sidecar 心智模型最小验证。

### 案例 2：金丝雀发布（10% 流量切新版本）

不动业务代码，只改路由配置：

```yaml
routes:
- match: { prefix: "/api" }
  route:
    weighted_clusters:
      clusters:
      - { name: user-v1, weight: 90 }
      - { name: user-v2, weight: 10 }
```

push 到 control plane，Envoy 5 秒内全集群生效。回滚就把 weight 改回 100/0。这是为什么 service mesh 让发布"丝滑"——业务进程感觉不到。

### 案例 3：admin 端口排查问题

每个 Envoy 默认开 `:9901` 管理端口，是排查神器：

```bash
curl localhost:9901/stats | grep upstream_rq_pending  # 看连接池有没有打满
curl localhost:9901/clusters | grep health           # 看上游健康状态
curl localhost:9901/config_dump                       # 看当前生效配置
```

线上 502 第一反应不是看业务日志，是看 Envoy stats 里 `upstream_rq_5xx` 是哪个 cluster 涨上去的。

## 踩过的坑

1. 只看 `cx_active`（活跃连接数）不够，得看 `upstream_rq_pending_overflow`（请求排队溢出）才知道是不是连接池打满 —— 前者只反映 TCP 层，后者反映业务请求层。
2. Hot restart 热重启很丝滑但配置版本会漂移，新老 worker 短时间内行为不一致 —— 必须靠 xDS ack/nack 机制确认收敛后再切。
3. 默认 access log 走同步 IO 写文件，QPS 一上来 worker 线程被卡导致延迟雪崩 —— 生产必须换成异步 buffer 或直接走 stdout 由 sidecar 收。
4. Filter 在 yaml 里是**从上往下顺序执行**的，把 lua filter 放在 router filter 后面会发现 lua 根本没跑 —— router 是终点，后面的 filter 永远到不了。

## 适用 vs 不适用场景

适用：
- 微服务多语言栈、想统一治理重试/熔断/超时不重写每种语言的 SDK
- 已用 Kubernetes，想要金丝雀/A-B/流量镜像但不想改业务代码
- 需要 gRPC / HTTP/2 / WebSocket / TCP 层混合代理

不适用：
- 单语言单体应用，加 sidecar 反而 2 倍内存 + 多一跳延迟，[[nginx]] 或语言内 SDK 更轻
- 极致延迟敏感场景（HFT），多一跳 1-2ms 不能接受
- 团队没人懂 xDS/yaml 配置，又没用 Istio 之类的 control plane，纯手写 yaml 维护成本爆炸
- 只想做边缘网关 + 静态文件，[[caddy]] 或 [[traefik]] 配置心智更小

## 历史小故事（可跳过）

- 2015 年：Lyft 工程师 Matt Klein 启动项目，目标是替换内部 [[nginx]] + [[haproxy]] + 自研网关三件套，统一一套数据面。
- 2016 年 9 月：开源到 GitHub，主打 HTTP/2 原生支持 + 配置可动态下发，跟当时只能 reload 的 nginx 形成代差。
- 2017 年 5 月：IBM/Google/Lyft 联合发布 Istio，选 Envoy 做 sidecar 数据面，xDS 协议从此变成事实标准。
- 2018 年 11 月：从 CNCF incubating 毕业，跟 Kubernetes、Prometheus 同级。
- 2020 年后：AWS App Mesh、GCP Traffic Director、阿里云 ASM 都兼容 xDS，Envoy 成了云原生 L7 数据面的"x86"。

## 学到什么

- "把网络从业务里抠出来"是过去十年微服务治理的最大方法论变化，Envoy 是这个变化的物理载体。
- 配置动态下发（xDS）比配置文件 reload 强一个量级——不是性能差距，是心智差距：从"我要改配置部署一次"变成"我推个新规则它自己生效"。
- Sidecar 不是免费的：内存翻倍、多一跳延迟、运维多一个进程，得想清楚收益再用。
- 看 admin /stats 比看业务日志快——所有流量都过 Envoy，它的指标比业务日志更接近真相。

## 延伸阅读

- 官方文档 envoyproxy.io/docs —— 最权威，但分层很深，先看 Life of a Request
- Matt Klein 的博客 medium.com/@mattklein123 —— 创始人解释设计动机，比文档好读
- 视频：CNCF YouTube "Envoy Internals Deep Dive" —— 看 filter chain 怎么跑
- xDS REST/gRPC 协议规范（GitHub envoyproxy/data-plane-api） —— 想自己写 control plane 必看
- [[nginx]] —— 老一代 L7 代理，对照看能更懂 Envoy 哪里"动态"
- [[kubernetes]] —— Envoy 几乎只在 k8s 里部署 sidecar

## 关联

- [[nginx]] —— 老一代 L7 代理，配置静态、reload 才生效，Envoy 的对照参照系
- [[haproxy]] —— L4/L7 老牌负载均衡，性能好但动态配置弱，Lyft 当初就是嫌它不够动态才写 Envoy
- [[caddy]] —— 现代 L7 代理，自动 HTTPS 心智小，但不做 mesh 数据面
- [[kong]] —— API Gateway 偏管理面（鉴权/计费/插件市场），Envoy 偏数据面，常组合用
- [[traefik]] —— 云原生 ingress，自动发现服务，跟 Envoy 在 k8s 边缘代理位置重叠
- [[krakend]] —— API gateway 聚合多后端，跟 Envoy 是不同抽象层
- [[http-2]] —— Envoy 原生支持 HTTP/2，是它早期相对 nginx 的核心优势之一
- [[kubernetes]] —— Envoy 几乎只在 k8s pod 里以 sidecar 形态部署

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[caddy]] —— Caddy — 自动 HTTPS Web 服务器
- [[calico]] —— Calico — 用 BGP 路由把 K8s pod 当成一个个小路由器
- [[centrifugo]] —— Centrifugo — Go 写的开源实时消息服务器
- [[cilium]] —— Cilium — 用 eBPF 把 K8s 网络从 iptables 时代搬出来
- [[coturn]] —— coturn — 帮 WebRTC 穿越 NAT 的开源 TURN/STUN 中转服务器
- [[fluent-bit]] —— Fluent Bit — C 写的轻量日志 forwarder，K8s DaemonSet 默认选
- [[grpc-go]] —— gRPC-Go — Google RPC 框架的官方 Go 实现
- [[haproxy]] —— HAProxy — 高性能 LB，TCP/HTTP 双层负载均衡
- [[http-2]] —— HTTP/2 — 把 HTTP 从文本协议改造成二进制多路复用
- [[istio]] —— Istio — 给微服务装一层透明的网络治理面
- [[kong]] —— Kong — 基于 nginx + Lua 的云原生 API 网关
- [[krakend]] —— KrakenD — 把多个后端聚合成一次响应的高性能 API 网关
- [[kubernetes]] —— Kubernetes — 容器编排平台
- [[linkerd2]] —— Linkerd 2 — 用 Rust 写的轻量服务网格
- [[nginx]] —— nginx — 高性能 Web 服务器
- [[opentelemetry-collector]] —— opentelemetry-collector — OTel 官方核心仓库与组件模型
- [[otel-collector]] —— OpenTelemetry Collector — 可观测性数据的统一中转站
- [[ovenmediaengine]] —— OvenMediaEngine — 亚秒级直播流媒体服务器
- [[postfix]] —— Postfix — 把 sendmail 拆成一群最小权限的小工
- [[signal-server]] —— Signal-Server — 服务端看不到任何明文的即时通信后端
- [[thrift]] —— Thrift — 写一份 IDL 自动生成 28 种语言的 RPC 代码
- [[token-bucket-stripe]] —— Stripe Rate Limiters — 工业级令牌桶长什么样

