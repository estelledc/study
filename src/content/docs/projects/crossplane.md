---
title: Crossplane 学习笔记
来源: https://github.com/crossplane/crossplane
日期: 2026-06-13
分类: 基础设施
子分类: cloud-native
provenance: pipeline-v3
---

# Crossplane 学习笔记

## 一、什么是 Crossplane？

Crossplane 是 CNCF 毕业项目，运行在 Kubernetes 之上。它的核心使命只有一个：

**让 Kubernetes 不仅能管理应用，还能管理一切基础设施。**

## 二、日常类比：物业管理公司

想象你住在一个大型小区：

- **Kubernetes 本身**像是一个物业团队，能管理小区里的公共设施（水电、电梯、绿化），这些设施都在小区围墙内。
- **但小区外的道路、自来水厂、电网**，Kubernetes 管不到。

Crossplane 的作用就是：

> 在物业公司内部成立一个"外包协调部门"。你告诉它"我要一个数据库"或"我要一台云服务器"，它就去联系外面的供应商（AWS、GCP、阿里云）帮你办妥，然后把结果登记到物业管理系统里。

这样，物业经理（开发者）只需要说一句话，不需要亲自去自来水厂填表申请。

## 三、核心概念

### 3.1 资源层级关系

```
Composite Resource (XR)         →  你定义的"高级资源"，如 App、Database
  └─ Composition               →  定义 XR 由哪些底层资源组成
      └─ Managed Resource (MR) →  由 Provider 管理的云资源，如 S3 Bucket、RDS
          └─ Provider          →  连接外部云 API 的插件
```

逐层拆解：

1. **Provider（提供者）**：相当于"外包公司的业务员"。每个 Provider 对接一个云平台或服务，比如 AWS Provider 负责和 AWS API 对话。
2. **Managed Resource（MR，托管资源）**：相当于"一张申请表"。比如 `Bucket` 类型的 MR 告诉 Crossplane："请在 AWS 上创建一个 S3 存储桶"。
3. **Composite Resource Definition（XRD，复合资源定义）**：相当于"定义一种新的表单模板"。你定义 `App` 长什么样、有哪些字段。
4. **Composite Resource（XR，复合资源）**：相当于"填好的表单"。比如 `kind: App` 的实例。
5. **Composition（组合）**：相当于"表单处理规则"。告诉 Crossplane：当有人提交 `App` 表单时，需要创建哪些 MR、如何填充数据、如何把结果回写到 XR 的 status。

### 3.2 关键术语速查

| 术语 | 缩写 | 一句话解释 |
|------|------|-----------|
| Composite Resource | XR | 用户自定义的高级资源 |
| Composite Resource Definition | XRD | 定义 XR 的 schema |
| Managed Resource | MR | 由 Provider 管理的云资源 |
| Composition | — | 定义 XR 如何被组合成 MR |
| Provider | — | 对接外部云 API 的插件 |
| Function | — | Composition 中的处理函数（v2 引入） |

## 四、代码示例

### 示例一：Composition — 一个 App 由 Deployment + Service 组成

这是 Crossplane 最经典的使用场景。用户只需创建一个 `App`，Crossplane 自动创建对应的 Kubernetes Deployment 和 Service。

**第一步：定义 XRD（表单模板）**

```yaml
apiVersion: apiextensions.crossplane.io/v2
kind: CompositeResourceDefinition
metadata:
  name: apps.example.crossplane.io
spec:
  scope: Namespaced
  group: example.crossplane.io
  names:
    kind: App
    plural: apps
  versions:
  - name: v1
    served: true
    referenceable: true
    schema:
      openAPIV3Schema:
        type: object
        properties:
          spec:
            type: object
            properties:
              image:
                description: 应用的容器镜像
                type: string
            required:
            - image
          status:
            type: object
            properties:
              replicas:
                description: 可用副本数
                type: integer
              address:
                description: 服务的 ClusterIP
                type: string
```

**第二步：定义 Composition（处理规则）**

```yaml
apiVersion: apiextensions.crossplane.io/v1
kind: Composition
metadata:
  name: app-yaml
spec:
  compositeTypeRef:
    apiVersion: example.crossplane.io/v1
    kind: App
  mode: Pipeline
  pipeline:
  - step: create-deployment-and-service
    functionRef:
      name: crossplane-contrib-function-patch-and-transform
    input:
      apiVersion: pt.fn.crossplane.io/v1beta1
      kind: Resources
      resources:
      - name: deployment
        base:
          apiVersion: apps/v1
          kind: Deployment
          spec:
            replicas: 2
            template:
              spec:
                containers:
                - name: app
                  ports:
                  - containerPort: 80
        patches:
        - type: FromCompositeFieldPath
          fromFieldPath: spec.image
          toFieldPath: spec.template.spec.containers[0].image
        - type: FromCompositeFieldPath
          fromFieldPath: metadata.name
          toFieldPath: metadata.labels[example.crossplane.io/app]
        - type: ToCompositeFieldPath
          fromFieldPath: status.availableReplicas
          toFieldPath: status.replicas
        readinessChecks:
        - type: MatchCondition
          matchCondition:
            type: Available
            status: "True"
      - name: service
        base:
          apiVersion: v1
          kind: Service
          spec:
            ports:
            - protocol: TCP
              port: 8080
              targetPort: 80
        patches:
        - type: FromCompositeFieldPath
          fromFieldPath: metadata.name
          toFieldPath: metadata.labels[example.crossplane.io/app]
        - type: ToCompositeFieldPath
          fromFieldPath: spec.clusterIP
          toFieldPath: status.address
```

**第三步：用户使用**

用户只需创建一个简单的 `App` 资源：

```yaml
apiVersion: example.crossplane.io/v1
kind: App
metadata:
  name: my-app
spec:
  image: nginx
```

Crossplane 会自动创建 Deployment 和 Service，并把状态回写到 App 的 status 中。

### 示例二：Managed Resource — 直接在 Kubernetes 中创建 AWS S3 Bucket

这个示例展示了 Crossplane 的第二种用法：直接用 Kubernetes 管理云资源，不需要 Composition。

**第一步：安装 Provider（AWS S3）**

```yaml
apiVersion: pkg.crossplane.io/v1
kind: Provider
metadata:
  name: crossplane-contrib-provider-aws-s3
spec:
  package: xpkg.crossplane.io/crossplane-contrib/provider-aws-s3:v2.0.0
```

**第二步：配置凭证**

```yaml
apiVersion: aws.m.upbound.io/v1beta1
kind: ClusterProviderConfig
metadata:
  name: default
spec:
  credentials:
    source: Secret
    secretRef:
      namespace: crossplane-system
      name: aws-secret
      key: creds
```

**第三步：使用 Bucket 资源**

```yaml
apiVersion: s3.aws.m.upbound.io/v1beta1
kind: Bucket
metadata:
  namespace: default
  generateName: crossplane-bucket-
spec:
  forProvider:
    region: us-east-2
```

创建这个资源后，Crossplane 会通过 AWS API 在 S3 上创建一个真实的存储桶。删除这个 Kubernetes 资源，S3 上的存储桶也会被自动清理。

## 五、工作流程图解

```
用户创建 XR (App)
    │
    ▼
Crossplane Controller 感知到变化
    │
    ▼
调用 Composition 中的 Function
    │
    ▼
Function 生成一组 Managed Resources (Deployment + Service)
    │
    ▼
Crossplane 通过 Provider 创建这些 MR
    │
    ▼
MR 的状态回写到 XR 的 status
    │
    ▼
用户通过 kubectl get app 看到 READY=True
```

## 六、为什么需要 Crossplane？

对比传统做法：

| 场景 | 没有 Crossplane | 有 Crossplane |
|------|----------------|--------------|
| 创建数据库 | 去云控制台点选 / 写 Terraform | `kubectl apply db.yaml` |
| 应用部署 | Helm chart 只管 Pod，DB 另外管 | 一个 XR 同时声明 App + DB |
| 多环境部署 | 维护多套 Terraform 脚本 | 同一份 XR 在不同集群复用 |
| 团队分工 | 开发要等运维开通资源 | 开发自服务，XR schema 即 API |

核心价值一句话总结：

> **把基础设施变成 Kubernetes 原生的 API。**

## 七、学习资源

- GitHub: https://github.com/crossplane/crossplane
- 官方文档: https://docs.crossplane.io/
- Slack: https://slack.crossplane.io
- 当前最新版本: v2.3 (2026年5月发布)
