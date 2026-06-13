---
title: Paperless-ngx — 自托管无纸化文档管理系统
来源: https://github.com/paperless-ngx/paperless-ngx
日期: 2026-06-13
子分类: Web 后端
分类: 后端 API
provenance: pipeline-v3
---

## 日常类比：家里的「智能文件柜」，而不是堆满纸的抽屉

想象你家里有一个 **永远不乱、永远能搜到** 的文件柜：

- 每次收到水电费账单、保险单、合同、体检报告，你 **扫一张或拍一张**，丢进柜子的「投递口」。
- 柜子里的 **小秘书**（OCR）把图片里的字认出来，变成可搜索的文字；还会猜这是「电力公司」还是「保险公司」发来的。
- 你给每份文件贴上 **彩色标签**（tag）、记下 **对方是谁**（correspondent）、属于 **哪一类**（document type），以后搜「2024 退税」或「车险」一秒就能翻到。
- 原件以 **PDF/A** 长期存档格式保存，同时保留原始扫描件；所有数据都在 **你自己家的服务器** 上，不经过云厂商。

现实里，很多人的「归档系统」是：微信收藏夹里的 PDF、邮箱附件、打印机旁一摞没分类的 A4 纸。三年后要找某张发票，只能靠记忆翻文件夹。

**Paperless-ngx**（[paperless-ngx/paperless-ngx](https://github.com/paperless-ngx/paperless-ngx)）就是把上面这个「智能文件柜」做成软件：社区维护的开源 **文档管理系统（DMS）**，把纸质/散落电子文档变成 **可全文检索的数字档案**。它是原版 Paperless 与 Paperless-ng 的官方继任者，文档站 [docs.paperless-ngx.com](https://docs.paperless-ngx.com)，默认推荐 **Docker Compose** 部署。与 [[bookstack]]（团队 Wiki 写作）不同，Paperless 专注 **个人/家庭/小团队的扫描件归档与 OCR 检索**；与 [[nextcloud-server]]（通用网盘）相比，它内置 **消费管道、OCR、标签体系、邮件收单** 等 DMS 能力，而不是单纯存文件。

零基础路径：**官方安装脚本起一套 Docker → 理解 consume 目录与元数据 → 浏览器上传或拖文件 → 用标签/搜索找文档 → 可选 REST API 接自动化**。

---

## 这个项目解决什么问题

### 痛点 1：扫描件是图片，搜不到内容

发票、合同扫描成 PDF 后，文件名往往是 `scan_001.pdf`。Paperless 用 **Tesseract OCR**（支持 100+ 语言，可选 Azure 远程 OCR）把图像变成可搜索文本，并在 UI 里 **高亮匹配片段**。

### 痛点 2：元数据混乱，无法按「谁发的」「什么类型」过滤

仅靠文件夹层级很快失控。Paperless 用 **Tag / Correspondent / Document Type / Storage Path / Custom Fields** 多维组织，并可用 **机器学习** 或可选 **LLM 建议** 自动打标签。

### 痛点 3：进件渠道分散

除了 Web 拖拽上传，还支持：

- **consume 目录**：把文件丢进文件夹即自动入库（类 [[watchdog]] 消费）
- **邮件规则**：IMAP 收信，按规则抓取附件并标记已读/删除
- **REST API**：脚本、扫描仪、[[n8n]] 等工作流推送

### 痛点 4：家庭多用户与敏感文档

内置 **全局 + 单文档级权限**（基于 Django Guardian），可共享给家人或同事，同时限制谁只能看谁的发票。

---

## 核心概念拆解

### 1. 文档（Document）

系统中心实体。每份文档包含：

- **title**：显示标题（可从文件名或规则生成）
- **content**：OCR 后的全文（搜索索引来源）
- **archive_serial_number**：可选档案编号
- **original** 与 **archive** 文件：原稿 + PDF/A 归档副本
- **created / added**：业务日期 vs 入库日期

### 2. 元数据维度

| 概念 | 作用 | 类比 |
|------|------|------|
| **Tag** | 多对多标签，可着色 | 彩色便利贴 |
| **Correspondent** | 发件方/对方机构 | 信封上的寄件人 |
| **Document Type** | 文档类别 | 「发票」「合同」「医疗」 |
| **Storage Path** | 磁盘路径命名规则 | 档案柜第几层怎么编号 |
| **Custom Fields** | 日期、布尔、下拉等扩展字段 | 自定义表格列 |

### 3. 消费管道（Consumption Pipeline）

文档进系统的标准路径：

```
进件（consume 目录 / API / 邮件 / Web 上传）
    → Consumer 发现新文件
    → Celery 任务队列（Redis  broker）
    → Parser 解析格式（PDF、图片、Office、纯文本…）
    → OCR（ocrmypdf + Tesseract）
    → 自动匹配标签/对应方/类型（可选 ML）
    → 写入数据库 + 媒体目录 + 全文索引（Tantivy）
```

**Consumer** 只负责监视投递口并 **通知任务处理器**；真正耗时的 OCR 与索引在 **Celery worker** 里并行执行（多核机器可同时处理多份文档）。

### 4. 四大常驻进程（Docker 内已编排）

| 组件 | 职责 |
|------|------|
| **webserver** | Angular 前端 + Django REST API |
| **consumer** | 监视 `consume` 目录 |
| **task queue (Celery worker)** | OCR、索引、邮件抓取、批量编辑 |
| **scheduler (Celery beat)** | 定时任务：邮件检查、索引维护、自动匹配训练 |

另需 **Redis**（消息队列）与 **PostgreSQL / MariaDB / SQLite**（元数据；生产推荐 PostgreSQL）。

### 5. Workflows（工作流）

比旧版「消费模板」更细的控制：在文档生命周期的触发点（创建、更新等）上执行动作——加标签、设权限、发 Webhook 等。适合「凡是来自 `*@utility.com` 的邮件附件自动打 `utilities` 标签」这类规则。

### 6. 搜索（Full-text Search）

- UI 与 API 均支持 **query=** 全文检索，返回 **score、highlights、rank**
- **more_like_id=** 找相似文档
- **custom_field_query** 用 JSON 表达式过滤自定义字段（日期区间、布尔、多选等）

### 7. 安全与部署注意

官方明确：**默认明文存盘、无应用层加密**；敏感扫描件应跑在 **可信内网/家庭 NAS**，配备份与反向代理 TLS。不要用不可信主机跑税务材料。

---

## 架构一图

```text
┌─────────────┐     REST      ┌──────────────────────────────────┐
│ Angular SPA │ ◄──────────► │ Django + DRF (/api/documents/ …) │
└─────────────┘               └───────────────┬──────────────────┘
                                              │
         consume/  email  API upload          │ ORM
              │         │         │           ▼
              └─────────┴─────────┴──► Celery + Redis
                                              │
                         OCR · parse · index  ▼
                                    ┌─────────────────┐
                                    │ PG + 媒体文件   │
                                    │ + Tantivy 索引  │
                                    └─────────────────┘
```

后端 **Django + Django REST Framework**；前端 **Angular** 单页应用；与 [[postgresql]]、[[redis]] 是常见组合。

---

## 实践案例

### 案例 1：最快上手 — 官方安装脚本（Docker Compose）

适合第一次在笔记本或 NAS 上试用：

```bash
# 交互式脚本：选数据库、创建管理员、拉镜像、起容器
bash -c "$(curl --location --silent --show-error \
  https://raw.githubusercontent.com/paperless-ngx/paperless-ngx/main/install-paperless-ngx.sh)"
```

装好后浏览器打开 `http://127.0.0.1:8000`，用脚本里设的账号登录。

**手动 Compose 时**，关键是挂载三个目录（路径可改成你的 NAS 路径）：

```yaml
# docker-compose.yml 片段
services:
  webserver:
    image: ghcr.io/paperless-ngx/paperless-ngx:latest
    ports:
      - "8000:8000"
    volumes:
      - ./data:/usr/src/paperless/data
      - ./media:/usr/src/paperless/media
      - ./consume:/usr/src/paperless/consume
      - ./export:/usr/src/paperless/export
```

- **consume**：扫描仪/脚本把 PDF 丢这里 → 自动入库
- **media**：归档后的 PDF/A 与原文件
- **export**：批量导出用

环境变量里至少配置 `PAPERLESS_REDIS`、`PAPERLESS_DB*`、`PAPERLESS_OCR_LANGUAGE`（如 `chi_sim+eng` 中英文混排）。NFS 等不支持 inotify 的共享盘，需设 `PAPERLESS_CONSUMER_POLLING=10` 改为轮询监视。

### 案例 2：用 REST API 上传账单并查任务状态

在「用户资料」里生成 API Token，或用用户名密码换 Token：

```bash
# 获取 Token
curl -s -X POST http://127.0.0.1:8000/api/token/ \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"your-password"}'
# → {"token":"abc123..."}

export PAPERLESS_TOKEN="abc123..."
```

上传一份 PDF，并指定标题、标签 ID、对应方 ID：

```bash
TASK_ID=$(curl -s -X POST http://127.0.0.1:8000/api/documents/post_document/ \
  -H "Authorization: Token ${PAPERLESS_TOKEN}" \
  -F "document=@/path/to/electric-bill.pdf" \
  -F "title=2024-06 电费账单" \
  -F "tags=3" \
  -F "correspondent=5")

echo "消费任务 UUID: ${TASK_ID}"

# 轮询任务直到完成
curl -s "http://127.0.0.1:8000/api/tasks/?task_id=${TASK_ID}" \
  -H "Authorization: Token ${PAPERLESS_TOKEN}"
```

成功后响应里会出现新 **document id**；失败可看到 OCR 或格式错误信息。

全文搜索示例：

```bash
curl -sG "http://127.0.0.1:8000/api/documents/" \
  -H "Authorization: Token ${PAPERLESS_TOKEN}" \
  -H "Accept: application/json; version=9" \
  --data-urlencode "query=电费 2024" \
  | jq '.results[] | {id, title, score: .__search_hit__.score}'
```

`__search_hit__.highlights` 里带 HTML 高亮片段，便于 UI 或自建前端展示。

### 案例 3：Python 脚本批量打标签

适合把某文件夹历史 PDF 一次性导入：

```python
#!/usr/bin/env python3
"""批量上传目录内 PDF 到 Paperless-ngx。"""
import pathlib
import requests

BASE = "http://127.0.0.1:8000"
TOKEN = "your-api-token"
SESSION = requests.Session()
SESSION.headers["Authorization"] = f"Token {TOKEN}"

def upload(path: pathlib.Path, tag_ids: list[int]) -> str:
    files = {"document": (path.name, path.read_bytes(), "application/pdf")}
    data = {"title": path.stem}
    for tid in tag_ids:
        data.setdefault("tags", []).append(str(tid))
    # requests 对同名字段需用列表元组
    payload = [("title", data["title"])]
    payload += [("tags", str(t)) for t in tag_ids]
    resp = SESSION.post(f"{BASE}/api/documents/post_document/", files=files, data=payload)
    resp.raise_for_status()
    return resp.text.strip('"')  # task uuid

for pdf in pathlib.Path("./inbox").glob("*.pdf"):
    task = upload(pdf, tag_ids=[3])  # 例如 tag id=3 是「待核对」
    print(pdf.name, "→ task", task)
```

配合 **Workflow**：新文档带「待核对」标签时发邮件通知，核对后在 Web UI 批量去掉该标签。

---

## 与相近项目怎么选

| 需求 | 更合适的选择 |
|------|----------------|
| 扫描件 OCR + 个人档案检索 | **Paperless-ngx** |
| 团队协作文档 / Runbook Wiki | [[bookstack]]、Outline |
| 通用文件同步与共享 | [[nextcloud-server]]、Syncthing |
| 企业级 ECM、合规工作流 | Alfresco、M-Files（商业） |
| 仅想要「文件夹同步」不做 OCR | 网盘即可，不必上 DMS |

Paperless 强项是 **进件自动化 + OCR + 私有部署**；弱项是 **多人实时协同编辑**——它管的是「归档后的只读文档」，不是 Google Docs。

---

## 常用配置备忘

| 变量 | 含义 |
|------|------|
| `PAPERLESS_URL` | 反代后的对外 URL，影响链接生成 |
| `PAPERLESS_OCR_LANGUAGE` | Tesseract 语言包，如 `eng`、`deu`、`chi_sim` |
| `PAPERLESS_TIME_ZONE` | 显示时区 |
| `PAPERLESS_CONSUMER_POLLING` | NFS 等场景下启用目录轮询（秒） |
| `PAPERLESS_CONSUMER_DISABLE` | 关闭文件夹监视，仅 API/Web 上传 |
| `PAPERLESS_TASK_WORKERS` | Celery 并行度，树莓派可调低 |

邮件消费、LDAP、OIDC、Office 文档（可选 Tika）等见官方 [Configuration](https://docs.paperless-ngx.com/configuration/) 与 [Usage](https://docs.paperless-ngx.com/usage/)。

---

## 延伸阅读

- 官方文档：[docs.paperless-ngx.com](https://docs.paperless-ngx.com)
- API 浏览器：`/api/schema/view/`（部署后本地访问）
- 扫描仪兼容列表：项目 Wiki「Scanners & Software」
- 相关笔记：[[postgresql]]（推荐数据库后端）、[[redis]]（任务队列）、[[docker]]（部署方式）

---

## 小结

Paperless-ngx 把「扫描 → OCR → 打标签 → 全文搜索 → 长期 PDF/A 存档」打包成一套可自托管的方案。记住三条主线就够用：

1. **进件**：consume 目录、Web、邮件、API 四选一或组合。
2. **组织**：Tag / Correspondent / Document Type / Custom Fields，配合 Workflows 自动化。
3. **检索**：内置全文引擎，API 的 `query` 与 `custom_field_query` 可接自建仪表盘或家庭自动化。

从一台 NAS 或家用小主机跑起 Docker，把本月账单扫进去，搜一次「电费」——比任何功能列表都更能说明它值不值得留下。
