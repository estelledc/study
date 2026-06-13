---
title: "Forgejo 从 Gitea 分支出来——一个代码托管平台的社区自救故事"
来源: https://codeberg.org/forgejo/forgejo
日期: 2026-06-13
分类: 基础设施
子分类: DevOps 与运维
provenance: pipeline-v3
---

## 先讲一个日常类比

想象你开了一家社区面包店，大家都来买你的面包，帮你改配方、修烤箱。有一天，你发现来了一个新老板，他把你赶出门店，说"现在这家店归我了"，但你和所有帮忙的邻居根本没被提前问过。

你会怎么想？最合理的反应就是：我们这群真正干活的人，干脆自己另开一家面包店好了。

Forgejo 的故事就是这样一个"另开一家"的故事。只不过这家"面包店"不是卖面包的，而是帮程序员托管代码的。

## 它到底是什么

Forgejo 是一个用 Go 语言写的、自托管的代码托管平台。简单说，它让你在**自己的服务器上**搭一个类似 GitHub 的东西——你拥有全部数据，不需要把代码放到别人的服务器上。

它的代码仓库在 Codeberg（一个非营利代码托管平台）上：https://codeberg.org/forgejo/forgejo

当前最新版本已经到了 v15.x，有将近 500 万个 star 级别的关注度，800 多个 fork。

## 为什么会出现 Forgejo

在 2022 年之前，Gitea 是一个完全由社区驱动的开源项目。程序员们自愿贡献代码、修 bug、加功能，没人收钱。

但后来，Gitea 的维护权突然被一家新成立的公司 Gitea Ltd 接手了。社区的核心维护者发现，他们被排除在决策之外。他们尝试发公开信，没有回应。

于是，2022 年 12 月 15 日，前 Gitea 维护者和开源爱好者们宣布成立了 Forgejo 项目。他们的目标很明确：

1. 社区说了算——项目由社区治理，不为任何公司服务
2. 帮助开发者从商业闭源工具中解放出来

Codeberg e.V.（一个德国非营利组织）成为了 Forgejo 的托管方，确保这个项目永远保持自由开源。

## 核心概念

### 概念一：代码仓库（Repository）

一个仓库就是你放代码的地方，类似 GitHub 上的 repo。每个仓库可以包含多个分支（branch），每个分支是代码的一个"平行版本"。

### 概念二：拉取请求（Pull Request，简称 PR）

当你改完代码想合并回去时，你先创建一个 PR，让大家审核你的改动。审核通过了，才合并到主分支。

### 概念三：CI/CD（持续集成/持续部署）

Forgejo 内置了 Actions 系统。你可以写配置文件，让它在每次提交代码后自动运行测试、打包程序等。

### 概念四：ForgeFed（联邦化）

这是 Forgejo 独有的远期目标——让不同 Forgejo 实例之间能互相通信，类似 Matrix 或 ActivityPub 的生态。

## 代码示例

### 示例一：用 Docker Compose 搭建一个 Forgejo 实例

这和 Gitea 几乎一样，因为它们是兼容的。创建一个 `docker-compose.yml`：

```yaml
services:
  server:
    image: codeberg.org/forgejo/forgejo:15
    container_name: forgejo
    environment:
      - USER_UID=1000
      - USER_GID=1000
    restart: always
    volumes:
      - ./forgejo-data:/data
      - /etc/timezone:/etc/timezone:ro
      - /etc/localtime:/etc/localtime:ro
    ports:
      - "3000:3000"
      - "222:22"
```

解释：

- `image`: 使用 Forgejo 的官方镜像，`codeberg.org/forgejo/forgejo`
- `volumes`: `./forgejo-data:/data` 把容器内的数据目录挂载到本地，这样重启不丢数据
- `ports`: `3000:3000` 把容器的 3000 端口映射到主机，`222:22` 是 SSH 端口
- `USER_UID` 和 `USER_GID`: 确保容器内用户和主机文件权限一致

启动命令：

```bash
docker compose up -d
```

然后在浏览器打开 `http://localhost:3000` 就进入了安装向导。

### 示例二：配置 CI/CD 工作流（.forgejo/workflows/ci.yml）

Forgejo 的 Actions 系统基于 YAML 配置文件，放在 `.forgejo/workflows/` 目录下：

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Set up Go
        uses: actions/setup-go@v5
        with:
          go-version: '1.24'

      - name: Run tests
        run: go test -v ./...

      - name: Build
        run: go build -o myapp ./cmd/...
```

解释：

- `on`: 定义触发条件——每次推送到 main 分支或创建 PR 时自动运行
- `runs-on`: 在哪个环境跑测试，这里用了 GitHub 提供的 Ubuntu 虚拟机
- `steps`: 按顺序执行的步骤列表
- `uses`: 调用别人写好的 Action（类似积木一样拼起来）

### 示例三：自定义配置文件 app.ini

Forgejo 的配置文件在 `/data/forgejo/conf/app.ini`，关键部分：

```ini
[server]
APP_DATA_PATH    = /data/forgejo
HTTP_PORT        = 3000
ROOT_URL           = http://localhost:3000
DISABLE_SSH      = false
SSH_PORT         = 22
OFFLINE_MODE     = false

[database]
TYPE             = mysql
HOST             = db:3306
NAME             = forgejo
USER             = forgejo
PASSWD           = forgejo
```

解释：

- `[database]` 段可以选择 SQLite、MySQL 或 PostgreSQL
- 如果不想用外部数据库，可以改成：`TYPE = sqlite3`，就不需要单独的数据库服务了

## 从 Gitea 迁移到 Forgejo

好消息：因为它们共享同一个代码基因，迁移非常容易。Forgejo 官方提供了升级指南：

1. 备份你的 Gitea 数据目录
2. 把 Docker 镜像从 `gitea/gitea` 换成 `codeberg.org/forgejo/forgejo`
3. 重启——数据库会自动升级

数据库结构是完全兼容的。

## 版本与许可

- v8.0 及更早版本：MIT 许可
- v9.0 及之后：GPL v3+ 许可

选择 GPL v3 是为了防止类似 Gitea 的"被公司拿走"事件重演——GPL 要求任何基于此代码的衍生作品也必须开源。

## 一句话总结

Forgejo 是一群被"踢出门店"的面包师自己开的新店——用自由开源的方式，确保代码托管工具永远由社区掌控。
