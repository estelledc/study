---
title: Istio — 给微服务装一层透明的网络治理面
来源: 'https://github.com/istio/istio'
日期: 2026-06-01
分类: infrastructure
难度: 中级
---

## 是什么

Istio 是一个**给一堆微服务自动加上"路由 / 加密 / 监控"的工具**：你不改业务代码，它在每个服务旁边塞一个代理（[[envoy]]），所有进出流量都被它接管，规则用 YAML 一写，整片集群立刻生效。日常类比：像给办公楼里每个工位都派了一名秘书，老板（控制面）发一条新规定，所有秘书同时改口径——员工本人完全不知道刚刚发生了什么。

它是 Google + IBM + Lyft 2017 年发起的项目，2018 年 1.0 GA，2022 年捐给 [[cncf]]，2023 年 graduated。今天它是**服务网格（service mesh）领域事实上的标准**。

最小例子：把 reviews 服务的 v1 流量切 90%、v2 切 10%（还需配套 DestinationRule 定义 subset，见案例 2），业务代码一行不改：

```yaml
apiVersion: networking.istio.io/v1
kind: VirtualService
metadata:
  name: reviews
spec:
  hosts: [reviews]
  http:
  - route:
    - destination: { host: reviews, subset: v1 }
      weight: 90
    - destination: { host: reviews, subset: v2 }
      weight: 10
```

## 为什么重要

不理解 Istio，下面这些事都没法解释：

- 为什么大型微服务公司宣传"灰度发布、自动 mTLS、全链路追踪"，业务代码却看起来跟单体时代一样朴素
- 为什么 [[envoy]] 火起来之后，大家不直接配 Envoy，而是套一层 Istio
- 为什么云厂商（GCP Anthos、阿里云 ASM、AWS App Mesh）的 service mesh 产品大半基于 Istio API
- 为什么 Ambient mode 一出来 service mesh 圈炸锅——它把已经被吐槽 5 年的 sidecar 模式给改了

## 核心要点

1. **数据面 = Envoy sidecar**：每个 [[kubernetes]] pod 里塞一个 envoy 容器，业务进程的流量被 iptables 透明劫持到 envoy。类比：每个员工配私人秘书，员工只跟秘书说话，秘书去外面打电话。
2. **控制面 = istiod**：一个进程同时干"算路由（Pilot）/ 发证书（Citadel）/ 校验配置（Galley）"三件事——1.5 版本 2020 年合并掉了原来的 4 进程架构。istiod 用 **xDS**（一套"把配置推给代理"的 gRPC 协议）实时推给每个 envoy。
3. **核心抽象：4 个 CRD**（Custom Resource Definition，k8s 里自定义的配置种类）。VirtualService 写"流量怎么路由"，DestinationRule 写"目标服务有哪些子集 / 用什么连接池策略"，Gateway 写"南北向入口怎么暴露"，ServiceEntry 写"集群外的服务怎么纳入网格"。
4. **三大功能域**：流量管理（路由 / 重试 / 超时 / 故障注入）、安全（mTLS 自动签发与轮转 / AuthorizationPolicy）、可观测性（自动产生 metrics / traces / access log，无需业务改 SDK）。
5. **Ambient mode（2024 GA）**：去掉 sidecar，改成"每节点 1 个 L4 代理 ztunnel + 按需的 L7 waypoint proxy"。解决了 sidecar 模式资源浪费、升级麻烦、启动顺序坑这三个老问题。

## 实践案例

### 案例 1：sidecar 怎么被注入

namespace 打个 label，控制面里的 mutating webhook 就会在 pod 创建时偷偷把 envoy 容器塞进去：

```bash
kubectl label namespace default istio-injection=enabled
kubectl apply -f bookinfo.yaml
kubectl get pod -n default
# NAME                       READY  STATUS
# productpage-v1-xxx         2/2    Running   ← 1 业务 + 1 envoy
```

业务镜像 `productpage:v1` 完全不知道自己被加了一层。

### 案例 2：5 行 YAML 配灰度

把 10% 流量切到 reviews v2，其余留 v1，不需要写代码、不需要重启：

```yaml
apiVersion: networking.istio.io/v1
kind: VirtualService
spec:
  hosts: [reviews]
  http:
  - route:
    - destination: { host: reviews, subset: v1 }
      weight: 90
    - destination: { host: reviews, subset: v2 }
      weight: 10
```

配套的 DestinationRule 告诉网格"v1 / v2 分别是什么 pod"：

```yaml
apiVersion: networking.istio.io/v1
kind: DestinationRule
spec:
  host: reviews
  subsets:
  - name: v1
    labels: { version: v1 }
  - name: v2
    labels: { version: v2 }
```

### 案例 3：mTLS 自动加密

不写一行代码，全集群所有服务之间自动开 mTLS：

```yaml
apiVersion: security.istio.io/v1
kind: PeerAuthentication
metadata: { name: default, namespace: istio-system }
spec:
  mtls: { mode: STRICT }
```

证书由 istiod 自动签发，每 24 小时轮转。业务感知不到。

## 踩过的坑

1. **sidecar 注入失败**：忘了给 namespace 打 `istio-injection=enabled` label，pod 跑起来只有 1/1 容器，所有"灰度 / mTLS / 追踪"全失效。先 `kubectl get ns -L istio-injection` 检查。

2. **mTLS 直接跳 STRICT**：从默认 PERMISSIVE（双向兼容）一步切到 STRICT，老客户端连不上。生产正确路径是先开 PERMISSIVE 观察 metrics 一两周，确认没明文流量，再切 STRICT。

3. **VirtualService 没配套 DestinationRule**：路由里写 `subset: v2` 但 DestinationRule 没定义 v2 这个 subset，envoy 直接把请求 503。这俩 CRD 必须成对。

4. **跨多个 minor 升级**：1.16 直接升 1.20 几乎必爆 webhook/CRD 不兼容。官方支持的升级路径是连续 minor，最多跨 2 个版本。

5. **资源开销**：每个 pod 多 1 个 envoy 容器，CPU 内存都涨。1000 个 pod 的集群多出 1000 个 envoy，几十 GB 内存就这么没了——这也是 Ambient mode 想解的核心痛点。

## 适用 vs 不适用场景

**适用**：
- [[kubernetes]] 上的微服务集群（Istio 几乎只跟 k8s 玩）
- 需要灰度发布 / A·B 测试 / 故障注入但又不想改业务代码
- 多团队多语言，统一加 mTLS / metrics / trace
- 已经有 [[envoy]] 但配置散乱，想用控制面统一管

**不适用**：
- 单体或少量服务（< 10 个）—— 运维成本远超收益，直接用 [[nginx]] / API Gateway 就够
- 资源紧的边缘节点（每 pod 多一个 envoy 吃不消） → 看 Ambient mode 或 [[linkerd]]
- 非 k8s 环境（VM / 裸机）—— 虽然支持，但生态弱很多
- 团队没人懂 Envoy / xDS —— 出问题没法排查，工单只会越积越多

## 历史小故事（可跳过）

- **2017**：Google + IBM + Lyft 发起 Istio，数据面押注 [[envoy]]
- **2018**：1.0 GA；同年 service mesh 概念出圈
- **2020**：1.5 把 Pilot / Citadel / Galley 等合并成单一 istiod
- **2022–2023**：捐给 [[cncf]]，次年 graduated；Ambient 设计公开
- **2024**：Istio 1.24 起 Ambient mode GA，sidecar 不再是唯一默认形态

## 学到什么

1. **"在数据面塞一层"是治理微服务的最小侵入手段**——业务代码完全不知情，规则全在 YAML
2. **xDS 协议是 service mesh 的事实标准**：不只 Istio，App Mesh / Traffic Director 都用它
3. **架构合并不是退步**：istiod 把 4 进程合成 1 进程是务实的简化
4. **sidecar 模式是过渡形态**：Ambient 已经在示范"既要透明治理、又不要每 pod 一个代理"的下一代

## 延伸阅读

- 官方教程：[Istio Getting Started](https://istio.io/latest/docs/setup/getting-started/)（30 分钟跑完 bookinfo demo）
- 深入原理：[Istio in Action](https://www.manning.com/books/istio-in-action)（Manning 出版，2022）
- Ambient 设计：[Istio Ambient Mesh Explained](https://istio.io/latest/blog/2022/introducing-ambient-mesh/)
- [[envoy]] —— Istio 的数据面
- [[kubernetes]] —— Istio 几乎只在 k8s 上跑
- [[linkerd]] —— 主要竞品

## 关联

- [[envoy]] —— 数据面代理，Istio 的核心运行时
- [[kubernetes]] —— Istio 的部署底座
- [[grpc]] —— xDS 协议本身就是 gRPC streaming
- [[prometheus]] —— Istio 自动产生的 metrics 默认写到这里
- [[opentelemetry]] —— 分布式追踪标准，Istio 通过 envoy 自动产生 span

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[chaos-mesh]] —— Chaos Mesh — K8s 原生混沌工程平台
- [[cilium]] —— Cilium — 用 eBPF 把 K8s 网络从 iptables 时代搬出来
- [[envoy]] —— Envoy — 把网络通信从业务代码里抠出来的代理进程
- [[kubernetes]] —— Kubernetes — 容器编排平台
- [[nginx]] —— nginx — 高性能 Web 服务器
- [[prometheus]] —— Prometheus — 时序监控系统

