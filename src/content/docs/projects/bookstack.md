---
title: BookStack — 文档型 Wiki 知识库
来源: https://github.com/BookStackApp/BookStack
日期: 2026-06-13
子分类: 编辑器与 IDE
分类: CLI
provenance: pipeline-v3
---

## 日常类比：公司书架上的「真·说明书」，而不是聊天里的第 17 版 Word

想象你们团队有一间 **内部图书馆**，管理员按主题把资料摆成三层结构：

- **书架（Shelf）** 是「工程区」「产品区」「运维区」这样的大分区，一眼能看到有哪些主题的书。
- **书（Book）** 是一本完整手册，比如《Kubernetes 运维指南》或《新人 Onboarding》。
- **章（Chapter）** 是书里的目录层级，把相关页面收拢在一起。
- **页（Page）** 才是具体一篇文章——部署步骤、故障排查、API 说明。

很多团队的现实是：知识散落在 Slack 线程、Google Docs 子文件夹、某次培训 PPT 的副本里。新人问「Staging 怎么发布？」，老员工翻聊天记录五分钟，复制粘贴一个 **过期链接**。

**BookStack**（[BookStackApp/BookStack](https://github.com/BookStackApp/BookStack)）就是为这种场景设计的 **自托管文档 Wiki**：用「书架 → 书 → 章 → 页」组织内容，WYSIWYG 或 Markdown 双编辑器，全文搜索，段落级深链接，角色权限可细到单本书。官方站点 [bookstackapp.com](https://www.bookstackapp.com)，MIT 许可，PHP + Laravel 构建，源码主仓已迁移至 [Codeberg](https://codeberg.org/bookstack/bookstack)，GitHub 仍作镜像与 Star 统计（约 1.8 万+ Star）。

与 **Outline**（Collection + Document 扁平树）、**Confluence**（企业 CMS 重量级）相比，BookStack 更 ** opinionated（有明确主见）**：不追求无限自定义，而是让「非程序员也能十分钟上手写文档」。零基础路径：**试用 [demo.bookstackapp.com](https://demo.bookstackapp.com) → 理解 Shelf/Book/Chapter/Page → Docker 或 Ubuntu 脚本自建 → 配 LDAP/OIDC → 用 REST API 接 CI**。

---

## 这个项目解决什么问题

### 痛点 1：Wiki 结构要么太扁，要么太复杂

MediaWiki 适合维基百科式词条，但对「按项目写手册」不直观；Notion 灵活但 SaaS 绑定深。BookStack 用 **四层固定模型**（Shelf / Book / Chapter / Page），新人看到界面就知道该往哪放内容。

### 痛点 2：技术文档与非技术同事之间的编辑门槛

默认 **WYSIWYG 富文本** 像 Word，行政、产品也能改政策页；工程师可切 **Markdown 编辑器 + 实时预览**。内置 **diagrams.net（draw.io）** 画图，不用另开工具。

### 痛点 3：「谁改了什么」与合规留痕

每页有 **revision 历史**，可对比差异、回滚。配合 **Audit Log API** 与按角色的 **MFA 强制**，适合内网知识库的基本治理需求。

### 痛点 4：与自动化流水线脱节

内置 **REST API**、**Webhooks**、**Visual / Logical Theme** 扩展点，可用 CI 在发版后自动写入 changelog 页，或在事故响应时由 bot 创建 runbook 草稿。

---

## 核心概念拆解

### 1. Shelf（书架）

Shelf 是 **顶层视觉分区**，把多本 Book 归为一组展示（如「Platform Team 全部文档」）。Shelf 本身不直接包含 Page，Page 必须挂在 Book（或 Book 下的 Chapter）里。一个 Book 可以出现在多个 Shelf 上。

### 2. Book（书）

Book 是 **内容的主要容器**，类似一本完整手册。包含：

- 封面图、描述、标签（Tags）
- 可选 **default_template_id**：新建页时套用模板
- 直接子 Page，或通过 Chapter 间接组织

权限可在 Book 级别 **继承或覆盖**（restrictions）。

### 3. Chapter（章）

Chapter 是 Book 内的 **中间层目录**，用于把相关 Page 分组（如「安装」「监控」「故障排查」）。Chapter 也可以没有子 Page，仅作说明性分组。

### 4. Page（页）

Page 是 **最小内容单元**，存储 HTML（WYSIWYG 或 Markdown 转换后）。特点：

- **slug** 构成稳定 URL：`/books/my-book/page/my-page`
- **段落锚点** `#bkmrk-...` 支持深链接到段内
- **draft** 草稿与 **template** 模板页
- **editor** 字段标记最后使用的编辑器（`wysiwyg` / `markdown`）
- 支持导出 HTML / PDF / Markdown / ZIP

### 5. 搜索（Search）

全局或限定在单 Book 内搜索。API `GET /api/search?query=...` 支持 `{created_by:me}` 等过滤语法。搜索结果跨 Shelf、Book、Chapter、Page。

### 6. 权限与角色（Roles & Permissions）

基于 **Role** 的权限系统，粒度包括：

- 全局：用户管理、API 访问、设置修改
- 实体级：`book-view`、`page-update` 等，可对单本书 **加锁**

常见角色：**Admin**、**Editor**、**Viewer**。企业场景可接 **LDAP / SAML2 / OIDC**，并 per-role **强制 MFA（TOTP）**。

### 7. 认证与 API Token

Web 登录支持邮箱密码及多种社交/OAuth 提供者。调用 REST API 需给用户角色分配 **「Access System API」** 权限，再在用户资料里创建 **API Token**（Token ID + Token Secret），请求头格式：

```
Authorization: Token <token_id>:<token_secret>
```

### 8. 技术栈一览

| 层 | 技术 |
|----|------|
| 后端 | PHP 8.2+、Laravel |
| 数据库 | MySQL 8.0+ 或 MariaDB 10.6+ |
| 前端 | TypeScript、Blade 模板 |
| 依赖 | Composer |
| 部署 | Apache/Nginx、Docker（社区镜像）、Ubuntu 一键脚本 |
| 存储 | 本地 `public/uploads` 或 S3 兼容对象存储 |

健康检查端点：`GET /status`（子系统异常时返回 HTTP ≥400）。

---

## 内容组织建议

适合中小团队的一种结构：

```
Shelf: Engineering
├── Book: Platform Runbooks
│   ├── Chapter: Kubernetes
│   │   ├── Page: 集群升级 checklist
│   │   └── Page: etcd 备份恢复
│   └── Chapter: Observability
│       └── Page: Grafana 告警路由
└── Book: RFC Archive
    └── Page: RFC-001 事件总线选型

Shelf: Company
└── Book: People & Policy
    ├── Page: 休假政策
    └── Page: 报销流程
```

原则：

1. **Book 对应一个「可交付主题」**（一本完整手册），不要把所有东西都塞进一本书；
2. **Chapter 控制单书内目录深度**，超过 20 页的 Book 建议拆 Chapter；
3. **模板页（template）** 统一 RFC、事故报告、Onboarding 结构；
4. **Tags** 做跨 Book 检索（如 `env:production`），不要替代清晰的 Book 边界；
5. 对外只读场景可开 **guest 访问** 或导出 PDF，对内用 Role 收口编辑权。

---

## 代码示例 1：LinuxServer.io Docker Compose 最小栈

BookStack 官方不提供第一方 Docker 镜像，社区常用 [linuxserver/docker-bookstack](https://github.com/linuxserver/docker-bookstack)。下面是最小可运行 compose（生产请 **固定镜像 tag**、改强密码、配 HTTPS 反向代理）：

```yaml
# docker-compose.yml — 基于 LinuxServer.io 社区镜像的简化示例
services:
  bookstack:
    image: lscr.io/linuxserver/bookstack:latest
    container_name: bookstack
    environment:
      - PUID=1000
      - PGID=1000
      - APP_URL=https://docs.example.com
      - DB_HOST=bookstack_db
      - DB_PORT=3306
      - DB_DATABASE=bookstackapp
      - DB_USERNAME=bookstack
      - DB_PASSWORD=change_me_strong_password
    volumes:
      - ./bookstack_config:/config
    ports:
      - "6875:80"
    depends_on:
      - bookstack_db
    restart: unless-stopped

  bookstack_db:
    image: mariadb:10.11
    container_name: bookstack_db
    environment:
      - MYSQL_ROOT_PASSWORD=change_me_root
      - MYSQL_DATABASE=bookstackapp
      - MYSQL_USER=bookstack
      - MYSQL_PASSWORD=change_me_strong_password
    volumes:
      - ./bookstack_db:/var/lib/mysql
    restart: unless-stopped
```

启动后访问 `http://localhost:6875`，默认管理员 **`admin@admin.com` / `password`**，**务必立即修改**。若前面有 Nginx/Caddy，把 `APP_URL` 设为公网 HTTPS 地址，否则邮件链接与 OAuth 回调会错。

手动安装（非 Docker）核心步骤：克隆 `release` 分支 → `composer install --no-dev` → 复制 `.env` → `php artisan key:generate` → `php artisan migrate` → Web 根指向 `public/`。详见 [官方安装文档](https://www.bookstackapp.com/docs/admin/installation/)。

---

## 代码示例 2：REST API — 发版流水线自动写入 Changelog 页

场景：GitHub Actions 在 tag 发布后，向 BookStack 的「Release Notes」Book 追加一页。先确保 CI 用的服务账号角色含 **Access System API** 与目标 Book 的 **page-create** 权限。

**列出书籍，找到目标 book_id：**

```bash
curl -sS "https://docs.example.com/api/books" \
  -H "Authorization: Token ${BOOKSTACK_TOKEN_ID}:${BOOKSTACK_TOKEN_SECRET}" \
  -H "Accept: application/json" | jq '.data[] | {id, name, slug}'
```

**用 Markdown 创建新页（`book_id: 3` 为例）：**

```bash
curl -sS -X POST "https://docs.example.com/api/pages" \
  -H "Authorization: Token ${BOOKSTACK_TOKEN_ID}:${BOOKSTACK_TOKEN_SECRET}" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -d '{
    "book_id": 3,
    "name": "v2.4.0 — 2026-06-13",
    "markdown": "# v2.4.0\n\n## Highlights\n\n- Added BookStack export to CI\n- Fixed search index lag\n\n## Upgrade\n\n```bash\nphp artisan migrate\n```\n",
    "tags": [
      {"name": "release", "value": "2.4.0"},
      {"name": "channel", "value": "stable"}
    ],
    "priority": 0
  }'
```

API 返回 JSON 含新页 `id`、`slug` 与 `url`。若需更新已有页，用 `PUT /api/pages/{id}`；导出 Markdown 备份用 `GET /api/pages/{id}/export/markdown`。

**Python 批量同步草稿（结构示例）：**

```python
#!/usr/bin/env python3
"""Sync local markdown files into a BookStack book via REST API."""
import os
import requests

BASE = os.environ["BOOKSTACK_URL"].rstrip("/")
AUTH = {
    "Authorization": f"Token {os.environ['BOOKSTACK_TOKEN_ID']}:"
    f"{os.environ['BOOKSTACK_TOKEN_SECRET']}"
}
BOOK_ID = int(os.environ["BOOKSTACK_BOOK_ID"])

def upsert_page(name: str, markdown: str) -> dict:
    # 简化：仅创建；生产环境应先 GET /api/pages?filter=... 按 slug 去重
    payload = {"book_id": BOOK_ID, "name": name, "markdown": markdown}
    r = requests.post(f"{BASE}/api/pages", json=payload, headers=AUTH, timeout=30)
    r.raise_for_status()
    return r.json()

if __name__ == "__main__":
    for path in sorted(os.listdir("docs/export")):
        if not path.endswith(".md"):
            continue
        title = path.removesuffix(".md").replace("-", " ").title()
        body = open(f"docs/export/{path}", encoding="utf-8").read()
        page = upsert_page(title, body)
        print(f"created page id={page['id']} slug={page['slug']}")
```

注意：写入的 HTML 宜保持 **单层块级元素**，复杂嵌套可能在 WYSIWYG 编辑器里显示异常；API 文档 [Content Security](https://demo.bookstackapp.com/api/docs) 章节说明了 `html` 与 `raw_html` 的区别及 XSS 注意点。

---

## 代码示例 3：Webhook 在页面变更时通知 Slack

BookStack 管理后台可配置 **Webhooks**：在 `page_create`、`page_update` 等事件发生时 POST JSON 到你的 endpoint。下面是一个极简 Node 转发器，把事件摘要发到 Slack Incoming Webhook：

```javascript
// webhook-relay.mjs — 接收 BookStack 事件并通知 Slack
import http from "node:http";

const SLACK_URL = process.env.SLACK_WEBHOOK_URL;

http.createServer(async (req, res) => {
  if (req.method !== "POST") {
    res.writeHead(405);
    return res.end();
  }
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const event = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  // event.related_item 含 name、book_slug、url 等字段（依版本略有差异）
  const text = `[BookStack] ${event.event} — ${event.related_item?.name ?? "unknown"}`;
  await fetch(SLACK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  res.writeHead(204);
  res.end();
}).listen(8787);
```

适合「文档更新自动 @ 频道」的轻量集成； heavier 的场景直接用 REST API 拉 audit-log 更可控。

---

## 与相近方案怎么选

| 维度 | BookStack | Outline | HedgeDoc | Confluence |
|------|-----------|---------|----------|------------|
| 内容模型 | Shelf/Book/Chapter/Page | Collection/Document 树 | 单页 Markdown 房间 | 空间/页面 + 宏 |
| 编辑体验 | WYSIWYG + Markdown | Notion 式块编辑 | 纯 Markdown 协作 | 富文本 + 插件 |
| 自托管 | 易（PHP + MySQL） | 需 PG + Redis + S3 | 相对轻 | 通常 Data Center |
| 实时协同 | 否（修订竞争靠保存） | 是 | 是（CRDT） | 是 |
| 许可 | MIT | BSL 1.1 | AGPL-3.0 | 商业 |
| 典型用户 | 中小企业内部 Wiki | 工程团队知识库 | 技术共笔/会议 | 大企业标配 |

若你需要 **固定书架隐喻 + 低学习成本 + MIT**，BookStack 往往是自托管 Wiki 的默认候选；若 **实时共编** 是硬需求，Outline / HedgeDoc 更合适。

---

## 运维与生产注意事项

1. **备份**：MySQL 全库 + `storage/` 与 `public/uploads/`（或 S3 bucket）；发版前用官方 `release` 分支，执行 `php artisan migrate`。
2. **HTTPS**：OAuth、OIDC、邮件重置密码都依赖正确的 `APP_URL`。
3. **搜索性能**：大实例定期清理回收站；极大规模可考虑只读副本（非官方 HA 方案，需自行验证）。
4. **升级**：官方 upgrade 流程在维护窗口执行，**不保证零停机**；多实例 HA 需共享 session/cache 与上传存储（Redis + S3）。
5. **安全**：默认关闭公开注册；API Token 最小权限；对外暴露前跑 `/status` 与权限审计。

---

## 学习路径建议

| 阶段 | 做什么 | 预期收获 |
|------|--------|----------|
| 1. 体验 | 登录 demo，创建 Shelf/Book/Page，试 WYSIWYG 与 Markdown | 理解四层模型 |
| 2. 组织 | 按团队设计 2 个 Shelf、各 2 本书，写模板页 | 形成信息架构 |
| 3. 部署 | Docker 或 Ubuntu 脚本在 VPS 起实例，改管理员密码，配 SMTP | 掌握自建 |
| 4. 集成 | 创建 API Token，用 curl 创建页；可选 Webhook → Slack | 接入自动化 |
| 5. 治理 | 配 LDAP/OIDC、MFA、Book 级权限、导出 PDF 给外审 | 企业可用 |

官方资源：[文档中心](https://www.bookstackapp.com/docs)、[API 文档（demo）](https://demo.bookstackapp.com/api/docs)、[社区论坛](https://community.bookstackapp.com/)、[api-scripts 示例库](https://codeberg.org/bookstack/api-scripts)。

---

## 小结

BookStack 把「内部文档该长什么样」这件事想得很直白：**像图书馆一样分层摆书，像 Word 一样写页，像 Git 一样留修订，像 API 一样接流水线**。它不试图取代 Notion _database 或 Confluence 插件生态，但在 **MIT、自托管、文档 Wiki** 这个窄缝里，用极低的组织成本换团队愿意持续维护的「单一事实来源」。从零开始：先玩 demo，再 Docker 起一个实例，最后用 REST API 把第一次自动发版写页跑通——这三步走完，你就已经比大多数「Wiki 建了没人写」的团队更进一步。
