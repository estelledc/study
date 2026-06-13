---
title: HedgeDoc — 协作 Markdown 编辑
来源: https://github.com/hedgedoc/hedgedoc
日期: 2026-06-13
子分类: 编辑器与 IDE
分类: CLI
provenance: pipeline-v3
---

## 日常类比：共享白板上的「活文档」

想象你和同事在白板前写会议纪要：有人负责打字，有人补充 bullet，有人画架构图——**所有人同时看到同一块板**，不用等 A 改完发 Word、B 再合并第 7 版。

**HedgeDoc**（[hedgedoc/hedgedoc](https://github.com/hedgedoc/hedgedoc)，前身 CodiMD / HackMD）就是浏览器里的 **协作 Markdown 白板**：

- **Markdown 源码** 是统一「书写语言」——标题、列表、代码块、公式都用纯文本表达，可 diff、可导出。
- **实时协同** 像 Google Docs，但底层是 **WebSocket + CRDT（HedgeDoc 2 用 Yjs）**：多人同时改同一段，光标位置也能互相看见。
- **一条 URL 即房间**：新建笔记 → 把链接发给队友 → 对方打开就能一起写，无需安装客户端。
- **同一篇文档还能变幻灯片**：用 Reveal.js 的 slide 语法，会议纪要在写完的瞬间就能 **Slide Mode** 上台演示。

与本地 MarkText / Typora 的「单机 WYSIWYG」不同，HedgeDoc 的核心是 **Web、自托管、多人、实时**。官方 demo 见 [hedgedoc.org](https://hedgedoc.org)；文档 [docs.hedgedoc.org](https://docs.hedgedoc.org/)。

零基础路径：**打开实例 → 新建笔记 → 改权限 → 邀请一人协同 → 试 slide 模式 → （可选）Docker 自建**。

---

## 这个项目解决什么问题

### 痛点 1：Markdown 协作靠 Git + PR，实时讨论太慢

技术团队写 RFC、运维写 runbook，用 Git 很规范，但 **头脑风暴、站会记录、临时方案** 需要「打开就写、写完即分享」。HedgeDoc 用 **短链接 + 实时同步** 把延迟从「提交—review—merge」降到「打字即可见」。

### 痛点 2：Notion / 飞书文档是 SaaS，数据不在自己手里

HedgeDoc 是 **AGPL-3.0 开源**，可 **自托管**（Docker + PostgreSQL），笔记、上传图片、权限策略都在你的服务器上。适合实验室、内网 wiki、不想把内部设计文档交给第三方的团队。

### 痛点 3：Markdown 编辑器功能散——图、公式、幻灯片各用各的工具

HedgeDoc 在 **同一编辑器** 里集成：

- **Mermaid / PlantUML / Graphviz** 等图表
- **KaTeX / MathJax** 数学公式
- **Reveal.js Slide Mode** 演示
- **YAML front matter** 控制标题、标签、slide 主题
- 图片 **拖拽 / 粘贴上传**（可配置 imgur、S3、Minio 或本地目录）

### 痛点 4：权限与版本需要简单可控

六种权限档（Freely / Editable / Limited / Locked / Protected / Private）用下拉菜单即可切换；**Revision（修订历史）** 可回溯任意旧版本。比自建 Git 仓库对非程序员更友好。

---

## 核心概念拆解

### 1. Note（笔记）与 URL 身份

每则笔记有一个 **随机 id** 或（在 FreeURL 模式下）**自定义 alias**，对应 URL 如 `https://your-hedgedoc.example.com/abc123`。笔记内容存 **PostgreSQL**（生产推荐），元数据包括标题、权限、修订链、浏览次数等。

| 路径模式 | 含义 |
|----------|------|
| `/noteId` | 可编辑视图（权限允许时） |
| `/s/noteId` | 只读 **Published（发布）** 视图 |
| `/noteId/slide` | **Slide Mode** 演示视图 |
| `/noteId/download` | 下载原始 Markdown |

**Publish** 不等于删除编辑链接：发布版给读者，编辑版仍给作者协作。

### 2. 三种视图模式（Desktop / Tablet）

| 模式 | 体验 |
|------|------|
| **Edit** | 仅编辑器（CodeMirror） |
| **Both** | 左写右预览，最常用 |
| **View** | 仅渲染结果 |

移动端简化为 Edit / View 两档。夜间模式可独立切换编辑区与预览区。

### 3. 权限模型（Permission）

只有 **笔记 Owner** 能改权限。典型档位：

| 档位 | 访客读 | 访客写 | 登录用户写 | 场景 |
|------|--------|--------|------------|------|
| **Freely** | ✔ | ✔ | ✔ | 完全开放黑客松白板 |
| **Editable** | ✔ | ✖ | ✔ | 内网文档，防匿名乱改 |
| **Limited** | ✖ | ✖ | ✔ | 需登录才能读写的团队空间 |
| **Private** | ✖ | ✖ | ✖ | 仅 Owner |

自托管时可配合 **OAuth**（GitHub、GitLab、LDAP 等，视实例配置）识别登录用户。

### 4. Revision（修订）与 History

每次保存形成 **revision**，带时间戳 id。可对比、回滚到旧版本——类似 Git history，但在 Web UI 里一键完成。API 提供 `/noteId/revision` 与 `/noteId/revision/{id}` 供自动化拉取。

### 5. Slide Mode 与 `type: slide`

在 YAML front matter 里设 `type: slide`，文档按 **Reveal.js** 规则分页（`---` 分隔 slide）。适合 **技术分享、课程讲义**：写完 Markdown 直接 `/slide` 全屏演示，不必另做 PPT。

### 6. 架构：1.x 与 2.x

| 版本 | 状态 | 技术栈要点 |
|------|------|------------|
| **HedgeDoc 1.x**（`master` / Docker `1.10.x`） | **稳定、全球广泛使用** | 单体 Node.js 应用，成熟功能全 |
| **HedgeDoc 2.x**（`develop`） | **重写中**，Alpha 可试 [hedgedoc.dev](https://hedgedoc.dev) | Monorepo：**NestJS 后端** + **Next.js/React 前端**，协同用 **Yjs + WebSocket**，编辑器 **CodeMirror 6** |

入门与自建优先 **1.x**；关注 2.x 若你需要更现代的权限、API 与前端扩展。两者 AGPL 许可一致。

### 7. 与 CodiMD / HackMD 的关系

HedgeDoc 是 CodiMD 社区延续品牌后的正式名称；数据库与 Docker 镜像可从旧 HackMD/CodiMD **迁移**（见官方 migration 文档）。概念上可理解为 **同一类产品线的开源继任者**。

---

## 第一个协作笔记：从浏览器到权限

### 步骤 1：新建并分享

1. 打开你的 HedgeDoc 实例首页，点 **New note**（或访问 `/new`）。
2. 浏览器跳转到 `https://实例/随机id`，左侧写 Markdown，右侧实时预览。
3. 复制地址栏 URL 发给同事；对方打开同一 URL 即进入同一文档（需权限允许写入）。

### 步骤 2：设置权限

右上角 **Permission** 菜单 → 选 **Editable**（登录用户可写、访客只读）或 **Limited**（仅登录用户可读可写）。Owner 可在 Settings 里 **Transfer ownership** 给另一位注册用户。

### 步骤 3：发布只读版

点 **Publish**，获得 `/s/noteId` 链接，适合挂到 README 或发给不需要编辑的读者。编辑链接仍保留在原 `/noteId`。

---

## 代码示例 1：YAML front matter + Slide 演示

HedgeDoc 支持在文首用 YAML 控制标题、标签、幻灯片主题等（[YAML metadata 文档](https://docs.hedgedoc.org/references/yaml-metadata/)）：

```markdown
---
title: 季度复盘 — 后端组
tags: meeting, q2, infra
type: slide
slideOptions:
  transition: fade
  theme: white
---

# Q2 后端复盘

---

## 指标概览

- P99 延迟 ↓ 18%
- 部署频率 ↑ 2.3x

---

## 架构变更

```mermaid
graph LR
  A[API Gateway] --> B[Service Mesh]
  B --> C[PostgreSQL]
```

---

## 下季度重点

1. 可观测性统一
2. 多区域容灾演练
```

保存后访问 `/你的noteId/slide` 即全屏 Reveal 演示；`type: slide` 让编辑器默认按 slide 预览，改稿时更接近「边写边彩排」。

---

## 代码示例 2：Docker Compose 自托管（1.x）

官方最小示例（[Docker 文档](https://docs.hedgedoc.org/setup/docker/)）——**仅供本地试跑，生产需改密码、域名、HTTPS、备份**：

```yaml
version: '3'
services:
  database:
    image: postgres:17.7-alpine
    environment:
      - POSTGRES_USER=hedgedoc
      - POSTGRES_PASSWORD=password
      - POSTGRES_DB=hedgedoc
    volumes:
      - database:/var/lib/postgresql/data
    restart: always
  app:
    image: quay.io/hedgedoc/hedgedoc:1.10.8
    environment:
      - CMD_DB_URL=postgres://hedgedoc:password@database:5432/hedgedoc
      - CMD_DOMAIN=localhost
      - CMD_URL_ADDPORT=true
    volumes:
      - uploads:/hedgedoc/public/uploads
    ports:
      - "3000:3000"
    restart: always
    depends_on:
      - database
volumes:
  database:
  uploads:
```

```bash
docker compose up -d
# 浏览器打开 http://localhost:3000
```

常用环境变量（详见 configuration docs）：

| 变量 | 作用 |
|------|------|
| `CMD_DB_URL` | PostgreSQL 连接串 |
| `CMD_DOMAIN` | 对外域名，影响生成链接 |
| `CMD_URL_ADDPORT` | 是否在 URL 中带端口 |
| `CMD_ALLOW_ORIGIN` | CORS，多域名前端时 |
| `CMD_IMAGE_UPLOAD_TYPE` | 图片存 imgur / s3 / filesystem 等 |

备份数据库：

```bash
docker compose exec database pg_dump hedgedoc -U hedgedoc > backup.sql
```

---

## 代码示例 3：HTTP API 自动化创建笔记

HedgeDoc 1.x 提供 REST 端点（[API 文档](https://docs.hedgedoc.org/dev/api/)），适合 CI 生成报告、脚本导入 Markdown：

```bash
# 用 POST body 创建新笔记并写入 Markdown
curl -sS -X POST 'https://your-hedgedoc.example.com/new' \
  -H 'Content-Type: text/markdown' \
  --data-binary $'---\ntitle: CI 构建报告\n---\n\n## Build #42\n\n- Status: **green**\n- Duration: 4m12s\n'

# 若 FreeURL 开启，可指定 alias
curl -sS -X POST 'https://your-hedgedoc.example.com/new/weekly-standup-2026-06-13' \
  -H 'Content-Type: text/markdown' \
  --data-binary @standup.md

# 拉取笔记元数据（JSON）
curl -sS 'https://your-hedgedoc.example.com/abc123/info' | jq .

# 下载原始 Markdown
curl -sS 'https://your-hedgedoc.example.com/abc123/download' -o note.md

# 实例健康与统计
curl -sS 'https://your-hedgedoc.example.com/status' | jq .
```

OpenAPI 描述可用于生成各语言 SDK。注意：未登录时 `/me`、`/history` 等用户接口会返回 403。

---

## 代码示例 4：图表与公式（编辑器内语法）

HedgeDoc 扩展标准 Markdown，下列片段在 **Both** 模式下即时渲染：

````markdown
## 时序图（Mermaid）

```mermaid
sequenceDiagram
  participant U as User
  participant H as HedgeDoc
  participant DB as PostgreSQL
  U->>H: WebSocket 协同编辑
  H->>DB: 持久化 revision
```

## 行内与块级公式

行内 $E = mc^2$，块级：

$$
\int_0^1 x^2 \, dx = \frac{1}{3}
$$

## 任务清单（GFM）

- [x] 部署 HedgeDoc
- [ ] 配置 OAuth
- [ ] 写团队规范
````

PlantUML、Graphviz、abcjs（乐谱）等同样受支持，具体以实例启用的插件为准。

---

## HedgeDoc 2 前瞻（了解即可）

若你跟踪 `develop` 分支，架构变为：

```
┌─────────────┐     REST / WS      ┌─────────────┐
│  Next.js    │ ◄──────────────► │  NestJS     │
│  Frontend   │   Yjs 协同文档    │  Backend    │
│  CodeMirror6│                   │  Note/Auth  │
└─────────────┘                   └──────┬──────┘
                                         │
                                         ▼
                                  PostgreSQL
```

- **@hedgedoc/commons**：前后端共享类型与协同协议
- **Yjs CRDT**：无中央锁的并发合并，远程光标由 CodeMirror 插件绘制
- 功能仍在补齐，**生产环境请继续用 1.x LTS 镜像**

---

## 与相近工具怎么选

| 工具 | 定位 | 与 HedgeDoc 差异 |
|------|------|------------------|
| **HackMD 商业云** | 托管 SaaS | 同源理念；HedgeDoc 是开源自建版 |
| **Notion / 飞书** | 块编辑器 + 数据库 | 非纯 Markdown；HedgeDoc 更轻、可 Git 式导出 `.md` |
| **Overleaf** | LaTeX 协作 | 排版引擎不同；HedgeDoc 走 Markdown + slide |
| **Trilium / Logseq** | 个人/树形 PKM | 单机或同步笔记树；HedgeDoc 强调 **单页 URL 实时多人** |
| **Git + VS Code** | 工程师工作流 | 规范但无实时；HedgeDoc 补 **同步会议文档** 场景 |

选型口诀：**要纯 Markdown + 实时多人 + 能自建 → HedgeDoc**；要个人知识树 → Trilium；要论文 LaTeX → Overleaf。

---

## 常见问题

### 和 Git 是什么关系？

HedgeDoc **不是** Git 替代品。常见做法：会议在 HedgeDoc 共创 → 定稿后 **Download .md** 或 API 导出 → 提交进 Git 仓库做长期归档。也可反向用 API **POST /new** 把 CI 日志推成临时分享页。

### 图片存在哪？

取决于管理员配置：`filesystem`（容器 volume）、**MinIO/S3**、或 **imgur**。自托管时建议对象存储 + 备份策略；注意 Docker 默认 `uploads` 权限 `0700`，Nginx 反代静态文件时可能要设 `UPLOADS_MODE`。

### 能否完全匿名？

Freely 权限下可以，但 Owner 无法审计谁改了什么。**Editable / Limited** 更适合企业内网。2.x 会强化身份与权限模型。

### 升级 1.x 要注意什么？

升级前读 [Release Notes](https://hedgedoc.org/latest-release)；改 `docker-compose.yml` 镜像 tag，`docker compose up` 前 **备份 PostgreSQL**。从 HackMD 迁移时核对数据库用户名（1.7 起默认 `hedgedoc` 而非 `hackmd`）。

---

## 延伸资源

| 资源 | 链接 |
|------|------|
| 官网与功能概览 | https://hedgedoc.org/ |
| 文档站 | https://docs.hedgedoc.org/ |
| GitHub 仓库 | https://github.com/hedgedoc/hedgedoc |
| Docker 镜像 | https://quay.io/repository/hedgedoc/hedgedoc |
| 公共 Demo | https://demo.hedgedoc.org/ |
| Matrix 社区 | 见 README 中 matrix.org 链接 |
| HedgeDoc 2 Alpha | https://hedgedoc.dev/ |
| API / OpenAPI | https://docs.hedgedoc.org/dev/api/ |

---

## 小结

HedgeDoc 把 **Markdown 的简洁** 和 **Google Docs 式实时协作** 合成在 **一条 URL** 里：浏览器即客户端，PostgreSQL 存笔记，权限与修订让团队文档可管可控；Slide Mode、Mermaid、公式则减少「写完再另做 PPT/画图」的切换成本。零基础可从公共 demo 写第一篇协作纪要；有运维能力时用 Docker 在团队内网 **自托管**，数据与链接规则完全在自己手中。跟踪 **2.x + Yjs** 重写可在熟悉 1.x 后再评估迁移——当前学习与实践仍应以 **1.10.x 稳定版** 为主。
