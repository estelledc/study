---
title: Argo Workflows — Kubernetes 原生工作流引擎
来源: https://github.com/argoproj/argo-workflows
日期: 2026-05-31
子分类: DevOps 与运维
分类: 基础设施
难度: 中级
provenance: pipeline-v3
---

## 是什么

Argo Workflows 是一个**让"一连串任务按顺序跑"这件事直接在 Kubernetes 上原生进行**的引擎——你写一份 yaml 描述"先做 A，再做 B 和 C 并行，最后做 D"，Argo 把每一步都启动成一个 Pod 跑。

日常类比：

- **没有工作流引擎**像自己手洗碗：洗一只、擦干、放回橱柜——每只都自己盯。任务一多就乱。
- **传统工作流引擎（Airflow）**像家里那台老洗碗机：能装能洗，但它有自己一套调度系统，和家里水电系统是两码事。
- **Argo Workflows** 像把洗碗机直接焊在水管上：每一步都借用 K8s 已有的"水电"——调度器、资源配额、网络策略全部免费用。每个步骤是一个 Pod，K8s 调度器替你决定它跑在哪台机器。

它由 Applatix 2017 年开源，Intuit 2018 年收购后并入 Argo 项目家族，2022 年 CNCF 毕业。和 Argo CD 是亲兄弟。

## 为什么重要

不理解 Argo Workflows，下面这些事都没法解释：

- **K8s 上跑批处理任务**——CI/CD、ETL、ML 训练、视频转码这些"一次性长任务"为什么不能用 Deployment？因为 Deployment 是给"长期跑的服务"用的，跑完就退出的任务用 Job/Workflow 更合适
- **Kubeflow Pipelines 怎么实现的**——它的底层执行引擎就是 Argo Workflows，每个 ML 步骤都是一个 Argo template
- **DAG 调度和 K8s 怎么结合**——Airflow 自己起 worker 进程，Argo 直接借 K8s 的 Pod；同一份调度逻辑，运维成本天差地别
- **suspend / resume 怎么做**——人工审批节点、等外部事件这些"流程暂停一会儿"的需求，Argo 用 CRD 状态字段就能挂起，不需要长连接

## 核心要点

Argo Workflows 的设计可以拆成 **三个抽象**：

1. **Workflow（一次执行）**：一个 Workflow 就是"这次跑这套任务"的实例。它是 K8s 自定义资源（CRD），`kubectl get workflows` 能直接看。

2. **Template（步骤定义）**：每一步要干什么写在 template 里。template 有几种：
   - `container` —— 跑一个容器
   - `script` —— 跑一段内联脚本（自动包成容器）
   - `dag` —— 一个有向无环图，节点之间有依赖
   - `steps` —— 顺序执行（每行可以多个并行）
   - `suspend` —— 挂起等外部信号
   - `resource` —— 直接 `kubectl apply` 一个 K8s 资源

3. **Artifacts（步骤间传文件）**：每个 Pod 跑完会消失，文件传给下一步靠 artifact 机制——上传到 S3/GCS/MinIO，下一步从同一个对象存储下载。这一步是 Argo 区别于"裸 K8s Job 串起来"的关键。

## 实践案例

### 案例 1：最小工作流

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Workflow
metadata:
  generateName: hello-
spec:
  entrypoint: main
  templates:
  - name: main
    container:
      image: alpine:3
      command: [sh, -c]
      args: ["echo hello argo"]
```

`kubectl create -f hello.yaml` 提交，Argo 控制器看到 Workflow CRD，创建一个 Pod 跑这条 echo，跑完 Workflow 状态变成 Succeeded。

### 案例 2：DAG 让两步并行、第三步等

```yaml
templates:
- name: pipeline
  dag:
    tasks:
    - name: fetch
      template: fetch-data
    - name: train-a
      template: train
      dependencies: [fetch]
      arguments: {parameters: [{name: model, value: a}]}
    - name: train-b
      template: train
      dependencies: [fetch]
      arguments: {parameters: [{name: model, value: b}]}
    - name: compare
      template: compare
      dependencies: [train-a, train-b]
```

`fetch` 跑完后 `train-a` 和 `train-b` 同时启动两个 Pod；两个都成功 `compare` 才启动。这套 DAG 逻辑由 Argo controller 维护状态机，重启控制器也不丢进度。

### 案例 3：suspend 节点等人工审批

```yaml
- name: approval
  suspend: {}
- name: deploy-prod
  template: kubectl-apply
  dependencies: [approval]
```

工作流跑到 `approval` 就停住，状态显示 Suspended。运维同学在 UI 点 Resume（或 `argo resume <name>`），才往后跑 `deploy-prod`。这是金丝雀发布、审批流的常见模式。

## 踩过的坑

1. **etcd 撑不住历史 Workflow**：每个 Workflow CRD 写到 etcd，跑过 1 万个不清理，etcd 压力直接爆。生产必须开 archive（写 PostgreSQL）+ 设 `ttlStrategy.secondsAfterCompletion` 让 K8s 自动清。

2. **Pod 默认不 GC**：默认配置下，Workflow 跑完 Pod 还留着（方便看日志）。1000 个 Pod 占 etcd + kube-scheduler 索引，集群变慢。设 `podGC.strategy: OnPodCompletion` 让跑完即删。

3. **artifact 必须有对象存储**：没配 S3/MinIO 就传文件，跑到第二步报"artifact repository not configured"。生产环境都用 MinIO 自托管或者云上 S3，开发环境装个 MinIO Helm chart 五分钟搞定。

4. **retry 配在 template 还是 task**：`retryStrategy` 放 template 上是"这个 template 每次调用都重试"；放 dag.task 上是"这一次调用重试"。新人常配错，结果重试策略要么对所有调用生效（过度重试），要么只对特定一次生效（漏重试）。

5. **Workflow Template vs Cluster Workflow Template**：前者是 namespace 内复用，后者是集群范围复用。新人常把"想全集群共享的 template"建成 namespace 级，结果别的 namespace 引不到。

## 适用 vs 不适用场景

**适用**：

- K8s 上跑 CI/CD（Tekton 也行，但 Argo 起步更轻）
- ML 训练管线（Kubeflow Pipelines 内置就用它）
- 数据 ETL —— 替代 Airflow 把 worker 进程换成 Pod
- 批量任务编排——视频转码、报表生成、夜间清理等
- 需要 suspend / resume 的审批流

**不适用**：

- 没用 K8s——Argo Workflows 强依赖 CRD 和 Pod 调度
- 长期跑的服务（用 Deployment + Service）
- 任务极简单（直接写 K8s Job 就够，引 Argo 反而重）
- 需要 Python DSL 而非 yaml——可以用 Hera SDK 包一层，但本质还是 yaml

## 历史小故事（可跳过）

- **2017 年**：Applatix 团队（创始人也是后来 Argo CD 创始人 Jesse Suen）在 K8s 上做 CI/CD 平台，发现没有原生工作流引擎，自己造了 Argo。
- **2018 年**：Intuit 收购 Applatix，Argo 项目继续开源。同年 Argo CD 立项。
- **2019 年**：Argo Workflows v2.4 发布，DAG 模板和 artifact 机制稳定。Kubeflow 把 Pipelines 后端切到 Argo。
- **2020 年**：加入 CNCF Incubator。
- **2022 年**：CNCF Graduated，和 Argo CD 同期毕业。
- **2024 年**：v3.5 把 PostgreSQL archive 列为推荐配置；Hera Python SDK 进入 1.0，Python 写 Workflow 终于可用。

## 学到什么

1. **K8s 原生**这四个字的真正含义——不是"跑在 K8s 上"，而是"借 K8s 的 API、调度器、CRD 一起做事"，运维一套就够
2. **CRD + controller 模式** 的标准实现——Workflow 是 CRD，controller 监听变化、创建 Pod、汇总状态，整个 Argo 控制器代码可以当 Operator 写法的范本
3. **批处理和长服务** 是两种完全不同的 K8s 用法，Deployment / StatefulSet / Job / Workflow 各有定位
4. **suspend / resume** 这种"流程语义"功能用 CRD 状态字段实现，比起进程级长连接简单一个量级

## 延伸阅读

- 官方文档：[argo-workflows.readthedocs.io](https://argo-workflows.readthedocs.io/)
- 快速上手：[Argo Workflows Quick Start](https://argo-workflows.readthedocs.io/en/latest/quick-start/)
- Hera Python SDK：[hera.readthedocs.io](https://hera.readthedocs.io/)（用 Python 类型而非 yaml 写 Workflow）
- 对比 Airflow：[Argo vs Airflow](https://blog.argoproj.io/argo-workflows-vs-apache-airflow-2cfdfe3d3e9d)
- Kubeflow Pipelines（Argo 最大下游用户）：[kubeflow.org/docs/components/pipelines/](https://www.kubeflow.org/docs/components/pipelines/)

## 关联

- [[kubernetes]] —— Argo Workflows 的所有抽象都是 K8s 资源
- [[argocd]] —— Argo 家族另一个成员，定位互补：CD 管"应用持续部署"，Workflows 管"任务一次性执行"
- [[airflow]] —— 老牌工作流引擎，对比突出 Argo 的 K8s 原生优势
- [[helm]] —— 装 Argo Workflows 推荐方式之一

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[airflow]] —— Apache Airflow — 用 Python 代码画工作流图，让调度器替你按图施工
- [[argocd]] —— Argo CD — Kubernetes GitOps 工具
- [[helm]] —— Helm — Kubernetes 包管理器
- [[kubernetes]] —— Kubernetes — 容器编排平台
- [[litmus]] —— LitmusChaos — 给 K8s 集群安排"故意搞坏"的演习
- [[tekton]] —— Tekton — 把 CI/CD 流水线当成 K8s 资源来声明

