---
title: Skaffold — K8s 本地开发的 build-deploy 自动循环
来源: https://github.com/GoogleContainerTools/skaffold
日期: 2026-06-01
子分类: DevOps 与运维
分类: 基础设施
难度: 中级
schema_version: legacy-long
provenance: legacy-migrated
---

## 是什么

Skaffold 是 Google 维护的一个命令行工具，把"改代码 → 重建镜像 → 推到集群 → 看日志"这一整串 [[kubernetes]] 开发动作自动化成**一条命令**：`skaffold dev`。

它跑起来之后干这几件事：

1. 监听本地文件（类似 `nodemon` 但盯的是源码目录）
2. 文件一变 → 触发镜像重建（docker build / buildpacks / jib 任选）
3. 镜像建好 → 自动推到镜像仓库 + 改 K8s manifest 里的 image tag
4. 调 `kubectl apply` / `helm install` / `kustomize build` 部署
5. 把 Pod 日志接到本地终端，端口自动 port-forward 到 localhost

日常类比：写前端时 `npm run dev` 一条命令搞定 webpack + dev server + 热更新；K8s 后端从前没这种东西，每次都要 `docker build && docker push && kubectl rollout`。Skaffold 就是给 K8s 配的那个 `npm run dev`。

GitHub 15k star，Go 写的。**Cloud Code**（Google 的 VSCode/IntelliJ 插件）背后跑的就是它。

## 为什么重要

不用 Skaffold 之前，K8s 本地开发循环是这样：

```bash
docker build -t myapp:v17 .
docker push myreg/myapp:v17
sed -i 's/myapp:v.*/myapp:v17/' k8s/deployment.yaml
kubectl apply -f k8s/deployment.yaml
kubectl logs -f deploy/myapp
```

每改一行代码做一次。新人第一周浪费一半时间在敲这些命令、改 tag、忘记 push。Skaffold 把整套流程封进 `skaffold dev`，**改完保存就完事**。

它重要的另一个原因是**生态枢纽位置**：

- VSCode 的 [Cloud Code](https://cloud.google.com/code) 插件 / IntelliJ Cloud Code 内嵌 Skaffold 引擎
- [[argocd]] / Flux 这类 GitOps 工具用 `skaffold render` 输出最终 YAML
- Google Cloud Build / Tekton / Jenkins 都有 Skaffold step

了解它就能看懂 K8s 工具链上很多教程默认假设的"开发机循环"。

## 核心要点

理解 Skaffold 抓住三件事就够：

**1. skaffold.yaml**——一份配置文件描述"怎么 build + 怎么 deploy"：

```yaml
apiVersion: skaffold/v4beta11
kind: Config
build:
  artifacts:
    - image: myapp
      docker:
        dockerfile: Dockerfile
deploy:
  kubectl:
    manifests:
      - k8s/*.yaml
```

**2. 三个核心命令**：

- `skaffold dev`——监听+循环（开发用）
- `skaffold run`——一次性 build + deploy（手动一次）
- `skaffold render`——只生成最终 manifest 不部署（给 GitOps）

**3. 工具可插拔**——build 和 deploy 都可以换：

| build 工具 | 适合场景 |
|------------|----------|
| docker | 通用 |
| buildpacks | 不写 Dockerfile（heroku 风格） |
| jib | Java，免装 docker |
| kaniko | 集群里建（无需本地 docker） |
| ko | Go 专用，秒级建镜像 |

deploy 同理：kubectl / [[helm]] / [[kustomize]] 三选一。

## 实践案例

### 案例 1：最小 hello-world

```yaml
apiVersion: skaffold/v4beta11
kind: Config
build:
  artifacts:
    - image: hello
deploy:
  kubectl:
    manifests:
      - deployment.yaml
```

跑 `skaffold dev`，改 `main.go` 保存 → 5 秒后 `kubectl logs` 里看到新输出。**手不用碰 docker / kubectl 任何命令**。

### 案例 2：file sync 跳过镜像重建

Python / Node 这种解释型语言，改一行代码不需要重建整个镜像，直接 `cp` 进容器就行：

```yaml
build:
  artifacts:
    - image: myapp
      sync:
        manual:
          - src: 'src/**/*.py'
            dest: /app
```

改 `.py` 文件 → Skaffold 直接复制进运行中的 Pod，**不走镜像构建**。重启进程就生效，从 30 秒降到 1 秒。

### 案例 3：profiles 切环境

```yaml
profiles:
  - name: prod
    build:
      artifacts:
        - image: myapp
          docker:
            buildArgs:
              ENV: production
    deploy:
      helm:
        releases:
          - name: myapp
            chartPath: ./chart
```

`skaffold run -p prod` 切到 production profile，build 用不同参数、deploy 走 [[helm]] 而不是 kubectl。

## 踩过的坑

1. **apiVersion 升级是断崖式的**：`skaffold.yaml` 的 apiVersion 从 `v2beta` → `v3` → `v4beta` 字段重排过，老仓库升级 Skaffold 二进制后第一件事是跑 `skaffold fix` 转换 schema，否则直接报错。

2. **file sync 只救解释型**：Java / Go 这种编译型语言改一行还是得重建整个镜像，sync 救不了。Java 用户应换 [[jib]]（Google 的另一工具，免 docker 直接打 JAR 进镜像层）。

3. **远程集群 push 慢**：本地用 [[kind]] 或 minikube 时 Skaffold 可以**直接把镜像 load 进集群跳过 push**，秒级完成。换成远程 GKE / EKS，每次都要 push 到 GCR / ECR，5 MB 也要 10 秒，循环慢 10 倍。

4. **profiles 嵌套陷阱**：profile 之间能继承能覆盖，写多了之后"prod profile 究竟用哪个 build 工具"得脑内推演两层 YAML 合并规则。建议每个 profile 独立写全字段，重复一点没关系。

## 适用 vs 不适用场景

**适用**：

- K8s 应用本地开发循环（个人开发机 + kind/minikube）
- 团队约定一份 `skaffold.yaml` 让所有人开发体验一致
- GitOps 仓库用 `skaffold render` 输出最终 YAML（[[argocd]] 配合）
- VSCode / IntelliJ 用户走 Cloud Code 插件（背后还是它）

**不适用**：

- 不用 K8s 的项目（裸 docker-compose / 单机 systemd 用不上）
- 想要花哨 UI 看每个服务状态 → 用 [[tilt]]，UI 更直观
- 复杂的本地依赖编排（要起 mock 服务 / 跑 e2e 测试 / 灌测试数据）→ 用 Garden
- 想把本地进程接进远程集群（不打镜像直接跑）→ 用 Telepresence

## 历史小故事（可跳过）

- **2017 KubeCon**：Google 发布 Skaffold v0.1，定位"K8s 开发体验工具"
- **2018**：v1.0 GA，build/deploy plugin 架构成型
- **2019**：Cloud Code（VSCode 插件）GA，内嵌 Skaffold 作为底层引擎
- **2020 至今**：GoogleContainerTools 持续维护，apiVersion 演进到 v4beta，社区 fork 出 [[skaffold-tilt]] 类替代品但本体仍是事实标准

## 学到什么

1. **开发循环工具的价值在于"消失"**——好工具让你忘记它存在，`skaffold dev` 起一次之后就不用再想 build/push/apply 这些动词
2. **build 和 deploy 解耦**——同一份代码可以选 docker 或 buildpacks 建、选 kubectl 或 [[helm]] 部署，不用绑死任何工具链
3. **inner loop / outer loop 概念**——开发循环（inner，秒级反馈）和 CI/CD（outer，分钟级流水线）需求不同；Skaffold 一份配置覆盖两端是设计亮点
4. **生态枢纽工具的杠杆**——Skaffold 自己功能不复杂，但 Cloud Code / GitOps / CI 都用它做基底，学会一个能解锁三类场景

## 延伸阅读

- 官方教程：[skaffold.dev tutorials](https://skaffold.dev/docs/tutorials/)（10 分钟跑通 hello-world）
- vs Tilt 对比：[Skaffold vs Tilt](https://www.cncf.io/blog/2021/04/12/comparing-skaffold-tilt-garden-devspace/)（CNCF 官方比较四家）
- Cloud Code 内嵌：[Cloud Code overview](https://cloud.google.com/code/docs)（看 Skaffold 在 IDE 里怎么用）
- [[kubernetes]] —— Skaffold 服务的对象
- [[helm]] / [[kustomize]] —— Skaffold 可选的 deploy 后端
- [[argocd]] —— GitOps 工具，用 skaffold render 输出消费

## 关联

- [[kubernetes]] —— Skaffold 围绕 K8s 设计，离开 K8s 没意义
- [[helm]] —— 可作为 Skaffold 的 deploy 后端之一
- [[kustomize]] —— 同样可作为 Skaffold 的 deploy 后端，三选一灵活
- [[argocd]] —— GitOps 工具，吃 Skaffold render 输出的 YAML
- [[docker]] —— 默认 build 工具，可被 buildpacks/jib/ko 替换

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[argocd]] —— Argo CD — Kubernetes GitOps 工具
- [[helm]] —— Helm — Kubernetes 包管理器
- [[kubernetes]] —— Kubernetes — 容器编排平台
- [[kustomize]] —— Kustomize — 不动原 YAML 的 K8s 配置叠加器
- [[tilt]] —— Tilt — K8s 微服务本地开发的"文件保存即上线"

