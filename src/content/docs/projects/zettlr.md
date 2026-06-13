---
title: Zettlr — 学者向 Markdown 编辑器
来源: https://github.com/Zettlr/Zettlr
日期: 2026-06-13
子分类: 编辑器与 IDE
分类: CLI
provenance: pipeline-v3
---

## 日常类比：学者的「写作工作台」，而不是一张白纸

想象你正在写毕业论文或期刊投稿：桌上摆着三样东西——一叠索引卡片（每张只记一个想法）、一本参考文献目录（Zotero 导出的 `.bib`）、以及学校提供的 Word/LaTeX 模板。你平时在卡片之间画箭头、标标签；正式写作时把卡片串成章节，引用格式按期刊要求一键切换。

**Zettlr 就是把这三样东西搬进同一款桌面应用。** 它基于 **Markdown** 写纯文本，但面向学术场景做了「一等公民」支持：**Zettelkasten（卡片盒）知识管理**、**与 Zotero / JabRef 等文献管理器联动的引用**、以及靠 **Pandoc** 导出 PDF、DOCX、LaTeX 等 30+ 格式。和 Typora、MarkText 这类「好看、通用」的 Markdown 编辑器不同，Zettlr 的定位更接近 **从读书笔记到投稿成稿的一站式工作台**。

官方仓库 [Zettlr/Zettlr](https://github.com/Zettlr/Zettlr) 为 GPL-3.0 开源项目，支持 **Windows、macOS、Linux**；官网 [zettlr.com](https://www.zettlr.com) 强调 privacy-first（笔记留在本地）。零基础路径：**安装 → 打开工作区 → 写一张 Zettel 卡片 → 接上 `.bib` 试引用 → 用导出配置投一篇短文**。

---

## 这个项目解决什么问题

### 痛点 1：学术写作被 Word 格式绑架，又嫌 LaTeX 门槛高

期刊要求严格：参考文献样式、页眉页脚、模板字段一个都不能错。Word 能交稿，但版本管理和协作痛苦；LaTeX 排版专业，学习曲线陡峭。Zettlr 让你 **用 Markdown 写正文**，导出时由 **Pandoc** 套用 CSL 样式和自定义模板，在「纯文本简单」与「出版级格式」之间搭桥。

### 痛点 2：文献引用在 Markdown 里往往是二等公民

许多 Markdown 编辑器不支持 `@citekey`，或只能靠插件凑合。Zettlr **原生集成 Pandoc 引用语法**：连接 BibTeX / BibLaTeX 库后，`@` 自动补全 citekey，预览模式下可看到渲染后的文内引用，侧边栏还有 **动态参考文献预览**，导出时自动追加书目。

### 痛点 3：读书笔记要么太长（一整篇读后感），要么太散（文件夹里搜不到）

**Zettelkasten** 方法主张：每张笔记只承载一个「原子化」想法，用 **链接和标签** 织成网络，写长文时沿链接把思路串起来。Zettlr 提供 **文件 ID、Wiki 式内部链接 `[[...]]`、标签、全文检索、图谱视图**，和 Obsidian、Logseq 同属 PKMS（个人知识管理系统）阵营，但更强调 **与引用、导出、项目** 的学术闭环。

### 痛点 4：重复插入 YAML 头、评分表、幻灯片分栏太费时间

**Snippets（代码片段）** 基于 TextMate 语法：输入 `:` 触发补全，Tab 在占位符间跳转，支持 `$CURRENT_YEAR`、`$ZKN_ID` 等变量。适合统一论文 front matter、Beamer 幻灯片结构、课程评分 rubric 等 boilerplate。

---

## 核心概念拆解

### 1. Pandoc Markdown 方言

Zettlr 默认使用 **Pandoc Markdown**——比普通 GFM 更「学术」：复杂表格、图片题注、脚注、**引用与交叉引用** 等开箱可用。这意味着你写的 `.md` 最好按 Pandoc 规则来（尤其是引用和 div 语法），以便导出时不翻车。若目标平台只认 GFM，导出前需确认语法兼容性。

### 2. 工作区（Workspace）与项目（Project）

启动时 Zettlr 让你打开一个 **根目录**（工作区），左侧是文件树。可把相关论文、笔记、素材收进同一棵树。**Project** 功能适合把多篇文件组织成「一本书」或「一个课题文件夹」，便于集中导出与管理——这是许多纯笔记应用没有的层次。

### 3. Zettelkasten 三件套：ID、链接、标签

| 机制 | 作用 | 典型用法 |
|------|------|----------|
| **Zettel ID** | 稳定标识一张卡片，重命名文件也不破链 | 偏好设置里定义 ID 模式，新建笔记自动生成 |
| **内部链接** | `[[文件名]]` 或 `[[ID\|显示文字]]` 显式连接概念 | 从「方法论」链到「案例 A」再链到「反例」 |
| **标签** | `#tag` 做隐式聚类 | 全文搜索 + 标签管理器浏览主题簇 |

图谱视图把链接关系可视化，适合检查「孤岛笔记」和意外形成的概念簇。

### 4. 引用管线：文献库 → 编辑器 → Pandoc 导出

链路分三层：

1. **全局配置**：偏好设置 → Citations，指向 Zotero（经 Better BibTeX 自动导出）或 JabRef 的 `.bib` 文件；可选默认 CSL 样式。
2. **编辑时**：输入 `@` 触发 citekey 补全；Preview 模式 + citations 渲染器可预览文内引用。
3. **单文件覆盖**：在文档 YAML 里声明 `bibliography` 和 `csl`，导出时 Pandoc 以文档为准。

Zettlr **不用 Zotero 图形化选文献窗口**，而是直接写 Pandoc 语法——熟练后往往比点选更快。

### 5. 导出配置（Export Profiles）

导出由 **Pandoc** 执行。你在偏好里创建 **Profile**：选输出格式（PDF、docx、tex…）、关联 **模板**（LaTeX、Word）、默认参数。对同一篇稿子，换 Profile 就等于换期刊模板或投稿格式，无需改正文。

### 6. 编辑器模式与侧边栏

- **Markdown 模式**：看源码，适合精细改语法。
- **Preview 模式**：类 WYSIWYG，引用、公式等可内联预览。
- **分屏**：对照源码与预览。
- **侧边栏**：目录、标签、**参考文献预览**、相关文件等。

### 7. 质量与写作辅助

集成 **LanguageTool**（拼写、语法、风格）、Markdown lint、写作统计、多语言界面（含简体中文）。代码块支持语法高亮；主题与 **自定义 CSS** 可深度改外观。

---

## 安装与第一次打开

### macOS

```bash
brew install --cask zettlr
```

或从 [GitHub Releases](https://github.com/Zettlr/Zettlr/releases) 下载 `.dmg`。

### Windows / Linux

官网与 Releases 提供安装包；Linux 常见为 AppImage 或发行版打包版本。首次启动会引导选择界面语言、默认主题、是否开启深色模式。

**建议第一次：**

1. **File → Open Directory** 打开空文件夹作为工作区。
2. 偏好设置 → **Zettelkasten**：开启文件 ID、设定 ID 格式（如时间戳）。
3. 若有 Zotero：安装 **Better BibTeX**，配置自动导出 `.bib`；在 Zettlr **Citations** 里指向该文件。
4. 新建 `0001-欢迎.md`，试写内部链接与一条 `@` 引用（有库时）。

---

## 代码示例 1：带参考文献的论文章节（YAML + Pandoc 引用）

正式投稿前，文档顶部需要 YAML front matter，声明书目与 CSL 样式；正文用 Pandoc citekey，而不是手写「作者, 年份」。

```markdown
---
title: "大语言模型在文献综述中的辅助边界"
author:
  - 张三
  - 李四
date: 2026-06-13
bibliography: ~/references/my-library.bib
csl: https://www.zotero.org/styles/apa
lang: zh-CN
abstract: |
  本文讨论生成式 AI 辅助学术写作时的引用规范与幻觉风险。
---

# 引言

近年来，自动化摘要与引文推荐工具快速发展 [@smith2023; @lee2024]。
单一研究指出，未经人工核验的引用错误率仍不可忽视 [@chen2025, p. 42]。

## 方法

我们采用结构化文献检索，编码方案见 [@jones2022]。

# 参考文献

<!-- 导出时由 Pandoc 根据 .bib 与 CSL 自动生成，无需手打条目 -->
```

**要点说明：**

- `[@smith2023]` 为括号引用；`@lee2024` 可配合叙述写成「如 @lee2024 所示」类 in-text 形式（具体取决于 CSL）。
- 多条引用用分号：`[@a; @b]`；页码加 `, p. 42`。
- `bibliography` / `csl` 路径会传给 Pandoc；与偏好设置里的全局库可以不同，**以本文件 YAML 为准**。
- 导出：**File → Export**（`Cmd/Ctrl+E`），选 PDF 或 DOCX Profile；Pandoc 格式化文内引用并生成文末书目。

---

## 代码示例 2：Zettelkasten 原子笔记与 Wiki 链接

一张卡片只记一个主张；用 ID 与链接把它挂进知识网络。下面模拟「读论文时拆出的两条 Zettel + 一条综述草稿」。

**文件 `202606131030-原子笔记-可复现性.md`：**

```markdown
---
id: 202606131030
title: 可复现性危机不等于完全不可信
tags: [方法论, 科学哲学]
---

# 可复现性危机不等于完全不可信

核心主张：复制失败应触发**机制审查**，而非简单否定原研究 [@openScience2015]。

相关：[[202606131045-原子笔记-统计功效]] 讨论样本量；[[综述草稿|当前综述进度]] 汇总成文。
```

**文件 `202606131045-原子笔记-统计功效.md`：**

```markdown
---
id: 202606131045
tags: [统计, 方法论]
---

# 低功效研究更易产生假阳性

见 [[202606131030-原子笔记-可复现性]]：两条线索应合并写进「局限」一节。
```

**文件 `综述草稿.md`（项目主文档片段）：**

```markdown
## 局限

如 @202606131030 与 @202606131045 所示，本综述承认发表偏倚与功效不足并存 [#meta-analysis]。
```

**操作习惯：**

- 偏好设置可开启 **「尽量用文件 ID 作为链接目标」**，重命名 `...-可复现性.md` 时链接仍有效。
- `[[目标|标题]]` 中「链接格式」需在偏好 → Zettelkasten → Internal links 里指定 pipe 两侧何者为目标。
- 标签 `#meta-analysis` 与文内标签语法配合，便于标签管理器批量浏览。
- 写长文时从图谱或反向链接找「谁引用了这张卡片」，把 Zettel 链成章节段落。

---

## 代码示例 3：Snippet 快速插入论文模板（可选进阶）

在 Assets Manager 新建 snippet `paper-chapter`（文件扩展名 `.tpl.md`），编辑器里行首输入 `:paper` 选补全，Tab 填空：

```markdown
---
title: "${1:章节标题}"
date: $CURRENT_YEAR-$CURRENT_MONTH-$CURRENT_DATE
id: $ZKN_ID
---

# ${1:章节标题}

## 论点

$2

## 证据与引用

$3

## 小结

$0
```

`$1` 出现两次会 **同步修改**（标题与一级标题一致）；`$ZKN_ID` 自动填入 Zettel ID；`$0` 是结束光标位置。Esc 可中止插入流程。

---

## 与同类工具怎么选

| 维度 | Zettlr | Obsidian | Typora | MarkText |
|------|--------|----------|--------|----------|
| 开源 | ✅ GPL | 闭源免费 | 付费 | ✅ MIT |
| 原生 Zotero / BibTeX 引用 | ✅ | 需插件 | ❌ | ❌ |
| 引用预览 | ✅ | 有限 | ❌ | ❌ |
| Pandoc 一键导出 + 模板 | ✅ | 插件 | 部分 | 部分 |
| Zettelkasten / 图谱 | ✅ | ✅ | ❌ | ❌ |
| 实时 WYSIWYG | Preview 模式 | 插件 | ✅ | ✅ |

若你 **主要是博客、技术文档、少引用**，MarkText / Typora 更轻。若 **读文献、写论文、维护卡片盒、换 CSL 投稿**，Zettlr 的集成度更高。

---

## 推荐工作流（Zotero + Better BibTeX + Zettlr）

1. **Zotero** 装 Better BibTeX，设稳定 citekey 规则，开启 **自动导出** 到固定路径如 `~/references/my-library.bib`。
2. **Zettlr** 偏好 → Citations 指向该 `.bib` 与常用 CSL（可从 [Zotero Style Repository](https://www.zotero.org/styles) 下载）。
3. **日常**：读论文 → 拆 Zettel → `[[链接]]` + `@citekey` 挂证据。
4. **成稿**：合并进带 YAML 的主文档 → Export 选期刊 Profile → 交 DOCX/PDF。
5. **版本管理**：全程 `.md` + `.bib` 可进 Git；大二进制模板单独存放。

---

## 常见问题

**Q：导出 PDF 报 Pandoc 错误？**  
检查是否安装 Pandoc、LaTeX（若 Profile 走 pdflatex/xelatex）。中文 PDF 常需在模板或变量里指定 `xelatex` 与 `CJKmainfont`。

**Q：`@` 不出补全？**  
确认 Citations 已指向有效 `.bib`；`@` 须在行首、空格后或 `[` 后；库文件需含对应 citekey。

**Q：和 Obsidian 双开会乱吗？**  
两者都读 plain Markdown，但 Wiki 链接、ID、部分 YAML 约定可能不同。选一个作「真源」，另一个只读或统一约定。

**Q：一定要 Zettelkasten 吗？**  
不必。官方手册坦言：有人更高效，有人更慢；Zettlr 也适合 **不开卡片盒、只当带引用的 Markdown IDE** 用。

---

## 小结

| 你学到什么 | 一句话 |
|------------|--------|
| 定位 | 学者向、本地优先的 Markdown 工作台，不是通用记事本 |
| 方言 | Pandoc Markdown + YAML front matter 驱动导出 |
| 知识管理 | ID + `[[wiki链接]]` + 标签 + 图谱 |
| 引用 | `.bib` + `@citekey` + CSL，导出时 Pandoc 排版书目 |
| 效率 | Snippets、Projects、分屏 Preview、LanguageTool |

下一步：用你自己的一个小课题（课程 essay、读书报告即可）建 10 张 Zettel、接一本 Zotero 库、导出一份 PDF，走通 **卡片 → 引用 → 投稿格式** 全链路；比只看功能列表更能判断 Zettlr 是否适合你的脑子。

---

## 参考链接

- 官网与功能对比：[zettlr.com/features](https://zettlr.com/features)
- 用户手册：[docs.zettlr.com](https://docs.zettlr.com)
- PKMS / Zettelkasten：[docs.zettlr.com/en/pkms/](https://docs.zettlr.com/en/pkms/)
- 引用：[docs.zettlr.com/en/editor/citations/](https://docs.zettlr.com/en/editor/citations/)
- Snippets：[docs.zettlr.com/en/editor/snippets/](https://docs.zettlr.com/en/editor/snippets/)
- 源码：[github.com/Zettlr/Zettlr](https://github.com/Zettlr/Zettlr)
- Zotero 工作流示例：[tiagojct.eu/notes/zettlr-zotero](https://tiagojct.eu/notes/zettlr-zotero/)
