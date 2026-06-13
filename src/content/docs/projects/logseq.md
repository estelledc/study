---
title: Logseq — 块结构离线知识库
来源: https://github.com/logseq/logseq
日期: 2026-06-13
子分类: 编辑器与 IDE
分类: CLI
provenance: pipeline-v3
---

## 日常类比：把大脑里的「念头清单」变成可搜索、可连线的知识网

想象你在开会时随手记 bullet：每一行是一个想法，按 Tab 缩进表示「这条属于上一条」；某几个词你圈出来，表示「以后还要专门写一页讲它」。会后你不只是翻那一页纸，还想问：**「所有提到张三、又和预算有关的地方在哪？」**

传统 Word 文档像一篇长作文——改结构要剪切粘贴。**Logseq 像一叠可无限嵌套的索引卡片**：每一行（块）有唯一编号，卡片之间用 `[[页面名]]` 和 `((块编号))` 互相指向；你缩进层级、打标签、写属性，软件在本地帮你维护一张 **知识图谱**，并可用查询把符合条件的卡片「捞」出来。

Logseq 是开源的 **隐私优先** 知识管理与协作平台（[logseq/logseq](https://github.com/logseq/logseq)），桌面端把笔记存成 **Markdown 或 Org-mode 纯文本**（默认在本地文件夹），离线可用、数据归你；同时提供 PDF 批注、任务管理（TODO/DOING/DONE）、白board、插件与主题生态。零基础路径：**安装 → 选本地图目录 → 写 Journal 日记 → 用 Tab 缩进与 `[[链接]]` → 打开 Linked References → 试一条简单 query**。

---

## 这个项目解决什么问题

### 痛点 1：文件夹式笔记「只能按路径找」，联想路径断了

按 `2024/项目A/meeting.md` 归档，三个月后你记得讨论过「缓存策略」，却想不起在哪个文件夹。Logseq 用 **双向链接**：你在任意块里写 `[[缓存策略]]`，该页面会自动出现 **Linked References**（谁链到了我），网状检索补全「我当时从哪条思路链过来的」。

### 痛点 2：大纲编辑器与 Markdown 文件各走各路

很多大纲工具数据锁在专有格式里。Logseq **块在 UI 里编辑，落盘仍是 .md/.org**，可用 Git 版本管理、用任意编辑器打开，避免供应商锁定。

### 痛点 3：任务、日记、文献笔记分散在三个 App

Logseq 在同一张图里用 **Journal（日记页）** 捕获流水账，用 **TODO 块** 跟踪任务，用 **属性（property）** 给书摘、项目页加结构化字段，再用 **query** 汇总「本周 DOING 且优先级 A」——减少工具切换。

### 痛点 4：需要离线、可控的个人知识库

笔记默认存在本机 graph 目录，不依赖持续联网。官方强调 longevity 与 user control；进阶用户还可通过插件 API（[plugins-doc.logseq.com](https://plugins-doc.logseq.com)）扩展。新版本另有 **DB graph**（SQLite + 更强查询/同步），与经典 **文件 graph** 并存，入门可先只关心文件版。

---

## 核心概念拆解

### 1. Graph（图）与工作区

一个 **graph** 是一整套相互链接的笔记数据。首次启动时选择或新建文件夹作为 graph 根目录；其中 `pages/`、`journals/`、`logseq/` 等子目录由软件维护。**换电脑时拷贝整个文件夹 + 用同版本 Logseq 打开**，即迁移完成。

### 2. Block（块）——最小信息单元

Logseq 里 **一切皆块**：日记里的一行 bullet、页面标题下的第一条、任务项、属性行，都是 block。每个块有 **UUID**，可用 `((uuid))` 精确引用，不怕改文字后链接失效。

块通过 **缩进（Tab / Shift+Tab）** 形成父子树；**子块会继承父块中的页面引用与标签**（属性不继承），这是简单查询能「沿结构搜到深层内容」的关键。

### 3. Page（页面）与 Journal（日记）

- **Page**：主题容器，用 `[[页面名]]` 引用时若不存在会自动创建。
- **Journal**：按日期自动生成的日记页（类似 Daily Note），适合 inbox 与当日日志。

页面与日记在文件 graph 里最终都对应 Markdown/Org 文件；在 UI 里体验一致。

### 4. 链接、标签与嵌入

| 机制 | 语法 | 作用 |
|------|------|------|
| 页面链接 | `[[Logseq]]` | 连到页面，产生双向 Linked References |
| 块引用 | `((block-uuid))` | 指向具体一块，内容更新后引用处同步 |
| 标签 | `#tag` 或 `#[[多词标签]]` | 跨页面分类，可进图谱筛选 |
| 页面嵌入 | `{{embed [[某页]]}}` | 把整页内容嵌进当前块下 |
| 块嵌入 | `{{embed ((uuid))}}` | 嵌入某块及其子块 |

### 5. Properties（属性）

在块上写 `键:: 值` 形成结构化元数据，例如 `author:: [[Alan Kay]]`、`type:: book`。页面级属性通常放在页面 **第一个块**（类似 frontmatter）。属性可用于 **简单查询** `(property type book)`，并在结果里表格化展示。

### 6. 任务（Task）状态

块首可用 `TODO` / `DOING` / `DONE` / `WAITING` 等标记（可配置）。配合 `priority:: A` 与 query，可建项目看板，而不必另开任务 App。

### 7. 查询（Query）

- **简单查询**：`(and [[项目X]] TODO)`，适合日常过滤。
- **高级查询**：`#+BEGIN_QUERY` … `#+END_QUERY`，内写 Datalog 风格规则，可统计、聚合、自定义逻辑（见官方 [Advanced Queries](https://github.com/logseq/docs/blob/master/pages/Advanced%20Queries.md)）。

### 8. 配置 `config.edn`

`logseq/config.edn` 是 graph 级 Clojure 风格配置（EDN），控制默认模板、快捷键、属性行为、journal 格式等；改完后在 Logseq 里重载配置生效。

### 9. Logseq 不是什么

它不是传统文件夹式 CMS，也不是 Excel 式表格数据库；**强项是块级链接 + 大纲 + 本地文本**，复杂报表级 SQL 分析仍应导出到专用工具。入门时应用好缩进、链接、日记与简单 query，比一上来写 Datalog 更重要。

---

## 安装与第一次打开

### 桌面端（推荐入门）

1. 打开 [GitHub Releases](https://github.com/logseq/logseq/releases) 下载 macOS / Windows / Linux 安装包。
2. 首次启动选择 **Create a new graph**，指定空文件夹（建议放在已做 Time Machine / Git 备份的位置）。
3. 设置 → **Editor**：确认 preferred format 为 **Markdown**（或 Org，二选一为主）。
4. 点击左侧 **Journals**，在今日页输入第一行块，试 `Tab` 缩进与 `[[我的第一个概念]]`。
5. 打开刚链接的页面，查看底部 **Linked References** 是否出现来自日记的回链。

### 可选：命令行

仓库内维护 CLI 文档（`docs/cli/logseq-cli.md`），适合脚本化导出或与自动化工作流集成；零基础可跳过。

---

## 代码示例 1：块结构 Markdown 笔记（文件 graph 落盘形态）

下面模拟 graph 里 `pages/间隔重复.md` 在磁盘上的大致样子（Logseq 会自动补 UUID 与缩进，此处为便于阅读的简化示意）：

```markdown
- type:: [[permanent-note]]
  tags:: learning, pkm
- # 间隔重复与图谱笔记解决不同问题
- 间隔重复优化 **记忆保持**；块结构图谱（Logseq）优化 **关系发现**。
  - 二者互补：闪卡适合事实，图谱适合假设与项目脉络。
- ## 关联
  - 上游：[[Zettelkasten]]、[[Building a Second Brain]]
  - 工具：[[Logseq]] vs [[Obsidian]] — 我更需要 **大纲 + 块引用** 与 **本地 md**
  - 待写：[[如何把 Anki 卡片链回文献块]]
- ## 来源
  - 摘自 [[book-make-it-stick-2014]] 第 2 章
    id:: 63bc5e11-24f1-45fd-945d-4a272e5ecf0d
```

**阅读要点：**

- 每行以 `-` 开头即一块；子块多一级缩进。
- `type::`、`tags::` 是属性；`[[书]]` 在属性值里也会变成页面链接。
- 带 `id::` 的块可被 `((63bc5e11-24f1-45fd-945d-4a272e5ecf0d))` 引用（实际 UUID 以软件生成为准）。
- 在 UI 中打开 [[间隔重复]] 时，Linked References 会列出所有提到它的块。

---

## 代码示例 2：Journal 捕获 + 简单查询块

### 今日 Journal 片段（输入在 Logseq 编辑器内）

```markdown
- TODO 整理 [[Logseq]] 学习笔记 #study
  priority:: A
  scheduled:: 20260613
- 会议 [[项目 Phoenix]]
  - 讨论 [[缓存策略]]：读多写少，先上 [[Redis]]
  - DOING 写一页 [[Phoenix 性能基线]] 的测试清单
- 读 [[论文 Logseq 块模型]] 摘要
  type:: literature
  author:: [[某作者]]
```

### 嵌入页面的简单查询（查询本身也是一块）

在任意页面插入下面块，Logseq 会动态列出匹配块：

```markdown
- {{query (and (todo TODO) (priority A))}}
```

再进阶一点——统计当前页块数量（高级 query，摘自官方文档模式）：

```markdown
#+BEGIN_QUERY
{:title "当前页面的块数量"
 :query [:find (count ?b)
         :in $ ?current-page
         :where
         [?p :block/name ?current-page]
         [?b :block/page ?p]]
 :inputs [:current-page]}
#+END_QUERY
```

**阅读要点：**

- `(todo TODO)` 过滤任务行；与 `(priority A)` 用 `and` 组合。
- 子块上的 `[[项目 Phoenix]]` 会因 **继承** 出现在项目页的 Linked References 里。
- `(property type literature)` 可单独筛文献类块；属性 **不会** 继承到子块，适合精确筛选。
- 高级 query 用 `inputs [:current-page]` 表示「在当前页上下文中计数」。

---

## 代码示例 3：`logseq/config.edn` 片段（可选定制）

```clojure
{:preferred-format :markdown
 :journal/page-name-format "yyyy-MM-dd"
 :journal/file-name-format "yyyy_MM_dd"
 :feature/enable-block-timestamps? true
 :default-templates
 {:j "---
  tags:: journal
  ---"
  :p "type:: project\nstatus:: active"}
 :property-pages/enabled? true}
```

说明：`:default-templates` 里 `:j` / `:p` 可给日记与新页注入默认属性；时间戳开关便于回顾「何时写了这块」。修改前建议备份整个 graph 目录。

---

## 推荐工作流（零基础 7 天）

| 天 | 动作 | 目标 |
|----|------|------|
| 1 | 只写 Journal，不写页面 | 熟悉块、缩进、TODO |
| 2 | 把重复出现的词改成 `[[页面]]` | 感受 Linked References |
| 3 | 用 `#tag` 标记 3 个主题 | 图谱里按 tag 浏览 |
| 4 | 给书摘块加 `author::` / `type::` | 理解 property |
| 5 | 复制块引用 `((uuid))` 到综述页 | 块级复用 |
| 6 | 写一条 `(and [[某项目]] TODO)` | 简单 query |
| 7 | 整个 graph 文件夹进 Git 私有库 | 备份与版本习惯 |

---

## 与相近工具对比（简表）

| 维度 | Logseq | Obsidian | Roam Research |
|------|--------|----------|---------------|
| 核心单元 | 块 + 大纲 | 文件 + 可选块 | 块 |
| 本地纯文本 | ✅ md/org | ✅ md | ❌ 云端为主 |
| 大纲编辑 | 原生 | 需插件 | 原生 |
| 离线 | ✅ | ✅ | 有限 |
| 开源 | ✅ | 闭源免费 | 闭源订阅 |

若你已在 VS Code 用 Foam 写 wikilink，迁移时可 **导入现有 md 文件夹为 graph**，再逐步把长文档拆成块与缩进结构。

---

## 常见问题

**Q：块和页面到底是什么关系？**  
页面是命名空间；页面上每一行（含标题下第一块）仍是块。日记页也是特殊页面。

**Q：删块会影响引用吗？**  
被 `((uuid))` 引用的块删除后，引用处会失效；习惯上可改为 `DONE` 或移到归档页，而非硬删。

**Q：文件 graph 和 DB graph 选哪个？**  
学习笔记、本地 Git 备份优先选 **经典文件 graph**；需要移动端 RTC 同步、强类型属性时再了解 DB 版（见官方 DB 文档）。

**Q：数据存在哪？**  
创建 graph 时选的目录；macOS 常见在 `~/Library/Mobile Documents/iCloud~...` 若你放在 iCloud，注意同步冲突，重要 graph 建议 Git。

---

## 延伸资源

- 官方文档：[docs.logseq.com](https://docs.logseq.com)
- 社区文档仓库：[logseq/docs](https://github.com/logseq/docs)（Properties、Advanced Queries 等）
- 插件开发：[plugins-doc.logseq.com](https://plugins-doc.logseq.com)
- 发布与路线图：[logseq.io](https://logseq.io) / [GitHub Releases](https://github.com/logseq/logseq/releases)
- 讨论区：[discuss.logseq.com](https://discuss.logseq.com)（块继承、查询模式有大量实战帖）

---

## 小结

Logseq 把 **outline 式记录** 与 **wikilink 知识图谱** 合成在同一套 **离线、块级、可查询** 的系统里：Tab 缩进表达结构，`[[页面]]` 与 `#标签` 表达关联，`property::` 与 query 表达结构化管理。入门只需今日 Journal 开始写；熟练后块引用与查询会把零散日记收成可导航的第二大脑。数据在本地 Markdown 里，**你拥有图的全部节点与边**——这也是它作为「块结构离线知识库」最核心的承诺。
