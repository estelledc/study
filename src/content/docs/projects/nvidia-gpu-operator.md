---
title: NVIDIA GPU Operator — K8s 上自动装 GPU 软件栈
来源: https://docs.nvidia.com/datacenter/cloud-native/gpu-operator/
日期: 2026-05-31
子分类: DevOps
分类: 基础设施
难度: 中级
---

## 是什么

NVIDIA GPU Operator 是 NVIDIA 官方为 Kubernetes 写的一个 **Operator**——它的工作是：**自动**在集群里所有 GPU 节点上装齐一整套 NVIDIA 软件（驱动、容器运行时、调度插件、监控），让你 `kubectl run` 一个用 GPU 的 Pod 就能直接跑起来。

日常类比：你买了一栋大楼装电梯。每层楼（每个 GPU 节点）都得：装电梯井（驱动）→ 接电源（容器运行时）→ 装呼叫按钮（device plugin）→ 装监控摄像头（DCGM exporter），少一个都不行。手工装一台机器要半小时，集群有 50 台 GPU 节点你要装 25 小时，扩容一台还得再来。

GPU Operator 像**自动装电梯的机器人**——你按一下"我要在这栋楼装电梯"，它自己跑遍每一层把活全干了。新加一层楼？它检测到自动补上。

## 为什么重要

不用 Operator，K8s 上跑 GPU 是这样的体验：

- 每台 GPU 节点都要 SSH 进去 `apt install nvidia-driver-535`、配 `nvidia-container-toolkit`、改 `/etc/containerd/config.toml`、装 `nvidia-device-plugin` DaemonSet——4–5 个步骤，**有顺序依赖**
- 节点扩容（云上 autoscaler 新起一台）→ 又要重做一遍
- 升级 NVIDIA 驱动 → 全集群手动滚一遍，凌晨发布
- 想监控 GPU 利用率 → 再装一套 DCGM exporter

GPU Operator 把这一切塞进**一条 `helm install`**，扩容时新节点自动装好。这是 [[kubernetes]] 上跑 LLM 训练 / 推理（[[vllm]] / [[pytorch]]）的事实标准前置。

## 核心要点

GPU Operator 的核心是一个 **Controller + CRD**（叫 `ClusterPolicy`）。你写一份 YAML 声明"我要这个集群所有 GPU 节点都装上 driver 535、container toolkit、device plugin"，Controller 持续比对实际状态和你想要的状态，差什么就拉什么。

它管理的**主要组件**（每个都是一个 DaemonSet 跑在 GPU 节点上）：

1. **NVIDIA Driver**：容器化的驱动——把驱动装在容器里，不污染 host OS。host 只要有内核头文件
2. **NVIDIA Container Toolkit**：改写 containerd / cri-o 配置，让容器能挂载 `/dev/nvidia*` 设备
3. **Kubernetes Device Plugin**：向 kubelet 注册 `nvidia.com/gpu` 这个资源类型，让调度器知道"这台机器有 8 张卡"
4. **DCGM Exporter**：把 GPU 利用率 / 温度 / 显存 export 成 Prometheus metrics
5. **Node Feature Discovery + GPU Feature Discovery**：自动给 GPU 节点打 label（`nvidia.com/gpu.product=A100`），让 Pod 可以用 `nodeSelector` 挑卡型
6. **MIG Manager**：A100 / H100 把一张物理卡切成 7 份逻辑 GPU 给不同 Pod

## 实践案例

### 案例 1：一条命令装齐所有东西

```bash
helm repo add nvidia https://helm.ngc.nvidia.com/nvidia
helm install --wait gpu-operator nvidia/gpu-operator \
  --namespace gpu-operator --create-namespace
```

几分钟后跑：

```bash
kubectl get pods -n gpu-operator
# nvidia-driver-daemonset-xxx          1/1 Running
# nvidia-container-toolkit-daemonset   1/1 Running
# nvidia-device-plugin-daemonset       1/1 Running
# nvidia-dcgm-exporter                 1/1 Running
```

### 案例 2：跑一个用 GPU 的 Pod

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: cuda-test
spec:
  containers:
  - name: cuda
    image: nvidia/cuda:12.2.0-base-ubuntu22.04
    command: ["nvidia-smi"]
    resources:
      limits:
        nvidia.com/gpu: 1
```

`nvidia.com/gpu: 1` 这一行就是 device plugin 注册出来的资源。调度器会找有 GPU 的节点，container toolkit 会挂载设备，跑起来 `nvidia-smi` 直接看到卡。

### 案例 3：MIG 把 A100 切 7 份

A100 / H100 支持 MIG（Multi-Instance GPU），一张物理卡切成 7 个独立逻辑 GPU。在 ClusterPolicy 里：

```yaml
spec:
  mig:
    strategy: mixed
  migManager:
    enabled: true
```

然后给节点打 label `nvidia.com/mig.config=all-1g.5gb`，MIG Manager 自动把卡切成 7 份，每份 5GB 显存——适合跑小模型推理，密度上去了。

### 案例 4：DCGM 监控接入 Prometheus

DCGM exporter 默认在每个 GPU 节点 9400 端口暴露 metrics：

```bash
kubectl port-forward -n gpu-operator svc/nvidia-dcgm-exporter 9400:9400
curl http://localhost:9400/metrics | grep DCGM_FI_DEV_GPU_UTIL
# DCGM_FI_DEV_GPU_UTIL{gpu="0",UUID="GPU-xxx"} 87
```

接 Prometheus 抓这些 metrics，Grafana 画板就能看到每张卡实时利用率、温度、显存占用——比 host 上跑 `nvidia-smi` 收集脚本干净十倍。

## 踩过的坑

1. **驱动容器和 host 内核版本要匹配**：Operator 装的是预编译驱动镜像，host 升级内核后必须重启 driver Pod 重新匹配，否则 GPU 全挂
2. **containerd 配置被改写**：Operator 会重写 `/etc/containerd/config.toml`，事后你手动改这文件会被覆盖。要改得通过 ClusterPolicy 的 `runtimeConfig` 字段
3. **MIG 切换会杀 Pod**：从 non-MIG 切到 MIG（或反过来），GPU 必须重置，正在跑的 Pod 全被驱逐
4. **OS 选错装不上**：RHEL / Ubuntu / SLES 走不同驱动镜像 tag。装之前确认 `kubectl get nodes -o wide` 看到的 OS image 和 ClusterPolicy 里的 driver 镜像匹配
5. **和 host 上手装的驱动冲突**：节点上已经 `apt install` 过 nvidia 驱动，Operator 装的容器化驱动会冲突——必须二选一，用 Operator 就要先卸载 host 驱动

## 适用 vs 不适用场景

**适用**：
- K8s 集群有 GPU 节点（自建 / EKS / GKE / AKS）
- 节点会扩容（云上 autoscaler、按需起新节点）
- 想用 MIG / DCGM 监控这种高级特性
- 跑 LLM 训练（[[pytorch]] / [[accelerate]]）/ 推理（[[vllm]] / [[triton-inference-server]]）

**不适用**：
- 单机（不用 K8s）→ 直接 host 装驱动 + container toolkit 即可
- 节点固定不扩容、driver 不升级 → 手动装一次更简单
- 用 [[bare-metal-no-k8s]] 物理机 + slurm → 走 slurm 的 GPU 调度
- 非 NVIDIA GPU（AMD ROCm / Intel） → 那是别的 Operator 的事

## 历史小故事（可跳过）

- **2018 年前后**：K8s 加了 Device Plugin 框架，NVIDIA 发布 `k8s-device-plugin`——但只解决了"调度器知道有几张卡"，驱动 / 运行时还得手装
- **2019–2020 年**：Operator 模式（CoreOS 提出，RedHat 推广）成熟，Operator SDK 发布
- **2020 年**：NVIDIA 把"装驱动 + 装 container toolkit + 装 device plugin + 装 DCGM"打包成一个 Operator，开源在 [NVIDIA/gpu-operator](https://github.com/NVIDIA/gpu-operator)
- **2021–2024 年**：成为云原生 AI 集群的事实标准。EKS / GKE / AKS 的 GPU 节点池都基于它

## 学到什么

1. **Operator 模式的本质**：Controller 持续 reconcile（实际状态 → 期望状态）。GPU Operator 是这个模式在"软件栈安装"场景的经典应用
2. **声明式 vs 命令式**：从"我 SSH 进去敲 4 条命令" 变成 "我写一份 YAML 说明终态"——这是 [[kubernetes]] 全栈的统一思想
3. **容器化系统软件**：连驱动这种"传统认为必须装在 host"的东西也能容器化——好处是版本独立、回滚容易
4. **DaemonSet 用法**：每个节点跑一份的工作负载（监控、网络插件、存储插件）都用 DaemonSet——GPU 软件全是它
5. **CRD 是 K8s 的扩展点**：`ClusterPolicy` 这个 CRD 让"GPU 软件栈"成了 K8s 的一等公民资源，和 Pod / Deployment 同级

## 延伸阅读

- 官方文档：[NVIDIA GPU Operator](https://docs.nvidia.com/datacenter/cloud-native/gpu-operator/)（架构图 + 完整 ClusterPolicy 字段）
- GitHub：[NVIDIA/gpu-operator](https://github.com/NVIDIA/gpu-operator)
- [[kubernetes]] —— GPU Operator 的运行底座
- [[helm]] —— GPU Operator 的安装载体
- [[argocd]] —— GitOps 管理 ClusterPolicy 的常见组合
- [[vllm]] —— 跑在 GPU Operator 上的典型推理负载
- [[pytorch]] —— 跑在 GPU Operator 上的典型训练负载

## 关联

- [[kubernetes]] —— Operator 是 K8s 的扩展机制，GPU Operator 是它的实例
- [[helm]] —— 唯一推荐的安装方式
- [[argocd]] —— 声明式管理 ClusterPolicy
- [[vllm]] —— GPU Operator 装好驱动后，vLLM 才能在 K8s 上跑
- [[pytorch]] —— 训练任务依赖 nvidia.com/gpu 资源调度
