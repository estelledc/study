---
title: AiToEarn — 让 AI 帮你写内容、发平台、赚佣金
来源: https://github.com/yikart/AiToEarn
日期: 2026-06-13
分类_原始: 开源项目
分类: 其他
子分类: 工程文化
provenance: pipeline-v3
---

## 一句话概括

AiToEarn 是一个开源平台，用 AI 智能体帮你写内容、发到十几个社交平台、互动运营，最后把内容变成收入。

## 日常类比：AI 就是你的全能小编

想象你开了一家小店，想在网上打广告。传统做法是：自己想文案、拍照片、发抖音、回评论、算收入——每个环节都要亲力亲为。

AiToEarn 做的事情，就是雇了一个"全能小编"：

- 你告诉小编"帮我推广一款咖啡机"
- 小编自动写文案、配图、生成视频
- 自动发到抖音、小红书、TikTok、YouTube 等平台
- 自动回复评论区的问题
- 最后按效果收钱（有人买了就分佣金）

一个人，就是一支队伍。所以它的口号叫 **"OPC（一人公司）的 AI 内容营销智能体"**。

## 四个核心 Agent

AiToEarn 围绕内容变现的完整链路，提供了四种能力，简称 **Monetize · Publish · Engage · Create**。

### 1. Monetize（变现）—— 赚钱

这是最核心的目标。创作者在平台上完成商家发布的推广任务，有三种结算方式：

- **CPS**（Cost Per Sale）：有人通过你的内容下单，你拿提成
- **CPE**（Cost Per Engagement）：点赞评论越多，赚得越多
- **CPM**（Cost Per Mille）：按播放量结算，一万次播放一份钱

### 2. Publish（发布）—— 一键分发

一个按钮，把内容同时发到 14 个平台：抖音、快手、B站、小红书、视频号、TikTok、YouTube、Facebook、Instagram、Threads、X、Pinterest、LinkedIn……还支持日历排期，提前安排好每天发什么。

### 3. Engage（互动）—— 自动运营

通过浏览器插件，自动做三件事：

- 自动点赞、收藏、关注
- 用 AI 智能回复每一条评论
- 识别"求链接""怎么买"这类高转化信号，第一时间回应

### 4. Create（创作）—— AI 生产内容

你只需用自然语言描述需求，AI 自动完成：

- 视频：调用 Grok、Veo、Seedance 等模型生成视频，自动翻译、剪辑
- 图文：调用 Nano Banana 等图片模型生成配图
- 批量：同时生成几十条内容，适合矩阵账号运营

## 技术栈速览

| 层级 | 技术 |
|------|------|
| 前端 | Next.js（Web 端）+ Electron（桌面客户端） |
| 后端 | NestJS（monorepo，用 Nx 管理） |
| 数据库 | MongoDB（副本集） |
| 缓存 | Redis |
| 对象存储 | RustFS |
| 通信协议 | MCP（Model Context Protocol）+ SSE |
| 部署 | Docker Compose 一键启动 |
| 运行时 | Node.js 20.18.x，包管理器 pnpm |

## 怎么用？五种方式

### 方式一：直接用网页（最简单）

打开 [aitoearn.cn](https://aitoearn.cn/)（国内）或 [aitoearn.ai](https://aitoearn.ai/)（国际），注册就能用。不需要装任何东西。

### 方式二：在 Claude / Cursor 里用（MCP 协议）

这是 AiToEarn 最有意思的地方——它支持 MCP 协议，意味着任何支持 MCP 的 AI 助手都能直接调用它的能力。

配置 Claude Desktop，只需要在配置文件里加几行：

```json
{
  "mcpServers": {
    "aitoearn": {
      "type": "http",
      "url": "https://aitoearn.ai/api/unified/mcp",
      "headers": {
        "x-api-key": "你的API-Key"
      }
    }
  }
}
```

配置好后，你就可以在 Claude 对话框里说"帮我写一条小红书的推广文案"，Claude 就会通过 MCP 协议调用 AiToEarn 的能力来完成任务。

### 方式三：Docker 私有部署

适合想自己控制的团队：

```bash
git clone https://github.com/yikart/AiToEarn.git
cd AiToEarn
docker compose up -d
```

然后打开 http://localhost:8080 就能用了。

## 关键概念：什么是 MCP 协议？

MCP（Model Context Protocol）是 Anthropic 提出的一种标准协议，让 AI 大模型能像"装插件"一样连接外部工具。

类比：你的大脑是 AI 模型，MCP 就像 USB 接口。AiToEarn 做了一个"USB 设备"插上去，AI 就能直接帮你在社交平台上发内容、赚钱了。

这就是为什么 AiToEarn 能在 Claude、Cursor、OpenClaw 等各种工具里通用——它们都支持同一个"USB 标准"。

## 代码示例

### 示例一：Docker 一键部署

这是最快速的本地体验方式。`docker-compose.yml` 定义了整个系统的容器编排：

```yaml
services:
  mongodb:
    image: mongo:latest
    container_name: aitoearn-mongodb
    restart: unless-stopped
    environment:
      MONGO_INITDB_ROOT_USERNAME: admin
      MONGO_INITDB_ROOT_PASSWORD: password
    ports:
      - "27017:27017"

  redis:
    image: redis:latest
    container_name: aitoearn-redis
    restart: unless-stopped
    command: redis-server --requirepass password
    ports:
      - "6379:6379"
```

这里启动了 MongoDB 和 Redis 两个基础服务。MongoDB 存用户和内容数据，Redis 做缓存加速。`docker compose up -d` 会把所有服务一次性拉起。

### 示例二：在源码中配置后端服务

如果你想深入看代码，后端用的是 NestJS 框架（一个 Node.js 的企业级框架），采用 monorepo 结构：

```bash
# 进入后端目录
cd project/aitoearn-backend

# 安装依赖
pnpm install

# 复制配置文件
cp apps/aitoearn-server/config/config.js apps/aitoearn-server/config/local.config.js

# 启动服务端（开发模式）
pnpm nx serve aitoearn-server
```

NestJS 的核心思想是用"模块"组织代码。比如发布功能会拆成 ChannelModule、ContentModule、TaskModule 等，每个模块负责一件事，通过依赖注入组合在一起。

## 值得注意的设计亮点

1. **MCP 优先**：不是做一个封闭产品，而是通过标准协议让全世界 AI 工具都能调用它的能力
2. **Relay 机制**：发布内容需要登录各社交平台，OAuth 授权需要开发者凭据。Relay 让你直接借用官方凭据，省去了在各平台注册开发者账号的麻烦
3. **全链路闭环**：从创作→发布→互动→变现，四个 Agent 覆盖了内容创作者的每一步
4. **多环境适配**：国内版（aitoearn.cn）和国际版（aitoearn.ai）两套入口，API Key 互不通用

## 下一步可以做什么

- 去 [aitoearn.ai](https://aitoearn.ai/) 注册一个账号，体验一下 AI 帮你写文案的感觉
- 试着在 Claude 里配置 MCP，看看 AI 助手怎么帮你发内容
- 如果感兴趣，用 Docker 在本地跑一份，看看源码结构
- 关注它的 GitHub 仓库，这个项目迭代非常快（从 2025 年 2 月到现在已经到 2.4 版本了）

## 参考链接

- GitHub: https://github.com/yikart/AiToEarn
- 官网: https://aitoearn.ai / https://aitoearn.cn
- Docker 部署指南: DOCKER_DEPLOYMENT_CN.md
- 贡献指南: CONTRIBUTING.md
