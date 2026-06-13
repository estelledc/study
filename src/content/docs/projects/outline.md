---
title: Outline — 团队 Wiki 协作平台
来源: https://github.com/outline/outline
日期: 2026-06-13
子分类: 编辑器与 IDE
分类: CLI
provenance: pipeline-v3
---

## 日常类比：公司图书馆，而不是聊天里的「第 17 版文档」

想象你们团队有一间 **内部图书馆**：

- **书架（Collection）** 按主题分区：工程、产品、人事、运维……
- **每一页（Document）** 是一篇可不断修订的文章，支持标题、目录、代码块、表格、嵌入图。
- **馆员系统（权限）** 决定谁能读、谁能改、谁能对外借出复印件（公开链接）。
- **实时共编** 像多人同时在同一页白板上写字——你看见同事的游标，不用等「张三改完发你 v8.docx」。

而很多团队的现状是：知识散落在 Slack 线程、Google Docs 文件夹、某次 onboarding 的 Notion 副本里。**新人问「部署流程在哪？」**，老员工翻聊天记录五分钟，复制粘贴一个过期链接。

**Outline**（[outline/outline](https://github.com/outline/outline)）就是为这种场景设计的 **团队知识库 / Wiki**：Markdown 友好、搜索极快、实时协作、可自托管。官方托管见 [getoutline.com](https://www.getoutline.com)；源码在 GitHub 上 3 万+ Star，技术社区常把它当作 Notion Wiki 区或 Confluence 的现代化替代。

零基础路径：**浏览 demo 或试用云版 → 理解 Collection / Document 结构 → 用 API 或 Docker 自建 → 接 Slack / SSO**。

---

## 这个项目解决什么问题

### 痛点 1：文档版本在 IM 里流转，没有「单一事实来源」

部署手册、onboarding、事故复盘若只活在聊天里，**检索成本** 和 **过期风险** 会指数上升。Outline 把内容收敛到可搜索、可链接、可权限管控的 workspace，每篇文档有稳定 URL，改一处全员可见。

### 痛点 2：传统企业 Wiki（Confluence 等）又慢又重

Outline 从设计上强调 **毫秒级加载** 和 **Notion 式编辑体验**：斜杠命令插入块、拖拽图片、Mermaid 图、KaTeX 公式、代码高亮。写内部文档应该像写笔记，而不是填企业 CMS 表单。

### 痛点 3：SaaS 知识库的数据主权与按席位计费

Outline 支持 **Docker 自托管**（PostgreSQL + Redis + S3 兼容存储），团队规模扩大时不按人头涨价。许可为 **BSL 1.1**（四年后转为 Apache 2.0）——源码公开、可审计，但需注意与「纯 OSI 开源」定义的差别。

### 痛点 4：文档与日常工作流脱节

内置 **Slack** 集成：在频道里搜索、分享、订阅文档更新；**REST API** 支持用 CI 自动生成 runbook、同步发布说明；**Webhook** 可在文档创建/更新时触发内部自动化。

---

## 核心概念拆解

### 1. Workspace（工作区）

一个 Outline 实例通常对应一个 **Workspace**——相当于整间「图书馆」。用户、团队、权限、集成配置都在 workspace 级别管理。自托管时你的域名（如 `https://wiki.example.com`）即 workspace 入口。

### 2. Collection（集合 / 书架）

Collection 是 **顶层内容分区**，类似「工程文档」「产品规格」「公司政策」。特点：

- 扁平列表，**不是** BookStack 那种多层书架嵌套；
- 可配置图标、颜色、排序；
- 权限可在 collection 级别设置 **读 / 写 / 管理**。

### 3. Document（文档 / 页面）

Document 是基本内容单元，存储 **ProseMirror** 富文本（底层兼容 Markdown 导入导出）。支持：

- **无限层级子文档**：`parentDocumentId` 形成树形目录；
- **草稿与发布**：`publishedAt` 为空表示未发布；
- **模板**：复用 onboarding、RFC、事故报告等结构；
- **评论与 @提及**：讨论留在文档上下文，不散落在 Slack。

### 4. 搜索（Search）

服务端用 PostgreSQL **`tsvector` / `tsquery`** 做全文检索，并结合 `popularityScore` 等信号排序。云版还提供 **AI 问答**（对 workspace 内文档提问）。自托管团队通常先依赖经典关键词搜索，已足够快。

### 5. 权限模型（Policies）

后端用 **cancan** 策略集中鉴权：用户、用户组（Group）、Collection 成员关系、Guest 用户、公开分享链接各自有规则。API 与 Web UI 走同一套 policy，避免「网页能看、API 不能调」的双轨权限。

### 6. 认证（Authentication）

**重要**：Outline **没有内置邮箱+密码注册**。必须接外部 IdP：

| 方式 | 典型场景 |
|------|----------|
| Google / Slack OAuth | 小团队快速上线 |
| OIDC（Authentik、Keycloak） | 自托管统一身份 |
| SAML / Azure AD | 企业 SSO |
| API Key（Bearer） | 脚本与 CI 调用 |

### 7. 技术栈一览

| 层 | 技术 |
|----|------|
| 前端 | React + Vite + MobX + Styled Components |
| 编辑器 | ProseMirror（`shared/editor`） |
| 后端 | Koa + Sequelize + PostgreSQL |
| 队列 / 实时 | Redis + Bull；WebSocket 协作 |
| 文件 | 本地卷或 S3 / MinIO |

架构说明见仓库 [docs/ARCHITECTURE.md](https://github.com/outline/outline/blob/main/docs/ARCHITECTURE.md)。

---

## 内容组织建议

适合 growing team 的一种结构：

```
Workspace
├── Collection: Engineering
│   ├── Document: 架构总览
│   │   ├── 子文档: 认证服务
│   │   └── 子文档: 数据管道
│   └── Document: On-call Runbook
├── Collection: Product
│   └── Document: PRD 模板
└── Collection: Company
    └── Document: 休假政策
```

原则：

1. **Collection 少而清晰**（5–12 个），避免「 Uncategorized 垃圾堆」；
2. **深层级用子文档**，不要把所有标题都拍平在一页；
3. **Runbook / 政策 / 模板** 单独成 collection，方便权限收口；
4. 对外分享用 **Share link**，对内用 group 权限，不要混用。

---

## 代码示例 1：Docker Compose 自托管最小栈

官方推荐 Docker 部署。下面示例包含 Outline、PostgreSQL、Redis，以及用 **https-portal** 自动申请 HTTPS（生产请 **固定镜像版本**，勿长期用 `latest`）：

```yaml
# docker-compose.yml — 摘自 Outline 官方 Docker 文档的简化版
services:
  outline:
    image: docker.getoutline.com/outlinewiki/outline:1.2.0
    env_file: ./docker.env
    expose:
      - "3000"
    volumes:
      - storage-data:/var/lib/outline/data
    depends_on:
      - postgres
      - redis

  redis:
    image: redis:7-alpine
    expose:
      - "6379"
    volumes:
      - ./redis.conf:/redis.conf
    command: ["redis-server", "/redis.conf"]

  postgres:
    image: postgres:18
    expose:
      - "5432"
    volumes:
      - database-data:/var/lib/postgresql
    environment:
      POSTGRES_USER: outline
      POSTGRES_PASSWORD: outline_pass
      POSTGRES_DB: outline

  https-portal:
    image: steveltn/https-portal:1
    ports:
      - "80:80"
      - "443:443"
    environment:
      DOMAINS: "docs.example.com -> http://outline:3000"
      STAGE: "production"
      WEBSOCKET: "true"   # 实时协作依赖 WebSocket
    volumes:
      - https-portal-data:/var/lib/https-portal

volumes:
  storage-data:
  database-data:
  https-portal-data:
```

`docker.env` 中至少需要（值请换成强随机串）：

```bash
NODE_ENV=production
URL=https://docs.example.com
PORT=3000
SECRET_KEY=generate_a_long_random_string
UTILS_SECRET=another_long_random_string
DATABASE_URL=postgres://outline:outline_pass@postgres:5432/outline
REDIS_URL=redis://redis:6379
FILE_STORAGE=local
FILE_STORAGE_LOCAL_ROOT_DIR=/var/lib/outline/data

# OIDC 示例（以 Authentik 为例）
OIDC_CLIENT_ID=outline
OIDC_CLIENT_SECRET=your_oidc_secret
OIDC_AUTH_URI=https://auth.example.com/application/o/authorize/
OIDC_TOKEN_URI=https://auth.example.com/application/o/token/
OIDC_USERINFO_URI=https://auth.example.com/application/o/userinfo/
OIDC_LOGOUT_URI=https://auth.example.com/application/o/outline/end-session/
```

启动与更新：

```bash
docker compose up -d
docker compose logs -f outline   # 确认 DB/Redis 连接成功
# 升级前：备份 Postgres → 改镜像 tag → docker compose pull && docker compose up -d
```

**反代注意**：Nginx/Caddy 必须透传 `Upgrade` 与 `Connection` 头，否则实时协作会静默失败。

---

## 代码示例 2：REST API 创建与搜索文档

Outline API 是 **RPC 风格**：`POST /api/<method>`，与官方 Web 应用共用同一套接口。认证推荐 **Header**：

`Authorization: Bearer ol_api_xxxxxxxx`

在 **Settings → API Keys** 创建 Key，可按 endpoint 设 scope（如 `documents.*`）。

### Bash：创建并发布一篇 Runbook

```bash
OUTLINE_URL="https://docs.example.com"
API_KEY="ol_api_your_key_here"
COLLECTION_ID="550e8400-e29b-41d4-a716-446655440000"  # 浏览器地址栏可见

curl -sS "${OUTLINE_URL}/api/documents.create" \
  -X POST \
  -H "Authorization: Bearer ${API_KEY}" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -d "$(jq -n \
    --arg title "生产部署 Runbook" \
    --arg text "$(cat <<'MD'
## 概述

本文描述主站发布流程。

## 检查清单

- [ ] CI 全绿
- [ ] 数据库迁移已 review
- [ ] on-call 已知晓

## 回滚

见 [[回滚手册]] 子文档。
MD
)" \
    --arg cid "${COLLECTION_ID}" \
    '{title: $title, text: $text, collectionId: $cid, publish: true}')" \
  | jq '.data | {id, urlId, title}'
```

### Python：封装客户端并搜索

```python
#!/usr/bin/env python3
"""最小 Outline API 客户端：创建文档 + 全文搜索。"""
import os
import requests

BASE = os.environ["OUTLINE_URL"].rstrip("/")
TOKEN = os.environ["OUTLINE_API_KEY"]
HEADERS = {
    "Authorization": f"Bearer {TOKEN}",
    "Content-Type": "application/json",
    "Accept": "application/json",
}

def rpc(method: str, payload: dict | None = None) -> dict:
    r = requests.post(f"{BASE}/api/{method}", headers=HEADERS, json=payload or {}, timeout=30)
    r.raise_for_status()
    body = r.json()
    if not body.get("ok", True) and "data" not in body:
        raise RuntimeError(body)
    return body.get("data", body)

if __name__ == "__main__":
    # 1) 列出 collections，拿到 collectionId
    collections = rpc("collections.list")
    eng = next(c for c in collections if c["name"] == "Engineering")

    # 2) 创建子文档（嵌套在父文档下）
    doc = rpc("documents.create", {
        "title": "Redis 故障应急",
        "text": "## 症状\n\n缓存命中率骤降。\n\n## 处理\n\n1. 检查内存\n2. 切换只读副本",
        "parentDocumentId": "PARENT_DOC_UUID",
        "publish": True,
    })
    print("created:", doc["id"], doc.get("url"))

    # 3) 搜索
    hits = rpc("documents.search", {"query": "redis 故障", "limit": 5})
    for item in hits:
        print("-", item["document"]["title"], item.get("ranking"))
```

常见 RPC 方法：

| 方法 | 用途 |
|------|------|
| `documents.list` | 按 collection / 父文档列出 |
| `documents.info` | 按 id 或 shareId 取详情 |
| `documents.update` | 更新正文或元数据 |
| `documents.move` | 调整树位置 |
| `documents.search` | 全文搜索 |
| `collections.list` | 列出所有书架 |

完整参考：[getoutline.com/developers](https://www.getoutline.com/developers)。

---

## 代码示例 3：CI 中自动同步 Changelog（思路）

在 release workflow 里，用 API 把 `CHANGELOG.md` 对应章节写入 Outline，供非开发人员阅读：

```yaml
# .github/workflows/sync-outline.yml（片段）
- name: Publish release notes to Outline
  env:
    OUTLINE_URL: ${{ secrets.OUTLINE_URL }}
    OUTLINE_API_KEY: ${{ secrets.OUTLINE_API_KEY }}
    OUTLINE_COLLECTION_ID: ${{ secrets.OUTLINE_COLLECTION_ID }}
  run: |
    BODY=$(jq -Rs . < RELEASE_NOTES.md)
    jq -n \
      --arg title "Release ${{ github.ref_name }}" \
      --argjson text "$BODY" \
      --arg collectionId "$OUTLINE_COLLECTION_ID" \
      '{title: $title, text: $text, collectionId: $collectionId, publish: true}' \
      | curl -fsS "$OUTLINE_URL/api/documents.create" \
          -H "Authorization: Bearer $OUTLINE_API_KEY" \
          -H "Content-Type: application/json" \
          -d @-
```

这样 **Git 仍是源码真相**，Outline 是面向全公司的 **可读橱窗**。

---

## 与相近工具对比

| 维度 | Outline | BookStack | Wiki.js | Notion |
|------|---------|-----------|---------|--------|
| 定位 | 团队 Wiki / 知识库 | 结构化手册 | 灵活 Wiki | 全能工作区 |
| 实时协作 | ✅ | ❌ | ❌ | ✅ |
| Markdown | 原生友好 | WYSIWYG 为主 | 原生 | 部分 |
| 自托管 | ✅ Docker | ✅ | ✅ | ❌ |
| 内置账号密码 | ❌ 需 SSO | ✅ | ✅ | SaaS |
| API | REST RPC | REST | GraphQL | 有限 |
| 许可 | BSL 1.1 | MIT | AGPL | 专有 |

选型建议：

- 要 **最好写的编辑器 + 实时共编** → Outline；
- 要 **最简单自托管 + 传统书架** → BookStack；
- 要 **GraphQL + 高度可定制** → Wiki.js；
- 要 **表格数据库 + 轻量个人笔记** → Notion，但内部 Wiki 常变贵且难治理。

---

## 常见坑与排查

1. **登录不了**：没配 OAuth/OIDC/SAML。先 `curl -X POST $URL/api/auth.config -d '{}'` 看启用的 provider。
2. **协作不同步**：反代未开启 WebSocket；检查 `WEBSOCKET` 与 `Upgrade` 头。
3. **上传附件失败**：`FILE_STORAGE` 配错；生产应用 S3/MinIO，并检查 bucket 权限。
4. **API 403**：Key scope 过窄，或用户对目标 collection 无写权限。
5. **升级后白屏**：看容器日志是否 migration 失败；升级前 **务必备份 Postgres**。
6. **搜索不到新文档**：索引异步；极短延迟内属正常，持续缺失则查 DB `documents` 表与 `searchVector` 字段。

---

## 零基础实践路线（约 90 分钟）

| 阶段 | 动作 | 产出 |
|------|------|------|
| 1. 体验 | 注册云版 trial 或浏览公开 changelog | 熟悉编辑器与 collection |
| 2. 建模 | 建 2 个 collection、各 3 篇文档（含 1 个子文档） | 团队信息架构草案 |
| 3. 协作 | 邀请同事同时编辑一篇 | 理解实时游标与评论 |
| 4. 集成 | 接 Slack 搜索/分享（可选） | 降低「文档在 wiki 里吃灰」概率 |
| 5. 自动化 | 用 API 创建一篇 CI 同步文档 | 验证可编程性 |
| 6. 自托管 | Docker Compose + OIDC（实验环境） | 掌握依赖与备份流程 |

---

## 延伸阅读

- 官方站点：[getoutline.com](https://www.getoutline.com)
- 源码与 Star 历史：[github.com/outline/outline](https://github.com/outline/outline)
- 自托管 Docker：[docs.getoutline.com — Docker](https://docs.getoutline.com/s/hosting/doc/docker-7pfeLP5a8t)
- API 与鉴权：[开发者文档](https://www.getoutline.com/developers)、[API 指南](https://docs.getoutline.com/s/guide/doc/api-1rEIXDfLF6)
- 架构总览：[docs/ARCHITECTURE.md](https://github.com/outline/outline/blob/main/docs/ARCHITECTURE.md)

---

## 小结

Outline 把「团队知识」从聊天附件和过期 Google Doc 里拉出来，放进 **可搜索、可协作、可编程** 的 Wiki。日常类比就是 **公司内部图书馆**：Collection 是书架，Document 是活页册，API 是编目机器人，SSO 是借书证系统。零基础先会用云版编辑器，再按需 Docker 自托管并用 API 接入发布流程——大多数工程团队在这条路径上就能替代笨重的传统 Wiki，同时保留对数据的控制。
