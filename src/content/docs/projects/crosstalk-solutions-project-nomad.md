---
title: "Project N.O.M.A.D. —— 一台永不断网的离线知识生存电脑"
来源: https://github.com/Crosstalk-Solutions/project-nomad
日期: 2026-06-13
分类: 其他
子分类: 离线计算 / 知识基础设施
provenance: pipeline-v3
---

# Project N.O.M.A.D. 零基础学习笔记

## 一个日常类比

想象你正在开车穿越戈壁，突然手机没信号了，电脑也连不上网。这时候你打开随身携带的一个小箱子，里面竟然有维基百科全书、可汗学院的课程、一个能跟你对话的 AI 助手，甚至还有离线地图和笔记工具。

Project N.O.M.A.D.（全称：**N**ode for **O**ffline **M**edia, **A**rchives, and **D**ata）就是这样一个"箱子"——只不过它是一个可以部署在普通电脑上的服务器软件，把所有的知识工具打包在一起，**一旦安装就不需要互联网也能运行**。

它叫 "NOMAD"，游牧民族的意思——带着它，走到哪，知识库就到哪。

## 它到底是干什么的

N.O.M.A.D. 的核心思路很简单：**用一个"指挥中心"（Command Center）统一管理一堆独立工具**。每个工具都是独立运行的（技术上叫 Docker 容器），但 N.O.M.A.D. 帮你把所有安装、配置、更新的事情都搞定了。

你可以把它理解为一个"瑞士军刀"的服务器版本——不过这把刀上的每一把小工具都是功能强大的专业级应用。

## 核心概念

### 概念一：容器化编排（Container Orchestration）

N.O.M.A.D. 本身不直接提供维基百科或 AI 对话功能。它管理的是其他软件——比如 Kiwix（离线维基百科）、Ollama（本地 AI 模型）、Kolibri（在线教育平台）等。

这些软件被打包在 **Docker 容器**里运行。容器就像一个个独立的"小房间"，每个房间住着一个工具，互不干扰，又可以通过统一的门（Command Center）进入。

### 概念二：离线优先（Offline-First）

N.O.M.A.D. 的设计原则是：**安装时可能需要网络，装好之后永远不需要**。所有数据都存在本地硬盘上。没有内置的遥测（telemetry），不会把你使用时的任何数据上传到服务器。

### 概念三：Command Center 架构

N.O.M.A.D. 由两部分组成：

1. **Command Center** —— 管理界面，一个基于 Web 的控制台，运行在 `localhost:8080`。你可以在这里安装/卸载工具、管理内容、查看系统状态。
2. **服务应用** —— 各种独立工具，比如 AI 聊天、离线百科、教育平台等，各自运行在独立的容器里。

## 内置的工具箱

| 功能 | 使用什么技术 | 你能用它做什么 |
|------|------------|--------------|
| 离线资料库 | Kiwix | 访问离线维基百科、医学参考书、生存指南、电子书 |
| AI 助手 | Ollama + Qdrant | 和本地 AI 聊天，上传文档做语义搜索（RAG） |
| 教育平台 | Kolibri | 可汗学院课程，支持进度追踪和多用户 |
| 离线地图 | ProtoMaps | 下载区域地图，离线搜索和导航 |
| 数据工具 | CyberChef | 加密、编码、哈希计算、数据分析 |
| 笔记 | FlatNotes | 本地笔记，支持 Markdown |
| 系统评测 | 内置 | 给你的硬件打分数，还能上社区排行榜 |

## 代码示例

### 示例一：一键安装（终端命令）

N.O.M.A.D. 提供了非常简单的一键安装脚本。以下是在 Ubuntu（Debian 系统）上的安装命令：

```bash
sudo apt-get update && \
sudo apt-get install -y curl && \
curl -fsSL https://raw.githubusercontent.com/Crosstalk-Solutions/project-nomad/refs/heads/main/install/install_nomad.sh \
  -o install_nomad.sh && \
sudo bash install_nomad.sh
```

这段命令做了三件事：

1. `apt-get update` —— 更新系统软件包列表
2. `curl ...` —— 从 GitHub 下载 N.O.M.A.D. 的安装脚本
3. `sudo bash install_nomad.sh` —— 以管理员权限运行安装脚本

安装完成后，打开浏览器访问 `http://localhost:8080` 就能看到 N.O.M.A.D. 的管理界面了。

### 示例二：Docker Compose 自定义部署（进阶）

如果你想要更多控制（比如指定端口、自定义存储位置），可以用 Docker Compose 方式部署。先下载模板：

```yaml
# docker-compose.yml
services:
  nomad-command-center:
    image: crosstalksolutions/project-nomad:latest
    container_name: nomad-command-center
    ports:
      - "8080:8080"
    volumes:
      - ./nomad-data:/opt/project-nomad/data
      - /var/run/docker.sock:/var/run/docker.sock
    restart: unless-stopped
```

然后用这条命令启动：

```bash
docker compose up -d
```

这个配置文件做了这几件事：

- `ports: "8080:8080"` —— 把容器的 8080 端口映射到主机的 8080 端口，这样你才能在浏览器访问
- `volumes` —— 把容器里的数据持久化到主机上，容器重启后数据不会丢
- `restart: unless-stopped` —— 如果电脑重启，N.O.M.A.D. 会自动重新启动

### 示例三：常用维护命令

安装完成后，N.O.M.A.D. 会留下一组辅助脚本，放在 `/opt/project-nomad/` 目录下：

```bash
# 启动所有服务
sudo bash /opt/project-nomad/start_nomad.sh

# 停止所有服务
sudo bash /opt/project-nomad/stop_nomad.sh

# 更新 Command Center（不包含已安装的应用）
sudo bash /opt/project-nomad/update_nomad.sh

# 完全卸载（不可逆！）
curl -fsSL https://raw.githubusercontent.com/Crosstalk-Solutions/project-nomad/refs/heads/main/install/uninstall_nomad.sh \
  -o uninstall_nomad.sh && sudo bash uninstall_nomad.sh
```

## N.O.M.A.D. 的"灵魂"——AI 聊天功能

在所有工具中，最值得关注的是 **AI 聊天功能**。它由两部分组成：

- **Ollama** —— 在本地电脑上运行大语言模型（不需要联网），你可以选择不同大小的模型（比如 7B、13B、70B 参数）
- **Qdrant** —— 一个向量数据库，用来做语义搜索。简单说，就是你可以上传 PDF、文档，然后问 AI"关于 xxx 文档说了什么"，它能从你的文档里找到相关内容再回答（这就是 RAG 技术）

这意味着你有一个**完全私密的 AI 助手**——你的对话不会被传到云端，你的文档不会被上传到任何服务器。所有计算都在你自己的电脑上完成。

## 硬件要求

N.O.M.A.D. 本身非常轻量：

- **最低配置**：双核 CPU、4GB 内存、5GB 硬盘
- **推荐配置**（含 AI）：i7 或 R7、32GB 内存、NVIDIA RTX 3060 以上显卡、250GB SSD

如果你只想用离线百科和教育功能，最低配置就够了。但如果想跑 AI 模型，就需要更强的硬件（特别是显卡的显存要够大）。

## 安全注意事项

N.O.M.A.D. **默认没有用户认证**——任何能访问那个地址的人都能使用所有功能。所以：

- 只在本地访问（`localhost`）没问题
- 如果想让局域网其他设备也能访问，建议用防火墙控制端口
- **不要直接暴露到公网**

项目方表示未来可能会加入用户认证功能（比如家长控制、教室管理员等场景），但目前还没有排上优先级。

## 总结

N.O.M.A.D. 解决了两个核心问题：

1. **知识断供** —— 在网络不可靠或完全断网的地区，依然能获取高质量的教育资源和知识
2. **隐私保护** —— 所有数据本地运行，不上传任何信息

它就像一个知识版的"末日生存箱"，只不过这个"末日"可能只是出差时的飞机上，或者停电时的房间里。

**一行记住它**：N.O.M.A.D. 就是一台能装进电脑口袋的离线百科全书 + AI 助手 + 教育平台。

---

> **延伸思考**：N.O.M.A.D. 的"容器编排 + 离线优先"思路，其实可以借鉴到很多场景——比如野外医疗点的知识库、灾难应急指挥中心、甚至太空任务中的本地信息服务。它不只是个工具，更是一种"在任何地方都能获取知识"的基础设施哲学。
