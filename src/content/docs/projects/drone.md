---
title: Drone CI — 容器原生的 YAML 流水线
来源: https://github.com/harness/drone
日期: 2026-05-31
子分类: DevOps 与运维
分类: 基础设施
难度: 中级
provenance: pipeline-v3
---

## 是什么

Drone 是一个**容器原生的 CI/CD 平台**：你写一个 YAML 文件描述流水线，每一步都在独立的 Docker 容器里跑完就丢。

日常类比：

- **传统 CI（早期 Jenkins）**像合租厨房：所有人共用一套锅碗瓢盆，A 用完没洗 B 接着用，串味、打架、互相污染。
- **Drone** 像外卖盒饭工厂：每道菜（每个 step）发一个一次性饭盒（容器），做完连饭盒一起扔，下一道菜全新饭盒重新来。环境绝不串味。

Drone 由 Brad Rydzewski 2014 年创建，是最早把"每一步都跑在容器里"这个设计落地的开源 CI；2020 年被 Harness 收购但承诺保持开源（Apache 2.0），2024 年仓库迁到 `harness/drone`。

## 为什么重要

不理解 Drone，下面这些事都不好解释：

- **容器原生 CI 范式的开创者**——2014 年 Drone 第一次把"每个 step 起一个容器"做成生产可用，后来 GitHub Actions / GitLab CI 都借鉴了这个模型
- **插件即容器**——别人写插件要打 jar 包、要 SDK，Drone 的插件就是一个**容器镜像 + 几个环境变量约定**，写一个 deploy 插件可以三行 Dockerfile 搞定
- **零环境污染**——你不用维护 agent 节点上装了什么 Node 版本、什么 Python 库，每次 build 拉镜像、跑完丢，干净得像无状态函数
- **单二进制 + 跨架构**——server 和 runner 都是一个 Go 二进制，x64/ARM/ARM64/Windows 都有，自托管极简

## 核心要点

Drone 的架构可以拆成 **三层**：

1. **Server（接 webhook + 调度）**：监听 git 仓库的 push / PR 事件，解析 `.drone.yml`，把 build 派给 runner。类比：调度中心。

2. **Runner（拉镜像 + 启容器）**：多种后端可选——Docker runner / Kubernetes runner / SSH runner / Exec runner。runner 按 step 顺序拉镜像、起容器、执行命令、收日志。类比：施工队。

3. **Plugin（容器化的可复用步骤）**：plugin 就是一个普通容器镜像，约定从 `PLUGIN_*` 环境变量读参数。一个 deploy plugin 可以被所有团队的 `.drone.yml` 调用，业务侧只写 `image: company/deploy`。类比：标准化外包件。

三层加起来：**git-as-config + 容器隔离 + 插件即镜像** = 容器时代 CI 的最简模型。

## 实践案例

### 案例 1：最小 .drone.yml

```yaml
kind: pipeline
type: docker
name: default

steps:
  - name: build
    image: golang:1.22
    commands:
      - go build ./...
      - go test ./...

  - name: deploy
    image: plugins/docker
    settings:
      repo: myorg/myapp
      tags: latest
```

**逐字段解读**：

- `kind: pipeline` + `type: docker` → 用 Docker runner 跑
- `steps` → 顺序执行；每个 step 一个容器一个 image
- `image: golang:1.22` → 直接拉官方 Go 镜像，用完即弃，agent 节点本身不需要装 Go
- `plugins/docker` → 调用现成 plugin 容器，靠 `settings:` 传参（被注入成 `PLUGIN_REPO`、`PLUGIN_TAGS`）

把这个文件提交到仓库根目录，Drone server 接到 webhook 自动跑。

### 案例 2：Kubernetes runner 临时 Pod

把 runner 配成 Kubernetes 模式后，每次 build 在临时 Pod 里跑，build 结束 Pod 销毁：

```yaml
kind: pipeline
type: kubernetes
name: k8s-build

steps:
  - name: test
    image: node:20
    commands:
      - npm ci
      - npm test
```

和 GitLab CI Kubernetes executor 思路一样：**0 个常驻 agent**，资源用完即还，特别适合潮汐型 CI 负载。

### 案例 3：自定义 deploy plugin

写一个内部 deploy plugin，所有团队复用：

```dockerfile
FROM alpine:3.19
RUN apk add --no-cache kubectl helm
COPY entrypoint.sh /entrypoint.sh
ENTRYPOINT ["/entrypoint.sh"]
```

`entrypoint.sh` 读 `$PLUGIN_CHART`、`$PLUGIN_NAMESPACE` 调 `helm upgrade`。各业务侧 `.drone.yml` 只需要：

```yaml
- name: deploy
  image: registry.local/deploy:v1
  settings:
    chart: ./charts/myapp
    namespace: prod
```

部署逻辑从 100 份 pipeline 里抽成一个镜像，升级只改一处。

## 踩过的坑

1. **冷启动 + 镜像拉取累计开销大**：每个 step 起一个容器，密集小步骤的 pipeline 比 GitHub Actions self-hosted runner（同进程跑多 step）慢。缓解：开 image cache（local registry mirror）+ 把 5 个相邻小 step 合成一个 step 共用容器。

2. **workspace 跨 stage 不共享**：step 间共享数据靠 workspace 卷（默认 `/drone/src`）。新人常忘了 workspace 是**同 stage 内**共享、**跨 stage 不共享**，导致 "build 阶段产物在 deploy 阶段找不到"。解法：用 `depends_on` 串到一个 stage 里，或挂外部 volume / 上传 artifact。

3. **plugin 写不当会泄漏 secret**：plugin 通过环境变量拿参数，写自定义 plugin 时把 secret `echo` 出来调试会泄漏到日志。一定要用 `from_secret:` 引用 + plugin 内部不打印敏感变量。

4. **v0.x 与 v1.x YAML 不兼容**：Harness 收购后产品线迁移，`drone/drone` 仓库已 archive 提示用 `harness/drone`（同代码、新名字）。但社区文档/教程很多还指向旧 URL，搜出来的方案常是过期 syntax，新 v1.x YAML 顶层多了 `kind: pipeline`，老教程拷过来直接报错。

## 适用 vs 不适用场景

**适用**：

- 自托管 CI、不愿把代码送出公司内网
- 已经全容器化的工程团队，本来就有 Docker registry + K8s
- 想写一次插件全公司复用（plugin = 容器镜像，门槛极低）
- 异构架构构建（ARM 设备、嵌入式镜像）——Drone server/runner 跨架构

**不适用**：

- 公开开源项目：直接 GitHub Actions 免费 runner 更省心
- pipeline 极密集的小 step（毫秒级）：容器冷启动会主导耗时，换 GitHub Actions 同进程模型
- 没人懂 Docker/容器：Drone 一切建立在容器之上，不会容器寸步难行
- 需要复杂 UI 配置而不是 git-as-config：Drone Web UI 极简，配置完全靠 `.drone.yml`

## 历史小故事（可跳过）

- **2014 年**：Brad Rydzewski 启动 Drone，把"每步跑一个容器"作为核心设计，时间点比 GitLab CI 的 docker executor 还早。
- **2017 年**：Drone v0.8 大热，成为容器原生 CI 的代名词，单二进制部署吸引大量自托管用户。
- **2019 年**：v1.0 发布，YAML 重写不兼容 v0.x，社区一片混乱（很多老教程到今天还停在 v0.8）。
- **2020 年**：被 Harness 收购，承诺保持开源。
- **2024 年**：仓库迁到 `harness/drone`，与 Harness Open Source 平台融合演进，Drone 名字依然保留作为开源版本。

## 学到什么

1. **容器隔离是 CI 的最优解之一**——环境污染、依赖漂移这些 Jenkins 时代的顽疾，Drone 用"每步一容器"几乎一刀切干净
2. **约定优于配置**——plugin 不发明 SDK，就一个容器 + `PLUGIN_*` 环境变量约定，门槛低到爆，生态自然起来
3. **git-as-config 的力量**——pipeline 文件进仓库、跟代码一起 review、一起回滚，是后来 GitHub Actions / GitLab CI 都遵循的范式
4. **被收购 ≠ 死亡**——Harness 没有把 Drone 闭源，反而让它继续演进；技术选型时不要一看到"被收购"就慌，要看协议和承诺

## 延伸阅读

- 官方文档：[docs.drone.io](https://docs.drone.io/)（v1.x YAML 语法 + runner 配置都在这）
- 仓库新地址：[harness/drone](https://github.com/harness/drone)（旧 `drone/drone` 已 archive）
- Plugin 市场：[plugins.drone.io](https://plugins.drone.io/)（200+ 现成 plugin）
- 容器原生 CI 综述：[CNCF CI/CD Landscape](https://landscape.cncf.io/?group=projects-and-products&view-mode=card#app-definition-and-development--continuous-integration-delivery)

## 关联

- [[github-actions]] —— 后来者，借鉴了 Drone 的 pipeline-as-container 思路，但默认跑公有 runner
- [[actions-runner-controller]] —— GitHub Actions 的 K8s self-hosted runner，与 Drone Kubernetes runner 思路对齐
- [[kubernetes]] —— Drone Kubernetes runner 的依赖底座
- [[docker]] —— Drone 默认 runner 直接调 Docker daemon 起容器
- [[podman]] —— 无 daemon 容器引擎，社区在跑 Drone + Podman 替代 Docker
- [[helm]] —— 自定义 deploy plugin 内常调 `helm upgrade`
- [[terraform]] —— Drone 流水线触发 `terraform apply` 也是常见模式
- [[earthly]] —— 另一个容器化构建工具，定位偏构建本身，与 Drone 的 CI 调度互补

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[dagger]] —— Dagger — 用真正的编程语言写 CI pipeline
- [[helm]] —— Helm — Kubernetes 包管理器
- [[kubernetes]] —— Kubernetes — 容器编排平台
- [[tekton]] —— Tekton — 把 CI/CD 流水线当成 K8s 资源来声明
- [[woodpecker]] —— Woodpecker CI — Drone 闭源后社区接棒的轻量自托管 CI

