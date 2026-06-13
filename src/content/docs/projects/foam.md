---
title: Foam — VS Code 上的 Roam-like 知识库
来源: https://github.com/foambubble/foam
日期: 2026-06-13
子分类: 编辑器与 IDE
分类: CLI
provenance: pipeline-v3
---

## 日常类比：把 VS Code 变成「可搜索、可连线的个人维基」

如果你用过 Roam Research 或 Logseq，一定熟悉这种体验：写一句想法，用 `[[双括号]]` 链到另一张卡片；第二天打开笔记，侧边栏自动告诉你「还有哪些页面提到了这个概念」——像在一本永远写不完、但每页都互相引用的活字典里工作。

**Foam 就是把这套体验搬进 Visual Studio Code。** 它不另起一个独立 App，而是在你本来写代码、改配置的那个编辑器里，用 **Markdown 文件 + Wikilink + 反向链接 + 关系图谱** 搭一座「数字花园」。官方说得很直白：Foam 像浴缸——**你往里放什么，就得到什么**；工具只提供连接与发现，知识结构仍由你维护。

与 Roam 的云端块编辑器不同，Foam 的笔记是 **本地 `.md` 纯文本**，默认落在 Git 仓库里，版本、备份、协作都沿用开发者熟悉的流程。Foam 本体是 VS Code 扩展 [foam.foam-vscode](https://marketplace.visualstudio.com/items?itemName=foam.foam-vscode)，再搭配 Markdown All in One、Prettier 等推荐扩展，形成一套可扩展的 PKM（个人知识管理）栈。仓库 [foambubble/foam](https://github.com/foambubble/foam) 约 1.7 万 star，文档站 [foambubble.github.io/foam](https://foambubble.github.io/foam/) 与 [docs.foamnotes.com](https://docs.foamnotes.com) 持续更新。

零基础路径：**用 foam-template 建仓库 → 在 VS Code 打开 → 安装推荐扩展 → 写第一篇带 `[[wikilink]]` 的笔记 → 打开 Daily Note 与 Graph → 按需定制模板与设置**。

---

## 这个项目解决什么问题

### 痛点 1：已经在 VS Code 里工作，却还要切到另一款笔记软件

许多开发者每天泡在 VS Code：Git、终端、LSP、主题、快捷键都已肌肉记忆。Foam 让你 **在同一窗口里写笔记**，不必在 Obsidian / Notion / Roam 之间来回切换，也避免「代码在 A 工具、思考在 B 工具」的上下文断裂。

### 痛点 2：想要 Roam 式网状思考，但不想被 SaaS 绑住

Roam 的双向链接与每日日志很强，但订阅与数据托管是顾虑。Foam **开源免费**，笔记就是文件夹里的 Markdown，**你拥有全部数据**，可私有 Git 仓库，也可发布到 GitHub Pages / Gatsby / Vercel。

### 痛点 3：普通 Markdown 缺少「知识库级」导航

标准 Markdown 链接 `[text](file.md)` 能跳转，但不会自动维护 **反向链接（Backlinks）**、**占位链接（尚未创建的 `[[概念]]`）**、**图谱视图**。Foam 在 VS Code 里补这一层语义，让笔记从「文档集合」变成 **可探索的图**。

### 痛点 4：日记、模板、重复结构太费手工

Foam 内置 **Daily Note**（`Alt+D`）、**日期片段**（`/today`、`/+1w`）、**可编程模板**（`.foam/templates/`），新建文献笔记、会议记录、项目页时可以一键套用骨架，减少重复 YAML 和标题格式。

---

## 核心概念拆解

### 1. Foam 工作区（Workspace）

Foam 工作区 **就是一个包含 `.md` 文件的文件夹**（通常也是 Git 仓库）。配置在 `.vscode/settings.json` 与 `.foam/` 目录下；笔记、图片、模板、日志分目录存放即可。官方建议 **单一统一知识库**，多工作区模式已趋于弃用——复杂结构用文件夹链接模拟即可。

推荐起步方式：在 GitHub 用 [foam-template](https://github.com/foambubble/foam-template/generate) 生成仓库 → clone → VS Code **Open Folder** → 提示安装 **Recommended Extensions** 时点 **Install All**。

### 2. Wikilink（`[[双括号链接]]`）

Wikilink 是 Foam 的脊梁：

- 输入 `[[` 触发 **自动补全**，`Tab` 选中，`Ctrl+Click` / `F12` 跳转。
- 目标文件不存在时，链到 **Placeholder**，样式不同，便于在图谱里规划尚未撰写的概念。
- **别名**：`[[真实文件名|显示文字]]`。
- **章节**：`[[note-name#Section Title]]`。
- **块锚点**：在段落末加 `^block-id`，别处用 `[[note#^block-id]]` 精确定位（类似 Roam 的 block reference）。
- **嵌入**：`![[other-note]]` 把另一篇笔记内容嵌进当前页。

重命名或移动文件时，Foam 默认 **同步更新** 所有指向它的 wikilink（`foam.links.sync.enable`）；普通 Markdown 链接可配合 VS Code 的 `markdown.updateLinksOnFileMove.enabled`。

### 3. 反向链接（Backlinks）

当你打开任意笔记，Foam 会在侧边栏列出 **哪些其他笔记链接到了当前页**。这是 Roam-like 体验的另一半：不只「我从 A 链到 B」，还要看见 **「谁链回了我」**。写综述、发现意外关联、清理孤儿笔记时，Backlinks 比全文搜索更贴近「关系」而非「关键词」。

### 4. 图谱可视化（Graph）

命令面板执行 **Foam: Show Graph**，以节点边形式展示 wikilink 网络。Placeholder 也会出现在图中，帮你看见「计划中但未写」的概念簇。适合检查孤岛笔记、发现过度中心化的 hub、或给 Zettelkasten 做结构体检。

### 5. Daily Note 与日期片段

- **Foam: Open Daily Note** 或快捷键 **`Alt+D`**：创建/打开当天日记，默认路径 `journals/yyyy-mm-dd.md`。
- 任意笔记里输入 **`/today`**、**`/yesterday`**、**`/tomorrow`**、**`/+1d`**、**`/-3d`**、**`/+1w`** 等片段，可插入指向对应日期的 wikilink。
- 设置 `"foam.openDailyNote.onStartup": true` 可在启动 VS Code 时自动打开今日页。

日记结构由 **`.foam/templates/daily-note.md`** 定义，而非零散 deprecated 设置项。

### 6. 模板（Templates）

模板放在 `.foam/templates/`，支持 Markdown 与 JavaScript（`.js`）两种。常用变量包括：

| 变量 | 含义 |
|------|------|
| `$FOAM_TITLE` | 新建笔记标题（会提示输入） |
| `$FOAM_TITLE_SAFE` | 文件系统安全文件名 |
| `$FOAM_SELECTED_TEXT` | 选中文本（可替换为新笔记的 wikilink） |
| `$FOAM_DATE_YEAR` / `$FOAM_DATE_MONTH` / `$FOAM_DATE_DATE` | 日期分量，Daily Note 与相对日期片段会填入 **相对日** 而非仅「今天」 |

命令 **Foam: Create New Note from Template** 与选区、模板变量组合，是批量造 Zettel 卡片的高效路径。

### 7. Link Reference Definitions（与 GitHub 兼容）

纯 `[[wikilink]]` 在 GitHub 网页预览里不可点击。Foam 可生成文件底部的 **链接引用定义**，把 wikilink 转成标准 Markdown 链接块，便于 **GitHub UI / GitHub Pages** 导航。在纯 Foam 工作区里可关闭；要发布时再启用 **Generate references** 类工作流。

### 8. Foam CLI 与周边工具

[Foam CLI](https://github.com/foambubble/foam/tree/main/packages/foam-cli) 支持终端侧 `search`、`list`、`daily`、`lint` 等，适合脚本化备份检查、CI 里扫描断链。VS Code 内还有 **Foam: Open Random Note**、Janitor、Orphaned Notes 等维护向能力。

### 9. Foam 不是什么

社区常强调：Foam **不是**一个 monolithic 闭源产品，而是 **「VS Code + 一组精选扩展 + 约定目录结构」** 的策展方案。你仍可装 Prettier、Mermaid、GitLens、Copilot——写作与工程工具链可完全共享。

---

## 安装与第一次打开

### 方式 A：foam-template（推荐）

1. GitHub 登录 → [从 foam-template 生成新仓库](https://github.com/foambubble/foam-template/generate)（私有库可选）。
2. 本地 clone 并在 VS Code 打开文件夹。
3. 安装推荐扩展（含 **Foam** 本体）。
4. 命令面板 `Foam: Show Graph` 或 `Alt+D` 验证扩展已激活。

### 方式 B：空文件夹手工初始化

1. 新建目录，`File → Open Folder`。
2. 安装扩展 **Foam**（`foam.foam-vscode`）。
3. 创建 `.vscode/extensions.json` 推荐 Markdown 相关扩展（可参考 foam-template）。
4. 新建 `README.md` 与任意 `.md` 笔记即可开始 wikilink。

---

## 代码示例 1：一篇用 Wikilink 织成的「原子笔记」

下面模拟 Zettelkasten 里的一张永久笔记：只讲一个主张，并用链接指向相关概念与来源。保存为 `notes/202606131030-spaced-repetition-vs-graph.md`：

```markdown
---
type: permanent-note
tags: [learning, pkm]
---

# 间隔重复与知识图谱解决不同问题

间隔重复（Spaced Repetition）优化的是 **记忆保持**；图谱笔记（如 Foam）优化的是 **关系发现**。
二者互补：前者适合闪卡与事实，后者适合 hypothesis 与项目脉络。

## 关联

- 上游方法：[[Zettelkasten]]、[[Building a Second Brain]]
- 工具对比：[[Foam]] vs [[Obsidian]] — 我在 [[VS Code]] 里已常驻开发环境，故选 Foam 降低切换成本
- 待写占位：[[如何将 Anki 导出卡片链回 Foam 文献笔记]]

## 来源

- 阅读 [[book-make-it-stick-2014]] 第 2 章摘要 ^claim-different-problems

其他笔记可块引用：[[202606131030-spaced-repetition-vs-graph#^claim-different-problems]]
```

**阅读要点：**

- `[[尚未存在的页面]]` 会显示为 placeholder，点击可创建。
- `^claim-different-problems` 是块锚点，别处用 `#^...` 精确引用该段。
- Front matter 的 `tags` 可配合搜索；Foam 也支持正文 `#tag`。
- 打开本篇时，Backlinks 面板会显示所有链入此文件的页面。

---

## 代码示例 2：Daily Note 模板 + 工作区设置

### `.foam/templates/daily-note.md`

自定义日记路径与版式（示例：按年月分文件夹）：

```markdown
---
type: daily-note
foam_template:
  name: Daily Note
  description: 每日捕获 inbox
  filepath: journals/$FOAM_DATE_YEAR/$FOAM_DATE_MONTH-$FOAM_DATE_DATE.md
---

# $FOAM_DATE_YEAR-$FOAM_DATE_MONTH-$FOAM_DATE_DATE

## 今日焦点

- [ ]

## 日志

- 

## 链到近期

- 昨天：用片段 `/yesterday` 插入 wikilink
- 下周回顾：`/+1w`

## 随机漫游

<!-- 偶尔从 Foam: Open Random Note 捞一张旧 Zettel 补链 -->
```

### `.vscode/settings.json` 片段

```json
{
  "foam.openDailyNote.onStartup": false,
  "foam.links.sync.enable": true,
  "foam.links.directory.mode": "withIndex",
  "markdown.updateLinksOnFileMove.enabled": "always",
  "[markdown]": {
    "editor.wordWrap": "on",
    "editor.quickSuggestions": {
      "other": true,
      "comments": false,
      "strings": true
    }
  }
}
```

**说明：**

- `filepath` 中的 `$FOAM_DATE_*` 在创建 **相对日期** 笔记（如 `/tomorrow`）时会用 **目标日期** 填充，而非总是今天。
- `foam.links.directory.mode` 控制 `[[文件夹名]]` 是否解析到 `index.md` / `README.md`。
- 启动自动日记按个人习惯开启；很多人更偏好手动 `Alt+D`。

---

## 代码示例 3：为 GitHub Pages 生成链接引用（可选）

发布前若希望 **纯 Markdown 渲染器** 也能点击 wikilink，可在笔记底部保留 Foam 生成的 reference 块（或通过命令批量生成）：

```markdown
# 项目索引

本周工作流：[[daily-notes]] → [[graph-visualization]] → 输出到 [[publishing-github-pages]]。

## 相关

- [[foam-template]] 提供初始目录结构
- [[wikilinks]] 语法见官方文档

[//begin]: # "Autogenerated link references for markdown compatibility"
[daily-notes]: ../features/daily-notes.md "Daily Notes"
[graph-visualization]: ../features/graph-visualization.md "Graph Visualization"
[publishing-github-pages]: ../publishing/github-pages.md "GitHub Pages"
[foam-template]: https://github.com/foambubble/foam-template "foam-template"
[wikilinks]: ../features/wikilinks.md "Wikilinks"
[//end]: # "Autogenerated link references"
```

在 Foam 工作区内仍以 `[[...]]` 编辑；引用块让 GitHub / 静态站生成器获得可解析的 `[text](url)` 目标。

---

## 常用命令与快捷键

| 操作 | 方式 |
|------|------|
| 打开今日日记 | `Alt+D` 或 **Foam: Open Daily Note** |
| 新建笔记 | **Foam: Create New Note** / 从模板创建 |
| 显示关系图 | **Foam: Show Graph** |
| 随机漫游 | **Foam: Open Random Note** |
| 跳转 wikilink | `Ctrl+Click` / `F12` |
| 块内批量加链 | 选中词 → `Ctrl+Shift+L` 多选 → 包 `[[]]`（foam-template 文档技巧） |
| 命令面板 | `Ctrl+Shift+P` / `Cmd+Shift+P` |

---

## 与 Roam / Obsidian / Logseq 怎么选

| 维度 | Foam | Roam | Obsidian / Logseq |
|------|------|------|-------------------|
| 载体 | VS Code 扩展 | 独立 Web/App | 独立 App |
| 数据 | 本地 `.md` + Git | 云端块模型 | 本地 `.md` 为主 |
| 双向链接 | ✅ Wikilink + Backlinks | ✅ 块级引用 | ✅ |
| 图谱 | ✅ | ✅ | ✅ |
| 定制 | VS Code 扩展生态 | 插件有限 | 插件丰富 |
| 适合谁 | 已在 VS Code 的开发者 | 深度 Roam 工作流用户 | 想要专用 PKM UI 的用户 |

若你 **写代码和写笔记希望同一套编辑器、同一套 Git 习惯**，Foam 的边际成本最低；若重视 **块级大纲编辑、移动端同步、开箱 UI**，专用 PKM 可能更顺手——也可 Markdown 互通，避免锁死。

---

## 组织方法论（Foam 不强制）

Foam 对 PARA、Zettelkasten、MOC（Map of Content）都中立。常见做法：

- **Inbox / Daily**：日记里捕获，再提炼到永久笔记。
- **Literature notes**：`book-author-year.md` 存读后摘要，连到 **permanent notes**。
- **Index / MOC**：`index-topic.md` 只做链接 hub，不写长文。
- **Projects**：文件夹 + `[[项目名]]` hub，与 PARA 的 Projects 对齐。

关键是 **一笔记一意**（原子化）与 **链接优于文件夹分类**（文件夹仍可用于粗粒度归档）。

---

## 发布与协作

笔记既可在私有仓库，也可：

- 用 **GitHub Pages** 发布静态站（foam-template 含示例 workflow）。
- 用 **Gatsby**、**Vercel** 等生成站点（官方 Recipes 有社区方案）。
- 团队通过 **Pull Request** 协作改 wiki——这是「开发者友好 PKM」的差异化能力。

---

## 常见问题

**Q：Foam 和「只装 Markdown All in One」有何区别？**  
A：后者不提供 wikilink 图谱、backlinks、daily note 模板、placeholder 语义与 Foam 命令；Foam 是面向 **知识网络** 的一层，而非语法高亮。

**Q：已有 Obsidian 库能迁吗？**  
A：可以。Obsidian 的 `[[wikilink]]` 与 `.md` 文件 largely 兼容；需检查 **块 ID 语法**、**附件路径**、**YAML 插件字段** 差异，并在 VS Code 里重装推荐扩展。

**Q：中文文件名与 wikilink 可以吗？**  
A：可以。Foam 链到标题或文件名；注意跨平台文件名规范，复杂场景可用 `$FOAM_TITLE_SAFE` 模板。

**Q：性能：几千篇笔记会卡吗？**  
A：VS Code 打开超大工作区时，图谱与索引会变慢；可按年份分子目录、定期 Janitor 清理 orphan、用 CLI `lint` 扫描断链。

---

## 延伸资源

- 官方 README：[github.com/foambubble/foam](https://github.com/foambubble/foam)
- 文档：[foambubble.github.io/foam](https://foambubble.github.io/foam/) · [docs.foamnotes.com](https://docs.foamnotes.com)
- 模板仓库：[github.com/foambubble/foam-template](https://github.com/foambubble/foam-template)
- VS Code 市场：[Foam 扩展页](https://marketplace.visualstudio.com/items?itemName=foam.foam-vscode)
- 社区：Discord（README 徽章链接）

---

## 小结

Foam 把 **Roam-like 的网状笔记** 搬进 **VS Code + Git + Markdown** 的世界：Wikilink 负责连接，Backlinks 负责发现，Graph 负责鸟瞰，Daily Note 与模板负责节奏与复用。它不替你想清楚知识结构，但把「写下一句话并立刻挂到知识网上」的摩擦降到很低——对已经在编辑器里度过每一天的人来说，这往往比再学一款笔记 App 更自然。
