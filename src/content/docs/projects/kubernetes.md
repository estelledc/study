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

