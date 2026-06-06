---
title: Earthly — 把 Make 和 Dockerfile 揉一起的构建工具
来源: https://github.com/earthly/earthly
日期: 2026-05-31
子分类: 命令行工具
分类: CLI
难度: 中级
provenance: pipeline-v3
---

## 是什么

Earthly 是一套**用一份脚本同时描述"怎么构建"和"怎么打包"的工具**。它把 Makefile 的"目标（target）+ 依赖"思维和 Dockerfile 的"分层 + 隔离"机制揉成了一种新文件——叫 `Earthfile`。

日常类比：**以前构建像在自家厨房做饭**——食材摆哪、火候多大全靠各人手艺，换厨房就翻车。**Earthly 像把整个厨房搬进集装箱**——同样的灶、同样的锅、同样的火，到哪里做出来都一样。

最简单的体验，写一个 `Earthfile`：

```earthfile
VERSION 0.8
FROM node:20
WORKDIR /app

build:
  COPY package.json .
  RUN npm install
  COPY . .
  RUN npm run build
  SAVE ARTIFACT dist AS LOCAL ./dist
```

然后跑 `earthly +build`。它会启容器、装依赖、跑构建、把 `dist` 拷回你本机。**整个过程在隔离环境里完成，缓存自动管，下次只重跑变了的部分**。

## 为什么重要

不理解 Earthly 的设计哲学，下面这些事都没法解释：

- 为什么"在我这能跑、CI 上又挂了"这种老问题在用 Earthly 的项目里几乎绝迹——同一份 Earthfile，本地和 CI 跑的是相同的容器
- 为什么单仓库多语言项目（前端 + 后端 + 数据脚本）能用**一个**入口管理构建，而不是 npm + Makefile + GitHub Actions YAML 三套并行
- 为什么有人愿意从 Bazel 迁过来——Bazel 太重，学习成本巨大；Earthly 学习曲线像 Dockerfile，能解决 80% 问题
- 为什么"构建脚本"也能做到分钟级缓存——它直接复用 Docker BuildKit 的 layer cache 机制

简单说：**它是过去几年构建工具领域少有的"语法熟悉 + 缓存高效 + 跨 CI 可复现"三合一**。

## 核心要点

Earthly 的核心模型可以拆成 **三件事**：

1. **Target（目标）**：用 `target_name:` 声明一个构建步骤，类比 Makefile 的 target。可以用 `+build`、`+test`、`+docker` 引用，前缀的 `+` 是 Earthly 的命名约定。

2. **容器隔离 + 分层缓存**：每个 target 都在一个独立容器里跑，每条指令产生一层 layer。改了第 5 行不会让前 4 行重跑——这是从 Dockerfile 继承来的能力。

3. **SAVE 两种产物出口**：`SAVE ARTIFACT ... AS LOCAL` 把容器里的文件落到本机磁盘；`SAVE IMAGE myapp:latest` 落成一个 Docker 镜像。target 之间还能用 `FROM +other-target` 互相依赖。

简单说：**target 是图纸入口，容器是隔离厨房，SAVE 是出菜口**。

## 实践案例

### 案例 1：单 target 跑测试

```earthfile
VERSION 0.8
FROM python:3.12

test:
  COPY requirements.txt .
  RUN pip install -r requirements.txt
  COPY . .
  RUN pytest
```

跑 `earthly +test`。如果 `requirements.txt` 没变，`pip install` 这一层走缓存秒过；只有改了源码时 `pytest` 才重跑。**第一次慢、之后秒级**。

### 案例 2：多 target 串成一条流水线

```earthfile
VERSION 0.8
FROM node:20
WORKDIR /app

deps:
  COPY package.json package-lock.json .
  RUN npm ci

build:
  FROM +deps
  COPY . .
  RUN npm run build
  SAVE ARTIFACT dist AS LOCAL ./dist

docker:
  FROM +build
  CMD ["node", "dist/server.js"]
  SAVE IMAGE myapp:latest

all:
  BUILD +build
  BUILD +docker
```

逐部分解释：

- `deps` target 单独把"装依赖"切出来，方便复用
- `build` 用 `FROM +deps` 接上一步，省去重装
- `docker` 接 `+build`，把构建产物打成镜像
- `all` 用 `BUILD` 指令并行触发，一行命令完成所有

跑 `earthly +all`，前端 build + Docker 镜像一次产出。

### 案例 3：CI 里复用本地相同的 Earthfile

GitHub Actions 配置：

```yaml
- uses: earthly/actions-setup@v1
- run: earthly --ci +all
```

`--ci` 标志会强制清掉本地缓存、关交互输出。**关键是：开发者本机跑的命令和 CI 跑的命令一字不差**。

## 踩过的坑

1. **COPY 顺序错就毁缓存**：把 `COPY . .` 放在 `RUN npm install` 前面，每改一行代码都要重装依赖。最佳实践：先 COPY 依赖清单（package.json / requirements.txt），跑安装，再 COPY 全部源码——和 Dockerfile 同一个套路。

2. **SAVE ARTIFACT AS LOCAL 写错位置**：如果只在某个中间 target 写 SAVE，但你跑的是另一个 target，产物不会落到本机。规则：**只有被直接 BUILD 或 +target 触发的 SAVE 才生效**。

3. **BuildKit 没启**：Docker Desktop 默认开，但少数 Linux 老版本要手动 `export DOCKER_BUILDKIT=1`。报错通常是"unknown command FROM"或"BuildKit not enabled"。

4. **秘钥泄露到镜像层**：千万别 `COPY .env .` 或 `COPY id_rsa .`——这些会永久留在 layer 里。正确做法：`earthly --secret api_key=xxx +build`，target 里用 `RUN --secret api_key ...`。

## 适用 vs 不适用场景

**适用**：

- 单仓库多语言项目（前端 + 后端 + Python 脚本），希望一份脚本统一构建
- 想脱离"在我这能跑"魔咒，让本地构建 = CI 构建
- 已经在用 Docker + Makefile，但维护两套发现冗余
- 团队习惯 Dockerfile 语法，不想再学一种新 DSL

**不适用**：

- 极致增量构建场景（千万级代码行的单仓库）→ Bazel 的精确依赖图更合适
- 完全离线 / 无容器运行时的环境 → Earthly 必须有 Docker 或 Podman
- Windows 原生应用构建 → Earthly 主要面向 Linux 容器
- 简单到只有一两条命令的项目 → 直接 Makefile 或 npm script 即可，没必要上容器

## 历史小故事（可跳过）

- **2018 年**：Vlad A. Ionescu 在自己开发流程里反复被"本地能跑、CI 不能跑"困住，开始写一个把 Make 和 Docker 思路缝合的工具。
- **2020 年**：Earthly 在 Hacker News 公开发布，"Make + Dockerfile 的混血"这个定位直击痛点，社区迅速积累。
- **2021-2022 年**：Earthly Inc 推出 Cloud / Satellites 商业产品（远程缓存 + 远程构建机），融资数百万美元，工具被 Reddit、ClickHouse 等团队采用。
- **2024 年**：Earthly Cloud / Satellites 商业化未达预期，公司宣布关闭这两条产品线，回归开源核心，发布 v0.8 引入 WAIT/END 等新语法。
- **现在**：项目由社区 contributor 持续维护，开源核心保持稳定，是 Bazel / Make / Just 之外的一个中等学习成本选项。

从一个独立开发者的痛点到行业级工具，再到收缩聚焦——这是开源项目典型的成熟路径。

## 学到什么

1. **熟悉的语法是最好的入门** —— Earthly 没发明新 DSL，借了 Dockerfile 语法，让任何用过 Docker 的人 10 分钟能写出第一个 Earthfile
2. **缓存即性能** —— 每条指令一层、内容寻址、自动复用，是从 Docker BuildKit 学来的核心机制
3. **本地 = CI 是个强约束** —— 一旦做到这点，"环境差异"这类 bug 的根因被根除
4. **聚焦比扩张更长寿** —— 关掉商业产品、回归开源核心，反而让项目活了下来

## 延伸阅读

- 官方文档：[Earthly Documentation](https://docs.earthly.dev/)（先看 Basics 5 节）
- 创始人讲解：[Vlad Ionescu — Earthly Intro](https://www.youtube.com/results?search_query=earthly+ionescu)（30 分钟把设计哲学讲透）
- 与 Bazel 对比：[Earthly vs Bazel](https://earthly.dev/blog/bazel-vs-earthly/)（官方博客，但比较中肯）
- GitHub 仓库：[earthly/earthly](https://github.com/earthly/earthly)（issue 区可见社区活跃度）
- [[docker]] —— Earthly 的运行时底座；理解 Docker 镜像和 layer 后再读 Earthfile 一通百通
- [[github-actions]] —— Earthfile 在 GH Actions 里跑只需两行配置

## 关联

- [[docker]] —— Earthly 跑在 Docker / BuildKit 之上，每个 target 都是一个临时容器
- [[github-actions]] —— Earthly 最常被部署到 GH Actions 里，作为 CI 任务统一入口
- [[bazel]] —— 相同问题域的"重型选手"，精度更高但学习曲线更陡
- [[nix]] —— 另一条"可重复构建"路线，更纯粹但更难入门，Earthly 用容器做了 80% 的事
