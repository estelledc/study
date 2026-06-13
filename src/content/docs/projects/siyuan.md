---
title: SiYuan — 国产块结构笔记
来源: https://github.com/siyuan-note/siyuan
日期: 2026-06-13
分类: CLI
子分类: 编辑器与 IDE
provenance: pipeline-v3
---

## 日常类比：把笔记本拆成「带编号的小卡片」，还能用 SQL 搜整间书房

想象你在整理一间 **私人图书馆**，但不是按文件夹 `2024/项目/会议.md` 归档，而是：

- 每一 **段落、标题、列表项、代码块** 都是一张独立 **卡片（块）**，卡片角上有全球唯一编号；
- 卡片可以 **嵌套**（标题下挂段落，列表下挂子项），也可以 **互相引用**——你在 A 卡片写「见卡片 #xyz」，B 卡片会自动列出「谁引用了我」；
- 整间书房的索引不是 Excel，而是一本 **SQLite 电话簿**：你可以问「所有标题里含缓存、且带 #review 标签的块在哪？」

**思源笔记（SiYuan）** 就是这样一套 **本地优先的块结构笔记系统**（[siyuan-note/siyuan](https://github.com/siyuan-note/siyuan)）：Go 语言内核 + Electron 桌面端，数据落在工作空间的 **SQLite** 与 `.sy` 文档文件中；支持 **双链块引用**、大纲编辑、模板、插件、**内核 HTTP API**，并可 Docker **自托管** 同步。中文排版、社区与文档对国内用户友好，常被称作「国产 Notion + Obsidian 块模型」的折中路线。

零基础路径：**安装桌面版 → 读用户指南笔记本 → 理解块与 `/` 菜单 → 试块引用与 SQL 面板 → 了解内核 API 与备份**。

---

## 这个项目解决什么问题

### 痛点 1：Word 式长文档难重组，改结构等于重写

思源把 **块（Block）** 作为最小单元：拖移块、折叠标题、超级块横向排版，都是在改「卡片顺序」而非剪切整篇 `.docx`。每个块有稳定 **ID**（形如 `20210912214605-uhi5gco`），引用 `((块ID))` 后，正文更新引用处仍指向同一块。

### 痛点 2：文件夹笔记「只能单路径归档」，跨主题复用难

与 Logseq、Notion 类似，思源支持 **块级双链** 与 **嵌入块**：同一结论可在「项目 A」「复习提纲」两处被引用或嵌入，而不复制正文。文档树提供 **人类可读路径（hpath）**，块 ID 提供 **精确锚点**。

### 痛点 3：纯 Markdown 文件夹性能与查询能力有限

思源在运行时维护 **SQLite 数据库**（`blocks`、`attributes`、`refs` 等表），UI 编辑实时落库；同时 `.sy` 文件保存在笔记本目录。高级用户可用 **SQL 查询面板** 或 `/api/query/sql` 做结构化检索——比全文搜索文件夹更可控。

### 痛点 4：想要本地数据主权 + 可选多端同步

默认 **数据在本地工作空间**（可整目录备份、Git 忽略二进制资源后部分版本化）。官方提供 **云端同步订阅**，也可 **Docker 自托管** 实现端到端加密同步，适合重视隐私、又需要 iOS/Android 客户端的用户。

### 痛点 5：国产场景下的中文与社区

界面、用户指南、论坛与插件市场以中文为主；内核 API 文档有 [API_zh_CN.md](https://github.com/siyuan-note/siyuan/blob/master/API_zh_CN.md)，社区文档在 [docs.siyuan-note.club](https://docs.siyuan-note.club)。

---

## 核心概念拆解

### 1. 工作空间（Workspace）

一次思源实例对应一个 **工作空间目录**，内含 `conf`、`data`（笔记本与资源）、`temp` 等。换电脑时 **拷贝整个工作空间** 或用官方同步迁移。入门时记住：**备份 = 备份工作空间**，不是单个 `.md` 导出文件。

### 2. 笔记本（Notebook）与文档（Document）

| 概念 | 说明 |
|------|------|
| **笔记本** | 顶层分区，类似「书柜」；可打开/关闭、排序、设图标 |
| **文档** | 类型为 `d` 的 **文档块**，树形目录中的一页笔记 |
| **hpath** | 人类可读路径，如 `/0 请从这里开始/编辑器/排版元素` |
| **path** | 存储路径，如 `/20200812220555-lj3enxa/.../xxx.sy` |

每日笔记路径可在笔记本配置里用 **Sprig 模板** 生成，例如 `/daily note/{{now | date "2006/01"}}/{{now | date "2006-01-02"}}`。

### 3. 块（Block）——唯一重要的核心概念

官方用户指南强调：**在思源中，唯一重要的核心概念是内容块。**

- 每个块有 **ID**、**type**（主类型）、**subtype**（子类型）、**content** / **markdown** 字段；
- 块通过 `parent_id` 形成树；**文档块** 的 `root_id` 指向自身；
- 常见 type：`p` 段落、`h` 标题、`l` 列表、`c` 代码、`t` 表格、`s` 超级块、`d` 文档、`query_embed` 嵌入块等。

块 ID 格式：`14位时间戳-7位随机串`，例如 `20210104091228-d0rzbmm`。

### 4. Block（内核）vs Node（前端）

| 层 | 名称 | 含义 |
|----|------|------|
| **后端** | Block | SQLite `blocks` 表中的一行 |
| **前端** | Node | Protyle 编辑器 DOM 中的 `data-node-id` 元素 |

开发插件时：改内容走 **内核 API**；读 DOM 用 **Node** 属性（`data-type`、`data-subtype`）。

### 5. Protyle 编辑器

**Protyle** 是「一整页文档的编辑对象」，包含：

- **title**：文档标题区；
- **wysiwyg**：所见即所得编辑区（由多个 Node 组成）；
- **gutter**：块图标菜单（引用、复制、折叠等）。

输入 **`/`** 可唤起 **Slash 菜单** 插入标题、列表、公式、模板、嵌入等块类型。

### 6. 引用、嵌入与属性

| 机制 | 写法 / 操作 | 作用 |
|------|-------------|------|
| **块引用** | `((20200813131152-0wk5akh "锚文本"))` | 指向具体块，支持动态锚文本 |
| **文档引用** | `[[文档标题]]` | 链接到其他文档 |
| **嵌入块** | 引用面板拖入或命令 | 他处内容嵌入当前文档 |
| **块属性** | 命名、别名、备注、标签、自定义 `custom-*` | 检索、模板、导出 |
| **属性表（av）** | 数据库视图块 | 表格化看板，类似 Notion Database |

自定义属性通过 API 设置时必须 **`custom-` 前缀**。

### 7. Kramdown 与 Markdown

思源内部使用 **Kramdown** 方言（扩展 Markdown），例如行内样式可写：

`foo**bar**{: style="color: var(--b3-font-color8);"}baz`

导出、部分 API 也提供 GFM Markdown；**直接改 `.sy` 文件不如走 API 或 UI 安全**。

### 8. 两套 API

| API | 调用方 | 典型用途 |
|-----|--------|----------|
| **内核 API** | HTTP POST 到 `127.0.0.1:6806`（需 API Token） | 自动化、脚本、外部工具读写块 |
| **插件 API** | 插件内 `require('siyuan')` / `fetchPost` | 扩展 UI、菜单、Dock、对话框 |

返回值统一为 `{ "code": 0, "msg": "", "data": ... }`，`code !== 0` 表示异常。

### 9. 同步、发布与 SQL 安全

- **同步**：官方云或自建 Docker；工作空间可在多设备间一致。
- **发布**：可导出静态站点；**发布模式下禁止 SQL API**，防止数据泄露。
- **社区插件**：集市安装；开发见 [插件 Quick Start](https://siyuan-note.apifox.cn/6977345m0)。

### 10. SiYuan 不是什么

它不是 Git 原生 `.md` 仓库（虽然可导出 Markdown）；**运行时真相源是 SQLite + .sy**。也不是 Excel——属性表适合轻量结构化，复杂 BI 仍应导出到专用工具。入门优先掌握 **块、引用、笔记本、备份**，再碰 API 与 SQL。

---

## 安装与第一次打开

### 桌面端（推荐）

1. 打开 [GitHub Releases](https://github.com/siyuan-note/siyuan/releases) 或 [b3log.org/siyuan](https://b3log.org/siyuan/) 下载 macOS / Windows / Linux 安装包。
2. 首次启动选择或创建工作空间目录（建议放在已有 Time Machine / 云盘备份的位置）。
3. 打开内置 **「思源笔记用户指南」** 笔记本，阅读「内容块」「排版元素」章节。
4. 新建文档，输入 `/` 试插入 **一级标题**、**待办列表**、**代码块**。
5. 选中一段文字，用 **块引** 创建定义块，在另一处用 `((块ID))` 引用（UI 可自动生成 ID）。

### 可选：Docker 自托管

适合需要私有同步服务器的高级用户；镜像与 compose 示例见官方仓库 `Dockerfile` 与文档。零基础可先只用桌面本地模式。

### API Token

设置 → 关于 → **API token**，供脚本访问内核 HTTP API（默认端口 **6806**）。

---

## 代码示例 1：Python 调用内核 API 创建文档并插入块

以下脚本假设思源已运行且已取得 API Token（勿提交到 Git）：

```python
#!/usr/bin/env python3
"""通过思源内核 API 创建 Markdown 文档并在文末追加段落块。"""
import json
import urllib.request

API = "http://127.0.0.1:6806"
TOKEN = "your-api-token-here"  # 设置 → 关于 → API token

def post(route: str, payload: dict) -> dict:
    req = urllib.request.Request(
        f"{API}{route}",
        data=json.dumps(payload).encode(),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Token {TOKEN}",
        },
        method="POST",
    )
    with urllib.request.urlopen(req) as resp:
        body = json.loads(resp.read())
    if body.get("code") != 0:
        raise RuntimeError(body.get("msg") or body)
    return body["data"]

# 1) 列出笔记本，取第一个未关闭的 ID
notebooks = post("/api/notebook/lsNotebooks", {})["notebooks"]
notebook_id = next(nb["id"] for nb in notebooks if not nb["closed"])

# 2) 用 Markdown 创建文档（path 为 hpath，以 / 开头）
doc_id = post("/api/filetree/createDocWithMd", {
    "notebook": notebook_id,
    "path": "/inbox/siyuan-api-demo",
    "markdown": "# API 演示\n\n由脚本创建于 2026-06-13。\n",
})

# 3) 在文档块末尾追加子块（appendBlock = 插入后置子块）
post("/api/block/appendBlock", {
    "dataType": "markdown",
    "data": "第二段：**内核 API** 写入的段落块。",
    "parentID": doc_id,
})

print("created doc id:", doc_id)
```

**阅读要点：**

- `createDocWithMd` 的 `path` 若已存在 **不会覆盖**，适合幂等导入前先查重；
- `appendBlock` 需要 **父块 ID**（文档块 ID 即可）；
- 插入 sibling 块用 `insertBlock`，并指定 `previousID` / `nextID` / `parentID` 之一锚定位置。

等价的 **curl** 片段（创建后插入块）：

```bash
curl -s -X POST "http://127.0.0.1:6806/api/block/insertBlock" \
  -H "Authorization: Token $SIYUAN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "dataType": "markdown",
    "data": "插入在 previousID 之后的块",
    "previousID": "20211229114650-vrek5x6",
    "nextID": "",
    "parentID": ""
  }'
```

---

## 代码示例 2：SQL 查询块 + 设置自定义属性

思源 SQL 面板或 `/api/query/sql` 直接查询 `blocks` 表（发布模式禁用）。

### 常用 SQL

```sql
-- 最近更新的 10 个段落块
SELECT id, content, updated, hpath
FROM blocks
WHERE type = 'p'
ORDER BY updated DESC
LIMIT 10;

-- 标题中含「缓存」的块
SELECT id, markdown, hpath, tag
FROM blocks
WHERE type = 'h' AND content LIKE '%缓存%';

-- 某文档下的所有一级标题
SELECT id, content, subtype
FROM blocks
WHERE root_id = '20210817205410-2kvfpfn' AND type = 'h' AND subtype = 'h1';
```

### Python 执行查询并给结果块打标签

```python
import json
import urllib.request

API, TOKEN = "http://127.0.0.1:6806", "your-api-token-here"

def post(route, payload):
    req = urllib.request.Request(
        f"{API}{route}",
        data=json.dumps(payload).encode(),
        headers={"Authorization": f"Token {TOKEN}", "Content-Type": "application/json"},
        method="POST",
    )
    return json.loads(urllib.request.urlopen(req).read())

rows = post("/api/query/sql", {
    "stmt": "SELECT id, content FROM blocks WHERE tag LIKE '%待整理%' LIMIT 20",
})["data"]

for row in rows:
    post("/api/attr/setBlockAttrs", {
        "id": row["id"],
        "attrs": {"custom-review-status": "queued"},
    })

print(f"tagged {len(rows)} blocks")
```

**阅读要点：**

- `content` 为去 Markdown 标记的纯文本；完整语法看 `markdown` 列；
- `tag` 字段含 `#标签#` 形式；文档块标签存在文档块上；
- 自定义属性键必须 **`custom-` 前缀**，否则 API 可能拒绝或无法展示。

---

## 代码示例 3：插件内调用内核 API（TypeScript 片段）

插件开发时在 `require('siyuan')` 后使用 `fetchPost`，无需手写 Token：

```typescript
import { fetchPost, openTab } from "siyuan";

// 获取内核时间并在对话框展示
fetchPost("/api/system/currentTime", {}, (response) => {
  if (response.code !== 0) return;
  const when = new Date(response.data).toLocaleString("zh-CN");
  console.log("思源内核时间:", when);
});

// 打开指定 ID 的文档页签
openTab({
  app: this.app, // 插件实例的 app
  doc: { id: "20210917220056-yxtyl7i" },
});
```

块在 DOM 中大致形态（开发者工具可见）：

```html
<div data-node-id="20210104091228-d0rzbmm"
     data-type="NodeHeading"
     data-subtype="h1"
     class="h1">
  <div contenteditable="true">一级标题</div>
</div>
```

**阅读要点：** `data-node-id` 即块 ID；插件可监听块菜单事件扩展「右键操作」，详见社区插件文档。

---

## Kramdown 笔记片段（编辑器内写法示意）

下面是在思源中直接输入/粘贴的 **块内容** 示意（非独立 `.md` 文件）：

```markdown
# 间隔重复 vs 块结构笔记

段落块可以包含 **加粗** 与行内代码 `SQL`。

* 无序列表项 A
  * 子项：双链 ((20200813131152-0wk5akh "在内容块中遨游"))
* 待办 {: checked="false"}
  [ ] 整理 [[思源笔记用户指南]] 的引用章节

```sql
SELECT id, content FROM blocks WHERE type = 'h' LIMIT 5;
```
```

列表、待办、代码块在 UI 中由 `/` 菜单创建更稳妥；块引用 `((id "文本"))` 可在引用自动补全里生成。

---

## 推荐工作流（零基础 7 天）

| 天 | 动作 | 目标 |
|----|------|------|
| 1 | 读用户指南「内容块」 | 理解块 ID、拖移、折叠 |
| 2 | 每日笔记 + `/` 菜单 | 熟悉标题、列表、代码 |
| 3 | 块引 + 反向链接面板 | 体验双链 |
| 4 | 给块加标签、别名 | 检索与过滤 |
| 5 | SQL 面板跑 `SELECT` | 理解 blocks 表 |
| 6 | 导出 Markdown 备份一篇 | 互操作 |
| 7 | 复制工作空间到备份盘 | 建立备份习惯 |

---

## 与相近工具对比（简表）

| 维度 | SiYuan 思源 | Logseq | Obsidian |
|------|-------------|--------|----------|
| 核心单元 | 块 | 块 | 文件为主，插件可块化 |
| 运行时存储 | SQLite + .sy | md/org 文件 或 DB 版 | .md 文件夹 |
| 大纲编辑 | 原生 Protyle | 原生 | 需插件 |
| 内置 SQL | ✅ blocks 表 | 高级 query | Dataview 插件 |
| 中文社区 | 强 | 中 | 中 |
| 开源 | ✅ AGPL | ✅ | 闭源免费 |

若你从 **Logseq** 迁移：思维上都是块与双链；思源更强调 **数据库 + API**，纯文本 Git 友好度低于 Logseq 文件 graph。若从 **Notion** 迁移：属性表（av）更熟悉，但数据在本地工作空间而非云端专有格式。

---

## 常见问题

**Q：块和文档到底是什么关系？**  
文档是 type=`d` 的特殊块，也是子块的 `root_id`；一篇「页面」是一个文档块及其子孙块树。

**Q：可以直接用 VS Code 编辑 `.sy` 吗？**  
不建议；`.sy` 与索引库需一致，应通过 UI 或内核 API 修改，再定期 **导出 Markdown** 做外部只读备份。

**Q：API 端口连不上？**  
确认思源已启动、设置里启用 API、防火墙允许 **6806**；Docker 部署需映射端口。

**Q：SQL 查询为空？**  
检查笔记本是否打开、块 type 是否拼写正确（如 `h1` 在 `subtype` 不在 `type`）。

**Q：同步冲突怎么办？**  
优先官方文档「同步冲突」章节；重要数据 **先离线备份工作空间** 再合并。

---

## 延伸资源

- 源码与路线图：[github.com/siyuan-note/siyuan](https://github.com/siyuan-note/siyuan)
- 内核 API 中文：[API_zh_CN.md](https://github.com/siyuan-note/siyuan/blob/master/API_zh_CN.md)
- 社区文档：[docs.siyuan-note.club](https://docs.siyuan-note.club/zh-Hans/reference/api/kernel/)
- 数据库表说明：[blocks 表字段](https://siyuan-note.apifox.cn/6924361m0)
- 插件开发：[插件 Quick Start](https://siyuan-note.apifox.cn/6977345m0)
- 论坛：[ld246.com 思源板块](https://ld246.com/tag/siyuan)

---

## 小结

思源笔记把 **块** 作为唯一核心：Protyle 负责所见即所得编辑，SQLite 负责检索与引用关系，内核 API 负责自动化。入门从 **用户指南 + 块引用 + 备份工作空间** 开始；进阶用 **SQL 与 Python/插件** 把笔记接进个人工作流。作为 **国产块结构笔记**，它在本地主权、中文体验与可编程性之间给出了清晰路线——**卡片式思维 + 数据库级查询**，而不只是又一个 Markdown 文件夹。
