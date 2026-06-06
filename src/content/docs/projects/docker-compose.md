---
title: Docker Compose — 一份 YAML 起一整套开发栈
来源: https://github.com/docker/compose
日期: 2026-06-01
子分类: DevOps 与运维
分类: 基础设施
难度: 入门
provenance: pipeline-v3
---

## 是什么

Docker Compose 是一套**用一份 YAML 文件描述一组容器要怎么一起跑**的工具。一行 `docker compose up` 就能把应用、数据库、缓存、消息队列同时拉起来，且各自能通过服务名互相找到。

日常类比：**单容器 docker run 像点单菜**——你想吃米饭，下一行命令；想加汤，再下一行；命令越来越长，参数记不住。**Compose 像点套餐**——服务员手里有一张"套餐配方"（compose.yaml），上面写好了"米饭一份、汤一份、配菜两份，按这个顺序上"，你只说"我要这个套餐"，剩下交给厨房。

最简单的体验：

```yaml
# compose.yaml
services:
  app:
    image: node:20
    command: node index.js
  db:
    image: postgres
    environment:
      POSTGRES_PASSWORD: pass
```

```bash
docker compose up -d
```

两个容器同时启动，`app` 容器里写 `db:5432` 就能连数据库——服务名直接当 hostname 用。

## 为什么重要

不理解 Compose，下面这些事都没法解释：

- 为什么开源项目 README 第一段就是 `docker compose up`——这是当下最快"5 分钟把一个项目跑起来"的标准
- 为什么本地开发栈不再是"装 7 个服务"的痛苦清单——一份 YAML 就能描述完整的依赖图
- 为什么 CI 测试集成场景能在 1 分钟内拉起 Postgres+Redis+Kafka 跑 e2e——Compose 让"一次性环境"成本接近零
- 为什么 Kubernetes YAML 看起来像 Compose 的远房表亲——两者都是声明式编排，Compose 是单机版的极简表达

简单说：**Compose 把"多容器"从一组散乱的 docker run 变成一个可版本控制、可分享、可复现的配置单元**。

## 核心要点

Compose 的模型可以拆成 **三个对象**：

1. **Service（服务）**：一个容器配置的描述，包括用什么镜像、暴露哪些端口、挂什么 volume、依赖谁。一个 service 默认起一个容器（也可以 scale 出多个）。

2. **Network（网络）**：Compose 默认会建一个叫 `<project>_default` 的桥接网络，所有 service 自动加入；service 名直接是 DNS 名。需要隔离时可以声明多个 network 把 service 划到不同子网。

3. **Volume（数据卷）**：持久化数据的命名存储。`db` 服务挂 `dbdata:/var/lib/postgresql/data`，容器删了数据还在，下次 `compose up` 还能接着用。

简单说：**service 是要跑什么、network 是怎么互通、volume 是数据放哪**。三者都在一份 YAML 里写完。

## 实践案例

### 案例 1：本地起一个 Web + DB + Cache 栈

```yaml
services:
  app:
    build: .
    ports: ["3000:3000"]
    environment:
      DATABASE_URL: postgres://postgres:pass@db:5432/app
      REDIS_URL: redis://cache:6379
    depends_on:
      db:
        condition: service_healthy
      cache:
        condition: service_started
  db:
    image: postgres:16
    environment:
      POSTGRES_PASSWORD: pass
      POSTGRES_DB: app
    volumes:
      - dbdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD", "pg_isready", "-U", "postgres"]
      interval: 5s
  cache:
    image: redis:7
volumes:
  dbdata:
```

`docker compose up -d` 之后：app 等 db 健康检查通过才启动，避免应用比数据库先起来连接失败。这是 Compose 比"起 3 个 docker run"明显更省心的地方。

### 案例 2：用 profile 切换开发与测试

```yaml
services:
  app:
    image: myapp
  test:
    image: myapp
    command: npm test
    profiles: ["test"]
```

默认 `compose up` 只起 `app`；`compose --profile test up` 才启用 `test`。日常跑应用、临时跑测试不冲突。

### 案例 3：override 文件覆盖默认配置

`compose.yaml` 写生产配置，`compose.override.yaml` 写本地特殊配置（端口映射、源码挂载、调试日志），Compose 自动合并。生产环境用 `-f compose.yaml -f compose.prod.yaml` 显式指定。

```yaml
# compose.override.yaml（自动生效，本地用）
services:
  app:
    volumes:
      - ./src:/app/src
    environment:
      DEBUG: "*"
```

源码挂进容器，改完不用重新 build，热重载直接生效。

## 踩过的坑

1. **depends_on 默认不等健康**：只等容器启动（process started），不等服务就绪（accepting connections）。Postgres 容器启动到能接连接有 1-3 秒空窗，应用先冲过去就报"connection refused"。修法：加 `healthcheck` + `condition: service_healthy`（如案例 1）。

2. **volume 数据持久化在主机里没注意路径**：命名 volume 存在 `/var/lib/docker/volumes/`，新人以为 `compose down` 会清掉数据，结果跑了几个月后磁盘满。`compose down -v` 才删 volume；定期检查 `docker system df`。

3. **网络名带项目前缀，跨 compose 文件互通要显式 external**：A 项目的 db 想被 B 项目访问，B 必须 `networks: [external: true, name: a_default]`，光写 `networks: [default]` 是隔离的。这是 Compose 的隐式作用域规则，文档里很容易漏。

4. **docker-compose（v1，Python）和 docker compose（v2，Go 插件）行为不一致**：v1 早已停止维护，但很多老 README 还在用 `docker-compose up`。v2 字段更严格（比如 `version: '3'` 现在是 deprecated），CI 环境装 v1 会和本地 v2 行为分裂。统一升 v2。

## 适用 vs 不适用场景

**适用**：
- 本地开发栈（一份 YAML 起完整依赖图，新人 onboarding 5 分钟）
- CI 集成测试（pull request 起一次性环境跑 e2e，结束销毁）
- 单机部署小项目（一台 VPS 跑博客 + 数据库 + 反代，Compose 比 K8s 轻 100 倍）
- demo 与教学（开源项目 README 第一行就是 `docker compose up`）

**不适用**：
- 多机集群编排（Compose 是单机的，跨机器要 Swarm 或 Kubernetes）
- 自动扩缩容（没有 HPA、没有调度器，scale 是手动的）
- 滚动升级 / 金丝雀发布（Compose 重启服务会短暂中断，生产要 K8s）
- 复杂资源配额（CPU/内存限制可写，但调度策略远不如 K8s 完整）

## 历史小故事（可跳过）

- **2014 年**：英国创业公司 Orchard Labs 发布 Fig，第一个把"多容器开发栈"写成 YAML 的工具。当年 Docker 自己只有 `docker run`。
- **2014 年 7 月**：Docker 收购 Orchard，Fig 改名 Docker Compose，成为官方工具。
- **2015-2020 年**：Compose v1 是 Python 写的独立 CLI（`docker-compose`），通过 Docker API 控制容器；版本字段（`version: '2'`/`'3'`）频繁变动让人头大。
- **2020 年**：Docker、AWS、Microsoft 共同提出 [Compose Specification](https://compose-spec.io/)，把 Compose 文件格式从 Docker 内部规范升级为开放标准，第三方运行时（Podman、Nerdctl、ECS）都能跑同一份 YAML。
- **2021 年**：Compose v2 用 Go 重写，成为 `docker compose`（Docker CLI 子命令），与 v1 字段大体兼容但更严格。
- **2023 年**：Compose v1 正式 EOL，所有官方文档统一用 `docker compose`（中间空格）。
- **2024 年**：Compose 加入 `watch` 模式（自动监听源码变更并 sync/rebuild），把"开发回路"做到极致。

10 年从一个英国小工具到 OCI 生态里"多容器声明式"的事实标准。

## 学到什么

1. **声明式比命令式可分享**——一份 YAML 替代一串 docker run，能 commit、能 review、能 diff
2. **服务名即 DNS** 是个简洁抽象——容器之间不用记 IP、不用配 hosts，写代码像本地端口
3. **健康检查是分布式启动的前置条件**——任何"先起 A 再起 B"的依赖都要靠 healthcheck，不是 sleep
4. **从工具到规范** 是项目成熟的必经路——Compose Specification 让 Docker 之外的运行时也能复用，生态因此变大

## 延伸阅读

- 官方文档：[Docker Compose Overview](https://docs.docker.com/compose/)（先看 Get Started 的 6 节）
- 规范：[Compose Specification](https://compose-spec.io/)（YAML 字段权威定义）
- 实战：[Awesome Compose](https://github.com/docker/awesome-compose)（官方维护的 100+ 真实场景示例）
- watch 模式：[Compose Watch](https://docs.docker.com/compose/file-watch/)（开发时自动同步源码）
- [[docker]] —— Compose 的底座，先理解镜像/容器/Dockerfile 再看 Compose
- [[kubernetes]] —— 多机版的"声明式编排"，Compose 是它的单机精简表亲

## 关联

- [[docker]] —— Compose 是 Docker 的官方多容器编排工具，YAML 一份起整套栈
- [[kubernetes]] —— K8s 的 Pod/Service/Volume 概念能在 Compose 里找到雏形
- [[nginx]] —— Compose 里加一个 nginx 服务做反代是最常见模式
- [[airflow]] —— Airflow 官方推荐的本地开发方式就是 Compose 起 webserver+scheduler+postgres
