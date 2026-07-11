---
title: Actions Runner Controller — 让 GitHub Actions 在你自己的 K8s 上跑
来源: https://github.com/actions/actions-runner-controller
日期: 2026-05-31
分类: DevOps / CI 基建
难度: 中级
---

## 是什么

Actions Runner Controller（**ARC**）是一个 **Kubernetes operator**，它把 GitHub Actions 的"自托管 runner"变成 K8s 里**用完即销**的 Pod。

日常类比：

- **GitHub-hosted runner** 像在外卖平台叫工人——便宜方便，但只能用平台给的工具，机器规格也固定（2 vCPU / 7G）。想要 GPU、想用内网代码库？平台没有就没有。
- **传统自建 runner** 像自己雇了个全职工：永远在岗，闲着也要付工资，干完一个活下一个不干净（残留依赖）。
- **ARC** 像一个**临时工调度系统**：有活了，K8s 立刻起一个 Pod 当工人；活干完，Pod 销毁；空闲时数量降到 0。每个工人都是新的——上一份活的痕迹带不到下一份。

它最早由 summerwind 在 2020 年个人开源，2023 年转给 GitHub 官方维护，算 GitHub 自家方案。

## 为什么重要

不理解 ARC，下面这些事都没法解释：

- **GPU CI 怎么落地**——GitHub-hosted 没有 GPU runner（贵且稀缺），自己买的 GPU 机器只有 ARC 这种方案能"按需起、闲就关"，不至于一张卡 24 小时空转
- **CI 安全隔离**——每个 job 一个 Pod，job 结束 Pod 销毁，残留的 secret / 缓存 / 后门带不到下一个 job
- **scale-to-zero**——闲时副本降到 0，活来了再起。比"常驻 runner 池"省一大截钱
- **K8s operator 范式**——ARC 是教科书级的 operator 例子：监听外部事件源（GitHub）、协调内部资源（Pod），可以照着学怎么写自己的 operator

## 核心要点

ARC 干的事拆成 **三层**：

1. **CRD 描述意图**：你写一个 `AutoscalingRunnerSet` yaml，说"我要 0-20 个 runner，监听 my-org/my-repo，跑在 GPU 节点上"。这是声明式——你描述目标状态，不写"怎么到达"。

2. **Listener Pod 长轮询 GitHub**：controller 起一个 Listener Pod，用 HTTPS 长连接持续问 GitHub："我这个 scale-set 现在有多少 job 在排队？" 收到数字就调整 EphemeralRunner 副本数。**关键**：是 Listener 主动问 GitHub，不需要 GitHub 反向打 webhook 进集群——你的集群可以躲在防火墙后面。

3. **Ephemeral Pod 跑一次就死**：每个 EphemeralRunner Pod 启动后向 GitHub 注册自己，领一个 job，跑完，Pod 退出。这就是"用完即销"。

旧版 CRD 是 `RunnerDeployment` + `HorizontalRunnerAutoscaler`，2023 年 9 月推出的新版叫 `gha-runner-scale-set`，用 GitHub App 鉴权（不用 PAT），是当前推荐方案。

## 实践案例

### 案例 1：装 ARC controller（5 分钟）

```bash
NAMESPACE='arc-systems'
helm install arc \
  --namespace "${NAMESPACE}" --create-namespace \
  oci://ghcr.io/actions/actions-runner-controller-charts/gha-runner-scale-set-controller
```

这一步装的是"调度大脑"——它本身不跑 job，只负责管 Listener 和 EphemeralRunner。

### 案例 2：起一个 GPU runner scale-set

先用 GitHub App 私钥在 `arc-runners` 命名空间建好 `arc-github-app` secret，再把它交给 scale-set chart：

```bash
helm install gpu-runners \
  --namespace 'arc-runners' --create-namespace \
  --set githubConfigUrl='https://github.com/my-org/my-repo' \
  --set githubConfigSecret='arc-github-app' \
  --set minRunners=0 \
  --set maxRunners=4 \
  --set 'template.spec.nodeSelector.nvidia\.com/gpu.product'='A100' \
  oci://ghcr.io/actions/actions-runner-controller-charts/gha-runner-scale-set
```

`minRunners=0` 是 scale-to-zero——平时一个 Pod 都没有，省钱；有 job 进来，自动起；最多 4 个。

GitHub Actions workflow 里这样用：

```yaml
jobs:
  train:
    runs-on: gpu-runners   # 这里就是 scale-set 的名字
    steps:
      - run: nvidia-smi
```

### 案例 3：观察一个 job 的生命周期

job 入队 → Listener 收到通知 → controller 创建 EphemeralRunner Pod → Pod 向 GitHub 注册 → 拿到 job 跑完 → Pod 退出 → controller 把它清掉。整个过程 30 秒到几分钟（看镜像多大）。

`kubectl get pods -n arc-runners -w` 能实时看到 Pod 起起落落。

### 案例 4：观察 controller 自己

ARC controller 本身也是个 Pod，跑在 `arc-systems` 命名空间。它的日志最值得读：

```bash
kubectl logs -n arc-systems -l app.kubernetes.io/name=gha-rs-controller -f
```

第一次跑通时建议盯着这个日志看一两个 job 周期——所有 reconcile 决策（"该起 Pod 了"/"该清理了"）都在这里打出来，能直观感受 operator 在干啥。

## 踩过的坑

1. **冷启动延迟**：scale-to-zero 听起来美，但每个 job 多等 10-30 秒（Pod 调度 + 拉镜像 + 注册）。CI 频繁触发时用户会感觉"卡"。折中：`minRunners` 设 1-2，保留少量常驻。

2. **镜像选错跑不动**：默认 runner 镜像不带 docker / nvidia 工具链。要跑 docker build 得用 dind sidecar；要用 GPU 得镜像里装 CUDA + nodeSelector 选对节点 + tolerations 容忍 GPU taint。三件事少一件就跑不起来。

3. **新旧 CRD 文档混在一起**：网上一半教程是旧版（`RunnerDeployment`），一半是新版（`AutoscalingRunnerSet`）。两套 yaml 完全不通用。**判断方法**：helm chart 名带 `gha-` 的是新版。

4. **PAT 过期 = 集群所有 runner 全挂**：旧版默认用 GitHub Personal Access Token，token 过期没人提醒。新版用 GitHub App 私钥（不会过期），强烈建议直接上新版。

5. **Pod 起来了但 GitHub 上看不到**：90% 是 token 权限不够。组织级 runner 需要 admin:org，仓库级需要 repo——都给少一个就静默失败。

## 适用 vs 不适用场景

**适用**：

- 已经有 K8s 集群，CI 是 GitHub Actions
- 需要 GPU / 大内存 / 内网访问的 CI（GitHub-hosted 给不了）
- 一天上百次 CI 触发，常驻 runner 太贵
- 想用 K8s 的资源隔离 / quota / network policy 管 CI

**不适用**：

- CI 在 GitLab / Jenkins / Buildkite——ARC 只接 GitHub Actions
- 没有 K8s，也不想引入 K8s——用 Philips labs 的 Terraform GitHub-runner（EC2 ASG）更轻
- 每天就跑几次 CI——GitHub-hosted 免费额度足够，不值得搭
- 对延迟敏感（CI 要秒级响应）——冷启动 10-30 秒受不了

## 历史小故事（可跳过）

- **2020 年**：日本工程师 summerwind 个人项目开源 actions-runner-controller，第一个版本只有 RunnerDeployment 一个 CRD。
- **2021-2022 年**：社区扩大，HorizontalRunnerAutoscaler 加入，能根据 webhook 触发 scale。但 webhook 模式要求 GitHub 能访问到集群，企业内网部署很痛。
- **2023 年 4 月**：项目转给 GitHub 官方（actions/ org），同时宣布要重写 CRD。
- **2023 年 9 月**：新一代 `gha-runner-scale-set` 发布，引入 Listener Pod + 长轮询架构，彻底解决"必须暴露 webhook 端点"的问题。这是当前主推方案。

## 学到什么

1. **K8s operator 是怎么"读外部事件源"的**——ARC 的 Listener Pod 是个范本：长轮询 + reconcile 副本数，不依赖 webhook 反向连接，对企业网络友好。
2. **ephemeral 工作负载的价值**：每个 job 一个干净 Pod，安全 + 可复现 + 易并行。这个模式在 ML 训练任务调度、批处理 job 上同样适用。
3. **scale-to-zero 不是免费的**：省钱代价是冷启动延迟。设计 CI 体验时要把这个 tradeoff 摆在台面上。
4. **CRD 演进期"两套 API 并存"是常态**：看 helm chart 名 / 文档日期，别把新旧文档拌在一起读。

## 延伸阅读

- 官方文档：[ARC Quickstart](https://docs.github.com/en/actions/hosting-your-own-runners/managing-self-hosted-runners-with-actions-runner-controller/quickstart-for-actions-runner-controller)
- 新版架构详解：[gha-runner-scale-set deep dive](https://github.blog/2023-09-12-actions-runner-controller-now-with-runner-scale-sets/)
- 替代方案对比：[Philips labs Terraform GitHub-runner](https://github.com/philips-labs/terraform-aws-github-runner)（EC2 ASG，不依赖 K8s）

## 内部组件速览

新版 ARC 在集群里会出现这几类对象，调试时分清楚很重要：

- **gha-rs-controller**（Deployment）：调度大脑，watch 三种 CRD，reconcile 副本数
- **AutoscalingRunnerSet**（CRD）：你写的 yaml，描述"我要什么样的 runner 池子"
- **EphemeralRunnerSet**（CRD）：controller 派生的中间对象，类似 ReplicaSet 之于 Deployment
- **EphemeralRunner**（CRD）：单个 runner 的抽象，对应一个 Pod
- **Listener Pod**：每个 scale-set 一个，长轮询 GitHub 拿排队数

排查问题时先看 controller 日志，再看 Listener 日志，最后看具体 EphemeralRunner Pod 日志——三层定位法。

## 关联

- [[argocd]] —— 同样是 K8s operator + GitOps 思路；ARC 是"对接 GitHub 事件"，Argo CD 是"对接 Git 仓库"
- [[ansible]] —— 管基建的另一条路（push 模式 SSH），和 ARC 的 pull + reconcile 范式正好对照
- [[airflow]] —— 同样是"任务调度 + 工作 Pod 拉起"，KubernetesExecutor 在 Airflow 里干的就是 ARC 在 GitHub Actions 里干的事
