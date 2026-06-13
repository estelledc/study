---
title: KServe - Kubernetes 原生模型服务
来源: https://github.com/kserve/kserve
日期: 2026-06-13
分类_原始: MLOps
分类: 机器学习
子分类: ML 系统
provenance: pipeline-v3
---

# KServe - Kubernetes 原生模型服务

## 什么是 KServe？

想象一下，你训练好了一个机器学习模型（比如一个能识别猫和狗的图像分类器），现在想把它"上架"——让任何人都能通过 API 调用它来分类图片。

在 Kubernetes 的世界里，KServe 就是这个"上架平台"。它告诉你模型在哪（比如一个 S3 存储桶），KServe 负责：

- 启动服务容器，加载你的模型
- 自动扩缩（没人用时自动休眠，人多时自动扩容）
- 处理请求路由、负载均衡
- 支持 A/B 测试、金丝雀发布等高级流量策略

KServe 是 **CNCF 孵化项目**，用 Go 编写，支持 PyTorch、TensorFlow、scikit-learn、XGBoost、vLLM 等主流框架。

---

## 核心概念

KServe 的核心自定义资源（CRD）有以下几个：

### 1. InferenceService — 你的"服务名片"

InferenceService 是 KServe 最核心的资源，描述了一个模型服务的完整信息：

- **predictor（预测器）**：加载并服务你的模型
- **transformer（转换器）**：在请求进入 predictor 之前/之后做数据预处理或后处理
- **explainer（解释器）**：生成模型预测的可解释性结果（如 SHAP 值）

```
请求 -> Ingress -> Router -> Transformer（可选）-> Predictor -> Transformer（可选）
```

### 2. ServingRuntime — 运行环境定义

定义模型在什么环境中运行（用什么镜像、容器资源、推理框架等）。KServe 预置了 sklearn、pytorch、tensorflow 等 runtime。

### 3. InferenceGraph — 多模型编排

把多个 InferenceService 串联成管道，支持 Sequence（顺序执行）、Switch（条件分支）、Ensemble（并行集成）、Splitter（流量分发）。

### 4. 控制平面 vs 数据平面

- **控制平面**：管理 InferenceService 的生命周期（创建、删除、更新）、自动扩缩、流量管理
- **数据平面**：实际处理推理请求，负责模型加载、请求推理、返回结果

---

## 代码示例一：部署一个 scikit-learn 模型

这是最基础的用法。你有一个训练好的 sklearn 鸢尾花分类模型，存在 Google Cloud Storage 上。

```yaml
apiVersion: "serving.kserve.io/v1beta1"
kind: "InferenceService"
metadata:
  name: "sklearn-iris"
  namespace: default
spec:
  predictor:
    model:
      modelFormat:
        name: sklearn
      runtime: kserve-sklearnserver
      storageUri: "gs://kfserving-examples/models/sklearn/1.0/model"
      resources:
        requests:
          cpu: "100m"
          memory: "512Mi"
        limits:
          cpu: "1"
          memory: "1Gi"
```

**逐行解释：**

- `apiVersion: serving.kserve.io/v1beta1` — KServe 的 API 版本
- `kind: InferenceService` — 声明这是一个推理服务资源
- `metadata.name` — 服务的名字，会同时作为 Kubernetes 服务名
- `spec.predictor.model.modelFormat.name` — 告诉 KServe 这是什么格式的模型
- `storageUri` — 模型文件存放在哪（支持 GCS、S3、HTTP、PVC 等）
- `resources` — 给容器分配的资源限制，和普通 Kubernetes Pod 一样

应用这个配置：

```bash
kubectl apply -f sklearn-iris.yaml
```

然后 KServe 的 **控制平面** 会：
1. 创建一个 Deployment，里面跑着 sklearn 推理服务器
2. 创建一个 Kubernetes Service，提供稳定的网络端点
3. 配置自动扩缩（如果用了 Knative 模式）

查看状态：

```bash
kubectl get inferenceservice sklearn-iris -o jsonpath='{.status.url}'
```

发送推理请求：

```bash
curl -v -d '{"instances": [[5.1, 3.5, 1.4, 0.2]]}' \
  http://sklearn-iris.default.example.com/v1/models/sklearn-iris:predict
```

---

## 代码示例二：带数据转换器的多步骤推理管道

实际生产中，原始输入数据往往需要预处理才能给模型用。KServe 允许你在 predictor 前面加一个 Transformer：

```yaml
apiVersion: "serving.kserve.io/v1beta1"
kind: "InferenceService"
metadata:
  name: "iris-with-transformer"
  namespace: default
spec:
  transformer:
    containers:
      - name: transformer
        image: your-registry/transformer:latest
        env:
          - name: MODEL_NAME
            value: "sklearn-iris-transformer"
        resources:
          requests:
            cpu: "100m"
            memory: "256Mi"
  predictor:
    model:
      modelFormat:
        name: sklearn
      runtime: kserve-sklearnserver
      storageUri: "gs://kfserving-examples/models/sklearn/1.0/model"
```

**关键区别：**

- `transformer` 部分定义了一个额外的容器，负责数据预处理
- 请求进来后，先经过 transformer 处理，再传给 predictor
- 输出也可以再经过 transformer 做后处理（比如格式化结果）

---

## 代码示例三：InferenceGraph 做多模型编排

现实中的 AI 应用往往需要多个模型协作。比如先检测人脸，再识别情绪：

```yaml
apiVersion: "serving.kserve.io/v1alpha1"
kind: "InferenceGraph"
metadata:
  name: "face-emotion-pipeline"
  namespace: default
spec:
  nodes:
    root:
      routerType: Sequence
      steps:
        - serviceName: face-detector
          name: detect_step
        - serviceName: emotion-classifier
          name: classify
          data: "$response"
    face-detector:
      routerType: Sequence
      steps:
        - serviceName: face-detector-isvc
    emotion-classifier:
      routerType: Sequence
      steps:
        - serviceName: emotion-classifier-isvc
```

**解释：**

- 整个图从 `root` 节点开始
- `routerType: Sequence` 表示按顺序执行
- 第一步调用 `face-detector` 检测人脸
- 第二步把第一步的输出（`data: "$response"`）传给 `emotion-classifier`
- 这样就把两个独立的 InferenceService 串联成了一个完整的推理流水线

---

## 安装 KServe

最简单的本地开发方式（需要 Docker 和 Kubernetes 集群）：

```bash
# 用 Kind 创建本地 K8s 集群
kind create cluster

# 克隆 KServe 仓库
git clone https://github.com/kserve/kserve.git
cd kserve

# 安装 KServe（Knative 模式，支持自动扩缩）
./hack/kserve-install.sh --kserve-version v0.18.0 --type kserve --knative
```

生产环境推荐使用 Standard Mode（不依赖 Knative）：

```bash
./hack/kserve-install.sh --kserve-version v0.18.0 --type kserve --standard
```

---

## 支持的模型格式

| 框架 | modelFormat.name |
|------|------------------|
| scikit-learn | sklearn |
| TensorFlow | tensorflow / keras |
| PyTorch | pytorch |
| XGBoost | xgboost |
| ONNX | onnx |
| vLLM (LLM) | vllm |
| Triton | triton |
| 自定义 | custom |

---

## 关键要点

- KServe 让你用 **声明式 YAML** 部署模型，不用自己写 Dockerfile 和 Kubernetes 部署文件
- 模型文件可以存在任何地方（S3、GCS、HTTP、PVC），KServe 自动下载加载
- 支持 serverless 模式（无人用自动缩到零，省资源）
- InferenceGraph 让你轻松搭建多模型管道
- 是 CNCF 孵化项目，社区活跃，当前版本 v0.18

---

## 延伸阅读

- [KServe 官方文档](https://kserve.github.io/website/)
- [InferenceService API 参考](https://kserve.github.io/website/docs/reference/crd-api)
- [KServe GitHub](https://github.com/kserve/kserve)
