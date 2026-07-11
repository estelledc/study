---
title: Skaffold — K8s 本地开发的 build-deploy 自动循环
来源: https://github.com/GoogleContainerTools/skaffold
日期: 2026-06-01
分类: DevOps / 容器
难度: 中级
---

## 是什么

Skaffold 是 Google 维护的命令行工具，把「改代码 → 重建镜像 → 推到集群 → 看日志」这一整串 [[kubernetes]] 开发动作自动化成**一条命令**：`skaffold dev`。

它跑起来之后干这几件事：

1. 监听本地源码目录（类似前端的 `nodemon`）
2. 文件一变 → 触发镜像重建（docker / buildpacks / jib 任选）
3. 镜像建好 → 推仓库，并改 K8s 清单（manifest，描述要跑什么）里的 image tag
4. 调 `kubectl apply` / `helm install` / `kustomize build` 部署
5. 把 Pod（集群里跑着的容器实例）日志接到终端，并把端口转发（port-forward）到 localhost

日常类比：写前端时 `npm run dev` 一条命令搞定打包 + 热更新；K8s 后端从前每次都要 `docker build && docker push && kubectl rollout`。Skaffold 就是给 K8s 配的那个 `npm run dev`。

GitHub 约 15k star，Go 写的。**Cloud Code**（Google 的 VSCode/IntelliJ 插件）背后跑的就是它。

## 为什么重要

不用 Skaffold 之前，K8s 本地开发循环是这样：

```bash
docker build -t myapp:v17 .
docker push myreg/myapp:v17
sed -i 's/myapp:v.*/myapp:v17/' k8s/deployment.yaml
kubectl apply -f k8s/deployment.yaml
kubectl logs -f deploy/myapp
```

每改一行代码做一次。新人第一周常浪费在敲命令、改 tag、忘记 push。Skaffold 把整套流程封进 `skaffold dev`，**改完保存就完事**。

它重要的另一个原因是**生态枢纽位置**：

- VSCode / IntelliJ 的 [Cloud Code](https://cloud.google.com/code) 内嵌 Skaffold 引擎
- [[argocd]] / Flux 这类 GitOps 工具可用 `skaffold render` 输出最终 YAML
- Google Cloud Build / Tekton / Jenkins 都有 Skaffold step

了解它就能看懂很多 K8s 教程默认假设的「开发机循环」。

## 核心要点

理解 Skaffold 抓住三件事就够：

**1. skaffold.yaml**——一份配置描述「怎么 build + 怎么 deploy」：

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
- `skaffold run`——一次性 build + deploy
- `skaffold render`——只生成最终 manifest，不部署（给 GitOps）

**3. 工具可插拔**——build 可选 docker / buildpacks / jib / kaniko / ko；deploy 可选 kubectl / [[helm]] / [[kustomize]]。

## 实践案例

### 案例 1：最小 hello-world 循环

假设同目录已有 `Dockerfile` 和 `deployment.yaml`，再写：

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

**逐步拆解**：① 跑 `skaffold dev` → ② 它按 Dockerfile 建镜像并部署 → ③ 你改 `main.go` 保存 → ④ 自动 rebuild/redeploy → ⑤ 终端日志里看到新输出。手不用再碰 docker / kubectl。

### 案例 2：file sync 跳过镜像重建

Python / Node 等解释型语言，改一行不必重建整个镜像，直接复制进容器：

```yaml
build:
  artifacts:
    - image: myapp
      sync:
        manual:
          - src: 'src/**/*.py'
            dest: /app
```

**为什么这样写**：改 `.py` → Skaffold 把文件 sync 进运行中的 Pod，**不走镜像构建**；重启进程即可，从约 30 秒降到约 1 秒。

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

**为什么这样写**：`skaffold run -p prod` 切到 production profile——build 参数不同，deploy 走 [[helm]] 而不是 kubectl，同一份仓库覆盖开发/发布两端。

## 踩过的坑

1. **apiVersion 升级是断崖式的**：`v2beta` → `v3` → `v4beta` 字段重排过，升级二进制后先跑 `skaffold fix` 转换 schema。
2. **file sync 只救解释型**：Java / Go 改一行仍要重建镜像；Java 可换 [[jib]] 免装 docker。
3. **远程集群 push 慢**：本地 [[kind]] / minikube 可直接 load 镜像跳过 push；远程 GKE/EKS 每次 push，循环常慢一个数量级。
4. **profiles 嵌套陷阱**：继承/覆盖写多了难推演；建议每个 profile 独立写全字段。

## 适用 vs 不适用场景

**适用**：

- K8s 应用本地开发循环（个人机 + kind/minikube）
- 团队共用一份 `skaffold.yaml` 统一开发体验
- GitOps 仓库用 `skaffold render` 输出 YAML（配合 [[argocd]]）
- VSCode / IntelliJ 走 Cloud Code（底层仍是它）

**不适用**：

- 不用 K8s（裸 docker-compose / 单机 systemd）
- 想要花哨 UI 看服务状态 → 用 [[tilt]]
- 复杂本地依赖编排（mock / e2e / 灌数）→ 用 Garden
- 想把本地进程接进远程集群、不打镜像 → 用 Telepresence

## 历史小故事（可跳过）

- **2018-03**：Google 公开介绍 Skaffold，定位「K8s 开发体验工具」（持续 build/push/deploy）
- **2019-11**：Skaffold 宣布 GA；同年 Cloud Code 插件 GA，内嵌 Skaffold 作引擎
- **2020 至今**：apiVersion 演进到 v4beta；并列方案有 [[tilt]]、Garden、DevSpace 等，本体仍是常见默认选择

## 学到什么

1. **好开发循环工具会「消失」**——`skaffold dev` 起一次后，不必再想 build/push/apply
2. **build 和 deploy 解耦**——同一份代码可选不同建镜像/部署后端
3. **inner loop / outer loop**——秒级本地反馈与分钟级 CI/CD 需求不同；一份配置可覆盖两端
4. **生态枢纽有杠杆**——学会 Skaffold 能连带看懂 Cloud Code / GitOps / CI 里的同类假设

## 延伸阅读

- 官方教程：[skaffold.dev tutorials](https://skaffold.dev/docs/tutorials/)
- vs Tilt 等对比：[CNCF 比较文](https://www.cncf.io/blog/2021/04/12/comparing-skaffold-tilt-garden-devspace/)
- Cloud Code：[overview](https://cloud.google.com/code/docs)
- [[kubernetes]] —— Skaffold 服务的对象
- [[helm]] / [[kustomize]] —— 可选 deploy 后端
- [[argocd]] —— 可消费 `skaffold render` 输出

## 关联

- [[kubernetes]] —— 围绕 K8s 设计，离开 K8s 没意义
- [[helm]] —— 可作为 deploy 后端之一
- [[kustomize]] —— 同样可作为 deploy 后端
- [[argocd]] —— GitOps 工具，吃 render 输出的 YAML
- [[docker]] —— 默认 build 工具，可被 buildpacks/jib/ko 替换
- [[tilt]] —— 同类本地开发工具，UI 更重

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[tilt]] —— Tilt — K8s 微服务本地开发的"文件保存即上线"
