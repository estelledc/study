---
title: KServe: Standardized Inference Serving for AI Platforms
来源: https://arxiv.org/abs/2401.04460
日期: 2026-06-13
分类_原始: 系统架构
分类: 分布式系统
子分类: 共识与复制
provenance: pipeline-v3
---

# KServe: Standardized Inference Serving for AI Platforms

## 一句话总结

KServe 是一个跑在 Kubernetes 上的开源平台，让你能用声明式的 YAML 文件，像部署普通 Web 应用一样部署机器学习模型——自动处理扩缩容、网络路由、健康检查这些烦人又重复的工程活。

## 日常类比：餐厅厨房 vs 餐厅经理

想象你开了很多家餐厅（每个餐厅就是一个机器学习模型）。

**没有 KServe 的时候**：你每家店都得自己雇厨师、自己修排风系统、自己决定忙的时候加人手闲的时候裁员。一旦生意好了，厨房挤爆；生意差了，厨师白拿工资。

**有了 KServe 之后**：你雇了一个"餐厅经理系统"。你只需要告诉它："我要开一家川菜馆"或者"我要开一家日料店"。经理会自动帮你搞定：租厨房、请厨师、调空调、根据客流自动增减人手，甚至还能做 A/B 测试——两家店同时卖不同菜谱，看哪个受欢迎。

KServe 就是这个"经理系统"，只不过它管理的不是餐厅，而是机器学习模型的推理服务。

## 核心概念

### 1. InferenceService —— 你的"开店申请"

KServe 的核心资源叫 `InferenceService`。它是一个 Kubernetes 自定义资源（CRD），你写一个 YAML 文件告诉 KServe：

- 用什么模型（PyTorch？TensorFlow？XGBoost？）
- 模型文件存在哪（S3？GCS？Hugging Face Hub？）
- 需要多少资源（CPU？GPU？内存？）

KServe 读到这个文件后，自动帮你把模型部署到集群里。

**例子 1：部署一个 XGBoost 模型**

```yaml
apiVersion: "serving.kserve.io/v1beta1"
kind: "InferenceService"
metadata:
  name: "xgboost-iris"
spec:
  predictor:
    model:
      modelFormat:
        name: xgboost
      storageUri: "gs://my-bucket/models/iris-xgb.model"
      resources:
        requests:
          cpu: "500m"
          memory: "512Mi"
```

就这么几行，KServe 就会自动拉取模型文件、启动一个 XGBoost 推理容器、配置好网络和自动扩缩容。

**例子 2：部署一个大语言模型（LLM）**

```yaml
apiVersion: "serving.kserve.io/v1beta1"
kind: "InferenceService"
metadata:
  name: "llama-3-8b"
spec:
  predictor:
    model:
      modelFormat:
        name: huggingface
      resources:
        limits:
          cpu: "6"
          memory: "24Gi"
          nvidia.com/gpu: "1"
      storageUri: "hf://meta-llama/Llama-3.1-8B-Instruct"
```

注意这里请求了 GPU 资源。KServe 会自动调度到有 GPU 的节点上运行这个模型。

### 2. Control Plane（控制面）vs Data Plane（数据面）

这是理解 KServe 架构最关键的一对概念。

**控制面** = 餐厅经理。负责管理模型的整个生命周期：创建、删除、版本切换、流量分配、自动扩缩容。它不处理任何实际的推理请求，只管"管"。

**数据面** = 厨房里的厨师。实际接收推理请求、运行模型、返回预测结果。它追求的是高性能和低延迟。

这种分离的好处是：你可以独立扩展数据面来应对高并发，而控制面保持稳定。就像餐厅可以同时开很多个厨房，但经理办公室不需要跟着翻倍。

### 3. 支持的模型框架

KServe 不是一个只能跑某一种模型的封闭系统。它像一个"万能插座"，支持：

| 框架 | 类型 | 典型场景 |
|------|------|----------|
| TensorFlow / PyTorch | 深度学习 | 图像分类、目标检测 |
| scikit-learn / XGBoost / LightGBM | 传统 ML | 结构化数据预测 |
| ONNX Runtime | 跨框架 | 模型格式统一 |
| vLLM | 大语言模型 | LLM 推理加速 |
| Triton (NVIDIA) | 多框架 | GPU 高性能推理 |
| 自定义 Predictor | 任意框架 | 你自己写的推理服务 |

### 4. Inference Graph —— 模型流水线

有时候一个模型不够用。比如：先做一个文本分类模型，分类结果再送给不同的情感分析模型。KServe 的 `InferenceGraph` 可以把多个 InferenceService 串联起来，形成推理流水线。

这就像餐厅的传菜流程：厨师做好菜 → 质检员检查 → 服务员端上桌。每个环节都是一个独立的 InferenceService，Graph 负责把它们串起来。

### 5. 自动扩缩容（Auto-scaling）

KServe 支持"缩到零"（scale-to-zero）：当一个模型一段时间没有收到请求时，自动把所有副本删掉，不再浪费资源。有新请求来了再自动启动。

这对昂贵的 GPU 模型特别重要——没人用的时候不花钱，有人用的时候秒级启动。

## 工作流程：从代码到线上

整个流程可以概括为四步：

```
1. 训练好模型 → 2. 写好 InferenceService YAML → 3. kubectl apply → 4. 收到推理请求
```

具体来说：

```bash
# 第一步：安装 KServe（只需做一次）
kubectl apply -f https://github.com/kserve/kserve/releases/download/v0.11.0/kserve.yaml

# 第二步：把你的 YAML 文件应用到集群
kubectl apply -f xgboost-iris.yaml

# 第三步：KServe 自动创建好所有需要的资源
# 你现在可以通过 HTTP 发送推理请求了
curl -v -H "Content-Type: application/json" \
  http://xgboost-iris.default.example.com/v1/models/xgboost-iris:predict \
  -d '{"instances": [[6.8, 2.8, 4.8, 1.4]]}'
```

返回结果：

```json
{
  "predictions": [2]
}
```

KServe 自动帮你处理了域名解析、HTTPS 证书、负载均衡、健康检查，你只需要发普通的 HTTP 请求。

## 为什么需要 KServe？

在 KServe 出现之前，部署机器学习模型是一件非常痛苦的事：

**痛点 1：框架碎片化。** 每个框架（TensorFlow、PyTorch、XGBoost）都有自己的部署方式和 API。换个框架就要重写部署代码。

**痛点 2：工程成本高。** 每次部署都要手写 Dockerfile、Kubernetes YAML、配置 CI/CD 流水线。模型迭代一次就要重来一次。

**痛点 3：生产级特性缺失。** 自动扩缩容、灰度发布、A/B 测试、模型版本回滚——这些在 Web 领域很常见的功能，在 ML 部署中往往需要自己从零实现。

**KServe 的回答**：用一套统一的 API 和 Kubernetes 原生能力，解决所有这些问题。不管什么框架，都通过同一个 `InferenceService` 资源来部署。

## 关键术语速查

| 术语 | 含义 |
|------|------|
| InferenceService | 核心资源，定义一个要部署的模型服务 |
| Predictor | 执行推理的部分，接收请求并返回预测结果 |
| Transformer | 可选的预处理/后处理组件，在推理前后加工数据 |
| Explainer | 可选的解释性组件，说明模型为什么做出这个预测 |
| ServingRuntime | 定义模型运行的环境（容器镜像、框架版本等） |
| InferenceGraph | 将多个 InferenceService 编排成流水线 |
| Control Plane | 管理模型生命周期的组件 |
| Data Plane | 实际处理推理请求的组件 |

## 小结

KServe 的本质思路很简单：**把模型部署当成基础设施问题来处理，而不是每次重新发明轮子**。

它建立在 Kubernetes 之上，利用 K8s 已经成熟的调度、网络、扩缩容能力，加上 ML 领域特有的抽象（模型格式、推理协议、灰度发布），让数据科学家和工程师都能用同一种方式、同一种语言来部署和管理模型。

对于初学者来说，理解 KServe 的关键在于把握"控制面管管理、数据面管推理"这个分离思想。理解了这一点，其他的概念（InferenceGraph、Transformer、Explainer）都只是在这个基础上的组合和扩展。
