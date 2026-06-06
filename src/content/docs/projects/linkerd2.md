---
title: Linkerd 2 — 用 Rust 写的轻量服务网格
来源: https://github.com/linkerd/linkerd2
日期: 2026-06-01
子分类: DevOps 与运维
分类: 基础设施
难度: 中级
provenance: pipeline-v3
---

## 是什么

**Linkerd 2** 是 Buoyant 公司开源的服务网格（service mesh），专为 Kubernetes 设计：在每个业务 Pod 旁边塞一个用 **Rust** 写的 sidecar 代理（叫 `linkerd2-proxy`），自动接管 Pod 之间的网络流量，免费送上 mTLS 加密、重试、负载均衡、调用指标这些功能。

日常类比：

- 没有服务网格 = 每个微服务自己手写 HTTP 客户端，自己处理重试、超时、TLS、监控；30 个服务 = 30 套重复代码
- 服务网格 = 给每个 Pod 配一个**专属 24 小时随身翻译加保镖**——业务代码继续讲普通话，进出门的所有"对外通话"都被这个保镖接管，加密、记录、必要时帮你重拨
- Linkerd 2 = 这个保镖**只有 10 MB 内存**，几乎听不见动静，但能干完 80% 的活

"service mesh"这个词本身就是 Linkerd 作者 William Morgan 2016 年那篇博客造的。它是世界上第一个服务网格项目，2021-07 成为首个从 CNCF 毕业的服务网格。

## 为什么重要

不用服务网格，下面这些事每个团队都要自己造一遍：

- **服务间 mTLS**——你想让 30 个微服务之间的通信都加密，要么改每个服务的代码，要么手撸证书发放系统；Linkerd 自动做，证书 24 小时滚一次
- **黄金指标（成功率 / 延迟 / RPS）**——产品经理问"昨晚 3 点谁在拖后腿"，没网格就要每个服务自己埋点；Linkerd 直接暴露 Prometheus 指标
- **重试和超时策略**——业务代码里散落 100 处 `retry(3)`，配置一改要发 30 次版本；Linkerd 把策略放到网格层，热更新生效
- **金丝雀发布**——把 5% 流量切到新版本观察，再逐步放量；Linkerd 配合 Flagger 用 SMI / Gateway API 实现

跟 Istio 比起来，Linkerd 故意砍掉很多功能（不做 API 网关、不支持 EnvoyFilter 这种灵活但复杂的资源），换来**配置量减半、资源占用十分之一**。

## 核心要点

Linkerd 2 的设计可以拆成 **三个赌注**：

1. **数据面用 Rust，不用 Envoy**：业界主流网格（Istio / Consul / Kuma）都用 C++ 写的 Envoy 当 sidecar，功能强但常驻内存 50-100 MB / 进程。Linkerd 2 自己写了一个叫 `linkerd2-proxy` 的代理，基于 Tokio + Hyper + Tower 三件套，**常驻 < 10 MB**、p99 延迟开销 < 1 ms。代价：功能少很多（没有 Lua 脚本扩展、没有 WASM 插件）。

2. **控制面用 Go，组件极简**：`linkerd-destination`（服务发现）/ `linkerd-identity`（证书签发）/ `linkerd-proxy-injector`（自动注入 sidecar），三个核心组件就是控制平面的全部。Istio 的控制面 `istiod` 单进程更"全能"，但配置面（VirtualService / DestinationRule / EnvoyFilter）至少 5 种 CRD。

3. **零配置开箱即用**：装完 Linkerd，给 Namespace 打个 `linkerd.io/inject: enabled` 注解，Pod 重启就有 sidecar，mTLS 自动开、指标自动出、仪表盘自动有。Istio 同样的事至少要配 PeerAuthentication + DestinationRule + Gateway。

代价非常清楚：要做复杂路由（按 header / 按 region / 按用户分流），Linkerd 干不了，得自己上 Istio 或 Envoy Gateway。

## 实践案例

### 案例 1：60 秒装好 + 注入第一个服务

```bash
# 装 CLI
curl -sL https://run.linkerd.io/install | sh
linkerd install --crds | kubectl apply -f -
linkerd install | kubectl apply -f -

# 给已有 namespace 打开自动注入
kubectl annotate ns my-app linkerd.io/inject=enabled
kubectl rollout restart deploy -n my-app
```

每个 Pod 现在多了一个 `linkerd-proxy` 容器，Pod 之间的流量自动 mTLS。

### 案例 2：看看 Pod 之间的金指标

```bash
linkerd viz install | kubectl apply -f -
linkerd viz dashboard
```

打开浏览器看到表格：每个 Deployment 的成功率、p50/p95/p99 延迟、RPS。点进去能看调用链路的拓扑图。这套东西自己用 Prometheus + Grafana 搭至少要 1 周。

### 案例 3：金丝雀发布把 5% 流量切到 v2

通过 Gateway API 的 HTTPRoute 写权重：

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: my-app
spec:
  rules:
    - backendRefs:
        - name: my-app-v1
          weight: 95
        - name: my-app-v2
          weight: 5
```

配合 Flagger 自动把权重从 5% → 100%，过程中只要 v2 的成功率掉到 99% 以下就回滚。

## 踩过的坑

1. **HTTP/2 的 mesh 流量计费成 1 个连接**——Linkerd 把同一个长连接上的多路复用流当成一个连接看，云厂商 LB 计费可能跟你想的不一样
2. **proxy 注入对 init container 不友好**——业务的 init container 跑得早于 linkerd-proxy，连不上外网；要么用 `linkerd.io/skip-outbound-ports` 跳过，要么用 native sidecar（k8s 1.29+）
3. **HA 模式三副本控制面是必须的**——单副本 `linkerd-destination` 重启时会有几秒丢服务发现；生产强制 `linkerd install --ha`
4. **跨集群 mesh 要单独装 multicluster 扩展**——核心 Linkerd 不带跨集群能力，要 `linkerd multicluster install` 装 gateway，配 link
5. **不能改 sidecar 行为**——Envoy 可以用 EnvoyFilter / WASM 插任意逻辑；Linkerd 的 Rust proxy 没有插件机制，要扩展只能 fork 重编

## 适用 vs 不适用场景

**适用**：

- 中小规模 K8s 集群（< 1000 服务）想要 mTLS + 黄金指标 + 重试，且不想养 Istio 那套复杂度
- 对 sidecar 资源占用敏感（边缘节点 / 高密度部署）
- 团队没有专职 platform engineer 维护网格配置
- 生产环境想要从 day 1 就有 zero-trust 网络

**不适用**：

- 需要复杂 L7 路由（按 cookie / header / geo 切流）—— 上 Istio 或 Envoy Gateway
- 需要 mesh 扩展插件（限流、自定义鉴权、JWT 校验）—— Linkerd proxy 不可扩展
- 已经全家桶 Istio 的团队再切 Linkerd 收益 < 迁移成本
- 非 K8s 部署（虚拟机 / 物理机）—— Linkerd 2 强绑定 K8s

## 跟邻居网格谁选谁

| 项目 | 数据面 | 卖点 | 跟 Linkerd 2 的差异 |
|------|--------|------|---------------------|
| Istio | Envoy (C++) | 功能最全，企业生态广 | 配置复杂、资源占用 5-10 倍、有 Ambient 模式可省 sidecar |
| Consul Connect | Envoy | HashiCorp 全家桶 | 强项是跨多 runtime（K8s + VM + 物理机） |
| Kuma | Envoy | 多区域 / 多集群一等公民 | Kong 维护，路由规则模型不一样 |
| Cilium Service Mesh | eBPF（无 sidecar） | 内核级零开销 | 还在演进，需要较新内核（5.10+） |
| Linkerd 2 | Rust proxy | 轻量、易上手、API 简单 | 功能最少，但够 80% 场景用 |

## 历史小故事（可跳过）

- **2016**：Buoyant 创始人 William Morgan 写博客提出 service mesh 概念，发布 Linkerd 1.x（Scala + Finagle，跑在 JVM 上，单 sidecar 吃 200 MB+）
- **2017-01**：Linkerd 进入 CNCF 沙箱（首个 service mesh）
- **2018**：意识到 JVM 太重无法上 K8s 大规模铺，团队彻底重写 —— 控制面 Go，数据面 Rust，命名 Linkerd 2，原 Linkerd 1 进入维护模式
- **2018-04**：Linkerd 进入 CNCF 孵化
- **2021-07**：Linkerd 从 CNCF 毕业（graduated），首个毕业的服务网格
- **2024**：Buoyant 改商业模式，企业版从开源仓拆出，社区版继续 Apache 2.0

## 学到什么

1. **"用 Rust 写网络代理"是 2018 年的赌注，2024 年看赌赢了**—— Hyper / Tokio 生态成熟，Rust 写出来的代理比 C++ 的 Envoy 内存少一个数量级，安全洞少一个数量级
2. **"砍功能"是产品定位**—— Linkerd 不要 EnvoyFilter / WASM / 复杂路由 DSL 不是做不到，是故意不做，留给 Istio / Gateway API
3. **"开箱即用 + 零配置"复利巨大**—— 团队不用养 platform engineer 才能跑起来，是中小厂的差异化
4. **CNCF 第一个 service mesh + 第一个毕业的 service mesh** —— 同一个项目两个里程碑，靠的是死磕 K8s + 死磕轻量

## 延伸阅读

- 官方文档：[linkerd.io/2/overview](https://linkerd.io/2/overview/)
- 设计动机：[Why Linkerd doesn't use Envoy](https://buoyant.io/blog/why-linkerd-doesnt-use-envoy)（William Morgan 2020）
- 论文级深度：[The Service Mesh: What Every Engineer Needs to Know](https://buoyant.io/service-mesh-manifesto)
- 源码入口：[github.com/linkerd/linkerd2](https://github.com/linkerd/linkerd2) 看 `controller/`，[github.com/linkerd/linkerd2-proxy](https://github.com/linkerd/linkerd2-proxy) 看 Rust 数据面

## 关联

- [[kubernetes]] —— Linkerd 2 强绑定 K8s，sidecar 注入靠 Pod admission webhook
- [[containerd]] —— K8s 容器运行时，Linkerd proxy 也跑在容器里
- [[envoy]] —— 友商主流 sidecar，Linkerd 故意不用它走自研 Rust 代理路线
- [[rust-tokio]] —— Linkerd proxy 的异步运行时基础
- [[helm]] —— `linkerd install` 底层就是渲染 Helm chart
- [[k3s]] —— 在边缘 K8s 上跑 Linkerd 是经典组合：轻量 K8s + 轻量 mesh
