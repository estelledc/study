---
title: Docker — 容器化平台
来源: https://github.com/docker/docker-ce
日期: 2026-05-29
分类: DevOps
难度: 中级
---

## 是什么

Docker 是一套**把应用和它的依赖打包成"集装箱"**的工具。只要目标机器支持对应的操作系统和 CPU 架构，就能用同一套镜像启动同一套环境；Mac / Windows 通常是通过一层 Linux 虚拟机来跑 Linux 容器。

日常类比：**以前部署像搬家**——你要把每件家具一件件搬到新房，到了发现插座不对、墙壁颜色不一样、空调装不上。**Docker 像搬集装箱**——家具一起进集装箱，整个箱子搬到新房，打开门就和老房一模一样。

最简单的体验，一行命令启动一个 Postgres 数据库：

```bash
docker run -e POSTGRES_PASSWORD=pass -p 5432:5432 postgres
```

不需要装 Postgres、不需要配置环境变量、不需要解决依赖冲突。Docker 从公共仓库（Docker Hub）拉一个镜像，启动一个容器，端口映射出来，就这么简单。

## 为什么重要

不理解 Docker 的设计哲学，下面这些事都没法解释：

- 为什么"应用打包"从天级变成了分钟级——以前一台新机器装环境一整天，现在 `docker run` 一行搞定
- 为什么 CI/CD 标准化了——开发、测试、生产环境跑的是同一个镜像，"在我这能跑"这句话彻底失效
- 为什么 Kubernetes 时代离不开 Docker 带火的镜像模型——K8s 调度的最小单元是 Pod，但 Pod 里跑的仍是容器镜像
- 为什么 Docker Hub 上 100k+ 镜像彻底改变了软件分发——从"下载安装包"变成"docker pull"

简单说：**这是过去十多年开发者工具最重要的一次范式转变**，把"环境配置"这个永恒头痛从开发者日常移除。

## 核心要点

Docker 的核心模型可以拆成 **三层**：

1. **Image（镜像）**：一个**不可变的文件系统快照**，包含应用代码、运行时、依赖库、配置。镜像是只读的，类比就是集装箱出厂时焊死的状态——任何时候打开都一样。

2. **Container（容器）**：镜像跑起来的**一个运行实例**。同一个镜像可以同时跑出多个容器（每个容器独立的 PID、网络、文件系统命名空间），类比就是从同一份集装箱图纸生产的多个集装箱。

3. **Dockerfile（构建脚本）**：告诉 Docker 怎么造镜像。用 `FROM` / `RUN` / `COPY` / `CMD` 等指令一步步堆叠，每条指令产生一层（layer），相同的层会复用缓存——这是 Docker 构建快的秘密。

简单说：**镜像是图纸，容器是从图纸造出来的成品，Dockerfile 是图纸的源代码**。

## 实践案例

### 案例 1：用 docker run 一行起一个 Postgres

```bash
docker run -e POSTGRES_PASSWORD=pass -p 5432:5432 postgres
```

逐部分解释：

- `docker run` —— 创建并启动容器
- `-e POSTGRES_PASSWORD=pass` —— 设置环境变量（postgres 镜像要求必须有密码）
- `-p 5432:5432` —— 把容器内的 5432 端口映射到宿主机 5432
- `postgres` —— 镜像名，没指定 tag 默认 `latest`，从 Docker Hub 拉取

跑起来之后，宿主机上 `psql -h localhost -U postgres` 就能连上，就像装了原生 Postgres 一样。

### 案例 2：写 Dockerfile 打包 Node.js 应用

```dockerfile
FROM node:20
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
CMD ["node", "index.js"]
```

逐行解释：

- `FROM node:20` —— 基于官方 Node.js 20 镜像（已经装好 node 和 npm）
- `WORKDIR /app` —— 后续指令都在容器内 `/app` 目录执行
- `COPY package.json package-lock.json ./` —— 先只拷依赖清单，让安装依赖这一层能被缓存
- `RUN npm ci` —— 按 lockfile 精确安装依赖，结果固化成一层
- `COPY . .` —— 再拷源码（源码改动不会触发重装依赖）
- `CMD ["node", "index.js"]` —— 容器启动时执行的命令

构建：`docker build -t myapp .`，运行：`docker run -p 3000:3000 myapp`。

### 案例 3：Docker Compose 编排多容器

实际项目通常需要多个服务联动（应用 + 数据库 + 缓存）：

```yaml
# docker-compose.yml
services:
  app:
    build: .
    ports: ["3000:3000"]
    depends_on: [db, cache]
  db:
    image: postgres
    environment:
      POSTGRES_PASSWORD: pass
    volumes:
      - dbdata:/var/lib/postgresql/data
  cache:
    image: redis
volumes:
  dbdata:
```

```bash
docker compose up -d
```

一行命令起三个容器，互相能通过服务名（`db`、`cache`）访问，volume 持久化数据。这就是开发环境的标准玩法。

## 踩过的坑

1. **镜像太大**：不分层、不删 cache、不用 `.dockerignore`，几个 GB 的镜像很常见。最佳实践：用 `node:20-alpine` 替代 `node:20`（300MB → 40MB），多阶段构建（builder + runner 分离），删除 `npm cache` 和 `apt-get` 临时文件。

2. **容器掉数据**：容器默认是临时的，`docker rm` 之后所有写入消失。数据库这种必须挂 volume（`-v dbdata:/var/lib/postgresql/data`），否则重启 = 删库。新人第一周必踩。

3. **Mac 上 Docker Desktop 慢**：Mac 用虚拟机跑 Linux 容器，文件 IO 性能损失严重（`docker compose up` 半分钟才起来）。社区方案：用 `colima` 或 `OrbStack` 替代 Docker Desktop，性能提升 2-3 倍，OrbStack 还免费给个人。

4. **安全：root user 运行容器**：默认容器内是 root 身份，如果容器逃逸（rare 但发生过）就是宿主机 root。最佳实践：Dockerfile 里加 `USER node`（或自建非 root 用户），生产环境必跑镜像漏洞扫描（Trivy / Snyk），别盲信 Docker Hub 上的镜像。

## 适用 vs 不适用场景

**适用**：
- 微服务部署（每个服务一个镜像，K8s 调度）
- 本地开发环境（一行起整套依赖：DB、Redis、Kafka）
- CI/CD 标准化（构建产物是镜像，"build once, run anywhere"）
- 软件分发（开源项目用 `docker run` 替代复杂安装文档）

**不适用**：
- 桌面 GUI 应用（容器化 GUI 很别扭，用 Electron / Tauri 更合适）
- 极致性能场景（容器有微小开销，HFT / 内核 bypass 场景用裸金属）
- Windows 原生应用（Docker 主要面向 Linux 容器，Windows 容器生态弱）
- 资源极度受限的嵌入式（容器运行时本身有几十 MB 开销）

## 历史小故事（可跳过）

- **2013 年**：Solomon Hykes 在 PyCon 上演示 Docker，5 分钟讲完——"Docker 是 Linux 容器的便携式运行时"。当晚社区炸了。
- **2014 年**：Docker Inc 成立，Docker Hub 上线，开始大规模商业化。
- **2017 年**：Kubernetes 在容器编排之战中击败 Docker Swarm，Docker 转型为"容器开发体验"工具，编排让位给 K8s。
- **2017-2019 年**：Docker 将 containerd 捐给 CNCF，随后 containerd 毕业，成为 Kubernetes 等系统常用的底层运行时。
- **2020 年以后**：Docker 自身更专注 Docker Desktop、Compose、BuildKit 等上层开发者体验。
- **2021 年**：Docker Desktop 对大企业（>250 员工或 >1000 万营收）收费，社区震动，OrbStack / Lima / colima 等替代品爆发。
- **2024 年**：Podman / OrbStack / Lima 成熟，Docker 不再是唯一选择，但 Dockerfile + 镜像格式仍是事实标准（OCI 规范）。

12 年从一个 PyCon demo 到改变整个软件行业的部署方式。

## 学到什么

1. **不可变基础设施是个好抽象**——镜像不可变带来确定性，"在我这能跑"问题被根除
2. **分层缓存是性能秘诀**——Dockerfile 每条指令一层，相同部分复用，构建从分钟级降到秒级
3. **生态比单点功能重要**——Docker Hub + Compose + 第三方编排让"容器"成为通用语言
4. **标准化让创新发生**——OCI 规范让 Docker 之外（Podman / containerd）也能跑同一份镜像

## 延伸阅读

- 官方文档：[Docker Documentation](https://docs.docker.com/)（先看 Get Started 的 12 节）
- 经典演讲：[Solomon Hykes 2013 PyCon Demo](https://www.youtube.com/watch?v=wW9CAH9nSLs)（5 分钟改变世界的那次）
- 实战书：[Docker Deep Dive by Nigel Poulton](https://nigelpoulton.com/books/)（300 页讲透 Docker 内核机制）
- 图解：[Docker curriculum](https://docker-curriculum.com/)（社区写的免费入门教程，从零到 Compose）
- [[kafka]] —— 跑 Kafka 集群最快的方式就是 Docker Compose
- [[postgresql]] —— 本地起 Postgres 一行 docker run

## 关联

- [[kafka]] —— Kafka 的本地开发环境几乎都是 Docker Compose 起的
- [[postgresql]] —— Postgres 官方镜像是 Docker Hub 下载量 Top 10
- [[redis]] —— Redis 也是 `docker run` 一行启动的典型代表

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[arrakis-2014]] —— Arrakis 2014 — 让操作系统退出数据路径
- [[lipp-meltdown-2018]] —— Meltdown — 从用户态读到内核内存的硬件漏洞
- [[mirage-2013]] —— MirageOS 2013 — 应用和内核合体成一个超轻虚拟机
- [[papers/shellcheck]] —— ShellCheck — 帮你抓 Bash 脚本里那些"半夜才发作"的坑
- [[act]] —— act — 在本地用 Docker 跑 GitHub Actions
- [[ansible]] —— Ansible — 无 agent 配置管理
- [[appflowy]] —— AppFlowy — Rust 写的开源 Notion
- [[appwrite]] —— Appwrite — 自己能装一遍的开源 Firebase
- [[besu]] —— Hyperledger Besu — 用 Java 写的以太坊客户端
- [[buildah]] —— Buildah — 不要守护进程，每次构建都是一个 fork 出来的小工
- [[buildkit]] —— BuildKit — Docker 下一代镜像构建后端
- [[buildroot]] —— Buildroot — 30 分钟从零搭出一个嵌入式 Linux
- [[caddy]] —— Caddy — 自动 HTTPS Web 服务器
- [[projects/clickhouse]] —— ClickHouse — 列式 OLAP 数据库
- [[code-server]] —— code-server — 浏览器里的 VS Code
- [[coder]] —— Coder — 自托管开发环境平台
- [[containerd]] —— containerd — Docker 和 Kubernetes 共用的那台容器运行机
- [[docker-compose]] —— Docker Compose — 一份 YAML 起一整套开发栈
- [[dovecot]] —— Dovecot — 主流 IMAP/POP3 服务器
- [[drone]] —— Drone CI — 容器原生的 YAML 流水线
- [[earthly]] —— Earthly — 把 Make 和 Dockerfile 揉一起的构建工具
- [[eclipse-che]] —— Eclipse Che — Kubernetes 原生云 IDE
- [[electron-builder]] —— electron-builder — Electron 打包发布事实标准
- [[ffmpeg]] —— FFmpeg — 几乎所有视频工具背后都藏着它
- [[flask]] —— Flask — 用装饰器把 URL 接到函数上的 Python 微框架
- [[freemodbus]] —— FreeModbus：嵌入式设备的 Modbus 从站协议栈
- [[github-actions]] —— GitHub Actions — 仓库自带的 CI/CD 流水线
- [[gitpod]] —— Gitpod — 预构建云开发环境
- [[homebrew]] —— Homebrew — macOS 上一行命令装好软件的包管理器
- [[imagemagick]] —— ImageMagick — 图像处理瑞士军刀
- [[jellyfin]] —— Jellyfin — 自托管媒体服务器
- [[kaniko]] —— kaniko — 在没有 Docker 的容器里也能构建 Docker 镜像
- [[kind]] —— kind — 用 Docker 容器当 K8s 节点的本地集群
- [[kubebuilder]] —— Kubebuilder — 写 K8s Operator 的官方脚手架
- [[kubernetes]] —— Kubernetes — 容器编排平台
- [[lazydocker]] —— lazydocker — Go 写的 Docker TUI，五面板看容器 / 镜像 / 网络 / 卷
- [[lima]] —— Lima — macOS 上跑 Linux 虚拟机的轻量 CLI
- [[minikube]] —— minikube — 一条命令在笔记本上起一个真 K8s 集群
- [[minio]] —— MinIO — S3 兼容对象存储
- [[moby]] —— Moby — Docker 把引擎拆开后的开源上游
- [[nerdctl]] —— nerdctl — containerd 官方的 Docker 兼容 CLI
- [[nethermind]] —— Nethermind — .NET 写的高性能以太坊客户端
- [[projects/nix]] —— Nix — 函数式声明式包管理与可重复构建
- [[nomad]] —— Nomad — HashiCorp 出的"轻量版 K8s"工作负载调度器
- [[openvscode-server]] —— OpenVSCode Server：把上游 VS Code 跑进浏览器
- [[openwrt]] —— OpenWrt — 把家用路由器变成 Linux 服务器
- [[operator-sdk]] —— Operator SDK — 写 K8s Operator 的"豪华套餐"版脚手架
- [[penpot]] —— Penpot — 开源自托管的 Figma 替代
- [[podman]] —— Podman — 无 daemon 容器引擎
- [[prometheus]] —— Prometheus — 时序监控系统
- [[quarkus]] —— Quarkus — 让 Java 启动比 Node 还快的云原生框架
- [[runc]] —— runc — Linux 容器最底层那个真正在 fork 进程的 CLI
- [[projects/shellcheck]] —— ShellCheck — shell 脚本的静态体检医生
- [[skaffold]] —— Skaffold — K8s 本地开发的 build-deploy 自动循环
- [[spin]] —— Spin — 用 WebAssembly 模块当 serverless handler 的开源框架
- [[terraform]] —— Terraform — 基础设施即代码
- [[traefik]] —— Traefik — 现代云原生反向代理
- [[trilium]] —— Trilium — 树形层级笔记系统
- [[wasmer]] —— Wasmer — 把 wasm 当成轻量容器到处跑
- [[wasmtime]] —— Wasmtime — Rust 实现的 WebAssembly 运行时
- [[woodpecker]] —— Woodpecker CI — Drone 闭源后社区接棒的轻量自托管 CI
- [[yocto-poky]] —— Yocto — 工业级定制嵌入式 Linux 的标准答案
