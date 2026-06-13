---
title: Tekton — 把 CI/CD 流水线当成 K8s 资源来声明
来源: https://github.com/tektoncd/pipeline
日期: 2026-05-31
子分类: cloud-native
分类: 基础设施
难度: 中级
provenance: pipeline-v3
---

## 是什么

Tekton 是 Google 2018 年在 Knative 里孵化、2019 年捐给 CD Foundation 的开源 CI/CD 框架。它的核心招式只有一句：**把流水线本身写成 Kubernetes 资源**。

日常类比：

> 传统 CI（Jenkins）像一台大主机——你装一台 master，把所有 job 喂给它跑；Tekton 像把流水线拆成乐高块，每块都是 K8s 集群里能 `kubectl get` 出来的对象，集群本身就是引擎。

最直观的画面，一段 Tekton Pipeline 长这样：

```yaml
apiVersion: tekton.dev/v1
kind: Pipeline
metadata:
  name: build-and-push
spec:
  tasks:
    - name: clone
      taskRef: { name: git-clone }
    - name: build
      runAfter: [clone]
      taskRef: { name: buildah }
```

`kubectl apply` 后，集群里多出一个 `Pipeline` 对象；触发执行就是再创一个 `PipelineRun`，引擎调度出一堆 Pod 去把每个 Task 跑掉。**没有 master，没有 plugin 仓库，全是 K8s 原生 API。**

## 为什么重要

不了解 Tekton 这套思路，下面的事每天要付学费：

- 想给团队搭 CI 又不想被 GitHub Actions 锁死、托管费失控——自建 Jenkins 又要养 master
- 多个项目想复用同一套 `git-clone` / `buildah` 步骤，Jenkins 用 shared library，GitHub Actions 用 reusable workflow，**两个机制都和平台绑死**
- 想让 SRE 用 `kubectl` 直接看 CI 状态、把告警接到 Prometheus——传统 CI 要装 exporter、配 webhook
- OpenShift Pipelines / Jenkins X / 部分 Cloud Build 都是 Tekton 的下游产品，不懂 Tekton 看它们文档全是黑话

Tekton 和 [[argo-workflows]] / [[knative]] 是同一个潮流：**把基础设施抽象层从"装个服务"挪到"声明个 CRD"**。Argo 走的是通用 workflow，Tekton 专做 CI/CD——所以它有 Task / Pipeline 这种贴近构建语义的对象，而不是只有 Workflow / Step。

## 核心要点

Tekton 的设计可以拆成 **四个支柱**：

1. **四个 CRD 分两层**：定义层是 `Task` / `Pipeline`（写一次复用），执行层是 `TaskRun` / `PipelineRun`（每跑一次创一个）。类比：菜谱 vs 这一顿饭——菜谱写一次，每顿饭是它的一次实例。

2. **每个 Task 一个 Pod，Step 是 Pod 内顺序容器**：一个 Task 里写 5 个 Step，调度器把它们当成同一个 Pod 的 5 个容器顺序跑——共享网络、共享 emptyDir。类比：流水线工人站在同一条传送带上，工件不离手就传到下一个工序。

3. **Workspace + Results 两条数据通道**：大文件（源码、构建产物）走 Workspace（背后是 PVC / emptyDir）；小数据（commit SHA、版本号）走 Results 字符串。类比：工厂里大件走货车、小条子走对讲机，**不要混用**。

4. **Catalog/Hub 提供官方 Task**：`git-clone` / `buildah` / `kaniko` / `golang-test` 等几百个写好的 Task，`kubectl apply` 进集群就能引用。类比：npm registry，但每个包都是 K8s 资源。

四条叠加，结果是"声明式、可复用、能被 K8s 现有工具链一起观测"。

## 实践案例

### 案例 1：装上、跑起来、第一条流水线

```bash
kubectl apply -f https://storage.googleapis.com/tekton-releases/pipeline/latest/release.yaml
brew install tektoncd-cli  # tkn CLI
```

写一个最小 Task，跑 `echo hello`：

```yaml
apiVersion: tekton.dev/v1
kind: Task
metadata: { name: hello }
spec:
  steps:
    - name: say-hi
      image: alpine
      script: echo hello tekton
```

`kubectl apply -f hello.yaml` 后，`tkn task start hello` 触发一次 TaskRun。背后 Tekton 创了一个 Pod，Pod 里跑 `alpine` 容器执行 `echo`，日志能用 `tkn taskrun logs` 拉出来。

第一次跑就能感觉到差别：**你没装任何 CI 服务**，只装了一组 CRD，集群本身就是 CI 引擎。

### 案例 2：用 Catalog Task 拼一条 build-and-push 流水线

不要自己写 `git-clone`，从 Tekton Hub 抓官方版本：

```bash
kubectl apply -f https://raw.githubusercontent.com/tektoncd/catalog/main/task/git-clone/0.9/git-clone.yaml
```

然后写 Pipeline 把 `git-clone` 和 `buildah` 串起来，Workspace 共享代码：

```yaml
apiVersion: tekton.dev/v1
kind: Pipeline
metadata: { name: build-push }
spec:
  workspaces:
    - name: source
  tasks:
    - name: clone
      taskRef: { name: git-clone }
      workspaces: [{ name: output, workspace: source }]
    - name: build
      runAfter: [clone]
      taskRef: { name: buildah }
      workspaces: [{ name: source, workspace: source }]
```

`tkn pipeline start build-push` 时绑一个 PVC 给 `source` workspace，clone 写进去、build 读出来。**两个 Task 跨 Pod 共享文件就靠这条 PVC**。

### 案例 3：把 CI 状态当 K8s 资源观测

`kubectl get pipelinerun -A` 列出所有正在跑的流水线、Succeeded / Failed / Running 状态都是 K8s condition：

```bash
kubectl get pipelinerun
NAME                  SUCCEEDED  REASON     STARTTIME  COMPLETIONTIME
build-push-run-x9k2t  True       Succeeded  2m         12s
```

接 Prometheus 抓 `tekton_pipelinerun_duration_seconds`，告警规则直接写 PromQL。**CI 不再是黑盒，是集群里的一等公民**。

## 踩过的坑

1. **Pod 启动开销**：每个 Task 至少一个 Pod，10 个 Task 仅 Pod 创建 + 镜像拉取就 30-60 秒。要么把多个 Step 塞进一个 Task（共享 Pod），要么开 Tekton 的 image cache。

2. **YAML 冗长**：一条 build-test-push 流水线常 200-500 行 YAML。社区在推 Tekton Pipelines as Code（PaC）和 Pipelines in YAML 抽象，但官方仍然以 CRD 为准。

3. **Workspace 跨节点慢**：默认 PVC 是 ReadWriteOnce，跨节点调度会强制串行。大型流水线建议用 ReadWriteMany（NFS / CephFS）或者每条流水线绑一个节点（nodeSelector）。

4. **调试要靠 tkn CLI**：日志分散在多个 Pod，原生 `kubectl logs` 看不到完整流程。务必装 [tkn](https://tekton.dev/docs/cli/) 和 [Tekton Dashboard](https://tekton.dev/docs/dashboard/)。

5. **Catalog Task 版本碎片化**：同一个 `git-clone` 有 0.1 / 0.4 / 0.9 多个版本，参数和 Workspace 名经常变。固定版本号、升级前 diff。

6. **Trigger 是另一个组件**：Tekton Pipelines 只管"怎么跑"，"什么时候跑"（webhook、定时）要装 [Tekton Triggers](https://tekton.dev/docs/triggers/) 这个独立项目。

## 适用 vs 不适用场景

**适用**：

- 已经在用 K8s，想自建 CI/CD 不想被 GitHub Actions 锁死
- 多团队多项目想复用同一套构建步骤（`git-clone` / `buildah`）
- 需要把 CI 状态接进现有 K8s 监控栈（Prometheus / Grafana / Loki）
- 跑 OpenShift / Jenkins X，反正底层就是 Tekton

**不适用**：

- 团队还没上 K8s——为了 CI 装一套集群，不划算
- 只跑简单单元测试 + lint——GitHub Actions 几行 YAML 就够
- 在意冷启动延迟（< 10 秒触发到出结果）——Pod 创建注定吃几十秒
- 没有专人维护 K8s 集群——CRD 升级、Catalog 跟进都要人

## 学到什么

1. **声明式 CI**：流水线是一份 YAML 而不是一次脚本调用，跟你管 Deployment / Service 是同一套思路
2. **CRD 是基础设施抽象的标准答案**：只要 K8s 在，CI 引擎就在；换云、换集群只要把 YAML `kubectl apply` 一遍
3. **Task 是可复用单位**：写好一次 `git-clone` 全组织共用，比 Jenkins shared library 干净——它是 K8s 资源，不是某个引擎的内部对象
4. **专用抽象 vs 通用抽象**：[[argo-workflows]] 用 Workflow / Step 通吃，Tekton 用 Task / Pipeline 贴 CI/CD 语义，**专用抽象在窄场景里更顺手**

## 延伸阅读

- 官方文档：[tekton.dev/docs](https://tekton.dev/docs/) （Concepts / Pipelines / Triggers 三段读完就懂）
- Catalog 仓库：[tektoncd/catalog](https://github.com/tektoncd/catalog) （几百个官方 Task，参考写法）
- Tekton Hub：[hub.tekton.dev](https://hub.tekton.dev/) （Catalog 的 Web UI，能搜能看版本）

## 关联

- [[argo-workflows]] —— 同样是 K8s CRD 工作流引擎；Argo 通用 DAG，Tekton 专攻 CI/CD
- [[kubernetes]] —— 提供 CRD 和调度，Tekton 整个引擎只是一组 controller
- [[knative]] —— Tekton 的孵化母体，早期叫 Knative Build
- [[drone]] —— 同期 K8s 友好的 CI 但走容器原生 YAML 路线，没把流水线建模成 CRD
- [[jenkins]] —— 中心化 master + plugin 模式，Tekton 是它的反命题
