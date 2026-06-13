---
title: Project N.O.M.A.D. 离线知识服务器
来源: https://github.com/Crosstalk-Solutions/project-nomad
日期: 2026-06-13
分类: 操作系统
子分类: 嵌入式与 IoT
provenance: pipeline-v3
---

# Project N.O.M.A.D. 零基础学习笔记

## 一个类比：数字时代的"诺亚方舟"

想象一下，如果世界末日来了，互联网断了，电力还在，你有一台电脑——你能在这台电脑上保留什么知识？

传统做法是把 PDF 堆满硬盘。但 N.O.M.A.D. 做的是更聪明的事情：它把整座城市装进一个箱子里。维基百科、可汗学院的课程、离线地图、AI 聊天助手、加密工具、笔记系统……全部打包在一起，拔掉网线也能用。

N.O.M.A.D. 的全称是 **Node for Offline Media, Archives, and Data**。它本质上是一个"离线生存计算机"的操作系统。

## 核心概念一：容器化编排——像搭乐高

N.O.M.A.D. 的核心思想很朴素：**不要把一切写死在一个程序里，而是让每个功能都是一个独立的"积木"（容器），由一个中央控制器来管理。**

这个中央控制器叫 **Command Center**（指挥中心）。你打开浏览器访问 `localhost:8080`，看到的不是某个单一功能，而是一个仪表盘——它告诉你：哪些积木装好了，哪些还没装，哪个积木需要更新。

每块"积木"都是一个 Docker 容器：

```
┌─────────────────────────────────────────────────┐
│              Command Center (UI + API)            │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐  │
│  │Kiwix │ │Ollama│ │Kolibri│ │Proto│ │Cyber │  │
│  │WIKI  │ │+Qdrant│ │Learn │ │Maps │ │Chef  │  │
│  └──────┘ └──────┘ └──────┘ └──────┘ └──────┘  │
└─────────────────────────────────────────────────┘
         ↑ 全部由 Docker 管理，互相隔离
```

为什么要用容器而不是把所有东西装在一个系统里？

1. **隔离**：Wikipedia 服务崩了不会影响 AI 聊天
2. **替换**：想把 Ollama 换成别的 AI 后端？换容器就行
3. **干净卸载**：想全部删掉？一条命令的事

## 核心概念二：离线优先（Offline-First）

N.O.M.A.D. 的设计哲学是：**默认情况下，它应该能在完全断网的环境中运行。**

安装时需要网络（因为要下载所有东西），但一旦装好，拔网线——一切照常。这跟普通的云服务完全相反。

实现方式很简单：

- Wikipedia 不是在线访问，而是预下载 ZIM 格式文件（Kiwix 引擎）
- 课程不是串流播放，而是本地存储（Kolibri）
- AI 模型不是调用云端 API，而是运行在你自己的 GPU 上（Ollama）

## 核心概念三：RAG——让 AI "查资料后回答"

N.O.M.A.D. 的 AI 聊天功能有一个特别的设计：它不是让 AI 凭记忆回答，而是先**搜索你上传的文档，再基于搜索结果生成答案**。这个技术叫 **RAG（Retrieval-Augmented Generation，检索增强生成）**。

用日常类比来说：

> 传统 AI 聊天 = 让一个学生闭卷考试（只靠训练时背的知识）
> N.O.M.A.D. 的 RAG = 让一个学生开卷考试（可以先查你的笔记，再作答）

它的底层工具链是：
- **Ollama**：本地运行大语言模型（比如 Llama、Mistral）
- **Qdrant**：向量数据库，负责把文档切碎、变成向量、然后快速搜索

## 代码示例

### 示例一：一键安装脚本

N.O.M.A.D. 提供了一条命令完成全部安装。理解每一行的作用：

```bash
sudo apt-get update && \
sudo apt-get install -y curl && \
curl -fsSL https://raw.githubusercontent.com/Crosstalk-Solutions/project-nomad/refs/heads/main/install/install_nomad.sh \
  -o install_nomad.sh && \
sudo bash install_nomad.sh
```

拆解：
1. `apt-get update` — 更新软件包列表（告诉系统"有什么新东西可以装"）
2. `apt-get install -y curl` — 安装 curl 工具（用来下载文件）
3. `curl -fsSL ...` — 从 GitHub 下载安装脚本，`-f` 失败时不显示 HTML 错误页，`-s` 静默模式，`-S` 出错时仍显示错误，`-L` 跟随重定向
4. `sudo bash install_nomad.sh` — 以管理员权限运行安装脚本

安装脚本内部会自动做这些事：
- 检查系统是否满足要求（Docker、磁盘空间等）
- 拉取所有需要的 Docker 镜像
- 生成 `docker-compose.yml` 配置文件
- 启动所有服务

### 示例二：Docker Compose 编排——指挥中心的配置文件

N.O.M.A.D. 高级安装方式的核心是 `docker-compose.yml`。这个文件告诉 Docker："请按照下面的配置启动一堆容器"。

简化版的结构如下：

```yaml
services:
  nomad-command-center:
    image: crosstalksolutions/project-nomad:latest
    ports:
      - "8080:8080"
    volumes:
      - ./data:/app/data
    depends_on:
      - nomad-mysql
      - nomad-ollama
      - nomad-kiwix
      - nomad-kolibri

  nomad-mysql:
    image: mysql:8
    volumes:
      - mysql_data:/var/lib/mysql

  nomad-ollama:
    image: ollama/ollama
    volumes:
      - ollama_data:/root/.ollama
    # AI 模型会存储在这里

  nomad-kiwix:
    image: ghcr.io/kiwix/kiwix-serve:latest
    volumes:
      - kiwix_data:/data
```

关键概念解释：

- **services**：定义要运行的每个容器（相当于"积木块"的配方）
- **image**：容器的"模板"，告诉 Docker 用哪个镜像来创建容器
- **ports**：端口映射。`8080:8080` 表示把容器内的 8080 端口暴露到宿主机的 8080 端口
- **volumes**：数据卷，让容器重启后数据不丢失
- **depends_on**：启动顺序，确保数据库先于应用启动

启动命令：
```bash
docker compose up -d
```
`-d` 表示"后台运行"（detach），这样终端不会卡在这个进程上。

### 示例三：日常管理脚本

N.O.M.A.D. 安装后在 `/opt/project-nomad/` 下放了几个 helper 脚本：

```bash
# 启动所有服务
sudo bash /opt/project-nomad/start_nomad.sh

# 停止所有服务
sudo bash /opt/project-nomad/stop_nomad.sh

# 更新指挥中心本身（不含已安装的应用）
sudo bash /opt/project-nomad/update_nomad.sh
```

这些脚本本质上是 `docker compose up` 和 `docker compose down` 的封装，让不需要懂 Docker 的用户也能管理整个系统。

## N.O.M.A.D. 内置工具全景

| 工具 | 用途 | 底层引擎 |
|------|------|---------|
| 信息图书馆 | 离线阅读 Wikipedia、医学文献、电子书 | Kiwix |
| AI 助手 | 本地聊天、上传文档后问答 | Ollama + Qdrant |
| 教育平台 | 可汗学院课程、学习进度追踪 | Kolibri |
| 离线地图 | 下载区域地图、搜索和导航 | ProtoMaps |
| 数据工具 | 加密、编码、哈希分析 | CyberChef |
| 笔记系统 | 本地 Markdown 笔记 | FlatNotes |
| 系统基准测试 | 硬件评分、社区排行榜 | 自建 |

## 硬件需求：为什么它"反其道而行"

大多数离线系统追求"能在树莓派上跑"。N.O.M.A.D. 恰好相反——它的目标是**充分利用硬件**。

因为：
- AI 模型需要大量 GPU 显存（推荐 RTX 3060+）
- 离线百科和课程需要大量存储空间（推荐 250GB+ SSD）
- 向量数据库搜索需要较多内存（推荐 32GB RAM）

最小配置（只跑指挥中心本身）：
- CPU: 双核 2GHz
- RAM: 4GB
- 存储: 5GB

这个设计取向说明 N.O.M.A.D. 的定位不是"应急手摇发电机"，而是"高性能离线知识中心"——适合偏远地区学校、研究站、灾区指挥中心等场景。

## 隐私与安全

N.O.M.A.D. 的设计原则是：**零遥测、零数据外传**。安装后不会发送任何使用数据给作者。

它检测网络连通性的方式也很特别——向 Cloudflare 的 `1.1.1.1/cdn-cgi/trace` 发一个请求，如果成功响应就说明有网络。这个选择很"极客"：Cloudflare 的 CDN 边缘节点全球分布，连通性检测最可靠。

安全方面的坦诚声明：N.O.M.A.D. **默认没有用户认证**。项目团队认为这不是优先级问题，而是设计取舍——为了降低使用门槛，先不加认证。如果多人使用同一台设备，建议通过防火墙控制端口暴露。

## 我的理解

N.O.M.A.D. 最打动我的地方在于它的**"离线优先"不是噱头，而是架构起点**。

很多项目说"支持离线"，实际上是"在线优先，离线是事后补的"。N.O.M.A.D. 从第一天就假设：网络可能不存在。所以它的所有工具（Wikipedia、AI、地图、课程）都设计为完整存储在本地。

这种思维方式值得借鉴：**在做任何系统设计时，先问"如果最坏的情况发生，这个系统还能工作吗？"** 而不是"如果一切正常，这个系统能做多好。"

## 下一步学习方向

1. 了解 Docker Compose 的基础语法——理解 N.O.M.A.D. 的编排配置
2. 了解 Ollama 的基本用法——理解 N.O.M.A.D. 的 AI 功能
3. 了解向量数据库的概念——理解 Qdrant 在 RAG 中的作用
4. 尝试在本地用 Docker Compose 跑一个简单的服务——动手体验容器编排
