---
title: 项目候选 — DevOps / CI / 容器编排 / 部署
日期: 2026-05-29
---

# DevOps / CI / 容器编排 / 部署 项目候选

候选 60 个，按子类分组（CI/CD 平台 7 / 容器运行时 6 / K8s 核心 6 / GitOps 2 / 服务网格 2 / Operator 4 / CNI 2 / 存储 2 / IaC 3 / 配置管理 1 / 镜像构建 3 / Secrets 4 / 监控可观测 5 / 日志管道 2 / APM 1 / Chaos 2 / 压测 2 / 平台工程 1 / K8s GUI 1 / 本地开发 4）。

现有 atlas 中 DevOps / CI 主题几乎空白；仅 `prom-client` 是 Node.js 出 metrics 的客户端 SDK（已在 atlas），与本表的 `prometheus`（TSDB server / scraper / 查询引擎）slug 与定位都不同。其余 59 个 slug 与 159 个现有 atlas 条目互斥，并已避开 `projects-cli.md` 已纳入的 k9s / dive / lazydocker / kubectx / stern。

Stars 量级为 2026 年 5 月近似值，候选门槛为 ≥ 1k stars。

## 总览

- **总数**：60 个
- **挑选维度**：CI/CD 平台 / 容器运行时 / Kubernetes 生态 / IaC / 监控告警 / 平台工程 / 本地开发
- **过滤**：闭源（Datadog / NewRelic / Port 商业部分）跳过；归档项目（weave-net / weave-gitops / img）跳过；< 1k stars 跳过

### 子类分布

| 子类 | 数量 |
|---|---:|
| [CI/CD 平台](#1-cicd-平台) | 7 |
| [容器运行时 / 引擎](#2-容器运行时--引擎) | 6 |
| [Kubernetes 核心 / 发行版](#3-kubernetes-核心--发行版) | 6 |
| [K8s GitOps / 持续部署](#4-k8s-gitops--持续部署) | 2 |
| [服务网格](#5-服务网格) | 2 |
| [K8s Operator / 集群运维](#6-k8s-operator--集群运维) | 4 |
| [K8s 网络 (CNI)](#7-k8s-网络-cni) | 2 |
| [K8s 存储](#8-k8s-存储) | 2 |
| [IaC](#9-iac) | 3 |
| [配置管理](#10-配置管理) | 1 |
| [镜像构建](#11-镜像构建) | 3 |
| [Secrets 管理](#12-secrets-管理) | 4 |
| [监控 / 可观测 / 追踪](#13-监控--可观测--追踪) | 5 |
| [日志 / 数据管道](#14-日志--数据管道) | 2 |
| [APM 开源](#15-apm-开源) | 1 |
| [Chaos engineering](#16-chaos-engineering) | 2 |
| [性能 / 压测](#17-性能--压测) | 2 |
| [平台工程](#18-平台工程) | 1 |
| [K8s GUI](#19-k8s-gui) | 1 |
| [本地开发](#20-本地开发) | 4 |

---

## 1. CI/CD 平台

| slug | 项目 | 一句话定位 | stars (≈) | GitHub |
|---|---|---|---:|---|
| jenkins | Jenkins | 老牌开源 CI server，pipeline DSL + 上千插件，企业 CI 事实标准 | 22k | https://github.com/jenkinsci/jenkins |
| drone | Drone CI | 容器原生 CI，YAML pipeline 每步跑容器，Harness 收购仍开源 | 33k | https://github.com/harness/drone |
| woodpecker | Woodpecker CI | drone 的社区 fork，纯开源、轻量、保留容器 step 模型 | 5k | https://github.com/woodpecker-ci/woodpecker |
| argo-workflows | Argo Workflows | Kubernetes 原生工作流引擎，DAG / step / suspend，CNCF 毕业 | 15k | https://github.com/argoproj/argo-workflows |
| tekton | Tekton Pipelines | K8s CRD 驱动的 cloud-native CI 框架，Task / Pipeline 可组合 | 9k | https://github.com/tektoncd/pipeline |
| act | act | 在本地用 Docker 跑 GitHub Actions，调试不用提交 | 62k | https://github.com/nektos/act |
| dagger | Dagger | 把 CI pipeline 写成代码（TS / Go / Python），BuildKit 缓存复用 | 14k | https://github.com/dagger/dagger |

---

## 2. 容器运行时 / 引擎

| slug | 项目 | 一句话定位 | stars (≈) | GitHub |
|---|---|---|---:|---|
| moby | Moby | Docker Engine 上游开源项目，containerd / buildkit 的容器组装母体 | 70k | https://github.com/moby/moby |
| podman | Podman | 无 daemon 的容器引擎，rootless / pod 原生 / 兼容 docker CLI | 25k | https://github.com/containers/podman |
| containerd | containerd | CNCF 毕业的容器运行时，Docker / K8s / nerdctl 共同底层 | 18k | https://github.com/containerd/containerd |
| runc | runc | OCI 标准的低层运行时，containerd 调用它 spawn 容器进程 | 12k | https://github.com/opencontainers/runc |
| cri-o | CRI-O | OCI 容器的 K8s CRI 实现，专为 K8s 而生（取代 dockershim） | 5k | https://github.com/cri-o/cri-o |
| nerdctl | nerdctl | containerd 的 docker 兼容 CLI，BuildKit / lazy-pull / encryption 一体 | 9k | https://github.com/containerd/nerdctl |

---

## 3. Kubernetes 核心 / 发行版

| slug | 项目 | 一句话定位 | stars (≈) | GitHub |
|---|---|---|---:|---|
| kubernetes | Kubernetes | 容器编排事实标准，整个云原生生态的根 | 110k | https://github.com/kubernetes/kubernetes |
| helm | Helm | K8s 的"包管理器"，Chart 模板 + values 复用部署 | 28k | https://github.com/helm/helm |
| kustomize | Kustomize | 无模板的 K8s YAML overlay 工具，已内置进 kubectl | 11k | https://github.com/kubernetes-sigs/kustomize |
| k3s | k3s | Rancher 的轻量 K8s 发行版，单 binary 几十 MB，IoT / edge 友好 | 30k | https://github.com/k3s-io/k3s |
| minikube | minikube | 官方本地 K8s 单节点工具，VM / 容器驱动多选 | 30k | https://github.com/kubernetes/minikube |
| kind | kind | "Kubernetes IN Docker"，CI 跑 K8s 集群的官方推荐 | 14k | https://github.com/kubernetes-sigs/kind |

---

## 4. K8s GitOps / 持续部署

| slug | 项目 | 一句话定位 | stars (≈) | GitHub |
|---|---|---|---:|---|
| argocd | Argo CD | GitOps 事实标准，Git 作 source of truth，Web UI 可视化 sync | 19k | https://github.com/argoproj/argo-cd |
| flux | Flux | GitOps 老牌实现，CRD 驱动，与 Helm / Kustomize 深度集成 | 7k | https://github.com/fluxcd/flux2 |

---

## 5. 服务网格

| slug | 项目 | 一句话定位 | stars (≈) | GitHub |
|---|---|---|---:|---|
| istio | Istio | 服务网格事实标准，Envoy 数据面 + 控制面 + Ambient mode | 36k | https://github.com/istio/istio |
| linkerd2 | Linkerd | 极简服务网格，Rust 数据面 micro-proxy，性能 / 资源占用 < istio | 11k | https://github.com/linkerd/linkerd2 |

---

## 6. K8s Operator / 集群运维

| slug | 项目 | 一句话定位 | stars (≈) | GitHub |
|---|---|---|---:|---|
| kubebuilder | Kubebuilder | 写 K8s Operator 的官方脚手架，controller-runtime 的"npm init" | 8.3k | https://github.com/kubernetes-sigs/kubebuilder |
| operator-sdk | Operator SDK | RH 维护的 Operator 框架，支持 Go / Ansible / Helm 三种风格 | 7.6k | https://github.com/operator-framework/operator-sdk |
| cert-manager | cert-manager | K8s 自动签发 / 续期 TLS 证书（ACME / Vault / 自建 CA 多 issuer） | 12k | https://github.com/cert-manager/cert-manager |
| velero | Velero | K8s 集群备份恢复工具，PV / 资源 / namespace 全覆盖 | 9k | https://github.com/vmware-tanzu/velero |

---

## 7. K8s 网络 (CNI)

| slug | 项目 | 一句话定位 | stars (≈) | GitHub |
|---|---|---|---:|---|
| cilium | Cilium | eBPF 驱动的 CNI / kube-proxy 替代，可观测 + 安全策略一体 | 21k | https://github.com/cilium/cilium |
| calico | Calico | 老牌 CNI / 网络策略引擎，BGP 路由 + eBPF 数据面双模 | 6.4k | https://github.com/projectcalico/calico |

---

## 8. K8s 存储

| slug | 项目 | 一句话定位 | stars (≈) | GitHub |
|---|---|---|---:|---|
| rook | Rook | K8s 的 Ceph operator，把分布式存储变成 CRD | 13k | https://github.com/rook/rook |
| longhorn | Longhorn | Rancher 的轻量分布式块存储，K8s 原生快照 / 备份 / 复制 | 7k | https://github.com/longhorn/longhorn |

---

## 9. IaC

| slug | 项目 | 一句话定位 | stars (≈) | GitHub |
|---|---|---|---:|---|
| terraform | Terraform | IaC 事实标准，HCL 声明云资源，HashiCorp 改 BSL 后仍主流 | 43k | https://github.com/hashicorp/terraform |
| opentofu | OpenTofu | Terraform 的 MPL fork，Linux Foundation 接管，社区驱动替代 | 25k | https://github.com/opentofu/opentofu |
| pulumi | Pulumi | 用真正语言（TS / Python / Go）写 IaC，类型 + IDE 全支持 | 22k | https://github.com/pulumi/pulumi |

---

## 10. 配置管理

| slug | 项目 | 一句话定位 | stars (≈) | GitHub |
|---|---|---|---:|---|
| ansible | Ansible | YAML playbook + SSH 推送的无 agent 配置管理事实标准 | 63k | https://github.com/ansible/ansible |

---

## 11. 镜像构建

| slug | 项目 | 一句话定位 | stars (≈) | GitHub |
|---|---|---|---:|---|
| buildkit | BuildKit | Docker / Moby 的下一代构建后端，并发 LLB 图 + 远程缓存 | 8.6k | https://github.com/moby/buildkit |
| kaniko | Kaniko | Google 的无 daemon 镜像构建器，K8s pod 内可安全跑 | 16k | https://github.com/GoogleContainerTools/kaniko |
| buildah | Buildah | 无 daemon 的 OCI 镜像构建工具（Podman 同家族，rootless 友好） | 7k | https://github.com/containers/buildah |

---

## 12. Secrets 管理

| slug | 项目 | 一句话定位 | stars (≈) | GitHub |
|---|---|---|---:|---|
| vault | Vault | HashiCorp 的 secrets 管理 + 动态凭据生成，企业事实标准 | 32k | https://github.com/hashicorp/vault |
| sops | SOPS | Mozilla 起家的 YAML / JSON secrets 加密工具（KMS / age / PGP 多 backend） | 17k | https://github.com/getsops/sops |
| sealed-secrets | Sealed Secrets | Bitnami 的 K8s Secret 加密 controller，可安全提交进 Git | 7.7k | https://github.com/bitnami-labs/sealed-secrets |
| age | age | Go 写的小型对称 / 非对称加密工具，sops / chezmoi 等的底层 | 17k | https://github.com/FiloSottile/age |

---

## 13. 监控 / 可观测 / 追踪

> 注：与 atlas 的 `prom-client`（Node.js 暴露 metrics 的 client SDK）不同，本表的 `prometheus` 是 TSDB server / scraper / PromQL 查询引擎本体，slug 和定位都互斥。

| slug | 项目 | 一句话定位 | stars (≈) | GitHub |
|---|---|---|---:|---|
| prometheus | Prometheus | TSDB + scraper + PromQL，云原生监控事实标准（CNCF 毕业） | 57k | https://github.com/prometheus/prometheus |
| grafana | Grafana | 多 datasource 的可视化平台，dashboard 事实标准 | 67k | https://github.com/grafana/grafana |
| loki | Loki | "Prometheus for logs"，按 label 索引、内容压缩存对象存储 | 25k | https://github.com/grafana/loki |
| tempo | Tempo | Grafana 的分布式追踪后端，OTel / Jaeger / Zipkin 兼容 | 4.5k | https://github.com/grafana/tempo |
| opentelemetry-collector | OpenTelemetry Collector | OTel 统一 receiver / processor / exporter 中转，trace + metric + log 三合一 | 5.4k | https://github.com/open-telemetry/opentelemetry-collector |

---

## 14. 日志 / 数据管道

| slug | 项目 | 一句话定位 | stars (≈) | GitHub |
|---|---|---|---:|---|
| fluent-bit | Fluent Bit | C 写的轻量级日志 / 指标 forwarder，K8s DaemonSet 默认选 | 6.5k | https://github.com/fluent/fluent-bit |
| vector | Vector | Datadog 的 Rust 写日志 / 指标 / 追踪管道，VRL DSL 转换强大 | 19k | https://github.com/vectordotdev/vector |

---

## 15. APM 开源

> 注：atlas 已有 `sentry`（错误追踪 / 性能监控），本表 `signoz` 是 OpenTelemetry-native 的开源 APM，slug 与底层栈都不同。

| slug | 项目 | 一句话定位 | stars (≈) | GitHub |
|---|---|---|---:|---|
| signoz | SigNoz | OpenTelemetry-native 的开源 APM，trace / metrics / logs 一体 UI | 21k | https://github.com/SigNoz/signoz |

---

## 16. Chaos engineering

| slug | 项目 | 一句话定位 | stars (≈) | GitHub |
|---|---|---|---:|---|
| chaos-mesh | Chaos Mesh | K8s 原生混沌平台，network / pod / IO / kernel 故障注入 | 6.7k | https://github.com/chaos-mesh/chaos-mesh |
| litmus | LitmusChaos | CNCF 的混沌工程框架，experiment 仓库 + workflow + UI | 4.6k | https://github.com/litmuschaos/litmus |

---

## 17. 性能 / 压测

| slug | 项目 | 一句话定位 | stars (≈) | GitHub |
|---|---|---|---:|---|
| k6 | k6 | Grafana 的 JS / TS 写的现代负载测试器，CI 友好 + Prometheus 出指标 | 26k | https://github.com/grafana/k6 |
| locust | Locust | Python 写测试场景的分布式压测器，Web UI 实时观察 | 25k | https://github.com/locustio/locust |

---

## 18. 平台工程

| slug | 项目 | 一句话定位 | stars (≈) | GitHub |
|---|---|---|---:|---|
| backstage | Backstage | Spotify 起家的开发者门户框架，service catalog + plugin 生态 | 30k | https://github.com/backstage/backstage |

---

## 19. K8s GUI

| slug | 项目 | 一句话定位 | stars (≈) | GitHub |
|---|---|---|---:|---|
| lens | Lens | K8s 桌面 IDE，多集群聚合 + Helm / Prometheus 内嵌 | 23k | https://github.com/lensapp/lens |

---

## 20. 本地开发

| slug | 项目 | 一句话定位 | stars (≈) | GitHub |
|---|---|---|---:|---|
| tilt | Tilt | K8s 微服务本地开发工具，文件改动 → 重建镜像 → 推送 pod | 7.8k | https://github.com/tilt-dev/tilt |
| skaffold | Skaffold | Google 的 K8s 本地构建-部署循环，Cloud Code 底层 | 15k | https://github.com/GoogleContainerTools/skaffold |
| lima | Lima | macOS / Linux 上跑 Linux VM 的 CLI（Docker Desktop 替代底层） | 17k | https://github.com/lima-vm/lima |
| docker-compose | Docker Compose | YAML 编排多容器开发栈的事实标准 | 35k | https://github.com/docker/compose |

---

## 与现有 atlas / 已有候选池的去重确认

已扫过 159 个现有 atlas slug + `projects-cli.md` 80 个 + `projects-runtimes.md` 60 个 + `projects-databases.md` / `projects-editors.md` 候选池，本文件 60 条**全部互斥**：

- 与 atlas `prom-client` 区分：本表 `prometheus` 是 TSDB server，`prom-client` 是 Node.js 客户端 SDK，slug 和定位都不同
- 与 atlas `sentry` 区分：sentry 已在 atlas（错误追踪），本表 `signoz` 是 OTel-native APM，slug 和底层栈不同
- 与 `projects-cli.md` 区分：k9s / kubectx / stern / dive / lazydocker 已在 cli 池，本表跳过
- 与 `projects-runtimes.md` 区分：runc / containerd 是容器运行时（OCI 进程），与 PL runtime（V8 / wasmtime / cpython）虽都叫 "runtime" 但语义层不同，无 slug 冲突

## 备注

- stars 数为 2026/05 前后估算，前后浮动 < 15%
- 候选不包括：闭源（Datadog / NewRelic / Port 商业部分）、归档项目（weave-net / weave-gitops / img）、< 1k stars
- 历史项目（chef / puppet / saltstack）按"现代主流降级"原则跳过，保留 ansible 一个代表
- 服务网格只留 istio + linkerd2 两个事实标准；kuma / consul-connect 因生态小或已被 mesh war 边缘化跳过
- 所有候选都是**部署 / 运行 / 观测 / 测试**链上的独立基础设施，符合 study 站"读项目源码学设计"主线
- 如需进一步压缩到 30，建议优先保留 ★ ≥ 20k 的：kubernetes / moby / ansible / grafana / prometheus / terraform / act / dagger / argocd / istio / cilium / vault / podman / opentofu / pulumi / loki / vector / k6 / locust / signoz / backstage / lens / docker-compose / k3s / minikube / helm / drone / opentelemetry-collector / lima / age
