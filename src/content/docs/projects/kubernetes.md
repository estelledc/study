---
title: Kubernetes — 容器编排平台
来源: https://github.com/kubernetes/kubernetes
日期: 2026-05-29
分类: DevOps
难度: 中级
---

## 是什么

Kubernetes（**K8s**，"K + 8 个字母 + s" 的缩写）是 Google 2014 年开源的**容器编排平台**——把"100 个 [[docker]] 容器跑在 N 台机器上"这件事自动管理。

日常类比：单台 docker 像 **1 个集装箱搬家**——你手动装、手动搬、手动卸。K8s 像**港口管理系统**——决定哪个集装箱进哪艘船、什么时候开船、出问题（船沉了 / 集装箱漏了）怎么自动补救。

你不再 SSH 进机器手动 `docker run`，你写一份 YAML "我要 3 个 nginx 副本"，K8s 自己安排到哪台机器、自己重启崩掉的、自己滚动升级。

控制面（API Server / scheduler / controller）管"想要什么"，工作节点上的 kubelet 管"真正跑起来"。

## 为什么重要

不会 K8s，下面这些场景都接不上：

- **云原生事实标准**：AWS EKS / GCP GKE / Azure AKS / 阿里云 ACK——所有云厂商都包了一层 K8s 接口，学一遍走天下
- **自动扩缩容 / 故障恢复 / 滚动升级**：运维从"手动改配置 + 凌晨发布"变成"声明式 + 灰度自动跑"
- **生态丰富**：Helm（应用包管理）/ Operator（自定义资源）/ GitOps（git 推一下就上线）都围绕 K8s
- **大厂规模**：字节 / 阿里 / Netflix 等常见数万节点级集群，面试常考

## 核心要点

K8s 拆开看，**3 层抽象**最重要：

1. **Pod**：K8s 最小调度单位。1 个 Pod 包 1 个或多个容器，**共享网络和存储**。类比："集装箱"——你不能再拆，要搬一起搬。
2. **Deployment**：声明式管理 Pod。你写"我要 3 个副本"，K8s 维持这个状态——挂一个就拉新的，永远 3 个。
3. **Service + Ingress**：
   - Service：给一组 Pod 一个**稳定的 IP / DNS**——Pod 重启换 IP，Service 名字不变，调用方不受影响
   - Ingress：外部 HTTP 路由——`api.example.com → service-A`、`web.example.com → service-B`

记一句口诀：**Pod 易变、Service 稳定、Deployment 负责把副本数拉回目标**。

## 实践案例

### 案例 1：本地起一个 K8s

`minikube` 或 `kind` 在笔记本上起一个迷你集群（任选其一）：

```bash
# macOS: brew install minikube
# 或官方二进制 / 包管理器安装 minikube；也可用 kind
minikube start   # 或: kind create cluster
kubectl get nodes  # 应看到至少一个节点
```

### 案例 2：Deployment YAML 跑 3 个 nginx

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
spec:
  replicas: 3
  selector:
    matchLabels:
      app: web
  template:
    metadata:
      labels:
        app: web
    spec:
      containers:
      - name: web
        image: nginx
```

```bash
kubectl apply -f web.yaml
kubectl get pods   # 看到 3 个 Pod
```

手动杀掉一个 Pod，K8s 立刻拉一个新的——**永远 3 个**，这就是声明式的体感。

### 案例 3：Service 暴露访问

```bash
kubectl expose deployment web --port 80 --type NodePort
kubectl get svc web   # 看 PORT(S)；本地可用 minikube service web
# 云上才常用 LoadBalancer；本地 minikube 需 tunnel，kind 常配 MetalLB
```

整个过程**没 SSH 进任何机器**——这就是声明式运维的核心。

## 踩过的坑

1. **YAML 缩进出错**：一个空格不对就全报错，且报错信息常常误导。建议 IDE 装 YAML 插件 + `kubectl apply --dry-run=client` 预检。
2. **Resource limits 不设容易 OOM 整节点**：一个失控容器吃满内存，整个 node 上的 Pod 一起挂。生产环境**必须**给每个容器写 `resources.requests` 和 `resources.limits`。
3. **etcd 慢就全集群慢**：etcd 是 K8s 的"账本"——所有状态都存它里。etcd 写慢就 API server 阻塞，调度全停。生产环境 etcd 跑 SSD + 独立机器。
4. **升级版本需小心**：K8s 每个版本都在删旧 API（`extensions/v1beta1` 在 1.16 删了），controller / Helm chart 没跟上就直接挂。升级前看 deprecation guide。
5. **本地把 LoadBalancer 当云上用法**：笔记本集群常常一直 `<pending>`；先用 NodePort / `minikube service`，云上再换 LoadBalancer。

## 适用 vs 不适用场景

**适用**：

- 微服务架构、多副本、多机器（大约从"几台机器、十几个服务"开始划算）
- 需要自动扩缩容、自愈、滚动升级
- 多云 / 混合云部署（一份 YAML 跑哪都行）
- 团队已有或准备用托管控制面（EKS / GKE / AKS 等），不想自建 etcd

**不适用**：

- 单机小项目（杀鸡用牛刀，docker-compose 够用）
- 团队没运维经验且没钱用托管（自建集群运维成本极高）
- 强一致状态服务（数据库等，K8s 跑不是不行但不省心，托管 RDS 更稳）

## 历史小故事（可跳过）

- **2003 年**：Google 内部上线 **Borg**——管理几十万容器的调度系统，是 K8s 的爹
- **2014 年**：Google 把 Borg 经验抽象出来开源，叫 **Kubernetes**（希腊语"舵手"）
- **2015 年**：Linux Foundation 成立 **CNCF**（Cloud Native Computing Foundation），K8s 是创始项目
- **2018 年**：K8s 成为 cloud-native 默认底座，AWS / Azure / GCP 全部跟进托管服务
- **2024 年**：K8s 1.32 GA；每年约 3 个次要版本，官方按滚动窗口维护近期版本

## 学到什么

1. **声明式 > 命令式**：你描述"想要的状态"，控制器自己往那里收敛——这是 K8s 的核心思想
2. **抽象分层**：Pod → Deployment → Service → Ingress，每层解决一个具体问题，组合起来是完整的部署方案
3. **运维左移**：YAML 进 git，运维变成代码评审，回滚就是 git revert
4. **生态比内核重要**：K8s 内核稳定后，Helm / Operator / Istio / ArgoCD 这些生态才是日常生产力

## 延伸阅读

- 官方文档：[Kubernetes Concepts](https://kubernetes.io/docs/concepts/)（从 Pod 到 Operator 一遍）
- 入门视频：[TechWorld with Nana — Kubernetes Tutorial](https://www.youtube.com/watch?v=X48VuDVv0do)（4 小时把所有抽象讲完）
- Borg 论文：[Large-scale cluster management at Google with Borg](https://research.google/pubs/large-scale-cluster-management-at-google-with-borg/)（K8s 的设计源头）
- 命令速查：先混熟 `kubectl get/describe/logs/apply`，再碰 Helm / Operator

## 关联

- [[docker]] —— 容器运行时入口；K8s 调度的是容器工作负载
- [[etcd]] —— 集群状态账本，API Server 背后的一致性存储
- [[helm]] —— 应用包管理，常和 K8s YAML 一起出现
- [[kustomize]] —— 不动原 YAML 的多环境叠加
- [[kind]] / [[minikube]] —— 本地迷你集群，跟做案例常用
- [[argocd]] —— GitOps：git 推一下就把期望状态同步到集群

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[apollo-2014]] —— Apollo — 让两万台机器自己决定谁跑哪个任务
- [[borg]] —— Borg — Google 把一万台机器假装成一台
- [[borg-2015]] —— Borg 2015 — Google 把一万台机器假装成一台
- [[dns]] —— DNS — 把全球域名解析切成一棵可分布维护的树
- [[papers/kustomize]] —— Kustomize — 不写模板也能给 K8s 配置分环境
- [[lampson-hints]] —— Lampson Hints — 把做系统的隐式品味写成 27 条经验法则
- [[lampson-hints-1983]] —— Lampson Hints 1983 — 系统设计思维起点
- [[mesos]] —— Mesos — 让多种计算框架共用一套集群
- [[mockapetris-1988-dns]] —— Mockapetris 1988 DNS — 设计者亲口讲为什么 DNS 长这样
- [[ansible]] —— Ansible — 无 agent 配置管理
- [[argo-workflows]] —— Argo Workflows — Kubernetes 原生工作流引擎
- [[argocd]] —— Argo CD — Kubernetes GitOps 工具
- [[backstage]] —— Backstage — 把公司散在各处的开发工具拼成一个门户
- [[buildroot]] —— Buildroot — 30 分钟从零搭出一个嵌入式 Linux
- [[calico]] —— Calico — 用 BGP 路由把 K8s pod 当成一个个小路由器
- [[cilium]] —— Cilium — 用 eBPF 把 K8s 网络从 iptables 时代搬出来
- [[coder]] —— Coder — 自托管开发环境平台
- [[containerd]] —— containerd — Docker 和 Kubernetes 共用的那台容器运行机
- [[cri-o]] —— CRI-O — 只为 Kubernetes 而生的瘦身版容器运行时
- [[docker-compose]] —— Docker Compose — 一份 YAML 起一整套开发栈
- [[drone]] —— Drone CI — 容器原生的 YAML 流水线
- [[eclipse-che]] —— Eclipse Che — Kubernetes 原生云 IDE
- [[envoy]] —— Envoy — 把网络通信从业务代码里抠出来的代理进程
- [[etcd]] —— etcd — 分布式键值数据库
- [[fluent-bit]] —— Fluent Bit — C 写的轻量日志 forwarder，K8s DaemonSet 默认选
- [[flux]] —— Flux — 让 Git 当 Kubernetes 集群的真理来源
- [[haproxy]] —— HAProxy — 高性能 LB，TCP/HTTP 双层负载均衡
- [[helm]] —— Helm — Kubernetes 包管理器
- [[istio]] —— Istio — 给微服务装一层透明的网络治理面
- [[jenkins]] —— Jenkins — 老牌开源 CI 服务器
- [[projects/k3s]] —— k3s — 把完整 K8s 塞进一个不到 70 MB 的二进制
- [[k9s]] —— k9s — 让 kubectl 长出眼睛和键盘的终端 UI
- [[kind]] —— kind — 用 Docker 容器当 K8s 节点的本地集群
- [[kong]] —— Kong — 基于 nginx + Lua 的云原生 API 网关
- [[kubebuilder]] —— Kubebuilder — 写 K8s Operator 的官方脚手架
- [[kubectx]] —— kubectx — kubectl 切换 context 和 namespace 的两行命令
- [[projects/kustomize]] —— Kustomize — 不动原 YAML 的 K8s 配置叠加器
- [[lens]] —— Lens — Kubernetes 集群的桌面 IDE
- [[linkerd2]] —— Linkerd 2 — 用 Rust 写的轻量服务网格
- [[linuxcnc]] —— LinuxCNC — 实时控制 CNC 机床的开源系统
- [[litmus]] —— LitmusChaos — 给 K8s 集群安排"故意搞坏"的演习
- [[loki]] —— Loki — 给日志做 Prometheus，只索引标签不索引内容
- [[longhorn]] —— Longhorn — K8s 原生的轻量分布式块存储
- [[metaflow]] —— Metaflow — Netflix 给数据科学家的 Python 流水线
- [[minikube]] —— minikube — 一条命令在笔记本上起一个真 K8s 集群
- [[minio]] —— MinIO — S3 兼容对象存储
- [[moby]] —— Moby — Docker 把引擎拆开后的开源上游
- [[moveit2]] —— MoveIt 2 — ROS 2 上的机械臂运动规划框架
- [[nerdctl]] —— nerdctl — containerd 官方的 Docker 兼容 CLI
- [[nomad]] —— Nomad — HashiCorp 出的"轻量版 K8s"工作负载调度器
- [[nvidia-gpu-operator]] —— NVIDIA GPU Operator — K8s 上自动装 GPU 软件栈
- [[nvidia-mig]] —— NVIDIA MIG — 把一张 GPU 物理切成 7 张小卡
- [[opentelemetry]] —— OpenTelemetry — 让所有应用用同一种语言吐监控数据
- [[operator-sdk]] —— Operator SDK — 写 K8s Operator 的"豪华套餐"版脚手架
- [[podman]] —— Podman — 无 daemon 容器引擎
- [[prometheus]] —— Prometheus — 时序监控系统
- [[pulumi]] —— Pulumi — 用真正的编程语言写云资源清单
- [[quarkus]] —— Quarkus — 让 Java 启动比 Node 还快的云原生框架
- [[ray]] —— Ray — 把单机 Python 函数和类无缝扩展到整个集群
- [[rook]] —— Rook — 把 Ceph 装进 K8s 的 CRD 里
- [[ros2]] —— ROS 2 — 机器人软件的分布式消息底座
- [[runc]] —— runc — Linux 容器最底层那个真正在 fork 进程的 CLI
- [[sealed-secrets]] —— Sealed Secrets — 把加密后的 Secret 安全提交到 Git
- [[skaffold]] —— Skaffold — K8s 本地开发的 build-deploy 自动循环
- [[sops]] —— SOPS — 让密码也能放心进 Git
- [[spring-boot]] —— Spring Boot — 用 Auto-configuration 把 Java 后端从 XML 地狱里救出来的事实标准框架
- [[stern]] —— stern — 多 pod 多 container 日志聚合 tail
- [[tekton]] —— Tekton — 把 CI/CD 流水线当成 K8s 资源来声明
- [[terraform]] —— Terraform — 基础设施即代码
- [[traefik]] —— Traefik — 现代云原生反向代理
- [[tyk]] —— tyk — Go 实现的开源 API 网关，自带门户和多协议转换
- [[vault]] —— Vault — HashiCorp 把"密码本"做成可编程基础设施
- [[vector]] —— Vector — Rust 写的统一可观测性数据管道
- [[velero]] —— Velero — Kubernetes 集群备份与迁移
- [[vertx]] —— Vert.x — Eclipse 出品的 polyglot reactive JVM toolkit，用事件总线 + verticle 把 Node.js 那套搬到多语言
- [[vitess]] —— Vitess — 给 MySQL 装上水平分片的代理层
- [[woodpecker]] —— Woodpecker CI — Drone 闭源后社区接棒的轻量自托管 CI
