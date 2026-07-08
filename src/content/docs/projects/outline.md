---
title: Outline — 团队 Wiki 协作平台
来源: 'https://github.com/outline/outline'
日期: 2026-05-30
分类: 编辑器
难度: 初级
---

## 是什么

Outline 是一个**给团队写内部知识库的开源 Wiki**：文档像 Notion 一样好写，权限像公司文件柜一样分层，编辑时还能多人实时协作。日常类比：它像团队的"会自动整理目录的共享笔记本"——新人入职、产品规范、故障复盘、会议纪要都放进去，别人不用在聊天记录里翻半天。

最小感受不是先写代码，而是先知道它服务什么场景：团队把零散文档收进 Collections，再用权限、搜索、评论、历史版本和 API 管起来。

```bash
curl https://app.getoutline.com/api/documents.search \
  -X POST \
  -H 'Authorization: Bearer MY_API_KEY' \
  -H 'Content-Type: application/json' \
  -d '{"query":"onboarding","statusFilter":["published"]}'
```

这段命令的意思是：把 Outline 当成一个可查询的团队知识库，用 API 搜"入职"相关文档，而不是只靠人在网页里点。

## 为什么重要

不理解 Outline 这类团队 Wiki，下面这些事很容易变乱：

- 团队知识散在聊天、Google Docs、个人笔记里，新人只能靠问人，重复打扰会越来越多
- 只用普通文档工具，目录、权限、公开分享、历史版本和搜索常常各管各的，越大越难维护
- 自建知识库如果没有实时协作和编辑体验，大家会回到更顺手但更分散的工具
- 想把知识库接进自动化、AI 助手或内部工具时，没有 API / MCP 就只能人工复制粘贴

## 核心要点

Outline 的核心设计可以拆成 **三件事**：

1. **Collections 是目录也是权限边界**：一组文档先放进 Collection，再给团队、用户、群组分配查看、编辑、管理权限。类比：文件柜不是只有抽屉，它还自带钥匙规则。

2. **编辑器是 ProseMirror + Markdown 体验的折中**：用户可以用富文本、斜杠菜单、嵌入和评论，也能粘贴或输入 Markdown。类比：写的人看到的是顺手的排版界面，系统内部仍保持结构化文档。

3. **实时协作被拆成独立服务**：官方架构里有 web、worker、websocket、collaboration 等服务，协作编辑需要 WebSocket 正常转发。类比：网页是会议室，协作服务是让每个人同时听见别人说话的对讲机。

三件事合起来，Outline 不是"又一个文档编辑器"，而是把写作、权限、搜索、自动化放在同一个团队知识空间里。

## 实践案例

### 案例 1：用 Docker 自托管一套团队 Wiki

官方 hosting 文档推荐 Docker / Docker Compose，最小生产配置至少要准备 URL、数据库、Redis 和 SECRET_KEY。

```yaml
services:
  outline:
    image: docker.getoutline.com/outlinewiki/outline:latest
    env_file: ./docker.env
    ports:
      - "3000:3000"
    depends_on:
      - postgres
      - redis
```

```bash
docker compose up -d
```

**逐部分解释**：

- `outline` 是应用本体，负责网页、API 和文档服务
- `postgres` 存结构化数据，`redis` 支撑队列、缓存和实时相关状态
- `docker compose up -d` 是后台启动；官方提醒升级前先备份，并且生产最好固定镜像版本，不要长期依赖 `latest`

### 案例 2：用 API 自动创建知识库骨架

官方开发者页把 API 设计成 RPC 风格：每个动作都是 `POST /api/<method>`，例如 `collections.create` 和 `documents.create`。

```bash
curl https://app.getoutline.com/api/collections.create \
  -X POST \
  -H 'Authorization: Bearer MY_API_KEY' \
  -H 'Content-Type: application/json' \
  -d '{"name":"Engineering","description":"工程团队内部文档","sharing":false}'

curl https://app.getoutline.com/api/documents.create \
  -X POST \
  -H 'Authorization: Bearer MY_API_KEY' \
  -H 'Content-Type: application/json' \
  -d '{"title":"新人入职清单","text":"# Day 1\n\n- 申请账号\n- 跑通本地环境","collectionId":"COLLECTION_UUID","publish":true}'
```

**逐部分解释**：

- 第一条命令先建 Collection，相当于创建一个有权限边界的大目录
- 第二条命令在目录里建文档，`text` 用 Markdown，`publish:true` 让成员可见
- API key 应该放在环境变量或密钥管理里，不能提交到仓库；权限 scope 也应按用途收窄

### 案例 3：把 Outline 接给 AI 助手或脚本搜索

官方 guide 已经提供 MCP 入口，云端 workspace 用自己的子域名，self-hosted 则把域名后面加 `/mcp`。

```bash
claude mcp add --transport http outline https://team.getoutline.com/mcp
```

```json
{
  "mcpServers": {
    "outline": {
      "url": "https://team.getoutline.com/mcp"
    }
  }
}
```

**逐部分解释**：

- `claude mcp add` 是把 Outline 注册成一个可搜索、可读取、可编辑的知识源
- JSON 版本适合 Cursor 等支持 MCP 配置的客户端
- 如果管理员在 Settings → AI 里关闭 MCP，客户端配置正确也连不上；认证可走 OAuth，也可用 `Authorization: Bearer <api-key>`

## 踩过的坑

1. **反向代理没转发 WebSocket，文档会像"能打开但不同步"**：GitHub discussion 里常见现象是新建文档后要刷新才出现，原因是 `Upgrade` / `Connection` 头或 `COLLABORATION_URL` 配错。

2. **SECRET_KEY 丢了不是普通密码忘记**：官方 troubleshooting 说明它会影响加密数据，恢复时可能要重置 access token、session 和集成信息。

3. **API scope 语法不能凭直觉乱写**：官方现在区分全局、namespace 和 endpoint scope，社区也出现过 `collections.read` 与 `collections:read` 混淆导致接口不可用的问题。

4. **模板 API 和客户端编辑流程不完全等同**：discussion 里维护者解释过，客户端编辑不都走 REST API；脚本自动套模板时要先查清当前版本的行为。

## 适用 vs 不适用场景

**适用**：

- 中小团队需要把规范、入职、会议纪要、复盘集中到一个可搜索空间
- 需要自托管、开源代码、团队权限、公开分享和 API 自动化
- 已经大量使用 Markdown，但希望非工程同学也能用富文本编辑
- 想把知识库接入 Slack、MCP、内部脚本或 AI 助手

**不适用**：

- 只写个人笔记，不需要团队权限和协作；本地 Markdown 或 [[obsidian]] 更轻
- 需要数据库表格、看板、复杂关系属性作为核心；[[notion]] 或 [[affine]] 更像全能工作台
- 不能维护 Postgres、Redis、对象存储、反向代理和备份；直接用托管版更稳
- 对许可、商业版功能、企业 SSO 有强约束；上线前要先确认当前版本条款和功能边界

## 历史小故事（可跳过）

- **2016 年前后**：Tom Moor 开始做 Outline，目标是给团队一个比传统 Wiki 更快、更好写的知识库。
- **早期定位**：它不是单人笔记，而是面向团队内部文档；README 里也把它称为 React + Node.js 构建的协作知识库。
- **架构演进**：代码仓库逐步形成 TypeScript monorepo，前端用 React / Vite / MobX，后端用 Koa / Sequelize，编辑器基于 ProseMirror。
- **社区扩张**：到 2026 年 GitHub 主页显示约 39k stars、3k+ forks，说明自托管知识库需求很强。
- **近年方向**：官方 guide 增加 AI Answers、MCP、Data attributes 等能力，Outline 正在从"写文档"走向"让工具使用文档"。

## 学到什么

- **团队知识库的关键不是编辑器，而是边界**：Collection、权限、历史版本、分享规则决定知识能不能被放心使用。
- **实时协作依赖基础设施细节**：WebSocket、collaboration 服务、反向代理和 URL 配置错一个，体验就会从实时变成刷新。
- **API 让知识库变成系统组件**：创建文档、搜索文档、接 MCP 后，知识不只给人读，也能给脚本和 AI 助手用。
- **开源 Notion-like 工具仍要运维能力**：自托管带来自主权，也带来备份、升级、密钥、存储和安全责任。

## 延伸阅读

- 官方仓库：[outline/outline](https://github.com/outline/outline)（README、issues、discussions、release 都在这里）
- 官方使用指南：[docs.getoutline.com](https://docs.getoutline.com/s/guide)（Collections、Import、Search、MCP 等用户侧文档）
- 官方托管文档：[Docker hosting](https://docs.getoutline.com/s/hosting/doc/docker-7pfeLP5a8t)（自托管从这里开始）
- 官方 API：[Outline Developers](https://www.getoutline.com/developers)（RPC API、scope、endpoint 参数）
- [[prosemirror]] —— Outline 编辑体验背后的富文本结构框架
- [[hocuspocus]] —— 另一个协作后端项目，适合理解实时编辑服务的共性

## 关联

- [[prosemirror]] —— Outline 的编辑器建立在结构化富文本模型上
- [[yjs]] —— 理解协同编辑时可对比 CRDT 路线和 Outline 的 collaboration 服务
- [[hocuspocus]] —— 同样围绕富文本实时协作，但更偏后端基础设施
- [[hedgedoc]] —— 也是团队文档协作工具，但更偏 Markdown 即时协作
- [[affine]] —— 文档 + 白板一体化知识库，和 Outline 的团队 Wiki 定位可比较
- [[obsidian]] —— 个人知识库代表，适合对照"个人笔记"和"团队权限 Wiki"差异

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
