---
title: Trilium — 树形层级笔记系统
来源: https://github.com/zadam/trilium
日期: 2026-06-13
分类: CLI
子分类: 编辑器与 IDE
provenance: pipeline-v3
---

## 日常类比：把个人知识库做成一棵「永远可展开的书架」

想象你在整理一间私人图书馆：不是按文件夹名 `2024/项目/会议.md` 归档，而是给每本书、每张便签都挂在一个 **可无限分叉的书架节点** 上。某本《缓存设计》可以同时出现在「后端架构」和「面试复习」两个分支下——读者从任一入口都能翻到同一本书，改一处内容，两处同步更新。

**Trilium Notes** 就是这样一棵 **树形层级笔记系统**（[zadam/trilium](https://github.com/zadam/trilium)，社区延续版 [TriliumNext/Trilium](https://github.com/TriliumNext/Trilium)）：每个节点是一则 **Note（笔记）**，节点之间通过 **Branch（分支）** 组成父子树；同一则笔记可被 **克隆（Clone）** 到多个父节点下，而不复制正文。笔记存进本地 **SQLite** 数据库，桌面端单机可用，也可搭 **自托管同步服务器** 在多设备间同步；进阶用户还能用 **JavaScript 脚本** 和 **ETAPI（REST）** 把 Trilium 变成可编程的个人知识操作系统。

零基础路径：**安装桌面版 → 在根节点下建子笔记 → 试克隆与属性 → 全文搜索 → 了解同步与备份**。

---

## 这个项目解决什么问题

### 痛点 1：文件夹只能「单路径归档」，跨主题材料难复用

项目笔记、读书笔记、代码片段常同时属于多个主题。Trilium 的 **克隆** 让一条笔记在树上出现多次，**内容只有一份**；改标题或正文，所有挂载点一起更新。这比复制文件到多个目录更符合真实思维的多入口结构。

### 痛点 2：笔记一多，纯文件系统性能与功能都吃力

官方文档说明：为支持克隆、关系图、版本历史等特性，并保证 **十万级笔记** 仍流畅，数据放在 **SQLite** 而非散落的 `.md` 文件（可用导出 Markdown/HTML 做互操作）。性能与功能之间做了明确取舍：**本地优先 + 数据库 + 可选同步**。

### 痛点 3：富文本、代码、导图、表格混在一套系统里

除 WYSIWYG **Text** 笔记外，还有 **Code**（含语法高亮）、**Canvas**（Excalidraw 手绘）、**Mermaid**、**Mind map**、**Geo map**、**Saved Search**、**Render Note** 等类型。一篇技术调研可以在同一棵树里放正文、脚本、关系图，而不必在 Notion + VS Code + draw.io 之间来回跳。

### 痛点 4：需要可扩展，而不只是「写字」

Trilium 内置 **前后端 JavaScript 运行时**：前端脚本可改工具栏、侧边栏；后端脚本可定时任务、批量改笔记。对外还有 **ETAPI** 供 curl、Python、CI 读写笔记——适合把 Trilium 接入自动化工作流。

---

## 核心概念拆解

### 1. Note（笔记）——实体本身

每条笔记有 **标题**、**内容**、**类型**（text、code、file、canvas…）。**Note 不携带「在树的哪里」的信息**；位置由 Branch 表达。没有专门的「文件夹类型」——**任何笔记都可以有子笔记**，既是「文件」也是「目录」。

### 2. Branch（分支）——树上的挂载边

Branch 连接 **父笔记 ID** 与 **子笔记 ID**，还可带 **prefix**（子节点在 UI 上的排序前缀）。删除分支只是去掉一种挂载关系；若笔记再无其他分支且被标记删除，才进入软删除流程。

### 3. Clone（克隆） vs Copy（复制）

| 操作 | 内容 | 树结构 | 典型用途 |
|------|------|--------|----------|
| **Clone** | 共享同一 noteId | 多父节点各有一条 branch | 同一概念出现在「工作」「学习」两区 |
| **Copy** | 新建独立 note | 新子树 | 基于模板分叉、互不影响的副本 |

入门时记住：**克隆 = 多个书架位置指向同一本书**。

### 4. Root note 与 Workspace

整棵树有一个 **root note**。**Workspace** 可把树的一部分「聚焦」展示（例如只显示工作相关子树），减少日常导航噪音，适合个人/工作笔记分区。

### 5. Attributes（属性）：Label 与 Relation

- **Label**：键值标签，如 `#status=done`、`#priority=high`。系统内置 `#run=frontendStartup` 等，用于脚本生命周期。
- **Relation**：笔记之间的有向链接，如 `#author` 指向另一则笔记，可配合 **Promoted attributes** 在表格/看板里结构化展示。
- **Saved Search**：把搜索条件存成笔记，结果动态刷新——类似「智能文件夹」。

### 6. 架构：前端 + 后端（经典 Web 应用）

| 层 | 运行环境 | 职责 |
|----|----------|------|
| **Frontend** | 桌面壳内嵌浏览器 / 浏览器访问 Server | UI、编辑、部分脚本 |
| **Backend** | Node.js | 持久化、加密、同步、ETAPI、后端脚本 |

创建笔记、写库必须在 **backend** 完成；前端脚本通过 `api.runOnBackend()` 委托。理解这一 split，是写 Trilium 脚本不踩坑的关键。

### 7. 同步、加密与删除

- **同步**：自托管 Server 或多设备通过同一实例同步 SQLite 变更；移动端可用 PWA 或第三方客户端（如 iOS 的 Trinote 连接自建服务）。
- **加密**：支持 **按笔记粒度** 加密，适合存凭证或敏感日记。
- **软删除**：删除后默认 **7 天内** 可在「Recent Changes」里 **Undelete**；过期后内容才会被擦除（仍建议定期 **Backup**）。

### 8. 搜索

- **标题跳转**：模糊匹配，快速 `Go to note`。
- **全文搜索**：可限定父笔记、深度等（官方 Advanced Search 语法）。
- 与 Saved Search、脚本 API 的 `searchForNotes()` 可组合，做个人 CRM、任务看板等。

### 9. Trilium 不是什么

它不是 Git 友好的「一笔记一 md 文件」仓库（虽然能导出）；不是多人实时协作文档（共享以 **发布/分享** 只读页面为主）；也不是块级双链大纲（那是 Logseq / Roam 的主场）。Trilium 的强项是 **深树 + 克隆 + 属性 + 脚本 + 大规模单库**。

---

## 安装与第一次打开

### 桌面端（推荐零基础）

1. 从 [TriliumNext Releases](https://github.com/TriliumNext/Trilium/releases) 或原仓库 [zadam/trilium Releases](https://github.com/zadam/trilium/releases) 下载对应平台安装包。
2. 首次启动即创建本地数据库（数据目录可在 **About** 窗口查看，一般为应用配置目录下的 SQLite 文件）。
3. 在 root 下 **Create note** → 选 **Text**，写第一则笔记；对其 **Create child note** 体会树形结构。
4. 右键某笔记 → **Clone to…** 挂到第二个父节点，观察两处编辑同步。
5. 打开 **Recent changes**，熟悉软删除与恢复入口。

### 自托管 Server（可选，多设备）

1. 使用 Docker 或官方文档部署 Trilium Server。
2. 桌面端 **Options → Sync** 配置服务器 URL 与凭证。
3. 浏览器访问同一 Server 亦可编辑（注意 HTTPS 与认证）。

入门阶段 **只跑桌面单机** 即可；同步与 ETAPI 可在树超过几百则后再学。

---

## 代码示例 1：前端启动脚本 —— 工具栏「一键新建子笔记」

下列脚本摘自官方 [New Task launcher button](https://docs.triliumnotes.org/user-guide/scripts/frontend-basics/examples/new-task-button) 模式，改为在 **当前活动笔记** 下创建带日期的子笔记（适合日记/项目日志）。

**步骤：**

1. 新建 **Code** 笔记，语言选 **JavaScript (frontend)**。
2. 在 **Attributes** 添加 label：`#run=frontendStartup`（Trilium 每次启动前端时自动执行）。
3. 粘贴代码并重启应用。

```javascript
// 语言：JavaScript (Trilium frontend)
// 属性：#run=frontendStartup

api.addButtonToToolbar({
    title: "今日子笔记",
    icon: "calendar",
    shortcut: "alt+d",
    action: async () => {
        const activeNote = await api.getActiveTabNote();
        if (!activeNote) {
            api.showMessage("请先打开一个父笔记");
            return;
        }

        const newNoteId = await api.runOnBackend(async (parentNoteId) => {
            const title = api.dayjs().format("YYYY-MM-DD");
            const { note } = await api.createTextNote(parentNoteId, title, "");
            // 给新笔记打标签，便于 Saved Search 汇总
            note.addLabel("dateNote", title);
            return note.noteId;
        }, [activeNote.noteId]);

        await api.waitUntilSynced();
        await api.activateNewNote(newNoteId);
    }
});
```

**阅读要点：**

- `addButtonToToolbar` 在启动栏增加按钮；`icon` 使用 [Boxicons](https://boxicons.com/) 名（不含 `bx-` 前缀）。
- `runOnBackend` 内的代码在 **Node 后端** 执行——**创建笔记必须在这里**。
- `waitUntilSynced` + `activateNewNote` 保证 UI 已收到新 note 再跳转。
- `#run=frontendStartup` 是系统 label；移动端需改用 `#run=mobileStartup`。

---

## 代码示例 2：ETAPI —— 用 HTTP 自动写入笔记

[ETAPI](https://docs.triliumnotes.org/developer-guide/architecture/api) 是面向第三方的 REST 接口，使用 **Token 认证**（在 Trilium **Options → ETAPI** 创建）。适合 cron、Obsidian 迁移脚本、CI 把构建日志写入知识库。

**创建一则文本笔记（curl）：**

```bash
# 环境变量
export TRILIUM_URL="https://trilium.example.com"
export ETAPI_TOKEN="your-etapi-token-here"
export PARENT_NOTE_ID="root"   # 或具体父笔记 ID

curl -sS -X POST "${TRILIUM_URL}/etapi/notes" \
  -H "Authorization: ${ETAPI_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{
    \"parentNoteId\": \"${PARENT_NOTE_ID}\",
    \"title\": \"部署记录 2026-06-13\",
    \"type\": \"text\",
    \"content\": \"<p>CI 构建 #482 已通过，镜像 tag: <code>v1.2.3</code></p>\"
  }"
```

**按标题搜索笔记 ID：**

```bash
curl -sS -G "${TRILIUM_URL}/etapi/notes" \
  -H "Authorization: ${ETAPI_TOKEN}" \
  --data-urlencode "search=#deployRecord" \
  | jq '.[0].noteId'
```

**阅读要点：**

- Text 笔记 `content` 多为 **HTML** 片段（与编辑器内部表示一致）。
- 搜索参数语法与 UI 高级搜索相通，可配合 label/relation 过滤。
- 自托管时务必 **HTTPS + 强 Token**；ETAPI 权限等同登录用户，勿把 Token 提交进 Git。

---

## 代码示例 3：Saved Search 笔记 —— 用属性做「动态任务列表」

不必写代码也能做结构化视图：建一则 **Saved Search** 类型笔记，内容填搜索表达式，Trilium 会把匹配笔记列为子结果（具体语法见官方 Search 文档）。

```text
#status = open
#priority >= 2
note.type = text
orderBy #priority desc
```

配合 Task Manager 等 **Advanced Showcases**（安装包内置示例树），可看到 label、relation、模板笔记如何组成简易看板。零基础可先手动给任务笔记加 `#status=open`，再建 Saved Search 验证筛选。

---

## 推荐笔记树结构（零基础 7 天）

| 天 | 动作 | 目标 |
|----|------|------|
| 1 | 在 root 下建 `Inbox` 与 `Archive` | 理解父子树 |
| 2 | 把一条笔记 **Clone** 到第二个父节点 | 理解共享内容 |
| 3 | 给笔记加 `#topic=xxx` label | 熟悉属性面板 |
| 4 | 试 **Hoist note**（聚焦子树） | 大库导航 |
| 5 | 建 Saved Search 汇总带 `#status=open` 的笔记 | 动态列表 |
| 6 | 导出子树为 Markdown 备份 | 互操作与逃生 |
| 7 | Options 里做一次 **Backup** 并记录数据目录 | 数据安全感 |

---

## 与相近工具对比（简表）

| 维度 | Trilium | Logseq | Joplin |
|------|---------|--------|--------|
| 核心结构 | 深树 + 克隆 | 块大纲 + 双链 | 笔记本/笔记列表 |
| 存储 | SQLite | 本地 md/org | 数据库/文件 |
| 脚本扩展 | JS 前后端 + ETAPI | 插件 API | 插件 |
| 块级引用 | Relation / 链接 | `((block-id))` | 较弱 |
| 自托管同步 | ✅ Server | 有限/第三方 | ✅ Joplin Server |
| 适合 | 超大单库、树+脚本 | 日记+双链图谱 | 加密同步、移动端 |

若你从 Evernote 迁移，可用内置 **ENEX 导入**；从 Markdown 文件夹来则可用导入向导或 ETAPI 批量写入。

---

## 常见问题

**Q：Note 和 Branch 为什么要分开？**  
同一则笔记（Note）可被多条 Branch 挂到不同父下（克隆）；改 Note 一次，所有 Branch 展示点同步更新。

**Q：数据存在哪？怎么备份？**  
本地 SQLite 在应用数据目录（**Help → About** 可见路径）。定期用 **File → Backup database**，并把备份文件放到网盘或 Git LFS 之外的安全存储。

**Q：zadam/trilium 和 TriliumNext 是什么关系？**  
原作者 [zadam/trilium](https://github.com/zadam/trilium) 后由社区 [TriliumNext/Trilium](https://github.com/TriliumNext/Trilium) 继续维护，文档站点 [docs.triliumnotes.org](https://docs.triliumnotes.org) 以 Next 为主。学习概念两者一致，安装时选活跃发行版即可。

**Q：能和纯 Markdown 工作流共存吗？**  
可以 **导出/导入 Markdown**，日常在 Trilium 内编辑；需要 Git diff 时对导出目录做版本管理，或只用 Trilium 做「主编库」、定期导出快照。

**Q：脚本写错了会怎样？**  
错误脚本可能导致启动栏异常；可在安全模式或数据库备份恢复后，删除问题 Code 笔记上的 `#run=frontendStartup` label。

---

## 延伸资源

- 用户指南：[docs.triliumnotes.org](https://docs.triliumnotes.org)
- 脚本 API（前端）：[Script API — Frontend](https://docs.triliumnotes.org/script-api/frontend/)
- 脚本 API（后端）：[Script API — Backend](https://docs.triliumnotes.org/script-api/backend/)
- 架构与 ETAPI：[Developer Guide — API](https://docs.triliumnotes.org/developer-guide/architecture/api)
- 官网特性概览：[triliumnotes.org](https://triliumnotes.org)
- 社区仓库：[TriliumNext/Trilium](https://github.com/TriliumNext/Trilium)

---

## 小结

Trilium 把个人知识库建模为一棵 **可无限加深、可克隆复用** 的笔记树：Note 存内容，Branch 定位置，Label/Relation 加结构，Saved Search 做动态视图。SQLite 换性能与克隆语义，JavaScript 与 ETAPI 则把「写作工具」升级为 **可脚本化的本地知识服务**。零基础从桌面版建树、克隆、属性开始；当笔记上万或需要跨设备同步时，再叠加 Server、脚本与 API——这正是「树形层级笔记系统」区别于普通 Markdown 文件夹的核心价值。
